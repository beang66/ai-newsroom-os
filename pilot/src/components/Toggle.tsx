import * as React from "react";

export type ToggleMode = "light";
export type ToggleVariant = "default" | "checked";
export type ToggleState = "default" | "disabled";
export type ToggleSize = "sm" | "md" | "lg";

export type ToggleProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "children" | "checked" | "size" | "type"
> & {
  checked?: boolean;
  label?: React.ReactNode;
  mode: ToggleMode;
  showLabel?: boolean;
  size?: ToggleSize;
  state?: ToggleState;
  variant?: ToggleVariant;
};

type ToggleStyle = React.CSSProperties & Record<string, string | number | undefined>;
type ToggleResolvedStyles = {
  label: React.CSSProperties;
  root: React.CSSProperties;
  thumb: React.CSSProperties;
  thumbSlot: React.CSSProperties;
  track: React.CSSProperties;
};

const toggleTokenBindings = {
  "light": {
    "checked": {
      "default": {
        "label": "color.text.body",
        "number.control.border.width": "border.width.1",
        "number.control.gap.trackToLabel": "space.8",
        "number.control.shape.radius": "radius.full",
        "number.control.size.thumb.lg": "size.20",
        "number.control.size.thumb.md": "size.16",
        "number.control.size.thumb.sm": "size.12",
        "number.control.size.trackHeight.lg": "size.24",
        "number.control.size.trackHeight.md": "size.20",
        "number.control.size.trackHeight.sm": "size.16",
        "number.control.size.trackWidth.lg": "space.40",
        "number.control.size.trackWidth.md": "space.36",
        "number.control.size.trackWidth.sm": "space.32",
        "thumb.bg": "color.surface.canvas",
        "track.bg": "color.shades.brand.color-one.strong-one",
        "track.border": "color.border.interaction.selected",
        "typography.text.label.lg": "font.body.medium",
        "typography.text.label.md": "font.body.medium",
        "typography.text.label.sm": "font.body.medium"
      },
      "disabled": {
        "label": "color.text.body.muted",
        "number.control.border.width": "border.width.1",
        "number.control.gap.trackToLabel": "space.8",
        "number.control.shape.radius": "radius.full",
        "number.control.size.thumb.lg": "size.20",
        "number.control.size.thumb.md": "size.16",
        "number.control.size.thumb.sm": "size.12",
        "number.control.size.trackHeight.lg": "size.24",
        "number.control.size.trackHeight.md": "size.20",
        "number.control.size.trackHeight.sm": "size.16",
        "number.control.size.trackWidth.lg": "space.40",
        "number.control.size.trackWidth.md": "space.36",
        "number.control.size.trackWidth.sm": "space.32",
        "thumb.bg": "color.surface.canvas",
        "track.bg": "color.surface.interaction.disabled",
        "track.border": "color.border.neutral.subtle.three",
        "typography.text.label.lg": "font.body.medium",
        "typography.text.label.md": "font.body.medium",
        "typography.text.label.sm": "font.body.medium"
      }
    },
    "default": {
      "default": {
        "label": "color.text.body",
        "number.control.border.width": "border.width.1",
        "number.control.gap.trackToLabel": "space.8",
        "number.control.shape.radius": "radius.full",
        "number.control.size.thumb.lg": "size.20",
        "number.control.size.thumb.md": "size.16",
        "number.control.size.thumb.sm": "size.12",
        "number.control.size.trackHeight.lg": "size.24",
        "number.control.size.trackHeight.md": "size.20",
        "number.control.size.trackHeight.sm": "size.16",
        "number.control.size.trackWidth.lg": "space.40",
        "number.control.size.trackWidth.md": "space.36",
        "number.control.size.trackWidth.sm": "space.32",
        "thumb.bg": "color.surface.canvas",
        "track.bg": "color.shades.neutral.subtle-three",
        "track.border": "color.border.neutral.subtle.three",
        "typography.text.label.lg": "font.body.medium",
        "typography.text.label.md": "font.body.medium",
        "typography.text.label.sm": "font.body.medium"
      },
      "disabled": {
        "label": "color.text.body.muted",
        "number.control.border.width": "border.width.1",
        "number.control.gap.trackToLabel": "space.8",
        "number.control.shape.radius": "radius.full",
        "number.control.size.thumb.lg": "size.20",
        "number.control.size.thumb.md": "size.16",
        "number.control.size.thumb.sm": "size.12",
        "number.control.size.trackHeight.lg": "size.24",
        "number.control.size.trackHeight.md": "size.20",
        "number.control.size.trackHeight.sm": "size.16",
        "number.control.size.trackWidth.lg": "space.40",
        "number.control.size.trackWidth.md": "space.36",
        "number.control.size.trackWidth.sm": "space.32",
        "thumb.bg": "color.surface.canvas",
        "track.bg": "color.surface.interaction.disabled",
        "track.border": "color.border.interaction.disabled",
        "typography.text.label.lg": "font.body.medium",
        "typography.text.label.md": "font.body.medium",
        "typography.text.label.sm": "font.body.medium"
      }
    }
  }
} as const;
const toggleRecipe = {
  "anatomy": {
    "labelContent": "Toggle label",
    "labelId": "label",
    "labelVisibilityProperty": "Show Label",
    "rootAlign": "center",
    "rootChildNamesByVariant": {
      "default": [
        "Track",
        "Label"
      ],
      "checked": [
        "Track",
        "Label"
      ]
    },
    "rootChildOrderByVariant": {
      "default": [
        "track",
        "label"
      ],
      "checked": [
        "track",
        "label"
      ]
    },
    "rootDirection": "horizontal",
    "rootId": "root",
    "thumbId": "thumb",
    "thumbSlotAlign": "center",
    "thumbSlotChildNames": [
      "Thumb"
    ],
    "thumbSlotChildOrder": [
      "thumb"
    ],
    "thumbSlotDirection": "horizontal",
    "thumbSlotId": "thumb-slot",
    "thumbSlotJustify": "center",
    "trackAlign": "center",
    "trackChildNamesByVariant": {
      "default": [
        "Thumb Slot"
      ],
      "checked": [
        "Thumb Slot"
      ]
    },
    "trackChildOrderByVariant": {
      "default": [
        "thumb-slot"
      ],
      "checked": [
        "thumb-slot"
      ]
    },
    "trackDirection": "horizontal",
    "trackId": "track",
    "trackJustifyByVariant": {
      "default": "start",
      "checked": "end"
    }
  },
  "colorSlotIds": {
    "label": "label",
    "thumbBackground": "thumb.bg",
    "trackBackground": "track.bg",
    "trackBorder": "track.border"
  },
  "componentId": "component.toggle",
  "componentProperties": {
    "Show Label": {
      "type": "boolean",
      "defaultValue": true
    }
  },
  "content": {
    "defaultLabel": "Toggle label"
  },
  "defaultSize": "md",
  "defaultState": "default",
  "defaultVariant": "default",
  "numberSlotIds": {
    "borderWidth": "number.control.border.width",
    "radius": "number.control.shape.radius",
    "trackToLabelGap": "number.control.gap.trackToLabel"
  },
  "numberSlotIdsBySize": {
    "sm": {
      "thumbSize": "number.control.size.thumb.sm",
      "trackHeight": "number.control.size.trackHeight.sm",
      "trackWidth": "number.control.size.trackWidth.sm"
    },
    "md": {
      "thumbSize": "number.control.size.thumb.md",
      "trackHeight": "number.control.size.trackHeight.md",
      "trackWidth": "number.control.size.trackWidth.md"
    },
    "lg": {
      "thumbSize": "number.control.size.thumb.lg",
      "trackHeight": "number.control.size.trackHeight.lg",
      "trackWidth": "number.control.size.trackWidth.lg"
    }
  },
  "typographySlotIdsBySize": {
    "sm": {
      "label": "typography.text.label.sm"
    },
    "md": {
      "label": "typography.text.label.md"
    },
    "lg": {
      "label": "typography.text.label.lg"
    }
  },
  "visibilityProperties": {
    "label": "Show Label"
  }
} as const;
const toggleStateIds = {
  default: toggleRecipe.defaultState,
  disabled: "disabled",
} as const;

export function Toggle({
  checked,
  disabled,
  label = toggleRecipe.content.defaultLabel,
  mode,
  showLabel = toggleRecipe.componentProperties[toggleRecipe.visibilityProperties.label].defaultValue,
  size = toggleRecipe.defaultSize,
  state,
  style,
  variant,
  ...props
}: ToggleProps) {
  const resolvedVariant = variant ?? (checked ? "checked" : toggleRecipe.defaultVariant);
  const resolvedState = state ?? (disabled ? toggleStateIds.disabled : toggleRecipe.defaultState);
  const isChecked = checked ?? resolvedVariant === "checked";
  const isDisabled = disabled || resolvedState === toggleStateIds.disabled;
  const inputReadOnly =
    props.readOnly ?? (isChecked !== undefined && props.onChange === undefined ? true : undefined);
  const tokenStyles = getToggleTokenStyles({
    mode,
    size,
    state: resolvedState,
    variant: resolvedVariant,
  });

  return (
    <label
      data-alpy-component={toggleRecipe.componentId}
      data-alpy-mode={mode}
      data-alpy-show-label={String(showLabel)}
      data-alpy-size={size}
      data-alpy-state={resolvedState}
      data-alpy-variant={resolvedVariant}
      style={{ ...tokenStyles.root, ...style }}
    >
      <span
        aria-hidden="true"
        data-alpy-slot={toggleRecipe.anatomy.trackId}
        style={tokenStyles.track}
      >
        <span
          data-alpy-slot={toggleRecipe.anatomy.thumbSlotId}
          style={tokenStyles.thumbSlot}
        >
          <span
            data-alpy-slot={toggleRecipe.anatomy.thumbId}
            style={tokenStyles.thumb}
          />
        </span>
      </span>
      {showLabel ? (
        <span data-alpy-slot={toggleRecipe.anatomy.labelId} style={tokenStyles.label}>
          {label}
        </span>
      ) : null}
      <input
        {...props}
        checked={isChecked}
        data-alpy-control="input"
        disabled={isDisabled}
        readOnly={inputReadOnly}
        role="switch"
        style={inputStyle}
        type="checkbox"
      />
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  height: 1,
  margin: 0,
  opacity: 0,
  position: "absolute",
  width: 1,
};

function getToggleTokenStyles({
  mode,
  size,
  state,
  variant,
}: {
  mode: ToggleMode;
  size: ToggleSize;
  state: ToggleState;
  variant: ToggleVariant;
}): ToggleResolvedStyles {
  const byState = toggleTokenBindings[mode]?.[variant]?.[state];

  if (!byState) {
    throw new Error("Missing canonical Toggle token bindings: " + mode + "/" + variant + "/" + state);
  }

  const anatomy = toggleRecipe.anatomy;
  const colorSlots = toggleRecipe.colorSlotIds;
  const numberSlots = toggleRecipe.numberSlotIds;
  const sizeSlots = toggleRecipe.numberSlotIdsBySize[size];
  const typographySlots = toggleRecipe.typographySlotIdsBySize[size];

  if (!sizeSlots || !typographySlots) {
    throw new Error("Missing canonical Toggle size: " + size);
  }

  const radius = toCssVariableValue(readToggleToken(byState, numberSlots.radius));
  const labelColor = toCssVariableValue(readToggleToken(byState, colorSlots.label));
  const labelText = readToggleToken(byState, typographySlots.label);
  const trackHeight = toCssVariableValue(readToggleToken(byState, sizeSlots.trackHeight));

  return {
    root: removeEmptyStyleValues({
      alignItems: toFlexAlign(anatomy.rootAlign),
      color: labelColor,
      cursor: state === toggleStateIds.disabled ? "not-allowed" : "pointer",
      display: "inline-flex",
      flexDirection: toFlexDirection(anatomy.rootDirection),
      gap: toCssVariableValue(readToggleToken(byState, numberSlots.trackToLabelGap)),
      position: "relative",
    } as ToggleStyle),
    track: removeEmptyStyleValues({
      alignItems: toFlexAlign(anatomy.trackAlign),
      background: toCssVariableValue(readToggleToken(byState, colorSlots.trackBackground)),
      borderColor: toCssVariableValue(readToggleToken(byState, colorSlots.trackBorder)),
      borderRadius: radius,
      borderStyle: "solid",
      borderWidth: toCssVariableValue(readToggleToken(byState, numberSlots.borderWidth)),
      display: "inline-flex",
      flex: "0 0 auto",
      flexDirection: toFlexDirection(anatomy.trackDirection),
      height: trackHeight,
      justifyContent: getToggleTrackJustify(variant),
      width: toCssVariableValue(readToggleToken(byState, sizeSlots.trackWidth)),
    } as ToggleStyle),
    thumbSlot: removeEmptyStyleValues({
      alignItems: toFlexAlign(anatomy.thumbSlotAlign),
      display: "inline-flex",
      flexDirection: toFlexDirection(anatomy.thumbSlotDirection),
      height: trackHeight,
      justifyContent: toFlexJustify(anatomy.thumbSlotJustify),
      width: trackHeight,
    } as ToggleStyle),
    thumb: removeEmptyStyleValues({
      background: toCssVariableValue(readToggleToken(byState, colorSlots.thumbBackground)),
      borderRadius: radius,
      display: "inline-block",
      height: toCssVariableValue(readToggleToken(byState, sizeSlots.thumbSize)),
      width: toCssVariableValue(readToggleToken(byState, sizeSlots.thumbSize)),
    } as ToggleStyle),
    label: removeEmptyStyleValues({
      color: labelColor,
      fontFamily: toCssTypographyFamilyValue(labelText),
      fontSize: toCssVariableValue(labelText, "font-size"),
      fontWeight: toCssVariableValue(labelText, "font-weight"),
      letterSpacing: toCssVariableValue(labelText, "letter-spacing"),
      lineHeight: toCssVariableValue(labelText, "line-height"),
    } as ToggleStyle),
  };
}

function getToggleTrackJustify(variant: ToggleVariant) {
  const justify = toggleRecipe.anatomy.trackJustifyByVariant[variant];

  if (!justify) {
    throw new Error("Missing canonical Toggle track justify: " + variant);
  }

  return toFlexJustify(justify);
}

function readToggleToken(bindings: Record<string, string>, tokenSlotId: string) {
  const tokenRef = bindings[tokenSlotId];

  if (!tokenRef) {
    throw new Error("Missing canonical Toggle token slot binding: " + tokenSlotId);
  }

  return tokenRef;
}

function toFlexAlign(value: string) {
  if (value === "center") return "center";
  if (value === "start") return "flex-start";
  if (value === "end") return "flex-end";

  throw new Error("Unsupported canonical Toggle alignment: " + value);
}

function toFlexDirection(value: string) {
  if (value === "horizontal") return "row";
  if (value === "vertical") return "column";

  throw new Error("Unsupported canonical Toggle direction: " + value);
}

function toFlexJustify(value: string) {
  if (value === "center") return "center";
  if (value === "start") return "flex-start";
  if (value === "end") return "flex-end";

  throw new Error("Unsupported canonical Toggle placement: " + value);
}

function toCssTypographyFamilyValue(tokenRef: string | undefined) {
  const tokenValue = toCssVariableValue(tokenRef, "font-family");

  return tokenValue
    ? tokenValue + ", ui-sans-serif, system-ui, sans-serif"
    : undefined;
}

function toCssVariableValue(tokenRef: string | undefined, suffix?: string) {
  if (!tokenRef) return undefined;

  const tokenKey = suffix ? tokenRef + "." + suffix : tokenRef;
  return "var(--" + createTargetTokenKey(tokenKey) + ")";
}

function createTargetTokenKey(tokenRef: string) {
  return tokenRef
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function removeEmptyStyleValues<T extends Record<string, unknown>>(style: T) {
  return Object.fromEntries(
    Object.entries(style).filter(([, value]) => value !== undefined),
  ) as T;
}

