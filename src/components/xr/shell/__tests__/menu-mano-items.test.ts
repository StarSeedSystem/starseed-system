/**
 * Pruebas de `menu-mano-items.ts` (XR1010N): funciones puras, sin red ni WebGL.
 * Contrato `architecture/starseed-xr.md` §3 a/e: salir y recentrar SIEMPRE, salir primero,
 * acorta en «una-mano» y posiciona en la muñeca de la mano NO dominante (≤ 15 cm).
 */
import { describe, it, expect } from "vitest";
import { ACCIONES_XR, MAPAS_DEFECTO } from "../../../../lib/xr/vinculos-xr";
import { disponerTrinity, type NodoEspacial } from "../../../../lib/xr/espacio-trinity";
import type { Mano } from "../../../../lib/xr/tipos";
import { botonMenuMando, itemsMenuMano, posicionMenu, type PoseMuneca } from "../menu-mano-items";

/** Muñeca de una palma hacia arriba hacia la cara: cuaternión de giro 180° sobre Y (palma en -z mira +z). */
const muneca: PoseMuneca = { pos: [0.2, 1.4, -0.3], rot: [0, 0, 0, 1] };
/** La otra muñeca, a metros de la anterior. */
const otraMuñeca: PoseMuneca = { pos: [-0.25, 1.35, -0.35], rot: [0, 1, 0, 0] };

function nodoMenu(): NodoEspacial {
    const d = disponerTrinity({ alturaOjos: 1.6, postura: "de-pie", manoDominante: "derecha", modo: "vr-inmersivo" });
    return d.nodos.menuMano;
}

describe("itemsMenuMano", () => {
    it("«salir» y «recentrar» están SIEMPRE y «salir» va primero (toca el pulgar)", () => {
        for (const postura of ["de-pie", "sentado", "una-mano"] as const) {
            const ids = itemsMenuMano({ postura, hablando: false, calidadAuto: true }).map((i) => i.id);
            expect(ids[0]).toBe("salir");
            expect(ids).toContain("recentrar");
        }
    });

    it("con una mano la lista es más corta pero conserva ambas fijas", () => {
        const completa = itemsMenuMano({ postura: "de-pie", hablando: false, calidadAuto: true });
        const corta = itemsMenuMano({ postura: "una-mano", hablando: false, calidadAuto: true });
        expect(corta.length).toBeLessThan(completa.length);
        const ids = corta.map((i) => i.id);
        expect(ids).toContain("salir");
        expect(ids).toContain("recentrar");
        expect(ids).not.toContain("dock");
        expect(ids).not.toContain("ajustes");
    });

    it("cada acción es una AccionXR del núcleo o una pestaña declarada (calidad/ajustes)", () => {
        for (const item of itemsMenuMano({ postura: "de-pie", hablando: false, calidadAuto: true })) {
            const esAccion = (ACCIONES_XR as readonly string[]).includes(item.accion);
            const esPestana = item.accion === "calidad" || item.accion === "ajustes";
            expect(esAccion || esPestana).toBe(true);
        }
    });

    it("la etiqueta de calidad refleja «auto» y la de voz cambia al silenciar", () => {
        const auto = itemsMenuMano({ postura: "de-pie", hablando: false, calidadAuto: true }).find((i) => i.id === "calidad");
        const fija = itemsMenuMano({ postura: "de-pie", hablando: false, calidadAuto: false }).find((i) => i.id === "calidad");
        expect(auto?.etiqueta).toContain("auto");
        expect(fija?.etiqueta).not.toContain("auto");
        const callando = itemsMenuMano({ postura: "de-pie", hablando: true, calidadAuto: true }).find((i) => i.id === "hablar");
        expect(callando?.etiqueta).toBe("Silenciar");
    });
});

describe("posicionMenu", () => {
    it("queda pegado a la muñeca: a ≤ 15 cm con cualquier mano", () => {
        const nodo = nodoMenu();
        for (const mano of ["izquierda", "derecha"] as Mano[]) {
            const pose = posicionMenu(muneca, mano, nodo);
            const d = Math.hypot(pose.posicion[0] - muneca.pos[0], pose.posicion[1] - muneca.pos[1], pose.posicion[2] - muneca.pos[2]);
            expect(d).toBeLessThanOrEqual(0.15);
        }
    });

    it("cambia de muñeca con la dominante: otra pose y otra mano dan otro sitio", () => {
        const nodo = nodoMenu();
        const a = posicionMenu(muneca, "izquierda", nodo);
        const b = posicionMenu(otraMuñeca, "izquierda", nodo);
        const d = Math.hypot(a.posicion[0] - b.posicion[0], a.posicion[1] - b.posicion[1], a.posicion[2] - b.posicion[2]);
        expect(d).toBeGreaterThan(0.1);
    });

    it("la misma muñeca con la otra mano no da la misma rotación (espejo del texto)", () => {
        const nodo = nodoMenu();
        const izq = posicionMenu(muneca, "izquierda", nodo);
        const der = posicionMenu(muneca, "derecha", nodo);
        expect(izq.rotacion).not.toEqual(der.rotacion);
    });

    it("compone el giro de la muñeca en la posición (más allá del desplazamiento local)", () => {
        const nodo = nodoMenu();
        const girada: PoseMuneca = { pos: muneca.pos, rot: [0, 0.70710678, 0, 0.70710678] };
        const d1 = posicionMenu(muneca, "izquierda", nodo).posicion;
        const d2 = posicionMenu(girada, "izquierda", nodo).posicion;
        const dd = Math.hypot(d1[0] - d2[0], d1[1] - d2[1], d1[2] - d2[2]);
        expect(dd).toBeGreaterThan(0.01);
    });
});

describe("botonMenuMando", () => {
    it("el mapa por defecto de mandos abre el menú con el A/X izquierdo (botón 4), y no otro", () => {
        expect(botonMenuMando(MAPAS_DEFECTO.mandos)).toEqual({ indice: 4, mano: "izquierda" });
    });

    it("un mapa sin gatillo de botón para «menu-mano» deja el mando sin abrir el menú", () => {
        expect(botonMenuMando(MAPAS_DEFECTO.manos)).toBeNull();
        expect(botonMenuMando(undefined)).toBeNull();
    });
});
