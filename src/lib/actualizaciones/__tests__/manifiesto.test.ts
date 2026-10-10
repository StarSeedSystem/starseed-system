import { describe, expect, it } from "vitest";
import {
  CAPAS_ORDEN, capaPermitidaParaNivel, capasEnOrden, compararVersiones, validarManifiesto, type ManifiestoVersion,
} from "../manifiesto";

const SHA = "a".repeat(64);

function m(o: Partial<ManifiestoVersion> = {}): ManifiestoVersion {
  return {
    sistema: "starseed-os", nivel: "meta", duenoId: "starseed-os", version: "2026.10.10", rama: "estable",
    capas: ["interfaz", "sw"], requiere: { reinicio: [], recarga: true, reinstalar: false },
    tamanoBytes: 1200, sha256: SHA, notas: "", publicadoEn: "2026-10-10T10:00:00.000Z", ...o,
  };
}

describe("capaPermitidaParaNivel", () => {
  it("MetaGenesis publica todas las capas", () => {
    expect(CAPAS_ORDEN.every((c) => capaPermitidaParaNivel("meta", c))).toBe(true);
  });
  it("PoliGenesis y Genesis solo datos e interfaz: nunca el núcleo", () => {
    for (const nivel of ["poli", "genesis"] as const) {
      expect(CAPAS_ORDEN.filter((c) => capaPermitidaParaNivel(nivel, c))).toEqual(["datos", "interfaz"]);
    }
  });
});

describe("compararVersiones", () => {
  it("fechas AAAA.MM.DD por número, no por texto", () => {
    expect(compararVersiones("2026.10.10", "2026.9.30")).toBe(1);
    expect(compararVersiones("2026.10.09", "2026.10.10")).toBe(-1);
    expect(compararVersiones("2026.10.10", "2026.10.10")).toBe(0);
  });
  it("sufijo .n del mismo día y semver con v", () => {
    expect(compararVersiones("2026.10.10.2", "2026.10.10")).toBe(1);
    expect(compararVersiones("v0.3.1", "0.3.0")).toBe(1);
  });
  it("basura cuenta como 0 y no lanza", () => {
    expect(compararVersiones("x", "0")).toBe(0);
    expect(compararVersiones(undefined as unknown as string, "1")).toBe(-1);
  });
});

describe("validarManifiesto", () => {
  it("acepta un manifiesto bien formado de cada nivel", () => {
    expect(validarManifiesto(m()).ok).toBe(true);
    expect(validarManifiesto(m({ nivel: "poli", duenoId: "grupo:x", capas: ["datos"], requiere: { reinicio: [], recarga: false, reinstalar: false } })).ok).toBe(true);
    expect(validarManifiesto(m({ nivel: "genesis", duenoId: "u1", capas: ["datos", "interfaz"] })).ok).toBe(true);
  });

  it("rechaza que PoliGenesis toque el service worker o la app nativa", () => {
    const r = validarManifiesto(m({ nivel: "poli", capas: ["sw", "nativa"], requiere: { reinicio: [], recarga: false, reinstalar: true } }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores.some((e) => e.includes("Sin conexión"))).toBe(true);
      expect(r.errores.some((e) => e.includes("App nativa"))).toBe(true);
    }
  });

  it("devuelve TODOS los errores, no solo el primero", () => {
    const r = validarManifiesto({ sistema: "", nivel: "x", version: "hola", rama: "otra", capas: [], requiere: null, tamanoBytes: -1, sha256: "ABC", notas: 3, publicadoEn: "ayer" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.length).toBeGreaterThanOrEqual(9);
  });

  it("capas repetidas o desconocidas", () => {
    const r = validarManifiesto(m({ capas: ["datos", "datos", "magia" as never] }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores.join(" ")).toContain("repetidas");
      expect(r.errores.join(" ")).toContain("desconocida");
    }
  });

  it("reinstalar solo con la capa nativa; reiniciar servicios solo con la capa servicios", () => {
    const a = validarManifiesto(m({ requiere: { reinicio: [], recarga: true, reinstalar: true } }));
    expect(a.ok).toBe(false);
    const b = validarManifiesto(m({ requiere: { reinicio: ["astraura"], recarga: true, reinstalar: false } }));
    expect(b.ok).toBe(false);
    const c = validarManifiesto(m({ capas: ["servicios"], requiere: { reinicio: ["astraura"], recarga: false, reinstalar: false } }));
    expect(c.ok).toBe(true);
  });

  it("huella, fecha y versión anterior deben ser válidas", () => {
    expect(validarManifiesto(m({ sha256: SHA.toUpperCase() })).ok).toBe(false);
    expect(validarManifiesto(m({ publicadoEn: "no es fecha" })).ok).toBe(false);
    expect(validarManifiesto(m({ anterior: "???" })).ok).toBe(false);
    expect(validarManifiesto(m({ anterior: "2026.10.09" })).ok).toBe(true);
  });

  it("no lanza con entradas absurdas", () => {
    for (const x of [null, undefined, 3, "x", [], () => 1]) expect(validarManifiesto(x).ok).toBe(false);
  });
});

it("capasEnOrden ordena de lo más barato a lo más pesado", () => {
  expect(capasEnOrden(["nativa", "datos", "sw"])).toEqual(["datos", "sw", "nativa"]);
});
