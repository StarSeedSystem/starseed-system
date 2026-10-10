/**
 * TransmitirEnStarSeed — opción «Transmitir en directo en una estación de StarSeed OS» para la
 * sección Comunidad de Entonaciones de Omnifrecuencias.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Copiar a `src/components/TransmitirEnStarSeed.tsx` del repo de la app (ver INSTRUCCIONES.md).
 * Usa `src/lib/estacion-starseed.ts` (copiado del mismo sitio) y `lucide-react`, que la app ya usa.
 *
 * Dentro de StarSeed OS: crea la estación por el puente, enseña su enlace y su estado en vivo
 * (fase, precisión medida del reloj común, conectados) y deja iniciar/pausar para todos.
 * Fuera del OS: abre «Nueva estación» de StarSeed OS con esta entonación ya puesta.
 */

import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Globe, Lock, Pause, Play, Radio } from "lucide-react";
import {
  EstacionStarSeed,
  dentroDeStarSeed,
  enlaceParaAbrirFuera,
  type Creada,
  type EstadoEstacion,
  type OsciladorApp,
} from "../lib/estacion-starseed";

const OS_PUBLICO = "https://starseed-os.vercel.app";

export interface TransmitirEnStarSeedProps {
  /** Osciladores de la entonación (los de `useAudio().oscillators`). */
  osciladores: OsciladorApp[];
  volumen: number;
  /** Nombre de la entonación. */
  titulo: string;
  /** Enlace público de la entonación en Omnifrecuencias. */
  enlace: string;
}

export function TransmitirEnStarSeed({ osciladores, volumen, titulo, enlace }: TransmitirEnStarSeedProps) {
  const puente = useMemo(() => new EstacionStarSeed({ suena: false }), []);
  const [conectado, setConectado] = useState<boolean | null>(null);
  const [privada, setPrivada] = useState(false);
  const [creada, setCreada] = useState<Creada | null>(null);
  const [estado, setEstado] = useState<EstadoEstacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    if (!dentroDeStarSeed()) {
      setConectado(false);
      return;
    }
    void puente.conectar().then((ok) => vivo && setConectado(ok));
    const baja = puente.alEstado((e) => setEstado(e));
    return () => {
      vivo = false;
      baja();
      puente.desconectar();
    };
  }, [puente]);

  // Cambiar la entonación en la app la cambia para TODOS (a los 0,4 s del último cambio).
  const firma = JSON.stringify(osciladores.map((o) => [o.frequency, o.type, o.volume, o.panX, o.panY, o.panZ]));
  useEffect(() => {
    if (!creada || !estado?.control) return;
    const h = setTimeout(() => void puente.accion("parametros", { osciladores, volumen }), 400);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, volumen, creada]);

  const transmitir = async () => {
    setError(null);
    if (!osciladores.length) {
      setError("Añade al menos un oscilador a la entonación.");
      return;
    }
    if (!conectado) {
      window.open(enlaceParaAbrirFuera(OS_PUBLICO, { titulo, enlace, osciladores }), "_blank", "noopener");
      return;
    }
    try {
      setCreada(await puente.crear({ titulo, enlace, osciladores, volumen, privada }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la estación.");
    }
  };

  const mandar = async (accion: string) => {
    const r = await puente.accion(accion);
    if (!r.ok) setError(r.motivo ?? "No se pudo.");
  };

  const copiar = async () => {
    if (!creada) return;
    try {
      await navigator.clipboard.writeText(creada.enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError("El portapapeles no responde.");
    }
  };

  const precision = estado?.reloj.precisionMs;
  const boton = "inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border border-white/10 px-4 text-sm hover:border-white/30";

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/30 p-4" aria-label="Transmitir en directo">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Radio className="h-4 w-4 text-cyan-300" aria-hidden /> Transmitir en directo en una estación de StarSeed OS
      </h3>
      <p className="text-xs opacity-70">
        Viaja la entonación y un reloj común, no el audio: cada persona la oye generada en su aparato, a la vez.
        {conectado === false && " Se abrirá StarSeed OS para publicarla."}
      </p>

      {!creada && (
        <>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Quién puede entrar">
            <button type="button" role="radio" aria-checked={!privada} onClick={() => setPrivada(false)} className={boton}>
              <Globe className="h-4 w-4" aria-hidden /> Pública
            </button>
            <button type="button" role="radio" aria-checked={privada} onClick={() => setPrivada(true)} className={boton}>
              <Lock className="h-4 w-4" aria-hidden /> Privada
            </button>
          </div>
          <button type="button" onClick={() => void transmitir()} className={`${boton} bg-emerald-500/90 font-semibold text-black`}>
            {conectado ? <Radio className="h-4 w-4" aria-hidden /> : <ExternalLink className="h-4 w-4" aria-hidden />}
            {conectado ? "Transmitir en directo" : "Abrir en StarSeed OS para transmitir"}
          </button>
        </>
      )}

      {creada && (
        <div className="flex flex-col gap-2">
          <p className="text-xs">
            {estado ? `${estado.fase === "sonando" ? "En vivo" : estado.fase === "pausada" ? "En pausa" : estado.fase === "terminada" ? "Terminada" : "Lista para empezar"}` : "Conectando…"}
            {typeof precision === "number" ? ` · reloj común ± ${precision.toLocaleString("es", { maximumFractionDigits: 1 })} ms` : " · reloj común sin medir"}
            {typeof estado?.conectados === "number" ? ` · ${estado.conectados} conectados` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {estado?.fase === "sonando" ? (
              <button type="button" onClick={() => void mandar("pausar")} className={boton}><Pause className="h-4 w-4" aria-hidden /> Pausar para todos</button>
            ) : (
              <button type="button" onClick={() => void mandar(estado?.fase === "pausada" ? "reanudar" : "iniciar")} className={boton}><Play className="h-4 w-4" aria-hidden /> {estado?.fase === "pausada" ? "Reanudar" : "Iniciar"} para todos</button>
            )}
            <button type="button" onClick={() => void copiar()} className={boton}><Copy className="h-4 w-4" aria-hidden /> {copiado ? "Copiado" : privada ? "Copiar invitación" : "Copiar enlace"}</button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
    </section>
  );
}

export default TransmitirEnStarSeed;
