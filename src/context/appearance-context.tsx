"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
// Capas de fondo (Adenda 68 · D): la pila que va ENCIMA del fondo base.
// La migración `migrateBackgroundLayers` es la que apaga el fantasma de
// Audiomorphic en las configs ya persistidas. Ver src/lib/appearance/background-layers.ts.
import {
    BG_LAYERS_VERSION,
    migrateBackgroundLayers,
    normalizeLayers,
    type BackgroundLayer,
} from "@/lib/appearance/background-layers";
import { ACTIVE_PROFILE_KEY, PROFILE_ACTIVE_EVENT } from "@/lib/profiles/profiles";
// Catálogo de TEMAS/ESTILOS (theme-engine.ts + theme-catalog.ts): importar el
// catálogo registra sus ~24 ThemePacks builtin (efecto de carga, side-effect
// de registerTheme). appliedTheme()/applyTheme() re-aplican el tema que el
// usuario dejó activo la última vez (si lo hay) — init "pequeño y global"
// pedido para que aplicar un tema del catálogo SOBREVIVA a un refresco.
import "@/lib/design/theme-catalog";
import { appliedTheme, applyTheme as applyThemePack } from "@/lib/design/theme-engine";

export interface CustomFont {
    name: string;
    url: string;
    family: string;
}

/**
 * Tema de identidad global del OS — se refleja como atributo
 * `data-os-theme` en <html> para que globals.css recubra TODAS las
 * variables del design system (colores, radios, sombras, fuentes).
 * "default" = sin atributo (comportamiento histórico intacto).
 * SOP: architecture/integracion-portal-starseed-os.md → "Tema StarSeed Café".
 */
export type OsThemeId = "default" | "cafe" | "omnifrecuencias" | "audiomorphic";

export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[P] extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepPartial<U>>
    : T[P] extends object
    ? DeepPartial<T[P]>
    : T[P]
};

export interface AppearanceConfig {
    typography: {
        fontFamily: string;
        scale: number; // 0.8 to 1.2, default 1
        customFonts: CustomFont[];
    };
    layout: {
        menuPosition: "left" | "top" | "right" | "bottom";
        menuStyle: "sidebar" | "dock" | "minimal";
        menuBehavior: "sticky" | "static" | "smart";
        iconStyle: "outline" | "solid" | "thin";
    };
    styling: {
        radius: number; // 0 to 1.5rem
        glassIntensity: number; // blur amount in px
        opacity: number; // 0 to 1
        // Advanced / Theme Specific
        borderWidth: number; // 0 to 4px
        refraction: number; // 0 to 1 (Crystal)
        chromaticAberration: number; // 0 to 10px (Crystal)
        noiseOpacity: number; // 0 to 1 (Crystal)
        glowIntensity: number; // 0 to 1 (Neon)
        hardShadows: boolean; // (Brutalist)
        uppercase: boolean; // (Brutalist)
        neonTicker: boolean; // (Neon)
        fluidity: number; // (Liquid)
        surfaceTension: number; // (Liquid)
        frostOpacity: number; // (Glass)
        glassNoise: number; // (Glass)
        crystalPreset?: "none" | "clear" | "frosted" | "holographic" | "obsidian" | "quantic" | "organic-frosted";
    };
    background: {
        /**
         * FONDO BASE (la capa de abajo del todo). Los motores pesados del OS
         * (Spline, WebGL, Living, Materia…) son singletons que leen este campo.
         *
         * ⚠️ "audiomorphic" está DEPRECADO como tipo base (Adenda 68 · D): el
         * visualizador ya NO es un fondo exclusivo sino una CAPA de `layers`.
         * Se mantiene en la unión sólo para que las configs antiguas tipen; la
         * migración de arranque lo convierte en capa apagada. Nada del código
         * nuevo debe volver a escribirlo aquí.
         */
        type: "solid" | "gradient" | "image" | "video" | "webgl" | "spline"
            | "liquid-aurora" | "liquid-plasma" | "liquid-lava" | "liquid-oceanic" | "liquid-iris"
            | "materia-oro-vivo" | "materia-cristal-liquido" | "materia-bosque-dorado"
            | "living" // fondo animado vivo (canvas, variantes creativas, siempre activo)
            | "audiomorphic"; // DEPRECADO (ver arriba) — migrado a capa
        /**
         * PILA DE CAPAS que se pinta ENCIMA del fondo base, en orden
         * (índice 0 = la más baja). Cada capa: tipo, opacidad, mezcla,
         * visibilidad. Opcional → una config antigua (sin capas) sigue siendo
         * válida y se comporta exactamente igual que antes (pila vacía).
         */
        layers?: BackgroundLayer[];
        /** Versión del modelo de capas (dispara la migración). */
        layersVersion?: number;
        /**
         * ÁMBITO del fondo: overrides por PERFIL o por PÁGINA/PROGRAMA.
         * Clave: `perfil:<id>` · `pagina:<ruta>`. Valor: parche del fondo que
         * se fusiona sobre el global. Resolución: página > perfil > cuenta.
         */
        scopes?: Record<string, Record<string, unknown>>;
        value: string; // url or css value
        blur: number; // background blur
        animation: "none" | "pan" | "zoom" | "pulse" | "scroll";
        overlayOpacity: number; // 0 to 1
        overlayColor: "black" | "white";
        // Materia Viva (opcional para que configs antiguas sigan siendo válidas)
        intensity?: number; // 0..1 — escala partículas/alpha de los fondos "materia-*"
        // ── Fondo animado "living" (canvas) — opcional, configs antiguas válidas ──
        living?: {
            /** variante visual creativa */
            variant: "aurora" | "nebula" | "starfield" | "mycelium" | "plasma" | "prisma" | "ocean";
            /** velocidad 0.2–2 */
            speed: number;
            /** intensidad/densidad 0–1 */
            intensity: number;
            /** paleta (hex). Si vacío, usa los acentos del tema. */
            colors: string[];
            /** rotación automática de variantes cada N segundos (0 = off) */
            autoCycleSec: number;
        };
        // WebGL specific
        webglVariant?: "nebula" | "grid" | "waves" | "hex" | "liquid";
        webglZoom?: number;
        webglSpeed?: number;
        liquidColors?: string[]; // Array of 6 hex colors
        // ── Metal líquido (three.js) — opcional, configs antiguas válidas ──
        /** 0..1 — metalicidad del material (LiquidMetal). Por defecto 0.75. */
        liquidMetalness?: number;
        /** 0..1 — rugosidad del material (LiquidMetal). Por defecto 0.25. */
        liquidRoughness?: number;
        // ── Fondo "audiomorphic" (visualizador embebido) — opcional, configs antiguas válidas ──
        audiomorphic?: {
            /** URL del visualizador Audiomorphic a embeber a pantalla completa. */
            url: string;
            /** opacidad del overlay sutil sobre el iframe (0–1). */
            overlay: number;
            /** 'auto' = micrófono + autostart; 'manual' = autostart con animación autónoma. */
            mode?: "auto" | "manual";
            /** Alimentar el visualizador con el micrófono (requiere permiso del navegador). */
            mic?: boolean;
            /** Modo AR: usar la cámara como fondo (requiere permiso). */
            camera?: boolean;
            /** Preset visual integrado: nebula | genesis | solaris | aqua | void. */
            preset?: string;
        };

        // New Filter System
        filter: {
            enabled: boolean;
            type: "none" | "noise" | "waves"; // 'waves' replaced 'liquid-metal'
            settings: {
                noiseOpacity?: number;
                waveMetalness?: number; // 0 to 1
                waveRoughness?: number; // 0 to 1
            }
        };

        // Environment System (New)
        environment?: {
            enabled: boolean;
            type: "orbs" | "grid" | "abstract";
            intensity: number;
        };
    };
    secondary: {
        scrollbars: "default" | "thin" | "hidden" | "glow";
        selectionColor: string;
        selectionMode: "text" | "block";
        cursor: "default" | "custom" | "glow";
        customCursorSvg?: string;
    };
    buttons: {
        style: "default" | "glass" | "liquid" | "neon" | "brutal";
        radius: number;
        glow: boolean;
        animation: boolean; // Legacy: Maps to animations.hover
    };
    animations: {
        enabled: boolean;
        hover: boolean;
        click: boolean;
        micro: boolean;
        transitionDuration: number;
        trinityEntry: "fade" | "slide" | "scale" | "elastic";
        pageTransition: boolean;
        microInteractions: boolean;
    };
    iconography: {
        style: "stroke" | "solid";
        strokeWidth: number;
        scale: number;
        animation: "none" | "pulse" | "bounce" | "spin";
    };
    positioning: {
        modalPosition: "center" | "top" | "bottom";
        borderRadius: {
            sm: number;
            md: number;
            lg: number;
            xl: number;
            pill: number;
        };
        spacingScale: number;
    };
    widgets: {
        /**
         * Modo de diseño de los widgets:
         *  - "theme": heredan el estilo/tema activo del perfil (coherencia global).
         *  - "original": cada widget usa su identidad temática propia (cristal
         *    líquido teñido con su color de acento), independiente del tema.
         * Opcional → configs guardadas siguen siendo válidas (deepMerge). Se
         * autoguarda en el dashboard (localStorage) y en el perfil (settings-sync).
         */
        designMode?: "theme" | "original";
        /**
         * Modo compacto de los widgets: densidad mayor (padding reducido,
         * tipografía menor, contenido condensado) para ver más en menos espacio.
         * Opcional → configs guardadas siguen siendo válidas (deepMerge). El modo
         * cómodo (false) es el valor por defecto; compacto es opt-in. Se autoguarda
         * en localStorage (appearance-config-v2) y en el perfil (settings-sync),
         * igual que el resto de preferencias de widgets.
         */
        compact?: boolean;
        dashboardTemplate: "standard" | "analyst" | "creative" | "strategic";
        bgStyle: "glass" | "solid" | "cyber" | "mesh";
        borderStyle: "none" | "thin" | "glow" | "neon";
        headerStyle: "simple" | "accented" | "underlined";
        shadows: "none" | "sm" | "md" | "lg" | "neon";
        glassOpacity: number;
        noiseTexture: boolean;
        cornerSmoothing: number;
        innerGlow: "none" | "subtle" | "strong";
        reflection: number;
        ashostGraphType: "bar" | "line" | "radar" | "dot";
        ashostColor: string;
        ashostSpeed: number;
        weatherVariant: "minimal" | "detailed" | "hologram" | "fluid" | "flora" | "aurora" | "omni" | "crystalline";
        culturalFeedStyle: "masonry" | "list" | "cards";
        calculatorTheme: "glass" | "cyber" | "minimal";
        feedSource: "all" | "ontocracia" | "nexus" | "cultura";
    };
    liquidGlass: {
        enabled: boolean;
        displacementScale: number;
        blurAmount: number;
        elasticity: number;
        aberrationIntensity: number;
        applyToUI: boolean;
        saturation: number;
        cornerRadius: number;
        mode: "standard" | "polar" | "prominent" | "shader";
        /** 0..1 → --glass-opacity (opacidad del cristal en la UI). */
        distortWidth: number;
        /** 0..1 → --glass-blur (value * 50px). */
        distortRadius: number;
        /** 0..1 → --glass-saturation (100% + value * 100%). */
        smoothStepEdge: number;
    };
    textDiffusion: {
        blur: number;
        opacity: number;
        glowStrength: number;
    };
    mobile: {
        fabPosition: "fixed" | "draggable";
        fabSide: "left" | "right";
        fabOffsetX: number;
        fabOffsetY: number;
        fabVerticalPosition: "top" | "center" | "bottom";
        menuType: "sheet" | "dropdown" | "fullscreen" | "sidebar";
        menuBehavior: "push" | "overlay" | "slide";
        menuAnimation: "slide" | "fade" | "scale" | "morph";
        menuPosition: "left" | "right" | "bottom";
        autoHideOnScroll: boolean;
        showOnDesktop: boolean;
        compactMode: boolean;
        hapticFeedback: boolean;
        swipeToOpen: boolean;
        gestureThreshold: number;
        controlPanel: {
            fabPosition: "fixed" | "draggable";
            fabSide: "left" | "right";
            fabVerticalPosition: "top" | "center" | "bottom";
            menuPosition: "left" | "right" | "bottom";
            fabOffsetX: number;
            fabOffsetY: number;
        };
    };
    trinity: {
        mode: "floating" | "docked";
        style: "glass" | "solid" | "minimal";
        isExpanded: boolean;
        dockBehavior: "always-visible" | "auto-hide" | "anchor-only";
        edgeSensitivity: number;
        menuCustomization: {
            showLabels: boolean;
            iconScale: number;
            animationSpeed: "slow" | "normal" | "fast";
        };
        /**
         * Densidad del OmniDock y las cortinas Trinity: "comfortable" (tamaño
         * histórico) o "compact" (icono/padding reducido, más accesos visibles
         * a la vez). Opcional → configs guardadas siguen siendo válidas.
         * Consumido por omni-dock.tsx (clases de tamaño de DockItem).
         */
        dockDensity?: "comfortable" | "compact";
        /**
         * Indicadores sutiles de borde (Bloque 4 extendido): una franja muy
         * tenue con el color cardinal de cada nodo, visible en reposo tanto
         * con ratón (perimeter-interface) como en táctil (trinity-edge-access),
         * para que el usuario sepa dónde está cada acceso sin tener que pasar
         * el cursor. Opcional y por defecto desactivado (no intrusivo por defecto).
         */
        showEdgeIndicators?: boolean;
        /**
         * Interacción táctil del dashboard (Trinity Móvil · Bloque 1).
         * Opcional → las configs guardadas siguen siendo válidas (deepMerge
         * rellena con los valores por defecto). SOP: integracion-portal-starseed-os.md.
         */
        touch?: {
            /** ms de pulsación mantenida para armar el arrastre de un widget en táctil. */
            holdMs: number;
            /** vibración háptica al armar (si el dispositivo la soporta). */
            haptics: boolean;
        };
        /**
         * Trinity Edge Access (Bloque 4): apertura de los 4 menús cardinales
         * en táctil mediante asas de borde no intrusivas + deslizamiento desde
         * cada orilla. Todo opcional y configurable; nada sustituye a los
         * sensores de borde (ratón) ni al TrinityFab.
         */
        edgeAccess?: {
            /** habilita asas + gestos de borde (auto = solo en puntero grueso/≤1024px). */
            mode: "auto" | "on" | "off";
            /** asa visible y deslizamiento por borde, individualmente. */
            edges: {
                zenith: { handle: boolean; swipe: boolean };
                horizon: { handle: boolean; swipe: boolean };
                logic: { handle: boolean; swipe: boolean };
                anchor: { handle: boolean; swipe: boolean };
            };
            /** longitud del asa como % del lado (10–60). */
            handleLength: number;
            /** grosor del asa en px (3–12). */
            handleThickness: number;
            /** opacidad en reposo (0–1): "no intrusivo". */
            handleOpacity: number;
            /** px que el dedo debe recorrer desde el borde para abrir (16–120). */
            swipeThreshold: number;
        };
    };
    /**
     * Centro de Control (Logic/Este) — panel rápido estilo cristal líquido.
     * Controla qué módulos se muestran y en qué orden. Opcional → configs
     * guardadas siguen siendo válidas (deepMerge). Consumido por
     * src/components/layout/trinity/control-center.tsx.
     */
    controlCenter?: {
        /** orden de los módulos rápidos (ids de QUICK_MODULES). */
        moduleOrder: string[];
        /** módulos ocultos por el usuario (siguen en el catálogo). */
        hiddenModules: string[];
    };
    display: {
        mode: "standard" | "vr" | "ar" | "spatial";
        fov: number;
        depthScale: number;
        immersiveUI: boolean;
        curvedUI: boolean;
        eyeComfort: boolean;
    };
    responsive: {
        smartphone: {
            orientation: "auto" | "portrait" | "landscape";
            contentDensity: "compact" | "comfortable" | "spacious";
            bottomNavigation: boolean;
            gestureNavigation: boolean;
            pullToRefresh: boolean;
        };
        tablet: {
            orientation: "auto" | "portrait" | "landscape";
            splitView: boolean;
            sidebarCollapsible: boolean;
            contentWidth: "full" | "centered" | "narrow";
        };
        desktop: {
            sidebarWidth: number;
            contentMaxWidth: number;
            multiColumn: boolean;
            stickyHeader: boolean;
        };
        largeScreen: {
            ultraWideLayout: "centered" | "expanded" | "split";
            columnCount: 2 | 3 | 4;
            panelSpacing: number;
            cinematicMode: boolean;
        };
        breakpoints: {
            sm: number;
            md: number;
            lg: number;
            xl: number;
            xxl: number;
        };
        adaptiveUI: boolean;
        reducedMotion: boolean;
    };
    themeStore: {
        activeMode: "custom" | "crystal" | "liquid" | "solid-crystal" | "primary" | "spline-default";
        activeTemplateId?: string;
        /** Tema de identidad del sistema (opcional → configs antiguas válidas) */
        osTheme?: OsThemeId;
        savedThemes: Array<{
            id: string;
            name: string;
            createdAt: number;
            config: Partial<AppearanceConfig>;
        }>;
    };
    assistant: {
        visible: boolean;
    };
}

const defaultConfig: AppearanceConfig = {
    typography: {
        fontFamily: "Inter",
        scale: 1,
        customFonts: [],
    },
    layout: {
        menuPosition: "left",
        menuStyle: "sidebar",
        menuBehavior: "sticky",
        iconStyle: "outline",
    },
    styling: {
        radius: 0.5,
        glassIntensity: 20, // Increased default blur for legibility
        opacity: 0.65, // Increased opacity (was 0.8 which is transparency factor... wait, lower opacity = more transparent? Let's check logic. opacity var is used as 0 to 1. Usually 1 is opaque. 
        // In applyStyles: root.style.setProperty("--glass-opacity", String(opacity));
        // In CSS: rgba(255, 255, 255, var(--glass-opacity, 0.4))
        // So higher value = more opaque background color = better legibility. 
        // Default was 0.8 (which is quite high/opaque already? No, wait. 
        // Let's check defaults in defaultConfig.styling.
        // It was 0.8. Let's make it 0.7 for now but ensure CSS uses it correctly.
        // Actually, user said "demasiado transparente" (too transparent). So we need MORE opacity (closer to 1).
        // Let's stick to 0.8 or even 0.85 if it was "too transparent". 
        // Wait, earlier I saw --glass-opacity default in CSS was 0.4.
        // The default config here says 0.8. 
        // Let's look at the CSS usage again in next step. For now, let's keep reasonable defaults.
        borderWidth: 1,
        refraction: 0,
        chromaticAberration: 0,
        noiseOpacity: 0,
        glowIntensity: 0,
        hardShadows: false,
        uppercase: false,
        neonTicker: false,
        fluidity: 50,
        surfaceTension: 50,
        frostOpacity: 0.5,
        glassNoise: 0.05,
        crystalPreset: "none",
    },
    background: {
        // Fondo predeterminado: la escena Spline de colores líquidos/fluidos (la que
        // gustó), para TODAS las áreas y tamaños. Lento, psicodélico, orgánico.
        // Cada usuario lo personaliza luego en su cuenta (Ajustes → Apariencia → Fondo).
        // Cambio aditivo: configs guardadas conservan su type. SOP: integracion-portal.
        type: "spline",
        // Pila de capas VACÍA por defecto: el OS arranca con UN solo fondo.
        // Audiomorphic NO entra aquí — es opt-in desde Ajustes → Apariencia.
        layers: [],
        layersVersion: BG_LAYERS_VERSION,
        scopes: {},
        value: "",
        blur: 0,
        animation: "none",
        overlayOpacity: 0.1, // Reduced overlay opacity so Spline looks vivid
        overlayColor: "black",
        intensity: 0.7, // Materia Viva: densidad de partículas/alfa por defecto
        webglVariant: "liquid",
        webglSpeed: 0.22,
        webglZoom: 1.0,
        liquidColors: ["#F15A22", "#0A0E27", "#F15A22", "#0A0E27", "#F15A22", "#0A0E27"],
        audiomorphic: {
            url: "https://audiomorphic.vercel.app",
            overlay: 0.15,
            mode: "manual",
            mic: false,
            camera: false,
            preset: "nebula",
        },
        living: {
            variant: "aurora",
            speed: 0.4, // lento, fluido, orgánico (psicodélico tranquilo)
            intensity: 0.7,
            colors: [], // vacío → usa los acentos del tema activo
            autoCycleSec: 0,
        },
        filter: {
            enabled: false,
            type: "none",
            settings: {
                waveRoughness: 0.25
            }
        },
        environment: {
            enabled: false,
            type: "orbs",
            intensity: 0.5
        }
    },
    secondary: {
        scrollbars: "default",
        selectionColor: "auto",
        selectionMode: "text",
        cursor: "default"
    },
    buttons: {
        style: "default",
        radius: 0.5,
        glow: false,
        animation: true,
    },
    animations: {
        enabled: true,
        hover: true,
        click: true,
        micro: true,
        transitionDuration: 200,
        trinityEntry: "scale",
        pageTransition: true,
        microInteractions: true,
    },
    iconography: {
        style: "stroke",
        strokeWidth: 1.5,
        scale: 1,
        animation: "none",
    },
    positioning: {
        modalPosition: "center",
        borderRadius: {
            sm: 4,
            md: 8,
            lg: 16,
            xl: 24,
            pill: 9999,
        },
        spacingScale: 1,
    },
    widgets: {
        designMode: "theme",
        compact: false,
        dashboardTemplate: "standard",
        bgStyle: "glass",
        borderStyle: "thin",
        headerStyle: "simple",
        shadows: "md",
        glassOpacity: 0.6,
        noiseTexture: false,
        cornerSmoothing: 0,
        innerGlow: "none",
        reflection: 0,
        ashostGraphType: "line",
        ashostColor: "#06B6D4",
        ashostSpeed: 1,
        weatherVariant: "minimal",
        culturalFeedStyle: "cards",
        calculatorTheme: "glass",
        feedSource: "all",
    },
    liquidGlass: {
        enabled: false,
        applyToUI: false,
        displacementScale: 15,
        blurAmount: 0.1,
        saturation: 1.1,
        aberrationIntensity: 1,
        elasticity: 0.2,
        cornerRadius: 24,
        mode: "standard",
        distortWidth: 0.4,
        distortRadius: 0.4,
        smoothStepEdge: 0.8,
    },
    textDiffusion: {
        blur: 15,
        opacity: 0.7,
        glowStrength: 0.5,
    },
    mobile: {
        fabPosition: "fixed",
        fabSide: "right",
        fabOffsetX: 16,
        fabOffsetY: 16,
        fabVerticalPosition: "bottom",
        menuType: "sheet",
        menuBehavior: "overlay",
        menuAnimation: "slide",
        menuPosition: "right",
        autoHideOnScroll: false,
        showOnDesktop: false,
        compactMode: false,
        hapticFeedback: true,
        swipeToOpen: true,
        gestureThreshold: 50,
        controlPanel: {
            fabPosition: "fixed",
            fabSide: "left",
            fabVerticalPosition: "bottom",
            menuPosition: "left",
            fabOffsetX: 16,
            fabOffsetY: 80,
        },
    },
    trinity: {
        mode: "floating",
        style: "glass",
        isExpanded: true,
        dockBehavior: "anchor-only",
        edgeSensitivity: 20,
        menuCustomization: {
            showLabels: true,
            iconScale: 1,
            animationSpeed: "normal",
        },
        // Densidad histórica del dock: "comfortable" (sin cambios visuales
        // para cuentas existentes). El modo "compact" es opt-in.
        dockDensity: "comfortable",
        // Indicadores sutiles de borde: desactivados por defecto (no intrusivo
        // por defecto; el usuario los activa si los quiere).
        showEdgeIndicators: false,
        // Pulsación mantenida de 3 s antes de armar el arrastre en táctil:
        // así el scroll del dashboard es el gesto natural y los widgets no se
        // mueven por accidente. Configurable en Ajustes → Trinity.
        touch: {
            holdMs: 3000,
            haptics: true,
        },
        // Acceso por bordes en táctil: asas no intrusivas + deslizar desde la
        // orilla. Por defecto "auto" (solo táctil/≤1024px) con las 4 orillas
        // activas. Los sensores de ratón y el FAB siguen intactos.
        edgeAccess: {
            mode: "auto",
            edges: {
                zenith: { handle: true, swipe: true },
                horizon: { handle: true, swipe: true },
                logic: { handle: true, swipe: true },
                anchor: { handle: true, swipe: true },
            },
            handleLength: 28,
            handleThickness: 5,
            handleOpacity: 0.22,
            swipeThreshold: 56,
        },
    },
    controlCenter: {
        // Orden por defecto: Sistema, Control rápido, Hogar, Alertas (igual
        // que las 4 pestañas actuales) — ver QUICK_MODULES en control-center.tsx.
        moduleOrder: ["system", "quick", "home", "notif"],
        hiddenModules: [],
    },
    display: {
        mode: "standard",
        fov: 90,
        depthScale: 1,
        immersiveUI: false,
        curvedUI: false,
        eyeComfort: true,
    },
    responsive: {
        smartphone: {
            orientation: "auto",
            contentDensity: "comfortable",
            bottomNavigation: true,
            gestureNavigation: true,
            pullToRefresh: true,
        },
        tablet: {
            orientation: "auto",
            splitView: true,
            sidebarCollapsible: true,
            contentWidth: "full",
        },
        desktop: {
            sidebarWidth: 280,
            contentMaxWidth: 1440,
            multiColumn: true,
            stickyHeader: true,
        },
        largeScreen: {
            ultraWideLayout: "expanded",
            columnCount: 3,
            panelSpacing: 24,
            cinematicMode: false,
        },
        breakpoints: {
            sm: 640,
            md: 768,
            lg: 1024,
            xl: 1280,
            xxl: 1536,
        },
        adaptiveUI: true,
        reducedMotion: false,
    },
    themeStore: {
        activeMode: "primary",
        osTheme: "default",
        savedThemes: [],
    },
    assistant: {
        visible: true,
    },
};

/** Ámbito del fondo: cuenta (global) · perfil activo · página/programa actual. */
export type BackgroundScopeMode = "cuenta" | "perfil" | "pagina";

interface AppearanceContextType {
    /** Config EFECTIVA (con el override de ámbito ya resuelto). */
    config: AppearanceConfig;
    /** Config CRUDA/global (sin resolver ámbitos). La usa el panel de capas. */
    rawConfig: AppearanceConfig;
    // ── Ámbito del fondo (Adenda 68 · D) ────────────────────────────────
    /** Ámbito en el que se ESCRIBEN los cambios de fondo. */
    bgScopeMode: BackgroundScopeMode;
    setBgScopeMode: (mode: BackgroundScopeMode) => void;
    /** true si el ámbito activo tiene un fondo propio (override). */
    bgScopeHasOverride: boolean;
    /** Elimina el override del ámbito activo. */
    clearBackgroundScope: () => void;
    /** Ruta actual (la que identifica el ámbito "página"). */
    bgScopePath: string;
    /** Perfil activo (o null si no hay). */
    bgScopeProfileId: string | null;
    updateConfig: (updates: DeepPartial<AppearanceConfig>) => void;
    resetConfig: () => void;
    updateSection: <K extends keyof AppearanceConfig>(section: K, data: DeepPartial<AppearanceConfig[K]>) => void;
    addCustomFont: (font: CustomFont) => void;
    removeCustomFont: (name: string) => void;
    // Theme Actions
    saveTheme: (name: string) => void;
    loadTheme: (id: string) => void;
    deleteTheme: (id: string) => void;
    exportTheme: () => void;
    importTheme: (file: File) => Promise<void>;
    // History (editor inteligente): deshacer el último ajuste de apariencia.
    undo: () => void;
    canUndo: boolean;
}

const AppearanceContext = createContext<AppearanceContextType | undefined>(undefined);

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
    const [config, setConfig] = useState<AppearanceConfig>(defaultConfig);
    const [mounted, setMounted] = useState(false);

    // ── Historial ligero (editor inteligente) ──────────────────────────────
    // Guardamos un snapshot del config ANTERIOR en cada cambio para poder
    // deshacer el último ajuste. Limitado a las últimas 20 entradas para no
    // crecer sin control. No se persiste en localStorage (sesión de edición).
    const historyRef = useRef<AppearanceConfig[]>([]);
    const [canUndo, setCanUndo] = useState(false);

    const pushHistory = (snapshot: AppearanceConfig) => {
        historyRef.current.push(snapshot);
        if (historyRef.current.length > 20) historyRef.current.shift();
        setCanUndo(historyRef.current.length > 0);
    };

    const undo = () => {
        const prevSnapshot = historyRef.current.pop();
        setCanUndo(historyRef.current.length > 0);
        if (prevSnapshot) setConfig(prevSnapshot);
    };

    // Deep merge helper
    const deepMerge = (target: any, source: any) => {
        const result = { ...target };
        for (const key in source) {
            // Check if source[key] is an array - if so, take it directly (don't merge arrays as objects)
            if (Array.isArray(source[key])) {
                result[key] = source[key];
            }
            // Check if it's an object (and not null)
            else if (source[key] instanceof Object && key in target && source[key] !== null) {
                result[key] = deepMerge(target[key], source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    };

    // Load from local storage on mount
    useEffect(() => {
        const saved = localStorage.getItem("appearance-config-v2");
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Deep merge with default config to ensure no missing keys
                const merged = deepMerge(defaultConfig, parsed);

                // Specific migration: Ensure customFonts exists and is an array
                if (!Array.isArray(merged.typography.customFonts)) {
                    merged.typography.customFonts = [];
                }

                // ── MIGRACIÓN DE FONDO → CAPAS (Adenda 68 · D) ────────────────
                // Es la que ARREGLA el bug real: una config con
                // `background.type === "audiomorphic"` (grabada en su día por el
                // widget / la ventana de config, y propagada a TODOS los
                // dispositivos porque "appearance-config-v2" es una SYNCED_KEY de
                // ámbito CUENTA) montaba el iframe del visualizador en cada carga.
                // La migración lo saca del arranque y lo deja como capa APAGADA.
                const migrated = migrateBackgroundLayers(merged.background ?? {});
                merged.background = {
                    ...merged.background,
                    type: migrated.type,
                    layers: migrated.layers,
                    layersVersion: migrated.layersVersion,
                    scopes: (merged.background?.scopes && typeof merged.background.scopes === "object")
                        ? merged.background.scopes
                        : {},
                };

                setConfig(merged);
            } catch (e) {
                console.error("Failed to parse appearance config", e);
                setConfig(defaultConfig); // Fallback to default on error
            }
        }
        setMounted(true);
    }, []);

    // ── Perfil activo (ámbito del fondo) ───────────────────────────────────
    // Lectura barata de localStorage + evento (NO usamos useActiveProfile aquí:
    // ese hook consulta Supabase y este provider envuelve TODO el árbol).
    const [profileId, setProfileId] = useState<string | null>(null);
    useEffect(() => {
        const read = () => {
            try { setProfileId(localStorage.getItem(ACTIVE_PROFILE_KEY) || null); } catch { setProfileId(null); }
        };
        read();
        window.addEventListener(PROFILE_ACTIVE_EVENT, read);
        window.addEventListener("storage", read);
        return () => {
            window.removeEventListener(PROFILE_ACTIVE_EVENT, read);
            window.removeEventListener("storage", read);
        };
    }, []);

    const pathname = usePathname() || "/";

    // Ámbito de EDICIÓN del fondo (cuenta · perfil · página). Es una preferencia
    // de la sesión de edición: no se persiste ni se sincroniza.
    const [bgScopeMode, setBgScopeMode] = useState<BackgroundScopeMode>("cuenta");

    const scopeKeyFor = React.useCallback((mode: BackgroundScopeMode): string | null => {
        if (mode === "perfil") return profileId ? `perfil:${profileId}` : null;
        if (mode === "pagina") return `pagina:${pathname}`;
        return null;
    }, [profileId, pathname]);

    /**
     * Fondo EFECTIVO: global ⟵ override de perfil ⟵ override de página.
     * Todo el OS (incluidos los motores pesados, que leen `config.background.type`)
     * consume el resultado, así que el ámbito funciona para el fondo entero.
     */
    const resolvedConfig = useMemo<AppearanceConfig>(() => {
        const scopes = config.background?.scopes;
        if (!scopes || typeof scopes !== "object") return config;
        const profileOv = profileId ? scopes[`perfil:${profileId}`] : undefined;
        // Página: coincidencia por prefijo más largo (una ruta hija hereda de su padre).
        let pageOv: Record<string, unknown> | undefined;
        let bestLen = -1;
        for (const key of Object.keys(scopes)) {
            if (!key.startsWith("pagina:")) continue;
            const route = key.slice("pagina:".length);
            if (route === pathname || (route !== "/" && pathname.startsWith(route + "/"))) {
                if (route.length > bestLen) { bestLen = route.length; pageOv = scopes[key]; }
            }
        }
        if (!profileOv && !pageOv) return config;
        let background = config.background;
        if (profileOv) background = deepMerge(background, profileOv);
        if (pageOv) background = deepMerge(background, pageOv);
        // Defensa: un override nunca puede resucitar el fondo fantasma.
        if ((background.type as string) === "audiomorphic" || (background.type as string) === "none") {
            background = { ...background, type: "spline" };
        }
        background = { ...background, layers: normalizeLayers(background.layers) };
        return { ...config, background };
    }, [config, profileId, pathname]);

    // Re-aplica el ThemePack del catálogo (theme-engine.ts) que el usuario
    // dejó activo la última vez, si lo hay — sin esto, un tema aplicado desde
    // ThemeCatalogGallery se perdería al recargar (applyThemeTokens solo toca
    // variables inline en tiempo real, no persiste solo con localStorage).
    // No-op honesto si nunca se aplicó ninguno (appliedTheme() → null).
    useEffect(() => {
        const applied = appliedTheme();
        if (applied?.id) applyThemePack(applied.id, (applied.mode as "light" | "dark" | "auto") || "auto");
    }, []);

    // Save to local storage on change (SIEMPRE la config CRUDA: los overrides de
    // ámbito viven dentro de `background.scopes`, no se pierden).
    useEffect(() => {
        if (!mounted) return;
        localStorage.setItem("appearance-config-v2", JSON.stringify(config));
    }, [config, mounted]);

    // Aplica al DOM el fondo EFECTIVO (con el override de perfil/página resuelto).
    useEffect(() => {
        if (!mounted) return;
        applyStyles(resolvedConfig);
    }, [resolvedConfig, mounted]);

    const applyStyles = (currentConfig: AppearanceConfig) => {
        if (!currentConfig) return; // Safety check
        const root = document.documentElement;


        // Typography
        // Defensive destructuring with defaults
        const typography = currentConfig.typography || defaultConfig.typography;
        const fontFamily = typography.fontFamily || defaultConfig.typography.fontFamily;
        const scale = typography.scale ?? defaultConfig.typography.scale;
        const customFonts = Array.isArray(typography.customFonts) ? typography.customFonts : [];

        // Base Font Map
        const fontMap: Record<string, string> = {
            "Inter": "var(--font-inter)",
            "Satoshi": "'Satoshi', sans-serif",
            "Roboto": "var(--font-roboto)",
            "Outfit": "var(--font-outfit)",
            "Space Grotesk": "var(--font-headline)",
            "Source Code Pro": "var(--font-code)",
            "System": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
        };

        // Add custom fonts to map
        customFonts.forEach(font => {
            if (font && font.name) {
                fontMap[font.name] = font.family;
            }
        });

        const fontVar = fontMap[fontFamily] || "var(--font-inter)";
        root.style.setProperty("--font-body", fontVar);

        // Inject Custom Font CSS if needed
        const customFont = customFonts.find(f => f.name === fontFamily);
        if (customFont) {
            const linkId = `custom-font-${customFont.name.replace(/\s+/g, '-')}`;
            if (!document.getElementById(linkId)) {
                const link = document.createElement('link');
                link.id = linkId;
                link.rel = 'stylesheet';
                link.href = customFont.url;
                document.head.appendChild(link);
            }
        }

        // Safe toString()
        root.style.setProperty("--font-scale", String(scale));

        // Styling
        const styling = currentConfig.styling || defaultConfig.styling;
        root.style.setProperty("--radius", `${styling.radius ?? defaultConfig.styling.radius}rem`);

        // Update Glass Blur variable
        const glassIntensity = styling.glassIntensity ?? defaultConfig.styling.glassIntensity;
        const opacity = styling.opacity ?? defaultConfig.styling.opacity;

        root.style.setProperty("--glass-blur", `${glassIntensity}px`);
        root.style.setProperty("--glass-opacity", String(opacity));

        // Advanced Styling Vars
        root.style.setProperty("--border-width", `${styling.borderWidth ?? 1}px`);
        root.style.setProperty("--glass-refraction", String(styling.refraction ?? 0));
        root.style.setProperty("--glass-aberration", `${styling.chromaticAberration ?? 0}px`);
        root.style.setProperty("--glass-noise", String(styling.noiseOpacity ?? 0));
        root.style.setProperty("--neon-glow", String(styling.glowIntensity ?? 0));

        if (styling.hardShadows) root.classList.add('theme-hard-shadows');
        else root.classList.remove('theme-hard-shadows');

        // Apply Crystal Presets (Overrides)
        // This ensures the preset values take precedence if a preset is selected
        const preset = styling.crystalPreset || 'none';

        switch (preset) {
            case 'clear':
                root.style.setProperty("--glass-opacity", "0.20");
                root.style.setProperty("--glass-blur", "5px");
                root.style.setProperty("--glass-refraction", "0.8");
                root.style.setProperty("--border-width", "1px");
                break;
            case 'frosted':
                root.style.setProperty("--glass-opacity", "0.60");
                root.style.setProperty("--glass-blur", "30px");
                root.style.setProperty("--glass-refraction", "0.1");
                root.style.setProperty("--glass-frost", "1.0");
                break;
            case 'holographic': // Prismatic
                root.style.setProperty("--glass-opacity", "0.30");
                root.style.setProperty("--glass-blur", "10px");
                root.style.setProperty("--glass-refraction", "0.9");
                root.style.setProperty("--glass-aberration", "5px");
                break;
            case 'obsidian': // Dark Glass
                root.style.setProperty("--glass-opacity", "0.85");
                root.style.setProperty("--glass-blur", "15px");
                root.style.setProperty("--glass-refraction", "0.2");
                break;
            case 'quantic': // Glitched
                root.style.setProperty("--glass-opacity", "0.40");
                root.style.setProperty("--glass-blur", "8px");
                root.style.setProperty("--glass-noise", "0.15");
                break;
            case 'organic-frosted':
                root.style.setProperty("--glass-opacity", "0.65");
                root.style.setProperty("--glass-blur", "20px");
                root.style.setProperty("--glass-refraction", "0.3");
                break;
            case 'none':
            default:
                // Do nothing, let manual sliders control (which were set above)
                break;
        }

        // --- THEME MODE LOGIC (Crystal vs Liquid vs Solid Crystal) ---
        if (config.themeStore.activeMode === 'crystal') {
            // Pure Crystal
            root.style.setProperty('--glass-blur', '20px');
            root.style.setProperty('--tab-glass-blur', '20px');
            root.style.setProperty('--glass-opacity', '0.65');
            root.style.setProperty('--glass-border-opacity', '0.4');
            root.style.setProperty('--glass-refraction', '1.5');
        } else if (config.themeStore.activeMode === 'liquid') {
            // Pure Liquid
            root.style.setProperty('--glass-blur', '40px');
            root.style.setProperty('--tab-glass-blur', '40px');
            root.style.setProperty('--glass-opacity', '0.4');
            root.style.setProperty('--glass-border-opacity', '0.1');
            root.style.setProperty('--glass-refraction', '1.1');
        } else if (config.themeStore.activeMode === 'solid-crystal') {
            // HYBRID: Liquid Tabs (High Blur) + Crystal Buttons (Base Crystal)
            root.style.setProperty('--glass-blur', '20px'); // Base for buttons
            root.style.setProperty('--tab-glass-blur', '40px'); // High blur for tabs
            root.style.setProperty('--glass-opacity', '0.75'); // More solid
            root.style.setProperty('--glass-border-opacity', '0.5'); // Calculated borders
            root.style.setProperty('--glass-refraction', '1.3');
        } else if (config.themeStore.activeMode === 'primary') {
            // PRIMARY MODE (Based on Liquid Glass React Repo)
            // Defaults from example: saturation 140, blur 0.5 (mapped to ~16px), displacement 100
            root.style.setProperty('--glass-blur', '16px');
            root.style.setProperty('--tab-glass-blur', '16px');
            root.style.setProperty('--glass-opacity', '0.7');
            root.style.setProperty('--glass-border-opacity', '0.3');
            root.style.setProperty('--glass-refraction', '0.8');
            root.style.setProperty('--glass-saturation', '140%');
            // Ensure no displacement distortion on main UI to keep it usable
            root.classList.remove('glass-displacement');
        }

        if (preset === 'organic-frosted') root.classList.add('glass-displacement');
        else root.classList.remove('glass-displacement');

        if (styling.uppercase) root.classList.add('theme-uppercase');
        else root.classList.remove('theme-uppercase');

        // Theme Specific Variables
        root.style.setProperty("--neon-ticker", styling.neonTicker ? "1" : "0");
        root.style.setProperty("--liquid-fluidity", `${styling.fluidity ?? 50}s`); // Duration inverse? Or raw value
        root.style.setProperty("--liquid-tension", String(styling.surfaceTension ?? 50));
        root.style.setProperty("--glass-frost", String(styling.frostOpacity ?? 0.5));
        root.style.setProperty("--glass-noise-amt", String(styling.glassNoise ?? 0.05));

        if (styling.neonTicker) document.body.classList.add('neon-flicker-enabled');
        else document.body.classList.remove('neon-flicker-enabled');

        if (currentConfig.buttons) {
            root.style.setProperty("--radius", `${currentConfig.buttons.radius}rem`);

            if (currentConfig.buttons.glow) {
                document.body.classList.add('buttons-glow-enabled');
            } else {
                document.body.classList.remove('buttons-glow-enabled');
            }

            // Crystal/Glass Buttons
            if (currentConfig.buttons.style === 'glass') {
                document.body.classList.add('style-glass-buttons');
            } else {
                document.body.classList.remove('style-glass-buttons');
            }

            // Legacy button animation + Global Hover
            const anims = currentConfig.animations || defaultConfig.animations;

            // Toggle global animation class
            if (anims.enabled) document.body.classList.remove('animations-disabled');
            else document.body.classList.add('animations-disabled');


            // Button/Hover Scale
            if (anims.hover || currentConfig.buttons.animation) {
                document.body.classList.add('buttons-animation-enabled');
            } else {
                document.body.classList.remove('buttons-animation-enabled');
            }

            // Click Effects
            if (anims.click) document.body.classList.add('click-effects-enabled');
            else document.body.classList.remove('click-effects-enabled');

            // Trinity Animation Type
            root.style.setProperty("--trinity-entry", anims.trinityEntry);

            // Token de duración global — los tokens de movimiento de globals.css
            // (--ease-organic/glide/...) lo consumen con fallback de 220ms.
            root.style.setProperty("--dur-base", `${anims.transitionDuration ?? 220}ms`);
        }

        // --- Text Diffusion (New) ---
        const textDiff = currentConfig.textDiffusion || defaultConfig.textDiffusion;
        root.style.setProperty("--text-diff-blur", `${textDiff.blur}px`);
        root.style.setProperty("--text-diff-opacity", String(textDiff.opacity));
        root.style.setProperty("--text-diff-glow", String(textDiff.glowStrength));
        // Optional: Toggle class if blur > 0 to enable costly filters only when needed
        if (textDiff.blur > 0) root.classList.add('text-diffusion-enabled');
        else root.classList.remove('text-diffusion-enabled');


        // Background (Custom handling needed for complex types)
        const background = currentConfig.background || defaultConfig.background;
        const overlayOpacity = background.overlayOpacity ?? defaultConfig.background.overlayOpacity;
        const overlayRgb = background.overlayColor === 'white' ? '255, 255, 255' : '0, 0, 0';
        const overlay = `linear-gradient(rgba(${overlayRgb}, ${overlayOpacity}), rgba(${overlayRgb}, ${overlayOpacity}))`;

        if (background.type === 'image' && background.value) {
            document.body.style.backgroundImage = `${overlay}, url('${background.value}')`;
            document.body.style.backgroundSize = "cover";
            document.body.style.backgroundAttachment = "fixed";
        } else if (background.type === 'solid' && background.value) {
            document.body.style.background = background.value;
        } else if (background.type === 'gradient' && background.value) {
            document.body.style.background = background.value;
            document.body.style.backgroundAttachment = "fixed";
        } else {
            document.body.style.background = "";
        }

        // Apply Background Animation
        // Remove existing animation classes first
        document.body.classList.remove('animate-bg-pan', 'animate-bg-zoom', 'animate-bg-pulse', 'animate-bg-scroll');
        if (background.animation && background.animation !== 'none') {
            document.body.classList.add(`animate-bg-${background.animation}`);
        }

        // Liquid Glass UI Mode
        if (currentConfig.liquidGlass?.applyToUI) {
            document.body.classList.add('liquid-ui-enabled');
        } else {
            document.body.classList.remove('liquid-ui-enabled');
        }

        // Universal WebGL Background Support
        // If WebGL is active, we force the body background to be transparent
        // to let the canvas show through, regardless of the active theme.
        if (background.type === 'webgl') {
            document.body.classList.add('webgl-active');
        } else {
            document.body.classList.remove('webgl-active');
        }

        // Materia Viva: data-attribute en <body> para que globals.css aplique
        // acentos coherentes (dorado/lima/cian) en dashboards y widgets.
        // Ej.: type "materia-oro-vivo" → <body data-materia="oro-vivo">.
        // SOP: architecture/integracion-portal-starseed-os.md → Materia Viva v1.1
        const bgType = String(background.type ?? '');
        if (bgType.startsWith('materia-')) {
            document.body.dataset.materia = bgType.slice('materia-'.length);
        } else {
            delete document.body.dataset.materia;
        }

        // Tema de identidad del OS: data-os-theme en <html>.
        // globals.css recubre TODO el design system bajo
        // html[data-os-theme="cafe"] (variantes clara y oscura).
        // "default" → sin atributo: cero efecto sobre los temas existentes.
        // SOP: architecture/integracion-portal-starseed-os.md → "Tema StarSeed Café".
        const osTheme = currentConfig.themeStore?.osTheme ?? "default";
        if (osTheme !== "default") {
            root.dataset.osTheme = osTheme;
        } else {
            delete root.dataset.osTheme;
        }

        // Secondary Styles
        if (currentConfig.secondary) {
            const { scrollbars, selectionColor, cursor, customCursorSvg } = currentConfig.secondary;

            // Scrollbars
            document.documentElement.classList.remove('scrollbar-hidden', 'scrollbar-thin', 'scrollbar-glow');
            if (scrollbars !== 'default') {
                document.documentElement.classList.add(`scrollbar-${scrollbars}`);
            }

            // Selection Color
            if (selectionColor && selectionColor !== 'auto') {
                root.style.setProperty('--selection-background', selectionColor);
                // Calculate contrast text color if possible, or default to white/black
                root.style.setProperty('--selection-foreground', '#ffffff');
            } else {
                root.style.removeProperty('--selection-background');
                root.style.removeProperty('--selection-foreground');
            }

            // Cursor
            if (cursor === 'custom' && customCursorSvg) {
                // Use a detailed SVG cursor if provided
                // root.style.setProperty('--cursor-image', `url(${customCursorSvg})`); 
                // For now, simple standard cursors or class-based custom cursors
                document.body.style.cursor = `url('${customCursorSvg}'), auto`;
            } else if (cursor === 'glow') {
                // specific class for glow cursor
            } else {
                document.body.style.cursor = 'auto';
            }
        }
    };

    /**
     * Escribe un parche de FONDO respetando el ámbito activo:
     *  • "cuenta"  → escribe en `background` (comportamiento de siempre).
     *  • "perfil"/"pagina" → escribe en `background.scopes[clave]` (override).
     * Devuelve la config nueva. Se usa desde updateConfig y updateSection para
     * que TODA la UI de fondo existente respete el ámbito sin tocarla.
     */
    const withScopedBackground = (prev: AppearanceConfig, bgPatch: Record<string, unknown>): AppearanceConfig => {
        const key = scopeKeyFor(bgScopeMode);
        if (!key) return deepMerge(prev, { background: bgPatch });
        const scopes = { ...(prev.background.scopes ?? {}) };
        scopes[key] = deepMerge(scopes[key] ?? {}, bgPatch);
        return { ...prev, background: { ...prev.background, scopes } };
    };

    const updateConfig = (updates: DeepPartial<AppearanceConfig>) => {
        setConfig((prev) => {
            pushHistory(prev);
            const { background, ...rest } = updates as Record<string, unknown>;
            let next = Object.keys(rest).length ? deepMerge(prev, rest) : prev;
            if (background && typeof background === "object") {
                next = withScopedBackground(next, background as Record<string, unknown>);
            }
            return next;
        });
    };

    const updateSection = <K extends keyof AppearanceConfig>(section: K, data: DeepPartial<AppearanceConfig[K]>) => {
        setConfig(prev => {
            pushHistory(prev);
            if (section === "background") {
                return withScopedBackground(prev, data as Record<string, unknown>);
            }
            return {
                ...prev,
                [section]: {
                    ...prev[section],
                    ...data
                }
            };
        });
    }

    /** ¿El ámbito seleccionado tiene un override propio guardado? */
    const bgScopeHasOverride = (() => {
        const key = scopeKeyFor(bgScopeMode);
        if (!key) return false;
        const ov = config.background.scopes?.[key];
        return !!ov && Object.keys(ov).length > 0;
    })();

    /** Borra el override del ámbito activo (vuelve a heredar de la cuenta). */
    const clearBackgroundScope = () => {
        const key = scopeKeyFor(bgScopeMode);
        if (!key) return;
        setConfig(prev => {
            pushHistory(prev);
            const scopes = { ...(prev.background.scopes ?? {}) };
            delete scopes[key];
            return { ...prev, background: { ...prev.background, scopes } };
        });
    };

    const addCustomFont = (font: CustomFont) => {
        setConfig(prev => ({
            ...prev,
            typography: {
                ...prev.typography,
                customFonts: [...prev.typography.customFonts.filter(f => f.name !== font.name), font]
            }
        }));
    };

    const removeCustomFont = (name: string) => {
        setConfig(prev => ({
            ...prev,
            typography: {
                ...prev.typography,
                customFonts: prev.typography.customFonts.filter(f => f.name !== name)
            }
        }));
    };

    // Theme Management Logic
    const saveTheme = (name: string) => {
        const newTheme = {
            id: crypto.randomUUID(),
            name,
            createdAt: Date.now(),
            config: { ...config } // Clone current config
        };

        setConfig(prev => ({
            ...prev,
            themeStore: {
                ...prev.themeStore,
                savedThemes: [...(prev.themeStore.savedThemes || []), newTheme]
            }
        }));
    };

    const loadTheme = (id: string) => {
        const theme = config.themeStore.savedThemes.find(t => t.id === id);
        if (theme) {
            // Keep existing saved themes, just overlay the config
            setConfig(prev => deepMerge(prev, {
                ...theme.config,
                themeStore: {
                    ...prev.themeStore,
                    // Ensure we don't overwrite the store itself with the old one
                    savedThemes: prev.themeStore.savedThemes
                }
            }));
        }
    };

    const deleteTheme = (id: string) => {
        setConfig(prev => ({
            ...prev,
            themeStore: {
                ...prev.themeStore,
                savedThemes: prev.themeStore.savedThemes.filter(t => t.id !== id)
            }
        }));
    };

    const exportTheme = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "starseed_theme_config.json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const importTheme = async (file: File) => {
        const text = await file.text();
        try {
            const importedConfig = JSON.parse(text);
            // Basic validation check
            if (importedConfig.styling && importedConfig.layout) {
                setConfig(prev => deepMerge(prev, importedConfig));
            } else {
                toast.error("Invalid theme file configuration");
            }
        } catch (e) {
            console.error("Failed to import theme", e);
            toast.error("Error parsing theme file");
        }
    };

    const resetConfig = () => {
        setConfig(defaultConfig);
    };

    return (
        <AppearanceContext.Provider value={{
            config: resolvedConfig,
            rawConfig: config,
            bgScopeMode,
            setBgScopeMode,
            bgScopeHasOverride,
            clearBackgroundScope,
            bgScopePath: pathname,
            bgScopeProfileId: profileId,
            updateConfig,
            resetConfig,
            updateSection,
            addCustomFont,
            removeCustomFont,
            saveTheme,
            loadTheme,
            deleteTheme,
            exportTheme,
            importTheme,
            undo,
            canUndo
        }}>
            {children}
        </AppearanceContext.Provider>
    );
}

export const useAppearance = () => {
    const context = useContext(AppearanceContext);
    if (context === undefined) {
        throw new Error("useAppearance must be used within an AppearanceProvider");
    }
    return context;
};
