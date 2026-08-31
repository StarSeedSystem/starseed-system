"use client";

/**
 * SensesPanel — ajustes de sentidos para Aurora y Astraura.
 *
 * El usuario elige QUÉ sentidos (capacidades reales del navegador) pueden usar
 * Aurora y/o Astraura. Las IAs honran esta configuración (la leen vía
 * getActiveSenses / window.STARSEED_senses). Por cada sentido:
 *   - un interruptor maestro (habilitar a nivel sistema),
 *   - sub-interruptores "Aurora puede usarlo" / "Astraura puede usarlo",
 *   - una insignia de estado de permiso en vivo,
 *   - un botón "Probar" que invoca de verdad la API del navegador.
 *
 * Honestidad: la captura ocurre vía APIs del navegador con permiso explícito;
 * nada se ejecuta sin tu consentimiento. SSR-safe (acceso a navigator sólo en
 * efectos/manejadores). Persiste en `senses_settings`.
 */

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SENSES,
  getSenses,
  saveSenses,
  requestSense,
  permissionState,
  defaultConfig,
  type SensesConfig,
  type SenseTestResult,
} from "@/lib/senses/senses";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
// (Adenda 192) Ayuda accionable + banner de entorno + refresco vivo de permisos.
import { BannerEntornoPermisos } from "@/components/senses/permisos-dispositivo";
import { ayudaPermiso, EVENTO_PERMISO, type PermisoDispositivo } from "@/lib/aurora/senses/request-permission";
import {
  ShieldCheck,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ExternalLink,
  Ear,
  Waves,
} from "lucide-react";
// (Adenda 77-voz) Oído emocional: prosodia local en vivo + toggle beta de sonidos.
import {
  EMOTIONAL_HEARING_SENSE_ID,
  MOOD_LABEL,
  subscribeUserVoiceEmotion,
  getLastUserVoiceEmotion,
  startUserVoiceEmotion,
  stopUserVoiceEmotion,
  installUserVoiceEmotionAutostart,
  type UserVoiceEmotion,
} from "@/lib/aurora/audio-emotion";
import { getOmniConfig, setOmniConfig } from "@/lib/aurora/tts-oss/voice-config";

type PermState = SenseTestResult["state"];

// (Adenda 192) Puente sentido → permiso del dispositivo (para la ayuda por
// navegador/SO). Portapapeles y pantalla no aparecen: siempre preguntan al usar.
const SENSE_A_PERMISO: Partial<Record<string, PermisoDispositivo>> = {
  "getUserMedia-audio": "microfono",
  "getUserMedia-video": "camara",
  geolocation: "ubicacion",
  notifications: "notificaciones",
  files: "archivos",
};

const STATE_META: Record<
  PermState,
  { label: string; className: string }
> = {
  granted: { label: "Concedido", className: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" },
  denied: { label: "Denegado", className: "border-red-500/40 text-red-300 bg-red-500/10" },
  prompt: { label: "Pendiente", className: "border-amber-500/40 text-amber-300 bg-amber-500/10" },
  unsupported: { label: "No consultable", className: "border-white/15 text-white/50 bg-white/5" },
  error: { label: "Error", className: "border-red-500/40 text-red-300 bg-red-500/10" },
};

export default function SensesPanel() {
  const [config, setConfig] = useState<SensesConfig>(defaultConfig());
  const [perms, setPerms] = useState<Record<string, PermState>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // ── Oído emocional (Adenda 77-voz) ──
  const [emotion, setEmotion] = useState<UserVoiceEmotion>(() => getLastUserVoiceEmotion());
  const [previewing, setPreviewing] = useState(false);
  const [deepSound, setDeepSound] = useState(false);

  // Instala el arranque automático del oído emocional (atado a la escucha de
  // Aurora, no invasivo) y escucha la emoción en vivo. Lee el flag beta.
  useEffect(() => {
    installUserVoiceEmotionAutostart();
    setDeepSound(getOmniConfig().deep_sound_understanding === true);
    const off = subscribeUserVoiceEmotion((e) => setEmotion(e));
    return off;
  }, []);

  // Prueba en vivo del oído emocional: arranca el analizador ~6 s (gesto explícito).
  const onPreviewHearing = async () => {
    if (previewing) return;
    setPreviewing(true);
    const ok = await startUserVoiceEmotion({ force: true });
    if (!ok) {
      setPreviewing(false);
      toast.message("Oído emocional no disponible aquí (¿móvil o sin permiso de micrófono?).");
      return;
    }
    window.setTimeout(() => {
      stopUserVoiceEmotion();
      setPreviewing(false);
    }, 6000);
  };

  const onToggleDeepSound = (v: boolean) => {
    setDeepSound(v);
    try { setOmniConfig({ deep_sound_understanding: v }); } catch { /* */ }
  };

  // Carga inicial del config + estado de permisos (SSR-safe: dentro de efecto).
  useEffect(() => {
    let alive = true;
    (async () => {
      const cfg = await getSenses();
      if (!alive) return;
      setConfig(cfg);
      setLoading(false);
      const entries = await Promise.all(
        SENSES.map(async (s) => [s.id, await permissionState(s.id)] as const),
      );
      if (!alive) return;
      setPerms(Object.fromEntries(entries));
    })();
    return () => {
      alive = false;
    };
  }, []);

  // (Adenda 192) Refresco EN VIVO: cualquier petición hecha en otra superficie
  // (Bienvenida, Ajustes, un área con BotonPermiso) actualiza estas insignias.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPermiso = () => {
      void Promise.all(
        SENSES.map(async (s) => [s.id, await permissionState(s.id)] as const),
      ).then((entries) => setPerms(Object.fromEntries(entries)));
    };
    window.addEventListener(EVENTO_PERMISO, onPermiso);
    return () => window.removeEventListener(EVENTO_PERMISO, onPermiso);
  }, []);

  const setFlag = (
    bucket: "enabled" | "aurora" | "astraura",
    id: string,
    value: boolean,
  ) => {
    setConfig((prev) => {
      const next: SensesConfig = {
        enabled: { ...prev.enabled },
        aurora: { ...prev.aurora },
        astraura: { ...prev.astraura },
      };
      next[bucket][id] = value;
      // Si se apaga el maestro, las IAs no pueden usarlo (coherencia).
      if (bucket === "enabled" && !value) {
        next.aurora[id] = false;
        next.astraura[id] = false;
      }
      return next;
    });
  };

  const onSave = async () => {
    setSaving(true);
    const saved = await saveSenses(config);
    setSaving(false);
    if (saved) {
      setConfig(saved);
      toast.success("Sentidos guardados. Aurora y Astraura honrarán tu elección.");
    } else {
      toast.error("No se pudieron guardar los sentidos.");
    }
  };

  const onTest = async (id: string, label: string) => {
    setTesting((p) => ({ ...p, [id]: true }));
    const res = await requestSense(id);
    setTesting((p) => ({ ...p, [id]: false }));
    setPerms((p) => ({ ...p, [id]: res.state }));
    if (res.ok) {
      toast.success(`${label}: permiso concedido.`);
    } else if (res.state === "denied") {
      toast.error(`${label}: permiso denegado.`);
    } else if (res.state === "unsupported") {
      toast.message(`${label}: no disponible en este navegador.`);
    } else {
      toast.error(`${label}: ${res.error || "no se pudo comprobar"}.`);
    }
  };

  const activeCount = SENSES.filter((s) => config.enabled[s.id]).length;

  return (
    <div className="space-y-4">
      {/* Header / explicación */}
      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <ShieldCheck className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold text-amber-50">
            Sentidos de Aurora y Astraura
          </h2>
          <Badge
            variant="outline"
            className="ml-auto border-purple-500/40 text-purple-300"
          >
            {activeCount} / {SENSES.length} activos
          </Badge>
        </div>
        <p className="mt-2 text-sm text-white/60">
          Elige qué sentidos puede usar cada IA. Aurora y Astraura honran estas
          elecciones: sólo perciben a través de los sentidos que actives aquí.
        </p>
        <p className="mt-2 text-xs text-white/45">
          Honestidad: la captura ocurre vía APIs del navegador (micrófono, cámara,
          pantalla, ubicación, portapapeles, archivos, notificaciones) y siempre
          con tu permiso explícito. Nada se captura de forma automática ni se
          ejecuta sin tu consentimiento. Usa "Probar" para conceder cada permiso.
        </p>
        <a
          href="/ai-setup?tab=senses"
          className="mt-3 inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200 hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          Ajustes avanzados del ecosistema IA
        </a>
      </div>

      {/* (Adenda 192) Visor embebido u origen http:// → decirlo con la salida. */}
      <BannerEntornoPermisos />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-white/50 px-1 py-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando sentidos...
        </div>
      ) : (
        <div className="space-y-3">
          {SENSES.map((s) => {
            const Icon = s.icon;
            const masterOn = !!config.enabled[s.id];
            const state = perms[s.id] ?? "unsupported";
            const meta = STATE_META[state];
            return (
              <div
                key={s.id}
                className={cn(
                  "rounded-xl border bg-black/20 p-4 transition-colors",
                  masterOn ? "border-purple-500/30" : "border-white/10",
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 rounded-lg p-2",
                      masterOn ? "bg-purple-500/15" : "bg-white/5",
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-5 h-5",
                        masterOn ? "text-purple-300" : "text-white/40",
                      )}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-amber-50">{s.label}</span>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] py-0", meta.className)}
                      >
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-white/55">{s.blurb}</p>

                    {/* Oído emocional (Adenda 77-voz): chip vivo + prueba + beta */}
                    {s.id === EMOTIONAL_HEARING_SENSE_ID && masterOn && (
                      <div className="mt-2 space-y-2 rounded-lg border border-[#7fb8ff]/20 bg-[#7fb8ff]/[0.05] p-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Waves className="w-3.5 h-3.5 text-[#7fb8ff]" />
                          <span className="text-[11px] text-white/70">Tono percibido:</span>
                          {emotion.confidence >= 0.35 && emotion.mood !== "neutral" ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-[#7fb8ff]/40 bg-[#7fb8ff]/10 px-2 py-0.5 text-[11px] text-[#bcd8ff]">
                              {MOOD_LABEL[emotion.mood].label} {MOOD_LABEL[emotion.mood].glyph}
                            </span>
                          ) : (
                            <span className="text-[11px] text-white/40">
                              {previewing ? "escuchando…" : "en silencio"}
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-auto h-6 gap-1.5 text-[11px]"
                            disabled={previewing}
                            onClick={onPreviewHearing}
                          >
                            {previewing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ear className="w-3 h-3" />}
                            Probar oído
                          </Button>
                        </div>
                        <p className="text-[10px] text-white/40">
                          Analiza energía, brillo y ritmo de tu voz en LOCAL mientras Aurora
                          escucha. Nada sale del dispositivo. En móvil queda inactivo.
                        </p>
                        {/* Comprensión profunda de sonidos (BETA) */}
                        <label className="flex items-start gap-2 text-[11px] text-white/70">
                          <Switch checked={deepSound} onCheckedChange={onToggleDeepSound} className="mt-0.5" />
                          <span>
                            Comprensión profunda de sonidos{" "}
                            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-300">
                              beta
                            </span>
                            <span className="mt-0.5 block text-[10px] text-white/40">
                              Requiere motor multimodal (próximamente): subir un fragmento de
                              audio a un modelo que entienda sonidos. Hoy el router de Aurora
                              solo acepta texto.
                            </span>
                          </span>
                        </label>
                      </div>
                    )}

                    {/* Sub-toggles por IA */}
                    <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                      <label
                        className={cn(
                          "flex items-center gap-2 text-xs",
                          masterOn ? "text-white/70" : "text-white/30",
                        )}
                      >
                        <Switch
                          checked={!!config.aurora[s.id] && masterOn}
                          disabled={!masterOn}
                          onCheckedChange={(v) => setFlag("aurora", s.id, v)}
                        />
                        Aurora puede usarlo
                      </label>
                      <label
                        className={cn(
                          "flex items-center gap-2 text-xs",
                          masterOn ? "text-white/70" : "text-white/30",
                        )}
                      >
                        <Switch
                          checked={!!config.astraura[s.id] && masterOn}
                          disabled={!masterOn}
                          onCheckedChange={(v) => setFlag("astraura", s.id, v)}
                        />
                        Astraura puede usarlo
                      </label>
                    </div>

                    <div className="mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 text-xs"
                        disabled={!!testing[s.id]}
                        onClick={() => onTest(s.id, s.label)}
                      >
                        {testing[s.id] ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : state === "granted" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : state === "denied" ? (
                          <XCircle className="w-3.5 h-3.5 text-red-400" />
                        ) : (
                          <HelpCircle className="w-3.5 h-3.5" />
                        )}
                        Probar
                      </Button>
                    </div>

                    {/* (Adenda 192) Bloqueado o no disponible → pasos EXACTOS
                        por navegador/SO para desbloquearlo (antes solo se
                        pintaba «Denegado» sin camino de salida). */}
                    {(() => {
                      const per = SENSE_A_PERMISO[s.permission];
                      if (!per || (state !== "denied" && state !== "unsupported")) return null;
                      return (
                        <p className="mt-2 rounded-lg border border-white/10 bg-black/25 p-2 text-[11px] leading-snug text-white/60">
                          {ayudaPermiso(per, state)}
                        </p>
                      );
                    })()}
                  </div>

                  {/* Interruptor maestro */}
                  <div className="flex flex-col items-end gap-1 pl-2">
                    <Switch
                      checked={masterOn}
                      onCheckedChange={(v) => setFlag("enabled", s.id, v)}
                    />
                    <span className="text-[10px] text-white/40">Habilitar</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Guardar */}
      <div className="flex items-center justify-end gap-3 pt-1">
        <span className="text-xs text-white/40">
          Los cambios se aplican a Aurora y Astraura al guardar.
        </span>
        <Button onClick={onSave} disabled={saving || loading} className="gap-2">
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Guardar sentidos
        </Button>
      </div>
    </div>
  );
}
