/**
 * modelo — de la lista de señales y la vista en vivo al modelo ÚNICO que dibujan el mapa 3D, el
 * radar plano y el mini radar. Puro: lo mismo entra, lo mismo sale (`ahora` es un parámetro).
 * Así lo que se ve en una vista no puede discrepar de la otra.
 */

import type { DetectedSignal } from "@/ai/astraura/mesh/signals";
import { anillosDeAlcance } from "./escalas";
import {
  antenasPropias, construirMarcadores, construirMedios, filtrarSenales, resumenMapa, resumenVivo, sectoresDelSuelo,
  type AntenaPropia, type FiltrosMapa, type MarcadorEscena, type MedioEscena, type ModoAltura, type ResumenMapa,
  type ResumenVivo, type SectorEscena,
} from "./mapa-3d";
import type { AnilloAlcance, VivoMapa } from "./tipos-vivo";

export interface EntradaModelo {
  /** Todas las señales (con aparatos cruzados, ajenas anónimas y BLE/Wi-Fi en su escala). */
  senales: readonly DetectedSignal[];
  vivo: VivoMapa | null;
  filtros: FiltrosMapa;
  altura: ModoAltura;
  ahora: number;
  /** Fuentes de las antenas propias de esta neurona (`detectSignals`). */
  fuentesAntenas?: Parameters<typeof antenasPropias>[0];
  /** Foto del perfil activo (ya validada): la llevan las marcas de tus propios aparatos. */
  avatarPropio?: string | null;
}

export interface ModeloMapa {
  visibles: DetectedSignal[];
  marcadores: MarcadorEscena[];
  medios: MedioEscena[];
  sectores: SectorEscena[];
  anillos: AnilloAlcance[];
  antenas: AntenaPropia[];
  /** Resumen de TODAS las señales (los recuentos de los filtros no cambian al filtrar). */
  resumen: ResumenMapa;
  resumenVisible: ResumenMapa;
  vivoVisible: ResumenVivo;
}

export function construirModeloMapa(e: EntradaModelo): ModeloMapa {
  const visibles = filtrarSenales(e.senales, e.filtros, e.vivo);
  const marcadores = construirMarcadores(visibles, e.altura, e.ahora, e.vivo, e.avatarPropio ?? null);
  return {
    visibles,
    marcadores,
    medios: e.vivo ? construirMedios(e.vivo.medios, marcadores) : [],
    sectores: sectoresDelSuelo(visibles),
    anillos: anillosDeAlcance(visibles),
    antenas: antenasPropias(e.fuentesAntenas ?? []),
    resumen: resumenMapa(e.senales),
    resumenVisible: resumenMapa(visibles),
    vivoVisible: resumenVivo(visibles, e.vivo),
  };
}
