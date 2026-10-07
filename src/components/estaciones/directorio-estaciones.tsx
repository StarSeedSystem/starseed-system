"use client";

/*
 * DirectorioEstaciones (Ola 1010E · ES1010J) — /estaciones: cabecera «Estaciones ·
 * en directo ahora», fila horizontal en directo, chips de tipo, búsqueda, categorías
 * populares y rejilla de TarjetaEstacion. Mezcla la tabla os_estaciones (tiempo real),
 * las fuentes internas del OS y las estaciones oídas por la malla; sin repetir ids y
 * sin las ocultas locales.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  AudioLines, Clapperboard, Headset, CalendarDays, Megaphone, Gamepad2,
  Presentation, Gauge, Tv, LayoutGrid, Layers, Plus, Search, Sparkles,
} from "lucide-react";
import { listarEstaciones, ocultasLocales, ocultarLocal } from "@/lib/estaciones/datos";
import { estacionesInternas } from "@/lib/estaciones/internas";
import { estacionesDeFaros, type EstacionOida } from "@/lib/estaciones/malla";
import {
  categoriasPopulares, estadoDirecto, filtrarEstaciones, ordenarEstaciones,
} from "@/lib/estaciones/directo";
import {
  ETIQUETA_TIPO, TIPOS_ESTACION, type Estacion, type TipoEstacion,
} from "@/lib/estaciones/tipos";
import { useRealtimeRows } from "@/lib/realtime/realtime";
import { TarjetaEstacion } from "./tarjeta-estacion";

const ICONO_TIPO: Record<TipoEstacion, LucideIcon> = {
  audio: AudioLines, video: Clapperboard, xr: Headset, evento: CalendarDays,
  anuncio: Megaphone, juego: Gamepad2, pizarra: Presentation,
  dashboard: Gauge, programa: Tv, app: LayoutGrid, mixto: Layers,
};

export type FilaDirectorio = Estacion & { oidaPorMalla?: boolean };

/** Una estación oída por faro se muestra como enlace externo en directo. */
function estacionDeOida(o: EstacionOida): FilaDirectorio {
  const ahora = new Date().toISOString();
  return {
    id: o.id, owner_id: "malla", ambito_tipo: "persona", entidad_ref: null,
    titulo: o.titulo, descripcion: "", tipo: o.tipo, fuente: "enlace",
    enlace: o.enlace, formato: "", imagen: null, idioma: "es", categorias: [],
    licencia: "propia-abierta", visibilidad: "publica",
    empieza_en: null, termina_en: null, ultimo_latido: ahora,
    pausada: false, en_malla: false, espectadores: 0,
    created_at: ahora, updated_at: ahora, oidaPorMalla: true,
  };
}

/** Une tabla + internas + malla sin repetir ids y quitando las ocultas locales. */
export function mezclarFilas(
  tabla: Estacion[], internas: Estacion[], oidas: EstacionOida[], ocultas: Set<string>,
): FilaDirectorio[] {
  const vistos = new Set<string>();
  const salida: FilaDirectorio[] = [];
  for (const e of [...tabla, ...internas, ...oidas.map(estacionDeOida)]) {
    if (vistos.has(e.id) || ocultas.has(e.id)) continue;
    vistos.add(e.id);
    salida.push(e);
  }
  return salida;
}

export interface DirectorioEstacionesProps {
  inicial?: { tipo?: TipoEstacion };
  onPublicar?: () => void;
}

export function DirectorioEstaciones({ inicial, onPublicar }: DirectorioEstacionesProps) {
  const params = useSearchParams();
  const [tipo, setTipo] = useState<TipoEstacion | "todas">(
    inicial?.tipo ?? (params.get("tipo") as TipoEstacion | null) ?? "todas");
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [internas, setInternas] = useState<Estacion[]>([]);
  const [oidas, setOidas] = useState<EstacionOida[]>([]);
  const [ocultas, setOcultas] = useState<Set<string>>(() => ocultasLocales());
  const { rows, loading } = useRealtimeRows<Estacion>("os_estaciones", listarEstaciones);

  useEffect(() => {
    let vivo = true;
    estacionesInternas().then((l) => { if (vivo) setInternas(l); }).catch(() => {});
    import("@/ai/astraura/mesh/server-relay")
      .then((m) => m.pullPublicFeed({ atIso: "", id: "" }))
      .then((res) => { if (vivo) setOidas(estacionesDeFaros(res.items)); })
      .catch(() => { if (vivo) setOidas([]); }); // la malla caída no rompe el directorio
    return () => { vivo = false; };
  }, []);

  const ocultar = (id: string) => {
    ocultarLocal(id);
    setOcultas((s) => { const n = new Set(s); n.add(id); return n; });
  };

  const ahora = Date.now();
  const lista = useMemo(
    () => mezclarFilas(rows, internas, oidas, ocultas), [rows, internas, oidas, ocultas]);
  const filtradas = useMemo(
    () => ordenarEstaciones(
      filtrarEstaciones(lista, { tipo, texto, categoria: categoria ?? undefined }, ahora), ahora),
    [lista, tipo, texto, categoria, ahora]);
  const enDirecto = filtradas.filter((e) => estadoDirecto(e, ahora) === "en-directo");
  const populares = categoriasPopulares(lista, 8);

  const chip = (activo: boolean) =>
    "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs " +
    (activo ? "border-white/40 bg-white/15 text-white" : "border-white/10 bg-black/30 text-white/70 hover:border-white/25");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Estaciones · en directo ahora</h1>
        <div className="flex gap-2">
          <button type="button" onClick={onPublicar} className={chip(false)}>
            <Plus className="h-4 w-4" /> Publicar estación
          </button>
          <Link href="/estaciones/estudio" className={chip(false)}>
            <Sparkles className="h-4 w-4" /> Abrir el estudio
          </Link>
        </div>
      </header>

      {enDirecto.length > 0 && (
        <section aria-label="En directo ahora" className="flex gap-3 overflow-x-auto pb-1">
          {enDirecto.map((e) => (
            <div key={e.id} className="w-64 shrink-0">
              <TarjetaEstacion estacion={e} ahora={ahora} onOcultar={ocultar} />
            </div>))}
        </section>)}

      <div className="flex flex-col gap-3">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input value={texto} onChange={(ev) => setTexto(ev.target.value)} type="search"
            placeholder="Buscar estaciones…" aria-label="Buscar estaciones"
            className="h-11 w-full rounded-full border border-white/10 bg-black/30 pl-9 pr-3 text-sm outline-none placeholder:text-white/40 focus:border-white/30" />
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Filtrar por tipo">
          <button type="button" onClick={() => setTipo("todas")} className={chip(tipo === "todas")}>
            <Layers className="h-4 w-4" /> Todas
          </button>
          {TIPOS_ESTACION.map((t) => {
            const Icono = ICONO_TIPO[t];
            return (
              <button key={t} type="button" onClick={() => setTipo(t)} className={chip(tipo === t)}>
                <Icono className="h-4 w-4" /> {ETIQUETA_TIPO[t]}
              </button>);
          })}
        </div>
        {populares.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Categorías populares">
            {populares.map((c) => (
              <button key={c.categoria} type="button"
                onClick={() => setCategoria(categoria === c.categoria ? null : c.categoria)}
                className={chip(categoria === c.categoria)}>
                #{c.categoria}
              </button>))}
          </div>)}
      </div>

      {!loading && filtradas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-10 text-center text-sm text-white/60">
          Aún no hay estaciones de este tipo: publica la primera
        </p>
      ) : (
        <section aria-label="Todas las estaciones" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtradas.map((e) => (
            <TarjetaEstacion key={e.id} estacion={e} ahora={ahora} onOcultar={ocultar} />))}
        </section>)}
    </main>
  );
}
