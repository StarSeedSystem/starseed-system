// StarSeed Widget Kit — adaptive, theme-aware widget building blocks
export { WidgetShell, type WidgetShellProps } from "./widget-shell";
export { useElementSize, type ElementSize, type SizeTier } from "./use-element-size";
export {
    StatTile,
    Sparkline,
    ProgressRing,
    Bars,
    ProgressBar,
    MiniList,
    Chip,
    RadialNodeGraph,
    timeAgo,
    timeUntil,
    AnimatedCounter,
    LivePulseDot,
    WidgetSkeleton,
    WidgetEmptyState,
    WidgetErrorState,
} from "./primitives";
export {
    WidgetStyleOverrideProvider,
    useWidgetStyleOverride,
    TRINITY_TINTS,
    TRINITY_LABELS,
    type WidgetStyleOverride,
    type WidgetStyleVariant,
    type TrinityNode,
} from "./widget-style-override";
export { WidgetConfigPopover } from "./widget-config-popover";
