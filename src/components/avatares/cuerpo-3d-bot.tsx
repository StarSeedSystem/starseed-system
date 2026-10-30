"use client";

/**
 * CUERPO 3D DEL BOT (AV1011C · contrato architecture/astraura-avatares-3d.md §2, §3 y §8).
 *
 * La orbe de un bot puede ser su avatar 3D: este widget flotante carga su ADN de la Biblioteca,
 * aplica la emoción expresada (expresiones VRM y aura), mueve la boca con visemas mientras habla y
 * pide el gesto al motor único de movimiento respetando el carácter del ADN.
 *
 * Honestidad y accesibilidad:
 *  · Se lee el ADN una vez por sesión y revisión (`useAdnEntry`); no hay sondeos ni peticiones en bucle.
 *  · Fuera de pantalla o con la pestaña oculta se pausa el dibujo, el gesto y los visemas.
 *  · Con `prefers-reduced-motion` no se genera ni se anima nada; el avatar queda quieto y legible.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AvatarVivo } from "@/components/avatares/avatar-vivo";
import { prefiereReducirMovimiento, useMovimiento } from "@/components/avatares/usar-movimiento";
import { cn } from "@/lib/utils";
import { sanearAdn, type AdnAvatar, type Expresion } from "@/lib/avatares/adn/adn";
import { useAdnEntry } from "@/lib/avatares/adaptadores/almacen-adn";
import {
  adnConEmocion, adnDeBot, conVisema, gestoDeHabla, visemaEn, visemasDeTexto,
} from "@/lib/avatares/adaptadores/adn-de-bot";
import type { MovimientoClip } from "@/lib/avatares/movimiento/motor";
import type { Bot, EstadoEmocional } from "@/lib/astraura-bots/tipos";
import type { AvatarCalidad } from "@/lib/xr/calidad-perfiles";

export interface Cuerpo3dBotProps {
  bot: Bot;
  /** Emoción EXPRESADA del bot (valencia y activación); sin ella, calma neutral. */
  estado?: EstadoEmocional;
  /** `true` mientras la voz del bot habla (activa visemas y gesto). */
  hablando?: boolean;
  /** Texto que está diciendo (para visemas y frase del gesto). */
  texto?: string;
  /** Interruptor general: `false` pausa el widget sin desmontarlo. */
  activo?: boolean;
  /** Lado del widget flotante, en píxeles. */
  tamano?: number;
  calidad?: AvatarCalidad;
  className?: string;
}

const ESTADO_NEUTRO: EstadoEmocional = { emocion: "calma", valencia: 0, activacion: 0.2 };

/** ADN guardado del bot o el de por defecto. Una lectura por sesión y revisión (sin sondeos). */
function useAdnDelBot(bot: Bot): AdnAvatar {
  const ref = bot.cuerpo.avatarRef?.startsWith("biblioteca:") ? bot.cuerpo.avatarRef : "";
  const { entry } = useAdnEntry(ref);
  return useMemo(() => {
    let guardado: AdnAvatar | null = null;
    if (entry?.raw) {
      try {
        guardado = sanearAdn(JSON.parse(entry.raw));
      } catch {
        guardado = null;
      }
    }
    return adnDeBot(bot, guardado);
    // El ADN se relee al cambiar el bot, su referencia o la revisión guardada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot.id, bot.nombre, bot.cuerpo.tono, bot.cuerpo.avatarRef, entry?.rev, entry?.raw]);
}

/** Resume el fotograma del gesto en un movimiento 2,5D honesto del widget (misma regla que `AvatarVivo`). */
function estiloDelGesto(clip: MovimientoClip | null, fotograma: number): CSSProperties {
  const fila = clip?.rotaciones[fotograma];
  if (!fila) return {};
  const pelvis = fila[0] ?? 0;
  const columna = ((fila[1] ?? 0) + (fila[2] ?? 0) + (fila[3] ?? 0)) / 3;
  const raizY = clip?.raiz?.[fotograma]?.[1] ?? 0;
  const giro = Math.max(-6, Math.min(6, pelvis * 40 + columna * 10));
  const sube = Math.max(-3, Math.min(3, raizY * 120));
  return {
    transform: `translateY(${sube.toFixed(2)}%) rotate(${giro.toFixed(2)}deg)`,
    transition: "transform 90ms linear",
    willChange: "transform",
  };
}

export function Cuerpo3dBot({
  bot,
  estado,
  hablando = false,
  texto = "",
  activo = true,
  tamano = 112,
  calidad = "vrm",
  className,
}: Cuerpo3dBotProps) {
  const adn = useAdnDelBot(bot);
  const estadoE = estado ?? ESTADO_NEUTRO;
  const caja = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const [reducir, setReducir] = useState(() => prefiereReducirMovimiento());

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      return;
    }
    const aplicar = () => setReducir(mq.matches);
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  useEffect(() => {
    const el = caja.current;
    let enPantalla = true;
    const mirar = () => setVisible(enPantalla && !document.hidden);
    const io = el && typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([e]) => { enPantalla = !!e?.isIntersecting; mirar(); })
      : null;
    if (el) io?.observe(el);
    document.addEventListener("visibilitychange", mirar);
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", mirar);
    };
  }, []);

  const activoAhora = activo && visible && !reducir;

  const adnEmocion = useMemo(
    () => adnConEmocion(adn, estadoE),
    [adn, estadoE.emocion, estadoE.valencia, estadoE.activacion],
  );

  const gesto = useMemo(
    () => (hablando && texto && activoAhora ? gestoDeHabla(adn, texto, estadoE) : null),
    [hablando, texto, activoAhora, adn, estadoE.emocion, estadoE.valencia, estadoE.activacion],
  );
  const { clip, fotograma, nivel } = useMovimiento(gesto, {
    personalidadId: bot.id,
    activo: activoAhora,
  });

  const visemas = useMemo(() => (hablando && texto ? visemasDeTexto(texto) : []), [hablando, texto]);
  const [visema, setVisema] = useState<Expresion | null>(null);
  useEffect(() => {
    if (!hablando || reducir || visemas.length === 0) {
      setVisema(null);
      return;
    }
    const inicio = performance.now();
    const fin = visemas[visemas.length - 1].hastaMs;
    let raf = 0;
    const paso = (ms: number) => {
      const t = ms - inicio;
      if (t >= fin) {
        setVisema(null);
        return;
      }
      const siguiente = visemaEn(visemas, t);
      setVisema((previo) => (previo === siguiente ? previo : siguiente));
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [hablando, reducir, visemas]);

  const adnVivo = useMemo(() => conVisema(adnEmocion, visema), [adnEmocion, visema]);
  const lado = `${tamano}px`;
  const etiqueta = [
    `Avatar 3D de ${bot.nombre}`,
    hablando ? "hablando" : estadoE.emocion,
    reducir ? "sin animación (movimiento reducido)" : null,
  ].filter(Boolean).join(". ");

  return (
    <div
      ref={caja}
      role="group"
      aria-label={etiqueta}
      data-emocion={estadoE.emocion}
      data-nivel-movimiento={nivel ?? undefined}
      data-hablando={hablando ? "si" : "no"}
      className={cn("relative inline-block select-none", className)}
      style={{ width: lado, height: lado }}
    >
      <div className="h-full w-full" style={activoAhora ? estiloDelGesto(clip, fotograma) : undefined}>
        <AvatarVivo adn={adnVivo} calidad={calidad} tamano={tamano} className="h-full w-full" />
      </div>
      {reducir && (
        <span className="sr-only">Sin animación por la preferencia de movimiento reducido.</span>
      )}
    </div>
  );
}

export default Cuerpo3dBot;
