// Rescate de la rama nube/40126871156 (tarea RLB1020N) · casos adaptados a la API de hoy.
// La rama probaba rectVentanaCentrada/recolocarVentanaEnPantalla: funciones que main NO
// adoptó — la ventana nueva abre en CASCADA (desktop-store.openWindow) y el clamp de la
// banda superior (Adenda 68 · B-1) vive en la normalización del store. Se rescata el
// clamp; el centrado y la recolocación por límites se descartan porque main los sustituyó
// a propósito por la cascada y el clamp.
//
// Pruebas añadidas: geometría centrada de composicion.ts (openWindow la usa cuando no hay
// posición guardada). Verificamos que geometriaVentana produce el centrado esperado.

import { describe, it, expect } from "vitest";
import { normalizeState, DESKTOP_TOP_INSET } from "../desktop-store";
import { geometriaVentana, tipoAparato, type Viewport } from "@/lib/design/composicion";

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

describe("geometriaVentana · composición centrada (fuente de openWindow)", () => {
  const viewportEscritorio: Viewport = { ancho: 1280, alto: 800 };
  const viewportTelefono: Viewport = { ancho: 375, alto: 667 };

  it("centra ventana horizontal y verticalmente en escritorio", () => {
    const geo = geometriaVentana(viewportEscritorio, { tipo: "ventana", ancho: 760, alto: 520 });
    // x = (1280 - 760) / 2 = 260
    expect(geo.x).toBe(260);
    // y = (800 - 520) / 2 = 140
    expect(geo.y).toBe(140);
    expect(geo.ancho).toBe(760);
    expect(geo.alto).toBe(520);
    expect(geo.origen).toBe("top-left");
  });

  it("centra diálogo con mismo cálculo que ventana", () => {
    const geo = geometriaVentana(viewportEscritorio, { tipo: "dialogo", ancho: 600, alto: 400 });
    expect(geo.x).toBe(340);
    expect(geo.y).toBe(200);
    expect(geo.ancho).toBe(600);
    expect(geo.alto).toBe(400);
  });

  it("respeta ancho/alto máximos del viewport en escritorio", () => {
    const geo = geometriaVentana(viewportEscritorio, { tipo: "ventana", ancho: 2000, alto: 2000 });
    // ancho limitado a 1186 (maxWidth) y alto a 800 (viewport)
    expect(geo.ancho).toBe(1186);
    expect(geo.alto).toBe(800);
    // sigue centrado horizontalmente: (1280 - 1186) / 2 = 47
    expect(geo.x).toBe(47);
    // centrado verticalmente: (800 - 800) / 2 = 0
    expect(geo.y).toBe(0);
  });

  it("en teléfono aplica margen horizontal de 16px y centra", () => {
    const geo = geometriaVentana(viewportTelefono, { tipo: "ventana", ancho: 300, alto: 400 });
    // availWidth = 375 - 32 = 343, ancho = min(300, 343) = 300
    // x = 16 + (343 - 300) / 2 = 37.5 (float, no se redondea)
    expect(geo.x).toBe(37.5);
    expect(geo.y).toBe(133.5); // (667 - 400) / 2 = 133.5
    expect(geo.ancho).toBe(300);
    expect(geo.alto).toBe(400);
  });

  it("hoja en teléfono se ancla abajo y centra horizontalmente", () => {
    const geo = geometriaVentana(viewportTelefono, { tipo: "hoja", ancho: 300, alto: 300 });
    // x = 16 + (343 - 300) / 2 = 37.5
    expect(geo.x).toBe(37.5);
    // y = 667 - 300 = 367 (anclado abajo)
    expect(geo.y).toBe(367);
    expect(geo.ancho).toBe(300);
    expect(geo.alto).toBe(300);
  });

  it("hoja en escritorio se centra igual que ventana", () => {
    const geo = geometriaVentana(viewportEscritorio, { tipo: "hoja", ancho: 700, alto: 500 });
    expect(geo.x).toBe(290); // (1280 - 700) / 2 = 290
    expect(geo.y).toBe(150); // (800 - 500) / 2 = 150
  });

  it("panel-lateral se ancla a la izquierda con margen", () => {
    const geo = geometriaVentana(viewportEscritorio, { tipo: "panel-lateral", ancho: 400, alto: 800 });
    expect(geo.x).toBe(0); // margen 0 en escritorio
    expect(geo.y).toBe(0);
    expect(geo.ancho).toBe(400);
    expect(geo.alto).toBe(800);
  });

  it("tipoAparato clasifica correctamente por ancho y puntero", () => {
    // Teléfono siempre por ancho estrecho (< 430), puntero no cambia esto
    expect(tipoAparato({ ancho: 375, alto: 667, puntero: false, xr: false })).toBe("telefono");
    expect(tipoAparato({ ancho: 375, alto: 667, puntero: true, xr: false })).toBe("telefono");
    // Tableta: 430-767 sin puntero
    expect(tipoAparato({ ancho: 767, alto: 1024, puntero: false, xr: false })).toBe("tableta");
    // Con puntero, el umbral de tableta sube a escritorio (768+)
    expect(tipoAparato({ ancho: 768, alto: 1024, puntero: true, xr: false })).toBe("escritorio");
    // 768 sin puntero también es escritorio (ancho < 768 es false, cae en < 1280)
    expect(tipoAparato({ ancho: 768, alto: 1024, puntero: false, xr: false })).toBe("escritorio");
    expect(tipoAparato({ ancho: 1024, alto: 768, puntero: false, xr: false })).toBe("escritorio");
    expect(tipoAparato({ ancho: 1440, alto: 900, puntero: false, xr: false })).toBe("grande");
    expect(tipoAparato({ ancho: 1920, alto: 1080, puntero: false, xr: true })).toBe("xr");
  });
});