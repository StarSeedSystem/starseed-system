"use client";

/**
 * Control numérico de la Protomolécula: deslizador (si hay rango) + campo de valor exacto.
 * Mientras se arrastra llama a `alArrastrar` (vista previa en vivo); al soltar fija el valor.
 * El campo acepta coma y punto y confirma con Enter o al salir del campo.
 */
import * as React from "react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ControlNumericoProps {
  idCampo: string;
  nombre: string;
  /** Texto ya formateado con unidad, para el aria. */
  texto: string;
  valor: number;
  min?: number;
  max?: number;
  paso?: number;
  entero?: boolean;
  soloLectura: boolean;
  alArrastrar?: (valor: number) => void;
  alFijar: (valor: number) => void;
}

export function ControlNumerico({
  idCampo, nombre, texto, valor, min, max, paso, entero = false,
  soloLectura, alArrastrar, alFijar,
}: ControlNumericoProps) {
  const [borrador, setBorrador] = React.useState<string | null>(null);
  const conRango = min !== undefined && max !== undefined;
  const pasoReal = paso ?? (entero || !conRango ? 1 : (max - min) / 1000) as number;

  const fijar = (bruto: string) => {
    const n = Number(bruto.replace(",", "."));
    if (bruto.trim() !== "" && Number.isFinite(n)) alFijar(entero ? Math.round(n) : n);
    setBorrador(null);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={idCampo} className="cursor-pointer">{nombre}</Label>
        {conRango && (
          <Slider
            value={[valor]} min={min} max={max} step={pasoReal} disabled={soloLectura}
            aria-label={nombre} getAriaValueText={() => texto}
            onValueChange={([v]) => alArrastrar?.(v)}
            onValueCommit={([v]) => alFijar(v)}
          />
        )}
        <Input
          id={idCampo} inputMode="decimal" type="text" aria-valuetext={texto}
          className="w-24 text-right transition-colors duration-150"
          value={borrador ?? String(valor).replace(".", ",")}
          disabled={soloLectura}
          aria-label={`${nombre} (valor exacto)`}
          onChange={(e) => setBorrador(e.target.value)}
          onBlur={(e) => fijar(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
      </div>
    </div>
  );
}
