import { describe, expect, it } from "vitest";
import { ACCIONES_XR } from "../../../../lib/xr/vinculos-xr";
import { disponerTrinity } from "../../../../lib/xr/espacio-trinity";
import type { Postura, Vec3 } from "../../../../lib/xr/tipos";
import {
    itemsMenuMano,
    manoMenuDe,
    posicionMenu,
    type Cuaternion,
    type ItemMenuMano,
} from "../menu-mano-items";

const POSTURAS: readonly Postura[] = ["de-pie", "sentado", "una-mano"];
const BASE = { postura: "de-pie" as Postura, hablando: false, calidadAuto: true };
const ids = (items: ItemMenuMano[]) => items.map((i) => i.id);
const nodoMenu = disponerTrinity({ alturaOjos: 1.65, postura: "de-pie", manoDominante: "derecha", modo: "vr-inmersivo" }).nodos.menuMano;
const MUNECA = { pos: [0.25, 1.1, -0.3] as Vec3, rot: [0, 0, 0, 1] as Cuaternion };

describe("itemsMenuMano · orden y obligatorios", () => {
    it("salir y recentrar están en TODAS las posturas, salir siempre el primero", () => {
        for (const postura of POSTURAS) {
            const lista = itemsMenuMano({ ...BASE, postura });
            expect(lista[0].id).toBe("salir");
            expect(ids(lista)).toContain("recentrar");
        }
    });

    it("recentrar va justo después de salir (los dos que evitan quedar atrapado)", () => {
        for (const postura of POSTURAS) {
            const lista = ids(itemsMenuMano({ ...BASE, postura }));
            expect(lista.indexOf("recentrar")).toBe(lista.indexOf("salir") + 1);
        }
    });

    it("de pie lleva los seis botones, sin ids repetidos", () => {
        const lista = itemsMenuMano(BASE);
        expect(lista).toHaveLength(6);
        expect(new Set(ids(lista)).size).toBe(6);
    });

    it("a una mano la lista es más corta pero conserva salir y recentrar", () => {
        const una = itemsMenuMano({ ...BASE, postura: "una-mano" });
        expect(una.length).toBeLessThan(itemsMenuMano(BASE).length);
        expect(ids(una)).toContain("salir");
        expect(ids(una)).toContain("recentrar");
    });
});

describe("itemsMenuMano · etiquetas y acciones", () => {
    it("hablando cambia la etiqueta de hablar pero no su acción", () => {
        const callado = itemsMenuMano({ ...BASE, hablando: false }).find((i) => i.id === "hablar")!;
        const hablando = itemsMenuMano({ ...BASE, hablando: true }).find((i) => i.id === "hablar")!;
        expect(hablando.etiqueta).not.toBe(callado.etiqueta);
        expect(hablando.accion).toBe("hablar");
    });

    it("calidadAuto cambia la etiqueta de calidad sin cambiar su acción", () => {
        const auto = itemsMenuMano({ ...BASE, calidadAuto: true }).find((i) => i.id === "calidad")!;
        const fija = itemsMenuMano({ ...BASE, calidadAuto: false }).find((i) => i.id === "calidad")!;
        expect(auto.etiqueta).not.toBe(fija.etiqueta);
        expect(auto.accion).toBe("calidad");
    });

    it("las acciones de los botones del núcleo son AccionXR válidas", () => {
        const porId = new Map(itemsMenuMano(BASE).map((i) => [i.id, i]));
        for (const id of ["salir", "recentrar", "hablar", "dock"] as const) {
            expect(ACCIONES_XR).toContain(porId.get(id)!.accion);
        }
        expect(porId.get("calidad")!.accion).toBe("calidad");
        expect(porId.get("ajustes")!.accion).toBe("ajustes");
    });

    it("la mano que lleva el menú es la contraria a la dominante", () => {
        expect(manoMenuDe("derecha")).toBe("izquierda");
        expect(manoMenuDe("izquierda")).toBe("derecha");
    });
});

describe("posicionMenu · pegado a la muñeca no dominante", () => {
    it("queda a 15 cm o menos de la muñeca", () => {
        for (const mano of ["izquierda", "derecha"] as const) {
            const { posicion } = posicionMenu(MUNECA, mano, nodoMenu);
            const d = Math.hypot(posicion[0] - MUNECA.pos[0], posicion[1] - MUNECA.pos[1], posicion[2] - MUNECA.pos[2]);
            expect(d).toBeLessThanOrEqual(0.15);
        }
    });

    it("cambia de lado según la mano que lo lleva", () => {
        const izq = posicionMenu(MUNECA, "izquierda", nodoMenu);
        const der = posicionMenu(MUNECA, "derecha", nodoMenu);
        expect(izq.posicion).not.toEqual(der.posicion);
        expect(izq.posicion[0]).toBeLessThan(der.posicion[0]);
    });

    it("sube sobre la muñeca con el desplazamiento local del nodo", () => {
        const { posicion } = posicionMenu(MUNECA, "derecha", nodoMenu);
        expect(posicion[1]).toBeGreaterThan(MUNECA.pos[1]);
    });

    it("devuelve un cuaternión unitario que sigue la rotación de la muñeca", () => {
        const quieta = posicionMenu(MUNECA, "derecha", nodoMenu).rotacion;
        const girada = posicionMenu({ pos: MUNECA.pos, rot: [0, Math.SQRT1_2, 0, Math.SQRT1_2] }, "derecha", nodoMenu).rotacion;
        expect(Math.hypot(...quieta)).toBeCloseTo(1, 6);
        expect(Math.hypot(...girada)).toBeCloseTo(1, 6);
        expect(girada).not.toEqual(quieta);
    });
});
