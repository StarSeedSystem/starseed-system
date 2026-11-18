"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Save, X } from "lucide-react";
import { crearEditor, type Editor } from "@/lib/idiomas/paquete/editor";
import type { AlmacenPaquetes } from "@/lib/idiomas/paquete/almacen";

export interface EditorPaqueteProps {
  codigo: string;
  nombre: string;
  almacen: AlmacenPaquetes;
  sugerencias?: Record<string, string>;
  pendientesIniciales?: string[];
  entradasCompletadas?: Record<string, string>;
}

const CLASES = {
  contenedor: "flex flex-col h-full",
  cabecera: "flex items-center justify-between gap-2 p-3 border-b border-white/10",
  titulo: "text-lg font-semibold text-white",
  progreso: "text-sm text-white/60",
  lista: "flex-1 overflow-y-auto p-3 space-y-2",
  campo: "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
  boton: "min-h-[44px] min-w-[44px] cursor-pointer rounded-lg p-2",
  footer: "flex gap-2 p-3 border-t border-white/10",
} as const;

export function EditorPaquete({ codigo, nombre, almacen, sugerencias = {}, pendientesIniciales = [], entradasCompletadas = {} }: EditorPaqueteProps) {
  const [mostrarVacio, setMostrarVacio] = useState(pendientesIniciales.length === 0 && Object.keys(entradasCompletadas).length === 0);
  const [guardando, setGuardando] = useState(false);
  const [entradas, setEntradas] = useState<Record<string, string>>({});
  const [estadoAbrir, setEstadoAbrir] = useState<{ abierto: boolean; codigo?: string; nombre?: string }>({ abierto: false });

  const editor = useMemo(() => crearEditor(almacen as any), [almacen]);

  useEffect(() => {
    if (!estadoAbrir.abierto || estadoAbrir.codigo !== codigo || estadoAbrir.nombre !== nombre) {
      setEstadoAbrir({ abierto: true, codigo, nombre });
    }
    const nuevasEntradas: Record<string, string> = {};
    for (const clave of pendientesIniciales) {
      nuevasEntradas[clave] = entradasCompletadas[clave] || "";
    }
    for (const [clave, valor] of Object.entries(entradasCompletadas)) {
      if (!pendientesIniciales.includes(clave)) {
        nuevasEntradas[clave] = valor;
      }
    }
    setEntradas(nuevasEntradas);
  }, [codigo, nombre, estadoAbrir, pendientesIniciales, entradasCompletadas]);

  const pendientes = Object.entries(entradas).filter(([, v]) => !v).map(([k]) => k);
  const traducidas = Object.entries(entradas).filter(([, v]) => v).map(([k]) => k);
  const progreso = `${traducidas.length} de ${pendientes.length + traducidas.length}`;

  useEffect(() => {
    if (pendientes.length > 0) {
      setMostrarVacio(false);
    }
  }, [pendientes]);

  const alCambiar = useCallback((clave: string, valor: string) => {
    setEntradas((prev) => ({ ...prev, [clave]: valor }));
  }, []);

  const handleGuardar = async () => {
    setGuardando(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setGuardando(false);
  };

  const handleExportar = () => {
    const paquete = {
      formato: "starseed-idioma",
      version: 1,
      codigo,
      nombre,
      dir: "ltr",
      autor: { nombre: "Usuario" },
      creado: new Date().toISOString(),
      revisado: { estado: "automatico" as const },
      licencia: "MIT",
      base: "es",
      entradas,
      hash: "",
    };
    const blob = new Blob([JSON.stringify(paquete, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${codigo}.starseed-lang.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCerrar = () => {
    setEstadoAbrir({ abierto: false });
    setMostrarVacio(true);
  };

  if (mostrarVacio) {
    return (
      <div className={CLASES.contenedor}>
        <div className={CLASES.cabecera}>
          <h2 className={CLASES.titulo}>{nombre}</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white/50">No hay pendientes</p>
        </div>
      </div>
    );
  }

  return (
    <div className={CLASES.contenedor}>
      <div className={CLASES.cabecera}>
        <div>
          <h2 className={CLASES.titulo}>{nombre}</h2>
          <span className={CLASES.progreso}>{progreso} pendientes</span>
        </div>
      </div>

      <div className={CLASES.lista}>
        {pendientes.map((clave) => (
          <div key={clave} className="flex items-center gap-2">
            <input
              type="text"
              value={entradas[clave]}
              onChange={(e) => alCambiar(clave, e.target.value)}
              placeholder={sugerencias[clave] ? `Sugerencia: ${sugerencias[clave]}` : "Traduce..."}
              className={CLASES.campo}
            />
            {sugerencias[clave] && (
              <span className="text-xs text-amber-300" title="Sugerencia automática">
                AI
              </span>
            )}
          </div>
        ))}
      </div>

      {traducidas.length > 0 && (
        <div className="border-t border-white/10 p-3">
          <p className="text-sm text-white/60">Traducidas: {traducidas.slice(0, 3).join(", ")}
            {traducidas.length > 3 && `, ...y ${traducidas.length - 3} más`}
          </p>
        </div>
      )}

      <div className={CLASES.footer}>
        <button
          type="button"
          onClick={handleCerrar}
          className={CLASES.boton}
          aria-label="Cerrar edición"
        >
          <X className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={handleGuardar}
          disabled={guardando || pendientes.length > 0}
          className="flex items-center gap-2 rounded-lg border border-emerald-300/40 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-300/20 focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          aria-label="Guardar borrador"
        >
          <Save className="h-4 w-4" />
          Guardar borrador
        </button>
        <button
          type="button"
          onClick={handleExportar}
          className="flex items-center gap-2 rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-300 hover:bg-cyan-300/20 focus-visible:ring-2 focus-visible:ring-cyan-300 cursor-pointer"
          aria-label="Exportar archivo"
        >
          <Download className="h-4 w-4" />
          Exportar
        </button>
      </div>
    </div>
  );
}