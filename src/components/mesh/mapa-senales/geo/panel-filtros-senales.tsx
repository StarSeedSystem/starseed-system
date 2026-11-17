"use client";

/**
 * PanelFiltrosSenales — Panel de filtros de señales por frecuencia, ancho, capa, medio, origen y texto (MAP1116B).
 * Rangos de frecuencia con atajos por banda, entrada manual con unidad, casillas de capa/medio/origen,
 * "solo compatibles", buscador y "Limpiar". Muestra "N de M señales" y aviso de sin dato.
 * Puro cliente: sin red, sin `node:*`.
 */

import { useState, useEffect } from "react";
import { Filter, SlidersHorizontal, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RangoFrecuencia, RangoAncho } from "./panel-filtros-senales-rangos";
import { GrupoCasillas, AtajosBandas } from "./panel-filtros-senales-grupos";
import type { FiltroSenales, PanelFiltrosSenalesProps } from "./panel-filtros-senales-tipos";
export { type FiltroSenales, type PanelFiltrosSenalesProps } from "./panel-filtros-senales-tipos";
export { CAPAS_RED, ETIQUETA_CAPA, MEDIOS, ETIQUETA_MEDIO, ORIGENES, ETIQUETA_ORIGEN } from "./panel-filtros-senales-tipos";

export function PanelFiltrosSenales({ filtro, onCambiar, visibles, ocultasSinDato }: PanelFiltrosSenalesProps) {
  const [estado, setEstado] = useState<FiltroSenales>(filtro);
  const [unidadFrecuencia, setUnidadFrecuencia] = useState<"kHz" | "MHz" | "GHz">("MHz");
  const [unidadAncho, setUnidadAncho] = useState<"kHz" | "MHz">("MHz");

  useEffect(() => {
    setEstado(filtro);
  }, [filtro]);

  const emitirCambio = (nuevoEstado: FiltroSenales) => {
    setEstado(nuevoEstado);
    onCambiar(nuevoEstado);
  };

  const manejarBanda = (banda: { inicioKhz: number; finKhz: number }) => {
    emitirCambio({ ...estado, frecuencia: { minKhz: banda.inicioKhz, maxKhz: banda.finKhz } });
  };

  const manejarFrecuencia = (minKhz: number | null, maxKhz: number | null) => {
    emitirCambio({ ...estado, frecuencia: { minKhz, maxKhz } });
  };

  const manejarAncho = (minKhz: number | null, maxKhz: number | null) => {
    emitirCambio({ ...estado, ancho: { minKhz, maxKhz } });
  };

  const manejarCapa = (capa: "propia" | "publica" | "comunidad" | "privada" | "externa", checked: boolean) => {
    emitirCambio({ ...estado, capas: checked ? [...estado.capas, capa] : estado.capas.filter((c) => c !== capa) });
  };

  const manejarMedio = (medio: "wifi" | "bluetooth" | "lora" | "celular" | "malla" | "internet" | "estacion" | "sdr", checked: boolean) => {
    emitirCambio({ ...estado, medios: checked ? [...estado.medios, medio] : estado.medios.filter((m) => m !== medio) });
  };

  const manejarOrigen = (origen: "medida" | "declarada" | "estimada", checked: boolean) => {
    emitirCambio({ ...estado, origenes: checked ? [...estado.origenes, origen] : estado.origenes.filter((o) => o !== origen) });
  };

  const manejarSoloCompatibles = (checked: boolean) => {
    emitirCambio({ ...estado, soloCompatibles: checked });
  };

  const manejarTexto = (texto: string) => {
    emitirCambio({ ...estado, texto });
  };

  const manejarLimpiar = () => {
    const vacio: FiltroSenales = {
      frecuencia: { minKhz: null, maxKhz: null },
      ancho: { minKhz: null, maxKhz: null },
      capas: [],
      medios: [],
      origenes: [],
      soloCompatibles: false,
      texto: "",
    };
    emitirCambio(vacio);
  };

  const total = visibles + ocultasSinDato;

  return (
    <section aria-label="Filtros de señales" className="space-y-3" data-testid="panel-filtros-senales">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-white/60" aria-hidden />
          <h2 className="text-[13px] font-semibold text-white/90">Filtros de señales</h2>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-white/60">
          <span className="font-mono tabular-nums text-white/80">{visibles}</span>
          <span>de</span>
          <span className="font-mono tabular-nums text-white/80">{total}</span>
          <span>señales</span>
        </div>
      </div>

      {ocultasSinDato > 0 && (
        <p className="text-[10px] leading-snug text-amber-300" data-testid="aviso-sin-dato">
          {ocultasSinDato} sin dato de frecuencia (no se pueden filtrar)
        </p>
      )}

      <div className="space-y-3">
        <AtajosBandas onSeleccionar={manejarBanda} />

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
          <RangoFrecuencia
            minKhz={estado.frecuencia.minKhz}
            maxKhz={estado.frecuencia.maxKhz}
            onChange={manejarFrecuencia}
            unidad={unidadFrecuencia}
            onUnidadChange={setUnidadFrecuencia}
          />
          <RangoAncho
            minKhz={estado.ancho.minKhz}
            maxKhz={estado.ancho.maxKhz}
            onChange={manejarAncho}
            unidad={unidadAncho}
            onUnidadChange={setUnidadAncho}
          />
        </div>

        <GrupoCasillas
          titulo="Capa de red"
          opciones={["propia", "publica", "comunidad", "privada", "externa"] as const}
          etiquetas={{ propia: "Propia", publica: "Pública", comunidad: "Comunidad", privada: "Privada", externa: "Externa" }}
          seleccionadas={estado.capas}
          onToggle={manejarCapa}
        />

        <GrupoCasillas
          titulo="Medio"
          opciones={["wifi", "bluetooth", "lora", "celular", "malla", "internet", "estacion", "sdr"] as const}
          etiquetas={{ wifi: "Wi-Fi", bluetooth: "Bluetooth", lora: "LoRa", celular: "Celular", malla: "Malla", internet: "Internet", estacion: "Estación", sdr: "SDR" }}
          seleccionadas={estado.medios}
          onToggle={manejarMedio}
        />

        <GrupoCasillas
          titulo="Origen del dato"
          opciones={["medida", "declarada", "estimada"] as const}
          etiquetas={{ medida: "Medida", declarada: "Declarada", estimada: "Estimada" }}
          seleccionadas={estado.origenes}
          onToggle={manejarOrigen}
        />

        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-white/80 hover:bg-white/[0.05]">
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 cursor-pointer rounded border-white/20 bg-white/[0.02] text-primary focus:ring-primary"
            checked={estado.soloCompatibles}
            onChange={(e) => manejarSoloCompatibles(e.target.checked)}
            aria-label="Solo compatibles con este aparato"
          />
          <span>Solo compatibles con este aparato</span>
        </label>

        <div className="relative">
          <label htmlFor="buscar-texto" className="sr-only">Buscar señales</label>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" aria-hidden />
          <Input
            id="buscar-texto"
            type="search"
            placeholder="Buscar…"
            value={estado.texto}
            onChange={(e) => manejarTexto(e.target.value)}
            className="h-10 min-h-11 pl-9 pr-8"
            role="searchbox"
            aria-label="Buscar señales"
          />
          {estado.texto && (
            <button
              type="button"
              onClick={() => manejarTexto("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Button variant="outline" size="sm" onClick={manejarLimpiar} className="min-h-11 w-full" data-testid="btn-limpiar">
          <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" aria-hidden />
          Limpiar
        </Button>
      </div>
    </section>
  );
}