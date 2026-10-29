// Prueba de src/lib/variaciones/claves-ajustes.ts — módulo puro, sin red ni
// disco. Casi todo usa fuentes inyectadas; el último bloque, los índices vivos.
import { describe, it, expect } from "vitest";

import {
  clavesDeAjustes,
  detallesDeAjustes,
  claveDeAjuste,
  claveDeAjustePorAncla,
  indiceDeAjustes,
  normalizarIdAjuste,
  type EntradaAjuste,
} from "../claves-ajustes";
import { leerClave } from "../clave-elemento";

const BUSQUEDA: EntradaAjuste[] = [
  { id: "tema-apariencia", tab: "appearance", category: "Apariencia", keywords: ["tema", "cristal"] },
  { id: "aurora-voz", tab: "ai", category: "Aurora e IA", keywords: ["voz"], anchor: "aurora-voz" },
];
const AJUSTES: EntradaAjuste[] = [
  { id: "fontMain", tab: "typography", keywords: ["fuente"] },
  { id: "tema-apariencia", tab: "appearance", keywords: ["repetido"] },
];
const FUENTES = { busqueda: BUSQUEDA, ajustes: AJUSTES };

describe("normalizarIdAjuste", () => {
  it("pasa camelCase a kebab-case y quita acentos, mayúsculas y separadores de sobra", () => {
    expect(normalizarIdAjuste("fontMain")).toBe("font-main");
    expect(normalizarIdAjuste("Tipografía")).toBe("tipografia");
    expect(normalizarIdAjuste("  Displacement Scale  ")).toBe("displacement-scale");
    expect(normalizarIdAjuste("__tema --  oscuro__")).toBe("tema-oscuro");
  });

  it("devuelve cadena vacía si no queda nada útil", () => {
    expect(normalizarIdAjuste("")).toBe("");
    expect(normalizarIdAjuste("   ")).toBe("");
    expect(normalizarIdAjuste("···")).toBe("");
  });
});

describe("claveDeAjuste", () => {
  it("compone una clave canónica con el id saneado", () => {
    expect(claveDeAjuste("tema-apariencia")).toBe("ajuste:tema-apariencia");
    expect(claveDeAjuste("fontMain")).toBe("ajuste:font-main");
    expect(leerClave(claveDeAjuste("Tipografía Principal") as string)).toBe("ajuste:tipografia-principal");
  });

  it("devuelve null cuando no hay id aprovechable", () => {
    expect(claveDeAjuste("")).toBeNull();
    expect(claveDeAjuste("   ")).toBeNull();
    expect(claveDeAjuste("¡!")).toBeNull();
  });
});

describe("clavesDeAjustes", () => {
  it("une las dos fuentes en orden y descarta el id repetido", () => {
    expect(clavesDeAjustes(FUENTES)).toEqual([
      "ajuste:tema-apariencia",
      "ajuste:aurora-voz",
      "ajuste:font-main",
    ]);
  });

  it("conserva pestaña, grupo en español, ancla, palabras y origen", () => {
    const [tema, voz, fuente] = detallesDeAjustes(FUENTES);
    expect(tema.pestana).toBe("appearance");
    expect(tema.grupo).toBe("Apariencia");
    expect(tema.palabras).toEqual(["tema", "cristal"]);
    expect(tema.origen).toBe("busqueda");
    expect(voz.ancla).toBe("aurora-voz");
    expect(fuente.grupo).toBe("Tipografía");
    expect(fuente.origen).toBe("ajustes");
    expect(fuente.ancla).toBeUndefined();
  });

  it("no inventa claves sin id válido y respeta una fuente vacía", () => {
    expect(clavesDeAjustes({ busqueda: [{ id: "   ", tab: "appearance" }], ajustes: [{ id: "", tab: "colors" }] })).toEqual([]);
    expect(clavesDeAjustes({})).toEqual([]);
  });
});

describe("indiceDeAjustes", () => {
  it("indexa por id canónico (camelCase incluido)", () => {
    const indice = indiceDeAjustes(FUENTES);
    expect(indice.size).toBe(3);
    expect(indice.get("font-main")?.clave).toBe("ajuste:font-main");
    expect(indice.get("tema-apariencia")?.grupo).toBe("Apariencia");
    expect(indice.get("fontMain")).toBeUndefined();
  });
});

describe("claveDeAjustePorAncla", () => {
  it("resuelve el ancla real y devuelve null para una vacía o desconocida", () => {
    expect(claveDeAjustePorAncla("aurora-voz", FUENTES)).toBe("ajuste:aurora-voz");
    expect(claveDeAjustePorAncla("", FUENTES)).toBeNull();
    expect(claveDeAjustePorAncla("no-existe", FUENTES)).toBeNull();
  });
});

describe("catálogos reales de Ajustes", () => {
  it("genera claves válidas, únicas y con prefijo ajuste desde los dos índices", () => {
    const valores = clavesDeAjustes();
    expect(valores).toContain("ajuste:tema-apariencia");
    expect(valores).toContain("ajuste:font-main");
    expect(new Set(valores).size).toBe(valores.length);
    for (const clave of valores) {
      expect(clave.startsWith("ajuste:")).toBe(true);
      expect(leerClave(clave)).toBe(clave);
    }
  });
});
