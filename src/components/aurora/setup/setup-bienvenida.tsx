"use client";

/**
 * Pestaña BIENVENIDA del Centro de Configuración (Adenda 67 · P1).
 * ============================================================================
 * Es la antigua pantalla «Hola, soy Aurora»: 4 preguntas opcionales que dejan a
 * Aurora ya lista sin tocar nada más. Todo lo que se responde aquí se APLICA de
 * verdad (no es decorativo):
 *   · nombre + intereses + tono + idioma → `saveUserContextSettings({ about })`
 *     (clave sincronizada `starseed.astraura.usercontext.v1`),
 *   · tono → nudge real sobre el nivelador «formalidad» de la personalidad activa,
 *   · voz  → enciende/apaga la voz por el puente global de Aurora.
 *
 * El resto de pestañas del centro ya vienen con las MEJORES opciones gratuitas
 * puestas: quien no quiera tocar nada, no toca nada.
 */

import { useEffect, useState } from "react";
import { Volume2, VolumeX, Gift, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUserContextSettings, saveUserContextSettings } from "@/ai/astraura/user-context";
import { Block, Note, inputCls, labelCls } from "./setup-ui";

export type Tone = "cercano" | "equilibrado" | "formal";

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

export interface BienvenidaAnswers {
  callName: string;
  tone: Tone;
  interests: string;
  language: string;
  voiceOn: boolean;
}

export const DEFAULT_ANSWERS: BienvenidaAnswers = {
  callName: "",
  tone: "equilibrado",
  interests: "",
  language: "es",
  voiceOn: true,
};

/** Aplica las respuestas (contexto de usuario + personalidad + voz). Idempotente. */
export function applyBienvenida(a: BienvenidaAnswers): void {
  try {
    saveUserContextSettings({
      about: {
        callName: a.callName.trim() || undefined,
        interests: a.interests.trim() || undefined,
        tone: a.tone,
        language: a.language,
      },
    });
  } catch {
    /* el resto del centro sigue funcionando */
  }
  if (a.tone !== "equilibrado") {
    void import("@/lib/aurora/personalities")
      .then((m) => m.adjustActivePersonalityTrait("formalidad", a.tone === "formal" ? "mas" : "menos", 20))
      .catch(() => {
        /* la personalidad sigue igual si algo falla */
      });
  }
  try {
    const bridge = (
      window as unknown as { STARSEED_AURORA?: { setEnabled?: (v: boolean) => void } }
    ).STARSEED_AURORA;
    bridge?.setEnabled?.(a.voiceOn);
  } catch {
    /* */
  }
}

export function SetupBienvenida({
  answers,
  onChange,
}: {
  answers: BienvenidaAnswers;
  onChange: (patch: Partial<BienvenidaAnswers>) => void;
}) {
  const [loaded, setLoaded] = useState(false);

  // Precarga lo que Aurora ya sabe del usuario (si vuelve a abrir el centro,
  // no le preguntamos de cero otra vez).
  useEffect(() => {
    if (loaded) return;
    try {
      const s = getUserContextSettings();
      const about = s.about ?? {};
      const patch: Partial<BienvenidaAnswers> = {};
      if (about.callName) patch.callName = about.callName;
      if (about.interests) patch.interests = about.interests;
      if (about.tone === "cercano" || about.tone === "equilibrado" || about.tone === "formal") {
        patch.tone = about.tone;
      }
      if (about.language) patch.language = about.language;
      if (Object.keys(patch).length) onChange(patch);
    } catch {
      /* sin contexto previo: seguimos con los defaults */
    } finally {
      setLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  return (
    <div className="space-y-3">
      <Note kind="ok">
        <strong>Ya funciona sin tocar nada.</strong> Aurora viene configurada con las mejores opciones
        gratuitas y de código abierto: fuentes de inteligencia sin clave, voz del sistema y memoria local.
        Esto de aquí sólo la afina.
      </Note>

      <Block title="¿Cómo quieres que te trate?" icon="Sparkles" hint="Todo es opcional y se puede cambiar luego.">
        <div className="space-y-3.5">
          <div>
            <label className={labelCls} htmlFor="setup-callname">
              ¿Cómo quieres que te llame?
            </label>
            <input
              id="setup-callname"
              type="text"
              value={answers.callName}
              onChange={(e) => onChange({ callName: e.target.value })}
              placeholder="Tu nombre o apodo (opcional)"
              maxLength={60}
              className={inputCls}
            />
          </div>

          <div>
            <span className={labelCls}>¿Cómo prefieres que te hable?</span>
            <div className="grid grid-cols-3 gap-2">
              {TONES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChange({ tone: t.id })}
                  title={t.hint}
                  aria-pressed={answers.tone === t.id}
                  className={cn(
                    "cursor-pointer rounded-lg border px-2 py-2 text-center text-[11px] transition-colors duration-200",
                    answers.tone === t.id
                      ? "border-[#7fb8ff]/50 bg-[#7fb8ff]/10 text-white"
                      : "border-white/10 bg-white/[0.02] text-white/60 hover:border-white/20",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="setup-interests">
              Temas que te interesan
            </label>
            <input
              id="setup-interests"
              type="text"
              value={answers.interests}
              onChange={(e) => onChange({ interests: e.target.value })}
              placeholder="p. ej. arte, ciencia, comunidad… (opcional)"
              maxLength={400}
              className={inputCls}
            />
          </div>

          <div>
            <span className={labelCls}>Idioma</span>
            <div className="flex flex-wrap gap-1.5">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onChange({ language: l.id })}
                  aria-pressed={answers.language === l.id}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1 text-[11px] transition-colors duration-200",
                    answers.language === l.id
                      ? "border-[#7fb8ff]/50 bg-[#7fb8ff]/10 text-white"
                      : "border-white/10 bg-white/[0.02] text-white/60 hover:border-white/20",
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onChange({ voiceOn: !answers.voiceOn })}
            aria-pressed={answers.voiceOn}
            className={cn(
              "flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors duration-200",
              answers.voiceOn ? "border-[#39FF14]/30 bg-[#39FF14]/[0.06]" : "border-white/10 bg-white/[0.02]",
            )}
          >
            <span className="inline-flex items-center gap-2 text-xs text-white/80">
              {answers.voiceOn ? (
                <Volume2 className="h-4 w-4 text-[#39FF14]" />
              ) : (
                <VolumeX className="h-4 w-4 text-white/40" />
              )}
              Quiero que Aurora me hable en voz alta
            </span>
            <span
              className={cn(
                "relative h-5 w-9 rounded-full transition-colors duration-200",
                answers.voiceOn ? "bg-[#39FF14]/60" : "bg-white/15",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all duration-200",
                  answers.voiceOn ? "left-[18px]" : "left-0.5",
                )}
              />
            </span>
          </button>
        </div>
      </Block>

      <Block title="Lo que ya viene puesto" icon="Gift" hint="Valores por defecto: gratis, libres y funcionales.">
        <ul className="space-y-1.5 text-[11px] leading-relaxed text-white/65">
          <li className="flex gap-2">
            <Sparkles className="mt-[2px] h-3 w-3 shrink-0 text-[#7fb8ff]" />
            <span>
              <strong className="text-white/85">Inteligencia:</strong> Aurora elige sola la mejor fuente
              gratuita disponible en cada momento (sin clave, sin coste) y cambia sola si una se agota.
            </span>
          </li>
          <li className="flex gap-2">
            <Sparkles className="mt-[2px] h-3 w-3 shrink-0 text-[#39FF14]" />
            <span>
              <strong className="text-white/85">Voz:</strong> la voz del sistema (instantánea y gratuita).
              Puedes cambiar a motores locales/OSS en la pestaña «Voz».
            </span>
          </li>
          <li className="flex gap-2">
            <Sparkles className="mt-[2px] h-3 w-3 shrink-0 text-[#FFBF00]" />
            <span>
              <strong className="text-white/85">Habilidades:</strong> todas tus habilidades y repos van a
              todos tus cerebros y neuronas. Editable en «Astraura».
            </span>
          </li>
          <li className="flex gap-2">
            <Gift className="mt-[2px] h-3 w-3 shrink-0 text-[#DC143C]" />
            <span>
              <strong className="text-white/85">Privacidad:</strong> las claves que conectes se cifran y se
              quedan en este dispositivo. Nunca viajan a la cuenta.
            </span>
          </li>
        </ul>
      </Block>
    </div>
  );
}

export default SetupBienvenida;
