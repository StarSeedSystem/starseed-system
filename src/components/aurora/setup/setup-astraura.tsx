"use client";

/**
 * Pestaña ASTRAURA del Centro de Configuración (Adenda 67 · P1-2 y P1-3).
 * ============================================================================
 * P1-2 — REPARTO: qué habilidades y qué repos se instalan en cada NEURONA, en
 * cada CEREBRO y en el PERFIL de la cuenta. Por defecto, TODAS en TODOS (semilla):
 * el usuario no tiene que hacer nada. Al quitar una, el objetivo pasa de «todas»
 * a una lista explícita; si vuelve a estar completa, regresa a «todas» (semántica
 * viva: lo que instales mañana entra solo).
 *
 * Efecto REAL en los cerebros: además de guardar el reparto, se escribe la clave
 * por cerebro `starseed.brain.<id>.skills` (`brainSkillsKey`) que ya consume el
 * panel de cerebros del OS. No es un registro paralelo muerto.
 *
 * P1-3 — UNIFICACIÓN: la misma configuración se aplica a toda la cuenta, grupos,
 * páginas, entidades y contextos de red. Los overrides por entidad los consume de
 * verdad `resolvePersonalityForContext()` (vía `entityOverrideFromPath`), así que
 * una entidad puede tener SU personalidad en cualquier sección del OS.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Cpu, RefreshCw, Server, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  SCOPE_ENTITY_ROUTES,
  deployFor,
  getScope,
  hasRepo,
  hasSkill,
  resetDeploy,
  saveScope,
  setEntityOverride,
  toggleRepo,
  toggleSkill,
  type AstrauraScope,
  type DeployKind,
} from "@/lib/aurora/setup-config";
import { SKILL_CAPABILITIES } from "@/ai/astraura/skills";
import { DEFAULT_BRAIN_SKILLS } from "@/lib/brain-skills/default-skills";
import { allPackages, listRepos } from "@/lib/library/packages";
import { listBrains, brainSkillsKey, type Brain } from "@/lib/brains/brains";
import { listNeurons, type Neuron } from "@/lib/neurons/neurons";
import { listPersonalityProfiles, type PersonalityProfile } from "@/lib/aurora/personalities";
import { Block, Chip, Note, Toggle, btnCls, inputCls, labelCls, selectCls } from "./setup-ui";

interface SkillLite {
  id: string;
  label: string;
  kind: string;
}

interface Target {
  kind: DeployKind;
  id: string | null;
  label: string;
  sub: string;
  icon: "perfil" | "cerebro" | "neurona";
}

export function SetupAstraura() {
  const [brains, setBrains] = useState<Brain[]>([]);
  const [neurons, setNeurons] = useState<Neuron[]>([]);
  const [personalities, setPersonalities] = useState<PersonalityProfile[]>([]);
  const [scope, setScope] = useState<AstrauraScope | null>(null);
  const [target, setTarget] = useState<Target>({
    kind: "perfil",
    id: null,
    label: "Perfil de la cuenta",
    sub: "Lo que Aurora lleva siempre consigo",
    icon: "perfil",
  });
  const [tick, setTick] = useState(0); // fuerza relectura tras cada toggle
  const [loading, setLoading] = useState(true);
  const [nuevaEntidad, setNuevaEntidad] = useState({ kind: "grupo", slug: "", personalityId: "" });

  /* ── Catálogos reales ── */
  const skills: SkillLite[] = useMemo(() => {
    const out: SkillLite[] = [
      ...SKILL_CAPABILITIES.map((c) => ({ id: c.id, label: c.label, kind: "capacidad" })),
      ...DEFAULT_BRAIN_SKILLS.map((s) => ({ id: s.id, label: s.name, kind: "cerebro" })),
    ];
    try {
      for (const p of allPackages()) {
        if (p.kind !== "function" && p.kind !== "agent") continue;
        if (out.some((s) => s.id === p.id)) continue;
        out.push({ id: p.id, label: p.name, kind: p.kind === "agent" ? "agente" : "función" });
      }
    } catch {
      /* la Biblioteca puede no estar disponible: seguimos con las capacidades */
    }
    return out;
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const repos = useMemo(() => {
    try {
      return listRepos();
    } catch {
      return [];
    }
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const allSkillIds = useMemo(() => skills.map((s) => s.id), [skills]);
  const allRepoIds = useMemo(() => repos.map((r) => r.id), [repos]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const [b, n] = await Promise.all([listBrains().catch(() => []), listNeurons().catch(() => [])]);
        if (cancel) return;
        setBrains(b);
        setNeurons(n);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    setPersonalities(listPersonalityProfiles());
    setScope(getScope());
    return () => {
      cancel = true;
    };
  }, []);

  const targets: Target[] = useMemo(
    () => [
      {
        kind: "perfil",
        id: null,
        label: "Perfil de la cuenta",
        sub: "Lo que Aurora lleva siempre consigo",
        icon: "perfil",
      },
      ...brains.map<Target>((b) => ({
        kind: "cerebro",
        id: b.id ?? "",
        label: b.name ?? "Cerebro",
        sub: "Cerebro",
        icon: "cerebro",
      })),
      ...neurons.map<Target>((n) => ({
        kind: "neurona",
        id: n.id,
        label: n.name || "Dispositivo",
        sub: n.online ? "Neurona · en línea" : "Neurona",
        icon: "neurona",
      })),
    ],
    [brains, neurons],
  );

  const current = useMemo(() => deployFor(target.kind, target.id ?? undefined), [target, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Sincroniza el reparto de un cerebro con la clave que ya usa el OS. */
  const syncBrainSkills = useCallback(
    (brainId: string) => {
      try {
        const t = deployFor("cerebro", brainId);
        const ids = t.skills === "todas" ? [...allSkillIds] : t.skills;
        window.localStorage.setItem(brainSkillsKey(brainId), JSON.stringify(ids));
      } catch {
        /* cuota/privado: el reparto sigue guardado en su propia clave */
      }
    },
    [allSkillIds],
  );

  const onToggleSkill = useCallback(
    (skillId: string) => {
      toggleSkill(target.kind, target.id, skillId, allSkillIds);
      if (target.kind === "cerebro" && target.id) syncBrainSkills(target.id);
      setTick((t) => t + 1);
    },
    [target, allSkillIds, syncBrainSkills],
  );

  const onToggleRepo = useCallback(
    (repoId: string) => {
      toggleRepo(target.kind, target.id, repoId, allRepoIds);
      setTick((t) => t + 1);
    },
    [target, allRepoIds],
  );

  const restaurar = useCallback(() => {
    resetDeploy();
    for (const b of brains) if (b.id) syncBrainSkills(b.id);
    setTick((t) => t + 1);
    toast.success("Reparto restaurado: todas las habilidades y repos en todos los objetivos.");
  }, [brains, syncBrainSkills]);

  const patchScope = useCallback((p: Partial<AstrauraScope>) => {
    setScope(saveScope(p));
  }, []);

  const addOverride = useCallback(() => {
    const slug = nuevaEntidad.slug.trim().replace(/^\/+|\/+$/g, "");
    if (!slug || !nuevaEntidad.personalityId) {
      toast.error("Indica la entidad y la personalidad.");
      return;
    }
    setScope(setEntityOverride(`${nuevaEntidad.kind}:${slug}`, nuevaEntidad.personalityId));
    setNuevaEntidad((s) => ({ ...s, slug: "" }));
    toast.success("Personalidad asignada a esa entidad.");
  }, [nuevaEntidad]);

  const skillCount = current.skills === "todas" ? allSkillIds.length : current.skills.length;
  const repoCount = current.repos === "todos" ? allRepoIds.length : current.repos.length;

  return (
    <div className="space-y-3">
      <Note kind="ok">
        <strong>Por defecto, todo en todos.</strong> Cada habilidad y cada repo que instales llega solo a tu
        perfil, a todos tus cerebros y a todas tus neuronas. Aquí puedes afinarlo si quieres.
      </Note>

      {/* ── Selector de objetivo ── */}
      <Block
        title="¿Dónde se instala?"
        icon="Waypoints"
        hint="Perfil de la cuenta · cerebros · neuronas (cada dispositivo es cerebro y servidor)."
        right={
          <button type="button" className={btnCls} onClick={restaurar}>
            <RefreshCw className="h-3 w-3" /> Todo en todos
          </button>
        }
      >
        {loading ? (
          <p className="text-[11px] text-white/40">Cargando cerebros y neuronas…</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {targets.map((t) => {
              const active = t.kind === target.kind && (t.id ?? null) === (target.id ?? null);
              const Ico = t.icon === "perfil" ? UserRound : t.icon === "cerebro" ? Cpu : Server;
              return (
                <button
                  key={`${t.kind}:${t.id ?? "-"}`}
                  type="button"
                  onClick={() => setTarget(t)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] transition-colors duration-200",
                    active
                      ? "border-[#7fb8ff]/50 bg-[#7fb8ff]/12 text-white"
                      : "border-white/10 bg-white/[0.02] text-white/60 hover:border-white/25 hover:text-white/85",
                  )}
                  title={t.sub}
                >
                  <Ico className="h-3 w-3" />
                  {t.label}
                </button>
              );
            })}
            {brains.length === 0 && neurons.length === 0 && (
              <p className="text-[11px] text-white/40">
                Aún no hay cerebros ni neuronas registrados: el perfil de la cuenta ya funciona solo.
              </p>
            )}
          </div>
        )}
      </Block>

      {/* ── Habilidades del objetivo ── */}
      <Block
        title={`Habilidades en «${target.label}»`}
        icon="Wrench"
        hint={
          current.skills === "todas"
            ? `Todas (${allSkillIds.length}). Las que instales en el futuro entrarán solas.`
            : `${skillCount} de ${allSkillIds.length} seleccionadas.`
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {skills.map((s) => {
            const on = hasSkill(current, s.id);
            return (
              <Chip key={s.id} active={on} onClick={() => onToggleSkill(s.id)} title={s.kind} tone="lime">
                {on && <Check className="mr-0.5 inline h-2.5 w-2.5" />}
                {s.label}
              </Chip>
            );
          })}
          {skills.length === 0 && <p className="text-[11px] text-white/40">No hay habilidades en el catálogo.</p>}
        </div>
        {target.kind === "cerebro" && (
          <Note kind="info">
            Este reparto se escribe también en la configuración del cerebro, así que lo verás igual en
            Ajustes → Cerebros.
          </Note>
        )}
      </Block>

      {/* ── Repos del objetivo ── */}
      <Block
        title={`Repos en «${target.label}»`}
        icon="GitBranch"
        hint={
          current.repos === "todos"
            ? `Todos (${allRepoIds.length}).`
            : `${repoCount} de ${allRepoIds.length} seleccionados.`
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {repos.map((r) => {
            const on = hasRepo(current, r.id);
            return (
              <Chip key={r.id} active={on} onClick={() => onToggleRepo(r.id)} tone="amber">
                {on && <Check className="mr-0.5 inline h-2.5 w-2.5" />}
                {r.name}
              </Chip>
            );
          })}
          {repos.length === 0 && <p className="text-[11px] text-white/40">No hay repos en la Biblioteca.</p>}
        </div>
      </Block>

      {/* ── P1-3 · Unificación ── */}
      {scope && (
        <Block
          title="Alcance de esta configuración"
          icon="Globe"
          hint="La misma Aurora, con la misma inteligencia, en todo el OS y en la red."
        >
          <div className="space-y-1.5">
            <Toggle
              checked={scope.cuenta}
              onChange={(v) => patchScope({ cuenta: v })}
              label="Toda mi cuenta y todos mis perfiles"
              hint="Los ajustes viajan con tu cuenta a todos tus dispositivos."
              tone="lime"
            />
            <Toggle
              checked={scope.grupos}
              onChange={(v) => patchScope({ grupos: v })}
              label="Grupos"
              hint="Aurora usa esta configuración cuando estás dentro de un grupo."
              tone="lime"
            />
            <Toggle
              checked={scope.paginas}
              onChange={(v) => patchScope({ paginas: v })}
              label="Páginas"
              tone="lime"
            />
            <Toggle
              checked={scope.entidades}
              onChange={(v) => patchScope({ entidades: v })}
              label="Entidades federativas, partidos y eventos"
              tone="lime"
            />
            <Toggle
              checked={scope.red}
              onChange={(v) => patchScope({ red: v })}
              label="Contextos de la red pública"
              hint="No publica nada: sólo determina cómo se comporta Aurora cuando navegas por la red."
              tone="lime"
            />
          </div>

          {/* Overrides por entidad */}
          <div className="mt-3 space-y-2">
            <span className={labelCls}>Excepciones: una personalidad distinta para una entidad concreta</span>
            <div className="grid gap-1.5 sm:grid-cols-[auto_1fr_1fr_auto]">
              <select
                className={selectCls}
                aria-label="Tipo de entidad"
                value={nuevaEntidad.kind}
                onChange={(e) => setNuevaEntidad((s) => ({ ...s, kind: e.target.value }))}
              >
                {SCOPE_ENTITY_ROUTES.map((r) => (
                  <option key={r.kind} value={r.kind}>
                    {r.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                className={inputCls}
                placeholder="slug (p. ej. asamblea-vallecas)"
                value={nuevaEntidad.slug}
                maxLength={80}
                onChange={(e) => setNuevaEntidad((s) => ({ ...s, slug: e.target.value }))}
              />
              <select
                className={selectCls}
                aria-label="Personalidad"
                value={nuevaEntidad.personalityId}
                onChange={(e) => setNuevaEntidad((s) => ({ ...s, personalityId: e.target.value }))}
              >
                <option value="">Personalidad…</option>
                {personalities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button type="button" className={btnCls} onClick={addOverride}>
                Añadir
              </button>
            </div>

            <ul className="space-y-1">
              {Object.entries(scope.overrides).map(([key, pid]) => {
                const p = personalities.find((x) => x.id === pid);
                return (
                  <li
                    key={key}
                    className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-white/80">
                      <code className="text-[10.5px] text-white/50">{key}</code> → {p?.name ?? pid}
                    </span>
                    <button
                      type="button"
                      className="cursor-pointer rounded-md p-1 text-white/35 transition-colors duration-200 hover:text-[#DC143C]"
                      title="Quitar excepción"
                      onClick={() => setScope(setEntityOverride(key, null))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
              {Object.keys(scope.overrides).length === 0 && (
                <li className="text-[11px] text-white/40">
                  Sin excepciones: todas las entidades usan tu personalidad activa.
                </li>
              )}
            </ul>
            <Note kind="info">
              Al entrar en <code className="text-white/70">/grupo/mi-grupo</code>, Aurora adopta
              automáticamente la personalidad que le asignes aquí — en cualquier sección del OS.
            </Note>
          </div>
        </Block>
      )}
    </div>
  );
}

export default SetupAstraura;
