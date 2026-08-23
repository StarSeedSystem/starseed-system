"use client";

/**
 * STUDIO 1.58 · Voz — el daemon de voz continua del backend (interruptores
 * maestros, estado de presencia y afecto por personalidad, percepciones) y
 * los perfiles procedurales de VoiceStudio. OmniVoice sigue siendo EL sistema
 * de voz del OS (A149/112): aquí se gobierna lo que el backend 1.58 hace solo
 * (escucha ambiental, aprendizaje afectivo, enlace sensorial) y se consultan
 * sus perfiles para correlacionarlos con las voces de OmniVoice.
 */

import { useCallback } from "react";
import { AudioLines, Ear, Mic, RefreshCw, Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  fetchAstraura158VoiceDaemon, fetchAstraura158VoiceProfiles, toggleAstraura158VoiceMaster, toggleAstraura158VoicePersonality, type Astraura158VoiceMasterKey,
} from "@/lib/astraura/astraura-158-client";
import { ASTRAURA_158_PERSONAS } from "@/ai/providers/astraura-158";
import { BTN, Badge, Bar, CARD, Empty, MONO, SUB, SectionTitle, Stat, fmtAgo, levelTone, runS158, useBusy, useS158Load, type S158TabProps } from "./shared";

const MASTER: { key: Astraura158VoiceMasterKey; label: string; hint: string }[] = [
  { key: "master_voice_enabled", label: "voz autónoma", hint: "Las personalidades pueden hablar por iniciativa propia." },
  { key: "master_ambient_listening_enabled", label: "escucha ambiental", hint: "Percibe el entorno sonoro (solo en la máquina del backend)." },
  { key: "master_affective_learning_enabled", label: "aprendizaje afectivo", hint: "Evoluciona el carácter de cada voz con la interacción." },
  { key: "master_device_sensory_link", label: "enlace sensorial", hint: "Une el daemon con el sensorium del dispositivo." },
];

export function VozTab({ target, manifest }: S158TabProps) {
  const daemon = useS158Load(fetchAstraura158VoiceDaemon, target, 20_000);
  const profiles = useS158Load(fetchAstraura158VoiceProfiles, target);
  const { busy, wrap } = useBusy();
  const reload = useCallback(async () => { await daemon.reload(true); }, [daemon]);

  const d = daemon.data;
  const sw = d?.master_switches ?? {};
  const states = d?.personality_states ?? {};
  const personas = manifest?.personalities.length ? manifest.personalities : ASTRAURA_158_PERSONAS.map((p) => ({ id: p.id, name: p.label, color: p.color }));
  const plist = profiles.data?.profiles ?? [];

  return (
    <div className="space-y-3">
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Mic} title="Daemon de voz continua" tone="text-rose-300" hint="Interruptores maestros del backend. La voz que oyes en el OS la pone OmniVoice; esto gobierna la escucha y la iniciativa del backend."
          right={<button type="button" className={BTN} onClick={() => { void daemon.reload(); }} aria-label="Recargar daemon de voz"><RefreshCw className={cn("h-3 w-3", daemon.loading && "animate-spin")} aria-hidden="true" /></button>} />
        {!d && <Empty loading={daemon.loading} error={daemon.error} text="Sin daemon de voz." />}
        {d && (
          <>
            <div className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {MASTER.map((m) => (
                <label key={m.key} className="flex items-center gap-2 text-[11px] text-white/80" title={m.hint}>
                  <Switch checked={!!sw[m.key]} disabled={busy !== ""} aria-label={m.label}
                    onCheckedChange={(v) => { void wrap(`m:${m.key}`, () => runS158(`${m.label}: ${v ? "activada" : "desactivada"}`, () => toggleAstraura158VoiceMaster(target, m.key, v), { after: reload })); }} />
                  {m.label}
                </label>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Stat label="Escuchando" value={d.active_listening_personalities_count ?? 0} hint="personalidades en escucha" />
              <Stat label="Hora del daemon" value={d.system_time ?? "—"} hint={`${(d.recent_perceptions ?? []).length} percepciones recientes`} />
            </div>
          </>
        )}
      </div>

      {d && (
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={Ear} title="Presencia por personalidad" tone="text-fuchsia-300" hint="Quién puede hablar sola y quién participa en diálogos multiagente; afecto y evolución del carácter en vivo." />
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {personas.map((p) => {
              const st = states[p.id] ?? {};
              return (
                <div key={p.id} className={cn(SUB, "flex flex-col gap-1 px-3 py-2")}>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color ?? "#f43f5e", boxShadow: `0 0 8px ${p.color ?? "#f43f5e"}` }} aria-hidden="true" />
                    <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{p.name}</p>
                    {st.presence_state && <Badge tone={levelTone(st.presence_state)}>{st.presence_state}</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[10px] text-white/70"><Switch checked={!!st.voice_autonomous_enabled} disabled={busy !== ""} aria-label={`Voz autónoma de ${p.name}`} onCheckedChange={(v) => { void wrap(`v:${p.id}`, () => runS158(`${p.name}: voz ${v ? "activada" : "desactivada"}`, () => toggleAstraura158VoicePersonality(target, p.id, { voice_enabled: v }), { after: reload })); }} /> habla sola</label>
                    <label className="flex items-center gap-1.5 text-[10px] text-white/70"><Switch checked={!!st.multiagent_enabled} disabled={busy !== ""} aria-label={`Multiagente de ${p.name}`} onCheckedChange={(v) => { void wrap(`ma:${p.id}`, () => runS158(`${p.name}: multiagente ${v ? "activado" : "desactivado"}`, () => toggleAstraura158VoicePersonality(target, p.id, { multiagent_enabled: v }), { after: reload })); }} /> multiagente</label>
                  </div>
                  {typeof st.character_evolution_score === "number" && <Bar value={Math.min(100, st.character_evolution_score * (st.character_evolution_score <= 1 ? 100 : 1))} tone="bg-fuchsia-400/70" />}
                  <p className={MONO}>{st.current_affect ? `afecto ${st.current_affect}` : "sin afecto"}{st.cognitive_organ ? ` · ${st.cognitive_organ}` : ""}{st.last_active_timestamp ? ` · ${fmtAgo(st.last_active_timestamp)}` : ""}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={AudioLines} title={`Perfiles de VoiceStudio (${profiles.data?.total ?? plist.length})`} tone="text-cyan-300" hint="Voces procedurales del backend (timbre, calidez, claridad, emoción). Para oírlas en el OS, asigna la voz equivalente en OmniVoice." />
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {plist.length === 0 && <Empty loading={profiles.loading} error={profiles.error} text="Sin perfiles de voz." />}
          {plist.map((v) => (
            <div key={v.id} className={cn(SUB, "flex flex-col gap-1 px-3 py-2")}>
              <div className="flex items-center gap-2">
                <Waves className="h-3.5 w-3.5 shrink-0 text-cyan-300/80" aria-hidden="true" />
                <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{v.name ?? v.id}</p>
                {v.is_factory && <Badge tone="border-white/10 text-white/55">fábrica</Badge>}
                {v.persona_id && <Badge tone="border-fuchsia-400/25 text-fuchsia-100/90">{v.persona_id}</Badge>}
              </div>
              <p className={MONO}>{[v.gender, v.age_group, v.accent, v.language].filter(Boolean).join(" · ")}{v.pitch_base_hz ? ` · ${Math.round(v.pitch_base_hz)} Hz` : ""}{v.emotion ? ` · ${v.emotion}` : ""}</p>
              <div className="grid grid-cols-3 gap-1">
                {([["calidez", v.warmth], ["claridad", v.clarity], ["aire", v.breathiness]] as const).map(([k, val]) => (
                  <div key={k}><p className={MONO}>{k}</p><Bar value={typeof val === "number" ? (val <= 1 ? val * 100 : val) : null} /></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default VozTab;
