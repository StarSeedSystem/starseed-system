/**
 * Herramientas MCP de Genesis (Ola 1019G · GCA1019R).
 * Contrato: architecture/genesis-conectores-abiertos.md §7. PURO: sin red,
 * reloj, disco ni Supabase; lo que toca el mundo entra inyectado por la ruta.
 * Cada herramienta declara la capacidad del ámbito que exige.
 */
import type { CapacidadAmbito } from "@/lib/mando/ambito";
import { describirOperacion, validarLote, type Ambito, type Operacion } from "@/lib/genesis/operaciones";

export type NombreHerramienta =
    | "estado" | "tareas_listar" | "tareas_crear" | "agentes_listar" | "medidores"
    | "proponer" | "biblioteca_buscar" | "opciones_sugerir" | "chat";
export interface EsquemaJson {
    type: "object";
    properties: Record<string, Record<string, unknown>>;
    required?: readonly string[];
    additionalProperties: boolean;
}
export interface ResultadoHerramienta {
    contenido: Array<{ tipo: "texto"; texto: string }>;
    esError?: boolean;
}
export interface DefinicionHerramientaGenesis {
    nombre: NombreHerramienta;
    descripcion: string;
    inputSchema: EsquemaJson;
    permiso: CapacidadAmbito;
}
export interface HerramientaGenesis extends DefinicionHerramientaGenesis {
    ejecutar: (args: Record<string, unknown>) => Promise<ResultadoHerramienta>;
}
export interface PropuestaValidada {
    validas: { op: Operacion; avisos: string[] }[];
    rechazadas: { indice: number; problemas: string[] }[];
}
export interface ManejadoresGenesis {
    ambito: Ambito;
    estado: () => Promise<unknown> | unknown;
    tareasListar: (consulta: { estado?: string; limite: number }) => Promise<unknown> | unknown;
    tareasCrear: (tarea: { titulo: string; prompt: string; archivos: string[]; ola?: string }) => Promise<unknown> | unknown;
    agentesListar: (consulta: { limite: number }) => Promise<unknown> | unknown;
    medidores: (clave: string | null) => Promise<unknown> | unknown;
    proponer: (lote: PropuestaValidada) => Promise<unknown> | unknown;
    bibliotecaBuscar: (consulta: string, limite: number) => Promise<unknown> | unknown;
    opcionesSugerir: (consulta: string | null) => Promise<unknown> | unknown;
    chat: (mensaje: string) => Promise<unknown> | unknown;
}

const objeto = (properties: Record<string, Record<string, unknown>>, required: readonly string[] = []): EsquemaJson =>
    ({ type: "object", properties, additionalProperties: false, ...(required.length ? { required } : {}) });
const ENTERO = { type: "integer", minimum: 1, maximum: 100 } as const;

export const DEFINICIONES_HERRAMIENTAS: readonly DefinicionHerramientaGenesis[] = [
    { nombre: "estado", descripcion: "Devuelve el estado vivo del ámbito: colas, agentes, frenos y avisos.", inputSchema: objeto({}), permiso: "ver-resumen" },
    { nombre: "tareas_listar", descripcion: "Lista las tareas del ámbito con su estado, su ola y sus dependencias.", inputSchema: objeto({ estado: { type: "string" }, limite: ENTERO }), permiso: "ver-detalle" },
    { nombre: "tareas_crear", descripcion: "Encola una tarea nueva para el enjambre del ámbito.", inputSchema: objeto({ titulo: { type: "string", maxLength: 200 }, prompt: { type: "string", maxLength: 8000 }, archivos: { type: "array", items: { type: "string" } }, ola: { type: "string" } }, ["titulo", "prompt"]), permiso: "encolar" },
    { nombre: "agentes_listar", descripcion: "Lista los agentes que escriben ahora mismo, su modelo y su avance.", inputSchema: objeto({ limite: ENTERO }), permiso: "ver-detalle" },
    { nombre: "medidores", descripcion: "Devuelve los medidores del pulso; si se pide una clave, solo ese.", inputSchema: objeto({ clave: { type: "string" } }), permiso: "ver-resumen" },
    { nombre: "proponer", descripcion: "Valida operaciones tipadas de Genesis y las deja propuestas para aprobación.", inputSchema: objeto({ operaciones: { type: "array", items: { type: "object" }, maxItems: 8 } }, ["operaciones"]), permiso: "encolar" },
    { nombre: "biblioteca_buscar", descripcion: "Busca paquetes, habilidades y conectores en la Biblioteca.", inputSchema: objeto({ consulta: { type: "string", maxLength: 200 }, limite: ENTERO }, ["consulta"]), permiso: "ver-detalle" },
    { nombre: "opciones_sugerir", descripcion: "Sugiere opciones del ámbito: primero lo local, después lo gratis por vincular.", inputSchema: objeto({ consulta: { type: "string", maxLength: 200 } }), permiso: "ver-detalle" },
    { nombre: "chat", descripcion: "Habla con Genesis en el canal del ámbito y devuelve su respuesta.", inputSchema: objeto({ mensaje: { type: "string", maxLength: 4000 } }, ["mensaje"]), permiso: "chatear" },
];

const texto = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const numero = (v: unknown, porDefecto = 20): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(1, Math.trunc(v))) : porDefecto;
const listaTextos = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 500)).slice(0, 20) : [];
const listo = (v: unknown): ResultadoHerramienta => ({ contenido: [{ tipo: "texto", texto: JSON.stringify(v) }] });
const fallo = (texto: string): ResultadoHerramienta => ({ contenido: [{ tipo: "texto", texto }], esError: true });

export function crearHerramientasGenesis(manejadores: ManejadoresGenesis): HerramientaGenesis[] {
    const ejecutar = async (definicion: DefinicionHerramientaGenesis, args: Record<string, unknown>): Promise<ResultadoHerramienta> => {
        switch (definicion.nombre) {
            case "estado": return listo(await manejadores.estado());
            case "tareas_listar": return listo(await manejadores.tareasListar({ estado: texto(args.estado, 40) ?? undefined, limite: numero(args.limite) }));
            case "tareas_crear": {
                const titulo = texto(args.titulo, 200), prompt = texto(args.prompt, 8000);
                if (!titulo || !prompt) return fallo("Faltan «titulo» y «prompt» para crear la tarea.");
                return listo(await manejadores.tareasCrear({ titulo, prompt, archivos: listaTextos(args.archivos), ola: texto(args.ola, 40) ?? undefined }));
            }
            case "agentes_listar": return listo(await manejadores.agentesListar({ limite: numero(args.limite, 50) }));
            case "medidores": return listo(await manejadores.medidores(texto(args.clave, 40)));
            case "proponer": {
                const lote = validarLote(args.operaciones, { ambito: manejadores.ambito });
                if (!lote.validas.length) return fallo(`Ninguna operación es válida. ${lote.rechazadas.flatMap((r) => r.problemas).join(" ")}`);
                const previas = lote.validas.map((v) => describirOperacion(v.op, manejadores.ambito).titulo);
                return listo({ previas, resultado: await manejadores.proponer(lote) });
            }
            case "biblioteca_buscar": {
                const consulta = texto(args.consulta, 200);
                if (!consulta) return fallo("Falta «consulta» para buscar en la Biblioteca.");
                return listo(await manejadores.bibliotecaBuscar(consulta, numero(args.limite)));
            }
            case "opciones_sugerir": return listo(await manejadores.opcionesSugerir(texto(args.consulta, 200)));
            case "chat": {
                const mensaje = texto(args.mensaje, 4000);
                if (!mensaje) return fallo("Falta «mensaje» para hablar con Genesis.");
                return listo(await manejadores.chat(mensaje));
            }
        }
        return fallo("Herramienta no reconocida.");
    };
    return DEFINICIONES_HERRAMIENTAS.map((definicion) => ({ ...definicion, ejecutar: (args: Record<string, unknown>) => ejecutar(definicion, args) }));
}
