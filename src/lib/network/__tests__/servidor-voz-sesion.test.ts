/**
 * servidor-voz-sesion (Ola 1015V · S) — elección autogestionada del servidor de
 * voz de la sesión. Todo inyectado (ahora, fichas, actual): sin red, sin
 * micrófono, sin procesos.
 */
import { describe, it, expect } from "vitest";
import {
  elegirServidorVoz,
  estaViva,
  esDeConfianza,
  cabeRam,
  LATIDO_VIVO_MS,
  UMBRAL_HISTERESIS,
  RAM_OIDO_DEFECTO_MB,
  type FichaServidorVoz,
} from "@/lib/network/servidor-voz-sesion";

const AHORA = 1_000_000;

function ficha(extra: Partial<FichaServidorVoz> & { id: string; dueno: string }): FichaServidorVoz {
  return { ultimoLatido: AHORA - 1000, ramLibreMB: 8000, ...extra };
}

const base = {
  sesion: { miembros: ["grupo-alex"], tipo: "llamada" as const },
  ahora: AHORA,
};

const mac = ficha({
  id: "mac", dueno: "grupo-alex", esPropia: true, ramLibreMB: 3000,
  oido: { latenciaMs: 900 }, habla: { latenciaMs: 300 },
});
const a1 = ficha({
  id: "a1", dueno: "grupo-alex", esPropia: true, veinticuatroSiete: true, ramLibreMB: 4000,
  oido: { latenciaMs: 1200 }, habla: { latenciaMs: 500 },
});

describe("reglas atómicas", () => {
  it("estaViva: viva dentro de 2 minutos, muerta después", () => {
    expect(estaViva({ ...mac, ultimoLatido: AHORA - LATIDO_VIVO_MS + 1 }, AHORA)).toBe(true);
    expect(estaViva({ ...mac, ultimoLatido: AHORA - LATIDO_VIVO_MS - 1 }, AHORA)).toBe(false);
  });

  it("esDeConfianza: propias o de los miembros de la sesión, no ajenas", () => {
    expect(esDeConfianza(mac, base.sesion)).toBe(true);
    expect(esDeConfianza(ficha({ id: "otra", dueno: "vecina" }), base.sesion)).toBe(false);
    expect(esDeConfianza(ficha({ id: "de-miembro", dueno: "grupo-alex" }), base.sesion)).toBe(true);
  });

  it("cabeRam: exigen su necesidad declarada o el defecto del contexto", () => {
    const pobre = { ...mac, ramLibreMB: RAM_OIDO_DEFECTO_MB - 1 };
    expect(cabeRam(pobre.oido as { latenciaMs: number }, pobre)).toBe(false);
    expect(cabeRam(pobre.habla as { latenciaMs: number }, pobre)).toBe(true);
    expect(cabeRam({ latenciaMs: 5, ramMB: 600 }, { ...pobre, ramLibreMB: 600 })).toBe(true);
    expect(cabeRam({ latenciaMs: 5, ramMB: 601 }, { ...pobre, ramLibreMB: 600 })).toBe(false);
  });

  it("UMBRAL_HISTERESIS es exactamente un 30 % de mejora", () => {
    expect(UMBRAL_HISTERESIS).toBe(0.7);
  });
});

describe("elección", () => {
  it("elige la de menor latencia medida por sentido", () => {
    const r = elegirServidorVoz({ ...base, fichas: [mac, a1] });
    expect(r.oido).toEqual({ id: "mac", latenciaMs: 900 });
    expect(r.habla).toEqual({ id: "mac", latenciaMs: 300 });
    expect(r.motivo).toContain("elegida");
  });

  it("puede partir oído y habla entre neuronas distintas", () => {
    const a1RapidoDeOido = { ...a1, oido: { latenciaMs: 200 } };
    const r = elegirServidorVoz({ ...base, fichas: [mac, a1RapidoDeOido] });
    expect(r.oido?.id).toBe("a1");
    expect(r.habla?.id).toBe("mac");
  });

  it("el A1 (24/7) entra como candidata normal cuando está en las fichas", () => {
    const r = elegirServidorVoz({ ...base, fichas: [a1] });
    expect(r.oido?.id).toBe("a1");
    expect(r.habla?.id).toBe("a1");
  });

  it("sin RAM libre suficiente no sirve", () => {
    const pobre = ficha({
      id: "pobre", dueno: "grupo-alex", ramLibreMB: RAM_OIDO_DEFECTO_MB - 1,
      oido: { latenciaMs: 100 },
    });
    const r = elegirServidorVoz({ ...base, fichas: [pobre, mac] });
    expect(r.oido?.id).toBe("mac");
    const r2 = elegirServidorVoz({ ...base, fichas: [pobre] });
    expect(r2.oido).toBeUndefined();
  });
});

describe("histéresis", () => {
  it("no salta por una mejora menor del 30 %", () => {
    const mejorLeve = ficha({
      id: "leve", dueno: "grupo-alex", oido: { latenciaMs: 700 }, habla: { latenciaMs: 250 },
    });
    const r = elegirServidorVoz({ ...base, fichas: [mac, mejorLeve], actual: "mac" });
    expect(r.oido).toEqual({ id: "mac", latenciaMs: 900 });
    expect(r.motivo).toContain("histéresis");
  });

  it("sí salta cuando la nueva es más de un 30 % mejor", () => {
    const muchoMejor = ficha({
      id: "mucha", dueno: "grupo-alex", oido: { latenciaMs: 100 }, habla: { latenciaMs: 100 },
    });
    const r = elegirServidorVoz({ ...base, fichas: [mac, muchoMejor], actual: "mac" });
    expect(r.oido?.id).toBe("mucha");
    expect(r.motivo).toContain("mejora");
  });

  it("con latencia igual se mantiene la actual", () => {
    const gemela = { ...mac, id: "gemela" };
    const r = elegirServidorVoz({ ...base, fichas: [mac, gemela], actual: "mac" });
    expect(r.oido?.id).toBe("mac");
    expect(r.habla?.id).toBe("mac");
  });
});

describe("relevo y privacidad", () => {
  it("si la actual dejó de latir, la siguiente toma el relevo sola", () => {
    const macMuerta = { ...mac, ultimoLatido: AHORA - LATIDO_VIVO_MS - 1 };
    const r = elegirServidorVoz({ ...base, fichas: [macMuerta, a1], actual: "mac" });
    expect(r.oido?.id).toBe("a1");
    expect(r.habla?.id).toBe("a1");
    expect(r.motivo).toContain("relevo");
  });

  it("si la actual perdió el sentido o la confianza, también hay relevo", () => {
    const macSinVoz: FichaServidorVoz = { ...mac, habla: undefined };
    expect(elegirServidorVoz({ ...base, fichas: [macSinVoz, a1], actual: "mac" }).habla?.id).toBe("a1");
    const sesionAjena = { miembros: ["otro-grupo"] as string[] };
    const macPrestada = { ...mac, esPropia: false };
    const r2 = elegirServidorVoz({ sesion: sesionAjena, fichas: [macPrestada, a1], ahora: AHORA, actual: "mac" });
    expect(r2.oido?.id).toBe("a1");
    expect(r2.motivo).toContain("relevo");
  });

  it("una neurona ajena (ni propia ni de la sesión) nunca se elige", () => {
    const ajena = ficha({
      id: "ajena", dueno: "desconocida", oido: { latenciaMs: 1 }, habla: { latenciaMs: 1 },
    });
    const r = elegirServidorVoz({ ...base, fichas: [ajena] });
    expect(r.oido).toBeUndefined();
    expect(r.habla).toBeUndefined();
    expect(r.motivo).toContain("Ninguna");
  });

  it("entrada rota no lanza: responde con motivo", () => {
    const r = elegirServidorVoz({ ...base, fichas: [], actual: undefined });
    expect(r.motivo).toContain("Ninguna");
    const fichaRota: FichaServidorVoz = { ...mac };
    Object.defineProperty(fichaRota, "oido", { get() { throw new Error("ficha rota"); } });
    const r2 = elegirServidorVoz({ ...base, fichas: [fichaRota] });
    expect(r2.motivo).toBe("Error al elegir el servidor de voz de la sesión.");
  });
});


