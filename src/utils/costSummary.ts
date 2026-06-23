import type { NodeBasicInfo } from "@/contexts/NodeListContext";

export type CostCurrencyCode =
  | "CNY"
  | "USD"
  | "EUR"
  | "GBP"
  | "JPY"
  | "HKD"
  | "TWD"
  | "SGD"
  | "AUD"
  | "CAD";

export type AdditionalBudgetItem = {
  id: string;
  name: string;
  price: number;
  billingCycle: number;
  currency: CostCurrencyCode;
};

export type CostSummarySettings = {
  currency: CostCurrencyCode;
  excludedNodeIds: string[];
  additionalBudgets: AdditionalBudgetItem[];
};

export type CostSummary = {
  monthly: number;
  yearly: number;
  includedCount: number;
  skippedCount: number;
  missingCurrencies: string[];
};

export const COST_CURRENCY_OPTIONS: Array<{
  code: CostCurrencyCode;
  label: string;
}> = [
  { code: "CNY", label: "CNY - ¥" },
  { code: "USD", label: "USD - $" },
  { code: "EUR", label: "EUR - €" },
  { code: "GBP", label: "GBP - £" },
  { code: "JPY", label: "JPY - ¥" },
  { code: "HKD", label: "HKD - HK$" },
  { code: "TWD", label: "TWD - NT$" },
  { code: "SGD", label: "SGD - S$" },
  { code: "AUD", label: "AUD - A$" },
  { code: "CAD", label: "CAD - C$" },
];

export const DEFAULT_COST_SUMMARY_SETTINGS: CostSummarySettings = {
  currency: "CNY",
  excludedNodeIds: [],
  additionalBudgets: [],
};

const COST_CURRENCY_CODES = new Set(
  COST_CURRENCY_OPTIONS.map((option) => option.code),
);

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AVERAGE_DAYS_PER_MONTH = 365.25 / 12;
const LONG_TERM_DAYS = 36500;

const CURRENCY_ALIASES: Record<string, CostCurrencyCode> = {
  CNY: "CNY",
  RMB: "CNY",
  "¥": "CNY",
  "￥": "CNY",
  元: "CNY",
  USD: "USD",
  US$: "USD",
  "$": "USD",
  EUR: "EUR",
  "€": "EUR",
  GBP: "GBP",
  "£": "GBP",
  JPY: "JPY",
  "JP¥": "JPY",
  円: "JPY",
  日元: "JPY",
  HKD: "HKD",
  HK$: "HKD",
  TWD: "TWD",
  NT$: "TWD",
  SGD: "SGD",
  S$: "SGD",
  AUD: "AUD",
  A$: "AUD",
  CAD: "CAD",
  C$: "CAD",
};

export const normalizeIdList = (value: unknown): string[] =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value.filter((item): item is string => typeof item === "string"),
        ),
      )
    : [];

const numberOrZero = (value: unknown): number => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeAdditionalBudgets = (value: unknown): AdditionalBudgetItem[] =>
  Array.isArray(value)
    ? value.map((item, index) => {
        const budget =
          item && typeof item === "object"
            ? (item as Partial<AdditionalBudgetItem>)
            : {};
        const id =
          typeof budget.id === "string" && budget.id.trim()
            ? budget.id
            : `additional-budget-${index}`;
        const currency = COST_CURRENCY_CODES.has(
          budget.currency as CostCurrencyCode,
        )
          ? (budget.currency as CostCurrencyCode)
          : DEFAULT_COST_SUMMARY_SETTINGS.currency;

        return {
          id,
          name: typeof budget.name === "string" ? budget.name : "",
          price: Math.max(0, numberOrZero(budget.price)),
          billingCycle: Math.max(1, numberOrZero(budget.billingCycle) || 30),
          currency,
        };
      })
    : [];

export const normalizeCostSummarySettings = (
  value: unknown,
): CostSummarySettings => {
  const settings =
    value && typeof value === "object"
      ? (value as Partial<CostSummarySettings>)
      : {};
  const currency = COST_CURRENCY_CODES.has(settings.currency as CostCurrencyCode)
    ? (settings.currency as CostCurrencyCode)
    : DEFAULT_COST_SUMMARY_SETTINGS.currency;

  return {
    currency,
    excludedNodeIds: normalizeIdList(settings.excludedNodeIds),
    additionalBudgets: normalizeAdditionalBudgets(settings.additionalBudgets),
  };
};

export const normalizeCurrencyCode = (currency?: string): CostCurrencyCode => {
  const normalized = (currency || "").trim().toUpperCase();
  return CURRENCY_ALIASES[normalized] ?? "CNY";
};

export const isLongTermNode = (expiredAt?: string | number): boolean => {
  if (!expiredAt) return false;

  const expiresAt = new Date(expiredAt).getTime();
  if (!Number.isFinite(expiresAt)) return false;

  return Math.ceil((expiresAt - Date.now()) / MS_PER_DAY) > LONG_TERM_DAYS;
};

export const isRecurringCostNode = (node: NodeBasicInfo): boolean =>
  node.price > 0 &&
  node.billing_cycle > 0 &&
  !isLongTermNode(node.expired_at);

const isRecurringBudgetItem = (budget: AdditionalBudgetItem): boolean =>
  budget.price > 0 && budget.billingCycle > 0;

export const getCostSourceCurrencies = (
  nodes: NodeBasicInfo[],
  excludedNodeIds: ReadonlySet<string>,
  additionalBudgets: AdditionalBudgetItem[] = [],
): CostCurrencyCode[] => {
  const currencies = new Set<CostCurrencyCode>();

  for (const node of nodes) {
    if (excludedNodeIds.has(node.uuid) || !isRecurringCostNode(node)) continue;
    currencies.add(normalizeCurrencyCode(node.currency));
  }

  for (const budget of additionalBudgets) {
    if (!isRecurringBudgetItem(budget)) continue;
    currencies.add(budget.currency);
  }

  return Array.from(currencies).sort();
};

export const calculateCostSummary = (
  nodes: NodeBasicInfo[],
  targetCurrency: CostCurrencyCode,
  excludedNodeIds: ReadonlySet<string>,
  conversionRates: Partial<Record<CostCurrencyCode, number>>,
  additionalBudgets: AdditionalBudgetItem[] = [],
): CostSummary => {
  const missingCurrencies = new Set<CostCurrencyCode>();
  let monthly = 0;
  let yearly = 0;
  let includedCount = 0;
  let skippedCount = 0;

  for (const node of nodes) {
    if (excludedNodeIds.has(node.uuid) || !isRecurringCostNode(node)) {
      skippedCount += 1;
      continue;
    }

    const sourceCurrency = normalizeCurrencyCode(node.currency);
    const conversionRate =
      sourceCurrency === targetCurrency ? 1 : conversionRates[sourceCurrency];

    if (!conversionRate || conversionRate <= 0) {
      missingCurrencies.add(sourceCurrency);
      skippedCount += 1;
      continue;
    }

    const convertedPrice = node.price * conversionRate;
    monthly += (convertedPrice / node.billing_cycle) * AVERAGE_DAYS_PER_MONTH;
    yearly += (convertedPrice / node.billing_cycle) * 365.25;
    includedCount += 1;
  }

  for (const budget of additionalBudgets) {
    if (!isRecurringBudgetItem(budget)) {
      skippedCount += 1;
      continue;
    }

    const conversionRate =
      budget.currency === targetCurrency ? 1 : conversionRates[budget.currency];

    if (!conversionRate || conversionRate <= 0) {
      missingCurrencies.add(budget.currency);
      skippedCount += 1;
      continue;
    }

    const convertedPrice = budget.price * conversionRate;
    monthly += (convertedPrice / budget.billingCycle) * AVERAGE_DAYS_PER_MONTH;
    yearly += (convertedPrice / budget.billingCycle) * 365.25;
    includedCount += 1;
  }

  return {
    monthly,
    yearly,
    includedCount,
    skippedCount,
    missingCurrencies: Array.from(missingCurrencies).sort(),
  };
};

export const formatCost = (
  value: number,
  currency: CostCurrencyCode,
): string =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
