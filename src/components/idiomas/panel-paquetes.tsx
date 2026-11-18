"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Download, FileText, Loader2, Plus, Trash2, X } from "lucide-react";
import type { PaqueteIdioma } from "@/lib/idiomas/paquete/formato";
import type { AlmacenPaquetes } from "@/lib/idiomas/paquete/almacen";
import { mapearClaves } from "@/lib/idiomas/paquete/mapear";
import { validarPaquete } from "@/lib/idiomas/paquete/validar";

export interface PanelPaquetesIdiomaProps {
  fuente: Record<string, unknown> | string[];
  leerArchivo?: (archivo: File) => Promise<string>;
  digest?: string;
  almacen?: AlmacenPaquetes;
}

const EXTENSIONES_SOPORTADAS = [
  ".starseed-lang.json",
  ".json",
  ".po",
  ".pot",
  ".xlf",
  ".xliff",
  ".properties",
  ".strings",
  ".xml",
  ".csv",
  ".tsv",
] as const;

type ExtensionSoportada = (typeof EXTENSIONES_SOPORTADAS)[number];

function esExtensionSoportada(nombre: string): ExtensionSoportada | null {
  const lower = nombre.toLowerCase();
  for (const ext of EXTENSIONES_SOPORTADAS) {
    if (lower.endsWith(ext)) return ext;
  }
  return null;
}

function obtenerImportador(extension: ExtensionSoportada, texto: string): Promise<{ entradas: Record<string, string>; avisos: string[]; descartadas: Array<{ motivo: string; linea?: number }> }> {
  const modulos: Record<string, () => Promise<{ desdePo?: unknown; desdeProperties?: unknown; desdeXliff?: unknown; desdeStringsApple?: unknown; desdeStringsAndroid?: unknown; desdeJsonPlano?: unknown; desdeJsonAnidado?: unknown; desdeCsv?: unknown }>> = {
    ".po": () => import("@/lib/idiomas/paquete/importar-po"),
    ".pot": () => import("@/lib/idiomas/paquete/importar-po"),
    ".properties": () => import("@/lib/idiomas/paquete/importar-po"),
    ".xlf": () => import("@/lib/idiomas/paquete/importar-xml-strings"),
    ".xliff": () => import("@/lib/idiomas/paquete/importar-xml-strings"),
    ".strings": () => import("@/lib/idiomas/paquete/importar-xml-strings"),
    ".xml": () => import("@/lib/idiomas/paquete/importar-xml-strings"),
    ".json": () => import("@/lib/idiomas/paquete/importar-json-csv"),
    ".csv": () => import("@/lib/idiomas/paquete/importar-json-csv"),
    ".tsv": () => import("@/lib/idiomas/paquete/importar-json-csv"),
    ".starseed-lang.json": () => import("@/lib/idiomas/paquete/importar-json-csv"),
  };

  const importar = modulos[extension];
  if (!importar) throw new Error(`No hay importador para ${extension}`);

  return (async () => {
    const mod = await importar();
    switch (extension) {
      case ".po":
      case ".pot":
        return mod.desdePo(texto) as Promise<{ entradas: Record<string, string>; avisos: string[]; descartadas: Array<{ motivo: string; linea?: number }> }>;
      case ".properties":
        return mod.desdeProperties(texto) as Promise<{ entradas: Record<string, string>; avisos: string[]; descartadas: Array<{ motivo: string; linea?: number }> }>;
      case ".xlf":
      case ".xliff":
        return mod.desdeXliff(texto) as Promise<{ entradas: Record<string, string>; avisos: string[]; descartadas: Array<{ motivo: string; linea?: number }> }>;
      case ".strings":
        return mod.desdeStringsApple(texto) as Promise<{ entradas: Record<string, string>; avisos: string[]; descartadas: Array<{ motivo: string; linea?: number }> }>;
      case ".xml":
        return mod.desdeStringsAndroid(texto) as Promise<{ entradas: Record<string, string>; avisos: string[]; descartadas: Array<{ motivo: string; linea?: number }> }>;
      case ".starseed-lang.json":
        return mod.desdeJsonPlano(texto) as Promise<{ entradas: Record<string, string>; avisos: string[]; descartadas: Array<{ motivo: string; linea?: number }> }>;
      case ".json":
        return mod.desdeJsonAnidado(texto) as Promise<{ entradas: Record<string, string>; avisos: string[]; descartadas: Array<{ motivo: string; linea?: number }> }>;
      case ".csv":
        return mod.desdeCsv(texto, ",") as Promise<{ entradas: Record<string, string>; avisos: string[]; descartadas: Array<{ motivo: string; linea?: number }> }>;
      case ".tsv":
        return mod.desdeCsv(texto, "\t") as Promise<{ entradas: Record<string, string>; avisos: string[]; descartadas: Array<{ motivo: string; linea?: number }> }>;
    }
  })();
}

interface PaqueteConEstado extends PaqueteIdioma {
  etiquetaEstado: string;
}

function formatearFecha(fecha: string): string {
  try {
    return new Date(fecha).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return fecha;
  }
}

function obtenerEtiquetaEstado(paquete: PaqueteIdioma): string {
  if (paquete.revisado.estado === "revisado" && paquete.revisado.por && paquete.revisado.fecha) {
    return `Revisado por ${paquete.revisado.por} el ${formatearFecha(paquete.revisado.fecha)}`;
  }
  if (paquete.revisado.estado === "revisado" && paquete.revisado.por) {
    return `Revisado por ${paquete.revisado.por}`;
  }
  return "Traducción automática";
}

export function PanelPaquetesIdioma({ fuente, leerArchivo, digest = "auto", almacen }: PanelPaquetesIdiomaProps) {
  const [paquetes, setPaquetes] = useState<PaqueteConEstado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [instalando, setInstalando] = useState(false);
  const [mostrarInstalar, setMostrarInstalar] = useState(false);
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(null);
  const [importacion, setImportacion] = useState<{ entradas: Record<string, string>; avisos: string[]; descartadas: Array<{ motivo: string; linea?: number }> } | null>(null);
  const [codigoIdioma, setCodigoIdioma] = useState("");
  const [nombreIdioma, setNombreIdioma] = useState("");
  const [mapeo, setMapeo] = useState<{ casadas: number; total: number; porcentaje: number } | null>(null);
  const [erroresValidacion, setErroresValidacion] = useState<string[]>([]);
  const [confirmarQuitar, setConfirmarQuitar] = useState<string | null>(null);
  const [ayudaVisible, setAyudaVisible] = useState(false);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  const store = almacen ?? (typeof window !== "undefined" ? (window as unknown as { __almacenPaquetes?: AlmacenPaquetes }).__almacenPaquetes : undefined);

  useEffect(() => {
    if (!store) {
      setPaquetes([]);
      setCargando(false);
      return;
    }
    const actualizar = () => {
      const lista = store.listarPaquetes().map((p) => ({ ...p, etiquetaEstado: obtenerEtiquetaEstado(p) }));
      setPaquetes(lista);
      setCargando(false);
    };
    actualizar();
    window.addEventListener("starseed:idiomas-paquetes", actualizar);
    return () => window.removeEventListener("starseed:idiomas-paquetes", actualizar);
  }, [store]);

  const manejarArchivo = useCallback(async (archivo: File) => {
    if (!leerArchivo) {
      setErroresValidacion(["Falta función leerArchivo"]);
      return;
    }
    setArchivoSeleccionado(archivo);
    setInstalando(true);
    setErroresValidacion([]);
    setImportacion(null);
    setMapeo(null);
    setCodigoIdioma("");
    setNombreIdioma("");

    try {
      const texto = await leerArchivo(archivo);
      const ext = esExtensionSoportada(archivo.name);
      if (!ext) throw new Error("Formato no soportado");

      if (ext === ".starseed-lang.json") {
        const mod = await import("@/lib/idiomas/paquete/importar-json-csv");
        const resultado = await mod.desdeJsonPlano(texto);
        setImportacion({ entradas: resultado.entradas, avisos: [], descartadas: resultado.descartadas });
        const pkg = JSON.parse(texto);
        setCodigoIdioma(pkg.codigo ?? "");
        setNombreIdioma(pkg.nombre ?? "");
      } else {
        const resultado = await obtenerImportador(ext, texto);
        setImportacion(resultado);
        if (ext !== ".json" && ext !== ".csv" && ext !== ".tsv") {
          setMostrarInstalar(true);
        }
      }
    } catch (e) {
      setErroresValidacion([e instanceof Error ? e.message : "Error al leer el archivo"]);
    } finally {
      setInstalando(false);
    }
  }, [leerArchivo]);

  const alCambiarArchivo = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (archivo) manejarArchivo(archivo);
  }, [manejarArchivo]);

  const alClickInstalar = useCallback(() => {
    inputArchivoRef.current?.click();
  }, []);

  const calcularMapeo = useCallback(() => {
    if (!importacion) return;
    const res = mapearClaves(importacion.entradas, fuente);
    setMapeo({ casadas: res.casadas, total: Object.keys(importacion.entradas).length, porcentaje: res.porcentaje });
  }, [importacion, fuente]);

  useEffect(() => {
    if (importacion && (codigoIdioma || nombreIdioma)) calcularMapeo();
  }, [importacion, codigoIdioma, nombreIdioma, calcularMapeo]);

  const validarEInstalar = useCallback(async () => {
    if (!importacion || !codigoIdioma || !nombreIdioma || !store) return;
    setInstalando(true);
    setErroresValidacion([]);

    const paqueteBruto = {
      formato: "starseed-idioma",
      version: 1,
      codigo: codigoIdioma,
      nombre: nombreIdioma,
      dir: "ltr" as const,
      autor: { nombre: "Usuario" },
      creado: new Date().toISOString(),
      revisado: { estado: "automatico" as const },
      licencia: "MIT",
      base: "es",
      entradas: importacion.entradas,
      hash: "",
    };

    const resultado = await validarPaquete(paqueteBruto, { digest });
    if (!resultado.ok) {
      setErroresValidacion(resultado.errores);
      setInstalando(false);
      return;
    }

    const { construirPaquete } = await import("@/lib/idiomas/paquete/formato");
    const paquete = await construirPaquete({
      codigo: codigoIdioma,
      nombre: nombreIdioma,
      dir: "ltr",
      autor: { nombre: "Usuario" },
      licencia: "MIT",
      entradas: importacion.entradas,
    }, true);

    const guardado = store.guardarPaquete(paquete);
    if (!guardado.ok) {
      setErroresValidacion([guardado.motivo]);
    } else {
      setMostrarInstalar(false);
      setArchivoSeleccionado(null);
      setImportacion(null);
      setCodigoIdioma("");
      setNombreIdioma("");
      setMapeo(null);
      if (inputArchivoRef.current) inputArchivoRef.current.value = "";
    }
    setInstalando(false);
  }, [importacion, codigoIdioma, nombreIdioma, store, digest]);

  const quitarPaquete = useCallback((codigo: string) => {
    if (!store) return;
    setConfirmarQuitar((actual) => {
      if (actual === codigo) {
        store.quitarPaquete(codigo);
        return null;
      }
      return codigo;
    });
  }, [store]);

  const exportarPaquete = useCallback(async (paquete: PaqueteIdioma) => {
    const { nombreDeArchivo } = await import("@/lib/idiomas/paquete/formato");
    const blob = new Blob([JSON.stringify(paquete, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreDeArchivo(paquete);
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  if (cargando) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-300" aria-hidden />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4" data-testid="panel-paquetes">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Mis idiomas</h2>
        <button
          type="button"
          onClick={() => setAyudaVisible(!ayudaVisible)}
          className="min-h-[44px] min-w-[44px] cursor-pointer rounded-lg bg-white/5 p-2 text-white/70 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors"
          aria-label={ayudaVisible ? "Ocultar ayuda" : "Mostrar ayuda"}
          aria-expanded={ayudaVisible}
        >
          <FileText className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {ayudaVisible && (
        <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-200" role="region" aria-label="Ayuda">
          <p>Un archivo de idioma es solo texto: no puede ejecutar nada.</p>
          <p className="mt-1">Formatos aceptados: .starseed-lang.json, .json, .po, .xlf/.xliff, .properties, .strings, .xml, .csv, .tsv</p>
        </div>
      )}

      <button
        type="button"
        onClick={alClickInstalar}
        disabled={instalando}
        className="w-full min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-4 py-3 text-left text-sm text-white outline-none transition-colors hover:bg-cyan-300/20 focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus className="h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
        <span>Instalar desde archivo</span>
        <input
          ref={inputArchivoRef}
          type="file"
          accept={EXTENSIONES_SOPORTADAS.join(",")}
          onChange={alCambiarArchivo}
          className="sr-only"
          aria-label="Seleccionar archivo de idioma"
          disabled={instalando}
        />
        {instalando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      </button>

      {archivoSeleccionado && importacion && (
        <div className="rounded-xl border border-white/15 bg-black/40 p-4 space-y-3" data-testid="instalacion-pendiente">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-cyan-300" aria-hidden />
            <span className="truncate">{archivoSeleccionado.name}</span>
            <span className="ml-auto text-[11px] text-white/50">{(archivoSeleccionado.size / 1024).toFixed(1)} KB</span>
          </div>

          {importacion.avisos.length > 0 && (
            <div className="rounded-lg bg-amber-300/10 border border-amber-300/30 p-2 text-[11px] text-amber-200">
              {importacion.avisos.map((a, i) => <p key={i}><AlertTriangle className="h-3 w-3 inline-block mr-1" aria-hidden />{a}</p>)}
            </div>
          )}

          {importacion.descartadas.length > 0 && (
            <details className="rounded-lg border border-white/10 bg-white/5 p-2">
              <summary className="cursor-pointer text-[11px] text-white/60">{importacion.descartadas.length} entradas descartadas</summary>
              <ul className="mt-1 text-[11px] text-white/50">
                {importacion.descartadas.slice(0, 10).map((d, i) => (
                  <li key={i}><span className="font-mono">{d.clave ?? `línea ${d.linea}`}</span>: {d.motivo}</li>
                ))}
                {importacion.descartadas.length > 10 && <li>… y {importacion.descartadas.length - 10} más</li>}
              </ul>
            </details>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor="codigo-idioma" className="block text-[11px] text-white/60 mb-1">Código de idioma (BCP-47)</label>
              <input
                id="codigo-idioma"
                type="text"
                value={codigoIdioma}
                onChange={(e) => setCodigoIdioma(e.target.value)}
                placeholder="ej. eo, pt-BR, zh-Hans"
                className="w-full min-h-[44px] rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-cyan-300"
                aria-describedby="ayuda-codigo"
              />
              <p id="ayuda-codigo" className="mt-1 text-[11px] text-white/50">Código ISO 639-1/BCP-47, p.ej. <code className="font-mono">eo</code>, <code className="font-mono">pt-BR</code></p>
            </div>
            <div>
              <label htmlFor="nombre-idioma" className="block text-[11px] text-white/60 mb-1">Nombre del idioma</label>
              <input
                id="nombre-idioma"
                type="text"
                value={nombreIdioma}
                onChange={(e) => setNombreIdioma(e.target.value)}
                placeholder="ej. Esperanto, Portugués (Brasil)"
                className="w-full min-h-[44px] rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-cyan-300"
              />
            </div>
          </div>

          {mapeo && (
            <div className="rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-3 text-sm">
              <p className="font-medium text-emerald-300">Casaron {mapeo.casadas} de {mapeo.total} textos ({mapeo.porcentaje} %)</p>
              <p className="text-[11px] text-white/60 mt-1">Las claves que casen se usarán como traducción; el resto quedará pendiente.</p>
            </div>
          )}

          {erroresValidacion.length > 0 && (
            <div className="rounded-lg border border-red-300/30 bg-red-300/10 p-3 text-sm text-red-200" role="alert">
              <p className="font-medium">No se puede instalar:</p>
              <ul className="mt-1 list-disc list-inside space-y-1">
                {erroresValidacion.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => { setArchivoSeleccionado(null); setImportacion(null); setMostrarInstalar(false); if (inputArchivoRef.current) inputArchivoRef.current.value = ""; }}
              className="flex-1 min-h-[44px] cursor-pointer rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={validarEInstalar}
              disabled={instalando || !codigoIdioma || !nombreIdioma}
              className="flex-1 min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-emerald-300/40 bg-emerald-300/10 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-300/20 focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {instalando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <>Instalar <Check className="h-4 w-4" aria-hidden /></>}
            </button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-white/10" role="list" aria-label="Paquetes instalados" data-testid="lista-paquetes">
        {paquetes.length === 0 && (
          <li className="py-8 text-center text-white/50 text-sm">No hay paquetes instalados. Pulsa «Instalar desde archivo» para añadir uno.</li>
        )}
        {paquetes.map((paquete) => (
          <li key={paquete.codigo} className="py-3 flex items-center justify-between gap-3" data-testid={`paquete-${paquete.codigo}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium truncate">{paquete.nombre}</span>
                <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[11px] font-mono text-white/70">{paquete.codigo}</span>
                {paquete.dir === "rtl" && <span className="shrink-0 rounded bg-amber-300/20 px-1.5 py-0.5 text-[10px] text-amber-300">RTL</span>}
              </div>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-white/50 flex-wrap">
                <span>Autor: <span className="text-white/70">{paquete.autor.nombre}</span></span>
                <span>Licencia: <span className="text-white/70">{paquete.licencia}</span></span>
                <span className={paquete.revisado.estado === "revisado" ? "text-emerald-300" : "text-amber-300"}>{paquete.etiquetaEstado}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => exportarPaquete(paquete)}
                className="min-h-[44px] min-w-[44px] cursor-pointer rounded-lg bg-white/5 p-2 text-white/70 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors"
                aria-label={`Exportar ${paquete.nombre}`}
              >
                <Download className="h-5 w-5" aria-hidden />
              </button>
              {confirmarQuitar === paquete.codigo ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmarQuitar(null)}
                    className="min-h-[44px] min-w-[44px] cursor-pointer rounded-lg bg-white/5 p-2 text-white/70 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300"
                    aria-label="Cancelar"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => quitarPaquete(paquete.codigo)}
                    className="min-h-[44px] min-w-[44px] cursor-pointer rounded-lg bg-red-300/10 p-2 text-red-300 hover:bg-red-300/20 focus-visible:ring-2 focus-visible:ring-red-300"
                    aria-label={`Confirmar eliminar ${paquete.nombre}`}
                  >
                    <Trash2 className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => quitarPaquete(paquete.codigo)}
                  className="min-h-[44px] min-w-[44px] cursor-pointer rounded-lg bg-white/5 p-2 text-white/70 hover:bg-red-300/20 hover:text-red-300 focus-visible:ring-2 focus-visible:ring-red-300 transition-colors"
                  aria-label={`Quitar ${paquete.nombre}`}
                >
                  <Trash2 className="h-5 w-5" aria-hidden />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}