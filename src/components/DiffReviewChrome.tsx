import React from "react";
import { Box, Text } from "ink";
import { Byline, joinBylineItems } from "./design/Byline.js";
import { truncateCells } from "./design/textLayout.js";

export type DiffReviewMode = "list" | "detail" | "review";

export interface DiffReviewSource {
  label: string;
  detail?: string;
}

export interface DiffReviewChromeModel {
  sources: Array<{
    label: string;
    active: boolean;
  }>;
  modes: Array<{
    label: DiffReviewMode;
    active: boolean;
  }>;
  guide: string;
}

const MODES: DiffReviewMode[] = ["list", "detail", "review"];

export function DiffReviewChrome(props: {
  sources?: DiffReviewSource[];
  selectedSourceIndex?: number;
  mode?: DiffReviewMode;
  width?: number;
}): React.ReactElement {
  const model = diffReviewChromeModel(props);
  const width = props.width ?? 112;

  return (
    <Box flexDirection="column">
      {model.sources.length > 1 ? (
        <Box flexDirection="row">
          <Text color="gray">source </Text>
          {model.sources.map((source, index) => (
            <React.Fragment key={`${index}:${source.label}`}>
              {index > 0 ? <Text color="gray"> | </Text> : null}
              <Text color={source.active ? "cyan" : "gray"} bold={source.active}>
                {source.active ? `[${truncateCells(source.label, 18)}]` : truncateCells(source.label, 18)}
              </Text>
            </React.Fragment>
          ))}
        </Box>
      ) : null}
      <Box flexDirection="row">
        <Text color="gray">mode   </Text>
        {model.modes.map((mode, index) => (
          <React.Fragment key={mode.label}>
            {index > 0 ? <Text color="gray"> | </Text> : null}
            <Text color={mode.active ? "cyan" : "gray"} bold={mode.active}>
              {mode.active ? `[${mode.label}]` : mode.label}
            </Text>
          </React.Fragment>
        ))}
      </Box>
      <Byline>
        {model.guide.split(" | ").map((item) => (
          <Text key={item} color="gray">
            {truncateCells(item, Math.max(12, Math.floor(width / 3)))}
          </Text>
        ))}
      </Byline>
    </Box>
  );
}

export function diffReviewChromeModel(input: {
  sources?: DiffReviewSource[];
  selectedSourceIndex?: number;
  mode?: DiffReviewMode;
}): DiffReviewChromeModel {
  const rawSources = input.sources?.length ? input.sources : [{ label: "workspace" }];
  const selected = clampIndex(input.selectedSourceIndex ?? 0, rawSources.length);
  const mode = input.mode ?? "review";
  const guide = mode === "detail"
    ? joinBylineItems(["Esc list", "q close", "Up/Down hunk"])
    : joinBylineItems([
        rawSources.length > 1 ? "Left/Right source" : "",
        "Tab mode",
        "Enter detail",
        "Esc close",
      ]);

  return {
    sources: rawSources.map((source, index) => ({
      label: source.detail ? `${source.label} ${source.detail}` : source.label,
      active: index === selected,
    })),
    modes: MODES.map((label) => ({
      label,
      active: label === mode,
    })),
    guide,
  };
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.max(0, Math.trunc(index)));
}
