/** StarSeed XR · DIAGNÓSTICO (contrato §3 l). PURO: sin DOM, red ni cámara. Una capacidad se afirma sólo por
 * `session.enabledFeatures`; el `texto` plano pasa por `limpiar` y no lleva URL con parámetros ni identificadores. */
import { FUNCIONES_ESPERADAS, type CapacidadesXR, type DatosNavegador, type PlanEntrada } from "./capacidades";
import { AJUSTES } from "./calidad";
import { PERFILES } from "./calidad-perfiles";
import { esFuncionXR, type NivelCalidad, type PlataformaVisor } from "./tipos";

export type EstadoLinea = "ok" | "aviso" | "fallo" | "sin-probar";
export interface LineaInforme { clave: string; valor: string; estado: EstadoLinea }
export interface SeccionInforme { nombre: string; lineas: LineaInforme[] }
export interface InformeXR { fecha: string; titulo: string; secciones: SeccionInforme[]; texto: string }
export interface SesionMedida { modo: string; funcionesConcedidas: string[]; frecuenciasSoportadas: number[]; frecuenciaActual?: number; foveacion?: number }
export interface CalidadMedida { nivel: NivelCalidad; modo: "auto" | NivelCalidad; frameMsMedia?: number; frameMsP95?: number }
export interface DatosInforme {
    datos: DatosNavegador; capacidades: CapacidadesXR; plan: PlanEntrada; sesion?: SesionMedida; calidad?: CalidadMedida;
    entradas?: string[]; microfono?: "concedido" | "denegado" | "sin-probar"; ahora: number;
}

const TITULO = "Informe del visor · StarSeed XR";
const PLATAFORMA: Record<PlataformaVisor, string> = {
    quest: "Meta Quest", pico: "Pico", visionos: "Apple Vision Pro", "android-xr": "Android XR",
    "magic-leap": "Magic Leap", spectacles: "Snap Spectacles", "android-movil": "Android (móvil)",
    ios: "iPhone o iPad", escritorio: "Ordenador", desconocida: "Aparato desconocido",
};
/** Quita URL, parámetros y arrobas de lo que va al texto plano (privacidad §3 k). */
const limpiar = (v: string): string =>
    v.replace(/https?:\/\/[^\s]+/gi, "(enlace omitido)").replace(/[?@]/g, "").slice(0, 160);
const fecha = (t: number): string => new Date(t).toISOString();
const linea = (clave: string, valor: string, estado: EstadoLinea): LineaInforme => ({ clave, valor, estado });
function seccionAparato(d: DatosInforme): SeccionInforme {
    const { datos: n, capacidades: c } = d;
    const lineas: LineaInforme[] = [
        linea("plataforma", PLATAFORMA[c.plataforma], "ok"),
        linea("contexto seguro", n.seguro ? "sí (https o localhost)" : "no: WebXR no se abre sin https", n.seguro ? "ok" : "fallo"),
        linea("WebXR", n.tieneXR ? "disponible" : "sin WebXR en este navegador", n.tieneXR ? "ok" : "aviso"),
        linea("VR inmersiva", n.vr === null ? "comprobando" : n.vr ? "disponible" : "no disponible", n.vr === null ? "sin-probar" : n.vr ? "ok" : "aviso"),
        linea("AR", n.ar === null ? "comprobando" : n.ar ? "disponible" : c.plataforma === "visionos" ? "no disponible (Vision Pro solo ofrece VR)" : "no disponible", n.ar === null ? "sin-probar" : n.ar ? "ok" : "aviso"),
        linea("WebGL 2", n.webgl2 ? "disponible" : "no disponible: se queda el 2D", n.webgl2 ? "ok" : "aviso"),
        linea("app instalada", n.instalada ? "sí" : "no", "ok"),
    ];
    for (const aviso of c.avisos) lineas.push(linea("aviso", aviso, "aviso"));
    return { nombre: "Aparato y navegador", lineas };
}
function seccionPlan(d: DatosInforme): SeccionInforme {
    const p = d.plan;
    return { nombre: "Entrada", lineas: [
        linea("estrategia", p.estrategia, "ok"),
        linea("modo recomendado", p.modo, "ok"),
        linea("gesto necesario", p.requiereGesto ? "sí" : "no", "ok"),
        linea("motivo", p.motivo, "ok"),
    ] };
}
function seccionFunciones(d: DatosInforme): SeccionInforme {
    const esperadas = FUNCIONES_ESPERADAS[d.capacidades.plataforma];
    const concedidas = new Set(d.sesion?.funcionesConcedidas ?? []);
    const hay = d.sesion !== undefined;
    const lineas: LineaInforme[] = esperadas.map((f) => {
        if (!hay) return linea(f, "sin sesión: no se puede comprobar", "sin-probar");
        return concedidas.has(f)
            ? linea(f, "concedida", "ok")
            : linea(f, f === "plane-detection" ? "no concedida (en Quest solo va como requerida)" : "no concedida", "aviso");
    });
    if (esperadas.length === 0) lineas.push(linea("esperadas", "ninguna para esta plataforma", hay ? "ok" : "sin-probar"));
    const extra = [...concedidas].filter((f) => esFuncionXR(f) && !esperadas.includes(f)).sort();
    for (const f of extra) lineas.push(linea(f, "concedida (no esperada)", "ok"));
    return { nombre: "Funciones WebXR verificadas", lineas };
}
function seccionSesion(d: DatosInforme): SeccionInforme {
    const s = d.sesion;
    if (!s) return { nombre: "Sesión", lineas: [linea("sesión inmersiva", "sin abrir: entra en VR/AR para medir", "sin-probar")] };
    const frec = [...s.frecuenciasSoportadas].sort((a, b) => a - b);
    const lineas = [
        linea("modo", s.modo, "ok"),
        linea("funciones concedidas", s.funcionesConcedidas.length ? [...s.funcionesConcedidas].sort().join(", ") : "ninguna", "ok"),
        linea("frecuencias", frec.length ? `${frec.join(", ")} Hz` : "el visor no las anuncia", frec.length ? "ok" : "sin-probar"),
        linea("frecuencia actual", s.frecuenciaActual === undefined ? "no la anuncia" : `${s.frecuenciaActual} Hz`, s.frecuenciaActual === undefined ? "sin-probar" : "ok"),
    ];
    if (s.foveacion !== undefined) lineas.push(linea("foveación", s.foveacion.toFixed(2), "ok"));
    return { nombre: "Sesión", lineas };
}
function seccionCalidad(d: DatosInforme): SeccionInforme {
    const q = d.calidad;
    if (!q) return { nombre: "Calidad y fotogramas", lineas: [linea("medición", "sin medir: entra en VR/AR y espera 10 s", "sin-probar")] };
    const p = PERFILES[q.nivel], presupuesto = 1000 / p.refrescoPreferidoHz;
    const estado = (ms: number): EstadoLinea => (ms > presupuesto * 1.5 ? "fallo" : ms > presupuesto * AJUSTES.umbralSobre ? "aviso" : "ok");
    const lineas = [
        linea("nivel", `${q.nivel} · ${q.modo === "auto" ? "automático" : "fijado"}`, "ok"),
        linea("presupuesto", `${presupuesto.toFixed(1)} ms por fotograma a ${p.refrescoPreferidoHz} Hz`, "ok"),
        linea("resolución", `×${p.escalaResolucion} (se aplica en la sesión siguiente)`, "ok"),
    ];
    if (q.frameMsMedia !== undefined) lineas.push(linea("fotograma medio", `${q.frameMsMedia.toFixed(1)} ms`, estado(q.frameMsMedia)));
    if (q.frameMsP95 !== undefined) lineas.push(linea("fotograma p95", `${q.frameMsP95.toFixed(1)} ms`, estado(q.frameMsP95)));
    if (q.frameMsMedia === undefined && q.frameMsP95 === undefined) lineas.push(linea("fotogramas", "no se pudieron medir", "sin-probar"));
    return { nombre: "Calidad y fotogramas", lineas };
}
function seccionEntradas(d: DatosInforme): SeccionInforme {
    const medidas = d.entradas, previstas = d.capacidades.entradas;
    if (medidas && medidas.length) return { nombre: "Entradas", lineas: [linea("detectadas en la sesión", [...medidas].sort().join(", "), "ok")] };
    return { nombre: "Entradas", lineas: [previstas.length ? linea("previstas por el aparato", previstas.join(", "), "sin-probar") : linea("entradas", "ninguna detectada", "aviso")] };
}
function seccionMicro(d: DatosInforme): SeccionInforme {
    const m = d.microfono ?? "sin-probar";
    return { nombre: "Micrófono", lineas: [linea("permiso", m === "concedido" ? "concedido: Astraura puede oírte" : m === "denegado" ? "denegado: la voz no funcionará hasta que lo permitas" : "sin probar: pulsa «Probar micrófono»", m === "concedido" ? "ok" : m === "denegado" ? "aviso" : "sin-probar")] };
}
function textoPlano(fechaTxt: string, secciones: SeccionInforme[]): string {
    const filas = [TITULO, `Fecha: ${fechaTxt}`, ""];
    for (const s of secciones) {
        filas.push(`== ${s.nombre} ==`);
        for (const l of s.lineas) filas.push(`${limpiar(l.clave)}: ${limpiar(l.valor)} [${l.estado}]`);
        filas.push("");
    }
    return filas.join("\n");
}
export function construirInforme(d: DatosInforme): InformeXR {
    const fechaTxt = fecha(d.ahora);
    const secciones = [seccionAparato(d), seccionPlan(d), seccionFunciones(d), seccionSesion(d), seccionCalidad(d), seccionEntradas(d), seccionMicro(d)];
    return { fecha: fechaTxt, titulo: TITULO, secciones, texto: textoPlano(fechaTxt, secciones) };
}
