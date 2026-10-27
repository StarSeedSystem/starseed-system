/**
 * HERRAMIENTAS MCP DE GENESIS (GCA1019R, Ola 1019G)
 * ─────────────────────────────────────────────────────────────────────────────
 * Definiciones (nombre, descripción, inputSchema) y manejadores inyectados para
 * las herramientas del MCP remoto de Genesis: `estado`, `tareas_listar`,
 * `tareas_crear`, `agentes_listar`, `medidores`, `proponer` (operaciones de
 * `src/lib/genesis/operaciones.ts`), `biblioteca_buscar`, `opciones_sugerir` y
 * `chat`. Cada herramienta declara el permiso que necesita.
 *
 * Módulo PURO: sin red, sin disco, sin Supabase (todo va inyectado). La
 * validación de la entrada sigue el JSON Schema declarado, con una regla mínima
 * (tipos y `required`); `proponer` valida además la operación completa. Nunca
 * lanza. Contrato: architecture/genesis-conectores-abiertos.md §7.
 */
import type { HerramientaMcp } from "./protocolo";
import {
    validarOperacion,
    type ContextoValidacion,
    type Operacion,
} from "@/lib/genesis/operaciones";

export type PermisoGenesis = "leer" | "tareas" | "agentes" | "propuestas" | "biblioteca" | "chat";

/** Lo que ofrece el entorno de Genesis a cada herramienta (todo inyectado). */
export interface ManejadoresGenesisMcp {
    estado: () => Promise<unknown>;
    tareasListar: (limite: number) => Promise<unknown>;
    tareasCrear: (args: { titulo: string; notas?: string }) => Promise<unknown>;
    agentesListar: () => Promise<unknown>;
    medidores: () => Promise<unknown>;
    proponer: (op: Operacion) => Promise<unknown>;
    bibliotecaBuscar: (consulta: string) => Promise<unknown>;
    opcionesSugerir: (ambito: string) => Promise<unknown>;
    chat: (mensaje: string) => Promise<unknown>;
}

export interface OpcionesHerramientasGenesis {
    manejadores: ManejadoresGenesisMcp;
    /** Contexto del ámbito para validar la operación de `proponer`. */
    ctxValidacion?: ContextoValidacion;
}

interface Definicion {
    nombre: string;
    descripcion: string;
    permiso: PermisoGenesis;
    inputSchema: Record<string, unknown>;
    manejar: (args: Record<string, unknown>, m: ManejadoresGenesisMcp, ctx?: ContextoValidacion) => Promise<unknown>;
}

/** Esquema mínimo: propiedades tipadas y lo obligatorio. */
function esquema(requeridos: string[], props: Record<string, unknown>): Record<string, unknown> {
    return { type: "object", properties: props, required: requeridos, additionalProperties: false };
}

/** Herramienta sin argumentos: devolver un dato ya preparado. */
function deLectura(nombre: string, descripcion: string, permiso: PermisoGenesis, leer: (m: ManejadoresGenesisMcp) => Promise<unknown>): Definicion {
    return { nombre, descripcion, permiso, inputSchema: esquema([], {}), manejar: (_a, m) => leer(m) };
}

export const HERRAMIENTAS_GENESIS: Definicion[] = [
    deLectura("estado", "Devuelve el estado de Genesis (versiones, rumbos y resumen del enjambre).", "leer", (m) => m.estado()),
    deLectura("agentes_listar", "Lista los agentes de Genesis (qué modelo usa cada uno y su estado).", "agentes", (m) => m.agentesListar()),
    deLectura("medidores", "Devuelve los medidores de Genesis (coste, latencia y fuentes de los últimos días).", "leer", (m) => m.medidores()),
    {
        nombre: "tareas_listar",
        descripcion: "Lista las tareas activas de Genesis, más nuevas primero.",
        permiso: "leer",
        inputSchema: esquema([], { limite: { type: "number" } }),
        manejar: (a, m) => m.tareasListar(typeof a.limite === "number" ? a.limite : 20),
    },
    {
        nombre: "tareas_crear",
        descripcion: "Crea una tarea de Genesis con un título y notas opcionales.",
        permiso: "tareas",
        inputSchema: esquema(["titulo"], { titulo: { type: "string" }, notas: { type: "string" } }),
        manejar: (a, m) => m.tareasCrear({ titulo: String(a.titulo), notas: typeof a.notas === "string" ? a.notas : undefined }),
    },
    {
        nombre: "proponer",
        descripcion: "Propone una operación de Genesis (vocabulario cerrado) para revisión antes de aplicar.",
        permiso: "propuestas",
        inputSchema: esquema(["operacion"], { operacion: { type: "object" } }),
        manejar: (a, m, ctx) => {
            const r = validarOperacion(a.operacion, ctx ?? { ambito: { tipo: "persona" } });
            if (!r.ok) throw new Error(`Operación rechazada: ${r.problemas.join(" ")}`);
            return m.proponer(r.op);
        },
    },
    {
        nombre: "biblioteca_buscar",
        descripcion: "Busca en la Biblioteca (paquetes y habilidades) por texto libre.",
        permiso: "biblioteca",
        inputSchema: esquema(["consulta"], { consulta: { type: "string" } }),
        manejar: (a, m) => m.bibliotecaBuscar(String(a.consulta)),
    },
    {
        nombre: "opciones_sugerir",
        descripcion: "Sugiere opciones para un ámbito: lo local que falta, lo gratis por vincular y lo que no hay.",
        permiso: "leer",
        inputSchema: esquema(["ambito"], { ambito: { type: "string", enum: ["persona", "entidad"] } }),
        manejar: (a, m) => m.opcionesSugerir(String(a.ambito)),
    },
    {
        nombre: "chat",
        descripcion: "Conversa con el asistente de Genesis (una pregunta, una respuesta).",
        permiso: "chat",
        inputSchema: esquema(["mensaje"], { mensaje: { type: "string" } }),
        manejar: (a, m) => m.chat(String(a.mensaje)),
    },
];

/** Valida `args` contra el `inputSchema` (tipos básicos y `required`). Puro. */
export function validarEntrada(
    inputSchema: Record<string, unknown>,
    args: Record<string, unknown>,
): { ok: true } | { ok: false; problemas: string[] } {
    const problemas: string[] = [];
    const requeridos = Array.isArray(inputSchema.required) ? (inputSchema.required as string[]) : [];
    const props = inputSchema.properties as Record<string, { type?: string; enum?: string[] }> | undefined;
    for (const campo of requeridos)
        if (!(campo in args)) problemas.push(`Falta «${campo}».`);
    for (const [campo, v] of Object.entries(args)) {
        const spec = props?.[campo];
        if (!spec) {
            problemas.push(`Argumento desconocido «${campo}».`);
            continue;
        }
        if (Array.isArray(spec.enum) && !spec.enum.includes(String(v)))
            problemas.push(`«${campo}» debe ser uno de: ${spec.enum.join(", ")}.`);
        if (spec.type === "string" && typeof v !== "string") problemas.push(`«${campo}» debe ser texto.`);
        if (spec.type === "number" && typeof v !== "number") problemas.push(`«${campo}» debe ser un número.`);
        if (spec.type === "object" && (typeof v !== "object" || v === null || Array.isArray(v)))
            problemas.push(`«${campo}» debe ser un objeto.`);
    }
    return problemas.length ? { ok: false, problemas } : { ok: true };
}

/** Convierte las definiciones en herramientas MCP con sus manejadores inyectados. */
export function crearHerramientasGenesis(opciones: OpcionesHerramientasGenesis): HerramientaMcp[] {
    return HERRAMIENTAS_GENESIS.map((definicion) => ({
        nombre: definicion.nombre,
        descripcion: definicion.descripcion,
        esquema: definicion.inputSchema,
        ejecutar: async (args: Record<string, unknown>) => {
            const validacion = validarEntrada(definicion.inputSchema, args);
            if (!validacion.ok) throw new Error(validacion.problemas.join(" "));
            const salida = await definicion.manejar(args, opciones.manejadores, opciones.ctxValidacion);
            const texto = typeof salida === "string" ? salida : JSON.stringify(salida);
            return { contenido: [{ tipo: "texto", texto }] };
        },
    }));
}
