import React from "react";
import { Text } from "ink";
import type { CacheTelemetrySummary } from "../services/cache/telemetry.js";

export function StatusLine(props: { cache: CacheTelemetrySummary; model: string }): React.ReactElement {
  return (
    <Text color="gray">
      {`model ${props.model} | cache ${props.cache.rate} (${props.cache.hitTokens}/${props.cache.missTokens})`}
    </Text>
  );
}
