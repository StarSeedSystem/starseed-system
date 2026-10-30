"use client";
// Ventana «Variaciones públicas» (Ola 1019V · contrato §4). Es el CUERPO de la ventana: el marco
// lo pone OSWindow. Datos y fuentes se INYECTAN (nada de Supabase, disco ni red aquí). Cuatro
// pestañas, buscador, filtros, orden de `orden.ts`, vacío honesto y aviso si la tabla no existe.
import { useMemo, useState } from "react";
import { ExternalLink, Search, Star } from "lucide-react";
import { PESTANAS_VARIACIONES, type PestanaVariaciones } from "./variaciones-bus";
import { ordenarVariaciones, type SortMode, type Variacion } from "@/lib/variaciones/orden";
import { TarjetaVariacion, itemBibliotecaDeVariacion } from "./tarjeta-variacion";
export interface VariacionVentana extends Variacion { tema?: string; enlaceExterno?: string; payload?: unknown; codigo?: boolean; deVariacion?: string | null; autor?: string }
export interface DatosVentanaVariaciones { disponible: boolean; error?: string; listas: Partial<Record<PestanaVariaciones, VariacionVentana[]>> }
export interface FiltrosVentana { buscar?: string; licencia?: string; tema?: string; etiqueta?: string }
export interface VentanaVariacionesProps {
  clave: string; datos: DatosVentanaVariaciones; nombre?: string;
  pestanaInicial?: PestanaVariaciones; busquedaInicial?: string;
}
const NOMBRES: Record<PestanaVariaciones, string> = { variaciones: "Variaciones", notas: "Notas", repos: "Repos externos", fuentes: "Fuentes y versiones" };
const VACIOS: Record<PestanaVariaciones, string> = {
  variaciones: "Aún nadie ha publicado una variación de este elemento", notas: "Aún nadie ha escrito una nota pública sobre este elemento",
  repos: "Aún no hay repositorios externos para este elemento", fuentes: "Aún no hay fuentes ni versiones publicadas de este elemento",
};
const ORDENES: Record<SortMode, string> = { aurora: "Aurora", novedades: "Novedades", populares: "Populares", relevantes: "Mejor valoradas", alfabetico: "Alfabético" };
/** Filtro puro: texto (título, descripción o etiquetas), licencia, tema y etiqueta. */
export function filtrarVariaciones(lista: readonly VariacionVentana[], f: FiltrosVentana): VariacionVentana[] {
  const texto = (f.buscar ?? "").trim().toLowerCase();
  return lista.filter((v) => `${v.titulo} ${v.descripcion} ${v.etiquetas.join(" ")}`.toLowerCase().includes(texto)
    && (!f.licencia || v.licencia === f.licencia) && (!f.tema || v.tema === f.tema)
    && (!f.etiqueta || v.etiquetas.includes(f.etiqueta)));
}
const enlaceSeguro = (url?: string): string | null => (url && /^https:\/\/\S+$/.test(url) ? url : null);
const familiaDe = (clave: string): string => clave.split(":")[0] ?? "";
export function VentanaVariaciones({ clave, datos, nombre, pestanaInicial = "variaciones", busquedaInicial = "" }: VentanaVariacionesProps) {
  const [pestana, setPestana] = useState<PestanaVariaciones>(pestanaInicial);
  const [buscar, setBuscar] = useState(busquedaInicial);
  const [orden, setOrden] = useState<SortMode>("aurora");
  const [licencia, setLicencia] = useState("");
  const [tema, setTema] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const lista = datos.listas[pestana] ?? [];
  const opciones = useMemo(() => ({
    licencias: [...new Set(lista.map((v) => v.licencia).filter(Boolean))].sort(),
    temas: [...new Set(lista.map((v) => v.tema).filter((t): t is string => !!t))].sort(),
    etiquetas: [...new Set(lista.flatMap((v) => v.etiquetas))].sort(),
  }), [lista]);
  // Ordenar conserva los campos de la variación; el tipo base no los declara.
  const visibles = useMemo<VariacionVentana[]>(
    () => ordenarVariaciones(filtrarVariaciones(lista, { buscar, licencia, tema, etiqueta }), orden) as VariacionVentana[],
    [lista, buscar, licencia, tema, etiqueta, orden]);
  const cambiar = (p: PestanaVariaciones) => { setPestana(p); setBuscar(""); setLicencia(""); setTema(""); setEtiqueta(""); };
  const selector = (etiquetaAria: string, valor: string, cambiarValor: (v: string) => void, opcionesLista: string[], vacio: string) => (
    <select aria-label={etiquetaAria} value={valor} onChange={(e) => cambiarValor(e.target.value)}
      className="cursor-pointer rounded-full border border-border/50 bg-background/40 px-2 py-1 text-xs text-muted-foreground">
      <option value="">{vacio}</option>
      {opcionesLista.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  return (
    <div className="flex h-full flex-col text-foreground">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-3">
        <span className="rounded-full border border-border/60 bg-background/40 px-3 py-1 font-mono text-[11px] text-muted-foreground">{clave}</span>
        <span className="text-xs text-muted-foreground">{nombre ?? familiaDe(clave)}</span>
        <span className="ml-auto text-xs text-muted-foreground">{visibles.length} de {lista.length}</span>
      </div>
      <div role="tablist" aria-label="Secciones de variaciones públicas" className="flex flex-wrap gap-1 px-4 py-2">
        {PESTANAS_VARIACIONES.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={p === pestana} onClick={() => cambiar(p)}
            className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors ${p === pestana ? "border-primary/50 bg-primary/15 text-foreground" : "border-border/50 bg-background/30 text-muted-foreground hover:text-foreground"}`}>
            {NOMBRES[p]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-full border border-border/50 bg-background/40 px-3 py-1.5">
          <Search className="size-3.5 text-muted-foreground" aria-hidden />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar variaciones"
            placeholder="Buscar por título, descripción o etiqueta" className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground" />
        </label>
        <select aria-label="Ordenar por" value={orden} onChange={(e) => setOrden(e.target.value as SortMode)}
          className="cursor-pointer rounded-full border border-border/50 bg-background/40 px-2 py-1 text-xs text-muted-foreground">
          {(Object.keys(ORDENES) as SortMode[]).map((o) => <option key={o} value={o}>{ORDENES[o]}</option>)}
        </select>
        {selector("Filtrar por licencia", licencia, setLicencia, opciones.licencias, "Toda licencia")}
        {opciones.temas.length > 0 && selector("Filtrar por tema", tema, setTema, opciones.temas, "Todo tema")}
        {opciones.etiquetas.length > 0 && selector("Filtrar por etiqueta", etiqueta, setEtiqueta, opciones.etiquetas, "Toda etiqueta")}
      </div>
      <div role="tabpanel" aria-label={NOMBRES[pestana]} className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        {!datos.disponible ? (
          <div role="alert" className="rounded-2xl border border-border/50 bg-card/60 p-4 text-sm text-muted-foreground backdrop-blur-xl">
            La tabla de variaciones públicas no está disponible en este proyecto todavía.
            {datos.error ? ` ${datos.error}` : " Cuando se aplique la migración, aquí aparecerá lo que publique la gente."}
          </div>
        ) : visibles.length === 0 ? (
          <p role="status" className="rounded-2xl border border-dashed border-border/50 bg-card/40 p-6 text-center text-sm text-muted-foreground">{VACIOS[pestana]}</p>
        ) : pestana === "variaciones" ? (
          <div className="space-y-2">
            {visibles.map((v) => (
              <TarjetaVariacion
                key={v.id}
                clave={clave}
                biblioteca={v.payload === undefined ? null : itemBibliotecaDeVariacion(clave, v)}
                variacion={{
                  id: v.id,
                  titulo: v.titulo,
                  descripcion: v.descripcion,
                  version: v.version,
                  familia: v.familia,
                  licencia: v.licencia,
                  etiquetas: v.etiquetas,
                  valoracionMedia: v.valoracionMedia,
                  valoracionCount: v.valoracionCount,
                  payload: v.payload,
                  codigo: v.codigo,
                  deVariacion: v.deVariacion,
                  autor: v.autor,
                  enlaceExterno: v.enlaceExterno,
                }}
              />
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {visibles.map((v) => {
              const url = enlaceSeguro(v.enlaceExterno);
              return (
                <li key={v.id} className="rounded-2xl border border-border/50 bg-card/60 p-3 backdrop-blur-xl">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h4 className="text-sm font-semibold">{v.titulo}</h4>
                    <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground">{v.licencia}</span>
                    {v.version && <span className="font-mono text-[10px] text-muted-foreground">v{v.version}</span>}
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Star className="size-3" aria-hidden /> {v.valoracionMedia.toFixed(1)} ({v.valoracionCount})</span>
                  </div>
                  {v.descripcion && <p className="mt-1 text-xs text-muted-foreground">{v.descripcion}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {v.etiquetas.map((e) => <span key={e} className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">{e}</span>)}
                    {url && <a href={url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex cursor-pointer items-center gap-1 text-[11px] text-primary hover:underline">Ver origen <ExternalLink className="size-3" aria-hidden /></a>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
export default VentanaVariaciones;
