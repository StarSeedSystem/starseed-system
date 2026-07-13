"use client";

/**
 * Pestaña VOZ del Centro de Configuración (Adenda 67 · P1-1).
 * ============================================================================
 * Tipos de voz prediseñados + modelos configurables. NO hardcodea motores: lee el
 * registro real (`VOICE_PRESETS`, `getVoiceConfig`) y monta el panel completo de
 * voz del OS (`VoiceOssPanel`), que ya conoce todos los motores — incluidos los
 * que se añadan después (VoxCPM, Voicebox…), sin tocar nada aquí.
 *
 * Además enlaza la voz con la PERSONALIDAD: el estilo (tono, emoción, ritmo) se
 * deriva de sus niveladores y se emite por `starseed:aurora-voice-style`.
 */

import { useCallback, useEffect, useState } from "react";
import { Play, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VoiceOssPanel } from "@/components/settings/aurora/voice-oss-panel";
import {
  VOICE_PRESETS,
  applyVoicePreset,
  getVoiceConfig,
  subscribeVoiceConfig,
  type AuroraVoiceConfig,
} from "@/lib/aurora/tts-oss";
import {
  emitVoiceStyleForProfile,
  resolvePersonalityForContext,
  deriveVoiceStyle,
  type PersonalityProfile,
} from "@/lib/aurora/personalities";
import { Block, Note, btnCls } from "./setup-ui";

/** Puente global de Aurora (lo publica el provider): hablar de prueba. */
function speak(text: string): void {
  try {
    const bridge = (window as unknown as { STARSEED_AURORA?: { speak?: (t: string) => void } }).STARSEED_AURORA;
    if (bridge?.speak) bridge.speak(text);
    else toast.error("Aurora aún no está lista para hablar en esta pantalla.");
  } catch {
    toast.error("No pude reproducir la voz.");
  }
}

export function SetupVoz() {
  const [cfg, setCfg] = useState<AuroraVoiceConfig | null>(null);
  const [persona, setPersona] = useState<PersonalityProfile | null>(null);

  useEffect(() => {
    setCfg(getVoiceConfig());
    setPersona(resolvePersonalityForContext({}));
    const off = subscribeVoiceConfig(() => setCfg(getVoiceConfig()));
    return off;
  }, []);

  const aplicarPreset = useCallback((id: string, label: string) => {
    applyVoicePreset(id);
    setCfg(getVoiceConfig());
    toast.success(`Voz «${label}» aplicada.`);
  }, []);

  const aplicarDeLaPersonalidad = useCallback(() => {
    const p = resolvePersonalityForContext({});
    if (!p) {
      toast.error("No hay ninguna personalidad activa.");
      return;
    }
    emitVoiceStyleForProfile(p);
    const s = deriveVoiceStyle(p);
    toast.success(
      `Voz sincronizada con «${p.name}»: tono ${s.tone}, ${s.emotion}, ritmo ${s.rate}× y energía ${s.energy}.`,
    );
  }, []);

  return (
    <div className="space-y-3">
      <Note kind="ok">
        Por defecto Aurora usa la <strong>voz del sistema</strong>: instantánea, gratuita y sin descargas.
        Los motores locales/OSS (Kokoro, Bark, GPT-SoVITS, OmniVoice…) son opcionales y se eligen abajo.
      </Note>

      {/* Tipos de voz prediseñados (registro real, no lista inventada) */}
      <Block
        title="Tipos de voz prediseñados"
        icon="Sparkles"
        hint="Modulaciones de un toque. Valen para CUALQUIER motor."
        right={
          <button type="button" className={btnCls} onClick={() => speak("Hola, soy Aurora. Así sueno.")}>
            <Play className="h-3 w-3" /> Probar
          </button>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {VOICE_PRESETS.map((p) => {
            const active =
              cfg?.style?.emotion === p.style.emotion &&
              cfg?.style?.tone === p.style.tone &&
              (cfg?.style?.rate ?? 1) === (p.style.rate ?? 1);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => aplicarPreset(p.id, p.label)}
                title={p.hint}
                aria-pressed={active}
                className={cn(
                  "cursor-pointer rounded-xl border px-3 py-2 text-left transition-colors duration-200",
                  active
                    ? "border-[#39FF14]/45 bg-[#39FF14]/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/25",
                )}
              >
                <span className="block text-[11.5px] font-semibold text-white/90">{p.label}</span>
                <span className="block text-[10px] text-white/45">{p.hint}</span>
              </button>
            );
          })}
        </div>
      </Block>

      {/* Voz derivada de la personalidad */}
      <Block
        title="Voz según la personalidad"
        icon="Drama"
        hint="El carácter manda: los niveladores modulan ritmo, tono y energía."
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-white/60">
            {persona ? (
              <>
                Personalidad activa: <strong className="text-white/85">{persona.name}</strong> — voz{" "}
                {persona.voiceStyle.tone}, {persona.voiceStyle.emotion}, {persona.generoVoz}.
              </>
            ) : (
              "No hay personalidad activa."
            )}
          </span>
          <button type="button" className={cn(btnCls, "ml-auto")} onClick={aplicarDeLaPersonalidad}>
            <Sparkles className="h-3 w-3" /> Sincronizar voz con la personalidad
          </button>
        </div>
      </Block>

      {/* Panel completo de voz (motores, voces, descargas, endpoints, emoción) */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-2">
        <VoiceOssPanel />
      </div>
    </div>
  );
}

export default SetupVoz;
