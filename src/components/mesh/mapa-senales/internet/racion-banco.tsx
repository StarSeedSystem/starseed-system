"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { AjustesBanco, VentanaBanco } from "@/lib/malla/internet/tipos";
import { TextosInternet } from "@/lib/malla/internet/tipos";

type Props = {
  banco: AjustesBanco;
  onCambiar: (b: AjustesBanco) => void;
  textos: Pick<
    typeof TextosInternet,
    "racionDiaria" | "programacion" | "mb" | "gb" | "bancoTitulo"
  >;
  extra: { desde: string; hasta: string; limite: string };
};

const VENTANA_DEFECTO: VentanaBanco = {
  desde: "",
  hasta: "",
  horaDesde: "00:00",
  horaHasta: "23:59",
  limiteMb: 0,
};

function parsearNumero(valor: string): number {
  const normalizado = valor.replace(",", ".");
  const n = Number(normalizado);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function aMb(valor: number, unidad: "MB" | "GB"): number {
  return unidad === "GB" ? Math.round(valor * 1000) : Math.round(valor);
}

function desdeMb(mb: number, unidad: "MB" | "GB"): string {
  if (unidad === "GB") {
    const gb = mb / 1000;
    return gb % 1 === 0 ? String(gb) : String(gb).replace(".", ",");
  }
  return String(mb);
}

function unirVentanas(actual: VentanaBanco[], indice: number, parcial: Partial<VentanaBanco>): VentanaBanco[] {
  const nuevas = [...actual];
  nuevas[indice] = { ...nuevas[indice], ...parcial };
  return nuevas;
}

export function RacionBanco({ banco, onCambiar, textos, extra }: Props) {
  const [pestanaActiva, setPestanaActiva] = React.useState<"racion" | "programacion">("racion");
  const [unidadRacion, setUnidadRacion] = React.useState<"MB" | "GB">(banco.diarioMb >= 1000 && banco.diarioMb % 1000 === 0 ? "GB" : "MB");
  const [unidadesVentanas, setUnidadesVentanas] = React.useState<("MB" | "GB")[]>(
    banco.ventanas.map((v) => (v.limiteMb >= 1000 && v.limiteMb % 1000 === 0 ? "GB" : "MB"))
  );
  const [valorRacionCrudo, setValorRacionCrudo] = React.useState<string>(() => desdeMb(banco.diarioMb, banco.diarioMb >= 1000 && banco.diarioMb % 1000 === 0 ? "GB" : "MB"));
  const [valoresLimiteCrudos, setValoresLimiteCrudos] = React.useState<string[]>(() =>
    banco.ventanas.map((v) => desdeMb(v.limiteMb, v.limiteMb >= 1000 && v.limiteMb % 1000 === 0 ? "GB" : "MB"))
  );
  const [racionEditado, setRacionEditado] = React.useState(false);
  const [limitesEditados, setLimitesEditados] = React.useState<Set<number>>(new Set());

  React.useEffect(() => {
    if (!racionEditado) {
      const unidadInicial = banco.diarioMb >= 1000 && banco.diarioMb % 1000 === 0 ? "GB" : "MB";
      setValorRacionCrudo(desdeMb(banco.diarioMb, unidadInicial));
    }
  }, [banco.diarioMb, racionEditado]);

  React.useEffect(() => {
    const nuevosValores = banco.ventanas.map((v, i) => {
      if (limitesEditados.has(i)) return valoresLimiteCrudos[i];
      const unidad = v.limiteMb >= 1000 && v.limiteMb % 1000 === 0 ? "GB" : "MB";
      return desdeMb(v.limiteMb, unidad);
    });
    setValoresLimiteCrudos(nuevosValores);
  }, [banco.ventanas, limitesEditados]);

  const manejarCambioRacion = (valor: string) => {
    setValorRacionCrudo(valor);
    setRacionEditado(true);
    const n = parsearNumero(valor);
    const mb = aMb(n, unidadRacion);
    onCambiar({ ...banco, diarioMb: mb, modo: "diario" });
  };

  const manejarCambioUnidadRacion = (nuevaUnidad: "MB" | "GB") => {
    if (racionEditado) {
      const n = parsearNumero(valorRacionCrudo);
      const mb = aMb(n, nuevaUnidad);
      setUnidadRacion(nuevaUnidad);
      setValorRacionCrudo(desdeMb(mb, nuevaUnidad));
      onCambiar({ ...banco, diarioMb: mb, modo: "diario" });
    } else {
      setUnidadRacion(nuevaUnidad);
      setValorRacionCrudo(desdeMb(banco.diarioMb, nuevaUnidad));
      onCambiar({ ...banco, diarioMb: banco.diarioMb, modo: "diario" });
    }
  };

  const manejarAnadirVentana = () => {
    if (banco.ventanas.length >= 12) return;
    const nuevasVentanas = [...banco.ventanas, VENTANA_DEFECTO];
    const nuevasUnidades = [...unidadesVentanas, "MB"];
    const nuevosValoresCrudos = [...valoresLimiteCrudos, "0"];
    const nuevosEditados = new Set(limitesEditados);
    setUnidadesVentanas(nuevasUnidades);
    setValoresLimiteCrudos(nuevosValoresCrudos);
    setLimitesEditados(nuevosEditados);
    onCambiar({ ...banco, modo: "programado", ventanas: nuevasVentanas });
  };

  const manejarQuitarVentana = (indice: number) => {
    const nuevasVentanas = banco.ventanas.filter((_, i) => i !== indice);
    const nuevasUnidades = unidadesVentanas.filter((_, i) => i !== indice);
    const nuevosValoresCrudos = valoresLimiteCrudos.filter((_, i) => i !== indice);
    const nuevosEditados = new Set(limitesEditados);
    nuevosEditados.delete(indice);
    for (const editado of limitesEditados) {
      if (editado > indice) {
        nuevosEditados.delete(editado);
        nuevosEditados.add(editado - 1);
      }
    }
    setUnidadesVentanas(nuevasUnidades);
    setValoresLimiteCrudos(nuevosValoresCrudos);
    setLimitesEditados(nuevosEditados);
    onCambiar({ ...banco, ventanas: nuevasVentanas });
  };

  const manejarCambioVentana = (indice: number, campo: keyof VentanaBanco, valor: string) => {
    let valorProcesado: string | number = valor;
    if (campo === "limiteMb") {
      setValoresLimiteCrudos((prev) => {
        const nuevos = [...prev];
        nuevos[indice] = valor;
        return nuevos;
      });
      setLimitesEditados((prev) => new Set(prev).add(indice));
      const n = parsearNumero(valor);
      valorProcesado = aMb(n, unidadesVentanas[indice] ?? "MB");
    }
    const nuevasVentanas = unirVentanas(banco.ventanas, indice, { [campo]: valorProcesado });
    onCambiar({ ...banco, modo: "programado", ventanas: nuevasVentanas });
  };

  const manejarCambioUnidadVentana = (indice: number, nuevaUnidad: "MB" | "GB") => {
    if (limitesEditados.has(indice)) {
      const valorActual = valoresLimiteCrudos[indice] ?? "0";
      const n = parsearNumero(valorActual);
      const mb = aMb(n, nuevaUnidad);
      const nuevasUnidades = [...unidadesVentanas];
      nuevasUnidades[indice] = nuevaUnidad;
      setUnidadesVentanas(nuevasUnidades);
      setValoresLimiteCrudos((prev) => {
        const nuevos = [...prev];
        nuevos[indice] = desdeMb(mb, nuevaUnidad);
        return nuevos;
      });
      const nuevasVentanas = unirVentanas(banco.ventanas, indice, { limiteMb: mb });
      onCambiar({ ...banco, ventanas: nuevasVentanas });
    } else {
      const mb = banco.ventanas[indice]?.limiteMb ?? 0;
      const nuevasUnidades = [...unidadesVentanas];
      nuevasUnidades[indice] = nuevaUnidad;
      setUnidadesVentanas(nuevasUnidades);
      setValoresLimiteCrudos((prev) => {
        const nuevos = [...prev];
        nuevos[indice] = desdeMb(mb, nuevaUnidad);
        return nuevos;
      });
      onCambiar({ ...banco, ventanas: banco.ventanas });
    }
  };

  const tabIds = {
    racion: "tab-racion",
    programacion: "tab-programacion",
    panelRacion: "panel-racion",
    panelProgramacion: "panel-programacion",
  };

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={textos.bancoTitulo} className="flex gap-2 border-b border-white/10">
        <button
          id={tabIds.racion}
          role="tab"
          aria-selected={pestanaActiva === "racion"}
          aria-controls={tabIds.panelRacion}
          tabIndex={pestanaActiva === "racion" ? 0 : -1}
          onClick={() => setPestanaActiva("racion")}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              setPestanaActiva("programacion");
            }
          }}
          className={cn(
            "px-3 py-2.5 h-11 text-[11px] font-medium rounded-t-xl transition-colors duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-400/50",
            pestanaActiva === "racion"
              ? "bg-white/[0.05] text-white border-b-2 border-emerald-400"
              : "text-white/50 hover:text-white/70"
          )}
        >
          {textos.racionDiaria}
        </button>
        <button
          id={tabIds.programacion}
          role="tab"
          aria-selected={pestanaActiva === "programacion"}
          aria-controls={tabIds.panelProgramacion}
          tabIndex={pestanaActiva === "programacion" ? 0 : -1}
          onClick={() => setPestanaActiva("programacion")}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              setPestanaActiva("racion");
            }
          }}
          className={cn(
            "px-3 py-2.5 h-11 text-[11px] font-medium rounded-t-xl transition-colors duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-400/50",
            pestanaActiva === "programacion"
              ? "bg-white/[0.05] text-white border-b-2 border-emerald-400"
              : "text-white/50 hover:text-white/70"
          )}
        >
          {textos.programacion}
        </button>
      </div>

      <div
        id={tabIds.panelRacion}
        role="tabpanel"
        aria-labelledby={tabIds.racion}
        hidden={pestanaActiva !== "racion"}
        className="space-y-3 p-3 rounded-xl border border-white/10 bg-white/[0.02]"
      >
        <div className="flex items-center gap-3">
          <label htmlFor="input-racion" className="min-w-[80px] text-[11px] font-medium text-white/90 shrink-0">
            {textos.racionDiaria}
          </label>
          <input
            id="input-racion"
            type="number"
            step="0.1"
            min="0"
            value={valorRacionCrudo}
            onChange={(e) => manejarCambioRacion(e.target.value)}
            className={cn(
              "flex-1 h-11 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[11px] text-white placeholder-white/30",
              "focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400/50",
              "transition-colors duration-200 cursor-pointer"
            )}
            aria-label={textos.racionDiaria}
          />
          <select
            value={unidadRacion}
            onChange={(e) => manejarCambioUnidadRacion(e.target.value as "MB" | "GB")}
            role="combobox"
            aria-label={`${textos.mb} / ${textos.gb}`}
            className={cn(
              "h-11 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[11px] text-white",
              "focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400/50",
              "transition-colors duration-200 cursor-pointer min-w-[70px]"
            )}
          >
            <option value="MB">{textos.mb}</option>
            <option value="GB">{textos.gb}</option>
          </select>
        </div>
      </div>

      <div
        id={tabIds.panelProgramacion}
        role="tabpanel"
        aria-labelledby={tabIds.programacion}
        hidden={pestanaActiva !== "programacion"}
        className="space-y-3 p-3 rounded-xl border border-white/10 bg-white/[0.02]"
      >
        <div role="listbox" aria-label={textos.programacion} className="space-y-2">
          {banco.ventanas.map((ventana, idx) => (
            <div
              key={idx}
              role="option"
              className="space-y-2 p-3 rounded-xl border border-white/10 bg-white/[0.03]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-white/70">Ventana {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => manejarQuitarVentana(idx)}
                  disabled={banco.ventanas.length <= 1}
                  aria-label={`Quitar ventana ${idx + 1}`}
                  className={cn(
                    "h-11 w-11 rounded-lg text-[10px] text-white/50 hover:text-white hover:bg-white/10",
                    "focus:outline-none focus:ring-2 focus:ring-emerald-400/50",
                    "transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor={`desde-${idx}`} className="block text-[9px] text-white/50">
                    {extra.desde}
                  </label>
                  <input
                    id={`desde-${idx}`}
                    type="date"
                    value={ventana.desde}
                    onChange={(e) => manejarCambioVentana(idx, "desde", e.target.value)}
                    className={cn(
                      "w-full h-11 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[11px] text-white",
                      "focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400/50",
                      "transition-colors duration-200 cursor-pointer"
                    )}
                    aria-label={extra.desde}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`hasta-${idx}`} className="block text-[9px] text-white/50">
                    {extra.hasta}
                  </label>
                  <input
                    id={`hasta-${idx}`}
                    type="date"
                    value={ventana.hasta}
                    onChange={(e) => manejarCambioVentana(idx, "hasta", e.target.value)}
                    className={cn(
                      "w-full h-11 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[11px] text-white",
                      "focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400/50",
                      "transition-colors duration-200 cursor-pointer"
                    )}
                    aria-label={extra.hasta}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`horaDesde-${idx}`} className="block text-[9px] text-white/50">
                    Hora desde
                  </label>
                  <input
                    id={`horaDesde-${idx}`}
                    type="time"
                    value={ventana.horaDesde}
                    onChange={(e) => manejarCambioVentana(idx, "horaDesde", e.target.value)}
                    className={cn(
                      "w-full h-11 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[11px] text-white",
                      "focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400/50",
                      "transition-colors duration-200 cursor-pointer"
                    )}
                    aria-label="Hora desde"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`horaHasta-${idx}`} className="block text-[9px] text-white/50">
                    Hora hasta
                  </label>
                  <input
                    id={`horaHasta-${idx}`}
                    type="time"
                    value={ventana.horaHasta}
                    onChange={(e) => manejarCambioVentana(idx, "horaHasta", e.target.value)}
                    className={cn(
                      "w-full h-11 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[11px] text-white",
                      "focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400/50",
                      "transition-colors duration-200 cursor-pointer"
                    )}
                    aria-label="Hora hasta"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`limite-${idx}`} className="block text-[9px] text-white/50">
                    {extra.limite}
                  </label>
                  <div className="flex gap-2">
<input
                    id={`limite-${idx}`}
                    type="number"
                    step="0.1"
                    min="0"
                    value={valoresLimiteCrudos[idx] ?? "0"}
                    onChange={(e) => manejarCambioVentana(idx, "limiteMb", e.target.value)}
                    className={cn(
                      "flex-1 h-11 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[11px] text-white placeholder-white/30",
                      "focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400/50",
                      "transition-colors duration-200 cursor-pointer"
                    )}
                    aria-label={extra.limite}
                  />
                  <select
                    value={unidadesVentanas[idx] ?? "MB"}
                    onChange={(e) => manejarCambioUnidadVentana(idx, e.target.value as "MB" | "GB")}
                    role="combobox"
                    aria-label={`${textos.mb} / ${textos.gb}`}
                    className={cn(
                      "h-11 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[11px] text-white",
                      "focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400/50",
                      "transition-colors duration-200 cursor-pointer min-w-[70px]"
                    )}
                    >
                      <option value="MB">{textos.mb}</option>
                      <option value="GB">{textos.gb}</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={manejarAnadirVentana}
          disabled={banco.ventanas.length >= 12}
          className={cn(
            "w-full h-11 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[11px] font-medium text-white/90",
            "hover:border-emerald-400/25 hover:bg-white/[0.05]",
            "focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400/50",
            "transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          )}
          aria-label="Añadir ventana"
        >
          + Añadir ventana
        </button>
      </div>
    </div>
  );
}