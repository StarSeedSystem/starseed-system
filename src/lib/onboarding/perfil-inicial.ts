/**
 * perfil-inicial — el perfil de la persona en la ventana del rito.
 *
 * Módulo PURO: la fila de `profiles` (o los campos que se están editando)
 * entran por parámetro y sale el perfil normalizado y, del perfil, los campos
 * del perfil PÚBLICO (`os_profiles`). Aquí no hay red ni disco: el acceso a
 * Supabase vive solo en la capa de datos (`@/lib/onboarding/onboarding`), que
 * usa el cliente singleton — así la ventana del rito no abre el suyo.
 */

/**
 * El perfil tal como lo ve la ventana del rito: todo cadena (vacía si no hay)
 * para que la ventana pueda editarlo sin distinguir «no está» de «está en
 * blanco». El marco y el avatar 3D son opcionales (Adenda 219).
 */
export type PerfilInicial = {
  handle: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  cover_url: string;
  avatar_marco?: Record<string, unknown> | null;
  avatar_3d?: Record<string, unknown> | null;
};

/** Texto de la fila: cadena vacía cuando no hay valor (nunca `undefined`). */
function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

/** Objeto de la fila (marco, avatar 3D) si lo es; `null` si no. */
function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === "object" ? (valor as Record<string, unknown>) : null;
}

/**
 * Fila de `profiles` → perfil de la ventana del rito.
 *
 * Lo que no está guardado llega como cadena vacía: la ventana se edita igual
 * desde cero. El marco y el avatar 3D solo se copian si son objetos de verdad
 * (una fila corrupta no debe romper la ventana).
 */
export function perfilDesdeFila(fila: Record<string, unknown>): PerfilInicial {
  const marco = objeto(fila.avatar_marco);
  const avatar3d = objeto(fila.avatar_3d);
  return {
    handle: texto(fila.handle),
    display_name: texto(fila.display_name),
    bio: texto(fila.bio),
    avatar_url: texto(fila.avatar_url),
    cover_url: texto(fila.cover_url),
    ...(marco ? { avatar_marco: marco } : {}),
    ...(avatar3d ? { avatar_3d: avatar3d } : {}),
  };
}

/**
 * Perfil (o fila) → los campos que se guardan en el perfil PÚBLICO
 * (`os_profiles`, la tabla que sirve /profile/<handle>).
 *
 * Reglas:
 *  - lo vacío NO se manda: no se borra lo que ya está publicado en la red;
 *  - el @handle va también como `username` (misma dirección, otro nombre);
 *  - `avatar_marco` y `avatar_3d` se mandan siempre que se Digan: `null`
 *    limpia el avatar 3D y `undefined` (ausente) no toca lo que había.
 */
export function camposPerfilPublico(perfil: Record<string, unknown>): Record<string, unknown> {
  const campos: Record<string, unknown> = {};
  if (perfil.avatar_marco !== undefined) campos.avatar_marco = perfil.avatar_marco;
  if (perfil.avatar_3d !== undefined) campos.avatar_3d = perfil.avatar_3d;
  const handle = texto(perfil.handle);
  if (handle) {
    campos.handle = handle;
    campos.username = handle;
  }
  const display_name = texto(perfil.display_name);
  if (display_name) campos.display_name = display_name;
  const avatar_url = texto(perfil.avatar_url);
  if (avatar_url) campos.avatar_url = avatar_url;
  const cover_url = texto(perfil.cover_url);
  if (cover_url) campos.cover_url = cover_url;
  const bio = texto(perfil.bio);
  if (bio) campos.bio = bio;
  return campos;
}
