/**
 * Tipos compartidos del Centro de Mando (Ola 231)
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrato de datos entre `src/lib/mando/lector-local.ts` (solo servidor) y la
 * ruta `GET /api/mando/estado`. La ruta jamás devuelve claves, tokens ni rutas
 * absolutas del disco del usuario: todo se normaliza a rutas relativas al
 * repositorio y a resúmenes sin material sensible.
 */

/** Un evento de la bitácora de relevo (línea de `bitacora.jsonl` o fila de `relevo_eventos`). */
export interface EventoRelevo {
    id: string;
    t: string;
    quien: string;
    tipo: string;
    tarea: string;
    texto: string;
    /** Metadatos libres del evento (columna `datos` de la tabla `relevo_eventos`). */
    datos?: unknown;
}

/** Un relevo (handoff) registrado en `estado.json`. */
export interface RelevoEvento {
    de: string;
    a: string;
    fecha: string;
    resumen: string;
}

/** Estado general del relevo extraído de `starseed_memory_root/relevo/`. */
export interface RelevoInfo {
    ultimoRelevo: RelevoEvento | null;
    actualizado: string;
    adenda: string;
    descripcion: string;
    git: {
        head: string;
        sinPush: number | null;
    };
    enjambreActivo: boolean;
    eventos: EventoRelevo[];
}

/** Una tarea de una cola de olas (`olas/cola-*.json`). */
export interface TareaOla {
    id: string;
    ola: string;
    titulo: string;
    dependencias: string[];
    /** Nombre de la cola (sin `cola-` ni `.json`) de la que salió, si se sabe. */
    cola?: string;
}

/** Latido de una tarea viva: lo escribe el vigilante del enjambre cada 20 s. */
export interface LatidoTarea {
    tarea: string;
    cola: string;
    /** escribiendo · esperando-memoria · tsc · tests · revision · integrando */
    fase: string;
    modelo: string;
    minutos: number;
    quietoSegundos: number;
    /** Dónde corre el agente: "mac" (esta máquina) o "nube" (contenedor de Cowork). */
    donde: string;
    /** Proveedor del modelo (nim, xkiro, aihubmix…). */
    proveedor?: string;
    /** Ventana de contexto del modelo, en tokens, si se conoce. */
    ventana?: number | null;
    /** Tokens REALES gastados por la tarea (de la base de opencode), si el latido los trae. */
    tokens?: { entrada: number; salida: number; razonamiento: number; cacheLeida: number; llamadas: number } | null;
    /** Tamaño del registro de la tarea, en bytes (crece mientras el agente escribe). */
    bytesLog?: number;
    intento?: number;
    /** Desde dónde se usan las APIs: hermes · claude · terminal · mando · cron · opencode… */
    medio?: string;
}

/** Foto de un orquestador tal como la publica en el bus con cada latido. */
export interface FotoEnjambre {
    donde: string;
    cola: string;
    agentesActivos: number;
    memoriaMb: number | null;
    integradas: number;
    proveedores: Record<string, { estado: string; llamadasMin: number; rpm: number }>;
    /** Momento del latido (ISO). */
    t: string;
    /** Quién lanzó ese orquestador (hermes, claude, terminal, mando, cron…). */
    medio?: string;
}

/** Recuento de tareas de la ola activa (y de las últimas olas), para la cabecera del Mando. */
export interface CuentasTareas {
    ola: string;
    integradas: number;
    enCurso: number;
    fallidas: number;
    sinCambios: number;
    pendientes: number;
    /** Lo mismo sumando las últimas olas (las que dibuja la ramificación). */
    ultimas: { olas: number; integradas: number; enCurso: number; fallidas: number; sinCambios: number; pendientes: number };
}

/** Cuántos agentes están escribiendo, cuántos caben y con cuánta memoria. */
export interface MedidorAgentes {
    activos: number;
    orquestadores: number;
    capacidad: number;
    memoriaLibreMb: number | null;
    holgado: boolean;
}

/** Una tarea esperando turno, con el porqué de su posición en la fila. */
export interface TareaEnFila {
    id: string;
    ola: string;
    titulo: string;
    estado: string;
    dependenciasPendientes: string[];
    modelosFallidos: number;
    /** Menor = antes. 0 = ya está en marcha. */
    prioridad: number;
    motivo: string;
}

/** Resumen de una ola (procesadas, bloqueantes, restantes…). */
export interface OlaResumen {
    id: string;
    titulo: string;
    seccion: string;
    procesadas: number;
    sinCambios: number;
    bloqueantes: number;
    restantes: number;
    total: number;
}

/** Consumo de un proveedor (para el balance de créditos). */
export interface ProveedorUso {
    proveedor: string;
    model: string;
    usado: number;
    limite: number | null;
    dia: string;
}

/** Un informe de ola (`relevo/informe-*.md`). */
export interface InformeOla {
    nombre: string;
    titulo: string;
    markdown: string;
    fecha: string;
}

/** Una sección de revisión leída de `olas/revisiones.md`. */
export interface RevisionRef {
    titulo: string;
    fecha: string;
    seguimiento: string;
    markdown: string;
}

/** Estado del repositorio git (solo resumen, sin claves). */
export interface RepoInfo {
    rama: string | null;
    head: string | null;
    sinPush: number | null;
    sinCommit: number | null;
    log: string[];
}

/** Un nodo del grafo de orquestación (Ola 239). */
export interface NodoGrafo {
    id: string;
    tipo: "ola" | "tarea" | "modelo" | "revisor" | "commit";
    etiqueta: string;
    estado?: string;
    ola?: string;
}

/** Una arista (relación dirigida) entre dos nodos del grafo de orquestación. */
export interface AristaGrafo {
    de: string;
    a: string;
    tipo: "contiene" | "depende" | "escribio" | "reviso" | "produjo";
}

/** El grafo de orquestación completo que devuelve `GET /api/mando/grafo`. */
export interface GrafoOrquestacion {
    nodos: NodoGrafo[];
    aristas: AristaGrafo[];
}

/** El contrato completo que devuelve `GET /api/mando/estado`. */
export interface EstadoMando {
    generadoEn: string;
    mandoActivo: boolean;
    relevo: RelevoInfo | null;
    olas: OlaResumen[];
    tareas: TareaOla[];
    /** Qué está escribiendo cada agente AHORA (vacío si no hay ola en marcha). */
    latidos: LatidoTarea[];
    /** Medidor de agentes: activos, capacidad y memoria. */
    agentes: MedidorAgentes;
    /** Un orquestador por máquina/cola, según el bus (mac y nube). */
    enjambres: FotoEnjambre[];
    /** Fila de tareas en orden inteligente para el siguiente agente. */
    fila: TareaEnFila[];
    /** Integradas · en curso · fallidas · sin cambios · pendientes (ola activa + últimas olas). */
    cuentas?: CuentasTareas;
    /** True si hay un orquestador vivo en la máquina, no lo que diga un archivo de estado. */
    enjambreEnMarcha: boolean;
    informes: InformeOla[];
    uso: ProveedorUso[];
    revisiones: RevisionRef[];
    repo: RepoInfo | null;
}