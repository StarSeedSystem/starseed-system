"use client";

/**
 * PanelInferencia — Muestra el estado de inferencia local PAIR y modelos cargados.
 */

import { useEffect, useState } from "react";
import { Cpu, RefreshCw, CheckCircle2, XCircle, Activity, Server, Zap, Database } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  NODOS_INFERENCIA_LOCAL_STORAGE,
  NodoInferenciaLocal,
  resumenDisponibles,
  esNodoListo,
  nodoConBase,
} from "@/lib/network/inferencia-local";

export interface PanelInferenciaProps {
  compact?: boolean;
}

export function PanelInferencia({ compact = false }: PanelInferenciaProps) {
  const [nodos, setNodos] = useState<NodoInferenciaLocal[]>([]);
  const [nodoSeleccionadoId, setNodoSeleccionadoId] = useState<string>("");
  const [comprobandoId, setComprobandoId] = useState<string | null>(null);

  useEffect(() => {
    // Cargar nodos de localStorage al montar
    try {
      const stored = localStorage.getItem(NODOS_INFERENCIA_LOCAL_STORAGE);
      if (stored) {
        const parsed = JSON.parse(stored) as NodoInferenciaLocal[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setNodos(parsed);
          setNodoSeleccionadoId(parsed[0].id);
          return;
        }
      }
    } catch {
      // Ignorar error de parsing
    }
  }, []);

  const comprobarSalud = async () => {
    const nodoEnRegistro = nodos.find((n) => n.id === nodoSeleccionadoId);
    if (!nodoEnRegistro) {
      toast.error("El nodo seleccionado no pertenece al registro local.");
      return;
    }

    setComprobandoId(nodoEnRegistro.id);
    const startTime = Date.now();
    // La URL se deriva exclusivamente del host y puerto del registro local.
    // baseUrl no participa: podría apuntar a un destino distinto al elegido.
    const urlModels = nodoConBase({ ...nodoEnRegistro, baseUrl: "" }, "/v1/models");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(urlModels, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const ms = Date.now() - startTime;
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { data?: Array<{ id: string }> };
        const modelos = Array.isArray(data.data)
          ? data.data.map((modelo) => modelo.id).filter(Boolean)
          : nodoEnRegistro.modelos;

        const nodoActualizado: NodoInferenciaLocal = {
          ...nodoEnRegistro,
          modelos,
          latenciaMs: ms,
          ultimoLatido: new Date().toISOString(),
        };

        setNodos((prev) => {
          const nuevos = prev.map((n) => (n.id === nodoEnRegistro.id ? nodoActualizado : n));
          try {
            localStorage.setItem(NODOS_INFERENCIA_LOCAL_STORAGE, JSON.stringify(nuevos));
          } catch {
            // Error ignorado de almacenamiento
          }
          return nuevos;
        });

        toast.success(`Salud comprobada en ${nodoEnRegistro.host}:${nodoEnRegistro.puerto}: ${modelos.length} modelo(s) en ${ms} ms.`);
      } else {
        toast.error(`Error HTTP ${res.status} al verificar ${nodoEnRegistro.host}:${nodoEnRegistro.puerto}`);
      }
    } catch {
      toast.error(`Sin conexión con ${nodoEnRegistro.host}:${nodoEnRegistro.puerto}`);
    } finally {
      setComprobandoId(null);
    }
  };

  const resumen = resumenDisponibles(nodos);

  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-400/20 bg-sky-500/[0.05] px-3 py-2 text-xs font-medium text-sky-100">
        <span className="flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-sky-300" />
          <span>Inferencia PAIR:</span>
          <span className="font-bold text-white">{resumen.totales} nodos · {resumen.listos} listos</span>
        </span>
        {resumen.latenciaPromedio > 0 && (
          <span className="text-[10px] text-sky-200/70">
            {resumen.latenciaPromedio} ms prom.
          </span>
        )}
      </div>
    );
  }

  const nodoSeleccionado = nodos.find((n) => n.id === nodoSeleccionadoId) ?? null;

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-black/30 p-4">
      {/* Cabecera del panel */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-sky-50">
            <Cpu className="h-4 w-4 text-sky-300" />
            Inferencia Local · Nodos PAIR
          </h3>
          <p className="mt-0.5 text-xs text-white/50">
            Red de nodos de la misma red que sirven inferencia local (Personal AI Router) compatible con OpenAI/Ollama.
          </p>
        </div>

        {/* Resumen de métricas */}
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-semibold text-sky-200">
            {resumen.totales} {resumen.totales === 1 ? "nodo" : "nodos"} · {resumen.listos} {resumen.listos === 1 ? "listo" : "listos"}
          </span>
        </div>
      </div>

      {/* Selector de nodo + Botón Comprobar ahora */}
      {nodos.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
          <div className="flex items-center gap-2">
            <label htmlFor="select-nodo-pair" className="text-xs font-medium text-white/70">
              Nodo a comprobar:
            </label>
            <select
              id="select-nodo-pair"
              value={nodoSeleccionado?.id ?? ""}
              onChange={(e) => setNodoSeleccionadoId(e.target.value)}
              className="cursor-pointer rounded-lg border border-white/15 bg-black/60 px-2.5 py-1 text-xs text-white focus:border-sky-400 focus:outline-none"
            >
              {nodos.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.host}:{n.puerto} ({n.transporte})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={!nodoSeleccionado || comprobandoId === nodoSeleccionado?.id}
            onClick={() => void comprobarSalud()}
            aria-label={nodoSeleccionado
              ? `Comprobar ahora ${nodoSeleccionado.host}:${nodoSeleccionado.puerto}`
              : "Comprobar ahora el nodo PAIR elegido"}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-sky-400/40 bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-100 transition-colors duration-200 motion-reduce:transition-none hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-50",
              comprobandoId && "cursor-wait"
            )}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn(
                "h-3.5 w-3.5",
                comprobandoId === nodoSeleccionado?.id && "animate-spin motion-reduce:animate-none"
              )}
            />
            Comprobar ahora
          </button>
        </div>
      )}

      {/* Lista de tarjetas por nodo */}
      {nodos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 p-6 text-center">
          <Server className="mx-auto h-8 w-8 text-white/30" />
          <p className="mt-2 text-xs text-white/60">No hay nodos PAIR registrados en la red local.</p>
          <p className="mt-1 text-[11px] text-white/40">
            Los nodos activos en la red se guardan en la clave local <code className="rounded bg-white/10 px-1 font-mono">starseed.mesh.inferencia-local.v1</code>.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {nodos.map((nodo) => {
            const listo = esNodoListo(nodo);
            return (
              <div
                key={nodo.id}
                className={cn(
                  "flex flex-col justify-between space-y-2.5 rounded-xl border p-3 transition-colors duration-200 motion-reduce:transition-none",
                  listo
                    ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                    : "border-white/10 bg-white/[0.02]"
                )}
              >
                {/* Cabecera tarjeta nodo */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-white">
                      {nodo.host}:{nodo.puerto}
                    </span>
                    <span className="ml-2 inline-block rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-medium uppercase text-white/60">
                      {nodo.transporte}
                    </span>
                  </div>

                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      listo
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-amber-500/20 text-amber-300"
                    )}
                  >
                    {listo ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" /> Listo
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3" /> No listo
                      </>
                    )}
                  </span>
                </div>

                {/* Info de motores y modelos */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] text-white/50">Motores:</span>
                    {nodo.motores.map((m) => (
                      <span key={m} className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-mono text-sky-200">
                        {m}
                      </span>
                    ))}
                  </div>

                  <div>
                    <span className="text-[10px] text-white/50">Modelos cargados:</span>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {nodo.modelos.length > 0 ? (
                        nodo.modelos.map((mod) => (
                          <span key={mod} className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-white/80">
                            {mod}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] italic text-white/40">Sin modelos reportados</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Métricas: RAM, latencia, carga y último latido */}
                <div className="grid grid-cols-2 gap-1.5 border-t border-white/10 pt-2 text-[10px] text-white/60">
                  <div className="flex items-center gap-1">
                    <Database className="h-3 w-3 text-white/40" />
                    <span>RAM: <strong className="text-white/90">{nodo.ramMB} MB</strong></span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Activity className="h-3 w-3 text-white/40" />
                    <span>Latencia: <strong className="text-white/90">{nodo.latenciaMs ?? "—"} ms</strong></span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Zap className="h-3 w-3 text-white/40" />
                    <span>Carga: <strong className="text-white/90">{Math.round((nodo.carga ?? 0) * 100)}%</strong></span>
                  </div>
                  <div className="flex items-center gap-1 truncate" title={nodo.ultimoLatido}>
                    <span>Latido: <strong className="text-white/90">{new Date(nodo.ultimoLatido).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PanelInferencia;
