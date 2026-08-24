"use client";

/**
 * AuroraOrb — el núcleo visual del Orbe de Aurora.
 * ----------------------------------------------------------------------------
 * ESFERA DE CRISTAL render-3D (lenguaje Crystal Liquid Glass del OS), SOLO
 * redonda, construida por capas de profundidad:
 *
 *   (a) GLOW NEÓN exterior ancho y DIFUMINADO (blur amplio) + halo interior:
 *       la expansión/intensidad respira con el VOLUMEN de la voz.
 *   (b) ARO cónico aurora (paleta Café + cardinales Trinity) girando LENTO.
 *   (c) NÚCLEO de cristal oscuro con volumen esférico: gradiente de
 *       profundidad, brillo especular doble y REFRACCIÓN sutil (luz que se
 *       curva en el borde inferior con el color dominante del momento).
 *   (d) CANVAS interior (clip circular) con una AURORA de cintas líquidas.
 *   (e) ESTRELLA ✦ de 4 puntas NÍTIDA con los cardinales Trinity exactos
 *       (arriba #007FFF Zenith · abajo #DC143C Anchor · izquierda #39FF14
 *       Horizon · derecha #FFBF00 Logic) y centro blanco brillante.
 *
 * ILUMINACIÓN EMOCIONAL (todo suavizado con lerp — hipnótico, líquido):
 *   · VOLUMEN  → energía: intensidad y expansión del glow (--aurora-energy).
 *   · TONO     → matiz: agudos empujan hacia azul/amarillo, graves hacia
 *                rojo/verde (tilt espectral continuo del analizador).
 *   · EMOCIÓN  → patrón: energía + velocidad de cambios (--aurora-flux).
 *                Picos rápidos → pulsos vivos y saturados; calma → ondas
 *                lentas y líquidas (el tiempo del fluido se acelera/decelera).
 *
 * FUENTES de luz, en orden de preferencia y SIN competir jamás con la voz:
 *   1. Micrófono real vía `acquireMicAnalyser()` — SINGLETON compartido que se
 *      conecta EN DIFERIDO (~900ms tras estabilizarse la escucha) para no
 *      abortar el SpeechRecognition. Si la escucha cae justo tras conectar
 *      (competencia detectada 2 veces), se deshabilita para toda la sesión.
 *   2. Latido por eventos `aurora:speak` del motor (onboundary del TTS).
 *   3. Respiración serena (reposo / prefers-reduced-motion / sin permisos).
 *
 * SSR-safe: nada toca window fuera de efectos. Cero re-renders de React en el
 * bucle de animación (CSS vars vía rAF).
 */

import { useEffect, useId, useRef, useState } from "react";
import {
  subscribeAuroraSpeak,
  acquireMicAnalyser,
  disableMicAnalyserForSession,
  type MicAnalyser,
} from "@/lib/aurora/aurora-orb-bus";
// Presencia Astraura 1.58 (Ola 5 · Adenda 157, SOP §5): punto/número discreto
// en una esquina de la orbe — ver el comentario junto a su uso más abajo.
import { Astraura158PresenceDot } from "@/components/astraura/astraura-158-presence";
// SOBERANÍA VISIBLE (Adenda 149 · ola 3): el orbe se tiñe con la CLASE DE
// ACCESO de la fuente que respondió de verdad. `router.ts` ya vive en el chunk
// global (lo importa `aurora-provider`) y `model-preferences` es autocontenido,
// así que esto no añade peso al arranque.
import { ROUTE_EVENT, lastRoute } from "@/ai/astraura/router";
import { llmSourceAccessClass, type ModelAccessClass } from "@/lib/astraura/model-preferences";
// ORBE CUÁNTICA (nuevo): renderizador de canvas al que este componente
// CONMUTA cuando la voz está activa (hablando/escuchando/pensando) — ver el
// bloque "ORBE CUÁNTICA — conmutación" más abajo. `aurora-orb.module.css` NO
// se toca: la capa cuántica se monta con estilos inline propios.
import { QuantumOrb, type QuantumOrbState } from "./quantum-orb";
import styles from "./aurora-orb.module.css";

type RGB = [number, number, number];

// Colores cardinales de la estrella (Trinity).
const C = {
  up: [0, 127, 255] as RGB,     // Zenith · azul
  down: [220, 20, 60] as RGB,   // Anchor · rojo
  left: [57, 255, 20] as RGB,   // Horizon · verde
  right: [255, 191, 0] as RGB,  // Logic · amarillo
};

// Paleta aurora del Café (mismos hex que el conic-gradient de .ssx-fab).
const CAFE = {
  lime: [159, 232, 112] as RGB,
  teal: [111, 230, 214] as RGB,
  sky: [127, 184, 255] as RGB,
  lavender: [201, 168, 255] as RGB,
  amber: [255, 194, 71] as RGB,
  coral: [255, 138, 92] as RGB,
};

const WHITE: RGB = [255, 255, 255];

/**
 * Cintas aurora del interior del núcleo. Cada cinta pertenece a una familia
 * espectral: con micrófono activo, los GRAVES encienden las cintas rojas y
 * verdes y los AGUDOS las azules y amarillas (los medios, la lavanda).
 */
const RIBBONS: Array<{
  family: "low" | "mid" | "high";
  base: RGB;      // color aurora (Café) en reposo
  cardinal: RGB;  // cardinal Trinity hacia el que se desplaza al excitarse
  yBase: number;  // altura base (fracción del diámetro)
  speed: number;  // velocidad de ondulación
  phase: number;  // desfase inicial
  tilt: number;   // inclinación propia (remolino)
}> = [
  { family: "high", base: CAFE.sky,      cardinal: C.up,    yBase: 0.3,  speed: 0.42, phase: 2.1, tilt: 0.12 },
  { family: "low",  base: CAFE.lime,     cardinal: C.left,  yBase: 0.42, speed: 0.55, phase: 0.0, tilt: -0.16 },
  { family: "mid",  base: CAFE.lavender, cardinal: C.up,    yBase: 0.52, speed: 0.35, phase: 3.3, tilt: 0.02 },
  { family: "high", base: CAFE.amber,    cardinal: C.right, yBase: 0.58, speed: 0.48, phase: 1.3, tilt: -0.1 },
  { family: "low",  base: CAFE.coral,    cardinal: C.down,  yBase: 0.7,  speed: 0.62, phase: 4.2, tilt: 0.2 },
];

/**
 * TINTE POR CLASE DE ACCESO (idea 2.13:178) — cardinal Trinity por clase:
 *   local (en el dispositivo) → Horizon verde · starseed → Zenith azul ·
 *   api-free → Logic ámbar · api-external (clave/pago) → Anchor rojo.
 * Es una MEZCLA DE BAJO PESO sobre el color dominante: informa de dónde vino la
 * última respuesta sin robarle un ápice de expresión a la energía de la voz.
 */
const ROUTE_TINT: Record<ModelAccessClass, RGB> = {
  local: C.left,
  starseed: C.up,
  "api-free": C.right,
  "api-external": C.down,
};
/** Peso MÁXIMO del tinte (se reduce aún más cuando hay energía de voz). */
const ROUTE_TINT_MAX = 0.16;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const mix = (a: RGB, b: RGB, k: number): RGB => [
  Math.round(lerp(a[0], b[0], k)),
  Math.round(lerp(a[1], b[1], k)),
  Math.round(lerp(a[2], b[2], k)),
];
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

/** Satura un color empujando sus canales lejos del gris (emoción alta). */
function saturate(c: RGB, k: number): RGB {
  if (k <= 0) return c;
  const m = (c[0] + c[1] + c[2]) / 3;
  const f = 1 + Math.min(1.2, k);
  return [clamp255(m + (c[0] - m) * f), clamp255(m + (c[1] - m) * f), clamp255(m + (c[2] - m) * f)];
}

/** Rueda de color continua entre las 4 puntas cardinales (0..1). */
function wheel(k: number): RGB {
  const seg = k * 4;
  if (seg < 1) return mix(C.up, C.right, seg);
  if (seg < 2) return mix(C.right, C.down, seg - 1);
  if (seg < 3) return mix(C.down, C.left, seg - 2);
  return mix(C.left, C.up, seg - 3);
}

interface AuroraOrbProps {
  size: number;
  speaking: boolean;
  listening: boolean;
  paused: boolean;
  supported: boolean;
  /** true → la voz quedó no disponible (el orbe se atenúa en carmesí sereno). */
  unavailable?: boolean;
  /**
   * (Aditivo, orbe cuántica) true → Aurora está "pensando" (generando la
   * respuesta, sin habla ni escucha activas todavía — p. ej. `aurora.thinking`
   * en `engine.ts`). Activa la conmutación a `<QuantumOrb>` igual que hablar
   * o escuchar. Opcional y por defecto `false`: quien no lo pase no ve ningún
   * cambio de comportamiento.
   */
  thinking?: boolean;
  /**
   * (Aditivo, orbe cuántica) id de la personalidad activa — colorea/da forma
   * a `<QuantumOrb>` (ver `quantum-orb-theme.ts`). Opcional: sin él, la orbe
   * cuántica usa la paleta "aurora" por defecto.
   */
  personaId?: string;
}

/**
 * Puente MIC (3 bandas) → espectro sintético de 24 bins para `<QuantumOrb>`.
 * `aurora-orb-bus.ts` deliberadamente NO expone el `Uint8Array` crudo del
 * `AnalyserNode` (ver su cabecera) — solo `level` + 3 bandas resumidas. En vez
 * de crear un analizador nuevo (prohibido por el encargo: ya existe UNO
 * compartido y crear otro reabriría el bug del "glitch loop" documentado
 * allí), expandimos esas 3 bandas reales a un espectro grueso pero genuino:
 * cada tercio de bins hereda la energía real de su banda, con una variación
 * determinista (sin `Math.random()` por frame) para que no se vea perfectamente
 * plano dentro de cada tercio.
 */
function expandBandsToFreq(bands: readonly [number, number, number]): Uint8Array {
  const [low, mid, high] = bands;
  const out = new Uint8Array(24);
  for (let i = 0; i < 24; i++) {
    const seg = i < 8 ? low : i < 16 ? mid : high;
    const jitter = ((i * 37) % 17) / 17 - 0.5;
    out[i] = Math.max(0, Math.min(255, Math.round((seg + jitter * 0.08) * 255)));
  }
  return out;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Retraso antes de conectar el analizador (deja estabilizarse la recognition). */
const MIC_ATTACH_DELAY_MS = 900;
/** Si la escucha cae antes de este lapso tras conectar, es COMPETENCIA. */
const MIC_COMPETITION_WINDOW_MS = 1500;

export function AuroraOrb({
  size,
  speaking,
  listening,
  paused,
  supported,
  unavailable = false,
  thinking = false,
  personaId,
}: AuroraOrbProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Ids únicos para los gradientes SVG (sin ":" — deben ser válidos en url(#…)).
  const gid = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  // Estado vivo leído dentro del bucle de animación (sin re-crear el bucle).
  const modeRef = useRef({ speaking, listening, paused, supported, unavailable, thinking });
  modeRef.current = { speaking, listening, paused, supported, unavailable, thinking };

  // Nivel de "latido" por eventos de voz (TTS) — decae con el tiempo.
  const beatRef = useRef(0);
  // Nivel/bandas del micrófono (STT) cuando hay analizador disponible.
  const micRef = useRef<MicAnalyser | null>(null);
  const micLevelRef = useRef({ level: 0, bands: [0, 0, 0] as RGB });
  // Caídas rápidas de escucha tras conectar el analizador (detector de competencia).
  const quickDropsRef = useRef(0);
  // Tinte de la ÚLTIMA ruta del router (clase de acceso de la fuente que respondió).
  const routeTintRef = useRef<RGB | null>(null);

  // ── Clase de acceso de la última respuesta → tinte de bajo peso ──
  useEffect(() => {
    const apply = (sourceId?: string) => {
      try {
        if (!sourceId) return;
        routeTintRef.current = ROUTE_TINT[llmSourceAccessClass(sourceId)] ?? null;
      } catch { /* el orbe nunca falla por un tinte */ }
    };
    try { apply(lastRoute()?.sourceId); } catch { /* */ }
    const onRoute = (e: Event) => {
      try { apply((e as CustomEvent<{ sourceId?: string }>).detail?.sourceId ?? lastRoute()?.sourceId); } catch { /* */ }
    };
    try { window.addEventListener(ROUTE_EVENT, onRoute); } catch { /* */ }
    return () => { try { window.removeEventListener(ROUTE_EVENT, onRoute); } catch { /* */ } };
  }, []);

  // ── Latido por eventos de voz del motor ──
  useEffect(() => {
    const unsub = subscribeAuroraSpeak((phase) => {
      if (phase === "start" || phase === "boundary") {
        beatRef.current = Math.min(1, beatRef.current + (phase === "start" ? 0.7 : 0.55));
      } else if (phase === "end") {
        beatRef.current = 0;
      }
    });
    return unsub;
  }, []);

  // ── Analizador de micrófono mientras Aurora escucha ──
  // EN DIFERIDO y compartido (singleton): jamás compite con el reconocimiento.
  // Si aún así la escucha cae justo tras conectar (2 veces), se prescinde del
  // analizador para toda la sesión y la luz cae al latido `aurora:speak`.
  useEffect(() => {
    if (!listening || !supported || unavailable) return;
    let cancelled = false;
    let handle: MicAnalyser | null = null;
    let attachedAt = 0;

    const timer = setTimeout(() => {
      acquireMicAnalyser()
        .then((m) => {
          if (cancelled) { m?.stop(); return; }
          handle = m;
          micRef.current = m;
          attachedAt = Date.now();
        })
        .catch(() => { /* degrada al latido/respiración */ });
    }, MIC_ATTACH_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      micRef.current = null;
      micLevelRef.current = { level: 0, bands: [0, 0, 0] };
      if (handle) {
        try { handle.stop(); } catch { /* */ }
        // ¿La escucha se cayó justo después de conectar? → el analizador
        // probablemente abortó la recognition: tras 2 detecciones, fuera.
        if (attachedAt && Date.now() - attachedAt < MIC_COMPETITION_WINDOW_MS) {
          quickDropsRef.current += 1;
          if (quickDropsRef.current >= 2) {
            try { disableMicAnalyserForSession(); } catch { /* */ }
          }
        } else if (attachedAt) {
          quickDropsRef.current = 0;
        }
      }
    };
  }, [listening, supported, unavailable]);

  // ══ ORBE CUÁNTICA — conmutación ══════════════════════════════════════════
  // Al activarse la voz (hablando/escuchando/pensando) esta orbe CONMUTA a
  // `<QuantumOrb>` (el renderizador del Astraura 1.58-bit original, mejorado);
  // en reposo sigue siendo la orbe del OS de siempre (nada de lo de arriba
  // cambia). `unavailable` NO activa la orbe cuántica: sigue con su propio
  // aviso carmesí existente.
  const quantumActive = !unavailable && (speaking || listening || thinking);
  const quantumState: QuantumOrbState = speaking
    ? "speaking"
    : listening
      ? "listening"
      : thinking
        ? "thinking"
        : "idle";

  // Nivel/espectro real para `<QuantumOrb>`, muestreados (no cada rAF: basta
  // ~20Hz, la orbe cuántica interpola internamente) del MISMO analizador
  // compartido que ya usa el bucle de abajo — jamás se abre un segundo
  // `AnalyserNode` (ver `expandBandsToFreq` y la cabecera de `aurora-orb-bus.ts`).
  const [quantumLevel, setQuantumLevel] = useState(0);
  const [quantumFreq, setQuantumFreq] = useState<Uint8Array | null>(null);

  useEffect(() => {
    if (!quantumActive) {
      setQuantumLevel(0);
      setQuantumFreq(null);
      return;
    }
    let raf = 0;
    let lastSample = 0;
    const tick = (t: number) => {
      if (t - lastSample > 50) {
        lastSample = t;
        const m = modeRef.current;
        if (m.listening) {
          const mic = micLevelRef.current;
          setQuantumLevel(Math.max(0, Math.min(1, mic.level)));
          setQuantumFreq(expandBandsToFreq(mic.bands));
        } else {
          // Hablando/pensando: no hay bandas espectrales reales (el TTS no
          // expone FFT) — solo el latido `aurora:speak`. `frequencies=null`
          // deja que `<QuantumOrb>` sintetice su propio pseudo-espectro.
          setQuantumLevel(Math.max(0, Math.min(1, beatRef.current)));
          setQuantumFreq(null);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [quantumActive]);

  // ── Geometría de capas ──
  // Grosor del aro aurora visible (rim) y diámetro del núcleo de cristal.
  const rim = Math.max(4, Math.round(size * 0.09));
  const coreSize = size - rim * 2;
  const starSize = Math.round(coreSize * 0.68);

  // ── Bucle de dibujo: aurora interior + CSS vars (energy/flux/rgb) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const d = coreSize;
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    canvas.width = Math.round(d * dpr);
    canvas.height = Math.round(d * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const reduce = prefersReducedMotion();
    let raf = 0;
    let running = false;
    // El bucle SÓLO corre cuando la pestaña está visible Y el orbe está en
    // pantalla. En Android un rAF de canvas oculto (Exocórtex cerrado, pestaña
    // en segundo plano o orbe fuera de vista) malgasta batería y provoca jank.
    let docVisible = typeof document === "undefined" ? true : !document.hidden;
    let onScreen = true; // hasta que el IntersectionObserver diga lo contrario
    let t = Math.random() * 10; // arranque desincronizado (más orgánico)
    let smooth = 0;             // energía suavizada (volumen → glow)
    let tilt = 0;               // tono espectral suavizado (-1 graves .. +1 agudos)
    let flux = 0;               // emoción suavizada (velocidad de cambios)
    let prevLvl = 0;
    let tintW = 0;              // peso suavizado del tinte de ruta (0..MAX)

    const draw = () => {
      const { speaking: sp, listening: li, paused: pa, supported: su, unavailable: un } = modeRef.current;

      // Decaimiento del latido por voz (TTS).
      beatRef.current *= 0.9;

      // Lectura del micrófono (si hay analizador compartido).
      if (micRef.current) {
        micLevelRef.current = micRef.current.read();
      }
      const mic = micLevelRef.current;
      const [bLow, bMid, bHigh] = mic.bands;

      // ── EMOCIÓN (flux): energía + velocidad de cambios del nivel. Picos
      //    rápidos → pulsos vivos y saturados; calma → ondas lentas líquidas.
      //    Sube rápido, decae despacio (hipnótico, nunca brusco).
      const lvlNow = li ? mic.level : beatRef.current;
      const dLvl = Math.abs(lvlNow - prevLvl);
      prevLvl = lvlNow;
      const fluxTarget = un ? 0 : Math.min(1, dLvl * 10 + (sp ? beatRef.current * 0.35 : 0));
      flux += (fluxTarget - flux) * (fluxTarget > flux ? 0.2 : 0.03);

      // Tiempo orgánico: la emoción acelera el fluido; la calma lo vuelve miel.
      t += (reduce ? 0.005 : 0.014) * (1 + flux * 1.4);

      // ── TONO espectral: agudos → azul/amarillo · graves → rojo/verde.
      const tiltTarget = li && !un ? (bHigh - bLow) / (bHigh + bLow + 0.05) : 0;
      tilt += (tiltTarget - tilt) * 0.08;

      // ── VOLUMEN → energía global (0..1): intensidad/expansión del glow.
      const breath = 0.5 + 0.5 * Math.sin(t); // respiración base
      const active = su && (sp || li);
      let target: number;
      if (un) {
        target = 0.06; // voz no disponible: rescoldo mínimo, sereno
      } else if (li && mic.level > 0.001) {
        target = Math.min(1, mic.level * 0.9 + beatRef.current * 0.35 + 0.14);
      } else if (sp) {
        target = Math.min(1, 0.3 + beatRef.current * 0.7);
      } else {
        target = active ? 0.32 + breath * 0.22 : breath * 0.2 + (su ? 0.08 : 0.02);
      }
      if (pa) target *= 0.55;
      smooth += (target - smooth) * 0.16;
      const e = smooth;

      // ── Color dominante: rueda cardinal + empuje espectral + saturación
      //    emocional (todo continuo y suavizado — sin saltos).
      const phase = (Math.sin(t * 0.45) + 1) / 2;
      let dom = wheel(phase);
      if (un) {
        dom = [150, 44, 62]; // carmesí apagado: "voz no disponible"
      } else if (li) {
        const cool = mix(C.up, C.right, phase);   // agudos → azul/amarillo
        const warm = mix(C.down, C.left, phase);  // graves → rojo/verde
        dom = tilt >= 0
          ? mix(dom, cool, Math.min(0.6, tilt))
          : mix(dom, warm, Math.min(0.6, -tilt));
        dom = saturate(dom, flux * 0.55);
      } else if (sp) {
        dom = saturate(dom, flux * 0.4);
      }

      // ── TINTE por clase de acceso de la última respuesta (soberanía visible).
      //    Peso bajísimo y decreciente con la energía: la voz SIEMPRE manda.
      //    Con movimiento reducido no hay transición (salta al valor final).
      const tint = un ? null : routeTintRef.current;
      const tintTarget = tint ? ROUTE_TINT_MAX * (1 - Math.min(0.5, e * 0.5)) : 0;
      tintW = reduce ? tintTarget : tintW + (tintTarget - tintW) * 0.05;
      if (tint && tintW > 0.001) dom = mix(dom, tint, tintW);

      // → CSS vars para glow/halo/estrella (sin re-render de React).
      root.style.setProperty("--aurora-energy", e.toFixed(3));
      root.style.setProperty("--aurora-flux", flux.toFixed(3));
      root.style.setProperty("--aurora-rgb", `${dom[0]} ${dom[1]} ${dom[2]}`);

      // ══ Aurora interior del núcleo ══
      ctx.clearRect(0, 0, d, d);

      // Iluminación ambiental del cristal (brilla con la energía).
      const amb = ctx.createRadialGradient(d / 2, d * 0.6, 0, d / 2, d * 0.6, d * 0.62);
      amb.addColorStop(0, rgba(dom, 0.1 + e * 0.3));
      amb.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = amb;
      ctx.fillRect(0, 0, d, d);

      // Cintas aurora suaves (aditivas), con remolino interior sutil.
      ctx.globalCompositeOperation = "lighter";
      const swirl = reduce ? 0 : Math.sin(t * 0.14) * 0.3;
      for (const r of RIBBONS) {
        const boost = li && !un
          ? (r.family === "low" ? bLow : r.family === "high" ? bHigh : bMid)
          : 0;
        const col = mix(r.base, r.cardinal, Math.min(1, 0.25 + boost * 0.75));
        const amp = d * (0.05 + e * 0.09) * (1 + boost * 0.9 + flux * 0.4);
        const drift = Math.sin(t * 0.3 + r.phase * 1.7) * d * 0.06;
        const alpha = Math.min(0.55, 0.08 + e * 0.26 + boost * 0.3 + flux * 0.08);

        ctx.save();
        ctx.translate(d / 2, d / 2);
        ctx.rotate(swirl + r.tilt);
        ctx.translate(-d / 2, -d / 2);
        ctx.beginPath();
        const STEPS = 18;
        for (let i = 0; i <= STEPS; i++) {
          const x = (i / STEPS) * d * 1.4 - d * 0.2;
          const y = r.yBase * d + drift + Math.sin((x / d) * 3.2 + t * r.speed + r.phase) * amp;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        // Banda ancha y tenue + hilo interior brillante (cinta de aurora).
        ctx.strokeStyle = rgba(col, alpha);
        ctx.lineWidth = d * (0.13 + e * 0.05);
        ctx.stroke();
        ctx.strokeStyle = rgba(mix(col, WHITE, 0.4), alpha * 0.9);
        ctx.lineWidth = d * 0.045;
        ctx.stroke();
        ctx.restore();
      }

      // Cuando HABLA: onda de color expansiva por cada pulso `aurora:speak`.
      if (sp && beatRef.current > 0.05 && !reduce) {
        const k = 1 - beatRef.current; // 0 (pulso) → 1 (apagado)
        ctx.strokeStyle = rgba(mix(dom, WHITE, 0.3), beatRef.current * 0.4);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(d / 2, d / 2, d * (0.14 + k * 0.4), 0, Math.PI * 2);
        ctx.stroke();
      }
      // EMOCIÓN alta escuchando: pulso vivo adicional (pico saturado).
      if (li && !un && flux > 0.45 && !reduce) {
        ctx.strokeStyle = rgba(saturate(dom, 0.8), Math.min(0.35, flux * 0.4));
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(d / 2, d / 2, d * (0.12 + (1 - flux) * 0.34), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";

      raf = requestAnimationFrame(draw);
    };

    // ── Arranque/parada del bucle según visibilidad ──
    const startLoop = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(draw);
    };
    const stopLoop = () => {
      running = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    const sync = () => {
      if (docVisible && onScreen) startLoop();
      else stopLoop();
    };

    const onVisibility = () => {
      docVisible = typeof document === "undefined" ? true : !document.hidden;
      sync();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    // Pausa cuando el orbe sale de la pantalla (scroll, cortina cerrada…).
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          onScreen = entries.some((e) => e.isIntersecting);
          sync();
        },
        { threshold: 0.01 },
      );
      try { io.observe(root); } catch { /* */ }
    }

    sync(); // arranca sólo si procede (visible + en pantalla)

    return () => {
      stopLoop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      if (io) { try { io.disconnect(); } catch { /* */ } }
    };
  }, [coreSize]);

  return (
    <>
    <div
      ref={rootRef}
      aria-hidden
      className={styles.root}
      style={{
        width: size,
        height: size,
        "--aurora-energy": 0,
        "--aurora-flux": 0,
        "--aurora-rgb": "159 232 112",
      } as React.CSSProperties}
    >
      {/* Capa REPOSO — la orbe del OS de siempre, intacta byte a byte. Se
          desvanece (solo opacity — el bucle de dibujo de abajo sigue vivo,
          así el regreso a reposo es instantáneo y sin parpadeo) cuando la
          orbe cuántica (hablando/escuchando/pensando) toma el relevo. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: quantumActive ? 0 : 1,
          transition: "opacity 260ms ease",
          pointerEvents: quantumActive ? "none" : undefined,
        }}
      >
      {/* (a) Glow neón exterior ANCHO y difuminado (blur amplio) + halo. */}
      <div className={styles.glowWide} />
      <div className={styles.halo} />

      {/* (b) Esfera con el aro aurora cónico girando lento + especular del vidrio. */}
      <div className={styles.sphere}>
        <div className={styles.ring} />
        <div className={styles.specular} />
      </div>

      {/* Anillo ping (~3.2s). */}
      <div className={styles.ping} />

      {/* (c)+(d) Núcleo de cristal con profundidad: aurora en canvas +
          refracción del borde + especular doble (volumen render-3D). */}
      <div className={styles.core} style={{ inset: rim }}>
        <canvas ref={canvasRef} className={styles.canvas} />
        <div className={styles.refraction} />
        <div className={styles.coreSpecular} />
      </div>

      {/* (e) Estrella ✦ nítida: puntas en los 4 cardinales Trinity exactos,
          centro blanco brillante. Late y brilla vía --aurora-energy. */}
      <svg
        className={styles.star}
        width={starSize}
        height={starSize}
        viewBox="0 0 24 24"
        aria-hidden
      >
        <defs>
          <linearGradient id={`${gid}u`} x1="12" y1="11" x2="12" y2="1.6" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#EAF6FF" />
            <stop offset="0.4" stopColor="#3E9FFF" />
            <stop offset="1" stopColor="#007FFF" />
          </linearGradient>
          <linearGradient id={`${gid}d`} x1="12" y1="13" x2="12" y2="22.4" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFEDF1" />
            <stop offset="0.4" stopColor="#F4476B" />
            <stop offset="1" stopColor="#DC143C" />
          </linearGradient>
          <linearGradient id={`${gid}l`} x1="13" y1="12" x2="1.6" y2="12" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#F0FFE9" />
            <stop offset="0.4" stopColor="#6FFF4D" />
            <stop offset="1" stopColor="#39FF14" />
          </linearGradient>
          <linearGradient id={`${gid}r`} x1="11" y1="12" x2="22.4" y2="12" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFF7E0" />
            <stop offset="0.4" stopColor="#FFD24D" />
            <stop offset="1" stopColor="#FFBF00" />
          </linearGradient>
          <radialGradient id={`${gid}c`} cx="12" cy="12" r="3.6" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.85" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Arriba · Zenith · azul */}
        <path d="M12 12 C10.7 8.6 10.9 5.4 12 1.6 C13.1 5.4 13.3 8.6 12 12 Z" fill={`url(#${gid}u)`} />
        {/* Abajo · Anchor · rojo */}
        <path d="M12 12 C13.3 15.4 13.1 18.6 12 22.4 C10.9 18.6 10.7 15.4 12 12 Z" fill={`url(#${gid}d)`} />
        {/* Izquierda · Horizon · verde */}
        <path d="M12 12 C8.6 13.3 5.4 13.1 1.6 12 C5.4 10.9 8.6 10.7 12 12 Z" fill={`url(#${gid}l)`} />
        {/* Derecha · Logic · amarillo */}
        <path d="M12 12 C15.4 10.7 18.6 10.9 22.4 12 C18.6 13.1 15.4 13.3 12 12 Z" fill={`url(#${gid}r)`} />
        {/* Centro blanco brillante */}
        <circle cx="12" cy="12" r="3.4" fill={`url(#${gid}c)`} />
        <circle cx="12" cy="12" r="1.4" fill="#FFFFFF" />
      </svg>
      </div>

      {/* Capa VOZ ACTIVA — orbe cuántica (fade 260ms, ver arriba). Renderizador
          de canvas 2D propio (`quantum-orb.tsx`), independiente del bucle de
          la capa de reposo. `frequencies`/`level` vienen del MISMO analizador
          compartido (`aurora-orb-bus.ts`) — nunca se abre un segundo mic. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          opacity: quantumActive ? 1 : 0,
          transition: "opacity 260ms ease",
          pointerEvents: "none",
        }}
      >
        <QuantumOrb
          personaId={personaId}
          state={quantumState}
          level={quantumLevel}
          frequencies={quantumFreq}
          size={size}
          trail
        />
      </div>
    </div>

      {/* Presencia Astraura 1.58 (Ola 5 · Adenda 157, SOP §5): HERMANA del
          núcleo visual de arriba (que es aria-hidden), no descendiente — así
          conserva su propio nombre accesible y foco de teclado. Comparte el
          mismo contenedor `position:relative` de tamaño `size` que el
          caller ya provee para `.root` (ver la nota de `aurora-avatar.tsx`
          sobre por qué hace falta ese contenedor), así que se ancla en una
          esquina de la orbe sin tocar la estructura existente. En el widget
          flotante la orbe vive dentro de un <button> real (arrastrable):
          el propio componente detiene la propagación de sus punteros/clic
          para no disparar ese arrastre ni el menú Trinity. No pinta nada si
          el backend 1.58 no responde (cero ruido). */}
      <Astraura158PresenceDot />
    </>
  );
}

export default AuroraOrb;
