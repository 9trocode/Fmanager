import { NextResponse, type NextRequest } from "next/server";
import {
  getActiveTenantId,
  getAdminProfile,
  isAuthenticated,
} from "@/lib/auth/session";
import { withTenant } from "@/lib/db";
import { getBaseCurrency } from "@/lib/db/queries";
import { buildMonthlyStatement } from "@/lib/exports/statement-data";
import { buildStatementWorkbook } from "@/lib/exports/statement-excel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenantId = await getActiveTenantId();
  return withTenant(tenantId, () => buildResponse(req));
}

async function buildResponse(req: NextRequest): Promise<NextResponse> {
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
  const buffer = await buildStatementWorkbook(data);

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `cairn-statement-${stamp}.xlsx`;
  // ArrayBuffer for the body so Next handles bytes correctly.
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  return new NextResponse(ab as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function clampMonths(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 12;
  return Math.max(1, Math.min(36, Math.floor(n)));
}
