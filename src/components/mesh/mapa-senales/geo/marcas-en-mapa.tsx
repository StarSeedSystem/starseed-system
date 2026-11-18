"use client";

/**
 * MarcasEnMapa — lo que la pestaña «Mapa» de Señales añade al mapa del Hub (MAP1114C): los parches de color de las
 * capas encendidas, las marcas de las neuronas de mi cuenta (en su punto exacto), las leyendas y la lista de aparatos.
 * No crea ningún mapa: recibe `L` y `map` de `MapView`. No pinta nada que no esté medido.
 */

import { useEffect, useRef, useState } from "react";
import { escapeHtml } from "@/lib/map/map-config";
import type { MapExtensionCtx } from "@/components/map/map-view-extension";
import type { EstadoLectura } from "@/lib/senales/espectro/leer-senales";
import { CAPA_POR_ID, NOTA_ALCANCE, NOTA_PARCHE, OPACIDAD_POR_DEFECTO, motivoSenalesPublicadas, tramoDe, tramoDeCalidad, type EstadoCapas } from "@/lib/senales/geo/capas";
import { camposDeCapa, lineasDeEnlaces } from "@/lib/senales/geo/cobertura";
import type { EnlaceMedido } from "@/lib/senales/geo/enlaces-medidos";
import { horaDe } from "@/lib/senales/geo/ficha-geo";
import { COLOR_DESCONOCIDO } from "@/lib/senales/geo/capas";
import { haceCuanto, posicionEsViva, coordenadasDeVista } from "@/lib/senales/geo/modelo-geo";
import { parchesDeCapa } from "@/lib/senales/geo/parches";
import type { MarcaGeo } from "@/lib/senales/geo/marcas";
import { direccionEtiqueta } from "@/lib/senales/geo/etiquetas";
import { crearCapaParches, type CapaParches } from "./capa-parches";
import { crearCapaAlcance, type CapaAlcance } from "./capa-alcance";
import { LeyendaCapa } from "./seccion-capas";

const ORDEN_Z = 440;

/** El color del punto es la calidad de internet MEDIDA de esa neurona; sin medida, gris. Este aparato lleva además un aro blanco. */
function colorInternet(m: MarcaGeo): string {
  const a = m.antenas.find((x) => x.kind === "ip");
  if (!a?.medida || a.calidad === null) return COLOR_DESCONOCIDO;
  return tramoDe(CAPA_POR_ID["senal-internet"], tramoDeCalidad(a.calidad)).color;
}

function iconoMarca(L: any, m: MarcaGeo, viva: boolean, seleccionada: boolean) {
  const tam = m.esYo ? 24 : 20;
  const color = colorInternet(m);
  const borde = viva ? "solid" : "dashed";
  const brillo = seleccionada ? `,0 0 0 4px rgba(56,189,248,.45)` : "";
  const forma = m.forma === "rombo" ? "transform:rotate(45deg);border-radius:4px;" : "border-radius:9999px;";
  return L.divIcon({
    className: "",
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
    html: `<div style="width:${tam}px;height:${tam}px;box-sizing:border-box;background:${viva ? "#0b1220" : "#1e293b"};border:3px ${borde} ${color};${forma}box-shadow:0 0 0 2px ${m.esYo ? "#fff" : "rgba(0,0,0,.55)"}${brillo};opacity:${viva ? 1 : 0.8}"></div>`,
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
  /** (MAP1114D) Enlaces con medida real, para las líneas. */
  enlaces?: readonly EnlaceMedido[];
  /** (AUD1117) Estado de la lectura de las señales publicadas de la red: si falló, el panel de capas dice el motivo. */
  publicadas?: { estado: EstadoLectura; motivo?: string };
  vacio?: React.ReactNode;
  aviso?: React.ReactNode;
  children?: React.ReactNode;
}

export function MarcasEnMapa({ ctx, marcas, ahora, estado, seleccion, onElegir, compacto, enlaces = [], publicadas, vacio, aviso, children }: MarcasEnMapaProps) {
  const { L, map } = ctx;
  const capasRef = useRef<Record<string, CapaParches | CapaAlcance>>({});
  const lineasRef = useRef<any>(null);
  const grupoRef = useRef<any>(null);
  const [listaAbierta, setListaAbierta] = useState(false);
  const [leyendaAbierta, setLeyendaAbierta] = useState(false);
  const onElegirRef = useRef(onElegir);
  onElegirRef.current = onElegir;

  // Una capa de canvas por capa encendida: parches (medido) o campos de alcance (estimado). Las líneas van aparte.
  useEffect(() => {
    const hechas = capasRef.current;
    const activas = new Set(estado.activas.filter((id) => id in CAPA_POR_ID && (CAPA_POR_ID[id].tipo ?? "parche") !== "enlaces"));
    for (const id of Object.keys(hechas)) {
      if (!activas.has(id)) { hechas[id].quitar(); delete hechas[id]; }
    }
    let z = ORDEN_Z;
    for (const id of estado.activas) {
      const capa = CAPA_POR_ID[id];
      if (!capa || capa.tipo === "enlaces") continue;
      z += 1;
      if (capa.tipo === "alcance") {
        if (!hechas[id]) hechas[id] = crearCapaAlcance(L, map, id, z);
        (hechas[id] as CapaAlcance).poner(camposDeCapa(capa, marcas, ahora));
      } else {
        if (!hechas[id]) hechas[id] = crearCapaParches(L, map, id, z);
        (hechas[id] as CapaParches).poner(parchesDeCapa(capa, marcas, ahora));
      }
      hechas[id].opacidad(estado.opacidad[id] ?? OPACIDAD_POR_DEFECTO);
    }
  }, [L, map, estado, marcas, ahora]);

  // Las líneas medidas: trazo SÓLIDO coloreado por calidad; al tocar una, su calidad y la hora de la medida.
  useEffect(() => {
    if (!lineasRef.current) lineasRef.current = L.layerGroup().addTo(map);
    const g = lineasRef.current;
    g.clearLayers();
    if (!estado.activas.includes("enlaces-medidos")) return;
    const op = estado.opacidad["enlaces-medidos"] ?? OPACIDAD_POR_DEFECTO;
    for (const l of lineasDeEnlaces(enlaces, marcas, ahora, horaDe)) {
      const pts = [[l.de.lat, l.de.lon], [l.a.lat, l.a.lon]];
      if (l.pila === 0) g.addLayer(L.polyline(pts, { color: "#0b1220", weight: 8, opacity: 0.45 * op, interactive: false }));
      const linea = L.polyline(pts, { color: l.color, weight: l.pila === 0 ? 5 : 2, opacity: op, lineCap: "round" });
      linea.bindPopup(escapeHtml(l.texto), { className: "ss-senales-popup", maxWidth: 240, autoPanPaddingTopLeft: [12, 72], autoPanPaddingBottomRight: [12, 12] });
      linea.bindTooltip(escapeHtml(l.texto), { sticky: true, className: "ss-senales-etiqueta" });
      g.addLayer(linea);
    }
  }, [L, map, estado, enlaces, marcas, ahora]);
  useEffect(() => () => { try { lineasRef.current?.remove(); } catch { /* */ } lineasRef.current = null; }, []);
  useEffect(() => () => { for (const c of Object.values(capasRef.current)) c.quitar(); capasRef.current = {}; }, []);

  // Las marcas de las neuronas. La etiqueta cambia de lado cuando la marca está pegada al borde del mapa (MAP1114D).
  useEffect(() => {
    if (!grupoRef.current) grupoRef.current = L.layerGroup().addTo(map);
    const g = grupoRef.current;
    g.clearLayers();
    const puestas: { mk: any; m: MarcaGeo; etiqueta: string; dir: string }[] = [];
    for (const m of marcas) {
      const c = coordenadasDeVista(m.posicion);
      if (!c || m.posicion.tipo !== "exacta") continue;
      const viva = posicionEsViva(m.posicion.t, ahora);
      const etiqueta = `${m.esYo ? "Este aparato · " : ""}${m.nombre}${viva ? "" : ` · ${haceCuanto(m.posicion.t, ahora)}`}`;
      const mk = L.marker([c.lat, c.lon], { icon: iconoMarca(L, m, viva, seleccion === m.id), title: etiqueta, alt: etiqueta, keyboard: true, zIndexOffset: m.esYo ? 800 : 700 });
      mk.on("click", (e: any) => { try { L.DomEvent.stopPropagation(e); } catch { /* */ } onElegirRef.current(m.id); });
      g.addLayer(mk);
      puestas.push({ mk, m, etiqueta, dir: "" });
    }
    const colocar = () => {
      let tam: { x: number; y: number };
      try { tam = map.getSize(); } catch { return; }
      for (const p of puestas) {
        try {
          const pt = map.latLngToContainerPoint(p.mk.getLatLng());
          const dir = direccionEtiqueta(pt, tam, p.m.esYo);
          if (dir === p.dir) continue;
          p.dir = dir;
          p.mk.unbindTooltip();
          if (dir === "fuera") continue;
          const lateral = dir === "left" || dir === "right";
          p.mk.bindTooltip(escapeHtml(p.etiqueta), { permanent: true, direction: dir, offset: lateral ? [dir === "right" ? 14 : -14, 0] : [0, dir === "bottom" ? 12 : -12], className: "ss-senales-etiqueta" });
        } catch { /* la marca se está quitando */ }
      }
    };
    colocar();
    map.on("moveend zoomend resize", colocar);
    return () => { try { map.off("moveend zoomend resize", colocar); } catch { /* */ } };
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
  // (AUD1117) Si la lectura de señales publicadas falló y hay capas de red encendidas, el panel dice el motivo
  // en vez de dejarlas pintar cero como si fuera la verdad.
  const motivoPublicadas = activas.some((c) => c.grupo === "red") ? motivoSenalesPublicadas(publicadas?.estado ?? "ok", publicadas?.motivo) : null;

  return (
    <>
      <style>{`.ss-senales-etiqueta{background:rgba(11,18,32,.88);color:#f1f5f9;border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:1px 6px;font-size:11px;font-weight:500;box-shadow:none}.ss-senales-etiqueta:before{display:none}[data-testid="pestana-mapa"] .leaflet-control-attribution{max-width:calc(100% - 3.75rem);white-space:normal;text-align:right;line-height:1.25;padding:1px 6px;margin:0 14px 6px 0}`}</style>

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
            <div className="pointer-events-auto max-w-[22rem] space-y-1 rounded-xl border border-white/10 bg-black/60 px-2.5 py-1.5 backdrop-blur-xl" data-testid="leyendas-mapa">
              {compacto && (
                <button type="button" onClick={() => setLeyendaAbierta((v) => !v)} aria-expanded={leyendaAbierta} className="flex min-h-8 w-full cursor-pointer items-center justify-between gap-2 text-left text-[10px] leading-snug text-white/70">
                  <span>{activas.some((c) => c.tipo === "alcance") ? "Rayado = alcance estimado, no medido. " : ""}Trazo sólido = medido.</span>
                  <span className="shrink-0 font-semibold uppercase tracking-wide text-white/60">Leyenda {leyendaAbierta ? "−" : "+"}</span>
                </button>
              )}
              {(!compacto || leyendaAbierta) && activas.map((c) => (
                <div key={c.id} className={compacto ? "flex flex-wrap items-center gap-x-2 gap-y-0.5" : undefined}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">{c.etiqueta}{c.estado === "sin-fuente" ? " · sin fuente" : c.estado === "estimado" ? " · alcance estimado" : ""}</p>
                  <LeyendaCapa capa={c} soloDibujado className="flex flex-wrap gap-x-3 gap-y-0.5" />
                </div>
              ))}
              {motivoPublicadas && (
                <p className="text-[10px] leading-snug text-amber-300" data-testid="motivo-publicadas" role="status">{motivoPublicadas}</p>
              )}
              {!compacto && (
                <p className="text-[10px] leading-snug text-white/60">
                  {`${activas.some((c) => c.tipo === "alcance") ? NOTA_ALCANCE + " " : ""}${activas.some((c) => (c.tipo ?? "parche") === "parche") ? NOTA_PARCHE : ""}`}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {children}
    </>
  );
}
