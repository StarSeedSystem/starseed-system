"use client";
/**
 * CUERPO 3D DEL BOT (AV1011C). Contrato: architecture/astraura-avatares-3d.md §2, §3 y §8.
 * La orbe del bot puede ser su avatar 3D: el ADN de la Biblioteca (o el de por defecto), con la emoción
 * expresada moviendo expresiones y aura, visemas al hablar y gestos del motor único «Vida StarSeed».
 * Tamaño de widget flotante, pausa al ocultarse y quieto total con `prefers-reduced-motion`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AvatarVivo } from "@/components/avatares/avatar-vivo";
import { prefiereReducirMovimiento, useMovimiento } from "@/components/avatares/usar-movimiento";
import { adnConEmocion, adnDeBot, gestoDeBot, usaAvatar3d } from "@/lib/avatares/adaptadores/adn-de-bot";
import type { AdnAvatar, Expresion } from "@/lib/avatares/adn/adn";
import { estimarDuracionAudioMs } from "@/lib/avatares/movimiento/sincronia-voz";
import type { AvatarCalidad } from "@/lib/xr/calidad-perfiles";
import type { Bot, EstadoEmocional } from "@/lib/astraura-bots/tipos";
import { cn } from "@/lib/utils";
export interface Cuerpo3dBotProps {
  bot: Bot;
  /** Emoción EXPRESADA del bot; sin ella, calma en reposo. */
  emocion?: EstadoEmocional;
  /** Lo que está diciendo ahora mismo (para visemas y gesto). */
  texto?: string | null;
  hablando?: boolean;
  /** Tamaño del widget flotante en píxeles. */
  tamano?: number;
  calidad?: AvatarCalidad;
  className?: string;
}
const EMOCION_EN_REPOSO: EstadoEmocional = { emocion: "calma", valencia: 0, activacion: 0.2 };
const VISEMA_POR_VOCAL: Record<string, Expresion | undefined> = { a: "aa", e: "ee", i: "ih", o: "oh", u: "ou" };
/** Vocales del texto → visemas VRM (sin tildes); la duración la estima `sincronia-voz`. */
function visemasDeTexto(texto: string): Expresion[] {
  return [...texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")]
    .map((c) => VISEMA_POR_VOCAL[c])
    .filter((v): v is Expresion => v !== undefined);
}

export function Cuerpo3dBot({
  bot,
  emocion = EMOCION_EN_REPOSO,
  texto = null,
  hablando = false,
  tamano = 160,
  calidad = "vrm",
  className,
}: Cuerpo3dBotProps) {
  const caja = useRef<HTMLDivElement | null>(null);
  const [adn, setAdn] = useState<AdnAvatar | null>(null);
  const [visible, setVisible] = useState(true);
  const [reducir, setReducir] = useState(false);
  const [visema, setVisema] = useState<Expresion | null>(null);
  const { emocion: nombreEmocion, valencia, activacion } = emocion;
  const claveAdn = `${bot.id}|${bot.cuerpo.forma}|${bot.cuerpo.avatarRef ?? ""}|${bot.cuerpo.tono}|${bot.nombre}`;

  useEffect(() => {
    let vivo = true;
    setAdn(null);
    void adnDeBot(bot).then((a) => { if (vivo) setAdn(a); }).catch(() => { if (vivo) setAdn(null); });
    return () => { vivo = false; };
    // Cada ADN se lee una vez por sesión y revisión: la clave resume lo que lo identifica.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveAdn]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const aplicar = () => setReducir(prefiereReducirMovimiento());
    aplicar();
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    mq?.addEventListener?.("change", aplicar);
    return () => mq?.removeEventListener?.("change", aplicar);
  }, []);

  useEffect(() => {
    const el = caja.current;
    let enPantalla = true;
    const mirar = () => setVisible(enPantalla && !document.hidden);
    const io = el && typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([e]) => { enPantalla = !!e?.isIntersecting; mirar(); }) : null;
    if (el) io?.observe(el);
    document.addEventListener("visibilitychange", mirar);
    return () => { io?.disconnect(); document.removeEventListener("visibilitychange", mirar); };
  }, []);

  const adnEmocion = useMemo(() => (adn ? adnConEmocion(adn, { emocion: nombreEmocion, valencia, activacion }) : null), [adn, nombreEmocion, valencia, activacion]);
  const activo = visible && !reducir;
  const gesto = useMemo(() => (adn && hablando && activo ? gestoDeBot(adn, { emocion: nombreEmocion, valencia, activacion }, texto) : null), [adn, nombreEmocion, valencia, activacion, texto, hablando, activo]);
  const { clip, nivel, fotograma } = useMovimiento(gesto, { personalidadId: bot.id, activo });
  const visemas = useMemo(() => (hablando && texto ? visemasDeTexto(texto) : []), [hablando, texto]);
  useEffect(() => {
    if (!activo || visemas.length === 0) { setVisema(null); return; }
    let i = 0;
    setVisema(visemas[0]);
    const cada = Math.max(80, Math.round(estimarDuracionAudioMs(texto ?? "") / visemas.length));
    const id = setInterval(() => { i = (i + 1) % visemas.length; setVisema(visemas[i]); }, cada);
    return () => clearInterval(id);
  }, [visemas, texto, activo]);

  const adnVisible = useMemo(() => (adnEmocion && visema ? { ...adnEmocion, expresionBase: { ...adnEmocion.expresionBase, [visema]: 0.85 } } : adnEmocion), [adnEmocion, visema]);
  const vida = useMemo(() => {
    const f = clip?.rotaciones[fotograma];
    if (!activo || !f) return undefined;
    const raiz = clip?.raiz?.[fotograma];
    return { transform: `translateY(${((raiz?.[1] ?? 0) * 140).toFixed(2)}%) rotate(${((f[0] ?? 0) * 45).toFixed(2)}deg)` };
  }, [clip, fotograma, activo]);

  if (!usaAvatar3d(bot)) return null;
  return (
    <div ref={caja} className={cn("relative inline-block select-none", className)} style={{ width: `${tamano}px`, height: `${tamano}px` }}
      role="img" aria-label={`Avatar 3D del bot ${bot.nombre}`} data-nivel-movimiento={nivel ?? undefined} data-visible={visible}>
      {adnVisible ? (
        <div className="h-full w-full" style={vida}>
          <AvatarVivo adn={adnVisible} calidad={calidad} tamano={tamano} className="h-full w-full" />
        </div>
      ) : (
        <div className={cn("flex h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-xs text-white/60", reducir ? "" : "animate-pulse")} role="status">
          Cargando el avatar del bot…
        </div>
      )}
    </div>
  );
}
