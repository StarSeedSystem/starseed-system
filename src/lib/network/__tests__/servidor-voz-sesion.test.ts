/**
 * VZF1015S — elección del servidor de voz de la sesión (oído y habla).
 * Contrato: architecture/voz-fusionada-astraura.md §5. Sin red, sin micrófono y
 * sin procesos: fichas, sesión y reloj inyectados.
 */
import { describe, expect, it } from "vitest";
import {
  elegirServidorVoz, HISTERESIS_FACTOR, LATIDO_MAX_MS, RAM_MIN_SERVIDOR_VOZ_MB,
  type FichaServVoz,
} from "../servidor-voz-sesion";

const AHORA = 1_800_000_000_000;

const voz = (oido: number, habla: number) => ({
  oido: [{ motor: "phonon-2", idiomas: ["es", "en"], tiempoReal: oido, flujo: true }],
  habla: [{ motor: "supertonic", primerSonidoMs: habla }],
});

const ficha = (nodoId: string, opciones: Partial<FichaServVoz> = {}): FichaServVoz => ({
  nodoId,
  latido: AHORA - 10_000,
  ramLibreMb: 2048,
  voz: voz(7, 400),
  ...opciones,
});

const sesion = { tipo: "llamada" as const, miembros: ["a1", "mac", "tablet", "otra"] };

describe("elección básica: la de menor latencia medida, viva y con RAM", () => {
  it("elige abajo la menor latencia oído y arriba la menor primerSonidoMs", () => {
    const r = elegirServidorVoz({
      sesion, ahora: AHORA,
      fichas: [ficha("a1", { voz: voz(11, 400), a247: true }), ficha("mac", { voz: voz(7, 300) }), ficha("tablet", { voz: voz(9, 900) })],
    });
    expect(r.oido).toBe("mac");
    expect(r.habla).toBe("mac");
    expect(r.motivo).toContain("sesión llamada");
  });

  it("el oído y la voz pueden caer en neuronas distintas", () => {
    const r = elegirServidorVoz({
      sesion, ahora: AHORA,
      fichas: [ficha("tablet", { voz: { oido: [{ motor: "phonon-2", idiomas: [], tiempoReal: 5, flujo: false }], habla: [] } }), ficha("a1")],
    });
    expect(r.oido).toBe("tablet");
    expect(r.habla).toBe("a1");
  });

  it("el A1 (24/7) entra como una ficha más cuando está en las fichas", () => {
    const r = elegirServidorVoz({ sesion, ahora: AHORA, fichas: [ficha("a1", { a247: true })] });
    expect(r.oido).toBe("a1");
    expect(r.habla).toBe("a1");
  });

  it("excluye muertas (latido ≥ 2 min), sin RAM, del futuro y sin medidas", () => {
    const r = elegirServidorVoz({
      sesion, ahora: AHORA,
      fichas: [
        ficha("muerta", { latido: AHORA - LATIDO_MAX_MS }),
        ficha("poor", { ramLibreMb: RAM_MIN_SERVIDOR_VOZ_MB - 1 }),
        ficha("futura", { latido: AHORA + 1 }),
        ficha("muda", { voz: { oido: [], habla: [] } }),
        ficha("a1"),
      ],
    });
    expect(r.oido).toBe("a1");
    expect(r.habla).toBe("a1");
  });
});

describe("histéresis y relevo (por oído y por habla por separado)", () => {
  it("solo cambia si la nueva es un 30 % mejor: con un 10 % se queda la actual", () => {
    const fichas = [ficha("mac", { voz: voz(7, 400) }), ficha("a1", { voz: voz(6, 400) })];
    const igual = elegirServidorVoz({ sesion, fichas, ahora: AHORA, actual: { oido: "mac", habla: "mac" } });
    expect(igual.oido).toBe("mac");
    expect(igual.motivo).not.toContain("30 %");
    const mejor = elegirServidorVoz({
      sesion, ahora: AHORA, actual: { oido: "mac", habla: "mac" },
      fichas: [ficha("mac", { voz: voz(10, 400) }), ficha("a1", { voz: voz(6.8, 200) })], // 6,8 < 10·0,7 y 200 < 400·0,7
    });
    expect(mejor.oido).toBe("a1");
    expect(mejor.habla).toBe("a1");
    expect(mejor.motivo).toContain("30 %");
  });

  it("relevo: si la actual dejó de latir, la siguiente toma el turno sin pedir el 30 %", () => {
    const fichas = [ficha("mac", { latido: AHORA - LATIDO_MAX_MS - 1, voz: voz(7, 400) }), ficha("a1", { voz: voz(9, 500), a247: true })];
    const r = elegirServidorVoz({ sesion, fichas, ahora: AHORA, actual: { oido: "mac", habla: "mac" } });
    expect(r.oido).toBe("a1");
    expect(r.habla).toBe("a1");
    expect(r.motivo).toContain("relevo de mac");
  });

  it("la actual elegible aunque peor se conserva; la que perdió la RAM sí se releva", () => {
    const ancho = { sesion, ahora: AHORA, fichas: [ficha("mac", { voz: voz(9, 450) }), ficha("a1", { voz: voz(8, 440) })] };
    expect(elegirServidorVoz({ ...ancho, actual: { oido: "mac", habla: "a1" } }).oido).toBe("mac");
    const sinRam = elegirServidorVoz({
      sesion, ahora: AHORA,
      fichas: [ficha("mac", { ramLibreMb: 100, voz: voz(7, 400) }), ficha("a1", { voz: voz(9, 900), a247: true })],
      actual: { oido: "mac", habla: "a1" },
    });
    expect(sinRam.oido).toBe("a1");
    expect(sinRam.motivo).toContain("relevo de mac");
  });

  it("histéresis: staying dentro del 30 % no aviva el motivo con cambios", () => {
    const r = elegirServidorVoz({
      sesion, ahora: AHORA, actual: { oido: "a1", habla: "a1" },
      fichas: [ficha("a1", { voz: voz(10, 500) }), ficha("tablet", { voz: voz(8, 450) })], // 10 > 8/0,7 → no cambia
    });
    expect(r.oido).toBe("a1");
    expect(r.habla).toBe("a1");
    expect(r.motivo).not.toContain("relevo");
  });
});

describe("privacidad y casos sin salida", () => {
  it("una ficha fuera de la sesión nunca se elige, aunque sea la más rápida y viva", () => {
    const r = elegirServidorVoz({
      sesion: { tipo: "grupo", miembros: ["mac"] },
      ahora: AHORA,
      fichas: [ficha("ajena", { voz: voz(1, 50) }), ficha("mac", { voz: voz(9, 900) })],
    });
    expect(r.oido).toBe("mac");
    expect(r.habla).toBe("mac");
  });

  it("sesión sola o grupo sin confianzas: cada una sirve con su motor propio", () => {
    const sinMiembros = elegirServidorVoz({ sesion: { tipo: "solo", miembros: [] }, fichas: [ficha("ajena")], ahora: AHORA });
    expect(sinMiembros.oido).toBeUndefined();
    expect(sinMiembros.habla).toBeUndefined();
    expect(sinMiembros.motivo).toContain("confianza");
    const sinFichas = elegirServidorVoz({ sesion, fichas: [], ahora: AHORA });
    expect(sinFichas.motivo).toContain("sin fichas");
    const ningunaViva = elegirServidorVoz({ sesion, fichas: [ficha("mac", { latido: AHORA - LATIDO_MAX_MS - 1 })], ahora: AHORA });
    expect(ningunaViva.oido).toBeUndefined();
    expect(ningunaViva.motivo).toContain("ninguna neurona");
  });

  it("nunca lanza con basura y le desempata 24/7 el mismo valor de latencia", () => {
    expect(elegirServidorVoz(null as unknown as Parameters<typeof elegirServidorVoz>[0]).motivo.length).toBeGreaterThan(0);
    const empate = elegirServidorVoz({
      sesion, ahora: AHORA,
      fichas: [ficha("tablet", { voz: voz(7, 400) }), ficha("a1", { voz: voz(7, 400), a247: true })],
    });
    expect(empate.oido).toBe("a1");
  });
});
