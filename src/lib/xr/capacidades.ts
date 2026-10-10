/**
 * StarSeed XR · CAPACIDADES. De los datos que sondea el navegador (los recoge un sondeo fino en el
 * cliente) a: plataforma, modos disponibles, modo recomendado, entradas y plan de entrada.
 *
 * Regla de Meta y de MDN: la plataforma se usa para ETIQUETAR y dar ayuda; lo que de verdad manda es
 * la capacidad (`isSessionSupported`). visionOS se anuncia como un Mac: sólo el hecho de tener
 * `navigator.xr` con VR lo delata. Módulo PURO.
 */
import type { EntradaXR, FuncionXR, ModoXR, PlataformaVisor } from "./tipos";
import { PLATAFORMAS_VISOR, esFuncionXR } from "./tipos";

export interface DatosNavegador {
    ua: string;
    /** `window.isSecureContext`: sin https o localhost no hay WebXR. */
    seguro: boolean;
    tieneXR: boolean;
    /** Resultado de `isSessionSupported("immersive-vr")`; `null` = aún sin comprobar. */
    vr: boolean | null;
    ar: boolean | null;
    /**
     * `typeof navigator.xr.offerSession === "function"`. Extensión que NO aparece en MDN ni en el IDL de WebKit
     * (A-Frame 1.6.0, 2024-05-23, ya la usa): se detecta siempre por la función, nunca por la plataforma.
     */
    ofreceSesion: boolean;
    tactil: boolean;
    webgl2: boolean;
    webgpu: boolean;
    /**
     * Abierto como app instalada: `display-mode: standalone`, TWA, o PWA de Quest, que Meta recomienda
     * reconocer con `typeof window.getDigitalGoodsService !== "undefined"` (tocar su icono cuenta como gesto).
     */
    instalada: boolean;
}

export type ContextoEntrada = "sistema" | "mundo-vr" | "mundo-ar";

export interface CapacidadesXR {
    plataforma: PlataformaVisor;
    visor: boolean;
    modos: ModoXR[];
    recomendado: ModoXR;
    entradas: EntradaXR[];
    funciones: FuncionXR[];
    ofrecerSesion: boolean;
    motivos: string[];
    avisos: string[];
}

/**
 * Funciones que se ESPERAN por plataforma (investigación fechada 2026-10-10; ver el contrato §1).
 * Son lo que se pide como `optionalFeatures`; lo que de verdad hay lo dice `session.enabledFeatures`.
 * Excepción documentada por Meta (2026-07): en Quest `plane-detection` sólo se concede como `requiredFeatures`.
 */
export const FUNCIONES_ESPERADAS: Record<PlataformaVisor, FuncionXR[]> = {
    quest: ["local-floor", "bounded-floor", "hand-tracking", "layers", "anchors", "hit-test", "plane-detection", "mesh-detection", "depth-sensing"],
    "android-xr": ["local-floor", "hand-tracking", "anchors", "hit-test", "depth-sensing", "light-estimation"],
    "android-movil": ["local-floor", "hit-test", "anchors", "dom-overlay", "light-estimation", "depth-sensing"],
    visionos: ["local-floor", "hand-tracking"],
    pico: ["local-floor", "bounded-floor", "hand-tracking"],
    "magic-leap": ["local-floor", "hand-tracking", "hit-test", "plane-detection", "layers"],
    spectacles: ["local-floor", "hit-test"],
    escritorio: ["local-floor", "bounded-floor", "hand-tracking"],
    ios: [],
    desconocida: ["local-floor"],
};

export function plataformaDeDatos(d: DatosNavegador): PlataformaVisor {
    const u = d.ua.toLowerCase();
    if (/oculusbrowser|\bquest( \d| pro)?\b/.test(u)) return "quest";
    if (/picobrowser|pico (neo|4|g)|pico os/.test(u)) return "pico";
    if (/magic ?leap/.test(u)) return "magic-leap";
    if (/spectacles|snap os/.test(u)) return "spectacles";
    if (/android/.test(u)) return d.vr === true ? "android-xr" : "android-movil";
    if (/iphone|ipod/.test(u)) return "ios";
    if (/macintosh|mac os x/.test(u) && d.tieneXR && d.vr === true) return "visionos";
    if (/vision ?os|apple vision/.test(u)) return "visionos";
    if (/ipad/.test(u) || (/macintosh/.test(u) && d.tactil)) return "ios";
    return /windows|linux|x11|cros|macintosh/.test(u) ? "escritorio" : "desconocida";
}

/** Modelo de Quest por el token del navegador de Meta (el 3S se anuncia como «Quest 3»). */
export function modeloQuest(ua: string): "quest-1" | "quest-2" | "quest-pro" | "quest-3" | null {
    const u = ua.toLowerCase();
    if (!/oculusbrowser|\bquest\b/.test(u)) return null;
    if (/quest 3/.test(u)) return "quest-3";
    if (/quest pro/.test(u)) return "quest-pro";
    if (/quest 2/.test(u)) return "quest-2";
    return "quest-1";
}

export function evaluarCapacidades(
    d: DatosNavegador,
    o: { modo?: ModoXR | "auto"; contexto?: ContextoEntrada } = {},
): CapacidadesXR {
    const plataforma = plataformaDeDatos(d);
    const visor = PLATAFORMAS_VISOR.includes(plataforma) || (plataforma === "escritorio" && d.vr === true);
    const motivos: string[] = [];
    const avisos: string[] = [];
    const modos: ModoXR[] = ["2d"];
    if (d.webgl2) modos.push("3d-pantalla");
    const xrUsable = d.tieneXR && d.seguro;
    if (d.tieneXR && !d.seguro) avisos.push("WebXR sólo se abre en https o en localhost: aquí se verá en 3D normal.");
    if (xrUsable && d.vr) modos.push("vr-inmersivo");
    if (xrUsable && d.ar) modos.push(visor ? "ar-passthrough" : "ar-mano");
    if (plataforma === "ios") avisos.push("iPhone y iPad no traen WebXR en Safari: se ofrece 3D en pantalla; para ver un modelo en tu cuarto, AR Quick Look (sólo visor, sin interfaz propia).");
    if (plataforma === "visionos") avisos.push("En Vision Pro, Safari da VR inmersiva con mirada y pellizco; la AR por WebXR no está activa hoy.");
    if (d.vr === null || d.ar === null) avisos.push("Aún se está comprobando qué admite este aparato.");

    const entradas: EntradaXR[] = [];
    if (visor && (d.vr || d.ar)) {
        if (plataforma === "visionos") entradas.push("mirada-pellizco");
        else entradas.push("mandos");
        if (FUNCIONES_ESPERADAS[plataforma].includes("hand-tracking")) entradas.push("manos");
    }
    if (plataforma === "android-movil" || plataforma === "ios") entradas.push("tactil");
    if (plataforma === "escritorio") entradas.push("teclado-raton", "gamepad");
    entradas.push("voz");

    const ctx = o.contexto ?? "sistema";
    let recomendado: ModoXR = d.webgl2 ? "3d-pantalla" : "2d";
    if (o.modo && o.modo !== "auto" && modos.includes(o.modo)) {
        recomendado = o.modo;
        motivos.push("Elegido por la persona.");
    } else if (visor && plataforma !== "escritorio" && (modos.includes("vr-inmersivo") || modos.includes("ar-passthrough"))) {
        const hayVR = modos.includes("vr-inmersivo");
        const hayAR = modos.includes("ar-passthrough");
        const quiereVR = ctx === "mundo-vr" || (ctx === "sistema" && !hayAR);
        recomendado = (quiereVR && hayVR) || !hayAR ? "vr-inmersivo" : "ar-passthrough";
        motivos.push(recomendado === "ar-passthrough" ? "Visor con cámara: el sistema se trabaja mejor sobre tu cuarto." : "Un mundo se vive mejor sin la habitación alrededor.");
    } else if (modos.includes("ar-mano") && ctx !== "sistema") {
        recomendado = "ar-mano";
        motivos.push("Móvil con AR: el mundo se coloca en tu cuarto.");
    } else if (plataforma === "escritorio" && modos.includes("vr-inmersivo") && ctx === "mundo-vr") {
        recomendado = "vr-inmersivo";
        motivos.push("Ordenador con visor conectado.");
    } else {
        motivos.push(d.webgl2 ? "Sin sesión inmersiva posible: 3D en pantalla." : "Sin WebGL 2: se queda la interfaz plana.");
    }
    return {
        plataforma, visor, modos, recomendado, entradas,
        funciones: FUNCIONES_ESPERADAS[plataforma],
        ofrecerSesion: xrUsable && d.ofreceSesion && (d.vr === true || d.ar === true),
        motivos, avisos,
    };
}

/** Lo que de verdad se concedió (`session.enabledFeatures`) sustituye a lo esperado. Ignora lo desconocido. */
export function refinarFunciones(c: CapacidadesXR, habilitadas: readonly string[]): CapacidadesXR {
    return { ...c, funciones: habilitadas.filter(esFuncionXR) };
}

export type EstrategiaEntrada = "auto-al-abrir" | "oferta-navegador" | "boton-universal" | "solo-pantalla";
export interface PlanEntrada {
    estrategia: EstrategiaEntrada;
    modo: ModoXR;
    /** El navegador exige un gesto de la persona para abrir la sesión. */
    requiereGesto: boolean;
    /** Se pinta siempre el botón universal «Entrar en VR/AR» si hay algún modo inmersivo. */
    botonUniversal: boolean;
    motivo: string;
}

/**
 * Cómo entrar sin fricción respetando que el navegador exige un gesto (WebXR): sólo se abre solo en una
 * PWA inmersiva instalada en Quest (tocar el icono cuenta como gesto, según Meta); con `offerSession` se
 * deja que el navegador ponga su propio botón; en cualquier otro sitio, el botón universal.
 */
export function planificarEntrada(c: CapacidadesXR, o: { instalada: boolean; gesto?: boolean }): PlanEntrada {
    const inmersivos = c.modos.filter((m) => m === "vr-inmersivo" || m === "ar-passthrough" || m === "ar-mano");
    const botonUniversal = inmersivos.length > 0;
    if (c.recomendado === "2d" || c.recomendado === "3d-pantalla") {
        return { estrategia: "solo-pantalla", modo: c.recomendado, requiereGesto: false, botonUniversal, motivo: botonUniversal ? "Aquí se trabaja en pantalla; el botón entra en VR/AR cuando quieras." : "Este aparato no tiene VR ni AR." };
    }
    if (o.instalada && c.plataforma === "quest") {
        return { estrategia: "auto-al-abrir", modo: c.recomendado, requiereGesto: false, botonUniversal, motivo: "PWA instalada en Quest: tocar el icono ya es el gesto, se entra directo." };
    }
    if (c.ofrecerSesion) {
        return { estrategia: "oferta-navegador", modo: c.recomendado, requiereGesto: false, botonUniversal, motivo: "El navegador ofrece su propio botón de entrada (offerSession); el nuestro queda de respaldo." };
    }
    return { estrategia: "boton-universal", modo: c.recomendado, requiereGesto: o.gesto !== true, botonUniversal, motivo: "Hace falta tocar el botón: el navegador no abre VR/AR sin un gesto." };
}
