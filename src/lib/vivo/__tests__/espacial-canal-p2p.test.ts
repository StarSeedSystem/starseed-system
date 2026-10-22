import { describe, expect, it, vi } from "vitest";
import type { MeshHandle, PeerEvents, PeerSnapshot, SignalTransport } from "@/lib/network/webrtc-mesh";
import type { ConexionEscena, EventoEscena } from "@/lib/vivo/espacial/canal";
import { abrirCanalEscenaP2P, motivoRechazoP2P, type OpcionesCanalP2P } from "@/lib/vivo/espacial/canal-p2p";

/** Malla falsa: conecta pares en memoria, sin red ni WebRTC. */
function hub() {
    const nodos = new Map<string, { oy: Set<PeerEvents>; pares: Set<string> }>();
    const snap = (deviceId: string, abierto: boolean): PeerSnapshot => ({ deviceId, state: abierto ? "connected" : "closed", channelOpen: abierto, lastUpdate: 0 });
    const avisar = (a: string, b: string, abierto: boolean) => nodos.get(a)?.oy.forEach((e) => e.onState?.(snap(b, abierto)));
    const crearMalla = (miId: string): MeshHandle => {
        const nodo = { oy: new Set<PeerEvents>(), pares: new Set<string>() };
        nodos.set(miId, nodo);
        const enviar = (to: string, data: string) => { if (!nodo.pares.has(to)) return false; nodos.get(to)?.oy.forEach((e) => e.onMessage?.(miId, data)); return true; };
        return {
            myDeviceId: miId, userId: "u", supported: true, signalingTransport: "realtime",
            async connectToDevice(to) {
                const otro = nodos.get(to);
                if (!otro) return snap(to, false);
                nodo.pares.add(to); otro.pares.add(miId);
                avisar(miId, to, true); avisar(to, miId, true);
                return snap(to, true);
            },
            onPeer(e) { nodo.oy.add(e); return () => nodo.oy.delete(e); },
            sendToPeer: enviar,
            broadcast: (data) => Array.from(nodo.pares).filter((p) => enviar(p, data)).length,
            getPeers: () => Array.from(nodo.pares).map((p) => snap(p, true)),
            closeMesh() {
                for (const p of Array.from(nodo.pares)) { nodos.get(p)?.pares.delete(miId); avisar(p, miId, false); }
                nodo.pares.clear(); nodos.delete(miId);
            },
        };
    };
    return { crearMalla, nodos };
}
const señal = {} as SignalTransport;
const esperar = () => new Promise((r) => setTimeout(r, 0));
function respaldoFalso() {
    const enviados: string[] = [];
    let oyFila: ((f: { rev: number; doc: unknown; titulo: null; acceso: null }) => void) | null = null;
    let oyMsg: ((e: EventoEscena, p: unknown) => void) | null = null;
    const c = { tema: "t", suscrito: () => true, enviar: (e: string) => { enviados.push(e); }, publicarPresencia: vi.fn(), onPresencia: () => () => {},
        onMensaje: (cb: typeof oyMsg) => { oyMsg = cb; return () => {}; },
        onFila: (cb: typeof oyFila) => { oyFila = cb; return () => {}; }, onSuscrito: () => () => {}, cerrar: vi.fn() };
    return { c: c as unknown as ConexionEscena, enviados,
        fila: (rev: number) => oyFila?.({ rev, doc: {}, titulo: null, acceso: null }),
        mensaje: (e: EventoEscena, p: unknown) => oyMsg?.(e, p) };
}
async function sala(ids: string[], extra: Partial<OpcionesCanalP2P> = {}) {
    const h = hub();
    const canales = ids.map((miId, i) => abrirCanalEscenaP2P("escena3d:x", { miId, señal, crearMalla: h.crearMalla, pares: ids.slice(0, i), ...extra })!);
    await esperar();
    return { h, canales };
}

describe("canal P2P de la escena", () => {
    it("dos pares intercambian pose y cambios", async () => {
        const { canales: [a, b] } = await sala(["a", "b"]);
        const recibidos: [string, unknown][] = [];
        b.onMensaje((e, p) => recibidos.push([e, p]));
        a.enviar("pose", { cabeza: [0, 1, 0] });
        a.enviar("cambios", { ops: [1] });
        expect(recibidos).toEqual([["pose", { cabeza: [0, 1, 0] }], ["cambios", { ops: [1] }]]);
        expect(a.modo()).toBe("p2p");
    });
    it("con tres pares el mensaje de A llega a B y a C una sola vez", async () => {
        const { canales: [a, b, c] } = await sala(["a", "b", "c"]);
        const enB = vi.fn(), enC = vi.fn();
        b.onMensaje(enB); c.onMensaje(enC);
        a.enviar("arrastre", { id: "o1" });
        expect(enB).toHaveBeenCalledTimes(1);
        expect(enC).toHaveBeenCalledTimes(1);
    });
    it("quien llega tarde pide el estado y lo recibe", async () => {
        const h = hub();
        const a = abrirCanalEscenaP2P("t", { miId: "a", señal, crearMalla: h.crearMalla })!;
        a.onMensaje((e) => { if (e === "pedir-estado") a.enviar("estado", { objetos: 3 }); });
        const tarde = abrirCanalEscenaP2P("t", { miId: "z", señal, crearMalla: h.crearMalla, pares: ["a"] })!;
        const llega = vi.fn();
        tarde.onMensaje(llega);
        await esperar();
        tarde.enviar("pedir-estado", {});
        expect(llega).toHaveBeenCalledWith("estado", { objetos: 3 });
    });
    it("la presencia entra al conectar y al cambiar, y sale al cerrarse el canal", async () => {
        const h = hub();
        const a = abrirCanalEscenaP2P("t", { miId: "a", señal, crearMalla: h.crearMalla })!;
        a.publicarPresencia({ nombre: "Ana" });
        let enA: Record<string, unknown> = {}, enC: Record<string, unknown> = {};
        a.onPresencia((e) => { enA = e; });
        const c = abrirCanalEscenaP2P("t", { miId: "c", señal, crearMalla: h.crearMalla, pares: ["a"] })!;
        c.onPresencia((e) => { enC = e; });
        await esperar();
        expect(enC).toEqual({ a: [{ nombre: "Ana" }] }); // a se anunció al abrirse el canal
        c.publicarPresencia({ nombre: "Ceci", modo: "vr" });
        expect(enA).toEqual({ a: [{ nombre: "Ana" }], c: [{ nombre: "Ceci", modo: "vr" }] });
        c.cerrar();
        expect(enA).toEqual({ a: [{ nombre: "Ana" }] });
        expect(a.suscrito()).toBe(false);
    });
    it("un oyente que lanza no rompe a los demás", async () => {
        const { canales: [a, b] } = await sala(["a", "b"]);
        const bueno = vi.fn();
        b.onMensaje(() => { throw new Error("roto"); });
        b.onMensaje(bueno);
        a.enviar("pose", { cabeza: [0, 0, 0] });
        expect(bueno).toHaveBeenCalledTimes(1);
    });
    it("el noveno par activa el respaldo y lo dice", async () => {
        const r = respaldoFalso();
        const ids = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"];
        const { canales } = await sala(ids, { respaldo: () => r.c });
        expect(canales.map((c) => c.modo())).toEqual(ids.map(() => "respaldo")); // toda la sala, no solo el noveno
        expect(canales[0].aviso()).toMatch(/más de 8 personas/);
        canales[0].enviar("cambios", { ops: [] });
        expect(r.enviados).toContain("cambios");
    });
    it("rechaza payloads con mapa, articulaciones, cámara o mirada, a cualquier profundidad", async () => {
        const { canales: [a, b] } = await sala(["a", "b"]);
        const llega = vi.fn();
        b.onMensaje(llega);
        a.enviar("pose", { mapa: {} });
        a.enviar("pose", { manos: { izq: { articulaciones: [] } } });
        a.enviar("pose", { camara: "x" });
        a.enviar("pose", { mirada: [0, 0, 1] });
        expect(llega).not.toHaveBeenCalled();
        expect(motivoRechazoP2P({ manos: { articulaciones: [] } })).toMatch(/articulaciones/);
    });
    it("rechaza un mensaje de 65 KB y los binarios", async () => {
        const { canales: [a, b] } = await sala(["a", "b"]);
        const llega = vi.fn();
        b.onMensaje(llega);
        a.enviar("cambios", { relleno: "x".repeat(65 * 1024) });
        a.enviar("cambios", { datos: new Uint8Array(4) as unknown as number[] });
        expect(llega).not.toHaveBeenCalled();
    });
    it("descarta eventos que no son de la escena, venga de donde venga", async () => {
        const { h, canales: [, b] } = await sala(["a", "b"]);
        const llega = vi.fn();
        b.onMensaje(llega);
        h.nodos.get("b")!.oy.forEach((e) => e.onMessage?.("a", JSON.stringify({ e: "borrar-todo", p: {}, de: "a", n: 99 })));
        h.nodos.get("b")!.oy.forEach((e) => e.onMessage?.("a", JSON.stringify({ e: "pose", p: {}, de: "intruso", n: 1 })));
        expect(llega).not.toHaveBeenCalled();
    });
    it("sin pares ni respaldo, suscrito() es false; con un par pasa a true", async () => {
        const h = hub();
        const a = abrirCanalEscenaP2P("t", { miId: "a", señal, crearMalla: h.crearMalla })!;
        const cambios: boolean[] = [];
        a.onSuscrito((ok) => cambios.push(ok));
        expect(a.suscrito()).toBe(false);
        abrirCanalEscenaP2P("t", { miId: "b", señal, crearMalla: h.crearMalla, pares: ["a"] });
        await esperar();
        expect(a.suscrito()).toBe(true);
        expect(cambios).toEqual([true]);
    });
    it("las filas persistidas llegan por el respaldo; sin respaldo, onFila nunca dispara", async () => {
        const r = respaldoFalso();
        const { canales: [a, b] } = await sala(["a", "b"], {});
        const conRespaldo = abrirCanalEscenaP2P("t2", { miId: "c", señal, crearMalla: hub().crearMalla, respaldo: () => r.c })!;
        const filas = vi.fn(), nada = vi.fn();
        conRespaldo.onFila(filas); a.onFila(nada); b.onFila(nada);
        r.fila(7);
        expect(filas).toHaveBeenCalledWith(expect.objectContaining({ rev: 7 }));
        expect(nada).not.toHaveBeenCalled();
        expect(conRespaldo.suscrito()).toBe(true);
    });
    it("cerrar() libera la malla, los oyentes y el respaldo", async () => {
        const r = respaldoFalso();
        const { h, canales: [a, b] } = await sala(["a", "b"], { respaldo: () => r.c });
        const llega = vi.fn();
        a.onMensaje(llega);
        a.cerrar();
        b.enviar("pose", { cabeza: [] });
        expect(llega).not.toHaveBeenCalled();
        expect(h.nodos.has("a")).toBe(false);
        expect(r.c.cerrar).toHaveBeenCalled();
        expect(() => a.enviar("pose", {})).not.toThrow();
    });
    it("sin WebRTC devuelve null para que quien llama use el canal de siempre", () => {
        expect(abrirCanalEscenaP2P("t", { miId: "a", señal, crearMalla: () => null })).toBeNull();
        expect(abrirCanalEscenaP2P("", { miId: "a", señal })).toBeNull();
    });
    it("la presencia que llega sin meta válida queda como nula y no rompe el estado", async () => {
        const { h, canales: [, b] } = await sala(["a", "b"]);
        const estados: Record<string, unknown>[] = [];
        b.onPresencia((e) => estados.push(e));
        // meta no-objeto, meta vacía y ausencia de meta: nula, no crash ni contenido
        h.nodos.get("b")!.oy.forEach((e) => e.onMessage?.("a", JSON.stringify({ e: "_presencia", p: "suelo", de: "a", n: 1 })));
        h.nodos.get("b")!.oy.forEach((e) => e.onMessage?.("a", JSON.stringify({ e: "_presencia", p: {}, de: "a", n: 2 })));
        h.nodos.get("b")!.oy.forEach((e) => e.onMessage?.("a", JSON.stringify({ e: "_presencia", p: null, de: "a", n: 3 })));
        // «suelo» y null quedan nulos (sin contenido), el objeto vacío se conserva como meta
        expect(estados).toEqual([{}, { a: [{}] }, {}]);
    });
    it("al quedarse lleno sin canal de respaldo lo dice y queda sin conexión, sin lanzar", async () => {
        const ids = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"];
        const { canales } = await sala(ids);
        expect(canales.map((c) => c.modo())).toEqual(ids.map(() => "respaldo"));
        expect(canales[0].aviso()).toMatch(/canal de respaldo/);
        expect(canales[0].suscrito()).toBe(false);
        expect(() => canales[0].enviar("cambios", { ops: [] })).not.toThrow();
        expect(canales[0].enviar("estado", { lleno: true })).toBeUndefined();
    });
    it("tras pasar al respaldo los oyentes vuelven a engancharse: lo del respaldo entra una vez", async () => {
        const r = respaldoFalso();
        const ids = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"];
        const { canales: [primero] } = await sala(ids, { respaldo: () => r.c });
        const llega = vi.fn();
        primero.onMensaje(llega);
        r.mensaje("estado", { objetos: 2 });
        expect(llega).toHaveBeenCalledTimes(1);
        expect(llega).toHaveBeenCalledWith("estado", { objetos: 2 });
        primero.cerrar();
        r.mensaje("pose", {});
        expect(llega).toHaveBeenCalledTimes(1); // cerrado, nada entra
    });
});
