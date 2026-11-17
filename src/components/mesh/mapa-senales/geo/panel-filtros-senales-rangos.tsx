"use client";

/**
 * Componentes de rango de frecuencia y ancho (MAP1116B).
 * Puro cliente: sin red, sin `node:*`.
 */

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { UnidadFrecuencia, UnidadAncho } from "./panel-filtros-senales-tipos";
import { khzAValor, valorAKhz, khzAnchoAValor, valorAnchoAKhz, UNIDADES_FRECUENCIA, UNIDADES_ANCHO } from "./panel-filtros-senales-tipos";

export function RangoFrecuencia({
  minKhz,
  maxKhz,
  onChange,
  unidad,
  onUnidadChange,
}: {
  minKhz: number | null;
  maxKhz: number | null;
  onChange: (minKhz: number | null, maxKhz: number | null) => void;
  unidad: UnidadFrecuencia;
  onUnidadChange: (u: UnidadFrecuencia) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[11px] font-medium text-white/60">Frecuencia</label>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label htmlFor="freq-min" className="sr-only">Frecuencia mínima</label>
          <Input
            id="freq-min"
            type="number"
            min="0"
            step="1"
            value={khzAValor(minKhz, unidad)}
            onChange={(e) => onChange(valorAKhz(e.target.value, unidad), maxKhz)}
            placeholder="Mín"
            className="h-10 min-h-11"
            aria-label="Frecuencia mínima"
          />
        </div>
        <span className="text-white/40 text-[11px] shrink-0">–</span>
        <div className="flex-1">
          <label htmlFor="freq-max" className="sr-only">Frecuencia máxima</label>
          <Input
            id="freq-max"
            type="number"
            min="0"
            step="1"
            value={khzAValor(maxKhz, unidad)}
            onChange={(e) => onChange(minKhz, valorAKhz(e.target.value, unidad))}
            placeholder="Máx"
            className="h-10 min-h-11"
            aria-label="Frecuencia máxima"
          />
        </div>
        <Select value={unidad} onValueChange={onUnidadChange as (v: string) => void}>
          <SelectTrigger className="h-10 min-h-11 w-24 shrink-0" aria-label="Unidad de frecuencia">
            <SelectValue placeholder="Unidad" />
          </SelectTrigger>
          <SelectContent>
            {UNIDADES_FRECUENCIA.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function RangoAncho({
  minKhz,
  maxKhz,
  onChange,
  unidad,
  onUnidadChange,
}: {
  minKhz: number | null;
  maxKhz: number | null;
  onChange: (minKhz: number | null, maxKhz: number | null) => void;
  unidad: UnidadAncho;
  onUnidadChange: (u: UnidadAncho) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[11px] font-medium text-white/60">Ancho de banda</label>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label htmlFor="ancho-min" className="sr-only">Ancho mínimo</label>
          <Input
            id="ancho-min"
            type="number"
            min="0"
            step="1"
            value={khzAnchoAValor(minKhz, unidad)}
            onChange={(e) => onChange(valorAnchoAKhz(e.target.value, unidad), maxKhz)}
            placeholder="Mín"
            className="h-10 min-h-11"
            aria-label="Ancho mínimo"
          />
        </div>
        <span className="text-white/40 text-[11px] shrink-0">–</span>
        <div className="flex-1">
          <label htmlFor="ancho-max" className="sr-only">Ancho máximo</label>
          <Input
            id="ancho-max"
            type="number"
            min="0"
            step="1"
            value={khzAnchoAValor(maxKhz, unidad)}
            onChange={(e) => onChange(minKhz, valorAnchoAKhz(e.target.value, unidad))}
            placeholder="Máx"
            className="h-10 min-h-11"
            aria-label="Ancho máximo"
          />
        </div>
        <Select value={unidad} onValueChange={onUnidadChange as (v: string) => void}>
          <SelectTrigger className="h-10 min-h-11 w-20 shrink-0" aria-label="Unidad de ancho">
            <SelectValue placeholder="Unidad" />
          </SelectTrigger>
          <SelectContent>
            {UNIDADES_ANCHO.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}