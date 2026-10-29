"use client";
/**
 * Carga de StarSeed · la animación de carga 3D de la Protomolécula con el símbolo oficial DENTRO de su esfera
 * (petición de Alex, 2026-10-25: «en la carga de "Abriendo StarSeed…" cambia la bola por la animación de carga
 * 3D con el símbolo StarSeed en el centro, dentro de la esfera 3D de la animación de carga»).
 *
 * Capas, de fondo a frente (todas centradas en un cuadrado de 132–192 px según la pantalla):
 *   1. el cuerpo de la esfera: un disco de cristal líquido (la mitad del diámetro) donde vive el símbolo;
 *   2. halo y flor de la vida en SVG (19 círculos con los colores de la Trinidad, girando por CSS). Es lo primero
 *      que se pinta —la ruta raíz no espera a nada— y lo ÚNICO que se ve sin WebGL, con movimiento reducido o en
 *      modo eco: nunca una página en blanco;
 *   3. el símbolo oficial (`/starseed-symbol.png`), que respira suave, con el 40 % del alto de la escena;
 *   4. el lienzo 3D: el mismo motor de la orbe de la Protomolécula en su modo `cargando` y con el acabado `carga`
 *      (esfera de puntos de Fibonacci y cubo de Metatrón que se dibuja), por delante del símbolo para que quede
 *      DENTRO de la esfera.
 *
 * three.js entra por import dinámico y solo si la carga dura (RETRASO_3D_MS): si la redirección es rápida, ni se
 * descarga ni se enciende nada. Con el motor listo, el lienzo se funde sobre lo anterior (solo `opacity`).
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { circulosDeLaFlor, radioCirculo } from "@/lib/carga/flor-de-la-vida";
import { PALETAS } from "@/lib/protomolecula/orbe4d/coreografia";
import type { MotorOrbe } from "@/lib/protomolecula/orbe4d/motor";
import { respiracion } from "@/lib/design/movimiento-starseed";
import { cn } from "@/lib/utils";

/** Alto del símbolo respecto al lado de la escena (el símbolo es vertical, 2:3). */
export const ALTO_SIMBOLO = 0.4;
/** Diámetro del disco de cristal respecto al lado de la escena: la esfera de puntos mide ≈ 0,53. */
export const DIAMETRO_ESFERA = 0.5;
/** Espera antes de encender el 3D: una carga más corta que esto se queda con el respaldo y no descarga nada. */
export const RETRASO_3D_MS = 200;

type Fase = "respaldo" | "3d" | "estatico";

/** La paleta de la raíz del OS: azur, esmeralda, ámbar y carmesí (Zenith, Horizon, Logic y Anchor), como el símbolo. */
const PALETA = PALETAS.trinity;

/**
 * Halo y flor de la vida (19 círculos) en SVG: el primer cuadro, el respaldo estático y, con el 3D encendido, el
 * fondo que sigue ahí (gira por CSS; el motor dibuja solo la esfera de puntos y el cubo de Metatrón).
 */
function RespaldoSVG({ quieto }: { quieto: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const r = radioCirculo();
  const circulos = useMemo(() => circulosDeLaFlor(), []);
  return (
    <svg
      data-testid="carga-respaldo"
      aria-hidden="true"
      viewBox="-50 -50 100 100"
      className="pointer-events-none absolute inset-0 size-full"
    >
      <defs>
        <radialGradient id={`halo-${id}`} cx="0" cy="0" r="50" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={PALETA.halo} stopOpacity="0.34" />
          <stop offset="0.55" stopColor={PALETA.halo} stopOpacity="0.1" />
          <stop offset="1" stopColor={PALETA.halo} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle r="50" fill={`url(#halo-${id})`} />
      <g
        className={cn("origin-center", !quieto && "motion-safe:animate-[spin_89s_linear_infinite]")}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        fill="none"
        strokeWidth="0.4"
      >
        {circulos.map((c) => (
          <circle key={`${c.x.toFixed(2)}:${c.y.toFixed(2)}`} cx={c.x} cy={c.y} r={c.r} stroke={c.color} strokeOpacity="0.55" />
        ))}
        <circle r={3 * r} stroke={PALETA.halo} strokeOpacity="0.5" />
      </g>
    </svg>
  );
}

export interface CargaStarSeedProps {
  /** Texto debajo de la esfera. */
  texto?: string;
  /** Lo que lee un lector de pantalla (por defecto, el texto sin los puntos suspensivos). */
  etiqueta?: string;
  className?: string;
}

export function CargaStarSeed({ texto = "Abriendo StarSeed…", etiqueta = "Abriendo StarSeed", className }: CargaStarSeedProps) {
  const [fase, setFase] = useState<Fase>("respaldo");
  const escena = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  /** El envoltorio del símbolo: ahí corre la respiración por WAAPI. */
  const respiraRef = useRef<HTMLSpanElement>(null);
  /** La respiración en curso, para poder apagarla al entrar el modo quieto. */
  const animRespira = useRef<Animation | null>(null);

  useEffect(() => {
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const quieto = () => Boolean(mq?.matches) || document.documentElement.dataset.perf === "eco";
    // Movimiento reducido o modo eco: respaldo estático, sin descargar ni encender el 3D.
    if (quieto()) { setFase("estatico"); return; }

    let vivo = true;
    let motor: MotorOrbe | null = null;
    let observador: ResizeObserver | null = null;
    const parar = () => {
      observador?.disconnect();
      observador = null;
      motor?.destruir();
      motor = null;
    };
    const alCambiarMovimiento = () => { if (quieto()) { parar(); setFase("estatico"); } };

    const arrancar = setTimeout(() => {
      import("@/lib/protomolecula/orbe4d/motor")
        .then(({ crearMotor }) => {
          const canvas = lienzo.current;
          const caja = escena.current;
          if (!vivo || !canvas || !caja) return;
          const lado = Math.round(caja.getBoundingClientRect().width) || 160;
          // `trinity` = la paleta de la raíz del OS (azur, esmeralda, ámbar y carmesí, como el símbolo).
          const m = crearMotor(canvas, { estilo: "expresiva", registro: "trinity", reducido: false, tamano: lado, acabado: "carga" });
          if (!m) { setFase("estatico"); return; } // sin WebGL: se queda el respaldo
          motor = m;
          // Directo al modo `cargando`, sin la siembra de encendido: ese ovillo de puntos tapaba el símbolo un segundo.
          m.fijarModo("cargando");
          setFase("3d");
          if (typeof ResizeObserver !== "undefined") {
            observador = new ResizeObserver(() => {
              const ancho = Math.round(caja.getBoundingClientRect().width);
              if (ancho > 0) m.redimensionar(ancho);
            });
            observador.observe(caja);
          }
        })
        .catch(() => { if (vivo) setFase("estatico"); });
    }, RETRASO_3D_MS);

    mq?.addEventListener?.("change", alCambiarMovimiento);
    return () => {
      vivo = false;
      clearTimeout(arrancar);
      mq?.removeEventListener?.("change", alCambiarMovimiento);
      parar();
    };
  }, []);

  // Respiración del símbolo tomada de la biblioteca de movimiento StarSeed
  // (`respiracion()`: escala 1 → 1,03 en 5 s con la curva orgánica del ADN, ida
  // y vuelta). La clase CSS `ss-respirar` se queda como respaldo al primer
  // cuadro y para navegadores sin WAAPI; si la biblioteca puede correr, le cede
  // el turno (la de CSS respiraba a 1,05: el ADN pide 1,03). Con movimiento
  // reducido o modo eco la fase es «estático» y el símbolo se queda quieto.
  useEffect(() => {
    if (fase === "estatico") {
      animRespira.current?.cancel();
      animRespira.current = null;
      return;
    }
    const span = respiraRef.current;
    // Ya en marcha (cambio «respaldo» → «3d») o navegador sin WAAPI: nada.
    if (!span || animRespira.current || typeof span.animate !== "function") return;
    // El respaldo de CSS deja el turno: una sola respiración, la de la biblioteca.
    span.getAnimations().forEach((a) => { a.cancel(); });
    const r = respiracion();
    animRespira.current = span.animate(r.keyframes as unknown as Keyframe[], {
      duration: r.duracionMs,
      easing: r.curva,
      direction: r.direccion,
      iterations: r.iteraciones,
    });
  }, [fase]);

  // Al desmontar (el acceso se resolvió) se suelta la respiración.
  useEffect(() => () => {
    animRespira.current?.cancel();
    animRespira.current = null;
  }, []);

  return (
    <div role="status" aria-label={etiqueta} data-fase={fase} data-testid="carga-starseed" className={cn("flex flex-col items-center gap-2", className)}>
      <div
        ref={escena}
        data-testid="carga-escena"
        className="relative size-[132px] min-[400px]:size-[148px] min-[640px]:size-[176px] min-[1024px]:size-[192px]"
      >
        {/* 1 · el cuerpo de la esfera: cristal líquido donde vive el símbolo */}
        <span
          aria-hidden="true"
          data-testid="carga-esfera"
          className="pointer-events-none absolute rounded-full"
          style={{
            inset: `${((1 - DIAMETRO_ESFERA) / 2) * 100}%`,
            background: "radial-gradient(circle at 36% 28%, rgba(248,249,250,0.30), rgba(248,249,250,0.10) 42%, rgba(0,127,255,0.10) 100%)",
            boxShadow: "inset 0 0 0 1px rgba(248,249,250,0.20), inset 0 -10px 22px rgba(0,127,255,0.16), 0 0 36px rgba(0,127,255,0.20)",
          }}
        />
        {/* 2 · halo y flor de la vida en SVG: lo primero que se pinta y lo único que se ve sin 3D */}
        <RespaldoSVG quieto={fase === "estatico"} />
        {/* 3 · el símbolo oficial, centrado dentro de la esfera, respirando suave (la animación se apaga con movimiento reducido) */}
        <span data-testid="carga-simbolo" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span ref={respiraRef} className="ss-respirar block" style={{ height: `${ALTO_SIMBOLO * 100}%` }}>
            <Image
              src="/starseed-symbol.png"
              alt="StarSeed"
              width={1000}
              height={1497}
              priority
              sizes="(min-width: 1024px) 77px, 60px"
              className="block"
              style={{ height: "100%", width: "auto" }}
            />
          </span>
        </span>
        {/* 4 · el lienzo 3D, por delante: la esfera de puntos y el cubo de Metatrón pasan por delante del símbolo */}
        {fase !== "estatico" && (
          <canvas
            ref={lienzo}
            aria-hidden="true"
            data-testid="carga-3d"
            className={cn("pointer-events-none absolute inset-0 size-full transition-opacity duration-300", fase === "3d" ? "opacity-100" : "opacity-0")}
          />
        )}
      </div>
      <span className="text-xs tracking-[0.3em] text-foreground/60 uppercase">{texto}</span>
    </div>
  );
}

export default CargaStarSeed;
