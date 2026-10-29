import { DatabaseSync } from 'node:sqlite';
import { MIGRATION_V1_TO_V2, SCHEMA_SQL } from '../src/db/migrations.ts';
import * as repo from '../src/db/repo.ts';
import { SCHEMA_SQL as SCHEMA_V1, undoTriggersSql as undoTriggersV1 } from './fixtures/migrations-v1.ts';

// Adaptateur minimal de l'API expo-sqlite au-dessus de node:sqlite
function openDb(setup: (raw: DatabaseSync) => void) {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  setup(raw);
  const args = (p: unknown[]) => (p.length === 1 && p[0] !== null && typeof p[0] === 'object' ? (Array.isArray(p[0]) ? p[0] : [p[0]]) : p);
  const db = {
    execAsync: async (s: string) => raw.exec(s),
    runAsync: async (s: string, ...p: unknown[]) => raw.prepare(s).run(...(args(p) as never[])),
    getAllAsync: async (s: string, ...p: unknown[]) => raw.prepare(s).all(...(args(p) as never[])),
    getFirstAsync: async (s: string, ...p: unknown[]) => raw.prepare(s).get(...(args(p) as never[])) ?? null,
    withTransactionAsync: async (fn: () => Promise<void>) => {
      raw.exec('BEGIN');
      try {
        await fn();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { raw, db: db as never };
}

let fails = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) fails++;
  console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);
};

// ---------- Migration v1 -> v2 sur une vraie base v1 ----------
{
  const { raw } = openDb((r) => {
    r.exec(SCHEMA_V1);
    r.exec(undoTriggersV1());
    r.exec("INSERT INTO contacts VALUES ('c1','Magasin','SUPPLIER',NULL,NULL,'t')");
  });
  raw.exec(MIGRATION_V1_TO_V2);
  const triggers = raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").get() as { n: number };
  const undoTables = raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'undo_%'").get() as { n: number };
  raw.exec("INSERT INTO transactions VALUES ('t1','c1','PAYABLE','DEBT_ITEM','x',NULL,100,0,0,'UNPAID','2026-01-01',NULL,'t')");
  raw.exec("INSERT INTO transaction_items VALUES ('i1','t1',0,'Engrais',2,50)");
  eq([triggers.n, undoTables.n], [0, 0], 'v1 -> v2 removes undo triggers and tables');
  eq((raw.prepare('SELECT COUNT(*) AS n FROM contacts').get() as { n: number }).n, 1, 'v1 -> v2 keeps existing data');
}

// ---------- Logique métier ----------
const { raw, db } = openDb((r) => r.exec(SCHEMA_SQL));
const contact = (id: string) => repo.getContact(db, id);
const tx = (id: string) => repo.getTransaction(db, id);

const shop = await repo.saveContact(db, { name: 'Magasin Attawfiq', type: 'SUPPLIER' });
const buyer = await repo.saveContact(db, { name: 'Grossiste Ahmed', type: 'CUSTOMER' });

// Achat de plusieurs articles
const t1 = await repo.saveTransaction(db, {
  contactId: shop,
  direction: 'PAYABLE',
  items: [
    { name: 'Engrais', quantity: 4, unit_price: 25000 },
    { name: 'Semences', quantity: 2.5, unit_price: 10000 },
    { name: 'Pesticide', quantity: 1, unit_price: 25000 },
  ],
  upfrontPaid: 0,
  date: '2026-01-01',
  dueDate: '2026-02-01',
  photos: ['facture.jpg'],
});
eq((await tx(t1))!.total_amount, 150000, 'multi-article total = 4×250 + 2.5×100 + 1×250 = 1500 DH');
eq((await tx(t1))!.description, 'Engrais · Semences · Pesticide', 'description lists all articles');
eq((await repo.getTransactionItems(db, (await tx(t1))!)).length, 3, 'articles stored');
eq((await repo.listAttachments(db, 'T', t1)).length, 1, 'invoice photo saved with the purchase');
eq((await contact(shop))!.late_payable! > 200, true, 'late days computed for overdue debt');

// Dette de 10 000, paiement de 5 000 avec date et reçu
const t2 = await repo.saveTransaction(db, {
  contactId: shop,
  direction: 'PAYABLE',
  items: [{ name: 'Plastique serre', quantity: 1, unit_price: 1000000 }],
  upfrontPaid: 0,
  date: '2026-03-01',
  dueDate: null,
});
await repo.savePayment(db, { contactId: shop, direction: 'PAYABLE', amount: 500000, date: '2026-03-10', target: { kind: 'T', id: t2 }, photos: ['recu.jpg'] });
eq([(await tx(t2))!.paid_amount, (await tx(t2))!.status], [500000, 'PARTIAL'], '10 000 debt, 5 000 paid -> 5 000 left');
eq((await contact(shop))!.payable, 150000 + 500000, 'person balance');

// Modifier un achat (articles) : tout est recalculé
await repo.saveTransaction(
  db,
  { contactId: shop, direction: 'PAYABLE', items: [{ name: 'Plastique serre', quantity: 1, unit_price: 600000 }], upfrontPaid: 0, date: '2026-03-01', dueDate: null },
  t2,
);
eq([(await tx(t2))!.status, (await repo.getTransactionItems(db, (await tx(t2))!)).length], ['PARTIAL', 1], 'edit replaces articles');

// Vente à crédit (il me doit) indépendante
const s1 = await repo.saveTransaction(db, {
  contactId: buyer,
  direction: 'RECEIVABLE',
  items: [{ name: 'Tomates', quantity: 100, unit_price: 3000 }],
  upfrontPaid: 100000,
  date: '2026-04-01',
  dueDate: '2026-04-10',
});
eq([(await contact(buyer))!.receivable, (await tx(s1))!.paid_amount], [200000, 100000], 'receivable with upfront paid');

// Chèque en attente puis payé
const chk = await repo.saveInstrument(db, {
  contactId: buyer, direction: 'RECEIVABLE', transactionId: null, payrollEntryId: null, type: 'BANK_CHECK',
  amount: 200000, issueDate: '2026-04-05', maturityDate: '2026-05-01', reference: '123', reminderDays: 3,
});
eq((await contact(buyer))!.receivable, 200000, 'pending check does not change balance');
await repo.setInstrumentStatus(db, chk, 'DEBITED_PAID');
eq([(await tx(s1))!.status, (await contact(buyer))!.receivable], ['PAID', 0], 'paid check settles the sale');

// Paie
const w1 = await repo.saveContact(db, { name: 'Ali', type: 'EMPLOYEE' });
const w2 = await repo.saveContact(db, { name: 'Said', type: 'EMPLOYEE' });
await repo.createPayrollGroup(db, [w1, w2], { workType: 'DAILY_WAGE', days: 3, rate: 12000, date: '2026-04-05', paidNow: false });
eq([(await contact(w1))!.payable, (await contact(w2))!.payable], [36000, 36000], 'payroll 3 days × 120 DH each');

// Fiche personne
const timeline = await repo.getTimeline(db, shop);
eq(timeline.map((r) => r.kind).join(''), 'ITT', 'timeline: payment + 2 purchases, newest first');
eq(timeline[0].photos, 1, 'receipt photo shown on payment');

// Accueil : le plus récemment utilisé en premier
eq((await repo.listContacts(db))[0].name, 'Said', 'home list sorted by last activity');

// Suppression
await repo.deleteEntity(db, 'T', t1);
eq([await tx(t1), (await repo.listAttachments(db, 'T', t1)).length], [null, 0], 'delete purchase removes its photos');
eq((raw.prepare("SELECT COUNT(*) AS n FROM transaction_items WHERE transaction_id = ?").get(t1) as { n: number }).n, 0, 'delete purchase removes its articles');
await repo.deleteContact(db, shop);
eq(await contact(shop), null, 'delete person');

// Historique
eq((await repo.listActivity(db, { search: 'Ahmed' })).every((r) => r.contact_name === 'Grossiste Ahmed'), true, 'history search by name');
eq((await repo.listActivity(db, { filter: 'PAYROLL' })).length, 2, 'payroll logged once per worker');
eq((await repo.listActivity(db, { filter: 'CREDITS' })).length >= 3, true, 'history credits filter');
eq(await repo.countDueInstruments(db), 0, 'no pending checks due');

raw.exec('PRAGMA foreign_key_check');
console.log(fails ? `${fails} FAILED` : 'ALL REPO TESTS PASSED');
if (fails) process.exitCode = 1;
