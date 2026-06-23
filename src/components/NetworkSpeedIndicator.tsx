import React from "react";
import {
  getNetworkSpeedBlinkDuration,
  getNetworkSpeedIndicatorLevel,
} from "@/utils/networkSpeedIndicator";
import "./NetworkSpeedIndicator.css";

type NetworkSpeedIndicatorProps = {
  active: boolean;
  bytesPerSecond: number;
  direction: "upload" | "download";
};

const NetworkSpeedIndicator: React.FC<NetworkSpeedIndicatorProps> = React.memo(
  ({ active, bytesPerSecond, direction }) => {
    if (!active) return null;

    const level = getNetworkSpeedIndicatorLevel(bytesPerSecond);
    const duration = getNetworkSpeedBlinkDuration(level);

    return (
      <span
        aria-hidden="true"
        data-level={level}
        className={`network-io-indicator network-io-indicator--${direction} inline-block h-2 w-2 shrink-0 rounded-full`}
        style={
          {
            "--network-io-blink-duration": `${duration}ms`,
          } as React.CSSProperties
        }
      />
    );
  },
);

export default NetworkSpeedIndicator;
