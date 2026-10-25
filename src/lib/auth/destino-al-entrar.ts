/**
 * A dónde se va después de entrar — PURO.
 * ═══════════════════════════════════════════════════════════════════════════
 * (Ola 1025T · ACC1025A) La ventana de acceso única se pinta en tres sitios y cada uno quiere una cosa
 * distinta al terminar de entrar:
 *
 *   · `/login` (y quien llegue con `?next=`): a donde iba la persona, o a la página principal.
 *   · `/bienvenida`: se queda — la página mira la sesión y decide (el rito o los escritorios).
 *   · la ventana encima de otra página (la puerta de sesión del perfil, de Ajustes…): se queda en esa
 *     página, que al haber sesión pinta lo suyo.
 *
 * Un `?next=` válido de la URL manda siempre (es lo que prometió el enlace: una llamada, una sala en vivo);
 * solo cuenta si es una ruta interna segura (ver `siguiente-seguro.ts`). Si no, manda `porDefecto`:
 * `undefined` → la página principal (`/`), `null` → quedarse donde se está.
 */

import { haySiguiente, siguienteDeBusqueda } from "./siguiente-seguro";

export type DestinoAlEntrar = string | null | undefined;

/** La ruta a la que navegar tras entrar, o `null` si hay que quedarse donde se está. */
export function destinoTrasEntrar(
  busqueda: string | URLSearchParams | null | undefined,
  porDefecto: DestinoAlEntrar,
): string | null {
  if (haySiguiente(busqueda)) return siguienteDeBusqueda(busqueda, "/");
  if (porDefecto === undefined) return "/";
  return porDefecto;
}
