"use client";

/**
 * Vista previa de lo grabado (vídeo) o capturado (imagen) con sus tres salidas: descargar, guardar en
 * la Biblioteca y descartar. La Biblioteca admite hasta 50 MB por archivo: si pesa más, no se ofrece
 * guardar y se dice por qué (siempre queda descargar).
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Download, FolderCheck, Images, Loader2, Trash2 } from "lucide-react";
import { cabeEnBiblioteca, descargarResultado, guardarEnBiblioteca, type DepsGuardado, type ResultadoGuardado } from "@/lib/grabacion/guardar";
import { formatearDuracion, formatearTamano } from "@/lib/grabacion/texto";
import { LIMITE_BIBLIOTECA_BYTES, type ResultadoGrabacion } from "@/lib/grabacion/tipos";
import { BotonLogic } from "../boton-logic";

interface Props {
  resultado: ResultadoGrabacion;
  onDescartar: () => void;
  /** Abre la Galería (cierra el panel y navega). */
  onVerEnGaleria: () => void;
  /** Solo pruebas: cómo se guarda. */
  depsGuardado?: DepsGuardado;
}

type EstadoGuardado = { fase: "libre" } | { fase: "guardando" } | { fase: "hecho"; carpeta: string } | { fase: "fallo"; mensaje: string };

export function ResultadoGrabacionVista({ resultado: r, onDescartar, onVerEnGaleria, depsGuardado }: Props) {
  const [guardado, setGuardado] = useState<EstadoGuardado>({ fase: "libre" });
  // Otro archivo = otro estado de guardado.
  useEffect(() => setGuardado({ fase: "libre" }), [r.url]);

  const esVideo = r.tipo === "video";
  const cabe = cabeEnBiblioteca(r.bytes);
  const datos = [
    esVideo ? formatearDuracion(r.duracionMs) : r.ancho && r.alto ? `${r.ancho}×${r.alto}` : null,
    formatearTamano(r.bytes),
    r.extension.toUpperCase(),
    esVideo ? (r.conAudio ? "con sonido" : "sin sonido") : null,
  ].filter(Boolean);

  const guardar = async () => {
    setGuardado({ fase: "guardando" });
    const res: ResultadoGuardado = await guardarEnBiblioteca(r, depsGuardado);
    setGuardado(res.ok ? { fase: "hecho", carpeta: res.carpeta } : { fase: "fallo", mensaje: res.mensaje });
  };

  return (
    <section
      aria-label={esVideo ? "Tu grabación" : "Tu captura"}
      data-testid={esVideo ? "resultado-video" : "resultado-captura"}
      className="overflow-hidden rounded-3xl border border-amber-300/30 bg-gradient-to-br from-amber-400/[0.12] via-black/30 to-black/40 p-3"
    >
      <div className="overflow-hidden rounded-2xl bg-black">
        {esVideo ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- grabación propia del usuario, sin pista de subtítulos
          <video src={r.url} controls playsInline preload="metadata" className="max-h-56 w-full" aria-label="Vista previa de tu grabación" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- URL de objeto local
          <img src={r.url} alt="Vista previa de tu captura de pantalla" className="max-h-56 w-full object-contain" />
        )}
      </div>

      <p className="mt-2.5 break-all text-[12px] font-medium leading-tight text-amber-50">{r.nombre}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-amber-100/65">{datos.join(" · ")}</p>

      {/* Apilados: en un móvil el panel mide 331 px y «Guardar en la Biblioteca» no cabe a media fila. */}
      <div className="mt-3 grid grid-cols-1 gap-2">
        <BotonLogic variante="principal" icono={Download} onClick={() => descargarResultado(r)}>
          Descargar
        </BotonLogic>
        {cabe && (
          <BotonLogic
            icono={guardado.fase === "guardando" ? Loader2 : guardado.fase === "hecho" ? CheckCircle2 : FolderCheck}
            onClick={guardar}
            disabled={guardado.fase === "guardando" || guardado.fase === "hecho"}
            aria-busy={guardado.fase === "guardando"}
          >
            {guardado.fase === "guardando" ? "Guardando…" : guardado.fase === "hecho" ? "Guardado" : "Guardar en la Biblioteca"}
          </BotonLogic>
        )}
      </div>

      {!cabe && (
        <p role="note" className="mt-2 rounded-xl bg-white/[0.05] px-3 py-2 text-[11px] leading-snug text-amber-100/75">
          Pesa {formatearTamano(r.bytes)} y la Biblioteca admite hasta {formatearTamano(LIMITE_BIBLIOTECA_BYTES)} por archivo: descárgala, o graba en calidad Ligera.
        </p>
      )}

      <div aria-live="polite">
        {guardado.fase === "hecho" && (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-400/10 px-3 py-2 text-[11px] leading-snug text-emerald-100">
            <span className="min-w-0 flex-1">Guardado en {guardado.carpeta}.</span>
            <button
              type="button"
              onClick={onVerEnGaleria}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg px-2 font-medium text-emerald-200 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-amber-300/70"
            >
              <Images className="h-3.5 w-3.5" aria-hidden="true" /> Ver en la Galería
            </button>
          </div>
        )}
        {guardado.fase === "fallo" && (
          <p role="alert" className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-[11px] leading-snug text-red-100">
            {guardado.mensaje}
          </p>
        )}
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={onDescartar}
          className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[12px] text-amber-100/60 outline-none transition-colors duration-150 hover:text-red-200 focus-visible:ring-2 focus-visible:ring-amber-300/70"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Descartar
        </button>
      </div>
    </section>
  );
}
