"use client";

/**
 * "APLICACIÓN SINCRONIZADA MULTI-AGENTE EN 2DO PLANO" — spec §7.5.
 * ----------------------------------------------------------------------------
 * Modal de progreso que acompaña a `applyAllProposals()`: 6 tarjetas de
 * sub-agente FIJAS en el cliente (nombres/colores/áreas no vienen del
 * backend, el original las hardcodea igual), cada una leyendo cuántas tareas
 * lleva procesadas (`agent_progress[key].tasks`), más el log en vivo.
 *
 * Sondea `fetchAstraura158SyncExecution` cada 2 s mientras el modal está
 * abierto (pedido explícito de la tarea, más agresivo que el resto de la
 * pantalla porque aquí sí importa ver avanzar la barra en tiempo real).
 */

import { useEffect, useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import { fetchAstraura158SyncExecution, type Astraura158SyncExecution, type Astraura158Target } from "@/lib/astraura/astraura-158-client";
import { Bar, BTN, BTN_PRIMARY, LABEL, MONO, SUB } from "@/components/astraura/s158/shared";

const SUB_AGENTS: { key: string; name: string; area: string; color: string }[] = [
  { key: "hephaestus", name: "Hephaestus (Ingeniería)", area: "Kernels SIMD M1", color: "#10b981" },
  { key: "oneiros", name: "Oneiros (Síntesis)", area: "Shaders WebGL & UI", color: "#ec4899" },
  { key: "mnemosyne", name: "Mnemosyne (Memoria)", area: "Grafos Sinápticos", color: "#a855f7" },
  { key: "architectus", name: "Architectus (Proyectos)", area: "Bóveda & Ramas", color: "#38bdf8" },
  { key: "hermes", name: "Hermes (Web Intel)", area: "Tendencias & Docs", color: "#f59e0b" },
  { key: "athena", name: "Athena (Sentinel)", area: "Seguridad & AST", color: "#6366f1" },
];

const LOGS_FALLBACK = [
  "🚀 Iniciando aplicación sincronizada con agentes multi-área bajo supervisión de Metis Prime...",
  "⚡ Hephaestus optimizando kernel ARM NEON...",
  "⚡ Oneiros forjando shaders ciberdélicos...",
  "⚡ Mnemosyne entrelazando nodos en la Bóveda Soberana...",
  "⚡ Architectus estructurando clústeres y ramas de proyectos...",
  "✅ Sincronización exitosa. Todas las propuestas procesadas y verificadas.",
];

export interface SyncModalProps {
  target: Astraura158Target;
  open: boolean;
  onClose: () => void;
  /** "📜 Ver Informe Comprensible": cierra este modal y abre el Informe de Síntesis. */
  onOpenSynthesis: () => void;
}

export function SyncModal({ target, open, onClose, onOpenSynthesis }: SyncModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<Astraura158SyncExecution | null>(null);
  useModalA11y({ open, onClose, containerRef });

  useEffect(() => {
    if (!open) { setProgress(null); return; }
    let alive = true;
    const load = async () => { const r = await fetchAstraura158SyncExecution(target); if (alive && r.ok) setProgress(r.data); };
    void load();
    const id = window.setInterval(() => { void load(); }, 2000);
    return () => { alive = false; window.clearInterval(id); };
  }, [open, target]);

  if (!open) return null;

  const isRunning = progress?.is_running ?? true;
  const pct = progress?.progress_percent ?? (isRunning ? 65 : 100);
  const total = progress?.total_tasks ?? 0;
  const completed = progress?.completed_tasks ?? 0;
  const logs = progress?.current_logs && progress.current_logs.length > 0 ? progress.current_logs : LOGS_FALLBACK;

  return (
    <div ref={containerRef} className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Aplicación Sincronizada Multi-Agente en 2do Plano">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0a0b12] shadow-2xl">
        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white/90">Aplicación Sincronizada Multi-Agente en 2do Plano</p>
            <button type="button" className={BTN} aria-label="Cerrar" onClick={onClose}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
          </div>
          <p className="mt-1 text-[10px] leading-snug text-white/50">Hephaestus, Oneiros, Mnemosyne, Architectus, Hermes &amp; Athena colaborando en paralelo bajo supervisión de Metis Prime.</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className={LABEL}>Progreso Global de Aplicación en Silicio M1:</p>
          <Bar value={pct} className="mt-1.5 h-2.5" />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/55">
            <span>Tareas: {completed}/{total}</span>
            <span className="text-emerald-300">100% Verificación Matemática AST</span>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {SUB_AGENTS.map((a) => {
              const tasks = progress?.agent_progress?.[a.key]?.tasks ?? 0;
              return (
                <div key={a.key} className={cn(SUB, "px-3 py-2")}>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.color, boxShadow: `0 0 8px ${a.color}` }} aria-hidden="true" />
                    <p className="min-w-0 truncate text-[11px] font-medium text-white/90">{a.name}</p>
                  </div>
                  <p className="mt-0.5 truncate text-[9.5px] text-white/50">{a.area}</p>
                  <p className={cn(MONO, "mt-1")}>{tasks} tareas procesadas</p>
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3">
            <p className={LABEL}>Registro en vivo</p>
            <div className="mt-1.5 space-y-1">{logs.map((l, i) => <p key={i} className="font-code text-[10px] leading-snug text-white/65">{l}</p>)}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
          <p className="text-[10px] text-white/50">Supervisión: <strong className="text-white/80">Metis Prime (Orquestador)</strong></p>
          <div className="flex gap-1.5">
            <button type="button" className={BTN} aria-label="Ver informe comprensible" onClick={onOpenSynthesis}><FileText className="h-3.5 w-3.5" aria-hidden="true" /> 📜 Ver Informe Comprensible</button>
            <button type="button" className={BTN_PRIMARY} aria-label="Cerrar y continuar en segundo plano" onClick={onClose}>Cerrar &amp; Continuar en 2do Plano</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SyncModal;
