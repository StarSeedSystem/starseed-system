"use client";

/**
 * Vista del espectro (MRE6 · MAP1116B): eje de frecuencias logarítmico con las bandas de
 * `bandas.ts` rotuladas; cada señal es una barra de su ancho en su frecuencia, altura = fuerza
 * (o hueca «sin medir»), color por medio y estilo por origen: medida sólida, declarada con anillo,
 * estimada rayada. Las señales sin frecuencia van a su fila; debajo, lo que no se puede ver.
 * Enter abre la ficha; sin movimiento continuo: `prefers-reduced-motion` queda respetado.
 */

import { useMemo, type KeyboardEvent } from "react";
import { BANDAS_CONOCIDAS, etiquetaFrecuencia } from "@/lib/senales/espectro/bandas";
import type { Medio, SenalEspectro, SinFuente } from "@/lib/senales/espectro/tipos";
import { cn } from "@/lib/utils";

/** Color por medio, dentro de la paleta del OS (cian/violeta/ámbar del sistema). */
const COLOR_MEDIO: Record<Medio, string> = {
  wifi: "#38bdf8", bluetooth: "#a78bfa", lora: "#22d3ee", celular: "#fbbf24",
  malla: "#34d399", internet: "#60a5fa", estacion: "#f472b6", sdr: "#e879f9",
};

// Eje logarítmico de 400 MHz a 7,3 GHz: cubre todas las bandas de `bandas.ts`.
const KHZ_MIN = 400_000, KHZ_MAX = 7_300_000, MARGEN = 5, EJE_Y = 62, FILA_Y = 78;
const LOG = Math.log10(KHZ_MAX / KHZ_MIN);
const xDe = (khz: number) => MARGEN + (Math.log10(khz / KHZ_MIN) / LOG) * (100 - 2 * MARGEN);
const xAcot = (khz: number) => Math.min(100 - MARGEN, Math.max(MARGEN, xDe(khz)));

/** Bandas rotuladas en el eje: una referencia por zona del espectro, legible incluso a 360 px. */
const ROTULADAS = ["lora-433", "lora-868", "lora-915", "celular-b3", "celular-b1", "wifi-2.4", "celular-n41", "celular-n78", "wifi-5", "wifi-6"];
const ORDEN_ORIGEN = { medida: 0, declarada: 1, estimada: 2 } as const;

/** «Banda 3 (1800 MHz) — FDD» → «1800 MHz»; «LoRa 433 MHz» → «433 MHz». */
function etiquetaCorta(etiqueta: string): string {
  const m = /([\d.,]+\s?MHz)/.exec(etiqueta) ?? /([\d.,]+\s?GHz)/.exec(etiqueta);
  return m ? m[1].trim() : etiqueta;
}

/** Altura de la barra: la fuerza dBm (−100…−30) ocupa de 8 a 52 unidades; sin medir, 6 y hueca. */
function alturaDe(dbm: number | null): number {
  if (dbm === null || !Number.isFinite(dbm)) return 6;
  return 8 + Math.min(1, Math.max(0, (dbm + 100) / 70)) * 44;
}

export interface VistaEspectroProps {
  senales: readonly SenalEspectro[];
  sinFuente: readonly SinFuente[];
  onElegir: (id: string) => void;
  className?: string;
}

export function VistaEspectro({ senales, sinFuente, onElegir, className }: VistaEspectroProps) {
  const activar = (id: string) => (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); onElegir(id); } };
  const nombre = (s: SenalEspectro) => `${s.medio} · ${s.banda}${s.frecuenciaKhz != null ? ` · ${etiquetaFrecuencia(s.frecuenciaKhz)}` : ""} · capa ${s.capa} · ${s.fuente} · ${s.origen}${s.fuerzaDbm == null ? " · sin medir" : ` · ${Math.round(s.fuerzaDbm)} dBm`}`;
  const conFrec = useMemo(() => senales
    .filter((s) => s.frecuenciaKhz != null && s.frecuenciaKhz > 0)
    // Sólidas debajo, estimadas encima: al solaparse, siempre se ve la menos fiable.
    .sort((a, b) => ORDEN_ORIGEN[a.origen] - ORDEN_ORIGEN[b.origen]), [senales]);
  const sinFrec = useMemo(() => senales.filter((s) => s.frecuenciaKhz == null || s.frecuenciaKhz <= 0), [senales]);
  const fila = useMemo(() => {
    let x = MARGEN + 16;
    return sinFrec.map((s) => {
      const t = (s.banda || s.medio).slice(0, 14);
      const w = Math.min(24, 2.4 + t.length * 1.15);
      const pieza = { s, t, x, w };
      x += w + 1.6;
      return pieza;
    });
  }, [sinFrec]);
  const rotulos = useMemo(() => ROTULADAS.map((id) => BANDAS_CONOCIDAS[id]).map((b) => ({ id: b.id, x: xDe(b.centroKhz), t: etiquetaCorta(b.etiqueta) })), []);

  return (
    <div className={cn("w-full", className)}>
      <svg viewBox="0 0 100 90" className="w-full" role="group" aria-label="Espectro de frecuencias">
        <defs>
          {[...new Set(conFrec.filter((s) => s.origen === "estimada").map((s) => s.medio))].map((m) => (
            <pattern key={m} id={`rayas-${m}`} width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="1.6" height="1.6" fill={COLOR_MEDIO[m]} fillOpacity={0.2} />
              <line x1={0.3} y1={0} x2={0.3} y2={1.6} stroke={COLOR_MEDIO[m]} strokeWidth={0.5} />
            </pattern>
          ))}
        </defs>
        <line x1={MARGEN} y1={EJE_Y} x2={100 - MARGEN} y2={EJE_Y} stroke="#94a3b8" strokeOpacity={0.5} strokeWidth={0.3} />
        {rotulos.map((r) => (
          <g key={r.id} pointerEvents="none"><line x1={r.x} y1={EJE_Y} x2={r.x} y2={EJE_Y + 1.2} stroke="#94a3b8" strokeOpacity={0.4} strokeWidth={0.25} /><text x={r.x} y={EJE_Y + 4.4} fontSize={2.7} textAnchor="middle" fill="#94a3b8">{r.t}</text></g>
        ))}
        {conFrec.map((s) => {
          const color = COLOR_MEDIO[s.medio] ?? "#94a3b8";
          const f = s.frecuenciaKhz ?? 0;
          const x = xAcot(f);
          const ancho = s.anchoKhz ? Math.max(1.2, xAcot(f + s.anchoKhz / 2) - xAcot(f - s.anchoKhz / 2)) : 1.2;
          const h = alturaDe(s.fuerzaDbm);
          const hueca = s.fuerzaDbm == null;
          const declarada = s.origen === "declarada";
          return (
            <g key={s.id} role="button" tabIndex={0} className="cursor-pointer" aria-label={nombre(s)} onClick={() => onElegir(s.id)} onKeyDown={activar(s.id)}>
              <rect x={+(x - ancho / 2).toFixed(2)} y={+(EJE_Y - h).toFixed(2)} width={+ancho.toFixed(2)} height={+h.toFixed(2)}
                fill={hueca ? "none" : s.origen === "estimada" ? `url(#rayas-${s.medio})` : color} fillOpacity={hueca ? undefined : declarada ? 0.35 : 0.75} stroke={color} strokeWidth={hueca || declarada ? 0.55 : 0.3} />
            </g>
          );
        })}
        <text x={MARGEN} y={FILA_Y + 2.4} fontSize={2.7} fill="#94a3b8" textAnchor="start">sin frecuencia</text>
        {fila.map(({ s, t, x, w }) => (
          <g key={s.id} role="button" tabIndex={0} className="cursor-pointer" aria-label={`sin frecuencia · ${nombre(s)}`} onClick={() => onElegir(s.id)} onKeyDown={activar(s.id)}>
            <rect x={x} y={FILA_Y - 4.6} width={w} height={6.4} rx={1.4} fill="none" stroke={COLOR_MEDIO[s.medio] ?? "#94a3b8"} strokeWidth={0.35} />
            <text x={x + w / 2} y={FILA_Y} fontSize={2.5} textAnchor="middle" fill="#cbd5e1" pointerEvents="none">{t}</text>
          </g>
        ))}
      </svg>
      {sinFuente.length > 0 && (
        <div className="mt-2 rounded-md border border-border/60 p-3 text-xs">
          <p className="font-medium">Lo que este aparato no puede ver</p>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {sinFuente.map((f, i) => (<li key={`${f.medio}-${i}`}><span className="font-medium text-foreground">{f.medio}</span> · {f.motivo}</li>))}
          </ul>
        </div>
      )}
    </div>
  );
}
