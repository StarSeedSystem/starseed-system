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

/** El contrato completo que devuelve `GET /api/mando/estado`. */
export interface EstadoMando {
    generadoEn: string;
    mandoActivo: boolean;
    relevo: RelevoInfo | null;
    olas: OlaResumen[];
    tareas: TareaOla[];
    informes: InformeOla[];
    uso: ProveedorUso[];
    revisiones: RevisionRef[];
    repo: RepoInfo | null;
}