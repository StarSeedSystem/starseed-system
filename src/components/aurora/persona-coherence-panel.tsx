"use client";

/**
 * PersonaCoherencePanel — COHERENCIA DE VOZ Y PERSONA (Adenda 112).
 * ============================================================================
 * Elige un preset de voz de referencia (persona portátil): su carácter —tono,
 * emoción, energía— se aplica EN VIVO a la voz activa y se mantiene coherente
 * aunque cambie el motor de voz o el LLM. Si el motor sabe clonar, además usa la
 * referencia de audio; si no, conserva los parámetros equivalentes. Incluye el
 * idioma por chat (automático o fijo). SSR-safe y defensivo.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mic, Sparkles, Check, Languages, Wand2, Fingerprint, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PERSONA_REFERENCE_PRESETS, ENGINE_SUPPORTS_REF, resolvePersonaForEngine, applyPersona,
  getPersonaCoherence, setPersonaCoherence, activePersona, presetById, type PortablePersona,
} from "@/lib/aurora/persona-coherence";
import { LANG_OPTIONS } from "@/lib/aurora/lang-detect";
import { getVoiceEngine, type AuroraVoiceEngine } from "@/lib/aurora/tts-oss/voice-config";

const ENGINE_LABELS: Partial<Record<AuroraVoiceEngine, string>> = {
  kokoro: "Kokoro", browser: "Navegador", kitten: "Kitten", bark: "Bark", xai: "xAI",
  voxcpm: "VoxCPM", voicebox: "Voicebox", "gpt-sovits": "GPT-SoVITS", omnivoice: "OmniVoice", openvoice2: "OpenVoice 2",
};

export function PersonaCoherencePanel({ embedded = false }: { embedded?: boolean }) {
  const [presetId, setPresetId] = useState<string>("serena");
  const [langMode, setLangMode] = useState<string>("");
  const [engine, setEngine] = useState<AuroraVoiceEngine>("kokoro");
  const [applied, setApplied] = useState<string>("");

  useEffect(() => {
    const st = getPersonaCoherence();
    setPresetId(st.presetId ?? "serena");
    setLangMode(st.langMode ?? "");
    try { setEngine(getVoiceEngine()); } catch { /* */ }
  }, []);

  const persona: PortablePersona = useMemo(() => activePersona({ presetId, langMode }), [presetId, langMode]);
  const resolution = useMemo(() => resolvePersonaForEngine(persona, engine), [persona, engine]);

  const choose = useCallback((p: PortablePersona) => {
    setPresetId(p.id);
    setPersonaCoherence({ presetId: p.id, custom: undefined });
    let eng = engine;
    try { eng = getVoiceEngine(); setEngine(eng); } catch { /* */ }
    applyPersona(p, eng); // efecto EN VIVO por el canal de modulación de voz
    setApplied(p.name);
  }, [engine]);

  const setLang = (code: string) => { setLangMode(code); setPersonaCoherence({ langMode: code }); };

  const engineRows = (Object.keys(ENGINE_SUPPORTS_REF) as AuroraVoiceEngine[]);

  const body = (
    <div className="space-y-3">
      {/* Presets de voz de referencia */}
      <div>
        <p className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold text-white/85"><Wand2 className="h-4 w-4 text-fuchsia-300" /> Presets de voz de referencia</p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {PERSONA_REFERENCE_PRESETS.map((p) => (
            <button key={p.id} type="button" title={p.description} onClick={() => choose(p)}
              className={cn("cursor-pointer rounded-xl border px-2.5 py-2 text-left transition-colors", presetId === p.id ? "border-fuchsia-400/40 bg-fuchsia-500/[0.1]" : "border-white/10 bg-white/[0.03] hover:border-white/25")}>
              <span className="flex items-center gap-1 text-[12px] font-semibold text-white/90">
                {presetId === p.id && <Check className="h-3 w-3 text-fuchsia-300" />}{p.name}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-white/45">{p.emotion} · {p.tone}</span>
            </button>
          ))}
        </div>
        {applied && <p className="mt-1.5 text-[10px] text-emerald-300/80">Aplicado en vivo: «{applied}». Se mantiene al cambiar de motor o LLM.</p>}
      </div>

      {/* Cómo se resuelve en el motor activo */}
      <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.05] px-3 py-2">
        <p className="flex items-center gap-2 text-[11px] font-semibold text-white/85"><Fingerprint className="h-3.5 w-3.5 text-cyan-300" /> Coherencia en el motor activo: {ENGINE_LABELS[engine] ?? engine}</p>
        <p className="mt-0.5 text-[10px] leading-snug text-white/55">{resolution.coherenceNote}</p>
      </div>

      {/* Matriz de coherencia por motor */}
      <div>
        <p className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold text-white/85"><Mic className="h-4 w-4 text-violet-300" /> Cómo se mantiene por motor</p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {engineRows.map((e) => (
            <div key={e} className={cn("rounded-lg border px-2 py-1.5", e === engine ? "border-cyan-400/30 bg-cyan-500/[0.06]" : "border-white/10 bg-white/[0.03]")}>
              <p className="text-[11px] font-medium text-white/85">{ENGINE_LABELS[e] ?? e}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[9px] text-emerald-300/80"><Check className="h-2.5 w-2.5" /> carácter</p>
              <p className={cn("flex items-center gap-1 text-[9px]", ENGINE_SUPPORTS_REF[e] ? "text-emerald-300/80" : "text-white/35")}>
                {ENGINE_SUPPORTS_REF[e] ? <Check className="h-2.5 w-2.5" /> : <span className="inline-block h-2.5 w-2.5" />} referencia de audio
              </p>
            </div>
          ))}
        </div>
        <p className="mt-1 px-0.5 text-[10px] leading-snug text-white/35">
          El tono, la emoción y el carácter se preservan en TODOS los motores. La referencia de audio se usa solo en los
          que saben clonar; en el resto, la persona suena coherente por sus parámetros equivalentes.
        </p>
      </div>

      {/* Idioma por chat */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <p className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold text-white/85"><Languages className="h-4 w-4 text-emerald-300" /> Idioma del chat</p>
        <div className="flex flex-wrap gap-1.5">
          {LANG_OPTIONS.map((o) => (
            <button key={o.code || "auto"} type="button" onClick={() => setLang(o.code)}
              className={cn("cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors", langMode === o.code ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25")}>
              {o.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-white/45">
          {langMode ? `Fijo: la voz y las respuestas usan ${LANG_OPTIONS.find((o) => o.code === langMode)?.label}.` : "Automático: se detecta el idioma de cada mensaje para elegir voz e idioma."}
        </p>
      </div>

      <p className="flex items-start gap-1 px-0.5 text-[10px] leading-snug text-white/35">
        <Info className="mt-0.5 h-3 w-3 shrink-0" /> Esta persona y su idioma se aplican a la voz de Astraura en todas las secciones de chat.
        Ajustable por personalidad y por chat en cualquier momento.
      </p>
    </div>
  );

  if (embedded) return body;

  return (
    <Card className="border-white/10 bg-black/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><Sparkles className="h-4 w-4 text-fuchsia-300" /> Voz coherente y persona</CardTitle>
        <CardDescription>
          Elige una voz de referencia: su carácter se mantiene coherente aunque cambies de modelo de voz o de LLM, con
          referencia de audio donde el motor lo permita, e idioma automático o fijo por chat.
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

export default PersonaCoherencePanel;
