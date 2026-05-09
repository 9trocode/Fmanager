import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth/session";
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import { SUGGESTED_EXPENSE_CATEGORIES } from "@/lib/flows";
import { buildAdvisorClient } from "@/lib/ai/provider";

export const runtime = "nodejs";

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

  let client;
  try {
    client = await buildAdvisorClient();
  } catch (err) {
    return new NextResponse(
      err instanceof Error ? err.message : "Advisor not configured.",
      { status: 400 },
    );
  }

  const promptText = [
    "You are extracting structured fields from a photo of a receipt.",
    "Return null for any field you can't read with reasonable confidence.",
    `Currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}.`,
    "The user is logging a personal/business expense. Choose a category from this list when possible:",
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
      model: client.model,
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
