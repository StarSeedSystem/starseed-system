/*
 * agrupar-dispositivos — UNA TARJETA POR EQUIPO (Ola 375, RDV16).
 * ---------------------------------------------------------------------------
 * El panel «Dispositivos StarSeed» recibía una fila por INSTALACIÓN (cada
 * navegador/origen de una misma Mac latiendo como neurona aparte), así que un
 * solo equipo salía 4 veces («macOS · Chrome 152», «macOS · Chrome 153»,
 * «Neurona macOS»…). Este módulo PURO agrupa las filas por equipo probable:
 *
 *   misma plataforma + mismo tipo + mismo nombre limpio SIN la versión del
 *   navegador (« · Chrome 152»-like: un «· <Palabra> <número>» al final).
 *
 * Un grupo es ACTIVO si alguna de sus filas está en línea (o es este
 * dispositivo). Los grupos sin ninguna en línea van a `desconectados`,
 * ordenados por el `ultimoVisto` más reciente de sus filas, para plegarlos
 * en el panel en vez de mezclarlos con los activos.
 */

import { nombreLimpio } from "@/ai/astraura/mesh/radar-fusion";
import type { DispositivoMallaRow } from "@/lib/network/malla-neuronas";

/** Grupo de instalaciones que probablemente son el mismo equipo. */
export interface Grupo {
  clave: string;
  titulo: string;
  filas: DispositivoMallaRow[];
}

/** Quita el sufijo « · <Navegador> <versión>» que añade cada navegador. */
const SUFIJO_NAVEGADOR = /\s*·\s*[A-Za-zÀ-ÿ]+\s+\d+(?:[.\d]*)?\s*$/;

/** Nombre comparable de una fila: limpio de emoji y sin versión del navegador. */
export function nombreEquipo(nombre: string): string {
  const limpio = nombreLimpio(nombre).replace(SUFIJO_NAVEGADOR, "").trim();
  return limpio.toLowerCase();
}

/**
 * agruparDispositivos — agrupa las filas de la malla por equipo probable.
 * `ahora` se acepta para mantener la firma pedida y futuros criterios que
 * dependan del tiempo; la agrupación actual no lo necesita.
 */
export function agruparDispositivos(
  filas: DispositivoMallaRow[],
  ahora: number = Date.now(),
): { activos: Grupo[]; desconectados: Grupo[] } {
  void ahora;
  const grupos = new Map<string, Grupo>();
  for (const fila of filas) {
    const clave = `${fila.plataforma}|${fila.tipo}|${nombreEquipo(fila.nombre)}`;
    const existente = grupos.get(clave);
    if (existente) {
      existente.filas.push(fila);
    } else {
      grupos.set(clave, { clave, titulo: nombreEquipo(fila.nombre) || "dispositivo", filas: [fila] });
    }
  }
  const activos: Grupo[] = [];
  const desconectados: Grupo[] = [];
  for (const g of grupos.values()) {
    const activo = g.filas.some((f) => f.online || f.esEsteDispositivo);
    if (activo) activos.push(g);
    else desconectados.push(g);
  }
  const vistoMs = (g: Grupo): number =>
    Math.max(0, ...g.filas.map((f) => (f.ultimoVisto ? Date.parse(f.ultimoVisto) || 0 : 0)));
  activos.sort((a, b) =>
    Number(b.filas.some((f) => f.esEsteDispositivo)) - Number(a.filas.some((f) => f.esEsteDispositivo)),
  );
  desconectados.sort((a, b) => vistoMs(b) - vistoMs(a));
  return { activos, desconectados };
}
