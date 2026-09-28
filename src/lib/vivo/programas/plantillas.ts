/**
 * Plantillas de programa: seis programas listos para usar y uno en blanco. Son datos (`ProgramaSpec`)
 * que pasan por el mismo validador que cualquier especificación llegada de fuera.
 */
import { limpiarLinea } from "./esquema";
import { LIM, type BloqueProg, type ProgramaSpec, type TipoBloqueProg } from "./tipos";

export type IdPlantilla =
    | "encuesta"
    | "lista-compartida"
    | "tablero-kanban"
    | "contador-de-votos"
    | "formulario-de-inscripcion"
    | "reunion"
    | "en-blanco";

export interface InfoPlantilla {
    id: IdPlantilla;
    nombre: string;
    descripcion: string;
    /** Nombre de icono de lucide-react. */
    icono: "ChartBar" | "ListChecks" | "Kanban" | "Vote" | "ClipboardList" | "Users" | "LayoutTemplate";
    color: string;
    /** Tipos de bloque que lleva (para enseñarlos en la galería). */
    contiene: TipoBloqueProg[];
    /** Título sugerido del programa. */
    titulo: string;
    bloques: () => BloqueProg[];
}

const b = {
    texto: (id: string, texto: string): BloqueProg => ({ id, tipo: "texto", texto }),
    titulo: (id: string, texto: string, nivel: 1 | 2 | 3 = 2): BloqueProg => ({ id, tipo: "titulo", texto, nivel }),
};

export const PLANTILLAS_PROGRAMA: readonly InfoPlantilla[] = [
    {
        id: "encuesta",
        nombre: "Encuesta",
        descripcion: "Una pregunta con opciones. Cada persona vota una vez, puede cambiar su voto y los resultados se ven al instante.",
        icono: "ChartBar",
        color: "#7C5CFF",
        contiene: ["texto", "encuesta"],
        titulo: "Encuesta rápida",
        bloques: () => [
            b.texto("b1", "Elige una opción. Puedes cambiar tu voto cuando quieras. Los votos los ve todo el grupo."),
            {
                id: "b2",
                tipo: "encuesta",
                titulo: "¿Cuándo quedamos?",
                pregunta: "¿Qué momento os viene mejor?",
                opciones: [
                    { id: "o1", texto: "Viernes por la tarde" },
                    { id: "o2", texto: "Sábado por la mañana" },
                    { id: "o3", texto: "Domingo a mediodía" },
                ],
                maxElecciones: 1,
            },
        ],
    },
    {
        id: "lista-compartida",
        nombre: "Lista compartida",
        descripcion: "Una lista de tareas que todo el grupo puede ampliar y marcar. Se ve quién ha marcado cada cosa.",
        icono: "ListChecks",
        color: "#10B981",
        contiene: ["texto", "tareas"],
        titulo: "Lista compartida",
        bloques: () => [
            b.texto("b1", "Añade lo que falte y marca lo que ya esté hecho. Lo que cambie cualquiera lo ve el resto al momento."),
            { id: "b2", tipo: "tareas", titulo: "Por hacer", iniciales: ["Reservar el sitio", "Traer bebidas", "Avisar a quien falte"] },
        ],
    },
    {
        id: "tablero-kanban",
        nombre: "Tablero kanban",
        descripcion: "Tarjetas en columnas (por hacer, en curso, hecho) que se mueven entre todas las personas del grupo.",
        icono: "Kanban",
        color: "#007FFF",
        contiene: ["kanban"],
        titulo: "Tablero del equipo",
        bloques: () => [
            {
                id: "b1",
                tipo: "kanban",
                titulo: "Tareas del equipo",
                columnas: [
                    { id: "c1", titulo: "Por hacer" },
                    { id: "c2", titulo: "En curso" },
                    { id: "c3", titulo: "Hecho" },
                ],
                iniciales: [
                    { col: "c1", texto: "Definir el objetivo" },
                    { col: "c1", texto: "Repartir tareas" },
                    { col: "c2", texto: "Preparar la primera versión" },
                ],
            },
        ],
    },
    {
        id: "contador-de-votos",
        nombre: "Contador de votos",
        descripcion: "Un voto por persona que se puede retirar, y un contador libre para lo que queráis contar entre todos.",
        icono: "Vote",
        color: "#FFBF00",
        contiene: ["texto", "contador"],
        titulo: "Contador de votos",
        bloques: () => [
            b.texto("b1", "Suma tu voto con el botón «+». Cuenta uno por persona y puedes retirarlo con «−»."),
            { id: "b2", tipo: "contador", titulo: "Cuento contigo", inicial: 0, paso: 1, min: 0, max: null, unidad: "votos", porPersona: 1 },
            { id: "b3", tipo: "contador", titulo: "Rondas de café", inicial: 0, paso: 1, min: 0, max: null, unidad: "rondas", porPersona: null },
        ],
    },
    {
        id: "formulario-de-inscripcion",
        nombre: "Formulario de inscripción",
        descripcion: "Recoge respuestas con campos a medida y un cupo de plazas. Quien se apunta puede editar o retirar su respuesta.",
        icono: "ClipboardList",
        color: "#EC4899",
        contiene: ["formulario"],
        titulo: "Inscripción",
        bloques: () => [
            {
                id: "b1",
                tipo: "formulario",
                titulo: "Apúntate",
                descripcion: "Rellena tus datos. Las respuestas las ve todo el grupo, así que no pongas nada privado.",
                campos: [
                    { id: "f1", etiqueta: "Nombre", tipo: "texto", obligatorio: true },
                    { id: "f2", etiqueta: "Cómo contactarte", tipo: "texto", obligatorio: false },
                    { id: "f3", etiqueta: "Turno", tipo: "opcion", obligatorio: true, opciones: ["Mañana", "Tarde"] },
                    { id: "f4", etiqueta: "Comentarios", tipo: "largo", obligatorio: false },
                    { id: "f5", etiqueta: "Acepto que el grupo vea mis respuestas", tipo: "casilla", obligatorio: true },
                ],
                cupo: 20,
                confirmacion: "Ya estás apuntada/o. Puedes cambiar tus respuestas cuando quieras.",
            },
        ],
    },
    {
        id: "reunion",
        nombre: "Reunión",
        descripcion: "Orden del día, acuerdos con tareas y una votación para la próxima cita, todo en el mismo sitio.",
        icono: "Users",
        color: "#14B8A6",
        contiene: ["titulo", "texto", "tareas", "encuesta"],
        titulo: "Reunión del grupo",
        bloques: () => [
            b.titulo("b1", "Orden del día"),
            b.texto("b2", "1. Novedades\n2. Temas a decidir\n3. Reparto de tareas"),
            { id: "b3", tipo: "tareas", titulo: "Acuerdos y tareas", iniciales: ["Redactar el resumen"] },
            {
                id: "b4",
                tipo: "encuesta",
                titulo: "Próxima reunión",
                pregunta: "¿Cuándo nos vemos otra vez?",
                opciones: [
                    { id: "o1", texto: "La semana que viene" },
                    { id: "o2", texto: "En dos semanas" },
                    { id: "o3", texto: "Dentro de un mes" },
                ],
                maxElecciones: 1,
            },
        ],
    },
    {
        id: "en-blanco",
        nombre: "En blanco",
        descripcion: "Empieza sin nada y añade los bloques que necesites: texto, tareas, contador, encuesta, kanban o formulario.",
        icono: "LayoutTemplate",
        color: "#94A3B8",
        contiene: [],
        titulo: "Mi programa",
        bloques: () => [],
    },
];

export function plantillaPorId(id: string): InfoPlantilla | null {
    return PLANTILLAS_PROGRAMA.find((p) => p.id === id) ?? null;
}

export function esIdPlantilla(v: unknown): v is IdPlantilla {
    return typeof v === "string" && PLANTILLAS_PROGRAMA.some((p) => p.id === v);
}

/** La especificación de una plantilla (con el título que se quiera). */
export function especificacionDePlantilla(id: IdPlantilla, titulo?: string): ProgramaSpec {
    const p = plantillaPorId(id) ?? PLANTILLAS_PROGRAMA[PLANTILLAS_PROGRAMA.length - 1];
    return {
        v: 1,
        titulo: limpiarLinea(titulo, LIM.titulo) || p.titulo,
        descripcion: "",
        abierto: false,
        bloques: p.bloques(),
    };
}
