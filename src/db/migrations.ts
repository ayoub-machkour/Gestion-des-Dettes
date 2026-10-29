import type { SQLiteDatabase } from 'expo-sqlite';

const DB_VERSION = 1;

export async function migrateDb(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= DB_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
      CREATE TABLE contacts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('SUPPLIER','FAMILY_LENDER','EMPLOYEE','OTHER')),
        phone TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE transactions (
        id TEXT PRIMARY KEY NOT NULL,
        contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        transaction_type TEXT NOT NULL CHECK (transaction_type IN ('DEBT_ITEM','CASH_LOAN','EMPLOYEE_WAGE')),
        description TEXT NOT NULL DEFAULT '',
        total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
        paid_amount INTEGER NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
        status TEXT NOT NULL CHECK (status IN ('UNPAID','PARTIAL','PAID')),
        transaction_date TEXT NOT NULL,
        due_date TEXT
      );

      CREATE TABLE instruments (
        id TEXT PRIMARY KEY NOT NULL,
        transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
        contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        instrument_type TEXT NOT NULL CHECK (instrument_type IN ('CASH','BANK_CHECK','BILL_OF_EXCHANGE','PROMISSORY_NOTE')),
        amount INTEGER NOT NULL CHECK (amount > 0),
        issue_date TEXT NOT NULL,
        maturity_due_date TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PENDING','DEBITED_PAID','CANCELLED')),
        reference_number TEXT,
        reminder_days_before INTEGER NOT NULL DEFAULT 3,
        notification_ids TEXT
      );

      CREATE TABLE payroll_entries (
        id TEXT PRIMARY KEY NOT NULL,
        contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        work_type TEXT NOT NULL CHECK (work_type IN ('DAILY_WAGE','GROUP_CONTRACT','MONTHLY')),
        days_worked REAL NOT NULL,
        daily_rate INTEGER NOT NULL,
        total_due INTEGER NOT NULL,
        paid_amount INTEGER NOT NULL DEFAULT 0,
        work_date TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PENDING_PAYMENT','PAID'))
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      CREATE INDEX idx_tx_contact ON transactions(contact_id, transaction_date);
      CREATE INDEX idx_instr_maturity ON instruments(status, maturity_due_date);
      CREATE INDEX idx_instr_contact ON instruments(contact_id);
      CREATE INDEX idx_payroll_contact ON payroll_entries(contact_id, work_date);
    `);
    version = 1;
  }

  await db.execAsync(`PRAGMA user_version = ${DB_VERSION}`);
}
