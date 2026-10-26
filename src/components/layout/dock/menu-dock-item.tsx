"use client";

/**
 * MenuDockItem — las opciones de un icono del dock (Ola 1025U · V1a).
 * ─────────────────────────────────────────────────────────────────────────────
 * Se abre al MANTENER PRESIONADO un icono (sin arrastrar), con clic derecho o con la
 * tecla Menú / Mayús+F10. Cristal líquido StarSeed, iconos de Lucide, filas de 44 px
 * y 360 px de ancho como máximo (en un móvil de 360 px, ocupa el ancho con 8 px de aire).
 *
 *   · Acciones rápidas de ESA app (catálogo real: `@/lib/dock/acciones-rapidas`).
 *   · Abrir · Abrir en ventana nueva · Información.
 *   · Mover en el dock (con flechas) · meter/sacar de una carpeta.
 *   · Cambiar diseño de este icono · Plantillas de iconos del perfil (V1b los atiende;
 *     mientras nadie lo haga, el menú dice «Próximamente» y no finge).
 *   · Quitar del dock (con deshacer; los accesos fundamentales no se pueden quitar).
 *
 * Se carga a demanda (React.lazy desde el OmniDock): el dock vive en el layout raíz y
 * este menú —con el catálogo de apps— no debe engordar el paquete inicial.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { createPortal } from "react-dom";
import {
  Activity, AppWindow, ArrowLeft, Antenna, Atom, Award, Bell, BookOpen, BookUser, Boxes, Bot, Brain, Calendar,
  Camera, Cast, CheckCheck, Compass, Download, ExternalLink, Eye, EyeOff, FlaskConical, FolderInput, FolderOutput,
  Gauge, Images, Info, LayoutGrid, LayoutTemplate, Library, Lightbulb, Mail, Map, MessageSquarePlus, Mic,
  MoveHorizontal, Network, Palette, PenLine, Pencil, Plus, Radio, RefreshCw, Replace, RotateCw, Rss, Search,
  Settings, ShieldCheck, Smile, Sparkles, Upload, User, Users, Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  accionesRapidasDe,
  rutaBase,
  tieneAccionesPropias,
  type AccionRapida,
  type IconoAccion,
} from "@/lib/dock/acciones-rapidas";
import { pedirDisenoIcono, pedirPlantillas } from "@/lib/dock/eventos-dock";
import { APP_CATALOG } from "@/components/dashboard/apps/app-catalog";
import { DOCK_ICON_MAP, DOCK_FALLBACK_ICON, type DockFolderConfig, type DockItemConfig } from "../dock-config";
import { ejecutarAccion } from "./acciones-internas";
import type { RectMenu } from "./use-gesto-dock";

/** Lucide por nombre: el catálogo de acciones es puro y solo guarda el nombre. */
export const ICONOS_ACCION: Record<IconoAccion, LucideIcon> = {
  Plus, Search, Upload, Library, RefreshCw, Download, Palette, ShieldCheck, Bell, CheckCheck, Calendar, Users, Map,
  MessageSquarePlus, Settings, Mail, Radio, Antenna, Camera, Images, Brain, Network, PenLine, Sparkles, Cast,
  LayoutGrid, Wrench, Mic, FlaskConical, Gauge, Smile, Bot, Replace, BookOpen, BookUser, User, Award, Activity,
  Lightbulb, Compass, Boxes, Rss, Pencil, Atom, Eye, RotateCw,
};

/** Accesos que ninguna edición rápida puede quitar (invariantes del núcleo: `src/lib/nucleo/invariantes.ts`). */
export const ACCESOS_FUNDAMENTALES: Record<string, string> = {
  settings: "Ajustes es la salida de seguridad del sistema: tiene que seguir a un gesto de distancia.",
  mylib: "La Biblioteca es desde donde se instala y se desinstala: tiene que seguir a mano.",
  hub: "El Hub es la entrada a la red: tiene que seguir a mano.",
};

const ACENTO: Record<string, string> = {
  neutral: "text-foreground/80",
  cyan: "text-cyan-300",
  crimson: "text-red-300",
  amber: "text-amber-300",
  emerald: "text-emerald-300",
  purple: "text-purple-300",
};

const ANCHO_MAX = 360;
const MARGEN = 8;
const SEPARACION = 12;

export interface MenuDockItemProps {
  item: DockItemConfig;
  ancla: RectMenu;
  /** Carpeta del dock que contiene el icono (si está dentro de una). */
  carpeta?: DockFolderConfig;
  /** Carpetas activas a las que se puede mandar el icono. */
  carpetas: DockFolderConfig[];
  pathname: string;
  navegar: (ruta: string) => void;
  /** `devolverFoco` = false cuando la acción abre algo que debe quedarse con el foco. */
  alCerrar: (devolverFoco?: boolean) => void;
  alQuitar: () => void;
  alMover: () => void;
  alMeterEnCarpeta: (carpetaId: string) => void;
  alSacarDeCarpeta: () => void;
}

function Fila({
  icono: Icono, etiqueta, detalle, onClick, deshabilitada, peligro, ...resto
}: {
  icono: LucideIcon;
  etiqueta: string;
  detalle?: string;
  onClick: () => void;
  deshabilitada?: boolean;
  peligro?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={deshabilitada || undefined}
      onClick={() => { if (!deshabilitada) onClick(); }}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm outline-none",
        "transition-colors duration-150 motion-reduce:transition-none",
        "focus-visible:ring-2 focus-visible:ring-white/60",
        deshabilitada
          ? "cursor-not-allowed opacity-55"
          : cn("cursor-pointer", peligro ? "text-rose-300 hover:bg-rose-500/15 focus-visible:bg-rose-500/15" : "hover:bg-foreground/10 focus-visible:bg-foreground/10"),
      )}
      {...resto}
    >
      <Icono className="size-[18px] shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium leading-tight">{etiqueta}</span>
        {detalle && <span className="mt-0.5 block text-[11px] leading-snug text-foreground/60">{detalle}</span>}
      </span>
    </button>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={titulo} className="px-1 py-1">
      <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/50" aria-hidden>{titulo}</p>
      {children}
    </div>
  );
}

/** Qué es este acceso: la ficha del catálogo de apps si existe; si no, su ruta, dicha con honestidad. */
function describir(item: DockItemConfig): { que: string; origen: string } {
  const base = rutaBase(item.path);
  const app = APP_CATALOG.find((a) => a.open.route === base);
  return {
    que: app?.description ?? `Acceso directo del dock a ${item.path}.`,
    origen: item.origin === "user" ? "Creado por ti" : "Predeterminado de StarSeed",
  };
}

export default function MenuDockItem({
  item, ancla, carpeta, carpetas, pathname, navegar, alCerrar, alQuitar, alMover, alMeterEnCarpeta, alSacarDeCarpeta,
}: MenuDockItemProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [entrado, setEntrado] = useState(false);
  const [vista, setVista] = useState<"menu" | "info">("menu");
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const Icono = DOCK_ICON_MAP[item.iconKey] ?? DOCK_FALLBACK_ICON;
  const acciones = useMemo(() => accionesRapidasDe(item.id, { pathname }), [item.id, pathname]);
  const propias = tieneAccionesPropias(item.id);
  const motivoProtegido = ACCESOS_FUNDAMENTALES[item.id];
  const destinos = carpetas.filter((f) => f.id !== carpeta?.id);
  const info = useMemo(() => describir(item), [item]);

  // Entrada: opacidad + transform en 180 ms (sin animar nada más).
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntrado(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Foco al primer elemento al abrir (o al volver de la ficha de información).
  useEffect(() => {
    const primero = panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    primero?.focus();
  }, [vista]);

  // Posición: encima del icono (el dock está abajo); si no cabe, debajo. Sin salirse de la pantalla.
  const posicion = useMemo((): { left: number; width: number; maxHeight: number; top?: number; bottom?: number } => {
    const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
    const vh = typeof window === "undefined" ? 768 : window.innerHeight;
    const ancho = Math.min(ANCHO_MAX, vw - MARGEN * 2);
    const centro = ancla.left + ancla.width / 2;
    const izq = Math.max(MARGEN, Math.min(vw - ancho - MARGEN, centro - ancho / 2));
    const espacioArriba = ancla.top - SEPARACION - MARGEN;
    const arriba = espacioArriba >= 260 || espacioArriba >= vh - (ancla.top + ancla.height) - SEPARACION - MARGEN;
    return arriba
      ? { left: izq, width: ancho, bottom: vh - ancla.top + SEPARACION, maxHeight: Math.max(160, espacioArriba) }
      : { left: izq, width: ancho, top: ancla.top + ancla.height + SEPARACION, maxHeight: Math.max(160, vh - (ancla.top + ancla.height) - SEPARACION - MARGEN) };
  }, [ancla]);

  const alTeclear = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    if (!panel) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (vista === "info") setVista("menu");
      else alCerrar(true);
      return;
    }
    const filas = Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'));
    if (filas.length === 0) return;
    const i = filas.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); filas[(i + 1 + filas.length) % filas.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); filas[(i - 1 + filas.length) % filas.length].focus(); }
    else if (e.key === "Home") { e.preventDefault(); filas[0].focus(); }
    else if (e.key === "End") { e.preventDefault(); filas[filas.length - 1].focus(); }
    else if (e.key === "Tab") { e.preventDefault(); filas[(i + (e.shiftKey ? -1 : 1) + filas.length) % filas.length].focus(); }
  }, [alCerrar, vista]);

  const lanzar = useCallback(async (a: AccionRapida) => {
    setOcupado(true);
    setEstado(null);
    const r = await ejecutarAccion(a, navegar);
    setOcupado(false);
    if (a.destino.tipo === "funcion" && r.mensaje) {
      // Las funciones dicen qué pasó (y si falló, el menú sigue abierto para reintentar).
      setEstado({ ok: r.ok, texto: r.mensaje });
      if (r.ok && a.id === "escritorios.nuevo") alCerrar(false);
      return;
    }
    alCerrar(false);
  }, [alCerrar, navegar]);

  const pedirDiseno = () => {
    if (pedirDisenoIcono(item.id)) alCerrar(false);
    else setEstado({ ok: false, texto: "Próximamente: el diseño de iconos aún no está disponible en esta versión. Tu icono no ha cambiado." });
  };
  const pedirPlantilla = () => {
    if (pedirPlantillas()) alCerrar(false);
    else setEstado({ ok: false, texto: "Próximamente: las plantillas de iconos del perfil aún no están disponibles en esta versión." });
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Telón invisible: tocar fuera cierra el menú sin activar lo que haya debajo. */}
      <div
        data-dock-menu-telon=""
        className="fixed inset-0 z-[88] cursor-default bg-black/20"
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); alCerrar(true); }}
        onContextMenu={(e) => e.preventDefault()}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="menu"
        aria-label={`Opciones de ${item.label}`}
        aria-orientation="vertical"
        data-dock-menu=""
        onKeyDown={alTeclear}
        onContextMenu={(e) => e.preventDefault()}
        // `position: fixed` en línea: `.glass-edge` (globals.css) pone `position: relative` y le gana a la clase `fixed`
        // de Tailwind; el menú se quedaba relativo al dock y medio fuera de la pantalla (visto en localhost:9002).
        style={{ position: "fixed", left: posicion.left, width: posicion.width, maxHeight: posicion.maxHeight, ...(posicion.bottom !== undefined ? { bottom: posicion.bottom } : { top: posicion.top }) }}
        className={cn(
          "fixed z-[89] flex flex-col overflow-hidden rounded-3xl",
          "glass-depth glass-edge border border-foreground/15 bg-card/60 text-foreground backdrop-blur-3xl dark:bg-black/55",
          "shadow-[0_18px_60px_rgba(0,0,0,0.45)]",
          "transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
          entrado ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.98] opacity-0 motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:opacity-100",
        )}
      >
        {/* Cabecera: qué icono es */}
        <div className="flex items-center gap-3 border-b border-foreground/10 px-4 py-3">
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-full bg-foreground/10 ring-1 ring-inset ring-foreground/15", ACENTO[item.color] ?? ACENTO.neutral)}>
            <Icono className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold leading-tight">{item.label}</span>
            <span className="block truncate text-[11px] text-foreground/60">{carpeta ? `En la carpeta «${carpeta.label}»` : "En tu dock"}</span>
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
          {vista === "info" ? (
            <div className="px-3 pb-2 pt-1">
              <Fila icono={ArrowLeft} etiqueta="Volver a las opciones" onClick={() => setVista("menu")} />
              <dl className="mt-1 space-y-2.5 px-3 py-2 text-sm">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/50">Qué es</dt>
                  <dd className="mt-0.5 leading-snug">{info.que}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/50">Ruta</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs">{item.path}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/50">Origen</dt>
                  <dd className="mt-0.5">{info.origen}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/50">Acciones rápidas</dt>
                  <dd className="mt-0.5">{propias ? `${acciones.length} propias de esta app` : "Las genéricas (esta app aún no tiene propias)"}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <>
              <Seccion titulo="Acciones rápidas">
                {acciones.map((a) => {
                  const I = ICONOS_ACCION[a.icono];
                  return <Fila key={a.id} icono={I} etiqueta={a.etiqueta} onClick={() => void lanzar(a)} deshabilitada={ocupado} data-accion={a.id} />;
                })}
              </Seccion>
              <div className="mx-4 h-px bg-foreground/10" aria-hidden />
              <Seccion titulo="Este acceso">
                <Fila icono={ExternalLink} etiqueta="Abrir" onClick={() => { navegar(item.path); alCerrar(false); }} />
                <Fila
                  icono={AppWindow}
                  etiqueta="Abrir en ventana nueva"
                  onClick={() => { try { window.open(item.path, "_blank", "noopener"); } catch { /* bloqueada */ } alCerrar(false); }}
                />
                <Fila icono={Info} etiqueta="Información" onClick={() => setVista("info")} />
                <Fila icono={MoveHorizontal} etiqueta="Mover en el dock" detalle="Con las flechas ← → · Intro suelta, Esc cancela" onClick={() => { alCerrar(false); alMover(); }} />
                {carpeta && (
                  <Fila icono={FolderOutput} etiqueta={`Sacar de «${carpeta.label}»`} onClick={() => { alSacarDeCarpeta(); alCerrar(true); }} />
                )}
                {destinos.map((f) => (
                  <Fila key={f.id} icono={FolderInput} etiqueta={`Meter en «${f.label}»`} onClick={() => { alMeterEnCarpeta(f.id); alCerrar(true); }} />
                ))}
              </Seccion>
              <div className="mx-4 h-px bg-foreground/10" aria-hidden />
              <Seccion titulo="Diseño">
                <Fila icono={Palette} etiqueta="Cambiar diseño de este icono" onClick={pedirDiseno} />
                <Fila icono={LayoutTemplate} etiqueta="Plantillas de iconos del perfil" onClick={pedirPlantilla} />
              </Seccion>
              <div className="mx-4 h-px bg-foreground/10" aria-hidden />
              <div className="px-1 py-1">
                <Fila
                  icono={EyeOff}
                  etiqueta="Quitar del dock"
                  detalle={motivoProtegido ?? "Podrás deshacerlo, o devolverlo desde «Personalizar dock»."}
                  peligro={!motivoProtegido}
                  deshabilitada={!!motivoProtegido}
                  onClick={() => { alQuitar(); alCerrar(false); }}
                />
              </div>
            </>
          )}
        </div>

        <p
          role="status"
          aria-live="polite"
          className={cn(
            "border-t border-foreground/10 px-4 py-2 text-[12px] leading-snug",
            estado ? (estado.ok ? "text-emerald-300" : "text-amber-300") : "hidden",
          )}
        >
          {estado?.texto}
        </p>
      </div>
    </>,
    document.body,
  );
}
