import { describe, it, expect } from "vitest";
import {
  getFontVariant,
  getFontFallback,
  getFontCssVariables,
  validateNoDuplicateLinks,
  FONT_SHARE_URL,
  GOOGLE_FONTS_QUICKSAND_URL,
  FONT_VARIANTS,
  FONT_FALLBACKS,
} from "../fontes-utils";

describe("fontes-utils", () => {
  describe("getFontVariant", () => {
    it("returns Satoshi for display variant", () => {
      expect(getFontVariant("display")).toBe("Satoshi");
    });

    it("returns Rajdhani for titular variant", () => {
      expect(getFontVariant("titular")).toBe("Rajdhani");
    });

    it("returns Quicksand for organica variant", () => {
      expect(getFontVariant("organica")).toBe("Quicksand");
    });
  });

  describe("getFontFallback", () => {
    it("returns fallback for display variant", () => {
      expect(getFontFallback("display")).toBe(
        "Rajdhani, Inter, system-ui, sans-serif",
      );
    });

    it("returns fallback for titular variant", () => {
      expect(getFontFallback("titular")).toBe("Inter, system-ui, sans-serif");
    });

    it("returns fallback for organica variant", () => {
      expect(getFontFallback("organica")).toBe("Inter, system-ui, sans-serif");
    });
  });

  describe("getFontCssVariables", () => {
    it("returns all CSS variables with correct values", () => {
      const vars = getFontCssVariables();
      expect(vars["--ss-font-display"]).toBe("Satoshi");
      expect(vars["--ss-font-titular"]).toBe("Rajdhani");
      expect(vars["--ss-font-organica"]).toBe("Quicksand");
      expect(vars["--ss-font-display-fallback"]).toBe(
        "Rajdhani, Inter, system-ui, sans-serif",
      );
      expect(vars["--ss-font-titular-fallback"]).toBe(
        "Inter, system-ui, sans-serif",
      );
      expect(vars["--ss-font-organica-fallback"]).toBe(
        "Inter, system-ui, sans-serif",
      );
    });
  });

  describe("validateNoDuplicateLinks", () => {
    it("returns empty array when no duplicates", () => {
      const links: HTMLLinkElement[] = [
        { href: "https://example.com/1" } as HTMLLinkElement,
        { href: "https://example.com/2" } as HTMLLinkElement,
        { href: "https://example.com/3" } as HTMLLinkElement,
      ];
      const result = validateNoDuplicateLinks(links);
      expect(result).toEqual([]);
    });

    it("detects duplicate hrefs", () => {
      const link1: HTMLLinkElement = { href: "https://example.com/font" } as HTMLLinkElement;
      const link2: HTMLLinkElement = { href: "https://example.com/font" } as HTMLLinkElement;
      const link3: HTMLLinkElement = { href: "https://example.com/other" } as HTMLLinkElement;
      const links: HTMLLinkElement[] = [link1, link2, link3];
      const result = validateNoDuplicateLinks(links);
      expect(result).toContain("https://example.com/font");
    });

    it("handles empty collection", () => {
      const links: HTMLLinkElement[] = [];
      const result = validateNoDuplicateLinks(links);
      expect(result).toEqual([]);
    });
  });

  describe("URL constants", () => {
    it("has Fontshare URL for Satoshi", () => {
      expect(FONT_SHARE_URL).toContain("api.fontshare.com");
      expect(FONT_SHARE_URL).toContain("satoshi@500,700,900");
    });

    it("has Google Fonts URL for Quicksand", () => {
      expect(GOOGLE_FONTS_QUICKSAND_URL).toContain("fonts.googleapis.com");
      expect(GOOGLE_FONTS_QUICKSAND_URL).toContain("Quicksand");
    });
  });

  describe("FONT_VARIANTS", () => {
    it("has all three variants", () => {
      expect(FONT_VARIANTS.display).toBeDefined();
      expect(FONT_VARIANTS.titular).toBeDefined();
      expect(FONT_VARIANTS.organica).toBeDefined();
    });

    it("display variant is Satoshi", () => {
      expect(FONT_VARIANTS.display).toBe("Satoshi");
    });

    it("titular variant is Rajdhani", () => {
      expect(FONT_VARIANTS.titular).toBe("Rajdhani");
    });

    it("organica variant is Quicksand", () => {
      expect(FONT_VARIANTS.organica).toBe("Quicksand");
    });
  });

  describe("FONT_FALLBACKS", () => {
    it("has fallbacks for all variants", () => {
      expect(FONT_FALLBACKS.display).toBeDefined();
      expect(FONT_FALLBACKS.titular).toBeDefined();
      expect(FONT_FALLBACKS.organica).toBeDefined();
    });

    it("display fallback includes Rajdhani", () => {
      expect(FONT_FALLBACKS.display).toContain("Rajdhani");
    });

    it("titular fallback includes Inter", () => {
      expect(FONT_FALLBACKS.titular).toContain("Inter");
    });

    it("organica fallback includes Inter", () => {
      expect(FONT_FALLBACKS.organica).toContain("Inter");
    });
  });
});