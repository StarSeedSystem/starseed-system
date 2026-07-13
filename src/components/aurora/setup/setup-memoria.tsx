"use client";

/**
 * Pestaña MEMORIA del Centro de Configuración (Adenda 67 · P1-1).
 * ============================================================================
 * Tipos de memoria por sentido · qué cerebros usa Aurora · permisos.
 *
 * Todo lo de aquí es CONSUMIDO de verdad:
 *   · `memoryPolicy` (usar memorias, nivel de contexto, cerebros permitidos) se
 *     compila en el system prompt de cada petición (`compilePersonalityPrompt`).
 *   · El tipo de memoria por sentido viaja en `starseed.aurora.senses.v1` y se
 *     usa para decidir dónde escribe Aurora lo que aprende (tipos reales del
 *     catálogo del OS: episódica → contextos, semántica → conocimiento…).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  SETUP_SENSES,
  getSensesConfig,
  saveSenseConfig,
  getPersonaProfile,
  savePersonaProfile,
  type SensesConfig,
} from "@/lib/aurora/setup-config";
import {
  listPersonalityProfiles,
  resolvePersonalityForContext,
  savePersonalityProfile,
  type PersonalityProfile,
} from "@/lib/aurora/personalities";
import { listMemoryTypes } from "@/lib/brains/memory-types";
import { listBrains, type Brain } from "@/lib/brains/brains";
import { Block, Chip, Icon, Note, Toggle, labelCls, selectCls } from "./setup-ui";

export function SetupMemoria() {
  const [cfg, setCfg] = useState<SensesConfig | null>(null);
  const [persona, setPersona] = useState<PersonalityProfile | null>(null);
  const [brains, setBrains] = useState<Brain[] | null>(null);
  const memoryTypes = useMemo(() => listMemoryTypes(), []);

  useEffect(() => {
    setCfg(getSensesConfig());
    setPersona(resolvePersonalityForContext({}) ?? listPersonalityProfiles()[0] ?? null);
    void (async () => {
      try {
        setBrains(await listBrains());
      } catch {
        setBrains([]);
      }
    })();
  }, []);

  const setMemoria = useCallback((senseId: string, memoria: string) => {
    const next = saveSenseConfig(senseId as never, { memoria });
    setCfg(next);
  }, []);

  const patchPolicy = useCallback(
    (p: Partial<PersonalityProfile["memoryPolicy"]>) => {
      if (!persona) return;
      const updated = savePersonalityProfile({
        ...persona,
        memoryPolicy: { ...persona.memoryPolicy, ...p },
      });
      setPersona(updated);
    },
    [persona],
  );

  const toggleBrain = useCallback(
    (brainId: string) => {
      if (!persona) return;
      const cur = persona.memoryPolicy.cerebrosPermitidos;
      const all = (brains ?? []).map((b) => b.id ?? "").filter(Boolean);
      const list = cur === "todos" ? [...all] : [...cur];
      const next = list.includes(brainId) ? list.filter((b) => b !== brainId) : [...list, brainId];
      const isAll = next.length >= all.length && all.every((b) => next.includes(b));
      patchPolicy({ cerebrosPermitidos: isAll ? "todos" : next });
    },
    [persona, brains, patchPolicy],
  );

  const aprender = persona ? getPersonaProfile(persona.id, persona.name).permisos.aprender : true;

  if (!cfg) return <p className="px-1 py-6 text-center text-[11px] text-white/40">Cargando memoria…</p>;

  return (
    <div className="space-y-3">
      <Note kind="info">
        Aurora recuerda en <strong>tipos de memoria</strong> distintos según el sentido: lo que ve va a un
        sitio y lo que razona a otro. Todos los tipos son archivos reales de tus cerebros.
      </Note>

      {/* Tipo de memoria por sentido */}
      <Block title="Tipo de memoria por sentido" icon="Database" hint="Dónde guarda lo que aprende en cada canal.">
        <div className="space-y-1">
          {SETUP_SENSES.map((s) => {
            const sc = cfg[s.id];
            return (
              <div
                key={s.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors duration-200",
                  sc.enabled ? "border-white/8 bg-white/[0.02]" : "border-white/5 bg-white/[0.01] opacity-55",
                )}
              >
                <Icon name={s.icon} className="h-3.5 w-3.5 shrink-0 text-white/50" />
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-white/80">{s.label}</span>
                <select
                  aria-label={`Memoria de ${s.label}`}
                  className={cn(selectCls, "w-auto min-w-[9rem] max-w-[14rem]")}
                  value={sc.memoria}
                  onChange={(e) => setMemoria(s.id, e.target.value)}
                >
                  {memoryTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <p className="mt-1.5 text-[10px] text-white/40">
          Equivalencias: memoria <strong>corta</strong> = contextos · <strong>larga</strong> = memoria ·{" "}
          <strong>episódica</strong> = registros · <strong>semántica</strong> = conocimiento.
        </p>
      </Block>

      {/* Política de memoria de la personalidad activa */}
      {persona && (
        <Block
          title={`Memoria de «${persona.name}»`}
          icon="Brain"
          hint="Esto entra literalmente en las instrucciones de Aurora en cada petición."
        >
          <div className="space-y-1.5">
            <Toggle
              checked={persona.memoryPolicy.usarMemorias}
              onChange={(v) => patchPolicy({ usarMemorias: v })}
              label="Usar mis memorias y mi contexto"
              hint="Si lo apagas, Aurora no consultará tus memorias salvo que se lo pidas en el momento."
              tone="lime"
            />
            <div>
              <label className={labelCls} htmlFor="nivel-contexto">
                Nivel de contexto
              </label>
              <select
                id="nivel-contexto"
                className={selectCls}
                value={persona.memoryPolicy.nivelContexto}
                onChange={(e) => patchPolicy({ nivelContexto: e.target.value === "completo" ? "completo" : "breve" })}
              >
                <option value="breve">Breve — lo esencial (más rápido y barato)</option>
                <option value="completo">Completo — todo tu contexto disponible</option>
              </select>
            </div>

            <div>
              <span className={labelCls}>Cerebros que puede usar</span>
              {brains === null ? (
                <p className="text-[11px] text-white/40">Cargando cerebros…</p>
              ) : brains.length === 0 ? (
                <p className="text-[11px] text-white/45">
                  Aún no tienes cerebros propios. Aurora usa el cerebro StarSeed por defecto.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {brains.map((b) => {
                    const cur = persona.memoryPolicy.cerebrosPermitidos;
                    const on = cur === "todos" || cur.includes(b.id ?? "");
                    return (
                      <Chip key={b.id} active={on} onClick={() => toggleBrain(b.id ?? "")} tone="azure">
                        {b.name ?? "Cerebro"}
                      </Chip>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Block>
      )}

      {/* Permisos de aprendizaje */}
      <Block title="Aprendizaje y permisos" icon="ShieldCheck" hint="Si Aurora puede guardar lo que aprende.">
        {persona ? (
          <Toggle
            checked={aprender}
            onChange={(v) => {
              const pp = getPersonaProfile(persona.id, persona.name);
              savePersonaProfile({ ...pp, permisos: { ...pp.permisos, aprender: v } });
              setPersona({ ...persona });
              toast.success(
                v
                  ? "Aurora guardará como memoria lo relevante de vuestras conversaciones."
                  : "Aurora no creará memorias nuevas salvo que se lo pidas.",
              );
            }}
            label="Aurora aprende de su experiencia"
            hint="Guarda como memoria lo relevante bajo esta personalidad. El resto de permisos, en la pestaña Personalidad."
            tone="lime"
          />
        ) : (
          <p className="text-[11px] text-white/45">Activa una personalidad para configurar su aprendizaje.</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href="/memorias"
            className="inline-flex items-center gap-1 text-[10.5px] text-[#7fb8ff] underline-offset-2 hover:underline"
          >
            Ver mis memorias <ExternalLink className="h-2.5 w-2.5" />
          </Link>
          <Link
            href="/cerebros"
            className="inline-flex items-center gap-1 text-[10.5px] text-[#7fb8ff] underline-offset-2 hover:underline"
          >
            Gestionar cerebros y baúles <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        </div>
      </Block>
    </div>
  );
}

export default SetupMemoria;
