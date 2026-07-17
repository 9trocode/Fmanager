import { DebtManager, type DebtPlanView } from "@/components/app/debt-manager";
import { HeroBackground } from "@/components/app/hero-background";
import { PageHeader } from "@/components/app/page-header";
import { computeCashRunway, computeMonthlyCashFlow } from "@/lib/aggregation";
import {
  calculateDebtProjection,
  debtPaymentForMonth,
} from "@/lib/debt-calculations";
import { localToday } from "@/lib/dates";
import {
  getBaseCurrency,
  listAccountsWithEffective,
  listDebtPayments,
  listDebtPlans,
} from "@/lib/db/queries";
import { prefetchRates } from "@/lib/fx";

export default async function DebtsPage() {
  const [baseCurrency, accounts, plans] = await Promise.all([
    getBaseCurrency(),
    listAccountsWithEffective({ includeArchived: true }),
    listDebtPlans({ includeInactive: true }),
  ]);
  const [cashFlow, runway, paymentRows] = await Promise.all([
    computeMonthlyCashFlow(baseCurrency),
    computeCashRunway(baseCurrency),
    Promise.all(plans.map((plan) => listDebtPayments(plan.id, 8))),
  ]);

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const rateMap = await prefetchRates(
    accounts
      .filter((account) => account.type === "loan")
      .map((account) => [account.currency, baseCurrency] as const),
  );

  const planViews: DebtPlanView[] = plans.flatMap((plan, index) => {
    const loan = accountById.get(plan.loanAccountId);
    const source = accountById.get(plan.sourceAccountId);
    if (!loan || loan.type !== "loan" || !source) return [];
    const balance = Math.max(0, loan.effectiveValue ?? 0);
    const projection = calculateDebtProjection({
      balance,
      annualRatePct: loan.interestRatePct ?? 0,
      monthlyPayment: plan.monthlyPayment,
      nextPaymentDate: plan.nextPaymentDate,
    });
    return [
      {
        id: plan.id,
        active: plan.active,
        monthlyPayment: plan.monthlyPayment,
        nextPaymentDate: plan.nextPaymentDate,
        notes: plan.notes,
        loan: {
          id: loan.id,
          name: loan.name,
          institution: loan.institution,
          currency: loan.currency,
          balance,
          originalPrincipal: loan.originalPrincipal,
          interestRatePct: loan.interestRatePct,
          loanTermMonths: loan.loanTermMonths,
        },
        source: {
          id: source.id,
          name: source.name,
          currency: source.currency,
        },
        projection,
        payments: paymentRows[index].map((payment) => ({
          id: payment.id,
          paidAt: payment.paidAt,
          totalAmount: payment.totalAmount,
          principalAmount: payment.principalAmount,
          interestAmount: payment.interestAmount,
          remainingBalance: payment.remainingBalance,
          currency: payment.currency,
        })),
      },
    ];
  });

  const plannedLoanIds = new Set(plans.map((plan) => plan.loanAccountId));
  const unplannedLoans = accounts
    .filter(
      (account) => account.type === "loan" && !plannedLoanIds.has(account.id),
    )
    .map((loan) => ({
      id: loan.id,
      name: loan.name,
      institution: loan.institution,
      currency: loan.currency,
      balance: Math.max(0, loan.effectiveValue ?? 0),
      originalPrincipal: loan.originalPrincipal,
      interestRatePct: loan.interestRatePct,
      loanTermMonths: loan.loanTermMonths,
    }));
  const sourceAccounts = accounts
    .filter((account) => account.type !== "loan" && !account.archived)
    .map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
      type: account.type,
    }));

  let totalDebt = 0;
  let monthlyPayments = 0;
  let monthlyInterest = 0;
  let monthlyPrincipal = 0;
  const currentMonth = localToday().slice(0, 7);
  for (const view of planViews) {
    const rate = rateMap.rate(view.loan.currency, baseCurrency);
    totalDebt += view.loan.balance * rate;
    const realizedThisMonth = view.payments.filter((payment) =>
      payment.paidAt.startsWith(currentMonth),
    );
    if (!view.active && realizedThisMonth.length === 0) continue;
    const realizedTotal = realizedThisMonth.reduce(
      (sum, payment) => sum + payment.totalAmount,
      0,
    );
    const scheduledPayment =
      realizedThisMonth.length > 0
        ? realizedTotal
        : view.active
          ? debtPaymentForMonth(
              {
                balance: view.loan.balance,
                annualRatePct: view.loan.interestRatePct ?? 0,
                monthlyPayment: view.monthlyPayment,
                nextPaymentDate: view.nextPaymentDate,
              },
              currentMonth,
            )
          : 0;
    const interest =
      realizedThisMonth.length > 0
        ? realizedThisMonth.reduce(
            (sum, payment) => sum + payment.interestAmount,
            0,
          )
        : Math.min(scheduledPayment, view.projection.monthlyInterest);
    const principal =
      realizedThisMonth.length > 0
        ? realizedThisMonth.reduce(
            (sum, payment) => sum + payment.principalAmount,
            0,
          )
        : Math.max(0, scheduledPayment - interest);
    monthlyPayments += scheduledPayment * rate;
    monthlyInterest += interest * rate;
    monthlyPrincipal += principal * rate;
  }
  for (const loan of unplannedLoans) {
    const rate = rateMap.rate(loan.currency, baseCurrency);
    totalDebt += loan.balance * rate;
  }

  const expensesWithoutDebt = Math.max(
    0,
    runway.monthlyExpenses - runway.breakdown.debtPayments,
  );
  const netBurnWithoutDebt = Math.max(
    0,
    expensesWithoutDebt - runway.monthlyIncome,
  );
  const runwayWithoutDebt =
    netBurnWithoutDebt > 0 ? runway.liquidCash / netBurnWithoutDebt : null;

  return (
    <>
      <HeroBackground />
      <PageHeader
        size="lg"
        title="Debt"
        description="Turn each balance into a real repayment plan. See the cash commitment, principal reduction, interest cost, payoff date, and runway impact in one place."
      />
      <DebtManager
        baseCurrency={baseCurrency}
        plans={planViews}
        unplannedLoans={unplannedLoans}
        sourceAccounts={sourceAccounts}
        summary={{
          totalDebt,
          monthlyPayments,
          monthlyInterest,
          monthlyPrincipal,
          monthlyIncome: cashFlow.income,
          cashAfterCommitments: cashFlow.net,
          liquidCash: runway.liquidCash,
          runwayMonths:
            runway.netMonthly >= 0
              ? null
              : (runway.monthsNetRunway ?? runway.monthsRunway),
          runwayWithoutDebt,
        }}
      />
    </>
  );
}
