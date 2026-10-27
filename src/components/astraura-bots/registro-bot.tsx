"use client";
/**
 * Registro de acciones del bot (BOT1011H2 · contrato `architecture/astraura-bots.md` §5.3).
 *
 * La lista de las últimas entradas del bucle: hora, quién, qué y motivo. La ÚLTIMA entrada
 * aplicada lleva el botón «Deshacer» si su `deshacer` lo permite (`inverso` o `retirar`); lo
 * irreversible lo dice (Exocórtex leal: todo cambio con motivo y con deshacer, o se explica).
 */
import { Undo2 } from "lucide-react";
import type { EntradaRegistro, TipoRegistro } from "@/lib/astraura-bots/bucle";

const NOMBRE_TIPO: Record<TipoRegistro, string> = {
  "sentido-on": "Encendió el sentido", "sentido-off": "Apagó el sentido",
  "sentido-denegado": "Le negaron un sentido", propuesta: "Propuso",
  confirmada: "Fue confirmada", rechazada: "Fue rechazada", aplicada: "Aplicó",
  fallo: "Falló", deshecha: "Deshecho", pausa: "Pausa",
};

/** La última entrada aplicada cuya deshacer es posible; `null` si no hay nada que deshacer. */
export function ultimaDeshacible(registro: readonly EntradaRegistro[]): EntradaRegistro | null {
  const ultima = registro.at(-1);
  if (!ultima || ultima.tipo !== "aplicada") return null;
  const d = ultima.deshacer;
  return d && ("accion" in d || "retirar" in d) ? ultima : null;
}

/** Lo que se dice de una entrada aplicada que no se puede deshacer («lo irreversible lo dice»). */
export function textoIrreversible(e: EntradaRegistro): string {
  const d = e.deshacer;
  if (d && "irreversible" in d) return d.irreversible;
  return "Se aplicó: no queda estado previo que reponer.";
}

export interface RegistroBotProps {
  registro: readonly EntradaRegistro[];
  /** Deshacer la última acción aplicada (el bucle la repone con su inverso o la retira). */
  onDeshacer: () => void;
}

export function RegistroBot({ registro, onDeshacer }: RegistroBotProps) {
  const deshacer = ultimaDeshacible(registro);
  return (
    <div aria-label="Registro del bot" className="space-y-1 text-xs text-zinc-100">
      {registro.length === 0 ? <p className="text-zinc-400">Aún no ha hecho nada.</p> : null}
      {registro.map((e, i) => (
        <div key={`${e.at}-${i}`} className="flex items-start justify-between gap-2 rounded-md border border-white/10 px-2 py-1.5">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {new Date(e.at).toLocaleTimeString()} · {e.quien} · {NOMBRE_TIPO[e.tipo]}
              {e.accion ? ` «${e.accion}»` : ""}
            </p>
            <p className="truncate text-zinc-400">{e.motivo}</p>
          </div>
          {deshacer && e === deshacer ? (
            <button onClick={onDeshacer} aria-label={`Deshacer: ${NOMBRE_TIPO[e.tipo]}`}
              className="flex cursor-pointer shrink-0 items-center gap-1 rounded-md border border-white/20 px-2 py-1 transition-colors duration-200 hover:bg-white/10">
              <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Deshacer
            </button>
          ) : e.tipo === "aplicada" ? (
            <span className="shrink-0 text-zinc-500">{textoIrreversible(e)}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
