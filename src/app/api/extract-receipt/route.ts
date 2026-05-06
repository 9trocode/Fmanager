import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth/session";
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import { SUGGESTED_EXPENSE_CATEGORIES } from "@/lib/flows";

export const runtime = "nodejs";

async function getApiKey(): Promise<string | null> {
  const row = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "anthropic_api_key"))
    .limit(1);
  return row[0]?.value || process.env.ANTHROPIC_API_KEY || null;
}

async function getModelId(): Promise<string> {
  const row = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "advisor_model"))
    .limit(1);
  return row[0]?.value || "claude-sonnet-4-6";
}

const ReceiptSchema = z.object({
  vendor: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z
    .enum([...SUPPORTED_CURRENCIES] as [string, ...string[]])
    .nullable(),
  // ISO YYYY-MM-DD if visible, else null.
  occurredAt: z.string().nullable(),
  suggestedCategory: z.string().nullable(),
  notes: z.string().nullable(),
  confidence: z.enum(["low", "medium", "high"]),
});

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    return new NextResponse(
      "No Anthropic API key configured. Add one in Settings → Advisor or set ANTHROPIC_API_KEY.",
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    imageBase64?: string;
    mimeType?: string;
  } | null;

  const imageBase64 = body?.imageBase64;
  const mimeType = body?.mimeType ?? "image/jpeg";

  if (!imageBase64 || typeof imageBase64 !== "string") {
    return new NextResponse("imageBase64 required", { status: 400 });
  }
  if (!mimeType.startsWith("image/")) {
    return new NextResponse("mimeType must be an image/* type", {
      status: 400,
    });
  }

  const anthropic = createAnthropic({ apiKey });
  const modelId = await getModelId();

  const promptText = [
    "You are extracting structured fields from a photo of a receipt.",
    "Return null for any field you can't read with reasonable confidence.",
    `Currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}.`,
    "The user is a founder logging a personal/business expense. Choose a category from this list when possible:",
    SUGGESTED_EXPENSE_CATEGORIES.join(", "),
    "If no listed category fits, propose a short one of your own.",
    "occurredAt must be a valid ISO date in YYYY-MM-DD format if visible on the receipt; otherwise null.",
    "amount is the final total the customer paid (after tax/tip), as a positive number with no currency symbol.",
    "notes can include line items, subtotal, tip, payment method — anything worth keeping. Keep notes under 200 characters.",
    "Set confidence honestly: 'high' only if the total and vendor are unambiguous.",
  ].join(" ");

  try {
    const buffer = Buffer.from(imageBase64, "base64");
    const { output } = await generateText({
      model: anthropic(modelId),
      output: Output.object({ schema: ReceiptSchema }),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            {
              type: "file",
              data: buffer,
              mediaType: mimeType,
            },
          ],
        },
      ],
    });
    return NextResponse.json(output);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Receipt extraction failed.";
    return new NextResponse(message, { status: 502 });
  }
}
