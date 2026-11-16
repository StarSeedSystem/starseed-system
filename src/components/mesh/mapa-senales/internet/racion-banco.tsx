"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { AjustesBanco, VentanaBanco } from "@/lib/malla/internet/tipos";
import { TextosInternet } from "@/lib/malla/internet/tipos";

type Props = {
  banco: AjustesBanco;
  onCambiar: (b: AjustesBanco) => void;
  textos: Pick<typeof TextosInternet, "racionDiaria" | "programacion" | "mb" | "gb" | "bancoTitulo">;
  extra: { desde: string; hasta: string; limite: string };
};

const UNIDADES = [
  { valor: "mb", etiqueta: "MB", factor: 1 },
  { valor: "gb", etiqueta: "GB", factor: 1000 },
] as const;

function parsearNumero(valor: string): number {
  const normalizado = valor.replace(",", ".");
  const n = Number.parseFloat(normalizado);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function formatearNumero(n: number): string {
  return n.toString();
}

function ventanaVacia(): VentanaBanco {
  return { desde: "", hasta: "", horaDesde: "00:00", horaHasta: "23:59", limiteMb: 0 };
}

export function RacionBanco({ banco, onCambiar, textos, extra }: Props) {
  const [pestanaActiva, setPestanaActiva] = React.useState<"diario" | "programado">(banco.modo);
  const [unidadDiaria, setUnidadDiaria] = React.useState<"mb" | "gb">("mb");
  const [unidadesVentanas, setUnidadesVentanas] = React.useState<Record<number, "mb" | "gb">>({});

  React.useEffect(() => {
    setPestanaActiva(banco.modo);
  }, [banco.modo]);

  const manejarCambioPestana = (modo: "diario" | "programado") => {
    setPestanaActiva(modo);
    onCambiar({ ...banco, modo });
  };

  const manejarCambioDiario = (valor: string) => {
    const n = parsearNumero(valor);
    if (Number.isNaN(n)) return;
    const mb = unidadDiaria === "gb" ? Math.round(n * 1000) : Math.round(n);
    onCambiar({ ...banco, diarioMb: mb });
  };

  const manejarCambioUnidadDiaria = (nuevaUnidad: "mb" | "gb") => {
    setUnidadDiaria(nuevaUnidad);
  };

  const valorMostrarDiario = unidadDiaria === "gb" ? banco.diarioMb / 1000 : banco.diarioMb;

  const manejarCambioVentana = (indice: number, campo: keyof VentanaBanco, valor: string) => {
    const nuevasVentanas = [...banco.ventanas];
    const ventana = { ...nuevasVentanas[indice] };
    if (campo === "limiteMb") {
      const unidad = unidadesVentanas[indice] ?? "mb";
      const n = parsearNumero(valor);
      if (Number.isNaN(n)) return;
      ventana.limiteMb = unidad === "gb" ? Math.round(n * 1000) : Math.round(n);
    } else {
      (ventana as Record<string, string>)[campo] = valor;
    }
    nuevasVentanas[indice] = ventana;
    onCambiar({ ...banco, ventanas: nuevasVentanas });
  };

  const manejarCambioUnidadVentana = (indice: number, nuevaUnidad: "mb" | "gb") => {
    const nuevasUnidades = { ...unidadesVentanas, [indice]: nuevaUnidad };
    setUnidadesVentanas(nuevasUnidades);
    const nuevasVentanas = [...banco.ventanas];
    const ventana = { ...nuevasVentanas[indice] };
    const unidadActual = unidadesVentanas[indice] ?? "mb";
    if (unidadActual !== nuevaUnidad) {
      const valorActual = unidadActual === "gb" ? ventana.limiteMb / 1000 : ventana.limiteMb;
      ventana.limiteMb = nuevaUnidad === "gb" ? Math.round(valorActual * 1000) : Math.round(valorActual);
    }
    nuevasVentanas[indice] = ventana;
    onCambiar({ ...banco, ventanas: nuevasVentanas });
  };

  const valorMostrarVentana = (indice: number) => {
    const unidad = unidadesVentanas[indice] ?? "mb";
    const limite = banco.ventanas[indice]?.limiteMb ?? 0;
    return unidad === "gb" ? limite / 1000 : limite;
  };

  const manejarAnadirVentana = () => {
    if (banco.ventanas.length >= 12) return;
    onCambiar({ ...banco, ventanas: [...banco.ventanas, ventanaVacia()] });
  };

  const manejarQuitarVentana = (indice: number) => {
    const nuevasVentanas = banco.ventanas.filter((_, i) => i !== indice);
    const nuevasUnidades = { ...unidadesVentanas };
    delete nuevasUnidades[indice];
    const unidadesReindexadas: Record<number, "mb" | "gb"> = {};
    Object.entries(nuevasUnidades).forEach(([key, valor]) => {
      const idx = Number.parseInt(key, 10);
      unidadesReindexadas[idx > indice ? idx - 1 : idx] = valor;
    });
    setUnidadesVentanas(unidadesReindexadas);
    onCambiar({ ...banco, ventanas: nuevasVentanas });
  };

  const pestanas = [
    { id: "diario", label: textos.racionDiaria },
    { id: "programado", label: textos.programacion },
  ] as const;

  return (
    <div className="space-y-3">
      <div role="tablist" className="flex gap-1 border-b border-white/10" aria-label={textos.bancoTitulo}>
        {pestanas.map((pestana) => (
          <button
            key={pestana.id}
            role="tab"
            id={`tab-${pestana.id}`}
            aria-selected={pestanaActiva === pestana.id}
            aria-controls={`panel-${pestana.id}`}
            tabIndex={pestanaActiva === pestana.id ? 0 : -1}
            onClick={() => manejarCambioPestana(pestana.id as "diario" | "programado")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                manejarCambioPestana(pestana.id as "diario" | "programado");
              }
            }}
            className={cn(
              "px-3 py-1.5 text-[11px] font-medium rounded-t-xl transition-colors duration-200 cursor-pointer",
              pestanaActiva === pestana.id
                ? "text-white bg-white/5 border-b-2 border-emerald-400"
                : "text-white/60 hover:text-white/90",
            )}
          >
            {pestana.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="panel-diario"
        aria-labelledby="tab-diario"
        hidden={pestanaActiva !== "diario"}
        className="space-y-3"
      >
        <div className="flex items-center gap-2">
          <label htmlFor="racion-diaria" className="text-[11px] font-medium text-white/90 min-w-[80px]">
            {textos.racionDiaria}
          </label>
          <input
            id="racion-diaria"
            type="text"
            inputMode="decimal"
            role="spinbutton"
            aria-label={textos.racionDiaria}
            value={formatearNumero(valorMostrarDiario)}
            onChange={(e) => manejarCambioDiario(e.target.value)}
            onBlur={(e) => manejarCambioDiario(e.target.value)}
            className="flex-1 max-w-[120px] rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-white placeholder-white/30 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:border-emerald-400/50"
          />
          <select
            id="unidad-diaria"
            aria-label="unidad"
            value={unidadDiaria}
            onChange={(e) => manejarCambioUnidadDiaria(e.target.value as "mb" | "gb")}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-white focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:border-emerald-400/50 cursor-pointer"
            role="combobox"
          >
            {UNIDADES.map((u) => (
              <option key={u.valor} value={u.valor}>
                {u.etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        role="tabpanel"
        id="panel-programado"
        aria-labelledby="tab-programado"
        hidden={pestanaActiva !== "programado"}
        className="space-y-3"
      >
        {banco.ventanas.length === 0 && (
          <p className="text-[11px] text-white/45 text-center py-4">
            Sin ventanas programadas. Añade una para empezar.
          </p>
        )}
        {banco.ventanas.map((ventana, indice) => (
          <fieldset
            key={indice}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2"
          >
            <legend className="text-[11px] font-medium text-white/70">
              Ventana {indice + 1}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label htmlFor={`desde-${indice}`} className="block text-[10px] text-white/50">
                  {extra.desde}
                </label>
                <input
                  id={`desde-${indice}`}
                  type="date"
                  value={ventana.desde}
                  onChange={(e) => manejarCambioVentana(indice, "desde", e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-white placeholder-white/30 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:border-emerald-400/50"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`hasta-${indice}`} className="block text-[10px] text-white/50">
                  {extra.hasta}
                </label>
                <input
                  id={`hasta-${indice}`}
                  type="date"
                  value={ventana.hasta}
                  onChange={(e) => manejarCambioVentana(indice, "hasta", e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-white placeholder-white/30 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:border-emerald-400/50"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`horaDesde-${indice}`} className="block text-[10px] text-white/50">
                  Hora desde
                </label>
                <input
                  id={`horaDesde-${indice}`}
                  type="time"
                  value={ventana.horaDesde}
                  onChange={(e) => manejarCambioVentana(indice, "horaDesde", e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-white placeholder-white/30 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:border-emerald-400/50"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`horaHasta-${indice}`} className="block text-[10px] text-white/50">
                  Hora hasta
                </label>
                <input
                  id={`horaHasta-${indice}`}
                  type="time"
                  value={ventana.horaHasta}
                  onChange={(e) => manejarCambioVentana(indice, "horaHasta", e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-white placeholder-white/30 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:border-emerald-400/50"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <label htmlFor={`limite-${indice}`} className="block text-[10px] text-white/50">
                  {extra.limite}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id={`limite-${indice}`}
                    type="text"
                    inputMode="decimal"
                    role="spinbutton"
                    aria-label={extra.limite}
                    value={formatearNumero(valorMostrarVentana(indice))}
                    onChange={(e) => manejarCambioVentana(indice, "limiteMb", e.target.value)}
                    onBlur={(e) => manejarCambioVentana(indice, "limiteMb", e.target.value)}
                    className="flex-1 max-w-[120px] rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-white placeholder-white/30 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:border-emerald-400/50"
                  />
                  <select
                    id={`unidad-limite-${indice}`}
                    aria-label="unidad límite"
                    value={unidadesVentanas[indice] ?? "mb"}
                    onChange={(e) => manejarCambioUnidadVentana(indice, e.target.value as "mb" | "gb")}
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-white focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:border-emerald-400/50 cursor-pointer"
                    role="combobox"
                  >
                    {UNIDADES.map((u) => (
                      <option key={u.valor} value={u.valor}>
                        {u.etiqueta}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => manejarQuitarVentana(indice)}
              aria-label={`quitar ventana ${indice + 1}`}
              className="text-[10px] text-red-400 hover:text-red-300 cursor-pointer underline"
            >
              Quitar ventana
            </button>
          </fieldset>
        ))}
        {banco.ventanas.length < 12 && (
          <button
            type="button"
            onClick={manejarAnadirVentana}
            aria-label="añadir ventana"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-medium text-white/90 transition-colors duration-200 cursor-pointer hover:border-emerald-400/25 hover:bg-emerald-500/10"
          >
            + Añadir ventana
          </button>
        )}
      </div>
    </div>
  );
}