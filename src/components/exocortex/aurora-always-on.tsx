"use client";

/**
 * StarSeed OS — Exocórtex · "Aurora siempre encendida" (wake-word)
 * ----------------------------------------------------------------------------
 * Switch + cableado del modo pasivo de escucha por palabra clave. Cuando el
 * usuario lo activa:
 *
 *   · Mantiene la escucha viva en SEGUNDO PLANO por el flujo SUPERVISADO del
 *     provider (useAurora().start(), con backoff + watchdog anti-loop). Nunca
 *     instancia otra Aurora ni toca el provider/engine.
 *   · En modo PASIVO Aurora NO responde a todo: sólo despierta al oír "aurora".
 *     Al despertar, envía a send() el resto de la frase (el comando limpio) y
 *     confirma con un breve speak(); tras ~6s de silencio vuelve al fondo.
 *   · Explicación HONESTA: requiere permiso de micrófono y un navegador con
 *     reconocimiento de voz. Si no hay soporte, degrada a manual (chat por texto
 *     + botón de activar voz) y el switch lo advierte.
 *
 * Se monta dentro de la sección Aurora del Exocórtex (aurora-chat-section.tsx).
 * DEFENSIVO: si el contexto del provider faltara, no rompe nada (queda inerte).
 *
 * ESTILO: cristal líquido con los colores del orbe (azul/verde/amarillo/rojo),
 * adaptativo, reduced-motion (hereda las clases .axc-* de la sección).
 */

import { useCallback, useEffect, useRef } from "react";
import { Ear, Mic, MicOff, Radio, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAurora } from "@/components/aurora/aurora-provider";
import { useAlwaysOn, useWakeWord } from "@/lib/aurora/wake-word";

// ── Estilos locales (prefijo .axo-, complementan a .axc-* de la sección) ─────
const AXO_CSS = `
.axo-card{position:relative;border-radius:18px;border:1px solid rgba(148,163,184,.14);
  background:linear-gradient(180deg, rgba(57,255,20,.05), rgba(15,23,42,.4));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05);overflow:hidden;}
.axo-card::before{content:"";position:absolute;inset:0 0 auto 0;height:2px;pointer-events:none;
  background:linear-gradient(90deg, transparent, #39FF14 30%, #FFBF00 60%, transparent);opacity:.5;}
.axo-card[data-on="true"]{border-color:rgba(57,255,20,.3);
  background:linear-gradient(180deg, rgba(57,255,20,.09), rgba(15,23,42,.45));}
.axo-ico{width:32px;height:32px;border-radius:11px;flex:none;display:grid;place-items:center;
  border:1px solid rgba(57,255,20,.28);background:rgba(57,255,20,.1);color:#c9f9d3;}
.axo-card[data-on="false"] .axo-ico{border-color:rgba(148,163,184,.2);background:rgba(148,163,184,.06);color:rgba(226,232,240,.5);}
.axo-state{display:inline-flex;align-items:center;gap:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:9px;letter-spacing:.14em;text-transform:uppercase;padding:4px 9px;border-radius:999px;}
.axo-state.awake{color:#fef3c7;border:1px solid rgba(255,191,0,.4);background:rgba(255,191,0,.12);}
.axo-state.passive{color:#c9f9d3;border:1px solid rgba(57,255,20,.28);background:rgba(57,255,20,.08);}
.axo-state.idle{color:rgba(226,232,240,.45);border:1px solid rgba(148,163,184,.2);background:rgba(148,163,184,.06);}
.axo-state .d{width:6px;height:6px;border-radius:50%;}
.axo-state.awake .d{background:#FFBF00;box-shadow:0 0 8px rgba(255,191,0,.8);animation:axo-pulse 1.4s ease-in-out infinite;}
.axo-state.passive .d{background:#39FF14;box-shadow:0 0 8px rgba(57,255,20,.7);animation:axo-pulse 2.6s ease-in-out infinite;}
.axo-state.idle .d{background:rgba(226,232,240,.3);}
@keyframes axo-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion: reduce){ .axo-state .d{animation:none !important;} }
`;

/**
 * Componente cliente montado en la sección Aurora. Renderiza el switch + la
 * explicación y, cuando está activo, mantiene el cableado del wake-word con el
 * motor supervisado (useAurora). No devuelve UI de chat: sólo el control.
 */
export function AuroraAlwaysOn({ className }: { className?: string }) {
  const aurora = useAurora();
  const [alwaysOn, setAlwaysOnState] = useAlwaysOn();

  const supported = aurora?.supported ?? false;
  const enabled = aurora?.enabled ?? false;
  const listening = aurora?.listening ?? false;
  const voiceUnavailable = aurora?.voiceUnavailable ?? false;
  const transcript = aurora?.transcript ?? "";
  const interim = aurora?.interim ?? "";
  const auroraName = aurora?.activePersonality?.name || "Aurora";

  // El modo sólo opera de verdad si Aurora está encendida, soportada y con voz.
  const active = alwaysOn && enabled && supported && !voiceUnavailable;

  // Refs a acciones del motor para callbacks estables del hook.
  const auroraRef = useRef(aurora);
  auroraRef.current = aurora;

  const onWake = useCallback((command: string) => {
    const a = auroraRef.current;
    if (!a) return;
    const cmd = (command || "").trim();
    if (cmd) {
      // Comando dado junto al nombre: ejecútalo ya (genera/continúa el contexto).
      try { void a.send(cmd); } catch { /* defensivo */ }
    } else {
      // Sólo la nombraron: confirma que está a la escucha activa.
      try { a.speak("¿Sí? Te escucho."); } catch { /* defensivo */ }
    }
  }, []);

  const onSpeech = useCallback((command: string) => {
    const a = auroraRef.current;
    if (!a) return;
    const cmd = (command || "").trim();
    if (cmd) { try { void a.send(cmd); } catch { /* defensivo */ } }
  }, []);

  useWakeWord({
    enabled: active,
    transcript,
    interim,
    onWake,
    onSpeech,
  });

  // Supervisor de escucha de fondo: mientras el modo esté activo, garantiza que
  // el reconocimiento esté vivo (por el start() SUPERVISADO del provider, con
  // backoff/watchdog). Si el usuario apaga el modo, NO detenemos la escucha por
  // si la autonomía la mantenía; sólo dejamos de despertar por palabra clave.
  const wantBgRef = useRef(false);
  useEffect(() => {
    const a = auroraRef.current;
    if (!a) return;
    if (active && !listening) {
      wantBgRef.current = true;
      try { a.start(); } catch { /* defensivo: el supervisor gestiona el resto */ }
    }
    // Si el modo se apaga, no forzamos stop (respeta la autonomía global).
    if (!active) wantBgRef.current = false;
  }, [active, listening]);

  // Reintento suave: si la escucha cae mientras el modo sigue activo, el efecto
  // anterior la vuelve a arrancar en el próximo render (listening pasa a false).

  const stateLabel = !active
    ? "En reposo"
    : listening
      ? "Escuchando · di «Aurora»"
      : "Reactivando escucha…";

  const stateClass = !active ? "idle" : listening ? "passive" : "passive";

  return (
    <div className={cn("axo-card", className)} data-on={active ? "true" : "false"}>
      <style>{AXO_CSS}</style>

      <div className="flex items-start gap-3 px-3.5 py-3">
        <div className="axo-ico">
          {active ? <Radio className="h-4 w-4" /> : <Ear className="h-4 w-4" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white/90">
              Aurora siempre encendida
            </span>
            <span className={cn("axo-state", stateClass)}>
              <span className="d" /> {stateLabel}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-white/50">
            Di <span className="font-medium text-[#c9f9d3]">«Aurora»</span> para hablar.
            Mantiene la escucha en segundo plano en modo pasivo: no responde a todo,
            sólo cuando la nombras. Al terminar de hablar, vuelve al fondo.
          </p>
        </div>

        <button
          role="switch"
          aria-checked={alwaysOn}
          onClick={() => setAlwaysOnState(!alwaysOn)}
          className="axc-switch mt-0.5"
          title={alwaysOn
            ? "Desactivar el modo siempre encendida"
            : "Activar el modo siempre encendida (di «Aurora» para hablar)"}
        >
          <span className="knob" />
        </button>
      </div>

      {/* Explicación honesta de requisitos / degradación */}
      {alwaysOn && (
        <div className="border-t border-white/5 px-3.5 py-2.5">
          {!supported ? (
            <div className="flex items-start gap-2 text-[11px] leading-relaxed text-amber-200/80">
              <MicOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/70" />
              <span>
                Tu navegador no admite reconocimiento de voz, así que el modo manos
                libres no puede activarse aquí. Aún puedes escribir abajo o pulsar
                «Activar voz» para hablar con {auroraName} manualmente.
              </span>
            </div>
          ) : !enabled ? (
            <div className="flex items-start gap-2 text-[11px] leading-relaxed text-white/55">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#7fb8ff]" />
              <span>
                {auroraName} está apagada globalmente. Enciéndela para que el modo
                siempre encendida escuche por ti.
              </span>
            </div>
          ) : voiceUnavailable ? (
            <div className="flex items-start gap-2 text-[11px] leading-relaxed text-rose-200/75">
              <MicOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300/70" />
              <span>
                La voz se pausó tras varias caídas. Usa «Reintentar» arriba para
                recuperar la escucha; el modo se reanudará solo.
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-[11px] leading-relaxed text-white/55">
              <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#39FF14]" />
              <span>
                Requiere permiso de micrófono. En segundo plano sólo se activa al
                oír «Aurora»; el resto del tiempo escucha en modo pasivo sin responder.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AuroraAlwaysOn;
