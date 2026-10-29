import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { Lang } from '../i18n/dicts';
import { cancelReminders, scheduleInstrumentReminders } from '../notifications';
import { addDays, today } from '../utils/dates';
import type {
  ContactType,
  ContactWithBalance,
  DashboardData,
  Instrument,
  InstrumentStatus,
  InstrumentType,
  InstrumentWithContact,
  LedgerRow,
  Transaction,
  TransactionStatus,
  TransactionType,
  WorkType,
} from './types';

export function statusFor(total: number, paid: number): TransactionStatus {
  if (paid <= 0) return 'UNPAID';
  if (paid >= total) return 'PAID';
  return 'PARTIAL';
}

// ---------- Paramètres ----------

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}

// ---------- Contacts ----------

const BALANCE_SQL = `
  COALESCE((SELECT SUM(t.total_amount - t.paid_amount) FROM transactions t WHERE t.contact_id = c.id), 0)
  + COALESCE((SELECT SUM(p.total_due - p.paid_amount) FROM payroll_entries p WHERE p.contact_id = c.id), 0)`;

export async function listContacts(db: SQLiteDatabase, type?: ContactType | null, search = ''): Promise<ContactWithBalance[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (type) {
    where.push('c.type = ?');
    params.push(type);
  }
  if (search.trim()) {
    where.push('c.name LIKE ?');
    params.push(`%${search.trim()}%`);
  }
  return db.getAllAsync<ContactWithBalance>(
    `SELECT c.*, ${BALANCE_SQL} AS balance FROM contacts c
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY balance DESC, c.name COLLATE NOCASE`,
    params,
  );
}

export async function getContact(db: SQLiteDatabase, id: string): Promise<ContactWithBalance | null> {
  return db.getFirstAsync<ContactWithBalance>(`SELECT c.*, ${BALANCE_SQL} AS balance FROM contacts c WHERE c.id = ?`, id);
}

export async function saveContact(
  db: SQLiteDatabase,
  input: { id?: string; name: string; type: ContactType; phone?: string; notes?: string },
): Promise<string> {
  const phone = input.phone?.trim() || null;
  const notes = input.notes?.trim() || null;
  if (input.id) {
    await db.runAsync('UPDATE contacts SET name = ?, type = ?, phone = ?, notes = ? WHERE id = ?', input.name.trim(), input.type, phone, notes, input.id);
    return input.id;
  }
  const id = randomUUID();
  await db.runAsync(
    'INSERT INTO contacts (id, name, type, phone, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    input.name.trim(),
    input.type,
    phone,
    notes,
    new Date().toISOString(),
  );
  return id;
}

export async function deleteContact(db: SQLiteDatabase, id: string) {
  const pending = await db.getAllAsync<{ notification_ids: string | null }>(
    "SELECT notification_ids FROM instruments WHERE contact_id = ? AND status = 'PENDING'",
    id,
  );
  for (const p of pending) await cancelReminders(p.notification_ids);
  await db.runAsync('DELETE FROM contacts WHERE id = ?', id);
}

// ---------- Dettes / Transactions ----------

export async function createTransaction(
  db: SQLiteDatabase,
  input: {
    contactId: string;
    type: TransactionType;
    description: string;
    total: number;
    paid: number;
    date: string;
    dueDate: string | null;
  },
): Promise<string> {
  const id = randomUUID();
  await db.runAsync(
    `INSERT INTO transactions (id, contact_id, transaction_type, description, total_amount, paid_amount, status, transaction_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.contactId,
    input.type,
    input.description.trim(),
    input.total,
    input.paid,
    statusFor(input.total, input.paid),
    input.date,
    input.dueDate,
  );
  return id;
}

export async function listUnpaidTransactions(db: SQLiteDatabase, contactId: string): Promise<Transaction[]> {
  return db.getAllAsync<Transaction>(
    "SELECT * FROM transactions WHERE contact_id = ? AND status != 'PAID' ORDER BY transaction_date",
    contactId,
  );
}

export async function getLedger(db: SQLiteDatabase, contactId: string): Promise<LedgerRow[]> {
  return db.getAllAsync<LedgerRow>(
    `SELECT 'T' AS kind, id, transaction_date AS d, description AS label, transaction_type AS sub,
            total_amount AS total, paid_amount AS paid, NULL AS days, NULL AS rate
       FROM transactions WHERE contact_id = ?
     UNION ALL
     SELECT 'P', id, work_date, '', work_type, total_due, paid_amount, days_worked, daily_rate
       FROM payroll_entries WHERE contact_id = ?
     ORDER BY d, kind`,
    contactId,
    contactId,
  );
}

export async function deleteLedgerItem(db: SQLiteDatabase, kind: 'T' | 'P', id: string) {
  if (kind === 'T') await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
  else await db.runAsync('DELETE FROM payroll_entries WHERE id = ?', id);
}

// ---------- Versements ----------

export interface PaymentTarget {
  kind: 'T' | 'P';
  id: string;
}

/**
 * Répartit un versement sur les dettes du contact : d'abord la cible choisie,
 * puis les plus anciennes (FIFO). Renvoie le montant non affecté.
 * Doit être appelé à l'intérieur d'une transaction SQL.
 */
async function allocatePayment(db: SQLiteDatabase, contactId: string, amount: number, target?: PaymentTarget | null): Promise<number> {
  let rows = await db.getAllAsync<{ kind: 'T' | 'P'; id: string; total: number; paid: number }>(
    `SELECT 'T' AS kind, id, total_amount AS total, paid_amount AS paid, transaction_date AS d
       FROM transactions WHERE contact_id = ? AND status != 'PAID'
     UNION ALL
     SELECT 'P', id, total_due, paid_amount, work_date
       FROM payroll_entries WHERE contact_id = ? AND status != 'PAID'
     ORDER BY d, kind`,
    contactId,
    contactId,
  );
  if (target) {
    const isTarget = (r: { kind: string; id: string }) => r.kind === target.kind && r.id === target.id;
    rows = [...rows.filter(isTarget), ...rows.filter((r) => !isTarget(r))];
  }

  let left = amount;
  for (const r of rows) {
    if (left <= 0) break;
    const part = Math.min(left, r.total - r.paid);
    if (part <= 0) continue;
    const paid = r.paid + part;
    left -= part;
    if (r.kind === 'T') {
      await db.runAsync('UPDATE transactions SET paid_amount = ?, status = ? WHERE id = ?', paid, statusFor(r.total, paid), r.id);
    } else {
      await db.runAsync('UPDATE payroll_entries SET paid_amount = ?, status = ? WHERE id = ?', paid, paid >= r.total ? 'PAID' : 'PENDING_PAYMENT', r.id);
    }
  }
  return left;
}

/** Versement en espèces : affecté immédiatement et tracé comme effet CASH payé. */
export async function recordCashPayment(db: SQLiteDatabase, contactId: string, amount: number, target?: PaymentTarget | null) {
  const date = today();
  await db.withTransactionAsync(async () => {
    await allocatePayment(db, contactId, amount, target);
    await db.runAsync(
      `INSERT INTO instruments (id, transaction_id, contact_id, instrument_type, amount, issue_date, maturity_due_date, status, reference_number, reminder_days_before)
       VALUES (?, ?, ?, 'CASH', ?, ?, ?, 'DEBITED_PAID', NULL, 0)`,
      randomUUID(),
      target?.kind === 'T' ? target.id : null,
      contactId,
      amount,
      date,
      date,
    );
  });
}

// ---------- Effets : chèques, traites, billets à ordre ----------

export async function createInstrument(
  db: SQLiteDatabase,
  input: {
    contactId: string;
    transactionId: string | null;
    type: InstrumentType;
    amount: number;
    issueDate: string;
    maturityDate: string;
    reference: string;
    reminderDays: number;
  },
  lang: Lang,
) {
  if (input.type === 'CASH') {
    await recordCashPayment(db, input.contactId, input.amount, input.transactionId ? { kind: 'T', id: input.transactionId } : null);
    return;
  }
  const id = randomUUID();
  const reference = input.reference.trim() || null;
  await db.runAsync(
    `INSERT INTO instruments (id, transaction_id, contact_id, instrument_type, amount, issue_date, maturity_due_date, status, reference_number, reminder_days_before)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    id,
    input.transactionId,
    input.contactId,
    input.type,
    input.amount,
    input.issueDate,
    input.maturityDate,
    reference,
    input.reminderDays,
  );
  const contact = await getContact(db, input.contactId);
  const notificationIds = await scheduleInstrumentReminders(
    {
      id,
      instrument_type: input.type,
      amount: input.amount,
      maturity_due_date: input.maturityDate,
      reference_number: reference,
      reminder_days_before: input.reminderDays,
    },
    contact?.name ?? '',
    lang,
  );
  if (notificationIds.length) {
    await db.runAsync('UPDATE instruments SET notification_ids = ? WHERE id = ?', JSON.stringify(notificationIds), id);
  }
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
    `SELECT i.*, c.name AS contact_name FROM instruments i JOIN contacts c ON c.id = i.contact_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY i.maturity_due_date, i.issue_date`,
    params,
  );
}

/** Le chèque / la traite est débité(e) : on solde les dettes correspondantes. */
export async function markInstrumentPaid(db: SQLiteDatabase, id: string) {
  const inst = await db.getFirstAsync<Instrument>('SELECT * FROM instruments WHERE id = ?', id);
  if (!inst || inst.status !== 'PENDING') return;
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE instruments SET status = 'DEBITED_PAID', notification_ids = NULL WHERE id = ?", id);
    await allocatePayment(db, inst.contact_id, inst.amount, inst.transaction_id ? { kind: 'T', id: inst.transaction_id } : null);
  });
  await cancelReminders(inst.notification_ids);
}

export async function cancelInstrument(db: SQLiteDatabase, id: string) {
  const inst = await db.getFirstAsync<Instrument>('SELECT * FROM instruments WHERE id = ?', id);
  if (!inst || inst.status !== 'PENDING') return;
  await db.runAsync("UPDATE instruments SET status = 'CANCELLED', notification_ids = NULL WHERE id = ?", id);
  await cancelReminders(inst.notification_ids);
}

// ---------- Main-d'œuvre ----------

export async function createPayrollGroup(
  db: SQLiteDatabase,
  input: { contactIds: string[]; workType: WorkType; days: number; rate: number; date: string; paidNow: boolean },
) {
  const totalDue = Math.round(input.days * input.rate);
  await db.withTransactionAsync(async () => {
    for (const contactId of input.contactIds) {
      await db.runAsync(
        `INSERT INTO payroll_entries (id, contact_id, work_type, days_worked, daily_rate, total_due, paid_amount, work_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        contactId,
        input.workType,
        input.days,
        input.rate,
        totalDue,
        input.paidNow ? totalDue : 0,
        input.date,
        input.paidNow ? 'PAID' : 'PENDING_PAYMENT',
      );
    }
  });
}

// ---------- Tableau de bord ----------

export async function getDashboard(db: SQLiteDatabase): Promise<DashboardData> {
  const now = today();
  const debt = await db.getFirstAsync<{ v: number }>(
    "SELECT COALESCE(SUM(total_amount - paid_amount), 0) AS v FROM transactions WHERE status != 'PAID'",
  );
  const wages = await db.getFirstAsync<{ v: number }>(
    "SELECT COALESCE(SUM(total_due - paid_amount), 0) AS v FROM payroll_entries WHERE status != 'PAID'",
  );
  const due = await db.getFirstAsync<{ soon: number; overdue: number; amount: number }>(
    `SELECT COALESCE(SUM(maturity_due_date >= ?), 0) AS soon,
            COALESCE(SUM(maturity_due_date < ?), 0) AS overdue,
            COALESCE(SUM(amount), 0) AS amount
       FROM instruments
      WHERE status = 'PENDING' AND maturity_due_date <= ?`,
    now,
    now,
    addDays(now, 7),
  );
  const upcoming = await db.getAllAsync<InstrumentWithContact>(
    `SELECT i.*, c.name AS contact_name FROM instruments i JOIN contacts c ON c.id = i.contact_id
      WHERE i.status = 'PENDING' ORDER BY i.maturity_due_date LIMIT 5`,
  );
  return {
    totalDebt: debt?.v ?? 0,
    pendingWages: wages?.v ?? 0,
    dueSoonCount: due?.soon ?? 0,
    overdueCount: due?.overdue ?? 0,
    dueSoonAmount: due?.amount ?? 0,
    upcoming,
  };
}
