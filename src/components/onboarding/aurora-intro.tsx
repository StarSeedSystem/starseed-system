"use client";

/**
 * AuroraIntro — presentación BREVE de Aurora la PRIMERA vez (petición 2026-07-13).
 * ============================================================================
 * Aurora se presenta y hace 3-5 preguntas OPCIONALES para entender preferencias
 * y contexto. Las respuestas alimentan:
 *   · la voz (encender/apagar la voz de Aurora vía el puente global),
 *   · el contexto de usuario (`saveUserContextSettings({ about })` — misma clave
 *     sincronizada `starseed.astraura.usercontext.v1`),
 *   · la personalidad activa (nudge de formalidad vía `adjustActivePersonalityTrait`).
 *
 * TODO es saltable ("Prefiero configurarlo luego"): si se salta, Aurora ya
 * funciona con su personalidad equilibrada cálida por defecto. Persiste que ya se
 * hizo en `starseed.aurora.intro.v1` (no repetir) y puede RELANZARSE desde Ajustes
 * con el evento `starseed:open-aurora-intro` o `window.openAuroraIntro()`.
 *
 * Se muestra SOLO a usuarios con sesión que YA completaron el alta de cuenta
 * (onboarding_state.completed) — así aparece DESPUÉS del asistente de identidad,
 * nunca a la vez. SSR-safe, defensivo, iconos Lucide, estética Crystal Glass.
 */

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Volume2, VolumeX, Check, ChevronRight } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { getOnboarding } from "@/lib/onboarding/onboarding";
import { saveUserContextSettings } from "@/ai/astraura/user-context";
import { cn } from "@/lib/utils";

/** Clave persistida: el intro de Aurora ya se hizo (viaja con la cuenta si está en SYNCED_KEYS). */
export const AURORA_INTRO_KEY = "starseed.aurora.intro.v1";
/** Evento para relanzar el intro desde Ajustes. */
export const AURORA_INTRO_OPEN_EVENT = "starseed:open-aurora-intro";

type Tone = "cercano" | "equilibrado" | "formal";

const TONES: { id: Tone; label: string; hint: string }[] = [
  { id: "cercano", label: "Cercano", hint: "Tuteo, calidez, sin formalismos" },
  { id: "equilibrado", label: "Equilibrado", hint: "Claro y cálido a la vez" },
  { id: "formal", label: "Formal", hint: "Preciso y respetuoso" },
];

const LANGS: { id: string; label: string }[] = [
  { id: "es", label: "Español" },
  { id: "en", label: "English" },
  { id: "pt", label: "Português" },
  { id: "fr", label: "Français" },
  { id: "gl", label: "Galego" },
  { id: "ca", label: "Català" },
];

function isIntroDone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(AURORA_INTRO_KEY) === "1";
  } catch {
    return true;
  }
}

function markIntroDone(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AURORA_INTRO_KEY, "1");
  } catch {
    /* */
  }
}

/** Puente defensivo a Aurora (setEnabled / speak) — el provider lo publica. */
function auroraBridge(): { setEnabled?: (v: boolean) => void; speak?: (t: string) => void } | null {
  if (typeof window === "undefined") return null;
  try {
    return (window as unknown as { STARSEED_AURORA?: { setEnabled?: (v: boolean) => void; speak?: (t: string) => void } })
      .STARSEED_AURORA ?? null;
  } catch {
    return null;
  }
}

export function AuroraIntro() {
  const [open, setOpen] = useState(false);
  const [callName, setCallName] = useState("");
  const [tone, setTone] = useState<Tone>("equilibrado");
  const [interests, setInterests] = useState("");
  const [language, setLanguage] = useState("es");
  const [voiceOn, setVoiceOn] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Relanzamiento bajo demanda (Ajustes) — ignora el gate ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpen = () => setOpen(true);
    window.addEventListener(AURORA_INTRO_OPEN_EVENT, onOpen);
    try {
      (window as unknown as Record<string, unknown>).openAuroraIntro = () => setOpen(true);
    } catch {
      /* */
    }
    return () => {
      window.removeEventListener(AURORA_INTRO_OPEN_EVENT, onOpen);
      try {
        delete (window as unknown as Record<string, unknown>).openAuroraIntro;
      } catch {
        /* */
      }
    };
  }, []);

  // ── Gate de primera ejecución (tras el alta de cuenta) ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isIntroDone()) return;
    // No competir con el asistente de identidad ni mostrarse en rutas públicas.
    const path = window.location.pathname || "";
    if (/^\/(login|bienvenida|onboarding|auth)(\/|$)/.test(path)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    void (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (cancelled || !data?.user) return; // guest → primero el alta de cuenta
        let completed = false;
        try {
          completed = (await getOnboarding()).completed;
        } catch {
          completed = false;
        }
        if (cancelled || !completed) return; // aún en el asistente de identidad
        timer = setTimeout(() => {
          if (!cancelled && !isIntroDone()) setOpen(true);
        }, 1200);
      } catch {
        /* sin sesión / sin red → no mostramos nada */
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const finish = useCallback(
    (applyAnswers: boolean) => {
      setSaving(true);
      try {
        if (applyAnswers) {
          // 1) Contexto de usuario (cómo llamarte, intereses, tono, idioma).
          try {
            saveUserContextSettings({
              about: {
                callName: callName.trim() || undefined,
                interests: interests.trim() || undefined,
                tone,
                language,
              },
            });
          } catch {
            /* */
          }
          // 2) Personalidad: nudge de formalidad según el tono elegido.
          if (tone !== "equilibrado") {
            void import("@/lib/aurora/personalities")
              .then((m) =>
                m.adjustActivePersonalityTrait("formalidad", tone === "formal" ? "mas" : "menos", 20),
              )
              .catch(() => {
                /* la personalidad sigue igual si algo falla */
              });
          }
          // 3) Voz: encender/apagar según preferencia.
          try {
            auroraBridge()?.setEnabled?.(voiceOn);
          } catch {
            /* */
          }
          // 4) Saludo (hablado solo si la voz queda encendida).
          if (voiceOn) {
            const hello = callName.trim()
              ? `Encantada, ${callName.trim()}. Cuando quieras, aquí estoy.`
              : "Encantada. Cuando quieras, aquí estoy.";
            setTimeout(() => {
              try {
                auroraBridge()?.speak?.(hello);
              } catch {
                /* */
              }
            }, 400);
          }
        }
      } finally {
        markIntroDone();
        setSaving(false);
        setOpen(false);
      }
    },
    [callName, interests, tone, language, voiceOn],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[92] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Presentación de Aurora"
    >
      <div className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-white/12 bg-[#0d1220]/95 shadow-2xl">
        {/* Cabecera — Aurora se presenta */}
        <div className="relative border-b border-white/10 bg-gradient-to-b from-[#7fb8ff]/12 to-transparent px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#7fb8ff]/15 ring-1 ring-[#7fb8ff]/40">
              <Sparkles className="h-5 w-5 text-[#7fb8ff]" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white">Hola, soy Aurora</h2>
              <p className="text-[11px] leading-snug text-white/60">
                Tu guía dentro de StarSeed. Cuéntame un poco para acompañarte mejor. Todo es opcional.
              </p>
            </div>
          </div>
        </div>

        {/* Preguntas */}
        <div className="space-y-4 px-5 py-4">
          {/* Nombre */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-white/70">¿Cómo quieres que te llame?</label>
            <input
              type="text"
              value={callName}
              onChange={(e) => setCallName(e.target.value)}
              placeholder="Tu nombre o apodo (opcional)"
              maxLength={60}
              className="w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#7fb8ff]/50"
            />
          </div>

          {/* Tono */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-white/70">¿Cómo prefieres que te hable?</label>
            <div className="grid grid-cols-3 gap-2">
              {TONES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTone(t.id)}
                  title={t.hint}
                  className={cn(
                    "cursor-pointer rounded-lg border px-2 py-2 text-center text-[11px] transition-colors",
                    tone === t.id
                      ? "border-[#7fb8ff]/50 bg-[#7fb8ff]/10 text-white"
                      : "border-white/10 bg-white/[0.02] text-white/60 hover:border-white/20",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Intereses */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-white/70">Temas que te interesan</label>
            <input
              type="text"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              placeholder="p. ej. arte, ciencia, comunidad… (opcional)"
              maxLength={400}
              className="w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#7fb8ff]/50"
            />
          </div>

          {/* Idioma */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-white/70">Idioma</label>
            <div className="flex flex-wrap gap-1.5">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLanguage(l.id)}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1 text-[11px] transition-colors",
                    language === l.id
                      ? "border-[#7fb8ff]/50 bg-[#7fb8ff]/10 text-white"
                      : "border-white/10 bg-white/[0.02] text-white/60 hover:border-white/20",
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Voz */}
          <button
            type="button"
            onClick={() => setVoiceOn((v) => !v)}
            className={cn(
              "flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors",
              voiceOn ? "border-[#39FF14]/30 bg-[#39FF14]/[0.06]" : "border-white/10 bg-white/[0.02]",
            )}
          >
            <span className="inline-flex items-center gap-2 text-xs text-white/80">
              {voiceOn ? <Volume2 className="h-4 w-4 text-[#39FF14]" /> : <VolumeX className="h-4 w-4 text-white/40" />}
              Quiero que Aurora me hable en voz alta
            </span>
            <span
              className={cn(
                "relative h-5 w-9 rounded-full transition-colors",
                voiceOn ? "bg-[#39FF14]/60" : "bg-white/15",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                  voiceOn ? "left-[18px]" : "left-0.5",
                )}
              />
            </span>
          </button>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-5 py-3">
          <button
            type="button"
            onClick={() => finish(false)}
            disabled={saving}
            className="cursor-pointer rounded-lg px-3 py-2 text-[11px] text-white/50 transition-colors hover:text-white/80"
          >
            Prefiero configurarlo luego
          </button>
          <button
            type="button"
            onClick={() => finish(true)}
            disabled={saving}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#7fb8ff] px-4 py-2 text-[12px] font-semibold text-[#0d1220] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Empezar"}
            {saving ? <Check className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AuroraIntro;
