/*
 * canal-listo — funciones PURAS para no gastar peticiones de Supabase.
 *
 * `channel.send()` de supabase-js, si el canal NO está unido al websocket, cae a
 * `POST /realtime/v1/api/broadcast` (una petición REST por mensaje). Medido el 26-11:
 * 6.124 al día desde el navegador. Solo se envía por el socket cuando el canal está `joined`.
 */

/** Lo mínimo que se lee de un `RealtimeChannel`. */
export interface CanalConEstado {
  state?: unknown;
}

/** `true` si el canal está unido al websocket (enviar no costará una petición REST). */
export function canalListoParaEnviar(canal: CanalConEstado | null | undefined): boolean {
  return !!canal && String(canal.state) === "joined";
}

/**
 * Clave estable para limitar por ritmo sin llamar a `auth.getUser` en cada petición:
 * hash corto (FNV-1a) del token/cookie de sesión, o la IP reenviada si no hay sesión.
 * Nunca devuelve el valor original (no se guarda el token en memoria como clave).
 */
export function claveLimiteDePeticion(cabeceras: { get(nombre: string): string | null }): string {
  const origen =
    cabeceras.get("authorization") ||
    cabeceras.get("cookie") ||
    cabeceras.get("x-forwarded-for") ||
    cabeceras.get("x-real-ip") ||
    "anonimo";
  let h = 0x811c9dc5;
  for (let i = 0; i < origen.length; i++) {
    h ^= origen.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
