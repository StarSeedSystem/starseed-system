// Rescate de la rama nube/40126871156 (tarea RLB1020N) · casos adaptados a la API de hoy.
// La rama probaba rectVentanaCentrada/recolocarVentanaEnPantalla: funciones que main NO
// adoptó — la ventana nueva abre en CASCADA (desktop-store.openWindow) y el clamp de la
// banda superior (Adenda 68 · B-1) vive en la normalización del store. Se rescata el
// clamp; el centrado y la recolocación por límites se descartan porque main los sustituyó
// a propósito por la cascada y el clamp.
//
// (2026-10-30 · Ola 1019D) El centrado vuelve por decisión de Alex («cada ventana centrada
// en la pantalla», identidades.md §Decisiones de Alex 2026-10-19 y §7b de adn-y-tokens.md):
// openWindow usa la geometría por aparato de composicion.ts (posicionCentrada) y la
// posición guardada se respeta, recolocándola dentro del aparato si quedó fuera
// (quedoFuera + recolocarDentro). Aquí se prueban esas funciones puras.

import { describe, it, expect } from "vitest";
import {
  normalizeState,
  DESKTOP_TOP_INSET,
  posicionCentrada,
  quedoFuera,
  recolocarDentro,
} from "../desktop-store";

function docEscritorio(ventana: Record<string, unknown>) {
    return normalizeState({
        desktops: [{ id: "d1", name: "Escritorio", icons: [], windows: [ventana] }],
        activeId: "d1",
    });
}

function ventanaDe(state: ReturnType<typeof normalizeState>) {
    if (!state) throw new Error("normalizeState devolvió null");
    return state.desktops[0].windows[0];
}

const contenida = { x: 120, y: 140, w: 700, h: 500, contentRef: { type: "app", ref: "muestra" } };

describe("Ventana del escritorio · banda de la barra superior (B-1)", () => {
  it("deja intacta una posición guardada que ya está dentro", () => {
    const v = ventanaDe(docEscritorio(contenida));
    expect(v.x).toBe(120);
    expect(v.y).toBe(140);
    expect(v.w).toBe(700);
    expect(v.h).toBe(500);
  });

  it("no baja una ventana por debajo de la barra superior", () => {
    const v = ventanaDe(docEscritorio({ ...contenida, y: 0 }));
    expect(v.y).toBe(DESKTOP_TOP_INSET);
  });
});

describe("posicionCentrada · composición centrada por aparato (§7b)", () => {
  it("centra una ventana por defecto en un escritorio 1280×800", () => {
    expect(posicionCentrada(1280, 800)).toEqual({ x: 260, y: 140, w: 760, h: 520 });
  });

  it("respeta el tamaño pedido y lo mantiene centrado", () => {
    const r = posicionCentrada(1280, 800, 400, 300);
    expect(r.x).toBe((1280 - 400) / 2);
    expect(r.y).toBe((800 - 300) / 2);
    expect(r.w).toBe(400);
    expect(r.h).toBe(300);
  });

  it("nunca invade la banda de la barra superior (B-1)", () => {
    const r = posicionCentrada(800, 300);
    expect(r.y).toBe(DESKTOP_TOP_INSET);
    expect(r.y + r.h).toBeLessThanOrEqual(300);
  });

  it("en teléfono estrecho deja el margen de 16 px a cada lado", () => {
    const r = posicionCentrada(360, 700);
    expect(r.w).toBeLessThanOrEqual(360 - 32);
    expect(r.x).toBeGreaterThanOrEqual(16);
    expect(r.x + r.w).toBeLessThanOrEqual(360 - 16);
  });
});

describe("recolocarVentana · posición guardada dentro del aparato", () => {
  it("una ventana ya dentro se queda EXACTAMENTE igual", () => {
    const dentro = { x: 120, y: 140, w: 700, h: 500 };
    expect(quedoFuera(dentro, 1280, 800)).toBe(false);
    expect(recolocarDentro(dentro, 1280, 800)).toEqual(dentro);
  });

  it("una ventana caída fuera por la derecha vuelve a entrar sin cambiar tamaño", () => {
    const fuera = { x: 1400, y: 140, w: 700, h: 500 };
    expect(quedoFuera(fuera, 1280, 800)).toBe(true);
    const fija = recolocarDentro(fuera, 1280, 800);
    expect(fija.w).toBe(700);
    expect(fija.h).toBe(500);
    expect(fija.x + fija.w).toBeLessThanOrEqual(1280 - 16);
  });

  it("una ventana bajo la barra superior se trae a la banda de ventanas", () => {
    const fija = recolocarDentro({ x: 120, y: 0, w: 700, h: 500 }, 1280, 800);
    expect(fija.y).toBe(DESKTOP_TOP_INSET);
  });
});
