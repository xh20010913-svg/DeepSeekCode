import React from "react";
import { Box, Text } from "ink";
import type { RuntimeConfig } from "../bootstrap/config.js";
import type { DeepSeekProviderClient } from "../protocol/provider.js";
import { isChineseUi } from "../services/ui/languageService.js";
import { PRODUCT_NAME } from "../constants/product.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { toneColor } from "./design/terminalTheme.js";
import { FastIcon, isFastModel } from "./FastIcon.js";

export function Header(props: {
  config: RuntimeConfig;
  provider: DeepSeekProviderClient | null;
}): React.ReactElement {
  const zh = isChineseUi(props.config.language);
  return (
    <Box justifyContent="space-between" paddingX={1} paddingBottom={1}>
      <Box>
        <Text color={toneColor("brand")} bold>{PRODUCT_NAME}</Text>
        <Text color="gray">{` ${compactPath(props.config.projectPath, 48)}`}</Text>
      </Box>
      <Box>
        {isFastModel(props.config.model) && (
          <>
            <FastIcon />
            <Text> </Text>
          </>
        )}
        <StatusBadge label={props.provider ? (zh ? "就绪" : "ready") : (zh ? "缺失" : "missing")} tone={props.provider ? "success" : "warning"} />
        <Text color="gray">{` ${props.config.model}`}</Text>
      </Box>
    </Box>
  );
}

function compactPath(value: string, max: number): string {
  if (value.length <= max) return value;
  return `...${value.slice(-(max - 3))}`;
}
