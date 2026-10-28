/**
 * StarSeed XR · DIAGNÓSTICO (§3 l del contrato): lo que se esperaba por plataforma frente a lo que
 * de verdad CONCEDIÓ la sesión; nunca por la marca del aparato. `texto` es plano para copiar: sin
 * URL con parámetros, sin identificadores de cuenta, sin claves (privacidad §3 k). Módulo PURO.
 */
import type { CapacidadesXR, DatosNavegador, PlanEntrada } from "./capacidades";
import type { NivelCalidad, FuncionXR } from "./tipos";
import { esFuncionXR } from "./tipos";

export type EstadoLinea = "ok" | "aviso" | "fallo" | "sin-probar";
export interface LineaInforme { clave: string; valor: string; estado: EstadoLinea }
export interface SeccionInforme { nombre: string; lineas: LineaInforme[] }
export type EstadoMicrofono = "concedido" | "denegado" | "sin-probar";
export interface DatosSesion { modo: string; funcionesConcedidas: string[]; frecuenciasSoportadas: number[]; frecuenciaActual?: number; foveacion?: number }
export interface DatosCalidadInforme { nivel: NivelCalidad; modo: "auto" | NivelCalidad; frameMsMedia?: number; frameMsP95?: number }
export interface DatosInforme {
    datos: DatosNavegador; capacidades: CapacidadesXR; plan: PlanEntrada;
    sesion?: DatosSesion; calidad?: DatosCalidadInforme; entradas?: string[];
    microfono?: EstadoMicrofono;
    /** Marca de tiempo en ms (la da quien mide); aquí sólo se formatea. */
    ahora: number;
}
export interface InformeDiagnostico { fecha: string; titulo: string; secciones: SeccionInforme[]; texto: string }

// Fecha UTC desde ms de época, sin `new Date` (pureza del núcleo).
export function fechaIsolta(t: number): string {
    const dos = (n: number) => String(n).padStart(2, "0");
    const s = Math.max(0, Math.floor(t / 1000));
    const clh = `${dos(Math.floor(s / 3600) % 24)}:${dos(Math.floor(s / 60) % 60)}:${dos(s % 60)}`;
    const z = Math.floor(s / 86_400) + 719_468;
    const era = Math.floor(z / 146_097), doe = z - era * 146_097;
    const yoe = Math.floor((doe - Math.floor(doe / 1_460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153), dia = doy - Math.floor((153 * mp + 2) / 5) + 1;
    const mes = mp < 10 ? mp + 3 : mp - 9;
    return `${yoe + era * 400 + (mes <= 2 ? 1 : 0)}-${dos(mes)}-${dos(dia)} ${clh} UTC`;
}
export function resumirDuraciones(ms: readonly number[]): { media: number; p95: number } {
    const limpio = ms.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
    if (limpio.length === 0) return { media: 0, p95: 0 };
    return { media: limpio.reduce((a, v) => a + v, 0) / limpio.length, p95: limpio[Math.min(limpio.length - 1, Math.floor(limpio.length * 0.95))] };
}
const sano = (s: string): string => s.replace(/[?@]/g, "").replace(/\s+/g, " ").trim(); // el informe no lleva «?» ni «@»
const linea = (clave: string, valor: string, estado: EstadoLinea): LineaInforme => ({ clave: sano(clave), valor: sano(valor), estado });
const sinProbar = (clave: string, motivo = "sin probar"): LineaInforme => linea(clave, motivo, "sin-probar");
const seccion = (nombre: string, lineas: LineaInforme[]): SeccionInforme => ({ nombre, lineas });

    const disp = (b: boolean | null): LineaInforme => b === null
    ? linea("", "comprobando…", "sin-probar")
    : linea("", b ? "disponible" : "no disponible", b ? "ok" : "aviso");

function seccionAparato(d: DatosInforme): SeccionInforme {
    const { datos, capacidades, plan } = d;
    return seccion("Aparato", [
        linea("Plataforma", capacidades.plataforma, capacidades.plataforma === "desconocida" ? "aviso" : "ok"),
        linea("Navegador web", datos.ua, "ok"),
        linea("Conexión segura", datos.seguro ? "sí" : "no: WebXR exige https o localhost", datos.seguro ? "ok" : "fallo"),
        linea("WebXR", datos.tieneXR ? "sí" : "sin WebXR", datos.tieneXR ? "ok" : "aviso"),
        { ...disp(datos.vr), clave: "VR inmersiva" },
        { ...disp(datos.ar), clave: "AR passthrough" },
        linea("Entrada por defecto", plan.estrategia, "ok"),
    ]);
}
function seccionSesion(s: DatosSesion | undefined, esperadas: readonly FuncionXR[]): SeccionInforme {
    if (!s) {
        return seccion("Sesión", [
            sinProbar("Modo de sesión"),
            ...esperadas.filter(esFuncionXR).map((f) => sinProbar(f, "sin probar: no hay sesión")),
            sinProbar("Frecuencias soportadas"), sinProbar("Frecuencia actual"), sinProbar("Foveación"),
        ]);
    }
    const concedidas = new Set(s.funcionesConcedidas.filter(esFuncionXR));
    const lineas: LineaInforme[] = [linea("Modo de sesión", s.modo, "ok")];
    for (const f of esperadas) lineas.push(linea(f, concedidas.has(f) ? "concedida" : "no concedida", concedidas.has(f) ? "ok" : "aviso"));
    for (const f of concedidas) if (!esperadas.includes(f)) lineas.push(linea(f, "concedida (no la esperaba esta plataforma)", "ok"));
    lineas.push(linea("Frecuencias soportadas", s.frecuenciasSoportadas.length > 0 ? `${s.frecuenciasSoportadas.join(", ")} Hz` : "el visor no las lista",
        s.frecuenciasSoportadas.length > 0 ? "ok" : "aviso"));
    lineas.push(s.frecuenciaActual !== undefined ? linea("Frecuencia actual", `${s.frecuenciaActual} Hz`, "ok") : sinProbar("Frecuencia actual"));
    lineas.push(s.foveacion !== undefined ? linea("Foveación", String(Math.round(s.foveacion * 100) / 100), "ok") : sinProbar("Foveación"));
    return seccion("Sesión", lineas);
}
function seccionCalidad(s: DatosSesion | undefined, c: DatosCalidadInforme | undefined): SeccionInforme {
    if (!c) return seccion("Calidad", [sinProbar("Nivel", "sin medir"), sinProbar("Fotograma medio"), sinProbar("Fotograma p95")]);
    const presupuesto = 1000 / Math.max(30, s?.frecuenciaActual ?? 72);
    const medida = (clave: string, v: number | undefined): LineaInforme => v === undefined
        ? sinProbar(clave, "sin medir")
        : linea(clave, `${v.toFixed(1)} ms de ${presupuesto.toFixed(1)} ms`, v > presupuesto * 1.08 ? "aviso" : "ok");
    return seccion("Calidad", [
        linea("Nivel", c.nivel, "ok"),
        linea("Ajuste", c.modo === "auto" ? "automático" : "fijado por la persona", "ok"),
        medida("Fotograma medio", c.frameMsMedia),
        medida("Fotograma p95", c.frameMsP95),
    ]);
}
/** El informe completo. Orden estable: mismas entradas → exactamente el mismo texto. */
export function construirInforme(d: DatosInforme): InformeDiagnostico {
    const fecha = fechaIsolta(d.ahora);
    const titulo = "StarSeed XR · informe de diagnóstico";
    const secciones = [
        seccionAparato(d),
        seccionSesion(d.sesion, d.capacidades.funciones),
        seccionCalidad(d.sesion, d.calidad),
        seccionEntradas(d),
        seccionMicrofono(d),
    ];
    const texto = [titulo, `fecha: ${fecha}`, ...secciones.flatMap((s) =>
        [``, s.nombre, ...s.lineas.map((l) => `${l.clave}: ${l.valor}${l.estado === "ok" ? "" : ` (${l.estado})`}`)],
    )].join("\n").slice(0, 4000);
    return { fecha, titulo, secciones, texto };
}
function seccionEntradas(d: DatosInforme): SeccionInforme {
    const { entradas } = d;
    if (entradas === undefined) return seccion("Entradas", [sinProbar("Fuentes detectadas")]);
    const valor = entradas.length === 0 ? "ninguna detectada" : entradas.join(" · ");
    return seccion("Entradas", [linea("Fuentes detectadas", valor, entradas.length === 0 ? "aviso" : "ok")]);
}
function seccionMicrofono(d: DatosInforme): SeccionInforme {
    const m = d.microfono;
    if (m !== "concedido" && m !== "denegado") return seccion("Micrófono", [sinProbar("Micrófono", "sin probar: toca Probar micrófono")]);
    return seccion("Micrófono", [linea("Micrófono", m === "concedido" ? "concedido" : "denegado por el navegador", m === "concedido" ? "ok" : "fallo")]);
}