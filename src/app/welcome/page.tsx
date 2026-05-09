import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Coins,
  Globe2,
  Lock,
  Receipt,
  ShieldCheck,
  Sparkles,
  Sprout,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";

// Reads admin/auth state from DB + cookies on every request.
export const dynamic = "force-dynamic";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoneyInput } from "@/components/app/money-input";
import { CairnMark } from "@/components/app/cairn-mark";
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER } from "@/lib/account-types";
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import {
  welcomeAdvisorKey,
  welcomeFirstAccount,
  welcomeSetup,
  completeOnboarding,
  welcomeSeedAndComplete,
} from "@/lib/actions/onboarding";
import { signupAdmin } from "@/lib/actions/auth";
import { getBaseCurrency } from "@/lib/db/queries";
import {
  getAdminProfile,
  isAdminConfigured,
  isAuthenticated,
} from "@/lib/auth/session";

const TOTAL_STEPS = 5;

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; error?: string }>;
}) {
  const params = await searchParams;
  const requestedStep = Number(params.step ?? 1);
  const error = params.error ?? null;

  const adminExists = await isAdminConfigured();
  const authed = await isAuthenticated();

  // Force the setup step if there is no admin yet OR the user explicitly asked
  // for step=0. Once admin exists, /welcome?step=0 falls back to step 1.
  const showSetup =
    !adminExists || (requestedStep === 0 && !authed);

  if (showSetup) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header step={0} />
        <main className="flex-1 flex items-start justify-center px-6 py-12 md:py-16">
          <div className="w-full max-w-2xl">
            <Step0Setup error={error} />
          </div>
        </main>
      </div>
    );
  }

  // After admin exists, /welcome requires a session.
  if (adminExists && !authed) {
    redirect("/login?next=/welcome");
  }

  const step = Math.max(1, Math.min(TOTAL_STEPS, requestedStep || 1));

  return (
    <div className="min-h-screen flex flex-col">
      <Header step={step} />
      <main className="flex-1 flex items-start justify-center px-6 py-12 md:py-16">
        <div className="w-full max-w-2xl">
          {step === 1 ? <Step1 /> : null}
          {step === 2 ? <Step2 error={error} /> : null}
          {step === 3 ? <Step3 /> : null}
          {step === 4 ? <Step4 error={error} /> : null}
          {step === 5 ? <Step5 /> : null}
        </div>
      </main>
    </div>
  );
}

async function Step0Setup({ error }: { error: string | null }) {
  const profile = await getAdminProfile();
  return (
    <div className="space-y-8">
      <div className="space-y-3 text-center">
        <Badge variant="outline" className="font-mono text-[10px] gap-1.5">
          <Lock className="size-3" /> 00 — create your account
        </Badge>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
          First, secure this instance.
        </h1>
        <p className="text-muted-foreground text-balance leading-relaxed max-w-xl mx-auto">
          Your data lives in a SQLite file on your own box. The credentials you
          set here are how you (and only you) sign in afterward. Use a real
          password — there&apos;s no &ldquo;forgot password&rdquo; flow.
        </p>
      </div>

      <form action={signupAdmin} className="space-y-6">
        <input type="hidden" name="next" value="/welcome?step=1" />
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={profile.email ?? ""}
                placeholder="you@example.com"
                autoComplete="email"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name (optional)</Label>
              <Input
                id="name"
                name="name"
                defaultValue={profile.name ?? ""}
                placeholder="What should we call you?"
                autoComplete="name"
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          {error === "mismatch" ? (
            <p className="text-xs text-destructive">
              Passwords didn&apos;t match.
            </p>
          ) : null}
          {error === "weak" ? (
            <p className="text-xs text-destructive">
              Password must be at least 8 characters.
            </p>
          ) : null}
          {error === "email" ? (
            <p className="text-xs text-destructive">
              Enter a valid email.
            </p>
          ) : null}
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Stored as a salted scrypt hash in your local SQLite. Anyone with
            disk access can&apos;t recover your password — and neither can we.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost">
            <Link href="/">
              <ArrowLeft className="size-4" /> Back to landing
            </Link>
          </Button>
          <SubmitButton size="lg" loadingText="Creating…">
            Create account <ArrowRight className="size-4" />
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}

function Header({ step }: { step: number }) {
  const total = step === 0 ? TOTAL_STEPS + 1 : TOTAL_STEPS;
  const current = step === 0 ? 1 : step + 1; // step 0 is "step 1 of 6"
  return (
    <header className="border-b border-border/60">
      <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="size-8 rounded-md bg-primary text-primary-foreground grid place-items-center">
            <CairnMark size={18} bare className="text-primary-foreground" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">
              Cairn
            </div>
            <div className="text-[10px] text-muted-foreground">
              welcome aboard
            </div>
          </div>
        </Link>
        <div className="flex-1 max-w-xs">
          <Progress current={current} total={total} />
        </div>
        <div className="text-xs font-mono text-muted-foreground tabular-nums hidden sm:block">
          step {current}/{total}
        </div>
      </div>
    </header>
  );
}

function Progress({ current, total }: { current: number; total: number }) {
  const pct = (current / total) * 100;
  return (
    <div className="space-y-1.5">
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StepShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-8">
      <div className="space-y-3 text-center">
        <Badge variant="outline" className="font-mono text-[10px]">
          {eyebrow}
        </Badge>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        <p className="text-muted-foreground text-balance leading-relaxed max-w-xl mx-auto">
          {subtitle}
        </p>
      </div>
      <div>{children}</div>
    </div>
  );
}

function Step1() {
  const promises = [
    {
      icon: Globe2,
      title: "Multi-currency, honest",
      body: "NGN, USD, EUR, GBP, and more — first-class. Your balance sheet stops being a single-currency lie.",
    },
    {
      icon: Coins,
      title: "Equity in three scenarios",
      body: "Floor (zero), Liquid (today's value), Expected (target exit) — vesting and tax baked in.",
    },
    {
      icon: Sparkles,
      title: "An AI advisor that knows you",
      body: "Anchored on your decisions, accounts, runway, and goals. Not a generic chatbot.",
    },
  ];
  return (
    <StepShell
      eyebrow="01 — welcome"
      title="Three minutes from here to your honest balance sheet."
      subtitle="Cairn is your personal finance command center — every account, transaction, budget, savings goal, and grant in one place. Built for your personal economy, not just your job."
    >
      <div className="space-y-3 mt-2">
        {promises.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="flex items-start gap-4 rounded-xl border border-border bg-card p-5"
          >
            <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
              <Icon className="size-5" />
            </div>
            <div className="space-y-1">
              <div className="font-medium">{title}</div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {body}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3">
        <form action={welcomeSeedAndComplete} className="flex-1">
          <SubmitButton
            variant="outline"
            className="w-full"
            size="lg"
            loadingText="Seeding demo…"
          >
            <Sprout className="size-4" /> Just give me a demo
          </SubmitButton>
        </form>
        <Button asChild size="lg" className="flex-1">
          <Link href="/welcome?step=2">
            Walk me through setup <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground text-center mt-3 leading-relaxed">
        The demo seeds a realistic sample dataset (multi-currency accounts,
        equity grants, budgets, transactions) so you can explore before
        entering your real numbers. You can wipe it any time from
        Settings → Admin.
      </p>
    </StepShell>
  );
}

async function Step2({ error }: { error: string | null }) {
  const current = await getBaseCurrency();
  return (
    <StepShell
      eyebrow="02 — base currency"
      title="What currency do you think in?"
      subtitle="This is the currency every total, projection, and runway number is reported in. You can switch it any time later."
    >
      <form action={welcomeSetup} className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="base_currency" className="text-base">
              Base currency
            </Label>
            <Select name="base_currency" defaultValue={current}>
              <SelectTrigger id="base_currency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              FX rates will refresh automatically right after this. Free
              provider, cached locally.
            </p>
          </div>
          {error === "currency" ? (
            <p className="text-xs text-destructive">
              Pick a supported currency.
            </p>
          ) : null}
        </div>

        <StepNav backHref="/welcome?step=1" submitLabel="Continue" />
      </form>
    </StepShell>
  );
}

function Step3() {
  return (
    <StepShell
      eyebrow="03 — advisor (optional)"
      title="Add your Anthropic key for the AI advisor."
      subtitle="Skip this — the advisor + receipt scan + voice input are all optional. You can paste a key later in Settings → Advisor at any time."
    >
      <form action={welcomeAdvisorKey} className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="anthropic_api_key" className="text-base">
              Anthropic API key
            </Label>
            <Input
              id="anthropic_api_key"
              name="anthropic_api_key"
              type="password"
              placeholder="sk-ant-…"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Stored in your local SQLite. Sent only to Anthropic when the
              advisor / scan / voice runs. Never relayed elsewhere.
            </p>
          </div>
          <div className="flex items-start gap-2.5 rounded-md bg-secondary/50 p-3 text-xs leading-relaxed">
            <Sparkles className="size-3.5 text-primary mt-0.5 shrink-0" />
            <span>
              <span className="text-foreground font-medium">
                What it unlocks:
              </span>{" "}
              decision-aware advisor chat, photo-a-receipt parsing, voice-to-
              transaction. Cost is yours (BYO key).
            </span>
          </div>
        </div>

        <StepNav
          backHref="/welcome?step=2"
          submitLabel="Continue"
          submitVariant="default"
          extraButton={
            <Button asChild variant="outline">
              <Link href="/welcome?step=4">Skip</Link>
            </Button>
          }
        />
      </form>
    </StepShell>
  );
}

function Step4({ error }: { error: string | null }) {
  return (
    <StepShell
      eyebrow="04 — first account"
      title="Add your first account."
      subtitle="Cash, brokerage, crypto, real estate — anything. Just one to start; the dashboard lights up immediately. You can bulk-import the rest later."
    >
      <form action={welcomeFirstAccount} className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="Mercury USD checking"
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="type">Type</Label>
              <Select name="type" defaultValue="cash">
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPE_ORDER.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ACCOUNT_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Select name="currency" defaultValue="USD">
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="institution">Institution (optional)</Label>
            <Input
              id="institution"
              name="institution"
              placeholder="Mercury, Wise, GTBank, …"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="opening_balance">Current balance</Label>
            <MoneyInput
              id="opening_balance"
              name="opening_balance"
              defaultValue={0}
              allowNegative
              required
            />
            <p className="text-[11px] text-muted-foreground">
              We&apos;ll record this as today&apos;s opening snapshot.
            </p>
          </div>
          {error === "name" ? (
            <p className="text-xs text-destructive">Name is required.</p>
          ) : null}
        </div>

        <StepNav
          backHref="/welcome?step=3"
          submitLabel="Add account"
          extraButton={
            <Button asChild variant="outline">
              <Link href="/welcome?step=5">Skip — I&apos;ll add later</Link>
            </Button>
          }
        />
      </form>
    </StepShell>
  );
}

function Step5() {
  const next = [
    {
      icon: Receipt,
      title: "Log a few transactions",
      body: "Manual, photo a receipt, or speak it. Lights up budgets and runway.",
      href: "/transactions",
    },
    {
      icon: Wallet,
      title: "Add the rest of your accounts",
      body: "Or restore a JSON backup in Settings → Migrate &amp; import.",
      href: "/accounts",
    },
    {
      icon: TrendingUp,
      title: "Add an equity grant",
      body: "Strike, FMV, exit, vesting curve — the three scenarios materialize.",
      href: "/equity",
    },
    {
      icon: ShieldCheck,
      title: "Seed your three decisions",
      body: "Settings → Decisions. The advisor anchors on these.",
      href: "/settings",
    },
  ];

  return (
    <StepShell
      eyebrow="05 — ready"
      title="You're set up. Time to see your balance sheet."
      subtitle="Here's where you might want to head next. Skip any of it — you can come back any time."
    >
      <div className="grid sm:grid-cols-2 gap-3 mb-8">
        {next.map(({ icon: Icon, title, body, href }) => (
          <Link
            key={title}
            href={href}
            className="rounded-xl border border-border bg-card p-5 hover:border-foreground/30 hover:bg-card/80 transition-colors group"
          >
            <div className="flex items-start gap-3">
              <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                <Icon className="size-4" />
              </div>
              <div className="space-y-1 min-w-0">
                <div className="font-medium flex items-center gap-1.5">
                  {title}
                  <ArrowRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {body}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <form action={completeOnboarding}>
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost">
            <Link href="/welcome?step=4">
              <ArrowLeft className="size-4" /> Back
            </Link>
          </Button>
          <SubmitButton size="lg" loadingText="Finishing…">
            <CheckCircle2 className="size-4" /> Open dashboard
          </SubmitButton>
        </div>
      </form>
    </StepShell>
  );
}

function StepNav({
  backHref,
  submitLabel,
  submitVariant = "default",
  extraButton,
}: {
  backHref: string;
  submitLabel: string;
  submitVariant?: "default";
  extraButton?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Button asChild variant="ghost">
        <Link href={backHref}>
          <ArrowLeft className="size-4" /> Back
        </Link>
      </Button>
      <div className="flex items-center gap-2">
        {extraButton}
        <SubmitButton size="lg" variant={submitVariant} loadingText="Saving…">
          {submitLabel} <ArrowRight className="size-4" />
        </SubmitButton>
      </div>
    </div>
  );
}
