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
// (VZR1011C) Motores de voz OPCIONALES no comerciales: aquí vive la casilla que
// los enunciado pide — explica la licencia ANTES de aceptar y guarda el estado.
import {
  LICENCIAS_VOCES_NO_COMERCIALES,
  aceptarLicenciaNoComercial,
  aptoParaProducto,
  depsDeNavegador,
  licenciaAceptadaNoComercial,
  revocarLicenciaNoComercial,
  type DepsVozNoComercial,
  type VozNoComercialId,
} from "@/lib/aurora/tts-oss/voces-no-comerciales";
import { Block, Note, Toggle, btnCls } from "./setup-ui";

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
  // (VZR1011C) Estado de la casilla de licencias no comerciales. Inyectado:
  // null fuera del cliente (SSR) → nada marcado por defecto.
  const [noComDeps, setNoComDeps] = useState<DepsVozNoComercial | null>(null);
  const [noComAceptadas, setNoComAceptadas] = useState<readonly VozNoComercialId[]>([]);

  useEffect(() => {
    setCfg(getVoiceConfig());
    setPersona(resolvePersonalityForContext({}));
    const off = subscribeVoiceConfig(() => setCfg(getVoiceConfig()));
    return off;
  }, []);

  // El estado de aceptación solo tiene sentido en el dispositivo: se lee aquí.
  useEffect(() => {
    const deps = depsDeNavegador();
    setNoComDeps(deps);
    if (!deps) {
      setNoComAceptadas([]);
      return;
    }
    setNoComAceptadas(
      LICENCIAS_VOCES_NO_COMERCIALES.filter((f) => !f.soloFicha)
        .filter((f) => licenciaAceptadaNoComercial(f.id as VozNoComercialId, deps))
        .map((f) => f.id as VozNoComercialId),
    );
  }, []);

  const aceptarNoComercial = useCallback(
    (id: VozNoComercialId, nombre: string, facultad: DepsVozNoComercial) => {
      aceptarLicenciaNoComercial(id, facultad);
      setNoComAceptadas((prev) => (prev.includes(id) ? prev : [...prev, id]));
      toast.success(`Licencia de ${nombre} aceptada para uso personal (no comercial).`);
    },
    [],
  );

  const revocarNoComercial = useCallback(
    (id: VozNoComercialId, nombre: string, facultad: DepsVozNoComercial) => {
      revocarLicenciaNoComercial(id, facultad);
      setNoComAceptadas((prev) => prev.filter((m) => m !== id));
      toast.message(`${nombre} vuelve a estar apagado: licencia revocada.`);
    },
    [],
  );

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

      {/* (VZR1011C) Motores no comerciales: casilla que explica la licencia.
          Están APAGADOS por defecto, no entran en el panel de arriba (cadena
          AUTO) y si OpenVoice no da audio solo los usan si hay licencia
          aceptada para ESTE uso personal. Nunca en páginas o grupos con fines
          comerciales — el filtro `voces-no-comerciales.ts` decide. */}
      <Block
        title="Motores opcionales no comerciales (uso personal)"
        icon="BadgeCheck"
        hint="F5-TTS y XTTS-v2: mejor opción para ti, nunca para el producto ni para un uso comercial."
      >
        <div className="space-y-2">
          <Note kind="warn">
            Apagados de fábrica y fuera de la cadena AUTO. Al aceptar y activar
            uno, los espacios de su familia descubiertos en Hugging Face podrán
            entrar COMO RESPALDO cuando OpenVoice no dé audio, en tu uso
            personal de esta neurona. Nadie descarga pesos por ti: el modelo lo
            aloja quien instala (tú o el Space que se use).
          </Note>
          {LICENCIAS_VOCES_NO_COMERCIALES.map((f) => {
            if (f.soloFicha) {
              // ChatTTS: solo ficha — no se activa nunca (forja §4 + contrato §1).
              return (
                <div key={f.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] font-semibold text-white/85">{f.nombre}</p>
                    {!aptoParaProducto(f.id) && (
                      <span className="shrink-0 rounded-full border border-[#FFBF00]/30 bg-[#FFBF00]/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-[#ffdf99]">
                        No apto para producto
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[10.5px] leading-snug text-white/50">{f.textoCasilla}</p>
                  <p className="mt-1.5 text-[10px] text-white/35">
                    Solo ficha en la Biblioteca y catálogo: no se activa, no entra en la cadena.
                  </p>
                </div>
              );
            }
            const id = f.id as VozNoComercialId;
            const aceptada = noComAceptadas.includes(id);
            return (
              <div key={f.id} className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold text-white/85">{f.nombre}</p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide",
                      "border-[#FFBF00]/30 bg-[#FFBF00]/10 text-[#ffdf99]",
                    )}
                  >
                    No apto para producto
                  </span>
                </div>
                <p className="text-[10px] text-white/35">
                  Código {f.licenciaCodigo} · pesos {f.licenciaPesos} ·{" "}
                  <a
                    href={f.repo}
                    target="_blank"
                    rel="noreferrer"
                    className="cursor-pointer underline decoration-white/20 underline-offset-2 hover:text-white/60"
                  >
                    repo oficial
                  </a>
                </p>
                <p className="text-[10.5px] leading-snug text-white/50">{f.textoCasilla}</p>
                <Toggle
                  checked={aceptada}
                  disabled={!noComDeps}
                  label={aceptada ? `Licencia de ${f.nombre} aceptada (uso personal)` : `Acepto la licencia de ${f.nombre} y lo activo para uso personal`}
                  hint={
                    !noComDeps
                      ? "Sin almacenamiento en este dispositivo no se puede activar aquí."
                      : f.espanol
                        ? "Habla español: XTTS-v2 (16 idiomas)."
                        : "Español no oficial: F5-TTS entrena en chino e inglés."
                  }
                  onChange={(v) => {
                    if (!noComDeps) return;
                    if (v) aceptarNoComercial(id, f.nombre, noComDeps);
                    else revocarNoComercial(id, f.nombre, noComDeps);
                  }}
                />
              </div>
            );
          })}
        </div>
      </Block>
    </div>
  );
}

export default SetupVoz;
