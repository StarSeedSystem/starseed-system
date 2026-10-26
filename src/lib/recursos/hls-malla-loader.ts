// Cargador HLS inyectado por la malla (architecture/apps-en-la-malla.md §10, tarea T · Ola 1017A)
// Puro: sin node:*, sin APIs concretas; red, reloj, disponibilidad y límites de subida inyectados.

import type { Loader, LoaderCallbacks, LoaderConfiguration, LoaderContext, LoaderResponse, FragmentLoaderContext, LoaderStats } from "hls.js";
import type { RegistroDisponibilidad } from "./disponibilidad";

export interface FuenteMalla {
  consultarDisponibilidad(elemento: string, indice: number): string[];
  pedirSegmento(elemento: string, indice: number, url: string, timeoutMs: number): Promise<ArrayBuffer>;
  pedirOrigen(url: string, timeoutMs: number): Promise<ArrayBuffer>;
  anunciarTransmisor(elemento: string, indice: number): void;
}

export interface RelojMalla {
  ahoraMs(): number;
}

export interface TopeSubida {
  bytesPorSegundo(): number;
}

export interface ConfigMallaLoader {
  fuente: FuenteMalla;
  reloj: RelojMalla;
  topeSubida: TopeSubida;
  contextoPublicoODeCuenta: boolean;
  elemento: string;
}

function extraerIndiceSegmento(url: string): number {
  const nombre = url.split("/").pop() ?? "";
  const match = nombre.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export class HlsMallaLoader implements Loader<FragmentLoaderContext> {
  public context: FragmentLoaderContext | null = null;
  public stats: LoaderStats = { aborted: false, loaded: 0, retry: 0, total: 0, chunkCount: 0, bwEstimate: 0, loading: { start: 0, first: 0, end: 0 }, parsing: { start: 0, first: 0, end: 0 }, buffering: { start: 0, first: 0, end: 0 } };

  constructor(private config: HlsConfig & { configMalla?: ConfigMallaLoader }) {}

  destroy(): void { this.context = null; }
  abort(): void { this.stats.aborted = true; }

  load(context: FragmentLoaderContext, loaderConfig: LoaderConfiguration, callbacks: LoaderCallbacks<FragmentLoaderContext>): void {
    const cfg = this.config.configMalla;
    if (!cfg || !cfg.contextoPublicoODeCuenta) {
      this.cargarOrigen(context, loaderConfig, callbacks, cfg);
      return;
    }
    const indice = extraerIndiceSegmento(context.url);
    const vecinos = cfg.fuente.consultarDisponibilidad(cfg.elemento, indice);
    const duracionMs = context.frag?.duration ? Math.round(context.frag.duration * 1000 / 2) : 300;
    const timeoutMs = Math.min(300, duracionMs);
    if (vecinos.length === 0) {
      this.cargarOrigen(context, loaderConfig, callbacks, cfg);
      return;
    }
    const nodo = vecinos[0];
    cfg.fuente.pedirSegmento(cfg.elemento, indice, context.url, timeoutMs)
      .then((datos) => {
        cfg.fuente.anunciarTransmisor(cfg.elemento, indice);
        callbacks.onSuccess({ url: context.url, data: datos, code: 200, text: "OK" }, this.stats, context, undefined);
      })
      .catch(() => {
        this.cargarOrigen(context, loaderConfig, callbacks, cfg);
      });
  }

  private cargarOrigen(context: FragmentLoaderContext, loaderConfig: LoaderConfiguration, callbacks: LoaderCallbacks<FragmentLoaderContext>, cfg?: ConfigMallaLoader): void {
    const url = context.url;
    const duracionMs = context.frag?.duration ? Math.round(context.frag.duration * 1000 / 2) : 300;
    const timeoutMs = Math.min(300, duracionMs);
    const peticionOrigen = cfg ? cfg.fuente.pedirOrigen(url, timeoutMs) : fetch(url, { headers: context.headers }).then((res) => res.arrayBuffer());
    peticionOrigen
      .then((datos) => callbacks.onSuccess({ url: context.url, data: datos, code: 200, text: "OK" }, this.stats, context, undefined))
      .catch((err) => callbacks.onError({ code: 0, text: String(err) }, context, undefined, this.stats));
  }
}
