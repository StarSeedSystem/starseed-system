"use client";

/**
 * Registro del bot (BOT1011H2 · contrato astraura-bots §5.3).
 *
 * Lista de las últimas entradas del bucle: hora, quién, qué y motivo. En la ÚLTIMA
 * entrada aplicada hay un «Deshacer» solo cuando su `deshacer` (acciones.ts) lo
 * permite; lo irreversible lo dice en vez de dar ilusiones. Puro en lo que decide
 * (`deshacerDe`), con el DOM solo en el componente.
 */
import type { EntradaRegistro, TipoRegistro } from "@/lib/astraura-bots/bucle";
import { NOMBRE_ACCION } from "./tarjeta-propuesta";
import { NOMBRE_SENTIDO } from "./sentidos-ui";

/** Quién ha podido deshacer una entrada aplicada: reversible, irreversible (se dice) o nada. */
export function deshacerDe(r: EntradaRegistro): { reversible: boolean; aviso?: string } | null {
  const d = r.deshacer;
  if (!d || "nada" in d) return null;
  return "irreversible" in d ? { reversible: false, aviso: d.irreversible } : { reversible: true };
}

/** El paso del registro dicho en palabras. */
export const TEXTO_REGISTRO: Record<TipoRegistro, string> = {
  "sentido-on": "Encendió el sentido", "sentido-off": "Apagó el sentido", "sentido-denegado": "No pudo con el sentido",
  propuesta: "Propuso", confirmada: "Confirmó", rechazada: "Rechazó", aplicada: "Aplicó", fallo: "Falló",
  deshecha: "Deshecha", pausa: "Pausa",
};

function queHizo(r: EntradaRegistro): string {
  if (r.sentido) return NOMBRE_SENTIDO[r.sentido];
  if (r.accion) return NOMBRE_ACCION[r.accion];
  return "";
}

/** La hora (HH:MM) de la entrada, en español. */
export function horaDe(at: number): string {
  return new Date(at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

export interface RegistroBotProps {
  entradas: readonly EntradaRegistro[];
  onDeshacer?: (r: EntradaRegistro) => void;
  titulo?: string;
}

export function RegistroBot({ entradas, onDeshacer, titulo = "Registro del bot" }: RegistroBotProps) {
  // La última aplicada (o ninguna): en ella, y solo en ella, puede haber «Deshacer».
  let ultimaAplicada: EntradaRegistro | null = null;
  for (const e of entradas) if (e.tipo === "aplicada" && e.deshacer) ultimaAplicada = e;
  const deshechable = ultimaAplicada ? deshacerDe(ultimaAplicada) : null;
  const lista = [...entradas].reverse();
  return (
    <section aria-label={titulo} data-testid="registro-bot" className="space-y-2">
      {lista.length === 0 ? (
        <p className="text-xs text-white/50">El bot no ha hecho nada todavía.</p>
      ) : (
        <ul className="space-y-1.5">
          {lista.map((e, i) => {
            const ultimo = e === ultimaAplicada && deshechable?.reversible && onDeshacer;
            return (
              <li key={`${e.at}-${e.tipo}-${i}`}
                className="rounded-lg border border-white/10 bg-zinc-950/80 p-2 text-xs text-zinc-100">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-white/60">{horaDe(e.at)}</span>
                  <span className="text-white/40">{e.quien}</span>
                </div>
                <p>
                  {TEXTO_REGISTRO[e.tipo]}
                  {queHizo(e) ? ` — ${queHizo(e)}` : ""}
                </p>
                <p className="text-white/60">{e.motivo}</p>
                {ultimo ? (
                  <button type="button" onClick={() => onDeshacer?.(e)} title="Deshecha lo aplicado"
                    className="mt-1 cursor-pointer rounded-md border border-white/20 px-2 py-0.5 transition-colors duration-200 hover:bg-white/10">
                    Deshacer
                  </button>
                ) : e === ultimaAplicada && deshechable?.aviso ? (
                  <p className="mt-1 text-[11px] text-white/50">{deshechable.aviso}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
