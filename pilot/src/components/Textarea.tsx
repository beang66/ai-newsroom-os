import * as React from "react";

export type TextareaMode = "light";
export type TextareaVariant = "default";
export type TextareaState = "default" | "focused" | "invalid" | "disabled";

export type TextareaProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "children"
> & {
  description?: React.ReactNode;
  fieldText?: string;
  label?: React.ReactNode;
  mode: TextareaMode;
  showDescription?: boolean;
  showLabel?: boolean;
  state?: TextareaState;
  variant?: TextareaVariant;
};

type TextareaStyle = React.CSSProperties;
type TextareaResolvedStyles = {
  control: React.CSSProperties;
  description: React.CSSProperties;
  field: React.CSSProperties;
  label: React.CSSProperties;
  resizeHandle: React.CSSProperties;
  resizeHandleLines: readonly React.CSSProperties[];
  root: React.CSSProperties;
};

const textareaTokenBindings = {
  "light": {
    "default": {
      "default": {
        "background": "color.surface.canvas",
        "border": "color.border.neutral.subtle.two",
        "description": "color.text.body.subtle",
        "label": "color.text.heading",
        "number.field.border.width": "border.width.1",
        "number.field.shape.radius": "radius.medium",
        "number.field.size.height": "space.96",
        "number.field.space.padding-x": "space.16",
        "number.field.space.padding-y": "space.12",
        "number.stack.gap.label-to-field": "space.12",
        "text": "color.text.body",
        "typography.text.description": "font.body.small",
        "typography.text.field": "font.body",
        "typography.text.label": "font.body.medium"
      },
      "disabled": {
        "background": "color.surface.interaction.disabled",
        "border": "color.border.interaction.disabled",
        "description": "color.text.body.muted",
        "label": "color.text.heading",
        "number.field.border.width": "border.width.1",
        "number.field.shape.radius": "radius.medium",
        "number.field.size.height": "space.96",
        "number.field.space.padding-x": "space.16",
        "number.field.space.padding-y": "space.12",
        "number.stack.gap.label-to-field": "space.12",
        "text": "color.text.body.muted",
        "typography.text.description": "font.body.small",
        "typography.text.field": "font.body",
        "typography.text.label": "font.body.medium"
      },
      "focused": {
        "background": "color.surface.canvas",
        "border": "color.border.interaction.focused",
        "description": "color.text.body.subtle",
        "label": "color.text.heading",
        "number.field.border.width": "border.width.1",
        "number.field.shape.radius": "radius.medium",
        "number.field.size.height": "space.96",
        "number.field.space.padding-x": "space.16",
        "number.field.space.padding-y": "space.12",
        "number.stack.gap.label-to-field": "space.12",
        "text": "color.text.body",
        "typography.text.description": "font.body.small",
        "typography.text.field": "font.body",
        "typography.text.label": "font.body.medium"
      },
      "invalid": {
        "background": "color.surface.canvas",
        "border": "color.border.functional.danger",
        "description": "color.text.functional.danger",
        "label": "color.text.heading",
        "number.field.border.width": "border.width.1",
        "number.field.shape.radius": "radius.medium",
        "number.field.size.height": "space.96",
        "number.field.space.padding-x": "space.16",
        "number.field.space.padding-y": "space.12",
        "number.stack.gap.label-to-field": "space.12",
        "text": "color.text.functional.danger",
        "typography.text.description": "font.body.small",
        "typography.text.field": "font.body",
        "typography.text.label": "font.body.medium"
      }
    }
  }
} as const;
const textareaRecipe = {
  "anatomy": {
    "fieldChildNames": [
      "Field Text",
      "Resize Handle"
    ],
    "fieldChildOrder": [
      "Field Text",
      "resize-handle"
    ],
    "fieldId": "field",
    "resizeHandleChildNames": [
      "Resize Grip Line 1",
      "Resize Grip Line 2"
    ],
    "resizeHandleChildOrder": [
      "Resize Grip Line 1",
      "Resize Grip Line 2"
    ],
    "resizeHandleDirection": "vertical",
    "resizeHandleId": "resize-handle",
    "rootChildNames": [
      "Label",
      "Field",
      "Description"
    ],
    "rootChildOrder": [
      "label",
      "field",
      "description"
    ],
    "rootId": "root"
  },
  "colorSlotIds": {
    "background": "background",
    "border": "border",
    "description": "description",
    "label": "label",
    "text": "text"
  },
  "componentId": "component.textarea",
  "content": {
    "defaultDescription": "Type your message and press enter to send.",
    "defaultFieldText": "Type your message here.",
    "defaultLabel": "Message"
  },
  "defaultDescriptionVisible": false,
  "defaultLabelVisible": false,
  "defaultState": "default",
  "defaultVariant": "default",
  "numberSlotIds": {
    "borderWidth": "number.field.border.width",
    "fieldHeight": "number.field.size.height",
    "paddingX": "number.field.space.padding-x",
    "paddingY": "number.field.space.padding-y",
    "radius": "number.field.shape.radius",
    "resizeHandleGap": "number.field.border.width",
    "resizeHandleLineHeight": "number.field.border.width",
    "resizeHandleLineWidth": "number.field.space.padding-y",
    "stackGap": "number.stack.gap.label-to-field"
  },
  "resizeHandle": {
    "colorStateId": "default",
    "lines": [
      {
        "iconName": "minus",
        "name": "Resize Grip Line 1",
        "rotation": -45
      },
      {
        "iconName": "minus",
        "name": "Resize Grip Line 2",
        "rotation": -45
      }
    ]
  },
  "typographySlotIds": {
    "description": "typography.text.description",
    "field": "typography.text.field",
    "label": "typography.text.label"
  },
  "visibilityProperties": {
    "description": "Show Description",
    "label": "Show Label"
  }
} as const;

export function Textarea({
  "aria-invalid": ariaInvalid,
  description = textareaRecipe.content.defaultDescription,
  disabled,
  fieldText = textareaRecipe.content.defaultFieldText,
  id,
  label = textareaRecipe.content.defaultLabel,
  mode,
  placeholder,
  showDescription = textareaRecipe.defaultDescriptionVisible,
  showLabel = textareaRecipe.defaultLabelVisible,
  state,
  style,
  variant = "default",
  ...props
}: TextareaProps) {
  const generatedId = React.useId();
  const textareaId = id ?? generatedId;
  const resolvedState =
    state ?? (disabled ? "disabled" : "default");
  const isDisabled = disabled || resolvedState === "disabled";
  const tokenStyles = getTextareaTokenStyles({ mode, state: resolvedState, variant });

  return (
    <div
      data-alpy-component="textarea"
      data-alpy-component-id={textareaRecipe.componentId}
      data-alpy-description-visible={showDescription ? "true" : "false"}
      data-alpy-label-visible={showLabel ? "true" : "false"}
      data-alpy-mode={mode}
      data-alpy-state={resolvedState}
      data-alpy-variant={variant}
      style={{ ...baseTextareaStyle, ...tokenStyles.root, ...style }}
    >
      {showLabel ? (
        <label
          data-alpy-slot={textareaRecipe.anatomy.rootChildOrder[0]}
          htmlFor={textareaId}
          style={{ ...labelLayoutStyle, ...tokenStyles.label }}
        >
          {label}
        </label>
      ) : null}
      <div
        data-alpy-slot={textareaRecipe.anatomy.fieldId}
        style={{ ...fieldLayoutStyle, ...tokenStyles.field }}
      >
        <textarea
          {...props}
          aria-invalid={resolvedState === "invalid" ? true : ariaInvalid}
          data-alpy-control="textarea"
          data-alpy-slot={textareaRecipe.anatomy.fieldChildOrder[0]}
          disabled={isDisabled}
          id={textareaId}
          placeholder={placeholder ?? fieldText}
          style={{ ...controlLayoutStyle, ...tokenStyles.control }}
        />
        <span
          aria-hidden="true"
          data-alpy-resize-direction={textareaRecipe.anatomy.resizeHandleDirection}
          data-alpy-slot={textareaRecipe.anatomy.resizeHandleId}
          style={{ ...resizeHandleLayoutStyle, ...tokenStyles.resizeHandle }}
        >
          {textareaRecipe.resizeHandle.lines.map((line, index) => (
            <span
              data-alpy-icon-name={line.iconName}
              data-alpy-resize-line={line.name}
              key={line.name}
              style={{
                ...resizeHandleLineLayoutStyle,
                ...(tokenStyles.resizeHandleLines[index] ?? {}),
                transform: `rotate(${line.rotation}deg)`,
              }}
            />
          ))}
        </span>
      </div>
      {showDescription ? (
        <span
          data-alpy-slot={textareaRecipe.anatomy.rootChildOrder[2]}
          style={{ ...descriptionLayoutStyle, ...tokenStyles.description }}
        >
          {description}
        </span>
      ) : null}
    </div>
  );
}

const baseTextareaStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
};

const labelLayoutStyle: React.CSSProperties = {};

const fieldLayoutStyle: React.CSSProperties = {
  borderStyle: "solid",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  overflow: "hidden",
  position: "relative",
};

const controlLayoutStyle: React.CSSProperties = {
  background: "transparent",
  border: 0,
  boxSizing: "border-box",
  flex: "1 1 auto",
  margin: 0,
  minHeight: 0,
  outline: 0,
  padding: 0,
  resize: "none",
  width: "100%",
};

const resizeHandleLayoutStyle: React.CSSProperties = {
  display: "block",
  pointerEvents: "none",
  position: "absolute",
};

const resizeHandleLineLayoutStyle: React.CSSProperties = {
  borderRadius: "999px",
  display: "block",
  position: "absolute",
  transformOrigin: "right center",
};

const descriptionLayoutStyle: React.CSSProperties = {};

function getTextareaTokenStyles({
  mode,
  state,
  variant,
}: {
  mode: TextareaMode;
  state: TextareaState;
  variant: TextareaVariant;
}): TextareaResolvedStyles {
  const byState = textareaTokenBindings[mode]?.[variant]?.[state] as
    | Record<string, string>
    | undefined;
  const resizeHandleState = textareaTokenBindings[mode]?.[variant]?.[
    textareaRecipe.resizeHandle.colorStateId
  ] as Record<string, string> | undefined;

  if (!byState) {
    throw new Error(`Missing canonical Textarea binding path: ${mode}/${variant}/${state}`);
  }

  if (!resizeHandleState) {
    throw new Error(
      `Missing canonical Textarea resize-handle binding path: ${mode}/${variant}/${textareaRecipe.resizeHandle.colorStateId}`,
    );
  }

  const colorSlots = textareaRecipe.colorSlotIds;
  const numberSlots = textareaRecipe.numberSlotIds;
  const typographySlots = textareaRecipe.typographySlotIds;
  const descriptionToken = readTextareaToken(byState, typographySlots.description);
  const fieldToken = readTextareaToken(byState, typographySlots.field);
  const labelToken = readTextareaToken(byState, typographySlots.label);
  const paddingX = toCssVariableValue(readTextareaToken(byState, numberSlots.paddingX));
  const paddingY = toCssVariableValue(readTextareaToken(byState, numberSlots.paddingY));
  const resizeHandleGap = toCssVariableValue(readTextareaToken(byState, numberSlots.resizeHandleGap));
  const resizeHandleLineHeight = toCssVariableValue(
    readTextareaToken(byState, numberSlots.resizeHandleLineHeight),
  );
  const resizeHandleLineWidth = toCssVariableValue(
    readTextareaToken(byState, numberSlots.resizeHandleLineWidth),
  );
  const resizeHandleLineColor = toCssVariableValue(
    readTextareaToken(resizeHandleState, colorSlots.text),
  );
  const resizeHandleGripSize =
    resizeHandleLineWidth && resizeHandleGap
      ? `calc(${resizeHandleLineWidth} + (${resizeHandleGap} * 8))`
      : undefined;

  return {
    control: removeEmptyStyleValues({
      color: toCssVariableValue(readTextareaToken(byState, colorSlots.text)),
      fontFamily: toCssVariableValue(fieldToken, "font-family"),
      fontSize: toCssVariableValue(fieldToken, "font-size"),
      fontWeight: toCssVariableValue(fieldToken, "font-weight"),
      letterSpacing: toCssVariableValue(fieldToken, "letter-spacing"),
      lineHeight: toCssVariableValue(fieldToken, "line-height"),
    }),
    description: removeEmptyStyleValues({
      color: toCssVariableValue(readTextareaToken(byState, colorSlots.description)),
      fontFamily: toCssVariableValue(descriptionToken, "font-family"),
      fontSize: toCssVariableValue(descriptionToken, "font-size"),
      fontWeight: toCssVariableValue(descriptionToken, "font-weight"),
      letterSpacing: toCssVariableValue(descriptionToken, "letter-spacing"),
      lineHeight: toCssVariableValue(descriptionToken, "line-height"),
    }),
    field: removeEmptyStyleValues({
      background: toCssVariableValue(readTextareaToken(byState, colorSlots.background)),
      borderColor: toCssVariableValue(readTextareaToken(byState, colorSlots.border)),
      borderRadius: toCssVariableValue(readTextareaToken(byState, numberSlots.radius)),
      borderWidth: toCssVariableValue(readTextareaToken(byState, numberSlots.borderWidth)),
      minHeight: toCssVariableValue(readTextareaToken(byState, numberSlots.fieldHeight)),
      padding: paddingX && paddingY ? `${paddingY} ${paddingX}` : undefined,
    }),
    label: removeEmptyStyleValues({
      color: toCssVariableValue(readTextareaToken(byState, colorSlots.label)),
      fontFamily: toCssVariableValue(labelToken, "font-family"),
      fontSize: toCssVariableValue(labelToken, "font-size"),
      fontWeight: toCssVariableValue(labelToken, "font-weight"),
      letterSpacing: toCssVariableValue(labelToken, "letter-spacing"),
      lineHeight: toCssVariableValue(labelToken, "line-height"),
    }),
    resizeHandle: removeEmptyStyleValues({
      bottom: resizeHandleGap ? `calc(${resizeHandleGap} * 2)` : undefined,
      height: resizeHandleGripSize,
      right: resizeHandleGap ? `calc(${resizeHandleGap} * 2)` : undefined,
      width: resizeHandleGripSize,
    }),
    resizeHandleLines: [
      removeEmptyStyleValues({
        backgroundColor: resizeHandleLineColor,
        bottom: resizeHandleGap ? `calc(${resizeHandleGap} * 5)` : undefined,
        height: resizeHandleLineHeight,
        right: resizeHandleGap,
        width: resizeHandleLineWidth ? `calc(${resizeHandleLineWidth} * 0.58)` : undefined,
      }),
      removeEmptyStyleValues({
        backgroundColor: resizeHandleLineColor,
        bottom: resizeHandleGap ? `calc(${resizeHandleGap} * 8)` : undefined,
        height: resizeHandleLineHeight,
        right: resizeHandleGap ? `calc(${resizeHandleGap} * 2)` : undefined,
        width: resizeHandleLineWidth,
      }),
    ],
    root: removeEmptyStyleValues({
      gap: toCssVariableValue(readTextareaToken(byState, numberSlots.stackGap)),
    }),
  } satisfies TextareaResolvedStyles;
}

function readTextareaToken(
  byState: Record<string, string>,
  tokenSlotId: string,
) {
  const tokenRef = byState[tokenSlotId];

  if (!tokenRef) {
    throw new Error(`Missing canonical Textarea token binding: ${tokenSlotId}`);
  }

  return tokenRef;
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

function removeEmptyStyleValues(style: TextareaStyle) {
  return Object.fromEntries(
    Object.entries(style).filter(([, value]) => value !== undefined),
  ) as React.CSSProperties;
}

