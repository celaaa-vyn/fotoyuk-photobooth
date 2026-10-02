/**
 * CSV utilities for exporting the transaction history from the admin panel.
 * Produces an RFC-4180-ish CSV string and triggers a browser download, with no
 * server round-trip (everything stays client-side / in localStorage).
 */
import type { Transaction } from '../types';

/** Columns exported, in order. */
const HEADERS = [
  'id',
  'createdAt',
  'email',
  'price',
  'frameId',
  'emailStatus',
  'attempts',
] as const;

/** Escape a single CSV field: wrap in quotes and double any inner quotes. */
function escapeField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  // Always quote to be safe with commas, quotes, and newlines.
  return `"${s.replace(/"/g, '""')}"`;
}

/** Serialize transactions into a CSV string (ISO timestamps for readability). */
export function transactionsToCsv(transactions: Transaction[]): string {
  const headerRow = HEADERS.map(escapeField).join(',');
  const rows = transactions.map((t) =>
    [
      escapeField(t.id),
      escapeField(new Date(t.createdAt).toISOString()),
      escapeField(t.email),
      escapeField(t.price),
      escapeField(t.frameId),
      escapeField(t.emailStatus),
      escapeField(t.attempts),
    ].join(','),
  );
  // Leading BOM so Excel opens UTF-8 correctly; CRLF line endings per RFC 4180.
  return '\uFEFF' + [headerRow, ...rows].join('\r\n');
}

/** Build a timestamped default filename like "transaksi-2024-01-31.csv". */
export function defaultCsvFilename(now: Date = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `transaksi-${date}.csv`;
}

/**
 * Trigger a browser download of the given transactions as a CSV file. Uses an
 * object URL + temporary anchor; cleans up afterwards.
 */
export function downloadTransactionsCsv(
  transactions: Transaction[],
  filename: string = defaultCsvFilename(),
): void {
  const csv = transactionsToCsv(transactions);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default downloadTransactionsCsv;
