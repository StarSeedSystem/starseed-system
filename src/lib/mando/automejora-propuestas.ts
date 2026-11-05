/**
 * automejora-propuestas.ts — lógica pura para manejar las propuestas de
 * automejora (Meta^n) en Genesis · Capas. Sin disco, sin red, sin `node:*`.
 * Contrato: architecture/automejora-meta-n.md §3–§4, §6–§8 (tarea K2).
 */

export interface PropuestaAutomejora {
    id: string;
    capa: string;
    description: string;
    archivos: string[];
    prompt_inicio: string;
    referencia_funcion: string;
    enviada: boolean;
}

export interface PropuestaArchivo {
    archivo: string;
    contenido: unknown;
}

export interface TareaColaAutomejora {
    id: string;
    ola: string;
    titulo: string;
    archivos: string[];
    prompt: string;
    depende: string[];
    modelo: string;
}

/** Lee y combina todos los archivos de propuestas en una lista plana. */
export function leerPropuestasAutomejora(archivos: PropuestaArchivo[]): PropuestaAutomejora[] {
    const resultado: PropuestaAutomejora[] = [];

    for (const a of archivos) {
        if (!a.contenido || typeof a.contenido !== "object" || Array.isArray(a.contenido)) continue;
        const obj = a.contenido as Record<string, unknown>;
        if (!Array.isArray(obj.propuestas)) continue;

        for (const p of obj.propuestas) {
            if (!p || typeof p !== "object") continue;
            const po = p as Record<string, unknown>;
            const id = typeof po.id === "string" ? po.id.trim() : "";
            if (!id) continue;

            resultado.push({
                id,
                capa: typeof po.capa === "string" ? po.capa : "desconocida",
                description: typeof po.description === "string" ? po.description : "",
                archivos: Array.isArray(po.archivos)
                    ? po.archivos.filter((x): x is string => typeof x === "string")
                    : [],
                prompt_inicio: typeof po.prompt_inicio === "string" ? po.prompt_inicio : "",
                referencia_funcion: typeof po.referencia_funcion === "string" ? po.referencia_funcion : "",
                enviada: po.enviada === true,
            });
        }
    }

    return resultado;
}

/** Filtra solo las propuestas que no han sido enviadas al enjambre. */
export function filtrarPropuestasNoEnviadas(propuestas: PropuestaAutomejora[]): PropuestaAutomejora[] {
    return propuestas.filter((p) => !p.enviada);
}

/**
 * Convierte una propuesta en una tarea para la cola de automejora.
 * El formato sigue el patrón de `enjambre/colas/cola-*.json`.
 */
export function crearTareaParaCola(propuesta: PropuestaAutomejora, fecha: string): TareaColaAutomejora {
    const prompt = [
        propuesta.prompt_inicio || "Comprueba primero si sigue haciendo falta",
        "",
        `Función de referencia: ${propuesta.referencia_funcion}`,
        "",
        "Máximo 3 archivos y 120 líneas por archivo. Las reglas de la casa están en",
        "`memory/workflow-actual.md` — léelas: el silencio no es aprobación,",
        "integrado no es aplicado, y si una prueba falla se arregla el código, no la prueba.",
    ]
        .filter(Boolean)
        .join("\n");

    return {
        id: propuesta.id,
        ola: `Automejora ${fecha}`,
        titulo: propuesta.description,
        archivos: propuesta.archivos,
        prompt,
        depende: [],
        modelo: "llm7/minimax-m2.7",
    };
}