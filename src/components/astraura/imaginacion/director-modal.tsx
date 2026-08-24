"use client";

/**
 * SUPERVISOR ORQUESTADOR DIRECTOR / METIS — de `IntuitiveImaginationView.jsx`
 * líneas ~2299-2823 (spec §1.6). No es uno de los 5 archivos "modal" propios
 * del encargo original, pero vive dentro de la pantalla de Imaginación y la
 * cabecera lo pide explícitamente: cinta de 4 métricas + 4 pestañas internas
 * (Gobernanza & Preferencias, Cola de Agentes & Tareas Vivas, Bóveda de
 * Memorias & Axiomas, Decisiones & Auditorías).
 *
 * El estado del Director (`director`) lo recibe del padre (`imaginacion-view.tsx`),
 * que ya lo trae en su sondeo central de 5s — así el badge de la cabecera y
 * este modal comparten una sola fuente. La "Cola de Agentes" (`swarm/status`)
 * SÍ es propia de este modal: solo se pide mientras esa pestaña está visible,
 * para no sondear datos que nadie ve.
 *
 * Nota de fidelidad: el original dispara la imaginación supervisada con
 * `triggerDirectorImaginationCycle(targetProjectId, theme)`. Ese endpoint no
 * existe en este cliente; la Ola 6 expone en su lugar
 * `triggerAstraura158DirectorCycle(target)` (`POST /api/director/trigger_cycle`,
 * sin cuerpo) — se usa tal cual, es la única vía real disponible.
 *
 * La pestaña "Bóveda de Memorias" es de SOLO LECTURA: el original permite
 * "Asimilar en Bóveda" vía `addDirectorMemory(...)`, pero esa función no
 * existe en `astraura-158-client.ts` — no se inventa la llamada de red.
 */

import { useEffect, useRef, useState } from "react";
import {
  Activity, Brain, Check, Crown, FolderOpen, Loader2, RefreshCw, Send, ShieldCheck, SlidersHorizontal, Sparkles, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import {
  fetchAstraura158Swarm, renewAstraura158DirectorTasks, steerAstraura158Swarm, triggerAstraura158DirectorCycle,
  updateAstraura158DirectorConfig, type Astraura158DirectorConfig, type Astraura158DirectorStatus,
  type Astraura158SwarmTask, type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";
import { Slider } from "@/components/ui/slider";
import { BTN, BTN_PRIMARY, Badge, Bar, BusyIcon, Empty, INPUT, LABEL, MONO, PILL, PILL_OFF, PILL_ON, SUB, TEXTAREA, fmtTs, useBusy } from "@/components/astraura/s158/shared";

const MASTER_DIRECTIVE_FALLBACK = "Supervisión continua, balance de hardware M1 y enrutamiento inteligente de activos a proyectos.";

const ORCHESTRATION_MODES: { id: string; title: string; description: string }[] = [
  { id: "autonomous_proactive", title: "⚡ Proactivo Autónomo (Recomendado)", description: "Renovación continua e inteligente de tareas en 2do plano sin detenerse, balanceando el silicio M1." },
  { id: "strict_quality", title: "🛡️ Calidad Estricta (Verificación >= 85%)", description: "Auditoría rigurosa de cada entregable antes de enrutar a proyectos. Refinamiento automático si no cumple." },
  { id: "user_guided", title: "🎯 Guiado por Directivas del Usuario", description: "Prioriza las instrucciones explícitas emitidas por el Arquitecto sobre las ráfagas automáticas." },
  { id: "eco_silicon", title: "🍃 Silicio Eficiente / Eco-Thermal", description: "Limita el uso de CPU a menos del 30% manteniendo temperaturas óptimas en Mac." },
];

/** `auto_renew_tasks` no existe como campo tipado en `Astraura158DirectorConfig`
 *  (el cliente solo tipa los otros 3 switches de automatización); se extiende
 *  localmente en `DirectorConfigForm` para conservar el 4º switch literal del
 *  original sin inventar un campo en el cliente compartido. */
type AutomationKey = "auto_renew_tasks" | "auto_route_to_projects" | "auto_inject_axioms" | "auto_trigger_imagination";
const AUTOMATION_SWITCHES: { key: AutomationKey; title: string; description: string }[] = [
  { key: "auto_renew_tasks", title: "🔄 Renovación Automática de Tareas", description: "Formula y despacha la siguiente tarea inteligente al completarse la anterior." },
  { key: "auto_route_to_projects", title: "🎯 Enrutamiento y Auto-Adjunto a Proyectos", description: "Vincula código, shaders y papers a proj_astraura_core y carpetas locales." },
  { key: "auto_inject_axioms", title: "🧠 Auto-Inyección de Axiomas a Cerebros", description: "Destila recuerdos clave y axiomas lógicos en el exocórtex StarSeed." },
  { key: "auto_trigger_imagination", title: "🌌 Disparador Autónomo de Imaginación", description: "Despierta ciclos creativos cuando el sistema detecta margen de optimización." },
];

type DirectorTab = "governance" | "queue" | "memories" | "audits";
const DIRECTOR_TABS: { id: DirectorTab; label: string; icon: typeof SlidersHorizontal }[] = [
  { id: "governance", label: "⚙️ Gobernanza & Preferencias", icon: SlidersHorizontal },
  { id: "queue", label: "⚡ Cola de Agentes & Tareas Vivas", icon: Activity },
  { id: "memories", label: "🧠 Bóveda de Memorias & Axiomas", icon: Brain },
  { id: "audits", label: "🛡️ Decisiones & Auditorías", icon: ShieldCheck },
];

/** Campos reales del swarm task que el cliente no tipa (spec §1.6, pestaña `queue`). */
interface SwarmTaskFull extends Astraura158SwarmTask {
  artifact_file?: string;
  target_folder_path?: string;
  logs?: string[];
}

/** `form` local: el config real + el 4º switch (`auto_renew_tasks`) que el original tiene pero el cliente no tipa. */
interface DirectorConfigForm extends Astraura158DirectorConfig {
  auto_renew_tasks?: boolean;
}

export interface DirectorModalProps {
  target: Astraura158Target;
  open: boolean;
  onClose: () => void;
  director: Astraura158DirectorStatus | null;
  onReload: () => void | Promise<void>;
}

/** Badge "Modo de Gobernanza" de la cabecera (reutilizado también en `imaginacion-view.tsx`). */
export function directorModeBadge(config?: Astraura158DirectorConfig | null): string {
  return config?.orchestration_mode === "strict_quality" ? "Calidad Estricta" : "Proactivo Autónomo";
}

export function DirectorModal({ target, open, onClose, director, onReload }: DirectorModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<DirectorTab>("governance");
  const { busy, wrap } = useBusy();
  useModalA11y({ open, onClose, containerRef });

  const config = director?.config ?? director?.director?.config ?? {};
  const [form, setForm] = useState<DirectorConfigForm>(config);
  useEffect(() => { if (open) setForm(director?.config ?? director?.director?.config ?? {}); }, [open, director]);

  if (!open) return null;

  const name = director?.director?.name ?? "Astraura Director // Metis Prime";
  const verifications = director?.director?.verifications_completed_count ?? 25;

  const saveConfig = () => {
    void wrap("guardar", async () => {
      const r = await updateAstraura158DirectorConfig(target, form);
      if (r.ok) { toast.success("Configuración del Director guardada"); await onReload(); } else toast.error(`Guardar configuración: ${r.error}`);
    });
  };

  return (
    <div ref={containerRef} className="fixed inset-0 z-[85] flex items-center justify-center bg-black/75 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label={name}>
      <div className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0a0b12] shadow-2xl">
        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Crown className="h-5 w-5 animate-pulse text-amber-300" aria-hidden="true" />
            <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white/90">{name}</p>
            <Badge tone="border-amber-400/30 bg-amber-500/10 text-amber-200">v1.58b-Supreme-Executive</Badge>
            <Badge tone="border-emerald-400/30 bg-emerald-500/10 text-emerald-200">● Activo en 2do Plano</Badge>
            <button type="button" className={BTN} aria-label="Cerrar Director" onClick={onClose}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
          </div>
          <p className="mt-1 text-[10px] leading-snug text-white/50">Supervisor General de Tareas, Agentes, Procesos Imaginativos &amp; Renovación Continua de Desarrollo</p>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-white/10 px-4 py-3 sm:grid-cols-4">
          <div className={cn(SUB, "px-2.5 py-1.5")}><p className={LABEL}>Modo de Gobernanza</p><p className="mt-0.5 text-[11px] font-semibold text-white/85">{form.orchestration_mode === "strict_quality" ? "🛡️ Calidad Estricta" : "⚡ Proactivo Autónomo"}</p></div>
          <div className={cn(SUB, "px-2.5 py-1.5")}><p className={LABEL}>Umbral Mínimo</p><p className="mt-0.5 text-[11px] font-semibold text-white/85">{form.quality_threshold ?? 85}% Calidad</p></div>
          <div className={cn(SUB, "px-2.5 py-1.5")}><p className={LABEL}>Verificaciones</p><p className="mt-0.5 text-[11px] font-semibold text-white/85">{verifications} Auditadas</p></div>
          <div className={cn(SUB, "px-2.5 py-1.5")}><p className={LABEL}>Límite Silicio M1</p><p className="mt-0.5 text-[11px] font-semibold text-white/85">{form.m1_hardware_limit_percent ?? 50}% CPU</p></div>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-white/10 px-3 py-2">
          {DIRECTOR_TABS.map((t) => (
            <button key={t.id} type="button" className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] transition-colors", tab === t.id ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white/80")} onClick={() => setTab(t.id)} aria-current={tab === t.id}>
              <t.icon className="h-3.5 w-3.5" aria-hidden="true" /> {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "governance" && (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {ORCHESTRATION_MODES.map((m) => (
                  <button
                    key={m.id} type="button"
                    className={cn("cursor-pointer rounded-lg border p-3 text-left transition-colors", form.orchestration_mode === m.id ? "border-purple-400/50 bg-purple-500/10" : "border-white/10 bg-black/20 hover:border-white/25")}
                    aria-pressed={form.orchestration_mode === m.id}
                    onClick={() => setForm((f) => ({ ...f, orchestration_mode: m.id }))}
                  >
                    <p className="text-[11px] font-semibold text-white/90">{m.title}</p>
                    <p className="mt-1 text-[10px] leading-snug text-white/55">{m.description}</p>
                  </button>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className={LABEL}>Umbral de Calidad Mínimo para Aprobación: {form.quality_threshold ?? 85}%</p>
                  <Slider className="mt-2" min={50} max={98} step={1} value={[form.quality_threshold ?? 85]} onValueChange={([v]) => setForm((f) => ({ ...f, quality_threshold: v }))} aria-label="Umbral de calidad mínimo para aprobación" />
                </div>
                <div>
                  <p className={LABEL}>Cuota Máxima de Silicio Apple M1: {form.m1_hardware_limit_percent ?? 50}%</p>
                  <Slider className="mt-2" min={10} max={80} step={1} value={[form.m1_hardware_limit_percent ?? 50]} onValueChange={([v]) => setForm((f) => ({ ...f, m1_hardware_limit_percent: v }))} aria-label="Cuota máxima de silicio Apple M1" />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {AUTOMATION_SWITCHES.map((s) => {
                  const on = !!form[s.key];
                  return (
                    <button
                      key={s.key} type="button"
                      className={cn("flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-left transition-colors", on ? "border-cyan-400/40 bg-cyan-500/10" : "border-white/10 bg-black/20 hover:border-white/25")}
                      aria-pressed={on}
                      onClick={() => setForm((f) => ({ ...f, [s.key]: !on }))}
                    >
                      <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-cyan-300 bg-cyan-400/30 text-cyan-100" : "border-white/25 text-transparent")}><Check className="h-3 w-3" aria-hidden="true" /></span>
                      <span>
                        <p className="text-[11px] font-semibold text-white/90">{s.title}</p>
                        <p className="mt-0.5 text-[10px] leading-snug text-white/55">{s.description}</p>
                      </span>
                    </button>
                  );
                })}
              </div>

              <label className="block">
                <span className={LABEL}>Directiva Maestra Activa del Director:</span>
                <textarea className={cn(TEXTAREA, "mt-1")} value={form.default_master_directive ?? MASTER_DIRECTIVE_FALLBACK} onChange={(e) => setForm((f) => ({ ...f, default_master_directive: e.target.value }))} aria-label="Directiva maestra activa del Director" />
              </label>

              <div className="flex justify-end">
                <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label="Guardar configuración del Director" onClick={saveConfig}><BusyIcon busy={busy === "guardar"} icon={Check} /> Guardar Configuración</button>
              </div>
            </div>
          )}

          {tab === "queue" && <QueueTab target={target} open={open} tab={tab} />}

          {tab === "memories" && (
            <div className="space-y-2">
              <p className="text-[10px] text-white/45">Bóveda de solo lectura en esta reconstrucción — no hay una función de cliente para «Asimilar en Bóveda» (`addDirectorMemory`) en `astraura-158-client.ts`.</p>
              {(director?.executive_memories ?? []).length === 0 && <Empty text="Sin memorias ejecutivas todavía." />}
              <div className="grid gap-2 sm:grid-cols-2">
                {(director?.executive_memories ?? []).map((m) => (
                  <div key={m.id ?? m.title} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-[11px] font-medium text-white/85">{m.title ?? "Memoria"}</p>
                      {m.importance && <Badge tone="border-white/15 bg-white/[0.04] text-white/60">{m.importance}</Badge>}
                    </div>
                    {m.category && <p className="text-[9.5px] text-white/45">{m.category}</p>}
                    {m.content && <p className="mt-1 text-[10px] leading-snug text-white/60">{m.content}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "audits" && (
            <div className="space-y-2">
              {(director?.audit_log ?? []).length === 0 && <Empty text="Sin auditorías registradas todavía." />}
              {(director?.audit_log ?? []).map((a, i) => {
                const approved = /aprobado|approved/i.test(String(a.verdict ?? ""));
                return (
                  <div key={i} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/85">{a.target ?? "Auditoría"}</p>
                      <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px]", approved ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-amber-400/30 bg-amber-500/10 text-amber-200")}>{a.verdict ?? "—"}</span>
                      <span className="text-[9.5px] text-white/45">Score: {a.quality_score ?? "—"}%</span>
                    </div>
                    {a.details && <p className="mt-1 text-[10px] leading-snug text-white/60">{a.details}</p>}
                    <p className={cn(MONO, "mt-1")}>proj_astraura_core · {fmtTs(a.timestamp)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QueueTab({ target, open, tab }: { target: Astraura158Target; open: boolean; tab: DirectorTab }) {
  const [tasks, setTasks] = useState<SwarmTaskFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [directive, setDirective] = useState("");
  const { busy, wrap } = useBusy();

  useEffect(() => {
    if (!open || tab !== "queue") return;
    let alive = true;
    const load = async () => {
      const r = await fetchAstraura158Swarm(target);
      if (!alive) return;
      if (r.ok) { setTasks((r.data.active_tasks as SwarmTaskFull[] | undefined) ?? []); setError(""); } else { setError(r.error); }
      setLoading(false);
    };
    void load();
    const id = window.setInterval(() => { void load(); }, 5000);
    return () => { alive = false; window.clearInterval(id); };
  }, [target, open, tab]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label="Disparar imaginación supervisada"
          onClick={() => { void wrap("imaginar", async () => { const r = await triggerAstraura158DirectorCycle(target); if (r.ok) toast.success("🌌 Ciclo supervisado disparado"); else toast.error(`Disparar imaginación: ${r.error}`); }); }}
        >
          <BusyIcon busy={busy === "imaginar"} icon={Sparkles} /> 🌌 Disparar Imaginación
        </button>
        <button
          type="button" className={BTN} disabled={busy !== ""} aria-label="Forzar renovación de tareas"
          onClick={() => { void wrap("renovar", async () => { const r = await renewAstraura158DirectorTasks(target); if (r.ok) toast.success(`Tareas renovadas: ${r.data.renewed_tasks?.length ?? 0}`); else toast.error(`Forzar renovación: ${r.error}`); }); }}
        >
          <BusyIcon busy={busy === "renovar"} icon={RefreshCw} /> 🔄 Forzar Renovación
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          className={cn(INPUT, "min-w-[260px] flex-1")} value={directive} onChange={(e) => setDirective(e.target.value)}
          placeholder="Emitir directiva ejecutiva inmediata al Director (ej: 'Priorizar optimización de perplejidad')..."
          aria-label="Directiva ejecutiva inmediata"
        />
        <button
          type="button" className={BTN} disabled={busy !== "" || !directive.trim()} aria-label="Reorientar el enjambre"
          onClick={() => { void wrap("reorientar", async () => { const r = await steerAstraura158Swarm(target, directive.trim(), "proj_astraura_core"); if (r.ok) { toast.success("Directiva emitida al enjambre"); setDirective(""); } else toast.error(`Reorientar: ${r.error}`); }); }}
        >
          <BusyIcon busy={busy === "reorientar"} icon={Send} /> Reorientar
        </button>
      </div>

      {loading && <p className="flex items-center gap-1.5 text-[11px] text-white/55"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Leyendo cola del enjambre…</p>}
      {!loading && error && <Empty error={error} text="Sin conexión con el backend." />}
      {!loading && !error && tasks.length === 0 && <Empty text="Sin tareas activas en el enjambre." />}
      <div className="grid gap-2 sm:grid-cols-2">
        {tasks.map((t) => (
          <div key={t.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[11px] font-medium text-white/85">{t.agent_name ?? "Agente"}</p>
              <span className="text-[10px] text-white/50">{t.progress ?? 0}%</span>
            </div>
            {t.title && <p className="mt-0.5 truncate text-[10px] text-white/60">{t.title}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[9.5px] text-white/50">
              {t.real_memory_mb !== undefined && <span className={cn(PILL, PILL_OFF, "px-1.5 py-0.5")}>RAM: {t.real_memory_mb} MB</span>}
              {t.allocated_cpu_percent !== undefined && <span className={cn(PILL, PILL_OFF, "px-1.5 py-0.5")}>CPU: {t.allocated_cpu_percent}%</span>}
              {t.phase_label && <span className={cn(PILL, PILL_ON, "px-1.5 py-0.5")}>🔄 {t.phase_label}</span>}
              {(t.artifact_file || t.target_folder_path) && (
                <button type="button" className={cn(BTN, "px-1.5 py-0.5")} aria-label="Abrir carpeta o artefacto" onClick={() => toast.message("Sin visor de archivos soberano en esta reconstrucción", { description: t.artifact_file ?? t.target_folder_path })}>
                  <FolderOpen className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </div>
            <Bar value={t.progress} className="mt-1.5" />
            {t.logs && t.logs.length > 0 && (
              <div className="mt-1.5 space-y-0.5">{t.logs.slice(-2).map((l, i) => <p key={i} className="truncate font-code text-[9px] text-white/45">{l}</p>)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default DirectorModal;
