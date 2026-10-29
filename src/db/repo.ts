import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { addDays, today } from '../utils/dates';
import type {
  ActivityAction,
  ActivityRow,
  Attachment,
  ContactType,
  ContactWithBalance,
  Crop,
  CropSummary,
  DashboardData,
  Direction,
  EntityType,
  Instrument,
  InstrumentStatus,
  InstrumentType,
  InstrumentWithContact,
  LateRow,
  LedgerRow,
  PayrollEntry,
  Transaction,
  TransactionStatus,
  TransactionType,
  WorkType,
} from './types';
import { runAction } from './undo';

export function statusFor(total: number, paid: number): TransactionStatus {
  if (paid <= 0 && total > 0) return 'UNPAID';
  if (paid >= total) return 'PAID';
  return 'PARTIAL';
}

const nowIso = () => new Date().toISOString();

// ---------- Paramètres ----------

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}

// ---------- Journal + annulation ----------

export interface LogInput {
  action: ActivityAction;
  entityType?: EntityType | null;
  entityId?: string | null;
  contactId?: string | null;
  direction?: Direction | null;
  amount?: number | null;
  details?: string | null;
}

async function insertLog(db: SQLiteDatabase, entry: LogInput) {
  const contact = entry.contactId
    ? await db.getFirstAsync<{ name: string }>('SELECT name FROM contacts WHERE id = ?', entry.contactId)
    : null;
  await db.runAsync(
    `INSERT INTO activity_log (id, created_at, action, entity_type, entity_id, contact_id, contact_name, direction, amount, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    nowIso(),
    entry.action,
    entry.entityType ?? null,
    entry.entityId ?? null,
    entry.contactId ?? null,
    contact?.name ?? null,
    entry.direction ?? null,
    entry.amount ?? null,
    entry.details ?? null,
  );
}

/** Action annulable + écrite au journal. Le libellé d'annulation est l'entrée de journal en JSON. */
async function act<T>(db: SQLiteDatabase, entry: LogInput, task: () => Promise<T>, logBefore = false): Promise<T> {
  return runAction(db, JSON.stringify(entry), async () => {
    // Pour une suppression, on journalise avant (le nom du contact existe encore).
    if (logBefore) await insertLog(db, entry);
    const result = await task();
    if (!logBefore) await insertLog(db, { ...entry, entityId: entry.entityId ?? (typeof result === 'string' ? result : null) });
    return result;
  });
}

// ---------- Recalcul des soldes ----------

/**
 * Recalcule paid_amount / status des dettes d'un contact à partir des montants payés à la saisie
 * et des versements (espèces + effets débités) : d'abord vers la dette ciblée, puis les plus anciennes.
 * Déterministe : modifier ou supprimer n'importe quelle opération reste cohérent.
 */
export async function recomputeContact(db: SQLiteDatabase, contactId: string) {
  for (const dir of ['PAYABLE', 'RECEIVABLE'] as const) {
    const debts = await db.getAllAsync<{ kind: 'T' | 'P'; id: string; total: number; upfront: number; paid: number; status: string }>(
      `SELECT 'T' AS kind, id, total_amount AS total, upfront_paid AS upfront, paid_amount AS paid, status,
              transaction_date AS d, created_at AS c
         FROM transactions WHERE contact_id = $c AND direction = $dir
       ${
         dir === 'PAYABLE'
           ? `UNION ALL
              SELECT 'P', id, total_due, upfront_paid, paid_amount, status, work_date, created_at
                FROM payroll_entries WHERE contact_id = $c`
           : ''
       }
       ORDER BY d, c`,
      { $c: contactId, $dir: dir },
    );
    const payments = await db.getAllAsync<{ amount: number; transaction_id: string | null; payroll_entry_id: string | null }>(
      `SELECT amount, transaction_id, payroll_entry_id FROM instruments
        WHERE contact_id = ? AND direction = ? AND status = 'DEBITED_PAID'
        ORDER BY issue_date, created_at`,
      contactId,
      dir,
    );

    const key = (kind: string, id: string) => kind + id;
    const paid = new Map(debts.map((d) => [key(d.kind, d.id), Math.min(d.upfront, d.total)]));
    const byKey = new Map(debts.map((d) => [key(d.kind, d.id), d]));
    let pool = 0;
    for (const p of payments) {
      const k = p.transaction_id ? key('T', p.transaction_id) : p.payroll_entry_id ? key('P', p.payroll_entry_id) : null;
      const target = k ? byKey.get(k) : undefined;
      let left = p.amount;
      if (target && k) {
        const take = Math.min(left, target.total - paid.get(k)!);
        paid.set(k, paid.get(k)! + take);
        left -= take;
      }
      pool += left;
    }
    for (const d of debts) {
      if (pool <= 0) break;
      const k = key(d.kind, d.id);
      const take = Math.min(pool, d.total - paid.get(k)!);
      if (take <= 0) continue;
      paid.set(k, paid.get(k)! + take);
      pool -= take;
    }
    for (const d of debts) {
      const p = paid.get(key(d.kind, d.id))!;
      if (d.kind === 'T') {
        const status = statusFor(d.total, p);
        if (p !== d.paid || status !== d.status) await db.runAsync('UPDATE transactions SET paid_amount = ?, status = ? WHERE id = ?', p, status, d.id);
      } else {
        const status = p >= d.total ? 'PAID' : 'PENDING_PAYMENT';
        if (p !== d.paid || status !== d.status) await db.runAsync('UPDATE payroll_entries SET paid_amount = ?, status = ? WHERE id = ?', p, status, d.id);
      }
    }
  }
}

// ---------- Contacts ----------

const CONTACT_SELECT = `
  SELECT c.*,
    COALESCE((SELECT SUM(total_amount - upfront_paid) FROM transactions WHERE contact_id = c.id AND direction = 'PAYABLE'), 0)
    + COALESCE((SELECT SUM(total_due - upfront_paid) FROM payroll_entries WHERE contact_id = c.id), 0)
    - COALESCE((SELECT SUM(amount) FROM instruments WHERE contact_id = c.id AND direction = 'PAYABLE' AND status = 'DEBITED_PAID'), 0) AS payable,
    COALESCE((SELECT SUM(total_amount - upfront_paid) FROM transactions WHERE contact_id = c.id AND direction = 'RECEIVABLE'), 0)
    - COALESCE((SELECT SUM(amount) FROM instruments WHERE contact_id = c.id AND direction = 'RECEIVABLE' AND status = 'DEBITED_PAID'), 0) AS receivable,
    (SELECT MAX(CAST(julianday($today) - julianday(due_date) AS INTEGER)) FROM transactions
      WHERE contact_id = c.id AND direction = 'PAYABLE' AND status != 'PAID' AND due_date < $today) AS late_payable,
    (SELECT MAX(CAST(julianday($today) - julianday(due_date) AS INTEGER)) FROM transactions
      WHERE contact_id = c.id AND direction = 'RECEIVABLE' AND status != 'PAID' AND due_date < $today) AS late_receivable
  FROM contacts c`;

export async function listContacts(
  db: SQLiteDatabase,
  opts: { type?: ContactType | null; search?: string; direction?: Direction | null } = {},
): Promise<ContactWithBalance[]> {
  const where: string[] = [];
  const params: Record<string, string> = { $today: today() };
  if (opts.type) {
    where.push('c.type = $type');
    params.$type = opts.type;
  }
  if (opts.search?.trim()) {
    where.push('c.name LIKE $search');
    params.$search = `%${opts.search.trim()}%`;
  }
  const rows = await db.getAllAsync<ContactWithBalance>(
    `${CONTACT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.name COLLATE NOCASE`,
    params,
  );
  if (opts.direction === 'PAYABLE') return rows.filter((r) => r.payable > 0).sort((a, b) => b.payable - a.payable);
  if (opts.direction === 'RECEIVABLE') return rows.filter((r) => r.receivable > 0).sort((a, b) => b.receivable - a.receivable);
  return rows.sort((a, b) => Math.max(b.payable, b.receivable) - Math.max(a.payable, a.receivable));
}

export async function getContact(db: SQLiteDatabase, id: string): Promise<ContactWithBalance | null> {
  return db.getFirstAsync<ContactWithBalance>(`${CONTACT_SELECT} WHERE c.id = $id`, { $today: today(), $id: id });
}

export async function saveContact(
  db: SQLiteDatabase,
  input: { id?: string; name: string; type: ContactType; phone?: string; notes?: string },
): Promise<string> {
  const phone = input.phone?.trim() || null;
  const notes = input.notes?.trim() || null;
  if (input.id) {
    const id = input.id;
    return act(db, { action: 'CONTACT_EDITED', contactId: id, details: input.name.trim() }, async () => {
      await db.runAsync('UPDATE contacts SET name = ?, type = ?, phone = ?, notes = ? WHERE id = ?', input.name.trim(), input.type, phone, notes, id);
      return id;
    });
  }
  const id = randomUUID();
  return act(db, { action: 'CONTACT_ADDED', contactId: id, details: input.name.trim() }, async () => {
    await db.runAsync(
      'INSERT INTO contacts (id, name, type, phone, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      input.name.trim(),
      input.type,
      phone,
      notes,
      nowIso(),
    );
    return id;
  });
}

export async function deleteContact(db: SQLiteDatabase, id: string) {
  await act(
    db,
    { action: 'CONTACT_DELETED', contactId: id },
    async () => {
      await db.runAsync(
        `DELETE FROM attachments WHERE (entity_type = 'T' AND entity_id IN (SELECT id FROM transactions WHERE contact_id = $id))
            OR (entity_type = 'P' AND entity_id IN (SELECT id FROM payroll_entries WHERE contact_id = $id))
            OR (entity_type = 'I' AND entity_id IN (SELECT id FROM instruments WHERE contact_id = $id))`,
        { $id: id },
      );
      await db.runAsync('DELETE FROM contacts WHERE id = ?', id);
    },
    true,
  );
}

// ---------- Dettes / créances ----------

export interface TransactionInput {
  contactId: string;
  direction: Direction;
  type: TransactionType;
  description: string;
  crop: Crop | null;
  total: number;
  upfrontPaid: number;
  date: string;
  dueDate: string | null;
}

export async function getTransaction(db: SQLiteDatabase, id: string): Promise<Transaction | null> {
  return db.getFirstAsync<Transaction>('SELECT * FROM transactions WHERE id = ?', id);
}

export async function saveTransaction(db: SQLiteDatabase, input: TransactionInput, id?: string): Promise<string> {
  const values = [
    input.contactId,
    input.direction,
    input.type,
    input.description.trim(),
    input.crop,
    input.total,
    input.upfrontPaid,
    input.date,
    input.dueDate,
  ];
  if (id) {
    const previous = await getTransaction(db, id);
    return act(
      db,
      { action: 'EDITED', entityType: 'T', entityId: id, contactId: input.contactId, direction: input.direction, amount: input.total, details: input.description },
      async () => {
        await db.runAsync(
          `UPDATE transactions SET contact_id = ?, direction = ?, transaction_type = ?, description = ?, crop = ?,
                  total_amount = ?, upfront_paid = ?, transaction_date = ?, due_date = ? WHERE id = ?`,
          ...values,
          id,
        );
        // Un versement ciblé doit rester chez le même contact et dans le même sens.
        await db.runAsync('UPDATE instruments SET transaction_id = NULL WHERE transaction_id = ? AND (contact_id != ? OR direction != ?)', id, input.contactId, input.direction);
        await recomputeContact(db, input.contactId);
        if (previous && previous.contact_id !== input.contactId) await recomputeContact(db, previous.contact_id);
        return id;
      },
    );
  }
  const newId = randomUUID();
  return act(
    db,
    { action: 'CREDIT_ADDED', entityType: 'T', contactId: input.contactId, direction: input.direction, amount: input.total, details: input.description },
    async () => {
      await db.runAsync(
        `INSERT INTO transactions (contact_id, direction, transaction_type, description, crop, total_amount, upfront_paid,
                                   transaction_date, due_date, id, paid_amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'UNPAID', ?)`,
        ...values,
        newId,
        nowIso(),
      );
      await recomputeContact(db, input.contactId);
      return newId;
    },
  );
}

// ---------- Paie ----------

export interface PayrollInput {
  workType: WorkType;
  crop: Crop | null;
  days: number;
  rate: number;
  date: string;
  paidNow: boolean;
}

export async function getPayroll(db: SQLiteDatabase, id: string): Promise<PayrollEntry | null> {
  return db.getFirstAsync<PayrollEntry>('SELECT * FROM payroll_entries WHERE id = ?', id);
}

export async function createPayrollGroup(db: SQLiteDatabase, contactIds: string[], input: PayrollInput) {
  const totalDue = Math.round(input.days * input.rate);
  // Une seule action annulable, mais une ligne de journal par ouvrier.
  const label: LogInput = { action: 'PAYROLL_ADDED', direction: 'PAYABLE', amount: totalDue * contactIds.length, details: String(contactIds.length) };
  await runAction(db, JSON.stringify(label), async () => {
    for (const contactId of contactIds) {
      const id = randomUUID();
      await db.runAsync(
        `INSERT INTO payroll_entries (id, contact_id, work_type, crop, days_worked, daily_rate, total_due, upfront_paid, paid_amount, work_date, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'PENDING_PAYMENT', ?)`,
        id,
        contactId,
        input.workType,
        input.crop,
        input.days,
        input.rate,
        totalDue,
        input.paidNow ? totalDue : 0,
        input.date,
        nowIso(),
      );
      await insertLog(db, { action: 'PAYROLL_ADDED', entityType: 'P', entityId: id, contactId, direction: 'PAYABLE', amount: totalDue });
      await recomputeContact(db, contactId);
    }
  });
}

export async function updatePayroll(db: SQLiteDatabase, id: string, input: Omit<PayrollInput, 'paidNow'> & { upfrontPaid: number }) {
  const entry = await getPayroll(db, id);
  if (!entry) return;
  const totalDue = Math.round(input.days * input.rate);
  await act(db, { action: 'EDITED', entityType: 'P', entityId: id, contactId: entry.contact_id, direction: 'PAYABLE', amount: totalDue }, async () => {
    await db.runAsync(
      'UPDATE payroll_entries SET work_type = ?, crop = ?, days_worked = ?, daily_rate = ?, total_due = ?, upfront_paid = ?, work_date = ? WHERE id = ?',
      input.workType,
      input.crop,
      input.days,
      input.rate,
      totalDue,
      Math.min(input.upfrontPaid, totalDue),
      input.date,
      id,
    );
    await recomputeContact(db, entry.contact_id);
  });
}

// ---------- Grand livre ----------

export async function getLedger(db: SQLiteDatabase, contactId: string): Promise<LedgerRow[]> {
  return db.getAllAsync<LedgerRow>(
    `SELECT 'T' AS kind, id, direction, transaction_date AS d, description AS label, transaction_type AS sub, crop,
            total_amount AS total, paid_amount AS paid, due_date AS due, NULL AS days, NULL AS rate, created_at AS c,
            (SELECT COUNT(*) FROM attachments a WHERE a.entity_type = 'T' AND a.entity_id = t.id) AS photos
       FROM transactions t WHERE contact_id = $c
     UNION ALL
     SELECT 'P', id, 'PAYABLE', work_date, '', work_type, crop, total_due, paid_amount, NULL, days_worked, daily_rate, created_at,
            (SELECT COUNT(*) FROM attachments a WHERE a.entity_type = 'P' AND a.entity_id = p.id)
       FROM payroll_entries p WHERE contact_id = $c
     ORDER BY d, c`,
    { $c: contactId },
  );
}

/** Supprime une dette / paie / un effet (les photos liées suivent, annulable). */
export async function deleteEntity(db: SQLiteDatabase, kind: EntityType, id: string) {
  const table = { T: 'transactions', P: 'payroll_entries', I: 'instruments' }[kind];
  const row = await db.getFirstAsync<{ contact_id: string; amount: number; direction: Direction | null }>(
    `SELECT contact_id, ${kind === 'T' ? 'total_amount' : kind === 'P' ? 'total_due' : 'amount'} AS amount,
            ${kind === 'P' ? "'PAYABLE'" : 'direction'} AS direction FROM ${table} WHERE id = ?`,
    id,
  );
  if (!row) return;
  await act(
    db,
    { action: 'DELETED', entityType: kind, entityId: id, contactId: row.contact_id, direction: row.direction, amount: row.amount },
    async () => {
      await db.runAsync('DELETE FROM attachments WHERE entity_type = ? AND entity_id = ?', kind, id);
      await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, id);
      await recomputeContact(db, row.contact_id);
    },
    true,
  );
}

// ---------- Effets et versements ----------

export interface InstrumentInput {
  contactId: string;
  direction: Direction;
  transactionId: string | null;
  payrollEntryId: string | null;
  type: InstrumentType;
  amount: number;
  issueDate: string;
  maturityDate: string;
  reference: string;
  reminderDays: number;
}

export async function getInstrument(db: SQLiteDatabase, id: string): Promise<InstrumentWithContact | null> {
  return db.getFirstAsync<InstrumentWithContact>(
    `SELECT i.*, c.name AS contact_name,
            (SELECT COUNT(*) FROM attachments a WHERE a.entity_type = 'I' AND a.entity_id = i.id) AS photos
       FROM instruments i JOIN contacts c ON c.id = i.contact_id WHERE i.id = ?`,
    id,
  );
}

export async function saveInstrument(db: SQLiteDatabase, input: InstrumentInput, id?: string): Promise<string> {
  const cash = input.type === 'CASH';
  const values = [
    input.transactionId,
    input.payrollEntryId,
    input.contactId,
    input.direction,
    input.type,
    input.amount,
    input.issueDate,
    cash ? input.issueDate : input.maturityDate,
    input.reference.trim() || null,
    cash ? 0 : input.reminderDays,
  ];
  if (id) {
    const previous = await getInstrument(db, id);
    return act(db, { action: 'EDITED', entityType: 'I', entityId: id, contactId: input.contactId, direction: input.direction, amount: input.amount }, async () => {
      await db.runAsync(
        `UPDATE instruments SET transaction_id = ?, payroll_entry_id = ?, contact_id = ?, direction = ?, instrument_type = ?, amount = ?,
                issue_date = ?, maturity_due_date = ?, reference_number = ?, reminder_days_before = ?
                ${cash ? ", status = 'DEBITED_PAID'" : ''} WHERE id = ?`,
        ...values,
        id,
      );
      await recomputeContact(db, input.contactId);
      if (previous && previous.contact_id !== input.contactId) await recomputeContact(db, previous.contact_id);
      return id;
    });
  }
  const newId = randomUUID();
  return act(
    db,
    {
      action: cash ? 'PAYMENT' : 'INSTRUMENT_ADDED',
      entityType: 'I',
      contactId: input.contactId,
      direction: input.direction,
      amount: input.amount,
      details: cash ? null : input.type,
    },
    async () => {
      await db.runAsync(
        `INSERT INTO instruments (transaction_id, payroll_entry_id, contact_id, direction, instrument_type, amount, issue_date,
                                  maturity_due_date, reference_number, reminder_days_before, id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ...values,
        newId,
        cash ? 'DEBITED_PAID' : 'PENDING',
        nowIso(),
      );
      await recomputeContact(db, input.contactId);
      return newId;
    },
  );
}

/** Versement espèces (je paie / je reçois), éventuellement ciblé sur une ligne. */
export async function recordCashPayment(
  db: SQLiteDatabase,
  contactId: string,
  direction: Direction,
  amount: number,
  target?: { kind: 'T' | 'P'; id: string } | null,
) {
  const date = today();
  return saveInstrument(db, {
    contactId,
    direction,
    transactionId: target?.kind === 'T' ? target.id : null,
    payrollEntryId: target?.kind === 'P' ? target.id : null,
    type: 'CASH',
    amount,
    issueDate: date,
    maturityDate: date,
    reference: '',
    reminderDays: 0,
  });
}

export async function setInstrumentStatus(db: SQLiteDatabase, id: string, status: Extract<InstrumentStatus, 'DEBITED_PAID' | 'CANCELLED'>) {
  const inst = await getInstrument(db, id);
  if (!inst || inst.status !== 'PENDING') return;
  await act(
    db,
    {
      action: status === 'DEBITED_PAID' ? 'INSTRUMENT_PAID' : 'INSTRUMENT_CANCELLED',
      entityType: 'I',
      entityId: id,
      contactId: inst.contact_id,
      direction: inst.direction,
      amount: inst.amount,
      details: inst.instrument_type,
    },
    async () => {
      await db.runAsync('UPDATE instruments SET status = ? WHERE id = ?', status, id);
      await recomputeContact(db, inst.contact_id);
    },
  );
}

export async function listInstruments(
  db: SQLiteDatabase,
  opts: { status?: InstrumentStatus; contactId?: string; excludeCash?: boolean } = {},
): Promise<InstrumentWithContact[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (opts.status) {
    where.push('i.status = ?');
    params.push(opts.status);
  }
  if (opts.contactId) {
    where.push('i.contact_id = ?');
    params.push(opts.contactId);
  }
  if (opts.excludeCash) where.push("i.instrument_type != 'CASH'");
  return db.getAllAsync<InstrumentWithContact>(
    `SELECT i.*, c.name AS contact_name,
            (SELECT COUNT(*) FROM attachments a WHERE a.entity_type = 'I' AND a.entity_id = i.id) AS photos
       FROM instruments i JOIN contacts c ON c.id = i.contact_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY i.maturity_due_date, i.created_at`,
    params,
  );
}

export async function listOpenItems(db: SQLiteDatabase, contactId: string, direction: Direction): Promise<LedgerRow[]> {
  const rows = await getLedger(db, contactId);
  return rows.filter((r) => r.direction === direction && r.total > r.paid);
}

// ---------- Photos justificatives ----------

export async function listAttachments(db: SQLiteDatabase, entityType: EntityType, entityId: string): Promise<Attachment[]> {
  return db.getAllAsync<Attachment>('SELECT * FROM attachments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at', entityType, entityId);
}

async function entityContact(db: SQLiteDatabase, entityType: EntityType, entityId: string) {
  const table = { T: 'transactions', P: 'payroll_entries', I: 'instruments' }[entityType];
  return (await db.getFirstAsync<{ contact_id: string }>(`SELECT contact_id FROM ${table} WHERE id = ?`, entityId))?.contact_id ?? null;
}

export async function addAttachment(db: SQLiteDatabase, entityType: EntityType, entityId: string, fileName: string) {
  const contactId = await entityContact(db, entityType, entityId);
  await act(db, { action: 'PHOTO_ADDED', entityType, entityId, contactId }, async () => {
    await db.runAsync(
      'INSERT INTO attachments (id, entity_type, entity_id, file_name, created_at) VALUES (?, ?, ?, ?, ?)',
      randomUUID(),
      entityType,
      entityId,
      fileName,
      nowIso(),
    );
  });
}

export async function deleteAttachment(db: SQLiteDatabase, attachment: Attachment) {
  const contactId = await entityContact(db, attachment.entity_type, attachment.entity_id);
  await act(db, { action: 'PHOTO_DELETED', entityType: attachment.entity_type, entityId: attachment.entity_id, contactId }, async () => {
    await db.runAsync('DELETE FROM attachments WHERE id = ?', attachment.id);
  });
}

/** Fichiers encore utiles : référencés par une photo ou par une annulation possible. */
export async function referencedFileNames(db: SQLiteDatabase): Promise<Set<string>> {
  const live = await db.getAllAsync<{ file_name: string }>('SELECT file_name FROM attachments');
  const undo = await db.getAllAsync<{ sql: string }>("SELECT sql FROM undo_log WHERE sql LIKE 'INSERT INTO attachments%'");
  const names = new Set(live.map((r) => r.file_name));
  for (const u of undo) for (const m of u.sql.matchAll(/'([\w-]+\.jpg)'/g)) names.add(m[1]);
  return names;
}

// ---------- Historique ----------

export type HistoryFilter = 'ALL' | 'PAYABLE' | 'RECEIVABLE' | 'PAYMENTS' | 'INSTRUMENTS' | 'PAYROLL' | 'CHANGES';

export async function listActivity(
  db: SQLiteDatabase,
  opts: { search?: string; contactId?: string; filter?: HistoryFilter; since?: string | null },
): Promise<ActivityRow[]> {
  const where: string[] = ['1 = 1'];
  const params: Record<string, string> = {};
  if (opts.contactId) {
    where.push('l.contact_id = $contact');
    params.$contact = opts.contactId;
  }
  if (opts.search?.trim()) {
    where.push('(l.contact_name LIKE $q OR l.details LIKE $q)');
    params.$q = `%${opts.search.trim()}%`;
  }
  if (opts.since) {
    where.push('l.created_at >= $since');
    params.$since = opts.since;
  }
  const filters: Record<HistoryFilter, string | null> = {
    ALL: null,
    PAYABLE: "l.direction = 'PAYABLE'",
    RECEIVABLE: "l.direction = 'RECEIVABLE'",
    PAYMENTS: "l.action IN ('PAYMENT','INSTRUMENT_PAID')",
    INSTRUMENTS: "l.action IN ('INSTRUMENT_ADDED','INSTRUMENT_PAID','INSTRUMENT_CANCELLED')",
    PAYROLL: "l.entity_type = 'P'",
    CHANGES: "l.action IN ('EDITED','DELETED','PHOTO_DELETED','CONTACT_EDITED','CONTACT_DELETED')",
  };
  const f = filters[opts.filter ?? 'ALL'];
  if (f) where.push(f);
  return db.getAllAsync<ActivityRow>(
    `SELECT l.*,
            (SELECT COUNT(*) FROM attachments a WHERE a.entity_type = l.entity_type AND a.entity_id = l.entity_id) AS photos,
            CASE l.entity_type
              WHEN 'T' THEN EXISTS (SELECT 1 FROM transactions WHERE id = l.entity_id)
              WHEN 'P' THEN EXISTS (SELECT 1 FROM payroll_entries WHERE id = l.entity_id)
              WHEN 'I' THEN EXISTS (SELECT 1 FROM instruments WHERE id = l.entity_id)
              ELSE 0 END AS entity_exists
       FROM activity_log l
      WHERE ${where.map((w) => `(${w})`).join(' AND ')}
      ORDER BY l.created_at DESC LIMIT 500`,
    params,
  );
}

// ---------- Cultures ----------

export async function getCropSummary(db: SQLiteDatabase, since: string | null): Promise<CropSummary[]> {
  const from = since ?? '0000-00-00';
  const tx = await db.getAllAsync<{ crop: Crop | null; expenses: number; sales: number }>(
    `SELECT crop,
            SUM(CASE WHEN direction = 'PAYABLE' AND transaction_type = 'DEBT_ITEM' THEN total_amount ELSE 0 END) AS expenses,
            SUM(CASE WHEN transaction_type = 'SALE_ON_CREDIT' THEN total_amount ELSE 0 END) AS sales
       FROM transactions WHERE transaction_date >= ? GROUP BY crop`,
    from,
  );
  const wages = await db.getAllAsync<{ crop: Crop | null; wages: number }>(
    'SELECT crop, SUM(total_due) AS wages FROM payroll_entries WHERE work_date >= ? GROUP BY crop',
    from,
  );
  const map = new Map<string, CropSummary>();
  const get = (crop: Crop | null) => {
    const k = crop ?? 'NONE';
    if (!map.has(k)) map.set(k, { crop: k, expenses: 0, wages: 0, sales: 0 });
    return map.get(k)!;
  };
  for (const r of tx) Object.assign(get(r.crop), { expenses: r.expenses, sales: r.sales });
  for (const r of wages) get(r.crop).wages = r.wages;
  return [...map.values()].filter((c) => c.expenses + c.wages + c.sales > 0);
}

// ---------- Tableau de bord ----------

export async function getDashboard(db: SQLiteDatabase): Promise<DashboardData> {
  const now = today();
  const sums = await db.getFirstAsync<{ payable: number; receivable: number; payableLate: number; receivableLate: number }>(
    `SELECT COALESCE(SUM(CASE WHEN direction = 'PAYABLE' THEN total_amount - paid_amount END), 0) AS payable,
            COALESCE(SUM(CASE WHEN direction = 'RECEIVABLE' THEN total_amount - paid_amount END), 0) AS receivable,
            COALESCE(SUM(direction = 'PAYABLE' AND due_date < $today), 0) AS payableLate,
            COALESCE(SUM(direction = 'RECEIVABLE' AND due_date < $today), 0) AS receivableLate
       FROM transactions WHERE status != 'PAID'`,
    { $today: now },
  );
  const wages = await db.getFirstAsync<{ v: number }>(
    "SELECT COALESCE(SUM(total_due - paid_amount), 0) AS v FROM payroll_entries WHERE status != 'PAID'",
  );
  const due = await db.getFirstAsync<{ soon: number; overdue: number; amount: number }>(
    `SELECT COALESCE(SUM(maturity_due_date >= $today), 0) AS soon,
            COALESCE(SUM(maturity_due_date < $today), 0) AS overdue,
            COALESCE(SUM(amount), 0) AS amount
       FROM instruments
      WHERE status = 'PENDING' AND maturity_due_date <= $limit`,
    { $today: now, $limit: addDays(now, 7) },
  );
  const upcoming = await listInstruments(db, { status: 'PENDING' });
  const late = await db.getAllAsync<LateRow>(
    `SELECT t.id, t.contact_id, c.name AS contact_name, t.direction, t.description,
            t.total_amount - t.paid_amount AS rest, t.due_date
       FROM transactions t JOIN contacts c ON c.id = t.contact_id
      WHERE t.status != 'PAID' AND t.due_date < ?
      ORDER BY t.due_date LIMIT 6`,
    now,
  );
  return {
    payableTotal: sums?.payable ?? 0,
    receivableTotal: sums?.receivable ?? 0,
    payableLate: sums?.payableLate ?? 0,
    receivableLate: sums?.receivableLate ?? 0,
    pendingWages: wages?.v ?? 0,
    dueSoonCount: due?.soon ?? 0,
    overdueCount: due?.overdue ?? 0,
    dueSoonAmount: due?.amount ?? 0,
    upcoming: upcoming.slice(0, 5),
    late,
  };
}
