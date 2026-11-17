"use client";

/**
 * CTL1117B · el estado vivo del medio del control: la elección guardada por aparato controlado, los caminos que hay ahora,
 * lo que de verdad usan las órdenes y la pantalla, y el envío de las órdenes por el medio elegido.
 *
 * No abre antenas ni permisos, no firma ni arma nada: solo elige entre los enlaces que YA existen. Si el medio elegido no está,
 * la orden NO sale por otro: se avisa y la persona decide (`pasar a automático`).
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
    CLAVE_MEDIO, canalDatosPermitido, conEleccion, cumpleEleccion, eleccionDe, esMedioElegido, filtrarSdp, leerElecciones, lineaRegistroMedio, medioDeEnlaceUsado,
    medioDeEstadisticas, opcionesDeMedio, planOrdenes, politicaIce, serializarElecciones, SIN_DETERMINAR,
    type ContextoMedio, type EleccionesGuardadas, type MedioElegido, type MedioReal, type OpcionMedio, type PoliticaIce,
} from "./medio";
import type { CandidatoMedio } from "@/lib/mensajeria/medios/tipos";

export const EVENTO_MEDIO = "starseed:control-medio-cambio";
const REFRESCO_MS = 4000;
const MEDIDA_PAR_MS = 2500;
/** Cuánto se conserva, «comprobando…», el último camino conocido de la pantalla al reconectar. */
export const PLAZO_CONOCIDO_MS = 15_000;

export interface EstadoMedio {
    elegido: MedioElegido;
    opciones: OpcionMedio[];
    /** Lo último que usaron las órdenes por el canal de la malla. */
    ordenes: MedioReal;
    /** Lo que usan los gestos y teclas si van por la conexión de vídeo; null = van por el canal de la malla. */
    /** El camino que usaría AHORA un gesto o una tecla con el medio elegido (el canal de datos de la pantalla solo si cumple lo elegido). */
    entrada: MedioReal;
    /** ¿Ese camino es la conexión de la pantalla (true) o el canal de órdenes de la malla (false)? */
    entradaPorPantalla: boolean;
    /** Lo que se enseña es el último valor conocido y se está volviendo a medir. */
    comprobandoEntrada: boolean;
    comprobandoPantalla: boolean;
    pantalla: MedioReal;
    pantallaForzada: boolean;
    /** El medio elegido dejó de estar disponible (o no se cumple): hay que decirlo, no cambiarlo. */
    perdido: boolean;
}

interface Interno {
    ctx: ContextoMedio;
    ordenes: MedioReal;
    par: MedioReal | null;
    /** Último par medido con éxito: solo para enseñar mientras se vuelve a medir (nunca para decidir). */
    parConocido: MedioReal | null;
    /** Hasta cuándo vale `parConocido` si no se vuelve a medir (ms de reloj); 0 = sin plazo. */
    parConocidoHasta: number;
    /** La elección cambió y aún no ha salido una orden por ella. */
    ordenesViejas: boolean;
    canalAbierto: () => boolean;
    peer: { getStats(): Promise<{ forEach(cb: (v: Record<string, unknown>) => void): void }> } | null;
    ordenFallo: boolean;
    giro: number;
    snap: EstadoMedio | null;
    ultimaLinea: string;
}

const CTX_VACIO: ContextoMedio = { candidatos: [], relevoPorNodo: null, hayTurn: null, wifiDirecto: null };

let elecciones: EleccionesGuardadas | null = null;
const internos = new Map<string, Interno>();
const oyentes = new Set<() => void>();

function leerGuardado(): EleccionesGuardadas {
    if (elecciones) return elecciones;
    try {
        elecciones = leerElecciones(typeof window !== "undefined" ? window.localStorage.getItem(CLAVE_MEDIO) : null);
    } catch {
        elecciones = {};
    }
    return elecciones;
}

function guardar(m: EleccionesGuardadas): void {
    elecciones = m;
    try {
        window.localStorage.setItem(CLAVE_MEDIO, serializarElecciones(m));
    } catch {
        /* sin almacenamiento: la elección vale en esta sesión */
    }
}

function de(n: string): Interno {
    let i = internos.get(n);
    if (!i) {
        i = { ctx: CTX_VACIO, ordenes: SIN_DETERMINAR, par: null, parConocido: null, parConocidoHasta: 0, ordenesViejas: false, canalAbierto: () => false, peer: null, ordenFallo: false, giro: 0, snap: null, ultimaLinea: "" };
        internos.set(n, i);
    }
    return i;
}

export function eleccionActual(neurona: string): MedioElegido {
    return eleccionDe(leerGuardado(), neurona);
}

function anotar(linea: string): void {
    void import("@/lib/llamadas/voz-datos/diagnostico").then((m) => m.anotarLlamada("banco", null, linea)).catch(() => undefined);
    try {
        console.info(`[control-neuronas] ${linea}`);
    } catch {
        /* nada */
    }
}

function calcular(neurona: string): EstadoMedio {
    const i = de(neurona);
    const elegido = eleccionActual(neurona);
    const opciones = opcionesDeMedio(i.ctx);
    const pol = politicaIce(elegido, i.ctx);
    // Igual que la guarda de `pantalla-destino` (`canalDatosOk`): el canal de datos solo si está abierto y su par real cumple lo elegido.
    const viaPantalla = i.canalAbierto() && canalDatosPermitido(elegido, i.par ?? SIN_DETERMINAR);
    const enseñadoPar = i.par ?? i.parConocido ?? SIN_DETERMINAR;
    const comprobandoPantalla = i.par === null && i.parConocido !== null;
    const entrada = viaPantalla ? enseñadoPar : i.ordenes;
    const comprobandoEntrada = viaPantalla ? comprobandoPantalla : i.ordenesViejas && i.ordenes.camino !== "sin-determinar";
    const disponible = opciones.find((o) => o.id === elegido)?.disponible ?? true;
    // «Perdido»: lo elegido ya no sirve (no hay camino, un envío falló por eso, o el camino real de la conexión no lo cumple).
    const parIncumple = elegido !== "auto" && pol.forzada && !!i.par && i.par.camino !== "sin-determinar" && !cumpleEleccion(elegido, i.par);
    const perdido = elegido !== "auto" && (!disponible || i.ordenFallo || parIncumple);
    return { elegido, opciones, ordenes: i.ordenes, entrada, entradaPorPantalla: viaPantalla, comprobandoEntrada, comprobandoPantalla, pantalla: enseñadoPar, pantallaForzada: pol.forzada, perdido };
}

function clave(e: EstadoMedio): unknown[] {
    return [e.elegido, e.opciones, e.ordenes, e.entrada, e.entradaPorPantalla, e.comprobandoEntrada, e.comprobandoPantalla, e.pantalla, e.pantallaForzada, e.perdido];
}

function igual(a: EstadoMedio, b: EstadoMedio): boolean {
    return JSON.stringify(clave(a)) === JSON.stringify(clave(b));
}

function publicar(neurona: string): void {
    const i = de(neurona);
    const n = calcular(neurona);
    if (i.snap && igual(i.snap, n)) return;
    i.snap = n;
    const linea = lineaRegistroMedio({ elegido: n.elegido, ordenes: n.ordenes, entrada: n.entrada, pantalla: n.pantalla, pantallaForzada: n.pantallaForzada });
    if (linea !== i.ultimaLinea) {
        i.ultimaLinea = linea;
        anotar(linea);
    }
    for (const f of Array.from(oyentes)) {
        try {
            f();
        } catch {
            /* un oyente roto no tumba a los demás */
        }
    }
}

export function instantaneaMedio(neurona: string): EstadoMedio {
    const i = de(neurona);
    if (!i.snap) i.snap = calcular(neurona);
    return i.snap;
}

export function fijarEleccion(neurona: string, e: MedioElegido): void {
    if (!esMedioElegido(e)) return;
    const antes = eleccionActual(neurona);
    guardar(conEleccion(leerGuardado(), neurona, e));
    const i = de(neurona);
    i.ordenFallo = false;
    i.ordenesViejas = true;
    publicar(neurona);
    try {
        window.dispatchEvent(new CustomEvent(EVENTO_MEDIO, { detail: { neurona, antes, ahora: e } }));
    } catch {
        /* sin ventana */
    }
}

/** ¿Hay que reconectar el vídeo al pasar de un medio a otro? (la política de la pantalla cambia). */
export function cambiaLaPantalla(neurona: string, antes: MedioElegido, ahora: MedioElegido): boolean {
    const ctx = de(neurona).ctx;
    return politicaIce(antes, ctx).clave !== politicaIce(ahora, ctx).clave;
}

// ── los caminos que hay ahora ────────────────────────────────────────────────────────────────

export async function refrescarContexto(neurona: string): Promise<void> {
    const i = de(neurona);
    try {
        const [t, el, mm, wf, ice] = await Promise.all([
            import("@/lib/malla/transporte-universal"),
            import("@/lib/malla/eleccion-enlace"),
            import("@/lib/mensajeria/medios/medios"),
            import("@/lib/malla/enlace-wifi-orquestacion"),
            import("@/lib/llamadas/ice").catch(() => null),
        ]);
        const enlaces = await t.enlacesDisponibles();
        const destino = { neuronDeviceId: neurona };
        const candidatos: CandidatoMedio[] = mm.candidatosDesdeEnlaces(enlaces as Parameters<typeof mm.candidatosDesdeEnlaces>[0], (e) => el.alcanzaDestino(e as Parameters<typeof el.alcanzaDestino>[0], destino));
        let relevoPorNodo: boolean | null = null;
        try {
            const r = await import("@/lib/malla/relevo/real");
            relevoPorNodo = r.estadoRelevo().destinos.some((d) => d.neurona === neurona && d.por !== null);
        } catch {
            relevoPorNodo = null;
        }
        let hayTurn: boolean | null = i.ctx.hayTurn;
        if (ice && hayTurn === null) {
            try {
                hayTurn = ice.contieneTurn((await ice.obtenerIceServidores()).iceServers);
            } catch {
                hayTurn = null;
            }
        }
        const enl = wf.enlaceWifiDe(neurona);
        i.ctx = { candidatos, relevoPorNodo, hayTurn, wifiDirecto: enl ? { ipOtro: enl.ipOtro } : null, esWifiDirecto: (id) => wf.esEnlaceWifiDirecto(id) };
    } catch {
        /* sin transporte: las opciones quedan como estaban */
    }
    publicar(neurona);
}

// ── la pantalla: configuración ICE, filtros y medida del par ─────────────────────────────────

export function politicaDe(neurona: string): PoliticaIce {
    return politicaIce(eleccionActual(neurona), de(neurona).ctx);
}

/** Lo que pide la conexión de vídeo: `RTCConfiguration` con la política de transporte del medio elegido. */
export function configuracionIce(neurona: string, iceServers: RTCIceServer[]): RTCConfiguration {
    const p = politicaDe(neurona);
    return p.iceTransportPolicy === "relay" ? { iceServers, iceTransportPolicy: "relay" } : { iceServers };
}

export function permitirCandidato(neurona: string, candidato: string): boolean {
    return politicaDe(neurona).permitir(candidato);
}

export function filtrarRespuesta(neurona: string, sdp: string): string {
    const p = politicaDe(neurona);
    return p.forzada ? filtrarSdp(sdp, p.permitir) : sdp;
}

/** ¿Pueden los gestos y las teclas ir por el canal de datos de la conexión de vídeo con el medio elegido? */
export function canalDatosOk(neurona: string): boolean {
    const i = de(neurona);
    return canalDatosPermitido(eleccionActual(neurona), i.par ?? SIN_DETERMINAR);
}

const relojes = new Map<string, ReturnType<typeof setInterval>>();

/** La conexión de vídeo se registra para medir su par. Devuelve la función que la quita. */
export function registrarConexion(neurona: string, peer: NonNullable<Interno["peer"]>, canalAbierto: () => boolean): () => void {
    const i = de(neurona);
    i.peer = peer;
    i.canalAbierto = canalAbierto;
    i.par = null; // la conexión nueva aún no está medida: para DECIDIR (canal de datos) vale «sin medir»; para ENSEÑAR se conserva el último valor
    if (i.parConocido) i.parConocidoHasta = Date.now() + PLAZO_CONOCIDO_MS;
    const medir = async () => {
        if (i.peer !== peer) return;
        let m: MedioReal | null = null;
        try {
            const st = await peer.getStats();
            m = medioDeEstadisticas(st as unknown as Parameters<typeof medioDeEstadisticas>[0], Date.now(), { ipOtroWifiDirecto: i.ctx.wifiDirecto?.ipOtro ?? null });
        } catch {
            m = null;
        }
        if (m && m.camino !== "sin-determinar") {
            i.par = m;
            i.parConocido = m;
            i.parConocidoHasta = 0;
        } else {
            // No se pudo medir ahora: se conserva lo conocido «comprobando…» un rato; pasado el plazo, de verdad no se sabe.
            i.par = null;
            if (i.parConocido && i.parConocidoHasta > 0 && Date.now() > i.parConocidoHasta) i.parConocido = null;
        }
        publicar(neurona);
    };
    const viejo = relojes.get(neurona);
    if (viejo) clearInterval(viejo);
    relojes.set(neurona, setInterval(() => void medir(), MEDIDA_PAR_MS));
    void medir();
    return () => {
        if (i.peer !== peer) return;
        i.peer = null;
        i.par = null;
        i.canalAbierto = () => false;
        // Sesión cerrada: el último valor solo se conserva el plazo de una reconexión; si nadie vuelve a registrarse, se olvida.
        if (i.parConocido) {
            i.parConocidoHasta = Date.now() + PLAZO_CONOCIDO_MS;
            setTimeout(() => {
                if (!i.peer && i.parConocido && i.parConocidoHasta > 0 && Date.now() >= i.parConocidoHasta) {
                    i.parConocido = null;
                    publicar(neurona);
                }
            }, PLAZO_CONOCIDO_MS + 50);
        }
        const r = relojes.get(neurona);
        if (r) clearInterval(r);
        relojes.delete(neurona);
        publicar(neurona);
    };
}

// ── las órdenes por el canal de la malla ─────────────────────────────────────────────────────

type Transporte = typeof import("@/lib/malla/transporte-universal");
export interface ResultadoOrdenMedio {
    ok: boolean;
    motivo?: string;
}

function realDeResultado(i: Interno, r: { enlace?: { id: string; tipo: string } | null; relevo?: { neurona: string; nombre: string | null } | null }): MedioReal {
    if (r.relevo) return { camino: "capa", medio: "nodo", nota: r.relevo.nombre ? `por relevo de ${r.relevo.nombre}` : undefined };
    if (!r.enlace) return SIN_DETERMINAR;
    const c = i.ctx.candidatos.find((x) => x.enlaceId === r.enlace?.id);
    if (c) return medioDeEnlaceUsado(c, i.ctx.esWifiDirecto);
    if (r.enlace.id.startsWith("relevo:")) return { camino: "capa", medio: "nodo" };
    // Sin ruta medida del enlace: se dice lo que se sabe por su tipo y nada más.
    const t = r.enlace.tipo;
    if (t === "ble") return { camino: "directo", medio: "bluetooth" };
    if (t === "nativo" || t === "local") return medioDeEnlaceUsado({ enlaceId: r.enlace.id, medio: "local" }, i.ctx.esWifiDirecto);
    if (t === "cuenta" || t === "par") return { camino: "directo", medio: null, nota: "ruta sin medir" };
    if (t === "rele") return { camino: "capa", medio: "servidor" };
    return SIN_DETERMINAR;
}

/**
 * Manda una orden ya sellada por el medio elegido para ese aparato. «Automático» es el envío de siempre.
 * Con otra elección, solo por los enlaces de ese medio; si no hay ninguno, NO sale por otro: `medio-no-disponible`.
 */
export async function enviarOrdenPorMedio(t: Pick<Transporte, "enviarMensaje">, para: string, canal: string, cuerpo: unknown, o: { sinRefrescar?: boolean } = {}): Promise<ResultadoOrdenMedio> {
    const i = de(para);
    const e = eleccionActual(para);
    if (e === "auto") {
        const r = await t.enviarMensaje({ neuronDeviceId: para }, canal, cuerpo);
        if (r.ok) {
            i.ordenFallo = false;
            i.ordenes = realDeResultado(i, r);
            i.ordenesViejas = false;
            publicar(para);
        }
        return { ok: r.ok, ...(r.ok ? {} : { motivo: "sin-enlace" }) };
    }
    if (!o.sinRefrescar) await refrescarContexto(para);
    const plan = planOrdenes(e, i.ctx, i.giro++);
    if (plan.porNodo) {
        try {
            const [{ enviarPorRelevo }, { identidadDispositivo }] = await Promise.all([import("@/lib/malla/relevo/real"), import("@/lib/network/identidad-dispositivo")]);
            const sobre = { t: "tu.msg" as const, v: 1 as const, id: crypto.randomUUID(), c: canal, b: cuerpo, de: { s: identidadDispositivo().syncDeviceId } };
            const r = await enviarPorRelevo({ neuronDeviceId: para }, sobre, { esperarRuta: false });
            if (r?.ok && r.relevo) {
                i.ordenFallo = false;
                i.ordenes = { camino: "capa", medio: "nodo", ...(r.relevo.nombre ? { nota: `por relevo de ${r.relevo.nombre}` } : {}) };
                i.ordenesViejas = false;
                publicar(para);
                return { ok: true };
            }
        } catch {
            /* sin relevo */
        }
    }
    for (const paso of plan.pasos) {
        const r = await t.enviarMensaje({ neuronDeviceId: para, enlaceId: paso.enlaceId }, canal, cuerpo);
        if (r.ok) {
            i.ordenFallo = false;
            i.ordenes = medioDeEnlaceUsado(paso, i.ctx.esWifiDirecto);
            i.ordenesViejas = false;
            publicar(para);
            return { ok: true };
        }
    }
    i.ordenFallo = true;
    publicar(para);
    return { ok: false, motivo: "medio-no-disponible" };
}

/** Solo para pruebas: fija lo que hay ahora entre dos aparatos. */
export function __fijarContexto(neurona: string, ctx: ContextoMedio): void {
    de(neurona).ctx = ctx;
    publicar(neurona);
}

/** Solo para pruebas: olvida todo el estado. */
export function __olvidarMedio(): void {
    for (const r of relojes.values()) clearInterval(r);
    relojes.clear();
    elecciones = null;
    internos.clear();
}

// ── React ────────────────────────────────────────────────────────────────────────────────────

export function usarMedioControl(neurona: string | null) {
    const suscribir = useCallback((cb: () => void) => {
        oyentes.add(cb);
        return () => void oyentes.delete(cb);
    }, []);
    const n = neurona ?? "";
    const snap = useSyncExternalStore(
        suscribir,
        () => instantaneaMedio(n),
        () => instantaneaMedio(n),
    );
    useEffect(() => {
        if (!neurona) return;
        void refrescarContexto(neurona);
        const id = setInterval(() => void refrescarContexto(neurona), REFRESCO_MS);
        return () => clearInterval(id);
    }, [neurona]);
    return snap;
}
