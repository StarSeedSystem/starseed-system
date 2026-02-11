import type { CanvasState } from "./DesignIntegrationCanvas";

/**
 * Maps a CanvasState from the Design Canvas into a partial AppearanceConfig
 * that can be safely merged via useAppearance().updateConfig().
 *
 * IMPORTANT: Every key must exist in the AppearanceConfig interface.
 * Values are clamped to safe ranges to prevent UI breakage.
 */
export function mapCanvasToAppearance(state: CanvasState): Record<string, any> {
    const { palette, typography, effects, geometry, components } = state;

    // Clamp helper
    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

    return {
        typography: {
            fontFamily: typography.fontMain,
            // scaleRatio (1.618) → clamp to AppearanceConfig range 0.8–1.2
            scale: clamp(typography.baseSize / 16, 0.8, 1.2),
        },

        styling: {
            radius: clamp(geometry.radiusMd / 16, 0, 1.5), // px → rem, capped
            glassIntensity: clamp(effects.backdropBlur, 0, 60), // blur px
            opacity: clamp(effects.glassSaturation / 255, 0.2, 1), // normalize to 0–1 safely
            noiseOpacity: clamp(effects.noiseOpacity, 0, 1),
            chromaticAberration: clamp(effects.chromaticAberration, 0, 10),
            glowIntensity: clamp(effects.glowIntensity, 0, 1),
            refraction: clamp(effects.refractionIndex - 1, 0, 1), // 1.52 → 0.52
        },

        buttons: {
            style: components.buttonStyle,
            // buttonRadius is in px (9999 = pill), convert to rem safely
            radius: clamp(components.buttonRadius <= 100 ? components.buttonRadius / 16 : 1.5, 0, 1.5),
            glow: components.buttonGlow,
        },

        liquidGlass: {
            displacementScale: clamp(effects.displacementScale, 0, 200),
            blurAmount: clamp(effects.blurAmount, 0, 5),
            elasticity: clamp(effects.elasticity, 0, 1),
            aberrationIntensity: clamp(effects.chromaticAberration, 0, 10),
            applyToUI: effects.backdropBlur > 10,
        },

        textDiffusion: {
            blur: clamp(effects.textDiffusionBlur, 0, 20),
            opacity: clamp(effects.textDiffusionOpacity, 0, 1),
            glowStrength: clamp(effects.textDiffusionGlow, 0, 2),
        },

        animations: {
            hover: components.animateHover,
            click: components.animateClick,
            micro: components.microInteractions,
            transitionDuration: clamp(components.transitionSpeed, 50, 500),
        },
    };
}

/**
 * Applies palette colors AND element-family design tokens directly as CSS custom properties.
 * This ensures every UI component across the entire network picks up the canvas settings.
 */
export function applyCanvasPalette(state: CanvasState): void {
    const { palette, components, geometry, effects } = state;
    const root = document.documentElement;

    // ─── Palette Colors ──────────────────────────────────────
    root.style.setProperty("--color-primary", palette.primary);
    root.style.setProperty("--color-secondary", palette.secondary);
    root.style.setProperty("--color-accent", palette.accent);
    root.style.setProperty("--color-surface", palette.surface);
    root.style.setProperty("--color-text-primary", palette.textPrimary);
    root.style.setProperty("--color-text-secondary", palette.textSecondary);
    root.style.setProperty("--color-glass-border", palette.glassBorder);

    // Trinity axis colors
    root.style.setProperty("--trinity-zenith", palette.trinity.zenith.active);
    root.style.setProperty("--trinity-horizonte", palette.trinity.horizonte.active);
    root.style.setProperty("--trinity-logica", palette.trinity.logica.active);
    root.style.setProperty("--trinity-base", palette.trinity.base.active);

    // ─── Element Family Tokens ───────────────────────────────
    // Buttons
    root.style.setProperty("--btn-radius", `${components.buttonRadius}px`);
    root.style.setProperty("--btn-glow", components.buttonGlow ? `0 0 20px ${palette.primary}44` : "none");

    // Cards
    root.style.setProperty("--card-radius", `${geometry.radiusLg}px`);
    root.style.setProperty("--card-bg", palette.surface);
    root.style.setProperty("--card-border", palette.glassBorder);
    root.style.setProperty("--card-shadow", state.shadows.md);

    // Inputs
    root.style.setProperty("--input-radius", `${geometry.radiusMd}px`);
    root.style.setProperty("--focus-ring-color", components.focusRingColor);

    // Tooltips
    root.style.setProperty("--tooltip-style", components.tooltipStyle);

    // Tabs
    root.style.setProperty("--tab-active-color", state.tabsConfig.activeColor);
    root.style.setProperty("--tab-style", state.tabsConfig.style);
    root.style.setProperty("--tab-spacing", `${state.tabsConfig.spacing}px`);

    // Toggles
    root.style.setProperty("--switch-track-color", state.toggles.switchTrackColor);

    // Dialogs
    root.style.setProperty("--dialog-overlay-opacity", `${state.dialogs.overlayOpacity}`);
    root.style.setProperty("--dialog-overlay-blur", `${state.dialogs.overlayBlur}px`);

    // Progress
    root.style.setProperty("--progress-height", `${state.progressBars.height}px`);

    // Avatars
    root.style.setProperty("--avatar-shape", state.avatars.shape === "circle" ? "9999px" : state.avatars.shape === "rounded" ? "12px" : "4px");
    root.style.setProperty("--avatar-scale", `${state.avatars.sizeScale}`);

    // Toasts
    root.style.setProperty("--toast-position", state.toasts.position);

    // Navigation
    root.style.setProperty("--nav-dock-style", state.nav.dockStyle);
    root.style.setProperty("--nav-item-padding", `${state.nav.menuItemPadding}px`);

    // Geometry
    root.style.setProperty("--radius-sm", `${geometry.radiusSm}px`);
    root.style.setProperty("--radius-md", `${geometry.radiusMd}px`);
    root.style.setProperty("--radius-lg", `${geometry.radiusLg}px`);
    root.style.setProperty("--radius-xl", `${geometry.radiusXl}px`);
    root.style.setProperty("--radius-pill", `${geometry.radiusPill}px`);
    root.style.setProperty("--spacing-scale", `${geometry.spacingScale}`);

    // Effects
    root.style.setProperty("--backdrop-blur", `${effects.backdropBlur}px`);
    root.style.setProperty("--glass-saturation", `${effects.glassSaturation}%`);
    root.style.setProperty("--transition-speed", `${components.transitionSpeed}ms`);
}

/**
 * Converts canvas state to a named theme object for saving into the theme store.
 */
export function canvasToThemePayload(state: CanvasState, themeName: string) {
    return {
        name: themeName,
        date: new Date().toISOString(),
        config: mapCanvasToAppearance(state),
    };
}
