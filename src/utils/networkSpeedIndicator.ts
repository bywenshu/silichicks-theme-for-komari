export const BYTES_PER_KB = 1024;
export const NETWORK_IO_MAX_MEGABITS_PER_SECOND = 800;
export const NETWORK_IO_MAX_BYTES_PER_SECOND =
  (NETWORK_IO_MAX_MEGABITS_PER_SECOND * 1000 * 1000) / 8;
export const NETWORK_IO_LEVEL_COUNT = 20;

export const DEFAULT_NETWORK_SPEED_INDICATOR_SETTINGS = {
  enabled: true,
  thresholdBytes: 100 * BYTES_PER_KB,
};

export type NetworkSpeedIndicatorSettings =
  typeof DEFAULT_NETWORK_SPEED_INDICATOR_SETTINGS;

export const normalizeNetworkSpeedIndicatorSettings = (
  value: unknown,
): NetworkSpeedIndicatorSettings => {
  const settings =
    value && typeof value === "object"
      ? (value as Partial<NetworkSpeedIndicatorSettings>)
      : {};
  const thresholdBytes =
    typeof settings.thresholdBytes === "number" &&
    Number.isFinite(settings.thresholdBytes)
      ? settings.thresholdBytes
      : DEFAULT_NETWORK_SPEED_INDICATOR_SETTINGS.thresholdBytes;

  return {
    enabled:
      typeof settings.enabled === "boolean"
        ? settings.enabled
        : DEFAULT_NETWORK_SPEED_INDICATOR_SETTINGS.enabled,
    thresholdBytes: Math.max(0, thresholdBytes),
  };
};

export const getNetworkSpeedIndicatorLevel = (bytesPerSecond: number): number => {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return 0;

  const ratio = Math.min(
    bytesPerSecond,
    NETWORK_IO_MAX_BYTES_PER_SECOND,
  ) / NETWORK_IO_MAX_BYTES_PER_SECOND;

  return Math.min(
    NETWORK_IO_LEVEL_COUNT,
    Math.max(1, Math.ceil(Math.sqrt(ratio) * NETWORK_IO_LEVEL_COUNT)),
  );
};

export const getNetworkSpeedBlinkDuration = (level: number): number => {
  if (level <= 0) return 0;

  const slowestMs = 1600;
  const fastestMs = 160;
  const normalized =
    (Math.min(NETWORK_IO_LEVEL_COUNT, Math.max(1, level)) - 1) /
    (NETWORK_IO_LEVEL_COUNT - 1);

  return Math.round(slowestMs - normalized * (slowestMs - fastestMs));
};
