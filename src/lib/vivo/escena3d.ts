"use client";

/**
 * App en vivo «Escena 3D» (L5 · 2026-09-28) — contrato para el catálogo de apps en vivo
 * (`src/components/messages/vivo/catalogo-vivo.ts`, lo cablea el integrador).
 *
 * Una escena es una fila de `os_spaces` con `kind = 'escena'` y el doc de `@/lib/vivo/espacial`:
 * objetos (primitivas, rótulos, imágenes, modelos GLB https, luces), ambiente y avatares en vivo.
 * Se abre en `/escena/<id>` (acepta `?sesion=<id>` sin efecto más allá de la presencia global).
 * El mismo recurso entra en VR/AR por `/sala-xr/<id>` (ver `./xr`).
 *
 * Compartir usa lo mismo que pizarras y escritorios (`os_spaces` + `os_space_editors`), así que el
 * integrador puede reutilizar `concederAcceso`/`cambiarPublico`/`deshacerCreacion` tal cual o los
 * de aquí, que son idénticos.
 */

import { deleteSpace, inviteToSpace, updateSpaceMeta } from "@/lib/spaces/spaces";
import type { PermisoVivo } from "@/lib/mensajeria/formato-tipos";
import { docVacio } from "@/lib/vivo/espacial/modelo";
import { crearFilaEscena, listarEscenasPropias, MENSAJES_ERROR } from "@/lib/vivo/espacial/persistencia";

export function rutaEscena(id: string): string {
    return `/escena/${encodeURIComponent(id)}`;
}

export const INFO_VIVO_ESCENA3D = {
    etiqueta: "Escena 3D",
    descripcion: "Un espacio tridimensional compartido: objetos, luces y el avatar de cada persona, en vivo.",
    icono: "Box",
    color: "#F97316",
    /** Matiz honesto para la tarjeta del catálogo. */
    nota: "Imágenes y modelos se cargan desde direcciones https que permitan su uso desde otras webs (CORS). El enlace público abre en modo lectura.",
    permisos: ["ver", "editar"] as PermisoVivo[],
    edicionPorEnlacePublico: false,
} as const;

/** Crea una escena vacía y devuelve su ruta. Lanza un Error con mensaje en español si no se puede. */
export async function crearVivoEscena3d(titulo: string): Promise<{ refId: string; ruta: string }> {
    const r = await crearFilaEscena(titulo || "Escena 3D", docVacio());
    if (!r.fila) throw new Error(MENSAJES_ERROR[r.error]);
    return { refId: r.fila.id, ruta: rutaEscena(r.fila.id) };
}

export async function listarMiosEscena3d(): Promise<{ refId: string; titulo: string; ruta: string }[]> {
    const propias = await listarEscenasPropias();
    return propias.map((e) => ({ refId: e.id, titulo: e.titulo, ruta: rutaEscena(e.id) }));
}

/** Invita cuentas a la escena (editor o lector). Devuelve cuántas invitaciones se lograron. */
export async function concederAccesoEscena(refId: string, userIds: string[], permiso: PermisoVivo): Promise<number> {
    const rol = permiso === "editar" ? "editor" : "viewer";
    const unicos = [...new Set(userIds.filter((u) => typeof u === "string" && u.length > 0))];
    const r = await Promise.all(unicos.map((u) => inviteToSpace(refId, u, rol)));
    return r.filter(Boolean).length;
}

/** Enlace público: lectura para quien no esté invitado (RLS de `os_spaces`). */
export async function cambiarPublicoEscena(refId: string, publico: boolean): Promise<boolean> {
    return updateSpaceMeta(refId, { access: publico ? "public" : "invite" });
}

export async function deshacerCreacionEscena(refId: string): Promise<void> {
    await deleteSpace(refId);
}
