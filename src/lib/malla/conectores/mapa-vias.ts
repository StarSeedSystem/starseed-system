/**
 * mapa-vias — cruza la tabla estática del contrato con los medios vivos (MED1108B · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Puro: `construirMapaVias(tabla, vias, enInternet)` devuelve, por sistema, si funciona AHORA, por qué
 * medio y qué falta. Solo lectura. Nada se supone: un medio cuenta si está abierto y lleva la clase de
 * envío del sistema; sin internet solo cuentan los que funcionan sin él.
 */

import type { ViaViva } from "./tipos";
import { SISTEMAS_VIAS, type SistemaVias } from "./mapa-vias-datos";

export type EstadoAhora = "funciona" | "parcial" | "no";

export interface FilaMapaVias {
  sistema: SistemaVias;
  ahora: EstadoAhora;
  /** Etiquetas de los medios por los que funciona ahora. */
  medios: string[];
  /** Frase para la persona. */
  resumen: string;
  /** Qué falta (de la tabla) más, si procede, qué medio abrir. */
  falta: string[];
}

function etiquetaMedio(v: ViaViva): string {
  const cif = v.enlace.cifrado === "cifrado" ? " · cifrado" : v.enlace.cifrado === "sin-cifrar" ? " · sin cifrar" : "";
  return `${v.enlace.etiqueta}${cif}`;
}

export function construirMapaVias(
  vias: ViaViva[],
  enInternet: boolean,
  tabla: SistemaVias[] = SISTEMAS_VIAS,
): FilaMapaVias[] {
  return tabla.map((s) => {
    const abiertos = vias.filter((v) => v.enlace.abierto && v.enlace.admite[s.clase]);
    const sinNube = abiertos.filter((v) => v.enlace.sinInternet);
    const conNube = abiertos.filter((v) => !v.enlace.sinInternet);
    const falta = [...s.falta];
    let ahora: EstadoAhora;
    let medios: string[];
    let resumen: string;

    if (s.sinInternet === "no") {
      // Depende del servidor: solo funciona mientras haya internet.
      if (enInternet && s.usaServidor) {
        ahora = "funciona";
        medios = ["Internet (servidor)"];
        resumen = "Funciona porque hay internet; sin él, no.";
      } else {
        ahora = "no";
        medios = [];
        resumen = "Sin internet no funciona: depende del servidor.";
      }
    } else if (sinNube.length > 0) {
      ahora = s.sinInternet === "si" ? "funciona" : "parcial";
      medios = sinNube.map(etiquetaMedio);
      resumen = s.sinInternet === "si" ? "Funciona ahora sin internet." : "Funciona a medias sin internet.";
    } else if (enInternet && (conNube.length > 0 || s.usaServidor)) {
      ahora = "funciona";
      medios = conNube.length ? conNube.map(etiquetaMedio) : ["Internet (servidor)"];
      resumen = "Funciona por internet; aún no hay ningún medio abierto sin internet.";
      falta.unshift("Abrir un medio sin internet (Bluetooth, red local o Wi‑Fi directo) con otra neurona");
    } else {
      ahora = "no";
      medios = [];
      resumen = "Ahora no hay ningún medio abierto que lo lleve.";
      falta.unshift("Acercar otra neurona y abrir Bluetooth, red local o Wi‑Fi directo");
    }
    return { sistema: s, ahora, medios, resumen, falta };
  });
}
