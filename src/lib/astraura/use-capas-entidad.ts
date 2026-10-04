/*
 * use-capas-entidad — Almacén local + hook de los ajustes de capas por entidad.
 * (Ola 1003 · capas por entidad y local preferente — architecture/astraura-158-sistema-primario.md §15 y §19)
 * Local-first: persiste en localStorage bajo CLAVE_CAPAS_ENTIDAD y avisa con
 * EVENTO_CAPAS_ENTIDAD. Sin "use client" a propósito: el enrutador (servidor)
 * puede importar las funciones puras; el hook usa useSyncExternalStore.
 */
import { useSyncExternalStore } from "react";
import {
    AJUSTES_VACIOS,
    CLAVE_CAPAS_ENTIDAD,
    EVENTO_CAPAS_ENTIDAD,
    leerAjustesCapasEntidad,
    fijarCapa,
    type AjustesCapasEntidad,
    type AmbitoCapas,
    type CampoCapa,
} from "./capas-entidad";

/** Lee los ajustes guardados (localStorage del navegador o un almacén falso en pruebas). Nunca lanza. */
export function ajustesCapasEntidadGuardados(
    almacen?: Pick<Storage, "getItem"> | null,
): AjustesCapasEntidad {
    try {
        const origen =
            almacen ?? (typeof window !== "undefined" ? window.localStorage : null);
        if (!origen) return AJUSTES_VACIOS;
        const crudo = origen.getItem(CLAVE_CAPAS_ENTIDAD);
        if (!crudo) return AJUSTES_VACIOS;
        return leerAjustesCapasEntidad(JSON.parse(crudo));
    } catch {
        return AJUSTES_VACIOS;
    }
}

/** Guarda los ajustes y avisa a la app en vivo. Nunca lanza (local-first). */
export function guardarAjustesCapasEntidad(a: AjustesCapasEntidad): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(CLAVE_CAPAS_ENTIDAD, JSON.stringify(a));
    } catch { /* sin cuota o sin store: local-first degradado */ }
    try {
        window.dispatchEvent(new CustomEvent(EVENTO_CAPAS_ENTIDAD));
    } catch { /* noop */ }
}

/** Fija (o limpia, con null) un campo de capa para una entidad y persiste. */
export function fijarCapaGuardada(
    ambito: AmbitoCapas,
    id: string,
    campo: CampoCapa,
    valor: boolean | null,
): void {
    const actuales = ajustesCapasEntidadGuardados();
    guardarAjustesCapasEntidad(fijarCapa(actuales, ambito, id, campo, valor));
}

/* Snapshot cacheado por el TEXTO CRUDO: mientras localStorage no cambie, se
 * devuelve la misma referencia y useSyncExternalStore no re-renderiza en bucle. */
let ultimoCrudo: string | null = null;
let ultimoSnapshot: AjustesCapasEntidad = AJUSTES_VACIOS;

function snapshotCliente(): AjustesCapasEntidad {
    let crudo: string | null = null;
    try {
        crudo = window.localStorage.getItem(CLAVE_CAPAS_ENTIDAD);
    } catch {
        crudo = null;
    }
    if (crudo === ultimoCrudo) return ultimoSnapshot;
    ultimoCrudo = crudo;
    ultimoSnapshot = ajustesCapasEntidadGuardados(window.localStorage);
    return ultimoSnapshot;
}

function snapshotServidor(): AjustesCapasEntidad {
    return AJUSTES_VACIOS;
}

function suscribir(alCambiar: () => void): () => void {
    window.addEventListener(EVENTO_CAPAS_ENTIDAD, alCambiar);
    window.addEventListener("storage", alCambiar);
    return () => {
        window.removeEventListener(EVENTO_CAPAS_ENTIDAD, alCambiar);
        window.removeEventListener("storage", alCambiar);
    };
}

/** Hook: ajustes de capas por entidad, vivos entre pestañas y en la misma página. */
export function useAjustesCapasEntidad(): AjustesCapasEntidad {
    return useSyncExternalStore(suscribir, snapshotCliente, snapshotServidor);
}
