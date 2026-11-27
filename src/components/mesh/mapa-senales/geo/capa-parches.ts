/**
 * capa-parches — pinta los parches de color de UNA capa sobre el mapa de Leaflet con la API base
 * (un panel propio y un canvas; sin plugins ni dependencias nuevas), igual que el radar de lluvia del Hub:
 * un color sobre el mapa que se enciende, se apaga y cambia de opacidad.
 * El parche tiene un tamaño FIJO en pantalla: marca el punto medido, no un alcance de cobertura.
 */

import type { LeafletNS } from "@/lib/map/leaflet-loader";
import type { Parche } from "@/lib/senales/geo/parches";

export const RADIO_PARCHE_PX = 40;
const RADIO_ANILLO_PX = 17;

function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Dibuja un parche en el contexto 2D (coordenadas CSS). Exportada para poder probarla con un contexto falso. */
export function dibujarParche(ctx: CanvasRenderingContext2D, x: number, y: number, p: Pick<Parche, "color" | "estilo">): void {
  if (p.estilo === "relleno") {
    const g = ctx.createRadialGradient(x, y, 0, x, y, RADIO_PARCHE_PX);
    g.addColorStop(0, rgba(p.color, 0.95));
    g.addColorStop(0.4, rgba(p.color, 0.7));
    g.addColorStop(1, rgba(p.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, RADIO_PARCHE_PX, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = rgba(p.color, 0.95);
  ctx.setLineDash(p.estilo === "hueco" ? [4, 4] : []);
  ctx.beginPath();
  ctx.arc(x, y, RADIO_ANILLO_PX, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export interface CapaParches {
  poner: (parches: readonly Parche[]) => void;
  opacidad: (o: number) => void;
  quitar: () => void;
}

export function crearCapaParches(L: LeafletNS, map: any, id: string, zIndex: number): CapaParches {
  const nombre = `ss-parches-${id}`;
  const pane = map.getPane(nombre) ?? map.createPane(nombre);
  pane.style.zIndex = String(zIndex);
  pane.style.pointerEvents = "none";
  const canvas: HTMLCanvasElement = L.DomUtil.create("canvas", "ss-parches", pane);
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.position = "absolute";
  canvas.style.pointerEvents = "none";
  let parches: readonly Parche[] = [];
  let raf = 0;

  const dibujar = () => {
    raf = 0;
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
      for (const p of parches) {
        const pt = map.latLngToContainerPoint([p.lat, p.lon]);
        dibujarParche(ctx, pt.x, pt.y, p);
      }
    } catch { /* el mapa se está destruyendo */ }
  };
  // Un solo cuadro pendiente a la vez, y ninguno con la página oculta: al volver se repinta una vez.
  const oculta = () => typeof document !== "undefined" && document.hidden === true;
  const pedir = () => { if (!raf && !oculta()) raf = requestAnimationFrame(dibujar); };
  const alCambiarVisibilidad = () => { if (!oculta()) pedir(); };
  map.on("move zoom moveend zoomend resize viewreset", pedir);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", alCambiarVisibilidad);
  pedir();

  return {
    poner: (p) => { parches = p; pedir(); },
    opacidad: (o) => { canvas.style.opacity = String(o); },
    quitar: () => {
      map.off("move zoom moveend zoomend resize viewreset", pedir);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      if (raf) cancelAnimationFrame(raf);
      try { canvas.remove(); pane.remove(); } catch { /* */ }
    },
  };
}
