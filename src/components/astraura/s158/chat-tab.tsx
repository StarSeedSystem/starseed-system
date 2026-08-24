"use client";

/**
 * STUDIO 1.58 · Chat Multiagéntico & Voz (Ola 4 · Adenda 156) — CONTROL de
 * cómo hablan las personalidades 1.58 en los chats del OS. NO es un chat
 * duplicado: el chat de verdad vive en Aurora/Exocórtex/orbe (message-renderer
 * + el router de `astraura-158.ts`); esta pestaña decide QUIÉN habla y
 * enseña, en vivo, cómo se leerían las menciones `@persona`.
 * ----------------------------------------------------------------------------
 * Arquitectura: `architecture/astraura-158-ola4-runtime-y-pestanas.md` §3.
 *
 * Reutiliza SIN reimplementar: `ASTRAURA_158_PERSONAS`/`detectMentions158`
 * (`@/ai/providers/astraura-158`, motor de menciones real), el sistema
 * primario (`@/lib/astraura/primary-system`, mismo mecanismo que
 * `<PrimaryChoiceEditor>`) y `personality158ProfileId` de la siembra
 * (`astraura-158-import.ts`) para saber si `p158-<id>` existe de verdad.
 * Todo cliente: la prueba de menciones NO toca red. Defensivo y SSR-safe.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AtSign, Compass, ExternalLink, MessagesSquare, Mic, Orbit, RefreshCw, Sparkles, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchAstraura158VoiceDaemon, type Astraura158VoiceMasterKey } from "@/lib/astraura/astraura-158-client";
import {
  ASTRAURA_158_MODEL_PREFIX, ASTRAURA_158_PERSONAS, detectMentions158,
  type Astraura158MultiMode, type Astraura158Persona,
} from "@/ai/providers/astraura-158";
import { PERSONALITY_CHANGED_EVENT, listPersonalityProfiles } from "@/lib/aurora/personalities";
import { personality158ProfileId } from "@/lib/astraura/astraura-158-import";
import { getPrimaryChoice, setPrimaryChoice, subscribePrimarySystem } from "@/lib/astraura/primary-system";
import { AURORA_EXOCORTEX_OPEN_EVENT } from "@/lib/aurora/aurora-orb-bus";
import {
  BTN, Badge, CARD, Empty, LABEL, MONO, SUB, SectionTitle, TEXTAREA, useS158Load, type S158TabProps,
} from "./shared";

/* ── Tabla de personalidades ───────────────────────────────────────────── */

function PersonaRow({ persona, seeded, pinned }: { persona: Astraura158Persona; seeded: boolean; pinned: boolean }) {
  // (nombrada `pinToChat`, no `use`: ese nombre choca visualmente con el hook `use()` de React.)
  function pinToChat() {
    const profileId = personality158ProfileId(persona.id);
    try {
      setPrimaryChoice("personalidad", profileId, { modo: "astraura-158", modelo: `${ASTRAURA_158_MODEL_PREFIX}${persona.id}` });
      toast.success(`«${persona.label}» fijada para el chat`, { description: "Se activará cuando esa personalidad esté activa en el OS (o al elegirla en cualquier selector de personalidad)." });
    } catch {
      toast.error("No se pudo fijar la personalidad.");
    }
  }

  return (
    <tr className="border-t border-white/10">
      <td className="px-2 py-1.5">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: persona.color, boxShadow: `0 0 6px ${persona.color}` }} aria-hidden="true" />
          <span className="text-[11px] font-medium text-white/90">{persona.label}</span>
        </span>
      </td>
      <td className="px-2 py-1.5 text-[10px] leading-snug text-white/60">{persona.organ}</td>
      <td className="px-2 py-1.5">
        {seeded
          ? <Badge tone="border-emerald-400/40 bg-emerald-500/15 text-emerald-100">sembrada</Badge>
          : <Badge tone="border-white/15 bg-white/[0.04] text-white/55">sin sembrar</Badge>}
      </td>
      <td className="px-2 py-1.5">
        {pinned ? <Badge tone="border-cyan-400/40 bg-cyan-500/15 text-cyan-100">primaria del chat</Badge> : <span className={MONO}>—</span>}
      </td>
      <td className="px-2 py-1.5">
        <button
          type="button"
          className={cn(BTN, "px-1.5 py-0.5 text-[10px]")}
          disabled={!seeded}
          title={seeded ? undefined : "Siémbrala primero desde Biblioteca StarSeed."}
          aria-label={`Usar ${persona.label} en el chat`}
          onClick={pinToChat}
        >
          <Sparkles className="h-3 w-3" aria-hidden="true" /> Usar en el chat
        </button>
      </td>
    </tr>
  );
}

/* ── Prueba de menciones ───────────────────────────────────────────────── */

const MODE_LABEL: Record<Astraura158MultiMode, string> = {
  single: "Individual (0 o 1 mención)",
  multi_dialogue: "Diálogo multiagente (≥2 personalidades)",
  coral_synthesis: "Síntesis coral (la palabra «coral»)",
};

const MODE_TONE: Record<Astraura158MultiMode, string> = {
  single: "border-white/15 bg-white/[0.04] text-white/70",
  multi_dialogue: "border-violet-400/40 bg-violet-500/15 text-violet-100",
  coral_synthesis: "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-100",
};

/* ── Voz (solo lectura) ────────────────────────────────────────────────── */

const VOICE_MASTER: { key: Astraura158VoiceMasterKey; label: string }[] = [
  { key: "master_voice_enabled", label: "voz autónoma" },
  { key: "master_ambient_listening_enabled", label: "escucha ambiental" },
  { key: "master_affective_learning_enabled", label: "aprendizaje afectivo" },
  { key: "master_device_sensory_link", label: "enlace sensorial" },
];

export function ChatTab({ target }: S158TabProps) {
  const [tick, setTick] = useState(0);
  const [text, setText] = useState("");
  const voice = useS158Load(fetchAstraura158VoiceDaemon, target, 20_000);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const unsubPrimary = subscribePrimarySystem(bump);
    window.addEventListener(PERSONALITY_CHANGED_EVENT, bump);
    return () => {
      try { unsubPrimary(); } catch { /* */ }
      window.removeEventListener(PERSONALITY_CHANGED_EVENT, bump);
    };
  }, []);

  const seededIds = useMemo(() => {
    try { return new Set(listPersonalityProfiles().map((p) => p.id)); } catch { return new Set<string>(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const seededCount = useMemo(
    () => ASTRAURA_158_PERSONAS.filter((p) => seededIds.has(personality158ProfileId(p.id))).length,
    [seededIds],
  );

  const mentions = useMemo(() => {
    try { return detectMentions158(text); } catch { return { personas: [] as string[], mode: "single" as Astraura158MultiMode }; }
  }, [text]);

  function openOrb() {
    try { window.dispatchEvent(new CustomEvent(AURORA_EXOCORTEX_OPEN_EVENT)); } catch { /* defensivo */ }
  }

  const d = voice.data;
  const sw = d?.master_switches ?? {};

  return (
    <div className="space-y-3">
      <div className={cn(CARD, "p-3")}>
        <SectionTitle
          icon={Users}
          title={`Personalidades 1.58 (${ASTRAURA_158_PERSONAS.length})`}
          tone="text-cyan-300"
          hint={`Órgano cognitivo, si ya viven en el OS (perfil «p158-<id>») y cuál queda fijada como primaria del chat. ${seededCount} de ${ASTRAURA_158_PERSONAS.length} sembradas.`}
          right={<Link href="/agent?tab=astraura-158&sub=biblioteca" className={BTN} aria-label="Sembrar personalidades desde Biblioteca StarSeed"><ExternalLink className="h-3 w-3" aria-hidden="true" /> Biblioteca</Link>}
        />
        <div className="-mx-1 mt-2 overflow-x-auto px-1">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th scope="col" className={cn(LABEL, "px-2 py-1.5")}>Personalidad</th>
                <th scope="col" className={cn(LABEL, "px-2 py-1.5")}>Órgano</th>
                <th scope="col" className={cn(LABEL, "px-2 py-1.5")}>Sembrada</th>
                <th scope="col" className={cn(LABEL, "px-2 py-1.5")}>Chat</th>
                <th scope="col" className={cn(LABEL, "px-2 py-1.5")}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {ASTRAURA_158_PERSONAS.map((p) => {
                const profileId = personality158ProfileId(p.id);
                const seeded = seededIds.has(profileId);
                const cur = getPrimaryChoice("personalidad", profileId);
                const pinned = !!cur && cur.modo === "astraura-158" && cur.modelo === `${ASTRAURA_158_MODEL_PREFIX}${p.id}`;
                return <PersonaRow key={p.id} persona={p} seeded={seeded} pinned={pinned} />;
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className={cn(CARD, "p-3")}>
        <SectionTitle
          icon={AtSign}
          title="Probar menciones"
          tone="text-violet-300"
          hint="Escribe un mensaje con @Personalidad (o la palabra «coral») y mira, al instante, qué detectaría el motor real de menciones — 100% en tu navegador, sin red."
        />
        <textarea
          className={cn(TEXTAREA, "mt-2")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="p. ej. «@Hermes y @Logos, revisad esto juntos» o «una síntesis coral de todas»…"
          aria-label="Texto de prueba para detectar menciones de personalidades 1.58"
        />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={LABEL}>modo detectado</span>
          <Badge tone={MODE_TONE[mentions.mode]}>{MODE_LABEL[mentions.mode]}</Badge>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {mentions.personas.length === 0 && <p className="text-[10px] text-white/50">Ninguna personalidad mencionada todavía.</p>}
          {mentions.personas.map((id) => {
            const p = ASTRAURA_158_PERSONAS.find((x) => x.id === id);
            return (
              <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/80">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: p?.color ?? "#fff" }} aria-hidden="true" /> {p?.label ?? id}
              </span>
            );
          })}
        </div>
      </div>

      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Compass} title="Enlaces" tone="text-emerald-300" hint="El chat de verdad vive en estas superficies del OS; esta pestaña solo controla cómo hablan las personalidades dentro de ellas." />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Link href="/agent" className={BTN} aria-label="Abrir el Exocórtex"><ExternalLink className="h-3 w-3" aria-hidden="true" /> Exocórtex</Link>
          <Link href="/aurora" className={BTN} aria-label="Abrir el chat de Aurora"><MessagesSquare className="h-3 w-3" aria-hidden="true" /> Chat de Aurora</Link>
          <button type="button" className={BTN} aria-label="Abrir la orbe de Aurora (Exocórtex flotante)" onClick={openOrb}>
            <Orbit className="h-3 w-3" aria-hidden="true" /> Abrir la orbe
          </button>
        </div>
      </div>

      <div className={cn(CARD, "p-3")}>
        <SectionTitle
          icon={Mic}
          title="Estado de voz (solo lectura)"
          tone="text-rose-300"
          hint="Interruptores maestros del daemon de voz continua del backend. Para cambiarlos de verdad, ve a Voz."
          right={(
            <>
              <button type="button" className={BTN} onClick={() => { void voice.reload(); }} aria-label="Recargar estado de voz"><RefreshCw className={cn("h-3 w-3", voice.loading && "animate-spin")} aria-hidden="true" /></button>
              <Link href="/agent?tab=astraura-158&sub=voz" className={BTN} aria-label="Abrir Voz"><ExternalLink className="h-3 w-3" aria-hidden="true" /> Voz</Link>
            </>
          )}
        />
        {!d && <Empty loading={voice.loading} error={voice.error} text="Sin daemon de voz." />}
        {d && (
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {VOICE_MASTER.map((m) => (
              <div key={m.key} className={cn(SUB, "flex items-center justify-between gap-2 px-3 py-1.5")}>
                <span className="text-[11px] text-white/80">{m.label}</span>
                <Badge tone={sw[m.key] ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" : "border-white/15 bg-white/[0.04] text-white/60"}>
                  {sw[m.key] ? "activada" : "desactivada"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatTab;
