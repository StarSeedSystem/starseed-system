import { describe, it, expect } from "vitest";
import { elegirServidorVoz, type FichaVozSesion } from "../servidor-voz-sesion";

const AHORA = 1000000;
const f = (sobre: Partial<FichaVozSesion>): FichaVozSesion => ({
  neurona: "n", confianza: "propia", voz: { oido: [{ motor: "phonon-2", idiomas: ["en"], tiempoReal: 7, flujo: true }], habla: [{ motor: "supertonic", primerSonidoMs: 300 }] },
  latenciaMs: 40, ultimoLatidoMs: AHORA - 10000, ramLibreMb: 2048, ...sobre,
});

describe("elegirServidorVoz", () => {
  it("elige la de menor latencia entre las vivas y de confianza", () => {
    const r = elegirServidorVoz({ sesion: { miembros: ["juan"], tipo: "llamada" }, fichas: [f({ neurona: "b", latenciaMs: 80 }), f({ neurona: "a", latenciaMs: 25 })], ahora: AHORA });
    expect(r.oido?.neurona).toBe("a");
    expect(r.habla?.neurona).toBe("a");
    expect(r.motivo).toContain("elegida");
  });

  it("excluye las ajenas y las sin voz medida", () => {
    const r = elegirServidorVoz({
      sesion: { miembros: [], tipo: "propia" }, ahora: AHORA,
      fichas: [f({ neurona: "ajena", confianza: "ajena", latenciaMs: 5 }), f({ neurona: "muda", voz: { oido: [], habla: [] }, latenciaMs: 5 }), f({ neurona: "a" })],
    });
    expect(r.oido?.neurona).toBe("a");
  });

  it("excluye las sin latido reciente (más de 2 min) y las sin RAM suficiente", () => {
    const r = elegirServidorVoz({
      sesion: { miembros: [], tipo: "propia" }, ahora: AHORA, minRamMb: 1024,
      fichas: [f({ neurona: "muerta", latenciaMs: 5, ultimoLatidoMs: AHORA - 121000 }), f({ neurona: "corta", latenciaMs: 5, ramLibreMb: 300 }), f({ neurona: "a" })],
    });
    expect(r.oido?.neurona).toBe("a");
  });

  it("histéresis: no cambia por una mejora pequeña", () => {
    const actual = { oido: { neurona: "a", motor: "phonon-2", score: 40 }, habla: { neurona: "a", motor: "supertonic", score: 40 } };
    const r = elegirServidorVoz({ sesion: { miembros: [], tipo: "propia" }, fichas: [f({ neurona: "a", latenciaMs: 40 }), f({ neurona: "b", latenciaMs: 32 })], ahora: AHORA, actual });
    expect(r.oido?.neurona).toBe("a");
    expect(r.habla?.neurona).toBe("a");
    expect(r.motivo).toContain("histéresis");
  });

  it("histéresis: sí cambia si la nueva es un 30 % mejor", () => {
    const actual = { neurona: "a", motor: "phonon-2", score: 40 };
    const r = elegirServidorVoz({ sesion: { miembros: [], tipo: "propia" }, fichas: [f({ neurona: "b", latenciaMs: 25 })], ahora: AHORA, actual: { oido: actual } });
    expect(r.oido?.neurona).toBe("b");
  });

  it("relevo: si la actual dejó de latir, toma la mejor viva", () => {
    const actual = { neurona: "vieja", motor: "phonon-2", score: 5 };
    const r = elegirServidorVoz({ sesion: { miembros: [], tipo: "propia" }, fichas: [f({ neurona: "b", latenciaMs: 60 })], ahora: AHORA, actual: { oido: actual } });
    expect(r.oido?.neurona).toBe("b");
    expect(r.motivo).toContain("relevo");
  });

  it("devuelve vacío con motivo cuando nadie sirve", () => {
    const r = elegirServidorVoz({ sesion: { miembros: [], tipo: "propia" }, fichas: [], ahora: AHORA });
    expect(r.oido).toBeUndefined();
    expect(r.habla).toBeUndefined();
    expect(r.motivo).toContain("sin candidata");
  });

  it("puede elegir oído y habla en neuronas distintas", () => {
    const r = elegirServidorVoz({
      sesion: { miembros: [], tipo: "propia" }, ahora: AHORA,
      fichas: [f({ neurona: "o", latenciaMs: 10, voz: { oido: [{ motor: "phonon-2", idiomas: [], tiempoReal: 6, flujo: true }], habla: [] } }), f({ neurona: "h", latenciaMs: 20, voz: { oido: [], habla: [{ motor: "supertonic", primerSonidoMs: 250 }] } })],
    });
    expect(r.oido?.neurona).toBe("o");
    expect(r.habla?.neurona).toBe("h");
  });
});
