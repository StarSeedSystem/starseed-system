"use client";

/**
 * Pestaña SENTIDOS del Centro de Configuración (Adenda 67 · P1-1).
 * ============================================================================
 * Por cada sentido de Aurora: activar/desactivar · elegir FUENTE y MODELO (con la
 * mejor opción gratuita marcada por defecto) · tipo de memoria asociado ·
 * herramientas · tono y carácter propios.
 *
 * Aquí vive por fin la **UI del pin por sentido**: el modelo
 * (`PersonalityProfile.intelligence.porSentido`) existía desde P3 pero no tenía
 * formulario. Lo que se elige aquí:
 *   · se guarda en `starseed.aurora.senses.v1` (config del sentido), y
 *   · se ESCRIBE en la personalidad activa → `intelligencePinFor()` → `astrauraChat()`.
 * Es decir: fijar «Visión = OVH Qwen2.5-VL» cambia DE VERDAD el modelo que usa
 * Aurora al mirar una imagen. Si el pin falla, el failover sigue: un pin obsoleto
 * nunca deja al usuario sin respuesta.
 *
 * Motores no-LLM (reales, no maquetas): escucha (STT del navegador ↔ Whisper OSS)
 * y visión local (SmolVLM2 WebGPU) se gobiernan desde aquí con sus propias APIs.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  SETUP_SENSES,
  getSensesConfig,
  saveSenseConfig,
  resetSensesConfig,
  toolKindsFromSenses,
  type SenseConfig,
  type SensesConfig,
  type SetupSenseId,
  type SetupSenseSpec,
} from "@/lib/aurora/setup-config";
import {
  PERSONALITY_TOOL_KINDS,
  defaultPersonalityIntelligence,
  getPersonalityProfile,
  listPersonalityProfiles,
  resolvePersonalityForContext,
  savePersonalityProfile,
  type AuroraSense,
  type PersonalityProfile,
  type PersonalitySourcePin,
} from "@/lib/aurora/personalities";
import { detectAvailabilitySafe, type SourceAvailability } from "@/ai/astraura/availability";
import { listMemoryTypes } from "@/lib/brains/memory-types";
import {
  OSS_STT_MODELS,
  getOssSttModel,
  isOssSttEnabled,
  setOssSttEnabled,
  setOssSttModel,
  type OssSttModelId,
} from "@/lib/aurora/stt-oss/opt-in";
import { getVisionPrefs, setVisionPrefs } from "@/lib/aurora/senses/vision-sense";
// (Adenda 180) Solicitud REAL del permiso del navegador al activar un sentido/herramienta.
import { requestDevicePermission, SENSE_PERMISSION, TOOL_PERMISSION } from "@/lib/aurora/senses/request-permission";
import { Block, Chip, Icon, Note, StatusBadge, Toggle, btnCls, inputCls, labelCls, selectCls } from "./setup-ui";

/** Personalidad sobre la que se escriben los pines (la activa, o Aurora). */
function targetPersonality(): PersonalityProfile | null {
  return (
    resolvePersonalityForContext({}) ??
    getPersonalityProfile("preset-aurora") ??
    listPersonalityProfiles()[0] ??
    null
  );
}

/**
 * Escribe/borra el pin de un sentido en la personalidad activa. Si no queda
 * ningún pin, la personalidad vuelve a modo AUTO (Aurora elige la mejor gratis).
 */
function applyPinToPersonality(intel: AuroraSense, pin: PersonalitySourcePin): PersonalityProfile | null {
  const p = targetPersonality();
  if (!p) return null;
  const intel0 = p.intelligence ?? defaultPersonalityIntelligence();
  const porSentido: Partial<Record<AuroraSense, PersonalitySourcePin>> = { ...(intel0.porSentido ?? {}) };
  if (pin.fuente || pin.modelo) porSentido[intel] = pin;
  else delete porSentido[intel];
  const hayPin = Object.keys(porSentido).length > 0 || !!(intel0.global?.fuente || intel0.global?.modelo);
  return savePersonalityProfile({
    ...p,
    intelligence: { ...intel0, modo: hayPin ? "fija" : "auto", porSentido },
  });
}

export function SetupSentidos() {
  const [cfg, setCfg] = useState<SensesConfig | null>(null);
  const [avail, setAvail] = useState<SourceAvailability[] | null>(null);
  const [open, setOpen] = useState<SetupSenseId | null>("texto");
  const [persona, setPersona] = useState<PersonalityProfile | null>(null);
  const [detecting, setDetecting] = useState(false);

  // Motores propios (estado real de sus APIs).
  const [sttOss, setSttOss] = useState(false);
  const [sttModel, setSttModelState] = useState<OssSttModelId>("tiny");
  const [visionOn, setVisionOn] = useState(false);
  const [visionModel, setVisionModel] = useState<"256M" | "500M">("256M");

  const memoryTypes = useMemo(() => listMemoryTypes(), []);

  const detect = useCallback(async () => {
    setDetecting(true);
    try {
      setAvail(await detectAvailabilitySafe(6000));
    } finally {
      setDetecting(false);
    }
  }, []);

  useEffect(() => {
    setCfg(getSensesConfig());
    setPersona(targetPersonality());
    try {
      setSttOss(isOssSttEnabled());
      setSttModelState(getOssSttModel());
      const v = getVisionPrefs();
      setVisionOn(v.enabled);
      setVisionModel(v.model === "500M" ? "500M" : "256M");
    } catch {
      /* defaults */
    }
    // (Adenda 71-bis · 2026-07-17) Aplica el catálogo VIVO de OpenRouter (:free)
    // y arranca el sistema UNIFICADO adaptativo ANTES de detectar, para que los
    // ajustes por contexto muestren los modelos :free reales de hoy (no el
    // catálogo estático). Best-effort, defensivo.
    try {
      void (async () => {
        const { applyLiveOpenRouter } = await import("@/ai/astraura/free-catalog");
        await applyLiveOpenRouter();
        const { startUnifiedIntelligence } = await import("@/ai/astraura/unified-intelligence");
        startUnifiedIntelligence();
      })();
    } catch {
      /* sin red: el catálogo estático ya es válido */
    }
    void detect();
  }, [detect]);

  const readySources = useMemo(
    () => (avail ?? []).filter((a) => a.ready).map((a) => a.source),
    [avail],
  );
  const freeReady = useMemo(
    () => readySources.filter((s) => s.tier !== "paid").length,
    [readySources],
  );

  const patch = useCallback((id: SetupSenseId, p: Partial<SenseConfig>) => {
    const next = saveSenseConfig(id, p);
    setCfg(next);
    return next;
  }, []);

  /** Cambia la fuente/modelo fijados de un sentido (y lo aplica a la personalidad). */
  const setPin = useCallback(
    (spec: SetupSenseSpec, pin: PersonalitySourcePin) => {
      patch(spec.id, { pin });
      if (spec.intel) {
        const updated = applyPinToPersonality(spec.intel, pin);
        if (updated) setPersona(updated);
        if (!pin.fuente) {
          toast.success(`«${spec.label}»: Aurora vuelve a elegir sola la mejor fuente gratuita.`);
        } else {
          toast.success(`«${spec.label}» fijado. Si esa fuente falla, el failover sigue funcionando.`);
        }
      }
    },
    [patch],
  );

  /** Herramientas activas → se propagan a la personalidad (entran en el prompt). */
  const syncToolsToPersonality = useCallback((next: SensesConfig) => {
    const p = targetPersonality();
    if (!p) return;
    const kinds = toolKindsFromSenses(next);
    const updated = savePersonalityProfile({ ...p, tools: { ...p.tools, enabledKinds: kinds } });
    setPersona(updated);
  }, []);

  const toggleTool = useCallback(
    (id: SetupSenseId, kind: string) => {
      const current = (cfg?.[id]?.herramientas ?? []) as string[];
      const añadido = !current.includes(kind);
      const next = añadido ? [...current, kind] : current.filter((k) => k !== kind);
      const c = patch(id, { herramientas: next });
      syncToolsToPersonality(c);
      // (Adenda 180) Al ACTIVAR una herramienta con permiso real (archivos, ubicación,
      // sensores, notificaciones) se solicita AHORA, con el gesto del clic.
      if (añadido && TOOL_PERMISSION[kind] === "archivos") {
        // (Adenda 180) Archivos = flujo REAL: elegir carpeta (con respaldo universal
        // para Safari/Firefox), detectar configs de cerebros/cuentas dentro, y
        // disparar la auto-detección/escaneo del backend de la neurona.
        void import("@/lib/aurora/senses/folder-detect").then((m) => m.conectarCarpetaYDetectar()).then((res) => {
          if (!res) { toast.warning("No se conectó ninguna carpeta (cancelado)."); return; }
          toast.success(res.resumen, { duration: 9000 });
          if (res.backend) toast.info(res.backend, { duration: 7000 });
        }).catch(() => toast.error("No se pudo abrir el selector de carpetas."));
      } else if (añadido && TOOL_PERMISSION[kind]) {
        void requestDevicePermission(TOOL_PERMISSION[kind]).then((r) => {
          if (r.concedido) toast.success("Permiso concedido.");
          else if (!r.soportado) toast.info(r.motivo ?? "No disponible en este navegador.");
          else toast.warning(r.motivo ?? "Permiso pendiente.");
        });
      }
    },
    [cfg, patch, syncToolsToPersonality],
  );

  const toggleSense = useCallback(
    (spec: SetupSenseSpec, enabled: boolean) => {
      const c = patch(spec.id, { enabled });
      syncToolsToPersonality(c);
      // (Adenda 180) Solicita el permiso REAL del navegador con el gesto del clic
      // (antes solo se guardaba el flag y el permiso del SO nunca se pedía).
      if (enabled && SENSE_PERMISSION[spec.id]) {
        void requestDevicePermission(SENSE_PERMISSION[spec.id]).then((r) => {
          if (r.concedido) toast.success(`Permiso concedido: ${spec.label}.`);
          else if (!r.soportado) toast.info(r.motivo ?? "No disponible en este navegador.");
          else toast.warning(`Permiso pendiente: ${r.motivo ?? "denegado"}.`);
        });
      }
      // Efectos REALES en los motores propios del sentido.
      if (spec.id === "vision") {
        try {
          setVisionPrefs({ enabled });
          setVisionOn(enabled);
        } catch {
          /* */
        }
      }
      if (spec.id === "voz") {
        try {
          const bridge = (window as unknown as { STARSEED_AURORA?: { setEnabled?: (v: boolean) => void } })
            .STARSEED_AURORA;
          bridge?.setEnabled?.(enabled);
        } catch {
          /* */
        }
      }
    },
    [patch, syncToolsToPersonality],
  );

  const restaurar = useCallback(() => {
    const d = resetSensesConfig();
    setCfg(d);
    syncToolsToPersonality(d);
    // Limpia TODOS los pines por sentido de la personalidad activa.
    const p = targetPersonality();
    if (p) {
      const updated = savePersonalityProfile({
        ...p,
        intelligence: { ...defaultPersonalityIntelligence() },
      });
      setPersona(updated);
    }
    toast.success("Sentidos restaurados: todo activo y en automático (mejor opción gratuita).");
  }, [syncToolsToPersonality]);

  if (!cfg) {
    return <p className="px-1 py-6 text-center text-[11px] text-white/40">Cargando sentidos…</p>;
  }

  return (
    <div className="space-y-3">
      <Note kind="info">
        Aurora elige <strong>sola la mejor fuente gratuita</strong> para cada sentido. Aquí puedes
        <strong> fijarla</strong> si prefieres una concreta — pero incluso fijada, si esa fuente falla, el
        failover sigue funcionando: nunca te quedas sin respuesta.
      </Note>

      <div className="flex flex-wrap items-center gap-2 px-0.5">
        <span className="text-[11px] text-white/55">
          {avail === null
            ? "Detectando fuentes disponibles…"
            : `${freeReady} fuente${freeReady === 1 ? "" : "s"} gratuita${freeReady === 1 ? "" : "s"} lista${freeReady === 1 ? "" : "s"} ahora mismo`}
        </span>
        <button type="button" className={btnCls} onClick={() => void detect()} disabled={detecting}>
          <RefreshCw className={cn("h-3 w-3", detecting && "animate-spin")} /> Volver a detectar
        </button>
        <button type="button" className={cn(btnCls, "ml-auto")} onClick={restaurar}>
          Restaurar todo
        </button>
      </div>

      {persona && (
        <p className="px-0.5 text-[10.5px] text-white/40">
          Los ajustes de fuente/modelo se guardan en la personalidad activa: <strong>{persona.name}</strong>
          {persona.intelligence?.modo === "fija" ? " (modo fijado)" : " (modo automático)"}.
        </p>
      )}

      <div className="space-y-2">
        {SETUP_SENSES.map((spec) => {
          const sc = cfg[spec.id];
          const isOpen = open === spec.id;
          const pinned = !!sc.pin.fuente;
          return (
            <div key={spec.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              {/* Cabecera del sentido */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 transition-colors duration-200",
                    sc.enabled
                      ? "bg-[#7fb8ff]/12 text-[#7fb8ff] ring-[#7fb8ff]/25"
                      : "bg-white/[0.03] text-white/30 ring-white/10",
                  )}
                >
                  <Icon name={spec.icon} className="h-4 w-4" />
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : spec.id)}
                  aria-expanded={isOpen}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-white">{spec.label}</span>
                    <StatusBadge status={spec.estado} />
                    {pinned && (
                      <span className="rounded-full border border-[#7fb8ff]/30 bg-[#7fb8ff]/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-[#bcd9ff]">
                        Fijado
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-white/45">{spec.hint}</span>
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={sc.enabled}
                  aria-label={`Activar ${spec.label}`}
                  onClick={() => toggleSense(spec, !sc.enabled)}
                  className={cn(
                    "relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200",
                    sc.enabled ? "bg-[#39FF14]/60" : "bg-white/15",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all duration-200",
                      sc.enabled ? "left-[18px]" : "left-0.5",
                    )}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : spec.id)}
                  aria-label={isOpen ? "Contraer" : "Expandir"}
                  className="cursor-pointer rounded-md p-1 text-white/40 transition-colors duration-200 hover:text-white/80"
                >
                  <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")} />
                </button>
              </div>

              {/* Detalle */}
              {isOpen && (
                <div className="space-y-3 border-t border-white/8 bg-black/20 px-3 py-3">
                  <Note kind={spec.estado === "operativo" ? "ok" : "warn"}>{spec.estadoNota}</Note>

                  {/* Fuente + modelo (sólo los sentidos que el router sabe fijar) */}
                  {spec.intel ? (
                    <SourcePicker
                      sense={spec}
                      value={sc.pin}
                      sources={readySources}
                      allSources={(avail ?? []).map((a) => a.source)}
                      onChange={(pin) => setPin(spec, pin)}
                    />
                  ) : (
                    <p className="text-[10.5px] text-white/40">
                      Este sentido no usa un modelo de lenguaje: su motor se elige abajo o en su propia
                      pestaña.
                    </p>
                  )}

                  {/* Motores propios REALES */}
                  {spec.id === "escucha" && (
                    <div className="space-y-2">
                      <Toggle
                        checked={sttOss}
                        onChange={(v) => {
                          try {
                            setOssSttEnabled(v);
                            setSttOss(v);
                            toast.success(
                              v
                                ? "Whisper OSS activado: la transcripción se hará en tu dispositivo."
                                : "Vuelves al reconocimiento del navegador (instantáneo, sin descarga).",
                            );
                          } catch {
                            toast.error("No pude cambiar el motor de escucha.");
                          }
                        }}
                        label="Transcribir en local con Whisper OSS"
                        hint="Más privado, pero descarga el modelo la primera vez. Por defecto: reconocimiento del navegador."
                        tone="lime"
                      />
                      {sttOss && (
                        <div>
                          <label className={labelCls} htmlFor="stt-model">
                            Modelo de Whisper
                          </label>
                          <select
                            id="stt-model"
                            className={selectCls}
                            value={sttModel}
                            onChange={(e) => {
                              const m = e.target.value as OssSttModelId;
                              try {
                                setOssSttModel(m);
                                setSttModelState(m);
                              } catch {
                                /* */
                              }
                            }}
                          >
                            {Object.entries(OSS_STT_MODELS).map(([id, spec2]) => (
                              <option key={id} value={id}>
                                {spec2.label} · {spec2.approxSize} · {spec2.note}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {spec.id === "vision" && (
                    <div>
                      <label className={labelCls} htmlFor="vision-model">
                        Modelo local de visión (SmolVLM2, WebGPU · privado)
                      </label>
                      <select
                        id="vision-model"
                        className={selectCls}
                        value={visionModel}
                        onChange={(e) => {
                          const m = e.target.value === "500M" ? "500M" : "256M";
                          try {
                            setVisionPrefs({ model: m });
                            setVisionModel(m);
                          } catch {
                            /* */
                          }
                        }}
                      >
                        <option value="256M">SmolVLM2 256M · ligero y rápido</option>
                        <option value="500M">SmolVLM2 500M · más preciso</option>
                      </select>
                      <p className="mt-1 text-[10px] text-white/40">
                        Alternativa sin descarga: fija arriba una fuente gratuita con visión (OVH Qwen2.5-VL,
                        Z.ai). {visionOn ? "La visión local está activada." : "La visión local está apagada."}
                      </p>
                    </div>
                  )}

                  {spec.id === "voz" && (
                    <p className="text-[10.5px] text-white/45">
                      El motor de voz (navegador · Kokoro · Bark · GPT-SoVITS · OmniVoice…) y sus voces se
                      eligen en la pestaña <strong className="text-white/70">Voz</strong>.
                    </p>
                  )}

                  {spec.id === "pantalla" && (
                    <p className="text-[10.5px] text-white/45">
                      Los permisos del dispositivo (micrófono, cámara, captura de pantalla) se conceden en
                      <strong className="text-white/70"> Ajustes → Sentidos</strong>; aquí se decide cómo los
                      usa Aurora.
                    </p>
                  )}

                  {/* Memoria + herramientas + tono/carácter */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelCls} htmlFor={`mem-${spec.id}`}>
                        Tipo de memoria asociada
                      </label>
                      <select
                        id={`mem-${spec.id}`}
                        className={selectCls}
                        value={sc.memoria}
                        onChange={(e) => patch(spec.id, { memoria: e.target.value })}
                      >
                        {memoryTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label} — {t.blurb}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls} htmlFor={`tono-${spec.id}`}>
                        Tono propio de este sentido
                      </label>
                      <input
                        id={`tono-${spec.id}`}
                        type="text"
                        className={inputCls}
                        value={sc.tono}
                        maxLength={60}
                        placeholder="p. ej. cálido, sereno, directo…"
                        onChange={(e) => patch(spec.id, { tono: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls} htmlFor={`car-${spec.id}`}>
                      Carácter en este sentido (entra en su forma de ser)
                    </label>
                    <input
                      id={`car-${spec.id}`}
                      type="text"
                      className={inputCls}
                      value={sc.caracter}
                      maxLength={160}
                      placeholder="p. ej. descriptiva y literal antes que interpretativa"
                      onChange={(e) => patch(spec.id, { caracter: e.target.value })}
                    />
                  </div>

                  <div>
                    <span className={labelCls}>Herramientas permitidas en este sentido</span>
                    <div className="flex flex-wrap gap-1.5">
                      {PERSONALITY_TOOL_KINDS.map((k) => (
                        <Chip
                          key={k.id}
                          active={sc.herramientas.includes(k.id)}
                          onClick={() => toggleTool(spec.id, k.id)}
                          tone="lime"
                        >
                          {k.label}
                        </Chip>
                      ))}
                    </div>
                    <p className="mt-1 text-[10px] text-white/40">
                      La unión de las herramientas de todos los sentidos activos es lo que Aurora tiene
                      permitido usar.
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Selector de fuente + modelo (gratis primero) ── */

function SourcePicker({
  sense,
  value,
  sources,
  allSources,
  onChange,
}: {
  sense: SetupSenseSpec;
  value: PersonalitySourcePin;
  sources: { id: string; label: string; tier: string; models: { id: string; label: string; vision?: boolean }[] }[];
  allSources: { id: string; label: string; tier: string; models: { id: string; label: string; vision?: boolean }[] }[];
  onChange: (pin: PersonalitySourcePin) => void;
}) {
  const needsVision = sense.id === "vision";
  const usable = useMemo(() => {
    const base = sources.length ? sources : allSources;
    return base
      .filter((s) => s.tier !== "paid")
      .filter((s) => (needsVision ? s.models.some((m) => m.vision) : true));
  }, [sources, allSources, needsVision]);

  const selected = usable.find((s) => s.id === value.fuente);
  const models = useMemo(
    () => (selected ? selected.models.filter((m) => (needsVision ? m.vision : true)) : []),
    [selected, needsVision],
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={labelCls} htmlFor={`src-${sense.id}`}>
          Fuente de inteligencia
        </label>
        <select
          id={`src-${sense.id}`}
          className={selectCls}
          value={value.fuente ?? ""}
          onChange={(e) => {
            const fuente = e.target.value;
            if (!fuente) onChange({});
            else {
              const s = usable.find((x) => x.id === fuente);
              const first = s?.models.filter((m) => (needsVision ? m.vision : true))[0]?.id;
              onChange({ fuente, ...(first ? { modelo: first } : {}) });
            }
          }}
        >
          <option value="">Automático — la mejor gratuita disponible (recomendado)</option>
          {usable.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} {s.tier === "instant" ? "· sin clave" : s.tier === "local" ? "· local" : "· clave gratis"}
            </option>
          ))}
        </select>
        {usable.length === 0 && (
          <p className="mt-1 text-[10px] text-[#ffdf99]">
            No hay ninguna fuente gratuita
            {needsVision ? " con visión" : ""} detectada ahora mismo. Aurora seguirá probando en cada
            petición.
          </p>
        )}
      </div>
      <div>
        <label className={labelCls} htmlFor={`mod-${sense.id}`}>
          Modelo
        </label>
        <select
          id={`mod-${sense.id}`}
          className={selectCls}
          value={value.modelo ?? ""}
          disabled={!selected}
          onChange={(e) => onChange({ ...value, modelo: e.target.value || undefined })}
        >
          {!selected ? (
            <option value="">Lo elige Aurora</option>
          ) : (
            <>
              <option value="">El mejor de esa fuente</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.vision ? " · visión" : ""}
                </option>
              ))}
            </>
          )}
        </select>
        {!selected && (
          <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-white/40">
            <Sparkles className="h-3 w-3" /> En automático, Aurora ordena por disponibilidad real, calidad y
            coste 0.
          </p>
        )}
      </div>
    </div>
  );
}

export default SetupSentidos;
