import type { SQLiteDatabase } from 'expo-sqlite';

/** Schéma v2 (installation neuve), complété ensuite par les migrations suivantes. */
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
  -- paid_amount / status sont un cache recalculé (upfront_paid + paiements répartis).
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

  -- Articles d'un achat / d'une vente (désignation, quantité × prix unitaire).
  CREATE TABLE transaction_items (
    id TEXT PRIMARY KEY NOT NULL,
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price INTEGER NOT NULL
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

  -- Chèques, traites, billets à ordre, et paiements espèces (CASH, toujours DEBITED_PAID).
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

  -- Photos justificatives : entity_type T (achat), P (paie), I (paiement / effet).
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

  CREATE INDEX idx_tx_contact ON transactions(contact_id, direction, transaction_date);
  CREATE INDEX idx_items_tx ON transaction_items(transaction_id, position);
  CREATE INDEX idx_instr_maturity ON instruments(status, maturity_due_date);
  CREATE INDEX idx_instr_contact ON instruments(contact_id);
  CREATE INDEX idx_payroll_contact ON payroll_entries(contact_id, work_date);
  CREATE INDEX idx_att_entity ON attachments(entity_type, entity_id);
  CREATE INDEX idx_log_date ON activity_log(created_at);
  CREATE INDEX idx_log_contact ON activity_log(contact_id);
`;

/** v1 -> v2 : articles multiples par achat ; suppression du système d'annulation (undo). */
const V1_TO_V2 = `
  CREATE TABLE transaction_items (
    id TEXT PRIMARY KEY NOT NULL,
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price INTEGER NOT NULL
  );
  CREATE INDEX idx_items_tx ON transaction_items(transaction_id, position);
  ${['contacts', 'transactions', 'payroll_entries', 'instruments', 'attachments', 'activity_log']
    .flatMap((table) => ['ins', 'upd', 'del'].map((op) => `DROP TRIGGER IF EXISTS undo_${table}_${op};`))
    .join('\n')}
  DROP TABLE IF EXISTS undo_log;
  DROP TABLE IF EXISTS undo_groups;
  DROP TABLE IF EXISTS undo_state;
`;

/**
 * v2 -> v3 : types de personne personnalisés ; types de travail (prix par jour / par unité / forfait) ;
 * paie avec période, samedi / dimanche comptés ou non, et absences.
 */
const V2_TO_V3 = `
  ALTER TABLE contacts ADD COLUMN type_label TEXT;
  CREATE TABLE contact_types (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE work_kinds (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('DAY','UNIT','FLAT')),
    unit_label TEXT,
    price INTEGER NOT NULL CHECK (price >= 0),
    created_at TEXT NOT NULL
  );

  -- days_worked = quantité (jours, unités, ou 1 pour un forfait) ; daily_rate = prix unitaire.
  ALTER TABLE payroll_entries ADD COLUMN work_kind_id TEXT;
  ALTER TABLE payroll_entries ADD COLUMN work_label TEXT;
  ALTER TABLE payroll_entries ADD COLUMN pricing_mode TEXT;
  ALTER TABLE payroll_entries ADD COLUMN unit_label TEXT;
  ALTER TABLE payroll_entries ADD COLUMN period_start TEXT;
  ALTER TABLE payroll_entries ADD COLUMN period_end TEXT;
  ALTER TABLE payroll_entries ADD COLUMN count_saturday INTEGER;
  ALTER TABLE payroll_entries ADD COLUMN count_sunday INTEGER;
  ALTER TABLE payroll_entries ADD COLUMN absences REAL;
`;

const DB_VERSION = 3;

export async function migrateDb(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= DB_VERSION) return;

  await db.withTransactionAsync(async () => {
    if (version === 0) {
      await db.execAsync(SCHEMA_SQL);
      version = 2;
    }
    if (version === 1) {
      await db.execAsync(V1_TO_V2);
      version = 2;
    }
    if (version === 2) await db.execAsync(V2_TO_V3);
    await db.execAsync(`PRAGMA user_version = ${DB_VERSION}`);
  });
}

/** Utilisés par les tests pour reproduire les migrations hors de l'app. */
export const MIGRATION_V1_TO_V2 = V1_TO_V2;
export const MIGRATION_V2_TO_V3 = V2_TO_V3;
