"use client";

/**
 * SELECTOR DE VOZ DE LA BIENVENIDA (Adenda 194).
 * ----------------------------------------------------------------------------
 * Antes solo había «voz» o «texto», y la voz que salía era la que el navegador
 * rankeara. Ahora se elige de verdad: femenina, masculina o neutra —las tres
 * afinadas para sonar bien sin tocar nada—, con dos accesos opcionales:
 *   · «Ajustes de voz»: abre la ventana de voz de la neurona (motor, idioma,
 *     timbre) para quien quiera afinar a mano.
 *   · «Voz autónoma»: la voz deja de ser un ajuste fijo y se modula sola según
 *     el carácter de cada personalidad y el momento del día.
 * La elección queda vinculada a la personalidad activa de Aurora y se puede
 * cambiar después desde su editor.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, Sliders, Sparkles, Loader2, Play, Square, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getModoVoz, setModoVoz, MODOS_VOZ, hayVozRealPara, generoEfectivo,
  ajustesVozEfectivos,
  type ModoVoz,
} from "@/lib/aurora/voz-inicial";
import { elegirVozPorGenero } from "@/lib/aurora/tts-oss/browser-voices";
import { auroraBridge } from "@/components/onboarding/aurora-guide-voice";
import { SelectorTimbres } from "@/components/onboarding/selector-timbres";
import { hablarRito, callarRito } from "@/lib/aurora/voz-rito";
import { motorNeuralListo, precalentarMotorNeural, type MotorVoz } from "@/lib/aurora/motor-voz";
import { cortarVoz } from "@/lib/aurora/narracion-ventana";

const FRASE_PRUEBA =
  "Hola, soy Astraura. Así sueno en este dispositivo; puedes cambiarme cuando quieras.";

export function SelectorVozInicial({
  onElegir,
  className,
}: {
  /** Se llama al elegir una voz: el rito arranca el modo voz con ella. */
  onElegir: (modo: ModoVoz) => void | Promise<void>;
  className?: string;
}) {
  const [modo, setModo] = useState<ModoVoz>("femenina");
  const [probando, setProbando] = useState<ModoVoz | null>(null);
  // (Adenda 201) Prueba a demanda de la voz YA seleccionada, sin cambiar nada.
  const [sonando, setSonando] = useState(false);
  // ¿El equipo tiene voz real del género elegido? Si no, se dice con honestidad.
  const [sinVozReal, setSinVozReal] = useState(false);

  useEffect(() => { setModo(getModoVoz()); }, []);
  // (Adenda 204) Al desmontar se corta SOLO si esta prueba estaba sonando.
  // La versión anterior cancelaba SIEMPRE, y como React monta-desmonta-monta
  // los efectos en desarrollo, ese `cancel()` mataba la locución de bienvenida
  // en el mismo instante en que arrancaba: pulsabas «Con voz» y no se oía nada.
  // En producción hacía lo mismo al pasar de paso, callando la guía entera.
  const sonandoRef = useRef(false);
  useEffect(() => { sonandoRef.current = sonando; }, [sonando]);
  useEffect(() => () => {
    if (!sonandoRef.current) return;
    try { window.speechSynthesis?.cancel(); } catch { /* sin motor */ }
  }, []);

  const elegir = useCallback(async (m: ModoVoz) => {
    setProbando(m);
    setModo(m);
    try {
      await setModoVoz(m);
      try { setSinVozReal(!hayVozRealPara(generoEfectivo(m))); } catch { setSinVozReal(false); }
      await onElegir(m);
    } finally {
      setProbando(null);
    }
  }, [onElegir]);

  /** Corta la prueba venga del puente o del motor del navegador. */
  const detener = useCallback(() => {
    cortarVoz();
    try { window.speechSynthesis?.cancel(); } catch { /* sin motor */ }
    setSonando(false);
  }, []);

  /** Reproduce la frase de prueba. Ya no hay nada sonando cuando entra aquí. */
  const arrancarPrueba = useCallback(() => {
    // (Adenda 213) La prueba usa la MISMA vía que la guía (`hablarRito`), que
    // ya resuelve timbre, relevo y motor. Antes había aquí una copia de esa
    // lógica y podía sonar distinto de lo que luego se oía de verdad.
    if (hablarRito(FRASE_PRUEBA)) {
      window.setTimeout(() => setSonando(false), 6500);
      return;
    }
    // 1) Si Astraura ya tiene puente (voz del rito arrancada), habla ELLA:
    //    así lo que pruebas es exactamente lo que vas a oír después.
    const puente = auroraBridge();
    if (puente?.speak) {
      try {
        puente.speak(FRASE_PRUEBA);
        window.setTimeout(() => setSonando(false), 6500);
        return;
      } catch { /* caemos al motor del navegador */ }
    }

    // 2) Aún no hay puente (todavía no has elegido timbre): probamos directo
    //    con el motor del navegador y los MISMOS ajustes que usará Astraura.
    //    Sin esto, «Probar» no sonaría justo cuando más falta hace.
    try {
      const synth = window.speechSynthesis;
      if (!synth) { setSonando(false); return; }
      // (Adenda 203) `cancel()` + `speak()` en el mismo tick encalla el motor de
      // Chrome: la locución se crea, `speaking` pasa a true y `onstart` no llega
      // nunca. Aquí no cancelamos: `probarVozActual` ya dejó silencio 140 ms
      // antes, así que solo hace falta reanudar por si quedó en pausa.
      const u = new SpeechSynthesisUtterance(FRASE_PRUEBA);
      const { pitch, rate } = ajustesVozEfectivos(
        (window as unknown as { STARSEED_personality_traits?: Record<string, number> }).STARSEED_personality_traits,
      );
      u.pitch = pitch;
      u.rate = rate;
      u.lang = "es-ES";
      const voz = elegirVozPorGenero(generoEfectivo(modo));
      if (voz) { u.voice = voz; u.lang = voz.lang || u.lang; }
      u.onend = () => setSonando(false);
      u.onerror = () => setSonando(false);
      try { synth.resume(); } catch { /* sin pausa previa */ }
      synth.speak(u);
      // Red de seguridad: algunos motores no disparan onend.
      window.setTimeout(() => setSonando(false), 8000);
    } catch {
      setSonando(false);
    }
  }, [modo]);

  /**
   * (Adenda 201) Escucha la voz elegida cuando tú quieras, no solo al cambiarla.
   * Corta primero lo que estuviera sonando: nunca se encima ni se encola.
   */
  const probarVozActual = useCallback(() => {
    if (sonando) { detener(); return; }
    cortarVoz();
    setSonando(true);

    // (Adenda 202) El corte anterior es ASÍNCRONO: `interrupt()` lanza el
    // apagado del motor OSS por import dinámico y resuelve unos ms después.
    // Si hablábamos en el mismo tick, ese apagado tardío mataba la locución
    // recién empezada y la prueba salía muda. Le damos su respiro.
    window.setTimeout(() => arrancarPrueba(), 140);
  }, [sonando, detener, arrancarPrueba]);


  const abrirAjustes = useCallback(() => {
    // (Adenda 208) Los ajustes de voz NO abren una ventana aparte: llevan a la
    // sección OmniVoice de «Configuración de sistemas de Astraura», que es
    // donde vive la configuración de voz. Una sola ventana, como pidió Alex.
    void import("@/lib/astraura/config-ui")
      .then((m) => m.openAstrauraConfig("openvoice"))
      .catch(() => { /* si el drawer no está montado, siguen en Ajustes → Voz */ });
  }, []);

  const principales = MODOS_VOZ.filter((m) => m.id !== "autonoma");
  const autonoma = MODOS_VOZ.find((m) => m.id === "autonoma")!;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
        El timbre de Astraura
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {principales.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => void elegir(m.id)}
            aria-pressed={modo === m.id}
            className={cn(
              "group rounded-xl border px-3 py-3 text-center transition-all duration-200",
              "hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60",
              modo === m.id
                ? "border-fuchsia-400/70 bg-fuchsia-500/[0.12]"
                : "border-white/10 bg-white/[0.03] hover:border-fuchsia-400/40",
            )}
          >
            <span className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
              {probando === m.id
                ? <Loader2 className="h-4 w-4 animate-spin text-fuchsia-200" aria-hidden />
                : <Volume2 className={cn("h-4 w-4", modo === m.id ? "text-fuchsia-200" : "text-white/40")} aria-hidden />}
            </span>
            <span className="block text-[13px] font-semibold">{m.label}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-white/50">{m.desc}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <button
          type="button"
          onClick={probarVozActual}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors",
            sonando
              ? "border-fuchsia-400/60 bg-fuchsia-500/20 text-fuchsia-100"
              : "border-fuchsia-400/35 bg-fuchsia-500/10 text-fuchsia-100/90 hover:border-fuchsia-400/60 hover:bg-fuchsia-500/20",
          )}
          title="Escucha cómo suena la voz que tienes seleccionada"
        >
          {sonando
            ? <><Square className="h-3 w-3" aria-hidden /> Parar</>
            : <><Play className="h-3 w-3" aria-hidden /> Probar esta voz</>}
        </button>
        <button
          type="button"
          onClick={() => void elegir("autonoma")}
          aria-pressed={modo === "autonoma"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] transition-colors",
            modo === "autonoma"
              ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100"
              : "border-white/12 bg-white/[0.03] text-white/65 hover:border-cyan-400/40 hover:text-white/85",
          )}
          title={autonoma.desc}
        >
          <Sparkles className="h-3.5 w-3.5 text-cyan-300" aria-hidden /> Voz autónoma
        </button>
        <button
          type="button"
          onClick={abrirAjustes}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/65 transition-colors hover:border-white/25 hover:text-white/85"
        >
          <Sliders className="h-3.5 w-3.5" aria-hidden /> Ajustes de voz (en Astraura)
        </button>
      </div>

      {/* (Adenda 213) Variedades del género elegido: cada una es una receta
          fija, así que el botón y lo que suena siempre coinciden. */}
      {modo !== "autonoma" && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <SelectorTimbres genero={generoEfectivo(modo)} onProbar={probarVozActual} />
        </div>
      )}

      {sinVozReal && (
        <p className="rounded-lg border border-white/10 bg-black/20 p-2 text-center text-[10px] leading-snug text-white/55">
          Este equipo no tiene instalada una voz de sistema de ese género en español, así que ajusto el timbre de la
          mejor voz disponible — suena bien igualmente. Si quieres la voz nativa, se descarga en los ajustes de voz
          de tu sistema operativo.
        </p>
      )}
      <p className="text-center text-[10px] leading-snug text-white/40">
        {modo === "autonoma"
          ? "Cada personalidad y cada agente modularán su propia voz según su carácter y el momento."
          : "Queda vinculada a la personalidad de Astraura; puedes cambiarla o intercambiarla luego en su editor."}
      </p>
      <span className="sr-only">{FRASE_PRUEBA}</span>
    </div>
  );
}

export default SelectorVozInicial;
