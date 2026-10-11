import * as React from "react";
import { Badge, type BadgeVariant } from "./Badge.js";
import { Cell, type CellState, type CellVariant } from "./Cell.js";
import { Checkbox, type CheckboxFocus, type CheckboxSize, type CheckboxState, type CheckboxVariant } from "./Checkbox.js";

export type TableMode = "light";
export type TableVariant = "basic" | "dynamic" | "expandable";
export type TableState = "default" | "hover";

export type TableIconId = "download" | "delete" | "schedule" | "chevron_forward" | "person" | "chevron_up" | "chevron_down";
export type TableColumnWidth = "fill" | "hug";
export type TableCellTone = "body" | "header";

export type TableColumnItem = {
  columnId: string;
  key?: React.Key;
  label: React.ReactNode;
  width?: TableColumnWidth;
};

export type TableCellAdornment =
  | { badgeComponentId?: string; kind: "badge"; label: React.ReactNode; variantId: BadgeVariant }
  | {
      checkboxComponentId?: string;
      focusId: CheckboxFocus;
      kind: "checkbox";
      selectionStateId: string;
      sizeId: CheckboxSize;
      stateId: CheckboxState;
      variantId: CheckboxVariant;
    }
  | { iconComponentId?: string; iconId: TableIconId; kind: "icon" };

export type TableCellItem = {
  cellId?: string | undefined;
  children?: React.ReactNode | undefined;
  columnId?: string | undefined;
  key?: React.Key | undefined;
  leading?: TableCellAdornment | undefined;
  region?: "body" | "header" | undefined;
  showLabel?: boolean | undefined;
  showSortIndicator?: boolean | undefined;
  state?: CellState | undefined;
  tone?: TableCellTone | undefined;
  trailing?: TableCellAdornment | undefined;
  variant?: CellVariant | undefined;
  width?: TableColumnWidth | undefined;
};

export type TableProps = Omit<
  React.TableHTMLAttributes<HTMLTableElement>,
  "children"
> & {
  children?: React.ReactNode;
  cellState?: CellState;
  cellVariant?: CellVariant;
  columns?: readonly TableColumnItem[];
  rows?: readonly (readonly TableCellItem[])[];
  mode: TableMode;
  state?: TableState;
  variant?: TableVariant;
  header?: boolean;
};

type TableStyle = React.CSSProperties & Record<string, string | number | undefined>;
type TableIconPathDefinition = {
  isStroke: boolean;
  path: string;
  viewBoxSize?: number;
  windingRule: string;
};
type TableTypographyStyle = Partial<Pick<
  React.CSSProperties,
  "fontFamily" | "fontSize" | "fontWeight" | "letterSpacing" | "lineHeight"
>>;
type TableCanonicalTokenValues = {
  cell: {
    bodyText: string | undefined;
    bodyTypography: TableTypographyStyle;
    contentGap: string | undefined;
    headerIcon: string | undefined;
    headerText: string | undefined;
    headerTypography: TableTypographyStyle;
    icon: string | undefined;
    iconSize: string | undefined;
    paddingX: string | undefined;
    rowHeight: string | undefined;
    sortIconSize: string | undefined;
  };
  table: {
    headerBackground: string | undefined;
    headerRadius: string | undefined;
    rowBackground: string | undefined;
    rowBorder: string | undefined;
    rowBorderWidth: string | undefined;
    rowHoverBackground: string | undefined;
    surfaceBackground: string | undefined;
  };
};

const tableTokenBindings = {
  "light": {
    "basic": {
      "default": {
        "header.background": "color.shades.neutral.subtle-one",
        "number.header.shape.radius": "radius.medium",
        "number.row.border.width": "border.width.1",
        "row.background": "color.surface.canvas",
        "row.border": "color.border.neutral.subtle.one",
        "surface.background": "color.surface.canvas"
      },
      "hover": {
        "header.background": "color.shades.neutral.subtle-one",
        "number.header.shape.radius": "radius.medium",
        "number.row.border.width": "border.width.1",
        "row.background": "color.surface.canvas",
        "row.background.hover": "color.surface.interaction.hover",
        "row.border": "color.border.neutral.subtle.one",
        "surface.background": "color.surface.canvas"
      }
    },
    "dynamic": {
      "default": {
        "header.background": "color.shades.neutral.subtle-one",
        "number.header.shape.radius": "radius.medium",
        "number.row.border.width": "border.width.1",
        "row.background": "color.surface.canvas",
        "row.border": "color.border.neutral.subtle.one",
        "surface.background": "color.surface.canvas"
      },
      "hover": {
        "header.background": "color.shades.neutral.subtle-one",
        "number.header.shape.radius": "radius.medium",
        "number.row.border.width": "border.width.1",
        "row.background": "color.surface.canvas",
        "row.background.hover": "color.surface.interaction.hover",
        "row.border": "color.border.neutral.subtle.one",
        "surface.background": "color.surface.canvas"
      }
    },
    "expandable": {
      "default": {
        "header.background": "color.shades.neutral.subtle-one",
        "number.header.shape.radius": "radius.medium",
        "number.row.border.width": "border.width.1",
        "row.background": "color.surface.canvas",
        "row.border": "color.border.neutral.subtle.one",
        "surface.background": "color.surface.canvas"
      },
      "hover": {
        "header.background": "color.shades.neutral.subtle-one",
        "number.header.shape.radius": "radius.medium",
        "number.row.border.width": "border.width.1",
        "row.background": "color.surface.canvas",
        "row.background.hover": "color.surface.interaction.hover",
        "row.border": "color.border.neutral.subtle.one",
        "surface.background": "color.surface.canvas"
      }
    }
  }
} as const;
const tableCellTokenBindings = {
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
const tableCellIconSizeTokensByMode = {
  "light": {
    "body": "icon.size.16",
    "sort": "icon.size.8"
  }
} as const;
const tableIconPathsById: Record<string, TableIconPathDefinition> = {
  "download": {
    "path": "M12 17L5.75 10.75L7.5 8.9375L10.75 12.1875V2H13.25V12.1875L16.5 8.9375L18.25 10.75L12 17ZM4.5 22C3.8125 22 3.22396 21.7552 2.73438 21.2656C2.24479 20.776 2 20.1875 2 19.5V15.75H4.5V19.5H19.5V15.75H22V19.5C22 20.1875 21.7552 20.776 21.2656 21.2656C20.776 21.7552 20.1875 22 19.5 22H4.5Z",
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
  "schedule": {
    "path": "M15.3 16.7L16.7 15.3L13 11.6V7H11V12.4L15.3 16.7ZM12 22C10.6167 22 9.31667 21.7375 8.1 21.2125C6.88333 20.6875 5.825 19.975 4.925 19.075C4.025 18.175 3.3125 17.1167 2.7875 15.9C2.2625 14.6833 2 13.3833 2 12C2 10.6167 2.2625 9.31667 2.7875 8.1C3.3125 6.88333 4.025 5.825 4.925 4.925C5.825 4.025 6.88333 3.3125 8.1 2.7875C9.31667 2.2625 10.6167 2 12 2C13.3833 2 14.6833 2.2625 15.9 2.7875C17.1167 3.3125 18.175 4.025 19.075 4.925C19.975 5.825 20.6875 6.88333 21.2125 8.1C21.7375 9.31667 22 10.6167 22 12C22 13.3833 21.7375 14.6833 21.2125 15.9C20.6875 17.1167 19.975 18.175 19.075 19.075C18.175 19.975 17.1167 20.6875 15.9 21.2125C14.6833 21.7375 13.3833 22 12 22ZM12 20C14.2167 20 16.1042 19.2208 17.6625 17.6625C19.2208 16.1042 20 14.2167 20 12C20 9.78333 19.2208 7.89583 17.6625 6.3375C16.1042 4.77917 14.2167 4 12 4C9.78333 4 7.89583 4.77917 6.3375 6.3375C4.77917 7.89583 4 9.78333 4 12C4 14.2167 4.77917 16.1042 6.3375 17.6625C7.89583 19.2208 9.78333 20 12 20Z",
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
  "person": {
    "path": "M12 12C10.9 12 9.95833 11.6083 9.175 10.825C8.39167 10.0417 8 9.1 8 8C8 6.9 8.39167 5.95833 9.175 5.175C9.95833 4.39167 10.9 4 12 4C13.1 4 14.0417 4.39167 14.825 5.175C15.6083 5.95833 16 6.9 16 8C16 9.1 15.6083 10.0417 14.825 10.825C14.0417 11.6083 13.1 12 12 12ZM4 20V17.2C4 16.6333 4.14583 16.1125 4.4375 15.6375C4.72917 15.1625 5.11667 14.8 5.6 14.55C6.63333 14.0333 7.68333 13.6458 8.75 13.3875C9.81667 13.1292 10.9 13 12 13C13.1 13 14.1833 13.1292 15.25 13.3875C16.3167 13.6458 17.3667 14.0333 18.4 14.55C18.8833 14.8 19.2708 15.1625 19.5625 15.6375C19.8542 16.1125 20 16.6333 20 17.2V20H4ZM6 18H18V17.2C18 17.0167 17.9542 16.85 17.8625 16.7C17.7708 16.55 17.65 16.4333 17.5 16.35C16.6 15.9 15.6917 15.5625 14.775 15.3375C13.8583 15.1125 12.9333 15 12 15C11.0667 15 10.1417 15.1125 9.225 15.3375C8.30833 15.5625 7.4 15.9 6.5 16.35C6.35 16.4333 6.22917 16.55 6.1375 16.7C6.04583 16.85 6 17.0167 6 17.2V18ZM12 10C12.55 10 13.0208 9.80417 13.4125 9.4125C13.8042 9.02083 14 8.55 14 8C14 7.45 13.8042 6.97917 13.4125 6.5875C13.0208 6.19583 12.55 6 12 6C11.45 6 10.9792 6.19583 10.5875 6.5875C10.1958 6.97917 10 7.45 10 8C10 8.55 10.1958 9.02083 10.5875 9.4125C10.9792 9.80417 11.45 10 12 10Z",
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
  "chevron_down": {
    "path": "M2 8.0001L3.775 6.2251L12 14.4501L20.225 6.2251L22 8.0001L12 18.0001L2 8.0001Z",
    "windingRule": "NONZERO",
    "isStroke": false,
    "viewBoxSize": 24
  }
};
const tableRecipe = {
  "badgeComponentId": "component.badge",
  "cellComponentId": "component.cell",
  "cellIconSizePaths": {
    "body": {
      "componentId": "component.iconGallery",
      "stateId": "default",
      "tokenSlotId": "size.sm",
      "variantId": "default"
    },
    "sort": {
      "componentId": "component.iconGallery",
      "stateId": "default",
      "tokenSlotId": "size.xxs",
      "variantId": "default"
    }
  },
  "checkboxComponentId": "component.checkbox",
  "checkboxSelection": {
    "focusId": "off",
    "sizeId": "sm",
    "stateIdsBySelection": {
      "checked": "selected",
      "unchecked": "default"
    },
    "variantId": "single"
  },
  "colorSlotIds": {
    "headerBackground": "header.background",
    "rowBackground": "row.background",
    "rowBackgroundHover": "row.background.hover",
    "rowBorder": "row.border",
    "surfaceBackground": "surface.background"
  },
  "defaultHeader": true,
  "defaultState": "default",
  "defaultVariant": "basic",
  "hoverRowIndex": 2,
  "iconIds": {
    "actionsLeading": "download",
    "actionsTrailing": "delete",
    "date": "schedule",
    "expandable": "chevron_forward",
    "members": "person"
  },
  "numberSlotIds": {
    "headerRadius": "number.header.shape.radius",
    "rowBorderWidth": "number.row.border.width"
  }
} as const;
const tableDefaultColumns: readonly TableColumnItem[] = [
  {
    "columnId": "name",
    "label": "Name",
    "width": "fill"
  },
  {
    "columnId": "date",
    "label": "Date",
    "width": "hug"
  },
  {
    "columnId": "members",
    "label": "Members",
    "width": "hug"
  },
  {
    "columnId": "impressions",
    "label": "Impressions",
    "width": "hug"
  },
  {
    "columnId": "ctr",
    "label": "CTR",
    "width": "hug"
  },
  {
    "columnId": "status",
    "label": "Status",
    "width": "hug"
  },
  {
    "columnId": "actions",
    "label": "Actions",
    "width": "hug"
  }
];
const tableDefaultHeaderCellsByVariant: Record<TableVariant, readonly TableCellItem[]> = {
  "basic": [
    {
      "cellId": "header.cell[0]",
      "children": "Name",
      "columnId": "name",
      "key": "header-name",
      "region": "header",
      "showLabel": true,
      "showSortIndicator": false,
      "tone": "header",
      "variant": "header",
      "width": "fill"
    },
    {
      "cellId": "header.cell[1]",
      "children": "Date",
      "columnId": "date",
      "key": "header-date",
      "region": "header",
      "showLabel": true,
      "showSortIndicator": true,
      "tone": "header",
      "variant": "header",
      "width": "hug"
    },
    {
      "cellId": "header.cell[2]",
      "children": "Members",
      "columnId": "members",
      "key": "header-members",
      "region": "header",
      "showLabel": true,
      "showSortIndicator": true,
      "tone": "header",
      "variant": "header",
      "width": "hug"
    },
    {
      "cellId": "header.cell[3]",
      "children": "Impressions",
      "columnId": "impressions",
      "key": "header-impressions",
      "region": "header",
      "showLabel": true,
      "showSortIndicator": true,
      "tone": "header",
      "variant": "header",
      "width": "hug"
    },
    {
      "cellId": "header.cell[4]",
      "children": "CTR",
      "columnId": "ctr",
      "key": "header-ctr",
      "region": "header",
      "showLabel": true,
      "showSortIndicator": true,
      "tone": "header",
      "variant": "header",
      "width": "hug"
    },
    {
      "cellId": "header.cell[5]",
      "children": "Status",
      "columnId": "status",
      "key": "header-status",
      "region": "header",
      "showLabel": true,
      "showSortIndicator": true,
      "tone": "header",
      "variant": "header",
      "width": "hug"
    },
    {
      "cellId": "header.cell[6]",
      "children": "",
      "columnId": "actions",
      "key": "header-actions",
      "leading": {
        "iconComponentId": "component.iconGallery",
        "iconId": "download",
        "kind": "icon"
      },
      "trailing": {
        "iconComponentId": "component.iconGallery",
        "iconId": "delete",
        "kind": "icon"
      },
      "region": "header",
      "showLabel": false,
      "showSortIndicator": false,
      "tone": "body",
      "variant": "header",
      "width": "hug"
    }
  ],
  "dynamic": [
    {
      "cellId": "header.cell[0]",
      "children": "Name",
      "columnId": "name",
      "key": "header-name",
      "leading": {
        "checkboxComponentId": "component.checkbox",
        "focusId": "off",
        "kind": "checkbox",
        "selectionStateId": "unchecked",
        "sizeId": "sm",
        "stateId": "default",
        "variantId": "single"
      },
      "region": "header",
      "showLabel": true,
      "showSortIndicator": false,
      "tone": "header",
      "variant": "header",
      "width": "fill"
    },
    {
      "cellId": "header.cell[1]",
      "children": "Date",
      "columnId": "date",
      "key": "header-date",
      "region": "header",
      "showLabel": true,
      "showSortIndicator": true,
      "tone": "header",
      "variant": "header",
      "width": "hug"
    },
    {
      "cellId": "header.cell[2]",
      "children": "Members",
      "columnId": "members",
      "key": "header-members",
      "region": "header",
      "showLabel": true,
      "showSortIndicator": true,
      "tone": "header",
      "variant": "header",
      "width": "hug"
    },
    {
      "cellId": "header.cell[3]",
      "children": "Impressions",
      "columnId": "impressions",
      "key": "header-impressions",
      "region": "header",
      "showLabel": true,
      "showSortIndicator": true,
      "tone": "header",
      "variant": "header",
      "width": "hug"
    },
    {
      "cellId": "header.cell[4]",
      "children": "CTR",
      "columnId": "ctr",
      "key": "header-ctr",
      "region": "header",
      "showLabel": true,
      "showSortIndicator": true,
      "tone": "header",
      "variant": "header",
      "width": "hug"
    },
    {
      "cellId": "header.cell[5]",
      "children": "Status",
      "columnId": "status",
      "key": "header-status",
      "region": "header",
      "showLabel": true,
      "showSortIndicator": true,
      "tone": "header",
      "variant": "header",
      "width": "hug"
    },
    {
      "cellId": "header.cell[6]",
      "children": "",
      "columnId": "actions",
      "key": "header-actions",
      "leading": {
        "iconComponentId": "component.iconGallery",
        "iconId": "download",
        "kind": "icon"
      },
      "trailing": {
        "iconComponentId": "component.iconGallery",
        "iconId": "delete",
        "kind": "icon"
      },
      "region": "header",
      "showLabel": false,
      "showSortIndicator": false,
      "tone": "body",
      "variant": "header",
      "width": "hug"
    }
  ],
  "expandable": [
    {
      "cellId": "header.cell[0]",
      "children": "Name",
      "columnId": "name",
      "key": "header-name",
      "region": "header",
      "showLabel": true,
      "showSortIndicator": false,
      "tone": "header",
      "variant": "header",
      "width": "fill"
    },
    {
      "cellId": "header.cell[1]",
      "children": "Date",
      "columnId": "date",
      "key": "header-date",
      "region": "header",
      "showLabel": true,
      "showSortIndicator": true,
      "tone": "header",
      "variant": "header",
      "width": "hug"
    },
    {
      "cellId": "header.cell[2]",
      "children": "Members",
      "columnId": "members",
      "key": "header-members",
      "region": "header",
      "showLabel": true,
      "showSortIndicator": true,
      "tone": "header",
      "variant": "header",
      "width": "hug"
    },
    {
      "cellId": "header.cell[3]",
      "children": "Impressions",
      "columnId": "impressions",
      "key": "header-impressions",
      "region": "header",
      "showLabel": true,
      "showSortIndicator": true,
      "tone": "header",
      "variant": "header",
      "width": "hug"
    },
    {
      "cellId": "header.cell[4]",
      "children": "CTR",
      "columnId": "ctr",
      "key": "header-ctr",
      "region": "header",
      "showLabel": true,
      "showSortIndicator": true,
      "tone": "header",
      "variant": "header",
      "width": "hug"
    },
    {
      "cellId": "header.cell[5]",
      "children": "Status",
      "columnId": "status",
      "key": "header-status",
      "region": "header",
      "showLabel": true,
      "showSortIndicator": true,
      "tone": "header",
      "variant": "header",
      "width": "hug"
    },
    {
      "cellId": "header.cell[6]",
      "children": "",
      "columnId": "actions",
      "key": "header-actions",
      "leading": {
        "iconComponentId": "component.iconGallery",
        "iconId": "download",
        "kind": "icon"
      },
      "trailing": {
        "iconComponentId": "component.iconGallery",
        "iconId": "delete",
        "kind": "icon"
      },
      "region": "header",
      "showLabel": false,
      "showSortIndicator": false,
      "tone": "body",
      "variant": "header",
      "width": "hug"
    }
  ]
};
const tableDefaultRowsByVariant: Record<TableVariant, readonly (readonly TableCellItem[])[]> = {
  "basic": [
    [
      {
        "cellId": "rows[0].cell[0]",
        "columnId": "name",
        "key": "0-name",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "fill",
        "children": "SOP"
      },
      {
        "cellId": "rows[0].cell[1]",
        "columnId": "date",
        "key": "0-date",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "03/25/24"
      },
      {
        "cellId": "rows[0].cell[2]",
        "columnId": "members",
        "key": "0-members",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "345"
      },
      {
        "cellId": "rows[0].cell[3]",
        "columnId": "impressions",
        "key": "0-impressions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "23,678"
      },
      {
        "cellId": "rows[0].cell[4]",
        "columnId": "ctr",
        "key": "0-ctr",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "40.5%"
      },
      {
        "cellId": "rows[0].cell[5]",
        "columnId": "status",
        "key": "0-status",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "Pending"
      },
      {
        "cellId": "rows[0].cell[6]",
        "columnId": "actions",
        "key": "0-actions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "download",
          "kind": "icon"
        },
        "showLabel": false,
        "trailing": {
          "iconComponentId": "component.iconGallery",
          "iconId": "delete",
          "kind": "icon"
        }
      }
    ],
    [
      {
        "cellId": "rows[1].cell[0]",
        "columnId": "name",
        "key": "1-name",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "fill",
        "children": "Submissions"
      },
      {
        "cellId": "rows[1].cell[1]",
        "columnId": "date",
        "key": "1-date",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "03/25/24"
      },
      {
        "cellId": "rows[1].cell[2]",
        "columnId": "members",
        "key": "1-members",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "4,464"
      },
      {
        "cellId": "rows[1].cell[3]",
        "columnId": "impressions",
        "key": "1-impressions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "14,236"
      },
      {
        "cellId": "rows[1].cell[4]",
        "columnId": "ctr",
        "key": "1-ctr",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "45.6%"
      },
      {
        "cellId": "rows[1].cell[5]",
        "columnId": "status",
        "key": "1-status",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "Active"
      },
      {
        "cellId": "rows[1].cell[6]",
        "columnId": "actions",
        "key": "1-actions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "download",
          "kind": "icon"
        },
        "showLabel": false,
        "trailing": {
          "iconComponentId": "component.iconGallery",
          "iconId": "delete",
          "kind": "icon"
        }
      }
    ],
    [
      {
        "cellId": "rows[2].cell[0]",
        "columnId": "name",
        "key": "2-name",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "fill",
        "children": "Academic Documents"
      },
      {
        "cellId": "rows[2].cell[1]",
        "columnId": "date",
        "key": "2-date",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "03/24/24"
      },
      {
        "cellId": "rows[2].cell[2]",
        "columnId": "members",
        "key": "2-members",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "1,746"
      },
      {
        "cellId": "rows[2].cell[3]",
        "columnId": "impressions",
        "key": "2-impressions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "8,543"
      },
      {
        "cellId": "rows[2].cell[4]",
        "columnId": "ctr",
        "key": "2-ctr",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "33.7%"
      },
      {
        "cellId": "rows[2].cell[5]",
        "columnId": "status",
        "key": "2-status",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "Active"
      },
      {
        "cellId": "rows[2].cell[6]",
        "columnId": "actions",
        "key": "2-actions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "download",
          "kind": "icon"
        },
        "showLabel": false,
        "trailing": {
          "iconComponentId": "component.iconGallery",
          "iconId": "delete",
          "kind": "icon"
        }
      }
    ],
    [
      {
        "cellId": "rows[3].cell[0]",
        "columnId": "name",
        "key": "3-name",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "fill",
        "children": "Compliance Audit Regs"
      },
      {
        "cellId": "rows[3].cell[1]",
        "columnId": "date",
        "key": "3-date",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "03/23/24"
      },
      {
        "cellId": "rows[3].cell[2]",
        "columnId": "members",
        "key": "3-members",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "463"
      },
      {
        "cellId": "rows[3].cell[3]",
        "columnId": "impressions",
        "key": "3-impressions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "53,626"
      },
      {
        "cellId": "rows[3].cell[4]",
        "columnId": "ctr",
        "key": "3-ctr",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "34.1%"
      },
      {
        "cellId": "rows[3].cell[5]",
        "columnId": "status",
        "key": "3-status",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "Cancelled"
      },
      {
        "cellId": "rows[3].cell[6]",
        "columnId": "actions",
        "key": "3-actions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "download",
          "kind": "icon"
        },
        "showLabel": false,
        "trailing": {
          "iconComponentId": "component.iconGallery",
          "iconId": "delete",
          "kind": "icon"
        }
      }
    ]
  ],
  "dynamic": [
    [
      {
        "cellId": "rows[0].cell[0]",
        "columnId": "name",
        "key": "0-name",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "fill",
        "children": "SOP",
        "leading": {
          "checkboxComponentId": "component.checkbox",
          "focusId": "off",
          "kind": "checkbox",
          "selectionStateId": "unchecked",
          "sizeId": "sm",
          "stateId": "default",
          "variantId": "single"
        }
      },
      {
        "cellId": "rows[0].cell[1]",
        "columnId": "date",
        "key": "0-date",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "03/25/24",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "schedule",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[0].cell[2]",
        "columnId": "members",
        "key": "0-members",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "345",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "person",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[0].cell[3]",
        "columnId": "impressions",
        "key": "0-impressions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "23,678"
      },
      {
        "cellId": "rows[0].cell[4]",
        "columnId": "ctr",
        "key": "0-ctr",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "40.5%"
      },
      {
        "cellId": "rows[0].cell[5]",
        "columnId": "status",
        "key": "0-status",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "badgeComponentId": "component.badge",
          "kind": "badge",
          "label": "Pending",
          "variantId": "warning"
        },
        "showLabel": false
      },
      {
        "cellId": "rows[0].cell[6]",
        "columnId": "actions",
        "key": "0-actions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "download",
          "kind": "icon"
        },
        "showLabel": false,
        "trailing": {
          "iconComponentId": "component.iconGallery",
          "iconId": "delete",
          "kind": "icon"
        }
      }
    ],
    [
      {
        "cellId": "rows[1].cell[0]",
        "columnId": "name",
        "key": "1-name",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "fill",
        "children": "Submissions",
        "leading": {
          "checkboxComponentId": "component.checkbox",
          "focusId": "off",
          "kind": "checkbox",
          "selectionStateId": "unchecked",
          "sizeId": "sm",
          "stateId": "default",
          "variantId": "single"
        }
      },
      {
        "cellId": "rows[1].cell[1]",
        "columnId": "date",
        "key": "1-date",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "03/25/24",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "schedule",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[1].cell[2]",
        "columnId": "members",
        "key": "1-members",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "4,464",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "person",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[1].cell[3]",
        "columnId": "impressions",
        "key": "1-impressions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "14,236"
      },
      {
        "cellId": "rows[1].cell[4]",
        "columnId": "ctr",
        "key": "1-ctr",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "45.6%"
      },
      {
        "cellId": "rows[1].cell[5]",
        "columnId": "status",
        "key": "1-status",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "badgeComponentId": "component.badge",
          "kind": "badge",
          "label": "Active",
          "variantId": "success"
        },
        "showLabel": false
      },
      {
        "cellId": "rows[1].cell[6]",
        "columnId": "actions",
        "key": "1-actions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "download",
          "kind": "icon"
        },
        "showLabel": false,
        "trailing": {
          "iconComponentId": "component.iconGallery",
          "iconId": "delete",
          "kind": "icon"
        }
      }
    ],
    [
      {
        "cellId": "rows[2].cell[0]",
        "columnId": "name",
        "key": "2-name",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "fill",
        "children": "Academic Documents",
        "leading": {
          "checkboxComponentId": "component.checkbox",
          "focusId": "off",
          "kind": "checkbox",
          "selectionStateId": "unchecked",
          "sizeId": "sm",
          "stateId": "default",
          "variantId": "single"
        }
      },
      {
        "cellId": "rows[2].cell[1]",
        "columnId": "date",
        "key": "2-date",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "03/24/24",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "schedule",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[2].cell[2]",
        "columnId": "members",
        "key": "2-members",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "1,746",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "person",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[2].cell[3]",
        "columnId": "impressions",
        "key": "2-impressions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "8,543"
      },
      {
        "cellId": "rows[2].cell[4]",
        "columnId": "ctr",
        "key": "2-ctr",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "33.7%"
      },
      {
        "cellId": "rows[2].cell[5]",
        "columnId": "status",
        "key": "2-status",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "badgeComponentId": "component.badge",
          "kind": "badge",
          "label": "Active",
          "variantId": "success"
        },
        "showLabel": false
      },
      {
        "cellId": "rows[2].cell[6]",
        "columnId": "actions",
        "key": "2-actions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "download",
          "kind": "icon"
        },
        "showLabel": false,
        "trailing": {
          "iconComponentId": "component.iconGallery",
          "iconId": "delete",
          "kind": "icon"
        }
      }
    ],
    [
      {
        "cellId": "rows[3].cell[0]",
        "columnId": "name",
        "key": "3-name",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "fill",
        "children": "Compliance Audit Regs",
        "leading": {
          "checkboxComponentId": "component.checkbox",
          "focusId": "off",
          "kind": "checkbox",
          "selectionStateId": "checked",
          "sizeId": "sm",
          "stateId": "selected",
          "variantId": "single"
        }
      },
      {
        "cellId": "rows[3].cell[1]",
        "columnId": "date",
        "key": "3-date",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "03/23/24",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "schedule",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[3].cell[2]",
        "columnId": "members",
        "key": "3-members",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "463",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "person",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[3].cell[3]",
        "columnId": "impressions",
        "key": "3-impressions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "53,626"
      },
      {
        "cellId": "rows[3].cell[4]",
        "columnId": "ctr",
        "key": "3-ctr",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "34.1%"
      },
      {
        "cellId": "rows[3].cell[5]",
        "columnId": "status",
        "key": "3-status",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "badgeComponentId": "component.badge",
          "kind": "badge",
          "label": "Cancelled",
          "variantId": "danger"
        },
        "showLabel": false
      },
      {
        "cellId": "rows[3].cell[6]",
        "columnId": "actions",
        "key": "3-actions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "download",
          "kind": "icon"
        },
        "showLabel": false,
        "trailing": {
          "iconComponentId": "component.iconGallery",
          "iconId": "delete",
          "kind": "icon"
        }
      }
    ]
  ],
  "expandable": [
    [
      {
        "cellId": "rows[0].cell[0]",
        "columnId": "name",
        "key": "0-name",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "fill",
        "children": "SOP",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "chevron_forward",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[0].cell[1]",
        "columnId": "date",
        "key": "0-date",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "03/25/24",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "schedule",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[0].cell[2]",
        "columnId": "members",
        "key": "0-members",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "345",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "person",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[0].cell[3]",
        "columnId": "impressions",
        "key": "0-impressions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "23,678"
      },
      {
        "cellId": "rows[0].cell[4]",
        "columnId": "ctr",
        "key": "0-ctr",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "40.5%"
      },
      {
        "cellId": "rows[0].cell[5]",
        "columnId": "status",
        "key": "0-status",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "badgeComponentId": "component.badge",
          "kind": "badge",
          "label": "Pending",
          "variantId": "warning"
        },
        "showLabel": false
      },
      {
        "cellId": "rows[0].cell[6]",
        "columnId": "actions",
        "key": "0-actions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "download",
          "kind": "icon"
        },
        "showLabel": false,
        "trailing": {
          "iconComponentId": "component.iconGallery",
          "iconId": "delete",
          "kind": "icon"
        }
      }
    ],
    [
      {
        "cellId": "rows[1].cell[0]",
        "columnId": "name",
        "key": "1-name",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "fill",
        "children": "Submissions",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "chevron_forward",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[1].cell[1]",
        "columnId": "date",
        "key": "1-date",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "03/25/24",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "schedule",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[1].cell[2]",
        "columnId": "members",
        "key": "1-members",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "4,464",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "person",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[1].cell[3]",
        "columnId": "impressions",
        "key": "1-impressions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "14,236"
      },
      {
        "cellId": "rows[1].cell[4]",
        "columnId": "ctr",
        "key": "1-ctr",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "45.6%"
      },
      {
        "cellId": "rows[1].cell[5]",
        "columnId": "status",
        "key": "1-status",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "badgeComponentId": "component.badge",
          "kind": "badge",
          "label": "Active",
          "variantId": "success"
        },
        "showLabel": false
      },
      {
        "cellId": "rows[1].cell[6]",
        "columnId": "actions",
        "key": "1-actions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "download",
          "kind": "icon"
        },
        "showLabel": false,
        "trailing": {
          "iconComponentId": "component.iconGallery",
          "iconId": "delete",
          "kind": "icon"
        }
      }
    ],
    [
      {
        "cellId": "rows[2].cell[0]",
        "columnId": "name",
        "key": "2-name",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "fill",
        "children": "Academic Documents",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "chevron_forward",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[2].cell[1]",
        "columnId": "date",
        "key": "2-date",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "03/24/24",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "schedule",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[2].cell[2]",
        "columnId": "members",
        "key": "2-members",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "1,746",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "person",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[2].cell[3]",
        "columnId": "impressions",
        "key": "2-impressions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "8,543"
      },
      {
        "cellId": "rows[2].cell[4]",
        "columnId": "ctr",
        "key": "2-ctr",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "33.7%"
      },
      {
        "cellId": "rows[2].cell[5]",
        "columnId": "status",
        "key": "2-status",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "badgeComponentId": "component.badge",
          "kind": "badge",
          "label": "Active",
          "variantId": "success"
        },
        "showLabel": false
      },
      {
        "cellId": "rows[2].cell[6]",
        "columnId": "actions",
        "key": "2-actions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "download",
          "kind": "icon"
        },
        "showLabel": false,
        "trailing": {
          "iconComponentId": "component.iconGallery",
          "iconId": "delete",
          "kind": "icon"
        }
      }
    ],
    [
      {
        "cellId": "rows[3].cell[0]",
        "columnId": "name",
        "key": "3-name",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "fill",
        "children": "Compliance Audit Regs",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "chevron_forward",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[3].cell[1]",
        "columnId": "date",
        "key": "3-date",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "03/23/24",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "schedule",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[3].cell[2]",
        "columnId": "members",
        "key": "3-members",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "463",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "person",
          "kind": "icon"
        }
      },
      {
        "cellId": "rows[3].cell[3]",
        "columnId": "impressions",
        "key": "3-impressions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "53,626"
      },
      {
        "cellId": "rows[3].cell[4]",
        "columnId": "ctr",
        "key": "3-ctr",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "children": "34.1%"
      },
      {
        "cellId": "rows[3].cell[5]",
        "columnId": "status",
        "key": "3-status",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "badgeComponentId": "component.badge",
          "kind": "badge",
          "label": "Cancelled",
          "variantId": "danger"
        },
        "showLabel": false
      },
      {
        "cellId": "rows[3].cell[6]",
        "columnId": "actions",
        "key": "3-actions",
        "region": "body",
        "tone": "body",
        "variant": "default",
        "width": "hug",
        "leading": {
          "iconComponentId": "component.iconGallery",
          "iconId": "download",
          "kind": "icon"
        },
        "showLabel": false,
        "trailing": {
          "iconComponentId": "component.iconGallery",
          "iconId": "delete",
          "kind": "icon"
        }
      }
    ]
  ]
};

export function Table({
  cellState,
  cellVariant,
  children,
  columns = tableDefaultColumns,
  mode,
  rows,
  state = "default",
  style,
  variant = "basic",
  header = true,
  ...props
}: TableProps) {
  const tokenValues = getTableCanonicalTokenValues({ mode, state, variant });
  const resolvedRows = rows ?? tableDefaultRowsByVariant[variant];
  const headerCells = tableDefaultHeaderCellsByVariant[variant];

  return (
    <table
      {...props}
      data-alpy-component="table"
      data-alpy-mode={mode}
      data-alpy-state={state}
      data-alpy-variant={variant}
      data-alpy-header={String(header)}
      style={createTableRootStyle(tokenValues, style)}
    >
      {children}
      {header && columns.length > 0 ? (
        <thead data-alpy-table-head="">
          <tr data-alpy-table-row="">
            {columns.map((column, columnIndex) => {
              const cell = createTableHeaderCell(column, headerCells[columnIndex], columnIndex);

              return renderTableCell({
                as: "th",
                cell,
                cellIndex: columnIndex,
                cellState,
                cellVariant,
                column,
                isFirstColumn: columnIndex === 0,
                isLastColumn: columnIndex === columns.length - 1,
                isLastRow: false,
                isHoverRow: false,
                key: column.key ?? cell.key ?? column.columnId,
                mode,
                tokenValues,
              });
            })}
          </tr>
        </thead>
      ) : null}
      {resolvedRows.length > 0 ? (
        <tbody data-alpy-table-body="">
          {resolvedRows.map((row, rowIndex) => (
            <tr data-alpy-table-row="" key={rowIndex}>
              {row.map((cell, cellIndex) => {
                const column = columns[cellIndex];

                return renderTableCell({
                  as: "td",
                  cell: createTableBodyCell(cell, column, rowIndex, cellIndex),
                  cellIndex,
                  cellState,
                  cellVariant,
                  column,
                  isFirstColumn: cellIndex === 0,
                  isLastColumn: cellIndex === row.length - 1,
                  isLastRow: rowIndex === resolvedRows.length - 1,
                  isHoverRow: state === "hover" && rowIndex === tableRecipe.hoverRowIndex,
                  key: cell.key ?? cell.cellId ?? cellIndex,
                  mode,
                  tokenValues,
                });
              })}
            </tr>
          ))}
        </tbody>
      ) : null}
    </table>
  );
}

function createTableHeaderCell(
  column: TableColumnItem,
  defaultCell: TableCellItem | undefined,
  columnIndex: number,
): TableCellItem {
  return {
    cellId: defaultCell?.cellId ?? `header.cell[${columnIndex}]`,
    children: column.label,
    columnId: column.columnId,
    key: column.key ?? defaultCell?.key ?? column.columnId,
    leading: defaultCell?.leading,
    region: "header",
    showLabel: defaultCell?.showLabel ?? true,
    showSortIndicator: defaultCell?.showSortIndicator ?? false,
    tone: defaultCell?.tone ?? "header",
    trailing: defaultCell?.trailing,
    variant: defaultCell?.variant,
    width: column.width ?? defaultCell?.width ?? "hug",
  };
}

function createTableBodyCell(
  cell: TableCellItem,
  column: TableColumnItem | undefined,
  rowIndex: number,
  cellIndex: number,
): TableCellItem {
  return {
    ...cell,
    cellId: cell.cellId ?? `rows[${rowIndex}].cell[${cellIndex}]`,
    columnId: cell.columnId ?? column?.columnId ?? `column-${cellIndex}`,
    key: cell.key ?? cell.cellId ?? `${rowIndex}-${cellIndex}`,
    region: "body",
    showLabel: cell.showLabel ?? true,
    showSortIndicator: cell.showSortIndicator ?? false,
    tone: cell.tone ?? "body",
    width: cell.width ?? column?.width ?? "hug",
  };
}

function renderTableCell({
  as,
  cell,
  cellIndex,
  cellState,
  cellVariant,
  column,
  isFirstColumn,
  isHoverRow,
  isLastColumn,
  isLastRow,
  key,
  mode,
  tokenValues,
}: {
  as: "td" | "th";
  cell: TableCellItem;
  cellIndex: number;
  cellState: CellState | undefined;
  cellVariant: CellVariant | undefined;
  column: TableColumnItem | undefined;
  isFirstColumn: boolean;
  isHoverRow: boolean;
  isLastColumn: boolean;
  isLastRow: boolean;
  key: React.Key;
  mode: TableMode;
  tokenValues: TableCanonicalTokenValues;
}) {
  const resolvedCellState = cell.state ?? cellState;
  const resolvedCellVariant = cell.variant ?? cellVariant;

  return (
    <Cell
      as={as}
      data-alpy-nested-component={tableRecipe.cellComponentId}
      data-alpy-table-cell={cell.cellId}
      data-alpy-table-cell-width={cell.width}
      data-alpy-table-column={cell.columnId ?? column?.columnId ?? cellIndex}
      data-alpy-table-hover-row={isHoverRow}
      data-alpy-table-region={cell.region}
      data-alpy-table-tone={cell.tone}
      key={key}
      mode={mode}
      {...(resolvedCellState ? { state: resolvedCellState } : {})}
      {...(resolvedCellVariant ? { variant: resolvedCellVariant } : {})}
      style={createTableCellStyle({
        cell,
        isFirstColumn,
        isHoverRow,
        isLastColumn,
        isLastRow,
        tokenValues,
      })}
    >
      <span data-alpy-table-cell-content="" style={createTableCellContentStyle(tokenValues)}>
        {cell.leading ? (
          <TableAdornment
            adornment={cell.leading}
            mode={mode}
            tone={cell.tone ?? "body"}
            tokenValues={tokenValues}
          />
        ) : null}
        {cell.showLabel === false ? null : (
          <span data-alpy-slot="Label">{cell.children}</span>
        )}
        {cell.showSortIndicator ? (
          <TableSortIndicator tokenValues={tokenValues} />
        ) : null}
        {cell.trailing ? (
          <TableAdornment
            adornment={cell.trailing}
            mode={mode}
            tone={cell.tone ?? "body"}
            tokenValues={tokenValues}
          />
        ) : null}
      </span>
    </Cell>
  );
}

function TableAdornment({
  adornment,
  mode,
  tone,
  tokenValues,
}: {
  adornment: TableCellAdornment;
  mode: TableMode;
  tone: TableCellTone;
  tokenValues: TableCanonicalTokenValues;
}) {
  if (adornment.kind === "badge") {
    return (
      <Badge
        data-alpy-nested-component={adornment.badgeComponentId ?? tableRecipe.badgeComponentId}
        data-alpy-table-adornment="badge"
        iconMode="none"
        mode={mode}
        variant={adornment.variantId}
      >
        {adornment.label}
      </Badge>
    );
  }

  if (adornment.kind === "checkbox") {
    return (
      <span
        data-alpy-nested-component={adornment.checkboxComponentId ?? tableRecipe.checkboxComponentId}
        data-alpy-table-adornment="checkbox"
        data-alpy-table-checkbox-selection={adornment.selectionStateId}
        data-alpy-table-checkbox-state={adornment.stateId}
      >
        <Checkbox
          checked={adornment.stateId === "selected"}
          focus={adornment.focusId}
          mode={mode}
          readOnly
          showDescription={false}
          showLabel={false}
          size={adornment.sizeId}
          state={adornment.stateId}
          variant={adornment.variantId}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      data-alpy-nested-component={adornment.iconComponentId ?? tableRecipe.cellIconSizePaths.body.componentId}
      data-alpy-table-adornment="icon"
      data-alpy-table-icon-id={adornment.iconId}
      style={createTableIconFrameStyle(tokenValues, tone)}
    >
      <TableIcon iconId={adornment.iconId} style={createTableIconSvgStyle(tokenValues)} />
    </span>
  );
}

function TableSortIndicator({
  tokenValues,
}: {
  tokenValues: TableCanonicalTokenValues;
}) {
  return (
    <span aria-hidden="true" data-alpy-slot="sortIndicator" style={createTableSortStyle(tokenValues)}>
      <TableIcon iconId="chevron_up" style={createTableSortIconSvgStyle(tokenValues)} />
      <TableIcon iconId="chevron_down" style={createTableSortIconSvgStyle(tokenValues)} />
    </span>
  );
}

function TableIcon({
  iconId,
  style,
}: {
  iconId: TableIconId;
  style: React.CSSProperties;
}) {
  const iconPath = getTableIconPath(iconId);
  const viewBoxSize = iconPath.viewBoxSize ?? 24;
  const windingRule = iconPath.windingRule === "EVENODD" ? "evenodd" : "nonzero";

  return (
    <svg
      aria-hidden="true"
      data-alpy-icon-id={iconId}
      fill="none"
      focusable="false"
      style={style}
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
  );
}

function getTableIconPath(iconId: TableIconId) {
  const iconPath = tableIconPathsById[iconId];

  if (!iconPath) {
    throw new Error(`Missing canonical Table icon path: ${iconId}`);
  }

  return iconPath;
}

function createTableRootStyle(
  tokenValues: TableCanonicalTokenValues,
  rootStyle: React.CSSProperties | undefined,
) {
  return removeEmptyStyleValues({
    background: tokenValues.table.surfaceBackground,
    borderCollapse: "separate",
    borderSpacing: 0,
    maxWidth: "100%",
    overflowX: "auto",
    width: "100%",
    ...rootStyle,
  } as TableStyle);
}

function createTableCellStyle({
  cell,
  isFirstColumn,
  isHoverRow,
  isLastColumn,
  isLastRow,
  tokenValues,
}: {
  cell: TableCellItem;
  isFirstColumn: boolean;
  isHoverRow: boolean;
  isLastColumn: boolean;
  isLastRow: boolean;
  tokenValues: TableCanonicalTokenValues;
}) {
  const isHeader = cell.region === "header";
  const isHeaderTone = cell.tone === "header";
  const typography = isHeaderTone
    ? tokenValues.cell.headerTypography
    : tokenValues.cell.bodyTypography;
  const background = isHeader
    ? tokenValues.table.headerBackground
    : isHoverRow
      ? tokenValues.table.rowHoverBackground ?? tokenValues.table.rowBackground
      : tokenValues.table.rowBackground;
  const borderBottom =
    !isHeader && isLastRow
      ? "0"
      : tokenValues.table.rowBorderWidth && tokenValues.table.rowBorder
        ? `${tokenValues.table.rowBorderWidth} solid ${tokenValues.table.rowBorder}`
        : undefined;

  return removeEmptyStyleValues({
    background,
    borderBottom,
    borderLeft: 0,
    borderRight: 0,
    borderTop: 0,
    borderTopLeftRadius: isHeader && isFirstColumn ? tokenValues.table.headerRadius : undefined,
    borderTopRightRadius: isHeader && isLastColumn ? tokenValues.table.headerRadius : undefined,
    boxSizing: "border-box",
    color: isHeaderTone ? tokenValues.cell.headerText : tokenValues.cell.bodyText,
    fontFamily: typography.fontFamily,
    fontSize: typography.fontSize,
    fontWeight: typography.fontWeight,
    height: tokenValues.cell.rowHeight,
    letterSpacing: typography.letterSpacing,
    lineHeight: typography.lineHeight,
    paddingInline: tokenValues.cell.paddingX,
    textAlign: "left",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
    width: cell.width === "fill" ? "100%" : "1%",
  } as TableStyle);
}

function createTableCellContentStyle(tokenValues: TableCanonicalTokenValues) {
  return removeEmptyStyleValues({
    alignItems: "center",
    display: "inline-flex",
    gap: tokenValues.cell.contentGap,
    maxWidth: "100%",
  } as TableStyle);
}

function createTableIconFrameStyle(
  tokenValues: TableCanonicalTokenValues,
  tone: TableCellTone,
) {
  return removeEmptyStyleValues({
    alignItems: "center",
    color: tone === "header" ? tokenValues.cell.headerIcon : tokenValues.cell.icon,
    display: "inline-flex",
    flex: "0 0 auto",
    height: tokenValues.cell.iconSize,
    justifyContent: "center",
    width: tokenValues.cell.iconSize,
  } as TableStyle);
}

function createTableIconSvgStyle(tokenValues: TableCanonicalTokenValues) {
  return removeEmptyStyleValues({
    display: "block",
    height: tokenValues.cell.iconSize,
    width: tokenValues.cell.iconSize,
  } as TableStyle);
}

function createTableSortStyle(tokenValues: TableCanonicalTokenValues) {
  return removeEmptyStyleValues({
    alignItems: "center",
    color: tokenValues.cell.headerIcon,
    display: "inline-flex",
    flexDirection: "column",
    height: tokenValues.cell.sortIconSize
      ? `calc(${tokenValues.cell.sortIconSize} * 2)`
      : undefined,
    justifyContent: "center",
    width: tokenValues.cell.sortIconSize,
  } as TableStyle);
}

function createTableSortIconSvgStyle(tokenValues: TableCanonicalTokenValues) {
  return removeEmptyStyleValues({
    display: "block",
    height: tokenValues.cell.sortIconSize,
    width: tokenValues.cell.sortIconSize,
  } as TableStyle);
}

function getTableCanonicalTokenValues({
  mode,
  state,
  variant,
}: {
  mode: TableMode;
  state: TableState;
  variant: TableVariant;
}): TableCanonicalTokenValues {
  const tableBindings = getTableBindingState({ mode, state, variant });
  const cellDefaultBindings = getTableCellBindingState({
    mode,
    state: "default",
    variant: "default",
  });
  const cellHeaderBindings = getTableCellBindingState({
    mode,
    state: "default",
    variant: "header",
  });
  const iconSizeTokens = tableCellIconSizeTokensByMode[mode];

  if (!iconSizeTokens) {
    throw new Error(`Missing canonical Table nested icon size bindings: ${mode}`);
  }

  return {
    cell: {
      bodyText: toCssVariableValue(readTableToken(cellDefaultBindings, "body.text")),
      bodyTypography: toCssTypographyStyle(
        readTableToken(cellDefaultBindings, "typography.text.body"),
      ),
      contentGap: toCssVariableValue(readTableToken(cellDefaultBindings, "number.content")),
      headerIcon: toCssVariableValue(readTableToken(cellHeaderBindings, "header.icon")),
      headerText: toCssVariableValue(readTableToken(cellHeaderBindings, "header.text")),
      headerTypography: toCssTypographyStyle(
        readTableToken(cellHeaderBindings, "typography.text.header"),
      ),
      icon: toCssVariableValue(readTableToken(cellDefaultBindings, "icon")),
      iconSize: toCssVariableValue(iconSizeTokens.body),
      paddingX: toCssVariableValue(readTableToken(cellDefaultBindings, "number.padding-x")),
      rowHeight: toCssVariableValue(readTableToken(cellDefaultBindings, "number.size.height")),
      sortIconSize: toCssVariableValue(iconSizeTokens.sort),
    },
    table: {
      headerBackground: toCssVariableValue(
        readTableToken(tableBindings, tableRecipe.colorSlotIds.headerBackground),
      ),
      headerRadius: toCssVariableValue(
        readTableToken(tableBindings, tableRecipe.numberSlotIds.headerRadius),
      ),
      rowBackground: toCssVariableValue(
        readTableToken(tableBindings, tableRecipe.colorSlotIds.rowBackground),
      ),
      rowBorder: toCssVariableValue(
        readTableToken(tableBindings, tableRecipe.colorSlotIds.rowBorder),
      ),
      rowBorderWidth: toCssVariableValue(
        readTableToken(tableBindings, tableRecipe.numberSlotIds.rowBorderWidth),
      ),
      rowHoverBackground:
        state === "hover"
          ? toCssVariableValue(
              readTableToken(tableBindings, tableRecipe.colorSlotIds.rowBackgroundHover),
            )
          : undefined,
      surfaceBackground: toCssVariableValue(
        readTableToken(tableBindings, tableRecipe.colorSlotIds.surfaceBackground),
      ),
    },
  };
}

function getTableBindingState({
  mode,
  state,
  variant,
}: {
  mode: TableMode;
  state: TableState;
  variant: TableVariant;
}) {
  const bindings = tableTokenBindings[mode]?.[variant]?.[state];

  if (!bindings) {
    throw new Error(`Missing canonical Table token bindings: ${mode}/${variant}/${state}`);
  }

  return bindings;
}

function getTableCellBindingState({
  mode,
  state,
  variant,
}: {
  mode: TableMode;
  state: string;
  variant: string;
}) {
  const bindingsByVariant = tableCellTokenBindings[mode] as
    | Record<string, Record<string, Record<string, string>>>
    | undefined;
  const bindings = bindingsByVariant?.[variant]?.[state];

  if (!bindings) {
    throw new Error(`Missing canonical Table Cell token bindings: ${mode}/component.cell/${variant}/${state}`);
  }

  return bindings;
}

function readTableToken(
  bindings: Record<string, string>,
  tokenSlotId: string,
) {
  const tokenRef = bindings[tokenSlotId];

  if (!tokenRef) {
    throw new Error(`Missing canonical Table token slot binding: ${tokenSlotId}`);
  }

  return tokenRef;
}

function toCssTypographyStyle(tokenRef: string | undefined): TableTypographyStyle {
  return removeEmptyStyleValues({
    fontFamily: toCssTypographyFamilyValue(tokenRef),
    fontSize: toCssVariableValue(tokenRef, "font-size"),
    fontWeight: toCssVariableValue(tokenRef, "font-weight"),
    letterSpacing: toCssVariableValue(tokenRef, "letter-spacing"),
    lineHeight: toCssVariableValue(tokenRef, "line-height"),
  } as TableStyle);
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

function removeEmptyStyleValues<T extends TableStyle | TableTypographyStyle>(
  style: T,
) {
  return Object.fromEntries(
    Object.entries(style).filter(([, value]) => value !== undefined),
  ) as React.CSSProperties;
}

