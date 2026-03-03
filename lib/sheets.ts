import { GOOGLE_API_KEY, SHEETS_BASE_URL } from './config';

/**
 * Fetch all rows from a sheet tab, returning an array of objects
 * keyed by the header row.
 */
export async function fetchSheet<T extends Record<string, string>>(
  tabName: string,
): Promise<T[]> {
  const url = `${SHEETS_BASE_URL}/values/${encodeURIComponent(tabName)}?key=${GOOGLE_API_KEY}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Sheets API error: ${res.status}`);

  const data = await res.json();
  const rows: string[][] = data.values || [];
  if (rows.length < 2) return [];

  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj as T;
  });
}

/**
 * Append rows to a sheet tab.
 * `columns` defines the column order matching the sheet header.
 */
export async function appendRows(
  tabName: string,
  rows: Record<string, string | number | null>[],
  columns: string[],
): Promise<void> {
  const url = `${SHEETS_BASE_URL}/values/${encodeURIComponent(tabName)}:append?valueInputOption=RAW&key=${GOOGLE_API_KEY}`;
  const values = rows.map((row) => columns.map((col) => row[col] ?? ''));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets API append error: ${res.status}`);
}

/**
 * Update a specific row range in a sheet tab.
 */
export async function updateRow(
  tabName: string,
  rowIndex: number,
  row: Record<string, string | number | null>,
  columns: string[],
): Promise<void> {
  const range = `${tabName}!A${rowIndex + 2}`;  // +2: header is row 1, data starts row 2
  const url = `${SHEETS_BASE_URL}/values/${encodeURIComponent(range)}?valueInputOption=RAW&key=${GOOGLE_API_KEY}`;
  const values = [columns.map((col) => row[col] ?? '')];
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets API update error: ${res.status}`);
}
