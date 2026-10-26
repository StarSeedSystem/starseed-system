import { describe, it, expect } from "vitest";
import {
  elegirServidorVoz,
  fichaValida,
  OIDO_RAM_MIN_MB,
  HABLA_RAM_MIN_MB,
  LATIDO_MAX_MS,
} from "../servidor-voz-sesion";

const AHORA = 10_000_000;

const ficha = (extras: Partial<Parameters<typeof fichaValida>[0]> & Record<string, unknown>) => ({
  propia: true,
  t: AHORA - 10_000,
  ramLibreMb: 4000,
  ...extras,
});

const sesion = { miembros: ["cuenta-grupo"], tipo: "grupo" } as const;

describe("elegirServidorVoz · elección", () => {
  it("elige el oído y la voz de menor latencia medida entre fichas de confianza", () => {
    const fichas = [
      ficha({ id: "lenta", oido: [{ motor: "phonon-2", latenciaMs: 900 }], habla: [{ motor: "omnivoice", latenciaMs: 900 }] }),
      ficha({ id: "rapida", oido: [{ motor: "parakeet", latenciaMs: 100 }], habla: [{ motor: "kokoro", latenciaMs: 200 }] }),
    ];
    const r = elegirServidorVoz({ sesion, fichas, ahora: AHORA });
    expect(r.oido).toBe("rapida");
    expect(r.habla).toBe("rapida");
    expect(r.motivo).toContain("oído en rapida");
  });

  it("descarta fichas con latido viejo (más de 2 min) o sin RAM suficiente", () => {
    const fichas = [
      ficha({ id: "muerta", t: AHORA - LATIDO_MAX_MS - 1, oido: [{ motor: "phonon-2", latenciaMs: 10 }] }),
      ficha({ id: "poca-ram", ramLibreMb: OIDO_RAM_MIN_MB - 1, habla: [{ motor: "kokoro", latenciaMs: 10 }] }),
      ficha({ id: "a1", esA1: true, ramLibreMb: 8000, oido: [{ motor: "parakeet", latenciaMs: 500 }] }),
    ];
    const r = elegirServidorVoz({ sesion, fichas, ahora: AHORA });
    expect(r.oido).toBe("a1");
    expect(r.habla).toBeUndefined();
  });

  it("elige un motor distinto para el oído y para la voz cuando conviene", () => {
    const fichas = [
      ficha({ id: "ligera", ramLibreMb: OIDO_RAM_MIN_MB + 50, oido: [{ motor: "phonon-2", latenciaMs: 60 }] }),
      ficha({ id: "completa", ramLibreMb: HABLA_RAM_MIN_MB + 100, habla: [{ motor: "omnivoice", latenciaMs: 300 }] }),
    ];
    const r = elegirServidorVoz({ sesion, fichas, ahora: AHORA });
    expect(r.oido).toBe("ligera");
    expect(r.habla).toBe("completa");
  });

  it("nunca lanza y da un motivo con fichas vacías o corruptas", () => {
    expect(elegirServidorVoz({ sesion, fichas: [], ahora: AHORA }).motivo).toContain("sin fichas");
    const r = elegirServidorVoz({ sesion, fichas: [null, { id: "x" }, "texto"], ahora: AHORA });
    expect(r.motivo).toContain("sin fichas");
    expect(r.oido).toBeUndefined();
  });

  it("no anuncia la capacidad de una ficha que no mide nada", () => {
    expect(fichaValida({ id: "vacía", t: AHORA, ramLibreMb: 1000 })).toBeNull();
    expect(fichaValida({ id: "mala", t: -5, ramLibreMb: 1000 })).toBeNull();
    const ok = fichaValida({ id: "ok", t: AHORA, ramLibreMb: 1000, habla: [{ motor: "kokoro", latenciaMs: 100 }] });
    expect(ok?.habla).toHaveLength(1);
  });
});

describe("elegirServidorVoz · histéresis", () => {
  const actual = { oido: "actual", habla: "actual" };

  it("no cambia si el mejor solo es mejor de forma marginal (< 30 %)", () => {
    const fichas = [
      ficha({ id: "actual", oido: [{ motor: "phonon-2", latenciaMs: 100 }], habla: [{ motor: "kokoro", latenciaMs: 100 }] }),
      ficha({ id: "algo mejor", oido: [{ motor: "parakeet", latenciaMs: 85 }], habla: [{ motor: "parakeet", latenciaMs: 85 }] }),
    ];
    const r = elegirServidorVoz({ sesion, fichas, ahora: AHORA, actual });
    expect(r.oido).toBe("actual");
    expect(r.habla).toBe("actual");
    expect(r.motivo).not.toContain("relevado");
  });

  it("cambia cuando el nuevo es un 30 % mejor o más", () => {
    const fichas = [
      ficha({ id: "actual", oido: [{ motor: "phonon-2", latenciaMs: 100 }], habla: [{ motor: "kokoro", latenciaMs: 100 }] }),
      ficha({ id: "mucho mejor", oido: [{ motor: "parakeet", latenciaMs: 70 }], habla: [{ motor: "parakeet", latenciaMs: 70 }] }),
    ];
    const r = elegirServidorVoz({ sesion, fichas, ahora: AHORA, actual });
    expect(r.oido).toBe("mucho mejor");
    expect(r.habla).toBe("mucho mejor");
    expect(r.motivo).toContain("(relevado)");
  });
});

describe("elegirServidorVoz · relevo y privacidad", () => {
  it("toma el relevo solo cuando el actual dejó de latir", () => {
    const fichas = [
      ficha({ id: "actual", t: AHORA - LATIDO_MAX_MS - 1, habla: [{ motor: "kokoro", latenciaMs: 100 }] }),
      ficha({ id: "reserva", habla: [{ motor: "kokoro", latenciaMs: 400 }] }),
    ];
    const r = elegirServidorVoz({ sesion, fichas, ahora: AHORA, actual: { habla: "actual" } });
    expect(r.habla).toBe("reserva");
    expect(r.motivo).toContain("(relevado)");
  });

  it("toma el relevo cuando el actual perdió la capacidad (menor RAM)", () => {
    const fichas = [
      ficha({ id: "actual", ramLibreMb: HABLA_RAM_MIN_MB - 1, habla: [{ motor: "kokoro", latenciaMs: 100 }] }),
      ficha({ id: "reserva", habla: [{ motor: "kokoro", latenciaMs: 400 }] }),
    ];
    const r = elegirServidorVoz({ sesion, fichas, ahora: AHORA, actual: { habla: "actual" } });
    expect(r.habla).toBe("reserva");
  });

  it("privacidad: una neurona ajena fuera de la sesión nunca sirve de servidor", () => {
    const fichas = [
      ficha({ id: "ajena", propia: false, duenio: "cuenta-otra", oido: [{ motor: "phonon-2", latenciaMs: 1 }], habla: [{ motor: "kokoro", latenciaMs: 1 }] }),
      ficha({ id: "propia", oido: [{ motor: "parakeet", latenciaMs: 900 }], habla: [{ motor: "kokoro", latenciaMs: 900 }] }),
    ];
    const r = elegirServidorVoz({ sesion, fichas, ahora: AHORA });
    expect(r.oido).toBe("propia");
    expect(r.habla).toBe("propia");
  });

  it("privacidad: el A1 entra aunque solo sirva de oído y la sesión lo pida", () => {
    const fichas = [ficha({ id: "a1", propia: false, esA1: true, oido: [{ motor: "parakeet", latenciaMs: 100 }] })];
    const r = elegirServidorVoz({ sesion, fichas, ahora: AHORA });
    expect(r.oido).toBe("a1");
    expect(r.habla).toBeUndefined();
  });

  it("las de los miembros de la sesión son de confianza sin ser propias", () => {
    const fichas = [ficha({ id: "de-grupo", propia: false, duenio: "cuenta-grupo", habla: [{ motor: "omnivoice", latenciaMs: 150 }] })];
    const r = elegirServidorVoz({ sesion, fichas, ahora: AHORA });
    expect(r.habla).toBe("de-grupo");
  });
});
