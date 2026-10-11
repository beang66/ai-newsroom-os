import * as React from "react";

export type CellMode = "light";
export type CellVariant = "default" | "header";
export type CellState = "default";
export type CellElement = "td" | "th";

export type CellProps = Omit<
  React.TdHTMLAttributes<HTMLTableCellElement> &
    React.ThHTMLAttributes<HTMLTableCellElement>,
  "children"
> & {
  as?: CellElement;
  children?: React.ReactNode;
  mode: CellMode;
  state?: CellState;
  variant?: CellVariant;
};

type CellStyle = React.CSSProperties & Record<string, string | undefined>;

const cellTokenBindings = {
  "light": {
    "default": {
      "default": {
        "body.text": "color.text.body",
        "header.icon": "color.icon.subtle",
        "header.text": "color.text.heading",
        "icon": "color.icon.subtle",
        "number.content": "space.12",
        "number.padding-x": "space.16",
        "number.size.height": "size.48",
        "typography.text.body": "font.body.medium",
        "typography.text.header": "font.body.medium"
      }
    },
    "header": {
      "default": {
        "body.text": "color.text.body",
        "header.icon": "color.icon.subtle",
        "header.text": "color.text.heading",
        "icon": "color.icon.subtle",
        "number.content": "space.12",
        "number.padding-x": "space.16",
        "number.size.height": "size.48",
        "typography.text.body": "font.body.medium",
        "typography.text.header": "font.body.medium"
      }
    }
  }
} as const;
const cellTokenSlots: readonly {
  tokenSlotId: string;
  valueType: string;
}[] = [
  {
    "tokenSlotId": "body.text",
    "valueType": "color"
  },
  {
    "tokenSlotId": "header.icon",
    "valueType": "color"
  },
  {
    "tokenSlotId": "header.text",
    "valueType": "color"
  },
  {
    "tokenSlotId": "icon",
    "valueType": "color"
  },
  {
    "tokenSlotId": "number.content",
    "valueType": "number"
  },
  {
    "tokenSlotId": "number.padding-x",
    "valueType": "number"
  },
  {
    "tokenSlotId": "number.size.height",
    "valueType": "number"
  },
  {
    "tokenSlotId": "typography.text.body",
    "valueType": "typography"
  },
  {
    "tokenSlotId": "typography.text.header",
    "valueType": "typography"
  }
];

export function Cell({
  as = "td",
  children,
  mode,
  state = "default",
  style,
  variant = "default",
  ...props
}: CellProps) {
  const tokenStyle = getCellTokenStyle({ mode, state, variant });

  if (as === "th") {
    return (
      <th
        {...props}
        data-alpy-component="cell"
        data-alpy-mode={mode}
        data-alpy-state={state}
        data-alpy-variant={variant}
        style={{ ...baseCellStyle, ...tokenStyle, ...style }}
      >
        <span data-alpy-cell-content="">{children}</span>
      </th>
    );
  }

  return (
    <td
      {...props}
      data-alpy-component="cell"
      data-alpy-mode={mode}
      data-alpy-state={state}
      data-alpy-variant={variant}
      style={{ ...baseCellStyle, ...tokenStyle, ...style }}
    >
      <span data-alpy-cell-content="">{children}</span>
    </td>
  );
}

const baseCellStyle: React.CSSProperties = {
  color: "var(--cell-body-text)",
  fontFamily: "var(--cell-typography-text-body-font-family)",
  fontSize: "var(--cell-typography-text-body-font-size)",
  fontWeight: "var(--cell-typography-text-body-font-weight)",
  height: "var(--cell-number-size-height)",
  letterSpacing: "var(--cell-typography-text-body-letter-spacing)",
  lineHeight: "var(--cell-typography-text-body-line-height)",
  paddingInline: "var(--cell-number-padding-x)",
  verticalAlign: "middle",
};

function getCellTokenStyle({
  mode,
  state,
  variant,
}: {
  mode: CellMode;
  state: CellState;
  variant: CellVariant;
}): React.CSSProperties {
  const byVariant = cellTokenBindings[mode]?.[variant] as
    | Record<string, Record<string, string>>
    | undefined;
  const byState = byVariant?.[state] ?? byVariant?.["default"];
  const style: CellStyle = {};

  for (const tokenSlot of cellTokenSlots) {
    const tokenRef = byState?.[tokenSlot.tokenSlotId];
    const cssVariableName = `--cell-${createTargetTokenKey(tokenSlot.tokenSlotId)}`;

    if (tokenSlot.valueType === "typography") {
      style[`${cssVariableName}-font-family`] = toCssVariableValue(tokenRef, "font-family");
      style[`${cssVariableName}-font-size`] = toCssVariableValue(tokenRef, "font-size");
      style[`${cssVariableName}-font-weight`] = toCssVariableValue(tokenRef, "font-weight");
      style[`${cssVariableName}-letter-spacing`] = toCssVariableValue(tokenRef, "letter-spacing");
      style[`${cssVariableName}-line-height`] = toCssVariableValue(tokenRef, "line-height");
    } else {
      style[cssVariableName] = toCssVariableValue(tokenRef);
    }
  }

  return removeEmptyStyleValues(style);
}

function toCssVariableValue(tokenRef: string | undefined, suffix?: string) {
  if (!tokenRef) return undefined;

  const tokenKey = suffix ? `${tokenRef}.${suffix}` : tokenRef;
  return `var(--${createTargetTokenKey(tokenKey)})`;
}

function createTargetTokenKey(tokenRef: string) {
  return tokenRef
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function removeEmptyStyleValues(style: CellStyle) {
  return Object.fromEntries(
    Object.entries(style).filter(([, value]) => value !== undefined),
  ) as React.CSSProperties;
}

