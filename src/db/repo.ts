import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { addDays, today } from '../utils/dates';
import type {
  ActivityAction,
  ActivityRow,
  Attachment,
  ContactType,
  ContactWithBalance,
  Direction,
  EntityType,
  InstrumentStatus,
  InstrumentType,
  InstrumentWithContact,
  LedgerRow,
  PayrollEntry,
  TimelineRow,
  Transaction,
  TransactionItem,
  TransactionStatus,
  WorkType,
} from './types';

export function statusFor(total: number, paid: number): TransactionStatus {
  if (paid <= 0 && total > 0) return 'UNPAID';
  if (paid >= total) return 'PAID';
  return 'PARTIAL';
}

export const itemTotal = (i: TransactionItem) => Math.round(i.quantity * i.unit_price);

const nowIso = () => new Date().toISOString();

// ---------- Paramètres ----------

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}

// ---------- Journal ----------

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

/** Exécute une action dans une transaction SQL et l'écrit au journal. */
async function act<T>(db: SQLiteDatabase, entry: LogInput, task: () => Promise<T>, logBefore = false): Promise<T> {
  let result!: T;
  await db.withTransactionAsync(async () => {
    // Pour une suppression, on journalise avant (le nom du contact existe encore).
    if (logBefore) await insertLog(db, entry);
    result = await task();
    if (!logBefore) await insertLog(db, { ...entry, entityId: entry.entityId ?? (typeof result === 'string' ? result : null) });
  });
  return result;
}

async function insertPhotos(db: SQLiteDatabase, entityType: EntityType, entityId: string, fileNames: string[] = []) {
  for (const fileName of fileNames) {
    await db.runAsync(
      'INSERT INTO attachments (id, entity_type, entity_id, file_name, created_at) VALUES (?, ?, ?, ?, ?)',
      randomUUID(),
      entityType,
      entityId,
      fileName,
      nowIso(),
    );
  }
}

// ---------- Recalcul des soldes ----------

/**
 * Recalcule paid_amount / status des dettes d'un contact à partir des montants payés à la saisie
 * et des paiements (espèces + effets débités) : d'abord vers la dette ciblée, puis les plus anciennes.
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
      WHERE contact_id = c.id AND direction = 'RECEIVABLE' AND status != 'PAID' AND due_date < $today) AS late_receivable,
    (SELECT MAX(created_at) FROM activity_log WHERE contact_id = c.id) AS last_activity,
    (SELECT MAX(rowid) FROM activity_log WHERE contact_id = c.id) AS last_seq
  FROM contacts c`;

/** Contacts, les plus récemment utilisés en premier. */
export async function listContacts(db: SQLiteDatabase, opts: { type?: ContactType | null; search?: string } = {}): Promise<ContactWithBalance[]> {
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
  return db.getAllAsync<ContactWithBalance>(
    `${CONTACT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY last_seq DESC`,
    params,
  );
}

export async function getContact(db: SQLiteDatabase, id: string): Promise<ContactWithBalance | null> {
  return db.getFirstAsync<ContactWithBalance>(`${CONTACT_SELECT} WHERE c.id = $id`, { $today: today(), $id: id });
}

export async function saveContact(db: SQLiteDatabase, input: { id?: string; name: string; type: ContactType }): Promise<string> {
  const name = input.name.trim();
  if (input.id) {
    const id = input.id;
    return act(db, { action: 'CONTACT_EDITED', contactId: id, details: name }, async () => {
      await db.runAsync('UPDATE contacts SET name = ?, type = ? WHERE id = ?', name, input.type, id);
      return id;
    });
  }
  const id = randomUUID();
  return act(db, { action: 'CONTACT_ADDED', contactId: id, details: name }, async () => {
    await db.runAsync('INSERT INTO contacts (id, name, type, created_at) VALUES (?, ?, ?, ?)', id, name, input.type, nowIso());
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

// ---------- Achats / crédits ----------

export interface TransactionInput {
  contactId: string;
  direction: Direction;
  items: TransactionItem[];
  upfrontPaid: number;
  date: string;
  dueDate: string | null;
  photos?: string[];
}

export async function getTransaction(db: SQLiteDatabase, id: string): Promise<Transaction | null> {
  return db.getFirstAsync<Transaction>('SELECT * FROM transactions WHERE id = ?', id);
}

/** Articles d'un achat ; une ancienne opération sans article devient un article unique. */
export async function getTransactionItems(db: SQLiteDatabase, tx: Transaction): Promise<TransactionItem[]> {
  const items = await db.getAllAsync<TransactionItem>(
    'SELECT name, quantity, unit_price FROM transaction_items WHERE transaction_id = ? ORDER BY position',
    tx.id,
  );
  return items.length ? items : [{ name: tx.description, quantity: 1, unit_price: tx.total_amount }];
}

export async function saveTransaction(db: SQLiteDatabase, input: TransactionInput, id?: string): Promise<string> {
  const items = input.items.map((i) => ({ ...i, name: i.name.trim() }));
  const total = items.reduce((sum, i) => sum + itemTotal(i), 0);
  const description = items.map((i) => i.name).filter(Boolean).join(' · ');
  const type = input.direction === 'PAYABLE' ? 'DEBT_ITEM' : 'SALE_ON_CREDIT';
  const upfront = Math.min(input.upfrontPaid, total);

  const writeItems = async (txId: string) => {
    await db.runAsync('DELETE FROM transaction_items WHERE transaction_id = ?', txId);
    for (const [position, i] of items.entries()) {
      await db.runAsync(
        'INSERT INTO transaction_items (id, transaction_id, position, name, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)',
        randomUUID(),
        txId,
        position,
        i.name,
        i.quantity,
        i.unit_price,
      );
    }
  };

  if (id) {
    return act(
      db,
      { action: 'EDITED', entityType: 'T', entityId: id, contactId: input.contactId, direction: input.direction, amount: total, details: description },
      async () => {
        await db.runAsync(
          `UPDATE transactions SET direction = ?, transaction_type = ?, description = ?, total_amount = ?, upfront_paid = ?,
                  transaction_date = ?, due_date = ? WHERE id = ?`,
          input.direction,
          type,
          description,
          total,
          upfront,
          input.date,
          input.dueDate,
          id,
        );
        await writeItems(id);
        // Un paiement ciblé doit rester dans le même sens que la dette.
        await db.runAsync('UPDATE instruments SET transaction_id = NULL WHERE transaction_id = ? AND direction != ?', id, input.direction);
        await insertPhotos(db, 'T', id, input.photos);
        await recomputeContact(db, input.contactId);
        return id;
      },
    );
  }
  const newId = randomUUID();
  return act(
    db,
    { action: 'CREDIT_ADDED', entityType: 'T', contactId: input.contactId, direction: input.direction, amount: total, details: description },
    async () => {
      await db.runAsync(
        `INSERT INTO transactions (id, contact_id, direction, transaction_type, description, total_amount, upfront_paid,
                                   paid_amount, status, transaction_date, due_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'UNPAID', ?, ?, ?)`,
        newId,
        input.contactId,
        input.direction,
        type,
        description,
        total,
        upfront,
        input.date,
        input.dueDate,
        nowIso(),
      );
      await writeItems(newId);
      await insertPhotos(db, 'T', newId, input.photos);
      await recomputeContact(db, input.contactId);
      return newId;
    },
  );
}

// ---------- Paie ----------

export interface PayrollInput {
  workType: WorkType;
  days: number;
  rate: number;
  date: string;
  paidNow: boolean;
}

export async function getPayroll(db: SQLiteDatabase, id: string): Promise<PayrollEntry | null> {
  return db.getFirstAsync<PayrollEntry>('SELECT * FROM payroll_entries WHERE id = ?', id);
}

/** Une ligne de paie par ouvrier, en une seule transaction ; une ligne de journal par ouvrier. */
export async function createPayrollGroup(db: SQLiteDatabase, contactIds: string[], input: PayrollInput) {
  const totalDue = Math.round(input.days * input.rate);
  await db.withTransactionAsync(async () => {
    for (const contactId of contactIds) {
      const id = randomUUID();
      await db.runAsync(
        `INSERT INTO payroll_entries (id, contact_id, work_type, days_worked, daily_rate, total_due, upfront_paid, paid_amount, work_date, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'PENDING_PAYMENT', ?)`,
        id,
        contactId,
        input.workType,
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
      'UPDATE payroll_entries SET work_type = ?, days_worked = ?, daily_rate = ?, total_due = ?, upfront_paid = ?, work_date = ? WHERE id = ?',
      input.workType,
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

// ---------- Fiche d'une personne ----------

export async function getTimeline(db: SQLiteDatabase, contactId: string): Promise<TimelineRow[]> {
  return db.getAllAsync<TimelineRow>(
    `SELECT 'T' AS kind, id, transaction_date AS d, created_at AS c, description AS title, transaction_type AS sub, direction,
            total_amount AS amount, paid_amount AS paid, due_date AS due, status, NULL AS days, NULL AS rate,
            (SELECT COUNT(*) FROM attachments a WHERE a.entity_type = 'T' AND a.entity_id = t.id) AS photos
       FROM transactions t WHERE contact_id = $c
     UNION ALL
     SELECT 'P', id, work_date, created_at, NULL, work_type, 'PAYABLE', total_due, paid_amount, NULL, status, days_worked, daily_rate,
            (SELECT COUNT(*) FROM attachments a WHERE a.entity_type = 'P' AND a.entity_id = p.id)
       FROM payroll_entries p WHERE contact_id = $c
     UNION ALL
     SELECT 'I', id, CASE WHEN instrument_type = 'CASH' THEN issue_date ELSE maturity_due_date END, created_at, reference_number,
            instrument_type, direction, amount, NULL, maturity_due_date, status, NULL, NULL,
            (SELECT COUNT(*) FROM attachments a WHERE a.entity_type = 'I' AND a.entity_id = i.id)
       FROM instruments i WHERE contact_id = $c
     ORDER BY d DESC, c DESC`,
    { $c: contactId },
  );
}

/** Lignes achat / paie d'un contact (relevé de compte). */
export async function getLedger(db: SQLiteDatabase, contactId: string): Promise<LedgerRow[]> {
  return db.getAllAsync<LedgerRow>(
    `SELECT 'T' AS kind, id, direction, transaction_date AS d, description AS label, transaction_type AS sub,
            total_amount AS total, paid_amount AS paid, due_date AS due, NULL AS days, NULL AS rate, created_at AS c,
            (SELECT COUNT(*) FROM attachments a WHERE a.entity_type = 'T' AND a.entity_id = t.id) AS photos
       FROM transactions t WHERE contact_id = $c
     UNION ALL
     SELECT 'P', id, 'PAYABLE', work_date, '', work_type, total_due, paid_amount, NULL, days_worked, daily_rate, created_at,
            (SELECT COUNT(*) FROM attachments a WHERE a.entity_type = 'P' AND a.entity_id = p.id)
       FROM payroll_entries p WHERE contact_id = $c
     ORDER BY d, c`,
    { $c: contactId },
  );
}

/** Supprime un achat / une paie / un paiement (les photos liées suivent). */
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

// ---------- Paiements et effets ----------

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
  photos?: string[];
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
    return act(db, { action: 'EDITED', entityType: 'I', entityId: id, contactId: input.contactId, direction: input.direction, amount: input.amount }, async () => {
      await db.runAsync(
        `UPDATE instruments SET transaction_id = ?, payroll_entry_id = ?, contact_id = ?, direction = ?, instrument_type = ?, amount = ?,
                issue_date = ?, maturity_due_date = ?, reference_number = ?, reminder_days_before = ?
                ${cash ? ", status = 'DEBITED_PAID'" : ''} WHERE id = ?`,
        ...values,
        id,
      );
      await insertPhotos(db, 'I', id, input.photos);
      await recomputeContact(db, input.contactId);
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
      await insertPhotos(db, 'I', newId, input.photos);
      await recomputeContact(db, input.contactId);
      return newId;
    },
  );
}

/** Paiement espèces (je paie / je reçois), éventuellement ciblé sur un achat ou une paie. */
export async function savePayment(
  db: SQLiteDatabase,
  input: {
    contactId: string;
    direction: Direction;
    amount: number;
    date: string;
    target?: { kind: 'T' | 'P'; id: string } | null;
    photos?: string[];
  },
  id?: string,
) {
  return saveInstrument(
    db,
    {
      contactId: input.contactId,
      direction: input.direction,
      transactionId: input.target?.kind === 'T' ? input.target.id : null,
      payrollEntryId: input.target?.kind === 'P' ? input.target.id : null,
      type: 'CASH',
      amount: input.amount,
      issueDate: input.date,
      maturityDate: input.date,
      reference: '',
      reminderDays: 0,
      photos: input.photos,
    },
    id,
  );
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

/** Chèques / traites en attente qui arrivent à échéance sous 7 jours (ou en retard). */
export async function countDueInstruments(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM instruments WHERE status = 'PENDING' AND instrument_type != 'CASH' AND maturity_due_date <= ?",
    addDays(today(), 7),
  );
  return row?.n ?? 0;
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
  await act(db, { action: 'PHOTO_ADDED', entityType, entityId, contactId }, () => insertPhotos(db, entityType, entityId, [fileName]));
}

export async function deleteAttachment(db: SQLiteDatabase, attachment: Attachment) {
  const contactId = await entityContact(db, attachment.entity_type, attachment.entity_id);
  await act(db, { action: 'PHOTO_DELETED', entityType: attachment.entity_type, entityId: attachment.entity_id, contactId }, async () => {
    await db.runAsync('DELETE FROM attachments WHERE id = ?', attachment.id);
  });
}

export async function referencedFileNames(db: SQLiteDatabase): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ file_name: string }>('SELECT file_name FROM attachments');
  return new Set(rows.map((r) => r.file_name));
}

// ---------- Historique ----------

export type HistoryFilter = 'ALL' | 'CREDITS' | 'PAYMENTS' | 'INSTRUMENTS' | 'PAYROLL' | 'CHANGES';

export async function listActivity(db: SQLiteDatabase, opts: { search?: string; filter?: HistoryFilter }): Promise<ActivityRow[]> {
  const where: string[] = ['1 = 1'];
  const params: Record<string, string> = {};
  if (opts.search?.trim()) {
    where.push('(l.contact_name LIKE $q OR l.details LIKE $q)');
    params.$q = `%${opts.search.trim()}%`;
  }
  const filters: Record<HistoryFilter, string | null> = {
    ALL: null,
    CREDITS: "l.action = 'CREDIT_ADDED'",
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
