"use client";

/**
 * Lista de neuronas de Cerebros › Neuronas (NEU1126D, parte 1): buscar, filtrar, agrupar, ordenar,
 * rejilla o lista, selección múltiple y asistente «Duplicadas y olvidadas». Nunca borra: solo
 * apaga permisos, abre fichas, propone fusionar (la fusión real vive en fusionar-dialog.tsx) o archiva,
 * y todo con confirmación. Los efectos los hace quien monta la lista (props `on…`).
 */

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { aparatosDe, colorAparatoDe, estadoSyncAparato, idUnicoPorDefecto } from "@/lib/neurons/aparatos-de-neurona";
import type { Neuron } from "@/lib/neurons/neurons";

export type FiltroNeuronas = "todas" | "en-linea" | "este-aparato" | "servidores" | "moviles" | "desconectadas";
export type AgruparPor = "ninguno" | "tipo" | "estado";
export type OrdenNeuronas = "nombre" | "reciente" | "tipo";
export type Vista = "rejilla" | "lista";

export const DIAS_OLVIDADA = 30;
const DIA_MS = 86_400_000;

export interface Duplicada {
  motivo: "mismo-nombre" | "mismo-aparato";
  ids: string[];
  texto: string;
}

export interface NeuronasListaProps {
  neuronas: readonly Neuron[];
  /** Epoch ms; se inyecta para poder probar. */
  ahora?: number;
  onAbrirFicha: (id: string) => void;
  /** Apaga los permisos de las neuronas elegidas (nunca los enciende). */
  onApagarPermisos: (ids: string[]) => void;
  onArchivar: (ids: string[]) => void;
  /** Propone fusionar: abre fusionar-dialog.tsx con estas neuronas. */
  onFusionar: (ids: string[]) => void;
}

/* ───────────── Lógica pura (sin red ni DOM) ───────────── */

const msDe = (n: Neuron): number => (n.last_seen_at ? Date.parse(n.last_seen_at) || 0 : 0);
const claveNombre = (n: string): string => n.trim().toLowerCase().replace(/\s+/g, " ");
const esMovil = (n: Neuron): boolean => n.kind === "mobile" || n.kind === "tablet";

export function pasaFiltro(n: Neuron, f: FiltroNeuronas): boolean {
  if (f === "en-linea") return n.online === true;
  if (f === "este-aparato") return n.isThisDevice === true;
  if (f === "servidores") return n.kind === "server";
  if (f === "moviles") return esMovil(n);
  if (f === "desconectadas") return n.online !== true;
  return true;
}

export function pasaBusqueda(n: Neuron, q: string): boolean {
  const t = claveNombre(q);
  if (!t) return true;
  const c = n.capabilities;
  return [n.name, n.kind, c.platform, c.browser, c.aparato?.equipo].some((v) => (v ?? "").toLowerCase().includes(t));
}

export function ordenar(ns: readonly Neuron[], o: OrdenNeuronas): Neuron[] {
  const por = (a: Neuron, b: Neuron) =>
    o === "reciente" ? msDe(b) - msDe(a) : o === "tipo" ? a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name);
  return [...ns].sort(por);
}

export function agrupar(ns: readonly Neuron[], por: AgruparPor): { titulo: string; items: Neuron[] }[] {
  if (por === "ninguno") return [{ titulo: "", items: [...ns] }];
  const mapa = new Map<string, Neuron[]>();
  for (const n of ns) {
    const k = por === "tipo" ? n.kind : n.online ? "En línea" : "Desconectadas";
    mapa.set(k, [...(mapa.get(k) ?? []), n]);
  }
  return [...mapa].map(([titulo, items]) => ({ titulo, items }));
}

/** Mismo nombre o misma huella de aparato en dos neuronas; solo propone, nunca decide. */
export function detectarDuplicadas(ns: readonly Neuron[]): Duplicada[] {
  const grupos = (clave: (n: Neuron) => string | undefined) => {
    const m = new Map<string, string[]>();
    for (const n of ns) {
      const k = clave(n);
      if (k) m.set(k, [...(m.get(k) ?? []), n.id]);
    }
    return [...m].filter(([, ids]) => ids.length > 1);
  };
  const porNombre = grupos((n) => claveNombre(n.name)).map(([k, ids]): Duplicada => ({ motivo: "mismo-nombre", ids, texto: `${ids.length} neuronas se llaman «${k}».` }));
  const porAparato = grupos((n) => n.capabilities.aparato?.huella).map(([, ids]): Duplicada => ({ motivo: "mismo-aparato", ids, texto: `${ids.length} neuronas dicen ser el mismo aparato.` }));
  return [...porNombre, ...porAparato];
}

/** Neuronas sin latido hace más de `DIAS_OLVIDADA` días (nunca la de este aparato). */
export function detectarOlvidadas(ns: readonly Neuron[], ahora: number): Neuron[] {
  return ns.filter((n) => !n.isThisDevice && ahora - Math.max(msDe(n), Date.parse(n.created_at ?? "") || 0) > DIAS_OLVIDADA * DIA_MS);
}

/* ───────────── Interfaz ───────────── */

type Accion = "apagar" | "archivar" | "fusionar";
const FILTROS: [FiltroNeuronas, string][] = [["todas", "Todas"], ["en-linea", "En línea"], ["este-aparato", "Este aparato"], ["servidores", "Servidores"], ["moviles", "Móviles"], ["desconectadas", "Desconectadas"]];
const TEXTO_ACCION: Record<Accion, string> = {
  apagar: "Se apagarán los permisos de estas neuronas. Nada se borra.",
  archivar: "Se archivarán estas neuronas. Nada se borra y se pueden recuperar.",
  fusionar: "Se abrirá el diálogo de fusión; no se escribe nada hasta que lo confirmes allí.",
};
const selectCls = "h-9 cursor-pointer rounded-lg border border-white/15 bg-black/30 px-2 text-sm text-white";

export default function NeuronasLista({ neuronas, ahora, onAbrirFicha, onApagarPermisos, onArchivar, onFusionar }: NeuronasListaProps) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<FiltroNeuronas>("todas");
  const [grupo, setGrupo] = useState<AgruparPor>("ninguno");
  const [orden, setOrden] = useState<OrdenNeuronas>("nombre");
  const [vista, setVista] = useState<Vista>("rejilla");
  const [sel, setSel] = useState<string[]>([]);
  const [asistente, setAsistente] = useState(false);
  const [pendiente, setPendiente] = useState<{ accion: Accion; ids: string[] } | null>(null);

  const visibles = useMemo(
    () => ordenar(neuronas.filter((n) => pasaFiltro(n, filtro) && pasaBusqueda(n, q)), orden),
    [neuronas, filtro, q, orden],
  );
  const grupos = useMemo(() => agrupar(visibles, grupo), [visibles, grupo]);
  const duplicadas = useMemo(() => detectarDuplicadas(neuronas), [neuronas]);
  const olvidadas = useMemo(() => detectarOlvidadas(neuronas, ahora ?? Date.now()), [neuronas, ahora]);
  const nombreDe = (id: string) => neuronas.find((n) => n.id === id)?.name ?? id;

  const alternar = (id: string) => setSel((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const pedir = (accion: Accion, ids: string[]) => ids.length > 0 && setPendiente({ accion, ids });
  function confirmar() {
    if (!pendiente) return;
    const { accion, ids } = pendiente;
    if (accion === "apagar") onApagarPermisos(ids);
    else if (accion === "archivar") onArchivar(ids);
    else onFusionar(ids);
    setPendiente(null);
    setSel((a) => a.filter((x) => !ids.includes(x)));
  }

  if (neuronas.length === 0) {
    return (
      <div className="rounded-2xl border border-white/15 bg-white/5 p-6 text-center text-sm text-white/70" data-testid="neuronas-vacio">
        Aún no hay neuronas en tu cuenta. Abre StarSeed en otro aparato con la misma sesión y aparecerá aquí.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="neuronas-lista">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[13rem] flex-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-white/50" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar neurona, sistema o navegador" aria-label="Buscar neuronas" className="pl-8" />
        </div>
        <select aria-label="Agrupar" className={selectCls} value={grupo} onChange={(e) => setGrupo(e.target.value as AgruparPor)}>
          <option value="ninguno">Sin agrupar</option>
          <option value="tipo">Agrupar por tipo</option>
          <option value="estado">Agrupar por estado</option>
        </select>
        <select aria-label="Ordenar" className={selectCls} value={orden} onChange={(e) => setOrden(e.target.value as OrdenNeuronas)}>
          <option value="nombre">Orden: nombre</option>
          <option value="reciente">Orden: más reciente</option>
          <option value="tipo">Orden: tipo</option>
        </select>
        <Button variant="ghost" className="h-9 cursor-pointer" onClick={() => setVista(vista === "rejilla" ? "lista" : "rejilla")}>
          {vista === "rejilla" ? "Ver como lista" : "Ver como rejilla"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtros">
        {FILTROS.map(([id, t]) => (
          <Button key={id} size="sm" variant={filtro === id ? "default" : "outline"} className="h-8 cursor-pointer" aria-pressed={filtro === id} onClick={() => setFiltro(id)}>
            {t}
          </Button>
        ))}
        <Button size="sm" variant="outline" className="h-8 cursor-pointer" onClick={() => setAsistente((v) => !v)} aria-expanded={asistente}>
          Duplicadas y olvidadas ({duplicadas.length + olvidadas.length})
        </Button>
      </div>
      {asistente && (
        <section className="space-y-2 rounded-2xl border border-white/15 bg-white/5 p-3 text-sm text-white/80" data-testid="asistente-duplicadas" aria-label="Duplicadas y olvidadas">
          {duplicadas.length === 0 && olvidadas.length === 0 && <p>No hay duplicadas ni olvidadas. Todo en orden.</p>}
          {duplicadas.map((d) => (
            <div key={`${d.motivo}-${d.ids.join("|")}`} className="flex flex-wrap items-center gap-2">
              <span className="min-w-[12rem] flex-1">{d.texto} ({d.ids.map(nombreDe).join(", ")})</span>
              <Button size="sm" className="cursor-pointer" onClick={() => pedir("fusionar", d.ids)}>Proponer fusionar</Button>
              <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => pedir("archivar", d.ids.slice(1))}>Archivar las demás</Button>
            </div>
          ))}
          {olvidadas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-[12rem] flex-1">Sin latido hace más de {DIAS_OLVIDADA} días: {olvidadas.map((n) => n.name).join(", ")}.</span>
              <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => pedir("archivar", olvidadas.map((n) => n.id))}>Archivar olvidadas</Button>
            </div>
          )}
        </section>
      )}
      {sel.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-black/20 p-2 text-sm text-white/80" data-testid="barra-seleccion">
          <span>{sel.length} {sel.length === 1 ? "elegida" : "elegidas"}</span>
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => pedir("apagar", sel)}>Apagar permisos</Button>
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => pedir("archivar", sel)}>Archivar</Button>
          {sel.length === 1 && <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => onAbrirFicha(sel[0])}>Abrir ficha</Button>}
          <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setSel([])}>Quitar selección</Button>
        </div>
      )}
      {pendiente && (
        <div role="alertdialog" aria-label="Confirmar" className="space-y-2 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100" data-testid="confirmar-accion">
          <p>{TEXTO_ACCION[pendiente.accion]} ({pendiente.ids.map(nombreDe).join(", ")})</p>
          <div className="flex gap-2">
            <Button size="sm" className="cursor-pointer" onClick={confirmar}>Confirmar</Button>
            <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setPendiente(null)}>Cancelar</Button>
          </div>
        </div>
      )}
      {visibles.length === 0 && <p className="rounded-xl border border-white/15 p-4 text-center text-sm text-white/60" data-testid="sin-resultados">Ninguna neurona coincide con la búsqueda y el filtro.</p>}
      {grupos.map((g) => (
        <section key={g.titulo || "todas"} aria-label={g.titulo || "Neuronas"} className="space-y-2">
          {g.titulo && <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">{g.titulo} · {g.items.length}</h3>}
          <ul className={vista === "rejilla" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>
            {g.items.map((n) => (
              <li key={n.id} className="flex items-start gap-3 rounded-2xl border border-white/15 bg-white/5 p-3" data-testid="neurona-item">
                <Checkbox checked={sel.includes(n.id)} onCheckedChange={() => alternar(n.id)} aria-label={`Elegir ${n.name}`} className="mt-1" />
                <button type="button" className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => onAbrirFicha(n.id)}>
                  <span className="block truncate font-semibold text-white">{n.name}</span>
                  <span className="block truncate text-xs text-white/60">{n.capabilities.platform} · {n.kind}{n.capabilities.browser ? ` · ${n.capabilities.browser}` : ""}</span>
                  {(() => {
                    const aps = aparatosDe(n.capabilities);
                    if (aps.length === 0) return null;
                    return (
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        {aps.slice(0, 3).map((ap) => {
                          const sync = estadoSyncAparato(ap, { ahora: ahora ?? Date.now(), presente: n.online });
                          return (
                            <span key={ap.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-white/15 bg-black/30 px-1.5 py-px text-[10px] text-white/80">
                              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: colorAparatoDe(ap) }} aria-hidden />
                              <span className="truncate font-mono">@{ap.idUnico || idUnicoPorDefecto(ap)}</span>
                              <span className={sync.estado === "activa" ? "text-emerald-300" : sync.estado === "pendiente" ? "text-amber-200" : "text-white/50"}>
                                {sync.estado === "activa" ? "✓" : "⏳"}
                              </span>
                            </span>
                          );
                        })}
                      </span>
                    );
                  })()}
                </button>
                <Badge variant={n.online ? "default" : "outline"}>{n.isThisDevice ? "Este aparato" : n.online ? "En línea" : "Desconectada"}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
