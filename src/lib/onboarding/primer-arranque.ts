/**
 * Primer arranque de StarSeed OS — la DECISIÓN (pura) y sus marcas.
 * ═══════════════════════════════════════════════════════════════════════════
 * (2026-09-25) Alex: «al abrir la app debe aparecer la ventana de iniciar sesión o crear
 * cuenta con toda su introducción dinámica automáticamente para los usuarios nuevos, o los
 * ajustes y configuraciones para esa nueva neurona vinculada a una cuenta existente».
 *
 * La app nativa (Tauri) abre la web del OS en una ventana con su propio almacenamiento: en
 * la primera apertura no hay sesión, ni marcas, ni id de neurona. Esta función decide, con
 * lo que sabe en cada momento, qué ventana toca:
 *
 *   · Sin sesión → «Iniciar sesión o crear cuenta» con la introducción. En la app nativa
 *     o en la web instalada (PWA), a pantalla completa y sola; en la web normal, un aviso
 *     discreto que la abre (una visita a una web no debe recibir un modal de golpe).
 *   · Con cuenta y esta neurona nueva en la cuenta → los ajustes de la nueva neurona.
 *   · Con cuenta y neurona conocida → nada.
 *
 * Nunca pisa a quien ya manda: la consola (/mando), las rutas de acceso (/login,
 * /bienvenida…), el rito de una cuenta recién creada (director-rito) ni la guía. La
 * coordinación de «una ventana cada vez» la hace el componente con el registro de modales.
 *
 * Sin React ni navegador: se prueba en Node. Las marcas (localStorage/sessionStorage) van
 * en helpers aparte, todos defensivos.
 */

export type ModoApp = "nativa" | "pwa" | "web";

export type EstadoSesion = "comprobando" | "sin-sesion" | "invitado" | "cuenta";

/** Lo que se sabe de ESTE dispositivo como neurona de la cuenta. */
export interface EstadoNeurona {
    /** La persona ya completó (u omitió a sabiendas) los ajustes de esta neurona aquí. */
    configuradaAqui: boolean;
    /** Hay fila de este dispositivo en `neuron_devices` de la cuenta. */
    enCuenta: boolean;
    /** Esa fila nació en este arranque (no estaba antes de abrir la app). */
    creadaEnEsteArranque: boolean;
    /** Tiene nombre o ajustes guardados por la persona. */
    tieneNombreOAjustes: boolean;
}

export interface EntradaPrimerArranque {
    ruta: string | null;
    /** Ruta de consola (/mando, /voces): nunca se abre nada encima. */
    esConsola: boolean;
    sesion: EstadoSesion;
    modo: ModoApp;
    /** Se pulsó «Explorar sin cuenta» en este dispositivo: ya no se abre sola. */
    introSaltada: boolean;
    /** El aviso discreto de la web se cerró en esta visita. */
    avisoWebCerrado: boolean;
    /** Hay un rito de bienvenida en curso (director-rito): manda él. */
    ritoEnCurso: boolean;
    /** La cuenta tiene perfil (@handle). null = aún no se sabe. */
    tienePerfil: boolean | null;
    /** null = aún no se consultó. */
    neurona: EstadoNeurona | null;
    /** Los ajustes de la neurona se pospusieron en esta visita («Más tarde»). */
    neuronaPospuesta: boolean;
}

export type DecisionPrimerArranque =
    | { tipo: "nada"; motivo: string }
    | { tipo: "esperar" }
    | { tipo: "acceso"; forma: "completa" | "discreta" }
    | { tipo: "neurona-nueva" };

/** Rutas con su propio acceso o su propio rito: ahí no se abre nada encima. */
export const RUTAS_PROPIAS = ["/login", "/bienvenida", "/onboarding", "/auth"];

export function esRutaPropia(ruta: string | null): boolean {
    return Boolean(ruta && RUTAS_PROPIAS.some((r) => ruta === r || ruta.startsWith(`${r}/`)));
}

/**
 * ¿La neurona es nueva en la cuenta? Nueva = no estaba en `neuron_devices` antes de este
 * arranque, o nadie le puso nombre ni ajustes. Si ya se configuró aquí, no lo es.
 */
export function esNeuronaNueva(n: EstadoNeurona): boolean {
    if (n.configuradaAqui) return false;
    return !n.enCuenta || n.creadaEnEsteArranque || !n.tieneNombreOAjustes;
}

export function decidirPrimerArranque(e: EntradaPrimerArranque): DecisionPrimerArranque {
    if (e.esConsola) return { tipo: "nada", motivo: "consola" };
    if (esRutaPropia(e.ruta)) return { tipo: "nada", motivo: "ruta-propia" };
    if (e.sesion === "comprobando") return { tipo: "esperar" };
    if (e.ritoEnCurso) return { tipo: "nada", motivo: "rito" };

    if (e.sesion === "sin-sesion") {
        if (e.introSaltada) return { tipo: "nada", motivo: "saltada" };
        if (e.modo === "nativa" || e.modo === "pwa") return { tipo: "acceso", forma: "completa" };
        return e.avisoWebCerrado ? { tipo: "nada", motivo: "aviso-cerrado" } : { tipo: "acceso", forma: "discreta" };
    }

    // Un invitado ya eligió explorar sin cuenta (AuthGate): no se le insiste.
    if (e.sesion === "invitado") return { tipo: "nada", motivo: "invitado" };

    if (e.tienePerfil === null || e.neurona === null) return { tipo: "esperar" };
    // Cuenta recién nacida sin perfil: la lleva el asistente de alta (OnboardingGate).
    if (!e.tienePerfil) return { tipo: "nada", motivo: "cuenta-nueva" };
    if (e.neuronaPospuesta) return { tipo: "nada", motivo: "neurona-pospuesta" };
    return esNeuronaNueva(e.neurona) ? { tipo: "neurona-nueva" } : { tipo: "nada", motivo: "conocida" };
}

/** Margen para relojes desajustados entre el dispositivo y el servidor. */
export const MARGEN_ARRANQUE_MS = 2 * 60 * 1000;

/** ¿La fila de `neuron_devices` nació en este arranque? (created_at ≥ arranque − margen). */
export function creadaDesde(createdAt: string | null | undefined, arranqueMs: number, margenMs = MARGEN_ARRANQUE_MS): boolean {
    if (!createdAt) return false;
    const t = Date.parse(createdAt);
    return Number.isFinite(t) && t >= arranqueMs - margenMs;
}

/* ─────────────────────────── Qué llegó ya de la cuenta ─────────────────────────── */

export interface ConteoSincronizado {
    escritorios: number;
    biblioteca: number;
    apps: number;
    /** Hay ajustes de la cuenta en este dispositivo (apariencia, neuronas, dock…). */
    ajustes: boolean;
}

function plural(n: number, uno: string, varios: string): string {
    return `${n} ${n === 1 ? uno : varios}`;
}

/**
 * «Ya llegó de tu cuenta: 3 escritorios, 12 elementos de la biblioteca, 5 apps y tus
 * ajustes.» Honesto con lo que falta: si no llegó nada, lo dice.
 */
export function resumenSincronizado(c: ConteoSincronizado): string {
    const partes: string[] = [];
    if (c.escritorios > 0) partes.push(plural(c.escritorios, "escritorio", "escritorios"));
    if (c.biblioteca > 0) partes.push(plural(c.biblioteca, "elemento de la biblioteca", "elementos de la biblioteca"));
    if (c.apps > 0) partes.push(plural(c.apps, "app", "apps"));
    if (c.ajustes) partes.push("tus ajustes");
    if (!partes.length) {
        return "Todavía no ha llegado nada de tu cuenta a este dispositivo. Lo que crees aquí aparecerá también en tus otras neuronas.";
    }
    const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
    return `Ya llegó de tu cuenta: ${lista}.`;
}

/* ─────────────────────────────── Marcas y evento ─────────────────────────────── */

/** «Explorar sin cuenta» en este dispositivo: la bienvenida ya no se abre sola. */
export const CLAVE_INTRO_SALTADA = "starseed.primer-arranque.saltado.v1";
/** El aviso discreto de la web se cerró en esta visita (sessionStorage). */
export const CLAVE_AVISO_WEB = "starseed.primer-arranque.aviso-web.v1";
/** Los ajustes de la nueva neurona se pospusieron en esta visita (sessionStorage). */
export const CLAVE_NEURONA_POSPUESTA = "starseed.primer-arranque.neurona-pospuesta.v1";
/** Marca de «esta neurona ya se configuró aquí» (la misma que usaba el alta corta). */
export const CLAVE_NEURONA_CONFIGURADA = "starseed.neuron.setup.v1";
/** Abre la ventana a mano desde cualquier parte: detail { paso?: "intro" | "acceso" | "neurona" }. */
export const EVENTO_ABRIR_PRIMER_ARRANQUE = "starseed:abrir-primer-arranque";

export type PasoInicial = "intro" | "acceso" | "neurona";

function almacen(tipo: "local" | "sesion"): Storage | null {
    try {
        if (typeof window === "undefined") return null;
        return tipo === "local" ? window.localStorage : window.sessionStorage;
    } catch {
        return null;
    }
}

export function leerMarca(clave: string, tipo: "local" | "sesion" = "local"): boolean {
    try {
        return almacen(tipo)?.getItem(clave) === "1";
    } catch {
        return false;
    }
}

export function ponerMarca(clave: string, tipo: "local" | "sesion" = "local"): void {
    try {
        almacen(tipo)?.setItem(clave, "1");
    } catch {
        /* modo privado estricto: la ventana podrá volver a aparecer, nunca rompe */
    }
}

/** Abre la bienvenida (sin sesión) o los ajustes de la neurona (con sesión) desde un botón. */
export function abrirPrimerArranque(paso?: PasoInicial): void {
    try {
        if (typeof window === "undefined") return;
        window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_PRIMER_ARRANQUE, { detail: { paso } }));
    } catch {
        /* sin window: nada que abrir */
    }
}
