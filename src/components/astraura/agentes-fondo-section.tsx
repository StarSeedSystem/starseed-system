"use client";

/**
 * PESTAÑA «AGENTES» de la ventana de sistemas (Adenda 193).
 * ----------------------------------------------------------------------------
 * Cierra la configuración inicial dejando la neurona VIVA: los agentes trabajan
 * en segundo plano con procesos imaginativos e intuitivos, se automejoran, y
 * cada uno llega con su uso, su personalidad, su cerebro y sus permisos YA
 * elegidos según este equipo y las carpetas que vinculaste antes.
 *
 * Regla de la ola: nada que ya se decidiera en otra ventana se vuelve a
 * preguntar — los cerebros y las carpetas vienen de la bienvenida, el motor de
 * IA de la pestaña Astraura; aquí solo se decide QUÉ HACEN mientras no miras.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Brain as BrainIcon, ChevronDown, FolderOpen, Globe, Bell, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listAgents } from "@/lib/agents/store";
import { listBrains, type Brain } from "@/lib/brains/brains";
import { listarCarpetas, type CarpetaVinculada } from "@/lib/storage/carpetas-vinculadas";
import { listPersonalityProfiles } from "@/lib/aurora/personalities";
import {
  configAutomatica, getConfigAgentesFondo, saveConfigAgentesFondo, INTENSIDADES,
  type ConfigAgentesFondo, type AgenteFondo, type IntensidadFondo,
} from "@/lib/agents/background-config";
import { detectar, type HW } from "@/lib/onboarding/neuron-recommend";

const selectCls =
  "w-full cursor-pointer rounded-lg border border-[var(--aw-line)] bg-[var(--aw-field)] px-2 py-1.5 text-[11px] text-[var(--aw-strong)] outline-none transition-colors focus:border-cyan-400/50";

export function AgentesFondoSection({ compact = false }: { compact?: boolean }) {
  const [config, setConfig] = useState<ConfigAgentesFondo | null>(null);
  const [cerebros, setCerebros] = useState<Brain[]>([]);
  const [carpetas, setCarpetas] = useState<CarpetaVinculada[]>([]);
  const [hw, setHw] = useState<HW | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const personalidades = useMemo(() => {
    try { return listPersonalityProfiles(); } catch { return []; }
  }, []);

  // Carga: agentes + cerebros + carpetas + hardware → config AUTO si no había.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const cs = await listBrains().catch(() => [] as Brain[]);
      const cps = listarCarpetas();
      const h = await detectar().catch(() => null);
      if (!vivo) return;
      setCerebros(cs); setCarpetas(cps); setHw(h);
      const guardada = getConfigAgentesFondo();
      if (guardada) { setConfig(guardada); return; }
      const agentes = (() => { try { return listAgents(); } catch { return []; } })();
      setConfig(configAutomatica({
        agentes, hw: h ? { nucleos: h.nucleos, ramGB: h.ramGB } : null,
        cerebroId: cs[0]?.id ?? null, hayCarpetas: cps.length > 0,
      }));
    })();
    return () => { vivo = false; };
  }, []);

  const patch = useCallback((p: Partial<ConfigAgentesFondo>) => {
    setConfig((c) => (c ? { ...c, ...p } : c));
    setGuardado(false);
  }, []);

  const patchAgente = useCallback((id: string, p: Partial<AgenteFondo>) => {
    setConfig((c) => (c ? { ...c, agentes: c.agentes.map((a) => (a.agentId === id ? { ...a, ...p } : a)) } : c));
    setGuardado(false);
  }, []);

  const aplicar = useCallback(async () => {
    if (!config) return;
    setGuardando(true);
    try { await saveConfigAgentesFondo(config); setGuardado(true); }
    finally { setGuardando(false); }
  }, [config]);

  if (!config) {
    return (
      <p className="flex items-center gap-2 px-1 py-6 text-[12px] text-[var(--aw-muted)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Analizando este equipo y tus cerebros…
      </p>
    );
  }

  const activos = config.agentes.filter((a) => a.activo).length;
  const intens = INTENSIDADES.find((i) => i.id === config.intensidad);

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      {/* Resumen de lo que el agente de integración decidió por ti */}
      <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/[0.05] px-3 py-2.5">
        <p className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-[var(--aw-strong)]">
          <Sparkles className="h-3.5 w-3.5 text-cyan-300" aria-hidden /> Tus agentes, trabajando también cuando no miras
          <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-medium text-cyan-200">
            {activos} activo{activos === 1 ? "" : "s"} · {intens?.label}
          </span>
        </p>
        <p className="mt-1 text-[10px] leading-snug text-[var(--aw-muted)]">
          Ya está todo elegido para este equipo{hw ? ` (${hw.so}${hw.nucleos ? `, ${hw.nucleos} núcleos` : ""})` : ""}:
          imaginan y proponen en segundo plano, se automejoran, y cada uno usa
          {cerebros[0] ? ` tu cerebro «${cerebros[0].name}»` : " tu cerebro principal"}
          {carpetas.length > 0 ? ` con las ${carpetas.length} carpeta(s) que vinculaste` : ""}. Cambia lo que quieras.
        </p>
      </div>

      {/* Interruptores maestros */}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--aw-line)] bg-[var(--aw-surface)] px-3 py-2.5">
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-[var(--aw-strong)]">Imaginación intuitiva de fondo</span>
            <span className="block text-[10px] leading-snug text-[var(--aw-muted)]">Exploran ideas y te dejan propuestas mientras el equipo descansa.</span>
          </span>
          <Switch checked={config.imaginacion} onCheckedChange={(v) => patch({ imaginacion: v })} aria-label="Imaginación de fondo" />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--aw-line)] bg-[var(--aw-surface)] px-3 py-2.5">
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-[var(--aw-strong)]">Automejora autónoma</span>
            <span className="block text-[10px] leading-snug text-[var(--aw-muted)]">Revisan su propio trabajo y afinan lo que hacen por ti.</span>
          </span>
          <Switch checked={config.automejora} onCheckedChange={(v) => patch({ automejora: v })} aria-label="Automejora autónoma" />
        </label>
      </div>

      {/* Intensidad */}
      <label className="block">
        <span className="text-[11px] text-[var(--aw-muted)]">Intensidad en este equipo</span>
        <select
          value={config.intensidad}
          onChange={(e) => {
            const id = e.target.value as IntensidadFondo;
            patch({ intensidad: id, frecuenciaMin: INTENSIDADES.find((i) => i.id === id)?.min ?? 30 });
          }}
          className={cn(selectCls, "mt-1")}
        >
          {INTENSIDADES.map((i) => (
            <option key={i.id} value={i.id}>{i.label} — {i.desc} (cada {i.min} min)</option>
          ))}
        </select>
      </label>

      {/* Un agente por fila: plegado muestra lo esencial; abierto, todo. */}
      <div className="space-y-1.5">
        {config.agentes.map((a) => {
          const open = abierto === a.agentId;
          return (
            <div key={a.agentId} className="rounded-xl border border-[var(--aw-line)] bg-[var(--aw-surface)]">
              <div className="flex items-center gap-2 px-3 py-2">
                <Bot className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
                <button
                  type="button"
                  onClick={() => setAbierto(open ? null : a.agentId)}
                  aria-expanded={open}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                >
                  <span className="block truncate text-[12px] font-semibold text-[var(--aw-strong)]">{a.nombre}</span>
                  <span className="block truncate text-[10px] text-[var(--aw-muted)]">{a.uso}</span>
                </button>
                <ChevronDown
                  className={cn("h-3.5 w-3.5 shrink-0 text-[var(--aw-faint)] transition-transform", open && "rotate-180")}
                  aria-hidden
                />
                <Switch checked={a.activo} onCheckedChange={(v) => patchAgente(a.agentId, { activo: v })} aria-label={`Activar ${a.nombre}`} />
              </div>

              {open && (
                <div className="space-y-2 border-t border-[var(--aw-line)] px-3 py-2.5">
                  <label className="block">
                    <span className="text-[10px] text-[var(--aw-muted)]">Para qué lo usas</span>
                    <Input
                      value={a.uso}
                      onChange={(e) => patchAgente(a.agentId, { uso: e.target.value })}
                      className="mt-1 h-8 text-[11px]"
                    />
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-[10px] text-[var(--aw-muted)]">Personalidad</span>
                      <select
                        value={a.personalidad}
                        onChange={(e) => patchAgente(a.agentId, { personalidad: e.target.value })}
                        className={cn(selectCls, "mt-1")}
                      >
                        <option value="auto">Automática — Astraura elige por contexto</option>
                        {personalidades.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-[var(--aw-muted)]">Cerebro vinculado</span>
                      <select
                        value={a.cerebroId ?? ""}
                        onChange={(e) => patchAgente(a.agentId, { cerebroId: e.target.value || null })}
                        className={cn(selectCls, "mt-1")}
                      >
                        <option value="">Cerebro principal</option>
                        {cerebros.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-3 pt-0.5">
                    {([
                      { k: "carpetas" as const, label: "Leer tus carpetas", Icon: FolderOpen, off: carpetas.length === 0 },
                      { k: "red" as const, label: "Buscar en la red", Icon: Globe, off: false },
                      { k: "avisos" as const, label: "Avisarte", Icon: Bell, off: false },
                    ]).map(({ k, label, Icon, off }) => (
                      <label key={k} className={cn("flex items-center gap-1.5 text-[10px] text-[var(--aw-muted)]", off && "opacity-50")}>
                        <Switch
                          checked={a.permisos[k]}
                          disabled={off}
                          onCheckedChange={(v) => patchAgente(a.agentId, { permisos: { ...a.permisos, [k]: v } })}
                          aria-label={`${label} — ${a.nombre}`}
                        />
                        <Icon className="h-3 w-3" aria-hidden /> {label}
                        {off && k === "carpetas" && <span className="text-[9px]">(sin carpetas vinculadas)</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void aplicar()} disabled={guardando}>
          {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <BrainIcon className="h-3.5 w-3.5" aria-hidden />}
          {guardado ? "Aplicado ✓" : "Aceptar y encender"}
        </Button>
        <span className="text-[10px] leading-snug text-[var(--aw-muted)]">
          Se guarda por neurona y se aplica al instante. Si el motor local aún no está despierto, queda listo para
          cuando lo esté — y todo se cambia luego en Ajustes → Agentes.
        </span>
      </div>
    </div>
  );
}

export default AgentesFondoSection;
