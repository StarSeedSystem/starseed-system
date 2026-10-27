"use client";
/**
 * Tarjeta de opciones de imagen de la Protomolécula (IMG1011C/J). Contrato: architecture/astraura-imagenes.md §4 y §6.
 *
 * Recibe la petición y las neuronas conocidas, calcula el plan con `planImagen` (puro, ya probado) y
 * muestra TODAS las opciones con su procedencia, licencia y motivo: comparar es elegir mejor.
 * No genera nada todavía: esa conexión va entre el chat (`generar_imagen`) y el servicio local;
 * aquí solo se ve y se re-planifica (variar) — se dice la verdad, no se promete lo que no corre.
 */
import { useState } from "react";
import { ImagePlus, RefreshCw } from "lucide-react";
import {
  planImagen, type NeuronaImg, type OpcionImagen, type PeticionImagen,
} from "@/lib/imagenes/plan";
import { etiquetaUso, resumenModelo } from "@/lib/imagenes/presentacion";

export interface TarjetaOpcionesImagenProps {
  peticion: PeticionImagen;
  neuronas: readonly NeuronaImg[];
  semillaBase?: number;
  comercial?: boolean;
}

export default function TarjetaOpcionesImagen({
  peticion, neuronas, semillaBase = 0,
}: TarjetaOpcionesImagenProps) {
  const [ronda, setRonda] = useState(0);
  const plan = planImagen(peticion, neuronas, semillaBase + ronda * 10000);
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80 backdrop-blur">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <ImagePlus className="h-4 w-4 text-white/70" aria-hidden />
          Opciones de imagen · {peticion.prioridad === "calidad" ? "calidad" : "rapidez"}
        </h3>
        <button type="button" onClick={() => setRonda((r) => r + 1)}
          className="flex cursor-pointer items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white transition-colors duration-200 hover:bg-white/10">
          <RefreshCw className="h-3 w-3" aria-hidden /> Variar semillas
        </button>
      </header>
      <ul className="space-y-2">
        {plan.opciones.map((o, i) => (
          <Opcion key={`${o.semilla}-${i}`} opcion={o} numero={i + 1} comercial={peticion.comercial} />
        ))}
      </ul>
      {plan.descartes.length > 0 && (
        <details className="mt-3 text-xs text-white/50">
          <summary className="cursor-pointer">Plan de {plan.descartes.length} sin usar</summary>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            {plan.descartes.map((d) => <li key={d}>{d}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

function Opcion({ opcion, numero, comercial }: { opcion: OpcionImagen; numero: number; comercial: boolean }) {
  return (
    <li className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="font-medium text-white">
        {numero}. {resumenModelo(opcion)}
        {opcion.modelo && ` · ${etiquetaUso(opcion.modelo.uso, comercial)}`}
      </p>
      <p className="mt-1 text-xs text-white/60">{opcion.motivo}</p>
    </li>
  );
}
