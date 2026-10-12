import * as React from "react";

export type CheckboxMode = "light";
export type CheckboxVariant = "single" | "group";
export type CheckboxState = "default" | "selected" | "error" | "disabled";
export type CheckboxSize = "sm" | "md" | "lg";
export type CheckboxFocus = "off" | "on";

export type CheckboxValue = React.InputHTMLAttributes<HTMLInputElement>["value"];

export type CheckboxItem = {
  checked?: boolean;
  description?: React.ReactNode;
  disabled?: boolean;
  id?: string;
  label?: React.ReactNode;
  state?: CheckboxState;
  value?: CheckboxValue;
};

export type CheckboxProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "children" | "size" | "type"
> & {
  description?: React.ReactNode;
  focus?: CheckboxFocus;
  groupHeading?: React.ReactNode;
  items?: readonly CheckboxItem[];
  label?: React.ReactNode;
  mode: CheckboxMode;
  showDescription?: boolean;
  showLabel?: boolean;
  size?: CheckboxSize;
  state?: CheckboxState;
  variant?: CheckboxVariant;
};

type CheckboxInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "children" | "size" | "type"
>;
type CheckboxResolvedStyles = {
  box: React.CSSProperties;
  checkmark: React.CSSProperties;
  controlContainer: React.CSSProperties;
  description: React.CSSProperties;
  focusRing: React.CSSProperties;
  groupHeading: React.CSSProperties;
  groupItems: React.CSSProperties;
  groupRoot: React.CSSProperties;
  hitAreaCarrier: React.CSSProperties;
  item: React.CSSProperties;
  label: React.CSSProperties;
  textStack: React.CSSProperties;
};
type CheckboxIconPathDefinition = {
  isStroke: boolean;
  path: string;
  viewBoxSize?: number;
  windingRule: string;
};

const checkboxTokenBindings = {
  "light": {
    "group": {
      "default": {
        "number.border.width": "border.width.1",
        "number.gap.boxToText": "space.8",
        "number.gap.headerToItems": "space.8",
        "number.gap.itemToItem": "space.8",
        "number.gap.labelToDescription": "space.0",
        "number.ring.width": "border.width.2",
        "number.shape.radius": "radius.xsmall",
        "number.size.box.lg": "size.24",
        "number.size.box.md": "size.20",
        "number.size.box.sm": "size.16",
        "number.size.focusRing.lg": "space.28",
        "number.size.focusRing.md": "space.24",
        "number.size.focusRing.sm": "space.20",
        "number.size.hitArea": "size.44",
        "off.box.bg": "color.surface.canvas",
        "off.box.border": "color.border.neutral.subtle.three",
        "off.checkmark": "color.icon.default",
        "off.text.description": "color.text.body.muted",
        "off.text.label": "color.text.body",
        "on.box.bg": "color.surface.canvas",
        "on.box.border": "color.border.neutral.subtle.three",
        "on.checkmark": "color.icon.default",
        "on.text.description": "color.text.body.muted",
        "on.text.label": "color.text.body",
        "ring.color": "color.border.interaction.focused",
        "typography.text.description": "font.body.small",
        "typography.text.groupHeading": "font.body.small",
        "typography.text.label": "font.body.medium"
      },
      "disabled": {
        "number.border.width": "border.width.1",
        "number.gap.boxToText": "space.8",
        "number.gap.headerToItems": "space.8",
        "number.gap.itemToItem": "space.8",
        "number.gap.labelToDescription": "space.0",
        "number.ring.width": "border.width.2",
        "number.shape.radius": "radius.xsmall",
        "number.size.box.lg": "size.24",
        "number.size.box.md": "size.20",
        "number.size.box.sm": "size.16",
        "number.size.focusRing.lg": "space.28",
        "number.size.focusRing.md": "space.24",
        "number.size.focusRing.sm": "space.20",
        "number.size.hitArea": "size.44",
        "off.box.bg": "color.surface.interaction.disabled",
        "off.box.border": "color.border.neutral.subtle.three",
        "off.checkmark": "color.icon.disabled",
        "off.text.description": "color.text.body.muted",
        "off.text.label": "color.text.body.muted",
        "on.box.bg": "color.surface.interaction.disabled",
        "on.box.border": "color.border.neutral.subtle.three",
        "on.checkmark": "color.icon.disabled",
        "on.text.description": "color.text.body.muted",
        "on.text.label": "color.text.body.muted",
        "ring.color": "color.border.interaction.focused",
        "typography.text.description": "font.body.small",
        "typography.text.groupHeading": "font.body.small",
        "typography.text.label": "font.body.medium"
      },
      "error": {
        "number.border.width": "border.width.1",
        "number.gap.boxToText": "space.8",
        "number.gap.headerToItems": "space.8",
        "number.gap.itemToItem": "space.8",
        "number.gap.labelToDescription": "space.0",
        "number.ring.width": "border.width.2",
        "number.shape.radius": "radius.xsmall",
        "number.size.box.lg": "size.24",
        "number.size.box.md": "size.20",
        "number.size.box.sm": "size.16",
        "number.size.focusRing.lg": "space.28",
        "number.size.focusRing.md": "space.24",
        "number.size.focusRing.sm": "space.20",
        "number.size.hitArea": "size.44",
        "off.box.bg": "color.functional.danger.soft",
        "off.box.border": "color.border.neutral.subtle.three",
        "off.checkmark": "color.icon.onColor",
        "off.text.description": "color.text.functional.danger",
        "off.text.label": "color.text.functional.danger",
        "on.box.bg": "color.functional.danger.soft",
        "on.box.border": "color.border.neutral.subtle.three",
        "on.checkmark": "color.icon.onColor",
        "on.text.description": "color.text.functional.danger",
        "on.text.label": "color.text.functional.danger",
        "ring.color": "color.border.interaction.focused",
        "typography.text.description": "font.body.small",
        "typography.text.groupHeading": "font.body.small",
        "typography.text.label": "font.body.medium"
      },
      "selected": {
        "number.border.width": "border.width.1",
        "number.gap.boxToText": "space.8",
        "number.gap.headerToItems": "space.8",
        "number.gap.itemToItem": "space.8",
        "number.gap.labelToDescription": "space.0",
        "number.ring.width": "border.width.2",
        "number.shape.radius": "radius.xsmall",
        "number.size.box.lg": "size.24",
        "number.size.box.md": "size.20",
        "number.size.box.sm": "size.16",
        "number.size.focusRing.lg": "space.28",
        "number.size.focusRing.md": "space.24",
        "number.size.focusRing.sm": "space.20",
        "number.size.hitArea": "size.44",
        "off.box.bg": "color.shades.brand.color-one.strong-one",
        "off.box.border": "color.border.interaction.selected",
        "off.checkmark": "color.icon.onColor",
        "off.text.description": "color.text.body.muted",
        "off.text.label": "color.text.body",
        "on.box.bg": "color.shades.brand.color-one.strong-one",
        "on.box.border": "color.border.interaction.selected",
        "on.checkmark": "color.icon.onColor",
        "on.text.description": "color.text.body.muted",
        "on.text.label": "color.text.body",
        "ring.color": "color.border.interaction.focused",
        "typography.text.description": "font.body.small",
        "typography.text.groupHeading": "font.body.small",
        "typography.text.label": "font.body.medium"
      }
    },
    "single": {
      "default": {
        "number.border.width": "border.width.1",
        "number.gap.boxToText": "space.8",
        "number.gap.headerToItems": "space.8",
        "number.gap.itemToItem": "space.8",
        "number.gap.labelToDescription": "space.0",
        "number.ring.width": "border.width.2",
        "number.shape.radius": "radius.xsmall",
        "number.size.box.lg": "size.24",
        "number.size.box.md": "size.20",
        "number.size.box.sm": "size.16",
        "number.size.focusRing.lg": "space.28",
        "number.size.focusRing.md": "space.24",
        "number.size.focusRing.sm": "space.20",
        "number.size.hitArea": "size.44",
        "off.box.bg": "color.surface.canvas",
        "off.box.border": "color.border.neutral.subtle.three",
        "off.checkmark": "color.icon.default",
        "off.text.description": "color.text.body.muted",
        "off.text.label": "color.text.body",
        "on.box.bg": "color.surface.canvas",
        "on.box.border": "color.border.neutral.subtle.three",
        "on.checkmark": "color.icon.default",
        "on.text.description": "color.text.body.muted",
        "on.text.label": "color.text.body",
        "ring.color": "color.border.interaction.focused",
        "typography.text.description": "font.body.small",
        "typography.text.groupHeading": "font.body.small",
        "typography.text.label": "font.body.medium"
      },
      "disabled": {
        "number.border.width": "border.width.1",
        "number.gap.boxToText": "space.8",
        "number.gap.headerToItems": "space.8",
        "number.gap.itemToItem": "space.8",
        "number.gap.labelToDescription": "space.0",
        "number.ring.width": "border.width.2",
        "number.shape.radius": "radius.xsmall",
        "number.size.box.lg": "size.24",
        "number.size.box.md": "size.20",
        "number.size.box.sm": "size.16",
        "number.size.focusRing.lg": "space.28",
        "number.size.focusRing.md": "space.24",
        "number.size.focusRing.sm": "space.20",
        "number.size.hitArea": "size.44",
        "off.box.bg": "color.surface.interaction.disabled",
        "off.box.border": "color.border.neutral.subtle.three",
        "off.checkmark": "color.icon.disabled",
        "off.text.description": "color.text.body.muted",
        "off.text.label": "color.text.body.muted",
        "on.box.bg": "color.surface.interaction.disabled",
        "on.box.border": "color.border.neutral.subtle.three",
        "on.checkmark": "color.icon.disabled",
        "on.text.description": "color.text.body.muted",
        "on.text.label": "color.text.body.muted",
        "ring.color": "color.border.interaction.focused",
        "typography.text.description": "font.body.small",
        "typography.text.groupHeading": "font.body.small",
        "typography.text.label": "font.body.medium"
      },
      "error": {
        "number.border.width": "border.width.1",
        "number.gap.boxToText": "space.8",
        "number.gap.headerToItems": "space.8",
        "number.gap.itemToItem": "space.8",
        "number.gap.labelToDescription": "space.0",
        "number.ring.width": "border.width.2",
        "number.shape.radius": "radius.xsmall",
        "number.size.box.lg": "size.24",
        "number.size.box.md": "size.20",
        "number.size.box.sm": "size.16",
        "number.size.focusRing.lg": "space.28",
        "number.size.focusRing.md": "space.24",
        "number.size.focusRing.sm": "space.20",
        "number.size.hitArea": "size.44",
        "off.box.bg": "color.functional.danger.soft",
        "off.box.border": "color.border.neutral.subtle.three",
        "off.checkmark": "color.icon.onColor",
        "off.text.description": "color.text.functional.danger",
        "off.text.label": "color.text.functional.danger",
        "on.box.bg": "color.functional.danger.soft",
        "on.box.border": "color.border.neutral.subtle.three",
        "on.checkmark": "color.icon.onColor",
        "on.text.description": "color.text.functional.danger",
        "on.text.label": "color.text.functional.danger",
        "ring.color": "color.border.interaction.focused",
        "typography.text.description": "font.body.small",
        "typography.text.groupHeading": "font.body.small",
        "typography.text.label": "font.body.medium"
      },
      "selected": {
        "number.border.width": "border.width.1",
        "number.gap.boxToText": "space.8",
        "number.gap.headerToItems": "space.8",
        "number.gap.itemToItem": "space.8",
        "number.gap.labelToDescription": "space.0",
        "number.ring.width": "border.width.2",
        "number.shape.radius": "radius.xsmall",
        "number.size.box.lg": "size.24",
        "number.size.box.md": "size.20",
        "number.size.box.sm": "size.16",
        "number.size.focusRing.lg": "space.28",
        "number.size.focusRing.md": "space.24",
        "number.size.focusRing.sm": "space.20",
        "number.size.hitArea": "size.44",
        "off.box.bg": "color.shades.brand.color-one.strong-one",
        "off.box.border": "color.border.interaction.selected",
        "off.checkmark": "color.icon.onColor",
        "off.text.description": "color.text.body.muted",
        "off.text.label": "color.text.body",
        "on.box.bg": "color.shades.brand.color-one.strong-one",
        "on.box.border": "color.border.interaction.selected",
        "on.checkmark": "color.icon.onColor",
        "on.text.description": "color.text.body.muted",
        "on.text.label": "color.text.body",
        "ring.color": "color.border.interaction.focused",
        "typography.text.description": "font.body.small",
        "typography.text.groupHeading": "font.body.small",
        "typography.text.label": "font.body.medium"
      }
    }
  }
} as const;
const checkboxIconPath: CheckboxIconPathDefinition = {
  "path": "M8.99387 20L2 12.4158L3.74847 10.5198L8.99387 16.2079L20.2515 4L22 5.89605L8.99387 20Z",
  "windingRule": "NONZERO",
  "isStroke": false,
  "viewBoxSize": 24
};
const checkboxIconSizeTokensByMode = {
  "light": "icon.size.12"
} as const;
const checkboxRecipe = {
  "colorSlotIdsByFocus": {
    "off": {
      "boxBackground": "off.box.bg",
      "boxBorder": "off.box.border",
      "checkmark": "off.checkmark",
      "description": "off.text.description",
      "label": "off.text.label"
    },
    "on": {
      "boxBackground": "on.box.bg",
      "boxBorder": "on.box.border",
      "checkmark": "on.checkmark",
      "description": "on.text.description",
      "label": "on.text.label"
    }
  },
  "defaultDescription": "Optional description text",
  "defaultFocus": "off",
  "defaultGroupHeading": "Group heading",
  "defaultLabel": "Checkbox label",
  "defaultShowDescription": false,
  "defaultShowLabel": true,
  "defaultSize": "sm",
  "defaultState": "default",
  "defaultVariant": "single",
  "focusRingColorSlotId": "ring.color",
  "iconId": "check",
  "iconSizeSlotId": "size.xs",
  "numberSlotIds": {
    "borderWidth": "number.border.width",
    "boxToTextGap": "number.gap.boxToText",
    "focusRingWidth": "number.ring.width",
    "groupHeaderToItemsGap": "number.gap.headerToItems",
    "groupItemToItemGap": "number.gap.itemToItem",
    "hitArea": "number.size.hitArea",
    "labelToDescriptionGap": "number.gap.labelToDescription",
    "radius": "number.shape.radius"
  },
  "numberSlotIdsBySize": {
    "sm": {
      "boxSize": "number.size.box.sm",
      "focusRingSize": "number.size.focusRing.sm"
    },
    "md": {
      "boxSize": "number.size.box.md",
      "focusRingSize": "number.size.focusRing.md"
    },
    "lg": {
      "boxSize": "number.size.box.lg",
      "focusRingSize": "number.size.focusRing.lg"
    }
  },
  "typographySlotIds": {
    "description": "typography.text.description",
    "groupHeading": "typography.text.groupHeading",
    "label": "typography.text.label"
  }
} as const;
const checkboxStateIds = {
  default: "default",
  disabled: "disabled",
  selected: "selected",
} as const;

export function Checkbox({
  checked,
  description = checkboxRecipe.defaultDescription,
  disabled,
  focus = "off",
  groupHeading = checkboxRecipe.defaultGroupHeading,
  id,
  items,
  label = checkboxRecipe.defaultLabel,
  mode,
  showDescription = false,
  showLabel = true,
  size = "sm",
  state,
  style,
  value,
  variant = "single",
  ...props
}: CheckboxProps) {
  const resolvedState =
    state ?? (disabled ? checkboxStateIds.disabled : checked ? checkboxStateIds.selected : checkboxRecipe.defaultState);
  const tokenStyles = getCheckboxTokenStyles({ focus, mode, size, state: resolvedState, variant });

  if (variant === "group") {
    const groupItems: readonly CheckboxItem[] = items && items.length > 0
      ? items
      : Array.from({ length: 5 }, (): CheckboxItem => ({
          description,
          label,
        }));

    return (
      <fieldset
        data-alpy-component="checkbox"
        data-alpy-focus={focus}
        data-alpy-mode={mode}
        data-alpy-size={size}
        data-alpy-state={resolvedState}
        data-alpy-variant={variant}
        disabled={disabled || resolvedState === checkboxStateIds.disabled}
      style={{ ...groupRootLayout, ...tokenStyles.groupRoot, ...style }}
      >
        <legend data-alpy-slot="Group Heading" style={{ ...groupHeadingLayout, ...tokenStyles.groupHeading }}>{groupHeading}</legend>
        <div data-alpy-slot="Items" style={{ ...groupItemsLayout, ...tokenStyles.groupItems }}>
          {groupItems.map((item, index) => {
            const itemState =
              item.state ??
              (item.disabled ? checkboxStateIds.disabled : item.checked ? checkboxStateIds.selected : resolvedState);
            const itemTokenStyles = getCheckboxTokenStyles({
              focus,
              mode,
              size,
              state: itemState,
              variant,
            });

            return (
              <CheckboxItemView
                key={item.id ?? index}
                checked={item.checked}
                description={item.description ?? description}
                disabled={item.disabled ?? disabled}
                focus={focus}
                id={item.id}
                inputProps={props}
                isRootComponent={false}
                label={item.label ?? label}
                mode={mode}
                showDescription={showDescription}
                showLabel={showLabel}
                size={size}
                state={itemState}
                tokenStyles={itemTokenStyles}
                value={item.value}
              />
            );
          })}
        </div>
      </fieldset>
    );
  }

  return (
    <CheckboxItemView
      checked={checked}
      description={description}
      disabled={disabled}
      focus={focus}
      id={id}
      inputProps={props}
      isRootComponent={true}
      label={label}
      mode={mode}
      showDescription={showDescription}
      showLabel={showLabel}
      size={size}
      state={resolvedState}
      style={style}
      tokenStyles={tokenStyles}
      value={value}
      variant={variant}
    />
  );
}

function CheckboxItemView({
  checked,
  description,
  disabled,
  focus,
  id,
  inputProps,
  isRootComponent,
  label,
  mode,
  showDescription,
  showLabel,
  size,
  state,
  style,
  tokenStyles,
  value,
  variant = checkboxRecipe.defaultVariant,
}: {
  checked: boolean | undefined;
  description: React.ReactNode;
  disabled: boolean | undefined;
  focus: CheckboxFocus;
  id?: string | undefined;
  inputProps: CheckboxInputProps;
  isRootComponent: boolean;
  label: React.ReactNode;
  mode: CheckboxMode;
  showDescription: boolean;
  showLabel: boolean;
  size: CheckboxSize;
  state: CheckboxState;
  style?: React.CSSProperties | undefined;
  tokenStyles: CheckboxResolvedStyles;
  value?: CheckboxValue | undefined;
  variant?: CheckboxVariant | undefined;
}) {
  const isSelected = state === checkboxStateIds.selected || checked === true;
  const isDisabled = disabled || state === checkboxStateIds.disabled;
  const inputChecked = isSelected ? true : checked;
  const inputReadOnly =
    inputProps.readOnly ?? (inputChecked !== undefined && inputProps.onChange === undefined ? true : undefined);

  return (
    <label
      data-alpy-component={isRootComponent ? "checkbox" : undefined}
      data-alpy-focus={focus}
      data-alpy-mode={mode}
      data-alpy-part={isRootComponent ? undefined : "checkbox-item"}
      data-alpy-size={size}
      data-alpy-state={state}
      data-alpy-variant={variant}
      style={{ ...checkboxItemLayout, ...tokenStyles.item, ...style }}
    >
      <span data-alpy-slot="Box Container" style={{ ...controlContainerLayout, ...tokenStyles.controlContainer }}>
        <span aria-hidden="true" data-alpy-slot="Hit Area Carrier" hidden style={{ ...hitAreaCarrierLayout, ...tokenStyles.hitAreaCarrier }} />
        {focus === "on" ? (
          <span aria-hidden="true" data-alpy-slot="Focus Ring" style={{ ...focusRingLayout, ...tokenStyles.focusRing }}>
            <CheckboxBox isSelected={isSelected} tokenStyles={tokenStyles} />
          </span>
        ) : (
          <CheckboxBox isSelected={isSelected} tokenStyles={tokenStyles} />
        )}
      </span>
      {showLabel || showDescription ? (
        <span data-alpy-slot="Text Stack" style={{ ...textStackLayout, ...tokenStyles.textStack }}>
          {showLabel ? <span data-alpy-slot="Label" style={tokenStyles.label}>{label}</span> : null}
          {showDescription ? (
            <span data-alpy-slot="Description" style={tokenStyles.description}>{description}</span>
          ) : null}
        </span>
      ) : null}
      <input
        {...inputProps}
        checked={inputChecked}
        data-alpy-control="input"
        disabled={isDisabled}
        id={id}
        readOnly={inputReadOnly}
        style={inputStyle}
        type="checkbox"
        value={value}
      />
    </label>
  );
}

function CheckboxBox({
  isSelected,
  tokenStyles,
}: {
  isSelected: boolean;
  tokenStyles: CheckboxResolvedStyles;
}) {
  return (
    <span data-alpy-slot="Box" style={{ ...boxLayout, ...tokenStyles.box }}>
      {isSelected ? <CheckboxCheckmarkIcon tokenStyles={tokenStyles} /> : null}
    </span>
  );
}

function CheckboxCheckmarkIcon({
  tokenStyles,
}: {
  tokenStyles: CheckboxResolvedStyles;
}) {
  const viewBoxSize = checkboxIconPath.viewBoxSize ?? 24;
  const windingRule = checkboxIconPath.windingRule === "EVENODD" ? "evenodd" : "nonzero";

  return (
    <svg
      aria-hidden="true"
      data-alpy-icon-id={checkboxRecipe.iconId}
      data-alpy-slot="Checkmark"
      fill="none"
      focusable="false"
      style={tokenStyles.checkmark}
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        clipRule={windingRule}
        d={checkboxIconPath.path}
        fill={checkboxIconPath.isStroke ? "none" : "currentColor"}
        fillRule={windingRule}
        stroke={checkboxIconPath.isStroke ? "currentColor" : undefined}
        strokeLinecap={checkboxIconPath.isStroke ? "round" : undefined}
        strokeLinejoin={checkboxIconPath.isStroke ? "round" : undefined}
        strokeWidth={checkboxIconPath.isStroke ? 2 : undefined}
      />
    </svg>
  );
}

const groupRootLayout: React.CSSProperties = {
  border: 0,
  display: "inline-flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
};

const groupHeadingLayout: React.CSSProperties = {
  margin: 0,
  padding: 0,
};

const groupItemsLayout: React.CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
};

const checkboxItemLayout: React.CSSProperties = {
  alignItems: "flex-start",
  cursor: "pointer",
  display: "inline-flex",
  position: "relative",
};

const controlContainerLayout: React.CSSProperties = {
  alignItems: "center",
  display: "inline-flex",
  flex: "0 0 auto",
  justifyContent: "center",
};

const hitAreaCarrierLayout: React.CSSProperties = {};

const focusRingLayout: React.CSSProperties = {
  alignItems: "center",
  borderStyle: "solid",
  display: "inline-flex",
  justifyContent: "center",
};

const boxLayout: React.CSSProperties = {
  alignItems: "center",
  borderStyle: "solid",
  display: "inline-flex",
  justifyContent: "center",
};

const textStackLayout: React.CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
};

const inputStyle: React.CSSProperties = {
  height: 1,
  margin: 0,
  opacity: 0,
  position: "absolute",
  width: 1,
};

function getCheckboxTokenStyles({
  focus,
  mode,
  size,
  state,
  variant,
}: {
  focus: CheckboxFocus;
  mode: CheckboxMode;
  size: CheckboxSize;
  state: CheckboxState;
  variant: CheckboxVariant;
}): CheckboxResolvedStyles {
  const byState = checkboxTokenBindings[mode]?.[variant]?.[state];

  if (!byState) {
    throw new Error(`Missing canonical Checkbox token bindings: ${mode}/${variant}/${state}`);
  }

  const colorSlots = checkboxRecipe.colorSlotIdsByFocus[focus];
  const numberSlots = checkboxRecipe.numberSlotIds;
  const sizeSlots = checkboxRecipe.numberSlotIdsBySize[size];
  const typographySlots = checkboxRecipe.typographySlotIds;
  const iconSizeToken = checkboxIconSizeTokensByMode[mode];

  if (!colorSlots) {
    throw new Error(`Missing canonical Checkbox focus: ${focus}`);
  }

  if (!sizeSlots) {
    throw new Error(`Missing canonical Checkbox size: ${size}`);
  }

  if (!iconSizeToken) {
    throw new Error(`Missing canonical Checkbox nested Icon size token: ${mode}/${checkboxRecipe.iconSizeSlotId}`);
  }

  const labelText = readCheckboxToken(byState, typographySlots.label);
  const descriptionText = readCheckboxToken(byState, typographySlots.description);
  const groupHeadingText = readCheckboxToken(byState, typographySlots.groupHeading);
  const boxContainerSlot =
    focus === "on" ? sizeSlots.focusRingSize : sizeSlots.boxSize;
  const boxSize = toCssVariableValue(readCheckboxToken(byState, sizeSlots.boxSize));
  const boxContainerSize = toCssVariableValue(readCheckboxToken(byState, boxContainerSlot));
  const focusRingSize = toCssVariableValue(readCheckboxToken(byState, sizeSlots.focusRingSize));
  const hitArea = toCssVariableValue(readCheckboxToken(byState, numberSlots.hitArea));
  const labelColor = toCssVariableValue(readCheckboxToken(byState, colorSlots.label));
  const radius = toCssVariableValue(readCheckboxToken(byState, numberSlots.radius));

  return {
    box: {
      background: toCssVariableValue(readCheckboxToken(byState, colorSlots.boxBackground)),
      borderColor: toCssVariableValue(readCheckboxToken(byState, colorSlots.boxBorder)),
      borderRadius: radius,
      borderWidth: toCssVariableValue(readCheckboxToken(byState, numberSlots.borderWidth)),
      height: boxSize,
      width: boxSize,
    },
    checkmark: {
      color: toCssVariableValue(readCheckboxToken(byState, colorSlots.checkmark)),
      height: toCssVariableValue(iconSizeToken),
      width: toCssVariableValue(iconSizeToken),
    },
    controlContainer: {
      height: boxContainerSize,
      width: boxContainerSize,
    },
    description: {
      color: toCssVariableValue(readCheckboxToken(byState, colorSlots.description)),
      fontFamily: toCssTypographyFamilyValue(descriptionText),
      fontSize: toCssVariableValue(descriptionText, "font-size"),
      fontWeight: toCssVariableValue(descriptionText, "font-weight"),
      letterSpacing: toCssVariableValue(descriptionText, "letter-spacing"),
      lineHeight: toCssVariableValue(descriptionText, "line-height"),
    },
    focusRing: {
      borderColor: toCssVariableValue(readCheckboxToken(byState, checkboxRecipe.focusRingColorSlotId)),
      borderRadius: radius,
      borderWidth: toCssVariableValue(readCheckboxToken(byState, numberSlots.focusRingWidth)),
      height: focusRingSize,
      width: focusRingSize,
    },
    groupHeading: {
      color: labelColor,
      fontFamily: toCssTypographyFamilyValue(groupHeadingText),
      fontSize: toCssVariableValue(groupHeadingText, "font-size"),
      fontWeight: toCssVariableValue(groupHeadingText, "font-weight"),
      letterSpacing: toCssVariableValue(groupHeadingText, "letter-spacing"),
      lineHeight: toCssVariableValue(groupHeadingText, "line-height"),
    },
    groupItems: {
      gap: toCssVariableValue(readCheckboxToken(byState, numberSlots.groupItemToItemGap)),
    },
    groupRoot: {
      gap: toCssVariableValue(readCheckboxToken(byState, numberSlots.groupHeaderToItemsGap)),
    },
    hitAreaCarrier: {
      height: hitArea,
      width: hitArea,
    },
    item: {
      color: labelColor,
      gap: toCssVariableValue(readCheckboxToken(byState, numberSlots.boxToTextGap)),
    },
    label: {
      color: labelColor,
      fontFamily: toCssTypographyFamilyValue(labelText),
      fontSize: toCssVariableValue(labelText, "font-size"),
      fontWeight: toCssVariableValue(labelText, "font-weight"),
      letterSpacing: toCssVariableValue(labelText, "letter-spacing"),
      lineHeight: toCssVariableValue(labelText, "line-height"),
    },
    textStack: {
      gap: toCssVariableValue(readCheckboxToken(byState, numberSlots.labelToDescriptionGap)),
    },
  };
}

function readCheckboxToken(bindings: Record<string, string>, tokenSlotId: string) {
  const tokenRef = bindings[tokenSlotId];

  if (!tokenRef) {
    throw new Error(`Missing canonical Checkbox token slot binding: ${tokenSlotId}`);
  }

  return tokenRef;
}

function toCssTypographyFamilyValue(tokenRef: string | undefined) {
  const tokenValue = toCssVariableValue(tokenRef, "font-family");

  return tokenValue
    ? `${tokenValue}, ui-sans-serif, system-ui, sans-serif`
    : undefined;
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


