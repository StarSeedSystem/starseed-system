"use client";

/**
 * XaiVoicePanel — Ajustes → Experiencia (Aurora & Sentidos)
 * ============================================================================
 * Experiencia de VOZ CONVERSACIONAL en tiempo real con xAI (grok-voice),
 * completamente integrada al sistema de voz de StarSeed pero ofrecida como
 * experiencia APARTE (no participa de la cadena one-shot de TTS).
 *
 *  · Por defecto usa la API de StarSeed (GRATUITA, server-side, nunca expuesta).
 *  · Cada usuario puede poner su PROPIA xAI API key (opcional, viaja solo al
 *    endpoint /api/voice/xai/token server-side).
 *  · Un AGENTE xAI por personalidad (Astraura · Council · MoA · Aurora ·
 *    Hermione), cada uno con su voz e instrucciones por defecto, totalmente
 *    personalizable (voz y system prompt).
 *
 * Estilo Crystal Liquid Glass, coherente con VoiceOssPanel. SSR-safe.
 */

import { useCallback, useRef, useState } from "react";
import { Mic, Square, Sparkles, ShieldCheck, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  XaiVoiceAgent,
  type XaiAgentStatus,
} from "@/lib/aurora/tts-oss/xai-voice-agent";
import {
  XAI_PERSONA_LIST,
  XAI_VOICE_OPTIONS,
  type XaiPersonaId,
  type XaiVoiceId,
} from "@/lib/aurora/tts-oss/xai-persona-voices";

/** Texto amigable para cada estado del agente. */
const STATUS_LABEL: Record<XaiAgentStatus, string> = {
  idle: "Listo para hablar",
  "requesting-token": "Solicitando acceso de voz…",
  connecting: "Conectando con xAI…",
  listening: "Escuchándote… (habla ahora)",
  thinking: "Pensando…",
  speaking: "Hablando…",
  error: "Error",
  closed: "Sesión cerrada",
};

export function XaiVoicePanel({ className }: { className?: string }) {
  const [useStarseed, setUseStarseed] = useState(true);
  const [userKey, setUserKey] = useState("");
  const [personaId, setPersonaId] = useState<XaiPersonaId>("aurora");
  const [voice, setVoice] = useState<XaiVoiceId>("eve");
  const [status, setStatus] = useState<XaiAgentStatus>("idle");
  const [statusDetail, setStatusDetail] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const agentRef = useRef<XaiVoiceAgent | null>(null);

  const activePersona = XAI_PERSONA_LIST.find((p) => p.id === personaId);

  const start = useCallback(async () => {
    setErrorMsg("");
    const persona = XAI_PERSONA_LIST.find((p) => p.id === personaId);
    const agent = new XaiVoiceAgent({
      personaId,
      voice,
      // Si el usuario apagó "Usar StarSeed" y escribió su key, la usamos;
      // si no, el servidor usa la de StarSeed (gratuita) por defecto.
      apiKey: !useStarseed && userKey.trim() ? userKey.trim() : null,
      onStatus: (s, detail) => {
        setStatus(s);
        if (detail) setStatusDetail(detail);
      },
      onError: (m) => setErrorMsg(m),
    });
    agentRef.current = agent;
    void agent.start();
  }, [personaId, voice, useStarseed, userKey]);

  const stop = useCallback(() => {
    try {
      agentRef.current?.stop();
    } catch {
      /* */
    }
    agentRef.current = null;
    setStatus("idle");
    setStatusDetail("");
  }, []);

  const isLive =
    status === "requesting-token" ||
    status === "connecting" ||
    status === "listening" ||
    status === "thinking" ||
    status === "speaking";

  return (
    <div
      className={
        "rounded-2xl border border-[#7fb8ff]/25 bg-[#7fb8ff]/[0.05] p-4 space-y-3 " +
        (className ?? "")
      }
    >
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[#7fb8ff]" />
        <h3 className="text-sm font-semibold text-[#cfe2ff]">
          Voz conversacional xAI (Grok · tiempo real)
        </h3>
      </div>
      <p className="text-xs text-white/55 leading-relaxed">
        Habla EN VIVO con cada personalidad de StarSeed por voz (Astraura,
        Consejo, MoA, Aurora, Hermione). Conversación natural, multiturno, con
        detección de turno automática. Por defecto usa la API compartida
        gratuita de StarSeed; puedes usar tu propia xAI key si quieres.
      </p>

      {/* ── Personalidad ── */}
      <div className="space-y-1.5">
        <label className="text-xs text-white/60">Personalidad</label>
        <div className="flex flex-wrap gap-1.5">
          {XAI_PERSONA_LIST.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPersonaId(p.id);
                setVoice(p.voice);
              }}
              className={
                "px-2.5 py-1 rounded-full text-xs border transition " +
                (personaId === p.id
                  ? "border-[#7fb8ff] bg-[#7fb8ff]/15 text-[#cfe2ff]"
                  : "border-white/10 text-white/60 hover:border-white/25")
              }
              title={p.hint}
            >
              {p.label}
            </button>
          ))}
        </div>
        {activePersona && (
          <p className="text-[11px] text-white/40">{activePersona.hint}</p>
        )}
      </div>

      {/* ── Voz xAI ── */}
      <div className="space-y-1.5">
        <label className="text-xs text-white/60">Voz de xAI</label>
        <select
          value={voice}
          onChange={(e) => setVoice(e.target.value as XaiVoiceId)}
          className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white/80 outline-none focus:border-[#7fb8ff]/50"
        >
          {XAI_VOICE_OPTIONS.map((v) => (
            <option key={v.id} value={v.id} className="bg-[#0a0712]">
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── API: StarSeed gratuita vs key propia ── */}
      <div className="flex items-center gap-2">
        <input
          id="xai-starseed"
          type="checkbox"
          checked={useStarseed}
          onChange={(e) => setUseStarseed(e.target.checked)}
          className="accent-[#7fb8ff]"
        />
        <label htmlFor="xai-starseed" className="text-xs text-white/70 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Usar API de StarSeed (gratuita, recomendada)
        </label>
      </div>
      {!useStarseed && (
        <div className="space-y-1.5">
          <label className="text-xs text-white/60 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-amber-300" />
            Tu xAI API key (opcional)
          </label>
          <Input
            type="password"
            value={userKey}
            onChange={(e) => setUserKey(e.target.value)}
            placeholder="xai-..."
            className="bg-black/30 border-white/10 text-sm"
          />
          <p className="text-[11px] text-white/40">
            Solo viaja al servidor para pedir el token; nunca se expone en el
            navegador.
          </p>
        </div>
      )}

      {/* ── Controles ── */}
      <div className="flex items-center gap-2 pt-1">
        {!isLive ? (
          <Button
            onClick={start}
            className="bg-[#7fb8ff] text-[#0a0712] hover:bg-[#9cc8ff]"
          >
            <Mic className="w-4 h-4 mr-1.5" />
            Hablar con {activePersona?.label ?? "Aurora"}
          </Button>
        ) : (
          <Button
            onClick={stop}
            variant="outline"
            className="border-rose-400/40 text-rose-200 hover:bg-rose-400/10"
          >
            <Square className="w-4 h-4 mr-1.5" />
            Detener
          </Button>
        )}
        {status !== "idle" && (
          <span className="flex items-center gap-1.5 text-xs text-white/60">
            {isLive && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {STATUS_LABEL[status]}
            {statusDetail ? ` · ${statusDetail}` : ""}
          </span>
        )}
      </div>

      {errorMsg && (
        <p className="text-xs text-rose-300/90 bg-rose-500/10 border border-rose-400/20 rounded-lg px-3 py-2">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
