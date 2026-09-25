"use client";

/**
 * ChatPersonalityTray — bandeja de PERSONALIDADES ACTIVAS del proveedor
 * Astraura 1.58-bit (Tarea 3 de la adenda de voz-en-vivo/regenerar/bifurcar).
 * ============================================================================
 * El original permitía "elegir cuáles personalidades estarán activas" en el
 * diálogo. Esta bandeja, colocada sobre el cuadro de escritura del chat,
 * reconstruye eso: chips para activar/desactivar personalidades del catálogo
 * 1.58 (`ASTRAURA_158_PERSONAS` — Hermione, Hephaestus, Atenea…) y un selector
 * para los tres modos REALES del backend (`Astraura158MultiMode`).
 *
 * CÓMO LLEGA la selección al proveedor (sin tocar `astraura-158.ts`): ese
 * proveedor ya sabe leer `@menciones` y la palabra "coral" del ÚLTIMO mensaje
 * del usuario y traducirlas a `preferences.selected_personalities` /
 * `multi_personality_mode` (`detectMentions158`/`applyMentions158`). Es el
 * ÚNICO canal que de verdad llega hasta esos campos de la petición sin editar
 * el proveedor, así que `astraura158MentionHint()` reconstruye exactamente lo
 * que un usuario escribiría a mano ("@hermione @hephaestus coral") a partir de
 * la selección de esta bandeja. `chat-surface.tsx` la usa para anotar (solo en
 * la petición al modelo, nunca en lo que se guarda o se muestra) el último
 * turno de usuario — y SOLO cuando el proveedor activo es 1.58.
 *
 * PERSISTENCIA: por conversación, no global — mismo mecanismo que el resto de
 * ajustes por chat (`getChatConfig`/`patchChatConfig`, meta.config del chat).
 * Antes de que el usuario toque la bandeja NO hay nada "elegido": el chat
 * sigue el mecanismo de siempre (personalidad activa del OS → 1.58 vía
 * `persona158For`), así que esta bandeja no interfiere con nadie que no la
 * abra. `readAstraura158Selection` devuelve `null` en ese caso — chat-surface
 * lo respeta y NO inyecta nada.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Users, CheckCheck, Plug, Search, Zap, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { getChatConfig } from "@/lib/aurora/turn";
import { patchChatConfig } from "@/lib/aurora/config-change";
import { AI_CONV_CHANGE_EVENT } from "@/lib/aurora/conversations";
import type { ChatConfig } from "@/components/aurora/chat-config-menu";
import { ASTRAURA_158_PERSONAS, type Astraura158MultiMode } from "@/ai/providers/astraura-158";
import { alternarTodasPersonalidades, todasPersonalidadesActivas, type SeleccionPersonalidades } from "@/lib/astraura/personalidades-todas";
import {
  alternarHerramienta,
  alternarTodasHerramientas,
  contarHerramientasActivas,
  estadoConector,
  etiquetaEstadoConector,
  herramientaActiva,
  migrarSeleccionHabilidades,
  resumenPickerHerramientas,
  todasHerramientasActivas,
  type SeleccionHerramientas,
} from "@/lib/astraura/chat-herramientas";
import { filaCoincideBusqueda } from "@/lib/astraura/resumen-ajustes-chat";
import { SKILL_CAPABILITIES, activeCapabilityIds } from "@/ai/astraura/skills";
import { getOssServices } from "@/lib/services/oss-services";
import { readConnections } from "@/lib/services/oss-connections";

/** Selección EFECTIVA (persistida o por defecto) de personalidades + modo. */
export interface Astraura158Selection {
  personas: string[];
  mode: Astraura158MultiMode;
}

/**
 * Campos que esta bandeja añade a `meta.config` del chat. NO existen en
 * `ChatConfig` (chat-config-menu.tsx, fuera del alcance de esta adenda) — se
 * leen/escriben como una extensión ESTRUCTURAL del mismo JSON libre, igual
 * que ya hacen otros ajustes por chat (voice/log/senses…): el backend los
 * persiste sin más porque `meta` es JSON; sólo hace falta esta intersección
 * para que TypeScript tipe el acceso sin recurrir a `any`.
 */
export interface Astraura158ChatConfigExtra {
  astr158Personas?: string[];
  astr158Mode?: Astraura158MultiMode;
}

/**
 * Campo que añade el picker «Conectores y habilidades» de esta misma
 * bandeja: la versión de migración de `ChatConfig.skills` ya aplicada a este
 * chat (ver `migrarSeleccionHabilidades` en `lib/astraura/chat-herramientas.ts`
 * — mismo patrón que `DOCK_DEFAULTS_VERSION`). `ChatConfig.skills` y
 * `ChatConfig.connections` en sí NO son nuevos: ya existen en `ChatConfig`
 * (chat-config-menu.tsx) y ya los lee `router.ts`; este picker los reutiliza
 * tal cual (mismo campo, mismo efecto real) pero contra el catálogo REAL
 * completo (`SKILL_CAPABILITIES` / `getOssServices()`), no el subconjunto de
 * 8 habilidades que expone ese menú.
 */
export interface ChatHerramientasConfigExtra {
  herramientasSkillsV?: number;
}

const VALID_IDS = new Set(ASTRAURA_158_PERSONAS.map((p) => p.id));
const TODOS_PERSONA_IDS = ASTRAURA_158_PERSONAS.map((p) => p.id);
const TODAS_HABILIDADES_IDS = SKILL_CAPABILITIES.map((c) => c.id);

const MODE_OPTIONS: { id: Astraura158MultiMode; label: string }[] = [
  { id: "single", label: "Individual" },
  { id: "multi_dialogue", label: "Diálogo grupal" },
  { id: "coral_synthesis", label: "Síntesis coral" },
];

/**
 * Selección EXPLÍCITA guardada para el chat, o `null` si el usuario aún no ha
 * tocado la bandeja (nada que transportar: el turno sigue el mecanismo de
 * siempre). Filtra ids que ya no existan en el catálogo (defensivo).
 */
export function readAstraura158Selection(convId: string | null | undefined): Astraura158Selection | null {
  const cfg = getChatConfig(convId) as ChatConfig & Astraura158ChatConfigExtra;
  const personas = (cfg.astr158Personas ?? []).filter((id) => VALID_IDS.has(id));
  if (!personas.length) return null;
  return { personas, mode: cfg.astr158Mode ?? "single" };
}

/**
 * Traduce la selección al MISMO lenguaje que ya entiende el proveedor 1.58:
 * menciones `@id` (+ la palabra "coral" en síntesis coral). En modo
 * "individual" se menciona SOLO la primera — mencionar ≥2 reclasificaría el
 * turno como diálogo grupal aunque el modo elegido fuera otro
 * (`detectMentions158`: ≥2 menciones ⇒ `multi_dialogue`). En diálogo/coral se
 * mencionan TODAS las activas.
 */
export function astraura158MentionHint(sel: Astraura158Selection | null): string {
  if (!sel || !sel.personas.length) return "";
  const ids = sel.mode === "single" ? sel.personas.slice(0, 1) : sel.personas;
  if (!ids.length) return "";
  const coral = sel.mode === "coral_synthesis" ? " coral" : "";
  return `${ids.map((id) => `@${id}`).join(" ")}${coral}`;
}

export interface ChatPersonalityTrayProps {
  /** Chat activo (persistencia por conversación). */
  convId: string | null;
  /** Id del proveedor activo — sólo informativo (nota de "se aplicará cuando…"). */
  activeProviderId?: string | null;
  /**
   * Personalidad 1.58 que se usaría hoy SIN tocar esta bandeja (deriva de la
   * personalidad activa del OS vía `persona158For`). Es lo que se muestra
   * activo mientras el usuario no haya elegido nada explícito, para que el
   * primer toque parta de lo que ya está pasando — no de cero ni de todo.
   */
  defaultPersonaId?: string;
  className?: string;
}

export function ChatPersonalityTray({
  convId,
  activeProviderId,
  defaultPersonaId = "astraura_prime",
  className,
}: ChatPersonalityTrayProps) {
  const [open, setOpen] = useState(false);
  const [personas, setPersonas] = useState<string[]>([]);
  const [mode, setMode] = useState<Astraura158MultiMode>("single");
  // «Solo una» reversible (ver personalidades-todas.ts): lo que había ANTES
  // de pulsar «Todas», para poder volver — memoria de sesión de la bandeja,
  // nunca se persiste (no es un ajuste del chat, es un "deshacer" de la UI).
  const [personasRecordadas, setPersonasRecordadas] = useState<SeleccionPersonalidades | null>(null);

  // Picker «Conectores y habilidades»: abierto/cerrado, filtro y selección
  // EXPLÍCITA del chat (`undefined` = «Todas», ver chat-herramientas.ts).
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsQuery, setToolsQuery] = useState("");
  const [skillsSel, setSkillsSel] = useState<SeleccionHerramientas>(undefined);
  const [connectionsSel, setConnectionsSel] = useState<SeleccionHerramientas>(undefined);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [globalActiveSkillIds, setGlobalActiveSkillIds] = useState<Set<string>>(new Set());

  const ossServices = useMemo(() => getOssServices(), []);
  const todasConexionesIds = useMemo(() => ossServices.map((s) => s.id), [ossServices]);

  // El filtro del picker es solo de la sesión de la bandeja: al cambiar de
  // chat se limpia (no ligado a `read()`/AI_CONV_CHANGE_EVENT, que también
  // se dispara al alternar una habilidad/conector — borraría lo que el
  // usuario está escribiendo en pleno uso del picker).
  useEffect(() => {
    setToolsQuery("");
  }, [convId]);

  // Refleja la selección guardada (menú, otro dispositivo, config-change).
  const read = useCallback(() => {
    const sel = readAstraura158Selection(convId);
    setPersonas(sel?.personas ?? []);
    setMode(sel?.mode ?? "single");

    const cfg = getChatConfig(convId) as ChatConfig & ChatHerramientasConfigExtra;
    // Migración ÚNICA del universo legado de habilidades (Adenda picker
    // «Conectores y habilidades»): si esta config es de antes del picker,
    // las habilidades del catálogo real que nunca fueron elegibles a mano
    // entran activas solas, sin tocar lo que el usuario sí pudo decidir.
    const migracion = migrarSeleccionHabilidades(cfg.skills, cfg.herramientasSkillsV, TODAS_HABILIDADES_IDS);
    setSkillsSel(migracion.seleccion);
    setConnectionsSel(cfg.connections);
    if (migracion.cambio) {
      const migPatch: Partial<ChatConfig> & ChatHerramientasConfigExtra = {
        skills: migracion.seleccion,
        herramientasSkillsV: migracion.version,
      };
      void patchChatConfig(convId, migPatch);
    }

    try {
      setConnectedIds(new Set(readConnections().map((c) => c.serviceId)));
    } catch { /* */ }
    try {
      setGlobalActiveSkillIds(new Set(activeCapabilityIds()));
    } catch { /* */ }
  }, [convId]);

  useEffect(() => {
    read();
    if (typeof window === "undefined") return;
    window.addEventListener(AI_CONV_CHANGE_EVENT, read);
    return () => window.removeEventListener(AI_CONV_CHANGE_EVENT, read);
  }, [read]);

  // Lo REALMENTE activo ahora mismo: lo explícito, o si aún no hay nada
  // explícito, la personalidad que ya se usaría de todos modos.
  const effective = personas.length ? personas : [defaultPersonaId];

  const persist = useCallback(
    (nextPersonas: string[], nextMode: Astraura158MultiMode) => {
      setPersonas(nextPersonas); // optimista
      setMode(nextMode);
      const patch: Partial<ChatConfig> & Astraura158ChatConfigExtra = {
        astr158Personas: nextPersonas,
        astr158Mode: nextMode,
      };
      void patchChatConfig(convId, patch);
    },
    [convId],
  );

  const toggle = useCallback(
    (id: string) => {
      const has = effective.includes(id);
      const next = has ? effective.filter((x) => x !== id) : [...effective, id];
      // Nunca puede quedar vacía: si el resultado se queda en 0, se conserva
      // (re-activa) la última — el toggle simplemente no hace nada.
      if (!next.length) {
        toast.info("Debe quedar al menos una personalidad activa.");
        return;
      }
      persist(next, mode);
    },
    [effective, mode, persist],
  );

  const changeMode = useCallback(
    (next: Astraura158MultiMode) => {
      persist(effective, next);
    },
    [effective, persist],
  );

  // «Todas» ⇄ «Solo una» (personalidades-todas.ts): reversible — activa el
  // catálogo completo (subiendo el modo si hacía falta) o, si ya estaban
  // todas activas, vuelve a lo que había antes.
  const toggleAllPersonas = useCallback(() => {
    const r = alternarTodasPersonalidades(
      { personas: effective, mode },
      TODOS_PERSONA_IDS,
      personasRecordadas,
      defaultPersonaId,
    );
    setPersonasRecordadas(r.recordar);
    persist(r.siguiente.personas, r.siguiente.mode);
  }, [effective, mode, personasRecordadas, defaultPersonaId, persist]);
  const todasPersonasOn = todasPersonalidadesActivas(effective, TODOS_PERSONA_IDS);

  // ── Picker «Conectores y habilidades»: mismo campo real de ChatConfig
  // (`skills`/`connections`) que ya lee router.ts y ya edita chat-config-menu,
  // pero contra el catálogo REAL completo (chat-herramientas.ts). ──────────
  const persistSkills = useCallback(
    (next: SeleccionHerramientas) => {
      setSkillsSel(next);
      void patchChatConfig(convId, { skills: next });
    },
    [convId],
  );
  const persistConnections = useCallback(
    (next: SeleccionHerramientas) => {
      setConnectionsSel(next);
      void patchChatConfig(convId, { connections: next });
    },
    [convId],
  );
  const toggleSkillId = useCallback(
    (id: string) => persistSkills(alternarHerramienta(skillsSel, TODAS_HABILIDADES_IDS, id)),
    [skillsSel, persistSkills],
  );
  const toggleAllSkills = useCallback(
    () => persistSkills(alternarTodasHerramientas(skillsSel, TODAS_HABILIDADES_IDS)),
    [skillsSel, persistSkills],
  );
  const toggleConnectionId = useCallback(
    (id: string) => persistConnections(alternarHerramienta(connectionsSel, todasConexionesIds, id)),
    [connectionsSel, todasConexionesIds, persistConnections],
  );
  const toggleAllConnections = useCallback(
    () => persistConnections(alternarTodasHerramientas(connectionsSel, todasConexionesIds)),
    [connectionsSel, todasConexionesIds, persistConnections],
  );

  const habilidadesActivasCount = contarHerramientasActivas(skillsSel, TODAS_HABILIDADES_IDS);
  const todasHabilidadesOn = todasHerramientasActivas(skillsSel, TODAS_HABILIDADES_IDS);
  const todasConexionesOn = todasHerramientasActivas(connectionsSel, todasConexionesIds);
  const conectoresActivosCount = useMemo(
    () =>
      ossServices.filter((s) => {
        const estado = estadoConector({
          seleccionado: herramientaActiva(connectionsSel, s.id),
          conectado: connectedIds.has(s.id),
          sinCredenciales: s.connectionKind === "browser-local" || !!s.runsInBrowser,
        });
        return estado === "activo";
      }).length,
    [ossServices, connectionsSel, connectedIds],
  );
  const resumenHerramientas = resumenPickerHerramientas({
    habilidadesActivas: habilidadesActivasCount,
    habilidadesTotal: TODAS_HABILIDADES_IDS.length,
    conectoresActivos: conectoresActivosCount,
    conectoresTotal: todasConexionesIds.length,
  });
  const habilidadesFiltradas = useMemo(
    () => SKILL_CAPABILITIES.filter((c) => filaCoincideBusqueda({ etiqueta: c.label, resumen: "" }, toolsQuery)),
    [toolsQuery],
  );
  const conectoresFiltrados = useMemo(
    () => ossServices.filter((s) => filaCoincideBusqueda({ etiqueta: s.name, resumen: s.purpose }, toolsQuery)),
    [ossServices, toolsQuery],
  );

  return (
    <div className={cn("rounded-lg border border-white/10 bg-white/[0.02]", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Ocultar personalidades activas" : "Mostrar personalidades activas"}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 text-left"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-white/60">
          <Users className="h-3.5 w-3.5 text-fuchsia-300/80" />
          Personalidades activas
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-normal text-white/50">
            {effective.length}
          </span>
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-white/40" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/40" />
        )}
      </button>

      {open && (
        <div className="space-y-2 border-t border-white/10 px-2.5 py-2">
          {activeProviderId && activeProviderId !== "astraura-158" && (
            <p className="text-[10px] leading-relaxed text-amber-200/70">
              Se aplica cuando el proveedor activo es Astraura 1.58-bit (ahora: {activeProviderId}).
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={toggleAllPersonas}
              aria-pressed={todasPersonasOn}
              aria-label={todasPersonasOn ? "Volver a solo una personalidad" : "Activar todas las personalidades"}
              title={
                todasPersonasOn
                  ? "Todas activas — pulsa para volver a la selección anterior"
                  : "Activa las 10 personalidades a la vez (sube el modo a Diálogo grupal si hacía falta)"
              }
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                todasPersonasOn
                  ? "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-100"
                  : "border-white/10 bg-transparent text-white/40 hover:border-white/20 hover:text-white/70",
              )}
            >
              <CheckCheck className="h-3 w-3 shrink-0" />
              {todasPersonasOn ? "Solo una" : "Todas"}
            </button>
            {ASTRAURA_158_PERSONAS.map((p) => {
              const active = effective.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  aria-pressed={active}
                  aria-label={`${active ? "Desactivar" : "Activar"} personalidad ${p.label}`}
                  title={p.organ}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    active
                      ? "border-white/25 bg-white/10 text-white"
                      : "border-white/10 bg-transparent text-white/40 hover:border-white/20 hover:text-white/70",
                  )}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => changeMode(m.id)}
                aria-pressed={mode === m.id}
                aria-label={`Modo ${m.label}`}
                title={m.label}
                className={cn(
                  "cursor-pointer rounded-md border px-2 py-1 text-[10.5px] font-medium transition-colors",
                  mode === m.id
                    ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
                    : "border-white/10 bg-transparent text-white/40 hover:border-white/20 hover:text-white/70",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* «Conectores y habilidades»: qué del catálogo real puede usar este
              chat (SKILL_CAPABILITIES + getOssServices()), «Todas» activadas
              por defecto — ver chat-herramientas.ts. */}
          <div className="border-t border-white/10 pt-2">
            <button
              type="button"
              onClick={() => setToolsOpen((o) => !o)}
              aria-expanded={toolsOpen}
              aria-label={toolsOpen ? "Ocultar conectores y habilidades" : "Mostrar conectores y habilidades"}
              className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-1 py-1 text-left hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-white/60">
                <Plug className="h-3.5 w-3.5 shrink-0 text-emerald-300/80" />
                Conectores y habilidades
                <span className="truncate text-[10px] font-normal text-white/35">{resumenHerramientas}</span>
              </span>
              {toolsOpen ? (
                <ChevronUp className="h-3.5 w-3.5 shrink-0 text-white/40" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/40" />
              )}
            </button>

            {toolsOpen && (
              <div className="mt-1.5 space-y-2.5 rounded-lg border border-white/10 bg-black/20 p-2">
                <p className="px-0.5 text-[10px] leading-relaxed text-white/35">
                  Todas vienen instaladas y activas por defecto. Apaga solo las que no quieras que use ESTE chat.
                </p>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/30" />
                  <input
                    value={toolsQuery}
                    onChange={(e) => setToolsQuery(e.target.value)}
                    placeholder="Buscar habilidad o conector…"
                    aria-label="Buscar habilidad o conector"
                    className="w-full rounded-md border border-white/10 bg-black/30 py-1 pl-6 pr-2 text-[11px] text-white placeholder:text-white/30 outline-none focus:border-white/30 focus-visible:ring-2 focus-visible:ring-white/20"
                  />
                </div>

                {/* Habilidades */}
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/40">
                      <Zap className="h-3 w-3" />
                      Habilidades · {habilidadesActivasCount}/{TODAS_HABILIDADES_IDS.length}
                    </span>
                    <button
                      type="button"
                      onClick={toggleAllSkills}
                      aria-pressed={todasHabilidadesOn}
                      aria-label={todasHabilidadesOn ? "Desactivar todas las habilidades" : "Activar todas las habilidades"}
                      className={cn(
                        "cursor-pointer rounded-md border px-1.5 py-0.5 text-[9.5px] font-medium transition-colors",
                        todasHabilidadesOn
                          ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                          : "border-white/10 bg-transparent text-white/40 hover:border-white/20 hover:text-white/70",
                      )}
                    >
                      Todas
                    </button>
                  </div>
                  <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded-md border border-white/5 bg-black/10 p-1.5">
                    {habilidadesFiltradas.map((c) => {
                      const activa = herramientaActiva(skillsSel, c.id);
                      const instalada = globalActiveSkillIds.has(c.id);
                      const hint = activa && !instalada ? " · aún sin instalar en tu cuenta" : "";
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleSkillId(c.id)}
                          aria-pressed={activa}
                          aria-label={`${activa ? "Desactivar" : "Activar"} habilidad ${c.label}`}
                          title={`${c.label}${hint}`}
                          className={cn(
                            "cursor-pointer rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                            activa
                              ? "border-white/20 bg-white/10 text-white/90"
                              : "border-white/10 bg-transparent text-white/35 hover:border-white/20 hover:text-white/60",
                          )}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                    {!habilidadesFiltradas.length && (
                      <span className="px-1 py-1 text-[10px] text-white/30">Sin resultados.</span>
                    )}
                  </div>
                </div>

                {/* Conectores */}
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/40">
                      <Network className="h-3 w-3" />
                      Conectores · {conectoresActivosCount}/{todasConexionesIds.length}
                    </span>
                    <button
                      type="button"
                      onClick={toggleAllConnections}
                      aria-pressed={todasConexionesOn}
                      aria-label={todasConexionesOn ? "Desactivar todos los conectores" : "Activar todos los conectores"}
                      className={cn(
                        "cursor-pointer rounded-md border px-1.5 py-0.5 text-[9.5px] font-medium transition-colors",
                        todasConexionesOn
                          ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                          : "border-white/10 bg-transparent text-white/40 hover:border-white/20 hover:text-white/70",
                      )}
                    >
                      Todas
                    </button>
                  </div>
                  <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded-md border border-white/5 bg-black/10 p-1.5">
                    {conectoresFiltrados.map((s) => {
                      const seleccionado = herramientaActiva(connectionsSel, s.id);
                      const sinCredenciales = s.connectionKind === "browser-local" || !!s.runsInBrowser;
                      const estado = estadoConector({
                        seleccionado,
                        conectado: connectedIds.has(s.id),
                        sinCredenciales,
                      });
                      const etiqueta = etiquetaEstadoConector(estado);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleConnectionId(s.id)}
                          aria-pressed={seleccionado}
                          aria-label={`${seleccionado ? "Desactivar" : "Activar"} conector ${s.name} (${etiqueta})`}
                          title={`${s.name} — ${etiqueta}`}
                          className={cn(
                            "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                            seleccionado
                              ? "border-white/20 bg-white/10 text-white/90"
                              : "border-white/10 bg-transparent text-white/35 hover:border-white/20 hover:text-white/60",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              estado === "activo"
                                ? "bg-emerald-400 shadow-[0_0_5px] shadow-emerald-400/70"
                                : estado === "falta-conectar"
                                  ? "bg-amber-400/80"
                                  : "bg-white/20",
                            )}
                          />
                          {s.name}
                        </button>
                      );
                    })}
                    {!conectoresFiltrados.length && (
                      <span className="px-1 py-1 text-[10px] text-white/30">Sin resultados.</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatPersonalityTray;
