/** Pruebas de rediseno-desde-fondo (Ola 1018F · tarea L): funciones puras, sin red ni disco ni DOM. */
import { describe, it, expect } from "vitest";
import type { ThemeTokens } from "../theme-engine";
import { propuestasDesdeFondo, pedidoParaIA, escalarRadius, ratioContraste, compositar, rgbaDe } from "../rediseno-desde-fondo";

const TEMA_CLARO: ThemeTokens = {
  vars: { background: "#ffffff", foreground: "#0a0f1d", primary: "#007fff", radius: "1rem" },
};
const PALETA = [{ color: "#10B981", peso: 0.7 }, { color: "#FFBF00", peso: 0.3 }];
type Entrada = Parameters<typeof propuestasDesdeFondo>[0];
const entrada = (sobre: Partial<Entrada> = {}): Entrada => ({
  paleta: PALETA,
  temaActual: TEMA_CLARO,
  modo: "claro",
  ...sobre,
});

describe("rediseno-desde-fondo · propuestasDesdeFondo", () => {
  it("devuelve exactamente las tres propuestas", () => {
    const p = propuestasDesdeFondo(entrada());
    expect(Object.keys(p).sort()).toEqual(["atrevida", "armonica", "sobria"]);
    for (const clave of ["sobria", "armonica", "atrevida"] as const) {
      expect(p[clave].clave).toBe(clave);
      for (const texto of [p[clave].nombre, p[clave].motivo]) expect(texto.length).toBeGreaterThan(0);
    }
  });

  it("usa acentos de la paleta y superficies translúcidas que pasan AA", () => {
    const p = propuestasDesdeFondo(entrada());
    for (const clave of ["sobria", "armonica", "atrevida"] as const) {
      const ci = p[clave];
      for (const c of ci.contrastes) {
        expect(c.ratio).toBeGreaterThanOrEqual(4.5);
        expect(c.pasa).toBe(true);
      }
      expect(ci.tokens.vars["accent"]).toContain("rgba(16, 185, 129, ");
    }
  });

  it("cada propuesta lleva la escala φ y su radio escalado", () => {
    const p = propuestasDesdeFondo(entrada());
    for (const clave of ["sobria", "armonica", "atrevida"] as const) {
      expect(p[clave].tokens.vars["ss-phi"]).toBe("1.618");
      expect(p[clave].tokens.vars["ss-motivo"]).toBe(p[clave].motivo);
    }
    const numeroDe = (c: typeof p.sobria): number => parseFloat(c.tokens.vars["radius"] ?? "0");
    expect(p.sobria.tokens.vars["radius"]).toBe("1rem");
    expect(p.armonica.tokens.vars["radius"]).toBe("1.618rem");
    expect(p.atrevida.tokens.vars["radius"]).toBe("2.618rem");
    expect(numeroDe(p.atrevida) / numeroDe(p.armonica)).toBeCloseTo(1.618, 2);
  });

  it("en modo oscuro toma la tinta clara del tema", () => {
    const TEMA_OSCURO: ThemeTokens = { vars: { background: "#0a0f1d", foreground: "#f8f9fa", radius: "1rem" } };
    const p = propuestasDesdeFondo(entrada({ modo: "oscuro", temaActual: TEMA_OSCURO }));
    expect(p.armonica.contrastes[0].texto).toBe("#f8f9fa");
  });

  it("si la tinta del tema no sirve, elige respaldo (negro/blanco) y pasa AA", () => {
    const inservible: ThemeTokens = { vars: { background: "#ffffff", foreground: "#b0b0b0", radius: "1rem" } };
    const p = propuestasDesdeFondo(entrada({ temaActual: inservible }));
    const registro = p.sobria.contrastes[0];
    expect(registro.pasa).toBe(true);
    expect(registro.ratio).toBeGreaterThanOrEqual(4.5);
    expect(registro.texto).toBe("#000000");
  });

  it("es determinista: dos llamadas iguales, el mismo resultado", () => {
    expect(JSON.stringify(propuestasDesdeFondo(entrada()))).toBe(JSON.stringify(propuestasDesdeFondo(entrada())));
  });

  it("sin paleta usa los tokens del tema actual y no se rompe", () => {
    const p = propuestasDesdeFondo(entrada({ paleta: [] }));
    expect(p.sobria.tokens.vars["primary"]).toContain("0, 127, 255");
  });
});

describe("rediseno-desde-fondo · helpers de color", () => {
  it("rgbaDe normaliza #rgb y compositar funciona", () => {
    expect(rgbaDe("#0f0", 0.5)).toBe("rgba(0, 255, 0, 0.5)");
    expect(compositar("#ff0000", 0.5, "#0000ff")).toBe("#7f007f");
    expect(ratioContraste("#000000", "#ffffff")).toBe(21);
    expect(escalarRadius("1.5rem", 2)).toBe("3rem");
  });
});

describe("rediseno-desde-fondo · pedidoParaIA", () => {
  const ADN = { identidad: "starseed-os", gustos: ["cristal líquido", "esquinas 24 px"], prohibiciones: ["nada de neón suelto"] };

  it("sin neurona propia no incluye memoria privada del usuario", () => {
    const pedido = pedidoParaIA(entrada({ adn: ADN }), { peticion: "más cálido" });
    expect(pedido.incluyeMemoriaPrivada).toBe(false);
    expect(pedido.privacidad).toBe("compartido");
    expect(pedido.prompt).toContain("NO corre en una neurona");
    expect(pedido.prompt).not.toContain("cristal líquido");
  });

  it("en neurona propia lleva los gustos y marca la privacidad local", () => {
    const pedido = pedidoParaIA(entrada({ adn: ADN }), { enNeuronaPropia: true });
    expect(pedido.incluyeMemoriaPrivada).toBe(true);
    expect(pedido.privacidad).toBe("local");
    expect(pedido.prompt).toContain("cristal líquido");
  });

  it("arma el prompt con alcance, paleta, modo y libreto completo", () => {
    const pedido = pedidoParaIA(entrada({ adn: ADN }), { alcance: "página", peticion: "botones redondos" });
    expect(pedido.destino).toBe("director-diseno");
    for (const fragmento of ["página", "botones redondos", "4,5", "theme-engine", "vesica piscis", "nada de neón suelto"]) {
      expect(pedido.prompt).toContain(fragmento);
    }
    expect(pedido.respuestaEsperada).toContain("ThemeTokens");
  });
});
