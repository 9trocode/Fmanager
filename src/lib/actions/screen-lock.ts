"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import {
  getSetting,
  setSetting,
} from "@/lib/db/queries";
import {
  assertAdmin,
  verifyPasswordHash,
} from "@/lib/auth/session";

/**
 * Verifies the supplied password against the stored admin hash.
 * Used to unlock the in-app screen lock without going through the
 * full login flow (which would destroy + recreate the session).
 *
 * The session itself stays valid throughout — the lock is purely a
 * UX-side defensive layer that hides the rendered content while the
 * user is away. We don't want a wrong unlock attempt to log them out.
 */
export async function verifyAdminPassword(
  password: string,
): Promise<{ ok: boolean }> {
  // Don't gate this on assertAdmin — a viewer can also have a
  // session, and they may want to lock/unlock too. Just compare
  // against whichever admin hash is on file.
  const hash = await getSetting("admin_password_hash");
  if (!hash) return { ok: false };
  if (!password || password.length < 4) return { ok: false };
  try {
    const ok = await verifyPasswordHash(password, hash);
    return { ok };
  } catch {
    return { ok: false };
  }
}

export async function setScreenLockTimeout(minutes: number): Promise<void> {
  await assertAdmin();
  const safe = Math.max(0, Math.min(720, Math.round(minutes)));
  await setSetting("screen_lock_timeout_minutes", String(safe));
  revalidatePath("/", "layout");
}

export async function setPanicRedirectUrl(url: string): Promise<void> {
  await assertAdmin();
  // Only persist if the URL parses; otherwise null it out so the
  // client falls back to /login.
  const trimmed = url.trim();
  if (!trimmed) {
    await setSetting("panic_redirect_url", null);
    revalidatePath("/", "layout");
    return;
  }
  try {
    // Allow either absolute URL or a same-origin path.
    if (trimmed.startsWith("/")) {
      // OK — internal path.
    } else {
      new URL(trimmed);
    }
  } catch {
    throw new Error("Invalid URL.");
  }
  await setSetting("panic_redirect_url", trimmed);
  revalidatePath("/", "layout");
}
