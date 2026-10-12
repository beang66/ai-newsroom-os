import * as React from "react";

export type AlertMode = "light";
export type AlertVariant = "info" | "success" | "warning" | "danger" | "basic";
export type AlertState = "default";
export type AlertIconId = "info" | "check" | "warning" | "x" | "simple";
export type AlertCtaMode = "No CTA" | "One CTA" | "Two CTAs";

export type AlertProps = Omit<
  React.HTMLAttributes<HTMLElement>,
  "children" | "title"
> & {
  action?: React.ReactNode;
  ctaMode?: AlertCtaMode;
  description?: React.ReactNode;
  iconId?: AlertIconId;
  mode: AlertMode;
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  showActions?: boolean;
  showDescription?: boolean;
  showIcon?: boolean;
  state?: AlertState;
  title?: React.ReactNode;
  variant?: AlertVariant;
};

type AlertStyle = React.CSSProperties & Record<string, string | number | undefined>;
type AlertIconPathDefinition = {
  path: string;
  windingRule: string;
  isStroke: boolean;
  viewBoxSize?: number;
};
type AlertTypographyStyle = Partial<Pick<
  React.CSSProperties,
  "fontFamily" | "fontSize" | "fontWeight" | "letterSpacing" | "lineHeight"
>>;
type AlertCanonicalTokenValues = {
  color: Record<string, string | undefined>;
  number: Record<string, string | undefined>;
  typography: Record<string, AlertTypographyStyle | undefined>;
};

const alertTokenBindings = {
  "light": {
    "basic": {
      "default": {
        "body": "color.text.body",
        "icon": "color.icon.default",
        "title": "color.text.heading",
        "border": "color.border.neutral.subtle.two",
        "background": "color.surface.canvas",
        "iconBorder": "color.icon.default",
        "number.gap": "space.12",
        "number.gap.cta": "space.12",
        "number.gap.content": "space.4",
        "number.border.width": "border.width.1",
        "number.shape.radius": "radius.medium",
        "typography.text.body": "font.body.small",
        "number.size.icon-size": "size.24",
        "number.gap.cta-buttons": "space.12",
        "number.space.padding-x": "space.16",
        "number.space.padding-y": "space.16",
        "typography.text.heading": "font.body",
        "number.shape.icon-radius": "radius.full",
        "number.border.icon-border-width": "border.width.1"
      }
    },
    "danger": {
      "default": {
        "body": "color.text.body",
        "icon": "color.icon.danger",
        "title": "color.text.heading",
        "border": "color.border.functional.danger",
        "background": "color.functional.danger.subtle",
        "iconBorder": "color.border.functional.danger",
        "number.gap": "space.12",
        "number.gap.cta": "space.12",
        "number.gap.content": "space.4",
        "number.border.width": "border.width.1",
        "number.shape.radius": "radius.medium",
        "typography.text.body": "font.body.small",
        "number.size.icon-size": "size.24",
        "number.gap.cta-buttons": "space.12",
        "number.space.padding-x": "space.16",
        "number.space.padding-y": "space.16",
        "typography.text.heading": "font.body",
        "number.shape.icon-radius": "radius.full",
        "number.border.icon-border-width": "border.width.1"
      }
    },
    "info": {
      "default": {
        "body": "color.text.body",
        "icon": "color.icon.info",
        "title": "color.text.heading",
        "border": "color.border.functional.info",
        "background": "color.functional.info.subtle",
        "iconBorder": "color.border.functional.info",
        "number.gap": "space.12",
        "number.gap.cta": "space.12",
        "number.gap.content": "space.4",
        "number.border.width": "border.width.1",
        "number.shape.radius": "radius.medium",
        "typography.text.body": "font.body.small",
        "number.size.icon-size": "size.24",
        "number.gap.cta-buttons": "space.12",
        "number.space.padding-x": "space.16",
        "number.space.padding-y": "space.16",
        "typography.text.heading": "font.body",
        "number.shape.icon-radius": "radius.full",
        "number.border.icon-border-width": "border.width.1"
      }
    },
    "success": {
      "default": {
        "body": "color.text.body",
        "icon": "color.icon.success",
        "title": "color.text.heading",
        "border": "color.border.functional.success",
        "background": "color.functional.success.subtle",
        "iconBorder": "color.border.functional.success",
        "number.gap": "space.12",
        "number.gap.cta": "space.12",
        "number.gap.content": "space.4",
        "number.border.width": "border.width.1",
        "number.shape.radius": "radius.medium",
        "typography.text.body": "font.body.small",
        "number.size.icon-size": "size.24",
        "number.gap.cta-buttons": "space.12",
        "number.space.padding-x": "space.16",
        "number.space.padding-y": "space.16",
        "typography.text.heading": "font.body",
        "number.shape.icon-radius": "radius.full",
        "number.border.icon-border-width": "border.width.1"
      }
    },
    "warning": {
      "default": {
        "body": "color.text.body",
        "icon": "color.icon.warning",
        "title": "color.text.heading",
        "border": "color.border.functional.warning",
        "background": "color.functional.warning.subtle",
        "iconBorder": "color.border.functional.warning",
        "number.gap": "space.12",
        "number.gap.cta": "space.12",
        "number.gap.content": "space.4",
        "number.border.width": "border.width.1",
        "number.shape.radius": "radius.medium",
        "typography.text.body": "font.body.small",
        "number.size.icon-size": "size.24",
        "number.gap.cta-buttons": "space.12",
        "number.space.padding-x": "space.16",
        "number.space.padding-y": "space.16",
        "typography.text.heading": "font.body",
        "number.shape.icon-radius": "radius.full",
        "number.border.icon-border-width": "border.width.1"
      }
    }
  }
} as const;
const alertIconPathsById: Record<string, AlertIconPathDefinition> = {
  "info": {
    "path": "M13.7002 7.7998V21H10.2998V7.7998H13.7002ZM11.9502 3C12.4175 3.00009 12.8089 3.15851 13.125 3.47461C13.4412 3.79086 13.5996 4.18289 13.5996 4.65039C13.5995 5.11772 13.4412 5.50903 13.125 5.8252C12.8088 6.14136 12.4175 6.29972 11.9502 6.2998C11.4827 6.2998 11.0907 6.14145 10.7744 5.8252C10.4583 5.50905 10.2999 5.11767 10.2998 4.65039C10.2998 4.18289 10.4582 3.79086 10.7744 3.47461C11.0907 3.15836 11.4827 3 11.9502 3Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "check": {
    "path": "M8.99387 20L2 12.4158L3.74847 10.5198L8.99387 16.2079L20.2515 4L22 5.89605L8.99387 20Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "warning": {
    "path": "M10.2998 16.2002L10.2998 3L13.7002 3L13.7002 16.2002L10.2998 16.2002ZM12.0498 21C11.5825 20.9999 11.1911 20.8415 10.875 20.5254C10.5587 20.2091 10.4004 19.8171 10.4004 19.3496C10.4005 18.8823 10.5588 18.491 10.875 18.1748C11.1912 17.8586 11.5825 17.7003 12.0498 17.7002C12.5173 17.7002 12.9093 17.8586 13.2256 18.1748C13.5417 18.4909 13.7001 18.8823 13.7002 19.3496C13.7002 19.8171 13.5418 20.2091 13.2256 20.5254C12.9093 20.8416 12.5173 21 12.0498 21Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "x": {
    "path": "M4 22L2 20L10 12L2 4L4 2L12 10L20 2L22 4L14 12L22 20L20 22L12 14L4 22Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "simple": {
    "path": "M9 19C7.06667 19 5.41667 18.3167 4.05 16.95C2.68333 15.5833 2 13.9333 2 12C2 11.3667 2.15417 10.65 2.4625 9.85C2.77083 9.05 3.30833 8.2875 4.075 7.5625C4.84167 6.8375 5.86667 6.22917 7.15 5.7375C8.43333 5.24583 10.05 5 12 5C13.95 5 15.5667 5.24583 16.85 5.7375C18.1333 6.22917 19.1583 6.8375 19.925 7.5625C20.6917 8.2875 21.2292 9.05 21.5375 9.85C21.8458 10.65 22 11.3667 22 12C22 13.9333 21.3167 15.5833 19.95 16.95C18.5833 18.3167 16.9333 19 15 19H9ZM9.15 17H14.85C15.9 17 16.8542 16.7208 17.7125 16.1625C18.5708 15.6042 19.2 14.8833 19.6 14H4.4C4.8 14.8833 5.42917 15.6042 6.2875 16.1625C7.14583 16.7208 8.1 17 9.15 17ZM4 12H20C20 11.5 19.8667 10.9583 19.6 10.375C19.3333 9.79167 18.8875 9.25 18.2625 8.75C17.6375 8.25 16.8125 7.83333 15.7875 7.5C14.7625 7.16667 13.5 7 12 7C10.5 7 9.24167 7.16667 8.225 7.5C7.20833 7.83333 6.3875 8.25 5.7625 8.75C5.1375 9.25 4.6875 9.79167 4.4125 10.375C4.1375 10.9583 4 11.5 4 12Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  }
};
const alertRecipe = {
  "colorSlotIds": {
    "background": "background",
    "border": "border",
    "title": "title",
    "body": "body",
    "icon": "icon",
    "iconBorder": "iconBorder"
  },
  "content": {
    "title": "Alert Title",
    "description": "This is a description of the alert message.",
    "primaryCtaLabel": "Button",
    "secondaryCtaLabel": "Learn more"
  },
  "ctaButtonSize": "sm",
  "demoCtaModes": [
    "No CTA",
    "One CTA",
    "Two CTAs"
  ],
  "defaultShowDescription": true,
  "defaultShowIcon": true,
  "numberSlotIdsByVariant": {
    "info": {
      "borderWidth": "number.border.width",
      "contentGap": "number.gap.content",
      "ctaButtonsGap": "number.gap.cta-buttons",
      "ctaGap": "number.gap.cta",
      "gap": "number.gap",
      "iconBorderWidth": "number.border.icon-border-width",
      "iconRadius": "number.shape.icon-radius",
      "iconSize": "number.size.icon-size",
      "paddingX": "number.space.padding-x",
      "paddingY": "number.space.padding-y",
      "radius": "number.shape.radius"
    },
    "success": {
      "borderWidth": "number.border.width",
      "contentGap": "number.gap.content",
      "ctaButtonsGap": "number.gap.cta-buttons",
      "ctaGap": "number.gap.cta",
      "gap": "number.gap",
      "iconBorderWidth": "number.border.icon-border-width",
      "iconRadius": "number.shape.icon-radius",
      "iconSize": "number.size.icon-size",
      "paddingX": "number.space.padding-x",
      "paddingY": "number.space.padding-y",
      "radius": "number.shape.radius"
    },
    "warning": {
      "borderWidth": "number.border.width",
      "contentGap": "number.gap.content",
      "ctaButtonsGap": "number.gap.cta-buttons",
      "ctaGap": "number.gap.cta",
      "gap": "number.gap",
      "iconBorderWidth": "number.border.icon-border-width",
      "iconRadius": "number.shape.icon-radius",
      "iconSize": "number.size.icon-size",
      "paddingX": "number.space.padding-x",
      "paddingY": "number.space.padding-y",
      "radius": "number.shape.radius"
    },
    "danger": {
      "borderWidth": "number.border.width",
      "contentGap": "number.gap.content",
      "ctaButtonsGap": "number.gap.cta-buttons",
      "ctaGap": "number.gap.cta",
      "gap": "number.gap",
      "iconBorderWidth": "number.border.icon-border-width",
      "iconRadius": "number.shape.icon-radius",
      "iconSize": "number.size.icon-size",
      "paddingX": "number.space.padding-x",
      "paddingY": "number.space.padding-y",
      "radius": "number.shape.radius"
    },
    "basic": {
      "borderWidth": "number.border.width",
      "contentGap": "number.gap.content",
      "ctaButtonsGap": "number.gap.cta-buttons",
      "ctaGap": "number.gap.cta",
      "gap": "number.gap",
      "iconBorderWidth": "number.border.icon-border-width",
      "iconRadius": "number.shape.icon-radius",
      "iconSize": "number.size.icon-size",
      "paddingX": "number.space.padding-x",
      "paddingY": "number.space.padding-y",
      "radius": "number.shape.radius"
    }
  },
  "typographySlotIds": {
    "body": "typography.text.body",
    "heading": "typography.text.heading"
  },
  "variantIcons": {
    "info": "info",
    "success": "check",
    "warning": "warning",
    "danger": "x",
    "basic": "simple"
  }
} as const;

export function Alert({
  action,
  ctaMode = "No CTA",
  description = alertRecipe.content.description,
  iconId,
  mode,
  primaryAction,
  secondaryAction,
  showActions = false,
  showDescription = alertRecipe.defaultShowDescription,
  showIcon = alertRecipe.defaultShowIcon,
  state = "default",
  style,
  title = alertRecipe.content.title,
  variant = "info",
  ...props
}: AlertProps) {
  const canonicalTokenValues = getAlertCanonicalTokenValues({ mode, state, variant });
  const resolvedIconId = iconId ?? getAlertVariantIconId(variant);
  const rootRole = props.role ?? "status";
  const showCta = showActions || ctaMode !== "No CTA";
  const showSecondaryCta = ctaMode === "Two CTAs";

  return (
    <article
      {...props}
      aria-label={props["aria-label"] ?? "Alert"}
      data-alpy-component="alert"
      data-alpy-cta-mode={ctaMode}
      data-alpy-icon-id={showIcon ? resolvedIconId : undefined}
      data-alpy-icon-visible={showIcon ? "true" : "false"}
      data-alpy-mode={mode}
      data-alpy-state={state}
      data-alpy-variant={variant}
      role={rootRole}
      style={createAlertRootStyle({
        canonicalTokenValues,
        rootStyle: style,
      })}
    >
      {showIcon ? <AlertIcon canonicalTokenValues={canonicalTokenValues} iconId={resolvedIconId} /> : null}
      <div data-alpy-slot="content" style={createAlertContentStyle(canonicalTokenValues)}>
        <div data-alpy-slot="copy" style={createAlertCopyStyle(canonicalTokenValues)}>
          <h2 data-alpy-slot="title" style={createAlertTitleStyle(canonicalTokenValues)}>{title}</h2>
          {showDescription ? (
            <p data-alpy-slot="description" style={createAlertDescriptionStyle(canonicalTokenValues)}>{description}</p>
          ) : null}
        </div>
        {showCta ? (
          <div data-alpy-slot="actions" style={createAlertActionsStyle(canonicalTokenValues)}>
            {primaryAction ?? action ?? alertRecipe.content.primaryCtaLabel}
            {showSecondaryCta
              ? secondaryAction ?? alertRecipe.content.secondaryCtaLabel
              : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function AlertIcon({
  canonicalTokenValues,
  iconId,
}: {
  canonicalTokenValues: AlertCanonicalTokenValues;
  iconId: AlertIconId;
}) {
  const iconPath = getAlertIconPath(iconId);
  const viewBoxSize = iconPath.viewBoxSize ?? 24;
  const windingRule = iconPath.windingRule === "EVENODD" ? "evenodd" : "nonzero";

  return (
    <span aria-hidden="true" data-alpy-slot="icon" style={createAlertIconFrameStyle(canonicalTokenValues)}>
      <svg
        aria-hidden="true"
        fill="none"
        focusable="false"
        style={createAlertIconSvgStyle(canonicalTokenValues)}
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          clipRule={windingRule}
          d={iconPath.path}
          fill={iconPath.isStroke ? "none" : "currentColor"}
          fillRule={windingRule}
          stroke={iconPath.isStroke ? "currentColor" : undefined}
          strokeLinecap={iconPath.isStroke ? "round" : undefined}
          strokeLinejoin={iconPath.isStroke ? "round" : undefined}
          strokeWidth={iconPath.isStroke ? 2 : undefined}
        />
      </svg>
    </span>
  );
}

function getAlertIconPath(iconId: AlertIconId) {
  const iconPath = alertIconPathsById[iconId];

  if (!iconPath) {
    throw new Error(`Missing canonical Alert icon path: ${iconId}`);
  }

  return iconPath;
}

function getAlertVariantIconId(variant: AlertVariant): AlertIconId {
  const iconId = alertRecipe.variantIcons[variant] as AlertIconId | undefined;

  if (!iconId) {
    throw new Error(`Missing canonical Alert variant icon: ${variant}`);
  }

  return iconId;
}

function createAlertRootStyle({
  canonicalTokenValues,
  rootStyle,
}: {
  canonicalTokenValues: AlertCanonicalTokenValues;
  rootStyle: React.CSSProperties | undefined;
}) {
  const colorBorder = canonicalTokenValues.color[alertRecipe.colorSlotIds.border];
  const numberBorderWidth = canonicalTokenValues.number["number.border.width"];
  const numberSpacePaddingX = canonicalTokenValues.number["number.space.padding-x"];
  const numberSpacePaddingY = canonicalTokenValues.number["number.space.padding-y"];

  return removeEmptyStyleValues({
    background: canonicalTokenValues.color[alertRecipe.colorSlotIds.background],
    border:
      numberBorderWidth && colorBorder
        ? numberBorderWidth + " solid " + colorBorder
        : undefined,
    borderRadius: canonicalTokenValues.number["number.shape.radius"],
    boxSizing: "border-box",
    color: canonicalTokenValues.color[alertRecipe.colorSlotIds.body],
    display: "flex",
    gap: canonicalTokenValues.number["number.gap"],
    maxWidth: "100%",
    padding:
      numberSpacePaddingY && numberSpacePaddingX
        ? numberSpacePaddingY + " " + numberSpacePaddingX
        : undefined,
    width: "min(100%, 416px)",
    ...rootStyle,
  } as AlertStyle);
}

function createAlertIconFrameStyle(canonicalTokenValues: AlertCanonicalTokenValues) {
  const colorIconBorder = canonicalTokenValues.color[alertRecipe.colorSlotIds.iconBorder];
  const numberBorderIconBorderWidth =
    canonicalTokenValues.number["number.border.icon-border-width"];
  const numberSizeIconSize = canonicalTokenValues.number["number.size.icon-size"];

  return removeEmptyStyleValues({
    alignItems: "center",
    border:
      numberBorderIconBorderWidth && colorIconBorder
        ? numberBorderIconBorderWidth + " solid " + colorIconBorder
        : undefined,
    borderRadius: canonicalTokenValues.number["number.shape.icon-radius"],
    boxSizing: "border-box",
    color: canonicalTokenValues.color[alertRecipe.colorSlotIds.icon],
    display: "inline-flex",
    flex: numberSizeIconSize ? "0 0 " + numberSizeIconSize : undefined,
    height: numberSizeIconSize,
    justifyContent: "center",
    width: numberSizeIconSize,
  } as AlertStyle);
}

function createAlertIconSvgStyle(canonicalTokenValues: AlertCanonicalTokenValues) {
  return removeEmptyStyleValues({
    height: canonicalTokenValues.number["number.size.icon-size"],
    width: canonicalTokenValues.number["number.size.icon-size"],
  } as AlertStyle);
}

function createAlertContentStyle(canonicalTokenValues: AlertCanonicalTokenValues) {
  return removeEmptyStyleValues({
    display: "grid",
    flex: "1 1 auto",
    gap: canonicalTokenValues.number["number.gap.content"],
  } as AlertStyle);
}

function createAlertCopyStyle(canonicalTokenValues: AlertCanonicalTokenValues) {
  return removeEmptyStyleValues({
    display: "grid",
    gap: canonicalTokenValues.number["number.gap.content"],
  } as AlertStyle);
}

function createAlertTitleStyle(canonicalTokenValues: AlertCanonicalTokenValues) {
  const headingTypography =
    canonicalTokenValues.typography["typography.text.heading"];

  return removeEmptyStyleValues({
    color: canonicalTokenValues.color[alertRecipe.colorSlotIds.title],
    fontFamily: headingTypography?.fontFamily,
    fontSize: headingTypography?.fontSize,
    fontWeight: headingTypography?.fontWeight,
    letterSpacing: headingTypography?.letterSpacing,
    lineHeight: headingTypography?.lineHeight,
    margin: 0,
  } as AlertStyle);
}

function createAlertDescriptionStyle(canonicalTokenValues: AlertCanonicalTokenValues) {
  const bodyTypography =
    canonicalTokenValues.typography["typography.text.body"];

  return removeEmptyStyleValues({
    color: canonicalTokenValues.color[alertRecipe.colorSlotIds.body],
    fontFamily: bodyTypography?.fontFamily,
    fontSize: bodyTypography?.fontSize,
    fontWeight: bodyTypography?.fontWeight,
    letterSpacing: bodyTypography?.letterSpacing,
    lineHeight: bodyTypography?.lineHeight,
    margin: 0,
  } as AlertStyle);
}

function createAlertActionsStyle(canonicalTokenValues: AlertCanonicalTokenValues) {
  return removeEmptyStyleValues({
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: canonicalTokenValues.number["number.gap.cta-buttons"],
    paddingTop: canonicalTokenValues.number["number.gap.cta"],
  } as AlertStyle);
}

function getAlertCanonicalTokenValues({
  mode,
  state,
  variant,
}: {
  mode: AlertMode;
  state: AlertState;
  variant: AlertVariant;
}): AlertCanonicalTokenValues {
  const byVariant = alertTokenBindings[mode]?.[variant] as
    | Record<string, Record<string, string>>
    | undefined;
  const byState = getAlertBindingState(byVariant, state);
  const numberSlots = alertRecipe.numberSlotIdsByVariant[variant] as Record<
    string,
    string | undefined
  >;
  const typographySlots = alertRecipe.typographySlotIds as Record<
    string,
    string | undefined
  >;
  const number: Record<string, string | undefined> = {};

  for (const tokenSlotId of Object.values(numberSlots)) {
    setAlertCanonicalTokenValue(
      number,
      tokenSlotId,
      toCssVariableValue(getAlertTokenRef(byState, tokenSlotId)),
    );
  }

  return {
    color: {
      [alertRecipe.colorSlotIds.background]: toCssVariableValue(
        getAlertTokenRef(byState, alertRecipe.colorSlotIds.background),
      ),
      [alertRecipe.colorSlotIds.border]: toCssVariableValue(
        getAlertTokenRef(byState, alertRecipe.colorSlotIds.border),
      ),
      [alertRecipe.colorSlotIds.title]: toCssVariableValue(
        getAlertTokenRef(byState, alertRecipe.colorSlotIds.title),
      ),
      [alertRecipe.colorSlotIds.body]: toCssVariableValue(
        getAlertTokenRef(byState, alertRecipe.colorSlotIds.body),
      ),
      [alertRecipe.colorSlotIds.icon]: toCssVariableValue(
        getAlertTokenRef(byState, alertRecipe.colorSlotIds.icon),
      ),
      [alertRecipe.colorSlotIds.iconBorder]: toCssVariableValue(
        getAlertTokenRef(byState, alertRecipe.colorSlotIds.iconBorder),
      ),
    },
    number,
    typography: {
      "typography.text.body": toCssTypographyStyle(
        getAlertTokenRef(byState, typographySlots["typography.text.body"]),
      ),
      "typography.text.heading": toCssTypographyStyle(
        getAlertTokenRef(byState, typographySlots["typography.text.heading"]),
      ),
    },
  };
}

function setAlertCanonicalTokenValue(
  target: Record<string, string | undefined>,
  tokenSlotId: string | undefined,
  value: string | undefined,
) {
  if (tokenSlotId) {
    target[tokenSlotId] = value;
  }
}

function getAlertTokenRef(
  byState: Record<string, string> | undefined,
  tokenSlotId: string | undefined,
) {
  return tokenSlotId ? byState?.[tokenSlotId] : undefined;
}

function toCssTypographyStyle(tokenRef: string | undefined): AlertTypographyStyle {
  return removeEmptyStyleValues({
    fontFamily: toCssTypographyFamilyValue(tokenRef),
    fontSize: toCssVariableValue(tokenRef, "font-size"),
    fontWeight: toCssVariableValue(tokenRef, "font-weight"),
    letterSpacing: toCssVariableValue(tokenRef, "letter-spacing"),
    lineHeight: toCssVariableValue(tokenRef, "line-height"),
  } as AlertStyle);
}

function toCssTypographyFamilyValue(tokenRef: string | undefined) {
  const tokenValue = toCssVariableValue(tokenRef, "font-family");

  return tokenValue
    ? `${tokenValue}, ui-sans-serif, system-ui, sans-serif`
    : undefined;
}

function getAlertBindingState(
  byVariant: Record<string, Record<string, string>> | undefined,
  state: string,
) {
  return (
    byVariant?.[state] ??
    byVariant?.["default"]
  );
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

function removeEmptyStyleValues(style: AlertStyle) {
  return Object.fromEntries(
    Object.entries(style).filter(([, value]) => value !== undefined),
  ) as React.CSSProperties;
}

