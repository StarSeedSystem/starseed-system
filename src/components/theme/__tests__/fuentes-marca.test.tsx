import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  obtenerVariableFuente,
  obtenerFuentesCSS,
  FONT_VARIABLES,
  FONT_FALLBACKS,
  FONT_LINK_IDS,
  FONTSHARE_SATOSHI_URL,
  GOOGLE_QUICKSAND_URL,
  type FontRole,
} from "../fuentes-marca";

describe("fuentes-marca", () => {
  describe("obtenerVariableFuente", () => {
    it("devuelve variable CSS con respaldo para display-editorial", () => {
      const resultado = obtenerVariableFuente("display-editorial");
      expect(resultado).toBe(
        "var(--ss-font-display, 'Rajdhani', 'Inter', system-ui, sans-serif)"
      );
    });

    it("devuelve variable CSS con respaldo para titular-tecnico", () => {
      const resultado = obtenerVariableFuente("titular-tecnico");
      expect(resultado).toBe(
        "var(--ss-font-titular, 'Rajdhani', 'Inter', system-ui, sans-serif)"
      );
    });

    it("devuelve variable CSS con respaldo para organico", () => {
      const resultado = obtenerVariableFuente("organico");
      expect(resultado).toBe(
        "var(--ss-font-organica, 'Inter', system-ui, sans-serif)"
      );
    });
  });

  describe("obtenerFuentesCSS", () => {
    it("devuelve objeto con las tres variables CSS y sus respaldos", () => {
      const fuentes = obtenerFuentesCSS();

      expect(fuentes).toEqual({
        "--ss-font-display": "'Satoshi', 'Rajdhani', 'Inter', system-ui, sans-serif",
        "--ss-font-titular": "'Rajdhani', 'Rajdhani', 'Inter', system-ui, sans-serif",
        "--ss-font-organica": "'Quicksand', 'Inter', system-ui, sans-serif",
      });
    });

    it("incluye Satoshi como principal para display", () => {
      const fuentes = obtenerFuentesCSS();
      expect(fuentes["--ss-font-display"]).toContain("'Satoshi'");
    });

    it("incluye Rajdhani como principal para titular", () => {
      const fuentes = obtenerFuentesCSS();
      expect(fuentes["--ss-font-titular"]).toContain("'Rajdhani'");
    });

    it("incluye Quicksand como principal para organico", () => {
      const fuentes = obtenerFuentesCSS();
      expect(fuentes["--ss-font-organica"]).toContain("'Quicksand'");
    });
  });

  describe("constantes de configuración", () => {
    it("FONT_VARIABLES tiene las tres claves esperadas", () => {
      expect(FONT_VARIABLES).toEqual({
        "display-editorial": "--ss-font-display",
        "titular-tecnico": "--ss-font-titular",
        organico: "--ss-font-organica",
      });
    });

    it("FONT_FALLBACKS tiene respaldos correctos según decisiones de Alex", () => {
      expect(FONT_FALLBACKS["display-editorial"]).toBe(
        "'Rajdhani', 'Inter', system-ui, sans-serif"
      );
      expect(FONT_FALLBACKS["titular-tecnico"]).toBe(
        "'Rajdhani', 'Inter', system-ui, sans-serif"
      );
      expect(FONT_FALLBACKS.organico).toBe("'Inter', system-ui, sans-serif");
    });

    it("FONT_LINK_IDS usa identificadores únicos", () => {
      expect(FONT_LINK_IDS.satoshi).toBe("ss-font-satoshi");
      expect(FONT_LINK_IDS.quicksand).toBe("ss-font-quicksand");
      expect(FONT_LINK_IDS.satoshi).not.toBe(FONT_LINK_IDS.quicksand);
    });

    it("URLs de fuentes son las correctas", () => {
      expect(FONTSHARE_SATOSHI_URL).toBe(
        "https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap"
      );
      expect(GOOGLE_QUICKSAND_URL).toBe(
        "https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap"
      );
    });
  });

  describe("tipo FontRole", () => {
    it("solo permite los tres roles definidos", () => {
      const roles: FontRole[] = [
        "display-editorial",
        "titular-tecnico",
        "organico",
      ];
      expect(roles).toHaveLength(3);
    });
  });
});