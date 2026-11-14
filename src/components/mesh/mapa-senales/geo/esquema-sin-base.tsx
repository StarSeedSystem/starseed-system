"use client";

/**
 * Esquema de la malla sin base geográfica: «Tú» al centro y las neuronas colocadas por RELACIÓN
 * (las de enlace abierto, cerca; el resto, en el anillo exterior), no por coordenadas. Es lo que se
 * ve cuando no hay red para las teselas o ninguna neurona tiene posición conocida: nunca un mapa en blanco.
 */

import { colorMarca } from "./color-marca";
import type { CapaId } from "@/lib/senales/geo/capas";
import type { MarcaGeo } from "@/lib/senales/geo/marcas";

export function disposicionEsquema(marcas: readonly MarcaGeo[]): { marca: MarcaGeo; x: number; y: number }[] {
  const otras = marcas.filter((m) => !m.esYo);
  const yo = marcas.find((m) => m.esYo);
  const out: { marca: MarcaGeo; x: number; y: number }[] = [];
  if (yo) out.push({ marca: yo, x: 50, y: 50 });
  otras.forEach((m, i) => {
    const a = (i / Math.max(1, otras.length)) * Math.PI * 2 - Math.PI / 2;
    const r = m.enlace.estado === "conectado" ? 24 : 38;
    out.push({ marca: m, x: 50 + Math.cos(a) * r, y: 50 + Math.sin(a) * r });
  });
  return out;
}

export function EsquemaSinBase({ marcas, capa, motivo, seleccion, onElegir }: { marcas: readonly MarcaGeo[]; capa: CapaId; motivo: string; seleccion: string | null; onElegir: (id: string) => void }) {
  const puestos = disposicionEsquema(marcas);
  const centro = puestos.find((p) => p.marca.esYo);
  return (
    <div className="relative h-full w-full bg-[#070d19]" data-testid="esquema-sin-base">
      <p role="status" className="absolute left-2 right-2 top-2 z-10 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-100">Sin base geográfica: esquema de la malla. {motivo}</p>
      {puestos.length === 0 ? (
        <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/60">Todavía no hay neuronas de tu cuenta que mostrar. Cuando abras StarSeed OS en otro aparato, aparecerá aquí.</p>
      ) : (
        <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label="Esquema de la malla">
          {[24, 38].map((r) => <circle key={r} cx={50} cy={50} r={r} fill="none" stroke="#1e293b" strokeWidth={0.3} strokeDasharray="1.2 1.2" />)}
          {centro && puestos.filter((p) => !p.marca.esYo).map((p) => (
            <line key={`l-${p.marca.id}`} x1={centro.x} y1={centro.y} x2={p.x} y2={p.y} stroke={p.marca.enlace.estado === "conectado" ? "#38bdf8" : "#475569"} strokeWidth={0.4} strokeDasharray="1.5 1.2" opacity={p.marca.enlace.estado === "conectado" ? 0.9 : 0.5} />
          ))}
          {puestos.map((p) => {
            const color = colorMarca(capa, p.marca);
            const sel = seleccion === p.marca.id;
            return (
              <g key={p.marca.id} transform={`translate(${p.x} ${p.y})`} onClick={() => onElegir(p.marca.id)} className="cursor-pointer" role="button" aria-label={p.marca.nombre} tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onElegir(p.marca.id); }}>
                {p.marca.forma === "rombo"
                  ? <rect x={-3} y={-3} width={6} height={6} transform="rotate(45)" fill="#0b1220" stroke={color} strokeWidth={sel ? 1.4 : 0.9} />
                  : <circle r={p.marca.esYo ? 4 : 3} fill="#0b1220" stroke={color} strokeWidth={sel ? 1.4 : 0.9} strokeDasharray={color === "#64748b" ? "1 0.8" : undefined} />}
                <text y={p.marca.esYo ? 8.5 : 7} textAnchor="middle" fontSize={2.6} fill="#e2e8f0">{p.marca.esYo ? "Tú" : p.marca.nombre.slice(0, 18)}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
