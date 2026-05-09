/**
 * Minimal RFC-4180-ish CSV parser. Handles quoted fields, escaped quotes,
 * CRLF/LF endings. No streaming — we expect inputs of a few MB at most.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(cur);
        cur = "";
      } else if (c === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else if (c === "\r") {
        // ignore — CRLF handled by \n branch above
      } else {
        cur += c;
      }
    }
  }
  if (cur !== "" || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export const TRANSACTION_CSV_TEMPLATE = `date,account,amount,currency,category,kind,notes
2026-05-04,Mercury USD checking,250.00,USD,Personal,expense,Groceries
2026-05-03,GTBank naira savings,150000,NGN,Family,expense,Lagos rent partial
2026-05-01,Mercury USD checking,6500,USD,Salary,income,Salary draw
`;
