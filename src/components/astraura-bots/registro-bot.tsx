"use client";

/**
 * Registro del bot (BOT1011H2 · contrato `architecture/astraura-bots.md` §5.3).
 *
 * Las últimas entradas del bucle, cada una con HORA, QUIÉN, QUÉ y MOTIVO. El botón
 * «Deshacer» solo en la ÚLTIMA acción aplicada que su `deshacer` permita; lo
 * irreversible lo dice tal cual y lo sin huella («nada») no ofrece nada. Así el
 * registro es exactamente lo que promete el Exocórtex: todo cambio con quién,
 * por qué y su salida.
 */
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EntradaRegistro, TipoRegistro } from "@/lib/astraura-bots/bucle";
import type { ResultadoDeshacer } from "@/lib/astraura-bots/acciones";
import { NOMBRE_SENTIDO } from "./sentidos-ui";
import { fraseAccion } from "./tarjeta-propuesta";

export interface RegistroBotProps {
  /** Entradas del bucle (cronológicas); se pintan las últimas, de más nueva a más vieja. */
  registro: readonly EntradaRegistro[];
  /** La persona deshace: el control del bucle resuelve (control-bucle.ts#deshacer). */
  onDeshacer?: () => void;
  /** Cuántas entradas mostrar (por defecto 8, las últimas). */
  max?: number;
}

const PALABRA: Record<TipoRegistro, string> = {
  "sentido-on": "Sentido encendido", "sentido-off": "Sentido apagado", "sentido-denegado": "Sentido denegado",
  propuesta: "Propuesta", confirmada: "Confirmada", rechazada: "Rechazada",
  aplicada: "Aplicada", fallo: "Fallo", deshecha: "Deshecha", pausa: "Pausa",
};

const HORA = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" });
const horaDe = (at: number): string => HORA.format(new Date(at));
/** Quien escribió la entrada «bot» o una cuenta de la persona (la que confirmó o rechazó). */
const quienDe = (quien: string): string => (quien === "bot" ? "El bot" : "La persona");

export type HuellaDeshacer =
  | { clase: "reversible" }
  | { clase: "proxima"; texto: string }
  | { clase: "irreversible"; texto: string }
  | { clase: "nada" };

/** Qué permite el `deshacer` guardado: otra acción lo repone, se retirará pronto, es irreversible o no dejó huella. */
export function deshacerDe(d: ResultadoDeshacer | undefined): HuellaDeshacer {
  if (!d || "nada" in d) return { clase: "nada" };
  if ("accion" in d) return { clase: "reversible" };
  if ("retirar" in d) return { clase: "proxima", texto: `próximamente: retirar «${d.retirar}» desde su canal.` };
  return { clase: "irreversible", texto: d.irreversible };
}

/** Única entrada con botón «Deshacer»: la última `aplicada` SIN deshecha posterior y reversible. */
export function indiceDeshacer(registro: readonly EntradaRegistro[]): number {
  for (let i = registro.length - 1; i >= 0; i -= 1) {
    if (registro[i].tipo !== "aplicada") continue;
    const ya = registro.slice(i + 1).some((e) => e.tipo === "deshecha");
    return !ya && deshacerDe(registro[i].deshacer).clase === "reversible" ? i : -1;
  }
  return -1;
}

export function RegistroBot({ registro, onDeshacer, max = 8 }: RegistroBotProps) {
  const ultimas = registro.slice(-max);
  const iDeshacer = indiceDeshacer(registro);
  return (
    <div data-testid="registro-bot" className="w-72 space-y-2 rounded-xl border border-white/10 bg-zinc-950/95 p-3 text-xs text-zinc-100">
      <p className="text-sm font-medium">Registro del bot</p>
      {ultimas.length === 0 && <p className="text-white/50">Todavía no ha pasado nada.</p>}
      <ul className="space-y-1.5">
        {[...ultimas].reverse().map((e) => {
          const indice = registro.indexOf(e);
          const huella = deshacerDe(e.deshacer);
          const que = [PALABRA[e.tipo], e.sentido ? NOMBRE_SENTIDO[e.sentido] : e.accion ? fraseAccion({ tipo: e.accion, args: {} }) : ""].filter(Boolean).join(": ");
          return (
            <li key={`${e.at}-${indice}-${e.tipo}`} className="space-y-1 rounded-lg border border-white/5 bg-white/[0.03] p-2">
              <p className="leading-5">
                <span className="text-white/60">{horaDe(e.at)}</span> · {quienDe(e.quien)} · {que}
              </p>
              <p className="text-white/60">{e.motivo}</p>
              {e.tipo === "aplicada" && huella.clase !== "reversible" && huella.clase !== "nada" && (
                <p className={cn("rounded-md border px-2 py-1", huella.clase === "irreversible" ? "border-red-400/40 bg-red-500/10 text-red-200" : "text-white/60")}>{huella.texto}</p>
              )}
              {e.tipo === "aplicada" && indice === iDeshacer && onDeshacer && (
                <button type="button" onClick={onDeshacer} data-testid="deshacer"
                  className="flex cursor-pointer items-center gap-1 rounded-md border border-white/20 px-2 py-1 transition-colors duration-200 hover:bg-white/10">
                  <RotateCcw className="h-3 w-3" aria-hidden="true" /> Deshacer
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
