"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Music, Globe, BookOpen, Download, CheckCircle, AlertCircle, Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  TIPO_AUDIO,
  MODO_REPRODUCCION,
  type ConfigAudioNodo,
  type ModoReproduccion,
  type PreferenciasVisitanteAudio,
  type PreferenciasVisitanteResueltas,
  type PistaAudio,
  resolverPreferenciasVisitante,
  audioDisponibleOffline,
} from "@/lib/nfc/nodo-audio";
import { guardarEnBiblioteca } from "@/lib/library";
import { toast } from "sonner";

const NOMBRE_TIPO: Record<(typeof TIPO_AUDIO)[number], string> = {
  audioguia: "Audioguía",
  descripcion_zona: "Descripción de zona",
  nodo_informativo: "Nodo informativo",
};

const NOMBRE_MODO: Record<ModoReproduccion, string> = {
  al_acercarse: "Reproducir al acercarse",
  preguntar: "Preguntar antes de reproducir",
  no_reproducir: "No reproducir automáticamente",
};

const ICONO_TIPO: Record<(typeof TIPO_AUDIO)[number], React.ReactNode> = {
  audioguia: <Music className="h-5 w-5" aria-hidden />,
  descripcion_zona: <Globe className="h-5 w-5" aria-hidden />,
  nodo_informativo: <BookOpen className="h-5 w-5" aria-hidden />,
};

interface Props {
  /** Configuración del nodo de audio (validada). */
  config: ConfigAudioNodo;
  /** Preferencias guardadas del visitante (opcional). */
  preferenciasVisitante?: PreferenciasVisitanteAudio;
  /** IDs de pistas ya descargadas para reproducción offline. */
  pistasDescargadas?: Set<string>;
  /** Callback cuando cambian las preferencias del visitante. */
  onPreferenciasChange?: (prefs: PreferenciasVisitanteAudio) => void;
  /** Callback cuando se guarda en la Biblioteca. */
  onGuardarBiblioteca?: (pista: PistaAudio) => void;
}

export function Audioguia({
  config,
  preferenciasVisitante,
  pistasDescargadas = new Set(),
  onPreferenciasChange,
  onGuardarBiblioteca,
}: Props) {
  const [prefs, setPrefs] = useState<PreferenciasVisitanteAudio>(
    preferenciasVisitante ?? { modoReproduccion: "preguntar", idiomaPreferido: "auto", volumen: 0.8, guardarEnBiblioteca: true }
  );
  const [resueltas, setResueltas] = useState<PreferenciasVisitanteResueltas>(
    resolverPreferenciasVisitante(config, prefs)
  );
  const [pistaActual, setPistaActual] = useState<number>(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [duracion, setDuracion] = useState(0);
  const [offlineDisponible, setOfflineDisponible] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const r = resolverPreferenciasVisitante(config, prefs);
    setResueltas(r);
    onPreferenciasChange?.(prefs);
  }, [config, prefs, onPreferenciasChange]);

  useEffect(() => {
    setOfflineDisponible(audioDisponibleOffline(config, pistasDescargadas));
  }, [config, pistasDescargadas]);

  useEffect(() => {
    if (reproduciendo && audioRef.current) {
      audioRef.current.volume = resueltas.volumen;
      audioRef.current.play().catch(() => setReproduciendo(false));
    } else if (audioRef.current) {
      audioRef.current.pause();
    }
  }, [reproduciendo, resueltas.volumen]);

  useEffect(() => {
    const audio = new Audio(config.pistas[pistaActual].url);
    audioRef.current = audio;
    audio.volume = resueltas.volumen;

    const onTimeUpdate = () => setProgreso(audio.currentTime);
    const onLoadedMetadata = () => setDuracion(audio.duration);
    const onEnded = () => {
      setReproduciendo(false);
      setProgreso(0);
      if (pistaActual < config.pistas.length - 1) {
        setPistaActual((p) => p + 1);
      }
    };
    const onError = () => {
      setReproduciendo(false);
      toast.error("No se pudo reproducir el audio");
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    if (reproduciendo) audio.play().catch(() => setReproduciendo(false));

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.pause();
      audio.src = "";
    };
  }, [pistaActual, config.pistas, resueltas.volumen, reproduciendo]);

  const alternarReproduccion = useCallback(() => setReproduciendo((r) => !r), []);
  const pistaAnterior = useCallback(() => setPistaActual((p) => Math.max(0, p - 1)), []);
  const pistaSiguiente = useCallback(() => setPistaActual((p) => Math.min(config.pistas.length - 1, p + 1)), []);

  const formatearTiempo = (seg: number) => {
    const m = Math.floor(seg / 60);
    const s = Math.floor(seg % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const cambiarModo = (modo: ModoReproduccion) => setPrefs((p) => ({ ...p, modoReproduccion: modo }));
  const cambiarIdioma = (idioma: string) => setPrefs((p) => ({ ...p, idiomaPreferido: idioma }));
  const cambiarVolumen = (vol: number) => setPrefs((p) => ({ ...p, volumen: vol }));
  const alternarGuardarBiblioteca = () => setPrefs((p) => ({ ...p, guardarEnBiblioteca: !p.guardarEnBiblioteca }));

  const handleGuardarEnBiblioteca = async (pista: PistaAudio) => {
    setGuardando(pista.id);
    try {
      await guardarEnBiblioteca({
        kind: "audio",
        title: `${config.titulo} — ${pista.titulo}`,
        url: pista.url,
        origin: `Nodo NFC: ${config.titulo}`,
      });
      onGuardarBiblioteca?.(pista);
      toast.success(`"${pista.titulo}" guardado en tu Biblioteca`);
    } catch {
      toast.error("No se pudo guardar en la Biblioteca");
    } finally {
      setGuardando(null);
    }
  };

  const pista = config.pistas[pistaActual];
  const descargada = pistasDescargadas.has(pista.id);
  const esLocal = pista.url.startsWith("/");
  const disponibleOffline = esLocal || descargada;

  return (
    <section
      aria-label={`Audioguía: ${config.titulo}`}
      data-testid="audioguia"
      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur"
    >
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 border border-fuchsia-500/30"
            aria-hidden
          >
            {ICONO_TIPO[config.tipo]}
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-white truncate">{config.titulo}</h2>
            <p className="text-xs text-white/60">
              {NOMBRE_TIPO[config.tipo]} · {config.pistas.length} pista{config.pistas.length !== 1 ? "s" : ""}
              · {config.idiomasDisponibles.map((l) => l.toUpperCase()).join(", ")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {offlineDisponible && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
              <CheckCircle className="h-3 w-3" aria-hidden />
              Disponible offline
            </span>
          )}
          {!offlineDisponible && config.pistas.some((p) => p.url.startsWith("https://")) && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
              <Download className="h-3 w-3" aria-hidden />
              Requiere conexión
            </span>
          )}
        </div>
      </header>

      {config.descripcion && (
        <p className="text-sm text-white/70 leading-relaxed">{config.descripcion}</p>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-white flex items-center gap-2">
            <Music className="h-4 w-4" aria-hidden />
            Reproduciendo
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Pista anterior"
              onClick={pistaAnterior}
              disabled={pistaActual === 0}
              className="cursor-pointer rounded-full p-1.5 text-white/70 transition-colors hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <SkipBack className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={reproduciendo ? "Pausar" : "Reproducir"}
              onClick={alternarReproduccion}
              className="cursor-pointer rounded-full p-2 bg-gradient-to-r from-fuchsia-500 to-cyan-500 text-white transition-all hover:shadow-lg hover:shadow-fuchsia-500/30"
            >
              {reproduciendo ? <Pause className="h-5 w-5" aria-hidden /> : <Play className="h-5 w-5" aria-hidden />}
            </button>
            <button
              type="button"
              aria-label="Pista siguiente"
              onClick={pistaSiguiente}
              disabled={pistaActual === config.pistas.length - 1}
              className="cursor-pointer rounded-full p-1.5 text-white/70 transition-colors hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <SkipForward className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <span className="w-12 shrink-0">{formatearTiempo(progreso)}</span>
            <Slider
              value={progreso}
              max={duracion || 1}
              step={1}
              onValueChange={setProgreso}
              className="flex-1 h-1.5"
              aria-label="Progreso de la pista"
            />
            <span className="w-12 shrink-0 text-right">{formatearTiempo(duracion)}</span>
          </div>
          <p className="text-sm text-white/85 truncate">{pista.titulo}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 text-white/50">
              <Globe className="h-3 w-3" aria-hidden />
              {pista.idioma.toUpperCase()}
            </span>
            {disponibleOffline && (
              <span className="inline-flex items-center gap-1 text-emerald-200">
                <CheckCircle className="h-3 w-3" aria-hidden />
                Offline
              </span>
            )}
            {!disponibleOffline && (
              <span className="inline-flex items-center gap-1 text-amber-200">
                <AlertCircle className="h-3 w-3" aria-hidden />
                Online
              </span>
            )}
            {resueltas.guardarEnBiblioteca && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="cursor-pointer gap-1 h-7 px-2"
                onClick={() => handleGuardarEnBiblioteca(pista)}
                disabled={guardando === pista.id}
              >
                {guardando === pista.id ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" aria-hidden />
                    Guardando...
                  </>
                ) : (
                  <>
                    <BookOpen className="h-3 w-3" aria-hidden />
                    Guardar en Biblioteca
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <legend className="font-medium text-white flex items-center gap-2">
            <Music className="h-4 w-4" aria-hidden />
            Reproducción automática
          </legend>
          {MODO_REPRODUCCION.map((modo) => (
            <label key={modo} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="modo-reproduccion"
                value={modo}
                checked={prefs.modoReproduccion === modo}
                onChange={() => cambiarModo(modo)}
                className="cursor-pointer accent-fuchsia-500"
              />
              <span className="text-white/85">{NOMBRE_MODO[modo]}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <legend className="font-medium text-white flex items-center gap-2">
            <Globe className="h-4 w-4" aria-hidden />
            Idioma
          </legend>
          <select
            value={prefs.idiomaPreferido}
            onChange={(e) => cambiarIdioma(e.target.value)}
            className="cursor-pointer rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50"
          >
            <option value="auto">Automático (sistema / principal del nodo)</option>
            {config.idiomasDisponibles.map((lang) => (
              <option key={lang} value={lang}>
                {lang.toUpperCase()}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-white/50">
            Idioma resuelto: <strong className="text-white/80">{resueltas.idioma.toUpperCase()}</strong>
          </p>
        </fieldset>

        <fieldset className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3 sm:col-span-2">
          <legend className="font-medium text-white flex items-center gap-2">
            <Volume2 className="h-4 w-4" aria-hidden />
            Volumen: {Math.round(resueltas.volumen * 100)}%
          </legend>
          <Slider
            value={prefs.volumen}
            min={0}
            max={1}
            step={0.05}
            onValueChange={cambiarVolumen}
            className="h-2"
            aria-label="Volumen de reproducción"
          />
          <div className="flex items-center justify-between text-xs text-white/50">
            <span><VolumeX className="h-3 w-3" aria-hidden /> 0%</span>
            <span>100% <Volume2 className="h-3 w-3" aria-hidden /></span>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3 sm:col-span-2">
          <legend className="font-medium text-white flex items-center gap-2">
            <BookOpen className="h-4 w-4" aria-hidden />
            Biblioteca
          </legend>
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={prefs.guardarEnBiblioteca}
              onChange={alternarGuardarBiblioteca}
              className="cursor-pointer accent-fuchsia-500 h-4 w-4"
            />
            <span className="text-white/85">Guardar automáticamente en mi Biblioteca al escuchar</span>
          </label>
          <p className="text-[11px] text-white/50">
            Se guardará como referencia (no se descarga el archivo). Podrás reproducirlo desde la Biblioteca cuando quieras.
          </p>
        </fieldset>
      </div>

      <details className="rounded-xl border border-white/10 bg-black/20 p-3 group">
        <summary className="flex cursor-pointer items-center gap-2 font-medium text-white list-none">
          <Music className="h-4 w-4" aria-hidden />
          Lista de pistas ({config.pistas.length})
          <span className="ml-auto text-white/40 group-open:rotate-90 transition-transform">▶</span>
        </summary>
        <ul className="mt-3 space-y-2" role="list">
          {config.pistas.map((p, i) => {
            const pDescargada = pistasDescargadas.has(p.id);
            const pEsLocal = p.url.startsWith("/");
            const pOffline = pEsLocal || pDescargada;
            return (
              <li
                key={p.id}
                className={`flex items-center gap-3 rounded-lg p-2 transition-colors ${
                  i === pistaActual
                    ? "bg-fuchsia-500/10 border border-fuchsia-500/30"
                    : "bg-white/5 hover:bg-white/10"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setPistaActual(i)}
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                    i === pistaActual
                      ? "bg-gradient-to-r from-fuchsia-500 to-cyan-500 text-white"
                      : "text-white/70 hover:bg-white/10"
                  }`}
                  aria-label={i === pistaActual ? "Pista actual" : `Reproducir ${p.titulo}`}
                  aria-current={i === pistaActual ? "true" : "false"}
                >
                  {i === pistaActual && reproduciendo ? (
                    <Pause className="h-4 w-4" aria-hidden />
                  ) : (
                    <Play className="h-4 w-4" aria-hidden />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{p.titulo}</p>
                  <p className="text-xs text-white/50 flex items-center gap-2">
                    <span>{formatearTiempo(p.duracionSeg)}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Globe className="h-2.5 w-2.5" aria-hidden />
                      {p.idioma.toUpperCase()}
                    </span>
                    {pOffline && (
                      <span className="inline-flex items-center gap-1 text-emerald-200">
                        <CheckCircle className="h-2.5 w-2.5" aria-hidden />
                        Offline
                      </span>
                    )}
                  </p>
                </div>
                {resueltas.guardarEnBiblioteca && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer h-7 px-2"
                    onClick={() => handleGuardarEnBiblioteca(p)}
                    disabled={guardando === p.id}
                  >
                    {guardando === p.id ? (
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" aria-hidden />
                    ) : (
                      <BookOpen className="h-3 w-3" aria-hidden />
                    )}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

export default Audioguia;