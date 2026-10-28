import { describe, it, expect } from "vitest";
import { elegirServidorVoz, type FichaVoz } from "../servidor-voz-sesion";

const AHORA = 1_000_000;

function ficha(id: string, cuenta: string, at: number, ram: number, voz?: any): FichaVoz {
  return { neuronId: id, cuentaId: cuenta, at, ramLibreMb: ram, voz };
}

describe("elegirServidorVoz", () => {
  it("elige el oído con mayor tiempoReal entre miembros de confianza", () => {
    const fichas = [
      ficha("n1", "u1", AHORA - 60_000, 512, { oido: [{ motor: "p", idiomas: [], tiempoReal: 5, flujo: true }], habla: [] }),
      ficha("n2", "u1", AHORA - 30_000, 512, { oido: [{ motor: "p", idiomas: [], tiempoReal: 9, flujo: true }], habla: [] }),
    ];
    const r = elegirServidorVoz({ sesion: { miembros: ["u1"], tipo: "grupo" }, fichas, ahora: AHORA });
    expect(r.oido).toBe("n2");
  });

  it("prefiere A1 aunque no sea miembro", () => {
    const fichas = [
      ficha("oracle-a1-01", "a1", AHORA - 10_000, 1024, { oido: [{ motor: "p", idiomas: [], tiempoReal: 4, flujo: true }], habla: [] }),
      ficha("n1", "u1", AHORA - 10_000, 512, { oido: [{ motor: "p", idiomas: [], tiempoReal: 10, flujo: true }], habla: [] }),
    ];
    const r = elegirServidorVoz({ sesion: { miembros: ["u2"], tipo: "grupo" }, fichas, ahora: AHORA });
    expect(r.oido).toBe("oracle-a1-01");
  });

  it("histéresis mantiene actual si mejora <30%", () => {
    const fichas = [
      ficha("n1", "u1", AHORA - 10_000, 512, { oido: [{ motor: "p", idiomas: [], tiempoReal: 10, flujo: true }], habla: [] }),
      ficha("n2", "u1", AHORA - 10_000, 512, { oido: [{ motor: "p", idiomas: [], tiempoReal: 11, flujo: true }], habla: [] }),
    ];
    const r = elegirServidorVoz({ sesion: { miembros: ["u1"], tipo: "grupo" }, fichas, ahora: AHORA, actual: { oido: "n1" } });
    expect(r.oido).toBe("n1");
  });

  it("cambia si mejora >=30%", () => {
    const fichas = [
      ficha("n1", "u1", AHORA - 10_000, 512, { oido: [{ motor: "p", idiomas: [], tiempoReal: 10, flujo: true }], habla: [] }),
      ficha("n2", "u1", AHORA - 10_000, 512, { oido: [{ motor: "p", idiomas: [], tiempoReal: 14, flujo: true }], habla: [] }),
    ];
    const r = elegirServidorVoz({ sesion: { miembros: ["u1"], tipo: "grupo" }, fichas, ahora: AHORA, actual: { oido: "n1" } });
    expect(r.oido).toBe("n2");
  });

  it("descarta nodo con latido viejo", () => {
    const fichas = [
      ficha("n1", "u1", AHORA - 200_000, 512, { oido: [{ motor: "p", idiomas: [], tiempoReal: 20, flujo: true }], habla: [] }),
    ];
    const r = elegirServidorVoz({ sesion: { miembros: ["u1"], tipo: "grupo" }, fichas, ahora: AHORA });
    expect(r.oido).toBeUndefined();
  });

  it("elige habla con menor primerSonidoMs", () => {
    const fichas = [
      ficha("n1", "u1", AHORA - 10_000, 512, { oido: [], habla: [{ motor: "o", primerSonidoMs: 800 }] }),
      ficha("n2", "u1", AHORA - 10_000, 512, { oido: [], habla: [{ motor: "o", primerSonidoMs: 300 }] }),
    ];
    const r = elegirServidorVoz({ sesion: { miembros: ["u1"], tipo: "grupo" }, fichas, ahora: AHORA });
    expect(r.habla).toBe("n2");
  });
});
