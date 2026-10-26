/**
 * StarSeed XR · INFORME DE DIAGNÓSTICO (XR1010AI).
 * Función pura que construye un informe legible por humanos y plano de las capacidades del visor XR.
 * Contrato §3 (l): nadie puede afirmar que algo funciona en un visor sin verlo, así que esta página
 * lo mide y lo enseña. El `texto` del informe NO contiene la URL completa con parámetros, ni identificadores de cuenta,
 * ni claves (privacidad).
 *
 * - `datos`: lo que sondea el navegador (`DatosNavegador`).
 * - `capacidades`: el resultado de `evaluarCapacidades` (`CapacidadesXR`).
 * - `plan`: el resultado de `planificarEntrada` (`PlanEntrada`).
 * - `sesion`: opcional; si se da, lo que concede `session.enabledFeatures`, las frecuencias soportadas
 *     (`supportedFrameRates`), la frecuencia actual, la foveación y el `session.mode`.
 * - `calidad`: opcional; nivel de calidad, modo, tiempo de fotograma medio y p95.
 * - `entradas`: opcional; `inputSources.targetRayMode` y otras entradas.
 * - `microfono`: opcional; `'concedido'`/`'denegado'`/`'sin-probar'`.
 * - `ahora`: timestamp para la fecha del informe (evita recargar).
 *
 * Devuelve:
 * - `fecha`: ISO string.
 * - `titulo`: "Informe de Diagnóstico XR - {capas.funciones.length} funciones" o "Sin Datos".
 * - `secciones`: array de secciones, cada una con:
 *   - `nombre`: título legible por humanos.
 *   - `lineas`: array de líneas de informe, cada una con:
 *     - `clave`: nombre amigable.
 *     - `valor`: valor legible por humanos.
 *     - `estado`: 'ok' (concedida), 'aviso' (no concedida), 'fallo' (no soportada por la plataforma)
 *       o 'sin-probar' (sin medición aún).
 * - `texto`: informe plano para copiar y pegar (sin URLs completas, sin identificadores de cuenta, sin claves).
 */
import type { DatosNavegador, CapacidadesXR, PlanEntrada } from "./capacidades";
import { FUNCIONES_ESPERADAS } from "./capacidades";
import type { PlataformaVisor, FuncionXR } from "./tipos";
import type { NivelCalidad } from "./calidad-perfiles";

export interface RetornarInformeXR {
    readonly fecha: string;
    readonly titulo: string;
    readonly secciones: readonly {
        readonly nombre: string;
        readonly lineas: readonly {
            readonly clave: string;
            readonly valor: string;
            readonly estado: "ok" | "aviso" | "fallo" | "sin-probar";
        }[];
    }[];
    readonly texto: string;
}

export interface ConstruirInformeXR {
    datos: DatosNavegador;
    capacidades: CapacidadesXR;
    plan: PlanEntrada;
    sesion?: {
        modo: string;
        funcionesConcedidas: string[];
        frecuenciasSoportadas: number[];
        frecuenciaActual?: number;
        foveacion?: number;
    } | null;
    calidad?: {
        nivel: NivelCalidad;
        modo: "auto" | NivelCalidad;
        frameMsMedia?: number;
        frameMsP95?: number;
    } | null;
    entradas?: string[];
    microfono?: "concedido" | "denegado" | "sin-probar";
    ahora: number;
}

/**
 * Construye un informe legible por humanos y plano de las capacidades XR.
 * - Las líneas muestran la FUNCIÓN ESPERADA por la plataforma vs lo CONCEDIDO (`enabledFeatures`).
 * - `texto` es el informe plano para copiar y pegar y NO contiene la URL completa con parámetros, ni identificadores de cuenta,
 *   ni claves (privacidad).
 */
export function construirInforme(c: ConstruirInformeXR): RetornarInformeXR {
    const ahora = new Date(c.ahora);
    const fecha = ahora.toISOString();
    const plataforma = c.capacidades.plataforma;
    const funcionesEsperadas = FUNCIONES_ESPERADAS[plataforma] || [];
    const concedidas = new Set(c.sesion?.funcionesConcedidas || []);

    const secciones = [];

    const lineasBasicas = [];
    lineasBasicas.push({
        clave: "Plataforma",
        valor: plataforma,
        estado: "ok" as const,
    });
    lineasBasicas.push({
        clave: "Visor Disponible",
        valor: c.capacidades.visor ? "Sí" : "No",
        estado: "ok" as const,
    });
    lineasBasicas.push({
        clave: "Modo Recomendado",
        valor: c.capacidades.recomendado,
        estado: "ok" as const,
    });

    if (c.sesion) {
        const fps = c.sesion.frecuenciaActual || 0;
        const foveacion = c.sesion.foveacion !== undefined ? `${(c.sesion.foveacion * 100).toFixed(0)}%` : "N/A";
        lineasBasicas.push({
            clave: "FPS Actual",
            valor: `${fps} Hz`,
            estado: "ok" as const,
        });
        lineasBasicas.push({
            clave: "Foveación",
            valor: foveacion,
            estado: "ok" as const,
        });
        lineasBasicas.push({
            clave: "Funciones Concedidas",
            valor: concedidas.size > 0 ? Array.from(concedidas).join(", ") : "Ninguna",
            estado: concedidas.size > 0 ? "ok" as const : "aviso" as const,
        });
    }

    if (c.calidad) {
        lineasBasicas.push({
            clave: "Nivel de Calidad",
            valor: c.calidad.nivel,
            estado: "ok" as const,
        });
        if (c.calidad.frameMsMedia) {
            const ms = c.calidad.frameMsMedia.toFixed(2);
            lineasBasicas.push({
                clave: "FPS Medio",
                valor: `${(1000 / parseFloat(ms)).toFixed(1)} Hz`,
                estado: parseFloat(ms) < 33 ? "aviso" as const : "ok" as const,
            });
        }
    }

    if (c.entradas && c.entradas.length > 0) {
        lineasBasicas.push({
            clave: "Entradas Detectadas",
            valor: c.entradas.join(", "),
            estado: "ok" as const,
        });
    }

    if (c.microfono !== undefined) {
        const textoMicro = c.microfono === "concedido" ? "Concedido" : "Denegado";
        const estadoMicro = c.microfono === "concedido" ? "ok" : "fallo";
        lineasBasicas.push({
            clave: "Micrófono",
            valor: textoMicro,
            estado: estadoMicro,
        });
    }

    secciones.push({
        nombre: "Básico",
        lineas: lineasBasicas,
    });

    const porFuncion = [];
    for (const funcion of funcionesEsperadas) {
        const concedida = concedidas.has(funcion);
        const estado = concedida ? "ok" : "aviso";
        const valor = concedida ? "Concedida" : "No concedida";
        porFuncion.push({
            clave: funcion,
            valor,
            estado,
        });
    }

    if (porFuncion.length > 0) {
        secciones.push({
            nombre: "Funciones WebXR",
            lineas: porFuncion,
        });
    }

    const lineasPlan = [];
    lineasPlan.push({
        clave: "Estrategia",
        valor: c.plan.estrategia,
        estado: "ok" as const,
    });
    lineasPlan.push({
        clave: "Requiere Gesto",
        valor: c.plan.requiereGesto ? "Sí" : "No",
        estado: "ok" as const,
    });
    lineasPlan.push({
        clave: "Botón Universal",
        valor: c.plan.botonUniversal ? "Sí" : "No",
        estado: "ok" as const,
    });
    lineasPlan.push({
        clave: "Motivo",
        valor: c.plan.motivo,
        estado: "ok" as const,
    });

    secciones.push({
        nombre: "Plan de Entrada",
        lineas: lineasPlan,
    });

    const titulo =
        c.sesion || c.calidad || c.entradas || c.microfono !== undefined
            ? `Informe de Diagnóstico XR - ${funcionesEsperadas.length} funciones esperadas`
            : "Sin Datos";

    const lineasParaTexto = [];
    lineasParaTexto.push("=== INFORME DE DIAGNÓSTICO XR ===");
    lineasParaTexto.push(`Fecha: ${fecha}`);
    lineasParaTexto.push(`Título: ${titulo}`);
    lineasParaTexto.push("");

    for (const seccion of secciones) {
        lineasParaTexto.push(`--- ${seccion.nombre} ---`);
        for (const linea of seccion.lineas) {
            lineasParaTexto.push(`${linea.clave}: ${linea.valor} (Estado: ${linea.estado})`);
        }
        lineasParaTexto.push("");
    }

    const texto = lineasParaTexto.join("\n").trim();

    return {
        fecha,
        titulo,
        secciones,
        texto,
    };
}
