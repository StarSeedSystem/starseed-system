"use client";

/**
 * VentanaAcceso — LA ventana de acceso de StarSeed OS (la única).
 * ═══════════════════════════════════════════════════════════════════════════
 * (Ola 1025T · ACC1025A · Alex 2026-10-25) Había tres ventanas de iniciar sesión / crear cuenta con
 * diseños distintos: `/login` («Identidad Digital»), `/bienvenida` (`AuthGate`, «StarSeed OS · Inicia
 * sesión…») y la ventana guiada del primer arranque («Crea tu cuenta o entra», con puntos de paso). Se
 * queda SOLO la guiada, mejorada, y las demás pintan esta misma:
 *
 *   · UNA tarjeta de cristal oscuro (sin tarjeta dentro de tarjeta), con los acentos Trinity muy sutiles y
 *     el degradado violeta→teal de la marca;
 *   · arriba, el símbolo de StarSeed y el nombre; debajo, la barra de capítulos y el índice;
 *   · «Explorar sin cuenta» siempre a mano;
 *   · a pantalla completa en el móvil.
 *
 * (Ola 1025U · GUIA1025U · Alex 2026-10-26) La introducción ya no tiene «sus» cuatro pasos: recorre el
 * CATÁLOGO ÚNICO de la guía completa (`lib/onboarding/guia-completa.ts`), el mismo que el recorrido de
 * Aurora (`onboarding/aurora-guide.tsx`): bienvenida, Trinity y gestos, el sistema (Protomolécula, malla,
 * capas de conciencia, neuronas y cerebro), la red (los tres pilares), Librería y Biblioteca, Genesis y
 * PoliGenesis, personalización segura, tu espacio y, al final, tu cuenta (el formulario único de
 * `auth-form.tsx`: Entrar / Crear cuenta, «Mostrar», confirmación, código por correo). Se ve igual con
 * cuenta o sin ella y desde cualquier medio:
 *
 *   · índice de capítulos accesible y «Paso N de M»;
 *   · «Saltar a crear cuenta» en cada paso y «Explorar sin cuenta» siempre;
 *   · retoma por donde se quedó (`guia-progreso.ts`, compartido con la guía de Aurora);
 *   · teclado (flechas) y deslizar con el dedo; con `prefers-reduced-motion` solo se funde;
 *   · la demostración de cada paso se carga a demanda (`DemoPaso`).
 *
 * Tres piezas, un solo contenido:
 *   · `ContenidoAcceso` — el contenido (cabecera, pasos, formulario, pie), sin marco;
 *   · `VentanaAcceso`   — el marco de DIÁLOGO, para abrirla encima de cualquier página (primer arranque,
 *                         «Entrar o crear cuenta» de la puerta de sesión, Ajustes → Ver la guía…);
 *   · `PaginaAcceso`    — el marco de PÁGINA, para `/login` y `/bienvenida` (las rutas viejas siguen
 *                         existiendo —hay enlaces guardados— pero enseñan esta misma ventana). Se pinta
 *                         bajo la guía de Aurora (z 90 < 95), así que desde ahí «Conoce StarSeed» abre el
 *                         recorrido con voz por encima —un diálogo modal de Radix no lo permitiría— y, al
 *                         terminarlo sin cuenta, le pide a esta página la pestaña que toca
 *                         (`starseed:guia-accion`).
 *
 * Quién abre qué (el mapa completo está en `architecture/acceso-unico.md`):
 *   · `/login`, `/bienvenida`, el enlace «Iniciar sesión» de cada aviso → `PaginaAcceso` en la cuenta;
 *   · «Entrar o crear cuenta» / «Ver la introducción» de la puerta de sesión y del aviso de la web →
 *     `VentanaAcceso` (en la cuenta / desde el principio, o por donde se quedó);
 *   · el primer arranque de la app nativa y de la web instalada → `VentanaAcceso` desde el principio;
 *   · Ajustes → «Ver la guía» → la guía de Aurora (los mismos pasos), con o sin sesión.
 */

import { useCallback, useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, RotateCcw, Sparkles, UserPlus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BotonCerrar } from "@/components/ui/boton-cerrar";
import { PasoAnimado, useDireccionPaso } from "@/components/movimiento/paso-animado";
import { acquireFullscreenModal } from "@/lib/ui/fullscreen-modal";
import { useDeslizarPasos } from "@/hooks/use-deslizar-pasos";
import { usePerfilDispositivo } from "@/hooks/use-perfil-dispositivo";
import { abrirGuia, EVENTO_ACCION_GUIA, type AccionGuia, type OrigenGuia } from "@/lib/onboarding/guia-acceso";
import { explorarSinCuenta } from "@/lib/onboarding/explorar-sin-cuenta";
import {
    ACENTOS_TRINITY,
    PASOS_GUIA,
    ULTIMO_PASO,
    acotarIndice,
    etiquetaProgreso,
    indiceInicial,
    textoDelPaso,
} from "@/lib/onboarding/guia-completa";
import { borrarProgresoGuia, guardarProgresoGuia, leerProgresoGuia } from "@/lib/onboarding/guia-progreso";
import type { DestinoAlEntrar } from "@/lib/auth/destino-al-entrar";
import { AuthForm, type OrigenEntrada, type PestanaAcceso } from "@/components/auth/auth-form";

import { DemoPaso } from "@/components/onboarding/demo-paso";
import { BarraCapitulos, IndiceGuia, PuntosPaso, RazonesCuenta, TarjetasPaso } from "@/components/onboarding/guia-completa-ui";
import { IconoStarSeed } from "@/components/onboarding/icono-starseed";

/* ───────────────────────────────────── Datos ───────────────────────────────────── */

/** Los acentos Trinity, muy sutiles: Zenith arriba, Horizon a la izquierda, Logic a la derecha, Anchor abajo. */
const FONDO_TRINITY =
    "radial-gradient(60% 38% at 50% 0%, rgba(0,127,255,0.16), transparent 72%), " +
    "radial-gradient(38% 46% at 0% 50%, rgba(16,185,129,0.10), transparent 72%), " +
    "radial-gradient(38% 46% at 100% 50%, rgba(255,191,0,0.08), transparent 72%), " +
    "radial-gradient(60% 38% at 50% 100%, rgba(220,20,60,0.10), transparent 72%)";

/* ───────────────────────────────── Marco común ───────────────────────────────── */

/** El cristal de la tarjeta (el mismo en el diálogo y en la página). */
const CLASES_TARJETA =
    "relative overflow-hidden border border-white/12 bg-[#0a0c16]/90 text-white shadow-[0_30px_90px_rgba(0,0,0,0.6)] backdrop-blur-2xl";

/** Acentos Trinity + hilo violeta→teal arriba: decoración, nunca interactiva. */
function AcentosTarjeta() {
    return (
        <>
            <span aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: FONDO_TRINITY }} />
            <span
                aria-hidden
                className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/70 to-transparent"
            />
        </>
    );
}

/* ─────────────────────────────────── Contenido ─────────────────────────────────── */

type ComponenteTexto = ElementType<{ className?: string; id?: string; children?: ReactNode }>;

export interface ContenidoAccesoProps {
    /** Con qué paso abre: la introducción (retoma por donde se quedó), o directo a la cuenta. */
    pasoInicial: "intro" | "acceso";
    /** Id de un paso de la guía por el que empezar (si se pide uno, no se retoma nada). */
    pasoGuiaInicial?: string;
    /** Pestaña del formulario al llegar a la cuenta. Por defecto «Entrar» si se viene a entrar y «Crear cuenta» si se recorrió la introducción. */
    pestanaInicial?: PestanaAcceso;
    /** «Explorar sin cuenta». */
    onSaltar: () => void;
    /** A dónde va tras entrar (ver `AuthForm`). */
    destinoAlEntrar?: DestinoAlEntrar;
    /** Se abrió la sesión (la ventana ya no hace falta). */
    onEntrado?: (origen: OrigenEntrada) => void;
    /** Elemento del título (`h1` en la página, `DialogTitle` en el diálogo). */
    Titulo?: ComponenteTexto;
    /** Elemento de la descripción (`p` en la página, `DialogDescription` en el diálogo). */
    Descripcion?: ComponenteTexto;
    idDescripcion?: string;
    /** Arriba del formulario, p. ej. «Continuar como…» en `/login`. */
    avisoReanudar?: ReactNode;
    /** Si se da, aparece «Conoce StarSeed» y lo llama (abre el recorrido de Aurora). */
    onConocer?: () => void;
    /** En la página: atiende lo que pide la guía de Aurora al terminar sin cuenta (`starseed:guia-accion`). */
    escucharGuia?: boolean;
}

/** Paso desde el que se deslizan las páginas: los de lectura (la práctica de gestos y el formulario usan el dedo para otra cosa). */
function sePuedeDeslizar(id: string): boolean {
    return id !== "cuenta" && id !== "gestos-hibridos";
}

export function ContenidoAcceso({
    pasoInicial,
    pasoGuiaInicial,
    pestanaInicial,
    onSaltar,
    destinoAlEntrar,
    onEntrado,
    Titulo = "h1",
    Descripcion = "p",
    idDescripcion,
    avisoReanudar,
    onConocer,
    escucharGuia = false,
}: ContenidoAccesoProps) {
    const reducir = useReducedMotion() ?? false;
    const { entrada } = usePerfilDispositivo();
    const [indice, setIndice] = useState(() =>
        pasoInicial === "acceso" ? ULTIMO_PASO : pasoGuiaInicial ? indiceInicial(pasoGuiaInicial) : 0,
    );
    const [pestana, setPestana] = useState<PestanaAcceso>(pestanaInicial ?? (pasoInicial === "acceso" ? "signin" : "signup"));
    /** Paso por el que se retomó (para ofrecer «Empezar de nuevo»); `null` si se empezó de cero. */
    const [retomadoEn, setRetomadoEn] = useState<number | null>(null);
    /** El progreso solo se apunta cuando la persona se mueve: abrir directo en la cuenta no borra lo que llevaba leído. */
    const movidoRef = useRef(false);
    const direccion = useDireccionPaso(indice);
    const paso = PASOS_GUIA[indice];
    const ultimo = indice === ULTIMO_PASO;
    const acento = ACENTOS_TRINITY[paso.acento];

    // Retomar donde se quedó (solo al abrir la introducción sin pedir un paso concreto).
    useEffect(() => {
        if (pasoInicial !== "intro" || pasoGuiaInicial) return;
        const guardado = leerProgresoGuia();
        if (guardado !== null) {
            setIndice(guardado);
            setRetomadoEn(guardado);
        }
        // Solo al montar: lo que se lea después lo decide la persona.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // El paso que se está leyendo se apunta (el último, la cuenta, lo borra).
    useEffect(() => {
        if (movidoRef.current) guardarProgresoGuia(indice);
    }, [indice]);

    const irA = useCallback((i: number) => {
        movidoRef.current = true;
        setIndice(acotarIndice(i));
    }, []);
    const siguiente = useCallback(() => {
        movidoRef.current = true;
        setIndice((i) => acotarIndice(i + 1));
    }, []);
    const anterior = useCallback(() => {
        movidoRef.current = true;
        setIndice((i) => acotarIndice(i - 1));
    }, []);
    const irAlAcceso = useCallback((p: PestanaAcceso) => {
        movidoRef.current = true;
        setPestana(p);
        setIndice(ULTIMO_PASO);
    }, []);
    const empezarDeNuevo = useCallback(() => {
        borrarProgresoGuia();
        setRetomadoEn(null);
        movidoRef.current = false;
        setIndice(0);
    }, []);

    // Lo que pide la guía de Aurora (que va por encima de esta página) al terminar sin cuenta.
    useEffect(() => {
        if (!escucharGuia || typeof window === "undefined") return;
        const alPedir = (e: Event) => {
            const accion = (e as CustomEvent<{ accion?: AccionGuia }>).detail?.accion;
            irAlAcceso(accion === "entrar" ? "signin" : "signup");
        };
        window.addEventListener(EVENTO_ACCION_GUIA, alPedir);
        return () => window.removeEventListener(EVENTO_ACCION_GUIA, alPedir);
    }, [escucharGuia, irAlAcceso]);

    // Teclado: flechas para pasar de paso. No se mete donde se escribe (el formulario, las pestañas) ni cuando
    // la guía de Aurora está por encima (ella ya las atiende).
    const idPasoRef = useRef(paso.id);
    idPasoRef.current = paso.id;
    useEffect(() => {
        if (typeof window === "undefined") return;
        const alTeclear = (e: KeyboardEvent) => {
            if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            if (idPasoRef.current === "cuenta") return;
            try {
                if (document.body.dataset.ssGuia === "1") return;
            } catch { /* sin documento */ }
            const t = e.target instanceof Element ? e.target : null;
            if (t?.closest("input, textarea, select, [contenteditable], [role='tab'], [role='tablist'], [role='slider'], [data-sin-arrastre]")) return;
            e.preventDefault();
            if (e.key === "ArrowRight") siguiente();
            else anterior();
        };
        window.addEventListener("keydown", alTeclear);
        return () => window.removeEventListener("keydown", alTeclear);
    }, [siguiente, anterior]);

    // Pasar de página deslizando solo en los pasos de lectura.
    const deslizar = useDeslizarPasos({ alSiguiente: siguiente, alAnterior: anterior, habilitado: sePuedeDeslizar(paso.id) });

    return (
        <div className="relative z-10 flex w-full flex-col gap-3" data-paso={paso.id} data-capitulo-actual={paso.capitulo}>
            <header className="flex flex-col items-center gap-0.5 text-center">
                <div className="inline-flex items-center gap-2.5" data-testid="marca-starseed">
                    <IconoStarSeed size={36} />
                    <span
                        aria-hidden
                        className="bg-gradient-to-br from-[#a78bfa] to-[#34d399] bg-clip-text font-headline text-[28px] font-bold leading-none tracking-tight text-transparent"
                    >
                        StarSeed
                    </span>
                </div>
                <BarraCapitulos indice={indice} onIr={irA} />
                <IndiceGuia
                    indice={indice}
                    onIr={irA}
                    className="text-left"
                    extra={
                        <span data-testid="progreso-guia" aria-live="polite" className="text-xs tabular-nums text-white/60">
                            {etiquetaProgreso(indice)}
                        </span>
                    }
                />
                <Titulo className="mt-1 text-xl font-semibold leading-tight tracking-tight text-white">{paso.titulo}</Titulo>
                <Descripcion id={idDescripcion} className="max-w-[26rem] text-sm leading-snug text-white/65">
                    {textoDelPaso(paso, entrada)}
                </Descripcion>
            </header>

            {retomadoEn !== null && retomadoEn === indice && (
                <div
                    data-testid="guia-retomada"
                    className="flex flex-wrap items-center justify-center gap-x-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[11.5px] text-white/65"
                >
                    <span className="py-2">Retomas donde lo dejaste.</span>
                    <button
                        type="button"
                        onClick={empezarDeNuevo}
                        className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-md px-1 text-white/85 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                    >
                        <RotateCcw className="h-3 w-3" aria-hidden /> Empezar de nuevo
                    </button>
                </div>
            )}

            <div {...deslizar} data-testid="pasos-guia">
                <PasoAnimado clave={paso.id} direccion={direccion} sinSalida className="min-h-[8rem]">
                    <div className="space-y-3">
                        {paso.demo && <DemoPaso clave={paso.demo} accent={acento} reduce={reducir} />}
                        <PuntosPaso puntos={paso.puntos} color={acento} />
                        <TarjetasPaso paso={paso} />
                        {paso.id === "bienvenida" && (
                            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                                <Button className="min-h-[44px] cursor-pointer" onClick={siguiente}>
                                    Empezar la introducción
                                </Button>
                                <Button variant="outline" className="min-h-[44px] cursor-pointer border-white/15" onClick={() => irAlAcceso("signin")}>
                                    Ya tengo cuenta
                                </Button>
                            </div>
                        )}
                        {ultimo && (
                            <div className="space-y-4">
                                {avisoReanudar}
                                <AuthForm key={pestana} pestanaInicial={pestana} destinoAlEntrar={destinoAlEntrar} onEntrado={onEntrado} />
                                <RazonesCuenta />
                            </div>
                        )}
                    </div>
                </PasoAnimado>
            </div>

            {onConocer && (
                <div className="flex justify-center">
                    <button
                        type="button"
                        onClick={onConocer}
                        className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md px-1 text-xs text-white/65 underline-offset-2 hover:text-white/90 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                    >
                        <Sparkles className="h-3.5 w-3.5" aria-hidden />
                        Conoce StarSeed
                    </button>
                </div>
            )}

            {/* El pie queda pegado abajo: en un móvil de 360 px, con un paso largo, «Siguiente» y los saltos no se pierden. */}
            <nav
                aria-label="Navegación de la introducción"
                className="sticky bottom-0 z-10 -mx-5 mt-1 flex flex-col gap-0 border-t border-white/10 bg-[#0a0c16]/95 px-5 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:-mx-7 sm:px-7"
            >
                <div className="flex items-center justify-between gap-2">
                    <div className="min-w-[44px]">
                        {indice > 0 && (
                            <Button variant="outline" size="sm" onClick={anterior} className="min-h-[44px] cursor-pointer gap-1 border-white/15">
                                <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Atrás
                            </Button>
                        )}
                    </div>
                    {!ultimo && (
                        <Button size="sm" onClick={siguiente} className="min-h-[44px] cursor-pointer gap-1">
                            {indice === ULTIMO_PASO - 1 ? "Crear cuenta o entrar" : "Siguiente"} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                    )}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-4">
                    {!ultimo && (
                        <button
                            type="button"
                            onClick={() => irAlAcceso("signup")}
                            className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-md px-1 text-xs font-medium text-cyan-200/90 underline-offset-2 hover:text-cyan-100 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                        >
                            <UserPlus className="h-3.5 w-3.5" aria-hidden /> Saltar a crear cuenta
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onSaltar}
                        className="inline-flex min-h-[44px] cursor-pointer items-center rounded-md px-1 text-xs text-white/65 underline-offset-2 hover:text-white/90 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                    >
                        Explorar sin cuenta
                    </button>
                </div>
            </nav>
        </div>
    );
}

/* ─────────────────────────── Marco de DIÁLOGO (encima de una página) ─────────────────────────── */

/** Registra el modal a pantalla completa solo mientras existe (repliega el cromo Trinity). */
function RegistroModalAbierto() {
    useEffect(() => acquireFullscreenModal(), []);
    return null;
}

const ID_DESCRIPCION_VENTANA = "bienvenida-desc";

export interface VentanaAccesoProps {
    pasoInicial: "intro" | "acceso";
    /** Id de un paso de la guía por el que empezar (por defecto, retoma por donde se quedó). */
    pasoGuiaInicial?: string;
    pestanaInicial?: PestanaAcceso;
    /** «Explorar sin cuenta». */
    onSaltar: () => void;
    /** La X, Escape o tocar fuera. */
    onCerrar: () => void;
    /** Por defecto se queda donde está (la ventana va encima de la página que la pidió). */
    destinoAlEntrar?: DestinoAlEntrar;
}

export function VentanaAcceso({ pasoInicial, pasoGuiaInicial, pestanaInicial, onSaltar, onCerrar, destinoAlEntrar = null }: VentanaAccesoProps) {
    return (
        <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) onCerrar(); }}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
                <DialogPrimitive.Content
                    aria-describedby={ID_DESCRIPCION_VENTANA}
                    data-testid="ventana-bienvenida"
                    data-tarjeta-acceso=""
                    data-component="dialog"
                    data-ss-modal-content=""
                    // Con el foco en el índice de capítulos, Esc lo cierra a él y no a la ventana entera.
                    onEscapeKeyDown={(e) => {
                        try {
                            if (document.activeElement?.closest("[data-indice-guia]") && document.querySelector("[data-testid='indice-guia']")) e.preventDefault();
                        } catch { /* sin documento */ }
                    }}
                    className={cn(
                        CLASES_TARJETA,
                        "fixed left-1/2 top-1/2 z-[121] flex max-h-[92dvh] w-[min(94vw,31rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl outline-none",
                        "max-sm:left-0 max-sm:top-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0",
                        "data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none",
                    )}
                >
                    <RegistroModalAbierto />
                    <AcentosTarjeta />
                    <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-7 sm:pb-6 sm:pt-6">
                        <ContenidoAcceso
                            pasoInicial={pasoInicial}
                            pasoGuiaInicial={pasoGuiaInicial}
                            pestanaInicial={pestanaInicial}
                            onSaltar={onSaltar}
                            destinoAlEntrar={destinoAlEntrar}
                            onEntrado={onCerrar}
                            Titulo={DialogPrimitive.Title}
                            Descripcion={DialogPrimitive.Description}
                            idDescripcion={ID_DESCRIPCION_VENTANA}
                        />
                    </div>
                    <DialogPrimitive.Close asChild>
                        <BotonCerrar etiqueta="Cerrar" atajo="Esc" tamano="sm" posicion="interior" className="z-20" />
                    </DialogPrimitive.Close>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}

/* ───────────────────────────── Marco de PÁGINA (/login y /bienvenida) ───────────────────────────── */

export interface PaginaAccesoProps {
    /** Qué ruta la pinta: decide de dónde se abre la guía («Conoce StarSeed»). */
    desde: Extract<OrigenGuia, "login" | "bienvenida">;
    pasoInicial?: "intro" | "acceso";
    pestanaInicial?: PestanaAcceso;
    destinoAlEntrar?: DestinoAlEntrar;
    avisoReanudar?: ReactNode;
}

export function PaginaAcceso({ desde, pasoInicial = "acceso", pestanaInicial, destinoAlEntrar, avisoReanudar }: PaginaAccesoProps) {
    const router = useRouter();
    const reducir = useReducedMotion() ?? false;
    const saltar = useCallback(() => explorarSinCuenta(router), [router]);
    const conocer = useCallback(() => { abrirGuia({ desde }); }, [desde]);

    return (
        <main
            data-testid="pagina-acceso"
            data-desde={desde}
            // z 90: bajo la guía de Aurora (z 95), para que «Conoce StarSeed» se vea por encima.
            className="fixed inset-0 z-[90] overflow-y-auto bg-[radial-gradient(circle_at_30%_18%,#1a1030,#05060d_70%)] text-white"
        >
            <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -left-[10%] -top-[12%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,#7c5cff55,transparent_60%)] blur-[46px]" />
                <div className="absolute -bottom-[10%] -right-[8%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,#23d5ab44,transparent_60%)] blur-[46px]" />
            </div>
            <div className="relative flex min-h-[100dvh] items-center justify-center sm:p-6">
                <motion.section
                    data-tarjeta-acceso=""
                    initial={reducir ? { opacity: 0 } : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reducir ? 0.15 : 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className={cn(
                        CLASES_TARJETA,
                        // `overflow-clip` recorta los acentos sin crear un contenedor de scroll: el pie de la introducción
                        // (`sticky`) se queda pegado al borde de la pantalla.
                        "overflow-clip",
                        "flex min-h-[100dvh] w-full max-w-[31rem] flex-col justify-center border-0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]",
                        "sm:min-h-0 sm:rounded-3xl sm:border sm:px-7 sm:py-6",
                    )}
                >
                    <AcentosTarjeta />
                    <ContenidoAcceso
                        pasoInicial={pasoInicial}
                        pestanaInicial={pestanaInicial}
                        onSaltar={saltar}
                        destinoAlEntrar={destinoAlEntrar}
                        avisoReanudar={avisoReanudar}
                        onConocer={conocer}
                        escucharGuia
                    />
                </motion.section>
            </div>
        </main>
    );
}

export default PaginaAcceso;
