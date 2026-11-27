"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Volume2, Play, Pause, Download, BookOpen, Globe, Languages, Zap } from "lucide-react";
import {
  type ConfigAudioNodo,
  type PreferenciasAudioVisitante,
  type PreferenciasAudioResueltas,
  type AudioDisponible,
  resolverPreferenciasAudio,
  audioDisponibleOffline,
  filtrarAudioPorIdioma,
  tipoAudioValido,
  VOLUMEN_DEFECTO,
  IDIOMA_DEFECTO,
} from "@/lib/nfc/nodo-audio";

interface Props {
  /** Configuración del nodo de audio (validada). */
  config: ConfigAudioNodo;
  /** Audios disponibles (puede haber varios idiomas). */
  audiosDisponibles?: AudioDisponible[];
  /** Preferencias guardadas del visitante. */
  preferenciasVisitante?: PreferenciasAudioVisitante;
  /** Si el dispositivo está online. */
  online?: boolean;
  /** Callback cuando cambian las preferencias. */
  onPreferenciasChange?: (p: PreferenciasAudioVisitante) => void;
  /** Callback para guardar en Biblioteca. */
  onGuardarBiblioteca?: (config: ConfigAudioNodo, audio: AudioDisponible) => void;
  /** Callback de reproducción. */
  onReproducir?: (audio: AudioDisponible, volumen: number) => void;
  /** Callback de pausa. */
  onPausar?: () => void;
}

const ETIQUETA_TIPO: Record<string, string> = {
  audioguia: "Audioguía",
  descripcion_zona: "Descripción de zona",
  nodo_informativo: "Nodo informativo",
};

const ETIQUETA_MODO: Record<string, string> = {
  al_acercarse: "Reproducir al acercarse",
  preguntar: "Preguntar",
  no_reproducir: "No reproducir",
};

const ICONO_TIPO: Record<string, React.ReactNode> = {
  audioguia: <Zap className="w-5 h-5" />,
  descripcion_zona: <Globe className="w-5 h-5" />,
  nodo_informativo: <BookOpen className="w-5 h-5" />,
};

function formatearDuracion(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Audioguia({
  config,
  audiosDisponibles = [],
  preferenciasVisitante,
  online = true,
  onPreferenciasChange,
  onGuardarBiblioteca,
  onReproducir,
  onPausar,
}: Props) {
  const [reproduciendo, setReproduciendo] = useState(false);
  const [audioActual, setAudioActual] = useState<AudioDisponible | null>(null);
  const [mostrarIdiomas, setMostrarIdiomas] = useState(false);

  const prefs = useMemo(
    () => resolverPreferenciasAudio(config, preferenciasVisitante),
    [config, preferenciasVisitante]
  );

  const audiosFiltrados = useMemo(() => {
    if (audiosDisponibles.length === 0) return [];
    return filtrarAudioPorIdioma(audiosDisponibles, prefs.idioma);
  }, [audiosDisponibles, prefs.idioma]);

  const audioPrincipal = useMemo(() => {
    if (audiosFiltrados.length > 0) return audiosFiltrados[0];
    if (audiosDisponibles.length > 0) return audiosDisponibles[0];
    return { url: config.audioUrl, idioma: config.idioma, tamanoBytes: 0, enNodo: true } as AudioDisponible;
  }, [audiosFiltrados, audiosDisponibles, config]);

  const disponibleOffline = useMemo(
    () => audioDisponibleOffline(audioPrincipal),
    [audioPrincipal]
  );

  const actualizarPreferencia = useCallback(
    <K extends keyof PreferenciasAudioVisitante>(clave: K, valor: PreferenciasAudioVisitante[K]) => {
      const nuevas = { ...preferenciasVisitante, [clave]: valor };
      onPreferenciasChange?.(nuevas);
    },
    [preferenciasVisitante, onPreferenciasChange]
  );

  const manejarReproducir = useCallback(() => {
    if (!reproduciendo) {
      setReproduciendo(true);
      setAudioActual(audioPrincipal);
      onReproducir?.(audioPrincipal, prefs.volumen);
    } else {
      setReproduciendo(false);
      onPausar?.();
    }
  }, [reproduciendo, audioPrincipal, prefs.volumen, onReproducir, onPausar]);

  const manejarGuardarBiblioteca = useCallback(() => {
    onGuardarBiblioteca?.(config, audioPrincipal);
  }, [config, audioPrincipal, onGuardarBiblioteca]);

  const cambiarIdioma = useCallback(
    (idioma: string) => {
      actualizarPreferencia("idioma", idioma);
      setMostrarIdiomas(false);
    },
    [actualizarPreferencia]
  );

  const modoAuto = prefs.modo === "al_acercarse";

  useEffect(() => {
    if (modoAuto && online && !reproduciendo && prefs.modo !== "no_reproducir") {
      const timer = setTimeout(() => {
        manejarReproducir();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [modoAuto, online, reproduciendo, prefs.modo, manejarReproducir]);

  return (
    <Card
      data-testid="audioguia"
      className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl overflow-hidden"
      role="region"
      aria-label={`${ETIQUETA_TIPO[config.tipo]}: ${config.titulo}`}
    >
      <CardHeader className="p-5 pb-3">
        <div className="flex items-start gap-3">
          <div
            className="flex-shrink-0 w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center border border-white/10"
            aria-hidden="true"
          >
            {ICONO_TIPO[config.tipo]}
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg font-medium truncate">{config.titulo}</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2 mt-1 text-xs opacity-70">
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                {ICONO_TIPO[config.tipo]}
                {ETIQUETA_TIPO[config.tipo]}
              </span>
              <span className="flex items-center gap-1">
                <Languages className="w-3 h-3" />
                {config.idioma.toUpperCase()}
              </span>
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3" />
                {formatearDuracion(config.duracionSegundos)}
              </span>
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0 space-y-5">
        <div className="flex items-center gap-3">
          <Volume2 className="w-5 h-5 opacity-60 flex-shrink-0" />
          <Slider
            value={[prefs.volumen * 100]}
            onValueChange={([v]) => actualizarPreferencia("volumen", v / 100)}
            min={0}
            max={100}
            step={5}
            className="flex-1"
            aria-label="Volumen"
          />
          <span className="w-10 text-right text-sm font-mono tabular-nums opacity-70">
            {Math.round(prefs.volumen * 100)}%
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={prefs.modo}
            onValueChange={(v) => actualizarPreferencia("modo", v as PreferenciasAudioVisitante["modo"])}
            aria-label="Modo de reproducción"
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue placeholder="Modo de reproducción" />
            </SelectTrigger>
            <SelectContent>
              {MODO_REPRODUCCION.map((m) => (
                <SelectItem key={m} value={m}>
                  {ETIQUETA_MODO[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {modoAuto && online && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs border border-emerald-500/30">
              <Zap className="w-3 h-3" />
              Automático
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 justify-start gap-2"
            onClick={() => setMostrarIdiomas(true)}
            aria-haspopup="listbox"
            aria-expanded={mostrarIdiomas}
          >
            <Languages className="w-4 h-4" />
            <span className="truncate">Idioma: {prefs.idioma.toUpperCase()}</span>
          </Button>
        </div>

        {onGuardarBiblioteca && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer flex-1">
              <input
                type="checkbox"
                className="cursor-pointer w-4 h-4 rounded border-white/20 bg-black/30 text-zenith-accent focus:ring-zenith-accent"
                checked={prefs.guardarEnBiblioteca}
                onChange={(e) => actualizarPreferencia("guardarEnBiblioteca", e.target.checked)}
              />
              <span className="text-sm">Guardar en Biblioteca al reproducir</span>
            </label>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            className="flex-1 cursor-pointer"
            onClick={manejarReproducir}
            disabled={!online && !disponibleOffline}
            aria-pressed={reproduciendo}
          >
            {reproduciendo ? (
              <>
                <Pause className="w-4 h-4 mr-2" />
                Pausar
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Reproducir
              </>
            )}
          </Button>
          {onGuardarBiblioteca && (
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={manejarGuardarBiblioteca}
              disabled={!online && !disponibleOffline}
              aria-label="Guardar en Biblioteca"
            >
              <BookOpen className="w-4 h-4 mr-2" />
              Biblioteca
            </Button>
          )}
        </div>

        {!online && !disponibleOffline && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
            <Zap className="w-4 h-4 flex-shrink-0" />
            <span>Sin conexión y audio no disponible offline. Conéctate para reproducir.</span>
          </div>
        )}

        {disponibleOffline && !online && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2">
            <Zap className="w-4 h-4 flex-shrink-0" />
            <span>Disponible offline — se reproduce sin conexión.</span>
          </div>
        )}

        {audiosDisponibles.length > 1 && (
          <details className="group">
            <summary className="cursor-pointer flex items-center gap-2 text-sm opacity-70 hover:opacity-100">
              <Languages className="w-4 h-4" />
              {audiosDisponibles.length} audios disponibles
            </summary>
            <ul className="mt-2 space-y-1 pl-4 list-disc text-xs opacity-80">
              {audiosDisponibles.map((a, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                    {a.idioma.toUpperCase()}
                  </span>
                  {a.enNodo && <span className="text-emerald-300">● nodo</span>}
                  {a.descargado && <span className="text-zenith-accent">● descargado</span>}
                  {!a.enNodo && !a.descargado && <span className="text-amber-300">● remoto</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

const MODO_REPRODUCCION = ["al_acercarse", "preguntar", "no_reproducir"] as const;