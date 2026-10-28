/**
 * OMNIDOCK · MOVIMIENTO DE LOS ICONOS (Ola 1024D · DAN1024F)
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: traduce cada fase de un icono del dock a `transform`/`transition`
 * con los tokens de `src/lib/design/movimiento.ts` y los registros de
 * `src/lib/design/registros-movimiento.ts` — las ÚNICAS fuentes de duraciones y
 * curvas. Sin red, disco ni reloj.
 */

import { CURVA, cssDe, tokensDe } from "@/lib/design/movimiento";
import {
    movimientoDe,
    type RegistroMovimiento,
    type SeccionMovimiento,
    type TokenTiempo,
} from "@/lib/design/registros-movimiento";

/** Fases de un icono del dock: reposo, hover, pulsación y lanzamiento. */
export type FaseIconoDock = "reposo" | "hover" | "pulsado" | "lanzando";

/** Registro activo (por cuenta, página o grupo) y si el movimiento queda reducido. */
export interface RegistroIconoDock {
    registro: RegistroMovimiento;
    reducido: boolean;
}

/** Estilo resultante para el icono: solo `transform` y `transition`. */
export interface EstiloIconoDock {
    transform: string;
    transition: string;
}

/** El OmniDock es el Anchor Trinity (estabilidad, acceso raíz): registro sobrio. */
export const REGISTRO_DOCK: RegistroMovimiento = "sobrio";

/** El dock se mueve con la sección Trinity del ADN de movimiento. */
const SECCION_DOCK: SeccionMovimiento = "trinity";

/** `cssDe` espera `duracionMs`: el registro habla en `ms`. */
const cssDeToken = (t: TokenTiempo): string => cssDe({ duracionMs: t.ms, curva: t.curva });

/**
 * El estilo de un icono del dock en cada fase. Hover sube 4 px y escala 1,08;
 * pulsado encoge a 0,96; lanzando vuelve con un rebote único y corto (la
 * curva elástica del OS sobre la pulsación mínima). Con movimiento reducido no
 * hay transform: el estado final se pinta quieto.
 */
export function estiloIcono(fase: FaseIconoDock, registro: RegistroIconoDock): EstiloIconoDock {
    if (registro.reducido) return { transform: "none", transition: "none" };
    const movimiento = movimientoDe(registro.registro, SECCION_DOCK);
    // La pulsación y el lanzamiento viven en tokensDe («press»): respuesta de
    // 90 ms con la curva de entrada. El hover y el reposo adoptan el carácter
    // del registro: su entrada para ir hacia, su salida (más corta) para volver.
    switch (fase) {
        case "reposo":
            return { transform: "none", transition: cssDeToken(movimiento.salida) };
        case "hover":
            return { transform: "translateY(-4px) scale(1.08)", transition: cssDeToken(movimiento.entrada) };
        case "pulsado":
            return { transform: "scale(0.96)", transition: cssDe(tokensDe("press", false)) };
        case "lanzando":
            return {
                transform: "none",
                transition: `${tokensDe("press", false).duracionMs}ms ${CURVA.elastico}`,
            };
    }
}
