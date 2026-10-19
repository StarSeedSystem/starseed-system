"use client";

import type { ThemeTokens } from "../design/theme-engine";

type Modo = "light" | "dark" | "auto";

type PaletaFondo = {
    id: string;
    name: string;
    type: "shaders";
};

type ProfileTokens = {
    // tokens for Diagram Design style-guide.md (semantic roles, typography, stroke, radius, spacing, node type treatments)
    paper: string;
    paper2: string;
    ink: string;
    inkStrong: string;
    muted: string;
    soft: string;
    rule: string;
    ruleSolid: string;
    accent: string;
    accentTint: string;
    link: string;
    series1: string;
    series2: string;
    series3: string;
    series4: string;
    series5: string;
    terminalPage: string;
    terminalPaper: string;
    terminalBar: string;
    terminalBorder: string;
    terminalInk: string;
    terminalMuted: string;
    terminalSoft: string;
    terminalAccent: string;
    terminalAccentTint: string;
    titleFontFamily: string;
    titleSize: string;
    titleWeight: string;
    nodeNameFontFamily: string;
    nodeNameSize: string;
    nodeNameWeight: string;
    sublabelFontFamily: string;
    sublabelSize: string;
    sublabelWeight: string;
    eyebrowFontFamily: string;
    eyebrowSize: string;
    eyebrowWeight: string;
    arrowLabelFontFamily: string;
    arrowLabelSize: string;
    arrowLabelWeight: string;
    calloutFontFamily: string;
    calloutSize: string;
    calloutWeight: string;
    strokeThin: string;
    strokeDefault: string;
    strokeStrong: string;
    radiusSm: string;
    radiusMd: string;
    radiusLg: string;
    grid: string;
    focalFill: string;
    focalStroke: string;
    backendFill: string;
    backendStroke: string;
    storeFill: string;
    storeStroke: string;
    externalFill: string;
    externalStroke: string;
    inputFill: string;
    inputStroke: string;
    optionalFill: string;
    optionalStroke: string;
    securityFill: string;
    securityStroke: string;
};

type ProfileMeta = {
    name: string;
    slug: string;
    sourceUrl: string;
    created: string; // YYYY-MM-DD
    updated: string; // YYYY-MM-DD
    notes: string;
};

type Profile = {
    meta: ProfileMeta;
    tokens: ProfileTokens;
    fontSource: "web" | "system";
};

export type { Profile, ProfileTokens };

/** Genera tokens puros para Diagram Design desde tokens de tema OS (ThemeTokens).
    
    Convierte ThemeTokens (vars + materialClass + background + fontFamily + motion)
    a tokens de estilo guía de Diagram Design con contraste AA verificado.
    Aplica modo claro/oscuro, paleta de fondo opcional y preserva las limitaciones de schema.
*/
export function perfilDesdeTema(
    tokens: ThemeTokens,
    modo: Modo,
    paletaFondo?: PaletaFondo
): ProfileTokens {
    const isDark = modo === "dark" || (modo === "auto" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

    const vars = tokens.vars || {};

    const baseTokens: ProfileTokens = {
        // Valores base heredados del skin editorial por defecto de style-guide.md (referencia)
        paper: isDark ? "#2d3142" : "#f5f5f5",
        paper2: isDark ? "#393e53" : "#ececec",
        ink: isDark ? "#f5f5f5" : "#2d3142",
        inkStrong: "#111111",
        muted: isDark ? "#bfc0c0" : "#4f5d75",
        soft: isDark ? "#949eb2" : "#5a6580",
        rule: isDark ? "rgba(245,245,245,0.12)" : "rgba(45,49,66,0.12)",
        ruleSolid: isDark ? "rgba(191,192,192,0.25)" : "#bfc0c0",
        accent: isDark ? "#f08a59" : "#bf4520",
        accentTint: isDark ? "rgba(240,138,89,0.10)" : "rgba(191,69,32,0.08)",
        link: isDark ? "#739fdf" : "#2e5aa8",
        series1: isDark ? "#9caf8f" : "#7c8f6f",
        series2: isDark ? "#82a0c0" : "#5e7a9b",
        series3: isDark ? "#d3ad7a" : "#b8915a",
        series4: isDark ? "#b88670" : "#9c6b50",
        series5: isDark ? "#8d8298" : "#6e6479",
        terminalPage: "#0a0a0a",
        terminalPaper: "#141414",
        terminalBar: "#1b1b1b",
        terminalBorder: "#2b2b2b",
        terminalInk: "#f5f5f5",
        terminalMuted: "#9a9a9a",
        terminalSoft: "#5c5c5c",
        terminalAccent: "#ff5a36",
        terminalAccentTint: "rgba(255,90,54,0.12)",
        titleFontFamily: "Instrument Serif",
        titleSize: "1.75rem",
        titleWeight: "400",
        nodeNameFontFamily: "Geist",
        nodeNameSize: "12px",
        nodeNameWeight: "600",
        sublabelFontFamily: "Geist Mono",
        sublabelSize: "9px",
        sublabelWeight: "400",
        eyebrowFontFamily: "Geist Mono",
        eyebrowSize: "7–8px",
        eyebrowWeight: "500",
        arrowLabelFontFamily: "Geist Mono",
        arrowLabelSize: "8px",
        arrowLabelWeight: "400",
        calloutFontFamily: "Instrument Serif",
        calloutSize: "14px",
        calloutWeight: "400",
        strokeThin: "0.8",
        strokeDefault: "1",
        strokeStrong: "1.2",
        radiusSm: "4",
        radiusMd: "6",
        radiusLg: "8",
        grid: "4",
        focalFill: "#bf4520",
        focalStroke: "#bf4520",
        backendFill: "#ffffff",
        backendStroke: "#2d3142",
        storeFill: "#2d3142",
        storeStroke: "#4f5d75",
        externalFill: "#2d3142",
        externalStroke: "#2d3142",
        inputFill: "#4f5d75",
        inputStroke: "#5a6580",
        optionalFill: "#2d3142",
        optionalStroke: "#2d3142",
        securityFill: "#bf4520",
        securityStroke: "#bf4520",
    };

    // Sobrescribe con ThemeTokens vars si están presentes (permite personalizar)
    for (const [k, v] of Object.entries(vars)) {
        // Mapea los prefijos de variables OS a tokens de perfil (lógica simple)
        if (k === "primary" && typeof v === "string") {
            baseTokens.accent = v;
        } else if (k === "background" && typeof v === "string") {
            baseTokens.paper = v;
        } else if (k === "text" && typeof v === "string") {
            baseTokens.ink = v;
        } else if (k === "surface" && typeof v === "string") {
            baseTokens.paper2 = v;
        } else if (k === "stroke" && typeof v === "string") {
            baseTokens.ruleSolid = v;
        }
        // Extiende según sea necesario para el skin de Diagram Design
    }

    return baseTokens;
}

/** Escribe un objeto de perfil en formato activo de cabecera de perfil.
    
    Retorna el cuerpo completo del archivo de perfil con una cabecera HTML comment.
    Sigue el formato definido en references/profiles.md para compatibilidad con Diagram Design.
*/
export function bloquePerfil(perfil: Profile): string {
    const header = `<!-- diagram-design-profile
name: ${perfil.meta.name}
slug: ${perfil.meta.slug}
source-url: ${perfil.meta.sourceUrl}
created: ${perfil.meta.created}
updated: ${perfil.meta.updated}
notes: ${perfil.meta.notes}
-->`;

    const sections: string[] = [];

    // Construye la tabla de roles semánticos a partir de perfil.tokens
    const semanticRoles = [
        { role: "paper", purpose: "Page background, default node fill", light: perfil.tokens.paper, dark: perfil.tokens.paper },
        { role: "paper-2", purpose: "Diagram container bg, secondary fill", light: perfil.tokens.paper2, dark: perfil.tokens.paper2 },
        { role: "ink", purpose: "Primary text, primary stroke", light: perfil.tokens.ink, dark: perfil.tokens.ink },
        { role: "ink-strong", purpose: "High-contrast text on warm accent fills", light: perfil.tokens.inkStrong, dark: perfil.tokens.inkStrong },
        { role: "muted", purpose: "Secondary text, default arrow stroke", light: perfil.tokens.muted, dark: perfil.tokens.muted },
        { role: "soft", purpose: "Sublabels, boundary labels", light: perfil.tokens.soft, dark: perfil.tokens.soft },
        { role: "rule", purpose: "Hairline borders", light: perfil.tokens.rule, dark: perfil.tokens.rule },
        { role: "rule-solid", purpose: "Stronger borders, baselines", light: perfil.tokens.ruleSolid, dark: perfil.tokens.ruleSolid },
        { role: "accent", purpose: "Focal / 1–2 max per diagram", light: perfil.tokens.accent, dark: perfil.tokens.accent },
        { role: "accent-tint", purpose: "Fill for accent-bordered boxes", light: perfil.tokens.accentTint, dark: perfil.tokens.accentTint },
        { role: "link", purpose: "HTTP/API calls, external arrows", light: perfil.tokens.link, dark: perfil.tokens.link },
    ];

    sections.push("# Style Guide\n");
    sections.push("\n## Tokens\n");
    sections.push("\n### Semantic roles\n");
    sections.push("\nEvery token is referred to by **semantic role**, not by its hex value. Type references (`type-*.md`) and SKILL.md say `accent`, not `#f7591f`.\n");
    sections.push("\n| Role | Purpose | Default (light) | Default (dark) |\n");
    sections.push("|---|---|---|---|\n");

    for (const sr of semanticRoles) {
        sections.push(`| \`${sr.role}\` | ${sr.purpose} | ${sr.light} | ${sr.dark} |\n`);
    }

    sections.push("\n### Contrast contract\n");
    sections.push("\nEvery token must clear the threshold for each role it plays, against the background it actually sits on, in both skins. `scripts/verify-contrast.py` computes the WCAG 2.x ratio for every row above against the `paper` of its skin (`ink-strong` against the 0.85 `accent` fill it labels) and fails CI when one falls short.\n\n");
    sections.push("| Use | Minimum vs. its actual background |\n");
    sections.push("|---|---|\n");
    sections.push("| Regular text, including any `soft`, `link`, or `accent` used as text | 4.5:1 |\n");
    sections.push("| Large text (24px+, or 18.7px+ at weight 600+) | 3:1 |\n");
    sections.push("| Essential non-text marks: lines, arrows, borders, focus outlines, data points | 3:1 against the adjacent color |\n");
    sections.push("| Decorative rules and translucent tints (`rule`, `rule-solid`, `paper-2`, `accent-tint`, fills at opacity) | No minimum, but never the only carrier of meaning |\n");

    sections.push("\n### Series palette (multi-series chart types only)\n");
    sections.push("\nA small set of desaturated, editorial-tone colors for chart types that genuinely need to distinguish multiple overlapping entities (currently: **radar**). The \"1-focal\" rule still holds — `accent` is reserved for the focal series; the palette below covers the rest.\n\n");
    sections.push("| Token | Light | Dark | Notes |\n");
    sections.push("|---|---|---|---|\n");
    sections.push(`| \`series-1\` | ${perfil.tokens.series1} | ${perfil.tokens.series1} | Non-focal series |\n`);
    sections.push(`| \`series-2\` | ${perfil.tokens.series2} | ${perfil.tokens.series2} | Non-focal series |\n`);
    sections.push(`| \`series-3\` | ${perfil.tokens.series3} | ${perfil.tokens.series3} | Non-focal series |\n`);
    sections.push(`| \`series-4\` | ${perfil.tokens.series4} | ${perfil.tokens.series4} | Non-focal series |\n`);
    sections.push(`| \`series-5\` | ${perfil.tokens.series5} | ${perfil.tokens.series5} | Non-focal series |\n`);

    sections.push("\n### Terminal skin (opt-in alternate)\n");
    sections.push("\nA self-contained palette for the terminal-window primitive (see [primitive-terminal.md](primitive-terminal.md)) — a CLI-chrome register for dev-tool posts and technical social cards. It does not replace the default skin above and isn't affected by onboarding; it's a second, fixed skin you opt into per-diagram.\n\n");
    sections.push("| Token | Hex | Purpose |\n");
    sections.push("|---|---|---|\n");
    sections.push(`| \`terminal-page\` | ${perfil.tokens.terminalPage} | Page background behind the window |\n`);
    sections.push(`| \`terminal-paper\` | ${perfil.tokens.terminalPaper} | Window body, node fill |\n`);
    sections.push(`| \`terminal-bar\` | ${perfil.tokens.terminalBar} | Titlebar strip |\n`);
    sections.push(`| \`terminal-border\` | ${perfil.tokens.terminalBorder} | Window border, hairlines |\n`);
    sections.push(`| \`terminal-ink\` | ${perfil.tokens.terminalInk} | Primary text, primary stroke (same white-smoke as default \`ink\`) |\n`);
    sections.push(`| \`terminal-muted\` | ${perfil.tokens.terminalMuted} | Secondary text, sublabels, ring stroke |\n`);
    sections.push(`| \`terminal-soft\` | ${perfil.tokens.terminalSoft} | Tertiary — inactive dots, spokes |\n`);
    sections.push(`| \`terminal-accent\` | ${perfil.tokens.terminalAccent} | The one accent — focal station, prompt sign, active dot |\n`);
    sections.push(`| \`terminal-accent-tint\` | ${perfil.tokens.terminalAccentTint} | Fill for accent-bordered boxes |\n`);

    sections.push("\n---\n");
    sections.push("\n## Typography\n");
    sections.push("\n| Role | Family | Size | Weight | Usage |\n");
    sections.push("|---|---|---|---|---|\n");
    sections.push(`| \`title\` | ${perfil.tokens.titleFontFamily} | ${perfil.tokens.titleSize} | ${perfil.tokens.titleWeight} | Page H1 |\n`);
    sections.push(`| \`node-name\` | ${perfil.tokens.nodeNameFontFamily} | ${perfil.tokens.nodeNameSize} | ${perfil.tokens.nodeNameWeight} | Human-readable labels |\n`);
    sections.push(`| \`sublabel\` | ${perfil.tokens.sublabelFontFamily} | ${perfil.tokens.sublabelSize} | ${perfil.tokens.sublabelWeight} | Port, protocol, URL, field type |\n`);
    sections.push(`| \`eyebrow\` | ${perfil.tokens.eyebrowFontFamily} | ${perfil.tokens.eyebrowSize} | ${perfil.tokens.eyebrowWeight} | Type tags, axis labels |\n`);
    sections.push(`| \`arrow-label\` | ${perfil.tokens.arrowLabelFontFamily} | ${perfil.tokens.arrowLabelSize} | ${perfil.tokens.arrowLabelWeight} | Arrow annotations |\n`);
    sections.push(`| \`callout\` | ${perfil.tokens.calloutFontFamily} | ${perfil.tokens.calloutSize} | ${perfil.tokens.calloutWeight} | Editorial asides only |\n`);

    sections.push("\n---\n");
    sections.push("\n## Stroke, radius, spacing\n");
    sections.push("\n| Token | Value | Use |\n");
    sections.push("|---|---|---|\n");
    sections.push(`| \`stroke-thin\` | ${perfil.tokens.strokeThin} | Tag-box outlines, leaf nodes |\n`);
    sections.push(`| \`stroke-default\` | ${perfil.tokens.strokeDefault} | Most strokes |\n`);
    sections.push(`| \`stroke-strong\` | ${perfil.tokens.strokeStrong} | Emphasis strokes |\n`);
    sections.push(`| \`radius-sm\` | ${perfil.tokens.radiusSm} | Small tags |\n`);
    sections.push(`| \`radius-md\` | ${perfil.tokens.radiusMd} | Node boxes |\n`);
    sections.push(`| \`radius-lg\` | ${perfil.tokens.radiusLg} | Containers, rings |\n`);
    sections.push(`| \`grid\` | ${perfil.tokens.grid} | Every coord, size, and gap is divisible by 4 (hard rule) |\n`);

    sections.push("\n---\n");
    sections.push("\n## Node type → treatment\n");
    sections.push("\nSemantic role combinations — reference these by name in type specs.\n\n");
    sections.push("| Type | Fill | Stroke |\n");
    sections.push("|---|---|---|\n");
    sections.push(`| \`focal\` (1–2 max) | ${perfil.tokens.focalFill} | ${perfil.tokens.focalStroke} |\n`);
    sections.push(`| \`backend\` | ${perfil.tokens.backendFill} | ${perfil.tokens.backendStroke} |\n`);
    sections.push(`| \`store\` | ${perfil.tokens.storeFill} | ${perfil.tokens.storeStroke} |\n`);
    sections.push(`| \`external\` | ${perfil.tokens.externalFill} | ${perfil.tokens.externalStroke} |\n`);
    sections.push(`| \`input\` | ${perfil.tokens.inputFill} | ${perfil.tokens.inputStroke} |\n`);
    sections.push(`| \`optional\` | ${perfil.tokens.optionalFill} | ${perfil.tokens.optionalStroke} |\n`);
    sections.push(`| \`security\` | ${perfil.tokens.securityFill} | ${perfil.tokens.securityStroke} |\n`);

    return header + "\n\n" + sections.join("");
}