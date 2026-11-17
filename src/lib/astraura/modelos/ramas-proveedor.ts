// Ramas por proveedor de la Biblioteca de modelos (MQC3 · MOD1116).
// Puro: sin red, sin disco ni reloj; el perfil llega ya medido. Orden estable y sin mutar entradas.

import { puntuacionDeBase } from "./catalogo";
import { modeloApiValido, type ModeloApi } from "./modelos-api";
import type { PerfilNeurona } from "./perfil-neurona";
import { encajar, type Encaje } from "./recomendar";
import type { ModeloLocal } from "./tipos";
export interface FilaModelo {
  id: string;
  etiqueta: string;
  eci: number | null;
  descargaGb: number | null;
  contextoK: number | null;
  encaje: Encaje | null;
  modelo: ModeloLocal | ModeloApi;
}
export interface Rama {
  proveedor: string;
  etiqueta: string;
  tipo: "local" | "api";
  modelos: FilaModelo[];
  mejorQueCabe: FilaModelo | null;
  masLigero: FilaModelo | null;
  aviso: string | null;
}
export const AVISO_CPU = "Un modelo por API es mejor punto de partida: aquí corre en CPU y es lento.";
const ETIQUETAS: Record<string, string> = {
  astraura: "Capas de Astraura",
  ollama: "Ollama",
  huihui_ai: "huihui_ai (comunidad de Ollama)",
};
const SIN_GPU = (p: PerfilNeurona): boolean => p.chip === "cpu" || p.chip === "android-soc";
const TAMANO = (f: FilaModelo): number => f.descargaGb ?? f.contextoK ?? Number.POSITIVE_INFINITY;
const CABE = (f: FilaModelo): boolean => f.encaje?.veredicto === "recomendado" || f.encaje?.veredicto === "justo";
function proveedorLocal(m: ModeloLocal): string {
  if (m.tipo !== "estandar") return "astraura";
  if (m.clase === "abliterated") return m.id.includes("/") ? m.id.split("/")[0] : "huihui_ai";
  return "ollama";
}
function compararCapacidad(a: FilaModelo, b: FilaModelo): number {
  if (a.eci !== null && b.eci !== null && a.eci !== b.eci) return b.eci - a.eci;
  if (a.eci !== null && b.eci === null) return -1;
  if (a.eci === null && b.eci !== null) return 1;
  const tam = TAMANO(b) - TAMANO(a);
  if (tam !== 0) return tam;
  const ctx = (b.contextoK ?? -1) - (a.contextoK ?? -1);
  return ctx !== 0 ? ctx : a.id.localeCompare(b.id);
}
function elMasLigero(filas: readonly FilaModelo[]): FilaModelo | null {
  return filas.reduce<FilaModelo | null>((mejor, f) => (mejor === null || TAMANO(f) < TAMANO(mejor) ? f : mejor), null);
}
function filaLocal(m: ModeloLocal, p: PerfilNeurona, catalogo: readonly ModeloLocal[]): FilaModelo {
  return {
    id: m.id,
    etiqueta: m.etiqueta,
    eci: m.puntuacion?.eci ?? puntuacionDeBase(m, catalogo)?.eci ?? null,
    descargaGb: m.descargaGb,
    contextoK: m.contextoK,
    encaje: encajar(m, p),
    modelo: m,
  };
}

function armaRama(proveedor: string, tipo: Rama["tipo"], filas: FilaModelo[], p: PerfilNeurona): Rama {
  const modelos = [...filas].sort(compararCapacidad);
  const caben = tipo === "local" ? modelos.filter(CABE) : modelos;
  const masLigero = elMasLigero(caben);
  // Sin GPU no se sube a un modelo que solo cabe justo: se queda con el más capaz holgado
  // (o, si ninguno lo está, con el más ligero). Con GPU vale también el que cabe justo.
  const mejor = tipo === "api"
    ? (modelos[0] ?? null)
    : SIN_GPU(p)
      ? (caben.find((f) => f.encaje?.veredicto === "recomendado") ?? masLigero)
      : (caben[0] ?? null);
  return {
    proveedor,
    etiqueta: ETIQUETAS[proveedor] ?? proveedor,
    tipo,
    modelos,
    mejorQueCabe: mejor,
    masLigero,
    aviso: tipo === "local" && SIN_GPU(p) ? AVISO_CPU : null,
  };
}

export function ramasPorProveedor(
  catalogo: readonly ModeloLocal[],
  apis: readonly ModeloApi[],
  perfil: PerfilNeurona,
  sinFiltrosPermitido = false,
): Rama[] {
  const locales = new Map<string, FilaModelo[]>();
  for (const m of catalogo) {
    const proveedor = proveedorLocal(m);
    const filas = locales.get(proveedor) ?? [];
    filas.push(filaLocal(m, perfil, catalogo));
    locales.set(proveedor, filas);
  }
  const ramasLocal = [...locales.entries()]
    .map(([proveedor, filas]) => armaRama(proveedor, "local", filas, perfil))
    .sort((a, b) => a.proveedor.localeCompare(b.proveedor));

  const deApi = new Map<string, FilaModelo[]>();
  for (const m of apis) {
    if (!modeloApiValido(m) || (m.sinFiltros && !sinFiltrosPermitido)) continue;
    const filas = deApi.get(m.proveedor) ?? [];
    filas.push({ id: m.id, etiqueta: m.id, eci: null, descargaGb: null, contextoK: m.contextoK, encaje: null, modelo: m });
    deApi.set(m.proveedor, filas);
  }
  const ramasApi = [...deApi.entries()]
    .map(([proveedor, filas]) => armaRama(proveedor, "api", filas, perfil))
    .sort((a, b) => a.proveedor.localeCompare(b.proveedor));

  // Si nada local cabe por hardware (memoria por debajo del mínimo de todos), solo queda la API.
  const hayLocal = ramasLocal.some((r) =>
    r.modelos.some((f) => f.encaje !== null && f.encaje.veredictoHw !== "no-cabe"),
  );
  return hayLocal ? [...ramasLocal, ...ramasApi] : ramasApi;
}
