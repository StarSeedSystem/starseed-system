import { describe, it, expect } from "vitest";
import { perfilDesdeTema, bloquePerfil, type DiagramDesignTokens } from "../perfil-marca";
import type { ThemeTokens } from "@/lib/design/theme-engine";

describe("perfilDesdeTema", () => {
  it("should convert ThemeTokens to diagram design tokens", () => {
    // Mock ThemeTokens with light theme values from globals.css
    const lightTokens: ThemeTokens = {
      vars: {
        "background-hsl": "270 20% 97%",  // very light background
        "foreground-hsl": "265 25% 12%",  // very dark foreground
        "primary-hsl": "19 84% 52%"       // warm accent color
      }
    };

    const result = perfilDesdeTema(lightTokens, "light");

    // Verify that we get hex colors
    expect(result.paper).toMatch(/^#[0-9A-F]{6}$/i);
    expect(result.ink).toMatch(/^#[0-9A-F]{6}$/i);
    expect(result.accent).toMatch(/^#[0-9A-F]{6}$/i);
    
    // Verify typography is correct
    expect(result.tipografias.title).toBe("Instrument Serif");
    expect(result.tipografias.nodeName).toBe("Geist");
    expect(result.tipografias.sublabel).toBe("Geist Mono");
    expect(result.tipografias.eyebrow).toBe("Geist Mono");
    expect(result.tipografias.arrowLabel).toBe("Geist Mono");
    expect(result.tipografias.callout).toBe("Instrument Serif italic");
    
    // Verify stroke values
    expect(result.trazos.strokeThin).toBe(0.8);
    expect(result.trazos.strokeDefault).toBe(1);
    expect(result.trazos.strokeStrong).toBe(1.2);
    expect(result.trazos.radiusSm).toBe(4);
    expect(result.trazos.radiusMd).toBe(6);
    expect(result.trazos.radiusLg).toBe(8);
    expect(result.trazos.grid).toBe(4);
  });

  it("should handle dark theme correctly", () => {
    // Mock ThemeTokens with dark theme values from globals.css
    const darkTokens: ThemeTokens = {
      vars: {
        "background-hsl": "258 45% 5%",   // very dark background
        "foreground-hsl": "220 30% 96%",  // very light foreground
        "primary-hsl": "42 74% 66%"       // warm accent color
      }
    };

    const result = perfilDesdeTema(darkTokens, "dark");

    // Verify that we get hex colors
    expect(result.paper).toMatch(/^#[0-9A-F]{6}$/i);
    expect(result.ink).toMatch(/^#[0-9A-F]{6}$/i);
    expect(result.accent).toMatch(/^#[0-9A-F]{6}$/i);
    
    // In dark mode, paper should be dark and ink should be light
    // Converting HSL to hex to verify approximate values
    expect(result.paper).toBe("#0b0d0f"); // Approximate for 258 45% 5%
    expect(result.ink).toBe("#f5f5f5");   // Approximate for 220 30% 96%
  });

  it("should use default values when vars are missing", () => {
    // ThemeTokens with missing vars
    const sparseTokens: ThemeTokens = {
      vars: {}
    };

    const result = perfilDesdeTema(sparseTokens, "light");

    // Should use defaults: background-hsl="0 0% 100%" -> white
    // foreground-hsl="0 0% 0%" -> black
    // primary-hsl="0 0% 50%" -> green
    expect(result.paper).toBe("#ffffff");
    expect(result.ink).toBe("#000000");
    expect(result.accent).toBe("#808080");
  });
});

describe("bloquePerfil", () => {
  it("should create profile block in correct format", () => {
    const perfil: DiagramDesignTokens = {
      paper: "#ffffff",
      ink: "#000000",
      accent: "#ff0000",
      tipografias: {
        title: "Instrument Serif",
        nodeName: "Geist",
        sublabel: "Geist Mono",
        eyebrow: "Geist Mono",
        arrowLabel: "Geist Mono",
        callout: "Instrument Serif italic"
      },
      trazos: {
        strokeThin: 0.8,
        strokeDefault: 1,
        strokeStrong: 1.2,
        radiusSm: 4,
        radiusMd: 6,
        radiusLg: 8,
        grid: 4
      }
    };

    const result = bloquePerfil(perfil);
    
    // Check that it starts with the profile header
    expect(result.trim().startsWith("<!-- diagram-design-profile")).toBe(true);
    // Check that it contains the style guide title
    expect(result).toContain("# Style Guide");
    // Check that it contains our values
    expect(result).toContain("| \`paper\` | Page background, default node fill | #ffffff | #ffffff |");
    expect(result).toContain("| \`ink\` | Primary text, primary stroke | #000000 | #000000 |");
    expect(result).toContain("| \`accent\` | Focal / 1–2 max per diagram | #ff0000 | #ff0000 |");
  });
});