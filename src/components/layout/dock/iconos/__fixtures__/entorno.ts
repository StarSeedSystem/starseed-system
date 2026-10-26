/**
 * Piezas comunes de las pruebas del diseño de iconos: el estado del dock en `localStorage`, una biblioteca
 * falsa y Vive fuera de `__tests__` para que Vitest no lo trate como un archivo de pruebas.
 */
import { CLAVE_PERFIL_ICONOS } from "@/lib/dock/iconos/almacen";
import { _reiniciarCacheAlmacen } from "@/lib/dock/iconos/almacen";
import { DOCK_STORAGE_KEY } from "@/lib/dock/dock-defaults";
import { DOCK_PRESETS } from "@/components/layout/dock-config";
import type { DisenoIcono, PlantillaIconos } from "@/lib/dock/iconos/modelo";

/** Un dock guardado con los presets y, opcionalmente, diseños propios en algunos items. */
export function guardarDock(disenos: Record<string, DisenoIcono> = {}): void {
    const items = DOCK_PRESETS.map((p) => (disenos[p.id] ? { ...p, diseno: disenos[p.id] } : { ...p }));
    window.localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify({ defaultsVersion: 99, items }));
}

export function leerDockGuardado(): Array<Record<string, unknown>> {
    const crudo = window.localStorage.getItem(DOCK_STORAGE_KEY);
    if (!crudo) return [];
    const valor = JSON.parse(crudo) as unknown;
    // el dock se guarda como sobre `{defaultsVersion, items}`; el formato antiguo era el array a secas
    return (Array.isArray(valor) ? valor : (valor as { items?: unknown }).items ?? []) as Array<Record<string, unknown>>;
}

export function guardarPerfil(plantilla: PlantillaIconos | null): void {
    window.localStorage.setItem(CLAVE_PERFIL_ICONOS, JSON.stringify({ v: 1, plantilla, actualizado: 1 }));
    _reiniciarCacheAlmacen();
}

export function limpiarEntorno(): void {
    window.localStorage.clear();
    _reiniciarCacheAlmacen();
}
