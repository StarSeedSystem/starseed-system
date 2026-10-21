"use client";

/**
 * demos-red — mini demostraciones de la guía (GUI1021E): los tres pilares de la red
 * (Política, Educación, Cultura), Librería y Biblioteca, Genesis y la personalización
 * segura. Misma firma que las de `aurora-guide-demos.tsx`: `{ accent, reduce }`.
 *
 * · SVG ligero sobre un lienzo áureo (180 × 112 ≈ φ), trazos finos y un único brillo sutil.
 * · `accent` manda; Trinity acompaña con su sentido: Zenith = la red, Horizon = crear y
 *   aceptar, Logic = umbral, insignia y deshacer, Anchor = el núcleo.
 * · Con `reduce` todo queda quieto en un fotograma que ya explica la idea.
 * · Textos mínimos y verdaderos (guias-introduccion.md §3): nada promete lo que no existe.
 */

import { useId, type ReactNode } from "react";
import { motion, type TargetAndTransition, type Transition } from "framer-motion";

export type DemoRedProps = { accent: string; reduce: boolean };
type Pt = readonly [number, number];
type Valor = number | string;

const W = 180;
const H = 112;
const PHI = 1.618;
const TR = { zenith: "#007FFF", horizon: "#10B981", lima: "#39FF14", logic: "#D4AF37", anchor: "#DC143C" } as const;
const TINTA = "rgba(255,255,255,0.72)";
const TENUE = "rgba(255,255,255,0.16)";

/** Bucle lento por fotogramas; con `reduce` queda quieto en `fijo`. */
function ciclo(reduce: boolean, fijo: Record<string, Valor>, cuadros: Record<string, Valor[]>, duration: number, times?: number[], extra: Transition = {}) {
  if (reduce) return { initial: fijo as TargetAndTransition, animate: fijo as TargetAndTransition };
  const desde = Object.fromEntries(Object.entries(cuadros).map(([k, v]) => [k, v[0]]));
  return {
    initial: desde as TargetAndTransition,
    animate: cuadros as TargetAndTransition,
    transition: { duration, times, repeat: Infinity, ease: "easeInOut", ...extra } as Transition,
  };
}

const mezcla = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** Punto de una circunferencia: `f` = fracción de vuelta desde arriba, en sentido horario. */
const polar = (c: Pt, r: number, f: number): Pt => [c[0] + r * Math.sin(2 * Math.PI * f), c[1] - r * Math.cos(2 * Math.PI * f)];
/** Punta de flecha fina en `t`, mirando hacia `d` (se añade como subtrazo de un path). */
function punta(t: Pt, d: Pt, l = 3.2): string {
  const n = Math.hypot(d[0], d[1]);
  const [ux, uy] = [d[0] / n, d[1] / n];
  const p = (s: number) => `${t[0] + l * (-0.866 * ux + 0.5 * s * uy)} ${t[1] + l * (-0.5 * s * ux - 0.866 * uy)}`;
  return `M${p(1)} L${t[0]} ${t[1]} L${p(-1)}`;
}

/** Lienzo común: cristal oscuro con la rejilla de las demás demos y un brillo reutilizable. */
function Escena({ accent, etiqueta, children }: { accent: string; etiqueta: string; children: (brillo: string) => ReactNode }) {
  const id = `brillo-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <div
      className="relative h-28 w-full overflow-hidden rounded-2xl border border-white/10"
      style={{
        backgroundColor: "rgba(6,10,16,0.6)",
        backgroundImage: `radial-gradient(120% 120% at 50% 0%, color-mix(in srgb, ${accent} 12%, transparent), transparent 60%), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
        backgroundSize: "100% 100%, 22px 22px, 22px 22px",
      }}
    >
      <svg role="img" aria-label={etiqueta} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" fill="none" fontSize={7} strokeLinecap="round" strokeLinejoin="round">
        <defs>
          <filter id={id} filterUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
            <feGaussianBlur stdDeviation={1.4} result="halo" />
            <feMerge><feMergeNode in="halo" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {children(`url(#${id})`)}
      </svg>
    </div>
  );
}

function Rotulo({ x, y, children, color = TINTA, ancla = "middle" }: { x: number; y: number; children: ReactNode; color?: string; ancla?: "start" | "middle" | "end" }) {
  return <text x={x} y={y} fill={color} textAnchor={ancla} letterSpacing={0.3} fontWeight={500}>{children}</text>;
}

function Nodo({ c, color, r = 3.6, brillo }: { c: Pt; color: string; r?: number; brillo?: string }) {
  return (
    <g filter={brillo}>
      <circle cx={c[0]} cy={c[1]} r={r} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={0.8} />
      <circle cx={c[0]} cy={c[1]} r={r * 0.38} fill="#fff" />
    </g>
  );
}

function Hilo({ a, b, color = TENUE, dash }: { a: Pt; b: Pt; color?: string; dash?: string }) {
  return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={0.6} strokeDasharray={dash} />;
}

/** Una chispa que viaja de `a` a `b`; quieta, se ve a medio camino para enseñar el sentido. */
function Chispa({ a, b, color, reduce, brillo, delay = 0 }: { a: Pt; b: Pt; color: string; reduce: boolean; brillo: string; delay?: number }) {
  const q = mezcla(a, b, 0.62);
  return (
    <motion.circle r={1.5} fill={color} filter={brillo}
      {...ciclo(reduce, { cx: q[0], cy: q[1], opacity: 1 }, { cx: [a[0], a[0], b[0], b[0]], cy: [a[1], a[1], b[1], b[1]], opacity: [0, 1, 1, 0] }, 3.2, [0, 0.12, 0.88, 1], { delay, repeatDelay: 0.8 })} />
  );
}

/* 1 · POLÍTICA — la propuesta suma apoyo hasta pasar el umbral; tu voto viaja a la delegada
   y vuelve a ti al retirarlo (delegación líquida revocable). */
export function PoliticaDemo({ accent, reduce }: DemoRedProps) {
  const P: Pt = [128, 56], D: Pt = [66, 30], O: Pt = [64, 86], T: Pt = [26, 64], R = 24;
  const borde = (x: Pt) => mezcla(P, x, R / Math.hypot(x[0] - P[0], x[1] - P[1]));
  const vuelta = [0, 0.18, 0.52, 0.7, 1];
  return (
    <Escena accent={accent} etiqueta="Política: una propuesta recibe votos y tu voto delegado vuelve a ti cuando retiras la delegación">
      {(b) => (
        <>
          <Hilo a={D} b={borde(D)} />
          <Hilo a={O} b={borde(O)} />
          <Hilo a={T} b={D} color={accent} dash="2 2.5" />
          <circle cx={P[0]} cy={P[1]} r={R} stroke={TENUE} strokeWidth={1.2} />
          <g transform={`rotate(-90 ${P[0]} ${P[1]})`}>
            <motion.circle cx={P[0]} cy={P[1]} r={R} stroke={accent} strokeWidth={1.6} filter={b}
              {...ciclo(reduce, { pathLength: 0.66, opacity: 1 }, { pathLength: [0.3, 0.3, 0.68, 0.68, 0.68], opacity: [0, 1, 1, 1, 0] }, 9, [0, 0.08, 0.7, 0.94, 1])} />
          </g>
          <Hilo a={polar(P, R - 4, 0.6)} b={polar(P, R + 4, 0.6)} color={TR.logic} />
          <Rotulo x={polar(P, R + 12, 0.6)[0]} y={polar(P, R + 12, 0.6)[1] + 2} color={TR.logic}>umbral</Rotulo>
          <Rotulo x={P[0]} y={P[1] + 2.5}>propuesta</Rotulo>
          <Chispa a={D} b={borde(D)} color={accent} reduce={reduce} brillo={b} />
          <Chispa a={O} b={borde(O)} color={accent} reduce={reduce} brillo={b} delay={1.6} />
          <motion.circle cx={D[0]} cy={D[1]} fill={accent} {...ciclo(reduce, { r: 4, opacity: 0 }, { r: [4, 4, 7.5, 7.5, 4, 4], opacity: [0, 0, 0.35, 0.35, 0, 0] }, 9, [0, 0.16, 0.22, 0.5, 0.56, 1])} />
          <Nodo c={D} color={TR.zenith} />
          <Nodo c={O} color={TR.zenith} />
          <Nodo c={T} color={accent} brillo={b} />
          <motion.path d={`M61 43 Q58 58 43 59 ${punta([43, 59], [-15, 1])}`} stroke={TINTA} strokeWidth={0.8} strokeLinecap="butt"
            {...ciclo(reduce, { pathLength: 1, opacity: 1 }, { pathLength: [0, 0, 1, 1, 1], opacity: [1, 1, 1, 1, 0] }, 9, [0, 0.52, 0.7, 0.9, 1])} />
          <motion.circle r={2.1} fill="#fff" filter={b}
            {...ciclo(reduce, { cx: T[0], cy: T[1] }, { cx: [T[0], D[0], D[0], T[0], T[0]], cy: [T[1], D[1], D[1], T[1], T[1]] }, 9, vuelta)} />
          <Rotulo x={D[0]} y={D[1] - 9}>delegada</Rotulo>
          <Rotulo x={T[0]} y={T[1] + 14}>tú</Rotulo>
        </>
      )}
    </Escena>
  );
}

/* 2 · EDUCACIÓN — la ruta enciende temas del Mapa del Conocimiento y acaba en una insignia. */
export function EducacionDemo({ accent, reduce }: DemoRedProps) {
  const ruta: Pt[] = [[24, 84], [56, 60], [92, 70], [124, 42]];
  const otros: Pt[] = [[20, 40], [52, 24], [90, 28], [152, 84], [108, 96], [64, 98]];
  const lazos: [Pt, Pt][] = [[ruta[0], otros[0]], [ruta[1], otros[1]], [otros[1], otros[2]], [ruta[3], otros[2]], [ruta[1], otros[5]], [ruta[2], otros[4]], [ruta[2], otros[3]], [ruta[3], otros[3]]];
  const tramos = ruta.slice(1).map((p, i) => Math.hypot(p[0] - ruta[i][0], p[1] - ruta[i][1]));
  const total = tramos.reduce((s, x) => s + x, 0);
  const llega = ruta.map((_, i) => 0.02 + (0.53 * tramos.slice(0, i).reduce((s, x) => s + x, 0)) / total);
  const B: Pt = [154, 32];
  const d = `M${ruta.map((p) => p.join(" ")).join(" L")}`;
  return (
    <Escena accent={accent} etiqueta="Educación: tu ruta enciende temas del Mapa del Conocimiento y termina en una insignia">
      {(b) => (
        <>
          {lazos.map(([p, q], i) => <Hilo key={i} a={p} b={q} />)}
          {otros.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={1.8} fill={TR.zenith} fillOpacity={0.55} />)}
          <path d={d} stroke={TENUE} strokeWidth={1} />
          <motion.path d={d} stroke={accent} strokeWidth={1.2} strokeLinecap="butt" filter={b} {...ciclo(reduce, { pathLength: 1, opacity: 1 }, { pathLength: [0, 1, 1, 1], opacity: [1, 1, 1, 0] }, 8, [0, 0.55, 0.9, 1])} />
          <Hilo a={ruta[3]} b={mezcla(B, ruta[3], 11 / Math.hypot(B[0] - ruta[3][0], B[1] - ruta[3][1]))} color={TR.logic} dash="1.5 2" />
          {ruta.map((p, i) => (
            <g key={i}>
              <circle cx={p[0]} cy={p[1]} r={3.6} fill={accent} fillOpacity={0.1} stroke={accent} strokeOpacity={0.6} strokeWidth={0.8} />
              <motion.g filter={b} {...ciclo(reduce, { opacity: 1 }, { opacity: [0.12, 0.12, 1, 1, 0.12] }, 8, [0, llega[i], llega[i] + 0.05, 0.9, 1])}>
                <circle cx={p[0]} cy={p[1]} r={3.6} fill={accent} fillOpacity={0.35} />
                <circle cx={p[0]} cy={p[1]} r={1.4} fill="#fff" />
              </motion.g>
            </g>
          ))}
          <motion.g {...ciclo(reduce, { opacity: 1, scale: 1 }, { opacity: [0, 0, 1, 1, 0], scale: [0.7, 0.7, 1, 1, 0.9] }, 8, [0, 0.56, 0.66, 0.9, 1])}>
            <g filter={b}>
              <polygon points={Array.from({ length: 6 }, (_, k) => polar(B, 9.5, k / 6).join(" ")).join(" ")} fill={TR.logic} fillOpacity={0.14} stroke={TR.logic} strokeWidth={0.9} />
              <path d={`M${B[0] - 3.6} ${B[1] + 0.2} L${B[0] - 1} ${B[1] + 2.8} L${B[0] + 3.8} ${B[1] - 2.6}`} stroke="#fff" strokeWidth={1.1} />
            </g>
            <Rotulo x={B[0]} y={B[1] + 20} color={TR.logic}>insignia</Rotulo>
          </motion.g>
          <Rotulo x={8} y={12} ancla="start" color="rgba(255,255,255,0.45)">Mapa del Conocimiento</Rotulo>
          <Rotulo x={ruta[0][0]} y={ruta[0][1] + 13}>tu ruta</Rotulo>
        </>
      )}
    </Escena>
  );
}

/** Una obra con su motivo; todas sus apariciones comparten el mismo bucle, así cambian a la vez. */
function Obra({ c, s, accent, reduce }: { c: Pt; s: number; accent: string; reduce: boolean }) {
  const [x, y] = c;
  return (
    <g>
      <rect x={x - 18 * s} y={y - 14 * s} width={36 * s} height={28 * s} rx={4 * s} fill="#0b111a" stroke="rgba(255,255,255,0.3)" strokeWidth={0.7} />
      <motion.circle cy={y - 3 * s} r={5 * s}
        {...ciclo(reduce, { fill: accent, cx: x - 6 * s }, { fill: [accent, accent, TR.lima, TR.lima, TR.zenith, TR.zenith, accent], cx: [x - 6 * s, x - 6 * s, x + 6 * s, x + 6 * s, x, x, x - 6 * s] }, 9, [0, 0.28, 0.34, 0.61, 0.67, 0.94, 1])} />
      <path d={`M${x - 14 * s} ${y + 8 * s} q${7 * s} ${-6 * s} ${14 * s} 0 t${14 * s} 0`} stroke={accent} strokeOpacity={0.7} strokeWidth={0.8} />
    </g>
  );
}

/* 3 · CULTURA — una obra única, referenciada (no copiada) en varios sitios: cambia en todos a la vez. */
export function CulturaDemo({ accent, reduce }: DemoRedProps) {
  const C: Pt = [90, 48];
  const sitios: Pt[] = [[30, 30], [30, 84], [150, 30], [150, 84]];
  return (
    <Escena accent={accent} etiqueta="Cultura: una obra única aparece en varios sitios por referencia y, al cambiar, cambia en todos a la vez">
      {(b) => (
        <>
          {sitios.map((p, i) => (
            <motion.line key={i} x1={p[0]} y1={p[1]} x2={C[0]} y2={C[1]} stroke={accent} strokeOpacity={0.55} strokeWidth={0.6} strokeDasharray="1.5 3"
              {...ciclo(reduce, { strokeDashoffset: 0 }, { strokeDashoffset: [0, -9] }, 1.8, undefined, { ease: "linear" })} />
          ))}
          {sitios.map((p, i) => <Obra key={i} c={p} s={0.72} accent={accent} reduce={reduce} />)}
          <g filter={b}><Obra c={C} s={1} accent={accent} reduce={reduce} /></g>
          <Rotulo x={C[0]} y={C[1] + 25}>obra única</Rotulo>
        </>
      )}
    </Escena>
  );
}

/** Ficha de la Biblioteca: un enlace (dos eslabones) a algo que vive en la Librería. */
function Ficha({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g>
      <rect x={x} y={y} width={38} height={10} rx={5} fill={color} fillOpacity={0.12} stroke={color} strokeOpacity={0.55} strokeWidth={0.7} />
      <g transform={`rotate(-35 ${x + 7.5} ${y + 5})`} stroke={color} strokeWidth={0.8}>
        <rect x={x + 3} y={y + 3.6} width={5} height={2.8} rx={1.4} />
        <rect x={x + 7} y={y + 3.6} width={5} height={2.8} rx={1.4} />
      </g>
      <rect x={x + 14} y={y + 4.3} width={14} height={1.4} rx={0.7} fill="#fff" fillOpacity={0.4} />
    </g>
  );
}

/* 4 · LIBRERÍA Y BIBLIOTECA — del catálogo de toda la red guardas una REFERENCIA en tu carpeta:
   la ficha original no se mueve y su nueva versión se ve a la vez en los dos sitios. */
export function LibreriaBibliotecaDemo({ accent, reduce }: DemoRedProps) {
  const celdas: Pt[] = [0, 1, 2].flatMap((f) => [0, 1, 2].map((k): Pt => [14 + k * 21, 38 + f * 16]));
  const [ex, ey] = celdas[4];
  const version = ciclo(reduce, { fill: TR.horizon }, { fill: ["#ffffff", "#ffffff", TR.horizon, TR.horizon, "#ffffff"] }, 8, [0, 0.6, 0.66, 0.94, 1]);
  return (
    <Escena accent={accent} etiqueta="Librería y Biblioteca: del catálogo de toda la red guardas en tu Biblioteca una referencia, no una copia">
      {(b) => (
        <>
          {celdas.map(([x, y], i) => (
            <g key={i}>
              <rect x={x} y={y} width={16} height={11} rx={2} fill="#fff" fillOpacity={0.05} stroke={TR.zenith} strokeOpacity={0.4} strokeWidth={0.6} />
              <rect x={x + 3} y={y + 7} width={8} height={1.4} rx={0.7} fill="#fff" fillOpacity={0.25} />
            </g>
          ))}
          <motion.rect x={ex} y={ey} width={16} height={11} rx={2} stroke={accent} strokeWidth={0.9} filter={b}
            {...ciclo(reduce, { strokeOpacity: 1 }, { strokeOpacity: [0.2, 1, 1, 1, 0.2] }, 8, [0, 0.1, 0.42, 0.9, 1])} />
          <motion.circle cx={ex + 13} cy={ey + 3} r={1.3} {...version} />
          <path d="M112 44 a3 3 0 0 1 3 -3 h14 l4 4 h30 a3 3 0 0 1 3 3 v36 a3 3 0 0 1 -3 3 h-48 a3 3 0 0 1 -3 -3 z" fill={accent} fillOpacity={0.06} stroke={accent} strokeOpacity={0.6} strokeWidth={0.8} />
          <g opacity={0.45}><Ficha x={120} y={50} color={TINTA} /></g>
          <motion.path d={`M${ex + 16} ${ey + 5.5} C78 44 94 82 120 69`} stroke={accent} strokeWidth={0.9} strokeLinecap="butt" filter={b}
            {...ciclo(reduce, { pathLength: 1, opacity: 1 }, { pathLength: [0, 0, 1, 1, 1], opacity: [1, 1, 1, 1, 0] }, 8, [0, 0.12, 0.42, 0.9, 1])} />
          <motion.g {...ciclo(reduce, { opacity: 1, y: 0 }, { opacity: [0, 0, 1, 1, 0], y: [3, 3, 0, 0, 0] }, 8, [0, 0.4, 0.5, 0.9, 1])}>
            <Ficha x={120} y={64} color={accent} />
            <motion.circle cx={153} cy={69} r={1.3} {...version} />
          </motion.g>
          <Rotulo x={45} y={30}>Librería</Rotulo>
          <Rotulo x={139} y={30}>Tu Biblioteca</Rotulo>
        </>
      )}
    </Escena>
  );
}

/* 5 · GENESIS — petición → vista previa → aceptar (o votar en grupo) → deshacer, en ciclo. */
export function GenesisDemo({ accent, reduce }: DemoRedProps) {
  const traza = (times: number[]) => ciclo(reduce, { pathLength: 1, opacity: 1 }, { pathLength: [0, 0, 1, 1, 1], opacity: [1, 1, 1, 1, 0] }, 9, times);
  const flecha = (x0: number, x1: number) => `M${x0} 60 H${x1} ${punta([x1, 60], [1, 0])}`;
  const arco = `M150 48 Q90 2 30 48 ${punta([30, 48], [-60, 46])}`;
  return (
    <Escena accent={accent} etiqueta="Genesis: pides un cambio, ves la vista previa, lo aceptas o tu grupo lo vota, y siempre puedes deshacer">
      {(b) => (
        <g transform="translate(0 4)" strokeLinecap="butt">
          <path d={arco} stroke={TENUE} strokeWidth={0.7} strokeDasharray="2 2.5" />
          <path d={flecha(48, 71)} stroke={TENUE} strokeWidth={0.7} />
          <path d={flecha(109, 133)} stroke={TENUE} strokeWidth={0.7} />
          <path d="M19 52 h22 a4 4 0 0 1 4 4 v8 a4 4 0 0 1 -4 4 h-14 l-5 4 v-4 h-3 a4 4 0 0 1 -4 -4 v-8 a4 4 0 0 1 4 -4 z" fill={accent} fillOpacity={0.08} stroke={accent} strokeOpacity={0.7} strokeWidth={0.8} />
          <motion.path d="M20 57.5 H38" stroke={TINTA} strokeWidth={1.2} {...traza([0, 0.02, 0.1, 0.92, 1])} />
          <motion.path d="M20 62.5 H32" stroke={TINTA} strokeWidth={1.2} {...traza([0, 0.08, 0.14, 0.92, 1])} />
          <motion.path d={flecha(48, 71)} stroke={accent} strokeWidth={0.9} filter={b} {...traza([0, 0.12, 0.22, 0.92, 1])} />
          <rect x={75} y={49} width={30} height={22} rx={3} fill="#fff" fillOpacity={0.03} stroke="rgba(255,255,255,0.35)" strokeWidth={0.7} />
          <path d="M75 54 H105" stroke={TENUE} strokeWidth={0.6} />
          <motion.g fill={accent} fillOpacity={0.35} stroke={accent} strokeWidth={0.6} strokeDasharray="1.5 1.5"
            {...ciclo(reduce, { opacity: 0.9 }, { opacity: [0.15, 0.15, 0.9, 0.9, 0.15, 0.15] }, 9, [0, 0.22, 0.3, 0.74, 0.84, 1])}>
            <rect x={79} y={57} width={10} height={10} rx={1.5} />
            <rect x={91} y={57} width={10} height={4.2} rx={1.2} />
            <rect x={91} y={62.8} width={10} height={4.2} rx={1.2} />
          </motion.g>
          <motion.path d={flecha(109, 133)} stroke={accent} strokeWidth={0.9} filter={b} {...traza([0, 0.34, 0.46, 0.92, 1])} />
          <circle cx={144} cy={60} r={7} fill={TR.horizon} fillOpacity={0.1} stroke={TR.horizon} strokeOpacity={0.8} strokeWidth={0.8} />
          <motion.path d="M140.5 60.2 L143 62.8 L147.8 57.6" stroke={TR.horizon} strokeWidth={1.2} filter={b}
            {...ciclo(reduce, { pathLength: 1, opacity: 1 }, { pathLength: [0, 0, 1, 1, 1, 1], opacity: [1, 1, 1, 1, 0, 0] }, 9, [0, 0.46, 0.56, 0.76, 0.84, 1])} />
          {[0, 1, 2].map((k) => {
            const [x, y] = polar([159, 60.5], 4, k / 3);
            return <motion.circle key={k} cx={x} cy={y} r={1.4} fill={TR.zenith} {...ciclo(reduce, { opacity: 1 }, { opacity: [0.3, 0.3, 1, 1, 0.3, 0.3] }, 9, [0, 0.5 + k * 0.03, 0.58 + k * 0.03, 0.76, 0.84, 1])} />;
          })}
          <motion.path d={arco} stroke={TR.logic} strokeWidth={0.9} filter={b} {...traza([0, 0.62, 0.76, 0.92, 1])} />
          <Rotulo x={30} y={86}>petición</Rotulo>
          <Rotulo x={90} y={86}>vista previa</Rotulo>
          <Rotulo x={150} y={86}>acepta o vota</Rotulo>
          <Rotulo x={90} y={20} color={TR.logic}>deshacer</Rotulo>
        </g>
      )}
    </Escena>
  );
}

/* 6 · PERSONALIZACIÓN SEGURA — los bloques (proporción áurea) se reordenan; el núcleo, con su
   candado, no se mueve. Quieta: un bloque a medio arrastre sobre su hueco. */
export function PersonalizacionSeguraDemo({ accent, reduce }: DemoRedProps) {
  const a = 90 / PHI, c = 90 - a;
  const bloques = [
    { x: 48 + a, y: 18, w: c, color: TR.zenith, dx: -(a + 6), s: 1, fila: 0 },
    { x: 42, y: 46, w: c, color: TR.horizon, dx: a + 6, s: -1, fila: 1 },
    { x: 48 + c, y: 46, w: a, color: TR.logic, dx: -(c + 6), s: 1, fila: 1 },
    { x: 42, y: 18, w: a, color: accent, dx: c + 6, s: -1, fila: 0 },
  ];
  return (
    <Escena accent={accent} etiqueta="Personalización segura: los bloques de tu interfaz se reordenan mientras el núcleo queda fijo con candado">
      {(b) => (
        <>
          <rect x={34} y={10} width={112} height={92} rx={10} fill="#fff" fillOpacity={0.02} stroke="rgba(255,255,255,0.22)" strokeWidth={0.7} />
          {bloques.map((k, i) => <rect key={i} x={k.x} y={k.y} width={k.w} height={22} rx={4} stroke="rgba(255,255,255,0.14)" strokeWidth={0.6} strokeDasharray="2 2" />)}
          {bloques.map((k, i) => {
            const desfase = k.fila * 0.1;
            const tiempos = [0, 0.12, 0.22, 0.32, 0.62, 0.72, 0.82, 1].map((t, j) => (j === 0 || j === 7 ? t : t + desfase));
            const arrastre = i === bloques.length - 1;
            return (
              <motion.g key={i} filter={arrastre ? b : undefined}
                {...ciclo(reduce, arrastre ? { x: 12, y: -3 } : { x: 0, y: 0 }, { x: [0, 0, k.dx / 2, k.dx, k.dx, k.dx / 2, 0, 0], y: [0, 0, 3.5 * k.s, 0, 0, 3.5 * k.s, 0, 0] }, 10, tiempos)}>
                <rect x={k.x} y={k.y} width={k.w} height={22} rx={4} fill={k.color} fillOpacity={0.16} stroke={k.color} strokeOpacity={0.75} strokeWidth={0.8} />
                <rect x={k.x + 5} y={k.y + 15} width={k.w * 0.45} height={1.6} rx={0.8} fill={k.color} fillOpacity={0.7} />
              </motion.g>
            );
          })}
          <rect x={42} y={76} width={96} height={18} rx={6} fill={TR.anchor} fillOpacity={0.1} stroke={TR.anchor} strokeOpacity={0.8} strokeWidth={0.8} />
          <g filter={b}>
            <path d="M49.6 84 v-2 a2.4 2.4 0 0 1 4.8 0 v2" stroke={TR.anchor} strokeWidth={1} />
            <rect x={48} y={84} width={8} height={6} rx={1.3} fill={TR.anchor} />
          </g>
          <Rotulo x={60} y={87.6} ancla="start">núcleo intocable</Rotulo>
        </>
      )}
    </Escena>
  );
}

/** Las seis demos por la clave de su tema (guias-introduccion.md §3), para el tour y las tarjetas. */
export const DEMOS_RED = {
  "pilar-politica": PoliticaDemo,
  "pilar-educacion": EducacionDemo,
  "pilar-cultura": CulturaDemo,
  "libreria-biblioteca": LibreriaBibliotecaDemo,
  genesis: GenesisDemo,
  "personalizacion-segura": PersonalizacionSeguraDemo,
} as const;
