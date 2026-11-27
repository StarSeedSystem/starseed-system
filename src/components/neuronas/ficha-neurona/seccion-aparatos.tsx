"use client";

/**
 * SeccionAparatos — ficha de neurona › Aparatos (NEU1126B): los aparatos de la neurona con su nombre,
 * sistema, medio y última vez vista. En la neurona de ESTE aparato añade renombrar, separar en neurona
 * propia y unir a otra (reutiliza `AparatoEnNeurona`, sin duplicar su lógica).
 */

import { aparatosDe, type AparatoDeNeurona } from "@/lib/neurons/aparatos-de-neurona";
import type { Neuron } from "@/lib/neurons/neurons";
import { AparatoEnNeurona } from "@/components/settings/neurons/aparato-en-neurona";

/** «vista hace X» a partir de un epoch en ms; texto neutro si no hay dato. Pura. */
export function ultimaVezAparato(visto: number | undefined, ahora: number = Date.now()): string {
  if (typeof visto !== "number" || !Number.isFinite(visto) || visto <= 0 || visto > ahora) return "sin dato de última vez";
  const min = Math.floor((ahora - visto) / 60_000);
  if (min < 1) return "vista ahora";
  if (min < 60) return `vista hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vista hace ${h} h`;
  return `vista hace ${Math.floor(h / 24)} d`;
}

/** Una línea legible por aparato: sistema · medio · última vez. Pura. */
export function detalleAparato(a: AparatoDeNeurona, ahora: number = Date.now()): string {
  return [a.so, a.medio, ultimaVezAparato(a.visto, ahora)].filter(Boolean).join(" · ");
}

interface Props {
  neurona: Neuron;
}

export function SeccionAparatos({ neurona }: Props) {
  const aparatos = aparatosDe(neurona.capabilities);
  return (
    <div className="space-y-3">
      {aparatos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Esta neurona no tiene aparatos conocidos todavía.</p>
      ) : (
        <ul className="space-y-1" aria-label={`Aparatos de ${neurona.name}`}>
          {aparatos.map((a) => (
            <li key={a.id} className="min-w-0 rounded-md border border-border/40 p-2 text-sm">
              <strong className="break-words">{a.nombre}</strong>
              <p className="break-words text-xs text-muted-foreground">{detalleAparato(a)}</p>
            </li>
          ))}
        </ul>
      )}
      {aparatos.length > 1 && (
        <p className="text-[11px] text-amber-500">Esta neurona tiene {aparatos.length} aparatos: lo recomendado es uno por neurona.</p>
      )}
      {neurona.isThisDevice && <AparatoEnNeurona />}
    </div>
  );
}
