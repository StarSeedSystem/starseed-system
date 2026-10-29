"use client";

/**
 * Registro visible del bot (BOT1011H2 · contrato `architecture/astraura-bots.md` §5.3).
 *
 * Lista las últimas entradas del bucle (hora, quién, qué, motivo). La ÚLTIMA aplicación de la
 * lista lleva «Deshacer» si su `deshacer` lo permite (un inverso o un retiro); lo irreversible
 * no se esconde: la fila lo dice en su propio texto. Los datos nunca salen de aquí: sois lista.
 */
import { Undo2 } from "lucide-react";
import type { EntradaRegistro, TipoRegistro } from "@/lib/astraura-bots/bucle";

const TEXTO_TIPO: Record<TipoRegistro, string> = {
  "sentido-on": "Sentido encendido", "sentido-off": "Sentido apagado", "sentido-denegado": "Sentido denegado",
  propuesta: "Propuesta", confirmada: "Confirmada", rechazada: "Rechazada", aplicada: "Aplicada",
  fallo: "Fallo", deshecha: "Deshecha", pausa: "Pausa",
};

const hora = (at: number): string =>
  new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" }).format(at);

/**
 * La entrada aplicada más reciente cuyo deshacer lo permite (`{accion}` o `{retirar}`).
 * Si la última aplicada es irreversible (o `{nada}`, sin huella) o no hay ninguna: null.
 */
export function entradaDeshacible(entradas: readonly EntradaRegistro[]): EntradaRegistro | null {
  for (let i = entradas.length - 1; i >= 0; i--) {
    const e = entradas[i];
    if (e.tipo !== "aplicada") continue;
    const d = e.deshacer;
    return d && ("accion" in d || "retirar" in d) ? e : null;
  }
  return null;
}

export interface RegistroBotProps {
  /** Las entradas del registro del bucle (en orden). */
  registro: readonly EntradaRegistro[];
  /** Deshacer esa última aplicación reversible. */
  onDeshacer: () => void;
  /** Cuántas entradas mostrar, las últimas (por defecto 20). */
  max?: number;
}

export function RegistroBot({ registro, onDeshacer, max = 20 }: RegistroBotProps) {
  const deshacible = entradaDeshacible(registro);
  const visibles = registro.slice(-max).reverse();
  return (
    <section data-testid="registro-bot" aria-label="Registro del bot"
      className="w-72 space-y-2 rounded-xl border border-white/10 bg-zinc-950/90 p-4 text-zinc-100">
      <h3 className="text-sm font-semibold">Registro del bot</h3>
      {visibles.length === 0 ? (
        <p className="text-xs text-white/50">Sin entradas todavía.</p>
      ) : (
        <ul role="log" className="max-h-64 space-y-1.5 overflow-y-auto text-xs">
          {visibles.map((e, i) => {
            const irreversible = e.deshacer && "irreversible" in e.deshacer ? e.deshacer.irreversible : null;
            const detalle = e.accion ?? e.sentido;
            return (
              <li key={`${e.at}-${i}`} data-testid="registro-fila"
                className="space-y-1 rounded-md border border-white/5 bg-white/[0.03] px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-white/50">{hora(e.at)} · {e.quien}</span>
                  <span>{TEXTO_TIPO[e.tipo]}{detalle ? ` · ${detalle}` : ""}</span>
                </div>
                <p className="text-white/60">{e.motivo}</p>
                {deshacible === e && (
                  <button type="button" data-testid="boton-deshacer" onClick={onDeshacer} aria-label="Deshacer la última acción"
                    title="Deshacer la última acción"
                    className="flex cursor-pointer items-center gap-1 rounded-md border border-white/20 px-2 py-1 transition-colors duration-200 hover:bg-white/10">
                    <Undo2 className="h-3 w-3" aria-hidden="true" /> Deshacer
                  </button>
                )}
                {irreversible && (
                  <p role="note" data-testid="registro-irreversible" className="text-red-300">{irreversible}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
