import { describe, it, expect } from "vitest";
import type { ThemeTokens } from "../theme-engine";
import { luminanciaDe, type EntradaPaleta } from "../paleta-fondo";
import {
  acentosDe, asegurarContraste, canalesAHex, hexACanales, pedidoParaIA,
  propuestasDesdeFondo, superficieViva,
} from "../rediseno-desde-fondo";
import type { EntradaRediseno } from "../rediseno-desde-fondo";

const TEMA: ThemeTokens = { vars: { radius: "1.25rem" }, motion: 1, fontFamily: "Inter" };
const PALETA: EntradaPaleta[] = [
  { color: "#0a0e27", peso: 0.6 }, { color: "#10b981", peso: 0.25 }, { color: "#ffbf00", peso: 0.15 },
];
const entrada = (parcial: Partial<EntradaRediseno> = {}): EntradaRediseno => ({
  paleta: PALETA, temaActual: TEMA, modo: "oscuro", ...parcial,
});
/** Ratio AA recomputado de forma independiente con luminanciaDe (paleta-fondo). */
const ratioEntre = (a: [number, number, number], b: [number, number, number]): number => {
  const [la, lb] = [a, b].map((c) => luminanciaDe(canalesAHex(c)));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
describe("rediseno-desde-fondo", () => {
  describe("propuestasDesdeFondo", () => {
    it("devuelve tres propuestas con id, nombre, motivo y acentos de la paleta", () => {
      const propuestas = propuestasDesdeFondo(entrada());
      expect(propuestas.map((p) => p.id)).toEqual(["sobria", "armonica", "atrevida"]);
      for (const p of propuestas) {
        expect(p.nombre.length).toBeGreaterThan(2); expect(p.motivo.length).toBeGreaterThan(20);
      }
      expect(propuestas[0].tokens.vars["primary"]).toBe("#0a0e27");
      expect(propuestas[0].tokens.vars["secondary"]).toBe("#10b981");
      expect(propuestas[2].tokens.vars["popover"]).toBeTruthy();
    });
    it("superficies translúcidas en las tres capas, sin tapar nunca el fondo", () => {
      for (const p of propuestasDesdeFondo(entrada())) {
        for (const tecla of ["background", "card", "popover"]) {
          expect(p.tokens.vars[tecla]).toMatch(/^rgb\(\d+ \d+ \d+ \/ (?:1?\.|0\.)\d{2}\)$/);
        }
      }
      const base = propuestasDesdeFondo(entrada()).map((p) => p.tokens.vars["background"]);
      expect(base[0]).toContain("/ 0.13"); expect(base[1]).toContain("/ 0.34");
      expect(base[2]).toContain("/ 0.55");
    });
    it("respetan el modo: texto claro en oscuro y oscuro en claro (paleta clara)", () => {
      expect(propuestasDesdeFondo(entrada())[0].tokens.vars["foreground"]).toBe("#f5f6f8");
      const clara = entrada({ modo: "claro", paleta: [{ color: "#e8e8f0", peso: 0.6 }, { color: "#10b981", peso: 0.4 }] });
      const sobria = propuestasDesdeFondo(clara)[0];
      expect(sobria.tokens.vars["foreground"]).toBe("#141a24");
      expect(sobria.contrasteAA).toBe(true);
    });

    it("radios armónicos con escala φ y familia del tema", () => {
      const [sobria, armonica, atrevida] = propuestasDesdeFondo(entrada());
      expect(sobria.tokens.vars["radius"]).toBe("1.250rem");
      expect(parseFloat(armonica.tokens.vars["radius"])).toBeCloseTo(1.25 * 1.618, 2);
      expect(parseFloat(atrevida.tokens.vars["radius"])).toBeCloseTo(1.25 * 1.618 * 1.618, 1);
      expect(atrevida.tokens.materialClass).toBe("ss-crystal"); expect(atrevida.tokens.motion).toBe(2);
      expect(armonica.tokens.fontFamily).toBe("Inter");
    });

    it("contraste AA verificado: ratio ≥ 4,5 recomputado sobre la superficie viva", () => {
      const fondo = hexACanales("#0a0e27");
      for (const p of propuestasDesdeFondo(entrada())) {
        expect(p.contrasteAA).toBe(true); expect(p.contrasteMinimo).toBeGreaterThanOrEqual(4.5);
        for (const tecla of ["background", "card", "popover"] as const) {
          const m = /rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(p.tokens.vars[tecla] ?? "");
          if (!m) throw new Error("superficie translúcida mal formada");
          const viva = superficieViva(
            [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number], fondo, Number(m[4]));
          expect(ratioEntre(viva, hexACanales(p.tokens.vars["foreground"] ?? ""))).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
    it("sin paleta sigue proponiendo (paleta neutra) o descarta con motivo", () => {
      for (const p of propuestasDesdeFondo(entrada({ paleta: [] }))) {
        if (p.descartada) expect(p.descartada).toContain("AA"); else expect(p.contrasteAA).toBe(true);
      }
    });
  });

  describe("asegurarContraste", () => {
    it("ajusta el esmalte hasta AA y devuelve la superficie verificada", () => {
      const r = asegurarContraste(hexACanales("#ffbf00"), hexACanales("#0a0e27"), 0.55, "#f5f6f8", "oscuro");
      if (!r) throw new Error("debería ajustar");
      expect(r.ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratioEntre(r.superficie, hexACanales("#f5f6f8"))).toBeGreaterThanOrEqual(4.5);
      expect(r.esmalte.every((c) => c >= 0 && c <= 255)).toBe(true);
    });
    it("sin intentos deja en null lo que ya no puede pasar", () => {
      expect(asegurarContraste(
        hexACanales("#ffffff"), hexACanales("#0a0e27"), 0.76, "#ffffff", "oscuro", 0,
      )).toBeNull();
    });
  });

  describe("acentosDe", () => {
    it("por peso, únicos y máximo tres; sin acentos válidos, vacía", () => {
      expect(acentosDe(PALETA)).toEqual(["#0a0e27", "#10b981", "#ffbf00"]);
      expect(acentosDe([{ color: "#888888", peso: 0 }])).toEqual([]);
    });
  });

  describe("pedidoParaIA", () => {
    const contexto = { ...entrada(), destino: "pagina" as const,
      gustos: { publicos: ["geometría sagrada"], privados: ["violeta fosforescente"] } };
    it("arma un pedido al Director con paleta, ADN y guardas", () => {
      const pedido = pedidoParaIA(contexto);
      expect(pedido.destinatario).toBe("director-diseno");
      expect(pedido.texto).toContain("sobria, armónica, atrevida"); expect(pedido.texto).toContain("Modo oscuro");
      expect(pedido.texto).toContain("#0a0e27 60%"); expect(pedido.texto).toContain("geometría sagrada");
      expect(pedido.texto).toContain("AA"); expect(pedido.texto).toContain("44 px");
    });
    it("lo privado solo si corre en una neurona de la persona", () => {
      const enNube = pedidoParaIA(contexto);
      expect(enNube.texto).not.toContain("violeta fosforescente"); expect(enNube.privado).toBe(false);
      const enNeurona = pedidoParaIA({ ...contexto, enNeuronaPersonal: true });
      expect(enNeurona.texto).toContain("violeta fosforescente"); expect(enNeurona.privado).toBe(true);
    });
  });
});
