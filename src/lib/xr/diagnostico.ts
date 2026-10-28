/**
 * StarSeed XR · DIAGNÓSTICO (XR1010AI, contrato §3 l). Módulo PURO.
 * Compara lo que el navegador DICE (`DatosNavegador`) con lo que la sesión de verdad CONCEDIÓ
 * (`session.enabledFeatures`): cada línea afirma por lo concedido, nunca por la marca del aparato.
 * El `texto` es informe plano para copiar: sin URL con parámetros, sin identificadores, sin claves.
 */
import type { CapacidadesXR, DatosNavegador, PlanEntrada } from "./capacidades";
import { FUNCIONES_ESPERADAS } from "./capacidades";
import type { NivelCalidad } from "./tipos";
import { PERFILES } from "./calidad-perfiles";

export type EstadoLinea = "ok" | "aviso" | "fallo" | "sin-probar";

export interface LineaInforme { clave: string; valor: string; estado: EstadoLinea }
export interface SeccionInforme { nombre: string; lineas: LineaInforme[] }

/** Lo mínimo de una sesión real que el informe necesita (lo lee la página al entrar). */
export interface DatosSesionXR {
    modo: string;
    /** `session.enabledFeatures` tal cual: lo CONCEDIDO manda; `supportedFrameRates` puede ir vacío. */
    funcionesConcedidas: string[];
    frecuenciasSoportadas: number[];
    frecuenciaActual?: number;
    foveacion?: number;
}

export interface CalidadInforme {
    nivel: NivelCalidad;
    modo: "auto" | NivelCalidad;
    frameMsMedia?: number;
    frameMsP95?: number;
}

export interface DatosInforme {
    datos: DatosNavegador;
    capacidades: CapacidadesXR;
    plan: PlanEntrada;
    sesion?: DatosSesionXR;
    calidad?: CalidadInforme;
    entradas?: string[]; // formas de entrada vistas en la sesión (`session.inputSources`)
    microfono?: "concedido" | "denegado" | "sin-probar";
    ahora: number; // instante del informe (ms de época): en módulo puro no se lee el reloj
}

export interface InformeXR { fecha: string; titulo: string; secciones: SeccionInforme[]; texto: string }

/** Día civil gregoriano desde la época UTC (algoritmo de Hinnant), sin `new Date`: módulo puro. */
export function fechaDe(ahora: number): string {
    if (!Number.isFinite(ahora) || ahora < 0) return "";
    const dias = Math.floor(ahora / 86_400_000);
    const msDia = ahora - dias * 86_400_000;
    const z = dias + 719_468;
    const era = Math.floor(z / 146_097);
    const doe = z - era * 146_097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const y = yoe + era * 400;
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153);
    const mes = mp < 10 ? mp + 3 : mp - 9;
    const dia = doy - Math.floor((153 * (mes <= 2 ? mes + 9 : mes - 3) + 2) / 5) + 1;
    const p = (n: number): string => String(Math.max(0, n)).padStart(2, "0");
    return `${p(mes <= 2 ? y + 1 : y)}-${p(mes)}-${p(dia)} ${p(Math.floor(msDia / 3_600_000))}:${p(Math.floor((msDia % 3_600_000) / 60_000))}`;
}

/** Media y percentil 95 de duraciones de fotograma (ms). Descarta lo no medible; `null` si nada. */
export function mediaP95(duraciones: readonly number[]): { media: number | null; p95: number | null } {
    const v = duraciones.filter((x) => Number.isFinite(x) && x > 0 && x < 2000).sort((a, b) => a - b);
    if (v.length === 0) return { media: null, p95: null };
    return {
        media: v.reduce((s, x) => s + x, 0) / v.length,
        p95: v[Math.min(v.length - 1, Math.ceil(v.length * 0.95) - 1)],
    };
}

// ── el informe ────────────────────────────────────────────────────
/** Privacidad del texto: jamás «?» de parámetros ni «@» de cuentas (aunque el navegador los pegue). */
const LIMPIA = (t: string): string => t.replace(/[?@]/g, ""), SI_NO = (v: boolean): string => (v ? "sí" : "no");

const dispo = (v: boolean | null): { valor: string; estado: EstadoLinea } =>
    v === null ? { valor: "comprobando", estado: "sin-probar" } : v === true ? { valor: "disponible", estado: "ok" } : { valor: "no disponible", estado: "aviso" };

function seccion(nombre: string, lineas: LineaInforme[]): SeccionInforme {
    return { nombre: LIMPIA(nombre), lineas: lineas.map((l) => ({ clave: LIMPIA(l.clave), valor: LIMPIA(l.valor), estado: l.estado })) };
}

function seccionAparato(d: DatosInforme): SeccionInforme {
    const { datos: n, capacidades: c } = d;
    const lineas: LineaInforme[] = [
        { clave: "Plataforma", valor: c.plataforma, estado: "ok" },
        { clave: "Navegador seguro", valor: n.seguro ? "sí" : "no (WebXR exige https o localhost)", estado: n.seguro ? "ok" : "fallo" },
        { clave: "VR", valor: dispo(n.vr).valor, estado: dispo(n.vr).estado },
        { clave: "AR", valor: dispo(n.ar).valor, estado: dispo(n.ar).estado },
        { clave: "WebXR", valor: n.tieneXR ? "presente" : "sin WebXR (lo traen los navegadores de visores y Chrome con un visor)", estado: n.tieneXR ? "ok" : "aviso" },
        { clave: "WebGL 2", valor: SI_NO(n.webgl2), estado: n.webgl2 ? "ok" : "aviso" },
        { clave: "WebGPU", valor: SI_NO(n.webgpu), estado: n.webgpu ? "ok" : "aviso" },
        { clave: "App instalada", valor: SI_NO(n.instalada), estado: n.instalada ? "ok" : "sin-probar" },
        { clave: "Visor detectado", valor: SI_NO(c.visor), estado: c.visor ? "ok" : "aviso" },
        { clave: "Entradas esperadas", valor: c.entradas.join(", "), estado: "ok" },
    ];
    if (n.ua.length > 0) lineas.push({ clave: "Navegador (UA)", valor: n.ua, estado: "ok" });
    if (c.avisos.length > 0) lineas.push({ clave: "Avisos del sondeo", valor: c.avisos.join("; "), estado: "aviso" });
    return seccion("Aparato", lineas);
}

function seccionPlan(d: DatosInforme): SeccionInforme {
    return seccion("Plan de entrada", [
        { clave: "Estrategia", valor: d.plan.estrategia, estado: "ok" },
        { clave: "Modo recomendado", valor: d.capacidades.recomendado, estado: "ok" },
        { clave: "Requiere gesto", valor: SI_NO(d.plan.requiereGesto), estado: d.plan.requiereGesto ? "aviso" : "ok" },
        { clave: "Motivo", valor: d.plan.motivo, estado: "ok" },
    ]);
}

const estadoMicro = (m: DatosInforme["microfono"]): { valor: string; estado: EstadoLinea } =>
    m === "concedido" ? { valor: "concedido", estado: "ok" }
    : m === "denegado" ? { valor: "denegado (se concede en los ajustes del navegador)", estado: "fallo" }
    : { valor: "sin probar (pulsa Probar micrófono)", estado: "sin-probar" };

function seccionSesion(d: DatosInforme): SeccionInforme {
    const s = d.sesion;
    const micro = estadoMicro(d.microfono);
    const entradas = d.entradas ?? [];
    const noWeb = d.capacidades.plataforma === "ios";
    const lineas: LineaInforme[] = s
        ? [
              { clave: "Sesión inmersiva", valor: s.modo, estado: "ok" },
              { clave: "Micrófono", valor: micro.valor, estado: micro.estado },
              { clave: "Entradas vistas", valor: entradas.length > 0 ? entradas.join(", ") : "ninguna vista aún", estado: entradas.length > 0 ? "ok" : "aviso" },
          ]
        : [
              { clave: "Sesión inmersiva", valor: noWeb ? "no hay WebXR en este aparato" : "sin abrir", estado: noWeb ? "fallo" : "sin-probar" },
              { clave: "Micrófono", valor: micro.valor, estado: micro.estado },
              { clave: "Entradas vistas", valor: "sin sesión", estado: "sin-probar" },
          ];
    return seccion("Sesión", lineas);
}

/** Una línea por cada función ESPERADA de la plataforma: ok si la CONCEDIÓ la sesión; aviso si no; sin-probar sin sesión. */
function seccionFunciones(d: DatosInforme): SeccionInforme | null {
    const esperadas = FUNCIONES_ESPERADAS[d.capacidades.plataforma];
    if (esperadas.length === 0) return null;
    const s = d.sesion;
    const con = new Set(s === undefined ? [] : s.funcionesConcedidas);
    const lineas: LineaInforme[] = esperadas.map((f) =>
        s === undefined
            ? { clave: f, valor: "esperada, sin probar", estado: "sin-probar" }
            : con.has(f)
              ? { clave: f, valor: "concedida", estado: "ok" }
              : { clave: f, valor: "esperada, no concedida", estado: "aviso" },
    );
    if (s !== undefined) {
        const nombres: string[] = esperadas;
        const extra = s.funcionesConcedidas.filter((f) => !nombres.includes(f));
        if (extra.length > 0) lineas.push({ clave: "Concedidas no esperadas", valor: extra.join(", "), estado: "aviso" });
    }
    return seccion("Funciones esperadas y concedidas", lineas);
}

function seccionCalidad(d: DatosInforme): SeccionInforme {
    const s = d.sesion;
    const q = d.calidad;
    const Hz = s?.frecuenciasSoportadas ?? [];
    return seccion("Calidad", [
        { clave: "Nivel y modo", valor: q === undefined ? "sin datos" : `${q.nivel} (${q.modo === "auto" ? "automático" : `fijo en ${q.modo}`})`, estado: q === undefined ? "sin-probar" : "ok" },
        { clave: "Fotograma", valor: q?.frameMsMedia === undefined ? "sin medir" : `${q.frameMsMedia.toFixed(1)} ms de media; p95 ${q.frameMsP95 === undefined ? "sin datos" : `${q.frameMsP95.toFixed(1)} ms`}`, estado: estadoFotograma(d) },
        { clave: "Refresco soportado", valor: s === undefined ? "sin sesión" : Hz.length > 0 ? `${Hz.join(", ")} Hz` : "el visor no lista frecuencias", estado: s === undefined ? "sin-probar" : Hz.length > 0 ? "ok" : "aviso" },
        { clave: "Refresco actual", valor: s?.frecuenciaActual === undefined ? "sin probar" : `${s.frecuenciaActual} Hz`, estado: s?.frecuenciaActual === undefined ? "sin-probar" : "ok" },
        { clave: "Foveación", valor: s?.foveacion === undefined ? "sin probar" : String(s.foveacion), estado: s?.foveacion === undefined ? "sin-probar" : "ok" },
    ]);
}

/** El fotograma es lento si pasa del presupuesto del nivel (1,08× aviso, como en `calidad.ts`; 1,5× ya falla). */
function estadoFotograma(d: DatosInforme): EstadoLinea {
    const q = d.calidad;
    const media = q?.frameMsMedia;
    if (q === undefined || media === undefined) return "sin-probar";
    const presupuesto = 1000 / Math.max(30, d.sesion?.frecuenciaActual ?? PERFILES[q.nivel].refrescoPreferidoHz);
    return media > presupuesto * 1.5 ? "fallo" : media > presupuesto * 1.08 ? "aviso" : "ok";
}

/** Texto plano para copiar y pegar: cabecera, una sección por bloque y una línea por dato con su estado. */
function aTexto(titulo: string, fecha: string, secciones: readonly SeccionInforme[]): string {
    const bloques: string[] = [titulo, `Fecha: ${fecha} (UTC)`];
    for (const s of secciones) {
        bloques.push("", `[${s.nombre}]`);
        for (const l of s.lineas) bloques.push(`${l.clave}: ${l.valor} (${l.estado})`);
    }
    return bloques.join("\n");
}

export function construirInforme(d: DatosInforme): InformeXR {
    const titulo = "StarSeed XR · informe del visor";
    const fecha = fechaDe(d.ahora);
    const secciones: SeccionInforme[] = [seccionAparato(d), seccionPlan(d), seccionSesion(d)];
    const funciones = seccionFunciones(d);
    if (funciones !== null) secciones.push(funciones);
    secciones.push(seccionCalidad(d));
    return { fecha, titulo, secciones, texto: aTexto(titulo, fecha, secciones) };
}
