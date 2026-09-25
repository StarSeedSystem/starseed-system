"use client";

/**
 * useArrastrePanel — arrastrar un panel con ratón, dedo o lápiz (misma API).
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE (causa real del fallo que vio Alex, reproducida en Chromium):
 * las cortinas Trinity llamaban a `setPointerCapture` en CADA pointerdown de la
 * capa de arrastre. Con el puntero capturado por la capa, el navegador entrega
 * el `click` a la capa y no al botón que se pulsó: la X de cierre (y cualquier
 * botón de dentro) dejaba de responder con ratón. En táctil, el panel no
 * declaraba `touch-action`, así que el navegador se quedaba el gesto horizontal
 * y lanzaba `pointercancel`: arrastrar no hacía nada.
 *
 * Aquí la captura solo se toma DESPUÉS de que el gesto demuestre intención
 * (distancia + ángulo), los toques siguen siendo clics y el desplazamiento
 * vertical del contenido nunca se roba. El panel sigue al puntero 1:1 con goma
 * elástica, y al soltar decide por latigazo o por posición proyectada.
 *
 * Todo el movimiento vive en un MotionValue («cerradez»: 0 abierto → 1
 * cerrado): cero renders de React por píxel. La entrada/salida usa
 * `usePresence`, así que funciona dentro de <AnimatePresence> aunque la
 * cortina se cierre desde fuera (FAB, orbe, atajos).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import {
    animate,
    useMotionValue,
    usePresence,
    useTransform,
    type AnimationPlaybackControls,
    type MotionValue,
} from "framer-motion";
import {
    acumularRueda,
    cerradezArrastre,
    decidirDestino,
    decidirRueda,
    deltaRuedaHaciaCierre,
    ejeDe,
    elastico,
    esGestoLateral,
    evaluarIntencion,
    fraccionAbierta,
    haciaCierre,
    instanteDeEvento,
    liberarSesionBorde,
    normalizarDelta,
    origenTransformPanel,
    PAUSA_FIN_RUEDA_MS,
    registrarMuestra,
    sesionBordeActiva,
    signoCierre,
    suscribirSesionBorde,
    transformPanel,
    umbralParaPuntero,
    velocidad,
    type BordeTrinity,
    type EstadoPanel,
    type Intencion,
    type Lado,
    type Muestra,
    type SesionBorde,
} from "@/lib/gestos";
import { inclinacionPanel, resortePanel } from "@/lib/movimiento/transiciones";
import { useNivelMovimiento } from "./use-nivel-movimiento";

const useEfectoDeMaquetacion = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Donde un arrastre NUNCA nace: campos de texto, deslizadores y lo marcado a mano. */
export const SELECTOR_SIN_ARRASTRE =
    "[data-sin-arrastre], input, textarea, select, option, [contenteditable=''], [contenteditable='true'], [role='slider'], [role='scrollbar']";

export interface OpcionesArrastrePanel {
    /** Lado de la pantalla donde vive el panel (hacia donde se cierra). */
    lado: Lado;
    panelRef: RefObject<HTMLElement | null>;
    /** Se llama cuando el panel YA ha salido de la pantalla (animación terminada). */
    onCerrar: () => void;
    /** Nodo Trinity: permite continuar un arrastre que empezó en el borde de la pantalla. */
    borde?: BordeTrinity;
    /** El arrastre solo nace en elementos con `data-agarre-panel` (cabeceras y tiradores). */
    soloAgarres?: boolean;
    /** Deslizar con dos dedos (trackpad) o rueda horizontal mueve el panel. */
    rueda?: boolean;
    /** false = sin gestos (el panel se muestra quieto; p. ej. dock siempre visible). */
    habilitado?: boolean;
    /**
     * Píxeles extra, además del 100 % del panel, para esconder su sombra. La
     * separación real entre el panel y su borde (márgenes, zona segura) se mide
     * y se suma sola.
     */
    margenPx?: number;
    /** Entrar deslizando desde el borde al montarse (por defecto sí). */
    animarEntrada?: boolean;
}

export interface ManejadoresArrastre {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
    onLostPointerCapture: (e: React.PointerEvent<HTMLElement>) => void;
    onClickCapture: (e: React.MouseEvent<HTMLElement>) => void;
}

export interface ArrastrePanel {
    /** 0 = abierto · 1 = fuera de pantalla (puede salirse un poco por la goma). */
    cerradez: MotionValue<number>;
    /** 1 = abierto · 0 = cerrado: para el fondo que se oscurece al arrastrar. */
    fraccion: MotionValue<number>;
    /** Transform CSS listo para `style={{ transform }}`. */
    transform: MotionValue<string>;
    /** `transform-origin` coherente con la inclinación 3D. */
    origen: string;
    /** Cierre animado (botón, Escape, tocar fuera). */
    cerrar: () => void;
    manejadores: ManejadoresArrastre;
}

interface Gesto {
    id: number;
    tipo: string;
    inicio: Muestra;
    muestras: Muestra[];
    intencion: Intencion;
    /** Recorrido hacia el cierre en el instante de aceptar: se descuenta para no dar un salto. */
    base: number;
    cerradezInicial: number;
    tam: number;
    elemento: Element;
}

const ahora = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
/** Instante real del evento (su `timeStamp`), no el de cuando se atiende. */
const instante = (e: { timeStamp?: number }): number => instanteDeEvento(e.timeStamp, ahora());

/** ¿Hay, entre el objetivo y el panel, algo que se desplace en horizontal? Entonces el gesto es suyo. */
function desplazableEnX(desde: Element, raiz: Element): boolean {
    for (let n: Element | null = desde; n && n !== raiz; n = n.parentElement) {
        if (n instanceof HTMLElement && n.scrollWidth > n.clientWidth + 2) {
            const ov = getComputedStyle(n).overflowX;
            if (ov === "auto" || ov === "scroll") return true;
        }
    }
    return false;
}

export function useArrastrePanel(o: OpcionesArrastrePanel): ArrastrePanel {
    const { lado, panelRef, borde, soloAgarres = false, rueda = false, habilitado = true } = o;
    const margenBase = o.margenPx ?? 40;
    const animarEntrada = o.animarEntrada ?? true;
    const eje = ejeDe(lado);
    const nivel = useNivelMovimiento();

    // Refs vivas: los manejadores no se recrean al cambiar props y nunca leen valores viejos.
    const nivelRef = useRef(nivel);
    nivelRef.current = nivel;
    const onCerrarRef = useRef(o.onCerrar);
    onCerrarRef.current = o.onCerrar;
    const habilitadoRef = useRef(habilitado);
    habilitadoRef.current = habilitado;
    const inclinacionRef = useRef(inclinacionPanel(nivel));
    inclinacionRef.current = inclinacionPanel(nivel);

    const cerradez = useMotionValue(animarEntrada ? 1 : 0);
    const fraccion = useTransform(cerradez, fraccionAbierta);
    // Margen hasta salir de pantalla: sombra + distancia real al borde (se mide al montar).
    const margenRef = useRef(margenBase);
    const transform = useTransform(cerradez, (c: number) => transformPanel(lado, c, margenRef.current, inclinacionRef.current));

    const [presente, quitarSeguro] = usePresence();
    const arrastrandoRef = useRef(false);
    const gestoRef = useRef<Gesto | null>(null);
    const animacionRef = useRef<AnimationPlaybackControls | null>(null);
    const tamRef = useRef(0);
    const cerrandoRef = useRef(false);
    const suprimirClicRef = useRef(false);

    const medir = useCallback((): number => {
        const panel = panelRef.current;
        if (panel) {
            // offset* ignoran transforms (la inclinación 3D encogería el rect). Para un
            // panel `fixed`, offsetLeft/Top se miden desde el viewport.
            const medida = eje === "x" ? panel.offsetWidth : panel.offsetHeight;
            if (medida > 0) {
                const vw = typeof window !== "undefined" ? window.innerWidth : 0;
                const vh = typeof window !== "undefined" ? window.innerHeight : 0;
                const hueco = lado === "izquierda"
                    ? panel.offsetLeft
                    : lado === "arriba"
                        ? panel.offsetTop
                        : lado === "derecha"
                            ? vw - panel.offsetLeft - panel.offsetWidth
                            : vh - panel.offsetTop - panel.offsetHeight;
                margenRef.current = margenBase + Math.max(0, Number.isFinite(hueco) ? hueco : 0);
                tamRef.current = medida + margenRef.current;
            }
        }
        return tamRef.current || margenRef.current || 1;
    }, [eje, lado, margenBase, panelRef]);

    // «Arrastrando» se marca en el DOM (atributo `data-arrastrando`), no en el
    // estado de React: re-renderizar el contenido del panel justo al empezar el
    // gesto era el peor momento posible para gastar un fotograma.
    const marcarArrastre = useCallback((v: boolean) => {
        if (arrastrandoRef.current === v) return;
        arrastrandoRef.current = v;
        const panel = panelRef.current;
        if (!panel) return;
        if (v) panel.setAttribute("data-arrastrando", "");
        else panel.removeAttribute("data-arrastrando");
    }, [panelRef]);

    const detenerAnimacion = useCallback(() => {
        animacionRef.current?.stop();
        animacionRef.current = null;
    }, []);

    const avisarCierre = useCallback(() => {
        if (cerrandoRef.current) return;
        cerrandoRef.current = true;
        onCerrarRef.current();
    }, []);

    /** Lleva el panel a un estado con resorte (conservando la inercia del gesto). */
    const irA = useCallback((destino: EstadoPanel, velocidadHaciaCierre: number, alTerminar?: () => void) => {
        const objetivo = destino === "cerrado" ? 1 : 0;
        if (destino === "abierto") cerrandoRef.current = false;
        detenerAnimacion();
        const fin = () => {
            alTerminar?.();
            if (destino === "cerrado") avisarCierre();
        };
        const resorte = resortePanel(nivelRef.current);
        if (!resorte) {
            cerradez.set(objetivo);
            fin();
            return;
        }
        const tam = tamRef.current || medir();
        animacionRef.current = animate(cerradez, objetivo, {
            ...resorte,
            velocity: (velocidadHaciaCierre * 1000) / Math.max(1, tam),
            restDelta: 0.0015,
            restSpeed: 0.02,
            onComplete: fin,
        });
    }, [avisarCierre, cerradez, detenerAnimacion, medir]);

    const cerrar = useCallback(() => irA("cerrado", 0), [irA]);

    // ── Arrastre desde el borde de la pantalla (la cortina aún no existía) ──
    const seguirSesion = useCallback((s: SesionBorde) => {
        // Medir fuerza una maquetación: en cada movimiento basta con la medida guardada.
        const tam = s.fase === "arrastrando" && tamRef.current ? tamRef.current : medir();
        const d = haciaCierre(lado, s.actual.x - s.inicio.x, s.actual.y - s.inicio.y);
        const c = cerradezArrastre("cerrado", d, tam);
        if (s.fase === "arrastrando") {
            detenerAnimacion();
            cerradez.set(c / tam);
            marcarArrastre(true);
            return;
        }
        liberarSesionBorde(s.id);
        marcarArrastre(false);
        if (s.fase === "cancelada") {
            irA("cerrado", 0);
            return;
        }
        cerradez.set(c / tam);
        const v = velocidad(s.muestras, eje, 100) * signoCierre(lado);
        const umbral = s.umbralAperturaPx ? Math.min(0.5, s.umbralAperturaPx / tam) : 0.3;
        irA(decidirDestino({ origen: "cerrado", recorrido: tam - c, velocidad: -v, tam, umbralCambio: umbral }), v);
    }, [cerradez, detenerAnimacion, eje, irA, lado, marcarArrastre, medir]);

    // ── Entrada: desde una sesión de borde o deslizando desde fuera ──
    useEfectoDeMaquetacion(() => {
        medir();
        const sesion = borde ? sesionBordeActiva(borde, ahora()) : null;
        if (sesion) {
            seguirSesion(sesion);
            return;
        }
        if (!animarEntrada) return;
        const resorte = resortePanel(nivelRef.current);
        if (!resorte) {
            cerradez.set(0);
            return;
        }
        animacionRef.current = animate(cerradez, 0, { ...resorte, restDelta: 0.0015, restSpeed: 0.02 });
        return () => detenerAnimacion();
        // Solo al montar: la sesión posterior llega por la suscripción de abajo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!borde) return;
        return suscribirSesionBorde((s) => {
            if (s.borde === borde) seguirSesion(s);
        });
    }, [borde, seguirSesion]);

    // ── Salida controlada por <AnimatePresence> (cierre desde fuera) ──
    // Solo reacciona a CAMBIOS de presencia: al montarse manda la entrada (o la sesión de borde).
    const presenteAntesRef = useRef(presente);
    useEffect(() => {
        const antes = presenteAntesRef.current;
        presenteAntesRef.current = presente;
        if (presente === antes) return;
        if (presente) {
            // Reabierto mientras salía: vuelve a su sitio.
            if (!arrastrandoRef.current && !gestoRef.current) irA("abierto", 0);
            return;
        }
        gestoRef.current = null;
        marcarArrastre(false);
        cerrandoRef.current = true; // el padre ya decidió cerrar: no volver a avisar
        if (cerradez.get() >= 0.999) {
            quitarSeguro?.();
            return;
        }
        irA("cerrado", 0, () => quitarSeguro?.());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [presente]);

    useEffect(() => () => detenerAnimacion(), [detenerAnimacion]);

    // ── Rueda / trackpad (escritorio) ──
    useEffect(() => {
        const panel = panelRef.current;
        if (!rueda || eje !== "x" || !panel) return;
        let acumulado = 0;
        let tam = 0;
        let temporizador: number | undefined;
        const alRodar = (ev: WheelEvent) => {
            if (!habilitadoRef.current || gestoRef.current || cerrandoRef.current) return;
            const dx = normalizarDelta(ev.deltaX, ev.deltaMode);
            const dy = normalizarDelta(ev.deltaY, ev.deltaMode);
            if (acumulado === 0) {
                if (!esGestoLateral(dx, dy)) return;
                if (ev.target instanceof Element && desplazableEnX(ev.target, panel)) return;
                tam = medir();
                detenerAnimacion();
            }
            acumulado = acumularRueda(acumulado, deltaRuedaHaciaCierre(lado, dx, dy), tam);
            cerradez.set((acumulado < 0 ? elastico(acumulado, tam) : acumulado) / tam);
            window.clearTimeout(temporizador);
            temporizador = window.setTimeout(() => {
                const destino = decidirRueda(acumulado, tam);
                acumulado = 0;
                irA(destino, 0);
            }, PAUSA_FIN_RUEDA_MS);
        };
        panel.addEventListener("wheel", alRodar, { passive: true });
        return () => {
            panel.removeEventListener("wheel", alRodar);
            window.clearTimeout(temporizador);
        };
    }, [cerradez, detenerAnimacion, eje, irA, lado, medir, panelRef, rueda]);

    // ── Táctil en paneles laterales: reclamar el gesto horizontal ──
    // `touch-action: pan-y` del panel NO basta: cada contenedor con scroll de
    // dentro (el carril del Centro de Control, la lista de Horizon…) vuelve a
    // empezar la cuenta de `touch-action`, y Chrome se quedaba el deslizamiento
    // horizontal (pointercancel) o incluso lo convertía en «atrás» del historial
    // (visto en Chromium real: la página navegó a about:blank). Este oyente,
    // limitado al panel y solo mientras hay un gesto candidato, cancela el
    // desplazamiento nativo cuando el movimiento es claramente horizontal. El
    // vertical nunca se toca: el contenido se sigue desplazando con el dedo.
    useEffect(() => {
        const panel = panelRef.current;
        if (eje !== "x" || !panel) return;
        const alMoverDedo = (ev: TouchEvent) => {
            const g = gestoRef.current;
            if (!g || g.tipo !== "touch" || !ev.cancelable) return;
            const t = ev.touches[0];
            if (!t) return;
            const dx = Math.abs(t.clientX - g.inicio.x);
            const dy = Math.abs(t.clientY - g.inicio.y);
            if (g.intencion === "aceptada" || (g.intencion === "pendiente" && dx >= 4 && dx > dy * 1.5)) {
                ev.preventDefault();
            }
        };
        panel.addEventListener("touchmove", alMoverDedo, { passive: false });
        return () => panel.removeEventListener("touchmove", alMoverDedo);
    }, [eje, panelRef]);

    // ── Pointer Events: ratón, dedo y lápiz por el mismo camino ──
    const soltarCaptura = (g: Gesto) => {
        try {
            if (g.elemento.hasPointerCapture?.(g.id)) g.elemento.releasePointerCapture(g.id);
        } catch {
            /* el navegador ya la soltó */
        }
    };

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
        // Cada pulsación nueva es otra interacción: nunca hereda la supresión del
        // clic del arrastre anterior (si no, un toque rápido en la X tras soltar
        // un arrastre que volvió a su sitio se perdía).
        suprimirClicRef.current = false;
        if (!habilitadoRef.current || gestoRef.current || cerrandoRef.current) return;
        if (!e.isPrimary && e.pointerType !== "mouse") return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const objetivo = e.target instanceof Element ? e.target : null;
        const panel = panelRef.current;
        if (!objetivo || !panel || objetivo.closest(SELECTOR_SIN_ARRASTRE)) return;
        if (soloAgarres && !objetivo.closest("[data-agarre-panel]")) return;
        if (eje === "x" && desplazableEnX(objetivo, panel)) return;
        const m: Muestra = { x: e.clientX, y: e.clientY, t: instante(e) };
        // La captura (cuando llegue) va al agarre si lo hay: el contenedor puede ser
        // `pointer-events: none` (el dock) y un elemento así no debe retener el puntero.
        const agarre = soloAgarres ? objetivo.closest("[data-agarre-panel]") : null;
        // Sin captura todavía: si esto acaba siendo un toque, el clic llega intacto a su botón.
        gestoRef.current = {
            id: e.pointerId,
            tipo: e.pointerType,
            inicio: m,
            muestras: [m],
            intencion: "pendiente",
            base: 0,
            cerradezInicial: cerradez.get(),
            tam: 0,
            elemento: agarre ?? e.currentTarget,
        };
    }, [cerradez, eje, panelRef, soloAgarres]);

    const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
        const g = gestoRef.current;
        if (!g || e.pointerId !== g.id) return;
        const m: Muestra = { x: e.clientX, y: e.clientY, t: instante(e) };
        const dx = m.x - g.inicio.x;
        const dy = m.y - g.inicio.y;
        if (g.intencion === "pendiente") {
            g.intencion = evaluarIntencion(eje, dx, dy, { umbralPx: umbralParaPuntero(g.tipo) });
            if (g.intencion === "rechazada") {
                gestoRef.current = null; // era desplazamiento del contenido: todo suyo
                return;
            }
            if (g.intencion === "pendiente") return;
            // Intención confirmada: AHORA sí, captura (el arrastre sigue aunque salga del panel).
            g.tam = medir();
            g.base = haciaCierre(lado, dx, dy);
            g.cerradezInicial = cerradez.get();
            detenerAnimacion();
            try {
                g.elemento.setPointerCapture(e.pointerId);
            } catch {
                /* sin captura el gesto sigue funcionando dentro del panel */
            }
            try {
                window.getSelection?.()?.removeAllRanges();
            } catch {
                /* noop */
            }
            marcarArrastre(true);
        }
        g.muestras = registrarMuestra(g.muestras, m);
        const recorrido = g.cerradezInicial * g.tam + haciaCierre(lado, dx, dy) - g.base;
        cerradez.set(cerradezArrastre("abierto", recorrido, g.tam) / g.tam);
    }, [cerradez, detenerAnimacion, eje, lado, marcarArrastre, medir]);

    const onPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
        const g = gestoRef.current;
        if (!g || e.pointerId !== g.id) return;
        gestoRef.current = null;
        if (g.intencion !== "aceptada") return; // fue un toque: el clic es de su botón
        soltarCaptura(g);
        marcarArrastre(false);
        // El clic que el navegador emite al soltar tras arrastrar no debe activar nada.
        suprimirClicRef.current = true;
        window.setTimeout(() => {
            suprimirClicRef.current = false;
        }, 400);
        const t = instante(e);
        const ultima = g.muestras[g.muestras.length - 1];
        const muestras = ultima && (ultima.x !== e.clientX || ultima.y !== e.clientY)
            ? registrarMuestra(g.muestras, { x: e.clientX, y: e.clientY, t })
            : g.muestras;
        const v = velocidad(muestras, eje, 100, t) * signoCierre(lado);
        const c = cerradez.get() * g.tam;
        irA(decidirDestino({ origen: "abierto", recorrido: c, velocidad: v, tam: g.tam }), v);
    }, [cerradez, eje, irA, lado, marcarArrastre]);

    const onPointerCancel = useCallback((e: React.PointerEvent<HTMLElement>) => {
        const g = gestoRef.current;
        if (!g || e.pointerId !== g.id) return;
        gestoRef.current = null;
        if (g.intencion !== "aceptada") return;
        soltarCaptura(g);
        marcarArrastre(false);
        irA("abierto", 0); // el sistema se quedó el gesto: el panel vuelve a su sitio
    }, [irA, marcarArrastre]);

    const onLostPointerCapture = useCallback((e: React.PointerEvent<HTMLElement>) => {
        const g = gestoRef.current;
        // `lostpointercapture` burbujea: al capturar en el panel, el dedo pierde su
        // captura IMPLÍCITA en el hijo que tocó y ese aviso sube hasta aquí. Solo
        // cuenta si quien pierde la captura es el elemento que la tomó.
        if (g && g.intencion === "aceptada" && e.pointerId === g.id && e.target === g.elemento) onPointerCancel(e);
    }, [onPointerCancel]);

    const onClickCapture = useCallback((e: React.MouseEvent<HTMLElement>) => {
        if (!suprimirClicRef.current) return;
        suprimirClicRef.current = false;
        e.preventDefault();
        e.stopPropagation();
    }, []);

    return {
        cerradez,
        fraccion,
        transform,
        origen: origenTransformPanel(lado),
        cerrar,
        manejadores: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture, onClickCapture },
    };
}
