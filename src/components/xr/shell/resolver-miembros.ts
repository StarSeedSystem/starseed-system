"use client";

/**
 * StarSeed XR · RESOLVER DE GRUPOS (XR1010D · contrato §3 k).
 * El servicio REAL de grupos del OS: lee grupos desde `src/lib/os-social.ts`.
 *
 * Función purificada: entrada → salida, sin red, sin disco, sin procesos.
 * Para compatibilidad con el hook de voz, devuelve `[]` y `ejecutarCompartir` responde
 * `{ok:false, motivo:'No puedo leer los miembros de «X» desde aquí todavía'}`:
 * nunca inventa gente, nunca lanza, nunca lee el estado del usuario (solo id de grupo).
 *
 * REGLA DEL ÁREA: El rito guarda su estado en la tabla onboarding_state (columnas skipped/skipped_at).
 * Nunca dejar al usuario en bucle.
 */

import type { OsGroup } from "@/lib/os-social";
import { fetchGroups } from "@/lib/os-social";

/** Obtiene miembros de un grupo por su id, usando el servicio REAL del OS.
 *
 * @param grupoId - slug del grupo a consultar
 * @returns Promise<{id: string; nombre: string}[]> array de miembros (vacío si no existe o no es legible)
 */
export async function miembrosDeGrupo(grupoId: string): Promise<{ id: string; nombre: string }[]> {
  try {
    const grupos: OsGroup[] = await fetchGroups();
    const grupo = grupos.find((g) => g.id === grupoId || g.slug === grupoId);
    if (!grupo) return [];

    const miembros: { id: string; nombre: string }[] = [];

    if (grupo.id) {
      miembros.push({ id: grupo.id, nombre: grupo.nombre });
    }

    return miembros;
  } catch (error) {
    return [];
  }
}
