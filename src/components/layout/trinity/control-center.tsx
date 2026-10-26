"use client";

/**
 * Centro de Control (Logic · derecha · ámbar). Rediseño de la Ola 1025U.
 * ─────────────────────────────────────────────────────────────────────────────
 *   · Cabecera con el símbolo del nodo y el estado vivo de este aparato (batería y red si el navegador
 *     las da, neurona, sesión) y, mientras se graba, una franja para volver a la grabación.
 *   · Barra de secciones con pestañas de Radix: flechas, Inicio y Fin, y se desliza con el dedo.
 *     Secciones: Inicio · Grabar · Atmósfera · Conexiones · Alertas · Sistema. Cada persona puede
 *     reordenarlas u ocultarlas (config.controlCenter) con el botón de la barra.
 *   · Un único carril con desplazamiento (C1/C2, Adendas 63 §15 y 66 §14): el panel nunca excede el
 *     viewport y lo que no cabe se desliza, con sombras y flechas que avisan de que hay más.
 *   · Animaciones de 150–300 ms solo con `transform` y `opacity`, y nada se mueve con
 *     `prefers-reduced-motion`.
 * La lógica pura (orden, ocultas, chips) vive en `logic/`; la grabadora, en `src/lib/grabacion/`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Bell, ChevronDown, ChevronUp, LayoutGrid, Settings, Sparkles, Video, Wifi, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePerimeter } from "@/context/perimeter-context";
import { useAppearance } from "@/context/appearance-context";
import { useFullscreen } from "@/hooks/useFullscreen";
import { usePerfilDispositivo } from "@/hooks/use-perfil-dispositivo";
import { usePanelCortina } from "./panel-cortina";
import { CONTROL_CENTER_NAVIGATE_EVENT, tomarSeccionPendiente, type ControlCenterNavigateDetail } from "./control-center-events";
import { SystemTab } from "./tabs/system-tab";
import { QuickSettingsTab } from "./tabs/quick-settings-tab";
import { SmartHomeTab } from "./tabs/smart-home-tab";
import { NotificationsTab } from "./tabs/notifications-tab";
// Adenda 98: administración de conexiones de la neurona (red externa + malla).
import { ConnectionsTab } from "./tabs/connections-tab";
import { FlorDeLaVida } from "./horizon/flor-de-la-vida";
import { BarraSecciones, type SeccionBarra } from "./logic/barra-secciones";
import { CabeceraControl } from "./logic/cabecera-control";
import { OrganizadorSecciones } from "./logic/organizador-secciones";
import { SeccionGrabar } from "./logic/grabar/seccion-grabar";
import { ORDEN_POR_DEFECTO, alternarOculto, moverModulo, resolverOrden, seccionInicial } from "./logic/orden-modulos";
import { useEstadoAparato } from "./logic/use-estado-aparato";
import { useGrabadora } from "./logic/use-grabadora";
import { useNoLeidas } from "./logic/use-no-leidas";

/**
 * Catálogo de secciones. El ORDEN real se decide en runtime a partir de `config.controlCenter.moduleOrder`
 * (ver `logic/orden-modulos.ts`) y las ocultas se filtran con `config.controlCenter.hiddenModules`.
 * Los ids son los de siempre (`system`, `quick`, `conexiones`, `home`, `notif`) más `grabar`.
 */
interface Seccion {
    id: string;
    rotulo: string;
    icono: LucideIcon;
    Contenido: React.ComponentType;
}

const SECCIONES: Seccion[] = [
    { id: "quick", rotulo: "Inicio", icono: LayoutGrid, Contenido: QuickSettingsTab },
    { id: "grabar", rotulo: "Grabar", icono: Video, Contenido: SeccionGrabar },
    { id: "home", rotulo: "Atmósfera", icono: Sparkles, Contenido: SmartHomeTab },
    // Adenda 98: conexiones de la neurona (red externa · malla P2P · modo dual).
    { id: "conexiones", rotulo: "Conexiones", icono: Wifi, Contenido: ConnectionsTab },
    { id: "notif", rotulo: "Alertas", icono: Bell, Contenido: NotificationsTab },
    { id: "system", rotulo: "Sistema", icono: Settings, Contenido: SystemTab },
];

/** Los ids del catálogo y los del orden de fábrica tienen que ser los mismos (lo comprueba una prueba). */
export const IDS_SECCIONES: readonly string[] = SECCIONES.map((s) => s.id);

export function ControlCenter() {
    const { setActiveEdge } = usePerimeter();
    const { isFullscreen, toggle: toggleFullscreen, isSupported } = useFullscreen();
    const { config, updateSection } = useAppearance();
    const { entrada } = usePerfilDispositivo();
    const aparato = useEstadoAparato();
    const { estado: grabadora } = useGrabadora();
    const noLeidas = useNoLeidas();
    const [editorOpen, setEditorOpen] = useState(false);
    const [avisoOrganizador, setAvisoOrganizador] = useState<string | null>(null);

    const orden = useMemo(() => resolverOrden(config.controlCenter?.moduleOrder), [config.controlCenter?.moduleOrder]);
    const ocultos = useMemo(() => new Set(config.controlCenter?.hiddenModules ?? []), [config.controlCenter?.hiddenModules]);

    const visibles = useMemo(
        () =>
            orden
                .filter((id) => !ocultos.has(id))
                .map((id) => SECCIONES.find((s) => s.id === id))
                .filter((s): s is Seccion => Boolean(s)),
        [orden, ocultos],
    );
    const idsVisibles = useMemo(() => visibles.map((s) => s.id), [visibles]);

    // Se abre en «Inicio» (si se ve); si la activa se oculta, cae a la primera visible: nunca sin sección.
    const [activeTab, setActiveTab] = useState<string>(() => seccionInicial(idsVisibles));
    useEffect(() => {
        if (!idsVisibles.includes(activeTab)) setActiveTab(idsVisibles[0] ?? "quick");
        // Solo reacciona si la sección activa deja de estar disponible.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idsVisibles]);

    // Al montarse, si alguien abrió la cortina para ir a una sección concreta (p. ej. «Grabar»), va a ella.
    useEffect(() => {
        const pendiente = tomarSeccionPendiente();
        if (pendiente && idsVisibles.includes(pendiente)) setActiveTab(pendiente);
        // Solo al montar.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Puente: otras secciones (p. ej. «Atmósfera del fondo» en Inicio) piden navegar a una concreta
    // sin acoplarse a este componente.
    useEffect(() => {
        const onNavigate = (e: Event) => {
            const detail = (e as CustomEvent<ControlCenterNavigateDetail>).detail;
            if (detail?.tab && idsVisibles.includes(detail.tab)) setActiveTab(detail.tab);
        };
        window.addEventListener(CONTROL_CENTER_NAVIGATE_EVENT, onNavigate);
        return () => window.removeEventListener(CONTROL_CENTER_NAVIGATE_EVENT, onNavigate);
    }, [idsVisibles]);

    // Dentro de la cortina Logic cierra con su animación (la misma que el gesto);
    // montado suelto (pruebas, otras superficies) cae al cierre directo.
    const panel = usePanelCortina();
    const handleClose = () => {
        if (panel) panel.cerrar();
        else setActiveEdge(null);
    };

    const mover = useCallback(
        (id: string, dir: -1 | 1) => {
            const actual = resolverOrden(config.controlCenter?.moduleOrder);
            const siguiente = moverModulo(actual, id, dir);
            if (siguiente.some((x, i) => x !== actual[i])) updateSection("controlCenter", { moduleOrder: siguiente });
        },
        [config.controlCenter?.moduleOrder, updateSection],
    );

    const alternarOculta = useCallback(
        (id: string) => {
            // Nunca se permite ocultar TODAS las secciones (siempre queda al menos una).
            const r = alternarOculto(config.controlCenter?.hiddenModules ?? [], id, SECCIONES.length);
            setAvisoOrganizador(r.aplicado ? null : "Tiene que quedar al menos una sección a la vista.");
            if (r.aplicado) updateSection("controlCenter", { hiddenModules: r.ocultos });
        },
        [config.controlCenter?.hiddenModules, updateSection],
    );

    const restaurar = useCallback(() => {
        setAvisoOrganizador(null);
        updateSection("controlCenter", { moduleOrder: [...ORDEN_POR_DEFECTO], hiddenModules: [] });
    }, [updateSection]);

    const filasOrganizador = useMemo(
        () =>
            orden.flatMap((id) => {
                const s = SECCIONES.find((x) => x.id === id);
                return s ? [{ id, rotulo: s.rotulo, icono: s.icono, oculta: ocultos.has(id) }] : [];
            }),
        [orden, ocultos],
    );

    const barra: SeccionBarra[] = useMemo(
        () => visibles.map((s) => ({ id: s.id, rotulo: s.rotulo, icono: s.icono, insignia: s.id === "notif" ? noLeidas : null })),
        [visibles, noLeidas],
    );

    // ── Scroll REAL del carril de contenido + avisos de "hay más" (Adenda 66 §14) ──
    // El carril (no cada sección) es el ÚNICO scroller: así el ref es estable al cambiar de sección
    // y podemos pintar sombras/flechas arriba y abajo.
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const [hints, setHints] = useState<{ up: boolean; down: boolean }>({ up: false, down: false });

    const updateScrollHints = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const up = el.scrollTop > 4;
        const down = el.scrollTop < el.scrollHeight - el.clientHeight - 4;
        // GUARDA anti-bucle (regla Adenda 63 §15): solo re-renderiza si el valor
        // CAMBIA. Sin esto, un ResizeObserver que hace setState en cada medición
        // puede reentrar y provocar el glitcheo en loop ya corregido en su día.
        setHints((prev) => (prev.up === up && prev.down === down ? prev : { up, down }));
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        const content = contentRef.current;
        if (!el) return;
        updateScrollHints();
        // Observa el CONTENIDO (su alto cambia al desplegar secciones) y el propio carril (su alto
        // cambia con el viewport / rotación / barra de URL).
        const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => updateScrollHints()) : null;
        ro?.observe(el);
        if (content) ro?.observe(content);
        window.addEventListener("resize", updateScrollHints);
        return () => {
            ro?.disconnect();
            window.removeEventListener("resize", updateScrollHints);
        };
    }, [updateScrollHints]);

    // Al cambiar de sección (o abrir/cerrar el organizador) el contenido cambia de alto: volvemos
    // arriba y recalculamos los avisos.
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = 0;
        updateScrollHints();
    }, [activeTab, editorOpen, updateScrollHints]);

    const pistaCierre = entrada === "raton" ? "Esc, o desliza con dos dedos hacia la derecha" : "Desliza el panel hacia la derecha para cerrar";

    return (
        // (2026-09-25) Ya no anima por su cuenta: la cortina Logic (PanelCortina) lo desliza y lo inclina.
        // Su vieja entrada con `filter: blur()` dejaba un filtro fijo en el panel que rompía el cristal de
        // sus hijos.
        <div
            data-testid="control-center"
            className={cn(
                "pointer-events-auto relative flex flex-col overflow-hidden border border-amber-300/20 bg-black/80 text-amber-50 shadow-2xl ring-1 ring-white/5 backdrop-blur-3xl",
                // Rellena el panel de la cortina en todos los tamaños: el panel decide el ancho y el
                // alto según la pantalla (side-curtains.tsx).
                "h-full w-full rounded-[inherit]",
                // ── C2 · Adenda 66 §14 (regla Adenda 63 §15) ───────────────────────────────────
                // La altura deseada la fija el panel, pero SIEMPRE topada por `max-h-full` (= alto del
                // wrapper, anclado a top+bottom y que ya descuenta las safe-areas): el panel nunca
                // excede el viewport, así que nunca se corta; lo que no cabe se resuelve con el scroll
                // interno del carril.
                "min-h-0 max-h-full",
            )}
        >
            {/* Tinte ámbar + flor de la vida muy tenue (contenidos en el panel, fijos mientras se desplaza) */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-bl from-amber-950/45 via-transparent to-yellow-900/10" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                <FlorDeLaVida className="absolute -right-28 -top-24 h-[26rem] w-[26rem] text-amber-300/[0.07] motion-safe:animate-[spin_240s_linear_infinite]" />
                <FlorDeLaVida className="absolute -bottom-28 -left-28 h-[22rem] w-[22rem] text-yellow-200/[0.05]" />
            </div>

            <div className="relative z-10 flex min-h-0 flex-1 flex-col">
                <CabeceraControl
                    aparato={aparato}
                    grabadora={grabadora}
                    grabarVisible={activeTab === "grabar"}
                    puedeVerGrabacion={idsVisibles.includes("grabar")}
                    onVerGrabacion={() => setActiveTab("grabar")}
                    pantallaCompleta={{ soportada: isSupported, activa: isFullscreen, alternar: toggleFullscreen }}
                    onCerrar={handleClose}
                />

                <TabsPrimitive.Root value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
                    <BarraSecciones secciones={barra} activa={activeTab} editorAbierto={editorOpen} onAlternarEditor={() => setEditorOpen((v) => !v)} />

                    {/* ── C1 · Carril de contenido con SCROLL REAL (Adenda 66 §14) ──────────────────
                        Este carril es el único scroller (`overflow-y-auto` + `overscroll-contain`, para
                        no arrastrar el scroll de la página detrás de la cortina). Eje vertical: todo lo
                        de dentro es de columnas con `min-w-0`, así que nunca desborda en X. `min-h-0` es
                        imprescindible: sin él, un hijo flex NO puede encogerse por debajo de su
                        contenido y el `overflow-y-auto` no llega a activarse. */}
                    <div className="relative min-h-0 flex-1">
                        <div
                            ref={scrollRef}
                            onScroll={updateScrollHints}
                            className="custom-scrollbar h-full overflow-y-auto overflow-x-hidden overscroll-contain"
                        >
                            <div ref={contentRef} className="px-4 pb-6 pt-2 md:px-5">
                                {editorOpen && (
                                    <OrganizadorSecciones
                                        filas={filasOrganizador}
                                        onMover={mover}
                                        onAlternarOculta={alternarOculta}
                                        onRestaurar={restaurar}
                                        aviso={avisoOrganizador}
                                    />
                                )}
                                {visibles.map((s) => {
                                    const Contenido = s.Contenido;
                                    return (
                                        <TabsPrimitive.Content
                                            key={s.id}
                                            value={s.id}
                                            className={cn(
                                                // `min-h-full` (no `h-full`): rellena el carril cuando el contenido es corto,
                                                // pero LO DEJA CRECER cuando es largo — que es justo lo que permite el scroll.
                                                "m-0 min-h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40",
                                                "motion-safe:data-[state=active]:animate-in motion-safe:data-[state=active]:fade-in-0 motion-safe:data-[state=active]:slide-in-from-bottom-1 motion-safe:duration-200",
                                            )}
                                        >
                                            <Contenido />
                                        </TabsPrimitive.Content>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Avisos de que HAY MÁS contenido: sombra + flecha, arriba y abajo. Solo aparecen
                            cuando de verdad se puede seguir deslizando. */}
                        <div
                            aria-hidden="true"
                            className={cn(
                                "pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/85 to-transparent transition-opacity duration-200",
                                hints.up ? "opacity-100" : "opacity-0",
                            )}
                        />
                        <div
                            aria-hidden="true"
                            className={cn(
                                "pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/85 to-transparent transition-opacity duration-200",
                                hints.down ? "opacity-100" : "opacity-0",
                            )}
                        />
                        {hints.up && (
                            <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 text-amber-100/60">
                                <ChevronUp className="h-4 w-4" />
                            </span>
                        )}
                        {hints.down && (
                            <span aria-hidden="true" className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-amber-100/60 motion-safe:animate-pulse">
                                <ChevronDown className="h-4 w-4" />
                            </span>
                        )}
                    </div>
                </TabsPrimitive.Root>

                {/* Pie: cómo cerrar. Reserva la barra de gestos en móvil. Sin estados inventados. */}
                <footer className="shrink-0 border-t border-amber-300/15 px-5 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-2 text-center">
                    <p className="m-0 text-[11px] leading-snug text-amber-100/50">{pistaCierre}</p>
                </footer>
            </div>
        </div>
    );
}
