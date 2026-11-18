import { describe, it, expect } from "vitest";
import {
    planGrupoMalla,
    decidirMediosGrupo,
    paresSinEnlace,
    KBPS_VIDEO_POR_PAR,
    MAX_VIDEO_GRUPO_MALLA,
    type EnlaceGrupo
} from "../grupo-malla";

const MAC = "u-mac";
const TAB = "u-tab";
const NODO = "u-nodo";

const enl = (id: string, uid?: string, extra: Partial<EnlaceGrupo> = {}): EnlaceGrupo => ({
    id,
    nombre: id,
    abierto: true,
    ...(uid ? { uid } : {}),
    ...extra
});

describe("Prueba de la llamada de grupo de tres aparatos (TRI1118)", () => {
    it("(a) el plan con pedido 'audio' invita a los dos aparatos y no deja a nadie fuera", () => {
        const p = planGrupoMalla({
            miembros: [MAC, TAB, NODO],
            miUid: MAC,
            enlaces: [enl("e-tab", TAB), enl("e-nodo", NODO)],
            pedido: "audio"
        });
        expect(p.ok).toBe(true);
        expect(p.invitados).toHaveLength(2);
        expect(p.invitados.map(i => i.uid).sort()).toEqual([NODO, TAB]);
        expect(p.fuera.filter(f => f.uid === TAB || f.uid === NODO)).toHaveLength(0);
    });

    it("(b) decidirMediosGrupo con capacidad suficiente y con un enlace de 100 kbps", () => {
        const ok = decidirMediosGrupo("video", 3, [
            { nombre: "Tab", capacidadKbps: 2 * KBPS_VIDEO_POR_PAR },
            { nombre: "Nodo", capacidadKbps: 2 * KBPS_VIDEO_POR_PAR }
        ]);
        expect(ok.video).toBe(true);

        const fail = decidirMediosGrupo("video", 3, [
            { nombre: "Tab", capacidadKbps: 2 * KBPS_VIDEO_POR_PAR },
            { nombre: "Nodo", capacidadKbps: 100 }
        ]);
        expect(fail.video).toBe(false);
        expect(fail.motivo).toMatch(/100 kbps/);
        expect(fail.motivo).toMatch(/solo voz/);
    });

    it("(c) con MAX_VIDEO_GRUPO_MALLA + 1 aparatos baja a solo voz", () => {
        const d = decidirMediosGrupo("video", MAX_VIDEO_GRUPO_MALLA + 1, []);
        expect(d.video).toBe(false);
        expect(d.motivo).toMatch(/solo voz/);
    });

    it("(d) un enlace cerrado (abierto:false) queda en la lista de los que se quedan fuera con motivo no vacio", () => {
        const p = planGrupoMalla({
            miembros: [MAC, TAB],
            miUid: MAC,
            enlaces: [enl("e-tab", TAB, { abierto: false })],
            pedido: "audio"
        });
        const f = p.fuera.find(x => x.enlaceId === "e-tab");
        expect(f).toBeDefined();
        expect(f?.motivo).not.toBe("");
    });

    it("(e) un enlace sin uid no recibe invitacion", () => {
        const p = planGrupoMalla({
            miembros: [MAC, TAB],
            miUid: MAC,
            enlaces: [enl("e-anon", undefined)],
            pedido: "audio"
        });
        expect(p.invitados).toHaveLength(0);
        expect(p.fuera.some(f => f.enlaceId === "e-anon")).toBe(true);
    });

    it("(f) paresSinEnlace: desconexión parcial vs malla completa", () => {
        const tres = [
            { uid: MAC, nombre: "Mac", alcanza: [TAB, NODO] },
            { uid: TAB, nombre: "Tab", alcanza: [MAC] },
            { uid: NODO, nombre: "Nodo", alcanza: [MAC] }
        ];
        const pares = paresSinEnlace(tres);
        expect(pares).toEqual([["Nodo", "Tab"]]);

        const completa = [
            { uid: MAC, nombre: "Mac", alcanza: [TAB, NODO] },
            { uid: TAB, nombre: "Tab", alcanza: [MAC, NODO] },
            { uid: NODO, nombre: "Nodo", alcanza: [MAC, TAB] }
        ];
        expect(paresSinEnlace(completa)).toEqual([]);
    });
});
