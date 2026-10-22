/**
 * Escena 3D compartida · CANAL P2P (XR1010AA · `architecture/starseed-xr.md` §3 h). La MISMA
 * `ConexionEscena` de `./canal` sobre la malla WebRTC: malla completa hasta `maxPares` (7 = 8
 * personas); si se supera pasa al `respaldo()` (Supabase) y lo dice en `aviso()`. Las filas de
 * `os_spaces` llegan por el respaldo si lo hay: el P2P complementa, no sustituye. Mensajes JSON
 * `{e, p, de, n}`, solo `EVENTOS_ESCENA`, ≤ 64 KB, sin binarios ni datos que no salen del aparato.
 */
import { createMesh, type MeshHandle, type SignalTransport } from "@/lib/network/webrtc-mesh";
import { NUNCA_EN_REGISTROS } from "@/lib/xr/privacidad";
import { EVENTOS_ESCENA, type ConexionEscena, type EventoEscena, type FilaCambiada } from "./canal";

export const TOPE_MENSAJE_P2P = 64 * 1024;
export const MAX_PARES_P2P = 7;
/** Campos que nunca viajan por la sala, a ninguna profundidad (cámara, mapa, mirada, manos finas). */
export const CAMPOS_PROHIBIDOS_P2P: readonly string[] = ["camara", "mapa", "mirada", "articulaciones", ...NUNCA_EN_REGISTROS];
const PRESENCIA = "_presencia", LLENO = "_lleno"; // internos: no llegan a `onMensaje`

/** `pares`: ids de la sala a los que llamar (las ofertas de los demás se aceptan solas). `crearMalla`: inyectable, por defecto `createMesh`. */
export interface OpcionesCanalP2P {
    miId: string; señal: SignalTransport; ice?: RTCIceServer[]; maxPares?: number; respaldo?: () => ConexionEscena | null; pares?: readonly string[];
    crearMalla?: (miId: string, contexto: string, señal: SignalTransport, ice?: RTCIceServer[]) => MeshHandle | null;
}
export interface ConexionEscenaP2P extends ConexionEscena { modo(): "p2p" | "respaldo"; aviso(): string | null }

/** null si el payload puede viajar; si no, el motivo. */
export function motivoRechazoP2P(payload: unknown): string | null {
    const ver = (v: unknown, prof: number): string | null => {
        if (prof > 32) return "demasiado anidado";
        if (v === null || typeof v !== "object") return typeof v === "function" || typeof v === "bigint" ? "valor no JSON" : null;
        if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer || (typeof Blob !== "undefined" && v instanceof Blob)) return "binario";
        for (const [k, x] of Object.entries(v)) { const m = CAMPOS_PROHIBIDOS_P2P.includes(k) ? `campo «${k}» no sale del aparato` : ver(x, prof + 1); if (m) return m; }
        return null;
    };
    return ver(payload, 0);
}
/** Un oyente roto no tumba a los demás (mismo patrón que `./canal`). */
function emitir<A extends unknown[]>(oyentes: Set<(...a: A) => void>, ...args: A) { for (const cb of Array.from(oyentes)) try { cb(...args); } catch { /* sigue */ } }
export function abrirCanalEscenaP2P(tema: string, o: OpcionesCanalP2P): ConexionEscenaP2P | null {
    if (!tema || !o?.miId) return null;
    const max = Math.max(1, o.maxPares ?? MAX_PARES_P2P), lleno = `Hay más de ${max + 1} personas en la sala`;
    const abrirRespaldo = () => { try { return o.respaldo?.() ?? null; } catch { return null; } };
    let malla: MeshHandle | null; try { malla = (o.crearMalla ?? createMesh)(o.miId, tema, o.señal, o.ice); } catch { malla = null; }
    if (!malla) return null; // sin WebRTC: quien llama abre el canal de siempre
    const oyP = new Set<(e: Record<string, unknown>) => void>(), oyM = new Set<(ev: EventoEscena, p: unknown) => void>(), oyF = new Set<(f: FilaCambiada) => void>(), oyS = new Set<(ok: boolean) => void>();
    const presentes = new Map<string, Record<string, unknown> | null>(), vistos = new Set<string>(), bajas: (() => void)[] = [];
    let resp: ConexionEscena | null = null, modo: "p2p" | "respaldo" = "p2p", aviso: string | null = null;
    let meta: Record<string, unknown> | null = null, n = 0, cerrado = false, ultimoOk = false;
    const suscrito = () => (modo === "p2p" && presentes.size > 0) || !!resp?.suscrito();
    const revisar = () => { const ok = suscrito(); if (ok !== ultimoOk) { ultimoOk = ok; emitir(oyS, ok); } };
    const estadoPresencia = (): Record<string, unknown> =>
        Object.fromEntries([...(meta ? [[o.miId, meta]] : []), ...Array.from(presentes).filter(([, m]) => m)].map(([id, m]) => [id, [m]]));
    const empaquetar = (e: string, p: unknown) => { const s = JSON.stringify({ e, p, de: o.miId, n: ++n }); return s.length <= TOPE_MENSAJE_P2P ? s : null; };
    const engancharRespaldo = (todo: boolean) => {
        if (resp) bajas.push(resp.onFila((f) => emitir(oyF, f)), resp.onSuscrito(() => revisar()));
        if (resp && todo) bajas.push(resp.onMensaje((ev, p) => emitir(oyM, ev, p)), resp.onPresencia((e) => emitir(oyP, e)));
    };
    const pasarARespaldo = (motivo: string) => {
        if (modo === "respaldo") return; modo = "respaldo";
        const s = empaquetar(LLENO, null); // que TODA la sala pase junta, no solo quien lo ve
        try { if (s) malla?.broadcast(s); malla?.closeMesh(); } catch { /* best-effort */ }
        for (const b of bajas.splice(0)) b();
        presentes.clear(); resp = resp ?? abrirRespaldo();
        aviso = resp ? `${motivo}: la escena sigue por el canal de siempre.` : `${motivo} y no hay canal de respaldo: la escena queda sin conexión.`;
        engancharRespaldo(true);
        if (resp && meta) resp.publicarPresencia(meta);
        revisar();
    };
    const recibir = (de: string, data: string) => {
        if (modo !== "p2p" || typeof data !== "string" || data.length > TOPE_MENSAJE_P2P) return;
        let m: { e?: unknown; p?: unknown; de?: unknown; n?: unknown };
        try { m = JSON.parse(data); } catch { return; }
        const clave = `${de}|${m?.n}`;
        if (!m || m.de !== de || typeof m.n !== "number" || vistos.has(clave) || motivoRechazoP2P(m.p)) return;
        vistos.add(clave); if (vistos.size > 2000) vistos.delete(vistos.values().next().value as string);
        if (m.e === LLENO) return pasarARespaldo(lleno);
        if (m.e === PRESENCIA) {
            presentes.set(de, m.p && typeof m.p === "object" ? (m.p as Record<string, unknown>) : null);
            emitir(oyP, estadoPresencia());
        } else if (EVENTOS_ESCENA.includes(m.e as EventoEscena)) emitir(oyM, m.e as EventoEscena, m.p);
    };
    resp = abrirRespaldo(); engancharRespaldo(false);
    bajas.push(malla.onPeer({
        onMessage: (de, data) => recibir(de, data),
        onState: (par) => {
            if (modo !== "p2p" || cerrado) return;
            if (par.channelOpen && par.state === "connected") {
                if (presentes.has(par.deviceId)) return;
                if (presentes.size >= max) return pasarARespaldo(lleno);
                presentes.set(par.deviceId, null);
                const s = meta ? empaquetar(PRESENCIA, meta) : null; if (s) malla?.sendToPeer(par.deviceId, s);
            } else if (presentes.delete(par.deviceId)) emitir(oyP, estadoPresencia());
            revisar();
        },
    }));
    queueMicrotask(() => { for (const id of o.pares ?? []) if (id !== o.miId && malla && modo === "p2p") void malla.connectToDevice(id).catch(() => undefined); });

    const alta = <T>(s: Set<T>) => (cb: T) => { s.add(cb); return () => { s.delete(cb); }; };    return {
        tema, suscrito, modo: () => modo, aviso: () => aviso,
        enviar(evento, payload) {
            if (cerrado || !EVENTOS_ESCENA.includes(evento) || motivoRechazoP2P(payload)) return;
            if (modo === "respaldo") return resp?.enviar(evento, payload);
            const s = empaquetar(evento, payload); if (s) malla?.broadcast(s);
        },
        publicarPresencia(m) {
            if (cerrado || motivoRechazoP2P(m)) return;
            meta = m;
            if (modo === "respaldo") return resp?.publicarPresencia(m);
            const s = empaquetar(PRESENCIA, m); if (s) malla?.broadcast(s);
        },
        onPresencia: alta(oyP), onMensaje: alta(oyM), onFila: alta(oyF), onSuscrito: alta(oyS),
        cerrar() {
            if (cerrado) return; cerrado = true;
            for (const b of bajas.splice(0)) b();
            for (const s of [oyP, oyM, oyF, oyS] as Set<unknown>[]) s.clear();
            try { malla?.closeMesh(); } catch { /* best-effort */ }
            resp?.cerrar(); malla = resp = null; presentes.clear();
        },
    };
}
