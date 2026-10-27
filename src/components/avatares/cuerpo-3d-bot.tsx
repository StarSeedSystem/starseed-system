"use client";

/**
 * BOT CON CUERPO 3D · `<Cuerpo3dBot>` (AV1011C). Contrato: architecture/astraura-avatares-3d.md §2, §6 y §12.
 *
 * Widget flotante del avatar de un bot: carga su ADN (`biblioteca:`), aplica la emoción EXPRESADA
 * (expresiones y aura) y, al hablar, mueve con `moverAvatar` (carácter del ADN) y sincroniza visemas.
 * Sin avatar real enseña la orbe y lo dice. Pausa al ocultarse y con `prefers-reduced-motion`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { AdnAvatar } from "@/lib/avatares/adn/adn";
import { adnConEmocion, gestoDeHabla, resolverAdnDeBot, visemasDeTexto, type Visema } from "@/lib/avatares/adaptadores/adn-de-bot";
import { moverAvatar } from "@/lib/avatares/movimiento/motor";
import { AvatarVivo } from "@/components/avatares/avatar-vivo";
import type { Bot, EstadoEmocional } from "@/lib/astraura-bots/tipos";

export interface Cuerpo3dBotProps {
  bot: Bot;
  emocion?: EstadoEmocional;
  hablando?: boolean;
  texto?: string;
  tamano?: number;
  className?: string;
}

const CALMA: EstadoEmocional = { emocion: "calma", valencia: 0, activacion: 0.25 };
const OBSERVAR = { threshold: 0.05 };

export function Cuerpo3dBot({ bot, emocion = CALMA, hablando = false, texto = "", tamano = 120, className }: Cuerpo3dBotProps) {
  const [adn, setAdn] = useState<AdnAvatar | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const [reducir, setReducir] = useState(false);
  const [visema, setVisema] = useState<Visema | null>(null);
  const caja = useRef<HTMLDivElement | null>(null);
  const botRef = useRef(bot);
  botRef.current = bot;

  useEffect(() => {
    let vivo = true;
    setAdn(null);
    void resolverAdnDeBot(botRef.current)
      .then((r) => { if (vivo) { setAdn(r.adn); setAviso(r.motivo ?? null); } })
      .catch(() => { if (vivo) setAviso("No se pudo cargar el ADN del bot."); });
    return () => { vivo = false; };
  }, [bot.id, bot.nombre, bot.cuerpo.forma, bot.cuerpo.avatarRef, bot.cuerpo.tono]);

  useEffect(() => {
    const el = caja.current;
    let enPantalla = true;
    const mirar = () => setVisible(enPantalla && !document.hidden);
    const io = el && typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([e]) => { enPantalla = !!e?.isIntersecting; mirar(); }, OBSERVAR)
      : null;
    if (el) io?.observe(el);
    mirar();
    document.addEventListener("visibilitychange", mirar);
    return () => { io?.disconnect(); document.removeEventListener("visibilitychange", mirar); };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const aplicar = () => setReducir(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  useEffect(() => {
    const actual = adn;
    if (!actual || !hablando || !texto.trim() || !visible || reducir) { setVisema(null); return; }
    let vivo = true, raf = 0, inicio = 0;
    const eventos = visemasDeTexto(texto);
    void moverAvatar(gestoDeHabla(actual, emocion, texto), { personalidadId: bot.id }).then((r) => {
      const clip = r.clip;
      if (!vivo || !clip || !clip.rotaciones.length) return;
      const paso = (t: number) => {
        if (!vivo) return;
        if (!inicio) inicio = t;
        const ms = t - inicio, total = Math.max(1, clip.duracionMs);
        const f = Math.min(clip.rotaciones.length - 1, Math.floor((ms / total) * clip.rotaciones.length));
        const fila = clip.rotaciones[f] ?? [];
        if (caja.current) {
          const respira = ((clip.raiz?.[f]?.[1] ?? 0) * 60).toFixed(2), giro = ((fila[0] ?? 0) * 40).toFixed(2);
          caja.current.style.transform = `translateY(${respira}%) rotate(${giro}deg)`;
        }
        setVisema(eventos.find((e) => ms >= e.desdeMs && ms < e.hastaMs)?.visema ?? null);
        if (ms < total) raf = requestAnimationFrame(paso);
        else { setVisema(null); if (caja.current) caja.current.style.transform = ""; }
      };
      raf = requestAnimationFrame(paso);
    }).catch(() => undefined);
    return () => {
      vivo = false;
      if (raf) cancelAnimationFrame(raf);
      if (caja.current) caja.current.style.transform = "";
      setVisema(null);
    };
  }, [adn, hablando, texto, visible, reducir, emocion, bot.id]);

  const visto = useMemo(
    () => (adn ? adnConEmocion(adn, emocion, hablando ? visema : undefined) : null),
    [adn, emocion, hablando, visema],
  );

  return (
    <div ref={caja} data-cuerpo-3d={bot.cuerpo.forma} data-hablando={hablando && !reducir ? "si" : "no"}
      className={cn("relative inline-block shrink-0 rounded-2xl border border-white/10 bg-black/25 p-1 transition-transform duration-100", className)}
      style={{ width: tamano, height: tamano }}>
      {visto
        ? <AvatarVivo adn={visto} calidad="vrm" tamano={tamano - 8} />
        : <div className="h-full w-full animate-pulse rounded-xl bg-white/5" aria-hidden />}
      {aviso ? <p className="absolute inset-x-1 bottom-1 rounded bg-black/65 px-1.5 py-0.5 text-center text-[10px] leading-tight text-white/80">{aviso}</p> : null}
      <span className="sr-only">{`Avatar de ${bot.nombre}. Emoción: ${emocion.emocion}.`}</span>
    </div>
  );
}
