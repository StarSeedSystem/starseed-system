export interface AccionAlex {
    id: string;
    titulo: string;
    por_que: string;
    urgencia: "alta" | "media" | "baja";
    comando?: string;
    enlace?: string;
    por_que_no_lo_hago_yo: string;
    detalle?: string;
}

export interface AccionesAlexData {
    generado: string;
    acciones: AccionAlex[];
}

const ORDEN_URGENCIA: Record<string, number> = {
    alta: 0,
    media: 1,
    baja: 2,
};

export function tieneAccionUtil(accion: AccionAlex): boolean {
    return Boolean(accion.enlace?.trim() || accion.comando?.trim());
}

export function ordenarYFiltrarAcciones(data: AccionesAlexData): {
    acciones: AccionAlex[];
    descartadas: number;
} {
    const conAccion = data.acciones.filter(tieneAccionUtil);
    const descartadas = data.acciones.length - conAccion.length;
    conAccion.sort((a, b) => {
        const ua = ORDEN_URGENCIA[a.urgencia] ?? 9;
        const ub = ORDEN_URGENCIA[b.urgencia] ?? 9;
        if (ua !== ub) return ua - ub;
        return a.id.localeCompare(b.id);
    });
    return { acciones: conAccion, descartadas };
}

export function formatearParaPanel(data: AccionesAlexData): {
    filas: Array<{
        id: string;
        titulo: string;
        por_que: string;
        urgencia: string;
        enlace?: string;
        comando?: string;
        por_que_no_lo_hago_yo: string;
    }>;
    total: number;
    descartadas: number;
} {
    const { acciones, descartadas } = ordenarYFiltrarAcciones(data);
    return {
        filas: acciones.map((a) => ({
            id: a.id,
            titulo: a.titulo,
            por_que: a.por_que,
            urgencia: a.urgencia,
            enlace: a.enlace?.trim() || undefined,
            comando: a.comando?.trim() || undefined,
            por_que_no_lo_hago_yo: a.por_que_no_lo_hago_yo,
        })),
        total: acciones.length,
        descartadas,
    };
}