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

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Ear,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Mic,
  MicOff,
  Radio,
  ShieldCheck,
  Sparkles,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAurora } from "@/components/aurora/aurora-provider";
import { useAlwaysOn, useWakeWord } from "@/lib/aurora/wake-word";
import { useAcousticWake } from "@/lib/aurora/wake-acoustic/use-acoustic-wake";
import {
  PICOVOICE_CONSOLE_URL,
  PICOVOICE_HOME_URL,
} from "@/lib/aurora/wake-acoustic/porcupine-wake";

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

/* ── Sub-panel: wake-word acústico local ─────────────────────────────────── */
.axo-sub{position:relative;border-radius:14px;border:1px solid rgba(127,184,255,.16);
  background:linear-gradient(180deg, rgba(0,127,255,.06), rgba(15,23,42,.35));overflow:hidden;}
.axo-sub[data-on="true"]{border-color:rgba(0,127,255,.32);
  background:linear-gradient(180deg, rgba(0,127,255,.1), rgba(15,23,42,.4));}
.axo-sub[data-wake="true"]{border-color:rgba(255,191,0,.5);
  box-shadow:0 0 0 1px rgba(255,191,0,.28), 0 0 18px rgba(255,191,0,.18);
  transition:box-shadow .5s ease, border-color .5s ease;}
.axo-sub-ico{width:30px;height:30px;border-radius:10px;flex:none;display:grid;place-items:center;
  border:1px solid rgba(127,184,255,.3);background:rgba(0,127,255,.12);color:#bfe0ff;}
.axo-sub[data-on="false"] .axo-sub-ico{border-color:rgba(148,163,184,.2);
  background:rgba(148,163,184,.06);color:rgba(226,232,240,.5);}
.axo-key{width:100%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;
  color:#e2e8f0;background:rgba(2,6,23,.5);border:1px solid rgba(127,184,255,.22);
  border-radius:10px;padding:7px 34px 7px 10px;outline:none;transition:border-color .15s ease;}
.axo-key:focus{border-color:rgba(0,127,255,.55);}
.axo-key::placeholder{color:rgba(148,163,184,.45);}
.axo-keybtn{position:absolute;right:6px;top:50%;transform:translateY(-50%);display:grid;place-items:center;
  width:24px;height:24px;border-radius:7px;color:rgba(191,224,255,.7);cursor:pointer;
  background:transparent;border:0;transition:color .15s ease, background .15s ease;}
.axo-keybtn:hover{color:#bfe0ff;background:rgba(0,127,255,.12);}
.axo-eng{display:inline-flex;align-items:center;gap:5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;padding:3px 8px;border-radius:999px;}
.axo-eng.porcupine{color:#bfe0ff;border:1px solid rgba(0,127,255,.4);background:rgba(0,127,255,.12);}
.axo-eng.energy{color:#e9d5ff;border:1px solid rgba(167,139,250,.4);background:rgba(167,139,250,.12);}
.axo-eng.off{color:rgba(226,232,240,.45);border:1px solid rgba(148,163,184,.2);background:rgba(148,163,184,.06);}
.axo-link{color:#7fb8ff;text-decoration:underline;text-underline-offset:2px;cursor:pointer;
  display:inline-flex;align-items:center;gap:3px;}
.axo-link:hover{color:#bfe0ff;}
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

  // ── Wake-word ACÚSTICO local (open-source, opt-in independiente) ───────────
  // Detecta "Aurora" (o voz sostenida, en el respaldo simple) SIN mantener el
  // STT completo. Al despertar, el detector ya activa la voz de Aurora por el
  // puente global; aquí sólo añadimos una confirmación hablada breve.
  const onAcousticWake = useCallback(() => {
    const a = auroraRef.current;
    if (!a) return;
    try { a.speak("¿Sí? Te escucho."); } catch { /* defensivo */ }
  }, []);

  // Sólo escuchamos acústicamente si Aurora está encendida y soportada (el gate
  // interno del opt-in decide el resto). No exige `alwaysOn`: es una vía aparte.
  const acousticGate = enabled && supported && !voiceUnavailable;
  const acoustic = useAcousticWake({ active: acousticGate, onWake: onAcousticWake });

  // Campo de AccessKey (edición local antes de persistir) + mostrar/ocultar.
  const [keyDraft, setKeyDraft] = useState("");
  const [keyShown, setKeyShown] = useState(false);
  const keyInitRef = useRef(false);
  useEffect(() => {
    // Sincroniza el borrador con el valor persistido la primera vez que llega.
    if (!keyInitRef.current && acoustic.accessKey) {
      setKeyDraft(acoustic.accessKey);
      keyInitRef.current = true;
    }
  }, [acoustic.accessKey]);

  const acousticEngineLabel =
    acoustic.engine === "porcupine"
      ? "Porcupine"
      : acoustic.engine === "energy"
        ? "Detector simple"
        : "En reposo";
  const acousticEngineClass =
    acoustic.engine === "porcupine"
      ? "porcupine"
      : acoustic.engine === "energy"
        ? "energy"
        : "off";
  // Destello reciente al despertar (para el aura del sub-panel).
  const acousticFlashed = acoustic.lastWakeAt > 0 && Date.now() - acoustic.lastWakeAt < 1500;

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

      {/* ── Palabra de activación ACÚSTICA local (open-source, opt-in) ─────── */}
      <div className="border-t border-white/5 px-3.5 py-3">
        <div
          className="axo-sub"
          data-on={acoustic.enabled && acousticGate ? "true" : "false"}
          data-wake={acousticFlashed ? "true" : "false"}
        >
          <div className="flex items-start gap-3 px-3 py-2.5">
            <div className="axo-sub-ico">
              <Waves className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-white/90">
                  Palabra de activación acústica (local)
                </span>
                <span className={cn("axo-eng", acousticEngineClass)}>
                  {acoustic.engine === "porcupine" ? (
                    <ShieldCheck className="h-2.5 w-2.5" />
                  ) : (
                    <Waves className="h-2.5 w-2.5" />
                  )}
                  {acousticEngineLabel}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-white/50">
                Escucha «Aurora» directamente en el audio, en tu dispositivo, sin
                mantener encendido el reconocimiento completo. Más privado y
                eficiente: el audio no sale de aquí.
              </p>
            </div>

            <button
              role="switch"
              aria-checked={acoustic.enabled}
              onClick={() => acoustic.setEnabled(!acoustic.enabled)}
              className="axc-switch mt-0.5"
              disabled={!acoustic.supported}
              title={
                !acoustic.supported
                  ? "Este navegador no admite captura de micrófono para el wake-word acústico"
                  : acoustic.enabled
                    ? "Desactivar la palabra de activación acústica"
                    : "Activar la palabra de activación acústica (local)"
              }
            >
              <span className="knob" />
            </button>
          </div>

          {/* Detalle: clave de Picovoice + estado + honestidad del coste */}
          {acoustic.enabled && (
            <div className="space-y-2.5 border-t border-white/5 px-3 py-2.5">
              {/* Estado en vivo del detector */}
              <div className="flex items-center gap-2 text-[10.5px] text-white/55">
                <span
                  className={cn(
                    "inline-block h-1.5 w-1.5 rounded-full",
                    acoustic.listening
                      ? "bg-[#39FF14] shadow-[0_0_8px_rgba(57,255,20,.7)]"
                      : acoustic.status === "starting"
                        ? "bg-[#FFBF00] shadow-[0_0_8px_rgba(255,191,0,.7)]"
                        : "bg-white/25",
                  )}
                />
                <span className="font-medium">
                  {!acoustic.supported
                    ? "No soportado en este navegador"
                    : !acousticGate
                      ? "Aurora apagada · enciéndela para escuchar"
                      : acoustic.listening
                        ? acoustic.engine === "porcupine"
                          ? "Escuchando la palabra «Aurora»"
                          : "Escuchando (respaldo simple)"
                        : acoustic.status === "starting"
                          ? "Iniciando el detector…"
                          : acoustic.status === "error"
                            ? "No se pudo iniciar"
                            : "En reposo"}
                </span>
              </div>

              {/* Campo opcional de AccessKey de Picovoice (para Porcupine) */}
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-white/45">
                  <KeyRound className="h-3 w-3" />
                  AccessKey de Picovoice (opcional)
                </label>
                <div className="relative">
                  <input
                    type={keyShown ? "text" : "password"}
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    onBlur={() => acoustic.setAccessKey(keyDraft)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        acoustic.setAccessKey(keyDraft);
                      }
                    }}
                    placeholder="Pega tu AccessKey para usar Porcupine (preciso)…"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="axo-key"
                  />
                  <button
                    type="button"
                    className="axo-keybtn"
                    onClick={() => setKeyShown((v) => !v)}
                    title={keyShown ? "Ocultar la clave" : "Mostrar la clave"}
                  >
                    {keyShown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Explicación honesta: motor efectivo + coste/clave + privacidad */}
              <div className="flex items-start gap-2 text-[10.5px] leading-relaxed text-white/50">
                {acoustic.accessKey ? (
                  <>
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#7fb8ff]" />
                    <span>
                      Con AccessKey usa <span className="font-medium text-[#bfe0ff]">Porcupine</span>{" "}
                      (motor open-source por WebAssembly), que reconoce la palabra con
                      precisión y corre 100% local. Porcupine es{" "}
                      <span className="font-medium">gratis para uso personal</span>; saca tu
                      clave en{" "}
                      <a
                        href={PICOVOICE_CONSOLE_URL}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="axo-link"
                      >
                        picovoice.ai <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                      . El SDK se descarga por CDN sólo al activar (no añade dependencias).
                    </span>
                  </>
                ) : (
                  <>
                    <Waves className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#c4b5fd]" />
                    <span>
                      Sin clave usa un{" "}
                      <span className="font-medium text-[#e9d5ff]">detector simple de respaldo</span>{" "}
                      por energía de voz: despierta a Aurora al hablar de forma sostenida
                      (menos preciso, no distingue la palabra exacta) pero sin clave ni
                      descargas. Para reconocer «Aurora» con precisión, pega arriba un
                      AccessKey gratuito de{" "}
                      <a
                        href={PICOVOICE_HOME_URL}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="axo-link"
                      >
                        picovoice.ai <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                      .
                    </span>
                  </>
                )}
              </div>

              {/* Error no fatal del detector (si lo hubo) */}
              {acoustic.error && (
                <div className="flex items-start gap-2 text-[10.5px] leading-relaxed text-amber-200/75">
                  <MicOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/70" />
                  <span>{acoustic.error}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuroraAlwaysOn;
