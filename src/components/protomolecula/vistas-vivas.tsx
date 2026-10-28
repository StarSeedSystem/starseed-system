"use client";

/**
 * Protomolécula · VISTAS VIVAS (PM1010F1B, parte 3 de 3). Para cada átomo ACTIVO con vista
 * definida pinta un `MarcoAislado`; lo que la persona mueve DENTRO de la herramienta llega
 * al plan como una `Operacion` `exacta` con `origen: "mano"`. Lo que la herramienta
 * EXPORTA se ofrece como un enlace de descarga real: un Blob con el tipo del formato y
 * una URL de objeto que se revoca al cambiar o al desmontar.
 * Contrato: architecture/protomolecula.md §11.1
 */
import { useEffect, useState } from "react";

import { obtenerAtomo, type DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { AtomoEnUso, EstadoValores, ValorParametro } from "@/lib/protomolecula/tipos";

import { MarcoAislado } from "./marco-aislado";

/** Lo que una herramienta entrega para bajar: el formato y sus datos. */
export interface Exporte {
  formato: string;
  datos: unknown;
}

/** Un átomo activo con vista definida: el marco que pinta el panel. */
export interface VistaViva {
  atomoId: string;
  titulo: string;
  def: DefinicionAtomo;
}

/** Id de `Operacion`, igual que el resto de las superficies del panel. */
export function idOperacion(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Pura: un átomo activo cuya herramienta esté registrada y tenga vista; el resto, nada. */
export function vistaViva(a: AtomoEnUso): VistaViva | null {
  if (a.estado !== "activo") return null;
  const def = obtenerAtomo(a.herramientaId);
  if (!def?.vista) return null;
  return { atomoId: a.id, titulo: a.titulo ?? def.nombre, def };
}

export interface VistasVivasProps {
  activos: AtomoEnUso[];
  valores: EstadoValores;
  /** Crea y aplica la `Operacion` de ese átomo: alCambioDe(atomoId)(parametroId, valor). */
  alCambioDe: (atomoId: string) => (parametroId: string, valor: ValorParametro) => void;
  alExportar?: (formato: string, datos: unknown) => void;
}

/** Un `MarcoAislado` por átomo activo con vista; sin vistas activas no pinta nada. */
export function VistasVivas({ activos, valores, alCambioDe, alExportar }: VistasVivasProps) {
  const vivas = activos.map(vistaViva).filter((v): v is VistaViva => v !== null);
  if (vivas.length === 0) return null;
  return (
    <div aria-label="Vistas de las herramientas" className="flex flex-col gap-3">
      {vivas.map((v) => (
        <section key={v.atomoId} aria-label={`Vista de ${v.titulo}`} className="flex flex-col gap-2 rounded-md border p-2">
          <h3 className="text-sm font-medium text-muted-foreground">Vista de {v.titulo}</h3>
          <MarcoAislado definicion={v.def} atomoId={v.atomoId} valores={valores} alCambio={alCambioDe(v.atomoId)} alExportar={alExportar} />
        </section>
      ))}
    </div>
  );
}

const TIPOS_FORMATO: Record<string, string> = {
  json: "application/json", txt: "text/plain", csv: "text/csv", wav: "audio/wav", mp3: "audio/mpeg",
  ogg: "audio/ogg", png: "image/png", svg: "image/svg+xml", glb: "model/gltf-binary",
};

/** El tipo MIME del formato exportado; lo desconocido baja como binario. */
export function tipoDeFormato(formato: string): string {
  return TIPOS_FORMATO[formato.toLowerCase()] ?? "application/octet-stream";
}

/** El contenido del Blob: un texto tal cual, el resto como JSON legible. */
export function contenidoDe(datos: unknown): string {
  if (typeof datos === "string") return datos;
  try {
    return JSON.stringify(datos, null, 2) ?? "";
  } catch {
    return String(datos);
  }
}

const nombreSeguro = (formato: string): string => `protomolecula.${formato.replace(/[^a-z0-9._-]/gi, "") || "bin"}`;

export interface DescargaExporteProps {
  exporte: Exporte;
}

/** El enlace «Descargar» que ofrece el panel ante un `exportar` de una herramienta. */
export function DescargaExporte({ exporte }: DescargaExporteProps) {
  const [enlace, setEnlace] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    try {
      url = URL.createObjectURL(new Blob([contenidoDe(exporte.datos)], { type: tipoDeFormato(exporte.formato) }));
      setEnlace(url);
    } catch {
      setEnlace(null);
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [exporte]);
  if (!enlace) return null;
  return (
    <p className="text-sm">
      <a href={enlace} download={nombreSeguro(exporte.formato)} className="cursor-pointer text-primary underline">
        Descargar {exporte.formato}
      </a>
    </p>
  );
}
