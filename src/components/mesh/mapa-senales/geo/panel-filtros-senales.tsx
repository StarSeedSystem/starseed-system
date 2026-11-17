"use client";

import { useMemo, useCallback } from "react";
import { X, Filter, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { LISTA_BANDAS } from "@/lib/senales/espectro/bandas";
import type { FiltroEspectro } from "@/lib/senales/espectro/filtros";

type UnidadFrecuencia = "kHz" | "MHz" | "GHz";
type UnidadAncho = "kHz" | "MHz";

const CAPAS = [
  { id: "propia", etiqueta: "Propia" },
  { id: "publica", etiqueta: "Pública" },
  { id: "comunidad", etiqueta: "Comunidad" },
  { id: "privada", etiqueta: "Privada" },
  { id: "externa", etiqueta: "Externa" },
] as const;

const MEDIOS = [
  { id: "wifi", etiqueta: "Wi-Fi" },
  { id: "bluetooth", etiqueta: "Bluetooth" },
  { id: "lora", etiqueta: "LoRa" },
  { id: "celular", etiqueta: "Celular" },
  { id: "malla", etiqueta: "Malla" },
  { id: "internet", etiqueta: "Internet" },
  { id: "estacion", etiqueta: "Estación" },
  { id: "sdr", etiqueta: "SDR" },
] as const;

const ORIGENES = [
  { id: "medida", etiqueta: "Medida" },
  { id: "declarada", etiqueta: "Declarada" },
  { id: "estimada", etiqueta: "Estimada" },
] as const;

const BANDAS_ATAJO = LISTA_BANDAS.filter((b) =>
  ["wifi-2.4", "wifi-5", "lora-868", "lora-433", "lora-915", "ble-2.4", "wifi-6", "lora-2.4"].includes(b.id)
);

function aKhz(valor: number, unidad: UnidadFrecuencia): number {
  if (unidad === "kHz") return valor;
  if (unidad === "MHz") return Math.round(valor * 1000);
  return Math.round(valor * 1000000);
}

function aKhzAncho(valor: number, unidad: UnidadAncho): number {
  if (unidad === "kHz") return valor;
  return Math.round(valor * 1000);
}

function formatearKhz(khz: number): { valor: number; unidad: UnidadFrecuencia } {
  if (khz >= 1000000) return { valor: khz / 1000000, unidad: "GHz" };
  if (khz >= 1000) return { valor: khz / 1000, unidad: "MHz" };
  return { valor: khz, unidad: "kHz" };
}

function formatearKhzAncho(khz: number): { valor: number; unidad: UnidadAncho } {
  if (khz >= 1000) return { valor: khz / 1000, unidad: "MHz" };
  return { valor: khz, unidad: "kHz" };
}

export interface PanelFiltrosSenalesProps {
  filtro: FiltroEspectro;
  onCambiar: (f: FiltroEspectro) => void;
  visibles: number;
  ocultasSinDato: number;
}

export function PanelFiltrosSenales({ filtro, onCambiar, visibles, ocultasSinDato }: PanelFiltrosSenalesProps) {
  const total = visibles + ocultasSinDato;

  const frecuenciaDesdeKhz = filtro.frecuenciaKhz?.desde;
  const frecuenciaHastaKhz = filtro.frecuenciaKhz?.hasta;
  const anchoDesdeKhz = filtro.anchoKhz?.desde;
  const anchoHastaKhz = filtro.anchoKhz?.hasta;

  const { valor: freqDesdeValor, unidad: freqDesdeUnidad } = useMemo(
    () => (frecuenciaDesdeKhz ? formatearKhz(frecuenciaDesdeKhz) : { valor: 0, unidad: "MHz" as UnidadFrecuencia }),
    [frecuenciaDesdeKhz]
  );
  const { valor: freqHastaValor, unidad: freqHastaUnidad } = useMemo(
    () => (frecuenciaHastaKhz ? formatearKhz(frecuenciaHastaKhz) : { valor: 0, unidad: "MHz" as UnidadFrecuencia }),
    [frecuenciaHastaKhz]
  );
  const { valor: anchoDesdeValor, unidad: anchoDesdeUnidad } = useMemo(
    () => (anchoDesdeKhz ? formatearKhzAncho(anchoDesdeKhz) : { valor: 0, unidad: "kHz" as UnidadAncho }),
    [anchoDesdeKhz]
  );
  const { valor: anchoHastaValor, unidad: anchoHastaUnidad } = useMemo(
    () => (anchoHastaKhz ? formatearKhzAncho(anchoHastaKhz) : { valor: 0, unidad: "kHz" as UnidadAncho }),
    [anchoHastaKhz]
  );

  const emitir = useCallback(
    (parcial: Partial<FiltroEspectro>) => {
      onCambiar({ ...filtro, ...parcial });
    },
    [filtro, onCambiar]
  );

  const limpiar = useCallback(() => {
    onCambiar({});
  }, [onCambiar]);

  const manejarAtajoBanda = useCallback(
    (banda: typeof LISTA_BANDAS[0]) => {
      emitir({ frecuenciaKhz: { desde: banda.inicioKhz, hasta: banda.finKhz } });
    },
    [emitir]
  );

  const manejarFrecuenciaDesde = useCallback(
    (valor: string, unidad: UnidadFrecuencia) => {
      const num = Number(valor.replace(",", "."));
      if (Number.isFinite(num) && num >= 0) {
        emitir({ frecuenciaKhz: { ...filtro.frecuenciaKhz, desde: aKhz(num, unidad) } });
      }
    },
    [emitir, filtro.frecuenciaKhz]
  );

  const manejarFrecuenciaHasta = useCallback(
    (valor: string, unidad: UnidadFrecuencia) => {
      const num = Number(valor.replace(",", "."));
      if (Number.isFinite(num) && num >= 0) {
        emitir({ frecuenciaKhz: { ...filtro.frecuenciaKhz, hasta: aKhz(num, unidad) } });
      }
    },
    [emitir, filtro.frecuenciaKhz]
  );

  const manejarAnchoDesde = useCallback(
    (valor: string, unidad: UnidadAncho) => {
      const num = Number(valor.replace(",", "."));
      if (Number.isFinite(num) && num >= 0) {
        emitir({ anchoKhz: { ...filtro.anchoKhz, desde: aKhzAncho(num, unidad) } });
      }
    },
    [emitir, filtro.anchoKhz]
  );

  const manejarAnchoHasta = useCallback(
    (valor: string, unidad: UnidadAncho) => {
      const num = Number(valor.replace(",", "."));
      if (Number.isFinite(num) && num >= 0) {
        emitir({ anchoKhz: { ...filtro.anchoKhz, hasta: aKhzAncho(num, unidad) } });
      }
    },
    [emitir, filtro.anchoKhz]
  );

  const manejarUnidadFrecuenciaDesde = useCallback(
    (unidad: UnidadFrecuencia) => {
      if (frecuenciaDesdeKhz) {
        const { valor } = formatearKhz(frecuenciaDesdeKhz);
        emitir({ frecuenciaKhz: { ...filtro.frecuenciaKhz, desde: aKhz(valor, unidad) } });
      }
    },
    [emitir, filtro.frecuenciaKhz, frecuenciaDesdeKhz]
  );

  const manejarUnidadFrecuenciaHasta = useCallback(
    (unidad: UnidadFrecuencia) => {
      if (frecuenciaHastaKhz) {
        const { valor } = formatearKhz(frecuenciaHastaKhz);
        emitir({ frecuenciaKhz: { ...filtro.frecuenciaKhz, hasta: aKhz(valor, unidad) } });
      }
    },
    [emitir, filtro.frecuenciaKhz, frecuenciaHastaKhz]
  );

  const manejarUnidadAnchoDesde = useCallback(
    (unidad: UnidadAncho) => {
      if (anchoDesdeKhz) {
        const { valor } = formatearKhzAncho(anchoDesdeKhz);
        emitir({ anchoKhz: { ...filtro.anchoKhz, desde: aKhzAncho(valor, unidad) } });
      }
    },
    [emitir, filtro.anchoKhz, anchoDesdeKhz]
  );

  const manejarUnidadAnchoHasta = useCallback(
    (unidad: UnidadAncho) => {
      if (anchoHastaKhz) {
        const { valor } = formatearKhzAncho(anchoHastaKhz);
        emitir({ anchoKhz: { ...filtro.anchoKhz, hasta: aKhzAncho(valor, unidad) } });
      }
    },
    [emitir, filtro.anchoKhz, anchoHastaKhz]
  );

  const toggleArray = useCallback(
    (arr: string[] | undefined, item: string) => {
      const actual = arr ?? [];
      const nuevo = actual.includes(item) ? actual.filter((x) => x !== item) : [...actual, item];
      return nuevo.length > 0 ? nuevo : undefined;
    },
    []
  );

  return (
    <div
      data-testid="panel-filtros-senales"
      className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-white"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/70">
          <SlidersHorizontal className="h-3 w-3" aria-hidden />
          Filtros de señales
        </h3>
        <div className="flex items-center gap-1.5 text-[10px] text-white/60">
          <span>{visibles} de {total} señales</span>
          {ocultasSinDato > 0 && (
            <span className="text-amber-300" data-testid="aviso-sin-dato">
              {ocultasSinDato} sin dato de frecuencia (no se pueden filtrar)
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <section aria-labelledby="filtro-frecuencia">
          <h4 id="filtro-frecuencia" className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Frecuencia
          </h4>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Atajos de banda">
            {BANDAS_ATAJO.map((banda) => (
              <Button
                key={banda.id}
                type="button"
                variant="outline"
                size="sm"
                className="cursor-pointer min-h-9 px-2.5 text-[10px] hover:bg-white/10"
                onClick={() => manejarAtajoBanda(banda)}
                aria-label={`Filtrar por ${banda.etiqueta}`}
              >
                {banda.etiqueta}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="freq-desde" className="sr-only">
              Frecuencia desde
            </label>
            <Input
              id="freq-desde"
              type="number"
              step="any"
              min="0"
              placeholder="Desde"
              value={freqDesdeValor || ""}
              onChange={(e) => manejarFrecuenciaDesde(e.target.value, freqDesdeUnidad)}
              className="w-20 text-[11px]"
              aria-label="Frecuencia desde"
            />
            <Select
              value={freqDesdeUnidad}
              onValueChange={(v) => manejarUnidadFrecuenciaDesde(v as UnidadFrecuencia)}
              aria-label="Unidad frecuencia desde"
            >
              <SelectTrigger className="w-24 h-8 text-[11px]" aria-label="Unidad frecuencia desde">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kHz">kHz</SelectItem>
                <SelectItem value="MHz">MHz</SelectItem>
                <SelectItem value="GHz">GHz</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-white/40 text-[11px]">–</span>
            <label htmlFor="freq-hasta" className="sr-only">
              Frecuencia hasta
            </label>
            <Input
              id="freq-hasta"
              type="number"
              step="any"
              min="0"
              placeholder="Hasta"
              value={freqHastaValor || ""}
              onChange={(e) => manejarFrecuenciaHasta(e.target.value, freqHastaUnidad)}
              className="w-20 text-[11px]"
              aria-label="Frecuencia hasta"
            />
            <Select
              value={freqHastaUnidad}
              onValueChange={(v) => manejarUnidadFrecuenciaHasta(v as UnidadFrecuencia)}
              aria-label="Unidad frecuencia hasta"
            >
              <SelectTrigger className="w-24 h-8 text-[11px]" aria-label="Unidad frecuencia hasta">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kHz">kHz</SelectItem>
                <SelectItem value="MHz">MHz</SelectItem>
                <SelectItem value="GHz">GHz</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        <section aria-labelledby="filtro-ancho">
          <h4 id="filtro-ancho" className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Ancho de banda
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="ancho-desde" className="sr-only">
              Ancho desde
            </label>
            <Input
              id="ancho-desde"
              type="number"
              step="any"
              min="0"
              placeholder="Desde"
              value={anchoDesdeValor || ""}
              onChange={(e) => manejarAnchoDesde(e.target.value, anchoDesdeUnidad)}
              className="w-20 text-[11px]"
              aria-label="Ancho desde"
            />
            <Select
              value={anchoDesdeUnidad}
              onValueChange={(v) => manejarUnidadAnchoDesde(v as UnidadAncho)}
              aria-label="Unidad ancho desde"
            >
              <SelectTrigger className="w-24 h-8 text-[11px]" aria-label="Unidad ancho desde">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kHz">kHz</SelectItem>
                <SelectItem value="MHz">MHz</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-white/40 text-[11px]">–</span>
            <label htmlFor="ancho-hasta" className="sr-only">
              Ancho hasta
            </label>
            <Input
              id="ancho-hasta"
              type="number"
              step="any"
              min="0"
              placeholder="Hasta"
              value={anchoHastaValor || ""}
              onChange={(e) => manejarAnchoHasta(e.target.value, anchoHastaUnidad)}
              className="w-20 text-[11px]"
              aria-label="Ancho hasta"
            />
            <Select
              value={anchoHastaUnidad}
              onValueChange={(v) => manejarUnidadAnchoHasta(v as UnidadAncho)}
              aria-label="Unidad ancho hasta"
            >
              <SelectTrigger className="w-24 h-8 text-[11px]" aria-label="Unidad ancho hasta">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kHz">kHz</SelectItem>
                <SelectItem value="MHz">MHz</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        <section aria-labelledby="filtro-capas">
          <h4 id="filtro-capas" className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Capas
          </h4>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Capas de red">
            {CAPAS.map((capa) => (
              <label
                key={capa.id}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5 text-[11px] hover:border-white/20 transition-colors"
              >
                <Switch
                  checked={filtro.capas?.includes(capa.id) ?? false}
                  onCheckedChange={() => emitir({ capas: toggleArray(filtro.capas, capa.id) })}
                  aria-label={`Capa ${capa.etiqueta}`}
                  className="min-h-9"
                />
                <span>{capa.etiqueta}</span>
              </label>
            ))}
          </div>
        </section>

        <section aria-labelledby="filtro-medios">
          <h4 id="filtro-medios" className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Medios
          </h4>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Medios de señal">
            {MEDIOS.map((medio) => (
              <label
                key={medio.id}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5 text-[11px] hover:border-white/20 transition-colors"
              >
                <Switch
                  checked={filtro.medios?.includes(medio.id as any) ?? false}
                  onCheckedChange={() => emitir({ medios: toggleArray(filtro.medios, medio.id) })}
                  aria-label={`Medio ${medio.etiqueta}`}
                  className="min-h-9"
                />
                <span>{medio.etiqueta}</span>
              </label>
            ))}
          </div>
        </section>

        <section aria-labelledby="filtro-origenes">
          <h4 id="filtro-origenes" className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Origen
          </h4>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Origen del dato">
            {ORIGENES.map((origen) => (
              <label
                key={origen.id}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5 text-[11px] hover:border-white/20 transition-colors"
              >
                <Switch
                  checked={filtro.origenes?.includes(origen.id) ?? false}
                  onCheckedChange={() => emitir({ origenes: toggleArray(filtro.origenes, origen.id) })}
                  aria-label={`Origen ${origen.etiqueta}`}
                  className="min-h-9"
                />
                <span>{origen.etiqueta}</span>
              </label>
            ))}
          </div>
        </section>

        <section aria-labelledby="filtro-compatibles">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5 text-[11px] hover:border-white/20 transition-colors">
            <Switch
              checked={filtro.soloCompatibles ?? false}
              onCheckedChange={(v) => emitir({ soloCompatibles: v })}
              aria-label="Solo compatibles con este aparato"
              className="min-h-9"
            />
            <span>Solo compatibles con este aparato</span>
          </label>
        </section>

        <section aria-labelledby="filtro-texto">
          <h4 id="filtro-texto" className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Buscar
          </h4>
          <div className="relative">
            <Filter className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" aria-hidden />
            <Input
              id="filtro-texto"
              type="search"
              placeholder="Buscar en banda, medio, fuente…"
              value={filtro.texto ?? ""}
              onChange={(e) => emitir({ texto: e.target.value.trim() || undefined })}
              className="pl-8 text-[11px]"
              role="searchbox"
              aria-label="Buscar"
            />
          </div>
        </section>

        <div className="pt-2 border-t border-white/10">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="cursor-pointer w-full min-h-9 text-[11px]"
            onClick={limpiar}
            data-testid="btn-limpiar"
          >
            <X className="h-3.5 w-3.5 mr-1.5" aria-hidden />
            Limpiar filtros
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PanelFiltrosSenales;