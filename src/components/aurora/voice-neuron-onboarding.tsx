"use client";

/**
 * VENTANA DE VOZ POR NEURONA (Adenda 82 · petición de Alex).
 *
 * Al entrar a la cuenta desde CUALQUIER neurona (dispositivo), el OS comprueba
 * si esta neurona ya eligió su modo de voz (nube gratis u motor local). Si no,
 * abre SOLA una ventana — una vez, con inteligencia:
 *
 *   · Si detecta el daemon local vivo (127.0.0.1:4444) → marca "local" en
 *     silencio y NO molesta (ya está configurado de facto).
 *   · Si no hay elección → ventana con las dos opciones + "más tarde"
 *     (reaparece pasadas 24 h, nunca antes).
 *   · La elección es POR DISPOSITIVO (localStorage, no viaja con la cuenta:
 *     cada neurona tiene su hardware).
 *
 * La voz FUNCIONA desde el primer segundo igualmente (OpenVoice por la nube
 * gratis de HF): esta ventana solo informa y ofrece la mejora local.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Cloud, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocalEngineInstaller } from "@/components/settings/aurora/local-engine-installer";
import { safeGet, safeSet } from "@/lib/safe-storage";

// v2 (Adenda 86): el ajuste de preferencia CAMBIÓ (ahora ordena la cadena de
// voz de la neurona), así que la ventana se RELANZA una vez para todos — aun
// para quienes ya habían elegido en v1.
/** Clave localStorage de la elección de voz POR DISPOSITIVO (no viaja con la cuenta). */
export const NEURON_VOICE_LS_KEY = "starseed.voz.neurona.v2";
/** Evento para reabrir la ventana de elección sin recargar la página. */
export const NEURON_VOICE_REOPEN_EVENT = "starseed:voz-neurona-reopen";
const LATER_RETRY_MS = 24 * 60 * 60_000;
const DAEMON_STATUS = "http://127.0.0.1:4444/status";

export type NeuronVoiceMode = "cloud" | "local" | "later";

export interface NeuronVoiceChoice {
  mode: NeuronVoiceMode;
  at: number;
}

/** Lee la elección de voz de ESTA neurona (o null si aún no eligió). Nunca lanza. */
export function readNeuronVoiceChoice(): NeuronVoiceChoice | null {
  try {
    const raw = safeGet(NEURON_VOICE_LS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as NeuronVoiceChoice;
    return j && (j.mode === "cloud" || j.mode === "local" || j.mode === "later") ? j : null;
  } catch {
    return null;
  }
}

/** Persiste la elección de voz de esta neurona (+ notifica a la UI). Nunca lanza. */
export function writeNeuronVoiceChoice(mode: NeuronVoiceMode): void {
  try {
    safeSet(NEURON_VOICE_LS_KEY, JSON.stringify({ mode, at: Date.now() } satisfies NeuronVoiceChoice));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(NEURON_VOICE_REOPEN_EVENT, { detail: { silent: true } }));
    }
  } catch {
    /* */
  }
}

/**
 * Reabre la ventana de elección de voz de la neurona: borra la elección y avisa a
 * la ventana global (montada en el layout) para que vuelva a preguntar SIN recargar
 * la página. Si por algún motivo no hay ventana montada, la próxima navegación la
 * mostrará igualmente. Nunca lanza.
 */
export function forceReopenNeuronVoiceWindow(): void {
  try {
    safeSet(NEURON_VOICE_LS_KEY, "");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(NEURON_VOICE_REOPEN_EVENT, { detail: { reopen: true } }));
    }
  } catch {
    /* */
  }
}

/** ¿Está el daemon local vivo y listo? Sonda corta; nunca lanza. */
export async function probeLocalDaemon(): Promise<boolean> {
  try {
    const r = await fetch(DAEMON_STATUS, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return false;
    const j = (await r.json()) as { ready?: boolean };
    return j?.ready === true;
  } catch {
    return false;
  }
}

export function VoiceNeuronOnboarding() {
  const [open, setOpen] = useState(false);
  const [localVivo, setLocalVivo] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState("");

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const choice = readNeuronVoiceChoice();
      if (choice && choice.mode !== "later") return; // ya elegido EN V2: no molestar
      if (choice?.mode === "later" && Date.now() - choice.at < LATER_RETRY_MS) return;
      // Reoferta v2: la ventana se muestra UNA vez aunque hubiera elección v1
      // (el ajuste ahora decide el ORDEN de la cadena). Si el daemon vive, la
      // opción local sale preseleccionada como recomendada — pero se pregunta.
      const local = await probeLocalDaemon();
      if (!alive) return;
      setLocalVivo(local);
      setOpen(true);
    }, 3500); // deja que la app respire antes de saludar
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  // Reapertura a demanda (desde los Ajustes: «cambiar la voz de esta neurona»).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onReopen = (e: Event) => {
      const detail = (e as CustomEvent<{ reopen?: boolean }>).detail;
      if (!detail?.reopen) return; // los avisos "silent" (guardado inline) no abren
      void probeLocalDaemon().then((local) => {
        setLocalVivo(local);
        setInstalling(false);
        setCheckMsg("");
        setOpen(true);
      });
    };
    window.addEventListener(NEURON_VOICE_REOPEN_EVENT, onReopen as EventListener);
    return () => window.removeEventListener(NEURON_VOICE_REOPEN_EVENT, onReopen as EventListener);
  }, []);

  if (!open || typeof document === "undefined") return null;

  const choose = (mode: NeuronVoiceMode) => {
    writeNeuronVoiceChoice(mode);
    setOpen(false);
  };

  const verifyInstall = async () => {
    setChecking(true);
    setCheckMsg("Buscando el motor local en 127.0.0.1:4444…");
    const ok = await probeLocalDaemon();
    setChecking(false);
    if (ok) {
      setCheckMsg("¡Motor local detectado y listo! Esta neurona hablará en local.");
      setTimeout(() => choose("local"), 1200);
    } else {
      setCheckMsg(
        "Aún no lo encuentro. Si acabas de instalarlo, dale unos segundos (o revisa la Terminal) y vuelve a comprobar.",
      );
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Voz de Astraura en esta neurona"
    >
      {/* Velo */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
        onClick={() => choose("later")}
        aria-hidden
      />
      {/* Ventana Crystal */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/12 bg-[#0b0f1c]/95 shadow-[0_20px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(80%_100%_at_50%_0%,rgba(0,127,255,0.22),transparent_70%)]"
        />
        <button
          type="button"
          onClick={() => choose("later")}
          aria-label="Cerrar (recordar más tarde)"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10">
              <Zap className="h-4.5 w-4.5 text-sky-300" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white/95">
                Voz de Astraura en esta neurona
              </h2>
              <p className="text-[11px] text-white/50">
                Primera vez en este dispositivo · elige cómo quieres que suene
              </p>
            </div>
          </div>

          <p className="text-[12px] leading-relaxed text-white/70">
            Elige cómo prefiere hablar esta neurona — tu elección ORDENA su cadena de voz
            (la otra vía queda siempre de respaldo): con OpenVoice por la{" "}
            <span className="text-sky-200">nube gratuita de Hugging Face</span> (sin instalar
            nada) o con el <span className="text-emerald-200">motor local</span> instalado en
            este equipo (privado y sin internet).
            {localVivo && (
              <span className="mt-1 block text-emerald-200/90">
                ⚡ Motor local detectado y vivo en este equipo — recomendado.
              </span>
            )}
          </p>

          {!installing ? (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                className="h-10 w-full cursor-pointer justify-start gap-2 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25"
                variant="secondary"
                onClick={() => choose("cloud")}
              >
                <Cloud className="h-4 w-4 text-sky-300" />
                <span className="min-w-0 truncate text-[12.5px]">
                  Seguir con la nube gratis (recomendado para empezar)
                </span>
              </Button>
              <Button
                type="button"
                className="h-10 w-full cursor-pointer justify-start gap-2 bg-emerald-500/12 text-emerald-100 hover:bg-emerald-500/22"
                variant="secondary"
                onClick={() => (localVivo ? choose("local") : setInstalling(true))}
              >
                <Zap className="h-4 w-4 text-emerald-300" />
                <span className="min-w-0 truncate text-[12.5px]">
                  {localVivo
                    ? "Usar el motor LOCAL de este equipo (ya instalado) — recomendado"
                    : "Instalar el motor local en este equipo (rápido y privado)"}
                </span>
              </Button>
              <button
                type="button"
                onClick={() => choose("later")}
                className="cursor-pointer self-center pt-0.5 text-[11px] text-white/40 underline-offset-2 transition-colors hover:text-white/65 hover:underline"
              >
                Recordármelo más tarde
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <LocalEngineInstaller />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 cursor-pointer text-[11px]"
                  disabled={checking}
                  onClick={() => void verifyInstall()}
                >
                  {checking ? "Comprobando…" : "Ya lo instalé — comprobar"}
                </Button>
                <button
                  type="button"
                  onClick={() => choose("cloud")}
                  className="cursor-pointer text-[11px] text-white/40 underline-offset-2 hover:text-white/65 hover:underline"
                >
                  Mejor sigo con la nube
                </button>
              </div>
              {checkMsg && <p className="text-[11px] text-white/55">{checkMsg}</p>}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default VoiceNeuronOnboarding;
