import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL, undoTriggersSql } from '../src/db/migrations.ts';
import * as repo from '../src/db/repo.ts';
import { undoLast } from '../src/db/undo.ts';

// Adaptateur minimal de l'API expo-sqlite au-dessus de node:sqlite
const raw = new DatabaseSync(':memory:');
raw.exec('PRAGMA foreign_keys = ON;'); raw.exec(SCHEMA_SQL); raw.exec(undoTriggersSql());
const args = (p) => p.length === 1 && p[0] !== null && typeof p[0] === 'object' ? (Array.isArray(p[0]) ? p[0] : [p[0]]) : p;
const db = {
  execAsync: async (s) => raw.exec(s),
  runAsync: async (s, ...p) => raw.prepare(s).run(...args(p)),
  getAllAsync: async (s, ...p) => raw.prepare(s).all(...args(p)),
  getFirstAsync: async (s, ...p) => raw.prepare(s).get(...args(p)) ?? null,
  withTransactionAsync: async (fn) => { raw.exec('BEGIN'); try { await fn(); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; } },
};
let fails = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); };
const contact = (id) => repo.getContact(db, id);
const tx = (id) => repo.getTransaction(db, id);

const shop = await repo.saveContact(db, { name: 'Magasin Attawfiq', type: 'SUPPLIER', phone: '0612345678' });
const buyer = await repo.saveContact(db, { name: 'Grossiste Ahmed', type: 'CUSTOMER' });
const base = { description: 'x', crop: 'TOMATO', upfrontPaid: 0, dueDate: null };
const t1 = await repo.saveTransaction(db, { ...base, contactId: shop, direction: 'PAYABLE', type: 'DEBT_ITEM', description: 'Plants', total: 100000, date: '2026-01-01', dueDate: '2026-02-01' });
const t2 = await repo.saveTransaction(db, { ...base, contactId: shop, direction: 'PAYABLE', type: 'DEBT_ITEM', description: 'Engrais', total: 50000, upfrontPaid: 10000, date: '2026-03-01' });
const s1 = await repo.saveTransaction(db, { ...base, contactId: buyer, direction: 'RECEIVABLE', type: 'SALE_ON_CREDIT', description: 'Tomates', total: 300000, date: '2026-04-01', dueDate: '2026-04-10' });
eq((await contact(shop)).payable, 140000, 'payable balance counts upfront');
eq((await contact(buyer)).receivable, 300000, 'receivable balance');
eq((await contact(shop)).late_payable > 200, true, 'late days computed for overdue payable');

await repo.recordCashPayment(db, shop, 'PAYABLE', 30000, { kind: 'T', id: t2 });
eq([(await tx(t2)).paid_amount, (await tx(t2)).status], [40000, 'PARTIAL'], 'targeted payment goes to chosen line first');
await repo.recordCashPayment(db, shop, 'PAYABLE', 120000);
eq([(await tx(t1)).status, (await tx(t2)).status, (await contact(shop)).payable], ['PAID', 'PAID', -10000], 'FIFO + overpay shows advance');
await repo.recordCashPayment(db, buyer, 'RECEIVABLE', 100000);
eq([(await tx(s1)).paid_amount, (await contact(shop)).payable], [100000, -10000], 'directions are independent');

// Modifier une dette : tout est recalculé
await repo.saveTransaction(db, { ...base, contactId: shop, direction: 'PAYABLE', type: 'DEBT_ITEM', description: 'Plants', total: 200000, date: '2026-01-01', dueDate: '2026-02-01' }, t1);
eq([(await tx(t1)).paid_amount, (await tx(t1)).status, (await contact(shop)).payable], [120000, 'PARTIAL', 90000], 'edit total recomputes allocation');

// Effet en attente ne compte pas tant qu'il n'est pas payé
const chk = await repo.saveInstrument(db, { contactId: shop, direction: 'PAYABLE', transactionId: t1, payrollEntryId: null, type: 'BANK_CHECK', amount: 90000, issueDate: '2026-05-01', maturityDate: '2026-06-01', reference: '123', reminderDays: 3 });
eq((await contact(shop)).payable, 90000, 'pending check does not reduce balance');
await repo.setInstrumentStatus(db, chk, 'DEBITED_PAID');
eq([(await tx(t1)).status, (await contact(shop)).payable], ['PAID', 0], 'paid check settles the debt');

// Annuler (undo) le paiement du chèque
await undoLast(db);
eq([(await tx(t1)).status, (await contact(shop)).payable, (await repo.getInstrument(db, chk)).status], ['PARTIAL', 90000, 'PENDING'], 'undo restores check + balances');

// Paie groupée + crop
const w1 = await repo.saveContact(db, { name: 'Ali', type: 'EMPLOYEE' });
const w2 = await repo.saveContact(db, { name: 'Said', type: 'EMPLOYEE' });
await repo.createPayrollGroup(db, [w1, w2], { workType: 'DAILY_WAGE', crop: 'TOMATO', days: 3, rate: 12000, date: '2026-04-05', paidNow: false });
eq([(await contact(w1)).payable, (await contact(w2)).payable], [36000, 36000], 'group payroll 3 days x 120 DH each');
const summary = await repo.getCropSummary(db, null);
eq(summary.find((c) => c.crop === 'TOMATO'), { crop: 'TOMATO', expenses: 250000, wages: 72000, sales: 300000 }, 'crop summary');

// Supprimer le contact puis annuler
await repo.deleteContact(db, shop);
eq(await contact(shop), null, 'contact deleted');
await undoLast(db);
eq([(await contact(shop))?.payable, (await tx(t1))?.status], [90000, 'PARTIAL'], 'undo contact delete restores everything');

// Historique
const all = await repo.listActivity(db, {});
eq(all.length >= 12, true, `history has entries (${all.length})`);
eq((await repo.listActivity(db, { search: 'Ahmed' })).every((r) => r.contact_name === 'Grossiste Ahmed'), true, 'history search by name');
eq((await repo.listActivity(db, { contactId: buyer, filter: 'PAYMENTS' })).length, 1, 'history filter by contact + payments');
eq((await repo.listActivity(db, { filter: 'PAYROLL' })).length, 2, 'payroll logged once per worker');

// Photos + suppression d'opération + undo
await repo.addAttachment(db, 'T', t2, 'abc.jpg');
eq((await repo.getLedger(db, shop)).find((r) => r.id === t2).photos, 1, 'photo count on ledger row');
await repo.deleteEntity(db, 'T', t2);
eq([(await repo.listAttachments(db, 'T', t2)).length, (await repo.referencedFileNames(db)).has('abc.jpg')], [0, true], 'delete op removes photo row, file kept for undo');
await undoLast(db);
eq((await repo.listAttachments(db, 'T', t2)).length, 1, 'undo delete restores photo');

const d = await repo.getDashboard(db);
eq([d.payableTotal > 0, d.receivableTotal, d.receivableLate, d.pendingWages], [true, 200000, 1, 72000], 'dashboard totals');
raw.exec('PRAGMA foreign_key_check');
console.log(fails ? `${fails} FAILED` : 'ALL REPO TESTS PASSED');
