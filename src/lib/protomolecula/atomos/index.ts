/**
 * Protomolécula · ÍNDICE DE ÁTOMOS PROPIOS (F1C).
 *
 * Los átomos propios son los que escribe el OS (nuestro documento dentro de un iframe
 * aislado), no los que declara una herramienta de terceros. Este archivo es el punto
 * único donde se listan: `sesion-molecula.ts` llama a `registrarAtomosPropios()` al
 * abrir una sesión, y el panel (F1B) pinta los controles que declara cada átomo.
 *
 * Contrato: architecture/protomolecula.md §11.1
 */
import type { ComponentType } from "react";
import { registrarConvertidoresBase } from "../convertidores-base";
import type { DefinicionAtomo, VistaProps } from "../registro-atomos";
import { obtenerAtomo, registrarAtomo } from "../registro-atomos";
import { SINTETIZADOR } from "./sintetizador";
import { DOBLAJE } from "./doblaje";
import { TEXTURAS } from "./texturas-webgl";
import { ANIMACION_MANIMGX } from "./animacion-manimgx";
import { MAUSBOT } from "./mausbot";
import { ESCENA3D } from "./escena3d";
import { VIDEO_HTML } from "./video-html";
import { FONDO_SHADER } from "./fondo-shader";
import { DIAGRAMA } from "./diagrama";

/** Los átomos que el OS trae de serie. Las tareas siguientes añaden los suyos aquí. */
export const ATOMOS_PROPIOS: DefinicionAtomo[] = [SINTETIZADOR, DOBLAJE, TEXTURAS, ANIMACION_MANIMGX, MAUSBOT, ESCENA3D, VIDEO_HTML, FONDO_SHADER, DIAGRAMA];

/**
 * Registra los átomos propios que falten en el registro. Es idempotente: llamarla dos
 * veces no duplica nada, y un átomo que otra sesión ya registró no se vuelve a registrar.
 */
export function registrarAtomosPropios(): void {
  registrarConvertidoresBase();
  for (const def of ATOMOS_PROPIOS) {
    if (obtenerAtomo(def.herramientaId)) continue;
    registrarAtomo(def);
  }
}

/**
 * Vistas que se pintan como componente de React en vez de como documento. La clave es el
 * `id` de `VistaAtomo = {tipo:"componente"; id}`. El import dinámico es de código NUESTRO
 * (three ya vive en el bundle) y `marco-aislado.tsx` lo carga de forma perezosa con `lazy`.
 */
export const VISTAS_COMPONENTE: Record<string, () => Promise<{ default: ComponentType<VistaProps> }>> = {
  escena3d: () => import("@/components/protomolecula/atomo-escena3d"),
  "fondo-shader": () => import("@/components/protomolecula/atomo-fondo-shader"),
};
