"use client";
/**
 * Tarjeta de opciones de imagen de Astraura (IMG1011J). Contrato: architecture/astraura-imagenes.md §6.
 *
 * Enseña TODAS las opciones que devolvió una petición real (capa, modelo, semilla, licencia y
 * atribución), deja elegir la que se quiera y guardarla en la Biblioteca. Lo que falló se explica en
 * los descartes: «basta de ilusiones». Si no hay ninguna opción con imagen, no pinta nada.
 */
import { useState } from "react";
import { toast } from "sonner";
import { FolderPlus, Sparkles } from "lucide-react";
import type { GaleriaImagenes, OpcionGaleria } from "@/ai/astraura/media/proveedor-neuronas";
import { galeriaPresentable } from "@/lib/imagenes/presentacion";
import { saveResource } from "@/lib/library-store";

export interface TarjetaImagenesProps {
  /** La galería que devolvió `generateImage` (proveedor «neuronas»). */
  galeria: GaleriaImagenes | null | undefined;
  titulo?: string;
  /** Qué hacer al elegir una opción (usar como referencia 3D, publicar…). Sin callback no hay «Elegir». */
  alUsar?: (url: string, opcion: OpcionGaleria) => void;
}

export default function TarjetaImagenes({
  galeria,
  titulo = "Imágenes: tus opciones",
  alUsar,
}: TarjetaImagenesProps) {
  const [guardadas, setGuardadas] = useState<Readonly<Record<string, true>>>({});
  const vista = galeriaPresentable(galeria);
  if (!vista) return null;

  function guardar(url: string): void {
    try {
      saveResource({
        kind: "image",
        title: "Imagen de Astraura (opción elegida)",
        url,
        origin: "Astraura · imágenes locales",
      });
      setGuardadas((g) => ({ ...g, [url]: true }));
      toast.success("Guardada en tu Biblioteca.");
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
        {vista.opciones.map((op) => (
          <li
            key={`${op.capa}-${op.modelo ?? "sin-modelo"}-${op.semilla}-${op.url}`}
            className="rounded-xl border border-white/10 bg-black/20"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={op.url}
              alt={op.titulo}
              className="aspect-square w-full rounded-t-xl object-contain"
            />
            <div className="space-y-1.5 p-2.5 text-xs">
              <p className="font-medium text-white">{op.titulo}</p>
              <p className="text-white/60">{op.semillaTexto}</p>
              <p className="text-white/50">{op.licenciaTexto}</p>
              <div className="flex gap-2 pt-1">
                {alUsar && (
                  <button
                    type="button"
                    onClick={() => alUsar(op.url, op)}
                    className="cursor-pointer rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white transition-colors duration-200 hover:bg-white/10"
                  >
                    Elegir
                  </button>
                )}
                <button
                  type="button"
                  disabled={guardadas[op.url] === true}
                  onClick={() => guardar(op.url)}
                  className="flex cursor-pointer items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white transition-colors duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FolderPlus className="h-3.5 w-3.5" aria-hidden />
                  {guardadas[op.url] === true ? "Guardada" : "Guardar"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {vista.error && (
        <p role="alert" className="mt-2 text-xs text-amber-200/80">{vista.error}</p>
      )}
      {vista.descartes.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-white/50">
            Lo que se descartó y por qué ({vista.descartes.length})
          </summary>
          <ul className="mt-1 space-y-0.5 pl-4 text-xs text-white/50">
            {vista.descartes.map((d) => <li key={d}>{d}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
