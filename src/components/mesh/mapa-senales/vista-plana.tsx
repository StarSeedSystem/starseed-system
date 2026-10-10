"use client";

/**
 * Vista plana del mapa: el radar de siempre, pero con el MISMO modelo que el 3D (`construirModeloMapa`).
 * Es la vista ligera para móviles y equipos modestos, el mini radar de los paneles y la red de
 * seguridad si el navegador no abre WebGL. Sin barrido giratorio ni ondas de adorno: lo único que
 * late es lo que se oyó hace menos de 30 s, y se detiene con `prefers-reduced-motion`.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ANTENNA_SECTOR } from "@/ai/astraura/mesh/signals";
import { TEXTO_ESTADO } from "@/lib/senales/aparatos";
import { ESTILO_ENLACE, valorEnlace } from "@/lib/senales/enlaces";
import type { CentroNeurona } from "@/lib/senales/centro";
import { RADIO_ESCENA, type MarcadorEscena } from "@/lib/senales/mapa-3d";
import type { ModeloMapa } from "@/lib/senales/modelo";
import { colocarRotulos, type Anclaje, type Caja, type Posicion, type Rotulo } from "@/lib/senales/rotulos";
import { COLOR_ESTADO } from "@/lib/senales/aparatos";
import { TrazosIcono } from "./icono-2d";

const C = 50;
const R = 45;
const K = R / RADIO_ESCENA;
const mx = (x: number) => C + x * K;

/** Cuña SVG del sector de una antena. */
function cuna(center: number, half: number): string {
  const a0 = center - half, a1 = center + half;
  const p = (a: number) => `${(C + Math.cos(a) * R).toFixed(2)} ${(C + Math.sin(a) * R).toFixed(2)}`;
  return `M ${C} ${C} L ${p(a0)} A ${R} ${R} 0 ${half > Math.PI / 2 ? 1 : 0} 1 ${p(a1)} Z`;
}

/** Arco de un anillo estimado: solo el trozo de su sector. */
function arco(r: number, a0: number, a1: number): string {
  const p = (a: number) => `${(C + Math.cos(a) * r).toFixed(2)} ${(C + Math.sin(a) * r).toFixed(2)}`;
  return `M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`;
}

/** Un icono de tipo de señal (rejilla de 12) centrado en (x, y) con la mitad de lado `m`. */
function Icono({ id, x, y, m, relleno, borde, opacidad }: { id: MarcadorEscena["icono"]; x: number; y: number; m: number; relleno: string; borde: string; opacidad: number }) {
  return (
    <g transform={`translate(${(x - m).toFixed(2)} ${(y - m).toFixed(2)}) scale(${((m * 2) / 12).toFixed(4)})`} opacity={opacidad}>
      <TrazosIcono id={id} relleno={relleno} borde={borde} grosor={0.8} />
    </g>
  );
}

/** Foto redonda dentro del SVG (recortada por un círculo). `clave` hace único el recorte. */
function FotoSvg({ clave, url, x, y, r, color }: { clave: string; url: string; x: number; y: number; r: number; color: string }) {
  const id = `ss-foto-${clave.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  return (
    <g pointerEvents="none">
      <clipPath id={id}><circle cx={x} cy={y} r={r} /></clipPath>
      <circle cx={x} cy={y} r={r} fill="#0b1220" />
      <image href={url} x={x - r} y={y - r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`} />
      <circle cx={x} cy={y} r={r} fill="none" stroke={color} strokeWidth={0.45} />
    </g>
  );
}

const radioMarca = (m: MarcadorEscena) => 1.5 + (m.senal.quality == null ? 0.3 : m.senal.quality * 1.2);
const anclajeDe = (cos: number): Anclaje => (cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle");

/** Todos los textos que el plano querría dibujar; `rotulosVisibles` decide cuáles caben sin taparse. */
function construirRotulos(
  modelo: ModeloMapa, seleccionId: string | null, apuntadaId: string | null, mini: boolean, etiquetaCentro?: string, centro?: CentroNeurona | null,
): { rotulos: Rotulo[]; reservadas: Caja[] } {
  const rotulos: Rotulo[] = [];
  // Reservado: el punto de «Tú» y el cuerpo de cada marca; los nombres buscan sitio libre (arriba, abajo…).
  const reservadas: Caja[] = [centro ? { x0: C - 5, x1: C + 5, y0: C - 5, y1: C + 5 } : { x0: C - 3.6, x1: C + 3.6, y0: C - 3.6, y1: C + 3.6 }];
  const debajo = (x: number, y: number, r: number): Posicion => ({ x, y: y + r + 3.4, anclaje: "middle" });
  for (const m of modelo.medios) reservadas.push({ x0: mx(m.x) - 1.9, x1: mx(m.x) + 1.9, y0: mx(m.z) - 1.9, y1: mx(m.z) + 1.9 });
  for (const m of modelo.marcadores) {
    const r = radioMarca(m);
    const x = mx(m.x), y = mx(m.z);
    reservadas.push({ x0: x - r - 0.3, x1: x + r + 0.3, y0: y - r - 0.3, y1: y + r + 0.3 });
    const fuerte = seleccionId === m.id || apuntadaId === m.id;
    if (!fuerte && (mini || !m.esAparato)) continue;
    // Elegido o apuntado: nombre y enlace. El resto de aparatos, solo el nombre (cabe más sin taparse).
    const enlace = fuerte && m.esAparato && m.enlaceMapa ? ` · ${valorEnlace(m.enlaceMapa, m.estado)}` : "";
    rotulos.push({ id: `m:${m.id}`, x, y: y - r - 1.9, texto: `${m.senal.label.slice(0, fuerte ? 22 : 16)}${enlace}`, anclaje: "middle", tam: 2.4, prioridad: fuerte ? 100 : 70, alternativas: [debajo(x, y, r)] });
  }
  if (mini) return { rotulos, reservadas };
  for (const s of modelo.sectores) {
    const sec = ANTENNA_SECTOR[s.familia];
    rotulos.push({ id: `sector:${s.familia}`, x: C + Math.cos(sec.center) * (R + 3.4), y: C + Math.sin(sec.center) * (R + 3.4) + 0.8, texto: s.etiqueta, anclaje: anclajeDe(Math.cos(sec.center)), tam: 2.4, prioridad: 100 });
  }
  for (const a of modelo.anillos) {
    const sec = a.desdeRad !== null && a.hastaRad !== null;
    const ang = sec ? (a.desdeRad! + a.hastaRad!) / 2 : 0.37;
    const r = a.fraccion * R;
    const half = sec ? (a.hastaRad! - a.desdeRad!) / 2 : 0;
    // El nombre del anillo va sobre su línea; si ahí hay una marca, prueba otros puntos del mismo anillo.
    // Los arcos «≈» tienen menos sitio posible (solo su sector) y son los que avisan de que es una estimación: van antes.
    const donde = (g: number, sube = 0.6): Posicion => ({ x: C + Math.cos(g) * r + 0.8, y: C + Math.sin(g) * r - sube, anclaje: "start" });
    const angulos = sec ? [-0.5, 0.5, -0.92, 0.92].map((f) => ang + f * half) : [-0.37, 0.9, -0.9, 2.2, -2.2, Math.PI];
    const otros = [...angulos.map((g) => donde(g)), ...angulos.map((g) => donde(g, 1.5))];
    rotulos.push({ id: `anillo:${a.id}`, x: C + Math.cos(ang) * r + 0.8, y: C + Math.sin(ang) * r - 0.6, texto: a.etiqueta, anclaje: "start", tam: 2.3, prioridad: sec ? 88 : 85, alternativas: otros });
  }
  const textoYo = centro
    ? `${centro.nombreNeurona.slice(0, 22)}${centro.nombrePerfil ? ` · ${centro.nombrePerfil.slice(0, 16)}` : ""}`
    : `Tú${etiquetaCentro ? ` · ${etiquetaCentro}` : ""}`;
  const bajo = centro ? 8.9 : 7.4;
  rotulos.push({
    id: "yo", x: C, y: C + bajo, texto: textoYo, anclaje: "middle", tam: 2.4, prioridad: 95,
    alternativas: [{ x: C, y: C - (centro ? 7.2 : 5.6), anclaje: "middle" }, { x: C + (centro ? 6.4 : 5.4), y: C + 0.9, anclaje: "start" }, { x: C - (centro ? 6.4 : 5.4), y: C + 0.9, anclaje: "end" }],
  });
  if (modelo.resumenVisible.gps > 0) rotulos.push({ id: "norte", x: C, y: 8.2, texto: "N", anclaje: "middle", tam: 2.6, prioridad: 100 });
  for (const a of modelo.antenas) rotulos.push({ id: `antena:${a.kind}`, x: mx(a.x), y: mx(a.z) - 2.1, texto: a.label.slice(0, 18), anclaje: "middle", tam: 2.1, prioridad: 20 });
  return { rotulos, reservadas };
}

export interface VistaPlanaProps {
  modelo: ModeloMapa;
  seleccionId: string | null;
  apuntadaId?: string | null;
  onSeleccionar: (id: string | null) => void;
  onApuntar?: (id: string | null) => void;
  reducido: boolean;
  /** Alto del SVG en px. */
  alto?: number;
  /** Sin rótulos de sectores ni de anillos (mini radar). */
  mini?: boolean;
  etiquetaCentro?: string;
  /** ESTA neurona (nombre, foto y datos): el centro del radar. Sin ella se dibuja el punto «Tú» de siempre. */
  centro?: CentroNeurona | null;
  descripcion: string;
  className?: string;
}

export function VistaPlana({ modelo, seleccionId, apuntadaId = null, onSeleccionar, onApuntar, reducido, alto = 300, mini = false, etiquetaCentro, centro = null, descripcion, className }: VistaPlanaProps) {
  const alternar = (id: string) => onSeleccionar(seleccionId === id ? null : id);
  const tecla = (id: string) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(id); }
  };
  const apuntar = (id: string | null) => onApuntar?.(id);
  const pos = (m: MarcadorEscena) => ({ x: mx(m.x), y: mx(m.z) });
  const { rotulos, reservadas } = useMemo(
    () => construirRotulos(modelo, seleccionId, apuntadaId, mini, etiquetaCentro, centro),
    [modelo, seleccionId, apuntadaId, mini, etiquetaCentro, centro],
  );
  const colocados = useMemo(() => colocarRotulos(rotulos, reservadas), [rotulos, reservadas]);
  const rotulo = (id: string, color: string, opacidad = 1) => {
    const p = colocados.get(id);
    const r = p ? rotulos.find((x) => x.id === id) : undefined;
    return p && r ? (
      <text x={p.x} y={p.y} fontSize={r.tam} textAnchor={p.anclaje} fill={color} opacity={opacidad} pointerEvents="none">{r.texto}</text>
    ) : null;
  };

  return (
    <svg viewBox="0 0 100 100" style={{ height: alto }} className={cn("w-full", className)} role="group" aria-label={descripcion}>
      <defs>
        <radialGradient id="ss-plano-fondo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.10" />
          <stop offset="70%" stopColor="#38bdf8" stopOpacity="0.025" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <clipPath id="ss-plano-disco"><circle cx={C} cy={C} r={R} /></clipPath>
      </defs>
      <circle cx={C} cy={C} r={R} fill="url(#ss-plano-fondo)" stroke="#38bdf8" strokeOpacity={0.3} strokeWidth={0.35} />

      {/* Sectores por familia de antena */}
      {modelo.sectores.map((s) => {
        const sec = ANTENNA_SECTOR[s.familia];
        return (
          <g key={s.familia}>
            <path d={cuna(sec.center, sec.half)} fill="#38bdf8" fillOpacity={s.viva ? 0.045 : 0.012} />
            {rotulo(`sector:${s.familia}`, s.viva ? "#94a3b8" : "#475569")}
          </g>
        );
      })}
      <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="#94a3b8" strokeOpacity={0.1} strokeWidth={0.3} />
      <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="#94a3b8" strokeOpacity={0.1} strokeWidth={0.3} />

      {/* Anillos: círculo = GPS real · arco punteado «≈» = distancia estimada solo en el sector de su antena */}
      {modelo.anillos.map((a) => {
        const r = a.fraccion * R;
        const sec = a.desdeRad !== null && a.hastaRad !== null;
        return (
          <g key={a.id}>
            {a.real || !sec ? (
              <circle cx={C} cy={C} r={r} fill="none" stroke="#22d3ee" strokeOpacity={0.3} strokeWidth={0.4} />
            ) : (
              <path d={arco(r, a.desdeRad!, a.hastaRad!)} fill="none" stroke="#22d3ee" strokeOpacity={0.45} strokeWidth={0.4} strokeDasharray="1.1 0.9" />
            )}
            {rotulo(`anillo:${a.id}`, "#67e8f9", 0.8)}
          </g>
        );
      })}
      {rotulo("norte", "#fbbf24")}

      {/* Halos de precisión: cuánto NO se sabe de esa posición */}
      <g clipPath="url(#ss-plano-disco)">
        {modelo.marcadores.map((m) => {
          const p = pos(m);
          const modo = m.senal.placement.mode;
          return (
            <circle key={`halo-${m.id}`} cx={p.x} cy={p.y} r={Math.max(1.2, m.radioHalo * K)} fill={m.colorContorno}
              fillOpacity={modo === "gps" ? 0.1 : 0.04} stroke={m.colorContorno}
              strokeOpacity={seleccionId === m.id ? 0.7 : 0.26} strokeWidth={0.35} strokeDasharray={modo === "gps" ? undefined : "1.2 1.2"} />
          );
        })}
      </g>

      {/* Enlaces reales hasta ti */}
      {modelo.marcadores.filter((m) => m.enlaceMapa).map((m) => {
        const e = ESTILO_ENLACE[m.enlaceMapa!.clase];
        const p = pos(m);
        return (
          <line key={`enlace-${m.id}`} x1={C} y1={C} x2={p.x} y2={p.y} stroke={e.color} strokeWidth={e.ancho * 0.28}
            strokeOpacity={e.opacidad * (m.tenue ? 0.6 : 1)} strokeDasharray={e.discontinua ? "1.4 1.1" : undefined} />
        );
      })}

      {/* Medios abiertos: satélites de su aparato */}
      {modelo.medios.map((m) => {
        const color = m.medio.visible ? COLOR_ESTADO.activa : COLOR_ESTADO["segundo-plano"];
        const x = mx(m.x), y = mx(m.z);
        return (
          <g key={m.id} role="button" tabIndex={0} className="cursor-pointer" opacity={m.tenue ? 0.45 : 1}
            aria-label={`Medio ${m.medio.etiqueta}, ${m.medio.visible ? "a la vista" : "en segundo plano"}`}
            onClick={() => alternar(m.id)} onKeyDown={tecla(m.id)} onMouseEnter={() => apuntar(m.id)} onMouseLeave={() => apuntar(null)}>
            <line x1={mx(m.padre.x)} y1={mx(m.padre.z)} x2={x} y2={y} stroke="#c084fc" strokeOpacity={0.4} strokeWidth={0.3} />
            <circle cx={x} cy={y} r={3} fill="transparent" />
            <polygon points={`${x},${y - 1.5} ${x + 1.5},${y} ${x},${y + 1.5} ${x - 1.5},${y}`} fill={color} stroke={seleccionId === m.id ? "#fff" : "#c084fc"} strokeWidth={seleccionId === m.id ? 0.6 : 0.35} />
          </g>
        );
      })}

      {/* Señales */}
      {modelo.marcadores.map((m) => {
        const p = pos(m);
        const sel = seleccionId === m.id;
        const r = 1.5 + (m.senal.quality == null ? 0.3 : m.senal.quality * 1.2);
        const q = m.senal.quality;
        return (
          <g key={m.id} role="button" tabIndex={0} className="cursor-pointer"
            aria-label={`${m.senal.label} · ${m.senal.antennaLabel} · calidad ${q == null ? "no medible" : `${Math.round(q * 100)} de 100`}${m.estado ? ` · ${TEXTO_ESTADO[m.estado]}` : ""}`}
            onClick={() => alternar(m.id)} onKeyDown={tecla(m.id)}
            onMouseEnter={() => apuntar(m.id)} onMouseLeave={() => apuntar(null)} onFocus={() => apuntar(m.id)} onBlur={() => apuntar(null)}>
            <circle cx={p.x} cy={p.y} r={Math.max(3.2, r + 2)} fill="transparent" />
            {m.reciente && !reducido && !m.tenue && <circle className="ss-signal-ping" cx={p.x} cy={p.y} r={2} fill="none" stroke={m.colorNucleo} strokeWidth={0.4} strokeOpacity={0.55} />}
            {sel && <circle cx={p.x} cy={p.y} r={r + 2} fill="none" stroke="#fff" strokeWidth={0.6} strokeOpacity={0.9} />}
            <Icono id={m.icono} x={p.x} y={p.y} m={r * 1.35} relleno={m.colorNucleo} borde={m.simulada ? "#fbbf24" : m.colorContorno} opacidad={m.tenue ? 0.45 : 1} />
            {m.avatarUrl && <FotoSvg clave={m.id} url={m.avatarUrl} x={p.x - r * 1.25} y={p.y - r * 1.55} r={1.7} color={m.colorContorno} />}
            {(m.colorEstado ?? (m.conCuenta ? "#ffffff" : null)) && (
              <circle cx={p.x + r * 0.9} cy={p.y - r * 0.9} r={m.colorEstado ? 0.95 : 0.55} fill={m.colorEstado ?? "#ffffff"} opacity={m.tenue ? 0.6 : 0.95} />
            )}
            {rotulo(`m:${m.id}`, m.colorContorno, 0.95)}
          </g>
        );
      })}

      {/* Antenas propias de esta neurona (referencia de qué puede oír y emitir) */}
      {modelo.antenas.map((a) => (
        <g key={a.kind}>
          <line x1={C} y1={C} x2={mx(a.x)} y2={mx(a.z)} stroke={a.color} strokeOpacity={0.14} strokeWidth={0.3} />
          <circle cx={mx(a.x)} cy={mx(a.z)} r={1.2} fill={a.color} fillOpacity={a.estado === "info" ? 0.45 : 0.9} />
          {rotulo(`antena:${a.kind}`, a.color, 0.7)}
        </g>
      ))}

      {/* Tú: esta neurona, con su foto y su nombre */}
      <g role="button" tabIndex={0} className="cursor-pointer" aria-label={centro ? `Tú, esta neurona · ${centro.nombreNeurona}` : "Tú, esta neurona"} onClick={() => alternar("yo")} onKeyDown={tecla("yo")}>
        <circle cx={C} cy={C} r={centro ? 6 : 5} fill="transparent" />
        {seleccionId === "yo" && <circle cx={C} cy={C} r={centro ? 5.6 : 5} fill="none" stroke="#fff" strokeWidth={0.6} />}
        {centro ? (
          <>
            <circle cx={C} cy={C} r={4.6} fill="#38bdf8" fillOpacity={0.18} style={{ filter: "drop-shadow(0 0 3px #38bdf8)" }} />
            {centro.avatar.modo === "foto" && centro.avatar.url ? (
              <FotoSvg clave="centro" url={centro.avatar.url} x={C} y={C} r={4} color="#38bdf8" />
            ) : (
              <g pointerEvents="none">
                <circle cx={C} cy={C} r={4} fill="#0b3b57" stroke="#38bdf8" strokeWidth={0.45} />
                <text x={C} y={C + 1.2} fontSize={3.4} fontWeight={700} textAnchor="middle" fill="#e0f2fe">{centro.iniciales}</text>
              </g>
            )}
          </>
        ) : (
          <circle cx={C} cy={C} r={3} fill="#38bdf8" style={{ filter: "drop-shadow(0 0 3px #38bdf8)" }} />
        )}
        {rotulo("yo", "#7dd3fc")}
      </g>
    </svg>
  );
}

export default VistaPlana;
