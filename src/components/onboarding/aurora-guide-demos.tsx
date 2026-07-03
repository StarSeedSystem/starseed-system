"use client";

/**
 * AuroraGuideDemos — mini-demostraciones ANIMADAS por paso de la guía.
 * ----------------------------------------------------------------------------
 * Cada paso del tour muestra automáticamente un ejemplo visual de lo que enseña
 * (el Orbe que late y responde a toque/mantener/mover, los cuatro pétalos de
 * Trinity que se despliegan, ventanas del Escritorio que aparecen, widgets del
 * Dashboard que se acomodan, etc.). Las animaciones DENTRO del paso corren en
 * bucle suave; el cambio de paso lo controla el usuario (botón Siguiente).
 *
 * · Se apoya SOLO en framer-motion (ya presente).
 * · Respeta prefers-reduced-motion: sin bucles, muestra un fotograma estático.
 * · Sin acceso a window/document ni dependencias externas: es puro SVG/divs.
 * · `accent` viene del paso (color Trinity) para teñir la demo coherentemente.
 *
 * Uso: <StepDemo stepKey="orbe" accent="#C9A8FF" reduce={reduceMotion} />
 */

import { motion, type Transition } from "framer-motion";

type DemoProps = {
  stepKey: string;
  accent: string;
  reduce: boolean;
};

// Un loop suave estándar (se anula si reduce-motion está activo).
function loop(t: Partial<Transition> = {}): Transition {
  return { duration: 3.2, repeat: Infinity, ease: "easeInOut", ...t };
}

// Contenedor de la escena: mismo tamaño para todas, fondo cristalino tenue.
function Stage({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent: string;
}) {
  return (
    <div
      className="relative h-28 w-full overflow-hidden rounded-2xl border border-white/10"
      style={{
        background: `radial-gradient(120% 120% at 50% 0%, color-mix(in srgb, ${accent} 12%, transparent), transparent 60%), rgba(6,10,16,0.6)`,
      }}
    >
      {/* rejilla sutil para dar sensación de "lienzo/OS" */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      {children}
    </div>
  );
}

/* ───────────────────────────── ORBE ─────────────────────────────────────────
   Una esfera que late; a su alrededor, tres pulsos que ilustran los gestos
   (tocar · mantener · mover). En reduce-motion queda estática con un halo fijo. */
function OrbeDemo({ accent, reduce }: { accent: string; reduce: boolean }) {
  return (
    <Stage accent={accent}>
      <div className="absolute inset-0 grid place-items-center">
        {/* halos concéntricos que se expanden (pulso de "voz activa") */}
        {!reduce &&
          [0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute rounded-full"
              style={{ border: `1.5px solid ${accent}` }}
              initial={{ width: 40, height: 40, opacity: 0.5 }}
              animate={{ width: 96, height: 96, opacity: 0 }}
              transition={loop({ duration: 2.6, delay: i * 0.8, ease: "easeOut" })}
            />
          ))}
        {/* el orbe */}
        <motion.div
          className="relative grid h-12 w-12 place-items-center rounded-full"
          style={{
            background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.9), ${accent} 55%, color-mix(in srgb, ${accent} 40%, #1a1030) 100%)`,
            boxShadow: `0 0 22px color-mix(in srgb, ${accent} 70%, transparent)`,
          }}
          animate={reduce ? undefined : { scale: [1, 1.12, 1] }}
          transition={reduce ? undefined : loop({ duration: 2.4 })}
        >
          <span
            className="h-1.5 w-1.5 rounded-full bg-white"
            style={{ boxShadow: "0 0 8px rgba(255,255,255,0.9)" }}
          />
        </motion.div>
        {/* mano/gesto que "mantiene" y desliza (aparece y vuelve) */}
        {!reduce && (
          <motion.span
            aria-hidden
            className="absolute h-2.5 w-2.5 rounded-full bg-white/90"
            style={{ boxShadow: "0 0 10px rgba(255,255,255,0.8)" }}
            animate={{
              x: [0, 26, 26, 0],
              y: [18, 18, -4, 18],
              opacity: [0, 1, 1, 0],
            }}
            transition={loop({ duration: 3.6, times: [0, 0.3, 0.65, 1] })}
          />
        )}
      </div>
    </Stage>
  );
}

/* ───────────────────────────── TRINITY ──────────────────────────────────────
   Cuatro pétalos (N/E/S/O) que se despliegan desde el centro. Se resalta el
   pétalo del nodo activo (por color). En reduce-motion aparecen ya desplegados. */
function TrinityDemo({
  accent,
  reduce,
  active,
}: {
  accent: string;
  reduce: boolean;
  active: "zenith" | "horizon" | "logic" | "anchor";
}) {
  const petals: Array<{
    id: "zenith" | "horizon" | "logic" | "anchor";
    color: string;
    dx: number;
    dy: number;
    label: string;
  }> = [
    { id: "zenith", color: "#007FFF", dx: 0, dy: -34, label: "Zenith" },
    { id: "horizon", color: "#39FF14", dx: -40, dy: 0, label: "Horizon" },
    { id: "logic", color: "#FFBF00", dx: 40, dy: 0, label: "Logic" },
    { id: "anchor", color: "#DC143C", dx: 0, dy: 34, label: "Anchor" },
  ];
  return (
    <Stage accent={accent}>
      <div className="absolute inset-0 grid place-items-center">
        {/* núcleo (el orbe origen del menú) */}
        <motion.div
          className="absolute h-6 w-6 rounded-full"
          style={{
            background: `radial-gradient(circle at 35% 30%, #fff, ${accent} 60%)`,
            boxShadow: `0 0 16px color-mix(in srgb, ${accent} 60%, transparent)`,
          }}
          animate={reduce ? undefined : { scale: [1, 1.1, 1] }}
          transition={reduce ? undefined : loop({ duration: 2.2 })}
        />
        {petals.map((p, i) => {
          const isActive = p.id === active;
          return (
            <motion.div
              key={p.id}
              className="absolute grid place-items-center rounded-xl text-[8px] font-semibold"
              style={{
                width: 34,
                height: 22,
                color: "#fff",
                border: `1.5px solid ${p.color}`,
                background: `color-mix(in srgb, ${p.color} ${isActive ? 34 : 16}%, rgba(8,12,18,0.85))`,
                boxShadow: isActive
                  ? `0 0 18px color-mix(in srgb, ${p.color} 70%, transparent)`
                  : "none",
              }}
              initial={reduce ? { x: p.dx, y: p.dy, opacity: 1 } : { x: 0, y: 0, opacity: 0, scale: 0.4 }}
              animate={
                reduce
                  ? { x: p.dx, y: p.dy, opacity: 1 }
                  : {
                      x: p.dx,
                      y: p.dy,
                      opacity: 1,
                      scale: isActive ? [1, 1.08, 1] : 1,
                    }
              }
              transition={
                reduce
                  ? undefined
                  : {
                      x: { type: "spring", stiffness: 260, damping: 18, delay: 0.08 * i },
                      y: { type: "spring", stiffness: 260, damping: 18, delay: 0.08 * i },
                      opacity: { duration: 0.4, delay: 0.08 * i },
                      scale: isActive ? loop({ duration: 2 }) : { duration: 0.3 },
                    }
              }
            >
              {p.label}
            </motion.div>
          );
        })}
      </div>
    </Stage>
  );
}

/* ─────────────────────────── ESCRITORIO ─────────────────────────────────────
   Ventanas que aparecen escalonadas sobre el "escritorio", como abriéndose. */
function EscritorioDemo({ accent, reduce }: { accent: string; reduce: boolean }) {
  const windows = [
    { x: 10, y: 14, w: 52, h: 34, d: 0 },
    { x: 74, y: 26, w: 60, h: 40, d: 0.25 },
    { x: 150, y: 12, w: 48, h: 30, d: 0.5 },
  ];
  return (
    <Stage accent={accent}>
      {/* dock inferior */}
      <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className="h-3 w-3 rounded-md"
            style={{ background: `color-mix(in srgb, ${accent} 45%, rgba(255,255,255,0.15))` }}
            animate={reduce ? undefined : { y: [0, -2, 0] }}
            transition={reduce ? undefined : loop({ duration: 2, delay: i * 0.2 })}
          />
        ))}
      </div>
      {windows.map((w, i) => (
        <motion.div
          key={i}
          className="absolute rounded-lg border border-white/15 backdrop-blur-sm"
          style={{
            left: w.x,
            top: w.y,
            width: w.w,
            height: w.h,
            background: "rgba(255,255,255,0.06)",
          }}
          initial={reduce ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.7, y: 8 }}
          animate={
            reduce
              ? { opacity: 1, scale: 1 }
              : { opacity: 1, scale: 1, y: 0 }
          }
          transition={
            reduce
              ? undefined
              : { type: "spring", stiffness: 240, damping: 20, delay: w.d, repeatType: "reverse" }
          }
        >
          {/* barra de título con "semáforo" */}
          <div className="flex items-center gap-1 border-b border-white/10 px-1.5 py-1">
            <span className="h-1 w-1 rounded-full bg-[#DC143C]/80" />
            <span className="h-1 w-1 rounded-full bg-[#FFBF00]/80" />
            <span className="h-1 w-1 rounded-full bg-[#39FF14]/80" />
          </div>
        </motion.div>
      ))}
    </Stage>
  );
}

/* ─────────────────────────── DASHBOARD ──────────────────────────────────────
   Widgets en rejilla que se reordenan/acomodan (uno "salta" a su sitio). */
function DashboardDemo({ accent, reduce }: { accent: string; reduce: boolean }) {
  const cells = [
    { x: 12, y: 14 },
    { x: 70, y: 14 },
    { x: 128, y: 14 },
    { x: 12, y: 56 },
    { x: 70, y: 56 },
    { x: 128, y: 56 },
  ];
  return (
    <Stage accent={accent}>
      {cells.map((c, i) => (
        <motion.div
          key={i}
          className="absolute rounded-md border border-white/12"
          style={{
            left: c.x,
            top: c.y,
            width: 46,
            height: 30,
            background: `color-mix(in srgb, ${accent} ${8 + (i % 3) * 6}%, rgba(255,255,255,0.05))`,
          }}
          initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.8 }}
          animate={
            reduce
              ? { opacity: 1 }
              : {
                  opacity: 1,
                  scale: 1,
                  // el widget del centro "reacomoda" suavemente en bucle
                  y: i === 4 ? [0, -6, 0] : 0,
                  x: i === 1 ? [0, 4, 0] : 0,
                }
          }
          transition={
            reduce
              ? undefined
              : {
                  opacity: { duration: 0.35, delay: i * 0.06 },
                  scale: { type: "spring", stiffness: 240, damping: 18, delay: i * 0.06 },
                  y: i === 4 ? loop({ duration: 2.6 }) : undefined,
                  x: i === 1 ? loop({ duration: 3 }) : undefined,
                }
          }
        >
          {/* barritas tipo "gráfico" dentro del widget */}
          <div className="flex h-full items-end gap-0.5 p-1">
            {[0.4, 0.7, 0.5, 0.9].map((h, j) => (
              <motion.span
                key={j}
                className="w-1 rounded-sm"
                style={{ background: accent, height: `${h * 100}%`, opacity: 0.7 }}
                animate={reduce ? undefined : { scaleY: [h, h * 0.6 + 0.4, h] }}
                transition={reduce ? undefined : loop({ duration: 2.2, delay: j * 0.15 })}
              />
            ))}
          </div>
        </motion.div>
      ))}
    </Stage>
  );
}

/* ─────────────────────────── ASTRAURA (IA) ──────────────────────────────────
   Un "cerebro"/núcleo con nodos orbitando: modelo + memorias + skills + voz. */
function AstrauraDemo({ accent, reduce }: { accent: string; reduce: boolean }) {
  const nodes = [0, 1, 2, 3];
  return (
    <Stage accent={accent}>
      <div className="absolute inset-0 grid place-items-center">
        {/* núcleo pensante */}
        <motion.div
          className="relative z-10 grid h-10 w-10 place-items-center rounded-full"
          style={{
            background: `radial-gradient(circle at 34% 30%, #fff, ${accent} 60%, color-mix(in srgb, ${accent} 40%, #150826) 100%)`,
            boxShadow: `0 0 20px color-mix(in srgb, ${accent} 65%, transparent)`,
          }}
          animate={reduce ? undefined : { scale: [1, 1.08, 1] }}
          transition={reduce ? undefined : loop({ duration: 2.4 })}
        />
        {/* órbita + nodos que giran (memorias/skills/modelo/sentidos) */}
        <motion.div
          className="absolute h-24 w-24"
          animate={reduce ? undefined : { rotate: 360 }}
          transition={reduce ? undefined : { duration: 14, repeat: Infinity, ease: "linear" }}
        >
          {nodes.map((n) => {
            const angle = (n / nodes.length) * Math.PI * 2;
            const r = 44;
            const x = Math.cos(angle) * r + 48 - 5;
            const y = Math.sin(angle) * r + 48 - 5;
            return (
              <span
                key={n}
                className="absolute h-2.5 w-2.5 rounded-full"
                style={{
                  left: x,
                  top: y,
                  background: accent,
                  boxShadow: `0 0 10px color-mix(in srgb, ${accent} 75%, transparent)`,
                }}
              />
            );
          })}
          {/* anillo de la órbita */}
          <span
            className="absolute inset-0 rounded-full"
            style={{ border: `1px dashed color-mix(in srgb, ${accent} 40%, transparent)` }}
          />
        </motion.div>
      </div>
    </Stage>
  );
}

/* ──────────────────────────── PERFIL ────────────────────────────────────────
   Una tarjeta de perfil (avatar + líneas) con perfiles-faceta que se abanican. */
function PerfilDemo({ accent, reduce }: { accent: string; reduce: boolean }) {
  const facets = [-14, 0, 14];
  return (
    <Stage accent={accent}>
      <div className="absolute inset-0 grid place-items-center">
        {/* tarjetas-faceta detrás (cívico/artístico/profesional) */}
        {facets.map((rot, i) => (
          <motion.div
            key={i}
            className="absolute h-16 w-24 rounded-xl border border-white/12"
            style={{
              background: `color-mix(in srgb, ${accent} ${6 + i * 4}%, rgba(10,14,20,0.85))`,
              transformOrigin: "bottom center",
            }}
            initial={reduce ? { rotate: rot, y: -i * 3 } : { rotate: 0, y: 0, opacity: 0 }}
            animate={reduce ? { rotate: rot, y: -i * 3 } : { rotate: rot, y: -i * 3, opacity: 1 }}
            transition={
              reduce
                ? undefined
                : { type: "spring", stiffness: 220, damping: 18, delay: i * 0.12 }
            }
          />
        ))}
        {/* tarjeta principal al frente */}
        <motion.div
          className="relative z-10 flex h-16 w-24 items-center gap-2 rounded-xl border border-white/20 px-2"
          style={{ background: "rgba(255,255,255,0.07)" }}
          animate={reduce ? undefined : { y: [0, -2, 0] }}
          transition={reduce ? undefined : loop({ duration: 2.6 })}
        >
          <span
            className="h-7 w-7 shrink-0 rounded-full"
            style={{
              background: `radial-gradient(circle at 35% 30%, #fff, ${accent} 70%)`,
              boxShadow: `0 0 10px color-mix(in srgb, ${accent} 60%, transparent)`,
            }}
          />
          <div className="flex flex-1 flex-col gap-1">
            <span className="h-1.5 w-full rounded-full bg-white/40" />
            <span className="h-1.5 w-2/3 rounded-full bg-white/20" />
          </div>
        </motion.div>
      </div>
    </Stage>
  );
}

/* ─────────────────────────── CEREBROS ───────────────────────────────────────
   Grafo vivo: nodos (servidores/memorias) conectados por aristas que pulsan. */
function CerebrosDemo({ accent, reduce }: { accent: string; reduce: boolean }) {
  const nodes = [
    { x: 40, y: 30 },
    { x: 120, y: 22 },
    { x: 176, y: 58 },
    { x: 90, y: 74 },
    { x: 32, y: 82 },
  ];
  const edges = [
    [0, 1],
    [1, 2],
    [0, 3],
    [3, 4],
    [1, 3],
  ];
  return (
    <Stage accent={accent}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 210 112" preserveAspectRatio="none">
        {edges.map(([a, b], i) => (
          <motion.line
            key={i}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            stroke={accent}
            strokeWidth={1}
            strokeOpacity={0.5}
            initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
            animate={reduce ? { pathLength: 1 } : { pathLength: 1, strokeOpacity: [0.25, 0.7, 0.25] }}
            transition={
              reduce
                ? undefined
                : {
                    pathLength: { duration: 0.7, delay: i * 0.12 },
                    strokeOpacity: loop({ duration: 2.4, delay: i * 0.2 }),
                  }
            }
          />
        ))}
        {nodes.map((n, i) => (
          <motion.circle
            key={i}
            cx={n.x}
            cy={n.y}
            r={4}
            fill={accent}
            initial={reduce ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
            animate={reduce ? { scale: 1, opacity: 1 } : { scale: 1, opacity: 1 }}
            transition={reduce ? undefined : { type: "spring", stiffness: 300, damping: 16, delay: 0.3 + i * 0.1 }}
            style={{ filter: `drop-shadow(0 0 4px ${accent})` }}
          />
        ))}
      </svg>
    </Stage>
  );
}

/* ─────────────────────────── LIBRERÍA ───────────────────────────────────────
   Estantería/catálogo: fichas (apps/recursos) que se van "encajando". */
function LibreriaDemo({ accent, reduce }: { accent: string; reduce: boolean }) {
  const cards = [0, 1, 2, 3, 4, 5];
  return (
    <Stage accent={accent}>
      <div className="absolute inset-0 grid grid-cols-3 place-items-center gap-2 p-3">
        {cards.map((i) => (
          <motion.div
            key={i}
            className="h-9 w-14 rounded-md border border-white/12"
            style={{
              background: `linear-gradient(135deg, color-mix(in srgb, ${accent} ${10 + (i % 3) * 8}%, rgba(255,255,255,0.05)), rgba(255,255,255,0.02))`,
            }}
            initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 14, rotate: -6 }}
            animate={
              reduce
                ? { opacity: 1, y: 0 }
                : { opacity: 1, y: 0, rotate: 0 }
            }
            transition={
              reduce
                ? undefined
                : { type: "spring", stiffness: 260, damping: 18, delay: i * 0.08 }
            }
          >
            <div className="flex h-full flex-col justify-between p-1">
              <span className="h-1 w-1/2 rounded-full bg-white/40" />
              <span className="h-1 w-3/4 rounded-full bg-white/15" />
            </div>
          </motion.div>
        ))}
      </div>
    </Stage>
  );
}

/**
 * StepDemo — despacha la mini-demostración correcta según la clave del paso.
 * Si la clave no tiene demo específica, no renderiza nada (la guía sigue).
 */
export function StepDemo({ stepKey, accent, reduce }: DemoProps) {
  switch (stepKey) {
    case "orbe":
      return <OrbeDemo accent={accent} reduce={reduce} />;
    case "trinity-zenith":
      return <TrinityDemo accent={accent} reduce={reduce} active="zenith" />;
    case "trinity-horizon":
      return <TrinityDemo accent={accent} reduce={reduce} active="horizon" />;
    case "trinity-logic":
      return <TrinityDemo accent={accent} reduce={reduce} active="logic" />;
    case "trinity-anchor":
      return <TrinityDemo accent={accent} reduce={reduce} active="anchor" />;
    case "escritorio":
      return <EscritorioDemo accent={accent} reduce={reduce} />;
    case "dashboard":
      return <DashboardDemo accent={accent} reduce={reduce} />;
    case "astraura":
      return <AstrauraDemo accent={accent} reduce={reduce} />;
    case "perfil":
      return <PerfilDemo accent={accent} reduce={reduce} />;
    case "cerebros":
      return <CerebrosDemo accent={accent} reduce={reduce} />;
    case "libreria":
      return <LibreriaDemo accent={accent} reduce={reduce} />;
    default:
      return null;
  }
}

export default StepDemo;
