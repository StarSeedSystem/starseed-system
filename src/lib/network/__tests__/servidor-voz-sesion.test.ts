/**
 * servidor-voz-sesion (Ola 1015V · S) — elección, histéresis, relevo y
 * privacidad del servidor de voz de la sesión. Contrato §5. Puro: fichas y
 * reloj inyectados, sin red, sin micrófono y sin procesos.
 */
import { describe, expect, it } from "vitest";
import {
  elegirServidorVoz, LATIDO_VIVO_MS, RAM_HABLA_MB, RAM_OIDO_MB,
  type FichaServidorVoz,
} from "../servidor-voz-sesion";

const AHORA = 1_800_000_000_000;
const GRUPO = { tipo: "grupo" as const, miembros: ["cuenta-a", "cuenta-b"] };

const ficha = (id: string, extra: Partial<FichaServidorVoz> = {}): FichaServidorVoz => ({
  id, confianza: "propia", latido: AHORA - 1000, ...extra,
});

describe("elegirServidorVoz: elección", () => {
  it("toma la menor latencia medida, y puede ser una neurona distinta por lado", () => {
    const r = elegirServidorVoz({
      sesion: GRUPO,
      fichas: [
        ficha("n-oido", { voz: { oido: [{ motor: "phonon-2", idiomas: ["es"], tiempoReal: 6.4, flujo: true }], habla: [] } }),
        ficha("n-habla", { voz: { oido: [{ motor: "parakeet-v3", idiomas: ["es"], tiempoReal: 10.9, flujo: false }], habla: [{ motor: "supertonic", primerSonidoMs: 380 }] } }),
      ],
      ahora: AHORA,
    });
    expect(r.oido).toBe("n-oido");
    expect(r.habla).toBe("n-habla");
    expect(r.motivo).toContain("6.4×");
    expect(r.motivo).toContain("380 ms");
  });

  it("incluye el A1 (24/7) cuando está en las fichas, aunque no sea de un miembro", () => {
    const r = elegirServidorVoz({
      sesion: GRUPO,
      fichas: [
        ficha("a1-oracle", { confianza: "grupo", a1: true, voz: { oido: [{ motor: "parakeet-v3", idiomas: ["en"], tiempoReal: 10.9, flujo: false }], habla: [] } }),
        ficha("remota", { confianza: "grupo", cuenta: "cuenta-c", voz: { habla: [{ motor: "kokoro", primerSonidoMs: 200 }], oido: [] } }),
      ],
      ahora: AHORA,
    });
    expect(r.oido).toBe("a1-oracle");
    expect(r.habla).toBeUndefined();
  });
});

describe("elegirServidorVoz: histéresis", () => {
  it("se mantiene con la actual si la nueva no es un 30 % mejor", () => {
    const op = {
      sesion: GRUPO,
      fichas: [
        ficha("n-actual", { voz: { habla: [{ motor: "a", primerSonidoMs: 900 }], oido: [{ motor: "a", idiomas: [], tiempoReal: 10, flujo: false }] } }),
        ficha("n-nueva", { voz: { habla: [{ motor: "b", primerSonidoMs: 820 }], oido: [{ motor: "b", idiomas: [], tiempoReal: 9, flujo: false }] } }),
      ],
      ahora: AHORA,
      actual: { oido: "n-actual", habla: "n-actual", motivo: "" },
    };
    const r = elegirServidorVoz(op);
    expect(r.oido).toBe("n-actual");
    expect(r.habla).toBe("n-actual");
    expect(r.motivo).toContain("histéresis");
  });

  it("cambia si la nueva es un 30 % mejor o más", () => {
    const r = elegirServidorVoz({
      sesion: GRUPO,
      fichas: [
        ficha("n-actual", { voz: { habla: [{ motor: "a", primerSonidoMs: 900 }], oido: [{ motor: "a", idiomas: [], tiempoReal: 10, flujo: false }] } }),
        ficha("n-nueva", { voz: { habla: [{ motor: "b", primerSonidoMs: 600 }], oido: [{ motor: "b", idiomas: [], tiempoReal: 7, flujo: false }] } }),
      ],
      ahora: AHORA,
      actual: { oido: "n-actual", habla: "n-actual", motivo: "" },
    });
    expect(r.oido).toBe("n-nueva");
    expect(r.habla).toBe("n-nueva");
  });
});

describe("elegirServidorVoz: relevo", () => {
  it("la siguiente toma el relevo sola cuando la actual dejó de latir", () => {
    const r = elegirServidorVoz({
      sesion: GRUPO,
      fichas: [
        ficha("n-muerta", { latido: AHORA - LATIDO_VIVO_MS - 1, voz: { habla: [{ motor: "a", primerSonidoMs: 100 }], oido: [{ motor: "a", idiomas: [], tiempoReal: 5, flujo: false }] } }),
        ficha("n-reserva", { voz: { habla: [{ motor: "b", primerSonidoMs: 300 }], oido: [{ motor: "b", idiomas: [], tiempoReal: 8, flujo: false }] } }),
      ],
      ahora: AHORA,
      actual: { oido: "n-muerta", habla: "n-muerta", motivo: "" },
    });
    expect(r.oido).toBe("n-reserva");
    expect(r.habla).toBe("n-reserva");
    expect(r.motivo).toContain("relevo");
  });

  it("sin fichas o con basura no elige nada y nunca lanza", () => {
    expect(elegirServidorVoz({ sesion: GRUPO, fichas: [], ahora: AHORA }).oido).toBeUndefined();
    const basura = [null, { id: "" }, ficha("x", { voz: { habla: [{ motor: "m", primerSonidoMs: Number.NaN }], oido: [] } })] as unknown as FichaServidorVoz[];
    const r = elegirServidorVoz({ sesion: GRUPO, fichas: basura, ahora: AHORA });
    expect(r.oido).toBeUndefined();
    expect(r.habla).toBeUndefined();
    expect(r.motivo.length).toBeGreaterThan(0);
  });
});

describe("elegirServidorVoz: privacidad", () => {
  it("una neurona ajena jamás sirve, aun siendo la más rápida", () => {
    const r = elegirServidorVoz({
      sesion: GRUPO,
      fichas: [
        ficha("ajena-rapida", { confianza: "ajena", voz: { habla: [{ motor: "x", primerSonidoMs: 50 }], oido: [{ motor: "x", idiomas: [], tiempoReal: 2, flujo: true }] } }),
        ficha("propia-lenta", { voz: { habla: [{ motor: "y", primerSonidoMs: 700 }], oido: [{ motor: "y", idiomas: [], tiempoReal: 11, flujo: false }] } }),
      ],
      ahora: AHORA,
    });
    expect(r.oido).toBe("propia-lenta");
    expect(r.habla).toBe("propia-lenta");
    expect(r.motivo).not.toContain("ajena-rapida");
  });

  it("una ficha de grupo de una cuenta fuera de la sesión queda fuera", () => {
    const r = elegirServidorVoz({
      sesion: { tipo: "llamada", miembros: ["cuenta-a"] },
      fichas: [
        ficha("intrusa", { confianza: "grupo", cuenta: "cuenta-z", voz: { habla: [{ motor: "m", primerSonidoMs: 90 }], oido: [{ motor: "m", idiomas: [], tiempoReal: 3, flujo: false }] } }),
        ficha("justa", { confianza: "grupo", cuenta: "cuenta-a", voz: { habla: [{ motor: "n", primerSonidoMs: 400 }], oido: [{ motor: "n", idiomas: [], tiempoReal: 9, flujo: false }] } }),
      ],
      ahora: AHORA,
    });
    expect(r.habla).toBe("justa");
    expect(r.oido).toBe("justa");
  });
});

describe("elegirServidorVoz: RAM y constantes", () => {
  it("exige RAM suficiente para hablar pero no excluye a quien no la informa", () => {
    const r = elegirServidorVoz({
      sesion: GRUPO,
      fichas: [
        ficha("sin-ram", { ramLibreMb: 300, voz: { habla: [{ motor: "a", primerSonidoMs: 100 }], oido: [{ motor: "a", idiomas: [], tiempoReal: 5, flujo: false }] } }),
        ficha("sin-dato", { voz: { habla: [{ motor: "b", primerSonidoMs: 500 }], oido: [{ motor: "b", idiomas: [], tiempoReal: 9, flujo: false }] } }),
      ],
      ahora: AHORA,
    });
    expect(r.habla).toBe("sin-dato");
    expect(r.oido).toBe("sin-dato");
    expect(r.motivo).not.toContain("sin-ram");
  });

  it("constantes del contrato: latido < 2 min y histéresis del 30 %", () => {
    expect(LATIDO_VIVO_MS).toBe(120_000);
    expect(RAM_OIDO_MB).toBe(512);
    expect(RAM_HABLA_MB).toBe(1024);
    expect(RAM_HABLA_MB / RAM_OIDO_MB).toBe(2);
  });
});
