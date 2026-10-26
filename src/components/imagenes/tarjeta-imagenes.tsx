"use client";
/**
 * Tarjeta de la Protomolécula para las imágenes (IMG1011J). Contrato: architecture/astraura-imagenes.md §6.
 *
 * Muestra TODAS las opciones que devolvió una petición de imagen (capa, modelo, semilla, licencia y
 * atribución) y sigue donde toque: elegir (callback de quien la monta) o guardar en la Biblioteca.
 * Lo que falló se explica en los descartes: «basta de ilusiones». Renderiza SOLO con datos reales
 * (una galería con al menos una opción con url): sin galería, sin tarjeta. Cliente.
 */
import { useState } from "react";
import { toast } from "sonner";
import { FolderPlus, Sparkles } from "lucide-react";
import type { GaleriaImagenes } from "@/ai/astraura/media/proveedor-neuronas";
import { saveResource } from "@/lib/library-store";

type Opcion = GaleriaImagenes["opciones"][number];

const CAPA: Record<Opcion["capa"], string> = {
  dispositivo: "Este aparato",
  navegador: "La pestaña (WebGPU)",
  neurona: "Tu otra neurona",
  malla: "Tu malla",
  espacio: "Space de Hugging Face",
  "web-gratis": "Web gratis",
  externo: "Servicio de pago",
};

export interface TarjetaImagenesProps {
  /** La galería que devolvió `generateImage` (proveedor «neuronas»); sin opciones no se pinta nada. */
  galeria: GaleriaImagenes | null | undefined;
  titulo?: string;
  /** Qué hacer al elegirla (abrir en editor 3D, Protomolécula…); si falta, la opción no se puede elegir. */
  alUsar?: (url: string, opcion: Opcion) => void;
}

export function TarjetaImagenes({ galeria, titulo = "Imágenes: tus opciones", alUsar }: TarjetaImagenesProps) {
  const [guardadas, setGuardadas] = useState<Readonly<Record<string, true>>>({});
  if (!galeria || !Array.isArray(galeria.opciones) || !galeria.opciones.some((op) => op.url)) return null;
  const listas = galeria.opciones.filter((op) => op.url) as (Opcion & { url: string })[];

  function guardar(url: string) {
    try {
      saveResource({ kind: "image", title: "Imagen de Astraura (opción elegida)", url, origin: "Astraura · imágenes locales" });
      setGuardadas((g) => ({ ...g, [url]: true }));
      toast.success("Guardada en la Biblioteca.");
    } catch {
      toast.error("No se pudo guardar en la Biblioteca de este equipo.");
    }
  }

  return (
    <section className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80 backdrop-blur">
      <header className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-white/70" aria-hidden />
        <h3 className="text-sm font-semibold text-white">{titulo}</h3>
      </header>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {listas.map((op) => (
          <li key={`${op.capa}-${op.modelo ?? "web"}-${op.semilla}`} className="rounded-xl border border-white/10 bg-black/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={op.url} alt={`Opción generada en ${CAPA[op.capa]}`} className="aspect-square w-full rounded-t-xl object-contain" />
            <div className="space-y-1.5 p-2.5 text-xs">
              <p className="font-medium text-white">{CAPA[op.capa]}{op.modelo ? ` · ${op.modelo}` : ""}</p>
              <p className="text-white/60">Semilla {op.semilla}{op.segundos > 0 ? ` · ${op.segundos} s` : ""}</p>
              <p className="text-white/50">Licencia: {op.licencia}{op.atribucion ? ` · ${op.atribucion}` : ""}</p>
              <div className="flex gap-2 pt-1">
                {alUsar && (
                  <button type="button"
                    className="cursor-pointer rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white transition-colors duration-200 hover:bg-white/10"
                    onClick={() => alUsar(op.url, op)}>
                    Elegir
                  </button>
                )}
                <button type="button" disabled={guardadas[op.url] === true}
                  className="flex cursor-pointer items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white transition-colors duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => guardar(op.url)}>
                  <FolderPlus className="h-3.5 w-3.5" aria-hidden />
                  {guardadas[op.url] === true ? "Guardada" : "Guardar"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {galeria.error && <p role="alert" className="mt-2 text-xs text-amber-200/80">{galeria.error}</p>}
      {galeria.descartes.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-white/50">Lo que se descartó y por qué ({galeria.descartes.length})</summary>
          <ul className="mt-1 space-y-0.5 pl-4 text-xs text-white/50">
            {galeria.descartes.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

export default TarjetaImagenes;
