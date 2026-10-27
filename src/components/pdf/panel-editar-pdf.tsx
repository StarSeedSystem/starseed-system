"use client";

// ==========================================================================
// PanelEditarPdf — PDF1020B (architecture/repos-libreria-1020d.md §2)
// Panel reutilizable para editar un PDF con Stirling-PDF donde se abra
// (vista de archivos, Protomolécula, Astraura, publicaciones). Enseña SOLO
// las `operacionesDisponibles` (de la descripción de API de la instancia, o
// el catálogo avisándolo), pide los parámetros mínimos, ejecuta, previsualiza
// el resultado y lo entrega con `alGuardar(blob, nombre)` como VERSIÓN NUEVA
// — nunca encima del original. Estados honestos: sin servidor, cargando y
// error legible. La red vive en `clientePdfReal` (src/lib/pdf/cliente-pdf.ts);
// las pruebas inyectan el cliente simulado. Sin `node:*`; acesible, dianas
// de 44 px, cursor-pointer y estilo de la marca. Español con acentos.
// ==========================================================================

import React, { useEffect, useState } from "react";
import { Loader2, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { clientePdfReal } from "@/lib/pdf/cliente-pdf";
import { CuerpoElegir, type PropsElegir } from "@/components/pdf/cuerpo-editar-pdf";
import {
  ENLACE_GITHUB_STIRLING,
  MENSAJE_SIN_SERVIDOR,
  MENSAJE_DESCRIPCION_INDISPONIBLE,
  camposFaltantes,
  nombreVersionNueva,
  valoresIniciales,
  type ArchivoPdf,
  type ClientePdf,
  type ConfigStirlingPdf,
  type OperacionPdf,
  type ValoresPdf,
} from "@/lib/pdf/operaciones-pdf";

export interface PropsPanelEditarPdf {
  archivo: ArchivoPdf;
  alGuardar: (blob: Blob, nombre: string) => void | Promise<void>;
  cfg?: ConfigStirlingPdf;
  abierto?: boolean;
  alCerrar?: () => void;
  /** Inyección para pruebas: cliente simulado sin red. */
  cliente?: ClientePdf;
  /** Operaciones ya conocidas por quien abre el panel (opcional). */
  operacionesDisponibles?: OperacionPdf[];
}

type Fase = "arrancando" | "sin-servidor" | "elegir" | "ejecutando" | "previsualizar" | "error";

interface ResOk { blob: Blob; contentType: string; url: string }

const BOTON =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] " +
  "px-3 min-h-[44px] text-sm font-semibold text-white/80 transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white";

export function PanelEditarPdf({
  archivo, alGuardar, cfg, abierto = true, alCerrar, cliente: clienteProp, operacionesDisponibles,
}: PropsPanelEditarPdf) {
  const cliente = clienteProp ?? clientePdfReal();
  const [fase, setFase] = useState<Fase>("arrancando");
  const [operaciones, setOperaciones] = useState<OperacionPdf[]>([]);
  const [aviso, setAviso] = useState("");
  const [op, setOp] = useState<OperacionPdf | null>(null);
  const [resultado, setResultado] = useState<ResOk | null>(null);
  const [urlObj, setUrlObj] = useState("");
  const [nombre, setNombre] = useState("");
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    if (!abierto || fase !== "arrancando") return;
    let vivo = true;
    cliente.preparar(cfg ?? {}).then((p) => {
      if (!vivo) return;
      if (!p.ok && !operacionesDisponibles) { setMensaje(MENSAJE_SIN_SERVIDOR); setFase("sin-servidor"); return; }
      setOperaciones(p.operaciones ?? []);
      setAviso(p.ok ? (p.aviso ?? "") : MENSAJE_SIN_SERVIDOR);
      setFase("elegir");
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, cliente, cfg]);

  useEffect(() => {
    if (!resultado) { setUrlObj(""); return; }
    const url = URL.createObjectURL(resultado.blob);
    setUrlObj(url);
    return () => URL.revokeObjectURL(url);
  }, [resultado]);

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <section
        role="dialog" aria-modal="true" aria-label="Editar PDF" aria-busy={fase === "arrancando" || fase === "ejecutando"}
        className="w-full max-w-md max-h-[90vh] overflow-auto rounded-2xl border border-white/10 bg-[#12121a] p-4 shadow-2xl"
      >
        <header className="mb-3 flex items-center gap-2">
          <Wrench className="size-5 text-emerald-300" />
          <h2 className="text-sm font-bold text-white/90">Editar PDF</h2>
          {archivo.nombre && <span className="truncate text-[11px] text-white/50">{archivo.nombre}</span>}
          <button type="button" onClick={() => alCerrar?.()} aria-label="Cerrar"
            className="ml-auto grid size-11 cursor-pointer place-items-center rounded-lg border border-white/10 text-white/60 hover:bg-white/10 hover:text-white">
            <X className="size-4" />
          </button>
        </header>
        {fase === "arrancando" && <p className="flex items-center gap-2 py-8 text-sm text-white/60"><Loader2 className="size-5 animate-spin" /> Estoy buscando tu servidor de Stirling-PDF…</p>}
        {fase === "sin-servidor" && <p role="status" className="py-4 text-sm text-white/75">{MENSAJE_SIN_SERVIDOR}</p>}
        {fase === "ejecutando" && <p className="flex items-center gap-2 py-8 text-sm text-white/60"><Loader2 className="size-5 animate-spin" /> Estoy ejecutando la operación…</p>}
        {fase === "error" && (
          <div className="space-y-3" role="alert">
            <p className="text-sm text-rose-200">{mensaje}</p>
            <button type="button" className={cn(BOTON, "w-full")} onClick={() => { setOp(null); setFase("elegir"); }}>Volver a la lista</button>
          </div>
        )}
        {fase === "elegir" && <CuerpoElegir
          operaciones={operacionesDisponibles ?? operaciones} aviso={aviso} archivo={archivo} cfg={cfg ?? {}}
          cliente={cliente} op={op} valores={valores}
          onOp={(o) => { setOp(o); setValores(valoresIniciales(o)); }}
          onValores={setValores}
          alFallo={(m) => { setMensaje(m); setFase("error"); }}
          alOk={(b, t) => { setResultado({ blob: b, contentType: t, url: "" }); setNombre(nombreVersionNueva(archivo.nombre || "documento.pdf", t)); setFase("previsualizar"); }}
          alVolver={() => setOp(null)}
        />}
        {fase === "previsualizar" && resultado && (
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-white/50">Resultado (versión nueva)</p>
            {resultado.url && (
              <object data={resultado.url} type={resultado.contentType} className="h-72 w-full rounded-xl border border-white/10 bg-white">
                <span className="grid place-items-center p-6 text-xs text-white/60">Tu navegador no puede incrustar este PDF.</span>
              </object>
            )}
            <label className="block text-xs font-semibold text-white/70" htmlFor="nombre-version-nueva">Nombre de la versión nueva</label>
            <input id="nombre-version-nueva" value={nombre} onChange={(e) => setNombre(e.target.value)}
              className="h-11 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white/90 focus:border-emerald-400/50" />
            <button type="button" className={cn(BOTON, "w-full border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25")}
              onClick={() => { void (async () => { try { await alGuardar(resultado.blob, nombre); alCerrar?.(); } catch { setMensaje("No se pudo guardar la versión nueva."); setFase("error"); } })(); }}>
              Guardar versión nueva
            </button>
          </div>
        )}
        <footer className="mt-3 border-t border-white/5 pt-2">
          <a href={ENLACE_GITHUB_STIRLING} target="_blank" rel="noopener noreferrer" title="Herramientas PDF self-hosted: unir, dividir, convertir, OCR, firmar (Stirling-PDF)"
            className="inline-flex items-center gap-1.5 min-h-[44px] text-[11px] font-medium text-white/50 hover:text-white/80">
            Qué es Stirling-PDF
          </a>
        </footer>
      </section>
    </div>
  );
}
