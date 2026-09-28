/**
 * Espacio de trabajo ⇄ lista de tableros — PURO.
 *
 * El espacio de trabajo (paneles divididos, cada uno con sus pestañas) nacía con los tableros
 * que había al montar y no se enteraba de los que se creaban o borraban después: un tablero
 * nuevo no salía en la barra hasta recargar. `sincronizarPaneles` lo corrige sin tocar lo que
 * no cambió (devuelve el MISMO objeto si no hay nada que hacer, para no provocar re-render).
 */
import type { PanelNode, WorkspaceNode } from "../dashboard-workspace-types";

export function listarPaneles(nodo: WorkspaceNode): PanelNode[] {
    if (nodo.type === "panel") return [nodo];
    return nodo.children.flatMap(listarPaneles);
}

/**
 * El panel que aloja el editor: el enfocado si existe y tiene un tablero abierto; si no, el
 * primero con un tablero (un panel vacío recién dividido no se queda con el editor).
 */
export function elegirPanelEditor(raiz: WorkspaceNode, foco: string | null): string | null {
    const paneles = listarPaneles(raiz);
    if (foco && paneles.some((p) => p.id === foco && p.activeDashboardId)) return foco;
    return (paneles.find((p) => p.activeDashboardId) ?? paneles[0])?.id ?? null;
}

/**
 * Quita de todos los paneles los tableros que ya no existen y añade los nuevos al panel
 * `destino` (o al primero). Conserva el orden de `ids` para los añadidos.
 */
export function sincronizarPaneles(raiz: WorkspaceNode, ids: readonly string[], destino: string | null): WorkspaceNode {
    const existen = new Set(ids);
    const presentes = new Set(listarPaneles(raiz).flatMap((p) => p.dashboardIds));
    const nuevos = ids.filter((id) => !presentes.has(id));
    const paneles = listarPaneles(raiz);
    const idDestino = destino && paneles.some((p) => p.id === destino) ? destino : paneles[0]?.id ?? null;

    const visitar = (n: WorkspaceNode): WorkspaceNode => {
        if (n.type === "split") {
            const hijos = n.children.map(visitar);
            return hijos.every((h, i) => h === n.children[i]) ? n : { ...n, children: hijos };
        }
        const conservados = n.dashboardIds.filter((id) => existen.has(id));
        const anadidos = n.id === idDestino ? nuevos : [];
        if (conservados.length === n.dashboardIds.length && anadidos.length === 0) return n;
        const dashboardIds = [...conservados, ...anadidos];
        const activeDashboardId = n.activeDashboardId && existen.has(n.activeDashboardId)
            ? n.activeDashboardId
            : dashboardIds[0] ?? null;
        return { ...n, dashboardIds, activeDashboardId };
    };
    return visitar(raiz);
}
