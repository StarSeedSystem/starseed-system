/**
 * XR1010F · comodidad y accesibilidad (contrato §3 j). Velocidad de la cabeza, viñeta (sube con la
 * velocidad, tope 0,85, «nunca» es 0 salvo movimiento reducido), giro por saltos (ocho saltos de
 * 45° dan la vuelta), el movimiento reducido manda y lo avisa, subtítulos según preferencia,
 * posición a 1,5 m bajo la mirada y la postura «una mano» agrupa paneles. Lienzo 3D simulado.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aplicarMovimientoReducido, CONFORT_DEFECTO, opacidadVineta, type PreferenciasConfort } from "@/lib/xr/confort";
import { disponerTrinity } from "@/lib/xr/espacio-trinity";

const h = vi.hoisted(() => ({
  confort: null as unknown as PreferenciasConfort,
  cuadros: [] as Array<(s: unknown, dt: number) => void>,
}));
vi.mock("../use-prefs-xr", () => ({ usePrefsXR: () => ({ confort: h.confort, avisos: [] }) }));
vi.mock("../use-entrada-xr", () => ({ useEntradaXR: () => ({ disparar: () => {}, frase: () => {} }) }));
vi.mock("@react-three/fiber", () => ({
  useFrame: (f: (s: unknown, dt: number) => void) => { h.cuadros.push(f); },
}));
vi.mock("../panel-cristal", () => ({
  NivelCalidadContext: null,
  Texto3D: ({ children }: { children?: React.ReactNode }) => <span data-testid="subtitulo-3d">{children}</span>,
}));

import { avisoReducido, Comodidad, debeMostrarSubtitulos, entradasTrinity, pasoGiro, posicionSubtitulo, velocidadEntre } from "../comodidad";
import { radiosVineta } from "../vineta";

const vuelta = (yaw: number): number => Math.abs(Math.atan2(Math.sin(yaw), Math.cos(yaw)));

beforeEach(() => { h.confort = { ...CONFORT_DEFECTO }; h.cuadros.length = 0; });
afterEach(cleanup);

describe("velocidadEntre", () => {
  it("la cabeza parada no tiene velocidad ninguna", () => {
    const a = { x: 1.2, y: 1.6, z: 0.3, yaw: 0.4 };
    expect(velocidadEntre(a, a, 0.03)).toEqual({ lineal: 0, angularGradosS: 0 });
  });

  it("medio metro de paseo en 0,25 s son 2 m/s y 45° de giro en 0,25 s son 180°/s", () => {
    const b = { x: 0.5, y: 0, z: 0, yaw: Math.PI / 4 };
    expect(velocidadEntre({ x: 0, y: 0, z: 0, yaw: 0 }, b, 0.25).lineal).toBeCloseTo(2, 6);
    expect(velocidadEntre({ x: 0, y: 0, z: 0, yaw: 0 }, b, 0.25).angularGradosS).toBeCloseTo(180, 6);
  });
});

describe("viñeta con la velocidad", () => {
  const todo = { ...CONFORT_DEFECTO, fuerzaVineta: 1 };
  it("sube con la velocidad y no pasa nunca de 0,85 (nunca negro total)", () => {
    expect(opacidadVineta(todo, { lineal: 0.2, angularGradosS: 10 })).toBe(0);
    expect(opacidadVineta(todo, { lineal: 1, angularGradosS: 70 })).toBeLessThan(0.85);
    expect(opacidadVineta(todo, { lineal: 4, angularGradosS: 200 })).toBe(0.85);
    for (const mov of [{ lineal: 3, angularGradosS: 90 }, { lineal: 9, angularGradosS: 700 }]) {
      expect(opacidadVineta(todo, mov)).toBeLessThanOrEqual(0.85);
    }
  });

  it("con «nunca» es 0 salvo que el movimiento reducido ponga el suelo", () => {
    const nunca = { ...CONFORT_DEFECTO, vineta: "nunca" as const, fuerzaVineta: 1 };
    expect(opacidadVineta(nunca, { lineal: 4, angularGradosS: 200 })).toBe(0);
    const reducido = aplicarMovimientoReducido({ ...nunca, movimientoReducido: true });
    expect(opacidadVineta(reducido, { lineal: 4, angularGradosS: 200 })).toBeGreaterThan(0);
    expect(opacidadVineta(reducido, { lineal: 0, angularGradosS: 0 })).toBeGreaterThan(0);
  });

  it("la malla anular se cierra con la opacidad y deja siempre un respiro", () => {
    expect(radiosVineta(0).interior).toBe(radiosVineta(0).exterior);
    expect(radiosVineta(0.85).interior).toBeLessThan(radiosVineta(0.85).exterior);
    expect(radiosVineta(0.85).interior).toBeGreaterThanOrEqual(0.008);
  });
});

describe("giro por saltos con `siguienteGiro` del núcleo", () => {
  it("ocho saltos de 45° dan la vuelta completa, en los dos sentidos", () => {
    for (const dir of [1, -1] as const) {
      let yaw = 0;
      for (let i = 0; i < 8; i += 1) yaw += pasoGiro(dir, { ...CONFORT_DEFECTO, anguloSalto: 45 });
      expect(vuelta(yaw)).toBeLessThan(1e-9);
    }
  });

  it("por defecto, saltos de 30° y teletransporte", () => {
    expect(CONFORT_DEFECTO.giro).toBe("saltos");
    expect(CONFORT_DEFECTO.locomocion).toBe("teletransporte");
    expect(vuelta(pasoGiro(1, CONFORT_DEFECTO))).toBeCloseTo(Math.PI / 6, 9);
  });
});

describe("movimiento reducido: manda y lo avisa", () => {
  const crudo = { ...CONFORT_DEFECTO, giro: "continuo" as const, locomocion: "continua" as const, movimientoReducido: true };
  it("cambia a saltos y teletransporte aunque se haya elegido continuo", () => {
    const efecto = aplicarMovimientoReducido(crudo);
    expect(efecto.giro).toBe("saltos");
    expect(efecto.locomocion).toBe("teletransporte");
  });

  it("avisa solo cuando corrige una elección; sin reducido o sin choque, no avisa", () => {
    expect(avisoReducido(crudo)).toContain("Movimiento reducido");
    expect(avisoReducido({ ...CONFORT_DEFECTO, giro: "saltos", locomocion: "teletransporte", movimientoReducido: true })).toBeNull();
    expect(avisoReducido({ ...CONFORT_DEFECTO, giro: "continuo", locomocion: "continua", movimientoReducido: false })).toBeNull();
  });
});

describe("subtítulos de la voz y de la transmisión", () => {
  it("la preferencia los muestra y los oculta", () => {
    expect(debeMostrarSubtitulos({ ...CONFORT_DEFECTO, subtitulos: true })).toBe(true);
    expect(debeMostrarSubtitulos({ ...CONFORT_DEFECTO, subtitulos: false })).toBe(false);
  });

  it("van a 1,5 m del frente, por debajo de la altura de los ojos", () => {
    const p = posicionSubtitulo(1.7);
    expect(p[0]).toBe(0);
    expect(p[2]).toBe(-1.5);
    expect(p[1]).toBeLessThan(1.7);
    expect(p[1]).toBeGreaterThan(1.7 - 0.3);
  });
});

describe("postura «una mano» con el núcleo", () => {
  it("agrupa Horizon y Logic en pestañas, y cambia la distancia de la postura", () => {
    const dePie = disponerTrinity(entradasTrinity({ ...CONFORT_DEFECTO, postura: "de-pie" }, "vr-inmersivo"));
    const una = disponerTrinity(entradasTrinity({ ...CONFORT_DEFECTO, postura: "una-mano" }, "vr-inmersivo"));
    expect(dePie.nodos.logic.agrupadoCon).toBeUndefined();
    expect(una.nodos.logic.agrupadoCon).toBe("horizon");
    expect(una.nodos.logic.visible).toBe(false);
    expect(una.nodos.zenith.distancia).toBeLessThan(dePie.nodos.zenith.distancia);
  });

  it("la altura manual manda sobre la medida del visor; sin ninguna, 1,6 m", () => {
    expect(entradasTrinity({ ...CONFORT_DEFECTO, alturaOjos: 1.8 }, "vr-inmersivo", 1.4).alturaOjos).toBe(1.8);
    expect(entradasTrinity(CONFORT_DEFECTO, "vr-inmersivo", 1.4).alturaOjos).toBe(1.4);
    expect(entradasTrinity(CONFORT_DEFECTO, "vr-inmersivo", null).alturaOjos).toBe(1.6);
  });
});

describe("<Comodidad> montado (lienzo simulado)", () => {
  it("muestra el subtítulo de lo que dice Astraura", () => {
    render(<Comodidad modo="vr-inmersivo" vozAstraura="Creo un mundo con cielo de noche" />);
    expect(screen.getByTestId("subtitulo-3d")).toHaveTextContent("Creo un mundo con cielo de noche");
  });

  it("con la preferencia de subtítulos apagada no pinta ninguna línea", () => {
    h.confort = { ...CONFORT_DEFECTO, subtitulos: false };
    render(<Comodidad modo="vr-inmersivo" vozAstraura="no se ve" transmision="tampoco" />);
    expect(screen.queryByTestId("subtitulo-3d")).toBeNull();
  });

  it("si se eligió caminar continuo con movimiento reducido, manda el reducido y lo dice una vez", () => {
    h.confort = { ...CONFORT_DEFECTO, movimientoReducido: true, locomocion: "continua" };
    render(<Comodidad modo="vr-inmersivo" />);
    expect(screen.getByTestId("subtitulo-3d")).toHaveTextContent("Movimiento reducido");
  });
});
