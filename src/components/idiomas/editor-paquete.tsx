"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Download, Save, X } from "lucide-react";
import type { PaqueteIdioma } from "@/lib/idiomas/paquete/formato";
import type { AlmacenPaquetes } from "@/lib/idiomas/paquete/almacen";
import { validarPaquete } from "@/lib/idiomas/paquete/validar";
import { construirPaquete } from "@/lib/idiomas/paquete/formato";

export interface EditorPaqueteProps {
  codigoIdioma: string;
  fuente: Record<string, unknown> | string[];
  almacen?: AlmacenPaquetes;
  onCerrar: () => void;
}

interface Traduccion {
  clave: string;
  valor: string;
  esSugerencia: boolean;
  aceptada: boolean;
}

function obtenerNombreIdioma(paquete: PaqueteIdioma | null): string {
  return paquete?.nombre ?? "Idioma";
}

function extraerClavesFuente(fuente: Record<string, unknown> | string[]): string[] {
  if (Array.isArray(fuente)) {
    return fuente.map((c) => String(c));
  }
  return Object.keys(fuente);
}

export function EditorPaquete({ codigoIdioma, fuente, almacen, onCerrar }: EditorPaqueteProps) {
  const [paquete, setPaquete] = useState<PaqueteIdioma | null>(null);
  const [traducciones, setTraducciones] = useState<Traduccion[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [erroresValidacion, setErroresValidacion] = useState<string[]>([]);
  const [mostrarCompletadas, setMostrarCompletadas] = useState(false);

  useEffect(() => {
    if (!almacen) return;
    const actualizar = () => {
      const pkg = almacen.leerPaquete(codigoIdioma);
      setPaquete(pkg);
      if (pkg) {
        const clavesFuente = extraerClavesFuente(fuente);
        const esAutomatico = pkg.revisado.estado === "automatico";
        const nuevasTraducciones: Traduccion[] = clavesFuente.map((clave) => {
          const valor = pkg.entradas[clave] ?? "";
          const tieneValor = valor.trim() !== "";
          return {
            clave,
            valor,
            esSugerencia: esAutomatico && tieneValor,
            aceptada: !esAutomatico && tieneValor,
          };
        });
        setTraducciones(nuevasTraducciones);
      }
    };
    actualizar();
    window.addEventListener("starseed:idiomas-paquetes", actualizar);
    return () => window.removeEventListener("starseed:idiomas-paquetes", actualizar);
  }, [almacen, codigoIdioma, fuente]);

  const progreso = useMemo(() => {
    const completadas = traducciones.filter((t) => t.aceptada && t.valor.trim() !== "").length;
    const total = traducciones.length;
    return { completadas, total };
  }, [traducciones]);

  const pendientes = useMemo(() => traducciones.filter((t) => !t.aceptada || t.valor.trim() === ""), [traducciones]);
  const completadas = useMemo(() => traducciones.filter((t) => t.aceptada && t.valor.trim() !== ""), [traducciones]);

  const manejarCambio = useCallback((clave: string, valor: string) => {
    setTraducciones((prev) =>
      prev.map((t) => (t.clave === clave ? { ...t, valor, aceptada: valor.trim() !== "" } : t))
    );
    setErroresValidacion([]);
  }, []);

  const manejarBlur = useCallback((clave: string) => {
    setTraducciones((prev) =>
      prev.map((t) => (t.clave === clave ? { ...t, aceptada: t.valor.trim() !== "" } : t))
    );
  }, []);

  const manejarAceptarSugerencia = useCallback((clave: string) => {
    setTraducciones((prev) =>
      prev.map((t) =>
        t.clave === clave ? { ...t, aceptada: true, esSugerencia: false } : t
      )
    );
  }, []);

  const validarYGuardar = useCallback(async () => {
    if (!almacen || !paquete) return;

    const entradas: Record<string, string> = {};
    for (const t of traducciones) {
      if (t.valor.trim() !== "") {
        entradas[t.clave] = t.valor.trim();
      }
    }

    const clavesFuente = extraerClavesFuente(fuente);
    const faltantes = clavesFuente.filter((c) => !entradas[c]);
    if (faltantes.length > 0) {
      setErroresValidacion([`Quedan ${faltantes.length} traducciones pendientes`]);
      return;
    }

    setGuardando(true);
    setErroresValidacion([]);

    try {
      const paqueteActualizado = await construirPaquete(
        {
          codigo: paquete.codigo,
          nombre: paquete.nombre,
          dir: paquete.dir,
          autor: paquete.autor,
          licencia: paquete.licencia,
          entradas,
        },
        true
      );

      const resultado = almacen.guardarPaquete(paqueteActualizado);
      if (!resultado.ok) {
        setErroresValidacion([resultado.motivo]);
      } else {
        setTraducciones((prev) => prev.map((t) => ({ ...t, aceptada: true, esSugerencia: false })));
      }
    } catch (e) {
      setErroresValidacion([e instanceof Error ? e.message : "Error al guardar"]);
    } finally {
      setGuardando(false);
    }
  }, [almacen, paquete, traducciones, fuente]);

  const exportarArchivo = useCallback(async () => {
    if (!paquete) return;

    const entradas: Record<string, string> = {};
    for (const t of traducciones) {
      if (t.valor.trim() !== "") {
        entradas[t.clave] = t.valor.trim();
      }
    }

    const paqueteExportar = await construirPaquete(
      {
        codigo: paquete.codigo,
        nombre: paquete.nombre,
        dir: paquete.dir,
        autor: paquete.autor,
        licencia: paquete.licencia,
        entradas,
      },
      true
    );

    const { nombreDeArchivo } = await import("@/lib/idiomas/paquete/formato");
    const blob = new Blob([JSON.stringify(paqueteExportar, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreDeArchivo(paqueteExportar);
    a.click();
    URL.revokeObjectURL(url);
  }, [paquete, traducciones]);

  if (!paquete) {
    return (
      <div className="w-[360px] min-h-[200px] flex items-center justify-center rounded-xl border border-white/10 bg-black/40 p-4">
        <p className="text-white/50 text-sm">Cargando paquete…</p>
      </div>
    );
  }

  return (
    <div className="w-[360px] rounded-xl border border-white/10 bg-black/40 p-4 space-y-4" data-testid="editor-paquete">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white">{obtenerNombreIdioma(paquete)}</h2>
          <p className="text-[11px] text-white/60">{progreso.completadas} de {progreso.total}</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          className="min-h-[44px] min-w-[44px] cursor-pointer rounded-lg bg-white/5 p-2 text-white/70 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {erroresValidacion.length > 0 && (
        <div className="rounded-lg border border-red-300/30 bg-red-300/10 p-3 text-sm text-red-200" role="alert">
          <ul className="list-disc list-inside space-y-1">
            {erroresValidacion.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <div className="space-y-2" data-testid="lista-pendientes">
        {pendientes.length > 0 && (
          <>
            <h3 className="text-[11px] font-medium text-white/60 uppercase tracking-wide">Pendientes ({pendientes.length})</h3>
            {pendientes.map((t) => (
              <div key={t.clave} className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2" data-testid={`pendiente-${t.clave}`}>
                <label htmlFor={`input-${t.clave}`} className="block text-sm font-medium text-white">
                  {t.clave}
                </label>
                <input
                  id={`input-${t.clave}`}
                  type="text"
                  value={t.valor}
                  onChange={(e) => manejarCambio(t.clave, e.target.value)}
                  onBlur={() => manejarBlur(t.clave)}
                  className="w-full min-h-[44px] rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-cyan-300"
                  placeholder="Traducción"
                  data-testid={`input-${t.clave}`}
                  autoComplete="off"
                />
                {t.esSugerencia && !t.aceptada && (
                  <button
                    type="button"
                    onClick={() => manejarAceptarSugerencia(t.clave)}
                    className="text-[11px] text-amber-300 hover:text-amber-200 underline cursor-pointer"
                  >
                    Aceptar sugerencia automática
                  </button>
                )}
                {t.esSugerencia && (
                  <span className="inline-block rounded bg-amber-300/20 px-2 py-0.5 text-[10px] text-amber-300" aria-label="Sugerencia automática">
                    Sugerencia automática
                  </span>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="space-y-2" data-testid="lista-completadas">
        <button
          type="button"
          onClick={() => setMostrarCompletadas(!mostrarCompletadas)}
          className="w-full flex items-center justify-between text-sm font-medium text-white/70 hover:text-white transition-colors cursor-pointer min-h-[44px]"
          aria-expanded={mostrarCompletadas}
        >
          <span>Completadas ({completadas.length})</span>
          {mostrarCompletadas ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
        </button>
        {mostrarCompletadas && (
          <div className="space-y-1 ml-2 border-l border-white/10 pl-3">
            {completadas.map((t) => (
              <div key={t.clave} className="text-sm text-white/70 flex items-center gap-2" data-testid={`completada-${t.clave}`}>
                <span className="font-mono text-[11px] text-white/50">{t.clave}</span>
                <span className="truncate">{t.valor}</span>
                {t.esSugerencia && (
                  <span className="inline-block rounded bg-emerald-300/20 px-1.5 py-0.5 text-[10px] text-emerald-300" aria-label="Aceptada">
                    Aceptada
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2 border-t border-white/10">
        <button
          type="button"
          onClick={validarYGuardar}
          disabled={guardando}
          className="flex-1 min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-emerald-300/40 bg-emerald-300/10 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-300/20 focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="h-4 w-4" aria-hidden />
          {guardando ? "Guardando…" : "Guardar borrador"}
        </button>
        <button
          type="button"
          onClick={exportarArchivo}
          className="flex-1 min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-300/20 focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <Download className="h-4 w-4" aria-hidden />
          Exportar archivo
        </button>
        <button
          type="button"
          onClick={onCerrar}
          className="flex-1 min-h-[44px] cursor-pointer rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          Cerrar edición
        </button>
      </div>
    </div>
  );
}