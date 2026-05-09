"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import {
  assertAdmin,
  createSession,
  getCurrentUser,
} from "@/lib/auth/session";
import { hostDb, schema } from "@/lib/db";
import {
  createInvite,
  createUser,
  deleteUserById,
  findUsableInvite,
  markInviteUsed,
  revokeInvite,
} from "@/lib/db/users";
import type { DataScope, UserRole } from "@/lib/db/schema";

const VALID_ROLES: readonly UserRole[] = ["admin", "viewer"];
const VALID_SCOPES: readonly DataScope[] = ["shared", "isolated"];

function parseRole(raw: FormDataEntryValue | null): UserRole {
  return VALID_ROLES.includes(raw as UserRole) ? (raw as UserRole) : "viewer";
}

function parseScope(raw: FormDataEntryValue | null): DataScope {
  return VALID_SCOPES.includes(raw as DataScope)
    ? (raw as DataScope)
    : "shared";
}

/**
 * Member management is host-only. Isolated-scope users are admins
 * within their own silo but they don't get to mint invites for the
 * host's instance — only the original settings-admin does.
 */
async function assertHost(): Promise<void> {
  await assertAdmin();
  const user = await getCurrentUser();
  // The settings-admin (no user row) AND any user-row admin in shared
  // scope can manage the host's invites/members. Isolated users cannot.
  if (user && user.dataScope === "isolated") {
    throw new Error("Host-only — only the instance owner can manage members.");
  }
}

async function getRegistrationMode(): Promise<string> {
  const row = await hostDb
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "registration_mode"))
    .limit(1);
  return row[0]?.value ?? "closed";
}

async function setRegistrationModeValue(mode: string | null) {
  if (mode == null || mode === "") {
    await hostDb
      .delete(schema.settings)
      .where(eq(schema.settings.key, "registration_mode"));
    return;
  }
  await hostDb
    .insert(schema.settings)
    .values({ key: "registration_mode", value: mode })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: mode, updatedAt: new Date().toISOString() },
    });
}

export async function setRegistrationMode(formData: FormData) {
  await assertHost();
  const mode = String(formData.get("mode") ?? "closed");
  // Accept exactly the three known states; anything else is treated as closed.
  if (mode === "invite" || mode === "open") {
    await setRegistrationModeValue(mode);
  } else {
    await setRegistrationModeValue(null);
  }
  revalidatePath("/settings");
}

export async function createInviteAction(formData: FormData) {
  await assertHost();
  const role = parseRole(formData.get("role"));
  const scope = parseScope(formData.get("data_scope"));
  const emailRaw = String(formData.get("email") ?? "").trim();
  const expiresStr = String(formData.get("expires_hours") ?? "");
  const expiresInHours = expiresStr ? Number(expiresStr) : null;
  await createInvite({
    email: emailRaw || null,
    role,
    dataScope: scope,
    expiresInHours:
      expiresInHours && Number.isFinite(expiresInHours) && expiresInHours > 0
        ? expiresInHours
        : null,
  });
  revalidatePath("/settings");
}

export async function revokeInviteAction(formData: FormData) {
  await assertHost();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  await revokeInvite(id);
  revalidatePath("/settings");
}

export async function removeMember(formData: FormData) {
  await assertHost();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  await deleteUserById(id);
  revalidatePath("/settings");
}

/**
 * Public registration. Path depends on `registration_mode`:
 *  - "invite": code required, must match an unused/unexpired row.
 *              Role + data scope come from the invite the host minted.
 *  - "open":   no code; new account is isolated-scope admin of its
 *              own private workspace. Routed through the onboarding
 *              flow so they set up their own accounts.
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

  const mode = await getRegistrationMode();
  if (mode !== "invite" && mode !== "open") {
    redirect("/login?error=registration_closed");
  }

  let inviteId: number | null = null;
  // Open registration ALWAYS produces an isolated tenant — the new user
  // gets their own data silo and is admin within it. Invites carry the
  // scope the host chose at mint time (defaults to "shared" so family
  // members keep sharing the host's data).
  let role: UserRole = "admin";
  let dataScope: DataScope = "isolated";

  if (mode === "invite") {
    const invite = await findUsableInvite(code);
    if (!invite) {
      redirect("/register?error=invalid_code");
    }
    if (invite.email && invite.email !== email) {
      redirect("/register?error=email_mismatch");
    }
    inviteId = invite.id;
    role = invite.role;
    dataScope = invite.dataScope;
  }

  let user;
  try {
    user = await createUser({ email, name, password, role, dataScope });
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

  // Isolated tenants (open registration + isolated-scope invites)
  // start with an empty workspace — route them through the welcome
  // flow so they set their own base currency, optional AI key, and
  // first account. Shared-scope users (family / partners) are
  // joining the host's already-set-up data; skip onboarding and
  // drop them on the dashboard.
  if (dataScope === "isolated") {
    redirect("/welcome?step=1");
  }
  redirect("/dashboard");
}
