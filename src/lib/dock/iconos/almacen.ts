/**
 * Almacén de la plantilla de iconos del PERFIL (Ola 1025U · V1b).
 *
 * La plantilla aplicada vive en su propia clave, `starseed.dock.iconos.v1`, que viaja con la cuenta como
 * el resto del dock (SYNCED_KEYS): así los 49 diseños de una plantilla no se copian dentro de cada item
 * del dock y un item nuevo ya nace con el estilo del perfil. Solo los cambios hechos a mano a UN icono
 * se guardan en el propio item (`DockItemConfig.diseno`).
 *
 * Todo lo que se lee se normaliza (`normalizarPerfil`): el valor puede venir de otro dispositivo, de un
 * archivo o de una versión antigua. Sin `window` (SSR/pruebas) o con el almacenamiento bloqueado, el perfil
 * es el vacío y nada lanza.
 */

import { useSyncExternalStore } from "react";
import { normalizarPerfil, perfilVacio, type PerfilIconos } from "./modelo";

export const CLAVE_PERFIL_ICONOS = "starseed.dock.iconos.v1";
export const EVENTO_PERFIL_ICONOS = "starseed:dock-iconos";
/** Aviso de que el dock (items) cambió: OmniDock ya lo escucha y recarga. */
export const EVENTO_DOCK = "starseed:dock";

const VACIO: PerfilIconos = perfilVacio();

let cacheCrudo: string | null | undefined;
let cachePerfil: PerfilIconos = VACIO;

/** El perfil de iconos actual. Devuelve LA MISMA referencia mientras el valor guardado no cambie. */
export function leerPerfilIconos(): PerfilIconos {
    if (typeof window === "undefined") return VACIO;
    let crudo: string | null = null;
    try { crudo = window.localStorage.getItem(CLAVE_PERFIL_ICONOS); } catch { return VACIO; }
    if (crudo === cacheCrudo) return cachePerfil;
    cacheCrudo = crudo;
    if (!crudo) { cachePerfil = VACIO; return cachePerfil; }
    try { cachePerfil = normalizarPerfil(JSON.parse(crudo)); } catch { cachePerfil = VACIO; }
    return cachePerfil;
}

/** Guarda el perfil y avisa a quien escuche (dock, galería). `false` si el almacenamiento no deja escribir. */
export function guardarPerfilIconos(perfil: PerfilIconos): boolean {
    if (typeof window === "undefined") return false;
    try {
        // Siempre se ESCRIBE (también «sin plantilla»): borrar la clave no viaja con la cuenta y otro
        // dispositivo la devolvería; un perfil vacío con su fecha sí gana en la sincronización.
        window.localStorage.setItem(CLAVE_PERFIL_ICONOS, JSON.stringify(normalizarPerfil(perfil)));
    } catch { return false; }
    try { window.dispatchEvent(new Event(EVENTO_PERFIL_ICONOS)); } catch { /* noop */ }
    return true;
}

/** Quita la plantilla del perfil (los iconos vuelven a su aspecto de siempre, salvo los cambiados a mano). */
export function quitarPlantillaDelPerfil(): boolean {
    return guardarPerfilIconos(perfilVacio(Date.now()));
}

export function suscribirPerfilIconos(cb: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    window.addEventListener(EVENTO_PERFIL_ICONOS, cb);
    // otra pestaña, o una cuenta que trae cambios de otro dispositivo
    window.addEventListener("storage", cb);
    window.addEventListener("starseed:sync:apply", cb);
    return () => {
        window.removeEventListener(EVENTO_PERFIL_ICONOS, cb);
        window.removeEventListener("storage", cb);
        window.removeEventListener("starseed:sync:apply", cb);
    };
}

/** El perfil de iconos como estado reactivo (se actualiza solo al aplicar una plantilla o al sincronizar). */
export function usePerfilIconos(): PerfilIconos {
    return useSyncExternalStore(suscribirPerfilIconos, leerPerfilIconos, () => VACIO);
}

/** Solo para pruebas: olvida la caché de lectura. */
export function _reiniciarCacheAlmacen(): void {
    cacheCrudo = undefined;
    cachePerfil = VACIO;
}
