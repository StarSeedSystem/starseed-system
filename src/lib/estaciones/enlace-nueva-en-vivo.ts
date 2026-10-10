/**
 * enlace-nueva-en-vivo — el enlace que abre «Nueva estación» del OS ya con una entonación o una
 * espiral puesta (2026-10-10). Lo usan el widget y la versión integrada de Omnifrecuencias (y su
 * gemelo `enlaceParaAbrirFuera` del paquete para la app oficial). Puro.
 * SOP: architecture/estaciones-en-vivo-parametricas.md §6.
 *
 * Forma: `/estaciones?nueva=<fuente>#p=<JSON en base64url>&t=<título>&e=<enlace>`. Todo lo pesado va en
 * el FRAGMENTO, que el navegador no manda a ningún servidor. `FuenteEnVivo` lo lee al abrirse.
 */

import { textoABase64Url } from "./cripto-estacion";
import type { FuenteTransmision } from "./transmision-parametrica";

export interface DatosEnlaceNueva {
  titulo?: string;
  enlace?: string;
  /** Lo que se pegaría en «Pegar JSON de la app»: osciladores de la app, entonación o parámetros visuales. */
  parametros: unknown;
}

export function enlaceNuevaEnVivo(fuente: FuenteTransmision, d: DatosEnlaceNueva, base = ""): string {
  const frag = new URLSearchParams();
  frag.set("p", textoABase64Url(JSON.stringify(d.parametros ?? null)));
  if (d.titulo) frag.set("t", d.titulo.slice(0, 100));
  if (d.enlace) frag.set("e", d.enlace.slice(0, 500));
  return `${base.replace(/\/$/, "")}/estaciones?nueva=${fuente}#${frag.toString()}`;
}
