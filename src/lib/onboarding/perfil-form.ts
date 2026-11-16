import { MARCO_POR_DEFECTO, type Marco } from "@/lib/profile/marco-foto";
import type { Avatar3D } from "@/components/profile/avatar-3d";

/**
 * CARGA DE PERFIL, PARTE PURA (IMG) — lo que la ventana de perfil necesita
 * para NO dejar nunca al usuario en bucle:
 *   · la fila de `profiles` se convierte en estado del formulario con
 *     valores vacíos seguros (falta algo → se edita igual desde cero),
 *   · `conTopeDe` corre cualquier promesa de carga con tope de tiempo:
 *     si la consulta cuelga, la carga termina igual y el spinner no es
 *     eterno (la misma avería que ya se vio en el botón Guardar).
 */

/** Fila tal como la lee la ventana (consulta a `profiles`). */
export interface FilaPerfil {
  handle?: string | null;
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  cover_url?: string | null;
  avatar_marco?: Marco | null;
  avatar_3d?: Avatar3D | null;
}

export interface EstadoPerfilForm {
  nombre: string;
  handle: string;
  bio: string;
  avatar: string;
  portada: string;
  marco: Marco;
  avatar3d: Avatar3D | null;
}

export function perfilFormDesdeFila(fila: FilaPerfil | null): EstadoPerfilForm {
  if (!fila) return { nombre: "", handle: "", bio: "", avatar: "", portada: "", marco: { ...MARCO_POR_DEFECTO }, avatar3d: null };
  return {
    nombre: fila.display_name || "",
    handle: fila.handle || "",
    bio: fila.bio || "",
    avatar: fila.avatar_url || "",
    portada: fila.cover_url || "",
    marco: fila.avatar_marco ? { ...MARCO_POR_DEFECTO, ...fila.avatar_marco } : { ...MARCO_POR_DEFECTO },
    avatar3d: fila.avatar_3d?.url ? fila.avatar_3d : null,
  };
}

export function conTopeDe<T>(p: Promise<T>, ms = 6000): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolver) => setTimeout(() => resolver(null), ms)),
  ]);
}
