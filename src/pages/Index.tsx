import {
  Callout,
  Card,
  Flex,
  Text,
  Popover,
  IconButton,
  Switch,
  Select,
  Button,
} from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import React, { useCallback, useEffect, useMemo, Suspense } from "react";
const NodeDisplay = React.lazy(() => import("../components/NodeDisplay"));
import { formatBytes } from "@/utils/unitHelper";
import { useLiveData } from "../contexts/LiveDataContext";
import { useNodeList, type NodeBasicInfo } from "@/contexts/NodeListContext";
import Loading from "@/components/loading";
import { Settings } from "lucide-react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { LiveData } from "@/types/LiveData";
import { Checkbox } from "@/components/ui/checkbox";
import {
  calculateCostSummary,
  COST_CURRENCY_OPTIONS,
  DEFAULT_COST_SUMMARY_SETTINGS,
  formatCost,
  getCostSourceCurrencies,
  normalizeCostSummarySettings,
  normalizeIdList,
  type CostCurrencyCode,
  type CostSummarySettings,
} from "@/utils/costSummary";

const BYTES_PER_GB = 1024 ** 3;

// Intelligent speed formatting function
const formatSpeed = (bytes: number): string => {
  if (bytes === 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);

  // Adaptive decimal places
  let decimals = 2;
  if (i >= 3) decimals = 1; // GB and above: 1 decimal
  if (i <= 1) decimals = 0; // B and KB: no decimals
  if (size >= 100) decimals = 0; // 100+ of any unit: no decimals

  return `${size.toFixed(decimals)} ${units[i]}`;
};

const formatMetricNumber = (
  value: number,
  maximumFractionDigits = 2,
): string =>
  new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(value);

const formatGb = (bytes: number): string =>
  formatMetricNumber(bytes / BYTES_PER_GB, 2);

const EMPTY_LIVE_DATA: LiveData = { online: [], data: {} };

const STATUS_CARD_VISIBILITY_DEFAULTS = {
  currentTime: true,
  regionOverview: true,
  cpuCoresUsage: true,
  memoryUsage: true,
  diskUsage: true,
  trafficOverview: true,
  networkSpeed: true,
  cost: true,
};

type StatusCardKey = keyof typeof STATUS_CARD_VISIBILITY_DEFAULTS;

const Index = () => {
  const [t] = useTranslation();
  const { live_data } = useLiveData();
  const { nodeList, isLoading, error, refresh } = useNodeList();
  const liveData = live_data?.data ?? EMPTY_LIVE_DATA;
  const onlineSet = useMemo(
    () => new Set(liveData.online),
    [liveData.online],
  );
  const [statusCardsVisibility, setStatusCardsVisibility] = useLocalStorage<
    Record<StatusCardKey, boolean>
  >("statusCardsVisibility", STATUS_CARD_VISIBILITY_DEFAULTS);
  const mergedStatusCardsVisibility = useMemo(
    () => ({
      ...STATUS_CARD_VISIBILITY_DEFAULTS,
      ...statusCardsVisibility,
    }),
    [statusCardsVisibility],
  );
  const [networkSpeedExcludedNodeIdsRaw, setNetworkSpeedExcludedNodeIds] =
    useLocalStorage<string[]>("networkSpeedExcludedNodeIds", []);
  const networkSpeedExcludedNodeIds = useMemo(
    () => normalizeIdList(networkSpeedExcludedNodeIdsRaw),
    [networkSpeedExcludedNodeIdsRaw],
  );
  const networkSpeedExcludedNodeIdSet = useMemo(
    () => new Set(networkSpeedExcludedNodeIds),
    [networkSpeedExcludedNodeIds],
  );
  const [costSummarySettingsRaw, setCostSummarySettings] =
    useLocalStorage<CostSummarySettings>(
      "costSummarySettings",
      DEFAULT_COST_SUMMARY_SETTINGS,
    );
  const costSummarySettings = useMemo(
    () => normalizeCostSummarySettings(costSummarySettingsRaw),
    [costSummarySettingsRaw],
  );
  const costExcludedNodeIdSet = useMemo(
    () => new Set(costSummarySettings.excludedNodeIds),
    [costSummarySettings.excludedNodeIds],
  );
  const costSourceCurrencies = useMemo(
    () => getCostSourceCurrencies(nodeList ?? [], costExcludedNodeIdSet),
    [costExcludedNodeIdSet, nodeList],
  );
  const exchangeRates = useExchangeRates(
    costSummarySettings.currency,
    costSourceCurrencies,
  );
  const costSummary = useMemo(
    () =>
      calculateCostSummary(
        nodeList ?? [],
        costSummarySettings.currency,
        costExcludedNodeIdSet,
        exchangeRates.rates,
      ),
    [
      costExcludedNodeIdSet,
      costSummarySettings.currency,
      exchangeRates.rates,
      nodeList,
    ],
  );
  const costSummaryText = exchangeRates.loading
    ? t("costSummary.loading")
    : t("costSummary.monthlyYearly", {
        monthly: formatCost(costSummary.monthly, costSummarySettings.currency),
        yearly: formatCost(costSummary.yearly, costSummarySettings.currency),
      });
  const costSummaryDescription = useMemo(() => {
    if (exchangeRates.error) {
      return t("costSummary.exchangeRateError");
    }
    if (costSummary.missingCurrencies.length > 0) {
      return t("costSummary.missingCurrencies", {
        currencies: costSummary.missingCurrencies.join(", "),
      });
    }
    if (costSummary.includedCount === 0) {
      return t("costSummary.noRecurringNodes");
    }
    return undefined;
  }, [
    costSummary.includedCount,
    costSummary.missingCurrencies,
    exchangeRates.error,
    t,
  ]);

  const updateNetworkSpeedExclusion = useCallback(
    (nodeId: string, excluded: boolean) => {
      setNetworkSpeedExcludedNodeIds((current) => {
        const next = new Set(normalizeIdList(current));
        if (excluded) {
          next.add(nodeId);
        } else {
          next.delete(nodeId);
        }
        return Array.from(next);
      });
    },
    [setNetworkSpeedExcludedNodeIds],
  );

  const clearNetworkSpeedExclusions = useCallback(() => {
    setNetworkSpeedExcludedNodeIds([]);
  }, [setNetworkSpeedExcludedNodeIds]);

  const updateCostCurrency = useCallback(
    (currency: CostCurrencyCode) => {
      setCostSummarySettings((current) => ({
        ...normalizeCostSummarySettings(current),
        currency,
      }));
    },
    [setCostSummarySettings],
  );

  const updateCostExclusion = useCallback(
    (nodeId: string, excluded: boolean) => {
      setCostSummarySettings((current) => {
        const settings = normalizeCostSummarySettings(current);
        const next = new Set(settings.excludedNodeIds);
        if (excluded) {
          next.add(nodeId);
        } else {
          next.delete(nodeId);
        }
        return {
          ...settings,
          excludedNodeIds: Array.from(next),
        };
      });
    },
    [setCostSummarySettings],
  );

  const clearCostExclusions = useCallback(() => {
    setCostSummarySettings((current) => ({
      ...normalizeCostSummarySettings(current),
      excludedNodeIds: [],
    }));
  }, [setCostSummarySettings]);

  const summaryStats = useMemo(() => {
    const regions = new Set<string>();
    let totalUp = 0;
    let totalDown = 0;
    let speedUp = 0;
    let speedDown = 0;
    let usedCpuCores = 0;
    let totalCpuCores = 0;
    let usedMemoryBytes = 0;
    let totalMemoryBytes = 0;
    let usedDiskBytes = 0;
    let totalDiskBytes = 0;

    for (const node of nodeList ?? []) {
      if (!onlineSet.has(node.uuid)) continue;

      regions.add(node.region);
      const record = liveData.data[node.uuid];
      if (!record) continue;

      totalCpuCores += node.cpu_cores || 0;
      usedCpuCores +=
        ((record.cpu.usage || 0) / 100) * Math.max(node.cpu_cores || 0, 0);
      usedMemoryBytes += record.ram.used || 0;
      totalMemoryBytes += node.mem_total || 0;
      usedDiskBytes += record.disk.used || 0;
      totalDiskBytes += node.disk_total || 0;
      if (!networkSpeedExcludedNodeIdSet.has(node.uuid)) {
        totalUp += record.network.totalUp || 0;
        totalDown += record.network.totalDown || 0;
        speedUp += record.network.up || 0;
        speedDown += record.network.down || 0;
      }
    }

    return {
      regionCount: regions.size,
      cpuCoresText: `${formatMetricNumber(usedCpuCores, 2)} / ${formatMetricNumber(totalCpuCores, 0)}`,
      memoryText: `${formatGb(usedMemoryBytes)} / ${formatGb(totalMemoryBytes)}`,
      diskText: `${formatGb(usedDiskBytes)} / ${formatGb(totalDiskBytes)}`,
      trafficText: `↑ ${formatBytes(totalUp)} / ↓ ${formatBytes(totalDown)}`,
      speedText: `↑ ${formatSpeed(speedUp)} / ↓ ${formatSpeed(speedDown)}`,
    };
  }, [liveData.data, networkSpeedExcludedNodeIdSet, nodeList, onlineSet]);

  const statusCards = useMemo(
    () => [
      {
        key: "currentTime" as const,
        title: t("current_time"),
        value: <CurrentTimeValue />,
        visible: mergedStatusCardsVisibility.currentTime,
      },
      {
        key: "regionOverview" as const,
        title: t("region_overview"),
        value: t("resourceSummary.regionOnlineValue", {
          regions: summaryStats.regionCount,
          online: onlineSet.size,
          total: nodeList?.length ?? 0,
        }),
        visible: mergedStatusCardsVisibility.regionOverview,
      },
      {
        key: "cpuCoresUsage" as const,
        title: t("resourceSummary.cpuCores"),
        value: `${summaryStats.cpuCoresText} ${t("resourceSummary.coresUnit")}`,
        visible: mergedStatusCardsVisibility.cpuCoresUsage,
      },
      {
        key: "memoryUsage" as const,
        title: t("resourceSummary.memory"),
        value: `${summaryStats.memoryText} ${t("resourceSummary.gbUnit")}`,
        visible: mergedStatusCardsVisibility.memoryUsage,
      },
      {
        key: "diskUsage" as const,
        title: t("resourceSummary.disk"),
        value: `${summaryStats.diskText} ${t("resourceSummary.gbUnit")}`,
        visible: mergedStatusCardsVisibility.diskUsage,
      },
      {
        key: "trafficOverview" as const,
        title: t("traffic_overview"),
        value: summaryStats.trafficText,
        visible: mergedStatusCardsVisibility.trafficOverview,
      },
      {
        key: "networkSpeed" as const,
        title: t("network_speed"),
        value: summaryStats.speedText,
        visible: mergedStatusCardsVisibility.networkSpeed,
        action: (
          <NodeExclusionPopover
            title={t("costSummary.networkSettings")}
            hint={t("costSummary.networkExcludeHint")}
            nodes={nodeList ?? []}
            excludedNodeIds={networkSpeedExcludedNodeIds}
            onToggle={updateNetworkSpeedExclusion}
            onClear={clearNetworkSpeedExclusions}
          />
        ),
      },
      {
        key: "cost" as const,
        title: t("costSummary.title"),
        value: costSummaryText,
        description: costSummaryDescription,
        visible: mergedStatusCardsVisibility.cost,
        action: (
          <CostSettingsPopover
            nodes={nodeList ?? []}
            settings={costSummarySettings}
            onCurrencyChange={updateCostCurrency}
            onToggle={updateCostExclusion}
            onClear={clearCostExclusions}
          />
        ),
      },
    ],
    [
      clearCostExclusions,
      clearNetworkSpeedExclusions,
      costSummaryDescription,
      costSummarySettings,
      costSummaryText,
      mergedStatusCardsVisibility,
      networkSpeedExcludedNodeIds,
      nodeList,
      onlineSet.size,
      summaryStats,
      t,
      updateCostCurrency,
      updateCostExclusion,
      updateNetworkSpeedExclusion,
    ],
  );

  const visibleStatusCards = useMemo(
    () => statusCards.filter((card) => card.visible),
    [statusCards],
  );

  const updateStatusCardVisibility = useCallback(
    (key: StatusCardKey, checked: boolean) => {
      setStatusCardsVisibility((current) => ({
        ...STATUS_CARD_VISIBILITY_DEFAULTS,
        ...current,
        [key]: checked,
      }));
    },
    [setStatusCardsVisibility],
  );

  useEffect(() => {
    const interval = window.setInterval(refresh, 5000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  if (isLoading) {
    return <Loading />;
  }
  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <>
      <Callouts />
      <Card className="summary-card mx-4 md:text-base text-sm relative">
        <div className="absolute top-2 right-2">
          <Popover.Root>
            <Popover.Trigger>
              <IconButton variant="ghost" size="1">
                <Settings size={16} />
              </IconButton>
            </Popover.Trigger>
            <Popover.Content width="300px">
              <Flex direction="column" gap="3">
                <Text size="2" weight="bold">
                  {t("status_settings")}
                </Text>
                <Flex direction="column" gap="2">
                  {statusCards.map((card) => (
                    <StatusSettingSwitch
                      key={card.key}
                      label={card.title}
                      checked={card.visible}
                      onCheckedChange={(checked) =>
                        updateStatusCardVisibility(card.key, checked)
                      }
                    />
                  ))}
                </Flex>
              </Flex>
            </Popover.Content>
          </Popover.Root>
        </div>

        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(auto-fit, minmax(230px, 1fr))`,
            gridAutoRows: "min-content",
          }}
        >
          {visibleStatusCards.map((card) => (
            <TopCard
              key={card.key}
              title={card.title}
              value={card.value}
              description={card.description}
              action={card.action}
            />
          ))}
        </div>
      </Card>
      <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
        <NodeDisplay nodes={nodeList ?? []} liveData={liveData} />
      </Suspense>
    </>
  );
};

//#region Callouts
const Callouts = () => {
  const [t] = useTranslation();
  const { showCallout } = useLiveData();
  const ishttps = window.location.protocol === "https:";
  return (
    <Flex direction="column" gap="2" className="m-2">
      <Callout.Root m="2" hidden={ishttps} color="red">
        <Callout.Icon>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="M10.03 3.659c.856-1.548 3.081-1.548 3.937 0l7.746 14.001c.83 1.5-.255 3.34-1.969 3.34H4.254c-1.715 0-2.8-1.84-1.97-3.34zM12.997 17A.999.999 0 1 0 11 17a.999.999 0 0 0 1.997 0m-.259-7.853a.75.75 0 0 0-1.493.103l.004 4.501l.007.102a.75.75 0 0 0 1.493-.103l-.004-4.502z"
            />
          </svg>
        </Callout.Icon>
        <Callout.Text>
          <Text size="2" weight="medium">
            {t("warn_https")}
          </Text>
        </Callout.Text>
      </Callout.Root>
      <Callout.Root m="2" hidden={showCallout} id="callout" color="tomato">
        <Callout.Icon>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="M21.707 3.707a1 1 0 0 0-1.414-1.414L18.496 4.09a4.25 4.25 0 0 0-5.251.604l-1.068 1.069a1.75 1.75 0 0 0 0 2.474l3.585 3.586a1.75 1.75 0 0 0 2.475 0l1.068-1.068a4.25 4.25 0 0 0 .605-5.25zm-11 8a1 1 0 0 0-1.414-1.414l-1.47 1.47l-.293-.293a.75.75 0 0 0-1.06 0l-1.775 1.775a4.25 4.25 0 0 0-.605 5.25l-1.797 1.798a1 1 0 1 0 1.414 1.414l1.798-1.797a4.25 4.25 0 0 0 5.25-.605l1.775-1.775a.75.75 0 0 0 0-1.06l-.293-.293l1.47-1.47a1 1 0 0 0-1.414-1.414l-1.47 1.47l-1.586-1.586z"
            />
          </svg>
        </Callout.Icon>
        <Callout.Text>
          <Text size="2" weight="medium">
            {t("warn_websocket")}
          </Text>
        </Callout.Text>
      </Callout.Root>
    </Flex>
  );
};
// #endregion Callouts
export default Index;

type TopCardProps = {
  title: string;
  value: React.ReactNode;
  description?: string;
  action?: React.ReactNode;
};

const TopCard: React.FC<TopCardProps> = React.memo(
  ({ title, value, description, action }) => {
    return (
      <div className="min-w-52 md:max-w-72 w-full">
        <Flex direction="column" gap="1">
          <Flex align="center" gap="1" className="text-muted-foreground">
            <label className="text-sm">{title}</label>
            {action}
          </Flex>
          <label className="font-medium -mt-2 text-md">{value}</label>
          {description && (
            <Text size="2" color="gray">
              {description}
            </Text>
          )}
        </Flex>
      </div>
    );
  },
);

type ExchangeRatesState = {
  rates: Partial<Record<CostCurrencyCode, number>>;
  loading: boolean;
  error: string | null;
};

const useExchangeRates = (
  targetCurrency: CostCurrencyCode,
  sourceCurrencies: CostCurrencyCode[],
): ExchangeRatesState => {
  const sourceCurrencyKey = sourceCurrencies.join(",");
  const [state, setState] = React.useState<ExchangeRatesState>({
    rates: { [targetCurrency]: 1 },
    loading: false,
    error: null,
  });

  useEffect(() => {
    const sources = Array.from(
      new Set(sourceCurrencyKey.split(",").filter(Boolean)),
    ) as CostCurrencyCode[];
    const needsExchangeRate = sources.some((source) => source !== targetCurrency);
    const baseRates: Partial<Record<CostCurrencyCode, number>> = {
      [targetCurrency]: 1,
    };

    if (!needsExchangeRate) {
      setState({
        rates: baseRates,
        loading: false,
        error: null,
      });
      return;
    }

    const controller = new AbortController();
    setState({
      rates: baseRates,
      loading: true,
      error: null,
    });

    fetch(
      `https://open.er-api.com/v6/latest/${encodeURIComponent(targetCurrency)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data?.result !== "success" || !data?.rates) {
          throw new Error("Invalid exchange rate response");
        }

        const nextRates: Partial<Record<CostCurrencyCode, number>> = {
          [targetCurrency]: 1,
        };

        for (const source of sources) {
          if (source === targetCurrency) {
            nextRates[source] = 1;
            continue;
          }

          const quotedRate = data.rates[source];
          if (typeof quotedRate === "number" && quotedRate > 0) {
            nextRates[source] = 1 / quotedRate;
          }
        }

        setState({
          rates: nextRates,
          loading: false,
          error: null,
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({
          rates: baseRates,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => controller.abort();
  }, [sourceCurrencyKey, targetCurrency]);

  return state;
};

type NodeExclusionPopoverProps = {
  title: string;
  hint: string;
  nodes: NodeBasicInfo[];
  excludedNodeIds: string[];
  onToggle: (nodeId: string, excluded: boolean) => void;
  onClear: () => void;
};

const NodeExclusionPopover: React.FC<NodeExclusionPopoverProps> = React.memo(
  ({ title, hint, nodes, excludedNodeIds, onToggle, onClear }) => {
    const [t] = useTranslation();
    const excludedNodeIdSet = useMemo(
      () => new Set(excludedNodeIds),
      [excludedNodeIds],
    );

    return (
      <Popover.Root>
        <Popover.Trigger>
          <IconButton
            variant="ghost"
            size="1"
            aria-label={t("costSummary.settingsButton")}
            title={t("costSummary.settingsButton")}
          >
            <Settings size={14} />
          </IconButton>
        </Popover.Trigger>
        <Popover.Content width="320px">
          <Flex direction="column" gap="3">
            <Flex align="center" justify="between" gap="2">
              <Text size="2" weight="bold">
                {title}
              </Text>
              <Button
                type="button"
                size="1"
                variant="ghost"
                onClick={onClear}
                disabled={excludedNodeIds.length === 0}
              >
                {t("costSummary.clear")}
              </Button>
            </Flex>
            <Text size="1" color="gray">
              {hint}
            </Text>
            <Text size="1" color="gray">
              {t("costSummary.excludedCount", {
                count: excludedNodeIds.length,
                total: nodes.length,
              })}
            </Text>
            <Flex direction="column" gap="2" className="max-h-72 overflow-auto">
              {nodes.length === 0 ? (
                <Text size="2" color="gray">
                  {t("costSummary.emptyNodes")}
                </Text>
              ) : (
                nodes.map((node) => (
                  <label
                    key={node.uuid}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-accent-2"
                  >
                    <Checkbox
                      checked={excludedNodeIdSet.has(node.uuid)}
                      onCheckedChange={(checked) =>
                        onToggle(node.uuid, checked === true)
                      }
                    />
                    <span className="truncate text-sm">{node.name}</span>
                  </label>
                ))
              )}
            </Flex>
          </Flex>
        </Popover.Content>
      </Popover.Root>
    );
  },
);

type CostSettingsPopoverProps = {
  nodes: NodeBasicInfo[];
  settings: CostSummarySettings;
  onCurrencyChange: (currency: CostCurrencyCode) => void;
  onToggle: (nodeId: string, excluded: boolean) => void;
  onClear: () => void;
};

const CostSettingsPopover: React.FC<CostSettingsPopoverProps> = React.memo(
  ({ nodes, settings, onCurrencyChange, onToggle, onClear }) => {
    const [t] = useTranslation();

    return (
      <Popover.Root>
        <Popover.Trigger>
          <IconButton
            variant="ghost"
            size="1"
            aria-label={t("costSummary.settingsButton")}
            title={t("costSummary.settingsButton")}
          >
            <Settings size={14} />
          </IconButton>
        </Popover.Trigger>
        <Popover.Content width="340px">
          <Flex direction="column" gap="3">
            <Text size="2" weight="bold">
              {t("costSummary.settings")}
            </Text>
            <Flex direction="column" gap="1">
              <Text size="1" color="gray">
                {t("costSummary.currency")}
              </Text>
              <Select.Root
                value={settings.currency}
                onValueChange={(value) =>
                  onCurrencyChange(value as CostCurrencyCode)
                }
              >
                <Select.Trigger />
                <Select.Content>
                  {COST_CURRENCY_OPTIONS.map((option) => (
                    <Select.Item key={option.code} value={option.code}>
                      {option.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Flex>
            <Text size="1" color="gray">
              {t("costSummary.autoExcludeHint")}
            </Text>
            <NodeExclusionList
              nodes={nodes}
              excludedNodeIds={settings.excludedNodeIds}
              onToggle={onToggle}
              onClear={onClear}
            />
          </Flex>
        </Popover.Content>
      </Popover.Root>
    );
  },
);

type NodeExclusionListProps = {
  nodes: NodeBasicInfo[];
  excludedNodeIds: string[];
  onToggle: (nodeId: string, excluded: boolean) => void;
  onClear: () => void;
};

const NodeExclusionList: React.FC<NodeExclusionListProps> = React.memo(
  ({ nodes, excludedNodeIds, onToggle, onClear }) => {
    const [t] = useTranslation();
    const excludedNodeIdSet = useMemo(
      () => new Set(excludedNodeIds),
      [excludedNodeIds],
    );

    return (
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center" gap="2">
          <Text size="1" color="gray">
            {t("costSummary.costExcludeHint")}
          </Text>
          <Button
            type="button"
            size="1"
            variant="ghost"
            onClick={onClear}
            disabled={excludedNodeIds.length === 0}
          >
            {t("costSummary.clear")}
          </Button>
        </Flex>
        <Text size="1" color="gray">
          {t("costSummary.excludedCount", {
            count: excludedNodeIds.length,
            total: nodes.length,
          })}
        </Text>
        <Flex direction="column" gap="2" className="max-h-64 overflow-auto">
          {nodes.length === 0 ? (
            <Text size="2" color="gray">
              {t("costSummary.emptyNodes")}
            </Text>
          ) : (
            nodes.map((node) => (
              <label
                key={node.uuid}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-accent-2"
              >
                <Checkbox
                  checked={excludedNodeIdSet.has(node.uuid)}
                  onCheckedChange={(checked) =>
                    onToggle(node.uuid, checked === true)
                  }
                />
                <span className="truncate text-sm">{node.name}</span>
              </label>
            ))
          )}
        </Flex>
      </Flex>
    );
  },
);

const CurrentTimeValue = React.memo(() => {
  const [currentTime, setCurrentTime] = React.useState(() =>
    new Date().toLocaleTimeString(),
  );

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <>{currentTime}</>;
});

type StatusSettingSwitchProps = {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

const StatusSettingSwitch: React.FC<StatusSettingSwitchProps> = React.memo(
  ({ label, checked, onCheckedChange }) => {
    return (
      <Flex justify="between" align="center">
        <Text size="2">{label}</Text>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </Flex>
    );
  },
);
