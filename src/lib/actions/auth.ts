"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createSession,
  isAdminConfigured,
  setupAdminAccount,
  verifyCredentials,
} from "@/lib/auth/session";

export async function signupAdmin(formData: FormData) {
  if (await isAdminConfigured()) {
    redirect("/login?error=already_setup");
  }
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const next = String(formData.get("next") ?? "/welcome?step=1");

  if (password !== confirm) {
    redirect("/welcome?step=0&error=mismatch");
  }
  try {
    await setupAdminAccount({ email, name, password });
  } catch (e) {
    const code = e instanceof Error && e.message.includes("email")
      ? "email"
      : "weak";
    redirect(`/welcome?step=0&error=${code}`);
  }
  await createSession("admin");
  revalidatePath("/", "layout");
  redirect(next || "/welcome?step=1");
}

export async function loginWithCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  // If no admin is configured yet, the legitimate next step is signup.
  if (!(await isAdminConfigured())) {
    redirect("/welcome?step=0");
  }

  const result = await verifyCredentials({ email, password });
  if (!result) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  await createSession(result.role, result.userId);
  redirect(next || "/dashboard");
}
