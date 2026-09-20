"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  leerEstadoBitnet,
  diagnostico,
  recomendacion,
  type EstadoBitnetSaneado,
} from "@/lib/mando/bitnet-estado";

export function PanelBitnet() {
  const [estado, setEstado] = useState<EstadoBitnetSaneado | null>(null);
  const [cargando, setCargando] = useState<boolean>(false);
  const [errorBackend, setErrorBackend] = useState<boolean>(false);
  const [tokS, setTokS] = useState<number | null>(null);

  const cargarEstado = useCallback(async () => {
    setCargando(true);
    setErrorBackend(false);
    try {
      const res = await fetch("/api/ai/astraura-158/api/bitnet/estado");
      if (!res.ok) throw new Error("HTTP error");
      const data: unknown = await res.json();
      const saneado = leerEstadoBitnet(data);
      setEstado(saneado);
      if (typeof saneado.salud.tok_s === "number" && saneado.salud.tok_s > 0) {
        setTokS(saneado.salud.tok_s);
      }
    } catch {
      setErrorBackend(true);
      setEstado(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarEstado();
  }, [cargarEstado]);

  const ejecutarAccion = async (accion: "dormir" | "despertar") => {
    if (!window.confirm(`¿Confirmar ${accion} BitNet?`)) return;
    setCargando(true);
    try {
      const res = await fetch(`/api/ai/astraura-158/api/bitnet/${accion}`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP error ${accion}`);
      await cargarEstado();
    } catch {
      setErrorBackend(true);
    } finally {
      setCargando(false);
    }
  };

  const diag = errorBackend
    ? { tono: "rojo" as const, frase: "Astraura no responde en :8000" }
    : diagnostico(estado);

  const rec = errorBackend ? null : recomendacion(estado);

  const colorPunto: Record<string, string> = {
    verde: "bg-emerald-500",
    ambar: "bg-amber-500",
    rojo: "bg-rose-500",
    gris: "bg-neutral-500",
  };

  const s = estado?.salud;
  const modeloMb = estado?.instalado.modelo_mb || 1133;
  const rssMb = s?.rss_mb ?? 0;
  const ramLibreMb = s?.ram_libre_mb ?? 0;
  const swapGb = ((s?.swap_mb ?? 0) / 1024).toFixed(1);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4 text-sm text-neutral-200">
      <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${colorPunto[diag.tono] ?? "bg-neutral-500"}`} />
          <span className="font-semibold">{diag.frase}</span>
        </div>
        {tokS !== null && <span className="text-xs text-emerald-400 font-mono">{tokS} tok/s</span>}
      </div>

      <div className="py-3 text-xs text-neutral-400 font-mono">
        pesos {modeloMb} MB · RAM {rssMb} MB · RAM libre {ramLibreMb} MB · swap {swapGb} GB
      </div>

      {rec && (
        <div className="mb-3 rounded-md bg-amber-950/40 border border-amber-800/50 p-2 text-xs text-amber-300">
          Recomendación: {rec} BitNet para optimizar recursos del sistema.
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => void cargarEstado()}
          disabled={cargando}
          className="cursor-pointer rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-50"
        >
          {cargando ? "Probando..." : "Probar ahora"}
        </button>
        <button
          onClick={() => void ejecutarAccion("dormir")}
          disabled={cargando}
          className="cursor-pointer rounded-lg bg-rose-950/60 border border-rose-800/40 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-900/60 disabled:opacity-50"
        >
          Dormir
        </button>
        <button
          onClick={() => void ejecutarAccion("despertar")}
          disabled={cargando}
          className="cursor-pointer rounded-lg bg-emerald-950/60 border border-emerald-800/40 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-900/60 disabled:opacity-50"
        >
          Despertar
        </button>
      </div>
    </div>
  );
}
