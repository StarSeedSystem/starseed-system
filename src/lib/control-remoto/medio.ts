/**
 * CTL1117B · el medio por el que viaja el control entre neuronas: qué se usa de verdad, qué se puede elegir y cómo se aplica.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Módulo PURO (sin red, sin DOM): lo importan el estado vivo (`medio-estado.ts`), la interfaz y las pruebas.
 *
 * Reutiliza el modelo de la Mensajería (`mensajeria/medios`): un ENLACE real del transporte universal se traduce a un medio
 * (`CandidatoMedio`), y la ruta de una conexión WebRTC se mide con `network/estadisticas-enlace`. Aquí solo se añade lo propio del
 * control: la elección por aparato controlado, el plan de las órdenes, la política ICE de la pantalla y el medio REAL observado.
 *
 * Regla de oro: nada se inventa. Si el camino no se puede saber, el medio es «sin determinar».
 * El medio elegido NO salta permisos, no abre antenas, no toca la firma, el tope de órdenes ni la regla de ventanas protegidas.
 */

import type { CandidatoMedio } from "@/lib/mensajeria/medios/tipos";
import { mismaSubred, resumirRuta, type FuenteEstadisticas } from "@/lib/network/estadisticas-enlace";

export type { CandidatoMedio };

// ── la elección (por aparato controlado) ─────────────────────────────────────────────────────

export const MEDIOS_ELEGIBLES = ["auto", "bluetooth", "wifi-directo", "wifi-router", "malla", "nodos"] as const;
export type MedioElegido = (typeof MEDIOS_ELEGIBLES)[number];

export const CLAVE_MEDIO = "starseed.control-medio.v1";
export const VERSION_MEDIO = 1;

export function esMedioElegido(x: unknown): x is MedioElegido {
    return typeof x === "string" && (MEDIOS_ELEGIBLES as readonly string[]).includes(x);
}

export type EleccionesGuardadas = Readonly<Record<string, MedioElegido>>;

/**
 * Lee lo guardado. Tolerante: un texto roto, otra versión, una opción que esta versión no conoce o una forma antigua
 * (un mapa plano `{ neurona: medio }`) nunca rompen nada; lo que no se entiende queda en «automático» (el valor por defecto).
 */
export function leerElecciones(crudo: string | null | undefined): EleccionesGuardadas {
    if (!crudo) return {};
    let o: unknown;
    try {
        o = JSON.parse(crudo);
    } catch {
        return {};
    }
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    const r = o as Record<string, unknown>;
    const mapa = r.porNeurona && typeof r.porNeurona === "object" && !Array.isArray(r.porNeurona) ? (r.porNeurona as Record<string, unknown>) : "v" in r ? {} : r;
    const out: Record<string, MedioElegido> = {};
    for (const [k, v] of Object.entries(mapa)) {
        if (k.length > 0 && k.length <= 128 && esMedioElegido(v) && v !== "auto") out[k] = v;
    }
    return out;
}

export function eleccionDe(mapa: EleccionesGuardadas, neurona: string | null | undefined): MedioElegido {
    return (neurona && mapa[neurona]) || "auto";
}

/** Un mapa nuevo con la elección cambiada («automático» no se guarda: es el valor por defecto). */
export function conEleccion(mapa: EleccionesGuardadas, neurona: string, e: MedioElegido): EleccionesGuardadas {
    const sig: Record<string, MedioElegido> = { ...mapa };
    if (e === "auto") delete sig[neurona];
    else sig[neurona] = e;
    return sig;
}

export function serializarElecciones(mapa: EleccionesGuardadas): string {
    return JSON.stringify({ v: VERSION_MEDIO, porNeurona: mapa });
}

// ── el medio REAL ────────────────────────────────────────────────────────────────────────────

export type TipoMedio = "bluetooth" | "wifi-directo" | "red-local" | "internet" | "nodo" | "turn" | "servidor" | "lora";
export type CaminoReal = "directo" | "capa" | "sin-determinar";

export interface MedioReal {
    camino: CaminoReal;
    medio: TipoMedio | null;
    /** Algo que se sabe del camino y vale la pena decir («datos móviles», «por relevo de Mac de Alex»). */
    nota?: string;
}

export const SIN_DETERMINAR: MedioReal = { camino: "sin-determinar", medio: null };

export interface EnlaceParaClasificar {
    enlaceId: string;
    medio: CandidatoMedio["medio"];
    ruta?: string | null;
}

/** Un enlace del transporte → el medio real. `esWifiDirecto` dice si ese enlace va por el Wi‑Fi directo entre los dos aparatos. */
export function medioDeEnlaceUsado(e: EnlaceParaClasificar, esWifiDirecto: (id: string) => boolean = () => false): MedioReal {
    if (e.enlaceId.startsWith("relevo:")) return { camino: "capa", medio: "nodo" };
    switch (e.medio) {
        case "bluetooth":
            return { camino: "directo", medio: "bluetooth" };
        case "local":
            return { camino: "directo", medio: e.ruta === "wifi-directo" || esWifiDirecto(e.enlaceId) ? "wifi-directo" : "red-local" };
        case "wifi-local":
            return { camino: "directo", medio: "red-local" };
        case "p2p-internet":
            // Sin ruta medida se sabe que es directo entre los dos aparatos, pero no por qué red.
            return e.ruta === "internet-directo" ? { camino: "directo", medio: "internet" } : e.ruta === "misma-red-local" ? { camino: "directo", medio: "red-local" } : { camino: "directo", medio: null, nota: "ruta sin medir" };
        case "turn":
            return { camino: "capa", medio: "turn" };
        case "rele":
        case "servidor":
            return { camino: "capa", medio: "servidor" };
        case "lora":
            return { camino: "directo", medio: "lora" };
        default:
            return SIN_DETERMINAR;
    }
}

type Reg = Record<string, unknown>;

function listaDeEstadisticas(stats: FuenteEstadisticas): Reg[] {
    const s = stats as { values?: () => Iterable<unknown>; forEach?: (cb: (v: unknown) => void) => void };
    const crudos: unknown[] = [];
    if (typeof s.values === "function") crudos.push(...Array.from(s.values()));
    else if (typeof s.forEach === "function") s.forEach((v) => crudos.push(v));
    else crudos.push(...Array.from(stats as Iterable<unknown>));
    return crudos.map((e) => (Array.isArray(e) && e.length === 2 && e[1] && typeof e[1] === "object" ? e[1] : e)).filter((e): e is Reg => !!e && typeof e === "object" && !Array.isArray(e));
}

const TIPOS_RED: Record<string, string> = { wifi: "Wi‑Fi", ethernet: "cable de red", cellular: "datos móviles", vpn: "VPN", bluetooth: "Bluetooth", wimax: "WiMAX" };

export interface ContextoEstadisticas {
    /** IP del otro aparato en el enlace Wi‑Fi directo activo con él (null/ausente = no hay enlace). */
    ipOtroWifiDirecto?: string | null;
}

/**
 * El medio de una conexión WebRTC a partir de `getStats()` del par ELEGIDO por ICE: tipo de candidato (host/srflx/relay)
 * y tipo de red del lado local. Sin par elegido, «sin determinar».
 */
export function medioDeEstadisticas(stats: FuenteEstadisticas, ahora: number, ctx: ContextoEstadisticas = {}): MedioReal {
    let ruta;
    try {
        ruta = resumirRuta(stats, ahora);
    } catch {
        return SIN_DETERMINAR;
    }
    if (ruta.clase === "desconocida") return SIN_DETERMINAR;
    if (ruta.clase === "reenviado-turn") return { camino: "capa", medio: "turn" };
    // El tipo de red lo da el candidato local del par (Chrome/WebView: wifi, ethernet, cellular, vpn…).
    let red: string | null = null;
    for (const e of listaDeEstadisticas(stats)) {
        if (e.type !== "local-candidate") continue;
        const igual = ruta.direccionLocal ? (e.address ?? e.ip) === ruta.direccionLocal : e.candidateType === ruta.tipoLocal;
        if (igual && typeof e.networkType === "string") {
            red = e.networkType;
            break;
        }
    }
    const nota = red && TIPOS_RED[red] ? TIPOS_RED[red] : undefined;
    if (ruta.clase === "misma-red-local") {
        const wd = !!ctx.ipOtroWifiDirecto && !!ruta.direccionRemota && mismaSubred(ruta.direccionRemota, ctx.ipOtroWifiDirecto);
        return { camino: "directo", medio: wd ? "wifi-directo" : "red-local", ...(nota ? { nota } : {}) };
    }
    return { camino: "directo", medio: "internet", ...(nota ? { nota } : {}) };
}

/** ¿Lo que de verdad se usa cumple lo que se eligió? («automático» siempre.) */
export function cumpleEleccion(e: MedioElegido, real: MedioReal): boolean {
    switch (e) {
        case "auto":
            return true;
        case "bluetooth":
            return real.medio === "bluetooth";
        case "wifi-directo":
            return real.medio === "wifi-directo";
        case "wifi-router":
            return real.medio === "red-local";
        case "malla":
            return real.camino === "directo";
        case "nodos":
            return real.camino === "capa";
    }
}

// ── las órdenes: qué enlaces se prueban ──────────────────────────────────────────────────────

export interface ContextoMedio {
    /** Enlaces reales hacia ESE aparato (transporte universal), con lo medido. */
    candidatos: readonly CandidatoMedio[];
    /** ¿Algún nodo de otra neurona de la cuenta lo alcanza ahora? null = no se sabe. */
    relevoPorNodo: boolean | null;
    /** ¿Hay un servidor de retransmisión (TURN) configurado? null = no se sabe todavía. */
    hayTurn: boolean | null;
    /** El enlace Wi‑Fi directo activo con ese aparato (IP del otro), si lo hay. */
    wifiDirecto: { ipOtro: string | null } | null;
    /** Para saber si un enlace local va por el Wi‑Fi directo. */
    esWifiDirecto?: (enlaceId: string) => boolean;
}

export interface PlanOrdenes {
    /** «auto»: se manda como siempre (el transporte elige). */
    automatico: boolean;
    /** En el orden en que se prueban; vacío con `automatico` o con `porNodo`. */
    pasos: CandidatoMedio[];
    /** «Por nodos»: solo por relevo de otra neurona de la cuenta. */
    porNodo: boolean;
}

function utiles(c: readonly CandidatoMedio[]): CandidatoMedio[] {
    return c.filter((x) => x.abierto && x.llega);
}

function porRtt(a: CandidatoMedio, b: CandidatoMedio): number {
    const va = typeof a.rttMs === "number" && Number.isFinite(a.rttMs) ? a.rttMs : null;
    const vb = typeof b.rttMs === "number" && Number.isFinite(b.rttMs) ? b.rttMs : null;
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return va - vb;
}

/** Los enlaces que sirven a esa elección, ordenados (los más rápidos medidos primero). `giro` reparte la carga en «malla». */
export function planOrdenes(e: MedioElegido, ctx: ContextoMedio, giro = 0): PlanOrdenes {
    if (e === "auto") return { automatico: true, pasos: [], porNodo: false };
    if (e === "nodos") return { automatico: false, pasos: [], porNodo: ctx.relevoPorNodo === true };
    const wd = ctx.esWifiDirecto ?? (() => false);
    const medioDe = (c: CandidatoMedio): TipoMedio | null => medioDeEnlaceUsado(c, wd).medio;
    const buenos = utiles(ctx.candidatos).filter((c) => !c.enlaceId.startsWith("relevo:"));
    let pasos: CandidatoMedio[];
    switch (e) {
        case "bluetooth":
            pasos = buenos.filter((c) => medioDe(c) === "bluetooth");
            break;
        case "wifi-directo":
            pasos = buenos.filter((c) => medioDe(c) === "wifi-directo");
            break;
        case "wifi-router":
            pasos = buenos.filter((c) => medioDe(c) === "red-local");
            break;
        default: {
            // malla: todos los caminos directos entre los dos aparatos (sin relé, sin TURN, sin radio de mensajes cortos).
            const directos = buenos.filter((c) => {
                const m = medioDe(c);
                return m === "bluetooth" || m === "wifi-directo" || m === "red-local" || m === "internet" || (m === null && c.medio === "p2p-internet");
            });
            pasos = directos;
        }
    }
    pasos = [...pasos].sort(porRtt);
    if (e === "malla" && pasos.length > 1) {
        const k = ((giro % pasos.length) + pasos.length) % pasos.length;
        pasos = [...pasos.slice(k), ...pasos.slice(0, k)];
    }
    return { automatico: false, pasos, porNodo: false };
}

// ── las opciones del selector ────────────────────────────────────────────────────────────────

/** Qué pasa con la pantalla (el vídeo) al elegir esa opción. */
export type EfectoPantalla = "automatica" | "forzada" | "aun-no";

export interface OpcionMedio {
    id: MedioElegido;
    disponible: boolean;
    /** Por qué está apagada (una frase). */
    motivoNo?: string;
    pantalla: EfectoPantalla;
}

export const MOTIVO_NO: Record<Exclude<MedioElegido, "auto">, string> = {
    bluetooth: "No hay Bluetooth directo con este aparato ahora.",
    "wifi-directo": "No hay un enlace Wi‑Fi directo activo con este aparato.",
    "wifi-router": "Este aparato no está en tu misma red local ahora.",
    malla: "No hay ningún camino directo con este aparato ahora.",
    nodos: "Ningún nodo de otra neurona de tu cuenta alcanza este aparato ahora.",
};

export function efectoPantalla(e: MedioElegido, ctx: Pick<ContextoMedio, "hayTurn" | "wifiDirecto">): EfectoPantalla {
    switch (e) {
        case "auto":
            return "automatica";
        case "bluetooth":
            return "aun-no"; // el vídeo no cabe por Bluetooth: no se finge
        case "wifi-directo":
            return ctx.wifiDirecto?.ipOtro ? "forzada" : "aun-no";
        case "wifi-router":
        case "malla":
            return "forzada";
        case "nodos":
            return ctx.hayTurn === true ? "forzada" : "aun-no";
    }
}

/** Las seis opciones, con las que este par de aparatos no puede usar ahora apagadas y su motivo. */
export function opcionesDeMedio(ctx: ContextoMedio): OpcionMedio[] {
    return MEDIOS_ELEGIBLES.map((id): OpcionMedio => {
        if (id === "auto") return { id, disponible: true, pantalla: "automatica" };
        const p = planOrdenes(id, ctx);
        const hay = p.porNodo || p.pasos.length > 0;
        return { id, disponible: hay, ...(hay ? {} : { motivoNo: MOTIVO_NO[id] }), pantalla: efectoPantalla(id, ctx) };
    });
}

// ── la pantalla: política ICE ────────────────────────────────────────────────────────────────

export interface PoliticaIce {
    /** ¿Esta elección se aplica de verdad a la conexión de vídeo? */
    forzada: boolean;
    iceTransportPolicy: "all" | "relay";
    /** Filtro de un candidato (`candidate:… typ host …`): true = se deja pasar. */
    permitir: (candidato: string) => boolean;
    /** Lo que identifica la política (si cambia, hay que reconectar el vídeo). */
    clave: string;
}

const TODO: PoliticaIce = { forzada: false, iceTransportPolicy: "all", permitir: () => true, clave: "auto" };

export function tipoDeCandidato(c: string): "host" | "srflx" | "prflx" | "relay" | null {
    const m = / typ (host|srflx|prflx|relay)\b/.exec(c);
    return m ? (m[1] as "host" | "srflx" | "prflx" | "relay") : null;
}

export function direccionDeCandidato(c: string): string | null {
    const p = c.replace(/^a=/, "").replace(/^candidate:/, "").split(/\s+/);
    return p.length > 4 ? p[4] : null;
}

export function politicaIce(e: MedioElegido, ctx: Pick<ContextoMedio, "hayTurn" | "wifiDirecto">): PoliticaIce {
    if (efectoPantalla(e, ctx) !== "forzada") return TODO;
    switch (e) {
        case "wifi-router":
            return { forzada: true, iceTransportPolicy: "all", permitir: (c) => tipoDeCandidato(c) === "host", clave: e };
        case "wifi-directo": {
            const ip = ctx.wifiDirecto?.ipOtro ?? "";
            return {
                forzada: true,
                iceTransportPolicy: "all",
                // Una dirección que no se puede leer (mDNS «.local») se deja pasar; la medida posterior dice si de verdad fue directo.
                permitir: (c) => {
                    if (tipoDeCandidato(c) !== "host") return false;
                    const a = direccionDeCandidato(c);
                    if (!a || a.endsWith(".local")) return true;
                    return mismaSubred(a, ip);
                },
                clave: `${e}:${ip}`,
            };
        }
        case "malla":
            return { forzada: true, iceTransportPolicy: "all", permitir: (c) => tipoDeCandidato(c) !== "relay", clave: e };
        case "nodos":
            return { forzada: true, iceTransportPolicy: "relay", permitir: () => true, clave: e };
        default:
            return TODO;
    }
}

/** Quita de un SDP las líneas `a=candidate:` que la política no deja pasar. El resto queda igual. */
export function filtrarSdp(sdp: string, permitir: (candidato: string) => boolean): string {
    if (!sdp.includes("a=candidate:")) return sdp;
    const fin = sdp.includes("\r\n") ? "\r\n" : "\n";
    return sdp
        .split(/\r?\n/)
        .filter((l) => !l.startsWith("a=candidate:") || permitir(l.slice(2)))
        .join(fin);
}

/**
 * ¿Pueden los gestos y las teclas ir por el canal de datos de la conexión de vídeo? Con «automático», sí. Con otra elección, solo si
 * el camino REAL de esa conexión cumple lo elegido (y nunca por Bluetooth: ese vídeo no va por Bluetooth).
 */
export function canalDatosPermitido(e: MedioElegido, parReal: MedioReal): boolean {
    if (e === "auto") return true;
    if (e === "bluetooth") return false;
    return cumpleEleccion(e, parReal);
}

// ── el registro ──────────────────────────────────────────────────────────────────────────────

function ficha(r: MedioReal): string {
    return r.camino === "sin-determinar" ? "sin-determinar" : `${r.camino === "capa" ? "capa" : "directo"}:${r.medio ?? "ruta-sin-medir"}`;
}

/** `control-medio elegido=… ordenes=… pantalla=…` (mismo formato clave=valor que las demás líneas `control-*`). */
export function lineaRegistroMedio(p: { elegido: MedioElegido; ordenes: MedioReal; entrada?: MedioReal | null; pantalla: MedioReal; pantallaForzada: boolean }): string {
    return `control-medio elegido=${p.elegido} ordenes=${ficha(p.ordenes)} entrada=${p.entrada ? ficha(p.entrada) : "canal-de-ordenes"} pantalla=${ficha(p.pantalla)} pantalla-forzada=${p.pantallaForzada ? "si" : "no"}`;
}
