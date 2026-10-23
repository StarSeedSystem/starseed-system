import { describe, expect, it, vi } from "vitest";
import type { MeshHandle, PeerEvents, PeerSnapshot, SignalTransport } from "@/lib/network/webrtc-mesh";
import type { ConexionEscena, FilaCambiada } from "@/lib/vivo/espacial/canal";
import {
    abrirCanalEscenaP2P, motivoRechazoP2P, TOPE_MENSAJE_P2P, type OpcionesCanalP2P,
} from "@/lib/vivo/espacial/canal-p2p";

const LA_SEÑAL = {} as SignalTransport;

/** Malla falsa sobre la red: pares conectados en memoria, sin WebRTC ni red real. */
function centro() {
    const nodos = new Map<string, { oy: Set<PeerEvents>; pares: Set<string> }>();
    const snap = (id: string, abierto: boolean): PeerSnapshot =>
        ({ deviceId: id, state: abierto ? "connected" : "closed", channelOpen: abierto, lastUpdate: 0 });
    const avisar = (quien: string, sobre: string, abierto: boolean): void => {
        nodos.get(quien)?.oy.forEach((e) => e.onState?.(snap(sobre, abierto)));
    };
    const enviarA = (de: string, para: string, data: string): boolean => {
        if (!nodos.get(para)?.pares.has(de)) return false;
        nodos.get(para)?.oy.forEach((e) => e.onMessage?.(de, data));
        return true;
    };
    const crearMalla = (miId: string): MeshHandle => {
        const yo = { oy: new Set<PeerEvents>(), pares: new Set<string>() };
        nodos.set(miId, yo);
        return {
            myDeviceId: miId, userId: "u", supported: true, signalingTransport: "realtime",
            async connectToDevice(to) {
                if (!nodos.has(to)) return snap(to, false);
                yo.pares.add(to); nodos.get(to)?.pares.add(miId);
                avisar(miId, to, true); avisar(to, miId, true);
                return snap(to, true);
            },
            onPeer(e) { yo.oy.add(e); return () => { yo.oy.delete(e); }; },
            sendToPeer: (to, data) => enviarA(miId, to, data),
            broadcast: (data) => Array.from(yo.pares).filter((p) => enviarA(miId, p, data)).length,
            getPeers: () => Array.from(yo.pares).map((p) => snap(p, true)),
            closeMesh() {
                for (const p of Array.from(yo.pares)) { nodos.get(p)?.pares.delete(miId); avisar(p, miId, false); }
                yo.pares.clear(); nodos.delete(miId);
            },
        };
    };
    const abrir = async (ids: string[], extra: Partial<OpcionesCanalP2P> = {}) => {
        const canales = ids.map((miId, i) =>
            abrirCanalEscenaP2P("escena3d-test", { miId, señal: LA_SEÑAL, crearMalla, pares: ids.slice(0, i), ...extra })!);
        await new Promise((r) => setTimeout(r, 0));
        return canales;
    };
    return { abrir, nodos, crearMalla };
}

/** Canal de Supabase falso para el respaldo. */
function respaldoFalso() {
    const enviados: [string, unknown][] = [];
    let oyFila: ((f: FilaCambiada) => void) | null = null;
    return {
        enviados,
        c: {
            tema: "respaldo", suscrito: () => true,
            enviar: (e: string, p: unknown) => { enviados.push([e, p]); },
            publicarPresencia: vi.fn(),
            onPresencia: () => () => undefined,
            onMensaje: () => () => undefined,
            onFila: (cb: (f: FilaCambiada) => void) => { oyFila = cb; return () => { oyFila = null; }; },
            onSuscrito: () => () => undefined,
            cerrar: vi.fn(),
        } satisfies ConexionEscena,
        emitirFila: (rev: number) => oyFila?.({ rev, doc: {}, titulo: null, acceso: null }),
    };
}

describe("canal P2P de la escena", () => {
    it("dos pares intercambian pose y cambios", async () => {
        const { abrir } = centro();
        const [a, b] = await abrir(["a", "b"]);
        const llegan: string[] = [];
        b.onMensaje((e, p) => llegan.push(`${e}:${JSON.stringify(p)}`));
        a.enviar("pose", { cabeza: [1, 2, 3] });
        a.enviar("cambios", { ops: ["pon"] });
        expect(llegan).toEqual([
            `pose:${JSON.stringify({ cabeza: [1, 2, 3] })}`,
            `cambios:${JSON.stringify({ ops: ["pon"] })}`,
        ]);
        expect(a.modo()).toBe("p2p");
        expect(a.suscrito()).toBe(true);
    });

    it("tres pares: lo de A llega a B y a C una sola vez a cada uno", async () => {
        const { abrir } = centro();
        const [a, b, c] = await abrir(["a", "b", "c"]);
        const enB = vi.fn(), enC = vi.fn();
        b.onMensaje(enB);
        c.onMensaje(enC);
        a.enviar("arrastre", { id: "o1", d: [0, 0, 1] });
        expect(enB).toHaveBeenCalledTimes(1);
        expect(enC).toHaveBeenCalledTimes(1);
    });

    it("quien llega tarde pide estado y lo recibe", async () => {
        const { abrir } = centro();
        const [, b, tar] = await abrir(["a", "b", "tar"]);
        const llega = vi.fn();
        tar.onMensaje(llega);
        b.onMensaje((e) => { if (e === "pedir-estado") b.enviar("estado", { objetos: 3 }); });
        tar.enviar("pedir-estado", {});
        expect(llega).toHaveBeenCalledWith("estado", { objetos: 3 });
    });

    it("presencia: anuncio al conectar, actualización y retirada al cerrar el canal", async () => {
        const { abrir, crearMalla } = centro();
        const [a] = await abrir(["a"]);
        a.publicarPresencia({ nombre: "Ana" });
        const enA: Record<string, unknown>[] = [];
        a.onPresencia((e) => enA.push(e));
        const t = abrirCanalEscenaP2P("escena3d-test", { miId: "t", señal: LA_SEÑAL, crearMalla, pares: ["a"] })!;
        const enT: Record<string, unknown>[] = [];
        t.onPresencia((e) => enT.push(e));
        await new Promise((r) => setTimeout(r, 0));
        expect(enT).toEqual([{ a: [{ nombre: "Ana" }] }]); // al abrirse el canal, a se anunció solo
        t.publicarPresencia({ nombre: "Tito" });
        expect(enA).toEqual([{ a: [{ nombre: "Ana" }], t: [{ nombre: "Tito" }] }]);
        t.publicarPresencia({ nombre: "Tito", vr: true });
        expect(enA).toEqual([
            { a: [{ nombre: "Ana" }], t: [{ nombre: "Tito" }] },
            { a: [{ nombre: "Ana" }], t: [{ nombre: "Tito", vr: true }] },
        ]);
        t.cerrar();
        expect(enA.at(-1)).toEqual({ a: [{ nombre: "Ana" }] });
        expect(a.suscrito()).toBe(false);
    });

    it("viaja como {e, p, de, n}: sin sobre válido, con «de» falsificado o repetido, no entra", async () => {
        const { abrir, nodos } = centro();
        const [, b] = await abrir(["a", "b"]);
        const llega = vi.fn();
        b.onMensaje(llega);
        nodos.get("b")?.oy.forEach((e) => e.onMessage?.("a", JSON.stringify({ e: "pose", p: { x: 1 }, de: "a", n: 1 })));
        nodos.get("b")?.oy.forEach((e) => e.onMessage?.("a", JSON.stringify({ e: "pose", p: { x: 2 }, de: "intruso", n: 2 })));
        nodos.get("b")?.oy.forEach((e) => e.onMessage?.("a", JSON.stringify({ e: "pose", p: { x: 3 }, de: "a", n: 1 })));
        nodos.get("b")?.oy.forEach((e) => e.onMessage?.("a", "no es json"));
        nodos.get("b")?.oy.forEach((e) => e.onMessage?.("a", JSON.stringify({ e: "borrar-todo", p: {}, de: "a", n: 9 })));
        expect(llega).toHaveBeenCalledTimes(1);
        expect(llega).toHaveBeenCalledWith("pose", { x: 1 });
    });

    it("un oyente que lanza no tumba a los demás", async () => {
        const { abrir } = centro();
        const [a, b] = await abrir(["a", "b"]);
        const bueno = vi.fn();
        b.onMensaje(() => { throw new Error("roto"); });
        b.onMensaje(bueno);
        a.enviar("pose", { cabeza: [9] });
        expect(bueno).toHaveBeenCalledTimes(1);
        expect(b.modo()).toBe("p2p");
    });

    it("el noveno par activa el respaldo para toda la sala y lo dice", async () => {
        const r = respaldoFalso();
        const { abrir } = centro();
        const ids = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"];
        const canales = await abrir(ids, { respaldo: () => r.c });
        expect(canales.map((c) => c.modo())).toEqual(ids.map(() => "respaldo"));
        expect(canales[0].aviso()).toContain("más de 8");
        canales[0].enviar("cambios", { ops: [] });
        expect(r.enviados).toEqual([["cambios", { ops: [] }]]);
    });

    it("en modo respaldo, enviar y publicarPresencia van al canal de siempre", async () => {
        const r = respaldoFalso();
        const { abrir } = centro();
        const ids = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"];
        const [a] = await abrir(ids, { respaldo: () => r.c });
        a.publicarPresencia({ nombre: "Ana" });
        a.enviar("estado", { cabezas: 0 });
        expect(r.c.publicarPresencia).toHaveBeenCalledWith({ nombre: "Ana" });
        expect(r.enviados).toEqual([["estado", { cabezas: 0 }]]);
        a.onFila((f) => undefined);
        r.emitirFila(3);
    });

    it("rechaza cámara, mapa, mirada y articulaciones a cualquier profundidad", async () => {
        const { abrir } = centro();
        const [a, b] = await abrir(["a", "b"]);
        const llega = vi.fn();
        b.onMensaje(llega);
        a.enviar("pose", { cabeza: { dentro: { mapa: [] } } });
        a.enviar("pose", { manos: { izq: { articulaciones: [1, 2] } } });
        a.enviar("estado", { camara: "x" });
        a.enviar("cambios", { vista: { mirada: [1, 2, 3] } });
        expect(llega).not.toHaveBeenCalled();
        expect(motivoRechazoP2P({ manos: { izq: { articulaciones: [] } } })).toContain("articulaciones");
        expect(motivoRechazoP2P({ ok: { bien: [1, 2] } })).toBeNull();
    });

    it("64 KB justo pasa; 64 KB + 1 se rechaza al enviar y al recibir", async () => {
        const { abrir, nodos } = centro();
        const [a, b] = await abrir(["a", "b"]);
        const llegan: string[] = [];
        b.onMensaje((e) => llegan.push(e));
        const nota = "x".repeat(TOPE_MENSAJE_P2P - 11);
        const margen = TOPE_MENSAJE_P2P - JSON.stringify({ e: "cambios", p: { nota }, de: "a", n: 1 }).length; // sobre {e,p,de,n} justo en el tope
        a.enviar("cambios", { nota: "x".repeat(TOPE_MENSAJE_P2P - 11 + margen) });
        expect(llegan).toEqual(["cambios"]);
        llegan.length = 0;
        a.enviar("cambios", { nota: "x".repeat(TOPE_MENSAJE_P2P - 10 + margen) });
        expect(llegan).toEqual([]);
        nodos.get("b")?.oy.forEach((e) => e.onMessage?.("a", "y".repeat(TOPE_MENSAJE_P2P + 1)));
        expect(llegan).toEqual([]);
        expect(motivoRechazoP2P({ nota: "x".repeat(TOPE_MENSAJE_P2P) })).toBeNull(); // el texto pasa; solo el sobre mide
    });

    it("sin pares ni respaldo, suscrito() es false; al conectar avisa onSuscrito(true)", async () => {
        const { abrir } = centro();
        const [a] = await abrir(["a"]);
        const cambios: boolean[] = [];
        a.onSuscrito((ok) => cambios.push(ok));
        expect(a.suscrito()).toBe(false);
        await abrir(["solo-b"], { pares: ["a"] });
        expect(a.suscrito()).toBe(true);
        expect(cambios).toEqual([true]);
    });

    it("las filas persistidas llegan por el respaldo; sin él onFila nunca dispara", async () => {
        const r = respaldoFalso();
        const { abrir } = centro();
        const [a, b] = await abrir(["a", "b"]);
        const revs: number[] = [];
        a.onFila(() => undefined);
        b.onFila(() => undefined);
        const conRespaldo = (await abrir(["c"], { respaldo: () => r.c }))[0];
        conRespaldo.onFila((f) => revs.push(f.rev));
        r.emitirFila(7);
        r.emitirFila(8);
        expect(revs).toEqual([7, 8]);
        expect(conRespaldo.suscrito()).toBe(true);
    });

    it("cerrar() suelta malla, respaldo y oyentes; seguir usándolo no explota", async () => {
        const r = respaldoFalso();
        const { abrir, nodos } = centro();
        const [a, b] = await abrir(["a", "b"], { respaldo: () => r.c });
        const llega = vi.fn();
        a.onMensaje(llega);
        a.cerrar();
        b.enviar("pose", { cabeza: [] });
        expect(llega).not.toHaveBeenCalled();
        expect(nodos.has("a")).toBe(false);
        expect(r.c.cerrar).toHaveBeenCalled();
        expect(() => a.enviar("pose", { cabeza: [] })).not.toThrow();
        expect(() => a.publicarPresencia({ nombre: "Ana" })).not.toThrow();
    });

    it("sin WebRTC devuelve null; sin tema o sin miId también", () => {
        expect(abrirCanalEscenaP2P("escena3d-test", { miId: "a", señal: LA_SEÑAL, crearMalla: () => null })).toBeNull();
        expect(abrirCanalEscenaP2P("", { miId: "a", señal: LA_SEÑAL })).toBeNull();
        expect(abrirCanalEscenaP2P("t", { miId: "", señal: LA_SEÑAL })).toBeNull();
    });

    it("con contexto válido conserva el tema de la sala", () => {
        const { crearMalla } = centro();
        const canal = abrirCanalEscenaP2P("escena3d-test", { miId: "a", señal: LA_SEÑAL, crearMalla });
        expect(canal?.tema).toBe("escena3d-test");
        canal?.cerrar();
    });

    it("cada on* devuelve su baja: tras desuscribir, ese oyente ya no recibe nada", async () => {
        const r = respaldoFalso();
        const { abrir } = centro();
        const [a, b] = await abrir(["a", "b"]);

        const mensajes = vi.fn();
        b.onMensaje(mensajes)();
        a.enviar("pose", { cabeza: [1] });
        expect(mensajes).not.toHaveBeenCalled();

        const presencias = vi.fn();
        b.onPresencia(presencias)();
        a.publicarPresencia({ nombre: "Ana" });
        expect(presencias).not.toHaveBeenCalled();

        const suscripciones = vi.fn();
        a.onSuscrito(suscripciones)();
        await abrir(["c"], { pares: ["a"] });
        expect(suscripciones).not.toHaveBeenCalled();

        const filas = vi.fn();
        const conRespaldo = (await abrir(["d"], { respaldo: () => r.c }))[0];
        conRespaldo.onFila(filas)();
        r.emitirFila(1);
        expect(filas).not.toHaveBeenCalled();
    });

    it("cerrar() repetido no explota y deja el canal cerrado", async () => {
        const { abrir } = centro();
        const [a] = await abrir(["a"]);
        expect(() => { a.cerrar(); a.cerrar(); }).not.toThrow();
        expect(a.suscrito()).toBe(false);
        expect(a.modo()).toBe("p2p");
    });
});
