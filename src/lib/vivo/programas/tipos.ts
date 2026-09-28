/**
 * Tipos del PROGRAMA en vivo (L4 · 2026-09-28).
 *
 * Alcance honesto (CLAUDE.md §«editable sí, ejecutable no»): un programa NO es código. Es una
 * especificación declarativa (`ProgramaSpec`) de un VOCABULARIO CERRADO de bloques (título,
 * texto, lista de tareas, contador, encuesta, tablero kanban, formulario) cuyo ESTADO
 * COMPARTIDO se reconstruye repitiendo un diario de acciones con reglas puras (`motor.ts`).
 * Nadie ejecuta código de nadie: lo que llega de la red son datos que se validan y se pintan
 * como texto.
 *
 * Módulo PURO: sin red, sin reloj, sin azar.
 */

export type TipoBloqueProg = "titulo" | "texto" | "tareas" | "contador" | "encuesta" | "kanban" | "formulario";

export const TIPOS_BLOQUE_PROG: readonly TipoBloqueProg[] = ["titulo", "texto", "tareas", "contador", "encuesta", "kanban", "formulario"];

export function esTipoBloqueProg(v: unknown): v is TipoBloqueProg {
    return typeof v === "string" && (TIPOS_BLOQUE_PROG as readonly string[]).includes(v);
}

/** Límites duros: un programa no puede tumbar el móvil más modesto ni la base de datos. */
export const LIM = {
    bloques: 24,
    titulo: 120,
    descripcion: 400,
    texto: 2000,
    etiqueta: 80,
    item: 200,
    nombre: 40,
    tareas: 200,
    tarjetas: 200,
    columnas: 8,
    opciones: 10,
    campos: 12,
    respuestas: 300,
    votantes: 500,
    aportantes: 500,
    valorCorto: 200,
    valorLargo: 1000,
    opcionCampo: 60,
    opcionesCampo: 12,
    contadorTope: 1_000_000_000,
    /** Entradas del diario a partir de las cuales conviene compactar. */
    compactarDesde: 600,
    /**
     * Identificadores de entrada que se conservan al compactar. Sirven para que quien tenía una
     * acción SIN GUARDAR ya incluida en el plegado no la repita encima; por eso cubren todo el
     * diario que se pliega en condiciones normales (cuesta unos 13 KB una vez por compactación).
     */
    idsAlCompactar: 700,
} as const;

// ───────────────────────────── Bloques (la especificación) ─────────────────────────────

export interface BloqueTitulo {
    id: string;
    tipo: "titulo";
    texto: string;
    nivel: 1 | 2 | 3;
}

export interface BloqueTexto {
    id: string;
    tipo: "texto";
    texto: string;
}

export interface BloqueTareas {
    id: string;
    tipo: "tareas";
    titulo: string;
    /** Semilla: solo se usa al CREAR el bloque; después las tareas viven en el estado. */
    iniciales?: string[];
}

export interface BloqueContador {
    id: string;
    tipo: "contador";
    titulo: string;
    inicial: number;
    paso: number;
    min: number | null;
    max: number | null;
    unidad: string;
    /** Si es un número, cada persona aporta como mucho `porPersona` pasos (un voto = 1). null = libre. */
    porPersona: number | null;
}

export interface OpcionEncuesta {
    id: string;
    texto: string;
}

export interface BloqueEncuesta {
    id: string;
    tipo: "encuesta";
    titulo: string;
    pregunta: string;
    opciones: OpcionEncuesta[];
    /** Cuántas opciones puede marcar cada persona (1 = elección única). */
    maxElecciones: number;
}

export interface ColumnaKanban {
    id: string;
    titulo: string;
}

export interface BloqueKanban {
    id: string;
    tipo: "kanban";
    titulo: string;
    columnas: ColumnaKanban[];
    /** Semilla: solo se usa al CREAR el bloque. */
    iniciales?: { col: string; texto: string }[];
}

export type TipoCampo = "texto" | "largo" | "numero" | "opcion" | "casilla";

export interface CampoFormulario {
    id: string;
    etiqueta: string;
    tipo: TipoCampo;
    obligatorio: boolean;
    /** Solo para `opcion`. */
    opciones?: string[];
}

export interface BloqueFormulario {
    id: string;
    tipo: "formulario";
    titulo: string;
    descripcion: string;
    campos: CampoFormulario[];
    /** Plazas máximas (null = sin límite). */
    cupo: number | null;
    /** Mensaje que ve quien ya se ha apuntado. */
    confirmacion: string;
}

export type BloqueProg = BloqueTitulo | BloqueTexto | BloqueTareas | BloqueContador | BloqueEncuesta | BloqueKanban | BloqueFormulario;

export interface ProgramaSpec {
    v: 1;
    titulo: string;
    descripcion: string;
    /** false: solo quien lo creó cambia la estructura; true: cualquiera con permiso de edición. */
    abierto: boolean;
    bloques: BloqueProg[];
}

// ───────────────────────────── Datos (el estado compartido de cada bloque) ─────────────────────────────

export interface Tarea {
    id: string;
    texto: string;
    hecha: boolean;
    /** Nombre de quien la añadió / la marcó (autodeclarado). */
    por: string;
    hechaPor: string;
    t: number;
}

export interface Tarjeta {
    id: string;
    col: string;
    texto: string;
    por: string;
    t: number;
}

export interface Respuesta {
    uid: string;
    nombre: string;
    t: number;
    v: Record<string, string | number | boolean>;
}

export type DatosBloque =
    | { tipo: "tareas"; items: Tarea[] }
    | { tipo: "contador"; aportes: Record<string, number> }
    | { tipo: "encuesta"; votos: Record<string, string[]>; cerrada: boolean }
    | { tipo: "kanban"; tarjetas: Tarjeta[] }
    | { tipo: "formulario"; respuestas: Respuesta[]; cerrado: boolean }
    | { tipo: "titulo" | "texto" };

/** Estado de un programa tras repetir su diario. Es un valor: cada acción devuelve uno nuevo. */
export interface EstadoPrograma {
    creador: string;
    titulo: string;
    descripcion: string;
    abierto: boolean;
    bloques: BloqueProg[];
    datos: Record<string, DatosBloque>;
    /** Entradas aplicadas. */
    n: number;
}

/** Nombres de las acciones del diario (`Entrada.k`). */
export const K = {
    titulo: "programa.titulo",
    abierto: "programa.abierto",
    bloqueAdd: "bloque.add",
    bloqueQuitar: "bloque.quitar",
    bloqueMover: "bloque.mover",
    bloqueEditar: "bloque.editar",
    tareaAdd: "tarea.add",
    tareaMarcar: "tarea.marcar",
    tareaQuitar: "tarea.quitar",
    contar: "contar",
    votar: "votar",
    encuestaCerrar: "encuesta.cerrar",
    tarjetaAdd: "tarjeta.add",
    tarjetaMover: "tarjeta.mover",
    tarjetaEditar: "tarjeta.editar",
    tarjetaQuitar: "tarjeta.quitar",
    respuesta: "respuesta",
    respuestaQuitar: "respuesta.quitar",
    formularioCerrar: "formulario.cerrar",
} as const;

export const NOMBRE_TIPO_BLOQUE: Record<TipoBloqueProg, string> = {
    titulo: "Título",
    texto: "Texto",
    tareas: "Lista de tareas",
    contador: "Contador",
    encuesta: "Encuesta",
    kanban: "Tablero kanban",
    formulario: "Formulario",
};
