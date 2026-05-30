import React from "react";
import { pathToFileURL } from "node:url";
import { Text } from "ink";
import { truncateCells } from "./design/textLayout.js";

export interface FilePathLinkModel {
  href: string;
  label: string;
  linkedText: string;
}

export function FilePathLink(props: {
  filePath: string;
  children?: React.ReactNode;
  width?: number;
  color?: string;
  dimColor?: boolean;
}): React.ReactElement {
  const label = typeof props.children === "string"
    ? props.children
    : props.filePath;
  const model = filePathLinkModel(props.filePath, label, {
    width: props.width,
    osc8: process.env.DEEPSEEKCODE_OSC8_LINKS === "1",
  });
  return (
    <Text color={props.color} dimColor={props.dimColor}>
      {model.linkedText}
    </Text>
  );
}

export function filePathLinkModel(
  filePath: string,
  label = filePath,
  options: {
    width?: number;
    osc8?: boolean;
  } = {},
): FilePathLinkModel {
  const href = pathToFileURL(filePath).href;
  const visible = options.width ? truncateCells(label, options.width) : label;
  return {
    href,
    label: visible,
    linkedText: options.osc8 ? osc8Link(href, visible) : visible,
  };
}

export function isLikelyLocalPath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\") || value.startsWith("/");
}

function osc8Link(href: string, label: string): string {
  return `\u001B]8;;${href}\u0007${label}\u001B]8;;\u0007`;
}
