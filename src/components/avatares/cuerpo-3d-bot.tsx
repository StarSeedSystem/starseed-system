"use client";

/**
 * AV1011C · CUERPO 3D DE UN BOT. Contrato: architecture/astraura-avatares-3d.md §2 y §8.
 *
 * Widget flotante que pinta el ADN del bot (orbe con su aura o VRM vivo) y lo mueve con el
 * motor único: emoción → expresiones/aura, habla → visemas y gesto. Se pausa al ocultarse,
 * no anima con `prefers-reduced-motion` y, si no puede leer el ADN guardado, lo dice.
 */
import * as React from "react";
import type { Bot, EstadoEmocional } from "@/lib/astraura-bots/tipos";
import type { AdnAvatar, Expresion } from "@/lib/avatares/adn/adn";
import { sanearAdn } from "@/lib/avatares/adn/adn";
import type { AvatarCalidad } from "@/lib/xr/calidad-perfiles";
import { AvatarVivo } from "@/components/avatares/avatar-vivo";
import { useMovimiento } from "@/components/avatares/usar-movimiento";
import { useAdnEntry } from "@/lib/avatares/adaptadores/almacen-adn";
import { cn } from "@/lib/utils";
import {
  adnDeBot, aplicarEmocion, formaConAdn, gestoDeHabla, refAdnDeBot,
  visemaEn, visemasDeTexto,
} from "@/lib/avatares/adaptadores/adn-de-bot";

export interface Cuerpo3dBotProps {
  bot: Bot;
  emocion?: EstadoEmocional;
  hablando?: boolean;
  textoVoz?: string;
  calidad?: AvatarCalidad;
  /** Lado del widget en píxeles (por defecto 96, tamaño de burbuja flotante). */
  tamano?: number;
  /** `false` lo congela sin tirar el clip (chat en pausa). */
  activo?: boolean;
  className?: string;
}

export function Cuerpo3dBot({
  bot, emocion, hablando = false, textoVoz = "", calidad, tamano = 96, activo = true, className,
}: Cuerpo3dBotProps) {
  const ref = refAdnDeBot(bot);
  const { entry, loading } = useAdnEntry(ref ?? "");
  const guardado = React.useMemo<AdnAvatar | null>(() => {
    if (!entry) return null;
    try {
      return sanearAdn(JSON.parse(entry.raw));
    } catch {
      return null;
    }
  }, [entry]);
  const { adn, origen, aviso } = React.useMemo(
    () => adnDeBot(bot, () => guardado),
    [bot, guardado],
  );

  const v = emocion?.valencia ?? 0;
  const a = emocion?.activacion ?? 0;
  const etiqueta = emocion?.emocion ?? "calma";
  const conEmocion = React.useMemo<AdnAvatar>(
    () => (emocion ? aplicarEmocion(adn, { emocion: etiqueta, valencia: v, activacion: a }) : adn),
    [adn, emocion, etiqueta, v, a],
  );

  const caja = React.useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = React.useState(true);
  const [reducir, setReducir] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const aplicar = () => setReducir(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  React.useEffect(() => {
    let enPantalla = true;
    const mirar = () => setVisible(enPantalla && !document.hidden);
    const io = caja.current && typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([e]) => { enPantalla = !!e?.isIntersecting; mirar(); })
      : null;
    if (caja.current) io?.observe(caja.current);
    document.addEventListener("visibilitychange", mirar);
    mirar();
    return () => { io?.disconnect(); document.removeEventListener("visibilitychange", mirar); };
  }, []);

  const visemas = React.useMemo(
    () => (hablando && textoVoz ? visemasDeTexto(textoVoz) : []),
    [hablando, textoVoz],
  );
  const [visema, setVisema] = React.useState<Expresion | null>(null);
  React.useEffect(() => {
    if (reducir || !visible || !activo || !visemas.length || adn.base.tipo !== "vrm") {
      setVisema(null);
      return;
    }
    const inicio = performance.now();
    const fin = Math.max(1, visemas[visemas.length - 1].finMs);
    const id = window.setInterval(() => {
      const ms = (performance.now() - inicio) % fin;
      setVisema(visemaEn(visemas, ms)?.expresion ?? null);
    }, 110);
    return () => window.clearInterval(id);
  }, [reducir, visible, activo, visemas, adn.base.tipo]);

  const adnPintado = React.useMemo<AdnAvatar>(
    () => (visema ? { ...conEmocion, expresionBase: { ...conEmocion.expresionBase, [visema]: 0.9 } } : conEmocion),
    [conEmocion, visema],
  );

  const gesto = React.useMemo(
    () => (hablando && textoVoz && !reducir
      ? gestoDeHabla(textoVoz, adn, emocion ? { emocion: etiqueta, valencia: v, activacion: a } : undefined)
      : null),
    [hablando, textoVoz, reducir, adn, etiqueta, v, a],
  );
  const { clip, fotograma } = useMovimiento(gesto, { personalidadId: bot.id, activo: visible && activo });
  const fila = clip?.rotaciones[fotograma];
  const balanceo = fila ? Math.max(-6, Math.min(6, (fila[0] ?? 0) * 45)) : 0;
  const respiracion = clip?.raiz?.[fotograma]?.[1] ?? 0;
  const vida = !reducir && clip
    ? { transform: `translateY(${(respiracion * 120).toFixed(1)}%) rotate(${balanceo.toFixed(1)}deg)`, transition: "transform 120ms linear" }
    : undefined;

  if (!formaConAdn(bot.cuerpo.forma)) {
    return <p role="status" className={cn("text-xs text-white/60", className)}>Este cuerpo no usa avatar 3D.</p>;
  }

  return (
    <div
      ref={caja}
      className={cn("relative inline-flex items-center justify-center overflow-hidden rounded-2xl bg-black/25 shadow-lg ring-1 ring-white/10", className)}
      style={{ width: tamano, height: tamano }}
      data-origen-adn={origen}
      data-nivel-movimiento={clip ? "activo" : "quieto"}
    >
      <div className="h-full w-full" style={vida}>
        <AvatarVivo
          adn={adnPintado}
          calidad={calidad ?? (bot.cuerpo.forma === "vrm" ? "vrm" : "vrm-ligero")}
          tamano={tamano}
        />
      </div>
      {aviso && !loading ? (
        <p role="status" className="absolute inset-x-1 bottom-1 rounded bg-black/65 px-1.5 py-0.5 text-center text-[10px] leading-tight text-white/80">
          {aviso}
        </p>
      ) : null}
    </div>
  );
}
