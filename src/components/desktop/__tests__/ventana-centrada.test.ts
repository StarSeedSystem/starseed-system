// Rescate de la rama nube/40126871156 (tarea RLB1020N) · casos adaptados a la API de hoy.
// La rama probaba rectVentanaCentrada/recolocarVentanaEnPantalla: funciones que main NO
// adoptó — la ventana nueva abre en CASCADA (desktop-store.openWindow) y el clamp de la
// banda superior (Adenda 68 · B-1) vive en la normalización del store. Se rescata el
// clamp; el centrado y la recolocación por límites se descartan porque main los sustituyó
// a propósito por la cascada y el clamp.
//
// Ahora openWindow usa geometriaVentana (composición centrada) para ventanas nuevas.

import { describe, it, expect } from "vitest";
import { normalizeState, DESKTOP_TOP_INSET } from "../desktop-store";
import { geometriaVentana, type Viewport } from "@/lib/design/composicion";

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

describe("geometriaVentana · composición centrada para ventanas nuevas", () => {
  const viewportEscritorio: Viewport = { ancho: 1280, alto: 800 };
  const viewportTelefono: Viewport = { ancho: 375, alto: 667 };

  it("centra la ventana horizontal y verticalmente en escritorio", () => {
    const geo = geometriaVentana(viewportEscritorio, { tipo: "ventana", ancho: 760, alto: 520 });
    expect(geo.x).toBe((1280 - 760) / 2);
    expect(geo.y).toBe((800 - 520) / 2);
    expect(geo.ancho).toBe(760);
    expect(geo.alto).toBe(520);
  });

  it("respeta el ancho/alto máximos del viewport en escritorio", () => {
    const geo = geometriaVentana(viewportEscritorio, { tipo: "ventana", ancho: 2000, alto: 2000 });
    expect(geo.ancho).toBeLessThanOrEqual(1186); // maxWidth de composicion.ts
    expect(geo.alto).toBeLessThanOrEqual(800);
    // Centrada horizontalmente dentro del ancho disponible
    expect(geo.x).toBe((1280 - geo.ancho) / 2);
    expect(geo.y).toBe((800 - geo.alto) / 2);
  });

  it("en teléfono usa margen horizontal de 16 px y centra en el espacio disponible", () => {
    const geo = geometriaVentana(viewportTelefono, { tipo: "ventana", ancho: 300, alto: 500 });
    // ancho disponible = 375 - 2*16 = 343, 300 cabe → centrado en ese espacio
    // x = 16 + (343 - 300) / 2 = 37.5
    expect(geo.x).toBe(16 + (343 - 300) / 2);
    expect(geo.ancho).toBe(300);
    expect(geo.y).toBe((667 - 500) / 2); // centrada verticalmente
  });

  it("acota la ventana al viewport disponible en teléfono", () => {
    const geo = geometriaVentana(viewportTelefono, { tipo: "ventana", ancho: 500, alto: 800 });
    // ancho disponible = 375 - 2*16 = 343
    expect(geo.ancho).toBe(343);
    expect(geo.x).toBe(16);
    // alto acotado al viewport
    expect(geo.alto).toBe(667);
    expect(geo.y).toBe(0);
  });
});
