"use client";

/**
 * Contenedor Leaflet del Mapa (se carga con `dynamic`, sin SSR, desde `pestana-mapa.tsx`).
 * Mismas teselas y mismo arreglo de iconos que `maps/network-map.tsx`. Solo dibuja lo que tiene
 * posición: un punto exacto, o la zona de ≈1 km con su halo; las marcas sin posición no se colocan.
 */

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Circle, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { colorMarca } from "./color-marca";
import type { CapaId } from "@/lib/senales/geo/capas";
import { coordenadasDeVista } from "@/lib/senales/geo/modelo-geo";
import type { MarcaGeo } from "@/lib/senales/geo/marcas";

if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  });
}

/** Icono de la marca. Solo colores de nuestra paleta: ningún texto de usuario entra en el HTML. */
export function iconoMarca(m: MarcaGeo, color: string, seleccionada: boolean): L.DivIcon {
  const borde = seleccionada ? 4 : 3;
  const forma = m.forma === "rombo" ? "transform:rotate(45deg);border-radius:3px;" : "border-radius:9999px;";
  const sin = color === "#64748b" ? "border-style:dashed;" : "";
  const tam = m.esYo ? 22 : 18;
  return L.divIcon({
    className: "",
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
    html: `<div style="width:${tam}px;height:${tam}px;box-sizing:border-box;background:#0b1220;border:${borde}px solid ${color};${sin}${forma}box-shadow:0 0 0 2px rgba(0,0,0,.45)${seleccionada ? ",0 0 12px " + color : ""}"></div>`,
  });
}

function Ajustar({ puntos }: { puntos: [number, number][] }) {
  const map = useMap();
  const clave = puntos.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (!puntos.length) return;
    if (puntos.length === 1) map.setView(puntos[0], 13);
    else map.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, map]);
  return null;
}

/** Teselas del mapa (decisión 2 del contrato: proveedor por confirmar; un solo sitio donde cambiarlo). */
export const URL_TESELAS = "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png";

export interface MapaGeoProps {
  marcas: readonly MarcaGeo[];
  capa: CapaId;
  seleccion: string | null;
  onElegir: (id: string) => void;
  /** Varias teselas seguidas sin cargar = sin red: el contenedor cae al esquema. */
  onSinTeselas: () => void;
}

export default function MapaGeo({ marcas, capa, seleccion, onElegir, onSinTeselas }: MapaGeoProps) {
  const colocadas = useMemo(
    () => marcas.flatMap((m) => { const c = coordenadasDeVista(m.posicion); return c ? [{ m, c }] : []; }),
    [marcas],
  );
  const puntos = colocadas.map((x) => [x.c.lat, x.c.lon] as [number, number]);
  const yo = colocadas.find((x) => x.m.esYo);
  let fallos = 0;
  return (
    <MapContainer center={puntos[0] ?? [20, 0]} zoom={puntos.length ? 12 : 2} scrollWheelZoom className="h-full w-full bg-[#070d19]" attributionControl>
      <TileLayer
        url={URL_TESELAS}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        eventHandlers={{ tileerror: () => { fallos += 1; if (fallos >= 4) onSinTeselas(); }, tileload: () => { fallos = 0; } }}
      />
      <Ajustar puntos={puntos} />
      {yo && colocadas.filter((x) => !x.m.esYo && x.m.enlace.estado === "conectado").map((x) => (
        <Polyline key={`l-${x.m.id}`} positions={[[yo.c.lat, yo.c.lon], [x.c.lat, x.c.lon]]} pathOptions={{ color: "#38bdf8", weight: 1.5, dashArray: "4 6", opacity: 0.8 }} />
      ))}
      {colocadas.map(({ m, c }) => {
        const color = colorMarca(capa, m);
        return (
          <span key={m.id}>
            {m.posicion.tipo === "zona" && (
              <Circle center={[c.lat, c.lon]} radius={m.posicion.zona.radioM} pathOptions={{ color, weight: 1.5, dashArray: "5 5", fillColor: color, fillOpacity: 0.12 }} eventHandlers={{ click: () => onElegir(m.id) }} />
            )}
            {m.posicion.tipo === "exacta" && typeof m.posicion.precisionM === "number" && m.posicion.precisionM > 25 && (
              <Circle center={[c.lat, c.lon]} radius={m.posicion.precisionM} pathOptions={{ color, weight: 1, fillColor: color, fillOpacity: 0.08 }} />
            )}
            <Marker position={[c.lat, c.lon]} icon={iconoMarca(m, color, seleccion === m.id)} title={m.nombre} alt={m.nombre} eventHandlers={{ click: () => onElegir(m.id) }} />
          </span>
        );
      })}
    </MapContainer>
  );
}
