import { NextResponse, type NextRequest } from "next/server";
import { getAdminProfile, isAuthenticated } from "@/lib/auth/session";
import { getBaseCurrency } from "@/lib/db/queries";
import { buildMonthlyStatement } from "@/lib/exports/statement-data";
import { buildStatementCsv } from "@/lib/exports/statement-csv";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const monthsBack = clampMonths(Number(url.searchParams.get("months") ?? "12"));
  const baseCurrency =
    url.searchParams.get("base") ?? (await getBaseCurrency());

  const profile = await getAdminProfile();
  const data = await buildMonthlyStatement({
    monthsBack,
    baseCurrency,
    ownerName: profile.name,
    ownerEmail: profile.email,
  });
  const csv = buildStatementCsv(data);

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `cairn-statement-${stamp}.csv`;
  return new NextResponse(csv, {
    headers: {
      // text/csv with utf-8 charset is the standard MIME — Excel +
      // Sheets + Numbers all open it cleanly. The leading `# ` lines
      // and `## SECTION` markers stay as plain cells in column A.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function clampMonths(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 12;
  return Math.max(1, Math.min(36, Math.floor(n)));
}
