"use client";

/**
 * SeccionSalud — ficha de neurona › Salud (NEU1126B): latido (última vez vista y si está en línea), versión
 * que corre en el aparato y avisos. Solo lee datos que la neurona ya publica; no mide ni inventa nada.
 */

import { textoHaceTiempo } from "@/lib/neurons/version-reportada";
import { aparatosDe } from "@/lib/neurons/aparatos-de-neurona";
import type { Neuron } from "@/lib/neurons/neurons";

export interface FilaSalud {
  etiqueta: string;
  valor: string;
}

/** Batería a partir de la que se avisa si no está cargando. */
export const BATERIA_BAJA = 0.2;

/** Nivel de batería en porcentaje (acepta 0–1 o 0–100). Pura. */
export function bateriaPorCiento(nivel: number | undefined): number | null {
  if (typeof nivel !== "number" || !Number.isFinite(nivel) || nivel < 0) return null;
  return Math.round(nivel <= 1 ? nivel * 100 : Math.min(nivel, 100));
}

/** Filas de datos: latido, versión, batería. Lo que falta se dice «sin dato». Pura. */
export function filasSalud(n: Neuron, ahora: number = Date.now()): FilaSalud[] {
  const c = n.capabilities;
  const hace = textoHaceTiempo(n.last_seen_at, ahora);
  const pct = bateriaPorCiento(c.battery?.level);
  return [
    { etiqueta: "Estado", valor: n.online ? "En línea" : "Sin conexión" },
    { etiqueta: "Último latido", valor: hace ?? "sin dato" },
    { etiqueta: "Versión del OS en el aparato", valor: c.aparato?.web ?? "sin dato" },
    { etiqueta: "Versión de la app nativa", valor: c.aparato?.version ?? "no aplica" },
    { etiqueta: "Batería", valor: pct === null ? "sin dato" : `${pct} %${c.battery?.charging ? " (cargando)" : ""}` },
  ];
}

/** Avisos que la persona puede atender. Lista vacía = nada que atender. Pura. */
export function avisosSalud(n: Neuron, ahora: number = Date.now()): string[] {
  const c = n.capabilities;
  const avisos: string[] = [];
  if (!n.online) {
    const hace = textoHaceTiempo(n.last_seen_at, ahora);
    avisos.push(hace ? `No late desde ${hace}.` : "Todavía no ha dado ningún latido.");
  }
  const pct = bateriaPorCiento(c.battery?.level);
  if (pct !== null && pct <= BATERIA_BAJA * 100 && !c.battery?.charging) avisos.push(`Batería baja (${pct} %) y sin cargar.`);
  const aparatos = aparatosDe(c).length;
  if (aparatos > 1) avisos.push(`Tiene ${aparatos} aparatos: lo recomendado es uno por neurona.`);
  return avisos;
}

interface Props {
  neurona: Neuron;
}

export function SeccionSalud({ neurona }: Props) {
  const filas = filasSalud(neurona);
  const avisos = avisosSalud(neurona);
  return (
    <div className="space-y-3" data-testid="seccion-salud">
      <dl className="grid gap-1 sm:grid-cols-2">
        {filas.map((f) => (
          <div key={f.etiqueta} className="min-w-0 rounded-md border border-border/40 p-2">
            <dt className="break-words text-[11px] text-muted-foreground">{f.etiqueta}</dt>
            <dd className="break-words text-sm">{f.valor}</dd>
          </div>
        ))}
      </dl>
      {avisos.length === 0 ? (
        <p role="status" className="text-xs text-emerald-400">Sin avisos: esta neurona está sana.</p>
      ) : (
        <ul aria-label="Avisos de salud" className="space-y-1">
          {avisos.map((a) => <li key={a} className="break-words text-xs text-amber-500">{a}</li>)}
        </ul>
      )}
    </div>
  );
}
