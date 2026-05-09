import { NextResponse, type NextRequest } from "next/server";
import { isAuthenticated, getAdminProfile } from "@/lib/auth/session";
import { getBaseCurrency } from "@/lib/db/queries";
import { buildMonthlyStatement } from "@/lib/exports/statement-data";
import { buildStatementPdf } from "@/lib/exports/statement-pdf";

export const dynamic = "force-dynamic";
// react-pdf needs Node — disallow edge runtime explicitly.
export const runtime = "nodejs";

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
  const buffer = await buildStatementPdf(data);

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `cairn-statement-${stamp}.pdf`;
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  return new NextResponse(ab as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function clampMonths(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 12;
  return Math.max(1, Math.min(36, Math.floor(n)));
}
