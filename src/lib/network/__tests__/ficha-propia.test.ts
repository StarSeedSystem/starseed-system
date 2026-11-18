/**
 * AUD1117 — publicar la ficha de capacidades al arrancar la malla.
 *
 * Transporte falso y temporizador inyectado: sin red, sin disco, sin panel y
 * sin relojes reales. Comprueba el arranque con la capa encendida, que con la
 * capa apagada no se publica, que dos callers no duplican y que se detiene.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  decidirPublicacionFicha,
  detenerPublicacionFichaPropia,
  hayPublicacionFichaPropia,
  medioDesdePlataforma,
  sincronizarPublicacionFicha,
} from "../ficha-propia";
import type { CapacidadesNodo } from "../capacidades-nodo";

const DISPOSITIVO = { id: "neurona-aq05", platform: "MacIntel" };

function transporteFalso() {
  const publicadas: CapacidadesNodo[] = [];
  const compactas: string[] = [];
  return {
    publicadas,
    compactas,
    publicarMalla: (ficha: CapacidadesNodo) => publicadas.push(ficha),
    publicarServidorMalla: (compacta: string) => compactas.push(compacta),
  };
}

/** Programador que nunca dispara: elimina los intervalos reales de la prueba. */
function sinTemporizador() {
  return () => () => undefined;
}

describe("medioDesdePlataforma", () => {
  it("clasifica la plataforma medida sin inventar capacidades", () => {
    expect(medioDesdePlataforma("Linux x86_64")).toBe("linux");
    expect(medioDesdePlataforma("iPhone")).toBe("ios");
    expect(medioDesdePlataforma("Windows NT")).toBe("navegador");
  });
});

describe("publicación compartida de la ficha propia", () => {
  beforeEach(() => {
    detenerPublicacionFichaPropia();
  });

  it("la capa manda sobre el latido, sin arrancar de más", () => {
    expect(decidirPublicacionFicha(true, false)).toBe("arrancar");
    expect(decidirPublicacionFicha(true, true)).toBe("mantener");
    expect(decidirPublicacionFicha(false, true)).toBe("detener");
    expect(decidirPublicacionFicha(false, false)).toBe("mantener");
  });

  it("con la capa encendida arranca y publica por el transporte falso", async () => {
    const t = transporteFalso();
    const decision = sincronizarPublicacionFicha(true, DISPOSITIVO, t, { programar: sinTemporizador() });
    expect(decision).toBe("arrancar");
    expect(hayPublicacionFichaPropia()).toBe(true);
    await new Promise<void>((res) => setTimeout(res, 0));
    expect(t.publicadas).toHaveLength(1);
    expect(t.publicadas[0].nodoId).toBe(DISPOSITIVO.id);
    expect(t.publicadas[0].medio).toBe("mac");
    expect(t.compactas[0]).toMatch(/^v1\|neurona-\|mac\|/);
  });

  it("con la capa apagada no arranca y no sale nada por el transporte", async () => {
    const t = transporteFalso();
    const decision = sincronizarPublicacionFicha(false, DISPOSITIVO, t, { programar: sinTemporizador() });
    expect(decision).toBe("mantener");
    expect(hayPublicacionFichaPropia()).toBe(false);
    await new Promise<void>((res) => setTimeout(res, 0));
    expect(t.publicadas).toHaveLength(0);
    expect(t.compactas).toHaveLength(0);
  });

  it("dos llamadas con la capa encendida no duplican la publicación", async () => {
    const primero = transporteFalso();
    const segundo = transporteFalso();
    expect(sincronizarPublicacionFicha(true, DISPOSITIVO, primero, { programar: sinTemporizador() })).toBe("arrancar");
    expect(sincronizarPublicacionFicha(true, DISPOSITIVO, segundo, { programar: sinTemporizador() })).toBe("mantener");
    await new Promise<void>((res) => setTimeout(res, 0));
    expect(primero.publicadas).toHaveLength(1);
    expect(segundo.publicadas).toHaveLength(0);
  });

  it("se detiene al apagar la capa y puede arrancar de nuevo después", async () => {
    const antes = transporteFalso();
    sincronizarPublicacionFicha(true, DISPOSITIVO, antes, { programar: sinTemporizador() });
    await new Promise<void>((res) => setTimeout(res, 0));
    expect(sincronizarPublicacionFicha(false, DISPOSITIVO, antes, { programar: sinTemporizador() })).toBe("detener");
    expect(hayPublicacionFichaPropia()).toBe(false);
    const despues = transporteFalso();
    expect(sincronizarPublicacionFicha(true, DISPOSITIVO, despues, { programar: sinTemporizador() })).toBe("arrancar");
    await new Promise<void>((res) => setTimeout(res, 0));
    expect(despues.publicadas).toHaveLength(1);
    expect(antes.publicadas).toHaveLength(1);
  });
});
