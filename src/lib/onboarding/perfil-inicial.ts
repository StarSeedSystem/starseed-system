/**
 * PERFIL INICIAL DEL RITO — lógica pura (IMG-profunda · 2026-11-16).
 *
 * La ventana de perfil (src/components/onboarding/ventana-perfil-inicial.tsx)
 * abre su propio cliente de Supabase DOS veces: una para leer la fila del
 * perfil y otra para volver a sincronizar el perfil público. Eso duplicaba el
 * cliente y la escritura: el perfil público ya se guarda dentro de la capa de
 * datos (src/lib/onboarding/onboarding.ts), que es la única que debe hablar
 * con la base.
 *
 * Aquí queda lo que NO necesita red, en dos conversiones:
 *  · la fila de `profiles` → el estado del formulario,
 *  · el estado del formulario → UN payload (el mismo para el perfil privado
 *    y para su espejo público `os_profiles`).
 *
 * Puro de verdad: sin red, sin disco y sin `window`. Los tipos vienen de
 * `marco-foto` (puro) y del avatar 3D (solo tipos: no se arrastra el
 * componente).
 */
import { MARCO_POR_DEFECTO, type Marco } from "@/lib/profile/marco-foto";
import type { Avatar3D } from "@/components/profile/avatar-3d";

/** La fila de `profiles` tal como la lee el rito. */
export interface FilaPerfil {
  handle?: string | null;
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  cover_url?: string | null;
  avatar_marco?: Marco | null;
  avatar_3d?: Avatar3D | null;
}

/** El estado del formulario de la ventana de perfil. */
export interface PerfilInicial {
  nombre: string;
  handle: string;
  bio: string;
  avatar: string;
  portada: string;
  marco: Marco;
  avatar3d: Avatar3D | null;
}

/** Lo que se guarda: perfil privado (`profiles`) y espejo público (`os_profiles`). */
export interface PayloadPerfil {
  avatar_url?: string;
  cover_url?: string;
  bio?: string;
  avatar_marco?: Record<string, unknown>;
  avatar_3d?: Record<string, unknown> | null;
}

/**
 * Fila → estado del formulario. Sin fila (o con campos vacíos) el formulario
 * queda limpio y con el marco por defecto: se edita igual desde cero.
 */
export function perfilDesdeFila(fila: FilaPerfil | null | undefined): PerfilInicial {
  return {
    nombre: fila?.display_name ?? "",
    handle: fila?.handle ?? "",
    bio: fila?.bio ?? "",
    avatar: fila?.avatar_url ?? "",
    portada: fila?.cover_url ?? "",
    marco: { ...MARCO_POR_DEFECTO, ...(fila?.avatar_marco ?? {}) },
    avatar3d: fila?.avatar_3d ?? null,
  };
}

/**
 * Estado → payload. UN solo payload para las dos escrituras: antes se armaba
 * dos veces (una para el perfil privado y otra para el público) y por eso se
 * desincronizaban. Lo vacío NO se manda: no se borra lo que ya estaba.
 */
export function payloadPerfilInicial(p: PerfilInicial): PayloadPerfil {
  return {
    avatar_url: p.avatar || undefined,
    cover_url: p.portada || undefined,
    bio: p.bio || undefined,
    avatar_marco: { ...p.marco } as unknown as Record<string, unknown>,
    avatar_3d: p.avatar3d?.url
      ? ({ ...p.avatar3d } as unknown as Record<string, unknown>)
      : null,
  };
}

/** @handle de tecleo: minúsculas y solo a-z, 0-9 y _. */
export function normalizarHandle(texto: string): string {
  return (texto || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
}
