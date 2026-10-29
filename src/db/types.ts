export type ContactType = 'SUPPLIER' | 'FAMILY_LENDER' | 'EMPLOYEE' | 'OTHER';
export type TransactionType = 'DEBT_ITEM' | 'CASH_LOAN' | 'EMPLOYEE_WAGE';
export type TransactionStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
export type InstrumentType = 'CASH' | 'BANK_CHECK' | 'BILL_OF_EXCHANGE' | 'PROMISSORY_NOTE';
export type InstrumentStatus = 'PENDING' | 'DEBITED_PAID' | 'CANCELLED';
export type WorkType = 'DAILY_WAGE' | 'GROUP_CONTRACT' | 'MONTHLY';
export type PayrollStatus = 'PENDING_PAYMENT' | 'PAID';

// Tous les montants sont des entiers en centimes (santimat).
// Toutes les dates métier sont des chaînes 'YYYY-MM-DD'.

export interface Contact {
  id: string;
  name: string;
  type: ContactType;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

export interface ContactWithBalance extends Contact {
  balance: number;
}

export interface Transaction {
  id: string;
  contact_id: string;
  transaction_type: TransactionType;
  description: string;
  total_amount: number;
  paid_amount: number;
  status: TransactionStatus;
  transaction_date: string;
  due_date: string | null;
}

export interface Instrument {
  id: string;
  transaction_id: string | null;
  contact_id: string;
  instrument_type: InstrumentType;
  amount: number;
  issue_date: string;
  maturity_due_date: string;
  status: InstrumentStatus;
  reference_number: string | null;
  reminder_days_before: number;
  notification_ids: string | null;
}

export interface InstrumentWithContact extends Instrument {
  contact_name: string;
}

export interface PayrollEntry {
  id: string;
  contact_id: string;
  work_type: WorkType;
  days_worked: number;
  daily_rate: number;
  total_due: number;
  paid_amount: number;
  work_date: string;
  status: PayrollStatus;
}

/** Ligne du grand livre : une dette (T) ou une paie (P). */
export interface LedgerRow {
  kind: 'T' | 'P';
  id: string;
  d: string;
  label: string;
  sub: TransactionType | WorkType;
  total: number;
  paid: number;
  days: number | null;
  rate: number | null;
}

export interface DashboardData {
  totalDebt: number;
  pendingWages: number;
  dueSoonCount: number;
  overdueCount: number;
  dueSoonAmount: number;
  upcoming: InstrumentWithContact[];
}
