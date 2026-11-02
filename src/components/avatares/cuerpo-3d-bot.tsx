"use client";

/**
 * CUERPO 3D DE UN BOT (AV1011C). Contrato: architecture/astraura-avatares-3d.md §2, §6, §8 y
 * architecture/astraura-bots.md §12 (la orbe del bot puede ser su avatar 3D).
 *
 * Widget compacto que viste el ADN del bot (`biblioteca:…`) con `AvatarVivo`:
 *  · la emoción expresada mueve la cara (una sola expresión) y el aura si está ligada;
 *  · al hablar, el texto se convierte en visemas (boca) y en un gesto para el motor único
 *    `moverAvatar`, con el carácter de `adn.movimiento`;
 *  · con `prefers-reduced-motion` no se anima nada y se dice;
 *  · la pestaña oculta o el widget fuera de pantalla lo congelan (no se gasta batería);
 *  · si no hay ADN guardado se ve su orbe y se dice el motivo (basta de ilusiones).
 * Lee el ADN una vez por sesión y revisión; escucha el almacén, no sondea.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { AvatarVivo } from "@/components/avatares/avatar-vivo";
import { useMovimiento } from "@/components/avatares/usar-movimiento";
import { escucharGestoVoz } from "@/lib/avatares/movimiento/sincronia-voz";
import type { MovimientoClip } from "@/lib/avatares/movimiento/motor";
import {
  adnConEmocion,
  adnConVisema,
  adnDeBot,
  esFormaAvatar3d,
  gestoDeBot,
  refAdnDeBot,
  visemasDeTexto,
} from "@/lib/avatares/adaptadores/adn-de-bot";
import { loadAdnEntry, parseAdnEntry, suscribirCambiosAdn } from "@/lib/avatares/adaptadores/almacen-adn";
import type { AdnAvatar } from "@/lib/avatares/adn/adn";
import type { Bot, EstadoEmocional } from "@/lib/astraura-bots/tipos";

/** Estado de reposo honesto: no hay lectura emocional si quien monta no la tiene. */
const ESTADO_REPOSO: EstadoEmocional = { emocion: "calma", valencia: 0.1, activacion: 0.3 };

/** Un ADN leído se guarda por (ref, revisión): una lectura por sesión y revisión. */
const cacheAdn = new Map<string, AdnAvatar>();

export interface Cuerpo3dBotProps {
  bot: Bot;
  estado?: EstadoEmocional;
  /** Texto que está diciendo ahora; `null`/`undefined` = callado. */
  hablando?: string | null;
  /** `false` lo congela (además de la pestaña oculta y de `prefers-reduced-motion`). */
  visible?: boolean;
  /** Lado del widget en píxeles (tamaño de widget flotante por defecto). */
  tamano?: number;
  className?: string;
}

/** Preferencia de accesibilidad del sistema (SSR-safe). */
function prefiereReducir(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Proyección 2,5D del clip sobre el contenedor del avatar (la raíz respira y el torso balancea). */
function estiloDelClip(
  clip: MovimientoClip | null,
  fotograma: number,
  adn: AdnAvatar,
  reducir: boolean,
): CSSProperties {
  if (reducir || !clip) return {};
  const rot = clip.rotaciones[fotograma] ?? [];
  const raiz = clip.raiz?.[fotograma] ?? [];
  const amplitud = 0.4 + 0.6 * adn.movimiento.amplitud;
  const balanceo = Math.min(8, Math.max(-8, (rot[0] ?? 0) * 30 * amplitud));
  const respiracion = Math.min(4, Math.max(-4, (raiz[1] ?? 0) * 100));
  return {
    transform: `translateY(${respiracion.toFixed(2)}%) rotate(${balanceo.toFixed(2)}deg)`,
    willChange: "transform",
  };
}

export function Cuerpo3dBot({
  bot,
  estado,
  hablando,
  visible = true,
  tamano = 96,
  className,
}: Cuerpo3dBotProps) {
  const caja = useRef<HTMLDivElement | null>(null);
  const botVivo = useRef(bot);
  botVivo.current = bot;
  const refDependiente = refAdnDeBot(bot);
  const [adn, setAdn] = useState<AdnAvatar>(() => adnDeBot(bot));
  const [motivo, setMotivo] = useState<string | null>(null);
  const [textoVoz, setTextoVoz] = useState("");
  const [oculto, setOculto] = useState(false);
  const [enPantalla, setEnPantalla] = useState(true);
  const [reducir, setReducir] = useState(prefiereReducir);
  const [indiceVisema, setIndiceVisema] = useState(0);

  // El ADN se lee al montar y solo cuando el almacén avisa (esta pestaña u otra): ni sondeos ni bucles.
  useEffect(() => {
    let vivo = true;
    const aplicar = async () => {
      const actual = botVivo.current;
      const ref = refAdnDeBot(actual);
      let guardado: AdnAvatar | null = null;
      if (ref) {
        const entrada = await loadAdnEntry(ref);
        if (entrada) {
          const clave = `${ref}@${entrada.rev}`;
          guardado = cacheAdn.get(clave) ?? (await parseAdnEntry(entrada));
          if (guardado) cacheAdn.set(clave, guardado);
        }
      }
      if (!vivo) return;
      setAdn(adnDeBot(actual, guardado ?? undefined));
      setMotivo(ref && !guardado ? "No hay un ADN guardado para este bot: se ve su orbe." : null);
    };
    void aplicar();
    const dejarDeEscuchar = suscribirCambiosAdn(() => void aplicar());
    return () => {
      vivo = false;
      dejarDeEscuchar();
    };
    // Se relee solo si cambia la identidad o la referencia del ADN, no en cada render del padre.
  }, [bot.id, bot.nombre, bot.cuerpo.forma, refDependiente, bot.cuerpo.tono]);

  // Pestaña oculta o widget fuera de pantalla: se congela (no se anima lo que nadie ve).
  useEffect(() => {
    const mirar = () => setOculto(typeof document !== "undefined" && document.hidden);
    mirar();
    document.addEventListener("visibilitychange", mirar);
    return () => document.removeEventListener("visibilitychange", mirar);
  }, []);
  useEffect(() => {
    const el = caja.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entrada]) => setEnPantalla(!!entrada?.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [bot.cuerpo.forma]);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      return;
    }
    const aplicar = () => setReducir(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  const activo = visible && !oculto && enPantalla;
  const texto = (hablando ?? textoVoz) || "";

  // La voz del OS avisa por el puente de `sincronia-voz.ts`; el bot solo atiende su turno.
  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    const dejarDeEscuchar = escucharGestoVoz((detalle) => {
      if (detalle.personalidadId && detalle.personalidadId !== bot.id) return;
      setTextoVoz(detalle.texto ?? "");
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(() => setTextoVoz(""), Math.max(600, detalle.duracionMs));
    });
    return () => {
      dejarDeEscuchar();
      if (temporizador) clearTimeout(temporizador);
    };
  }, [bot.id]);

  const visemas = useMemo(() => visemasDeTexto(texto), [texto]);
  useEffect(() => {
    setIndiceVisema(0);
    if (!texto || !activo || reducir || visemas.length === 0) return;
    // La boca cambia al ritmo de una sílaba aproximada; no es red ni sondeo, solo dibujo.
    const id = setInterval(() => setIndiceVisema((i) => (i + 1) % visemas.length), 140);
    return () => clearInterval(id);
  }, [texto, activo, reducir, visemas.length]);

  const conEmocion = useMemo(() => adnConEmocion(adn, estado ?? ESTADO_REPOSO), [adn, estado]);
  const visema = activo && !reducir && visemas.length > 0 ? visemas[indiceVisema % visemas.length] : null;
  const adnVisible = useMemo(
    () => (visema ? adnConVisema(conEmocion, visema, 0.85) : conEmocion),
    [conEmocion, visema],
  );
  const gesto = useMemo(
    () => (texto ? gestoDeBot(adn, texto, estado ?? ESTADO_REPOSO) : null),
    [adn, texto, estado],
  );
  const { clip, nivel, fotograma } = useMovimiento(gesto, { personalidadId: bot.id, activo });
  const estilo = estiloDelClip(clip, fotograma, adn, reducir);
  const dim = `${tamano}px`;

  if (!esFormaAvatar3d(bot.cuerpo.forma)) {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        Este bot no tiene cuerpo 3D: su forma es «{bot.cuerpo.forma}».
      </p>
    );
  }

  return (
    <figure className={cn("relative inline-flex w-fit flex-col items-center gap-1", className)}
      aria-label={`Avatar 3D de ${bot.nombre}${motivo ? `. ${motivo}` : ""}`}>
      <div ref={caja} className="overflow-hidden rounded-2xl bg-black/20 ring-1 ring-white/10"
        style={{ width: dim, height: dim }} data-nivel-movimiento={nivel ?? undefined}
        data-hablando={texto ? "si" : "no"}>
        <div className="h-full w-full" style={estilo}>
          <AvatarVivo adn={adnVisible} calidad="vrm" tamano={tamano} />
        </div>
      </div>
      <figcaption className="max-w-full truncate text-center text-[10px] leading-tight text-muted-foreground">
        {bot.nombre}
        {motivo
          ? ` · ${motivo}`
          : reducir
            ? " · movimiento reducido"
            : nivel === "quieto"
              ? " · quieto (sin motor de movimiento)"
              : ""}
      </figcaption>
    </figure>
  );
}
