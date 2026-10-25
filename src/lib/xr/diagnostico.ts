/**
 * StarSeed XR · CONSTRUYE UN INFORME DE DIAGNÓSTICO PARA EL VISOR REAL.
 *
 * Reglas (XR1010AI §3 l): el informe incluye una sección por cada `FuncionXR` en `FUNCIONES_ESPERADAS`
 * según la plataforma (`session.enabledFeatures` en realidad concedida) y un informe plano para copiar y pegar.
 * El `texto` NO contiene la URL completa ni identificadores de cuenta (privacidad).
 *
 * Contrato:
 *   d.datos: `{datos: DatosNavegador; capacidades: CapacidadesXR; plan: PlanEntrada;
 *               sesion?: {modo: string; funcionesConcedidas: string[]; ...}}`
 *   → {fecha; titulo; secciones: {nombre: string; lineas: {clave: string; valor: string; estado: 'ok'|'aviso'|'fallo'|'sin-probar'}[]}[];
 *               texto: string}
 */
import type { DatosNavegador, CapacidadesXR, PlanEntrada, FuncionXR, PlataformaVisor } from "./tipos";
import { esFuncionXR } from "./tipos";
import { FUNCIONES_ESPERADAS } from "./capacidades";

export interface DatosDiagnostico {
    datos: DatosNavegador;
    capacidades: CapacidadesXR;
    plan: PlanEntrada;
    sesion?: {
        modo: string;
        funcionesConcedidas: readonly string[];
        frecuenciasSoportadas: readonly number[];
        frecuenciaActual?: number;
        foveacion?: number;
    };
    calidad?: {
        nivel: string;
        modo: "auto" | string;
        frameMsMedia?: number;
        frameMsP95?: number;
    };
    entradas?: readonly string[];
    microfono?: "concedido" | "denegado" | "sin-probar";
    ahora: number;
}

export interface LineaInforme {
    clave: string;
    valor: string;
    estado: "ok" | "aviso" | "fallo" | "sin-probar";
}

export interface SeccionInforme {
    nombre: string;
    lineas: LineaInforme[];
}

export interface Informe {
    fecha: number;
    titulo: string;
    secciones: SeccionInforme[];
    texto: string;
}

/**
 * Mapea cada plataforma a un label legible en español para los nombres de sección.
 */
const ETIQUETAS: Record<PlataformaVisor, string> = {
    quest: "Meta Quest",
    pico: "Pico",
    visionos: "Vision Pro",
    "android-xr": "Android XR",
    "magic-leap": "Magic Leap",
    spectacles: "Snap Spectacles",
    "android-movil": "Móvil Android",
    ios: "iPhone / iPad",
    escritorio: "Escritorio",
    desconocida: "Desconocida",
};

function estadoParaFuncionalidad(
    plataforma: PlataformaVisor,
    funcionEsperada: FuncionXR,
    funcionesConcedidas: readonly string[] | null,
    haySesion: boolean,
): "ok" | "aviso" | "fallo" | "sin-probar" {
    if (!haySesion) return "sin-probar";
    if (!funcionesConcedidas) return "sin-probar";
    const concedida = esFuncionXR(funcionEsperada) && funcionesConcedidas.includes(funcionEsperada);
    if (concedida) return "ok";
    const esperadas = FUNCIONES_ESPERADAS[plataforma] || [];
    const esImportante = esperadas.includes(funcionEsperada);
    return esImportante ? "aviso" : "ok";
}

export function construirInforme(d: DatosDiagnostico): Informe {
    const plataforma = d.capacidades.plataforma;
    const etiquetas = ETIQUETAS[plataforma] || plataforma;
    const haySesion = d.sesion?.modo !== undefined;
    const funcionesConcedidas = haySesion ? d.sesion!.funcionesConcedidas : null;

    const lineas: LineaInforme[] = [];
    const secciones: SeccionInforme[] = [];
    const funcionesEsperadas = FUNCIONES_ESPERADAS[plataforma] || [];

    // 📊 Información del sistema
    lineas.push({ clave: "Plataforma", valor: etiquetas, estado: "ok" });
    lineas.push({
        clave: "Calidad",
        valor: `${d.calidad?.nivel || "¿?"}${d.calidad?.modo !== "auto" ? ` (${d.calidad?.modo})` : ""}`,
        estado: "ok",
    });
    lineas.push({
        clave: "Fotogramas por segundo",
        valor: d.sesion?.frecuenciaActual !== undefined ? `${d.sesion.frecuenciaActual} Hz` : "¿?",
        estado: "ok",
    });
    lineas.push({\n        clave: "Frame medio",
        valor: d.sesion?.foveacion !== undefined ? `${d.sesion.foveacion} ms` : "¿?",
        estado: "ok",
    });

    // 🎯 Funciones WebXR por sección (una sección por sección de plataforma)
    if (funcionesEsperadas.length > 0) {
        const lineasFunciones: LineaInforme[] = [];
        const entradasSet = new Set(d.entradas);
        let cont = 0;
        for (const f of funcionesEsperadas) {
            const estado = estadoParaFuncionalidad(plataforma, f, funcionesConcedidas, haySesion);
            const concedida = estado === "ok";
            const entradasPorFunc = entradasSet.has(f) ? entradasSet : null;
            const entradasStr = entradasPorFunc?.size
                ? ` (entradas: ${Array.from(entradasPorFunc).join(",")})`
                : "";
            lineasFunciones.push({
                clave: f,
                valor: `${concedida ? "✓" : "✗"}${entradasStr}`,
                estado,
            });
            if (estado === "fallo" && cont < 5) {
                lineas.push({
                    clave: `Falla en ${f}`,
                    valor: `Esperada pero no concedida por ${etiquetas}`, estatus: "fallo",
                });
                cont++;
            }
        }
        secciones.push({
            nombre: `WebXR ${etiquetas} (${funcionesEsperadas.length} funciones esperadas)`,
            lineas: lineasFunciones,
        });
    }

    // 📶 Micrófono
    lineas.push({
        clave: "Micrófono",
        valor: d.microfono === "concedido" ? "✓" : d.microfono === "denegado" ? "✗" : "¿?",
        estado: d.microfono || "sin-probar",
    });

    // 🧹 Informe plano para copiar y pegar (sin URL, sin claves de cuenta)
    const textoLines: string[] = [];
    textoLines.push(`=== Informe de Visor XR: ${etiquetas} ===`);
    textoLines.push(`Fecha: ${new Date(d.ahora).toISOString()}`);
    textoLines.push(`Plataforma: ${etiquetas}`);
    textoLines.push(`Calidad: ${d.calidad?.nivel || "¿?"}`);
    textoLines.push(`FPS: ${d.sesion?.frecuenciaActual !== undefined ? d.sesion.frecuenciaActual : "¿?"} Hz`);
    textoLines.push(`Frame medio: ${d.sesion?.foveacion !== undefined ? d.sesion.foveacion : "¿?"} ms`);
    textoLines.push("\nFunciones WebXR:");
    for (const f of funcionesEsperadas) {
        const estado = estadoParaFuncionalidad(plataforma, f, funcionesConcedidas, haySesion);
        const concedida = estado === "ok";
        const emoji = concedida ? "✓" : estado === "aviso" ? "⚠" : "✗";
        textoLines.push(`${emoji} ${f}`);
    }
    textoLines.push(`Micrófono: ${d.microfono === "concedido" ? "✓" : d.microfono === "denegado" ? "✗" : "¿?"}`);
    const texto = textoLines.join("\n");

    return {
        fecha: d.ahora,
        titulo: `Diagnóstico XR: ${etiquetas}`,
        secciones,
        texto,
    };
}
