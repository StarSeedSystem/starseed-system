"use client";

/**
 * PERFIL INICIAL (Adenda 194) — capa de datos de la «ventana de perfil inicial».
 * Aquí vive TODO lo que la ventana necesita de Supabase: el componente ya no
 * abre su propio cliente (duplicaba el trabajo de esta capa: dos escrituras
 * del perfil público y dos clientes para lo mismo).
 * La mitad PURA (`planearGuardadoPerfilInicial`) decide QUÉ se guarda —es la
 * costura probada—; la de DATOS (`leerPerfilInicial`, `guardarPerfilInicial`)
 * habla con Supabase.
 */

import { createClient } from "@/utils/supabase/client";
import { claimProfile, isValidHandle, saveProfileOptional } from "./onboarding";
import type { Avatar3D } from "@/components/profile/avatar-3d";
import type { Marco } from "@/lib/profile/marco-foto";

/** El formulario de la ventana, tal como lo tiene el componente. */
export type EstadoPerfilInicial = {
  nombre: string; handle: string; bio: string; avatar: string; portada: string;
  marco: Marco | null; avatar3d: Avatar3D | null;
};

/** Lo que se escribe en `profiles` (privado) y se espeja en `os_profiles`. */
export type CamposPerfilOpcional = {
  avatar_url?: string; cover_url?: string; bio?: string;
  avatar_marco?: Record<string, unknown> | null; avatar_3d?: Record<string, unknown> | null;
};
/** Plan de guardado: o hay un error que ver, o se guarda. */
export type PlanPerfilInicial =
  | { accion: "error"; error: string }
  | { accion: "guardar"; identidad: { fullName: string; handle: string } | null; opcionales: CamposPerfilOpcional };

/** Lo que ya hay guardado, para rellenar el formulario (misma forma que él). */
export type PerfilInicialGuardado = EstadoPerfilInicial;
/** El mismo aviso que ve el usuario cuando el @handle no vale. */
export const ERROR_HANDLE_INVALIDO = "El @handle no es válido (3-20 caracteres: a-z, 0-9, _).";

/**
 * Decide QUÉ se guarda a partir del formulario. PURA: sin red, sin disco.
 * · un @handle con formato inválido detiene el guardado (el usuario lo ve);
 * · sin @handle (o sin nombre) no se reclama identidad —el nombre va con el
 *   @handle—, pero los opcionales se guardan igual;
 * · un campo opcional vacío NO se escribe: no borra lo que ya había.
 */
export function planearGuardadoPerfilInicial(estado: EstadoPerfilInicial): PlanPerfilInicial {
  const handle = (estado.handle || "").trim().toLowerCase();
  const nombre = (estado.nombre || "").trim();
  if (handle && !isValidHandle(handle)) {
    return { accion: "error", error: ERROR_HANDLE_INVALIDO };
  }
  const opcionales: CamposPerfilOpcional = {};
  const avatar = (estado.avatar || "").trim();
  const portada = (estado.portada || "").trim();
  const bio = (estado.bio || "").trim();
  if (avatar) opcionales.avatar_url = avatar;
  if (portada) opcionales.cover_url = portada;
  if (bio) opcionales.bio = bio;
  if (estado.marco) opcionales.avatar_marco = { ...estado.marco } as Record<string, unknown>;
  // Sin avatar 3D se guarda null: así se limpia el que hubiera quedado.
  opcionales.avatar_3d = estado.avatar3d?.url
    ? ({ ...estado.avatar3d } as unknown as Record<string, unknown>)
    : null;
  return {
    accion: "guardar",
    identidad: handle && nombre ? { fullName: nombre, handle } : null,
    opcionales,
  };
}

/** Lee el perfil de la cuenta (privado) para rellenar el formulario. */
export async function leerPerfilInicial(): Promise<PerfilInicialGuardado | null> {
  try {
    const sb = createClient();
    const { data: u } = await sb.auth.getUser();
    const id = u?.user?.id;
    if (!id) return null;
    const { data } = await sb
      .from("profiles")
      .select("handle,display_name,bio,avatar_url,cover_url,avatar_marco,avatar_3d")
      .eq("user_id", id)
      .maybeSingle();
    if (!data) return null;
    const p = data as {
      handle?: string; display_name?: string; bio?: string; avatar_url?: string; cover_url?: string;
      avatar_marco?: Marco | null; avatar_3d?: Avatar3D | null;
    };
    return {
      handle: p.handle || "", nombre: p.display_name || "", bio: p.bio || "", avatar: p.avatar_url || "",
      portada: p.cover_url || "", marco: p.avatar_marco ?? null, avatar3d: p.avatar_3d ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Guarda el perfil. La IDENTIDAD (nombre + @handle) se reclama primero y, si
 * falla, se detiene: el usuario puede corregir el @handle y reintentar. Lo
 * opcional es best-effort: NUNCA bloquea el rito (nadie se queda atrapado).
 */
export async function guardarPerfilInicial(
  estado: EstadoPerfilInicial,
): Promise<{ ok: boolean; error?: string }> {
  const plan = planearGuardadoPerfilInicial(estado);
  if (plan.accion === "error") return { ok: false, error: plan.error };
  try {
    if (plan.identidad) {
      const r = await claimProfile(plan.identidad);
      if (!r.ok) return { ok: false, error: r.error };
    }
    const op = await saveProfileOptional(plan.opcionales);
    if (!op.ok) {
      console.warn("[perfil-inicial] no se pudieron guardar los campos opcionales:", op.error);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "No se pudo guardar el perfil." };
  }
}
