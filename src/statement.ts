import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Linking, Share } from 'react-native';
import type { ContactWithBalance, InstrumentWithContact, LedgerRow, TransactionType } from './db/types';
import type { Dict, Lang } from './i18n/dicts';
import { daysUntil, formatDate, today } from './utils/dates';
import { formatMoney } from './utils/money';
import { workDetail, workTitle } from './work';

interface StatementData {
  contact: ContactWithBalance;
  ledger: LedgerRow[];
  payments: InstrumentWithContact[];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function rowLabel(t: Dict, r: LedgerRow, lang: Lang): string {
  if (r.kind === 'T') return r.label || t.txTypes[r.sub as TransactionType];
  return `${workTitle(t, r)} (${workDetail(t, r, lang)})`;
}

/** 0612345678 -> 212612345678 (format international WhatsApp, Maroc par défaut). */
export function toWhatsAppNumber(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 10) digits = '212' + digits.slice(1);
  return digits;
}

function buildHtml({ contact, ledger, payments }: StatementData, t: Dict, lang: Lang): string {
  const money = (c: number) => formatMoney(c, lang);
  const section = (direction: 'PAYABLE' | 'RECEIVABLE') => {
    const rows = ledger.filter((r) => r.direction === direction);
    if (!rows.length) return '';
    const total = rows.reduce((a, r) => a + r.total, 0);
    const paid = rows.reduce((a, r) => a + r.paid, 0);
    return `
      <h2 class="${direction}">${direction === 'PAYABLE' ? t.iOweHim : t.heOwesMe}</h2>
      <table>
        <tr><th>${t.colDate}</th><th>${t.colDesc}</th><th>${t.colAmount}</th><th>${t.colPaid}</th><th>${t.colRest}</th></tr>
        ${rows
          .map((r) => {
            const rest = r.total - r.paid;
            const late = rest > 0 && r.due && daysUntil(r.due) < 0 ? ` <span class="late">${t.lateBy(-daysUntil(r.due))}</span>` : '';
            return `<tr><td>${formatDate(r.d)}</td><td>${esc(rowLabel(t, r, lang))}${late}</td><td>${money(r.total)}</td><td>${money(r.paid)}</td><td><b>${rest > 0 ? money(rest) : '✓'}</b></td></tr>`;
          })
          .join('')}
        <tr class="total"><td></td><td>${t.total}</td><td>${money(total)}</td><td>${money(paid)}</td><td>${money(total - paid)}</td></tr>
      </table>`;
  };
  const paymentRows = payments.filter((p) => p.status !== 'CANCELLED');
  return `<!doctype html><html dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"/>
    <style>
      body { font-family: sans-serif; color: #2B2116; padding: 24px; }
      h1 { color: #556B2F; margin: 0; } h2 { margin-top: 28px; } .PAYABLE { color: #B3261E; } .RECEIVABLE { color: #2E7D32; }
      .meta { color: #6E6150; margin: 4px 0 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { background: #F1E4D6; color: #7A4E2D; } th, td { border: 1px solid #D9CDB4; padding: 6px; text-align: start; }
      .total td { font-weight: bold; background: #FBF6EA; } .late { color: #B3261E; font-size: 11px; }
      .box { border: 2px solid #556B2F; border-radius: 10px; padding: 12px; margin-top: 12px; font-size: 16px; }
    </style></head><body>
    <h1>${t.statementTitle}</h1>
    <div class="meta">${esc(contact.name)}${contact.phone ? ' · ' + esc(contact.phone) : ''} — ${formatDate(today())}</div>
    <div class="box">
      ${contact.payable ? `<div class="PAYABLE">${t.iOweHim} : <b>${money(contact.payable)}</b></div>` : ''}
      ${contact.receivable ? `<div class="RECEIVABLE">${t.heOwesMe} : <b>${money(contact.receivable)}</b></div>` : ''}
    </div>
    ${section('PAYABLE')}
    ${section('RECEIVABLE')}
    ${
      paymentRows.length
        ? `<h2>${t.paymentsAndInstruments}</h2><table>
            <tr><th>${t.colDate}</th><th>${t.type}</th><th>${t.colAmount}</th><th>${t.status}</th></tr>
            ${paymentRows
              .map(
                (p) =>
                  `<tr><td>${formatDate(p.instrument_type === 'CASH' ? p.issue_date : p.maturity_due_date)}</td><td>${t.instrTypes[p.instrument_type]}${
                    p.reference_number ? ' n° ' + esc(p.reference_number) : ''
                  } · ${p.direction === 'PAYABLE' ? t.paidByMe : t.receivedByMe}</td><td>${money(p.amount)}</td><td>${t.instrStatus[p.status]}</td></tr>`,
              )
              .join('')}
          </table>`
        : ''
    }
    <p class="meta" style="margin-top:24px">AgriCompte / الفلاح</p>
  </body></html>`;
}

/** Génère le relevé PDF et ouvre le partage Android (WhatsApp, etc.). */
export async function shareStatementPdf(data: StatementData, t: Dict, lang: Lang) {
  const { uri } = await Print.printToFileAsync({ html: buildHtml(data, t, lang) });
  // Le PDF est copié dans le cache de l'app (seul dossier partageable partout, y compris Expo Go),
  // avec un nom lisible pour le destinataire.
  const safeName = data.contact.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'releve';
  const target = new File(Paths.cache, `${t.statementTitle.replace(/\s+/g, '-')}-${safeName}.pdf`);
  if (target.exists) target.delete();
  await new File(uri).copy(target);
  await Sharing.shareAsync(target.uri, { mimeType: 'application/pdf', dialogTitle: t.statementTitle, UTI: 'com.adobe.pdf' });
}

/** Résumé texte envoyé directement sur le WhatsApp du contact. */
export async function sendStatementWhatsApp({ contact, ledger }: StatementData, t: Dict, lang: Lang) {
  const money = (c: number) => formatMoney(c, lang);
  const lines = [`*${t.statementTitle}* — ${contact.name}`, formatDate(today()), ''];
  for (const r of ledger.filter((x) => x.total > x.paid)) {
    const late = r.due && daysUntil(r.due) < 0 ? ` (${t.lateBy(-daysUntil(r.due))})` : '';
    lines.push(`• ${formatDate(r.d)} ${rowLabel(t, r, lang)} : ${money(r.total - r.paid)}${late}`);
  }
  lines.push('');
  if (contact.payable > 0) lines.push(`${t.iOweHim} : *${money(contact.payable)}*`);
  if (contact.receivable > 0) lines.push(`${t.heOwesMe} : *${money(contact.receivable)}*`);
  const text = lines.join('\n');

  if (contact.phone) {
    const url = `https://wa.me/${toWhatsAppNumber(contact.phone)}?text=${encodeURIComponent(text)}`;
    try {
      await Linking.openURL(url);
      return;
    } catch {
      // WhatsApp absent : on retombe sur le partage standard.
    }
  }
  await Share.share({ message: text });
}
