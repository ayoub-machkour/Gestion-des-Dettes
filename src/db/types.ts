export type ContactType = 'SUPPLIER' | 'CUSTOMER' | 'FAMILY_LENDER' | 'EMPLOYEE' | 'OTHER';
/** PAYABLE = je dois (rouge) ; RECEIVABLE = on me doit (vert). */
export type Direction = 'PAYABLE' | 'RECEIVABLE';
export type TransactionType = 'DEBT_ITEM' | 'CASH_LOAN' | 'EMPLOYEE_WAGE' | 'SALE_ON_CREDIT' | 'LOAN_GIVEN';
export type TransactionStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
export type InstrumentType = 'CASH' | 'BANK_CHECK' | 'BILL_OF_EXCHANGE' | 'PROMISSORY_NOTE';
export type InstrumentStatus = 'PENDING' | 'DEBITED_PAID' | 'CANCELLED';
export type WorkType = 'DAILY_WAGE' | 'GROUP_CONTRACT' | 'MONTHLY';
export type PayrollStatus = 'PENDING_PAYMENT' | 'PAID';
/** T = achat / crédit, P = paie ouvrier, I = paiement ou effet. */
export type EntityType = 'T' | 'P' | 'I';

export type ActivityAction =
  | 'CONTACT_ADDED'
  | 'CONTACT_EDITED'
  | 'CONTACT_DELETED'
  | 'CREDIT_ADDED'
  | 'PAYROLL_ADDED'
  | 'PAYMENT'
  | 'INSTRUMENT_ADDED'
  | 'INSTRUMENT_PAID'
  | 'INSTRUMENT_CANCELLED'
  | 'EDITED'
  | 'DELETED'
  | 'PHOTO_ADDED'
  | 'PHOTO_DELETED';

// Montants : entiers en centimes. Dates métier : 'YYYY-MM-DD'.

export interface Contact {
  id: string;
  name: string;
  type: ContactType;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

export interface ContactWithBalance extends Contact {
  /** Ce que je dois à ce contact (négatif = avance versée). */
  payable: number;
  /** Ce que ce contact me doit (négatif = avance reçue). */
  receivable: number;
  late_payable: number | null;
  late_receivable: number | null;
  last_activity: string | null;
}

export interface Transaction {
  id: string;
  contact_id: string;
  direction: Direction;
  transaction_type: TransactionType;
  description: string;
  total_amount: number;
  upfront_paid: number;
  paid_amount: number;
  status: TransactionStatus;
  transaction_date: string;
  due_date: string | null;
  created_at: string;
}

export interface TransactionItem {
  name: string;
  quantity: number;
  unit_price: number;
}

export interface PayrollEntry {
  id: string;
  contact_id: string;
  work_type: WorkType;
  days_worked: number;
  daily_rate: number;
  total_due: number;
  upfront_paid: number;
  paid_amount: number;
  work_date: string;
  status: PayrollStatus;
  created_at: string;
}

export interface Instrument {
  id: string;
  transaction_id: string | null;
  payroll_entry_id: string | null;
  contact_id: string;
  direction: Direction;
  instrument_type: InstrumentType;
  amount: number;
  issue_date: string;
  maturity_due_date: string;
  status: InstrumentStatus;
  reference_number: string | null;
  reminder_days_before: number;
  created_at: string;
}

export interface InstrumentWithContact extends Instrument {
  contact_name: string;
  photos: number;
}

export interface Attachment {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  file_name: string;
  created_at: string;
}

/** Ligne du grand livre : un achat / crédit (T) ou une paie (P). */
export interface LedgerRow {
  kind: 'T' | 'P';
  id: string;
  direction: Direction;
  d: string;
  label: string;
  sub: TransactionType | WorkType;
  total: number;
  paid: number;
  due: string | null;
  days: number | null;
  rate: number | null;
  photos: number;
}

/** Une ligne de la fiche d'une personne : achat/crédit, paie, paiement ou effet. */
export interface TimelineRow {
  kind: EntityType;
  id: string;
  d: string;
  title: string | null;
  sub: TransactionType | WorkType | InstrumentType;
  direction: Direction;
  amount: number;
  paid: number | null;
  due: string | null;
  status: TransactionStatus | PayrollStatus | InstrumentStatus;
  days: number | null;
  rate: number | null;
  photos: number;
}

export interface ActivityRow {
  id: string;
  created_at: string;
  action: ActivityAction;
  entity_type: EntityType | null;
  entity_id: string | null;
  contact_id: string | null;
  contact_name: string | null;
  direction: Direction | null;
  amount: number | null;
  details: string | null;
  photos: number;
  entity_exists: number;
}
