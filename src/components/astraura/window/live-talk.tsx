"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «Hablar en Vivo» — chat atado a UNA entidad viva de Astraura 1.58-bit
 * (Ola 5 · Adenda 157, SOP §2)
 * ---------------------------------------------------------------------------
 * Usa el router agéntico `astrauraChat` (mismo que el resto del OS) pero
 * FUERZA el sistema 1.58 con el modelo de la personalidad de la entidad
 * (`astraura-158/<persona>`) vía `forceSource`. Si el backend 1.58 no responde,
 * el router degrada solo a la cadena de secundarios del OS — nunca inventa, y
 * esta ventana lo DICE con honestidad (aviso ámbar bajo la respuesta) cuando
 * eso pasa, leyendo el `RouteRecord` que devuelve la propia llamada.
 *
 * Sin persistencia en Supabase: es una conversación EFÍMERA de esta ventana
 * (se pierde al cerrarla o al cambiar de entidad); la UI lo dice.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Send, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { astrauraChat } from "@/ai/astraura/router";
import type { ChatMessage } from "@/ai/providers/types";
import { ASTRAURA_158_CLOUD_SOURCE_ID, ASTRAURA_158_LOCAL_SOURCE_ID } from "@/ai/astraura/free-catalog";
import { ASTRAURA_158_MODEL_PREFIX, ASTRAURA_158_PERSONAS, persona158For } from "@/ai/providers/astraura-158";
import type { Astraura158Target } from "@/lib/astraura/astraura-158-client";
import { MessageRenderer } from "@/components/aurora/message-renderer";
import { BTN, BTN_PRIMARY, Empty, INPUT, LABEL, MONO } from "@/components/astraura/s158/shared";
import type { Astraura158EntityKind } from "./astraura-158-window-bus";

export interface LiveTalkProps {
  kind: Astraura158EntityKind;
  id: string;
  /** Nombre visible de la entidad (lo decide quien monta la ventana, con estado honesto si aún no cargó). */
  name: string;
  /** Id de personalidad 1.58 de la entidad, si se conoce (si no, se deduce del nombre). */
  personaId?: string;
  /** Contexto vivo de la entidad: quién es, su tarea actual, sus últimas ramas… */
  contextLines?: string[];
  target: Astraura158Target;
  className?: string;
}

interface LiveTalkTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Aviso honesto: qué sistema respondió de verdad, si no fue Astraura 1.58-bit. */
  notice?: string;
}

const KIND_NOUN: Record<Astraura158EntityKind, string> = {
  proceso: "un proceso de imaginación autónoma del backend Astraura 1.58-bit",
  agente: "un agente del enjambre de StarSeed OS",
  personalidad: "una personalidad del sistema Astraura 1.58-bit",
  cerebro: "un cerebro (memoria y contexto) de StarSeed OS",
  proyecto: "un proyecto vivo de StarSeed OS",
  creacion: "una creación generada por Astraura 1.58-bit",
  rama: "una rama de imaginación de Astraura 1.58-bit",
};

let liveTalkSeq = 0;
function nextTurnId(): string {
  liveTalkSeq += 1;
  return `lt-${Date.now()}-${liveTalkSeq}`;
}

/** Personalidad 1.58 efectiva: la propia de la entidad (si es una personalidad real) o la afín por nombre. */
function resolveLiveTalkPersona(personaId: string | undefined, name: string): string {
  const explicit = String(personaId ?? "").trim();
  if (explicit && ASTRAURA_158_PERSONAS.some((p) => p.id === explicit)) return explicit;
  return persona158For({ id: personaId, name });
}

function buildSystemPrompt(
  kind: Astraura158EntityKind,
  name: string,
  personaLabel: string,
  personaOrgan: string,
  contextLines: string[] | undefined,
): string {
  const lines = (contextLines ?? []).map((l) => l.trim()).filter(Boolean);
  const ctx = lines.length ? lines.map((l) => `- ${l}`).join("\n") : "- Sin contexto adicional disponible ahora mismo.";
  return [
    `Eres «${name}», ${KIND_NOUN[kind]} del Sistema de la Sociedad StarSeed (SSSS).`,
    `Hablas con la voz de la personalidad 1.58-bit «${personaLabel}» (${personaOrgan}).`,
    `Esta conversación es «Hablar en Vivo»: el usuario te habla EN VIVO y directamente a TI, no al sistema en general. Responde SIEMPRE en primera persona, en español, con el tono propio de tu personalidad.`,
    `Tu contexto y tarea actual ahora mismo:\n${ctx}`,
    `Si el usuario pide algo que no puedes verificar de verdad con ese contexto, dilo con honestidad en vez de inventarlo.`,
  ].join("\n\n");
}

export function LiveTalk({ kind, id, name, personaId, contextLines, target, className }: LiveTalkProps) {
  const persona = useMemo(() => resolveLiveTalkPersona(personaId, name), [personaId, name]);
  const personaMeta = useMemo(() => ASTRAURA_158_PERSONAS.find((p) => p.id === persona), [persona]);

  const [turns, setTurns] = useState<LiveTalkTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const turnsRef = useRef<LiveTalkTurn[]>([]);
  turnsRef.current = turns;

  // Conversación efímera: al cambiar de entidad, empieza de cero (nunca arrastra contexto ajeno).
  useEffect(() => {
    setTurns([]);
    setStreamText("");
    setError("");
    abortRef.current?.abort();
  }, [kind, id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, streamText]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setInput("");
      setError("");
      const priorTurns = turnsRef.current;
      const userTurn: LiveTalkTurn = { id: nextTurnId(), role: "user", text };
      setTurns((prev) => [...prev, userTurn]);

      const system = buildSystemPrompt(kind, name, personaMeta?.label ?? persona, personaMeta?.organ ?? "núcleo holístico", contextLines);
      const history: ChatMessage[] = [
        { role: "system", content: system },
        ...priorTurns.map<ChatMessage>((t) => ({ role: t.role, content: t.text })),
        { role: "user", content: text },
      ];

      abortRef.current = new AbortController();
      setBusy(true);
      setStreamText("");
      let acc = "";
      try {
        const res = await astrauraChat({
          messages: history,
          taskHint: "chat",
          forceSource: {
            sourceId: target === "local" ? ASTRAURA_158_LOCAL_SOURCE_ID : ASTRAURA_158_CLOUD_SOURCE_ID,
            modelId: `${ASTRAURA_158_MODEL_PREFIX}${persona}`,
          },
          signal: abortRef.current.signal,
          onChunk: (delta) => {
            acc += delta;
            setStreamText((prev) => prev + delta);
          },
        });
        const reply = (res?.text ?? acc).trim();
        const route = res?.route;
        let notice: string | undefined;
        if (!route) {
          notice = "No pude confirmar qué sistema respondió (Ajustes → Inteligencia está en modo manual): puede que no fuera Astraura 1.58-bit.";
        } else if (route.local) {
          notice = "Ningún sistema respondió de verdad esta vez: esto es una respuesta local honesta (sin IA), no Astraura 1.58-bit.";
        } else if (route.sourceId !== ASTRAURA_158_LOCAL_SOURCE_ID && route.sourceId !== ASTRAURA_158_CLOUD_SOURCE_ID) {
          notice = `Astraura 1.58-bit (${target}) no respondió a tiempo; contestó un sistema secundario del OS: ${route.sourceLabel}${route.modelLabel ? ` · ${route.modelLabel}` : ""}.`;
        }
        if (reply) {
          setTurns((prev) => [...prev, { id: nextTurnId(), role: "assistant", text: reply, notice }]);
        } else {
          setError("El sistema no devolvió texto esta vez. Puedes reintentar.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
        setStreamText("");
        abortRef.current = null;
      }
    },
    [busy, kind, id, name, personaMeta, persona, contextLines, target],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: personaMeta?.color ?? "#22d3ee", boxShadow: `0 0 8px ${personaMeta?.color ?? "#22d3ee"}` }}
          aria-hidden="true"
        />
        <p className={LABEL}>
          Hablas con {personaMeta?.label ?? persona} · voz de {name}
        </p>
        <p className={cn(MONO, "ml-auto")}>chat efímero — no se guarda</p>
      </div>

      <div ref={scrollRef} className="min-h-[220px] flex-1 space-y-2 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2.5">
        {turns.length === 0 && !busy && <Empty text={`Aún no hay mensajes. Escribe abajo para hablar con ${name}.`} />}
        {turns.map((t) => (
          <div
            key={t.id}
            className={cn(
              "max-w-[88%] rounded-2xl border px-3 py-2 text-[12.5px] leading-relaxed",
              t.role === "user"
                ? "ml-auto rounded-tr-sm border-white/10 bg-white/[0.06] text-white/90"
                : "mr-auto rounded-tl-sm border-cyan-400/20 bg-cyan-500/[0.05] text-white/90",
            )}
          >
            <MessageRenderer text={t.text} compact={t.role === "user"} personalityId={personaMeta?.id} />
            {t.notice && (
              <p className="mt-1.5 flex items-start gap-1 border-t border-amber-400/20 pt-1.5 text-[10px] leading-snug text-amber-200/85">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /> {t.notice}
              </p>
            )}
          </div>
        ))}
        {busy && (
          <div className="mr-auto max-w-[88%] rounded-2xl rounded-tl-sm border border-cyan-400/20 bg-cyan-500/[0.05] px-3 py-2 text-[12.5px] text-white/90">
            {streamText ? (
              <MessageRenderer text={streamText} compact />
            ) : (
              <p className="flex items-center gap-1.5 text-white/55">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Pensando…
              </p>
            )}
          </div>
        )}
      </div>

      {error && <Empty error={error} />}

      <div className="flex items-center gap-1.5">
        <input
          className={cn(INPUT, "flex-1")}
          placeholder={`Habla con ${name}…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          disabled={busy}
          aria-label={`Mensaje para ${name}`}
        />
        {busy ? (
          <button type="button" className={BTN} onClick={stop} aria-label="Detener la respuesta">
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className={BTN_PRIMARY} onClick={() => void send(input)} disabled={!input.trim()} aria-label="Enviar mensaje">
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

export default LiveTalk;
