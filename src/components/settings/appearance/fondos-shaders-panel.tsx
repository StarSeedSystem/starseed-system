"use client";

/**
 * FondosShadersPanel — Ola 1018F · FSH1018K (architecture/fondos-shaders.md §2-§3): editor de las
 * capas NUEVAS de fondo — shader (efecto del catálogo `shaders` de la versión instalada, buscado por
 * nombre y categoría) y difuminado. Reordenar, opacidad, mezcla, posición/tamaño/rotación, máscara y
 * props del efecto; guardar la pila como set `.starseed-fondo.json` con carpeta a elegir de la
 * Biblioteca (`fondos-biblioteca`) y aplicar al alcance con herencia (`alcance-fondos`, FSH1018H),
 * con reparto a las neuronas (`sync-fondos`, FSH1018P). El fondo base (Spline por defecto) sigue
 * siendo la opción principal y vive debajo: aquí no se toca. El catálogo entra por `import`
 * dinámico solo en cliente; WebcamTexture y ObjectTracker NO se ofrecen. Inyectable para pruebas:
 * nada de red, disco ni GPU en ellas.
 */
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FolderPlus, Plus, Search, SlidersHorizontal, Trash2, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/context/appearance-context";
import {
  addLayer,
  createLayer,
  normalizeLayers,
  patchLayer,
  removeLayer,
  reorderLayers,
  type BackgroundLayer,
  type BlendMode,
  type DifusionConfig,
  type MascaraKind,
  type Transform,
} from "@/lib/appearance/background-layers";
import { cargarCatalogo, type ShaderCatalog, type ShaderCatalogEntry } from "@/lib/appearance/catalogo-shaders";
import { FORMATO_SET, LICENCIA_SHADERS, type SetFondo } from "@/lib/appearance/sets-fondo";
import { guardarSet, type DependenciasBiblioteca } from "@/lib/appearance/fondos-biblioteca";
import type { AlcanceNeuronas } from "@/lib/appearance/sync-fondos";
import type { AmbitoFondo } from "@/lib/appearance/alcance-fondos";
import { EVENTO_APLICAR_FONDO, type DetalleAplicarFondo } from "@/lib/protomolecula/peticion/fondo-evento";
import { useMyLibraryDestinations } from "@/lib/library/entity-library";
import type { EntityRef } from "@/lib/sync/entity-state";

/** Lo que entrega «Aplicar al alcance»: la pila como set, el ámbito con su clave y las neuronas. */
export interface AplicarAlcanceDetalles {
  set: SetFondo;
  ambito: AmbitoFondo;
  /** Vacío en «cuenta»; en «perfil» cae al perfil activo (perfilId) si no se teclea otro. */
  clave: string;
  neuronas: AlcanceNeuronas;
  elegidas: string[];
}

export interface FondosShadersPanelProps {
  /** Catálogo de la versión instalada; si no viene, se carga con `cargarCatalogo` (solo cliente). */
  catalogo?: ShaderCatalog;
  /** Biblioteca destino para guardar el set (por defecto, la primera biblioteca propia). */
  destinoRef?: EntityRef;
  destinoLabel?: string;
  /** Dependencias de Biblioteca inyectadas (pruebas); sin ellas, `guardarSet` abre las reales. */
  deps?: DependenciasBiblioteca;
  /** Neuronas del perfil (ids); sin ellas no se pinta el reparto por malla. */
  neuronas?: readonly string[];
  perfilId?: string | null;
  /** Conexión del alcance persistente (FSH1018H); por defecto, aviso en vivo + evento de la Protomolécula. */
  onAplicarAlcance?: (d: AplicarAlcanceDetalles) => void;
}

const BLENDS: BlendMode[] = ["normal", "screen", "lighten", "overlay", "soft-light", "multiply", "color-dodge", "difference", "hard-light", "luminosity"];
const ALCANCES: AmbitoFondo[] = ["cuenta", "perfil", "app", "pagina", "seccion"];
const ETIQUETA_ALCANCE: Record<AmbitoFondo, string> = { cuenta: "Cuenta", perfil: "Perfil", app: "App", pagina: "Página", seccion: "Sección", entidad: "Entidad" };
const PUNTERO_CLAVE: Partial<Record<AmbitoFondo, string>> = { app: "Id de la app", pagina: "Ruta (/escritorios…)", seccion: "Id de la sección" };
const CAT = "cursor-pointer rounded-lg border border-border/40 bg-black/20 px-2 py-1.5 text-xs outline-none focus:border-primary/60";
const CHIP_ON = "cursor-pointer rounded-full border border-primary/60 bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary";
const CHIP_OFF = "cursor-pointer rounded-full border border-border/50 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-white/5";
const MINI = "cursor-pointer grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground";
const TRANSFORM_DEF = { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 } as const;

function Mar({ e, v, min, max, step, on }: { e: string; v: number; min: number; max: number; step: number; on: (n: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-[11px]">
      <span className="w-20 shrink-0 truncate text-muted-foreground/70">{e}</span>
      <input className="min-w-0 flex-1 cursor-pointer accent-primary" type="range" min={min} max={max} step={step} value={v}
        onChange={(ev) => on(Number(ev.target.value))} aria-label={e} />
    </label>
  );
}

export function FondosShadersPanel(props: FondosShadersPanelProps) {
  const { config, updateConfig } = useAppearance();
  const capas = useMemo(() => normalizeLayers(config.background.layers), [config.background.layers]);
  const fondo = capas.filter((l) => l.kind === "shader" || l.kind === "difusion");
  const setLayers = (next: BackgroundLayer[]) => updateConfig({ background: { layers: next } } as never);
  const parchear = (id: string, p: Partial<BackgroundLayer>) => setLayers(patchLayer(capas, id, p));

  const [catalogo, setCatalogo] = useState<ShaderCatalog | null>(props.catalogo ?? null);
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [carpeta, setCarpeta] = useState("");
  const [carpetas, setCarpetas] = useState<Array<{ id: string; name: string }> | null>(null);
  const [ambito, setAmbito] = useState<AmbitoFondo>("cuenta");
  const [clave, setClave] = useState("");
  const [neuras, setNeuras] = useState<AlcanceNeuronas>("todas");
  const [elegidas, setElegidas] = useState<string[]>([]);

  const biblioteca = useMyLibraryDestinations();
  const destino = props.destinoRef
    ? { ref: props.destinoRef, label: props.destinoLabel ?? "Biblioteca" }
    : biblioteca.destinations[0] ?? null;
  const plano = useMemo(() => (catalogo ? Object.values(catalogo).flat() : []), [catalogo]);
  const metadatos = (tipo: string): ShaderCatalogEntry | undefined => plano.find((e) => e.name === tipo);

  // Catálogo: inyectado manda; si no, `import("shaders/registry")` dinámico en cliente (nunca en SSR).
  useEffect(() => { if (props.catalogo) setCatalogo(props.catalogo); }, [props.catalogo]);
  useEffect(() => {
    if (props.catalogo) return;
    let vivo = true;
    cargarCatalogo().then((c) => { if (vivo) setCatalogo(c); }).catch(() => undefined);
    return () => { vivo = false; };
  }, [props.catalogo]);
  // Carpetas de la biblioteca destino (carpeta a elegir): solo con dependencias inyectadas o reales.
  useEffect(() => {
    const ref = destino?.ref;
    if (!ref || !props.deps) { setCarpetas(null); return; }
    let vivo = true;
    props.deps.listar(ref).then((doc) => {
      if (vivo) setCarpetas(doc.folders.filter((f) => f.parentId !== null).map((f) => ({ id: f.id, name: f.name })));
    }).catch(() => { if (vivo) setCarpetas(null); });
    return () => { vivo = false; };
  }, [props.deps, destino?.ref]);

  // La pila COMPLETA (base aparte) sale como set con `base: null`: aplicar NUNCA cambia el motor base.
  const setDeCapas = (nombreSet: string): SetFondo => ({
    formato: FORMATO_SET, version: 1,
    id: `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    nombre: nombreSet, autor: "Yo",
    licencias: capas.some((l) => l.kind === "shader") ? [LICENCIA_SHADERS] : [],
    base: null, capas: capas.map((c) => ({ ...c })), creado: new Date().toISOString(),
  });

  const guardarComoSet = async (): Promise<void> => {
    if (!destino) { toast.error("Entra en tu cuenta para guardar el set en tu Biblioteca"); return; }
    const r = await guardarSet(destino.ref, setDeCapas(nombre.trim() || "Mi fondo"), carpeta || undefined, props.deps);
    if (r.ok) toast.success(`Set guardado en ${carpeta ? "la carpeta elegida" : "«Fondos» (raíz)"} de ${destino.label}`);
    else toast.error(`No se pudo guardar el set: ${r.motivo}`);
  };

  // Cómo se aplica en vivo, sin tocar el motor base (el mismo aviso que usa la Protomolécula).
  const aplicarAlcance = (): void => {
    const claveFinal = ambito === "perfil" && !clave ? (props.perfilId ?? "") : clave;
    const d: AplicarAlcanceDetalles = { set: setDeCapas("Fondo del alcance"), ambito, clave: claveFinal, neuronas: neuras, elegidas };
    if (props.onAplicarAlcance) { props.onAplicarAlcance(d); return; }
    const detalle: DetalleAplicarFondo = { aplicar: () => d.set.capas.map((c) => ({ ...c })) };
    const atendido = !window.dispatchEvent(new CustomEvent(EVENTO_APLICAR_FONDO, { detail: detalle, cancelable: true }));
    toast[atendido ? "success" : "error"](`Fondo aplicado al alcance «${ETIQUETA_ALCANCE[ambito]}»${atendido ? "" : ": la apariencia no respondió"}`);
  };

  const anadirEfecto = (nombreEfecto: string): void => {
    const capa: BackgroundLayer = {
      ...createLayer("shader"), name: `Shader · ${nombreEfecto}`,
      preset: { components: [{ type: nombreEfecto, props: {} }] },
    };
    setLayers([...capas, capa]);
    setSelId(capa.id);
    setQ("");
  };
  const anadirDifusion = (): void => { const l = addLayer(capas, "difusion"); setLayers(l); setSelId(l[l.length - 1]?.id ?? null); };

  const parchearTransform = (id: string, t: Partial<Transform>): void => {
    const c = capas.find((x) => x.id === id);
    parchear(id, { transform: { ...TRANSFORM_DEF, ...(c?.transform ?? {}), ...t } });
  };
  const parchearDifusion = (id: string, d: Partial<DifusionConfig>): void => {
    const c = capas.find((x) => x.id === id);
    parchear(id, { difusion: { modo: "transparente", desenfoquePx: 0, opacidad: 1, textura: "ninguna", ...(c?.difusion ?? {}), ...d } });
  };
  /** Props del PRIMER componente del preset: lo que el catálogo lista para su efecto. */
  const parchearProp = (id: string, prop: string, texto: string): void => {
    const c = capas.find((x) => x.id === id);
    const comps = [...(c?.preset?.components ?? [])];
    if (!c?.preset || !comps[0]) return;
    const viejos = comps[0].props;
    const numeral = typeof viejos[prop] === "number";
    comps[0] = { ...comps[0], props: { ...viejos, [prop]: numeral ? Number(texto) : texto } };
    parchear(id, { preset: { ...c.preset, components: comps } });
  };

  /** El catálogo filtrado por texto (nombre o descripción), sin cámara ni efecto que pida hijo. */
  const resultados = useMemo(() => {
    if (!catalogo) return null;
    const t = q.trim().toLowerCase();
    return Object.entries(catalogo).flatMap(([categoria, lista]) =>
      lista
        .filter((e) => !e.requiereCamara && !e.necesitaHijo)
        .filter((e) => t === "" || e.name.toLowerCase().includes(t) || e.description.toLowerCase().includes(t))
        .map((e) => ({ ...e, categoria })),
    );
  }, [catalogo, q]);

  return (
    <div aria-label="Capas con shaders y difuminado" className="rounded-2xl border border-border/50 bg-card/30 p-4 space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Wand2 className="size-4 text-primary" /> Shaders y difuminado
      </h3>
      <p className="max-w-prose text-[11px] text-muted-foreground/70">
        Encima del fondo base (que sigue siendo la opción principal, ahí abajo): capas de efectos WebGPU y de
        difuminado, con su opacidad, mezcla, posición, tamaño, rotación y máscara. Efectos y capas componen la GPU,
        así que sin WebGPU se enseña la vista previa fija del set.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar efecto en el catálogo…" aria-label="Buscar efecto en el catálogo"
          className={cn(CAT, "min-w-40 flex-1")} />
      </div>
      {/* Catálogo por categoría: WebcamTexture/ObjectTracker jamás aparecen (la cámara solo con permiso explícito). */}
      <div className="grid gap-1 sm:grid-cols-2">
        {resultados === null ? (
          <p className="text-[11px] text-muted-foreground/60">Cargando el catálogo de efectos…</p>
        ) : resultados.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/60">Sin resultados para «{q}».</p>
        ) : (
          resultados.map((e) => (
            <button key={`${e.categoria}:${e.name}`} type="button" title={`${e.name} — ${e.categoria}. ${e.description}`}
              aria-label={`Añadir capa shader con el efecto ${e.name}`} onClick={() => anadirEfecto(e.name)}
              className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg border border-border/40 px-2.5 py-1.5 text-left transition-colors hover:border-primary/40 hover:bg-white/5">
              <span className="min-w-0 flex-1 truncate text-xs font-bold">{e.name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground/60">{e.categoria}</span>
            </button>
          ))
        )}
      </div>
      <button type="button" onClick={anadirDifusion} className={cn(CHIP_OFF, "cursor-pointer border-primary/40 text-primary hover:bg-primary/10")}>
        <Plus className="inline size-3.5" /> Añadir capa de difuminado
      </button>

      {/* Pila de capas shader / difuminado, de arriba a abajo (índice 0 de `background.layers` es la más baja). */}
      <div className="space-y-1.5">
        {fondo.length === 0 && (
          <p className="text-[11px] text-muted-foreground/60">Aún no hay capas shader ni de difuminado: el fondo base sigue debajo, tal y como estaba.</p>
        )}
        {fondo.map((l) => {
          const i = capas.findIndex((x) => x.id === l.id);
          const abierta = selId === l.id;
          const etiqueta = l.kind === "shader" ? `Shader · ${String(l.preset?.components?.[0]?.type ?? "sin efecto")}` : "Difuminado";
          return (
            <div key={l.id} className={cn("rounded-xl border p-2.5", abierta ? "border-primary/50 bg-primary/[0.05]" : "border-border/50")}>
              <div className="flex items-center gap-1.5">
                <button type="button" aria-expanded={abierta} aria-label={`Editar la capa ${etiqueta}`} onClick={() => setSelId(abierta ? null : l.id)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
                  <SlidersHorizontal className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs font-bold">{etiqueta}</span>
                  <span className="hidden shrink-0 text-[10px] text-muted-foreground/60 sm:inline">
                    {l.visible ? `${Math.round(l.opacity * 100)} % · ${l.blend}` : "oculta"}
                  </span>
                </button>
                {i < capas.length - 1 && (
                  <button type="button" title="Mover la capa hacia arriba (encima)" aria-label="Subir capa" onClick={() => setLayers(reorderLayers(capas, i, i + 1))} className={MINI}>
                    <Plus className="size-3.5 -rotate-45" />
                  </button>
                )}
                {i > 0 && (
                  <button type="button" title="Mover la capa hacia abajo (debajo)" aria-label="Bajar capa" onClick={() => setLayers(reorderLayers(capas, i, i - 1))} className={MINI}>
                    <Plus className="size-3.5 rotate-45" />
                  </button>
                )}
                <button type="button" title="Quitar la capa" aria-label="Quitar capa" onClick={() => { setLayers(removeLayer(capas, l.id)); if (abierta) setSelId(null); }} className={MINI}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {abierta && (
                <div className="mt-2 space-y-1.5 border-t border-border/30 pt-2">
                  <label className="flex items-center gap-2 text-[11px]">
                    <span className="w-20 shrink-0 text-muted-foreground/70">Mezcla</span>
                    <select value={l.blend} onChange={(e) => parchear(l.id, { blend: e.target.value as BlendMode })} aria-label="Modo de mezcla de la capa" className={cn(CAT, "flex-1")}>
                      {BLENDS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </label>
                  <Mar e="Opacidad" v={l.opacity} min={0} max={1} step={0.01} on={(n) => parchear(l.id, { opacity: n })} />
                  <label className="flex items-center gap-2 text-[11px]">
                    <span className="w-20 shrink-0 text-muted-foreground/70">Máscara</span>
                    <select value={l.mascara ?? "ninguna"} onChange={(e) => parchear(l.id, { mascara: e.target.value as MascaraKind })} aria-label="Máscara de la capa" className={cn(CAT, "flex-1")}>
                      {(["ninguna", "radial", "lineal"] as const).map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                  <Mar e="Posición X" v={l.transform?.x ?? 0} min={0} max={1} step={0.01} on={(n) => parchearTransform(l.id, { x: n })} />
                  <Mar e="Posición Y" v={l.transform?.y ?? 0} min={0} max={1} step={0.01} on={(n) => parchearTransform(l.id, { y: n })} />
                  <Mar e="Escala" v={l.transform?.escala ?? 1} min={0} max={1} step={0.01} on={(n) => parchearTransform(l.id, { escala: n })} />
                  <Mar e="Rotación" v={l.transform?.rotacion ?? 0} min={-360} max={360} step={1} on={(n) => parchearTransform(l.id, { rotacion: n })} />
                  <Mar e="Ancho" v={l.transform?.ancho ?? 1} min={0} max={1} step={0.01} on={(n) => parchearTransform(l.id, { ancho: n })} />
                  <Mar e="Alto" v={l.transform?.alto ?? 1} min={0} max={1} step={0.01} on={(n) => parchearTransform(l.id, { alto: n })} />
                  {l.kind === "difusion" && l.difusion && (
                    <>
                      <label className="flex items-center gap-2 text-[11px]">
                        <span className="w-20 shrink-0 text-muted-foreground/70">Modo</span>
                        <select value={l.difusion.modo} onChange={(e) => parchearDifusion(l.id, { modo: e.target.value as DifusionConfig["modo"] })} aria-label="Modo del difuminado" className={cn(CAT, "flex-1")}>
                          {(["transparente", "desenfoque", "blanco", "negro", "tono"] as const).map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </label>
                      {l.difusion.modo === "tono" && (
                        <label className="flex items-center gap-2 text-[11px]">
                          <span className="w-20 shrink-0 text-muted-foreground/70">Tono</span>
                          <input type="text" value={l.difusion.tono ?? "#000000"} onChange={(e) => parchearDifusion(l.id, { tono: e.target.value })} aria-label="Color del tono" className={cn(CAT, "flex-1")} />
                        </label>
                      )}
                      <Mar e="Desenfoque" v={l.difusion.desenfoquePx} min={0} max={80} step={1} on={(n) => parchearDifusion(l.id, { desenfoquePx: n })} />
                      <label className="flex items-center gap-2 text-[11px]">
                        <span className="w-20 shrink-0 text-muted-foreground/70">Textura</span>
                        <select value={l.difusion.textura} onChange={(e) => parchearDifusion(l.id, { textura: e.target.value as DifusionConfig["textura"] })} aria-label="Textura del difuminado" className={cn(CAT, "flex-1")}>
                          {(["ninguna", "grano", "papel", "escarcha"] as const).map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </label>
                    </>
                  )}
                  {l.kind === "shader" && <PropsSegunCatalogo capa={l} metadatos={metadatos(String(l.preset?.components?.[0]?.type ?? ""))} onProp={(k, v) => parchearProp(l.id, k, v)} />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Guardar como set (carpeta a elegir) y aplicar al alcance con herencia */}
      <div className="space-y-2 border-t border-border/30 pt-2">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
          <FolderPlus className="size-3" /> Guardar la pila como set
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <input value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del set" aria-label="Nombre del set de fondo" className={cn(CAT, "w-48")} />
          <select value={carpeta} onChange={(e) => setCarpeta(e.target.value)} title="Carpeta de tu Biblioteca donde queda el set" aria-label="Carpeta del set" className={cn(CAT, "max-w-48")}>
            <option value="">Carpeta «Fondos» (raíz)</option>
            {carpetas?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button type="button" disabled={!destino || fondo.length === 0} onClick={() => void guardarComoSet()} title="Guardar la pila completa como set .starseed-fondo.json en la carpeta elegida" className={CHIP_OFF}>
            Guardar como set
          </button>
          {!destino && <span className="text-[10px] text-muted-foreground/60">Entra en tu cuenta para guardar sets.</span>}
        </div>
        <p className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-muted-foreground/70">Se aplica a</span>
          {ALCANCES.map((a) => (
            <button key={a} type="button" aria-pressed={ambito === a} title={`Alcance ${ETIQUETA_ALCANCE[a]} (lo más concreto gana)`} onClick={() => { setAmbito(a); setClave(""); }} className={ambito === a ? CHIP_ON : CHIP_OFF}>
              {ETIQUETA_ALCANCE[a]}
            </button>
          ))}
          {ambito !== "cuenta" && (
            <input value={ambito === "perfil" && !clave ? (props.perfilId ?? "") : clave}
              onChange={(e) => setClave(e.target.value)} placeholder={ambito === "perfil" ? "Perfil" : PUNTERO_CLAVE[ambito] ?? ""}
              aria-label="Clave del alcance" className={cn(CAT, "w-36")} />
          )}
        </p>
        {props.neuronas && props.neuronas.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-muted-foreground/70">Aparatos</span>
            {(["todas", "elegidas"] as const).map((n) => (
              <button key={n} type="button" aria-pressed={neuras === n} onClick={() => setNeuras(n)} title={n === "todas" ? "A todas las neuronas del perfil" : "Solo a las marcadas"} className={neuras === n ? CHIP_ON : CHIP_OFF}>
                {n === "todas" ? "Todas" : "Elegidas"}
              </button>
            ))}
            {neuras === "elegidas" && props.neuronas.map((n) => (
              <label key={n} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border/40 px-2 py-0.5 text-[10px]">
                <input type="checkbox" checked={elegidas.includes(n)} onChange={() => setElegidas((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]))} className="cursor-pointer accent-primary" />
                {n}
              </label>
            ))}
          </p>
        )}
        <button type="button" disabled={fondo.length === 0 || (ambito === "perfil" && !clave && !props.perfilId)}
          onClick={aplicarAlcance} title="Pone la pila en el alcance elegido (lo más concreto gana) y la reparte a las neuronas marcadas" className={CHIP_ON}>
          Aplicar al alcance
        </button>
      </div>
    </div>
  );
}

/** Nombres de los props del efecto según el catálogo de la versión instalada (metadatos del paquete). */
function PropsSegunCatalogo({ capa, metadatos, onProp }: {
  capa: BackgroundLayer; metadatos?: ShaderCatalogEntry; onProp: (k: string, v: string) => void;
}) {
  const comps = capa.preset?.components ?? [];
  if (!comps[0]) {
    return <p className="text-[11px] text-muted-foreground/60">Sin efecto configurado: elige uno del catálogo de arriba.</p>;
  }
  const actuales = comps[0].props;
  // Los metadatos del paquete no tipan cada prop: lectura defensiva de su `default`.
  const defectoDe = (k: string): string | undefined => {
    const meta = metadatos?.props?.[k] as { default?: unknown } | undefined;
    return meta !== undefined && meta.default !== undefined && meta.default !== null ? String(meta.default) : undefined;
  };
  const claves = Object.keys(metadatos?.props ?? {});
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Ajustes del efecto</p>
      {claves.length === 0 ? (
        <p className="text-[10px] text-muted-foreground/60">Este efecto no necesita ajustes (o el catálogo de la versión instalada no los lista).</p>
      ) : (
        claves.map((k) => (
          <label key={k} className="flex items-center gap-2 text-[11px]">
            <span className="w-20 shrink-0 truncate text-muted-foreground/70" title={k}>{k}</span>
            <input value={String(actuales?.[k] ?? "")} onChange={(e) => onProp(k, e.target.value)} aria-label={`Ajuste ${k} del efecto`} placeholder={defectoDe(k)} className={cn(CAT, "flex-1")} />
          </label>
        ))
      )}
    </div>
  );
}
