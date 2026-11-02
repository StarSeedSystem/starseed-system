"use client";

/**
 * CUERPO 3D DE UN BOT (AV1011C). Contrato: architecture/astraura-avatares-3d.md §2, §6 y §12.
 *
 * La orbe de un bot puede ser su avatar 3D: este componente monta el visor de ADN que
 * ya existe (`AvatarVivo`), le pasa la emoción del bot y la escucha hablar. Si el ADN
 * aún no tiene malla VRM, se ve su orbe y se dice con su motivo; nunca se finge un 3D.
 *
 * Reglas del área:
 *  · Tamaño de widget flotante (por defecto 96 px), sin secuestrar la pantalla.
 *  · Se pausa cuando no se ve (pestaña oculta o fuera de pantalla): no pide gestos.
 *  · Con `prefers-reduced-motion` no hay gesto ni visemas: el avatar se queda quieto.
 *  · El ADN guardado se lee UNA vez por sesión y revisión (el hook del almacén).
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { AvatarVivo } from "@/components/avatares/avatar-vivo";
import { prefiereReducirMovimiento, useMovimiento } from "@/components/avatares/usar-movimiento";
import { useAdnEntry } from "@/lib/avatares/adaptadores/almacen-adn";
import {
  VISEMAS,
  adnConEmocion,
  adnDeBot,
  gestoConMovimiento,
  refAdnDeBot,
  visemasDeTexto,
} from "@/lib/avatares/adaptadores/adn-de-bot";
import { escucharGestoVoz } from "@/lib/avatares/movimiento/sincronia-voz";
import type { Gesto } from "@/lib/avatares/movimiento/motor";
import type { AvatarCalidad } from "@/lib/xr/calidad-perfiles";
import type { Bot, EstadoEmocional } from "@/lib/astraura-bots/tipos";

export interface Cuerpo3dBotProps {
  bot: Bot;
  /** Emoción expresada del bot (valencia y activación de `astraura-bots/tipos`). */
  estado?: EstadoEmocional;
  /** Nivel de avatar de XR; por defecto «vrm-ligero», el de un widget. */
  calidad?: AvatarCalidad;
  /** Lado del widget en píxeles (48–320). Por defecto 96. */
  tamano?: number;
  /** El bot está hablando (además del evento `starseed:gesto`). */
  hablando?: boolean;
  /** Texto que dice ahora, para los visemas. */
  texto?: string;
  /** Personalidad dueña del turno de voz; si se da, filtra el evento del puente. */
  personalidadId?: string;
  className?: string;
  /** ADN ya leído por quien monta; si falta, se lee una vez del almacén. */
  adnGuardado?: unknown;
}

const TAMANO_MIN = 48;
const TAMANO_MAX = 320;
const MS_POR_VISEMA = 140;

export function Cuerpo3dBot({
  bot,
  estado,
  calidad = "vrm-ligero",
  tamano = 96,
  hablando = false,
  texto,
  personalidadId,
  className,
  adnGuardado,
}: Cuerpo3dBotProps) {
  const caja = React.useRef<HTMLDivElement | null>(null);
  const temporizador = React.useRef<number | null>(null);

  /* ── ADN: el guardado de este bot, leído una vez por el almacén ── */
  const ref = React.useMemo(() => refAdnDeBot(bot), [bot]);
  const { entry } = useAdnEntry(ref ?? "");
  const guardado = React.useMemo(() => {
    if (adnGuardado !== undefined) return adnGuardado;
    if (!entry?.raw) return null;
    try {
      return JSON.parse(entry.raw) as unknown;
    } catch {
      return null;
    }
  }, [adnGuardado, entry?.raw]);
  const adn = React.useMemo(() => adnDeBot(bot, guardado), [bot, guardado]);

  /* ── Accesibilidad: prefers-reduced-motion manda sobre todo ── */
  const [reducir, setReducir] = React.useState(() => prefiereReducirMovimiento());
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const alCambiar = () => setReducir(mq.matches);
    alCambiar();
    mq.addEventListener?.("change", alCambiar);
    return () => mq.removeEventListener?.("change", alCambiar);
  }, []);

  /* ── Pausa al ocultarse: pestaña escondida o widget fuera de pantalla ── */
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
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

  /* ── Habla: el evento del puente de voz trae el gesto y su duración ── */
  const [gesto, setGesto] = React.useState<Gesto | null>(null);
  const [textoGesto, setTextoGesto] = React.useState("");
  React.useEffect(() => {
    if (reducir) return;
    return escucharGestoVoz((d) => {
      if (!visible) return;
      if (personalidadId && d.personalidadId && d.personalidadId !== personalidadId) return;
      setGesto(gestoConMovimiento(d.gesto, adn.movimiento));
      setTextoGesto(d.texto ?? "");
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
      temporizador.current = window.setTimeout(() => {
        setGesto(null);
        setTextoGesto("");
        temporizador.current = null;
      }, Math.max(400, d.duracionMs));
    });
  }, [adn.movimiento, personalidadId, reducir, visible]);

  React.useEffect(() => () => {
    if (temporizador.current !== null) window.clearTimeout(temporizador.current);
  }, []);

  const hablandoAhora = hablando || gesto !== null;
  const textoHabla = texto ?? textoGesto;
  const { clip, fotograma, nivel } = useMovimiento(gesto, { personalidadId, activo: visible });

  /* ── Visemas: uno por vocal, mientras el bot habla ── */
  const visemas = React.useMemo(() => visemasDeTexto(textoHabla), [textoHabla]);
  const [indiceVisema, setIndiceVisema] = React.useState(0);
  React.useEffect(() => {
    setIndiceVisema(0);
    if (!hablandoAhora || reducir || visemas.length === 0) return;
    const id = window.setInterval(
      () => setIndiceVisema((i) => (i + 1) % visemas.length),
      MS_POR_VISEMA,
    );
    return () => window.clearInterval(id);
  }, [hablandoAhora, reducir, visemas]);

  /* ── ADN que se dibuja: emoción + visema del momento ── */
  const adnEmocion = React.useMemo(() => (estado ? adnConEmocion(adn, estado) : adn), [adn, estado]);
  const adnVivo = React.useMemo(() => {
    if (!hablandoAhora || reducir || visemas.length === 0) return adnEmocion;
    const visema = visemas[Math.min(indiceVisema, visemas.length - 1)];
    const expresionBase = { ...adnEmocion.expresionBase };
    for (const v of VISEMAS) delete expresionBase[v];
    expresionBase[visema] = 1;
    return { ...adnEmocion, expresionBase };
  }, [adnEmocion, hablandoAhora, reducir, visemas, indiceVisema]);

  /* ── Movimiento honesto: el clip mueve el widget, no finge huesos ── */
  const movimiento = React.useMemo(() => {
    if (reducir || !visible || !clip) return { transform: "none", transition: "none" };
    const fila = clip.rotaciones[fotograma] ?? [];
    const parte = fila.slice(0, 6);
    const media = parte.length > 0 ? parte.reduce((a, b) => a + b, 0) / parte.length : 0;
    const giro = Math.max(-2.5, Math.min(2.5, media * 60));
    const raizY = clip.raiz?.[fotograma]?.[1] ?? 0;
    const flotar = Math.max(-2, Math.min(2, -raizY * 40));
    return {
      transform: `translateY(${flotar.toFixed(2)}px) rotate(${giro.toFixed(2)}deg)`,
      transition: "transform 90ms linear",
    };
  }, [clip, fotograma, reducir, visible]);

  const sinMalla = adn.base.tipo !== "vrm";
  const aviso = sinMalla
    ? "Aún no tiene malla VRM: se ve su orbe con su aura."
    : reducir
      ? "Movimiento reducido: se queda quieto."
      : nivel === "quieto"
        ? "Sin motor de movimiento: se queda quieto."
        : null;
  const dim = Math.max(TAMANO_MIN, Math.min(TAMANO_MAX, Math.round(tamano)));

  return (
    <div
      ref={caja}
      role="group"
      aria-label={`${bot.nombre}${estado ? `: ${estado.emocion}` : ""}${aviso ? `. ${aviso}` : ""}`}
      title={aviso ?? `Avatar 3D de ${bot.nombre}`}
      data-bot={bot.id}
      data-forma={bot.cuerpo.forma}
      data-emocion={estado?.emocion}
      data-base={adn.base.tipo}
      className={cn("relative inline-block select-none", className)}
      style={{ width: dim, height: dim }}
    >
      <div className="h-full w-full will-change-transform" style={movimiento}>
        <AvatarVivo adn={adnVivo} calidad={calidad} tamano={dim} />
      </div>
      {aviso && dim >= 120 && (
        <p className="pointer-events-none absolute inset-x-0 bottom-0 rounded bg-black/65 px-1 py-0.5 text-center text-[10px] leading-tight text-white/80">
          {aviso}
        </p>
      )}
      <span className="sr-only">{`${bot.nombre}: ${estado?.emocion ?? "sin emoción"}. ${adn.nombre}.`}</span>
    </div>
  );
}
