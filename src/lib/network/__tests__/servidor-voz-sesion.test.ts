/**
 * VZF1015S — elección del servidor de voz de la sesión (contrato §5).
 * Módulo puro: todo inyectado (reloj y fichas); sin red, sin micrófono y sin procesos.
 */
import { describe, it, expect } from "vitest";
import {
  elegirServidorVoz, LATIDO_MAX_MS, RAM_MINIMA_MB, MEJORA_MINIMA,
  type FichaServidorVoz, type PeticionServidorVoz,
} from "../servidor-voz-sesion";

const HORA = 1_900_000_000_000;
const oido = (t: number) => ({ oido: [{ motor: "parakeet-v3", idiomas: ["es"], tiempoReal: t, flujo: true }], habla: [] });
const habla = (m: number) => ({ oido: [], habla: [{ motor: "supertonic", primerSonidoMs: m }] });
const ficha = (n: string, extra: Partial<FichaServidorVoz> = {}): FichaServidorVoz => ({ neurona: n, latido: HORA - 1000, mia: true, ...extra });
const sesion = { miembros: ["n-yo", "n-par"], tipo: "llamada" as const };
const pedir = (p: Partial<PeticionServidorVoz>): PeticionServidorVoz =>
  ({ sesion, fichas: [], ahora: HORA, ...p } as PeticionServidorVoz);

describe("elección por la medida", () => {
  it("gana el menor tiempoReal (oído) y el menor primerSonidoMs (habla); sin medida, no sirve", () => {
    const r = elegirServidorVoz(pedir({
      fichas: [ficha("n-1", { voz: oido(10.9) }), ficha("n-2", { voz: oido(6.4) }),
        ficha("n-3", { voz: habla(900) }), ficha("n-4", { voz: habla(420) }), ficha("n-5")],
    }));
    expect([r.oido, r.habla]).toEqual(["n-2", "n-4"]);
    expect(r.motivo).toContain("n-2");
  });

  it("la latencia de red rompe los empates pero por sí sola no gana; el A1 sirve sin ser tuyo", () => {
    const empate = elegirServidorVoz(pedir({
      fichas: [ficha("n-1", { a1: true, latenciaMs: 200, voz: oido(11) }), ficha("n-2", { latenciaMs: 45, voz: oido(11) })],
    }));
    expect(empate.oido).toBe("n-2");
    const red = elegirServidorVoz(pedir({
      fichas: [ficha("n-1", { latenciaMs: 5, voz: oido(11.9) }), ficha("n-2", { latenciaMs: 400, voz: oido(6.4) })],
    }));
    expect(red.oido).toBe("n-2");
    const conA1 = elegirServidorVoz(pedir({ fichas: [ficha("n-1", { a1: true, mia: false, voz: oido(11) })] }));
    expect(conA1.oido).toBe("n-1");
  });
});

describe("histéresis", () => {
  const dos = (a: number, b: number): FichaServidorVoz[] => [ficha("n-1", { voz: oido(a) }), ficha("n-2", { voz: oido(b) })];
  it("una mejora menor del 30 % no cambia el servidor; una mayor sí, y lo dice", () => {
    const no = elegirServidorVoz(pedir({
      fichas: dos(10, 10 * (1 - MEJORA_MINIMA + 0.01)), actual: { oido: "n-1" },
    }));
    expect(no.oido).toBe("n-1");
    expect(no.motivo).toContain("histéresis");
    const si = elegirServidorVoz(pedir({ fichas: dos(10, 6), actual: { oido: "n-1" } }));
    expect(si.oido).toBe("n-2");
    expect(si.motivo).toContain("30 %");
  });

  it("la histéresis se aplica por papel: el habla cambia aunque el oído se mantenga", () => {
    const voz = (o: number, v: number) => ({ oido: [{ motor: "a", idiomas: [], tiempoReal: o, flujo: true }], habla: [{ motor: "v", primerSonidoMs: v }] });
    const r = elegirServidorVoz(pedir({
      fichas: [ficha("n-1", { voz: voz(5, 900) }), ficha("n-2", { voz: voz(4.8, 380) })],
      actual: { oido: "n-1", habla: "n-1" },
    }));
    expect([r.oido, r.habla]).toEqual(["n-1", "n-2"]);
  });
});

describe("relevo y vida", () => {
  it("si la actual dejó de latir (≥ 2 min), la siguiente toma el relevo sola", () => {
    const r = elegirServidorVoz(pedir({
      fichas: [ficha("n-1", { latido: HORA - LATIDO_MAX_MS - 1, voz: habla(300) }), ficha("n-2", { voz: habla(800) })],
      actual: { habla: "n-1" },
    }));
    expect(r.habla).toBe("n-2");
    expect(r.motivo).toContain("relevo");
  });

  it("sin neuronas de confianza vivas no se sirve la sesión, aunque haya fichas", () => {
    const r = elegirServidorVoz(pedir({ fichas: [ficha("n-1", { latido: HORA - LATIDO_MAX_MS - 1, voz: habla(200) })] }));
    expect(r.motivo).toContain("sin neuronas");
    expect([r.oido, r.habla]).toEqual([undefined, undefined]);
  });
});

describe("privacidad y recursos", () => {
  it("una ficha ajena (ni mía ni de la sesión) nunca gana aunque sea la más rápida", () => {
    const r = elegirServidorVoz(pedir({
      fichas: [ficha("intrusa", { mia: false, voz: habla(50) }), ficha("n-par", { mia: false, voz: habla(600) })],
    }));
    expect([r.habla, r.oido]).toEqual(["n-par", undefined]);
  });

  it("con menos RAM que el mínimo se descarta, también la actual; sin dato no se descarta", () => {
    const r = elegirServidorVoz(pedir({
      fichas: [ficha("n-1", { ramLibreMb: RAM_MINIMA_MB - 1, voz: habla(100) }), ficha("n-2", { voz: habla(700) })],
    }));
    expect(r.habla).toBe("n-2");
    const conActual = elegirServidorVoz(pedir({
      fichas: [ficha("n-1", { ramLibreMb: RAM_MINIMA_MB - 1, voz: habla(100) }), ficha("n-2", { voz: habla(900) })],
      actual: { habla: "n-1" },
    }));
    expect(conActual.habla).toBe("n-2");
    expect(elegirServidorVoz(pedir({ fichas: [ficha("n-3", { voz: habla(900) })] })).habla).toBe("n-3");
  });
});

describe("nada lanza, siempre hay motivo", () => {
  it("con basura en las fichas no lanza y da un motivo claro", () => {
    const r = elegirServidorVoz(pedir({
      fichas: [null, "ficha", 42, { voz: { oido: "mucho" } }] as unknown as FichaServidorVoz[],
    }));
    expect(typeof r.motivo).toBe("string");
    expect(r.oido).toBeUndefined();
    expect(r.habla).toBeUndefined();
  });

  it("sin sesión válida tampoco se elige servidor", () => {
    const r = elegirServidorVoz({ fichas: [ficha("n-1")], ahora: HORA } as unknown as PeticionServidorVoz);
    expect(r.motivo).toContain("sesión inválida");
    expect(r.oido).toBeUndefined();
  });
});
