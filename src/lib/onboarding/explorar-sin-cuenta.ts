/**
 * «Explorar sin cuenta» — una sola manera de hacerlo.
 * ═══════════════════════════════════════════════════════════════════════════
 * (Ola 1025T · ACC1025A/B) La ventana de acceso (en la ventana flotante y en las páginas `/login` y
 * `/bienvenida`) y la puerta de sesión tienen un «Explorar sin cuenta». En todas hace lo mismo que hacía
 * el de la ventana guiada: deja la marca «saltada» en este dispositivo (la bienvenida ya no se abre sola) y
 * lleva a los escritorios, que se usan sin cuenta. NO abre una sesión anónima: ese camino (`AuthGate`) se
 * retiró con la ventana única y el invitado sigue sin sesión, como en la ventana guiada de siempre.
 *
 * Quien ya está en los escritorios no se mueve (`navegarSuave` no navega a la ruta en la que ya está).
 */

import { navegarSuave } from "./director-rito";
import { CLAVE_INTRO_SALTADA, ponerMarca } from "./primer-arranque";

export const RUTA_EXPLORAR = "/escritorios";

export function explorarSinCuenta(router: { push: (ruta: string) => void }): void {
    ponerMarca(CLAVE_INTRO_SALTADA);
    navegarSuave(router, RUTA_EXPLORAR);
}
