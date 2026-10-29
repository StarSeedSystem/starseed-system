"use client";

/**
 * Registro del bot (BOT1011H2 · contrato `architecture/astraura-bots.md` §5.3).
 *
 * Lista las últimas entradas de `estado.registro` (hora, quién, qué, motivo). Ofrece
 * «Deshacer» SOLO en la ÚLTIMA entrada aplicada y SOLO si su `deshacer` lo permite
 * (`{accion}`). Lo irreversible (o lo que aún no se puede retirar) lo dice; lo que no
 * deja huella (`{nada}`) no ofrece nada. Puerta real de deshacer: `control-bucle.ts`.
 */
import { Undo2 } from "lucide-react";
import type { ResultadoDeshacer } from "@/lib/astraura-bots/acciones";
import type { EntradaRegistro, EstadoBucle, TipoRegistro } from "@/lib/astraura-bots/bucle";
import { NOMBRE_SENTIDO } from "./sentidos-ui";

export interface RegistroBotProps {
  /** Estado del bucle del bot INTEGRO: su registro y su última acción aplicada. */
  estado: EstadoBucle;
  nombreBot: string;
  /** Cuenta de quien pulsa «Deshacer»; va al registro. */
  quien: string;
  onDeshacer: (quien: string) => void;
  maximo?: number;
}

const VERBOS: Record<TipoRegistro, string> = {
  "sentido-on": "encendió el sentido", "sentido-off": "apagó el sentido",
  "sentido-denegado": "no pudo usar el sentido", propuesta: "propuso", confirmada: "confirmó",
  rechazada: "rechazó", aplicada: "aplicó", fallo: "falló al hacer", deshecha: "deshecho",
  pausa: "se pausó",
};

/** Qué hizo, en palabras: «aplicó navegar», «encendió el sentido micrófono». */
export function fraseEntrada(e: EntradaRegistro): string {
  const base = VERBOS[e.tipo] ?? e.tipo;
  if (e.sentido) return `${base} ${NOMBRE_SENTIDO[e.sentido]}`;
  return e.accion ? `${base} ${e.accion}` : base;
}

const hora = (at: number): string =>
  new Date(at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false });

function notaDeshacer(d: ResultadoDeshacer | undefined): { texto: string | null; boton: boolean } {
  if (!d) return { texto: null, boton: false };
  if ("irreversible" in d) return { texto: `No se puede deshacer: ${d.irreversible}`, boton: false };
  if ("retirar" in d) return { texto: "próximamente: se retirará desde su canal.", boton: false };
  if ("nada" in d) return { texto: null, boton: false };
  return { texto: null, boton: true };
}

export function RegistroBot({ estado, nombreBot, quien, onDeshacer, maximo = 20 }: RegistroBotProps) {
  const visibles = estado.registro.slice(-maximo);
  const iAplicada = visibles.reduce((i, e, k) => (e.tipo === "aplicada" ? k : i), -1);
  const deshechaDespues = iAplicada >= 0 && visibles.some((e, k) => e.tipo === "deshecha" && k > iAplicada);
  const ultima = iAplicada >= 0 && !deshechaDespues ? visibles[iAplicada] : null;
  return (
    <section data-testid="registro-bot" aria-label={`Registro de ${nombreBot}`}
      className="rounded-xl border border-white/10 bg-zinc-950/95 p-3 text-xs text-zinc-100">
      <h2 className="mb-2 text-sm text-white/70">Registro de {nombreBot}</h2>
      <ol className="space-y-1.5">
        {visibles.map((e, k) => {
          const nota = ultima === e ? notaDeshacer(e.deshacer) : { texto: null, boton: false };
          return (
            <li key={`${e.at}-${k}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-white/5 pb-1 last:border-b-0">
              <time dateTime={new Date(e.at).toISOString()} className="text-white/40">{hora(e.at)}</time>
              <strong className="font-medium">{e.quien === "bot" ? nombreBot : e.quien}</strong>
              <span>{fraseEntrada(e)}</span>
              <span className="text-white/50">{e.motivo}</span>
              {nota.boton && (
                <button type="button" onClick={() => onDeshacer(quien)}
                  className="cursor-pointer ml-auto inline-flex items-center gap-1 rounded-md border border-white/20 px-2 py-0.5 transition-colors duration-200 hover:bg-white/10">
                  <Undo2 className="h-3 w-3" aria-hidden="true" /> Deshacer
                </button>
              )}
              {nota.texto && <p role="note" className="w-full text-white/50">{nota.texto}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
