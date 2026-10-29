import type { SQLiteDatabase } from 'expo-sqlite';

const DB_VERSION = 1;

/** Colonnes des tables suivies par le système d'annulation (undo). */
export const TRACKED_TABLES: Record<string, string[]> = {
  contacts: ['id', 'name', 'type', 'phone', 'notes', 'created_at'],
  transactions: [
    'id', 'contact_id', 'direction', 'transaction_type', 'description', 'crop', 'total_amount',
    'upfront_paid', 'paid_amount', 'status', 'transaction_date', 'due_date', 'created_at',
  ],
  payroll_entries: [
    'id', 'contact_id', 'work_type', 'crop', 'days_worked', 'daily_rate', 'total_due',
    'upfront_paid', 'paid_amount', 'work_date', 'status', 'created_at',
  ],
  instruments: [
    'id', 'transaction_id', 'payroll_entry_id', 'contact_id', 'direction', 'instrument_type', 'amount',
    'issue_date', 'maturity_due_date', 'status', 'reference_number', 'reminder_days_before', 'created_at',
  ],
  attachments: ['id', 'entity_type', 'entity_id', 'file_name', 'created_at'],
  activity_log: [
    'id', 'created_at', 'action', 'entity_type', 'entity_id', 'contact_id', 'contact_name', 'direction', 'amount', 'details',
  ],
};

export const SCHEMA_SQL = `
  CREATE TABLE contacts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('SUPPLIER','CUSTOMER','FAMILY_LENDER','EMPLOYEE','OTHER')),
    phone TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  -- direction : PAYABLE = je dois ; RECEIVABLE = on me doit.
  -- paid_amount / status sont un cache recalculé (upfront_paid + versements répartis).
  CREATE TABLE transactions (
    id TEXT PRIMARY KEY NOT NULL,
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('PAYABLE','RECEIVABLE')),
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('DEBT_ITEM','CASH_LOAN','EMPLOYEE_WAGE','SALE_ON_CREDIT','LOAN_GIVEN')),
    description TEXT NOT NULL DEFAULT '',
    crop TEXT,
    total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
    upfront_paid INTEGER NOT NULL DEFAULT 0 CHECK (upfront_paid >= 0),
    paid_amount INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('UNPAID','PARTIAL','PAID')),
    transaction_date TEXT NOT NULL,
    due_date TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE payroll_entries (
    id TEXT PRIMARY KEY NOT NULL,
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    work_type TEXT NOT NULL CHECK (work_type IN ('DAILY_WAGE','GROUP_CONTRACT','MONTHLY')),
    crop TEXT,
    days_worked REAL NOT NULL,
    daily_rate INTEGER NOT NULL,
    total_due INTEGER NOT NULL,
    upfront_paid INTEGER NOT NULL DEFAULT 0,
    paid_amount INTEGER NOT NULL DEFAULT 0,
    work_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING_PAYMENT','PAID')),
    created_at TEXT NOT NULL
  );

  -- Chèques, traites, billets à ordre, et versements espèces (CASH, toujours DEBITED_PAID).
  CREATE TABLE instruments (
    id TEXT PRIMARY KEY NOT NULL,
    transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
    payroll_entry_id TEXT REFERENCES payroll_entries(id) ON DELETE SET NULL,
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('PAYABLE','RECEIVABLE')),
    instrument_type TEXT NOT NULL CHECK (instrument_type IN ('CASH','BANK_CHECK','BILL_OF_EXCHANGE','PROMISSORY_NOTE')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    issue_date TEXT NOT NULL,
    maturity_due_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING','DEBITED_PAID','CANCELLED')),
    reference_number TEXT,
    reminder_days_before INTEGER NOT NULL DEFAULT 3,
    created_at TEXT NOT NULL
  );

  -- Photos justificatives : entity_type T (dette), P (paie), I (effet / versement).
  CREATE TABLE attachments (
    id TEXT PRIMARY KEY NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('T','P','I')),
    entity_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  -- Journal de toutes les opérations (sans clé étrangère : survit à la suppression du contact).
  CREATE TABLE activity_log (
    id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    contact_id TEXT,
    contact_name TEXT,
    direction TEXT,
    amount INTEGER,
    details TEXT
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );

  CREATE TABLE undo_state (id INTEGER PRIMARY KEY CHECK (id = 1), grp INTEGER NOT NULL, active INTEGER NOT NULL);
  INSERT INTO undo_state (id, grp, active) VALUES (1, 0, 1);
  CREATE TABLE undo_groups (grp INTEGER PRIMARY KEY NOT NULL, label TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE undo_log (seq INTEGER PRIMARY KEY AUTOINCREMENT, grp INTEGER NOT NULL, sql TEXT NOT NULL);

  CREATE INDEX idx_tx_contact ON transactions(contact_id, direction, transaction_date);
  CREATE INDEX idx_instr_maturity ON instruments(status, maturity_due_date);
  CREATE INDEX idx_instr_contact ON instruments(contact_id);
  CREATE INDEX idx_payroll_contact ON payroll_entries(contact_id, work_date);
  CREATE INDEX idx_att_entity ON attachments(entity_type, entity_id);
  CREATE INDEX idx_log_date ON activity_log(created_at);
  CREATE INDEX idx_log_contact ON activity_log(contact_id);
`;

/**
 * Triggers d'annulation (technique « automatic undo » de sqlite.org) :
 * chaque modification enregistre l'instruction SQL inverse dans undo_log.
 */
export function undoTriggersSql(): string {
  const parts: string[] = [];
  const when = 'WHEN (SELECT active FROM undo_state WHERE id = 1) = 1';
  const grp = '(SELECT grp FROM undo_state WHERE id = 1)';
  for (const [table, cols] of Object.entries(TRACKED_TABLES)) {
    const setOld = cols.map((c) => `'${c}=' || quote(old.${c})`).join(" || ',' || ");
    const valuesOld = cols.map((c) => `quote(old.${c})`).join(" || ',' || ");
    parts.push(`
      CREATE TRIGGER undo_${table}_ins AFTER INSERT ON ${table} ${when} BEGIN
        INSERT INTO undo_log (grp, sql) VALUES (${grp}, 'DELETE FROM ${table} WHERE id=' || quote(new.id));
      END;
      CREATE TRIGGER undo_${table}_upd AFTER UPDATE ON ${table} ${when} BEGIN
        INSERT INTO undo_log (grp, sql) VALUES (${grp}, 'UPDATE ${table} SET ' || ${setOld} || ' WHERE id=' || quote(old.id));
      END;
      CREATE TRIGGER undo_${table}_del BEFORE DELETE ON ${table} ${when} BEGIN
        INSERT INTO undo_log (grp, sql) VALUES (${grp}, 'INSERT INTO ${table} (${cols.join(',')}) VALUES (' || ${valuesOld} || ')');
      END;`);
  }
  return parts.join('\n');
}

export async function migrateDb(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= DB_VERSION) return;

  await db.withTransactionAsync(async () => {
    if (version === 0) {
      await db.execAsync(SCHEMA_SQL);
      await db.execAsync(undoTriggersSql());
    }
    await db.execAsync(`PRAGMA user_version = ${DB_VERSION}`);
  });
}
