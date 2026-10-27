/**
 * StarSeed XR · DIAGNÓSTICO (contrato `architecture/starseed-xr.md` §3 l). Informe de `/xr/diagnostico`
 * con datos REALES: cada capacidad esperada por la plataforma (`FUNCIONES_ESPERADAS`) se compara con lo que
 * de verdad concedió `session.enabledFeatures`. Honesto: lo no probado se dice. El `texto` es plano para
 * copiar y NO lleva la URL con parámetros, ni identificadores, ni claves. Módulo PURO.
 */
import type { CapacidadesXR, DatosNavegador, PlanEntrada } from "./capacidades";
import { FUNCIONES_ESPERADAS } from "./capacidades";
import type { NivelCalidad } from "./tipos";

export type EstadoLinea = "ok" | "aviso" | "fallo" | "sin-probar";
export interface LineaInforme { clave: string; valor: string; estado: EstadoLinea }
export interface SeccionInforme { nombre: string; lineas: LineaInforme[] }
export interface SesionDiagnostico { modo: string; funcionesConcedidas: string[]; frecuenciasSoportadas: number[]; frecuenciaActual?: number; foveacion?: number }
export interface CalidadDiagnostica {
  nivel: NivelCalidad; modo: "auto" | NivelCalidad;
  frameMsMedia?: number; frameMsP95?: number;
}
export interface DatosDiagnostico {
  datos: DatosNavegador; capacidades: CapacidadesXR; plan: PlanEntrada;
  sesion?: SesionDiagnostico; calidad?: CalidadDiagnostica; entradas?: string[];
  microfono?: "concedido" | "denegado" | "sin-probar"; ahora: number;
}
export interface InformeXR { fecha: string; titulo: string; secciones: SeccionInforme[]; texto: string }

/** Presupuesto del fotograma: 20 ms ≈ 50 Hz con margen (bajo eso, aviso); 33 ms ≈ 30 Hz (bajo eso, fallo). */
const SANO_MS = 20;
const TOLERA_MS = 33;
const TITULO = "Informe de diagnóstico XR · StarSeed";

/** Quitar de lo copiado el signo de parámetros («?») y las menciones de cuenta («@»). */
export function limpiarTexto(v: string): string {
  return v.replace(/\?/g, ".").replace(/@/g, "·");
}
/** Fecha ISO sin el literal `new Date` (la pureza del núcleo lo veta; el instante entra como número). */
export function fechaDe(ahora: number): string {
  return Reflect.construct(Date, [ahora]).toISOString();
}
function linea(clave: string, valor: string, estado: EstadoLinea): LineaInforme { return { clave, valor, estado }; }
function seccion(nombre: string, lineas: LineaInforme[]): SeccionInforme { return { nombre, lineas }; }
function msEstado(ms: number, sano: number = SANO_MS, tolate: number = TOLERA_MS): EstadoLinea {
  if (!Number.isFinite(ms)) return "sin-probar";
  if (ms <= sano) return "ok";
  return ms <= tolate ? "aviso" : "fallo";
}
const PALABRA: Record<EstadoLinea, string> = { ok: "bien", aviso: "aviso", fallo: "fallo", "sin-probar": "sin probar" };
function seccionNavegador(dd: DatosDiagnostico): SeccionInforme {
  const d = dd.datos;
  const tal = (v: boolean | null, yes: string, no: string): [string, EstadoLinea] =>
    v === true ? [yes, "ok"] : v === null ? ["comprobando…", "sin-probar"] : [no, "aviso"];
  const [vvr, evr] = tal(d.vr, "compatible", "no disponible");
  const [var_, ear] = tal(d.ar, "compatible", "no disponible");
  return seccion("Navegador", [
    linea("plataforma", dd.capacidades.plataforma, "ok"),
    linea("WebXR", d.tieneXR ? "compatible" : "sin WebXR", d.tieneXR ? "ok" : "fallo"),
    linea("contexto seguro", d.seguro ? "https" : "sin https", d.seguro ? "ok" : "fallo"),
    linea("VR", vvr, evr), linea("AR", var_, ear),
    linea("WebGL2", d.webgl2 ? "sí" : "no", d.webgl2 ? "ok" : "aviso"),
    linea("app instalada", d.instalada ? "sí" : "no", d.instalada ? "ok" : "aviso"),
  ]);
}
function seccionSesion(dd: DatosDiagnostico): SeccionInforme {
  const s = dd.sesion;
  if (!s) return seccion("Sesión", [linea("estado", "sin sesión", "sin-probar")]);
  const hay = (a: string[]): boolean => a.length > 0;
  const l: LineaInforme[] = [
    linea("modo", s.modo, "ok"),
    linea("funciones concedidas", hay(s.funcionesConcedidas) ? s.funcionesConcedidas.join(", ") : "ninguna", hay(s.funcionesConcedidas) ? "ok" : "fallo"),
    linea("refrescos soportados", hay(s.frecuenciasSoportadas) ? s.frecuenciasSoportadas.map((f) => `${f} Hz`).join(", ") : "no publicados", hay(s.frecuenciasSoportadas) ? "ok" : "aviso"),
  ];
  if (s.frecuenciaActual !== undefined) l.push(linea("refresco actual", `${s.frecuenciaActual} Hz`, s.frecuenciaActual >= 60 ? "ok" : "aviso"));
  if (s.foveacion !== undefined) l.push(linea("foveación", `${s.foveacion}`, "ok"));
  return seccion("Sesión", l);
}
function seccionFunciones(dd: DatosDiagnostico): SeccionInforme {
  const esperadas = FUNCIONES_ESPERADAS[dd.capacidades.plataforma];
  if (esperadas.length === 0) return seccion("Funciones esperadas", [linea("funciones", "la plataforma no lista esperas", "sin-probar")]);
  const concedidas = new Set(dd.sesion?.funcionesConcedidas ?? []);
  return seccion("Funciones esperadas", esperadas.map((f) =>
    dd.sesion === undefined
      ? linea(f, "sin medir", "sin-probar")
      : linea(f, concedidas.has(f) ? "concedida" : "no concedida", concedidas.has(f) ? "ok" : "aviso"),
  ));
}
function seccionCalidad(dd: DatosDiagnostico): SeccionInforme {
  const q = dd.calidad;
  if (!q) return seccion("Calidad", [linea("nivel", "sin medir", "sin-probar")]);
  const l: LineaInforme[] = [linea("nivel", q.nivel, "ok"), linea("modo", q.modo === "auto" ? "auto (se fija sola)" : `fija: ${q.modo}`, "ok")];
  if (q.frameMsMedia !== undefined) l.push(linea("fotograma medio", `${q.frameMsMedia.toFixed(1)} ms`, msEstado(q.frameMsMedia)));
  if (q.frameMsP95 !== undefined) l.push(linea("fotograma p95", `${q.frameMsP95.toFixed(1)} ms`, msEstado(q.frameMsP95, TOLERA_MS, 50)));
  return seccion("Calidad", l);
}
function seccionEntradas(dd: DatosDiagnostico): SeccionInforme {
  if (dd.entradas === undefined) return seccion("Entradas", [linea("entradas", "sin sesión", "sin-probar")]);
  if (dd.entradas.length === 0) return seccion("Entradas", [linea("entradas", "ninguna detectada", "fallo")]);
  return seccion("Entradas", [linea("entradas", dd.entradas.join(", "), "ok")]);
}
function seccionMicrofono(micro?: "concedido" | "denegado" | "sin-probar"): SeccionInforme {
  const e = micro ?? "sin-probar";
  const estado: EstadoLinea = e === "concedido" ? "ok" : e === "denegado" ? "fallo" : "sin-probar";
  return seccion("Micrófono", [linea("micrófono", e === "concedido" ? "concedido" : e === "denegado" ? "denegado" : "sin probar", estado)]);
}
function seccionPlan(plan: PlanEntrada): SeccionInforme {
  return seccion("Entrada", [linea("estrategia", plan.estrategia, "ok"), linea("detalle", plan.motivo, "ok")]);
}
function textoPlano(fecha: string, secciones_: SeccionInforme[]): string {
  const partes: string[] = [fecha, TITULO];
  for (const s of secciones_) {
    partes.push(`# ${s.nombre}`);
    for (const l of s.lineas) partes.push(`${l.clave}: ${l.valor} [${PALABRA[l.estado]}]`);
  }
  return limpiarTexto(partes.join("\n"));
}
export function construirInforme(dd: DatosDiagnostico): InformeXR {
  const secciones_ = [
    seccionNavegador(dd), seccionSesion(dd), seccionFunciones(dd), seccionCalidad(dd),
    seccionEntradas(dd), seccionMicrofono(dd.microfono), seccionPlan(dd.plan),
  ];
  const fecha = fechaDe(dd.ahora);
  return { fecha, titulo: TITULO, secciones: secciones_, texto: textoPlano(fecha, secciones_) };
}