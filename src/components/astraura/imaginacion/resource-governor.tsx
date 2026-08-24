"use client";

/**
 * GOBERNADOR DE RECURSOS 1.58b — Tronco A (Imaginación) / Tronco B (Multi-Agentes) / Reserva de Chat.
 * ----------------------------------------------------------------------------
 * De `IntuitiveImaginationView.jsx` (spec §2): bloque independiente entre la
 * cabecera y las sub-pestañas. Pinta la barra de 3 tramos con los porcentajes
 * de `dualTrunk` TAL CUAL llegan del backend (sin normalizar a 100%, el
 * original tampoco lo hace) y dos deslizadores para Tronco A/B — la reserva
 * de chat y los núcleos de cada tronco son de solo lectura, los recalcula
 * el backend.
 *
 * MEJORA sobre el original (pedida explícitamente): el original disparaba
 * `POST /system/dual_trunk` en cada `onChange` del `<input type="range">`
 * (una petición por píxel arrastrado). Aquí se espera 400 ms de silencio del
 * usuario antes de llamar al backend.
 */

import { useEffect, useRef, useState } from "react";
import { Cpu } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setAstraura158DualTrunk, type Astraura158DualTrunk, type Astraura158Target } from "@/lib/astraura/astraura-158-client";
import { Slider } from "@/components/ui/slider";
import { CARD, LABEL, MONO, SUB, SectionTitle } from "@/components/astraura/s158/shared";

const DEBOUNCE_MS = 400;

export interface ResourceGovernorProps {
  target: Astraura158Target;
  /** Estado actual del tronco dual (con los valores `[FALLBACK]` del original si el backend aún no respondió). */
  trunk: Astraura158DualTrunk;
  /** El backend devuelve el objeto COMPLETO tras cada escritura; reemplaza el estado del padre entero. */
  onChanged: (next: Astraura158DualTrunk) => void;
  /** Tras aplicar, el original relanza `loadData()` para resincronizar todo. */
  onReload?: () => void | Promise<void>;
}

export const DUAL_TRUNK_FALLBACK: Astraura158DualTrunk = {
  imagination_global_percent: 25,
  swarm_global_percent: 40,
  interactive_reserve_percent: 35,
  imagination_cores: 2,
  swarm_cores: 3,
  user_chat_cores: 3,
};

export function ResourceGovernor({ target, trunk, onChanged, onReload }: ResourceGovernorProps) {
  const [imag, setImag] = useState(trunk.imagination_global_percent ?? 25);
  const [swarm, setSwarm] = useState(trunk.swarm_global_percent ?? 40);
  const [pending, setPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextRef = useRef({ imag, swarm });

  // El backend puede devolver un objeto nuevo entre medias (poll global);
  // si el usuario no tiene un cambio pendiente, seguimos su valor.
  useEffect(() => {
    if (pending) return;
    setImag(trunk.imagination_global_percent ?? 25);
    setSwarm(trunk.swarm_global_percent ?? 40);
  }, [trunk.imagination_global_percent, trunk.swarm_global_percent, pending]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function schedule(nextImag: number, nextSwarm: number) {
    nextRef.current = { imag: nextImag, swarm: nextSwarm };
    setPending(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const { imag: i, swarm: s } = nextRef.current;
      const r = await setAstraura158DualTrunk(target, i, s);
      setPending(false);
      if (r.ok) {
        onChanged(r.data);
        toast.success(`⚡ Doble Tronco Ajustado: ${i}% Imaginación | ${s}% Multi-Agentes`);
        await onReload?.();
      } else {
        toast.error(`Gobernador de Recursos: ${r.error}`);
      }
    }, DEBOUNCE_MS);
  }

  const reserve = trunk.interactive_reserve_percent ?? Math.max(0, 100 - imag - swarm);
  const imagCores = trunk.imagination_cores ?? 2;
  const swarmCores = trunk.swarm_cores ?? 3;
  const chatCores = trunk.user_chat_cores ?? 3;

  return (
    <div className={cn(CARD, "p-3")}>
      <SectionTitle
        icon={Cpu}
        title="Gobernador de Recursos 1.58b // Tronco A (Imaginación) & Tronco B (Multi-Agentes)"
        tone="text-cyan-300"
        right={
          <span className={cn(SUB, "px-2 py-1 text-[10px] text-white/70")}>
            Reserva Chat: <strong className="text-white/90">{reserve}% ({chatCores} Núcleos)</strong>
            {pending && <span className="ml-1 text-cyan-300">· aplicando…</span>}
          </span>
        }
      />

      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full border border-white/10 bg-black/30">
        <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-300" style={{ width: `${imag}%` }} title={`Tronco A (Imaginación): ${imag}%`} />
        <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300" style={{ width: `${swarm}%` }} title={`Tronco B (Multi-Agentes): ${swarm}%`} />
        <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300" style={{ width: `${reserve}%` }} title={`Chat de Usuario: ${reserve}%`} />
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/60">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500" aria-hidden="true" /> Tronco A (Imaginación): {imag}%</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500" aria-hidden="true" /> Tronco B (Multi-Agentes): {swarm}%</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" aria-hidden="true" /> Chat de Usuario: {reserve}%</span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className={LABEL}>Tronco A (Imaginación Global): {imag}% ({imagCores} Núcleos M1)</p>
          <Slider
            className="mt-2.5"
            min={5} max={50} step={5}
            value={[imag]}
            onValueChange={([v]) => { setImag(v); schedule(v, swarm); }}
            aria-label={`Tronco A, Imaginación Global: ${imag} por ciento`}
          />
        </div>
        <div>
          <p className={LABEL}>Tronco B (Enjambre Global): {swarm}% ({swarmCores} Núcleos M1)</p>
          <Slider
            className="mt-2.5"
            min={10} max={60} step={5}
            value={[swarm]}
            onValueChange={([v]) => { setSwarm(v); schedule(imag, v); }}
            aria-label={`Tronco B, Enjambre Global: ${swarm} por ciento`}
          />
        </div>
      </div>
      <p className={cn(MONO, "mt-2")}>Sin deslizador para la reserva de chat ni para los núcleos: los recalcula el backend tras cada ajuste.</p>
    </div>
  );
}

export default ResourceGovernor;
