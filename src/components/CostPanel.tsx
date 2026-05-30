import React from "react";
import { Box, Text } from "ink";
import type { CostTotals } from "../cost-tracker.js";
import { cacheRate } from "../query/promptCache.js";

export function CostPanel(props: { totals: CostTotals }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text>{`input ${props.totals.inputTokens}`}</Text>
      <Text>{`output ${props.totals.outputTokens}`}</Text>
      <Text>{`cache ${cacheRate(props.totals.cacheHitTokens, props.totals.cacheMissTokens)}`}</Text>
    </Box>
  );
}
