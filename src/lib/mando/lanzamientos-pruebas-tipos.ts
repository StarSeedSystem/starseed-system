/**
 * Tipos de las versiones de prueba en el panel «Versiones» (VER1111F · contrato centro-versiones-1105.md §10).
 * Puros: los importan el panel (cliente), la lógica pura y las fuentes del servidor.
 */

export type PlataformaPrueba = "macos" | "windows" | "linux" | "android";

export type EstadoBuild =
    | "esperando-main" // el lanzador espera a que origin/main tenga el commit
    | "en-cola" // el workflow existe y el job aún no empezó
    | "compilando"
    | "publicando" // compilado; falta el job que publica latest-prueba.json
    | "publicada"
    | "fallo"
    | "desconocido"; // no se pudo leer GitHub

export interface BuildPlataforma {
    plataforma: PlataformaPrueba;
    titulo: string;
    estado: EstadoBuild;
    /** ISO de inicio del job (para «compilando 12 min»). */
    desde: string | null;
    hasta: string | null;
    /** Nombre del job (el que falló, si falló). */
    job: string | null;
    url: string | null;
    detalle: string;
    /** (PRB1111V) Id del run y del job (el que falló, si falló) para pedir su registro; null si no se sabe. */
    runId?: number | null;
    jobId?: number | null;
    /** (PRB1111V) Pasos del job de la plataforma: hechos, total y el que va ahora; null si GitHub no los dio. */
    pasos?: ProgresoPasos | null;
    /** (PRB1111V) El paso que falló (nombre) en el job que falló; null si no consta. */
    pasoFallido?: string | null;
}

export interface ProgresoPasos {
    hechos: number;
    total: number;
    actual: string | null;
}

export interface CommitPrueba {
    sha: string;
    asunto: string;
}

export interface GrupoCommits {
    /** Id de tarea («LLA1111A») o null para lo que no lleva id. */
    tarea: string | null;
    commits: CommitPrueba[];
}

export interface ContenidoPrueba {
    /** Commit de la prueba anterior (null si es la primera que se conoce). */
    desde: string | null;
    total: number;
    grupos: GrupoCommits[];
}

export type EstadoComprobacion = "pendiente" | "bien" | "falla";

export interface Comprobacion {
    id: string;
    texto: string;
    aparato: string;
    estado: EstadoComprobacion;
    nota: string;
    quien: string;
    t: string | null;
    /** (PRB1111V) Señal automática del banco de pruebas (`video-fps-ble`…); null = se comprueba mirando. */
    senal?: string | null;
    /** (PRB1111V) La última vez que se pidió arreglo de esta comprobación. */
    arreglo?: ArregloPedido | null;
}

export interface ArregloPedido {
    t: string;
    quien: string;
    nota: string;
    peticion: string;
}

export interface ResumenComprobaciones {
    total: number;
    bien: number;
    falla: number;
    pendiente: number;
}

export interface AprobacionRegistrada {
    t: string;
    version: string;
    sha: string;
    lanzar_sha: string;
    quien: string;
    comprobaciones: ResumenComprobaciones & { lista: { id: string; texto: string; estado: EstadoComprobacion }[] };
}

export interface PruebaEnArchivo {
    version: string;
    sha: string;
    comprobaciones: Comprobacion[];
    aprobacion: AprobacionRegistrada | null;
}

/** `~/.starseed/produccion/pruebas-comprobaciones.json` (mismo formato que `scripts/puente/comprobaciones_prueba.py`). */
export interface ArchivoComprobaciones {
    formato: 1;
    pruebas: Record<string, PruebaEnArchivo>;
}

/** Lo que el director dice de una aprobación (de `lanzamientos-estado.json`). */
export interface AprobacionDirector {
    version: string;
    sha: string;
    estado: string; // en-curso · lanzada · caducada · superada · rechazada
    detalle: string;
}

/** Main avanzó desde el commit probado. */
export interface MainMovido {
    cabeza: string;
    total: number;
    grupos: GrupoCommits[];
}

export interface VersionPrueba {
    numero: number;
    /** «0.5.1-prueba.36»; null si aún no hay run (la base se deduce cuando lo hay). */
    version: string | null;
    etiqueta: string; // «prueba.36»
    sha: string | null;
    /** ISO: cuándo arrancó el run (o cuándo se pidió al lanzador). */
    fecha: string | null;
    runUrl: string | null;
    plataformas: BuildPlataforma[];
    /** Publicada en TODAS las plataformas para las que se compiló. */
    publicadaEnTodas: boolean;
    /** Lo que sirve hoy cada manifiesto del canal: ¿es esta? */
    vigente: { escritorio: boolean; android: boolean };
    contenido: ContenidoPrueba | null;
    comprobaciones: Comprobacion[];
    aprobacion: AprobacionRegistrada | null;
    director: AprobacionDirector | null;
    mainMovido: MainMovido | null;
    /** Lo que Genesis no sabe de esta versión (dicho en claro). */
    desconocido: string[];
}

export interface RespuestaPruebas {
    versiones: VersionPrueba[];
    resumen: string;
    /** Commit que sirve la web publicada (autopublicación), si se sabe. */
    web: string | null;
    /** Lo que no se pudo leer en esta pasada (GitHub, git, el canal…). */
    avisos: string[];
    generadoEn: string;
}

/** Lo que diría la confirmación de «Aprobar». */
export interface PlanAprobacion {
    puede: boolean;
    motivo: string;
    version: string;
    oficial: string;
    sha: string;
    lanzarSha: string;
    lanzar: string[];
    pendientes: Comprobacion[];
    fallas: Comprobacion[];
    mainMovido: MainMovido | null;
}
