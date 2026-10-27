/**
 * StarSeed XR · DIAGNÓSTICO DEL VISOR (XR1010AI, contrato `architecture/starseed-xr.md` §3 l).
 * Cada línea del informe dice si la capacidad ESPERADA por la plataforma (`FUNCIONES_ESPERADAS`)
 * fue de verdad CONCEDIDA (`session.enabledFeatures`), o cuándo no se ha probado todavía.
 * Módulo PURO: reloj, sesión y fotogramas entran como datos; sin `new Date`. Privacidad (§3 k):
 * el `texto` nunca lleva URL con parámetros ni identificadores: toda cadena pasa por `limpiar`.
 */
import type { CapacidadesXR, DatosNavegador, PlanEntrada } from "./capacidades";
import { FUNCIONES_XR, type NivelCalidad } from "./tipos";

export type EstadoLinea = "ok" | "aviso" | "fallo" | "sin-probar";

export interface LineaInforme { clave: string; valor: string; estado: EstadoLinea }
export interface SeccionInforme { nombre: string; lineas: LineaInforme[] }

/** Lo que la página mide de la sesión abierta (`XRSession` y sus extensiones). */
export interface SesionDiag { modo: string; funcionesConcedidas: string[]; frecuenciasSoportadas: number[]; frecuenciaActual?: number; foveacion?: number }

/** Nivel de calidad y fotogramas medidos (el medidor de la página o el de XR1010AE). */
export interface CalidadDiag { nivel: NivelCalidad; modo: "auto" | NivelCalidad; frameMsMedia?: number; frameMsP95?: number }

export type MicrofonoDiag = "concedido" | "denegado" | "sin-probar";

export interface DatosDiag {
    datos: DatosNavegador;
    capacidades: CapacidadesXR;
    plan: PlanEntrada;
    sesion?: SesionDiag;
    calidad?: CalidadDiag;
    /** Formas de entrada vistas en la sesión (`inputSources`), si la hubo. */
    entradas?: string[];
    microfono?: MicrofonoDiag;
    ahora: number;
}

export interface Informe { fecha: string; titulo: string; secciones: SeccionInforme[]; texto: string }

/** Retira lo que haría identificable una copia del informe (§3 l): parámetros, identificadores y saltos de línea. */
const limpiar = (s: string): string => s.replace(/[?@]/g, "").replace(/[\r\n]+/g, "; ").trim();

const SI = "sí";
const linea = (clave: string, valor: string, estado: EstadoLinea): LineaInforme => ({ clave, valor: limpiar(valor), estado });
/** Fecha UTC por aritmética pura (nada de `new Date`): días de época → fecha civil. */
function fechaDe(ahora: number): string {
    const s = Math.max(0, Math.floor(ahora / 1000));
    const dias = Math.floor(s / 86400);
    const reloj = [Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60)].map((n) => String(n).padStart(2, "0"));
    const z = dias + 719468;
    const era = Math.floor(z / 146097);
    const doe = z - era * 146097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const y = yoe + era * 400;
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153);
    const mes = (mp < 10 ? mp + 3 : mp - 9).toString().padStart(2, "0");
    const dia = (doy - Math.floor((153 * mp + 2) / 5) + 1).toString().padStart(2, "0");
    const anio = (mp < 10 ? y : y + 1).toString().padStart(4, "0");
    return `${anio}-${mes}-${dia} ${reloj[0]}:${reloj[1]} UTC`;
}

/** Media y percentil 95 de los pasos entre fotogramas (ms). Descarta pasos no reales y corta picos de pausa. */
export function resumirFotogramas(dt: readonly number[]): { media?: number; p95?: number } {
    const reales = dt.filter((n) => Number.isFinite(n) && n > 0 && n < 400);
    if (reales.length === 0) return {};
    const media = reales.reduce((a, b) => a + b, 0) / reales.length;
    const orden = [...reales].sort((a, b) => a - b);
    const p95 = orden[Math.min(orden.length - 1, Math.ceil(orden.length * 0.95) - 1)];
    return { media, p95 };
}

/**
 * Una línea por cada función esperada en la plataforma y por cada una concedida de verdad.
 * Orden estable: el de `FUNCIONES_XR`; sin sesión abierta, todas «sin-probar» (no es un fallo).
 */
function lineasFunciones(esperadas: readonly string[], concedidas: readonly string[] | undefined): LineaInforme[] {
    const habiles = new Set(concedidas ?? []);
    const esperado = new Set(esperadas);
    const lineas: LineaInforme[] = [];
    for (const funcion of FUNCIONES_XR) {
        const nombre = funcion as string;
        if (!esperado.has(nombre) && !habiles.has(nombre)) continue;
        if (habiles.has(nombre)) lineas.push(linea(nombre, "concedida", "ok"));
        else if (concedidas === undefined) lineas.push(linea(nombre, "sin sesión", "sin-probar"));
        else lineas.push(linea(nombre, "no concedida", "aviso"));
    }
    return lineas;
}

/** El navegador y su contexto: los hechos del sondeo, con la honestidad de estados «sin-probar»/«aviso». */
function seccionNavegador(d: DatosDiag): SeccionInforme {
    const t = d.datos;
    const lineas: LineaInforme[] = [
        linea("Contexto seguro", t.seguro ? "https o localhost" : "sin contexto seguro: WebXR apagado", t.seguro ? "ok" : "fallo"),
        linea("WebXR", t.tieneXR ? "disponible" : "sin WebXR en este navegador", t.tieneXR ? "ok" : (d.capacidades.plataforma === "ios" ? "aviso" : "fallo")),
        linea("VR inmersivo", t.vr === true ? SI : t.vr === false ? "no" : "comprobando…", t.vr === true ? "ok" : t.vr === false ? "aviso" : "sin-probar"),
        linea("AR (passthrough)", t.ar === true ? SI : t.ar === false ? "no" : "comprobando…", t.ar === true ? "ok" : t.ar === false ? "aviso" : "sin-probar"),
        linea("Botón del navegador (offerSession)", t.ofreceSesion ? "sí" : "no: botón propio", t.ofreceSesion ? "ok" : "aviso"),
        linea("WebGL 2", t.webgl2 ? "sí" : "no: sin 3D en pantalla", t.webgl2 ? "ok" : "aviso"), linea("App instalada", t.instalada ? SI : "no", "ok"),
        linea("Navegador (agente de usuario)", t.ua.length > 0 ? t.ua : "sin dato", "ok"),
    ];
    return { nombre: "Navegador", lineas };
}
function seccionPlataforma(d: DatosDiag): SeccionInforme {
    const c = d.capacidades;
    const entradas = (d.entradas ?? c.entradas).join(", ");
    return {
        nombre: "Plataforma y entrada",
        lineas: [
            linea("Plataforma", c.plataforma, "ok"), linea("Modo recomendado", c.recomendado, "ok"),
            linea("Modos posibles", c.modos.join(", "), "ok"),
            linea("Entradas", entradas.length > 0 ? entradas : "ninguna detectada", entradas.length > 0 ? "ok" : "aviso"),
            linea("Plan de entrada", `${d.plan.estrategia}: ${d.plan.motivo}`, "ok"),
            linea("Avisos del sondeo", c.avisos.length > 0 ? c.avisos.join("; ") : "ninguno", c.avisos.length > 0 ? "aviso" : "ok"),
        ],
    };
}

function seccionSesion(d: DatosDiag): SeccionInforme {
    const s = d.sesion;
    const lineas: LineaInforme[] = s
        ? [linea("Modo de la sesión", s.modo, "ok")]
        : [linea("Sesión inmersiva", "sin abrir; pulsa «Entrar en VR/AR para medir»", "sin-probar")];
    lineas.push(...lineasFunciones(d.capacidades.funciones, s?.funcionesConcedidas));
    if (s) {
        const soportadas = (s.frecuenciasSoportadas ?? []).filter((h) => Number.isFinite(h) && h > 0);
        lineas.push(linea("Refresco soportado", soportadas.length > 0 ? `${soportadas.map((h) => String(h)).join(", ")} Hz` : "no listado", soportadas.length > 0 ? "ok" : "aviso"));
        lineas.push(linea("Frecuencia actual", s.frecuenciaActual !== undefined ? `${s.frecuenciaActual} Hz` : "sin dato", s.frecuenciaActual !== undefined ? "ok" : "aviso"));
        lineas.push(linea("Foveación", s.foveacion !== undefined ? String(s.foveacion) : "sin dato", s.foveacion !== undefined ? "ok" : "aviso"));
    }
    return { nombre: "Sesión inmersiva", lineas };
}

function seccionCalidad(d: DatosDiag): SeccionInforme {
    const q = d.calidad;
    if (!q) return { nombre: "Calidad", lineas: [linea("Calidad", "sin medir; entra en VR/AR para medir fotogramas", "sin-probar")] };
    const hz = d.sesion?.frecuenciaActual;
    const presupuestoMs = hz !== undefined && hz > 0 ? 1000 / hz : 20; // 50 fps de referencia honesta si el visor no lo dijo
    const estadoMs = (v: number | undefined): EstadoLinea => (v === undefined ? "sin-probar" : v > presupuestoMs * 1.25 ? "aviso" : "ok");
    return {
        nombre: "Calidad",
        lineas: [
            linea("Nivel", q.nivel, "ok"), linea("Modo de calidad", q.modo === "auto" ? "auto (se ajusta sola)" : q.modo, "ok"),
            linea("Fotograma medio", q.frameMsMedia === undefined ? "sin medir" : `${q.frameMsMedia.toFixed(1)} ms`, estadoMs(q.frameMsMedia)),
            linea("Fotograma p95", q.frameMsP95 === undefined ? "sin medir" : `${q.frameMsP95.toFixed(1)} ms`, estadoMs(q.frameMsP95)),
        ],
    };
}

const MICROFONO: Record<MicrofonoDiag, [string, EstadoLinea]> = {
    concedido: ["concedido", "ok"], denegado: ["denegado: sin voz en la sesión", "aviso"],
    "sin-probar": ["sin probar; pulsa «Probar micrófono»", "sin-probar"],
};

const ETIQUETA_ESTADO: Record<EstadoLinea, string> = { ok: "ok", aviso: "aviso", fallo: "fallo", "sin-probar": "sin probar" };

export function construirInforme(d: DatosDiag): Informe {
    const fecha = limpiar(fechaDe(d.ahora));
    const titulo = limpiar(`Informe de diagnóstico XR · ${d.capacidades.plataforma}`);
    const secciones = [seccionNavegador(d), seccionPlataforma(d), seccionSesion(d), seccionCalidad(d),
        { nombre: "Micrófono", lineas: [linea("Micrófono", MICROFONO[d.microfono ?? "sin-probar"][0], MICROFONO[d.microfono ?? "sin-probar"][1])] }];
    const bloques = [titulo, fecha, ...secciones.map((s) => [`${s.nombre}:`, ...s.lineas.map((l) => `  ${l.clave}: ${l.valor} (${ETIQUETA_ESTADO[l.estado]})`)])];
    return { fecha, titulo, secciones, texto: bloques.map((b) => b.join("\n")).join("\n") };
}

/** Lo mínimo de `XRSession` que el diagnóstico usa; inyectable en pruebas sin WebXR. */
export interface SesionMedible {
    enabledFeatures?: readonly string[];
    supportedFrameRates?: ArrayLike<number>;
    inputSources?: ArrayLike<{ targetRayMode: string; handedness?: string }>;
    foveacion?: number; frameRate?: number;
    requestAnimationFrame(fn: (t: number) => void): void; end(): Promise<void>;
}

export const DURACION_MEDICION_MS = 10_000;
export const SIN_FOTOGRAMAS = "La sesión no entregó ningún fotograma para medir.";
/** Mide `DURACION_MEDICION_MS` de fotogramas del bucle de la propia sesión. Sesión y pausa inyectadas. */
export async function medirSesion(
    tipo: string, sesion: SesionMedible, nivel: NivelCalidad, esperar: (ms: number) => Promise<void>,
): Promise<{ sesion: SesionDiag; entradas: string[]; calidad: CalidadDiag }> {
    const dt: number[] = [];
    let anterior = 0;
    let vivo = true;
    const recoger = (t: number) => {
        if (!vivo) return;
        if (anterior > 0) dt.push(t - anterior);
        anterior = t;
        sesion.requestAnimationFrame(recoger);
    };
    sesion.requestAnimationFrame(recoger);
    await esperar(DURACION_MEDICION_MS);
    vivo = false;
    const resumen = resumirFotogramas(dt);
    if (dt.length === 0) throw new Error(SIN_FOTOGRAMAS);
    await sesion.end();
    return {
        sesion: {
            modo: tipo, funcionesConcedidas: Array.from(sesion.enabledFeatures ?? []),
            frecuenciasSoportadas: Array.from(sesion.supportedFrameRates ?? []),
            frecuenciaActual: sesion.frameRate, foveacion: sesion.foveacion,
        },
        entradas: Array.from(sesion.inputSources ?? []).map((f) => f.targetRayMode + (f.handedness && f.handedness !== "none" ? ` (${f.handedness})` : "")),
        calidad: { nivel, modo: "auto", frameMsMedia: resumen.media, frameMsP95: resumen.p95 },
    };
}
