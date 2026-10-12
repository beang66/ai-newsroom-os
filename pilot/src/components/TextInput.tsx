import * as React from "react";
import { Button, type ButtonSize, type ButtonState, type ButtonVariant } from "./Button.js";

export type TextInputMode = "light";
export type TextInputVariant = "basic" | "with-button" | "with-icon";
export type TextInputState = "default" | "focused" | "invalid" | "disabled";
export type TextInputIconId = "account_circle" | "add_circle" | "arrow_back" | "arrow_downward" | "arrow_forward" | "arrow_upward" | "bookmark" | "cancel" | "check" | "chevron_back" | "chevron_down" | "chevron_forward" | "chevron_up" | "comment_1" | "copy" | "delete" | "do_not_disturb_on" | "download" | "edit" | "error" | "favorite" | "folder" | "format_color_fill" | "home" | "info" | "language" | "link" | "link_off" | "mail" | "menu" | "minus" | "more_vert" | "move_item" | "notifications" | "person" | "photo" | "play_arrow" | "play_arrow_filled" | "plus" | "schedule" | "search" | "settings" | "share" | "simple" | "star" | "text_fields" | "warning" | "x";

export type TextInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "children"
> & {
  actionButtonLabel?: React.ReactNode;
  description?: React.ReactNode;
  label?: React.ReactNode;
  leftIconId?: TextInputIconId;
  mode: TextInputMode;
  rightIconId?: TextInputIconId;
  showDescription?: boolean;
  showLabel?: boolean;
  showLeftIcon?: boolean;
  showRightIcon?: boolean;
  state?: TextInputState;
  variant?: TextInputVariant;
};

type TextInputStyle = React.CSSProperties & Record<string, string | number | undefined>;
type TextInputResolvedStyles = {
  description: React.CSSProperties;
  field: React.CSSProperties;
  icon: React.CSSProperties;
  iconSvg: React.CSSProperties;
  input: React.CSSProperties;
  inputRow: React.CSSProperties;
  label: React.CSSProperties;
  root: React.CSSProperties;
};
type TextInputIconPathDefinition = {
  isStroke: boolean;
  path: string;
  viewBoxSize?: number;
  windingRule: string;
};
type TextInputIconSlot = {
  iconId: TextInputIconId;
  iconSlotId: string;
  isVisible: boolean;
  name: string;
};
type TextInputTokenSlotIds = {
  colorSlotIds: {
    background: string;
    border: string;
    description: string;
    icon: string;
    label: string;
    text: string;
  };
  numberSlotIds: {
    borderWidth: string;
    compoundGap: string;
    fieldGap: string;
    fieldHeight: string;
    iconSize: string;
    paddingX: string;
    paddingY: string;
    radius: string;
    stackGap: string;
  };
  typographySlotIds: {
    description: string;
    field: string;
    label: string;
  };
};

const textInputTokenBindings = {
  "light": {
    "basic": {
      "default": {
        "background": "color.surface.canvas",
        "border": "color.border.neutral.subtle.two",
        "description": "color.text.body.subtle",
        "label": "color.text.heading",
        "number.field.border.width": "border.width.1",
        "number.field.gap": "icon.gap.sm",
        "number.field.shape.radius": "radius.medium",
        "number.field.size.height": "space.40",
        "number.field.space.padding-x": "space.16",
        "number.field.space.padding-y": "space.12",
        "number.gap": "space.8",
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
        "label": "color.text.link.disabled",
        "number.field.border.width": "border.width.1",
        "number.field.gap": "icon.gap.sm",
        "number.field.shape.radius": "radius.medium",
        "number.field.size.height": "space.40",
        "number.field.space.padding-x": "space.16",
        "number.field.space.padding-y": "space.12",
        "number.gap": "space.8",
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
        "number.field.gap": "icon.gap.sm",
        "number.field.shape.radius": "radius.medium",
        "number.field.size.height": "space.40",
        "number.field.space.padding-x": "space.16",
        "number.field.space.padding-y": "space.12",
        "number.gap": "space.8",
        "number.stack.gap.label-to-field": "space.12",
        "text": "color.text.body",
        "typography.text.description": "font.body.small",
        "typography.text.field": "font.body",
        "typography.text.label": "font.body.medium"
      },
      "invalid": {
        "background": "color.surface.canvas",
        "border": "color.border.functional.danger",
        "description": "color.text.body.subtle",
        "label": "color.text.heading",
        "number.field.border.width": "border.width.1",
        "number.field.gap": "icon.gap.sm",
        "number.field.shape.radius": "radius.medium",
        "number.field.size.height": "space.40",
        "number.field.space.padding-x": "space.16",
        "number.field.space.padding-y": "space.12",
        "number.gap": "space.8",
        "number.stack.gap.label-to-field": "space.12",
        "text": "color.text.functional.danger",
        "typography.text.description": "font.body.small",
        "typography.text.field": "font.body",
        "typography.text.label": "font.body.medium"
      }
    },
    "with-button": {
      "default": {
        "background": "color.surface.canvas",
        "border": "color.border.neutral.subtle.two",
        "description": "color.text.body.subtle",
        "label": "color.text.heading",
        "number.field.border.width": "border.width.1",
        "number.field.gap": "icon.gap.sm",
        "number.field.shape.radius": "radius.medium",
        "number.field.size.height": "space.40",
        "number.field.space.padding-x": "space.16",
        "number.field.space.padding-y": "space.12",
        "number.gap": "space.8",
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
        "label": "color.text.link.disabled",
        "number.field.border.width": "border.width.1",
        "number.field.gap": "icon.gap.sm",
        "number.field.shape.radius": "radius.medium",
        "number.field.size.height": "space.40",
        "number.field.space.padding-x": "space.16",
        "number.field.space.padding-y": "space.12",
        "number.gap": "space.8",
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
        "number.field.gap": "icon.gap.sm",
        "number.field.shape.radius": "radius.medium",
        "number.field.size.height": "space.40",
        "number.field.space.padding-x": "space.16",
        "number.field.space.padding-y": "space.12",
        "number.gap": "space.8",
        "number.stack.gap.label-to-field": "space.12",
        "text": "color.text.body",
        "typography.text.description": "font.body.small",
        "typography.text.field": "font.body",
        "typography.text.label": "font.body.medium"
      },
      "invalid": {
        "background": "color.surface.canvas",
        "border": "color.border.functional.danger",
        "description": "color.text.body.subtle",
        "label": "color.text.heading",
        "number.field.border.width": "border.width.1",
        "number.field.gap": "icon.gap.sm",
        "number.field.shape.radius": "radius.medium",
        "number.field.size.height": "space.40",
        "number.field.space.padding-x": "space.16",
        "number.field.space.padding-y": "space.12",
        "number.gap": "space.8",
        "number.stack.gap.label-to-field": "space.12",
        "text": "color.text.functional.danger",
        "typography.text.description": "font.body.small",
        "typography.text.field": "font.body",
        "typography.text.label": "font.body.medium"
      }
    },
    "with-icon": {
      "default": {
        "background": "color.surface.canvas",
        "border": "color.border.neutral.subtle.two",
        "description": "color.text.body.subtle",
        "icon": "color.icon.subtle",
        "label": "color.text.heading",
        "number.field.border.width": "border.width.1",
        "number.field.gap": "icon.gap.sm",
        "number.field.shape.radius": "radius.medium",
        "number.field.size.height": "space.40",
        "number.field.size.icon": "icon.size.16",
        "number.field.space.padding-x": "space.16",
        "number.field.space.padding-y": "space.12",
        "number.gap": "space.8",
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
        "icon": "color.icon.disabled",
        "label": "color.text.link.disabled",
        "number.field.border.width": "border.width.1",
        "number.field.gap": "icon.gap.sm",
        "number.field.shape.radius": "radius.medium",
        "number.field.size.height": "space.40",
        "number.field.size.icon": "icon.size.16",
        "number.field.space.padding-x": "space.16",
        "number.field.space.padding-y": "space.12",
        "number.gap": "space.8",
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
        "icon": "color.icon.default",
        "label": "color.text.heading",
        "number.field.border.width": "border.width.1",
        "number.field.gap": "icon.gap.sm",
        "number.field.shape.radius": "radius.medium",
        "number.field.size.height": "space.40",
        "number.field.size.icon": "icon.size.16",
        "number.field.space.padding-x": "space.16",
        "number.field.space.padding-y": "space.12",
        "number.gap": "space.8",
        "number.stack.gap.label-to-field": "space.12",
        "text": "color.text.body",
        "typography.text.description": "font.body.small",
        "typography.text.field": "font.body",
        "typography.text.label": "font.body.medium"
      },
      "invalid": {
        "background": "color.surface.canvas",
        "border": "color.border.functional.danger",
        "description": "color.text.body.subtle",
        "icon": "color.icon.default",
        "label": "color.text.heading",
        "number.field.border.width": "border.width.1",
        "number.field.gap": "icon.gap.sm",
        "number.field.shape.radius": "radius.medium",
        "number.field.size.height": "space.40",
        "number.field.size.icon": "icon.size.16",
        "number.field.space.padding-x": "space.16",
        "number.field.space.padding-y": "space.12",
        "number.gap": "space.8",
        "number.stack.gap.label-to-field": "space.12",
        "text": "color.text.functional.danger",
        "typography.text.description": "font.body.small",
        "typography.text.field": "font.body",
        "typography.text.label": "font.body.medium"
      }
    }
  }
} as const;
const textInputIconPathsById: Record<string, TextInputIconPathDefinition> = {
  "account_circle": {
    "path": "M5.85 17.1C6.7 16.45 7.65 15.9375 8.7 15.5625C9.75 15.1875 10.85 15 12 15C13.15 15 14.25 15.1875 15.3 15.5625C16.35 15.9375 17.3 16.45 18.15 17.1C18.7333 16.4167 19.1875 15.6417 19.5125 14.775C19.8375 13.9083 20 12.9833 20 12C20 9.78333 19.2208 7.89583 17.6625 6.3375C16.1042 4.77917 14.2167 4 12 4C9.78333 4 7.89583 4.77917 6.3375 6.3375C4.77917 7.89583 4 9.78333 4 12C4 12.9833 4.1625 13.9083 4.4875 14.775C4.8125 15.6417 5.26667 16.4167 5.85 17.1ZM12 13C11.0167 13 10.1875 12.6625 9.5125 11.9875C8.8375 11.3125 8.5 10.4833 8.5 9.5C8.5 8.51667 8.8375 7.6875 9.5125 7.0125C10.1875 6.3375 11.0167 6 12 6C12.9833 6 13.8125 6.3375 14.4875 7.0125C15.1625 7.6875 15.5 8.51667 15.5 9.5C15.5 10.4833 15.1625 11.3125 14.4875 11.9875C13.8125 12.6625 12.9833 13 12 13ZM12 22C10.6167 22 9.31667 21.7375 8.1 21.2125C6.88333 20.6875 5.825 19.975 4.925 19.075C4.025 18.175 3.3125 17.1167 2.7875 15.9C2.2625 14.6833 2 13.3833 2 12C2 10.6167 2.2625 9.31667 2.7875 8.1C3.3125 6.88333 4.025 5.825 4.925 4.925C5.825 4.025 6.88333 3.3125 8.1 2.7875C9.31667 2.2625 10.6167 2 12 2C13.3833 2 14.6833 2.2625 15.9 2.7875C17.1167 3.3125 18.175 4.025 19.075 4.925C19.975 5.825 20.6875 6.88333 21.2125 8.1C21.7375 9.31667 22 10.6167 22 12C22 13.3833 21.7375 14.6833 21.2125 15.9C20.6875 17.1167 19.975 18.175 19.075 19.075C18.175 19.975 17.1167 20.6875 15.9 21.2125C14.6833 21.7375 13.3833 22 12 22Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "add_circle": {
    "path": "M11 17H13V13H17V11H13V7H11V11H7V13H11V17ZM12 22C10.6167 22 9.31667 21.7417 8.1 21.225C6.88333 20.6917 5.825 19.975 4.925 19.075C4.025 18.175 3.30833 17.1167 2.775 15.9C2.25833 14.6833 2 13.3833 2 12C2 10.6167 2.25833 9.31667 2.775 8.1C3.30833 6.88333 4.025 5.825 4.925 4.925C5.825 4.025 6.88333 3.31667 8.1 2.8C9.31667 2.26667 10.6167 2 12 2C13.3833 2 14.6833 2.26667 15.9 2.8C17.1167 3.31667 18.175 4.025 19.075 4.925C19.975 5.825 20.6833 6.88333 21.2 8.1C21.7333 9.31667 22 10.6167 22 12C22 13.3833 21.7333 14.6833 21.2 15.9C20.6833 17.1167 19.975 18.175 19.075 19.075C18.175 19.975 17.1167 20.6917 15.9 21.225C14.6833 21.7417 13.3833 22 12 22ZM12 20C14.2333 20 16.125 19.225 17.675 17.675C19.225 16.125 20 14.2333 20 12C20 9.76667 19.225 7.875 17.675 6.325C16.125 4.775 14.2333 4 12 4C9.76667 4 7.875 4.775 6.325 6.325C4.775 7.875 4 9.76667 4 12C4 14.2333 4.775 16.125 6.325 17.675C7.875 19.225 9.76667 20 12 20Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "arrow_back": {
    "path": "M6.78125 13.25L13.7813 20.25L12 22L2 12L12 2L13.7813 3.75L6.78125 10.75H22V13.25H6.78125Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "arrow_downward": {
    "path": "M10.75 2V17.2188L3.75 10.2188L2 12L12 22L22 12L20.25 10.2188L13.25 17.2188V2H10.75Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "arrow_forward": {
    "path": "M17.2188 13.25H2V10.75H17.2188L10.2188 3.75L12 2L22 12L12 22L10.2188 20.25L17.2188 13.25Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "arrow_upward": {
    "path": "M10.75 22V6.78125L3.75 13.7813L2 12L12 2L22 12L20.25 13.7813L13.25 6.78125V22H10.75Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "bookmark": {
    "path": "M5 21V5C5 4.45 5.19583 3.97917 5.5875 3.5875C5.97917 3.19583 6.45 3 7 3H17C17.55 3 18.0208 3.19583 18.4125 3.5875C18.8042 3.97917 19 4.45 19 5V21L12 18L5 21ZM7 17.95L12 15.8L17 17.95V5H7V17.95Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "cancel": {
    "path": "M8.4 17L12 13.4L15.6 17L17 15.6L13.4 12L17 8.4L15.6 7L12 10.6L8.4 7L7 8.4L10.6 12L7 15.6L8.4 17ZM12 22C10.6167 22 9.31667 21.7375 8.1 21.2125C6.88333 20.6875 5.825 19.975 4.925 19.075C4.025 18.175 3.3125 17.1167 2.7875 15.9C2.2625 14.6833 2 13.3833 2 12C2 10.6167 2.2625 9.31667 2.7875 8.1C3.3125 6.88333 4.025 5.825 4.925 4.925C5.825 4.025 6.88333 3.3125 8.1 2.7875C9.31667 2.2625 10.6167 2 12 2C13.3833 2 14.6833 2.2625 15.9 2.7875C17.1167 3.3125 18.175 4.025 19.075 4.925C19.975 5.825 20.6875 6.88333 21.2125 8.1C21.7375 9.31667 22 10.6167 22 12C22 13.3833 21.7375 14.6833 21.2125 15.9C20.6875 17.1167 19.975 18.175 19.075 19.075C18.175 19.975 17.1167 20.6875 15.9 21.2125C14.6833 21.7375 13.3833 22 12 22ZM12 20C14.2333 20 16.125 19.225 17.675 17.675C19.225 16.125 20 14.2333 20 12C20 9.76667 19.225 7.875 17.675 6.325C16.125 4.775 14.2333 4 12 4C9.76667 4 7.875 4.775 6.325 6.325C4.775 7.875 4 9.76667 4 12C4 14.2333 4.775 16.125 6.325 17.675C7.875 19.225 9.76667 20 12 20Z",
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
  "chevron_back": {
    "path": "M16 22L6 12L16 2L17.775 3.775L9.55 12L17.775 20.225L16 22Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "chevron_down": {
    "path": "M2 8.0001L3.775 6.2251L12 14.4501L20.225 6.2251L22 8.0001L12 18.0001L2 8.0001Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "chevron_forward": {
    "path": "M7.88828 22L6.11328 20.225L14.3383 12L6.11328 3.775L7.88828 2L17.8883 12L7.88828 22Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "chevron_up": {
    "path": "M22 16.2251L20.225 18.0001L12 9.7751L3.775 18.0001L2 16.2251L12 6.2251L22 16.2251Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "comment_1": {
    "path": "M6 14H18V12H6V14ZM6 11H18V9H6V11ZM6 8H18V6H6V8ZM22 22L18 18H4C3.45 18 2.97917 17.8042 2.5875 17.4125C2.19583 17.0208 2 16.55 2 16V4C2 3.45 2.19583 2.97917 2.5875 2.5875C2.97917 2.19583 3.45 2 4 2H20C20.55 2 21.0208 2.19583 21.4125 2.5875C21.8042 2.97917 22 3.45 22 4V22ZM4 16H18.85L20 17.125V4H4V16Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "copy": {
    "path": "M9 18C8.45 18 7.97917 17.8042 7.5875 17.4125C7.19583 17.0208 7 16.55 7 16V4C7 3.45 7.19583 2.97917 7.5875 2.5875C7.97917 2.19583 8.45 2 9 2H18C18.55 2 19.0208 2.19583 19.4125 2.5875C19.8042 2.97917 20 3.45 20 4V16C20 16.55 19.8042 17.0208 19.4125 17.4125C19.0208 17.8042 18.55 18 18 18H9ZM9 16H18V4H9V16ZM5 22C4.45 22 3.97917 21.8042 3.5875 21.4125C3.19583 21.0208 3 20.55 3 20V6H5V20H16V22H5Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "delete": {
    "path": "M7 21C6.45 21 5.97917 20.8042 5.5875 20.4125C5.19583 20.0208 5 19.55 5 19V6H4V4H9V3H15V4H20V6H19V19C19 19.55 18.8042 20.0208 18.4125 20.4125C18.0208 20.8042 17.55 21 17 21H7ZM17 6H7V19H17V6ZM9 17H11V8H9V17ZM13 17H15V8H13V17Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "do_not_disturb_on": {
    "path": "M7 13H17V11H7V13ZM12 22C10.6167 22 9.31667 21.7375 8.1 21.2125C6.88333 20.6875 5.825 19.975 4.925 19.075C4.025 18.175 3.3125 17.1167 2.7875 15.9C2.2625 14.6833 2 13.3833 2 12C2 10.6167 2.2625 9.31667 2.7875 8.1C3.3125 6.88333 4.025 5.825 4.925 4.925C5.825 4.025 6.88333 3.3125 8.1 2.7875C9.31667 2.2625 10.6167 2 12 2C13.3833 2 14.6833 2.2625 15.9 2.7875C17.1167 3.3125 18.175 4.025 19.075 4.925C19.975 5.825 20.6875 6.88333 21.2125 8.1C21.7375 9.31667 22 10.6167 22 12C22 13.3833 21.7375 14.6833 21.2125 15.9C20.6875 17.1167 19.975 18.175 19.075 19.075C18.175 19.975 17.1167 20.6875 15.9 21.2125C14.6833 21.7375 13.3833 22 12 22ZM12 20C14.2333 20 16.125 19.225 17.675 17.675C19.225 16.125 20 14.2333 20 12C20 9.76667 19.225 7.875 17.675 6.325C16.125 4.775 14.2333 4 12 4C9.76667 4 7.875 4.775 6.325 6.325C4.775 7.875 4 9.76667 4 12C4 14.2333 4.775 16.125 6.325 17.675C7.875 19.225 9.76667 20 12 20Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "download": {
    "path": "M12 17L5.75 10.75L7.5 8.9375L10.75 12.1875V2H13.25V12.1875L16.5 8.9375L18.25 10.75L12 17ZM4.5 22C3.8125 22 3.22396 21.7552 2.73438 21.2656C2.24479 20.776 2 20.1875 2 19.5V15.75H4.5V19.5H19.5V15.75H22V19.5C22 20.1875 21.7552 20.776 21.2656 21.2656C20.776 21.7552 20.1875 22 19.5 22H4.5Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "edit": {
    "path": "M5 19H6.425L16.2 9.225L14.775 7.8L5 17.575V19ZM3 21V16.75L16.2 3.575C16.4 3.39167 16.6208 3.25 16.8625 3.15C17.1042 3.05 17.3583 3 17.625 3C17.8917 3 18.15 3.05 18.4 3.15C18.65 3.25 18.8667 3.4 19.05 3.6L20.425 5C20.625 5.18333 20.7708 5.4 20.8625 5.65C20.9542 5.9 21 6.15 21 6.4C21 6.66667 20.9542 6.92083 20.8625 7.1625C20.7708 7.40417 20.625 7.625 20.425 7.825L7.25 21H3ZM15.475 8.525L14.775 7.8L16.2 9.225L15.475 8.525Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "error": {
    "path": "M12 17C12.2833 17 12.5208 16.9042 12.7125 16.7125C12.9042 16.5208 13 16.2833 13 16C13 15.7167 12.9042 15.4792 12.7125 15.2875C12.5208 15.0958 12.2833 15 12 15C11.7167 15 11.4792 15.0958 11.2875 15.2875C11.0958 15.4792 11 15.7167 11 16C11 16.2833 11.0958 16.5208 11.2875 16.7125C11.4792 16.9042 11.7167 17 12 17ZM11 13H13V7H11V13ZM12 22C10.6167 22 9.31667 21.7375 8.1 21.2125C6.88333 20.6875 5.825 19.975 4.925 19.075C4.025 18.175 3.3125 17.1167 2.7875 15.9C2.2625 14.6833 2 13.3833 2 12C2 10.6167 2.2625 9.31667 2.7875 8.1C3.3125 6.88333 4.025 5.825 4.925 4.925C5.825 4.025 6.88333 3.3125 8.1 2.7875C9.31667 2.2625 10.6167 2 12 2C13.3833 2 14.6833 2.2625 15.9 2.7875C17.1167 3.3125 18.175 4.025 19.075 4.925C19.975 5.825 20.6875 6.88333 21.2125 8.1C21.7375 9.31667 22 10.6167 22 12C22 13.3833 21.7375 14.6833 21.2125 15.9C20.6875 17.1167 19.975 18.175 19.075 19.075C18.175 19.975 17.1167 20.6875 15.9 21.2125C14.6833 21.7375 13.3833 22 12 22Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "favorite": {
    "path": "M12 21L10.55 19.7C8.86667 18.1834 7.475 16.875 6.375 15.775C5.275 14.675 4.4 13.6917 3.75 12.825C3.1 11.9417 2.64167 11.1334 2.375 10.4C2.125 9.66669 2 8.91669 2 8.15002C2 6.58336 2.525 5.27502 3.575 4.22502C4.625 3.17502 5.93333 2.65002 7.5 2.65002C8.36667 2.65002 9.19167 2.83336 9.975 3.20002C10.7583 3.56669 11.4333 4.08336 12 4.75003C12.5667 4.08336 13.2417 3.56669 14.025 3.20002C14.8083 2.83336 15.6333 2.65002 16.5 2.65002C18.0667 2.65002 19.375 3.17502 20.425 4.22502C21.475 5.27502 22 6.58336 22 8.15002C22 8.91669 21.8667 9.66669 21.6 10.4C21.35 11.1334 20.9 11.9417 20.25 12.825C19.6 13.6917 18.725 14.675 17.625 15.775C16.525 16.875 15.1333 18.1834 13.45 19.7L12 21ZM12 18.3C13.6 16.8667 14.9167 15.6417 15.95 14.625C16.9833 13.5917 17.8 12.7 18.4 11.95C19 11.1834 19.4167 10.5084 19.65 9.92503C19.8833 9.32503 20 8.73336 20 8.15002C20 7.15002 19.6667 6.31669 19 5.65003C18.3333 4.98336 17.5 4.65003 16.5 4.65003C15.7167 4.65003 14.9917 4.87503 14.325 5.32503C13.6583 5.75836 13.2 6.31669 12.95 7.00003H11.05C10.8 6.31669 10.3417 5.75836 9.675 5.32503C9.00833 4.87503 8.28333 4.65003 7.5 4.65003C6.5 4.65003 5.66667 4.98336 5 5.65003C4.33333 6.31669 4 7.15002 4 8.15002C4 8.73336 4.11667 9.32503 4.35 9.92503C4.58333 10.5084 5 11.1834 5.6 11.95C6.2 12.7 7.01667 13.5917 8.05 14.625C9.08333 15.6417 10.4 16.8667 12 18.3Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "folder": {
    "path": "M4 20C3.45 20 2.97917 19.8042 2.5875 19.4125C2.19583 19.0208 2 18.55 2 18V6C2 5.45 2.19583 4.97917 2.5875 4.5875C2.97917 4.19583 3.45 4 4 4H10L12 6H20C20.55 6 21.0208 6.19583 21.4125 6.5875C21.8042 6.97917 22 7.45 22 8V18C22 18.55 21.8042 19.0208 21.4125 19.4125C21.0208 19.8042 20.55 20 20 20H4ZM4 18H20V8H11.175L9.175 6H4V18Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "format_color_fill": {
    "path": "M6.175 1.4L7.6 0L16.175 8.575C16.5583 8.95833 16.75 9.43333 16.75 10C16.75 10.5667 16.5583 11.0417 16.175 11.425L11.425 16.175C11.0417 16.5583 10.5667 16.75 10 16.75C9.43333 16.75 8.95833 16.5583 8.575 16.175L3.825 11.425C3.44167 11.0417 3.25 10.5667 3.25 10C3.25 9.43333 3.44167 8.95833 3.825 8.575L8.575 3.8L6.175 1.4ZM10 5.225L5.225 10H14.775L10 5.225ZM19 17C18.45 17 17.9792 16.8042 17.5875 16.4125C17.1958 16.0208 17 15.55 17 15C17 14.65 17.1042 14.275 17.3125 13.875C17.5208 13.475 17.75 13.1 18 12.75C18.15 12.55 18.3083 12.3417 18.475 12.125C18.6417 11.9083 18.8167 11.7 19 11.5C19.1833 11.7 19.3583 11.9083 19.525 12.125C19.6917 12.3417 19.85 12.55 20 12.75C20.25 13.1 20.4792 13.475 20.6875 13.875C20.8958 14.275 21 14.65 21 15C21 15.55 20.8042 16.0208 20.4125 16.4125C20.0208 16.8042 19.55 17 19 17ZM2 24V20H22V24H2Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "home": {
    "path": "M4.5 20.5556H8.25V13.2222H15.75V20.5556H19.5V9.55556L12 4.05556L4.5 9.55556V20.5556ZM2 23V8.33333L12 1L22 8.33333V23H13.25V15.6667H10.75V23H2Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "info": {
    "path": "M13.7002 7.7998V21H10.2998V7.7998H13.7002ZM11.9502 3C12.4175 3.00009 12.8089 3.15851 13.125 3.47461C13.4412 3.79086 13.5996 4.18289 13.5996 4.65039C13.5995 5.11772 13.4412 5.50903 13.125 5.8252C12.8088 6.14136 12.4175 6.29972 11.9502 6.2998C11.4827 6.2998 11.0907 6.14145 10.7744 5.8252C10.4583 5.50905 10.2999 5.11767 10.2998 4.65039C10.2998 4.18289 10.4582 3.79086 10.7744 3.47461C11.0907 3.15836 11.4827 3 11.9502 3Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "language": {
    "path": "M12 22C10.6333 22 9.34167 21.7375 8.125 21.2125C6.90833 20.6875 5.84583 19.9708 4.9375 19.0625C4.02917 18.1542 3.3125 17.0917 2.7875 15.875C2.2625 14.6583 2 13.3667 2 12C2 10.6167 2.2625 9.32083 2.7875 8.1125C3.3125 6.90417 4.02917 5.84583 4.9375 4.9375C5.84583 4.02917 6.90833 3.3125 8.125 2.7875C9.34167 2.2625 10.6333 2 12 2C13.3833 2 14.6792 2.2625 15.8875 2.7875C17.0958 3.3125 18.1542 4.02917 19.0625 4.9375C19.9708 5.84583 20.6875 6.90417 21.2125 8.1125C21.7375 9.32083 22 10.6167 22 12C22 13.3667 21.7375 14.6583 21.2125 15.875C20.6875 17.0917 19.9708 18.1542 19.0625 19.0625C18.1542 19.9708 17.0958 20.6875 15.8875 21.2125C14.6792 21.7375 13.3833 22 12 22ZM12 19.95C12.4333 19.35 12.8083 18.725 13.125 18.075C13.4417 17.425 13.7 16.7333 13.9 16H10.1C10.3 16.7333 10.5583 17.425 10.875 18.075C11.1917 18.725 11.5667 19.35 12 19.95ZM9.4 19.55C9.1 19 8.8375 18.4292 8.6125 17.8375C8.3875 17.2458 8.2 16.6333 8.05 16H5.1C5.58333 16.8333 6.1875 17.5583 6.9125 18.175C7.6375 18.7917 8.46667 19.25 9.4 19.55ZM14.6 19.55C15.5333 19.25 16.3625 18.7917 17.0875 18.175C17.8125 17.5583 18.4167 16.8333 18.9 16H15.95C15.8 16.6333 15.6125 17.2458 15.3875 17.8375C15.1625 18.4292 14.9 19 14.6 19.55ZM4.25 14H7.65C7.6 13.6667 7.5625 13.3375 7.5375 13.0125C7.5125 12.6875 7.5 12.35 7.5 12C7.5 11.65 7.5125 11.3125 7.5375 10.9875C7.5625 10.6625 7.6 10.3333 7.65 10H4.25C4.16667 10.3333 4.10417 10.6625 4.0625 10.9875C4.02083 11.3125 4 11.65 4 12C4 12.35 4.02083 12.6875 4.0625 13.0125C4.10417 13.3375 4.16667 13.6667 4.25 14ZM9.65 14H14.35C14.4 13.6667 14.4375 13.3375 14.4625 13.0125C14.4875 12.6875 14.5 12.35 14.5 12C14.5 11.65 14.4875 11.3125 14.4625 10.9875C14.4375 10.6625 14.4 10.3333 14.35 10H9.65C9.6 10.3333 9.5625 10.6625 9.5375 10.9875C9.5125 11.3125 9.5 11.65 9.5 12C9.5 12.35 9.5125 12.6875 9.5375 13.0125C9.5625 13.3375 9.6 13.6667 9.65 14ZM16.35 14H19.75C19.8333 13.6667 19.8958 13.3375 19.9375 13.0125C19.9792 12.6875 20 12.35 20 12C20 11.65 19.9792 11.3125 19.9375 10.9875C19.8958 10.6625 19.8333 10.3333 19.75 10H16.35C16.4 10.3333 16.4375 10.6625 16.4625 10.9875C16.4875 11.3125 16.5 11.65 16.5 12C16.5 12.35 16.4875 12.6875 16.4625 13.0125C16.4375 13.3375 16.4 13.6667 16.35 14ZM15.95 8H18.9C18.4167 7.16667 17.8125 6.44167 17.0875 5.825C16.3625 5.20833 15.5333 4.75 14.6 4.45C14.9 5 15.1625 5.57083 15.3875 6.1625C15.6125 6.75417 15.8 7.36667 15.95 8ZM10.1 8H13.9C13.7 7.26667 13.4417 6.575 13.125 5.925C12.8083 5.275 12.4333 4.65 12 4.05C11.5667 4.65 11.1917 5.275 10.875 5.925C10.5583 6.575 10.3 7.26667 10.1 8ZM5.1 8H8.05C8.2 7.36667 8.3875 6.75417 8.6125 6.1625C8.8375 5.57083 9.1 5 9.4 4.45C8.46667 4.75 7.6375 5.20833 6.9125 5.825C6.1875 6.44167 5.58333 7.16667 5.1 8Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "link": {
    "path": "M11 18H7C5.61667 18 4.4375 17.415 3.4625 16.245C2.4875 15.075 2 13.66 2 12C2 10.34 2.4875 8.925 3.4625 7.755C4.4375 6.585 5.61667 6 7 6H11V8.4H7C6.16667 8.4 5.45833 8.75 4.875 9.45C4.29167 10.15 4 11 4 12C4 13 4.29167 13.85 4.875 14.55C5.45833 15.25 6.16667 15.6 7 15.6H11V18ZM8 13.2V10.8H16V13.2H8ZM13 18V15.6H17C17.8333 15.6 18.5417 15.25 19.125 14.55C19.7083 13.85 20 13 20 12C20 11 19.7083 10.15 19.125 9.45C18.5417 8.75 17.8333 8.4 17 8.4H13V6H17C18.3833 6 19.5625 6.585 20.5375 7.755C21.5125 8.925 22 10.34 22 12C22 13.66 21.5125 15.075 20.5375 16.245C19.5625 17.415 18.3833 18 17 18H13Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "link_off": {
    "path": "M19.25 16.45L17.75 14.9C18.4167 14.7167 18.9583 14.3625 19.375 13.8375C19.7917 13.3125 20 12.7 20 12C20 11.1667 19.7083 10.4583 19.125 9.87499C18.5417 9.29166 17.8333 8.99999 17 8.99999H13V6.99999H17C18.3833 6.99999 19.5625 7.48749 20.5375 8.46249C21.5125 9.43749 22 10.6167 22 12C22 12.95 21.7542 13.825 21.2625 14.625C20.7708 15.425 20.1 16.0333 19.25 16.45ZM15.85 13L13.85 11H16V13H15.85ZM19.8 22.6L1.39999 4.19999L2.79999 2.79999L21.2 21.2L19.8 22.6ZM11 17H6.99999C5.61666 17 4.43749 16.5125 3.46249 15.5375C2.48749 14.5625 1.99999 13.3833 1.99999 12C1.99999 10.85 2.34999 9.82499 3.04999 8.92499C3.74999 8.02499 4.64999 7.43332 5.74999 7.14999L7.59999 8.99999H6.99999C6.16666 8.99999 5.45833 9.29166 4.87499 9.87499C4.29166 10.4583 3.99999 11.1667 3.99999 12C3.99999 12.8333 4.29166 13.5417 4.87499 14.125C5.45833 14.7083 6.16666 15 6.99999 15H11V17ZM7.99999 13V11H9.62499L11.6 13H7.99999Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "mail": {
    "path": "M4 20C3.45 20 2.97917 19.8042 2.5875 19.4125C2.19583 19.0208 2 18.55 2 18V6C2 5.45 2.19583 4.97917 2.5875 4.5875C2.97917 4.19583 3.45 4 4 4H20C20.55 4 21.0208 4.19583 21.4125 4.5875C21.8042 4.97917 22 5.45 22 6V18C22 18.55 21.8042 19.0208 21.4125 19.4125C21.0208 19.8042 20.55 20 20 20H4ZM12 13L4 8V18H20V8L12 13ZM12 11L20 6H4L12 11ZM4 8V6V18V8Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "menu": {
    "path": "M3 18V16H21V18H3ZM3 13V11H21V13H3ZM3 8V6H21V8H3Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "minus": {
    "path": "M2 13.4287V10.5715H22V13.4287H2Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "more_vert": {
    "path": "M12 20C11.45 20 10.9792 19.8042 10.5875 19.4125C10.1958 19.0208 10 18.55 10 18C10 17.45 10.1958 16.9792 10.5875 16.5875C10.9792 16.1958 11.45 16 12 16C12.55 16 13.0208 16.1958 13.4125 16.5875C13.8042 16.9792 14 17.45 14 18C14 18.55 13.8042 19.0208 13.4125 19.4125C13.0208 19.8042 12.55 20 12 20ZM12 14C11.45 14 10.9792 13.8042 10.5875 13.4125C10.1958 13.0208 10 12.55 10 12C10 11.45 10.1958 10.9792 10.5875 10.5875C10.9792 10.1958 11.45 10 12 10C12.55 10 13.0208 10.1958 13.4125 10.5875C13.8042 10.9792 14 11.45 14 12C14 12.55 13.8042 13.0208 13.4125 13.4125C13.0208 13.8042 12.55 14 12 14ZM12 8C11.45 8 10.9792 7.80417 10.5875 7.4125C10.1958 7.02083 10 6.55 10 6C10 5.45 10.1958 4.97917 10.5875 4.5875C10.9792 4.19583 11.45 4 12 4C12.55 4 13.0208 4.19583 13.4125 4.5875C13.8042 4.97917 14 5.45 14 6C14 6.55 13.8042 7.02083 13.4125 7.4125C13.0208 7.80417 12.55 8 12 8Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "move_item": {
    "path": "M20.15 13H8V11H20.15L18.6 9.45L20 8L24 12L20 16L18.6 14.55L20.15 13ZM15 9V5H5V19H15V15H17V19C17 19.55 16.8042 20.0208 16.4125 20.4125C16.0208 20.8042 15.55 21 15 21H5C4.45 21 3.97917 20.8042 3.5875 20.4125C3.19583 20.0208 3 19.55 3 19V5C3 4.45 3.19583 3.97917 3.5875 3.5875C3.97917 3.19583 4.45 3 5 3H15C15.55 3 16.0208 3.19583 16.4125 3.5875C16.8042 3.97917 17 4.45 17 5V9H15Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "notifications": {
    "path": "M4 19V17H6V10C6 8.61667 6.41667 7.39167 7.25 6.325C8.08333 5.24167 9.16667 4.53333 10.5 4.2V3.5C10.5 3.08333 10.6417 2.73333 10.925 2.45C11.225 2.15 11.5833 2 12 2C12.4167 2 12.7667 2.15 13.05 2.45C13.35 2.73333 13.5 3.08333 13.5 3.5V4.2C14.8333 4.53333 15.9167 5.24167 16.75 6.325C17.5833 7.39167 18 8.61667 18 10V17H20V19H4ZM12 22C11.45 22 10.975 21.8083 10.575 21.425C10.1917 21.025 10 20.55 10 20H14C14 20.55 13.8 21.025 13.4 21.425C13.0167 21.8083 12.55 22 12 22ZM8 17H16V10C16 8.9 15.6083 7.95833 14.825 7.175C14.0417 6.39167 13.1 6 12 6C10.9 6 9.95833 6.39167 9.175 7.175C8.39167 7.95833 8 8.9 8 10V17Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "person": {
    "path": "M12 12C10.9 12 9.95833 11.6083 9.175 10.825C8.39167 10.0417 8 9.1 8 8C8 6.9 8.39167 5.95833 9.175 5.175C9.95833 4.39167 10.9 4 12 4C13.1 4 14.0417 4.39167 14.825 5.175C15.6083 5.95833 16 6.9 16 8C16 9.1 15.6083 10.0417 14.825 10.825C14.0417 11.6083 13.1 12 12 12ZM4 20V17.2C4 16.6333 4.14583 16.1125 4.4375 15.6375C4.72917 15.1625 5.11667 14.8 5.6 14.55C6.63333 14.0333 7.68333 13.6458 8.75 13.3875C9.81667 13.1292 10.9 13 12 13C13.1 13 14.1833 13.1292 15.25 13.3875C16.3167 13.6458 17.3667 14.0333 18.4 14.55C18.8833 14.8 19.2708 15.1625 19.5625 15.6375C19.8542 16.1125 20 16.6333 20 17.2V20H4ZM6 18H18V17.2C18 17.0167 17.9542 16.85 17.8625 16.7C17.7708 16.55 17.65 16.4333 17.5 16.35C16.6 15.9 15.6917 15.5625 14.775 15.3375C13.8583 15.1125 12.9333 15 12 15C11.0667 15 10.1417 15.1125 9.225 15.3375C8.30833 15.5625 7.4 15.9 6.5 16.35C6.35 16.4333 6.22917 16.55 6.1375 16.7C6.04583 16.85 6 17.0167 6 17.2V18ZM12 10C12.55 10 13.0208 9.80417 13.4125 9.4125C13.8042 9.02083 14 8.55 14 8C14 7.45 13.8042 6.97917 13.4125 6.5875C13.0208 6.19583 12.55 6 12 6C11.45 6 10.9792 6.19583 10.5875 6.5875C10.1958 6.97917 10 7.45 10 8C10 8.55 10.1958 9.02083 10.5875 9.4125C10.9792 9.80417 11.45 10 12 10Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "photo": {
    "path": "M5 21C4.45 21 3.975 20.8083 3.575 20.425C3.19167 20.025 3 19.55 3 19V5C3 4.45 3.19167 3.98333 3.575 3.6C3.975 3.2 4.45 3 5 3H19C19.55 3 20.0167 3.2 20.4 3.6C20.8 3.98333 21 4.45 21 5V19C21 19.55 20.8 20.025 20.4 20.425C20.0167 20.8083 19.55 21 19 21H5ZM5 19H19V5H5V19ZM6 17H18L14.25 12L11.25 16L9 13L6 17ZM5 19V5V19Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "play_arrow": {
    "path": "M8 19V5L19 12L8 19ZM10 15.35L15.25 12L10 8.65V15.35Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "play_arrow_filled": {
    "path": "M8 19V5L19 12L8 19Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "plus": {
    "path": "M10.5714 13.4286H2V10.5714H10.5714V2H13.4286V10.5714H22V13.4286H13.4286V22H10.5714V13.4286Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "schedule": {
    "path": "M15.3 16.7L16.7 15.3L13 11.6V7H11V12.4L15.3 16.7ZM12 22C10.6167 22 9.31667 21.7375 8.1 21.2125C6.88333 20.6875 5.825 19.975 4.925 19.075C4.025 18.175 3.3125 17.1167 2.7875 15.9C2.2625 14.6833 2 13.3833 2 12C2 10.6167 2.2625 9.31667 2.7875 8.1C3.3125 6.88333 4.025 5.825 4.925 4.925C5.825 4.025 6.88333 3.3125 8.1 2.7875C9.31667 2.2625 10.6167 2 12 2C13.3833 2 14.6833 2.2625 15.9 2.7875C17.1167 3.3125 18.175 4.025 19.075 4.925C19.975 5.825 20.6875 6.88333 21.2125 8.1C21.7375 9.31667 22 10.6167 22 12C22 13.3833 21.7375 14.6833 21.2125 15.9C20.6875 17.1167 19.975 18.175 19.075 19.075C18.175 19.975 17.1167 20.6875 15.9 21.2125C14.6833 21.7375 13.3833 22 12 22ZM12 20C14.2167 20 16.1042 19.2208 17.6625 17.6625C19.2208 16.1042 20 14.2167 20 12C20 9.78333 19.2208 7.89583 17.6625 6.3375C16.1042 4.77917 14.2167 4 12 4C9.78333 4 7.89583 4.77917 6.3375 6.3375C4.77917 7.89583 4 9.78333 4 12C4 14.2167 4.77917 16.1042 6.3375 17.6625C7.89583 19.2208 9.78333 20 12 20Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "search": {
    "path": "M20.4444 22L13.4444 15C12.8889 15.4444 12.25 15.7963 11.5278 16.0556C10.8056 16.3148 10.037 16.4444 9.22222 16.4444C7.2037 16.4444 5.49537 15.7454 4.09722 14.3472C2.69907 12.9491 2 11.2407 2 9.22222C2 7.2037 2.69907 5.49537 4.09722 4.09722C5.49537 2.69907 7.2037 2 9.22222 2C11.2407 2 12.9491 2.69907 14.3472 4.09722C15.7454 5.49537 16.4444 7.2037 16.4444 9.22222C16.4444 10.037 16.3148 10.8056 16.0556 11.5278C15.7963 12.25 15.4444 12.8889 15 13.4444L22 20.4444L20.4444 22ZM9.22222 14.2222C10.6111 14.2222 11.7917 13.7361 12.7639 12.7639C13.7361 11.7917 14.2222 10.6111 14.2222 9.22222C14.2222 7.83333 13.7361 6.65278 12.7639 5.68056C11.7917 4.70833 10.6111 4.22222 9.22222 4.22222C7.83333 4.22222 6.65278 4.70833 5.68056 5.68056C4.70833 6.65278 4.22222 7.83333 4.22222 9.22222C4.22222 10.6111 4.70833 11.7917 5.68056 12.7639C6.65278 13.7361 7.83333 14.2222 9.22222 14.2222Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "settings": {
    "path": "M9.25001 22L8.85001 18.8C8.63335 18.7167 8.42918 18.6167 8.23751 18.5C8.04585 18.3833 7.85835 18.2583 7.67501 18.125L4.70001 19.375L1.95001 14.625L4.52501 12.675C4.50835 12.5583 4.50001 12.4458 4.50001 12.3375V11.6625C4.50001 11.5542 4.50835 11.4417 4.52501 11.325L1.95001 9.375L4.70001 4.625L7.67501 5.875C7.85835 5.74167 8.05001 5.61667 8.25001 5.5C8.45001 5.38333 8.65001 5.28333 8.85001 5.2L9.25001 2H14.75L15.15 5.2C15.3667 5.28333 15.5708 5.38333 15.7625 5.5C15.9542 5.61667 16.1417 5.74167 16.325 5.875L19.3 4.625L22.05 9.375L19.475 11.325C19.4917 11.4417 19.5 11.5542 19.5 11.6625V12.3375C19.5 12.4458 19.4833 12.5583 19.45 12.675L22.025 14.625L19.275 19.375L16.325 18.125C16.1417 18.2583 15.95 18.3833 15.75 18.5C15.55 18.6167 15.35 18.7167 15.15 18.8L14.75 22H9.25001ZM11 20H12.975L13.325 17.35C13.8417 17.2167 14.3208 17.0208 14.7625 16.7625C15.2042 16.5042 15.6083 16.1917 15.975 15.825L18.45 16.85L19.425 15.15L17.275 13.525C17.3583 13.2917 17.4167 13.0458 17.45 12.7875C17.4833 12.5292 17.5 12.2667 17.5 12C17.5 11.7333 17.4833 11.4708 17.45 11.2125C17.4167 10.9542 17.3583 10.7083 17.275 10.475L19.425 8.85L18.45 7.15L15.975 8.2C15.6083 7.81667 15.2042 7.49583 14.7625 7.2375C14.3208 6.97917 13.8417 6.78333 13.325 6.65L13 4H11.025L10.675 6.65C10.1583 6.78333 9.67918 6.97917 9.23751 7.2375C8.79585 7.49583 8.39168 7.80833 8.02501 8.175L5.55001 7.15L4.57501 8.85L6.72501 10.45C6.64168 10.7 6.58335 10.95 6.55001 11.2C6.51668 11.45 6.50001 11.7167 6.50001 12C6.50001 12.2667 6.51668 12.525 6.55001 12.775C6.58335 13.025 6.64168 13.275 6.72501 13.525L4.57501 15.15L5.55001 16.85L8.02501 15.8C8.39168 16.1833 8.79585 16.5042 9.23751 16.7625C9.67918 17.0208 10.1583 17.2167 10.675 17.35L11 20ZM12.05 15.5C13.0167 15.5 13.8417 15.1583 14.525 14.475C15.2083 13.7917 15.55 12.9667 15.55 12C15.55 11.0333 15.2083 10.2083 14.525 9.525C13.8417 8.84167 13.0167 8.5 12.05 8.5C11.0667 8.5 10.2375 8.84167 9.56251 9.525C8.88751 10.2083 8.55001 11.0333 8.55001 12C8.55001 12.9667 8.88751 13.7917 9.56251 14.475C10.2375 15.1583 11.0667 15.5 12.05 15.5Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "share": {
    "path": "M18 22C17.1667 22 16.4583 21.7083 15.875 21.125C15.2917 20.5417 15 19.8333 15 19C15 18.8833 15.0083 18.7625 15.025 18.6375C15.0417 18.5125 15.0667 18.4 15.1 18.3L8.05 14.2C7.76667 14.45 7.45 14.6458 7.1 14.7875C6.75 14.9292 6.38333 15 6 15C5.16667 15 4.45833 14.7083 3.875 14.125C3.29167 13.5417 3 12.8333 3 12C3 11.1667 3.29167 10.4583 3.875 9.875C4.45833 9.29167 5.16667 9 6 9C6.38333 9 6.75 9.07083 7.1 9.2125C7.45 9.35417 7.76667 9.55 8.05 9.8L15.1 5.7C15.0667 5.6 15.0417 5.4875 15.025 5.3625C15.0083 5.2375 15 5.11667 15 5C15 4.16667 15.2917 3.45833 15.875 2.875C16.4583 2.29167 17.1667 2 18 2C18.8333 2 19.5417 2.29167 20.125 2.875C20.7083 3.45833 21 4.16667 21 5C21 5.83333 20.7083 6.54167 20.125 7.125C19.5417 7.70833 18.8333 8 18 8C17.6167 8 17.25 7.92917 16.9 7.7875C16.55 7.64583 16.2333 7.45 15.95 7.2L8.9 11.3C8.93333 11.4 8.95833 11.5125 8.975 11.6375C8.99167 11.7625 9 11.8833 9 12C9 12.1167 8.99167 12.2375 8.975 12.3625C8.95833 12.4875 8.93333 12.6 8.9 12.7L15.95 16.8C16.2333 16.55 16.55 16.3542 16.9 16.2125C17.25 16.0708 17.6167 16 18 16C18.8333 16 19.5417 16.2917 20.125 16.875C20.7083 17.4583 21 18.1667 21 19C21 19.8333 20.7083 20.5417 20.125 21.125C19.5417 21.7083 18.8333 22 18 22ZM18 6C18.2833 6 18.5208 5.90417 18.7125 5.7125C18.9042 5.52083 19 5.28333 19 5C19 4.71667 18.9042 4.47917 18.7125 4.2875C18.5208 4.09583 18.2833 4 18 4C17.7167 4 17.4792 4.09583 17.2875 4.2875C17.0958 4.47917 17 4.71667 17 5C17 5.28333 17.0958 5.52083 17.2875 5.7125C17.4792 5.90417 17.7167 6 18 6ZM6 13C6.28333 13 6.52083 12.9042 6.7125 12.7125C6.90417 12.5208 7 12.2833 7 12C7 11.7167 6.90417 11.4792 6.7125 11.2875C6.52083 11.0958 6.28333 11 6 11C5.71667 11 5.47917 11.0958 5.2875 11.2875C5.09583 11.4792 5 11.7167 5 12C5 12.2833 5.09583 12.5208 5.2875 12.7125C5.47917 12.9042 5.71667 13 6 13ZM18 20C18.2833 20 18.5208 19.9042 18.7125 19.7125C18.9042 19.5208 19 19.2833 19 19C19 18.7167 18.9042 18.4792 18.7125 18.2875C18.5208 18.0958 18.2833 18 18 18C17.7167 18 17.4792 18.0958 17.2875 18.2875C17.0958 18.4792 17 18.7167 17 19C17 19.2833 17.0958 19.5208 17.2875 19.7125C17.4792 19.9042 17.7167 20 18 20Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "simple": {
    "path": "M9 19C7.06667 19 5.41667 18.3167 4.05 16.95C2.68333 15.5833 2 13.9333 2 12C2 11.3667 2.15417 10.65 2.4625 9.85C2.77083 9.05 3.30833 8.2875 4.075 7.5625C4.84167 6.8375 5.86667 6.22917 7.15 5.7375C8.43333 5.24583 10.05 5 12 5C13.95 5 15.5667 5.24583 16.85 5.7375C18.1333 6.22917 19.1583 6.8375 19.925 7.5625C20.6917 8.2875 21.2292 9.05 21.5375 9.85C21.8458 10.65 22 11.3667 22 12C22 13.9333 21.3167 15.5833 19.95 16.95C18.5833 18.3167 16.9333 19 15 19H9ZM9.15 17H14.85C15.9 17 16.8542 16.7208 17.7125 16.1625C18.5708 15.6042 19.2 14.8833 19.6 14H4.4C4.8 14.8833 5.42917 15.6042 6.2875 16.1625C7.14583 16.7208 8.1 17 9.15 17ZM4 12H20C20 11.5 19.8667 10.9583 19.6 10.375C19.3333 9.79167 18.8875 9.25 18.2625 8.75C17.6375 8.25 16.8125 7.83333 15.7875 7.5C14.7625 7.16667 13.5 7 12 7C10.5 7 9.24167 7.16667 8.225 7.5C7.20833 7.83333 6.3875 8.25 5.7625 8.75C5.1375 9.25 4.6875 9.79167 4.4125 10.375C4.1375 10.9583 4 11.5 4 12Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "star": {
    "path": "M8.85 17.825L12 15.925L15.15 17.85L14.325 14.25L17.1 11.85L13.45 11.525L12 8.125L10.55 11.5L6.9 11.825L9.675 14.25L8.85 17.825ZM5.825 22L7.45 14.975L2 10.25L9.2 9.625L12 3L14.8 9.625L22 10.25L16.55 14.975L18.175 22L12 18.275L5.825 22Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  },
  "text_fields": {
    "path": "M7 20V7H2V4H15V7H10V20H7ZM16 20V12H13V9H22V12H19V20H16Z",
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
  }
};
const textInputIconSlots = [
  {
    "defaultIconId": "search",
    "defaultVisible": true,
    "iconSlotId": "icon.left",
    "name": "Left Icon",
    "propName": "Left Icon",
    "selectedIconId": "search",
    "visibilityPropName": "Show Left Icon"
  },
  {
    "defaultIconId": "x",
    "defaultVisible": true,
    "iconSlotId": "icon.right",
    "name": "Right Icon",
    "propName": "Right Icon",
    "selectedIconId": "x",
    "visibilityPropName": "Show Right Icon"
  }
] as const;
const textInputRecipe = {
  "anatomy": {
    "fieldChildNamesByVariant": {
      "basic": [
        "Field Text"
      ],
      "with-button": [
        "Field Text"
      ],
      "with-icon": [
        "Left Icon",
        "Field Text",
        "Right Icon"
      ]
    },
    "fieldChildOrderByVariant": {
      "basic": [
        "Field Text"
      ],
      "with-button": [
        "Field Text"
      ],
      "with-icon": [
        "Left Icon",
        "Field Text",
        "Right Icon"
      ]
    },
    "fieldId": "field",
    "inputRowChildNamesByVariant": {
      "basic": [
        "Field"
      ],
      "with-button": [
        "Field",
        "Action Button"
      ],
      "with-icon": [
        "Field"
      ]
    },
    "inputRowChildOrderByVariant": {
      "basic": [
        "field"
      ],
      "with-button": [
        "field",
        "Action Button"
      ],
      "with-icon": [
        "field"
      ]
    },
    "inputRowId": "input-row",
    "rootChildNamesByVariant": {
      "basic": [
        "Label",
        "Input Row",
        "Description"
      ],
      "with-button": [
        "Label",
        "Input Row",
        "Description"
      ],
      "with-icon": [
        "Label",
        "Input Row",
        "Description"
      ]
    },
    "rootChildOrderByVariant": {
      "basic": [
        "label",
        "input-row",
        "description"
      ],
      "with-button": [
        "label",
        "input-row",
        "description"
      ],
      "with-icon": [
        "label",
        "input-row",
        "description"
      ]
    },
    "rootId": "root"
  },
  "button": {
    "componentId": "component.button",
    "defaultLabel": "Search",
    "defaultSize": "md",
    "defaultVariant": "primary",
    "stateByTextInputState": {
      "default": "default",
      "focused": "default",
      "invalid": "default",
      "disabled": "disabled"
    }
  },
  "componentId": "component.text-input",
  "content": {
    "defaultButtonLabel": "Search",
    "defaultDescription": "Choose a unique username for your account.",
    "defaultFieldTextByVariant": {
      "basic": "Email",
      "with-button": "Search...",
      "with-icon": "Search"
    },
    "defaultInvalidText": "Error",
    "defaultLabel": "Email"
  },
  "defaultDescriptionVisible": false,
  "defaultLabelVisible": false,
  "defaultLeftIconVisible": true,
  "defaultRightIconVisible": true,
  "defaultState": "default",
  "defaultVariant": "basic",
  "visibilityProperties": {
    "description": "Show Description",
    "label": "Show Label"
  }
} as const;
const textInputTokenSlotIds = {
  "colorSlotIds": {
    "background": "background",
    "border": "border",
    "description": "description",
    "icon": "icon",
    "label": "label",
    "text": "text"
  },
  "numberSlotIds": {
    "borderWidth": "number.field.border.width",
    "compoundGap": "number.gap",
    "fieldGap": "number.field.gap",
    "fieldHeight": "number.field.size.height",
    "iconSize": "number.field.size.icon",
    "paddingX": "number.field.space.padding-x",
    "paddingY": "number.field.space.padding-y",
    "radius": "number.field.shape.radius",
    "stackGap": "number.stack.gap.label-to-field"
  },
  "typographySlotIds": {
    "description": "typography.text.description",
    "field": "typography.text.field",
    "label": "typography.text.label"
  }
} as const satisfies TextInputTokenSlotIds;
const textInputStateIds = {
  default: "default",
  disabled: "disabled",
} as const;

export function TextInput({
  actionButtonLabel,
  "aria-invalid": ariaInvalid,
  description = "Choose a unique username for your account.",
  disabled,
  id,
  label = "Email",
  leftIconId,
  mode,
  placeholder,
  rightIconId,
  showDescription = false,
  showLabel = false,
  showLeftIcon,
  showRightIcon,
  state,
  style,
  variant = "basic",
  ...props
}: TextInputProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const resolvedState =
    state ?? (disabled ? textInputStateIds.disabled : textInputRecipe.defaultState);
  const isDisabled = disabled || resolvedState === textInputStateIds.disabled;
  const resolvedPlaceholder =
    placeholder ??
    (resolvedState === "invalid"
      ? textInputRecipe.content.defaultInvalidText
      : textInputRecipe.content.defaultFieldTextByVariant[variant]);
  const tokenStyles = getTextInputTokenStyles({
    mode,
    state: resolvedState,
    variant,
  });
  const leftIcon = resolveTextInputIconSlot("icon.left", leftIconId, showLeftIcon);
  const rightIcon = resolveTextInputIconSlot("icon.right", rightIconId, showRightIcon);
  const showActionButton = variant === "with-button";
  const actionButtonState = textInputRecipe.button.stateByTextInputState[
    resolvedState
  ] as ButtonState;

  return (
    <div
      data-alpy-component="text-input"
      data-alpy-component-id={textInputRecipe.componentId}
      data-alpy-mode={mode}
      data-alpy-show-description={showDescription ? "true" : "false"}
      data-alpy-show-label={showLabel ? "true" : "false"}
      data-alpy-state={resolvedState}
      data-alpy-variant={variant}
      style={{ ...baseTextInputStyle, ...tokenStyles.root, ...style }}
    >
      {showLabel ? (
        <label
          data-alpy-slot={getTextInputRootSlotId(variant, 0)}
          htmlFor={inputId}
          style={{ ...labelLayoutStyle, ...tokenStyles.label }}
        >
          {label}
        </label>
      ) : null}
      <span
        data-alpy-slot={textInputRecipe.anatomy.inputRowId}
        style={{ ...inputRowLayoutStyle, ...tokenStyles.inputRow }}
      >
        <span
          data-alpy-slot={textInputRecipe.anatomy.fieldId}
          style={{ ...fieldLayoutStyle, ...tokenStyles.field }}
        >
          {variant === "with-icon" && leftIcon.isVisible ? (
            <TextInputIcon
              iconStyle={tokenStyles.icon}
              iconSvgStyle={tokenStyles.iconSvg}
              slot={leftIcon}
            />
          ) : null}
          <input
            {...props}
            aria-invalid={resolvedState === "invalid" ? true : ariaInvalid}
            data-alpy-control="input"
            disabled={isDisabled}
            id={inputId}
            placeholder={resolvedPlaceholder}
            style={{ ...inputLayoutStyle, ...tokenStyles.input }}
          />
          {variant === "with-icon" && rightIcon.isVisible ? (
            <TextInputIcon
              iconStyle={tokenStyles.icon}
              iconSvgStyle={tokenStyles.iconSvg}
              slot={rightIcon}
            />
          ) : null}
        </span>
        {showActionButton ? (
          <Button
            data-alpy-child-name={getTextInputActionButtonName()}
            disabled={isDisabled}
            mode={mode}
            size={textInputRecipe.button.defaultSize as ButtonSize}
            state={actionButtonState}
            style={actionButtonLayoutStyle}
            type="button"
            variant={textInputRecipe.button.defaultVariant as ButtonVariant}
          >
            {actionButtonLabel ?? textInputRecipe.button.defaultLabel}
          </Button>
        ) : null}
      </span>
      {showDescription ? (
        <span
          data-alpy-slot={getTextInputRootSlotId(variant, 2)}
          style={{ ...descriptionLayoutStyle, ...tokenStyles.description }}
        >
          {description}
        </span>
      ) : null}
    </div>
  );
}

function TextInputIcon({
  iconStyle,
  iconSvgStyle,
  slot,
}: {
  iconStyle: React.CSSProperties;
  iconSvgStyle: React.CSSProperties;
  slot: TextInputIconSlot;
}) {
  const iconPath = getTextInputIconPath(slot.iconId);
  const viewBoxSize = iconPath.viewBoxSize ?? 24;
  const windingRule = iconPath.windingRule === "EVENODD" ? "evenodd" : "nonzero";

  return (
    <span
      aria-hidden="true"
      data-alpy-icon-id={slot.iconId}
      data-alpy-icon-slot={slot.iconSlotId}
      data-alpy-icon-visible={slot.isVisible ? "true" : "false"}
      data-alpy-slot={slot.iconSlotId}
      style={{ ...iconLayoutStyle, ...iconStyle }}
      title={slot.name}
    >
      <svg
        aria-hidden="true"
        fill="none"
        focusable="false"
        style={{ ...iconSvgLayoutStyle, ...iconSvgStyle }}
        viewBox={"0 0 " + viewBoxSize + " " + viewBoxSize}
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

function getTextInputIconPath(iconId: TextInputIconId) {
  const iconPath = textInputIconPathsById[iconId];

  if (!iconPath) {
    throw new Error("Missing canonical Text Input icon path: " + iconId);
  }

  return iconPath;
}

function resolveTextInputIconSlot(
  iconSlotId: "icon.left" | "icon.right",
  iconId: TextInputIconId | undefined,
  isVisible: boolean | undefined,
): TextInputIconSlot {
  const slot = textInputIconSlots.find(
    (candidate) => candidate.iconSlotId === iconSlotId,
  );

  if (!slot) {
    throw new Error("Missing canonical Text Input icon slot: " + iconSlotId);
  }

  return {
    iconId: iconId ?? slot.selectedIconId,
    iconSlotId: slot.iconSlotId,
    isVisible: isVisible ?? slot.defaultVisible,
    name: slot.name,
  };
}

function getTextInputRootSlotId(variant: TextInputVariant, index: number) {
  const slotId = textInputRecipe.anatomy.rootChildOrderByVariant[variant]?.[index];

  if (!slotId) {
    throw new Error(
      "Missing canonical Text Input root child slot at index " +
        index +
        " for variant " +
        variant,
    );
  }

  return slotId;
}

function getTextInputActionButtonName() {
  const actionButtonName =
    textInputRecipe.anatomy.inputRowChildNamesByVariant["with-button"]?.[1];

  if (!actionButtonName) {
    throw new Error("Missing canonical Text Input action button child name.");
  }

  return actionButtonName;
}

const baseTextInputStyle: React.CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
  width: "100%",
};

const labelLayoutStyle: React.CSSProperties = {};

const inputRowLayoutStyle: React.CSSProperties = {
  alignItems: "stretch",
  display: "flex",
  width: "100%",
};

const fieldLayoutStyle: React.CSSProperties = {
  alignItems: "center",
  borderStyle: "solid",
  boxSizing: "border-box",
  display: "inline-flex",
  flex: "1 1 auto",
};

const inputLayoutStyle: React.CSSProperties = {
  background: "transparent",
  border: 0,
  boxSizing: "border-box",
  flex: "1 1 auto",
  margin: 0,
  minWidth: 0,
  outline: 0,
  padding: 0,
};

const iconLayoutStyle: React.CSSProperties = {
  alignItems: "center",
  display: "inline-flex",
  flex: "0 0 auto",
  justifyContent: "center",
};

const iconSvgLayoutStyle: React.CSSProperties = {};

const actionButtonLayoutStyle: React.CSSProperties = {
  alignSelf: "stretch",
};

const descriptionLayoutStyle: React.CSSProperties = {};

function getTextInputTokenStyles({
  mode,
  state,
  variant,
}: {
  mode: TextInputMode;
  state: TextInputState;
  variant: TextInputVariant;
}): TextInputResolvedStyles {
  const byState = (
    textInputTokenBindings[mode]?.[variant]?.[state] ??
    textInputTokenBindings[mode]?.[variant]?.[textInputRecipe.defaultState]
  ) as Record<string, string> | undefined;
  const colorSlots = textInputTokenSlotIds.colorSlotIds;
  const numberSlots = textInputTokenSlotIds.numberSlotIds;
  const typographySlots = textInputTokenSlotIds.typographySlotIds;
  const descriptionText = readTextInputToken(byState, typographySlots.description);
  const fieldText = readTextInputToken(byState, typographySlots.field);
  const labelText = readTextInputToken(byState, typographySlots.label);
  const fieldHeight = toCssVariableValue(
    readTextInputToken(byState, numberSlots.fieldHeight),
  );
  const iconSize =
    variant === "with-icon"
      ? toCssVariableValue(readTextInputToken(byState, numberSlots.iconSize))
      : undefined;
  const paddingX = toCssVariableValue(
    readTextInputToken(byState, numberSlots.paddingX),
  );
  const paddingY = toCssVariableValue(
    readTextInputToken(byState, numberSlots.paddingY),
  );

  return {
    description: removeEmptyStyleValues({
      color: toCssVariableValue(readTextInputToken(byState, colorSlots.description)),
      fontFamily: toCssTypographyFamilyValue(descriptionText),
      fontSize: toCssVariableValue(descriptionText, "font-size"),
      fontWeight: toCssVariableValue(descriptionText, "font-weight"),
      letterSpacing: toCssVariableValue(descriptionText, "letter-spacing"),
      lineHeight: toCssVariableValue(descriptionText, "line-height"),
    }),
    field: removeEmptyStyleValues({
      background: toCssVariableValue(readTextInputToken(byState, colorSlots.background)),
      borderColor: toCssVariableValue(readTextInputToken(byState, colorSlots.border)),
      borderRadius: toCssVariableValue(readTextInputToken(byState, numberSlots.radius)),
      borderWidth: toCssVariableValue(readTextInputToken(byState, numberSlots.borderWidth)),
      color: toCssVariableValue(readTextInputToken(byState, colorSlots.text)),
      gap: toCssVariableValue(readTextInputToken(byState, numberSlots.fieldGap)),
      height: fieldHeight,
      padding: paddingX && paddingY ? paddingY + " " + paddingX : undefined,
    }),
    icon: removeEmptyStyleValues({
      color:
        variant === "with-icon"
          ? toCssVariableValue(readTextInputToken(byState, colorSlots.icon))
          : undefined,
    }),
    iconSvg: removeEmptyStyleValues({
      height: iconSize,
      width: iconSize,
    }),
    input: removeEmptyStyleValues({
      color: toCssVariableValue(readTextInputToken(byState, colorSlots.text)),
      fontFamily: toCssTypographyFamilyValue(fieldText),
      fontSize: toCssVariableValue(fieldText, "font-size"),
      fontWeight: toCssVariableValue(fieldText, "font-weight"),
      letterSpacing: toCssVariableValue(fieldText, "letter-spacing"),
      lineHeight: toCssVariableValue(fieldText, "line-height"),
    }),
    inputRow: removeEmptyStyleValues({
      gap: toCssVariableValue(readTextInputToken(byState, numberSlots.compoundGap)),
      height: variant === "with-button" ? fieldHeight : undefined,
    }),
    label: removeEmptyStyleValues({
      color: toCssVariableValue(readTextInputToken(byState, colorSlots.label)),
      fontFamily: toCssTypographyFamilyValue(labelText),
      fontSize: toCssVariableValue(labelText, "font-size"),
      fontWeight: toCssVariableValue(labelText, "font-weight"),
      letterSpacing: toCssVariableValue(labelText, "letter-spacing"),
      lineHeight: toCssVariableValue(labelText, "line-height"),
    }),
    root: removeEmptyStyleValues({
      color: toCssVariableValue(readTextInputToken(byState, colorSlots.label)),
      gap: toCssVariableValue(readTextInputToken(byState, numberSlots.stackGap)),
    }),
  };
}

function readTextInputToken(
  byState: Record<string, string> | undefined,
  tokenSlotId: string,
) {
  const tokenRef = byState?.[tokenSlotId];

  if (!tokenRef) {
    throw new Error("Missing canonical Text Input token binding: " + tokenSlotId);
  }

  return tokenRef;
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

function removeEmptyStyleValues(style: TextInputStyle) {
  return Object.fromEntries(
    Object.entries(style).filter(([, value]) => value !== undefined),
  ) as React.CSSProperties;
}

