import * as React from "react";
import {
  Dropdown,
  type DropdownMenuItem,
} from "./Dropdown.js";

export type PaginationMode = "light";
export type PaginationVariant = "standalone" | "chrome";
export type PaginationState = "default" | "hover";
export type PaginationVisualStyle = "basic" | "boxed" | "compact";
export type PaginationIconId = "chevron_back" | "chevron_down" | "chevron_forward";

export type PaginationProps = Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
> & {
  children?: React.ReactNode;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  pageCount?: number;
  paginationStyle?: PaginationVisualStyle;
  rowsPerPageItems?: readonly DropdownMenuItem[];
  rowsPerPageLabel?: React.ReactNode;
  rowsPerPageValue?: React.ReactNode;
  mode: PaginationMode;
  state?: PaginationState;
  variant?: PaginationVariant;
};

type PaginationStyle = React.CSSProperties & Record<string, string | number | undefined>;
type PaginationIconPathDefinition = {
  isStroke: boolean;
  path: string;
  viewBoxSize?: number;
  windingRule: string;
};

const paginationRuntimeBehavior = {
  "keyboard": [
    {
      "key": "ArrowLeft",
      "action": "goToPreviousPage",
      "target": "navigation"
    },
    {
      "key": "ArrowRight",
      "action": "goToNextPage",
      "target": "navigation"
    },
    {
      "key": "Home",
      "action": "goToFirstPage",
      "target": "navigation"
    },
    {
      "key": "End",
      "action": "goToLastPage",
      "target": "navigation"
    }
  ],
  "stateMachines": [
    {
      "events": [
        {
          "to": "idle",
          "from": "idle",
          "event": "goToPreviousPage"
        },
        {
          "to": "idle",
          "from": "idle",
          "event": "goToNextPage"
        },
        {
          "to": "idle",
          "from": "idle",
          "event": "goToFirstPage"
        },
        {
          "to": "idle",
          "from": "idle",
          "event": "goToLastPage"
        }
      ],
      "states": [
        "idle"
      ],
      "machineId": "pagination-navigation",
      "initialState": "idle"
    }
  ]
} as const;
const paginationTokenBindings = {
  "light": {
    "chrome": {
      "default": {
        "basic.item.icon": "color.icon.default",
        "basic.item.text": "color.text.body",
        "boxed.item.icon": "color.icon.default",
        "boxed.item.text": "color.text.body",
        "chrome.meta.text": "color.text.body.muted",
        "number.basic.gap": "space.24",
        "number.boxed.gap": "space.8",
        "boxed.item.border": "color.border.neutral.subtle.two",
        "basic.current.text": "color.text.onColor",
        "boxed.current.text": "color.text.onColor",
        "compact.value.text": "color.text.body",
        "compact.button.icon": "color.icon.default",
        "boxed.current.border": "color.border.brand.color-one.strong.one",
        "compact.value.border": "color.border.neutral.subtle.two",
        "typography.text.meta": "font.body.small",
        "typography.text.page": "font.body.medium",
        "boxed.item.background": "color.surface.canvas",
        "compact.button.border": "color.border.neutral.subtle.two",
        "number.basic.item.gap": "space.8",
        "number.basic.size.width": "space.32",
        "basic.current.background": "color.shades.brand.color-one.strong-one",
        "boxed.current.background": "color.shades.brand.color-one.strong-one",
        "compact.value.background": "color.surface.canvas",
        "compact.value.text-muted": "color.text.body.muted",
        "number.basic.size.height": "space.32",
        "number.boxed.size.height": "space.40",
        "number.chrome.select.gap": "space.8",
        "number.compact.gap.value": "space.4",
        "compact.button.background": "color.surface.canvas",
        "number.basic.shape.radius": "radius.full",
        "number.boxed.border.width": "border.width.1",
        "number.boxed.shape.radius": "radius.medium",
        "number.compact.size.width": "space.40",
        "chrome.select.trigger.icon": "color.icon.default",
        "chrome.select.trigger.text": "color.text.body",
        "number.compact.gap.segment": "space.8",
        "number.compact.size.height": "space.40",
        "number.boxed.size.min-width": "space.40",
        "number.compact.border.width": "border.width.1",
        "number.compact.shape.radius": "radius.medium",
        "chrome.select.trigger.border": "color.border.neutral.subtle.two",
        "number.compact.space.padding-x": "space.8",
        "chrome.select.trigger.background": "color.surface.canvas",
        "number.boxed.space.item-padding-x": "space.12",
        "number.boxed.space.item-padding-y": "space.8",
        "number.chrome.select.trigger.size.height": "space.36",
        "number.chrome.select.trigger.border.width": "border.width.1",
        "number.chrome.select.trigger.shape.radius": "radius.medium",
        "number.chrome.select.trigger.space.padding-x": "space.12",
        "number.chrome.select.trigger.space.padding-y": "space.8"
      },
      "hover": {
        "basic.item.icon": "color.icon.interaction.hover",
        "basic.item.text": "color.text.link.hover",
        "boxed.item.icon": "color.icon.default",
        "boxed.item.text": "color.text.body",
        "chrome.meta.text": "color.text.body.muted",
        "number.basic.gap": "space.24",
        "number.boxed.gap": "space.8",
        "boxed.item.border": "color.border.neutral.subtle.two",
        "basic.current.text": "color.text.onColor",
        "boxed.current.text": "color.text.onColor",
        "compact.value.text": "color.text.body",
        "compact.button.icon": "color.icon.default",
        "boxed.current.border": "color.border.brand.color-one.strong.one",
        "compact.value.border": "color.border.neutral.subtle.two",
        "typography.text.meta": "font.body.small",
        "typography.text.page": "font.body.medium",
        "boxed.item.background": "color.surface.interaction.hover",
        "compact.button.border": "color.border.neutral.subtle.two",
        "number.basic.item.gap": "space.8",
        "number.basic.size.width": "space.32",
        "basic.current.background": "color.shades.brand.color-one.strong-one",
        "boxed.current.background": "color.shades.brand.color-one.strong-one",
        "compact.value.background": "color.surface.canvas",
        "compact.value.text-muted": "color.text.body.muted",
        "number.basic.size.height": "space.32",
        "number.boxed.size.height": "space.40",
        "number.chrome.select.gap": "space.8",
        "number.compact.gap.value": "space.4",
        "compact.button.background": "color.surface.interaction.hover",
        "number.basic.shape.radius": "radius.full",
        "number.boxed.border.width": "border.width.1",
        "number.boxed.shape.radius": "radius.medium",
        "number.compact.size.width": "space.40",
        "chrome.select.trigger.icon": "color.icon.default",
        "chrome.select.trigger.text": "color.text.body",
        "number.compact.gap.segment": "space.8",
        "number.compact.size.height": "space.40",
        "number.boxed.size.min-width": "space.40",
        "number.compact.border.width": "border.width.1",
        "number.compact.shape.radius": "radius.medium",
        "chrome.select.trigger.border": "color.border.neutral.subtle.two",
        "number.compact.space.padding-x": "space.8",
        "chrome.select.trigger.background": "color.surface.interaction.hover",
        "number.boxed.space.item-padding-x": "space.12",
        "number.boxed.space.item-padding-y": "space.8",
        "number.chrome.select.trigger.size.height": "space.36",
        "number.chrome.select.trigger.border.width": "border.width.1",
        "number.chrome.select.trigger.shape.radius": "radius.medium",
        "number.chrome.select.trigger.space.padding-x": "space.12",
        "number.chrome.select.trigger.space.padding-y": "space.8"
      }
    },
    "standalone": {
      "default": {
        "basic.item.icon": "color.icon.default",
        "basic.item.text": "color.text.body",
        "boxed.item.icon": "color.icon.default",
        "boxed.item.text": "color.text.body",
        "number.basic.gap": "space.24",
        "number.boxed.gap": "space.8",
        "boxed.item.border": "color.border.neutral.subtle.two",
        "basic.current.text": "color.text.onColor",
        "boxed.current.text": "color.text.onColor",
        "compact.value.text": "color.text.body",
        "compact.button.icon": "color.icon.default",
        "boxed.current.border": "color.border.brand.color-one.strong.one",
        "compact.value.border": "color.border.neutral.subtle.two",
        "typography.text.meta": "font.body.small",
        "typography.text.page": "font.body.medium",
        "boxed.item.background": "color.surface.canvas",
        "compact.button.border": "color.border.neutral.subtle.two",
        "number.basic.item.gap": "space.8",
        "number.basic.size.width": "space.32",
        "basic.current.background": "color.shades.brand.color-one.strong-one",
        "boxed.current.background": "color.shades.brand.color-one.strong-one",
        "compact.value.background": "color.surface.canvas",
        "compact.value.text-muted": "color.text.body.muted",
        "number.basic.size.height": "space.32",
        "number.boxed.size.height": "space.40",
        "number.compact.gap.value": "space.4",
        "compact.button.background": "color.surface.canvas",
        "number.basic.shape.radius": "radius.full",
        "number.boxed.border.width": "border.width.1",
        "number.boxed.shape.radius": "radius.medium",
        "number.compact.size.width": "space.40",
        "number.compact.gap.segment": "space.8",
        "number.compact.size.height": "space.40",
        "number.boxed.size.min-width": "space.40",
        "number.compact.border.width": "border.width.1",
        "number.compact.shape.radius": "radius.medium",
        "number.compact.space.padding-x": "space.8",
        "number.boxed.space.item-padding-x": "space.12",
        "number.boxed.space.item-padding-y": "space.8"
      },
      "hover": {
        "basic.item.icon": "color.icon.interaction.hover",
        "basic.item.text": "color.text.link.hover",
        "boxed.item.icon": "color.icon.default",
        "boxed.item.text": "color.text.body",
        "number.basic.gap": "space.24",
        "number.boxed.gap": "space.8",
        "boxed.item.border": "color.border.neutral.subtle.two",
        "basic.current.text": "color.text.onColor",
        "boxed.current.text": "color.text.onColor",
        "compact.value.text": "color.text.body",
        "compact.button.icon": "color.icon.default",
        "boxed.current.border": "color.border.brand.color-one.strong.one",
        "compact.value.border": "color.border.neutral.subtle.two",
        "typography.text.meta": "font.body.small",
        "typography.text.page": "font.body.medium",
        "boxed.item.background": "color.surface.interaction.hover",
        "compact.button.border": "color.border.neutral.subtle.two",
        "number.basic.item.gap": "space.8",
        "number.basic.size.width": "space.32",
        "basic.current.background": "color.shades.brand.color-one.strong-one",
        "boxed.current.background": "color.shades.brand.color-one.strong-one",
        "compact.value.background": "color.surface.canvas",
        "compact.value.text-muted": "color.text.body.muted",
        "number.basic.size.height": "space.32",
        "number.boxed.size.height": "space.40",
        "number.compact.gap.value": "space.4",
        "compact.button.background": "color.surface.interaction.hover",
        "number.basic.shape.radius": "radius.full",
        "number.boxed.border.width": "border.width.1",
        "number.boxed.shape.radius": "radius.medium",
        "number.compact.size.width": "space.40",
        "number.compact.gap.segment": "space.8",
        "number.compact.size.height": "space.40",
        "number.boxed.size.min-width": "space.40",
        "number.compact.border.width": "border.width.1",
        "number.compact.shape.radius": "radius.medium",
        "number.compact.space.padding-x": "space.8",
        "number.boxed.space.item-padding-x": "space.12",
        "number.boxed.space.item-padding-y": "space.8"
      }
    }
  }
} as const;
const paginationRecipe = {
  "colorSlotIdsByStyle": {
    "basic": {
      "currentBackground": "basic.current.background",
      "currentText": "basic.current.text",
      "itemIcon": "basic.item.icon",
      "itemText": "basic.item.text"
    },
    "boxed": {
      "currentBackground": "boxed.current.background",
      "currentBorder": "boxed.current.border",
      "currentText": "boxed.current.text",
      "itemBackground": "boxed.item.background",
      "itemBorder": "boxed.item.border",
      "itemIcon": "boxed.item.icon",
      "itemText": "boxed.item.text"
    },
    "chrome": {
      "metaText": "chrome.meta.text",
      "selectTriggerBackground": "chrome.select.trigger.background",
      "selectTriggerBorder": "chrome.select.trigger.border",
      "selectTriggerIcon": "chrome.select.trigger.icon",
      "selectTriggerText": "chrome.select.trigger.text"
    },
    "compact": {
      "buttonBackground": "compact.button.background",
      "buttonBorder": "compact.button.border",
      "buttonIcon": "compact.button.icon",
      "valueBackground": "compact.value.background",
      "valueBorder": "compact.value.border",
      "valueText": "compact.value.text",
      "valueTextMuted": "compact.value.text-muted"
    }
  },
  "componentId": "component.pagination",
  "content": {
    "compactCurrentPage": "4",
    "compactTotalPages": "/ 56",
    "currentPage": "2",
    "lastPage": "8",
    "nextPage": "3",
    "previousPage": "1",
    "rowsPerPageLabel": "Rows per page:",
    "rowsPerPageValue": "10",
    "summary": "Showing 1-10 from 35"
  },
  "defaultState": "default",
  "defaultStyle": "basic",
  "defaultVariant": "standalone",
  "dropdownComponentId": "component.dropdown",
  "dropdownIconMode": "trailing",
  "dropdownMenuRows": "4",
  "dropdownVariant": "trigger",
  "iconIds": {
    "previous": "chevron_back",
    "next": "chevron_forward",
    "selectClosed": "chevron_down"
  },
  "iconSizePx": {
    "standard": 8,
    "compact": 12
  },
  "numberSlotIdsByStyle": {
    "basic": {
      "gap": "number.basic.gap",
      "itemGap": "number.basic.item.gap",
      "itemHeight": "number.basic.size.height",
      "itemWidth": "number.basic.size.width",
      "radius": "number.basic.shape.radius"
    },
    "boxed": {
      "borderWidth": "number.boxed.border.width",
      "gap": "number.boxed.gap",
      "itemHeight": "number.boxed.size.height",
      "itemMinWidth": "number.boxed.size.min-width",
      "paddingX": "number.boxed.space.item-padding-x",
      "paddingY": "number.boxed.space.item-padding-y",
      "radius": "number.boxed.shape.radius"
    },
    "chrome": {
      "selectGap": "number.chrome.select.gap",
      "selectTriggerBorderWidth": "number.chrome.select.trigger.border.width",
      "selectTriggerHeight": "number.chrome.select.trigger.size.height",
      "selectTriggerPaddingX": "number.chrome.select.trigger.space.padding-x",
      "selectTriggerPaddingY": "number.chrome.select.trigger.space.padding-y",
      "selectTriggerRadius": "number.chrome.select.trigger.shape.radius"
    },
    "compact": {
      "borderWidth": "number.compact.border.width",
      "segmentGap": "number.compact.gap.segment",
      "valueGap": "number.compact.gap.value",
      "buttonHeight": "number.compact.size.height",
      "buttonWidth": "number.compact.size.width",
      "paddingX": "number.compact.space.padding-x",
      "radius": "number.compact.shape.radius"
    }
  },
  "styles": [
    "basic",
    "boxed",
    "compact"
  ],
  "typographySlotIds": {
    "meta": "typography.text.meta",
    "page": "typography.text.page"
  },
  "variantIdsByAxis": {
    "standalone": "standalone",
    "chrome": "chrome"
  }
} as const;
const paginationStyleRules = {
  "align": {
    "center": "center"
  },
  "appearance": {
    "none": "none"
  },
  "background": {
    "transparent": "transparent"
  },
  "border": {
    "solid": "solid",
    "transparent": "transparent",
    "zero": 0
  },
  "cursor": {
    "pointer": "pointer"
  },
  "display": {
    "flex": "flex",
    "inlineFlex": "inline-flex"
  },
  "flex": {
    "noShrink": "0 0 auto"
  },
  "justify": {
    "center": "center",
    "spaceBetween": "space-between"
  },
  "listStyle": {
    "none": "none"
  },
  "sizing": {
    "borderBox": "border-box",
    "full": "100%"
  },
  "space": {
    "zero": 0
  },
  "svg": {
    "currentColor": "currentColor",
    "defaultViewBoxSize": 24,
    "evenOdd": "evenodd",
    "fillNone": "none",
    "nonZero": "nonzero",
    "strokeLinecap": "round",
    "strokeLinejoin": "round",
    "strokeWidth": 2,
    "viewBoxMinX": 0,
    "viewBoxMinY": 0
  },
  "typography": {
    "familyFallback": ", ui-sans-serif, system-ui, sans-serif"
  },
  "unit": {
    "px": "px"
  }
} as const;
const paginationIconPathsById = {
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
  }
} as const satisfies Record<
  PaginationIconId,
  PaginationIconPathDefinition
>;
type PaginationTokenValueKey =
  | "buttonBackground"
  | "buttonBorder"
  | "buttonHeight"
  | "buttonIcon"
  | "buttonWidth"
  | "chromeMeta"
  | "compactBorderWidth"
  | "compactPaddingX"
  | "compactRadius"
  | "compactSegmentGap"
  | "currentBackground"
  | "currentBorder"
  | "currentText"
  | "gap"
  | "itemBackground"
  | "itemBorder"
  | "itemBorderWidth"
  | "itemGap"
  | "itemHeight"
  | "itemIcon"
  | "itemMinWidth"
  | "itemPaddingX"
  | "itemPaddingY"
  | "itemRadius"
  | "itemText"
  | "itemWidth"
  | "metaFontFamily"
  | "metaFontSize"
  | "metaFontWeight"
  | "metaLetterSpacing"
  | "metaLineHeight"
  | "pageFontFamily"
  | "pageFontSize"
  | "pageFontWeight"
  | "pageLetterSpacing"
  | "pageLineHeight"
  | "selectGap"
  | "selectTriggerBackground"
  | "selectTriggerBorder"
  | "selectTriggerBorderWidth"
  | "selectTriggerHeight"
  | "selectTriggerIcon"
  | "selectTriggerPaddingX"
  | "selectTriggerPaddingY"
  | "selectTriggerRadius"
  | "selectTriggerText"
  | "valueBackground"
  | "valueBorder"
  | "valueGap"
  | "valueText"
  | "valueTextMuted";
type PaginationTokenValues = Partial<Record<PaginationTokenValueKey, string | undefined>>;

export function Pagination({
  children,
  currentPage = Number(paginationRecipe.content.currentPage),
  mode,
  onKeyDown,
  onPageChange,
  pageCount = Number(paginationRecipe.content.lastPage),
  paginationStyle = paginationRecipe.defaultStyle,
  rowsPerPageItems,
  rowsPerPageLabel = paginationRecipe.content.rowsPerPageLabel,
  rowsPerPageValue = paginationRecipe.content.rowsPerPageValue,
  state = paginationRecipe.defaultState,
  style,
  variant = paginationRecipe.defaultVariant,
  ...props
}: PaginationProps) {
  const [paginationNavigationState, setPaginationNavigationState] = React.useState(
    String(paginationRuntimeBehavior.stateMachines?.[0]?.initialState ?? ""),
  );
  const safePageCount = Math.max(1, pageCount);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safePageCount);
  const pageItems = createPaginationPageItems(safeCurrentPage, safePageCount);
  const tokenValues = getPaginationTokenValues({
    mode,
    paginationStyle,
    state,
    variant,
  });
  const requestPageChange = (page: number, eventName?: string) => {
    if (eventName) {
      setPaginationNavigationState(
        transitionPaginationNavigationState(paginationNavigationState, eventName),
      );
    }

    onPageChange?.(Math.min(Math.max(1, page), safePageCount));
  };
  const handlePaginationKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    onKeyDown?.(event);

    if (event.defaultPrevented) return;

    const binding = paginationRuntimeBehavior.keyboard?.find(
      (candidate) => candidate.key === event.key,
    );
    if (!binding) return;

    const nextPage = resolvePaginationActionTargetPage(
      binding.action,
      safeCurrentPage,
      safePageCount,
    );
    if (nextPage === undefined) return;

    event.preventDefault();
    requestPageChange(nextPage, binding.action);
  };

  return (
    <nav
      {...props}
      data-alpy-component="pagination"
      data-alpy-mode={mode}
      data-alpy-pagination-style={paginationStyle}
      data-alpy-state={state}
      data-alpy-variant={variant}
      onKeyDown={handlePaginationKeyDown}
      style={createPaginationRootStyle({
        paginationStyle,
        rootStyle: style,
        tokenValues,
        variant,
      })}
    >
      {variant === paginationRecipe.variantIdsByAxis.chrome ? (
        <div data-alpy-slot="chrome" style={createChromeLayoutStyle(tokenValues)}>
          <span data-alpy-slot="summary" style={createMetaTextStyle(tokenValues)}>
            {paginationRecipe.content.summary}
          </span>
          {paginationStyle === paginationRecipe.styles[2]
            ? renderCompactPagination({
                requestPageChange,
                safeCurrentPage,
                safePageCount,
                tokenValues,
              })
            : renderPaginationPager({
                pageItems,
                paginationStyle,
                requestPageChange,
                safeCurrentPage,
                safePageCount,
                tokenValues,
              })}
          {renderRowsPerPageControl({
            mode,
            rowsPerPageItems,
            rowsPerPageLabel,
            rowsPerPageValue,
            state,
            tokenValues,
          })}
        </div>
      ) : paginationStyle === paginationRecipe.styles[2] ? (
        renderCompactPagination({ requestPageChange, safeCurrentPage, safePageCount, tokenValues })
      ) : (
        renderPaginationPager({
          pageItems,
          paginationStyle,
          requestPageChange,
          safeCurrentPage,
          safePageCount,
          tokenValues,
        })
      )}
      {children}
    </nav>
  );
}

type PaginationPageItem =
  | { kind: "page"; page: number }
  | { kind: "ellipsis"; id: string };

function createPaginationPageItems(
  safeCurrentPage: number,
  safePageCount: number,
): PaginationPageItem[] {
  const pageSet = new Set([
    1,
    safeCurrentPage - 1,
    safeCurrentPage,
    safeCurrentPage + 1,
    safePageCount,
  ]);
  const pages = [...pageSet]
    .filter((page) => page >= 1 && page <= safePageCount)
    .sort((a, b) => a - b);
  const items: PaginationPageItem[] = [];

  for (const page of pages) {
    const previous = items[items.length - 1];

    if (previous?.kind === "page" && page - previous.page > 1) {
      items.push({ id: "ellipsis-" + String(previous.page) + "-" + String(page), kind: "ellipsis" });
    }

    items.push({ kind: "page", page });
  }

  return items;
}

function renderPaginationPager({
  pageItems,
  paginationStyle,
  requestPageChange,
  safeCurrentPage,
  safePageCount,
  tokenValues,
}: {
  pageItems: readonly PaginationPageItem[];
  paginationStyle: PaginationVisualStyle;
  requestPageChange: (page: number, eventName?: string) => void;
  safeCurrentPage: number;
  safePageCount: number;
  tokenValues: PaginationTokenValues;
}) {
  return (
    <ol data-alpy-pagination-list="" data-alpy-slot="pager" style={createPagerListStyle(tokenValues)}>
      <li>
        <button
          data-alpy-pagination-item="previous"
          disabled={safeCurrentPage <= 1}
          onClick={() => requestPageChange(safeCurrentPage - 1)}
          style={createStandardItemStyle({
            action: true,
            current: false,
            paginationStyle,
            tokenValues,
          })}
          type="button"
        >
          <PaginationIcon
            iconColor={tokenValues.itemIcon}
            iconId={paginationRecipe.iconIds.previous}
            size="standard"
          />
        </button>
      </li>
      {pageItems.map((item) =>
        item.kind === "ellipsis" ? (
          <li data-alpy-pagination-ellipsis="" key={item.id} style={createEllipsisStyle(tokenValues)}>
            ...
          </li>
        ) : (
          <li key={item.page}>
            <button
              aria-current={item.page === safeCurrentPage ? "page" : undefined}
              data-alpy-current-page={item.page === safeCurrentPage ? "true" : undefined}
              data-alpy-pagination-item="page"
              data-alpy-page={String(item.page)}
              onClick={() => requestPageChange(item.page)}
              style={createStandardItemStyle({
                action: false,
                current: item.page === safeCurrentPage,
                paginationStyle,
                tokenValues,
              })}
              type="button"
            >
              <span data-alpy-slot="label">{item.page}</span>
            </button>
          </li>
        ),
      )}
      <li>
        <button
          data-alpy-pagination-item="next"
          disabled={safeCurrentPage >= safePageCount}
          onClick={() => requestPageChange(safeCurrentPage + 1)}
          style={createStandardItemStyle({
            action: true,
            current: false,
            paginationStyle,
            tokenValues,
          })}
          type="button"
        >
          <PaginationIcon
            iconColor={tokenValues.itemIcon}
            iconId={paginationRecipe.iconIds.next}
            size="standard"
          />
        </button>
      </li>
    </ol>
  );
}

function renderCompactPagination({
  requestPageChange,
  safeCurrentPage,
  safePageCount,
  tokenValues,
}: {
  requestPageChange: (page: number, eventName?: string) => void;
  safeCurrentPage: number;
  safePageCount: number;
  tokenValues: PaginationTokenValues;
}) {
  return (
    <div data-alpy-slot="compact" style={createCompactLayoutStyle(tokenValues)}>
      <button
        data-alpy-pagination-item="previous"
        disabled={safeCurrentPage <= 1}
        onClick={() => requestPageChange(safeCurrentPage - 1)}
        style={createCompactButtonStyle(tokenValues)}
        type="button"
      >
        <PaginationIcon iconId={paginationRecipe.iconIds.previous} size="compact" />
      </button>
      <span data-alpy-slot="compact-value" style={createCompactValueStyle(tokenValues)}>
        <span>{paginationRecipe.content.compactCurrentPage}</span>
        <span style={createCompactMutedTextStyle(tokenValues)}>
          {paginationRecipe.content.compactTotalPages}
        </span>
      </span>
      <button
        data-alpy-pagination-item="next"
        disabled={safeCurrentPage >= safePageCount}
        onClick={() => requestPageChange(safeCurrentPage + 1)}
        style={createCompactButtonStyle(tokenValues)}
        type="button"
      >
        <PaginationIcon iconId={paginationRecipe.iconIds.next} size="compact" />
      </button>
    </div>
  );
}

function renderRowsPerPageControl({
  mode,
  rowsPerPageItems,
  rowsPerPageLabel,
  rowsPerPageValue,
  state,
  tokenValues,
}: {
  mode: PaginationMode;
  rowsPerPageItems: readonly DropdownMenuItem[] | undefined;
  rowsPerPageLabel: React.ReactNode;
  rowsPerPageValue: React.ReactNode;
  state: PaginationState;
  tokenValues: PaginationTokenValues;
}) {
  return (
    <div data-alpy-slot="rows-per-page" style={createRowsPerPageStyle(tokenValues)}>
      <span data-alpy-slot="rows-label" style={createMetaTextStyle(tokenValues)}>
        {rowsPerPageLabel}
      </span>
      <Dropdown
        data-alpy-nested-component={paginationRecipe.dropdownComponentId}
        data-alpy-slot="rows-dropdown"
        iconMode={paginationRecipe.dropdownIconMode}
        {...(rowsPerPageItems ? { items: rowsPerPageItems } : {})}
        label={rowsPerPageValue}
        menuRows={paginationRecipe.dropdownMenuRows}
        mode={mode}
        state={state}
        triggerIconStyle={createPaginationRowsDropdownTriggerIconStyle(tokenValues)}
        triggerStyle={createPaginationRowsDropdownTriggerStyle(tokenValues)}
        variant={paginationRecipe.dropdownVariant}
      />
    </div>
  );
}

function PaginationIcon({
  iconColor,
  iconId,
  size,
}: {
  iconColor?: string | undefined;
  iconId: PaginationIconId;
  size: "compact" | "standard";
}) {
  const iconPath = paginationIconPathsById[iconId];

  if (!iconPath) {
    throw new Error("Missing canonical Pagination icon path: " + iconId);
  }

  const viewBoxSize =
    iconPath.viewBoxSize ?? paginationStyleRules.svg.defaultViewBoxSize;
  const windingRule = String(iconPath.windingRule) === "EVENODD"
    ? paginationStyleRules.svg.evenOdd
    : paginationStyleRules.svg.nonZero;

  return (
    <span
      aria-hidden="true"
      data-alpy-icon-id={iconId}
      data-alpy-slot="icon"
      style={createIconWrapStyle(iconColor)}
    >
      <svg
        aria-hidden="true"
        fill={paginationStyleRules.svg.fillNone}
        focusable="false"
        style={size === "compact" ? compactIconSvgStyle : standardIconSvgStyle}
        viewBox={toSvgViewBox(viewBoxSize)}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          clipRule={windingRule}
          d={iconPath.path}
          fill={iconPath.isStroke ? paginationStyleRules.svg.fillNone : paginationStyleRules.svg.currentColor}
          fillRule={windingRule}
          stroke={iconPath.isStroke ? paginationStyleRules.svg.currentColor : undefined}
          strokeLinecap={iconPath.isStroke ? paginationStyleRules.svg.strokeLinecap : undefined}
          strokeLinejoin={iconPath.isStroke ? paginationStyleRules.svg.strokeLinejoin : undefined}
          strokeWidth={iconPath.isStroke ? paginationStyleRules.svg.strokeWidth : undefined}
        />
      </svg>
    </span>
  );
}

function createPagerListStyle(tokenValues: PaginationTokenValues) {
  return removeEmptyStyleValues({
    alignItems: paginationStyleRules.align.center,
    display: paginationStyleRules.display.flex,
    gap: tokenValues.gap,
    listStyle: paginationStyleRules.listStyle.none,
    margin: paginationStyleRules.space.zero,
    padding: paginationStyleRules.space.zero,
  });
}

function createChromeLayoutStyle(tokenValues: PaginationTokenValues) {
  return removeEmptyStyleValues({
    alignItems: paginationStyleRules.align.center,
    display: paginationStyleRules.display.flex,
    justifyContent: paginationStyleRules.justify.spaceBetween,
    width: paginationStyleRules.sizing.full,
  } as PaginationStyle);
}

function createRowsPerPageStyle(tokenValues: PaginationTokenValues) {
  return removeEmptyStyleValues({
    alignItems: paginationStyleRules.align.center,
    display: paginationStyleRules.display.flex,
    gap: tokenValues.selectGap,
  });
}

function createPaginationRowsDropdownTriggerStyle(tokenValues: PaginationTokenValues) {
  return removeEmptyStyleValues({
    background: tokenValues.selectTriggerBackground,
    borderColor: tokenValues.selectTriggerBorder,
    borderRadius: tokenValues.selectTriggerRadius,
    borderWidth: tokenValues.selectTriggerBorderWidth,
    color: tokenValues.selectTriggerText,
    fontFamily: tokenValues.pageFontFamily,
    fontSize: tokenValues.pageFontSize,
    fontWeight: tokenValues.pageFontWeight,
    gap: tokenValues.selectGap,
    height: tokenValues.selectTriggerHeight,
    letterSpacing: tokenValues.pageLetterSpacing,
    lineHeight: tokenValues.pageLineHeight,
    padding:
      tokenValues.selectTriggerPaddingY && tokenValues.selectTriggerPaddingX
        ? tokenValues.selectTriggerPaddingY + " " + tokenValues.selectTriggerPaddingX
        : undefined,
  } as PaginationStyle);
}

function createPaginationRowsDropdownTriggerIconStyle(tokenValues: PaginationTokenValues) {
  return removeEmptyStyleValues({
    color: tokenValues.selectTriggerIcon,
  } as PaginationStyle);
}

function createCompactLayoutStyle(tokenValues: PaginationTokenValues) {
  return removeEmptyStyleValues({
    alignItems: paginationStyleRules.align.center,
    display: paginationStyleRules.display.inlineFlex,
    gap: tokenValues.compactSegmentGap,
  });
}

function createIconWrapStyle(iconColor: string | undefined) {
  return removeEmptyStyleValues({
    alignItems: paginationStyleRules.align.center,
    color: iconColor,
    display: paginationStyleRules.display.inlineFlex,
    flex: paginationStyleRules.flex.noShrink,
    justifyContent: paginationStyleRules.justify.center,
  });
}

const standardIconSvgStyle: React.CSSProperties = {
  height: toCssLength(paginationRecipe.iconSizePx.standard),
  width: toCssLength(paginationRecipe.iconSizePx.standard),
};

const compactIconSvgStyle: React.CSSProperties = {
  height: toCssLength(paginationRecipe.iconSizePx.compact),
  width: toCssLength(paginationRecipe.iconSizePx.compact),
};

function createItemTextStyle(tokenValues: PaginationTokenValues) {
  return removeEmptyStyleValues({
    fontFamily: tokenValues.pageFontFamily,
    fontSize: tokenValues.pageFontSize,
    fontWeight: tokenValues.pageFontWeight,
    letterSpacing: tokenValues.pageLetterSpacing,
    lineHeight: tokenValues.pageLineHeight,
  });
}

function createMetaTextStyle(tokenValues: PaginationTokenValues) {
  return removeEmptyStyleValues({
    color: tokenValues.chromeMeta,
    fontFamily: tokenValues.metaFontFamily,
    fontSize: tokenValues.metaFontSize,
    fontWeight: tokenValues.metaFontWeight,
    letterSpacing: tokenValues.metaLetterSpacing,
    lineHeight: tokenValues.metaLineHeight,
  });
}

function createEllipsisStyle(tokenValues: PaginationTokenValues) {
  return removeEmptyStyleValues({
    ...createItemTextStyle(tokenValues),
    color: tokenValues.itemText,
  } as PaginationStyle);
}

function createCompactButtonStyle(tokenValues: PaginationTokenValues) {
  return removeEmptyStyleValues({
    alignItems: paginationStyleRules.align.center,
    appearance: paginationStyleRules.appearance.none,
    background: tokenValues.buttonBackground,
    borderColor: tokenValues.buttonBorder,
    borderRadius: tokenValues.compactRadius,
    borderStyle: paginationStyleRules.border.solid,
    borderWidth: tokenValues.compactBorderWidth,
    color: tokenValues.buttonIcon,
    cursor: paginationStyleRules.cursor.pointer,
    display: paginationStyleRules.display.inlineFlex,
    height: tokenValues.buttonHeight,
    justifyContent: paginationStyleRules.justify.center,
    paddingLeft: tokenValues.compactPaddingX,
    paddingRight: tokenValues.compactPaddingX,
    width: tokenValues.buttonWidth,
  } as PaginationStyle);
}

function createCompactValueStyle(tokenValues: PaginationTokenValues) {
  return removeEmptyStyleValues({
    ...createItemTextStyle(tokenValues),
    alignItems: paginationStyleRules.align.center,
    background: tokenValues.valueBackground,
    borderColor: tokenValues.valueBorder,
    borderRadius: tokenValues.compactRadius,
    borderStyle: paginationStyleRules.border.solid,
    borderWidth: tokenValues.compactBorderWidth,
    color: tokenValues.valueText,
    display: paginationStyleRules.display.inlineFlex,
    gap: tokenValues.valueGap,
    height: tokenValues.buttonHeight,
    paddingLeft: tokenValues.compactPaddingX,
    paddingRight: tokenValues.compactPaddingX,
  } as PaginationStyle);
}

function createCompactMutedTextStyle(tokenValues: PaginationTokenValues) {
  return removeEmptyStyleValues({
    color: tokenValues.valueTextMuted,
  });
}

function createPaginationRootStyle({
  paginationStyle,
  rootStyle,
  tokenValues,
  variant,
}: {
  paginationStyle: PaginationVisualStyle;
  rootStyle: React.CSSProperties | undefined;
  tokenValues: PaginationTokenValues;
  variant: PaginationVariant;
}): React.CSSProperties {
  const isChromeVariant = variant === paginationRecipe.variantIdsByAxis.chrome;
  const isCompactStyle = paginationStyle === paginationRecipe.styles[2];

  return removeEmptyStyleValues({
    boxSizing: paginationStyleRules.sizing.borderBox,
    color: tokenValues.itemText,
    display: isChromeVariant
      ? paginationStyleRules.display.flex
      : paginationStyleRules.display.inlineFlex,
    maxWidth: paginationStyleRules.sizing.full,
    width: isChromeVariant ? paginationStyleRules.sizing.full : undefined,
    ...(isCompactStyle && !isChromeVariant
      ? { color: tokenValues.buttonIcon }
      : {}),
    ...rootStyle,
  } as PaginationStyle);
}

function createStandardItemStyle({
  action,
  current,
  paginationStyle,
  tokenValues,
}: {
  action: boolean;
  current: boolean;
  paginationStyle: PaginationVisualStyle;
  tokenValues: PaginationTokenValues;
}): React.CSSProperties {
  const isBoxed = paginationStyle === paginationRecipe.styles[1];

  return removeEmptyStyleValues({
    ...createItemTextStyle(tokenValues),
    alignItems: paginationStyleRules.align.center,
    appearance: paginationStyleRules.appearance.none,
    background: current
      ? tokenValues.currentBackground
      : isBoxed
        ? tokenValues.itemBackground
        : paginationStyleRules.background.transparent,
    borderColor: current
      ? isBoxed
        ? tokenValues.currentBorder
        : paginationStyleRules.border.transparent
      : isBoxed
        ? tokenValues.itemBorder
        : paginationStyleRules.border.transparent,
    borderRadius: tokenValues.itemRadius,
    borderStyle: paginationStyleRules.border.solid,
    borderWidth: isBoxed
      ? tokenValues.itemBorderWidth
      : paginationStyleRules.border.zero,
    color: current
      ? tokenValues.currentText
      : tokenValues.itemText,
    cursor: paginationStyleRules.cursor.pointer,
    display: paginationStyleRules.display.inlineFlex,
    gap: tokenValues.itemGap,
    height: isBoxed || current
      ? tokenValues.itemHeight
      : undefined,
    justifyContent: paginationStyleRules.justify.center,
    minWidth: isBoxed && !action
      ? tokenValues.itemMinWidth
      : undefined,
    padding: isBoxed
      ? tokenValues.itemPaddingY && tokenValues.itemPaddingX
        ? tokenValues.itemPaddingY + " " + tokenValues.itemPaddingX
        : undefined
      : paginationStyleRules.space.zero,
    width: !isBoxed && current
      ? tokenValues.itemWidth
      : undefined,
  } as PaginationStyle);
}

function matchesPaginationTransitionState(from: unknown, currentState: string) {
  return Array.isArray(from)
    ? from.some((state) => String(state) === currentState)
    : String(from) === currentState;
}

function resolvePaginationActionTargetPage(
  action: string,
  safeCurrentPage: number,
  safePageCount: number,
): number | undefined {
  switch (action) {
    case "goToPreviousPage":
      return safeCurrentPage - 1;
    case "goToNextPage":
      return safeCurrentPage + 1;
    case "goToFirstPage":
      return 1;
    case "goToLastPage":
      return safePageCount;
    default:
      return undefined;
  }
}

function transitionPaginationNavigationState(currentState: string, eventName: string) {
  const machine = paginationRuntimeBehavior.stateMachines?.[0];
  const transition = machine?.events.find(
    (candidate) =>
      candidate.event === eventName &&
      matchesPaginationTransitionState(candidate.from, currentState),
  );

  return String(transition?.to ?? currentState);
}

function getPaginationTokenValues({
  mode,
  paginationStyle,
  state,
  variant,
}: {
  mode: PaginationMode;
  paginationStyle: PaginationVisualStyle;
  state: PaginationState;
  variant: PaginationVariant;
}): PaginationTokenValues {
  const byState = paginationTokenBindings[mode]?.[variant]?.[state] as
    | Record<string, string>
    | undefined;

  if (!byState) {
    throw new Error(
      "Missing canonical Pagination token binding for " + mode + "/" + variant + "/" + state,
    );
  }

  const typographySlots = paginationRecipe.typographySlotIds;
  const pageText = byState[typographySlots.page];
  const metaText = byState[typographySlots.meta];
  const tokenValues: PaginationTokenValues = {
    pageFontFamily: toCssTypographyFamilyValue(pageText),
    pageFontSize: toCssVariableValue(pageText, "font-size"),
    pageFontWeight: toCssVariableValue(pageText, "font-weight"),
    pageLetterSpacing: toCssVariableValue(pageText, "letter-spacing"),
    pageLineHeight: toCssVariableValue(pageText, "line-height"),
    metaFontFamily: toCssTypographyFamilyValue(metaText),
    metaFontSize: toCssVariableValue(metaText, "font-size"),
    metaFontWeight: toCssVariableValue(metaText, "font-weight"),
    metaLetterSpacing: toCssVariableValue(metaText, "letter-spacing"),
    metaLineHeight: toCssVariableValue(metaText, "line-height"),
  };

  if (paginationStyle === paginationRecipe.styles[2]) {
    const colorSlots = paginationRecipe.colorSlotIdsByStyle.compact;
    const numberSlots = paginationRecipe.numberSlotIdsByStyle.compact;

    Object.assign(tokenValues, {
      buttonBackground: toCssVariableValue(byState[colorSlots.buttonBackground]),
      buttonBorder: toCssVariableValue(byState[colorSlots.buttonBorder]),
      buttonHeight: toCssVariableValue(byState[numberSlots.buttonHeight]),
      buttonIcon: toCssVariableValue(byState[colorSlots.buttonIcon]),
      buttonWidth: toCssVariableValue(byState[numberSlots.buttonWidth]),
      compactBorderWidth: toCssVariableValue(byState[numberSlots.borderWidth]),
      compactPaddingX: toCssVariableValue(byState[numberSlots.paddingX]),
      compactRadius: toCssVariableValue(byState[numberSlots.radius]),
      compactSegmentGap: toCssVariableValue(byState[numberSlots.segmentGap]),
      valueBackground: toCssVariableValue(byState[colorSlots.valueBackground]),
      valueBorder: toCssVariableValue(byState[colorSlots.valueBorder]),
      valueGap: toCssVariableValue(byState[numberSlots.valueGap]),
      valueText: toCssVariableValue(byState[colorSlots.valueText]),
      valueTextMuted: toCssVariableValue(byState[colorSlots.valueTextMuted]),
    });
  } else if (paginationStyle === paginationRecipe.styles[1]) {
    const colorSlots = paginationRecipe.colorSlotIdsByStyle.boxed;
    const numberSlots = paginationRecipe.numberSlotIdsByStyle.boxed;

    Object.assign(tokenValues, {
      currentBackground: toCssVariableValue(byState[colorSlots.currentBackground]),
      currentBorder: toCssVariableValue(byState[colorSlots.currentBorder]),
      currentText: toCssVariableValue(byState[colorSlots.currentText]),
      gap: toCssVariableValue(byState[numberSlots.gap]),
      itemBackground: toCssVariableValue(byState[colorSlots.itemBackground]),
      itemBorder: toCssVariableValue(byState[colorSlots.itemBorder]),
      itemBorderWidth: toCssVariableValue(byState[numberSlots.borderWidth]),
      itemGap: toCssVariableValue(byState[numberSlots.gap]),
      itemHeight: toCssVariableValue(byState[numberSlots.itemHeight]),
      itemIcon: toCssVariableValue(byState[colorSlots.itemIcon]),
      itemMinWidth: toCssVariableValue(byState[numberSlots.itemMinWidth]),
      itemPaddingX: toCssVariableValue(byState[numberSlots.paddingX]),
      itemPaddingY: toCssVariableValue(byState[numberSlots.paddingY]),
      itemRadius: toCssVariableValue(byState[numberSlots.radius]),
      itemText: toCssVariableValue(byState[colorSlots.itemText]),
    });
  } else {
    const colorSlots = paginationRecipe.colorSlotIdsByStyle.basic;
    const numberSlots = paginationRecipe.numberSlotIdsByStyle.basic;

    Object.assign(tokenValues, {
      currentBackground: toCssVariableValue(byState[colorSlots.currentBackground]),
      currentText: toCssVariableValue(byState[colorSlots.currentText]),
      gap: toCssVariableValue(byState[numberSlots.gap]),
      itemGap: toCssVariableValue(byState[numberSlots.itemGap]),
      itemHeight: toCssVariableValue(byState[numberSlots.itemHeight]),
      itemIcon: toCssVariableValue(byState[colorSlots.itemIcon]),
      itemRadius: toCssVariableValue(byState[numberSlots.radius]),
      itemText: toCssVariableValue(byState[colorSlots.itemText]),
      itemWidth: toCssVariableValue(byState[numberSlots.itemWidth]),
    });
  }

  if (variant === paginationRecipe.variantIdsByAxis.chrome) {
    const colorSlots = paginationRecipe.colorSlotIdsByStyle.chrome;
    const numberSlots = paginationRecipe.numberSlotIdsByStyle.chrome;

    Object.assign(tokenValues, {
      chromeMeta: toCssVariableValue(byState[colorSlots.metaText]),
      selectGap: toCssVariableValue(byState[numberSlots.selectGap]),
      selectTriggerBackground: toCssVariableValue(byState[colorSlots.selectTriggerBackground]),
      selectTriggerBorder: toCssVariableValue(byState[colorSlots.selectTriggerBorder]),
      selectTriggerBorderWidth: toCssVariableValue(byState[numberSlots.selectTriggerBorderWidth]),
      selectTriggerHeight: toCssVariableValue(byState[numberSlots.selectTriggerHeight]),
      selectTriggerIcon: toCssVariableValue(byState[colorSlots.selectTriggerIcon]),
      selectTriggerPaddingX: toCssVariableValue(byState[numberSlots.selectTriggerPaddingX]),
      selectTriggerPaddingY: toCssVariableValue(byState[numberSlots.selectTriggerPaddingY]),
      selectTriggerRadius: toCssVariableValue(byState[numberSlots.selectTriggerRadius]),
      selectTriggerText: toCssVariableValue(byState[colorSlots.selectTriggerText]),
    });
  }

  return tokenValues;
}

function toCssTypographyFamilyValue(tokenRef: string | undefined) {
  const tokenValue = toCssVariableValue(tokenRef, "font-family");

  return tokenValue
    ? tokenValue + paginationStyleRules.typography.familyFallback
    : undefined;
}

function toCssLength(value: number) {
  return String(value) + paginationStyleRules.unit.px;
}

function toSvgViewBox(viewBoxSize: number) {
  return [
    paginationStyleRules.svg.viewBoxMinX,
    paginationStyleRules.svg.viewBoxMinY,
    viewBoxSize,
    viewBoxSize,
  ].join(" ");
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

function removeEmptyStyleValues(style: PaginationStyle) {
  return Object.fromEntries(
    Object.entries(style).filter(([, value]) => value !== undefined),
  ) as React.CSSProperties;
}

