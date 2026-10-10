"use client";

/**
 * AdoptarNeurona — «¿Es esta una neurona que ya configuraste?» (2026-09-29, persistencia entre
 * medios). Se enseña dentro de «Neurona nueva» cuando la cuenta YA tiene otras neuronas: el mismo
 * ordenador visto desde otro medio (localhost, la web, la app instalada, la app nativa) es, para
 * el OS, una neurona nueva. Si la persona reconoce la suya, «Usar su configuración» hace que este
 * medio adopte su identidad y herede nombre, permisos, ajustes y sistemas por personalidad;
 * «Es otra neurona» sigue con el asistente de siempre.
 *
 * Presentacional: la adopción (`usarConfiguracionDeNeurona`) la lanza quien lo monta.
 */

import { Cpu, Laptop, Smartphone, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NeuronaCandidata } from "@/lib/neurons/adopcion-neurona";

/** «hace 5 min», «hace 3 h», «hace 2 días»; sin fecha, «sin actividad reciente». */
export function haceCuanto(iso: string | undefined, ahora: number = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "sin actividad reciente";
  const min = Math.max(0, Math.round((ahora - t) / 60_000));
  if (min < 2) return "activa ahora";
  if (min < 60) return `visto hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `visto hace ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.round(h / 24);
  return `visto hace ${d} ${d === 1 ? "día" : "días"}`;
}

function iconoDe(plataforma: string | undefined) {
  const p = (plataforma ?? "").toLowerCase();
  if (/android|ios|ipad/.test(p)) return Smartphone;
  if (/linux|server/.test(p)) return Server;
  if (/mac|windows/.test(p)) return Laptop;
  return Cpu;
}

export interface AdoptarNeuronaProps {
  candidatas: NeuronaCandidata[];
  /** Id de la que se está adoptando ahora (deshabilita el resto). */
  adoptando?: string | null;
  /** Mensaje si la adopción falló. */
  error?: string | null;
  onUsar: (n: NeuronaCandidata) => void;
  onOtra: () => void;
  /** Solo pruebas: «ahora» de referencia para «visto hace…». */
  ahora?: number;
}

const ETIQUETA_PARECIDO: Record<string, { texto: string; clase: string }> = {
  mismo: { texto: "Este mismo aparato", clase: "border-emerald-400/40 text-emerald-200 bg-emerald-500/10" },
  probable: { texto: "Casi seguro este aparato", clase: "border-cyan-400/40 text-cyan-200 bg-cyan-500/10" },
  posible: { texto: "Podría ser este aparato", clase: "border-white/20 text-white/70" },
};

function FilaCandidata({ n, adoptando, onUsar, ahora }: { n: NeuronaCandidata; adoptando: string | null; onUsar: (n: NeuronaCandidata) => void; ahora?: number }) {
  const Icono = iconoDe(n.capabilities?.platform);
  const detalle = [n.capabilities?.platform, n.capabilities?.browser].filter(Boolean).join(" · ");
  const etiqueta = n.parecido ? ETIQUETA_PARECIDO[n.parecido] : undefined;
  const medios = (n.otras ?? []).map((o) => o.capabilities?.browser || o.name).filter(Boolean);
  return (
    <li className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <Icono className="h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-white">{n.name || "Dispositivo"}</span>
          {etiqueta && <span className={`rounded-md border px-1.5 py-0.5 text-[10px] leading-none ${etiqueta.clase}`}>{etiqueta.texto}</span>}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {detalle ? `${detalle} · ` : ""}
          {haceCuanto(n.last_seen_at, ahora)}
        </span>
        {medios.length > 0 && (
          <span className="block truncate text-[11px] text-white/45">
            También abierta desde: {medios.join(", ")}
          </span>
        )}
      </span>
      <Button
        size="sm"
        className="shrink-0 cursor-pointer"
        disabled={adoptando !== null}
        onClick={() => onUsar(n)}
        aria-label={`Usar la configuración de ${n.name || "esta neurona"}`}
      >
        {adoptando === n.id ? "Cambiando…" : "Usar su configuración"}
      </Button>
    </li>
  );
}

export function AdoptarNeurona({ candidatas, adoptando = null, error = null, onUsar, onOtra, ahora }: AdoptarNeuronaProps) {
  // (2026-10-09) Una fila por APARATO; los que la huella descarta (otro sistema, otra GPU) van
  // plegados al final: siguen disponibles por si la persona sabe más que la huella.
  const cerca = candidatas.filter((n) => n.parecido !== "distinto");
  const lejos = candidatas.filter((n) => n.parecido === "distinto");
  return (
    <div className="space-y-3" data-testid="adoptar-neurona">
      <ul className="space-y-2" aria-label="Neuronas de tu cuenta">
        {cerca.map((n) => (
          <FilaCandidata key={n.id} n={n} adoptando={adoptando} onUsar={onUsar} ahora={ahora} />
        ))}
      </ul>
      {lejos.length > 0 && (
        <details className="rounded-xl border border-white/10 bg-white/[0.02] p-2" open={cerca.length === 0}>
          <summary className="cursor-pointer px-1 text-xs text-white/60">
            Otros aparatos de tu cuenta ({lejos.length}): no coinciden con este
          </summary>
          <ul className="mt-2 space-y-2" aria-label="Otros aparatos de tu cuenta">
            {lejos.map((n) => (
              <FilaCandidata key={n.id} n={n} adoptando={adoptando} onUsar={onUsar} ahora={ahora} />
            ))}
          </ul>
        </details>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 text-xs text-amber-100">
          {error}
        </p>
      )}
      <Button variant="outline" className="w-full cursor-pointer border-white/15" disabled={adoptando !== null} onClick={onOtra}>
        Es otro aparato
      </Button>
    </div>
  );
}

export default AdoptarNeurona;
