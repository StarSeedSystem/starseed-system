/**
 * capa-alcance — pinta los campos de alcance ESTIMADO de un medio sobre el mapa de Leaflet (MAP1114D).
 * Mismo mecanismo que `capa-parches.ts` y que el radar de lluvia del Hub: un panel propio con un canvas, que se
 * enciende, se apaga y cambia de opacidad. Los campos se mezclan donde se solapan (cada uno suma su transparencia),
 * como un mapa de cobertura. Lo estimado va siempre más claro y rayado, con borde discontinuo: nunca como lo medido.
 * Usa el reloj unificado para evitar múltiples requestAnimationFrame simultáneos (270-315 fps).
 */

import type { LeafletNS } from "@/lib/map/leaflet-loader";
import type { Campo } from "@/lib/senales/geo/cobertura";
import { radioEnPixeles } from "@/lib/senales/geo/alcances";
import { relojUnificado } from "@/lib/senales/reloj-unificado";

function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const RADIO_MINIMO_PX = 3;
const PASO_RAYAS_PX = 9;

/** Un campo en el contexto 2D (coordenadas CSS); `ancho`/`alto` acotan las rayas a lo visible. Exportada para probarla con un contexto falso. */
export function dibujarCampo(ctx: CanvasRenderingContext2D, x: number, y: number, radioPx: number, color: string, ancho: number, alto: number): void {
  const r = Math.max(RADIO_MINIMO_PX, radioPx);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, 0.34));
  g.addColorStop(0.65, rgba(color, 0.2));
  g.addColorStop(1, rgba(color, 0.05));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Rayado diagonal: solo dentro del círculo y solo en lo que se ve.
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = rgba(color, 0.4);
  ctx.lineWidth = 1;
  const x0 = Math.max(0, x - r), x1 = Math.min(ancho, x + r), y0 = Math.max(0, y - r), y1 = Math.min(alto, y + r);
  if (x1 > x0 && y1 > y0) {
    ctx.beginPath();
    const kIni = Math.floor((x0 + y0) / PASO_RAYAS_PX) * PASO_RAYAS_PX;
    for (let k = kIni; k <= x1 + y1; k += PASO_RAYAS_PX) {
      // Recta x + y = k, recortada al rectángulo visible.
      const xa = Math.max(x0, k - y1), xb = Math.min(x1, k - y0);
      if (xb <= xa) continue;
      ctx.moveTo(xa, k - xa);
      ctx.lineTo(xb, k - xb);
    }
    ctx.stroke();
  }
  ctx.restore();

  // Borde discontinuo: el límite del alcance es una estimación.
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = rgba(color, 0.75);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export interface CapaAlcance {
  poner: (campos: readonly Campo[]) => void;
  opacidad: (o: number) => void;
  quitar: () => void;
}

export function crearCapaAlcance(L: LeafletNS, map: any, id: string, zIndex: number): CapaAlcance {
  const nombre = `ss-alcance-${id}`;
  const pane = map.getPane(nombre) ?? map.createPane(nombre);
  pane.style.zIndex = String(zIndex);
  pane.style.pointerEvents = "none";
  const canvas: HTMLCanvasElement = L.DomUtil.create("canvas", "ss-alcance", pane);
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.position = "absolute";
  canvas.style.pointerEvents = "none";
  let campos: readonly Campo[] = [];

  const dibujar = () => {
    try {
      const size = map.getSize();
      const dpr = window.devicePixelRatio || 1;
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
      if (canvas.width !== Math.round(size.x * dpr) || canvas.height !== Math.round(size.y * dpr)) {
        canvas.width = Math.round(size.x * dpr);
        canvas.height = Math.round(size.y * dpr);
        canvas.style.width = `${size.x}px`;
        canvas.style.height = `${size.y}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
      const zoom = map.getZoom();
      for (const c of campos) {
        const pt = map.latLngToContainerPoint([c.lat, c.lon]);
        dibujarCampo(ctx, pt.x, pt.y, radioEnPixeles(c.metros, c.lat, zoom), c.color, size.x, size.y);
      }
    } catch { /* el mapa se está destruyendo */ }
  };
  map.on("move zoom moveend zoomend resize viewreset", () => relojUnificado.pedir());
  relojUnificado.pedir();

  const registrar = relojUnificado.registrar(dibujar);

  return {
    poner: (c) => { campos = c; relojUnificado.pedir(); },
    opacidad: (o) => { canvas.style.opacity = String(o); },
    quitar: () => {
      map.off("move zoom moveend zoomend resize viewreset", () => relojUnificado.pedir());
      registrar();
      try { canvas.remove(); pane.remove(); } catch { /* */ }
    },
  };
}
