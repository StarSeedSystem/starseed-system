import { describe, it, expect } from "vitest";
import {
    normalizeState,
    DESKTOP_TOP_INSET,
    type DesktopWindow,
} from "@/components/desktop/desktop-store";

// Rescate RTRLB1020N · casos de la rama nube/40126871156 adaptados a la API de hoy.
// La rama pedía `rectVentanaCentrada` / `recolocarVentanaEnPantalla`; main decidió
// OTRO contrato a propósito: las ventanas nuevas abren en cascada (openWindow) y
// las guardadas solo se reparan en la normalización (clampWindowY con la agenda
// B-1, para que ninguna ventana quede pintada bajo la barra translúcida). Aquí se
// prueban las partes de la rama que SÍ viven en la API de hoy, vía `normalizeState`.

/** Escritorio mínimo en crudo, con ventanas guardadas tal y como se persisten. */
function docConVentanas(ventanas: Record<string, unknown>[]): Record<string, unknown> {
    return {
        id: "desk-1",
        name: "Escritorio",
        icons: [],
        windows: ventanas.map((v, i) => ({
            id: `win-${i}`,
            contentRef: { type: "app", ref: "app-prueba" },
            ...v,
        })),
    };
}

/** Normaliza el doc y devuelve su primera ventana (nulidad exigida a mano). */
function ventanaNormalizada(ventanas: Record<string, unknown>[]): DesktopWindow {
    const estado = normalizeState({ desktops: [docConVentanas(ventanas)], activeId: "desk-1" });
    if (!estado) throw new Error("el doc normalizado no podía ser nulo");
    const ventana = estado.desktops[0]?.windows[0];
    if (!ventana) throw new Error("la ventana normalizada no podía faltar");
    return ventana;
}

describe("Ventanas del escritorio · posición guardada (rescate RTRLB1020N)", () => {
    it("deja intacta una posición guardada que ya está dentro", () => {
        const w = ventanaNormalizada([{ x: 120, y: 140, w: 700, h: 500, z: 1 }]);
        expect(w.x).toBe(120);
        expect(w.y).toBe(140);
        expect(w.w).toBe(700);
        expect(w.h).toBe(500);
    });

    it("no baja una ventana guardada por debajo de la barra superior", () => {
        const w = ventanaNormalizada([{ x: 100, y: 0, w: 700, h: 500, z: 1 }]);
        expect(w.y).toBe(DESKTOP_TOP_INSET);
    });

    it("usa el tamaño por defecto 760×520 cuando no se pide ninguno", () => {
        const w = ventanaNormalizada([{ x: 64, y: 80, z: 1 }]);
        expect(w.w).toBe(760);
        expect(w.h).toBe(520);
    });
});
