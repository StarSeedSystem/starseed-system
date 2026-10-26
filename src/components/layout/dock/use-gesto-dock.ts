"use client";

/**
 * useGestoDock — mantener presionado, arrastrar y reordenar los iconos del dock (Ola 1025U · V1a).
 * ─────────────────────────────────────────────────────────────────────────────
 * Un solo controlador para los tres caminos del mismo gesto:
 *
 *   · MANTENER Y SOLTAR  → abre el menú de opciones del icono (`menu`).
 *   · MANTENER Y ARRASTRAR → reordena el carril con vista previa del hueco; soltar
 *     sobre una carpeta mete el icono dentro. Solo `transform` y `opacity`.
 *   · TECLADO → menú contextual (tecla Menú o Mayús+F10) y, desde el menú, «Mover en
 *     el dock»: ← → mueven el icono levantado, Intro lo suelta y Esc lo devuelve.
 *
 * La geometría y el reordenado son funciones puras (`@/lib/dock/orden-dock`); aquí solo
 * se mide el DOM, se pinta el desplazamiento y se avisa a quien guarda (`guardarItems`
 * / `guardarCarpetas`: el almacén existente que viaja con la cuenta).
 *
 * Cada celda del carril lleva `data-dock-celda="<id>"` y `data-dock-carril="raiz|<carpeta>"`
 * (las carpetas, además, `data-dock-carpeta="<id>"`); el controlador solo habla con ellas.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import {
  aterrizaje,
  construirEntradas,
  claveEntrada,
  desplazamientosDeHueco,
  meterEnCarpeta,
  objetivoDeSoltar,
  pasoDeHueco,
  posicionEnRaiz,
  reordenarEnCarpeta,
  reordenarRaiz,
  type CeldaMedida,
} from "@/lib/dock/orden-dock";
import type { FaseGesto, ResultadoGesto } from "@/lib/dock/pulsacion-larga";
import { leerNivelMovimiento } from "@/lib/movimiento/nivel";
import type { DockFolderConfig, DockItemConfig } from "../dock-config";
import { usePulsacionLarga } from "./use-pulsacion-larga";

export const CARRIL_RAIZ = "raiz";
/** Duración de la animación de soltar (dentro de los 150–300 ms de la guía de diseño). */
export const MS_ASENTAR = 200;
/** Margen del borde del carril donde el arrastre lo desplaza solo. */
const BORDE_AUTODESPLAZAR_PX = 44;
const VELOCIDAD_MAX_PX = 14;

export interface RectMenu {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface MenuDock {
  itemId: string;
  carril: string;
  ancla: RectMenu;
}

/** Lo que el dock necesita para pintar un arrastre en curso. */
export interface ArrastreVisual {
  id: string;
  carril: string;
  modo: "puntero" | "teclado";
  fase: "arrastrando" | "soltando";
  /** Desplazamiento X (px) de cada celda que cede su sitio, por clave. */
  desplazos: Record<string, number>;
  /** Carpeta sobre la que está el puntero (soltar = meter dentro). */
  carpeta: string | null;
}

interface Sesion {
  clave: string;
  carril: string;
  modo: "puntero" | "teclado";
  celdas: CeldaMedida[];
  origen: number;
  destino: number;
  carpeta: string | null;
  paso: number;
  x0: number;
  /** Último puntero conocido (para repetir el cálculo al desplazar el carril solo). */
  ultimoX: number;
  el: HTMLElement | null;
  asentando: boolean;
}

export interface OpcionesGestoDock {
  stripRef: React.RefObject<HTMLDivElement | null>;
  items: DockItemConfig[];
  folders: DockFolderConfig[];
  guardarItems: (next: DockItemConfig[]) => void;
  guardarCarpetas: (next: DockFolderConfig[]) => void;
  /** false = el dock está cerrado o hay algo que lo bloquea. */
  habilitado: boolean;
  /** Para recalcular las sombras de «hay más» cuando el arrastre desplaza el carril. */
  alDesplazarCarril?: () => void;
}

function vibrar() {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* opcional */
  }
}

const esc = (s: string) => s.replace(/(["\\])/g, "\\$1");

export function useGestoDock(op: OpcionesGestoDock) {
  const opRef = useRef(op);
  opRef.current = op;

  const [menu, setMenu] = useState<MenuDock | null>(null);
  const [levantado, setLevantado] = useState<string | null>(null);
  const [arrastre, setArrastre] = useState<ArrastreVisual | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const sesion = useRef<Sesion | null>(null);
  const suprimirClic = useRef(false);
  const temporizadorClic = useRef<ReturnType<typeof setTimeout> | null>(null);
  const temporizadorAsentar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raf = useRef<number | null>(null);
  const botonFoco = useRef<string | null>(null);
  /** `pointerId` del gesto, para capturar el puntero en el carril al empezar a arrastrar. */
  const capturaId = useRef<number | null>(null);
  /** Celda arrastrada cuyo estilo imperativo se limpia en el efecto de layout (ver `limpiarSesion`). */
  const pendienteLimpiar = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = pendienteLimpiar.current;
    if (arrastre !== null || !el) return;
    pendienteLimpiar.current = null;
    el.style.transform = "";
    el.style.transition = "";
    el.removeAttribute("data-dock-arrastrando");
  }, [arrastre]);

  // ── Utilidades de DOM ────────────────────────────────────────────────────
  const celdaEl = useCallback((clave: string): HTMLElement | null => {
    const strip = opRef.current.stripRef.current;
    return strip ? strip.querySelector<HTMLElement>(`[data-dock-celda="${esc(clave)}"]`) : null;
  }, []);

  const rectDe = (el: HTMLElement): RectMenu => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };

  const etiquetaDe = (itemId: string) => opRef.current.items.find((i) => i.id === itemId)?.label ?? itemId;

  const medir = useCallback((carril: string): CeldaMedida[] => {
    const strip = opRef.current.stripRef.current;
    if (!strip) return [];
    const sr = strip.getBoundingClientRect();
    const els = Array.from(strip.querySelectorAll<HTMLElement>(`[data-dock-celda][data-dock-carril="${esc(carril)}"]`));
    return els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        clave: el.dataset.dockCelda ?? "",
        izq: r.left - sr.left + strip.scrollLeft,
        ancho: r.width,
        ...(el.dataset.dockCarpeta ? { carpeta: el.dataset.dockCarpeta } : {}),
      };
    });
  }, []);

  const contenidoX = (clientX: number): number => {
    const strip = opRef.current.stripRef.current;
    if (!strip) return clientX;
    return clientX - strip.getBoundingClientRect().left + strip.scrollLeft;
  };

  // ── Clic: lo que sigue a una pulsación larga o a un arrastre NO es un clic ──
  const marcarSuprimirClic = useCallback(() => {
    suprimirClic.current = true;
    if (temporizadorClic.current) clearTimeout(temporizadorClic.current);
    temporizadorClic.current = setTimeout(() => {
      suprimirClic.current = false;
    }, 450);
  }, []);
  const limpiarSuprimirClic = useCallback(() => {
    suprimirClic.current = false;
    if (temporizadorClic.current) clearTimeout(temporizadorClic.current);
    temporizadorClic.current = null;
  }, []);

  // ── Menú ────────────────────────────────────────────────────────────────
  const abrirMenu = useCallback((itemId: string) => {
    const el = celdaEl(itemId);
    if (!el) return;
    botonFoco.current = itemId;
    setMenu({ itemId, carril: el.dataset.dockCarril ?? CARRIL_RAIZ, ancla: rectDe(el) });
  }, [celdaEl]);

  const cerrarMenu = useCallback((devolverFoco = true) => {
    setMenu(null);
    const id = botonFoco.current;
    botonFoco.current = null;
    if (devolverFoco && id) {
      // El menú se desmonta primero; el foco vuelve al botón del icono en el siguiente cuadro.
      requestAnimationFrame?.(() => celdaEl(id)?.querySelector<HTMLElement>("button")?.focus());
    }
  }, [celdaEl]);

  // ── Autodesplazar el carril mientras se arrastra cerca de sus bordes ─────
  const pararAuto = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame?.(raf.current);
    raf.current = null;
  }, []);

  const recalcular = useCallback((s: Sesion) => {
    const px = contenidoX(s.ultimoX);
    const dx = px - s.x0;
    if (s.el) s.el.style.transform = `translate3d(${dx}px,0,0) scale(1.08)`;
    const t = objetivoDeSoltar(s.celdas, s.origen, px, s.carril === CARRIL_RAIZ);
    if (t.destino !== s.destino || t.carpeta !== s.carpeta) {
      s.destino = t.destino;
      s.carpeta = t.carpeta;
      const d = desplazamientosDeHueco(s.celdas.length, s.origen, t.carpeta ? s.origen : t.destino, s.paso);
      const desplazos: Record<string, number> = {};
      s.celdas.forEach((c, i) => {
        if (d[i]) desplazos[c.clave] = d[i];
      });
      setArrastre((a) => (a && a.id === s.clave ? { ...a, desplazos, carpeta: t.carpeta } : a));
    }
  }, []);

  const bucleAuto = useCallback(() => {
    const s = sesion.current;
    const strip = opRef.current.stripRef.current;
    if (!s || s.modo !== "puntero" || s.asentando || !strip || typeof requestAnimationFrame !== "function") {
      raf.current = null;
      return;
    }
    const r = strip.getBoundingClientRect();
    let v = 0;
    if (s.ultimoX < r.left + BORDE_AUTODESPLAZAR_PX) v = -Math.min(1, (r.left + BORDE_AUTODESPLAZAR_PX - s.ultimoX) / BORDE_AUTODESPLAZAR_PX);
    else if (s.ultimoX > r.right - BORDE_AUTODESPLAZAR_PX) v = Math.min(1, (s.ultimoX - (r.right - BORDE_AUTODESPLAZAR_PX)) / BORDE_AUTODESPLAZAR_PX);
    if (v !== 0) {
      const antes = strip.scrollLeft;
      strip.scrollLeft = antes + v * VELOCIDAD_MAX_PX;
      if (strip.scrollLeft !== antes) {
        recalcular(s);
        opRef.current.alDesplazarCarril?.();
      }
    }
    raf.current = requestAnimationFrame(bucleAuto);
  }, [recalcular]);

  // ── Fin de la sesión ───────────────────────────────────────────────────
  const limpiarSesion = useCallback(() => {
    const s = sesion.current;
    pararAuto();
    if (temporizadorAsentar.current) clearTimeout(temporizadorAsentar.current);
    temporizadorAsentar.current = null;
    // El estilo del icono arrastrado se limpia en un efecto de layout, EN LA MISMA confirmación
    // que el nuevo orden: si se limpiara aquí, React aún no habría movido la celda y se vería
    // un fotograma con el icono de vuelta en su sitio antes de saltar al hueco.
    if (s?.el) pendienteLimpiar.current = s.el;
    opRef.current.stripRef.current?.classList.remove("omni-dock-strip--dragging");
    sesion.current = null;
    setArrastre(null);
    setLevantado(null);
  }, [pararAuto]);

  const confirmar = useCallback((s: Sesion) => {
    const { items, folders, guardarItems, guardarCarpetas } = opRef.current;
    if (s.carpeta && s.carril === CARRIL_RAIZ) {
      const siguiente = meterEnCarpeta(folders, s.carpeta, s.clave);
      if (siguiente !== folders) guardarCarpetas(siguiente);
      setAnuncio(`«${etiquetaDe(s.clave)}» guardado dentro de la carpeta.`);
    } else if (s.destino !== s.origen) {
      if (s.carril === CARRIL_RAIZ) {
        const siguiente = reordenarRaiz(items, folders, s.clave, s.destino);
        if (siguiente !== items) guardarItems(siguiente);
        const pos = posicionEnRaiz(siguiente, folders, s.clave);
        setAnuncio(pos ? `«${etiquetaDe(s.clave)}» ahora está en la posición ${pos.posicion} de ${pos.total}.` : "");
      } else {
        const siguiente = reordenarEnCarpeta(folders, items, s.carril, s.clave, s.destino);
        if (siguiente !== folders) guardarCarpetas(siguiente);
        setAnuncio(`«${etiquetaDe(s.clave)}» ahora está en la posición ${s.destino + 1} de ${s.celdas.length} de la carpeta.`);
      }
    }
    limpiarSesion();
  }, [limpiarSesion]);

  /** Suelta con animación (arrastre de puntero) o al instante (teclado / sin movimiento). */
  const soltar = useCallback((s: Sesion, cancelar: boolean) => {
    if (s.asentando) return;
    pararAuto();
    const sinAnimar = s.modo === "teclado" || leerNivelMovimiento() === "minimo" || !s.el;
    if (cancelar) {
      s.destino = s.origen;
      s.carpeta = null;
    }
    const entraEnCarpeta = !!s.carpeta && !cancelar;
    if (sinAnimar || entraEnCarpeta) {
      confirmar(s);
      return;
    }
    // Animación de aterrizaje: solo `transform`, 200 ms, hasta el hueco final.
    s.asentando = true;
    const dx = aterrizaje(s.celdas, s.origen, s.destino);
    if (s.el) {
      s.el.style.transition = `transform ${MS_ASENTAR}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
      s.el.style.transform = `translate3d(${dx}px,0,0) scale(1)`;
    }
    setArrastre((a) => (a ? { ...a, fase: "soltando" } : a));
    temporizadorAsentar.current = setTimeout(() => confirmar(s), MS_ASENTAR + 20);
  }, [confirmar, pararAuto]);

  // ── Empezar un arrastre (puntero o teclado) ──────────────────────────────
  const empezarSesion = useCallback((clave: string, modo: "puntero" | "teclado", clientX: number): boolean => {
    const el = celdaEl(clave);
    if (!el) return false;
    const carril = el.dataset.dockCarril ?? CARRIL_RAIZ;
    const celdas = medir(carril);
    const origen = celdas.findIndex((c) => c.clave === clave);
    if (origen < 0 || celdas.length < 1) return false;
    const paso = pasoDeHueco(celdas, origen);
    const px = modo === "puntero" ? contenidoX(clientX) : celdas[origen].izq + celdas[origen].ancho / 2;
    sesion.current = {
      clave, carril, modo, celdas, origen, destino: origen, carpeta: null, paso,
      x0: px, ultimoX: clientX, el, asentando: false,
    };
    el.setAttribute("data-dock-arrastrando", "1");
    el.style.transition = "none";
    el.style.transform = "translate3d(0,0,0) scale(1.08)";
    opRef.current.stripRef.current?.classList.add("omni-dock-strip--dragging");
    setArrastre({ id: clave, carril, modo, fase: "arrastrando", desplazos: {}, carpeta: null });
    return true;
  }, [celdaEl, medir]);

  // ── Gesto de puntero ────────────────────────────────────────────────────
  const claveDe = useCallback((e: React.PointerEvent<HTMLElement>): string | null => {
    if (sesion.current) return null; // ya hay un arrastre o un aterrizaje en curso
    const t = e.target instanceof Element ? e.target : null;
    const celda = t?.closest<HTMLElement>("[data-dock-celda]");
    if (!celda || celda.dataset.dockPulsable === "0") return null;
    return celda.dataset.dockCelda ?? null;
  }, []);

  const larga = usePulsacionLarga<string>({
    habilitado: op.habilitado,
    claveDe,
    alActivar: (clave) => {
      setLevantado(clave);
      marcarSuprimirClic();
      vibrar();
      setAnuncio(`«${etiquetaDe(clave)}» levantado. Suelta para ver sus opciones o arrástralo para moverlo.`);
    },
    alEmpezarArrastre: (clave, punto) => {
      if (empezarSesion(clave, "puntero", punto.x)) {
        const s = sesion.current;
        try {
          opRef.current.stripRef.current?.setPointerCapture?.(capturaId.current ?? 0);
        } catch {
          /* sin captura el arrastre sigue dentro del carril */
        }
        if (s) {
          s.ultimoX = punto.x;
          if (typeof requestAnimationFrame === "function" && raf.current === null) raf.current = requestAnimationFrame(bucleAuto);
        }
        setLevantado(null);
        marcarSuprimirClic();
        setAnuncio(`Moviendo «${etiquetaDe(clave)}».`);
      }
    },
    alMover: (_clave, punto) => {
      const s = sesion.current;
      if (!s || s.modo !== "puntero" || s.asentando) return;
      s.ultimoX = punto.x;
      recalcular(s);
    },
    alTerminar: (clave, resultado: ResultadoGesto) => {
      if (resultado === "toque") {
        limpiarSuprimirClic();
        setLevantado(null);
        return;
      }
      if (resultado === "pulsacion") {
        marcarSuprimirClic();
        setLevantado(null);
        abrirMenu(clave);
        return;
      }
      const s = sesion.current;
      marcarSuprimirClic();
      if (s && s.clave === clave && s.modo === "puntero") soltar(s, resultado === "cancelado");
      else {
        setLevantado(null);
      }
    },
  });

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>): FaseGesto => {
    limpiarSuprimirClic();
    capturaId.current = e.pointerId;
    return larga.manejadores.onPointerDown(e);
  }, [larga.manejadores, limpiarSuprimirClic]);

  // Con el gesto activo, el movimiento es del icono: no debe bajar el dock ni desplazar el carril.
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>): FaseGesto => {
    const f = larga.manejadores.onPointerMove(e);
    if (f === "activa" || f === "arrastrando") e.stopPropagation();
    return f;
  }, [larga.manejadores]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLElement>): FaseGesto => {
    try {
      opRef.current.stripRef.current?.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ya soltado */
    }
    return larga.manejadores.onPointerUp(e);
  }, [larga.manejadores]);

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLElement>): FaseGesto => {
    return larga.manejadores.onPointerCancel(e);
  }, [larga.manejadores]);

  const onClickCapture = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!suprimirClic.current) return;
    suprimirClic.current = false;
    e.stopPropagation();
    e.preventDefault();
  }, []);

  // ── Teclado ──────────────────────────────────────────────────────────────
  const iniciarMovimientoTeclado = useCallback((itemId: string) => {
    if (sesion.current) return;
    if (!empezarSesion(itemId, "teclado", 0)) return;
    celdaEl(itemId)?.querySelector<HTMLElement>("button")?.focus();
    // `empezarSesion` acaba de rellenar la sesión (TypeScript no lo ve a través de la función).
    const s = sesion.current as Sesion | null;
    const pos = s ? `${s.origen + 1} de ${s.celdas.length}` : "";
    setAnuncio(`«${etiquetaDe(itemId)}» levantado en la posición ${pos}. Usa las flechas izquierda y derecha para moverlo, Intro para soltarlo y Escape para cancelar.`);
  }, [celdaEl, empezarSesion]);

  const moverConTeclado = useCallback((s: Sesion, delta: -1 | 1) => {
    const destino = Math.max(0, Math.min(s.celdas.length - 1, s.destino + delta));
    if (destino === s.destino) return;
    s.destino = destino;
    const d = desplazamientosDeHueco(s.celdas.length, s.origen, destino, s.paso);
    const desplazos: Record<string, number> = {};
    s.celdas.forEach((c, i) => {
      if (d[i]) desplazos[c.clave] = d[i];
    });
    if (s.el) {
      s.el.style.transition = `transform ${leerNivelMovimiento() === "minimo" ? 0 : MS_ASENTAR}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
      s.el.style.transform = `translate3d(${aterrizaje(s.celdas, s.origen, destino)}px,0,0) scale(1.08)`;
      s.el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }
    setArrastre((a) => (a && a.id === s.clave ? { ...a, desplazos } : a));
    setAnuncio(`Posición ${destino + 1} de ${s.celdas.length}.`);
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    const s = sesion.current;
    if (s && s.modo === "teclado") {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        moverConTeclado(s, e.key === "ArrowLeft" ? -1 : 1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        soltar(s, false);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        soltar(s, true);
        setAnuncio("Movimiento cancelado.");
      } else if (e.key === "Tab") {
        soltar(s, true);
      }
      return;
    }
    const celda = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-dock-celda]") : null;
    if (!celda || celda.dataset.dockPulsable === "0") return;
    if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      const id = celda.dataset.dockCelda;
      if (id) abrirMenu(id);
    }
  }, [abrirMenu, moverConTeclado, soltar]);

  const onContextMenu = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const celda = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-dock-celda]") : null;
    if (!celda || celda.dataset.dockPulsable === "0") return;
    // Siempre se anula el menú del navegador (en el dedo, el del sistema pisaría al nuestro).
    e.preventDefault();
    // Con una pulsación en curso (dedo) el menú lo abre el propio gesto al soltar.
    if (larga.fase() !== "inactivo" || sesion.current) return;
    const id = celda.dataset.dockCelda;
    if (id) abrirMenu(id);
  }, [abrirMenu, larga]);

  const onBlur = useCallback((e: React.FocusEvent<HTMLElement>) => {
    const s = sesion.current;
    if (!s || s.modo !== "teclado") return;
    if (e.relatedTarget instanceof Node && opRef.current.stripRef.current?.contains(e.relatedTarget)) return;
    soltar(s, true);
  }, [soltar]);

  // ── Efectos: dedo, Escape del arrastre y limpieza ────────────────────────
  useEffect(() => {
    const strip = op.stripRef.current;
    if (!strip) return;
    // Con la pulsación activa el dedo ya no desplaza el carril: el gesto es del icono.
    const alMoverDedo = (ev: TouchEvent) => {
      const f = larga.fase();
      if ((f === "activa" || f === "arrastrando") && ev.cancelable) ev.preventDefault();
    };
    strip.addEventListener("touchmove", alMoverDedo, { passive: false });
    return () => strip.removeEventListener("touchmove", alMoverDedo);
  }, [larga, op.stripRef, op.habilitado]);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const s = sesion.current;
      if (!s || s.modo !== "puntero" || e.key !== "Escape") return;
      e.preventDefault();
      larga.cancelar();
      soltar(s, true);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [larga, soltar]);

  // Si el dock se cierra o se deshabilita a mitad de gesto, todo vuelve a su sitio.
  useEffect(() => {
    if (op.habilitado) return;
    larga.cancelar();
    limpiarSesion();
    setMenu(null);
  }, [larga, limpiarSesion, op.habilitado]);

  useEffect(() => () => {
    pararAuto();
    if (temporizadorClic.current) clearTimeout(temporizadorClic.current);
    if (temporizadorAsentar.current) clearTimeout(temporizadorAsentar.current);
  }, [pararAuto]);

  const manejadoresCarril = useMemo(
    () => ({ onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture, onKeyDown, onContextMenu, onBlur }),
    [onBlur, onClickCapture, onContextMenu, onKeyDown, onPointerCancel, onPointerDown, onPointerMove, onPointerUp],
  );

  /** Estilo de desplazamiento de una celda que cede su sitio al arrastrado (undefined = quieta). */
  const desplazamientoDe = useCallback((clave: string, carril: string): number | undefined => {
    if (!arrastre || arrastre.carril !== carril || clave === arrastre.id) return undefined;
    return arrastre.desplazos[clave] ?? 0;
  }, [arrastre]);

  return {
    menu,
    abrirMenu,
    cerrarMenu,
    levantado,
    arrastre,
    anuncio,
    setAnuncio,
    desplazamientoDe,
    manejadoresCarril,
    iniciarMovimientoTeclado,
    /** Fase del gesto de puntero (para que el resto del carril sepa cuándo apartarse). */
    faseGesto: larga.fase,
    /** Anula una pulsación que aún espera (p. ej. porque el carril empezó a desplazarse). */
    cancelarPulsacion: larga.cancelar,
  };
}

/** Reexportado para quien necesite las entradas con sus claves (pruebas, anuncios). */
export { construirEntradas, claveEntrada };
