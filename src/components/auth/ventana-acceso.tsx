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
 *   · arriba, el símbolo de StarSeed y el nombre; debajo, los puntos de paso (se puede saltar a cualquiera);
 *   · los pasos: bienvenida → qué es StarSeed OS → gestos → cuenta. El de la cuenta es el formulario único
 *     (`auth-form.tsx`: Entrar / Crear cuenta, «Mostrar», confirmación, código por correo) y, debajo, tres
 *     razones breves;
 *   · «Explorar sin cuenta» siempre a mano;
 *   · a pantalla completa en el móvil.
 *
 * Tres piezas, un solo contenido:
 *   · `ContenidoAcceso` — el contenido (cabecera, pasos, formulario, pie), sin marco;
 *   · `VentanaAcceso`   — el marco de DIÁLOGO, para abrirla encima de cualquier página (primer arranque,
 *                         «Entrar o crear cuenta» de la puerta de sesión, Ajustes → Ver la guía…);
 *   · `PaginaAcceso`    — el marco de PÁGINA, para `/login` y `/bienvenida` (las rutas viejas siguen
 *                         existiendo —hay enlaces guardados— pero enseñan esta misma ventana). Se pinta
 *                         bajo la guía de Aurora (z 90 < 95), así que desde ahí «Conoce StarSeed» abre el
 *                         recorrido completo por encima; un diálogo modal de Radix no lo permitiría.
 *
 * Quién abre qué (el mapa completo está en `architecture/acceso-unico.md`):
 *   · `/login`, `/bienvenida`, el enlace «Iniciar sesión» de cada aviso → `PaginaAcceso` en la cuenta;
 *   · «Entrar o crear cuenta» / «Ver la introducción» de la puerta de sesión y del aviso de la web →
 *     `VentanaAcceso` (en la cuenta / desde el principio);
 *   · el primer arranque de la app nativa y de la web instalada → `VentanaAcceso` desde el principio;
 *   · Ajustes → «Ver la guía» sin sesión → `VentanaAcceso` desde el principio.
 */

import { useCallback, useEffect, useState, type ElementType, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { AtSign, BookOpen, ChevronLeft, ChevronRight, KeyRound, LayoutGrid, Sparkles, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BotonCerrar } from "@/components/ui/boton-cerrar";
import { PasoAnimado, useDireccionPaso } from "@/components/movimiento/paso-animado";
import { acquireFullscreenModal } from "@/lib/ui/fullscreen-modal";
import { useDeslizarPasos } from "@/hooks/use-deslizar-pasos";
import { abrirGuia, type OrigenGuia } from "@/lib/onboarding/guia-acceso";
import { explorarSinCuenta } from "@/lib/onboarding/explorar-sin-cuenta";
import type { DestinoAlEntrar } from "@/lib/auth/destino-al-entrar";
import { AuthForm, type OrigenEntrada, type PestanaAcceso } from "@/components/auth/auth-form";

import { DemoGestosHibridos } from "@/components/onboarding/demo-gestos-hibridos";
import { StepDemo } from "@/components/onboarding/aurora-guide-demos";
import { IconoStarSeed } from "@/components/onboarding/icono-starseed";

/* ───────────────────────────────────── Datos ───────────────────────────────────── */

export const PASOS_ACCESO = ["bienvenida", "que-es", "gestos", "acceso"] as const;
export type PasoAcceso = (typeof PASOS_ACCESO)[number];
const ULTIMO = PASOS_ACCESO.length - 1;

const TEXTOS: Record<PasoAcceso, { titulo: string; texto: string }> = {
    bienvenida: {
        titulo: "Te damos la bienvenida a StarSeed OS",
        texto: "Tu sistema operativo social: escritorios, biblioteca, apps y Aurora, tu inteligencia personal, en todos tus dispositivos con una sola cuenta.",
    },
    "que-es": {
        titulo: "Qué es StarSeed OS",
        texto: "Un sistema abierto que es tuyo: tus datos, tu IA y tu voz en la comunidad.",
    },
    gestos: {
        titulo: "Gestos naturales en cualquier pantalla",
        texto: "Los menús se abren desde los bordes y se cierran devolviéndolos, tocando fuera, con la X o con Escape. Pruébalo aquí.",
    },
    acceso: {
        titulo: "Crea tu cuenta o entra",
        texto: "Con tu cuenta, lo que hagas aquí aparece también en tus otros dispositivos.",
    },
};

/** Nombre corto de cada paso, para el rótulo accesible de los puntos. */
const ETIQUETA_PASO: Record<PasoAcceso, string> = {
    bienvenida: "Bienvenida",
    "que-es": "Qué es StarSeed OS",
    gestos: "Gestos",
    acceso: "Tu cuenta",
};

const QUE_ES = [
    { icono: LayoutGrid, titulo: "Tus escritorios", texto: "Ventanas, widgets y apps que se sincronizan en todos tus dispositivos." },
    { icono: Sparkles, titulo: "Aurora, tu inteligencia", texto: "Una IA que es tuya: te guía, crea contigo y también funciona en tu propio equipo." },
    { icono: BookOpen, titulo: "Biblioteca y apps", texto: "Lo que guardas e instalas te sigue a cualquier dispositivo." },
    { icono: Users, titulo: "Comunidad y gobernanza", texto: "Decide con otras personas sin intermediarios: una persona, una voz." },
];

/** Las tres razones breves bajo el formulario (el mismo texto que tenía `AuthGate`). */
const RAZONES = [
    { icono: KeyRound, titulo: "Una sola cuenta", texto: "OS, Nexus, Café y Audiomorphic con un mismo acceso." },
    { icono: AtSign, titulo: "Dirección @star.seed", texto: "Tu identidad interna en la red, lista al crear la cuenta." },
    { icono: Sparkles, titulo: "Aurora te guía", texto: "Una guía inteligente te ayuda a dejar todo listo." },
];

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
    /** Con qué paso abre: la introducción desde el principio, o directo a la cuenta. */
    pasoInicial: "intro" | "acceso";
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
}

export function ContenidoAcceso({
    pasoInicial,
    pestanaInicial,
    onSaltar,
    destinoAlEntrar,
    onEntrado,
    Titulo = "h1",
    Descripcion = "p",
    idDescripcion,
    avisoReanudar,
    onConocer,
}: ContenidoAccesoProps) {
    const reducir = useReducedMotion() ?? false;
    const [indice, setIndice] = useState(pasoInicial === "acceso" ? ULTIMO : 0);
    const [pestana, setPestana] = useState<PestanaAcceso>(pestanaInicial ?? (pasoInicial === "acceso" ? "signin" : "signup"));
    const direccion = useDireccionPaso(indice);
    const paso = PASOS_ACCESO[indice];
    const ultimo = indice === ULTIMO;

    const siguiente = useCallback(() => setIndice((i) => Math.min(ULTIMO, i + 1)), []);
    const anterior = useCallback(() => setIndice((i) => Math.max(0, i - 1)), []);
    const irA = useCallback((i: number) => setIndice(Math.max(0, Math.min(ULTIMO, i))), []);
    const irAlAcceso = useCallback((p: PestanaAcceso) => {
        setPestana(p);
        setIndice(ULTIMO);
    }, []);
    // Pasar de página deslizando solo en los pasos de lectura (la práctica de gestos y el
    // formulario usan el dedo para otra cosa).
    const deslizar = useDeslizarPasos({ alSiguiente: siguiente, alAnterior: anterior, habilitado: paso === "bienvenida" || paso === "que-es" });

    return (
        <div className="relative z-10 flex w-full flex-col gap-4" data-paso={paso}>
            <header className="flex flex-col items-center gap-1 text-center">
                <div className="inline-flex items-center gap-2.5" data-testid="marca-starseed">
                    <IconoStarSeed size={36} />
                    <span
                        aria-hidden
                        className="bg-gradient-to-br from-[#a78bfa] to-[#34d399] bg-clip-text font-headline text-[28px] font-bold leading-none tracking-tight text-transparent"
                    >
                        StarSeed
                    </span>
                </div>
                <div role="group" aria-label="Pasos de la introducción" className="flex items-center justify-center">
                    {PASOS_ACCESO.map((p, i) => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => irA(i)}
                            aria-label={`Ir al paso ${i + 1} de ${PASOS_ACCESO.length}: ${ETIQUETA_PASO[p]}`}
                            aria-current={i === indice ? "step" : undefined}
                            className="group inline-flex h-11 w-8 cursor-pointer items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                        >
                            <span
                                className={cn(
                                    "h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none",
                                    i === indice
                                        ? "w-6 bg-gradient-to-r from-[#7c5cff] to-[#23d5ab]"
                                        : "w-1.5 bg-white/25 group-hover:bg-white/50",
                                )}
                            />
                        </button>
                    ))}
                </div>
                <p className="sr-only" aria-live="polite">Paso {indice + 1} de {PASOS_ACCESO.length}</p>
                <Titulo className="text-xl font-semibold leading-tight tracking-tight text-white">{TEXTOS[paso].titulo}</Titulo>
                <Descripcion id={idDescripcion} className="max-w-[26rem] text-sm leading-snug text-white/65">
                    {TEXTOS[paso].texto}
                </Descripcion>
            </header>

            <div {...deslizar}>
                <PasoAnimado clave={paso} direccion={direccion} className="min-h-[12rem]">
                    {paso === "bienvenida" && (
                        <div className="flex flex-col items-center gap-3 text-center">
                            <StepDemo stepKey="orbe" accent="#C9A8FF" reduce={reducir} />
                            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                                <Button className="min-h-[44px] cursor-pointer" onClick={siguiente}>
                                    Empezar la introducción
                                </Button>
                                <Button variant="outline" className="min-h-[44px] cursor-pointer border-white/15" onClick={() => irAlAcceso("signin")}>
                                    Ya tengo cuenta
                                </Button>
                            </div>
                        </div>
                    )}
                    {paso === "que-es" && (
                        <div className="space-y-3">
                            <StepDemo stepKey="escritorio" accent="#39FF14" reduce={reducir} />
                            <ul className="grid gap-2 sm:grid-cols-2">
                                {QUE_ES.map(({ icono: Icono, titulo, texto }) => (
                                    <li key={titulo} className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                                        <Icono className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-semibold text-white">{titulo}</span>
                                            <span className="block text-xs leading-snug text-white/60">{texto}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {paso === "gestos" && <DemoGestosHibridos accent="#6FE6D6" reduce={reducir} />}
                    {paso === "acceso" && (
                        <div className="space-y-4">
                            {avisoReanudar}
                            <AuthForm key={pestana} pestanaInicial={pestana} destinoAlEntrar={destinoAlEntrar} onEntrado={onEntrado} />
                            <ul className="grid gap-2 border-t border-white/10 pt-3" aria-label="Por qué crear una cuenta StarSeed">
                                {RAZONES.map(({ icono: Icono, titulo, texto }) => (
                                    <li key={titulo} className="flex items-start gap-2.5">
                                        <span
                                            aria-hidden
                                            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-violet-400/25 bg-violet-500/15"
                                        >
                                            <Icono className="h-3.5 w-3.5 text-violet-200" />
                                        </span>
                                        <span className="min-w-0 text-[11.5px] leading-snug text-white/60">
                                            <b className="font-semibold text-white/85">{titulo}</b> — {texto}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </PasoAnimado>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="flex flex-wrap items-center gap-x-3">
                    <button
                        type="button"
                        onClick={onSaltar}
                        className="inline-flex min-h-[44px] cursor-pointer items-center rounded-md px-1 text-xs text-white/65 underline-offset-2 hover:text-white/90 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                    >
                        Explorar sin cuenta
                    </button>
                    {onConocer && (
                        <button
                            type="button"
                            onClick={onConocer}
                            className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md px-1 text-xs text-white/65 underline-offset-2 hover:text-white/90 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                        >
                            <Sparkles className="h-3.5 w-3.5" aria-hidden />
                            Conoce StarSeed
                        </button>
                    )}
                </div>
                <div className="flex gap-2">
                    {indice > 0 && (
                        <Button variant="outline" size="sm" onClick={anterior} className="min-h-[44px] cursor-pointer gap-1 border-white/15">
                            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Atrás
                        </Button>
                    )}
                    {!ultimo && (
                        <Button size="sm" onClick={siguiente} className="min-h-[44px] cursor-pointer gap-1">
                            {indice === ULTIMO - 1 ? "Crear cuenta o entrar" : "Siguiente"} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                    )}
                </div>
            </div>
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
    pestanaInicial?: PestanaAcceso;
    /** «Explorar sin cuenta». */
    onSaltar: () => void;
    /** La X, Escape o tocar fuera. */
    onCerrar: () => void;
    /** Por defecto se queda donde está (la ventana va encima de la página que la pidió). */
    destinoAlEntrar?: DestinoAlEntrar;
}

export function VentanaAcceso({ pasoInicial, pestanaInicial, onSaltar, onCerrar, destinoAlEntrar = null }: VentanaAccesoProps) {
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
                    />
                </motion.section>
            </div>
        </main>
    );
}

export default PaginaAcceso;
