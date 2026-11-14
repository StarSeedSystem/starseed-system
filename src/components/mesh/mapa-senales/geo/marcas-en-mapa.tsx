"use client";

/**
 * MarcasEnMapa — lo que la pestaña «Mapa» de Señales añade al mapa del Hub (MAP1114C): los parches de color de las
 * capas encendidas, las marcas de las neuronas de mi cuenta (en su punto exacto), las leyendas y la lista de aparatos.
 * No crea ningún mapa: recibe `L` y `map` de `MapView`. No pinta nada que no esté medido.
 */

import { useEffect, useRef, useState } from "react";
import { escapeHtml } from "@/lib/map/map-config";
import type { MapExtensionCtx } from "@/components/map/map-view-extension";
import { CAPA_POR_ID, NOTA_PARCHE, OPACIDAD_POR_DEFECTO, type EstadoCapas } from "@/lib/senales/geo/capas";
import { haceCuanto, posicionEsViva, coordenadasDeVista } from "@/lib/senales/geo/modelo-geo";
import { parchesDeCapa } from "@/lib/senales/geo/parches";
import type { MarcaGeo } from "@/lib/senales/geo/marcas";
import { crearCapaParches, type CapaParches } from "./capa-parches";
import { LeyendaCapa } from "./seccion-capas";

const ORDEN_Z = 440;

function iconoMarca(L: any, m: MarcaGeo, viva: boolean, seleccionada: boolean) {
  const tam = m.esYo ? 24 : 20;
  const color = m.esYo ? "#38bdf8" : "#e2e8f0";
  const borde = viva ? "solid" : "dashed";
  const brillo = seleccionada ? `,0 0 0 4px rgba(56,189,248,.45)` : "";
  const forma = m.forma === "rombo" ? "transform:rotate(45deg);border-radius:4px;" : "border-radius:9999px;";
  return L.divIcon({
    className: "",
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
    html: `<div style="width:${tam}px;height:${tam}px;box-sizing:border-box;background:${viva ? "#0b1220" : "#1e293b"};border:3px ${borde} ${color};${forma}box-shadow:0 0 0 2px rgba(0,0,0,.55)${brillo};opacity:${viva ? 1 : 0.8}"></div>`,
  });
}

export interface MarcasEnMapaProps {
  ctx: MapExtensionCtx;
  marcas: readonly MarcaGeo[];
  ahora: number;
  estado: EstadoCapas;
  seleccion: string | null;
  onElegir: (id: string | null) => void;
  compacto: boolean;
  vacio?: React.ReactNode;
  aviso?: React.ReactNode;
  children?: React.ReactNode;
}

export function MarcasEnMapa({ ctx, marcas, ahora, estado, seleccion, onElegir, compacto, vacio, aviso, children }: MarcasEnMapaProps) {
  const { L, map } = ctx;
  const capasRef = useRef<Record<string, CapaParches>>({});
  const grupoRef = useRef<any>(null);
  const [listaAbierta, setListaAbierta] = useState(false);
  const onElegirRef = useRef(onElegir);
  onElegirRef.current = onElegir;

  // Una capa de parches por capa encendida.
  useEffect(() => {
    const hechas = capasRef.current;
    const activas = new Set(estado.activas.filter((id) => id in CAPA_POR_ID));
    for (const id of Object.keys(hechas)) {
      if (!activas.has(id)) { hechas[id].quitar(); delete hechas[id]; }
    }
    let z = ORDEN_Z;
    for (const id of estado.activas) {
      const capa = CAPA_POR_ID[id];
      if (!capa) continue;
      z += 1;
      if (!hechas[id]) hechas[id] = crearCapaParches(L, map, id, z);
      hechas[id].poner(parchesDeCapa(capa, marcas, ahora));
      hechas[id].opacidad(estado.opacidad[id] ?? OPACIDAD_POR_DEFECTO);
    }
  }, [L, map, estado, marcas, ahora]);
  useEffect(() => () => { for (const c of Object.values(capasRef.current)) c.quitar(); capasRef.current = {}; }, []);

  // Las marcas de las neuronas.
  useEffect(() => {
    if (!grupoRef.current) grupoRef.current = L.layerGroup().addTo(map);
    const g = grupoRef.current;
    g.clearLayers();
    for (const m of marcas) {
      const c = coordenadasDeVista(m.posicion);
      if (!c || m.posicion.tipo !== "exacta") continue;
      const viva = posicionEsViva(m.posicion.t, ahora);
      const etiqueta = `${m.esYo ? "Este aparato · " : ""}${m.nombre}${viva ? "" : ` · ${haceCuanto(m.posicion.t, ahora)}`}`;
      const mk = L.marker([c.lat, c.lon], { icon: iconoMarca(L, m, viva, seleccion === m.id), title: etiqueta, alt: etiqueta, keyboard: true, zIndexOffset: m.esYo ? 800 : 700 });
      mk.bindTooltip(escapeHtml(etiqueta), { permanent: true, direction: m.esYo ? "bottom" : "top", offset: [0, m.esYo ? 12 : -12], className: "ss-senales-etiqueta" });
      mk.on("click", (e: any) => { try { L.DomEvent.stopPropagation(e); } catch { /* */ } onElegirRef.current(m.id); });
      g.addLayer(mk);
    }
  }, [L, map, marcas, ahora, seleccion]);
  useEffect(() => () => { try { grupoRef.current?.remove(); } catch { /* */ } grupoRef.current = null; }, []);

  // En el teléfono la ficha es una hoja inferior: se sube la marca elegida para que no quede tapada.
  useEffect(() => {
    if (!seleccion || !compacto) return;
    const m = marcas.find((x) => x.id === seleccion);
    const c = m ? coordenadasDeVista(m.posicion) : null;
    if (!c) return;
    try {
      ctx.dejarDeSeguir();
      const pt = map.latLngToContainerPoint([c.lat, c.lon]);
      const objetivo = map.getSize().y * 0.2;
      if (Math.abs(pt.y - objetivo) > 8) map.panBy([0, pt.y - objetivo], { animate: false });
    } catch { /* */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccion, compacto]);

  const activas = estado.activas.map((id) => CAPA_POR_ID[id]).filter(Boolean);
  const sinPos = marcas.filter((m) => m.posicion.tipo === "desconocida");

  return (
    <>
      <style>{`.ss-senales-etiqueta{background:rgba(11,18,32,.88);color:#f1f5f9;border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:1px 6px;font-size:11px;font-weight:500;box-shadow:none}.ss-senales-etiqueta:before{display:none}`}</style>

      {aviso}
      {vacio}

      {!(seleccion && compacto) && (
        <div className="pointer-events-none absolute bottom-14 left-3 right-16 z-[9] flex max-h-[55%] flex-col items-start gap-2 overflow-hidden sm:bottom-16" data-testid="pie-mapa">
          {sinPos.length > 0 && !vacio && (
            <div className="pointer-events-auto max-w-[22rem] rounded-xl border border-white/10 bg-black/60 px-2.5 py-1.5 backdrop-blur-xl" data-testid="sin-posicion">
              <button type="button" onClick={() => setListaAbierta((v) => !v)} aria-expanded={listaAbierta || !compacto} className="flex min-h-8 w-full cursor-pointer items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-white/60">
                <span>Sin posición conocida ({sinPos.length})</span>
                {compacto && <span aria-hidden>{listaAbierta ? "−" : "+"}</span>}
              </button>
              {(listaAbierta || !compacto) && (
                <ul className="mt-0.5 space-y-1">
                  {sinPos.map((m) => (
                    <li key={m.id}>
                      <button type="button" onClick={() => onElegir(m.id)} className="min-h-8 cursor-pointer text-left text-[11px] leading-snug text-white/80 hover:text-white">
                        <span className="font-medium">{m.nombre}</span>
                        <span className="block text-[10px] text-white/50">{m.posicion.tipo === "desconocida" ? m.posicion.motivo : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {activas.length > 0 && (
            <div className="pointer-events-none max-w-[22rem] space-y-1 rounded-xl border border-white/10 bg-black/60 px-2.5 py-1.5 backdrop-blur-xl" data-testid="leyendas-mapa">
              {activas.map((c) => (
                <div key={c.id}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">{c.etiqueta}{c.estado === "sin-fuente" ? " · sin fuente" : ""}</p>
                  <LeyendaCapa capa={c} className="flex flex-wrap gap-x-3 gap-y-0.5" />
                </div>
              ))}
              <p className="text-[10px] leading-snug text-white/60">{NOTA_PARCHE}</p>
            </div>
          )}
        </div>
      )}
      {children}
    </>
  );
}
