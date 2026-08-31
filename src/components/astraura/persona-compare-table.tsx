"use client";

/**
 * COMPARADOR DE PERSONALIDADES EN ESTA NEURONA (Adenda 149 · ola 3 · 2.10:138).
 * ============================================================================
 * Eje complementario al de la divergencia entre neuronas: aquí se compara,
 * DENTRO de una misma neurona, cómo queda resuelta cada personalidad —LLM,
 * motor de voz, memoria y antenas cerradas— para responder de un vistazo a
 * «¿por qué Hermione suena distinta a Aurora en este portátil?».
 *
 * Reglas de lectura:
 *   · Una fila cuyo valor es IGUAL en todas las columnas se pinta apagada: no
 *     hay nada que decidir ahí.
 *   · Solo se resaltan las celdas que se apartan del valor mayoritario.
 *   · La columna «Todas» son los defaults de la neurona (clave `"*"` del store).
 *
 * Acción por columna — «Igualar a esta», con confirmación (`useConfirm`) y
 * «Deshacer» en el toast:
 *   · sobre una personalidad → copia SUS ajustes propios al resto de
 *     personalidades de esta neurona (nunca escribe en «Todas»: un default
 *     global invisible sería más destructivo que N ajustes explícitos).
 *   · sobre «Todas» → quita los ajustes propios de cada personalidad para que
 *     todas hereden los defaults de la neurona.
 *
 * SSR-safe y defensivo: nunca lanza; sin personalidades, no renderiza tabla.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Columns3, Copy, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { NeuronCapabilities } from "@/lib/neurons/neurons";
import {
  ALL_PERSONAS, personaChips, resolvePersonaSystems, subscribeNeuronPersona,
  getRawOverrides, saveOverrides, clearOverrides,
  type PersonaNeuronOverrides, type ResolvedPersonaSystems,
} from "@/lib/astraura/neuron-persona-systems";

export interface PersonaCompareTableProps {
  deviceId: string;
  /** Cerrar el comparador (lo pinta la ventana como toggle «Comparar»). */
  onClose?: () => void;
  /** Capacidades ya detectadas por la ventana (evita volver a sondear). */
  caps?: NeuronCapabilities | null;
  className?: string;
  /** Título alternativo (la pestaña Astraura la usa como vista de RELACIONES
   *  de modelos y sistemas por personalidad — petición 2026-08-06). */
  title?: string;
  /** Al pulsar el nombre de una personalidad: seleccionarla en la ventana. */
  onSelectPersona?: (personaId: string) => void;
  /** Al pulsar la etiqueta de un sistema: saltar a su pestaña. */
  onSelectSystem?: (system: "llm" | "voz" | "memoria" | "antenas") => void;
}

interface Column {
  id: string;
  name: string;
  isAll: boolean;
}

interface Row {
  key: string;
  label: string;
  /** Valor legible por columna (mismo orden que `cols`). */
  values: string[];
  /** Valor mayoritario (las celdas que no lo son se resaltan). */
  major: string;
  /** ¿Hay más de un valor distinto en la fila? */
  differs: boolean;
}

/* ── Valores legibles de cada fila a partir de la resolución efectiva ── */

function llmValue(r: ResolvedPersonaSystems): string {
  return r.llm.modelo || r.llm.fuente || (r.llm.provenance === "auto" ? "Automático" : r.llm.label);
}

function vozValue(r: ResolvedPersonaSystems): string {
  return r.voz.via && r.voz.via !== "auto" ? `${r.voz.motor} · ${r.voz.via}` : String(r.voz.motor);
}

function memoriaValue(r: ResolvedPersonaSystems): string {
  if (!r.cerebro.usarMemorias) return "sin memorias";
  const cer = r.cerebro.cerebrosPermitidos;
  const cerTxt = cer === "todos" ? "todos los cerebros" : `${cer.length} cerebro(s)`;
  return `${r.cerebro.nivelContexto} · ${cerTxt}`;
}

function antenasValue(r: ResolvedPersonaSystems): string {
  const cerradas = Object.entries(r.senales.porAntena)
    .filter(([, rule]) => !rule.enabled || !rule.salida)
    .map(([id]) => id);
  return cerradas.length === 0 ? "ninguna" : cerradas.join(", ");
}

/** Valor que más se repite en la fila (empate ⇒ el primero). */
function majority(values: string[]): string {
  const count = new Map<string, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  let best = values[0] ?? "";
  let bestN = -1;
  for (const [v, n] of count) if (n > bestN) { best = v; bestN = n; }
  return best;
}

export function PersonaCompareTable({ deviceId, onClose, caps = null, className, title, onSelectPersona, onSelectSystem }: PersonaCompareTableProps) {
  const confirm = useConfirm();
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeNeuronPersona(() => setTick((n) => n + 1));
    return () => { try { unsub(); } catch { /* */ } };
  }, []);

  const cols = useMemo<Column[]>(() => {
    let chips: { id: string; name: string }[] = [];
    try { chips = personaChips().map((c) => ({ id: c.id, name: c.name })); } catch { /* */ }
    return [{ id: ALL_PERSONAS, name: "Todas", isAll: true }, ...chips.map((c) => ({ ...c, isAll: false }))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const rows = useMemo<Row[]>(() => {
    const resolved = cols.map((c) => {
      try { return resolvePersonaSystems(c.id, deviceId, caps); } catch { return null; }
    });
    const build = (key: string, label: string, fn: (r: ResolvedPersonaSystems) => string): Row => {
      const values = resolved.map((r) => (r ? fn(r) : "—"));
      const major = majority(values);
      return { key, label, values, major, differs: new Set(values).size > 1 };
    };
    return [
      // (Adenda 193) La pestaña «LLM» se fusionó en Astraura: el SISTEMA sigue
      // existiendo en el store, pero su nombre visible es el de su decisión.
      build("llm", "Modelo de IA", llmValue),
      build("voz", "Voz", vozValue),
      build("memoria", "Memoria", memoriaValue),
      build("antenas", "Antenas cerradas", antenasValue),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, deviceId, caps, tick]);

  /** Copia (o limpia) los ajustes propios para igualar todo a una columna. */
  const igualar = useCallback(async (col: Column) => {
    const targets = cols.filter((c) => !c.isAll && c.id !== col.id);
    if (targets.length === 0) {
      toast.info("No hay otras personalidades que igualar en esta neurona.");
      return;
    }
    const ok = await confirm({
      title: `Igualar a «${col.name}»`,
      description: col.isAll
        ? `${targets.length} personalidad(es) perderán sus ajustes propios en esta neurona y heredarán los valores de «Todas». Podrás deshacerlo desde el aviso.`
        : `Se copiarán los ajustes de «${col.name}» a ${targets.length} personalidad(es) de esta neurona, reemplazando los suyos. Podrás deshacerlo desde el aviso.`,
      confirmText: "Igualar",
      cancelText: "Cancelar",
      destructive: true,
    }).catch(() => false);
    if (!ok) return;

    setBusy(col.id);
    // Instantánea para «Deshacer» (crudo, sin fusionar con «Todas»).
    const before = new Map<string, PersonaNeuronOverrides>();
    try {
      for (const t of targets) before.set(t.id, getRawOverrides(deviceId, t.id));
    } catch { /* */ }

    let cambiadas = 0;
    try {
      const source: PersonaNeuronOverrides = col.isAll ? {} : getRawOverrides(deviceId, col.id);
      for (const t of targets) {
        try {
          clearOverrides(deviceId, t.id);
          if (!col.isAll && Object.keys(source).length > 0) {
            saveOverrides(deviceId, t.id, source);
          }
          cambiadas += 1;
        } catch { /* una personalidad no puede tumbar al resto */ }
      }
    } catch { /* */ }
    setBusy(null);
    setTick((n) => n + 1);

    const undo = () => {
      try {
        for (const [id, prev] of before) {
          clearOverrides(deviceId, id);
          if (prev && Object.keys(prev).length > 0) saveOverrides(deviceId, id, prev);
        }
        setTick((n) => n + 1);
      } catch { /* */ }
    };
    try {
      toast.success(`Igualado a «${col.name}»`, {
        description: `${cambiadas} personalidad(es) actualizadas en esta neurona.`,
        action: { label: "Deshacer", onClick: undo },
      });
    } catch { /* */ }
  }, [cols, confirm, deviceId]);

  if (cols.length <= 1) {
    return (
      <div className={cn("rounded-xl border border-[var(--aw-line)] bg-[var(--aw-surface)] p-3", className)}>
        <p className="text-[11px] text-[var(--aw-muted)]">Aún no hay personalidades que comparar en esta neurona.</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-[var(--aw-line)] bg-[var(--aw-surface)] p-2.5", className)}>
      {/* Cabecera */}
      <div className="mb-2 flex items-center gap-2">
        <Columns3 className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-[12px] font-semibold text-[var(--aw-strong)]">
          {title ?? "Comparar personalidades en esta neurona"}
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar el comparador"
            title="Cerrar el comparador"
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-[var(--aw-muted)] transition-colors duration-200 hover:bg-[var(--aw-hover)] hover:text-[var(--aw-ink)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className="mb-2 text-[11px] leading-relaxed text-[var(--aw-muted)]">
        Solo se resalta lo que DIFIERE. Las filas iguales en todas las columnas quedan apagadas.
      </p>

      {/* Tabla (scroll horizontal; la primera columna se queda fija) */}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-max border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[var(--aw-sticky)] px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--aw-muted)]">
                Sistema
              </th>
              {cols.map((c) => (
                <th key={c.id} className="px-2 py-1.5 align-bottom">
                  <div className="flex flex-col items-start gap-1">
                    {onSelectPersona ? (
                      <button
                        type="button"
                        onClick={() => onSelectPersona(c.id)}
                        className={cn(
                          "max-w-[130px] cursor-pointer truncate text-left text-[11px] font-semibold underline-offset-2 transition-colors duration-200 hover:underline",
                          c.isAll ? "text-cyan-200 hover:text-cyan-100" : "text-[var(--aw-strong)] hover:text-[var(--aw-ink)]",
                        )}
                        title={c.isAll ? "Configurar los valores por defecto de esta neurona" : `Configurar a ${c.name} en esta neurona`}
                      >
                        {c.name}
                      </button>
                    ) : (
                      <span
                        className={cn(
                          "max-w-[130px] truncate text-[11px] font-semibold",
                          c.isAll ? "text-cyan-200" : "text-[var(--aw-strong)]",
                        )}
                        title={c.isAll ? "Valores por defecto de esta neurona" : c.name}
                      >
                        {c.name}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void igualar(c)}
                      disabled={busy !== null}
                      title={c.isAll
                        ? "Quitar los ajustes propios de las demás personalidades para que hereden estos valores"
                        : `Copiar los ajustes de ${c.name} al resto de personalidades de esta neurona`}
                      className={cn(
                        "inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-2 py-1 text-[10px] text-[var(--aw-text)]",
                        "transition-colors duration-200 hover:border-cyan-400/40 hover:text-cyan-200",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                      )}
                    >
                      {busy === c.id
                        ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        : <Copy className="h-3 w-3" aria-hidden="true" />}
                      Igualar a esta
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th
                  scope="row"
                  className={cn(
                    "sticky left-0 z-10 bg-[var(--aw-sticky)] px-2 py-1.5 text-[11px] font-medium",
                    r.differs ? "text-[var(--aw-strong)]" : "text-[var(--aw-muted)]",
                  )}
                >
                  {onSelectSystem ? (
                    <button
                      type="button"
                      onClick={() => onSelectSystem(r.key as "llm" | "voz" | "memoria" | "antenas")}
                      className="cursor-pointer underline-offset-2 transition-colors duration-200 hover:text-[var(--aw-ink)] hover:underline"
                      title={`Abrir la configuración de ${r.label}`}
                    >
                      {r.label}
                    </button>
                  ) : (
                    r.label
                  )}
                </th>
                {r.values.map((v, i) => {
                  const distinta = r.differs && v !== r.major;
                  return (
                    <td key={`${r.key}-${cols[i]?.id ?? i}`} className="px-2 py-1.5">
                      <span
                        className={cn(
                          "inline-block max-w-[170px] truncate rounded-md px-1.5 py-0.5 text-[11px]",
                          distinta
                            ? "border border-amber-400/35 bg-amber-500/10 font-medium text-amber-100"
                            : r.differs ? "text-[var(--aw-text)]" : "text-[var(--aw-faint)]",
                        )}
                        title={distinta ? `${v} — distinto del resto (${r.major})` : v}
                      >
                        {v}
                        {distinta && <span className="sr-only"> (distinto del resto)</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PersonaCompareTable;
