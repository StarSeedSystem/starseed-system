"use client";

/**
 * Demostraciones animadas de la guía (GUI1021D): Protomolécula, malla, capas de conciencia y neuronas/cerebro.
 * Misma firma que `aurora-guide-demos.tsx` ({ accent, reduce }). SVG ligero de 200×112 (se lee igual a 200 que a
 * 320 px), trazo fino, proporción áurea y bucles lentos; con `reduce` queda quieto en un fotograma completo.
 * Textos según `architecture/guias-introduccion.md` §3: nada que no exista se enseña como si existiera.
 */

import { useId, type ReactNode } from "react";
import { motion, type TargetAndTransition, type Transition } from "framer-motion";

export type DemoSistemaProps = { accent: string; reduce: boolean };
type Punto = [number, number];

const PHI = 1.618;
const TRINITY = { zenith: "#007FFF", horizon: "#10B981", lima: "#39FF14", logic: "#FFBF00", oro: "#D4AF37", anchor: "#DC143C" };
const [TINTA, TENUE, VIDRIO] = ["rgba(255,255,255,0.72)", "rgba(255,255,255,0.45)", "rgba(255,255,255,0.05)"];

const loop = (duration: number, t: Partial<Transition> = {}): Transition => ({ duration, repeat: Infinity, ease: "easeInOut", ...t });
/** Con `reduce` no se anima nada: el elemento se queda en sus atributos, que son el fotograma quieto. */
const vivo = (reduce: boolean, animate: TargetAndTransition, transition: Transition) => (reduce ? {} : { animate, transition });
const polar = (cx: number, cy: number, r: number, grados: number): Punto => [cx + r * Math.cos((grados * Math.PI) / 180), cy + r * Math.sin((grados * Math.PI) / 180)];
const hexagono = (cx: number, cy: number, r: number, giro = 0) => [0, 1, 2, 3, 4, 5].map((k) => polar(cx, cy, r, giro + k * 60));
/** Puntos de una curva cuadrática: un pulso que los recorre en lineal parece seguir la curva. */
function curva([x0, y0]: Punto, [qx, qy]: Punto, [x1, y1]: Punto, n = 6) {
  const b = (a: number, q: number, c: number, t: number) => (1 - t) ** 2 * a + 2 * (1 - t) * t * q + t * t * c;
  const ts = Array.from({ length: n }, (_, i) => i / (n - 1));
  return { d: `M${x0} ${y0}Q${qx} ${qy} ${x1} ${y1}`, xs: ts.map((t) => b(x0, qx, x1, t)), ys: ts.map((t) => b(y0, qy, y1, t)) };
}

/** Lienzo común: vidrio oscuro teñido por el acento y un único degradado de brillo (sin filtros). */
function Escena({ accent, etiqueta, children }: { accent: string; etiqueta: string; children: (brillo: string) => ReactNode }) {
  const id = `brillo${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <div
      className="relative h-28 w-full overflow-hidden rounded-2xl border border-white/10"
      style={{ background: `radial-gradient(120% 120% at 50% 0%, color-mix(in srgb, ${accent} 12%, transparent), transparent 60%), rgba(6,10,16,0.6)` }}
    >
      <svg role="img" aria-label={etiqueta} viewBox="0 0 200 112" className="absolute inset-0 h-full w-full" fill="none" fontFamily="inherit">
        <radialGradient id={id}>
          <stop offset="0" stopColor="#fff" /><stop offset="0.3" stopColor={accent} /><stop offset="1" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        {children(`url(#${id})`)}
      </svg>
    </div>
  );
}

type TextoProps = { x: number; y: number; children: ReactNode; anchor?: "start" | "middle" | "end"; size?: number; color?: string; italic?: boolean };
function Texto({ x, y, children, anchor = "middle", size = 8, color = TINTA, italic }: TextoProps) {
  return <text x={x} y={y} fill={color} fontSize={size} textAnchor={anchor} letterSpacing={0.3} fontStyle={italic ? "italic" : undefined}>{children}</text>;
}

/** Núcleo luminoso que respira. */
function Nucleo({ x, y, r, brillo, reduce }: { x: number; y: number; r: number; brillo: string; reduce: boolean }) {
  return <motion.circle cx={x} cy={y} r={r} fill={brillo} {...vivo(reduce, { r: [r, r * 1.18, r] }, loop(4.2))} />;
}

/* Aparatos dibujados alrededor de (0,0): trazo fino, cristal apenas tintado. */
type Aparato = { x: number; y: number; c: string; s?: number };
const g = ({ x, y, c, s = 1 }: Aparato) => ({ transform: `translate(${x} ${y}) scale(${s})`, stroke: c, strokeWidth: 0.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });
const Movil = (p: Aparato) => <g {...g(p)}><rect x={-5} y={-8.5} width={10} height={17} rx={2.2} fill={VIDRIO} /><path d="M-1.5 -6.5h3" /></g>;
const Portatil = (p: Aparato) => <g {...g(p)}><rect x={-10} y={-7.5} width={20} height={13} rx={1.6} fill={VIDRIO} /><path d="M-13 7.5h26" /></g>;
const Antena = (p: Aparato) => <g {...g(p)}><path d="M0 -7L-4.5 8M0 -7L4.5 8M-2.4 1.5h4.8M-6 8h12" /><circle cy={-8.5} r={1.4} fill={p.c} /></g>;
const Navegador = (p: Aparato) => (
  <g {...g(p)}><rect x={-11} y={-7} width={22} height={14} rx={2} fill={VIDRIO} /><path d="M-11 -3h22M-2 -5h10" /><path d="M-8 -5h.01M-6 -5h.01" strokeWidth={1.2} /></g>
);

/* ───────── 1 · PROTOMOLÉCULA ─────────
   Una orbe-semilla de la vida (siete círculos y hexagrama) gira muy despacio; en su anillo áureo (R·φ) cinco
   átomos —las herramientas— llegan desde fuera, se enlazan en molécula, sostienen y vuelven a soltarse. */
export function ProtomoleculaDemo({ accent, reduce }: DemoSistemaProps) {
  const [cx, cy, R] = [100, 54, 21];
  const atomos = [accent, TRINITY.zenith, TRINITY.lima, TRINITY.logic, TRINITY.anchor].map((c, k) => {
    const a = -90 + k * 72;
    return { c, k, o: polar(cx, cy, R, a), m: polar(cx, cy, R * PHI, a), s: polar(cx, cy, R * PHI * PHI, a) };
  });
  const lineas = atomos.flatMap((a) => [[a.o, a.m], [a.m, atomos[(a.k + 1) % 5].m]]);
  const enlace = vivo(reduce, { pathLength: [0, 0, 1, 1, 0], opacity: [0, 0, 1, 1, 0] }, loop(9, { times: [0, 0.34, 0.5, 0.8, 0.92] }));
  return (
    <Escena accent={accent} etiqueta="Protomolécula: átomos, que son herramientas, se unen en una molécula viva alrededor de una orbe de geometría sagrada">
      {(brillo) => (
        <>
          <motion.g style={{ transformBox: "fill-box", transformOrigin: "center" }} {...vivo(reduce, { rotate: 360 }, { duration: 60, repeat: Infinity, ease: "linear" })}>
            <circle cx={cx} cy={cy} r={R} stroke={accent} strokeOpacity={0.6} strokeWidth={0.7} />
            {[[cx, cy] as Punto, ...hexagono(cx, cy, R / 2, -90)].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={R / 2} stroke={accent} strokeOpacity={0.3} strokeWidth={0.5} />
            ))}
            {[-90, -30].map((giro) => (
              <polygon key={giro} points={hexagono(cx, cy, R, giro).filter((_, k) => k % 2 === 0).join(" ")} stroke="#fff" strokeOpacity={0.16} strokeWidth={0.5} />
            ))}
          </motion.g>
          <Nucleo x={cx} y={cy} r={6} brillo={brillo} reduce={reduce} />
          {lineas.map(([[x1, y1], [x2, y2]], i) => (
            <motion.line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i % 2 ? "#fff" : accent} strokeOpacity={i % 2 ? 0.35 : 0.5} strokeWidth={0.6} {...enlace} />
          ))}
          {atomos.flatMap(({ c, k, m, s }) => [5.5, 2.4].map((r) => (
            <motion.circle key={`${k}-${r}`} cx={m[0]} cy={m[1]} r={r} fill={c} fillOpacity={r > 3 ? 0.14 : 1}
              {...vivo(reduce, { cx: [s[0], m[0], m[0], s[0]], cy: [s[1], m[1], m[1], s[1]], opacity: [0, 1, 1, 0] }, loop(9, { times: [0, 0.3, 0.8, 1], delay: k * 0.1 }))} />
          )))}
          <Texto x={10} y={52} anchor="start">átomos</Texto>
          <Texto x={10} y={61} anchor="start" size={7} color={TENUE}>herramientas</Texto>
          <Texto x={190} y={52} anchor="end">molécula</Texto>
          <Texto x={190} y={61} anchor="end" size={7} color={TENUE}>viva</Texto>
        </>
      )}
    </Escena>
  );
}

/* ───────── 2 · MALLA ─────────
   Móvil, portátil y antena se enlazan solos: Wi‑Fi cifrado (candado) entre tus aparatos y radio LoRa con
   mensajes cortos que van y vienen; arriba, el aviso de que todo esto funciona sin internet. */
export function MallaDemo({ accent, reduce }: DemoSistemaProps) {
  const [y, oy] = [58, 48.5];
  const aparece = (d: number) => (reduce ? { initial: false as const } : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 1.2, delay: d } });
  const ondas = [5, 9].map((r) => { const v = r * 0.7; return `M${170 - v} ${oy - v}A${r} ${r} 0 0 0 ${170 - v} ${oy + v}M${170 + v} ${oy - v}A${r} ${r} 0 0 1 ${170 + v} ${oy + v}`; });
  return (
    <Escena accent={accent} etiqueta="Redes mesh: un móvil, un portátil y una antena se enlazan solos por Wi‑Fi y por radio LoRa, sin internet; el enlace privado va cifrado">
      {() => (
        <>
          <rect x={64} y={11} width={72} height={14} rx={7} fill={VIDRIO} stroke="#fff" strokeOpacity={0.16} strokeWidth={0.6} />
          <path d="M76.6 18a3.1 3.1 0 1 1-6.2 0a3.1 3.1 0 1 1 6.2 0M71.3 15.8l4.4 4.4" stroke={TRINITY.anchor} strokeWidth={0.8} strokeLinecap="round" />
          <Texto x={80} y={20.7} anchor="start" size={7.5}>sin internet</Texto>
          <Movil x={32} y={y} c={TINTA} s={1.25} />
          <Portatil x={96} y={y} c={TINTA} s={1.2} />
          <Antena x={170} y={y + 1} c={TINTA} s={1.2} />
          <motion.path d={`M41 ${y}H80`} stroke={accent} strokeOpacity={0.75} strokeWidth={0.8} {...aparece(0.3)} />
          <motion.path d={`M112 ${y}H163`} stroke={TRINITY.logic} strokeOpacity={0.75} strokeWidth={0.8} strokeDasharray="2 2.6" {...aparece(0.9)} />
          {ondas.map((d, i) => (
            <motion.path key={d} d={d} stroke={TRINITY.logic} strokeWidth={0.7} strokeLinecap="round" strokeOpacity={0.6 - i * 0.25} {...vivo(reduce, { strokeOpacity: [0.08, 0.7, 0.08] }, loop(3.2, { delay: i * 0.5 }))} />
          ))}
          <motion.circle cx={51} cy={y} r={1.6} fill={accent} {...vivo(reduce, { cx: [42, 79, 42] }, loop(5.4))} />
          {[0, 1].map((i) => (
            <motion.circle key={i} cx={126 + i * 20} cy={y} r={1.3} fill={TRINITY.logic} {...vivo(reduce, { cx: [113, 120.5, 155.5, 163], opacity: [0, 1, 1, 0] }, loop(3.2, { ease: "linear", delay: 1.4 + i * 1.6, times: [0, 0.15, 0.85, 1] }))} />
          ))}
          <circle cx={60.5} cy={y} r={5.6} fill="rgba(6,10,16,0.92)" stroke={TRINITY.horizon} strokeOpacity={0.7} strokeWidth={0.6} />
          <path d={`M58.8 ${y - 0.6}v-1.4a1.7 1.7 0 0 1 3.4 0v1.4`} stroke={TRINITY.horizon} strokeWidth={0.8} />
          <rect x={57.8} y={y - 0.8} width={5.4} height={3.9} rx={0.9} fill={TRINITY.horizon} />
          <Texto x={60.5} y={y - 10} size={7.5}>Wi‑Fi</Texto>
          <Texto x={137.5} y={y - 6} size={7.5}>radio LoRa</Texto>
          {([["móvil", 32], ["portátil", 96], ["antena", 170]] as const).map(([t, x]) => <Texto key={t} x={x} y={y + 25}>{t}</Texto>)}
        </>
      )}
    </Escena>
  );
}

/* ───────── 3 · CAPAS DE CONCIENCIA ─────────
   Cuatro anillos en progresión áurea (9·φⁿ): local, malla y nube se encienden de dentro afuera —lo local
   primero— y se apagan juntos; la colectiva, discontinua y tenue, no llega a encenderse: va «en camino». */
export function CapasConcienciaDemo({ accent, reduce }: DemoSistemaProps) {
  const [cx, cy] = [60, 56];
  const capas = [{ t: "local", c: accent }, { t: "malla", c: TRINITY.horizon }, { t: "nube", c: TRINITY.zenith }, { t: "colectiva", c: TRINITY.oro }];
  return (
    <Escena accent={accent} etiqueta="Capas de conciencia de Astraura: local, malla y nube se encienden de dentro afuera; la capa colectiva está en camino">
      {(brillo) => (
        <>
          {capas.map(({ t, c }, i) => {
            const enCamino = i === 3;
            const [bajo, alto] = [0.14, enCamino ? 0.42 : 0.9];
            const t0 = 0.06 + i * 0.16;
            const ritmo = loop(8, { times: [0, t0, t0 + 0.08, 0.78, 0.9, 1] });
            const y = 31 + i * 15;
            return (
              <g key={t}>
                <motion.circle cx={cx} cy={cy} r={9 * PHI ** i} stroke={c} strokeWidth={0.9} strokeDasharray={enCamino ? "2 3" : undefined} strokeOpacity={enCamino ? 0.38 : alto - i * 0.08}
                  {...vivo(reduce, { strokeOpacity: [bajo, bajo, alto, alto, bajo, bajo] }, ritmo)} />
                <motion.g {...vivo(reduce, { opacity: [0.45, 0.45, 1, 1, 0.45, 0.45] }, ritmo)}>
                  <circle cx={122} cy={y - 2.7} r={2.3} fill={c} fillOpacity={enCamino ? 0.5 : 1} />
                  <Texto x={129} y={y} anchor="start">{t}</Texto>
                </motion.g>
              </g>
            );
          })}
          <Texto x={129} y={84} anchor="start" size={7} color={TRINITY.oro} italic>en camino</Texto>
          <Nucleo x={cx} y={cy} r={5} brillo={brillo} reduce={reduce} />
        </>
      )}
    </Escena>
  );
}

/* ───────── 4 · NEURONAS Y CEREBRO ─────────
   Móvil, portátil y navegador mandan pulsos por enlaces curvos a tu cerebro: una semilla hexagonal de seis
   memorias (memorias, baúles, conexiones, IA, permisos, servidores) que titilan y un halo que late con cada llegada. */
export function NeuronasCerebroDemo({ accent, reduce }: DemoSistemaProps) {
  const [bx, by, R] = [150, 54, 25];
  const neuronas = [
    { Icono: Movil, t: "móvil", y: 20, c: TRINITY.zenith, ang: 215 },
    { Icono: Portatil, t: "portátil", y: 54, c: TRINITY.horizon, ang: 180 },
    { Icono: Navegador, t: "navegador", y: 88, c: TRINITY.logic, ang: 145 },
  ];
  const memorias = hexagono(bx, by, R / 2, -90);
  const colores = [accent, TRINITY.zenith, TRINITY.horizon, TRINITY.logic, TRINITY.anchor, TRINITY.oro];
  return (
    <Escena accent={accent} etiqueta="Neuronas y cerebro: el móvil, el portátil y el navegador alimentan tu cerebro con memorias que viajan por sus enlaces">
      {(brillo) => (
        <>
          <circle cx={bx} cy={by} r={R} stroke={accent} strokeOpacity={0.55} strokeWidth={0.7} fill={VIDRIO} />
          <motion.circle cx={bx} cy={by} r={R} stroke={accent} strokeWidth={0.6} strokeOpacity={reduce ? 0.16 : 0} {...vivo(reduce, { r: [R, R + 6], strokeOpacity: [0.45, 0] }, loop(1.4, { ease: "easeOut", delay: 1.8 }))} />
          <polygon points={memorias.join(" ")} stroke="#fff" strokeOpacity={0.18} strokeWidth={0.5} />
          {memorias.map(([x, y], k) => (
            <g key={k}>
              <line x1={bx} y1={by} x2={x} y2={y} stroke="#fff" strokeOpacity={0.14} strokeWidth={0.5} />
              <motion.circle cx={x} cy={y} r={2.1} fill={colores[k]} opacity={0.85} {...vivo(reduce, { opacity: [0.35, 1, 0.35] }, loop(4.2, { delay: k * 0.7 }))} />
            </g>
          ))}
          <Nucleo x={bx} y={by} r={5.5} brillo={brillo} reduce={reduce} />
          {neuronas.map(({ Icono, t, y, c, ang }, i) => {
            // Cada pulso tarda 1,8 s y sale cada 4,2 s; escalonados 1,4 s, llegan al ritmo del halo.
            const { d, xs, ys } = curva([42, y], [90, y], polar(bx, by, R + 1, ang));
            return (
              <g key={t}>
                <Icono x={26} y={y} c={TINTA} />
                <Texto x={26} y={y + 16} size={7.5}>{t}</Texto>
                <path d={d} stroke={c} strokeOpacity={0.4} strokeWidth={0.7} />
                <motion.circle cx={xs[3]} cy={ys[3]} r={1.7} fill={c} {...vivo(reduce, { cx: xs, cy: ys, opacity: [0, 1, 1, 1, 1, 0] }, loop(1.8, { ease: "linear", delay: i * 1.4, repeatDelay: 2.4 }))} />
              </g>
            );
          })}
          <Texto x={bx} y={by + R + 15}>tu cerebro</Texto>
        </>
      )}
    </Escena>
  );
}

/** Por clave de tema de la guía (`guia-temas-sistema.ts`), para quien las monte en el tour. */
export const DEMOS_SISTEMA = {
  protomolecula: ProtomoleculaDemo, malla: MallaDemo, "capas-conciencia": CapasConcienciaDemo, "neuronas-cerebro": NeuronasCerebroDemo,
} as const;
