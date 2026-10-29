"use client";

/**
 * Registro del bot (BOT1011H2 · contrato `architecture/astraura-bots.md` §5.3): las últimas
 * entradas del bucle —hora, quién, qué y motivo—, la más reciente primero. «Deshacer» solo en la
 * ÚLTIMA aplicada y solo si su deshacer lo permite (otra acción lo repone o se retira lo enviado);
 * lo irreversible lo dice y no ofrece botón. El estado lo aporta el bucle: componente de render.
 */
import type { EntradaRegistro, TipoRegistro } from "@/lib/astraura-bots/bucle";

export interface RegistroBotProps {
  /** Entradas del bucle en orden (la más reciente al final). */
  registro: readonly EntradaRegistro[];
  /** Deshace la última aplicada reversible; sin este handler no se pinta botón alguno. */
  onDeshacer?: () => void;
  /** Cuántas entradas enseñar (por defecto 30). */
  max?: number;
}

/** Una entrada de «aplicada» es deshacible si su deshacer repone o retira. */
export function deshacible(e: EntradaRegistro): boolean {
  if (e.tipo !== "aplicada" || !e.deshacer) return false;
  return "accion" in e.deshacer || "retirar" in e.deshacer;
}

/** Índice de la ÚLTIMA aplicada si ES deshacible; si la última es irreversible o nadie quedó −1:
 * lo irreversible tapa lo anterior (el bucle solo deshace `ultimaAplicada`). */
export function indiceUltimaDeshacible(registro: readonly EntradaRegistro[]): number {
  let ultima = -1;
  let deshechaDespues = false;
  for (let i = registro.length - 1; i >= 0; i -= 1) {
    const e = registro[i];
    if (e.tipo === "aplicada") { ultima = i; break; }
    if (e.tipo === "deshecha") deshechaDespues = true;
  }
  if (ultima === -1 || deshechaDespues) return -1;
  return deshacible(registro[ultima]) ? ultima : -1;
}

/** Habla la entrada: qué pasó, con el sentido o la acción si los tiene. */
export function fraseDe(e: EntradaRegistro): string {
  const que: Record<TipoRegistro, string> = {
    "sentido-on": "encendió el sentido", "sentido-off": "apagó el sentido",
    "sentido-denegado": "no pudo usar el sentido", propuesta: "propuso", confirmada: "fue confirmada",
    rechazada: "fue rechazada", aplicada: "aplicó", fallo: "falló en", deshecha: "deshecha", pausa: "pasa a pausa",
  };
  const detalle = e.sentido ? `«${e.sentido}»` : e.accion ? `«${e.accion}»` : "";
  return `${que[e.tipo]} ${detalle}`.replace(/\s+$/, "");
}

/** Quién habla en el registro: «bot», «persona» o la cuenta que confirmó. */
export const textoDe = (q: string): string => (q === "bot" ? "el bot" : q === "persona" ? "una persona" : q);

const horaDe = (at: number): string =>
  new Date(at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

export function RegistroBot({ registro, onDeshacer, max = 30 }: RegistroBotProps) {
  if (registro.length === 0) {
    return <p role="status" className="text-xs text-zinc-500">Sin sucesos todavía.</p>;
  }
  const ultima = indiceUltimaDeshacible(registro);
  const visibles: { e: EntradaRegistro; i: number }[] = [];
  for (let i = registro.length - 1; i >= Math.max(0, registro.length - max); i -= 1) {
    visibles.push({ e: registro[i], i });
  }
  return (
    <ul data-testid="registro-bot" aria-label="Registro del bot" className="space-y-1.5 text-xs">
      {visibles.map(({ e, i }) => (
        <li key={`${e.at}-${e.tipo}-${e.accion ?? e.sentido ?? "-"}`}
          className="flex items-start justify-between gap-2 rounded-md border border-white/10 bg-zinc-950/60 px-2 py-1">
          <p className="min-w-0 flex-1 leading-snug text-zinc-200">
            <span className="tabular-nums text-zinc-500">{horaDe(e.at)}</span>{" "}
            <span className="font-medium">{textoDe(e.quien)}</span> {fraseDe(e)} — {e.motivo}
          </p>
          {e.deshacer && "irreversible" in e.deshacer ? (
            <span title={e.deshacer.irreversible}
              className="shrink-0 rounded-full border border-red-300/40 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase text-red-200">
              irreversible
            </span>
          ) : null}
          {onDeshacer && i === ultima ? (
            <button type="button" onClick={onDeshacer} aria-label="Deshacer la última acción aplicada"
              title="Se repone lo que había y queda en el registro"
              className="shrink-0 cursor-pointer rounded-md border border-white/20 px-2 py-0.5 transition-colors duration-200 hover:bg-white/10">
              Deshacer
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
