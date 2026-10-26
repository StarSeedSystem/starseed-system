/**
 * Poner diseños de iconos EN el dock real (Ola 1025U · V1b): el único sitio donde el editor y la galería
 * escriben. Lee y guarda por las funciones oficiales del dock (`loadDockConfig` / `saveDockConfig`, que
 * viajan con la cuenta) y avisa con el evento que OmniDock ya escucha, para que se repinte al instante.
 */

import { loadDockConfig, saveDockConfig, type DockItemConfig } from "@/components/layout/dock-config";
import { EVENTO_DOCK, guardarPerfilIconos, quitarPlantillaDelPerfil } from "@/lib/dock/iconos/almacen";
import {
    aplicarPlantilla,
    ponerDisenoItem,
    quitarDisenosPropios,
    type DisenoIcono,
    type PlantillaIconos,
    type ResultadoAplicar,
} from "@/lib/dock/iconos/modelo";

function avisarDock(): void {
    try { window.dispatchEvent(new Event(EVENTO_DOCK)); } catch { /* noop */ }
}

/** Los items del dock tal como están ahora (todos, también los apagados). */
export function itemsDelDock(): DockItemConfig[] {
    return loadDockConfig();
}

/** Cuántos items tienen un diseño propio cambiado a mano. */
export function contarDisenosPropios(items: readonly DockItemConfig[] = loadDockConfig()): number {
    return items.filter((i) => !!i.diseno).length;
}

/** Pone (o quita, con `null`) el diseño propio de UN item. `false` si el item ya no existe. */
export function aplicarDisenoAItem(itemId: string, diseno: DisenoIcono | null): boolean {
    const items = loadDockConfig();
    if (!items.some((i) => i.id === itemId)) return false;
    saveDockConfig(ponerDisenoItem(items, itemId, diseno));
    avisarDock();
    return true;
}

/**
 * Aplica una plantilla a TODO el perfil: la guarda en el perfil (viaja con la cuenta) y, salvo que se pida
 * conservarlos, limpia los diseños que cada item tuviera cambiados a mano.
 */
export function aplicarPlantillaAlPerfil(plantilla: PlantillaIconos, opciones: { conservarManuales?: boolean } = {}): ResultadoAplicar<DockItemConfig> {
    const items = loadDockConfig();
    const r = aplicarPlantilla(items, plantilla, opciones);
    if (!r.ok) return r;
    if (r.limpiados > 0) saveDockConfig(r.items);
    guardarPerfilIconos(r.perfil);
    avisarDock();
    return r;
}

/** Quita la plantilla del perfil. Con `tambienManuales`, también los diseños sueltos (todo como de fábrica). */
export function quitarPlantilla(opciones: { tambienManuales?: boolean } = {}): { quitadosManuales: number } {
    let quitadosManuales = 0;
    if (opciones.tambienManuales) {
        const { items, quitados } = quitarDisenosPropios(loadDockConfig());
        if (quitados > 0) saveDockConfig(items);
        quitadosManuales = quitados;
    }
    quitarPlantillaDelPerfil();
    avisarDock();
    return { quitadosManuales };
}

