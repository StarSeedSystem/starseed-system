"use client";
/**
 * Ventana de la orbe 4D de la Protomolécula (Ola 1026P · PRO1026P1). Lo principal ya no son los ajustes de la orbe
 * sino CREAR: se le puede pedir cualquier cosa a Astraura sin salir de lo que tienes delante, con herramientas que
 * cambian con el contexto, el gobierno de la entidad a la vista y todo con teclado.
 *
 *   · «Crear» (abre por defecto) · «Controles» (el panel completo) · «Vínculos» (mandos) · «Gobierno» (solo si lo que
 *     tienes delante es, o cuelga de, un grupo, una comunidad o una página).
 *   · «⋯» → «Apariencia» (geometría, estilo y apagar la orbe: lo de antes, oculto) y «Abrir lienzo».
 *
 * Cristal líquido de la marca, dianas de 44 px, Tab entre pestañas (y flechas), Enter envía, Esc cierra.
 * Bajo 640 px es una hoja inferior fija dentro de la pantalla.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Atom, Cable, Ellipsis, ExternalLink, Landmark, Palette, SlidersHorizontal, WandSparkles, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FICHAS, type Estilo, type IdForma } from "@/lib/protomolecula/orbe4d/coreografia";
import { entidadGobernante } from "./ventana/contexto";
import { PestanaApariencia } from "./ventana/pestana-apariencia";
import { PestanaCrear } from "./ventana/pestana-crear";
import { PestanaGobierno } from "./ventana/pestana-gobierno";
import type { PestanaVentana } from "./ventana/tipos";
import { useContextoVentana } from "./ventana/use-contexto-ventana";

const PanelCompleto = dynamic(
  () => import("@/components/protomolecula/panel-protomolecula").then((m) => m.PanelProtomoleculaAutonomo),
  { ssr: false, loading: () => <p className="px-1 py-3 text-xs text-white/60">Abriendo la Protomolécula…</p> },
);

const PestanaVinculos = dynamic(() => import("./ventana/pestana-vinculos"), {
  ssr: false,
  loading: () => <p className="px-1 py-3 text-xs text-white/60">Abriendo los mandos…</p>,
});

export interface PanelOrbeProps {
  forma: IdForma;
  fijada: IdForma | null;
  estilo: Estilo;
  moleculaId?: string;
  completoInicial?: boolean;
  /** Ruta de la pantalla (si se omite, la del navegador): de ella se deduce el contexto cuando nadie lo anuncia. */
  ruta?: string;
  alElegirForma: (f: IdForma | null) => void;
  alElegirEstilo: (e: Estilo) => void;
  alAbrirLienzo: () => void;
  alApagar: () => void;
  alCerrar: () => void;
  /** Dónde se abre respecto a la orbe. */
  lado: { horizontal: "izquierda" | "derecha"; vertical: "arriba" | "abajo" };
}

interface DefPestana { id: Exclude<PestanaVentana, "apariencia">; nombre: string; Icono: LucideIcon }
const PESTANAS_BASE: DefPestana[] = [
  { id: "crear", nombre: "Crear", Icono: WandSparkles },
  { id: "controles", nombre: "Controles", Icono: SlidersHorizontal },
  { id: "vinculos", nombre: "Vínculos", Icono: Cable },
];
const PESTANA_GOBIERNO: DefPestana = { id: "gobierno", nombre: "Gobierno", Icono: Landmark };

export function PanelOrbe(p: PanelOrbeProps) {
  const ficha = FICHAS[p.forma];
  const contexto = useContextoVentana(p.ruta);
  const hayGobierno = Boolean(entidadGobernante(contexto));
  const pestanas = hayGobierno ? [...PESTANAS_BASE, PESTANA_GOBIERNO] : PESTANAS_BASE;

  const inicial: PestanaVentana = p.completoInicial ? "controles" : "crear";
  const [vista, setVista] = useState<PestanaVentana>(inicial);
  const [anterior, setAnterior] = useState<PestanaVentana>("crear");
  // Las pestañas ya visitadas siguen montadas (ocultas): lo escrito, el plan a medias y los mandos no se pierden al cambiar.
  const [visitadas, setVisitadas] = useState<ReadonlySet<PestanaVentana>>(() => new Set([inicial]));
  const [menu, setMenu] = useState(false);
  const idBase = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const botonMenu = useRef<HTMLButtonElement>(null);
  const itemsMenu = useRef<(HTMLButtonElement | null)[]>([]);

  const vistaRef = useRef(vista);
  vistaRef.current = vista;

  const ir = useCallback((destino: PestanaVentana) => {
    setMenu(false);
    // «Volver» desde Apariencia regresa a la pestaña de la que se venía.
    if (destino === "apariencia" && vistaRef.current !== "apariencia") setAnterior(vistaRef.current);
    vistaRef.current = destino;
    setVista(destino);
    setVisitadas((s) => (s.has(destino) ? s : new Set(s).add(destino)));
  }, []);

  // Astraura (o el lienzo) pueden pedir abrir directamente una molécula: a Controles.
  useEffect(() => { if (p.completoInicial) ir("controles"); }, [p.completoInicial, p.moleculaId, ir]);

  // Si lo que tienes delante deja de tener gobierno, la pestaña «Gobierno» desaparece y no te deja en el vacío.
  useEffect(() => { if (vista === "gobierno" && !hayGobierno) setVista("crear"); }, [vista, hayGobierno]);
  // Al abrirse, el foco entra en la ventana (teclado completo).
  useEffect(() => { raiz.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { if (menu) itemsMenu.current[0]?.focus(); }, [menu]);

  const cerrarMenu = useCallback((devolverFoco: boolean) => { setMenu(false); if (devolverFoco) botonMenu.current?.focus(); }, []);

  const alTecladoVentana = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    if (menu) { cerrarMenu(true); return; }
    p.alCerrar();
  };

  const alTecladoPestanas = (e: React.KeyboardEvent) => {
    const pasos: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    const i = pestanas.findIndex((t) => t.id === vista);
    let destino: number | null = null;
    if (e.key in pasos) destino = (Math.max(i, 0) + pasos[e.key] + pestanas.length) % pestanas.length;
    else if (e.key === "Home") destino = 0;
    else if (e.key === "End") destino = pestanas.length - 1;
    if (destino === null) return;
    e.preventDefault();
    const t = pestanas[destino];
    ir(t.id);
    raiz.current?.querySelector<HTMLElement>(`[data-pestana="${t.id}"]`)?.focus();
  };

  const alTecladoMenu = (e: React.KeyboardEvent) => {
    const items = itemsMenu.current.filter(Boolean) as HTMLButtonElement[];
    const i = items.findIndex((x) => x === document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === "Tab") setMenu(false);
  };

  const idPestana = (id: string) => `${idBase}-tab-${id}`;
  const idPanel = (id: string) => `${idBase}-panel-${id}`;
  const panel = (id: PestanaVentana, hijo: React.ReactNode) =>
    visitadas.has(id) && (
      <div
        key={id}
        role="tabpanel"
        id={idPanel(id)}
        aria-labelledby={id === "apariencia" ? undefined : idPestana(id)}
        aria-label={id === "apariencia" ? "Apariencia de la orbe" : undefined}
        hidden={vista !== id}
        className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      >
        {hijo}
      </div>
    );

  return (
    <div
      ref={raiz}
      role="dialog"
      aria-label="Protomolécula"
      tabIndex={-1}
      onKeyDown={alTecladoVentana}
      className={cn(
        "absolute z-[1001] w-[min(26rem,calc(100vw-2rem))] rounded-3xl border border-white/10 p-4 text-white outline-none",
        "bg-[#0A0F1D]/80 backdrop-blur-[16px] shadow-lg shadow-black/40 [box-shadow:inset_0_1px_0_rgba(255,255,255,0.15)]",
        "animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none",
        "sm:max-h-[min(40rem,calc(100dvh-2rem))] sm:overflow-y-auto",
        p.lado.horizontal === "izquierda" ? "right-full mr-3" : "left-full ml-3",
        p.lado.vertical === "arriba" ? "bottom-0" : "top-0",
        // <640 px: junto a la orbe no cabe (a 360 px se salía 61 px por la derecha). Hoja inferior fija,
        // dentro de la pantalla, con su propio desplazamiento.
        "max-sm:fixed max-sm:inset-x-3 max-sm:top-auto max-sm:bottom-[max(0.75rem,env(safe-area-inset-bottom))]",
        "max-sm:m-0 max-sm:w-auto max-sm:max-h-[72dvh] max-sm:overflow-y-auto",
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="sticky -top-4 z-10 -mx-4 -mt-4 rounded-t-3xl bg-[#0A0F1D]/90 px-4 pb-2 pt-4 backdrop-blur-[16px]">
        <div className="flex items-start gap-2">
          <Atom className="mt-1 h-5 w-5 shrink-0 text-[#10B981]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-headline text-base font-semibold leading-tight tracking-wide">Protomolécula</p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/70">
              <span className="text-[#00F0FF]">{ficha.nombre}</span> · {ficha.sentido}
            </p>
          </div>
          <div className="relative">
            <button
              ref={botonMenu}
              type="button"
              aria-label="Más opciones"
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => (menu ? cerrarMenu(false) : setMenu(true))}
              className={cn(
                "grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80",
                (menu || vista === "apariencia") && "bg-white/10 text-white",
              )}
            >
              <Ellipsis className="h-5 w-5" aria-hidden="true" />
            </button>
            {menu && (
              <div
                role="menu"
                aria-label="Más opciones de la Protomolécula"
                onKeyDown={alTecladoMenu}
                className="absolute right-0 top-full z-20 mt-1 w-56 rounded-2xl border border-white/10 bg-[#0A0F1D]/95 p-1 shadow-lg shadow-black/50 backdrop-blur-[16px]"
              >
                <button
                  ref={(el) => { itemsMenu.current[0] = el; }}
                  type="button"
                  role="menuitem"
                  onClick={() => ir("apariencia")}
                  className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
                >
                  <Palette className="h-4 w-4 text-[#00F0FF]" aria-hidden="true" />
                  Apariencia
                </button>
                <button
                  ref={(el) => { itemsMenu.current[1] = el; }}
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenu(false); p.alAbrirLienzo(); }}
                  className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
                >
                  <ExternalLink className="h-4 w-4 text-[#00F0FF]" aria-hidden="true" />
                  Abrir lienzo
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={p.alCerrar}
            className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80"
            aria-label="Cerrar el panel de la Protomolécula"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {vista === "apariencia" ? (
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => ir(anterior)}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-medium text-white/80 transition-colors duration-150 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver
            </button>
            <p className="font-headline text-sm font-semibold tracking-wide">Apariencia</p>
          </div>
        ) : (
          <div role="tablist" aria-label="Secciones de la Protomolécula" onKeyDown={alTecladoPestanas} className="mt-1 flex gap-1 rounded-full border border-white/10 bg-white/5 p-1">
            {pestanas.map(({ id, nombre, Icono }) => {
              const activa = vista === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={idPestana(id)}
                  data-pestana={id}
                  aria-selected={activa}
                  aria-controls={visitadas.has(id) ? idPanel(id) : undefined}
                  title={nombre}
                  onClick={() => ir(id)}
                  className={cn(
                    "inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80",
                    activa ? "flex-1 bg-[#007FFF]/25 text-white" : "text-white/70 hover:bg-white/10 hover:text-white sm:flex-1",
                  )}
                >
                  <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className={cn(!activa && "max-sm:sr-only")}>{nombre}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-3">
        {panel("crear", <PestanaCrear contexto={contexto} alAbrirLienzo={p.alAbrirLienzo} irAPestana={ir} />)}
        {panel(
          "controles",
          <div className="max-h-[50vh] overflow-auto rounded-2xl border border-white/10 bg-black/20 p-2">
            <PanelCompleto compacto moleculaId={p.moleculaId} />
          </div>,
        )}
        {panel("vinculos", <PestanaVinculos moleculaId={p.moleculaId} irAPestana={ir} />)}
        {hayGobierno && panel("gobierno", <PestanaGobierno contexto={contexto} />)}
        {panel(
          "apariencia",
          <PestanaApariencia fijada={p.fijada} estilo={p.estilo} alElegirForma={p.alElegirForma} alElegirEstilo={p.alElegirEstilo} alApagar={p.alApagar} />,
        )}
      </div>
    </div>
  );
}
