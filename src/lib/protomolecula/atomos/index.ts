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
import type { DefinicionAtomo, VistaProps } from "../registro-atomos";
import { obtenerAtomo, registrarAtomo } from "../registro-atomos";
import { SINTETIZADOR } from "./sintetizador";
import { DOBLAJE } from "./doblaje";

/** Los átomos que el OS trae de serie. Las tareas siguientes (F1E) añaden los suyos aquí. */
export const ATOMOS_PROPIOS: DefinicionAtomo[] = [SINTETIZADOR, DOBLAJE, VIDEO_HTML];

/**
 * Registra los átomos propios que falten en el registro. Es idempotente: llamarla dos
 * veces no duplica nada, y un átomo que otra sesión ya registró no se vuelve a registrar.
 */
export function registrarAtomosPropios(): void {
  for (const def of ATOMOS_PROPIOS) {
    if (obtenerAtomo(def.herramientaId)) continue;
    registrarAtomo(def);
  }
}

/**
 * Vistas que se pintan como componente de React en vez de como documento. La clave es el
 * `id` de `VistaAtomo = {tipo:"componente"; id}`. Vacía por ahora: F1E añade la suya.
 */
export const VISTAS_COMPONENTE: Record<string, () => Promise<{ default: ComponentType<VistaProps> }>> = {};
