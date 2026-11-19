"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Download, Loader2, Save, X } from "lucide-react";
import type { PaqueteIdioma } from "@/lib/idiomas/paquete/formato";
import type { AlmacenPaquetes } from "@/lib/idiomas/paquete/almacen";
import { crearEditor } from "@/lib/idiomas/paquete/editor";

export interface EditorPaqueteProps {
  codigo: string;
  almacen: AlmacenPaquetes;
  onCerrar?: () => void;
}

function formatearProgreso(completadas: number, total: number): string {
  return `${completadas} de ${total}`;
}

function esSugerenciaAutomatica(valor: string): boolean {
  return valor.trim().endsWith("(auto)");
}

function limpiarSugerencia(valor: string): string {
  return valor.replace(/\s*\(auto\)\s*$/i, "").trim();
}

export function EditorPaquete({ codigo, almacen, onCerrar }: EditorPaqueteProps) {
  const [paquete, setPaquete] = useState<PaqueteIdioma | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [erroresValidacion, setErroresValidacion] = useState<string[]>([]);
  const [sugerenciasAceptadas, setSugerenciasAceptadas] = useState<Set<string>>(new Set());
  const editorRef = useRef<ReturnType<typeof crearEditor> | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const actualizar = () => {
      const p = almacen.leerPaquete(codigo);
      setPaquete(p);
      setCargando(false);
    };
    actualizar();
    window.addEventListener("starseed:idiomas-paquetes", actualizar);
    return () => window.removeEventListener("starseed:idiomas-paquetes", actualizar);
  }, [almacen, codigo]);

  useEffect(() => {
    if (paquete && !editorRef.current) {
      const editor = crearEditor(almacen);
      editor.abrirEdicion(paquete.codigo, paquete.nombre);
      for (const [clave, valor] of Object.entries(paquete.entradas)) {
        if (valor) {
          editor.traducir(clave, valor);
        } else {
          editor.anadirPendiente(clave);
        }
      }
      editorRef.current = editor;
    }
  }, [paquete, almacen]);

  const manejarCambioTraduccion = useCallback((clave: string, valor: string, esSugerencia: boolean) => {
    if (!editorRef.current) return;

    const valorLimpio = esSugerencia ? limpiarSugerencia(valor) : valor;
    editorRef.current.traducir(clave, valorLimpio);

    if (esSugerencia && valorLimpio) {
      setSugerenciasAceptadas((prev) => new Set([...prev, clave]));
    }

    setPaquete((p) => {
      if (!p) return p;
      const nuevasEntradas = { ...p.entradas };
      if (valorLimpio) {
        nuevasEntradas[clave] = valorLimpio;
      } else {
        delete nuevasEntradas[clave];
      }
      return { ...p, entradas: nuevasEntradas };
    });
  }, []);

  const alBlurTraduccion = useCallback((clave: string, valor: string, esSugerencia: boolean) => {
    manejarCambioTraduccion(clave, valor, esSugerencia);
  }, [manejarCambioTraduccion]);

  const alClickGuardar = useCallback(async () => {
    if (!editorRef.current) return;
    setGuardando(true);
    setErroresValidacion([]);

    const borrador = editorRef.current.publicarBorrador();
    if (!borrador) {
      setErroresValidacion(["No hay edición abierta"]);
      setGuardando(false);
      return;
    }

    const resultado = almacen.guardarPaquete(borrador);
    if (!resultado.ok) {
      setErroresValidacion([resultado.motivo]);
    }
    setGuardando(false);
  }, [almacen]);

  const alClickExportar = useCallback(async () => {
    if (!paquete) return;
    const { nombreDeArchivo } = await import("@/lib/idiomas/paquete/formato");
    const blob = new Blob([JSON.stringify(paquete, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreDeArchivo(paquete);
    a.click();
    URL.revokeObjectURL(url);
  }, [paquete]);

  const alClickCerrar = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.cerrarEdicion();
      editorRef.current = null;
    }
    onCerrar?.();
  }, [onCerrar]);

  if (cargando || !paquete) {
    return (
      <div className="flex items-center justify-center min-h-[200px] max-w-[360px] mx-auto" data-testid="editor-paquete">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-300" aria-hidden />
      </div>
    );
  }

  const totalEntradas = Object.keys(paquete.entradas).length;
  const completadasCount = Object.entries(paquete.entradas).filter(([, v]) => {
    const esSugerencia = esSugerenciaAutomatica(v);
    const valorLimpio = esSugerencia ? limpiarSugerencia(v) : v;
    return Boolean(valorLimpio) && !esSugerencia;
  }).length;
  const pendientesCount = totalEntradas - completadasCount;
  const progreso = formatearProgreso(completadasCount, totalEntradas);

  const entradasOrdenadas = Object.entries(paquete.entradas).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="max-w-[360px] mx-auto space-y-4" data-testid="editor-paquete" role="region" aria-label={`Editor de ${paquete.nombre}`}>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={alClickCerrar}
          className="min-h-[44px] min-w-[44px] cursor-pointer rounded-lg bg-white/5 p-2 text-white/70 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors shrink-0"
          aria-label="Cerrar edición"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <h2 className="font-semibold truncate">{paquete.nombre}</h2>
          <p className="text-[11px] text-white/60">{progreso}</p>
        </div>
        <div className="shrink-0 w-10" />
      </div>

      {erroresValidacion.length > 0 && (
        <div className="rounded-lg border border-red-300/30 bg-red-300/10 p-3 text-sm text-red-200" role="alert">
          <p className="font-medium">No se puede guardar:</p>
          <ul className="mt-1 list-disc list-inside space-y-1">
            {erroresValidacion.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-white/15 bg-black/40 p-3 space-y-3 max-h-[400px] overflow-y-auto" ref={listaRef}>
        {entradasOrdenadas.length === 0 && (
          <p className="text-center text-white/50 text-sm py-4">No hay claves en este paquete.</p>
        )}
        {entradasOrdenadas.map(([clave, valor]) => {
          const esSugerencia = esSugerenciaAutomatica(valor);
          const valorMostrar = esSugerencia ? limpiarSugerencia(valor) : valor;
          const yaTraducida = Boolean(valorMostrar) && !esSugerencia;
          const sugerenciaAceptada = sugerenciasAceptadas.has(clave);

          return (
            <div key={clave} className="space-y-2">
              <label htmlFor={`traduccion-${clave}`} className="block text-[11px] font-medium text-white/80">
                {clave}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`traduccion-${clave}`}
                  type="text"
                  value={valorMostrar}
                  onChange={(e) => manejarCambioTraduccion(clave, e.target.value, esSugerencia && !sugerenciaAceptada)}
                  onBlur={(e) => alBlurTraduccion(clave, e.target.value, esSugerencia && !sugerenciaAceptada)}
                  placeholder={esSugerencia && !sugerenciaAceptada ? "Aceptar sugerencia…" : "Escribir traducción…"}
                  className="flex-1 min-h-[44px] min-w-0 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-cyan-300"
                  aria-label={`Traducción de "${clave}"`}
                  data-testid={`input-${clave}`}
                />
                {esSugerencia && !sugerenciaAceptada && (
                  <span className="shrink-0 rounded bg-amber-300/20 px-2 py-0.5 text-[10px] text-amber-300">Sugerencia automática</span>
                )}
                {yaTraducida && !esSugerencia && (
                  <span className="shrink-0 rounded bg-emerald-300/20 px-2 py-0.5 text-[10px] text-emerald-300">Completada</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-white/50">
        <span>Completadas: {completadasCount}</span>
        <span>Pendientes: {pendientesCount}</span>
      </div>

      <div className="flex gap-2" role="group" aria-label="Acciones del editor">
        <button
          type="button"
          onClick={alClickGuardar}
          disabled={guardando}
          className="flex-1 min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-emerald-300/40 bg-emerald-300/10 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-300/20 focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="h-4 w-4 shrink-0" aria-hidden />
          <span>Guardar borrador</span>
          {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={alClickExportar}
          className="flex-1 min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-300/20 focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden />
          <span>Exportar archivo</span>
        </button>
        <button
          type="button"
          onClick={alClickCerrar}
          className="flex-1 min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <X className="h-4 w-4 shrink-0" aria-hidden />
          <span>Cerrar edición</span>
        </button>
      </div>
    </div>
  );
}