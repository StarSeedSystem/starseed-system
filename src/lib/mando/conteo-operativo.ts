/** Recuento honesto del trabajo: IDs únicos, no copias de colas históricas. */

export interface FilaContable {
    id: string;
    estado: string;
    dependenciasPendientes: string[];
}

export interface LatidoContable {
    tarea: string;
}

export interface ConteoOperativo {
    enCurso: number;
    listas: number;
    bloqueadas: number;
    pendientes: number;
    copiasOmitidas: number;
}

const CERRADAS = new Set([
    "commit", "bloqueante", "sin_cambios", "sustituida", "reasignada",
    "rechazada", "pendiente_aprobacion", "esperando_aprobacion",
]);

export function obtenerIdsBloqueados(
    fila: FilaContable[],
    latidos: LatidoContable[] = [],
): Set<string> {
    const activas = new Set(latidos.map((l) => l.tarea));
    const porId = new Map<string, FilaContable[]>();
    for (const tarea of fila) {
        const grupo = porId.get(tarea.id) ?? [];
        grupo.push(tarea);
        porId.set(tarea.id, grupo);
    }

    const bloqueados = new Set<string>();
    for (const [id, grupo] of porId) {
        if (activas.has(id)) continue;
        const abiertas = grupo.filter((tarea) => !CERRADAS.has(tarea.estado));
        if (abiertas.length === 0) continue;
        const todasBloqueadas = abiertas.every(
            (tarea) => tarea.estado === "bloqueada" || tarea.dependenciasPendientes.length > 0,
        );
        if (todasBloqueadas) {
            bloqueados.add(id);
        }
    }
    return bloqueados;
}

export function contarTrabajoReal(
    fila: FilaContable[],
    latidos: LatidoContable[],
): ConteoOperativo {
    const activas = new Set(latidos.map((latido) => latido.tarea));
    const porId = new Map<string, FilaContable[]>();
    for (const tarea of fila) {
        const grupo = porId.get(tarea.id) ?? [];
        grupo.push(tarea);
        porId.set(tarea.id, grupo);
    }

    let enCurso = 0;
    let listas = 0;
    // Agentes activos pero que no están en `fila` (ej. venidos de otras fuentes) también son «en curso»
    for (const id of activas) {
        if (!porId.has(id)) enCurso += 1;
    }

    const idsBloqueados = obtenerIdsBloqueados(fila, latidos);
    const bloqueadas = idsBloqueados.size;

    for (const [id, grupo] of porId) {
        if (activas.has(id)) {
            // Tarea con latido vivo: está en curso, no lista ni bloqueada.
            enCurso += 1;
            continue;
        }
        const abiertas = grupo.filter((tarea) => !CERRADAS.has(tarea.estado));
        if (abiertas.length === 0) continue;
        if (!idsBloqueados.has(id)) {
            listas += 1;
        }
    }

    return {
        enCurso,
        listas,
        bloqueadas,
        pendientes: listas + bloqueadas,
        copiasOmitidas: Math.max(0, fila.length - porId.size),
    };
}
