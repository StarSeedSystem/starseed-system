"use client";

import { describe, it, expect } from "vitest";

import type { ThemeTokens } from "../../design/theme-engine";
import { perfilDesdeTema, bloquePerfil, type Profile, type ProfileTokens } from "../perfil-marca";

type Modo = "light" | "dark" | "auto";

type PaletaFondo = {
    id: string;
    name: string;
    type: "shaders";
};

describe("perfilDesdeTema", () => {
    it("genera tokens puros para modo claro desde un ThemeTokens vacío", () => {
        const emptyTokens: ThemeTokens = { vars: {} };
        const result = perfilDesdeTema(emptyTokens, "light");

        expect(result).toMatchObject({
            paper: "#f5f5f5",
            ink: "#2d3142",
            accent: "#bf4520",
            titleFontFamily: "Instrument Serif",
        });
    });

    it("genera tokens puros para modo oscuro desde un ThemeTokens vacío", () => {
        const emptyTokens: ThemeTokens = { vars: {} };
        const result = perfilDesdeTema(emptyTokens, "dark");

        expect(result).toMatchObject({
            paper: "#2d3142",
            ink: "#f5f5f5",
            accent: "#f08a59",
            titleFontFamily: "Instrument Serif",
        });
    });

    it("genera tokens puros para modo auto en modo claro", () => {
        const emptyTokens: ThemeTokens = { vars: {} };
        const result = perfilDesdeTema(emptyTokens, "auto");

        expect(result).toMatchObject({
            paper: "#f5f5f5",
            ink: "#2d3142",
            accent: "#bf4520",
            titleFontFamily: "Instrument Serif",
        });
    });

    it("sobrescribe tokens base con vars proporcionados", () => {
        const tokens: ThemeTokens = {
            vars: {
                primary: "#ff0000",
                background: "#abcdef",
                text: "#123456",
                surface: "#654321",
                stroke: "#987654",
            },
        };
        const result = perfilDesdeTema(tokens, "light");

        expect(result.accent).toBe("#ff0000");
        expect(result.paper).toBe("#abcdef");
        expect(result.ink).toBe("#123456");
        expect(result.paper2).toBe("#654321");
        expect(result.ruleSolid).toBe("#987654");
    });

    it("conserva valores por defecto para campos no sobrescritos", () => {
        const tokens: ThemeTokens = { vars: {} };
        const result = perfilDesdeTema(tokens, "light");

        expect(result.link).toBe("#2e5aa8");
        expect(result.series1).toBe("#7c8f6f");
        expect(result.titleSize).toBe("1.75rem");
        expect(result.strokeThin).toBe("0.8");
    });
});

describe("bloquePerfil", () => {
    it("escribe el contenido del perfil con una cabecera correcta", () => {
        const perfil: Profile = {
            meta: {
                name: "Test Client",
                slug: "test-client",
                sourceUrl: "https://example.com",
                created: "2026-01-01",
                updated: "2026-01-01",
                notes: "Test profile for unit tests",
            },
            tokens: {
                paper: "#f5f5f5",
                paper2: "#ececec",
                ink: "#2d3142",
                inkStrong: "#111111",
                muted: "#4f5d75",
                soft: "#5a6580",
                rule: "rgba(45,49,66,0.12)",
                ruleSolid: "#bfc0c0",
                accent: "#bf4520",
                accentTint: "rgba(191,69,32,0.08)",
                link: "#2e5aa8",
                series1: "#7c8f6f",
                series2: "#5e7a9b",
                series3: "#b8915a",
                series4: "#9c6b50",
                series5: "#6e6479",
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
            },
            fontSource: "web",
        };

        const output = bloquePerfil(perfil);

        expect(output).toContain("<!-- diagram-design-profile");
        expect(output).toContain("name: Test Client");
        expect(output).toContain("slug: test-client");
        expect(output).toContain("source-url: https://example.com");
        expect(output).toContain("created: 2026-01-01");
        expect(output).toContain("updated: 2026-01-01");
        expect(output).toContain("notes: Test profile for unit tests");
        expect(output).toContain("# Style Guide");
        expect(output).toContain("`paper` | Page background, default node fill | #f5f5f5 | #f5f5f5");
        expect(output).toContain("`accent` | Focal / 1–2 max per diagram | #bf4520 | #bf4520");
        expect(output).toContain("`title` | Instrument Serif | 1.75rem | 400 | Page H1");
    });

    it("genera el bloque markdown completo para todos los tokens del perfil", () => {
        const perfil: Profile = {
            meta: {
                name: "Minimal Client",
                slug: "minimal",
                sourceUrl: "none",
                created: "2026-01-01",
                updated: "2026-01-01",
                notes: "none",
            },
            tokens: {
                paper: "#ffffff",
                paper2: "#f0f0f0",
                ink: "#000000",
                inkStrong: "#111111",
                muted: "#666666",
                soft: "#999999",
                rule: "rgba(0,0,0,0.12)",
                ruleSolid: "#cccccc",
                accent: "#ff0000",
                accentTint: "rgba(255,0,0,0.08)",
                link: "#0000ff",
                series1: "#00ff00",
                series2: "#ff00ff",
                series3: "#00ffff",
                series4: "#ffff00",
                series5: "#ff8800",
                terminalPage: "#000000",
                terminalPaper: "#1a1a1a",
                terminalBar: "#2a2a2a",
                terminalBorder: "#3a3a3a",
                terminalInk: "#ffffff",
                terminalMuted: "#aaaaaa",
                terminalSoft: "#888888",
                terminalAccent: "#ff4444",
                terminalAccentTint: "rgba(255,68,68,0.12)",
                titleFontFamily: "Serif",
                titleSize: "2rem",
                titleWeight: "600",
                nodeNameFontFamily: "Sans-Serif",
                nodeNameSize: "16px",
                nodeNameWeight: "400",
                sublabelFontFamily: "Mono",
                sublabelSize: "10px",
                sublabelWeight: "300",
                eyebrowFontFamily: "Bold-Mono",
                eyebrowSize: "12px",
                eyebrowWeight: "700",
                arrowLabelFontFamily: "Condensed-Sans",
                arrowLabelSize: "9px",
                arrowLabelWeight: "500",
                calloutFontFamily: "Italic-Serif",
                calloutSize: "15px",
                calloutWeight: "400",
                strokeThin: "1.5",
                strokeDefault: "2",
                strokeStrong: "3",
                radiusSm: "6",
                radiusMd: "10",
                radiusLg: "14",
                grid: "8",
                focalFill: "#ff0000",
                focalStroke: "#ff0000",
                backendFill: "#ffffff",
                backendStroke: "#000000",
                storeFill: "#eeeeee",
                storeStroke: "#444444",
                externalFill: "#f5f5f5",
                externalStroke: "#777777",
                inputFill: "#e0e0e0",
                inputStroke: "#999999",
                optionalFill: "#fafafa",
                optionalStroke: "#bbbbbb",
                securityFill: "#ff0000",
                securityStroke: "#ff0000",
            },
            fontSource: "web",
        };

        const output = bloquePerfil(perfil);

        expect(output).toContain("# Style Guide");
        expect(output).toContain("## Tokens");
        expect(output).toContain("## Typography");
        expect(output).toContain("## Stroke, radius, spacing");
        expect(output).toContain("## Node type → treatment");
        expect(output).toContain("`paper` | Page background, default node fill | #ffffff | #ffffff");
        expect(output).toContain("`accent` | Focal / 1–2 max per diagram | #ff0000 | #ff0000");
        expect(output).toContain("`title` | Serif | 2rem | 600 | Page H1");
        expect(output).toContain("`focal` (1–2 max) | #ff0000 | #ff0000");
    });
});