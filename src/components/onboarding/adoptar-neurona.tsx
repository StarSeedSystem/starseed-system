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

export function AdoptarNeurona({ candidatas, adoptando = null, error = null, onUsar, onOtra, ahora }: AdoptarNeuronaProps) {
  return (
    <div className="space-y-3" data-testid="adoptar-neurona">
      <ul className="space-y-2" aria-label="Neuronas de tu cuenta">
        {candidatas.map((n) => {
          const Icono = iconoDe(n.capabilities?.platform);
          const detalle = [n.capabilities?.platform, n.capabilities?.browser].filter(Boolean).join(" · ");
          return (
            <li key={n.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <Icono className="h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{n.name || "Dispositivo"}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {detalle ? `${detalle} · ` : ""}
                  {haceCuanto(n.last_seen_at, ahora)}
                </span>
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
        })}
      </ul>
      {error && (
        <p role="alert" className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 text-xs text-amber-100">
          {error}
        </p>
      )}
      <Button variant="outline" className="w-full cursor-pointer border-white/15" disabled={adoptando !== null} onClick={onOtra}>
        Es otra neurona
      </Button>
    </div>
  );
}

export default AdoptarNeurona;
