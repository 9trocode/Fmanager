"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertAdmin, createSession } from "@/lib/auth/session";
import { getSetting, setSetting } from "@/lib/db/queries";
import {
  createInvite,
  createUser,
  deleteUserById,
  findUsableInvite,
  markInviteUsed,
  revokeInvite,
} from "@/lib/db/users";
import type { UserRole } from "@/lib/db/schema";

const VALID_ROLES: readonly UserRole[] = ["admin", "viewer"];

function parseRole(raw: FormDataEntryValue | null): UserRole {
  return VALID_ROLES.includes(raw as UserRole) ? (raw as UserRole) : "viewer";
}

export async function setRegistrationMode(formData: FormData) {
  await assertAdmin();
  const mode = String(formData.get("mode") ?? "closed");
  // Accept exactly the three known states; anything else is treated as closed.
  if (mode === "invite" || mode === "open") {
    await setSetting("registration_mode", mode);
  } else {
    await setSetting("registration_mode", null);
  }
  revalidatePath("/settings");
}

export async function createInviteAction(formData: FormData) {
  await assertAdmin();
  const role = parseRole(formData.get("role"));
  const emailRaw = String(formData.get("email") ?? "").trim();
  const expiresStr = String(formData.get("expires_hours") ?? "");
  const expiresInHours = expiresStr ? Number(expiresStr) : null;
  await createInvite({
    email: emailRaw || null,
    role,
    expiresInHours:
      expiresInHours && Number.isFinite(expiresInHours) && expiresInHours > 0
        ? expiresInHours
        : null,
  });
  revalidatePath("/settings");
}

export async function revokeInviteAction(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  await revokeInvite(id);
  revalidatePath("/settings");
}

export async function removeMember(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  await deleteUserById(id);
  revalidatePath("/settings");
}

/**
 * Public registration. Path depends on `registration_mode`:
 *  - "invite": code required, must match an unused/unexpired row
 *  - "open":   no code; role defaults to viewer
 *  - else:     redirects back to /login (registration closed)
 */
export async function registerWithCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  if (password !== confirm) {
    redirect("/register?error=mismatch");
  }
  if (!email || !email.includes("@")) {
    redirect("/register?error=email");
  }
  if (password.length < 8) {
    redirect("/register?error=weak");
  }

  const mode = (await getSetting("registration_mode")) ?? "closed";
  if (mode !== "invite" && mode !== "open") {
    redirect("/login?error=registration_closed");
  }

  let inviteId: number | null = null;
  let role: UserRole = "viewer";

  if (mode === "invite") {
    const invite = await findUsableInvite(code);
    if (!invite) {
      redirect("/register?error=invalid_code");
    }
    // If the invite was scoped to a specific email, enforce it.
    if (invite.email && invite.email !== email) {
      redirect("/register?error=email_mismatch");
    }
    inviteId = invite.id;
    role = invite.role;
  }

  let user;
  try {
    user = await createUser({ email, name, password, role });
  } catch (e) {
    const code =
      e instanceof Error && e.message.includes("exists")
        ? "exists"
        : e instanceof Error && e.message.includes("email")
          ? "email"
          : "weak";
    redirect(`/register?error=${code}`);
  }

  if (inviteId != null) {
    await markInviteUsed(inviteId, user.id);
  }
  await createSession(role, user.id);
  redirect("/dashboard");
}
