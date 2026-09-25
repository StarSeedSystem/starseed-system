"use client";

/**
 * PrimerArranque — lo primero que ve quien abre StarSeed OS en un dispositivo nuevo.
 * ═══════════════════════════════════════════════════════════════════════════
 * (2026-09-25) Alex: «al abrir la app debe aparecer la ventana de iniciar sesión o crear
 * cuenta con toda su introducción dinámica automáticamente para los usuarios nuevos, o los
 * ajustes y configuraciones para esa nueva neurona vinculada a una cuenta existente».
 *
 * Se monta UNA vez en el layout raíz, junto al portero del alta (OnboardingGate): la app
 * nativa abre la web del OS en «/» → /escritorios, que vive en el grupo (main), así que un
 * montaje solo en (app) no llegaría a verse en el primer arranque.
 *
 * La decisión es pura (src/lib/onboarding/primer-arranque.ts, probada aparte). Aquí se
 * reúnen los datos (sesión, perfil, fila de esta neurona en `neuron_devices`, marcas) y se
 * abre, de una en una, la ventana que toca:
 *
 *   · Sin sesión, en la app nativa o la web instalada → «Te damos la bienvenida» a
 *     pantalla completa en el móvil: bienvenida → qué es StarSeed OS → gestos (la práctica
 *     real de la guía) → crear cuenta / entrar (el formulario de /login). «Explorar sin
 *     cuenta» la salta y ya no vuelve sola en este dispositivo.
 *   · Sin sesión, en una web normal → un aviso discreto que abre esa misma ventana.
 *   · Con cuenta y neurona nueva → los ajustes de la nueva neurona (NeuronSetup).
 *
 * «Una ventana cada vez»: antes de abrir espera a que el primer plano quede libre (ningún
 * diálogo, ni la guía, ni una ventana del rito, ni el Configurar Neurona). Siempre se puede
 * abrir a mano con `abrirPrimerArranque()` (Ajustes → Personalización).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { BookOpen, ChevronLeft, ChevronRight, LayoutGrid, Sparkles, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BotonCerrar } from "@/components/ui/boton-cerrar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PasoAnimado, useDireccionPaso } from "@/components/movimiento/paso-animado";
import { AuthForm } from "@/components/auth/auth-form";
import { esRutaConsola } from "@/components/layout/solo-fuera-de-consola";
import { createClient } from "@/utils/supabase/client";
import { NEURON_PREFS_KEY, thisDeviceId } from "@/lib/neurons/neurons";
import { esAppNativa } from "@/lib/apps-oficiales/dispositivo-actual";
import { isRunningStandalone } from "@/lib/install/device-install";
import { etapaActual, suscribirRito } from "@/lib/onboarding/director-rito";
import { primerPlanoOcupado } from "@/lib/ui/fullscreen-modal";
import { ritoActivo } from "@/lib/ui/rito-activo";
import { useDeslizarPasos } from "@/hooks/use-deslizar-pasos";
import {
    CLAVE_AVISO_WEB,
    CLAVE_INTRO_SALTADA,
    CLAVE_NEURONA_CONFIGURADA,
    CLAVE_NEURONA_POSPUESTA,
    EVENTO_ABRIR_PRIMER_ARRANQUE,
    creadaDesde,
    decidirPrimerArranque,
    leerMarca,
    ponerMarca,
    type EstadoNeurona,
    type EstadoSesion,
    type ModoApp,
    type PasoInicial,
} from "@/lib/onboarding/primer-arranque";

import { DemoGestosHibridos } from "./demo-gestos-hibridos";
import { StepDemo } from "./aurora-guide-demos";
import { IconoStarSeed } from "./icono-starseed";
import { CLASES_VENTANA_ARRANQUE, NeuronSetup } from "./neuron-setup";

/* ─────────────────────────────── Datos del arranque ─────────────────────────────── */

/** Instante en que se abrió la página: lo que nace después es «de este arranque». */
function inicioDelArranque(): number {
    try {
        if (typeof performance !== "undefined" && Number.isFinite(performance.timeOrigin)) return performance.timeOrigin;
    } catch { /* */ }
    return Date.now();
}

function modoActual(): ModoApp {
    if (esAppNativa()) return "nativa";
    return isRunningStandalone() ? "pwa" : "web";
}

/** ¿La persona le puso nombre o ajustes a esta neurona? (prefs sincronizadas con la cuenta) */
function tieneNombreOAjustes(id: string): boolean {
    try {
        const crudo = window.localStorage.getItem(NEURON_PREFS_KEY);
        const p = crudo ? (JSON.parse(crudo) as { names?: Record<string, string>; settings?: Record<string, unknown> }) : null;
        return Boolean(p?.names?.[id]?.trim() || p?.settings?.[id]);
    } catch {
        return false;
    }
}

function primerPlanoLibre(): boolean {
    if (primerPlanoOcupado() || ritoActivo()) return false;
    try {
        return !document.querySelector("[data-aurora-setup-center]");
    } catch {
        return true;
    }
}

/** Llama a `cb` cuando el primer plano lleva dos lecturas seguidas libre. Devuelve el cancelador. */
function esperarPrimerPlano(cb: () => void, cadaMs: number): () => void {
    let libres = 0;
    const id = window.setInterval(() => {
        if (primerPlanoLibre()) {
            libres += 1;
            if (libres >= 2) {
                window.clearInterval(id);
                cb();
            }
        } else {
            libres = 0;
        }
    }, cadaMs);
    return () => window.clearInterval(id);
}

type Abierta = null | { tipo: "acceso"; paso: "intro" | "acceso" } | { tipo: "aviso" } | { tipo: "neurona" };

export interface PrimerArranqueProps {
    /** Intervalo de la espera de cortesía (ms). Solo las pruebas lo acortan. */
    esperaMs?: number;
}

export function PrimerArranque({ esperaMs = 700 }: PrimerArranqueProps) {
    const ruta = usePathname();
    const arranqueRef = useRef(0);
    const [sesion, setSesion] = useState<EstadoSesion>("comprobando");
    const [tienePerfil, setTienePerfil] = useState<boolean | null>(null);
    const [neurona, setNeurona] = useState<EstadoNeurona | null>(null);
    const [nombreNeurona, setNombreNeurona] = useState("");
    const [modo, setModo] = useState<ModoApp>("web");
    const [ritoEnCurso, setRitoEnCurso] = useState(false);
    const [marcas, setMarcas] = useState({ introSaltada: false, avisoWebCerrado: false, neuronaPospuesta: false });
    const [abierta, setAbierta] = useState<Abierta>(null);
    /** Lo que ya se abrió solo en esta visita: no se repite al navegar. */
    const atendidaRef = useRef<Set<string>>(new Set());

    const leerMarcas = useCallback(() => {
        setMarcas({
            introSaltada: leerMarca(CLAVE_INTRO_SALTADA),
            avisoWebCerrado: leerMarca(CLAVE_AVISO_WEB, "sesion"),
            neuronaPospuesta: leerMarca(CLAVE_NEURONA_POSPUESTA, "sesion"),
        });
        setRitoEnCurso(etapaActual() !== null);
    }, []);

    const evaluar = useCallback(async () => {
        leerMarcas();
        try {
            const sb = createClient();
            const { data } = await sb.auth.getSession();
            const user = data?.session?.user ?? null;
            if (!user) {
                setSesion("sin-sesion");
                setTienePerfil(null);
                setNeurona(null);
                return;
            }
            if ((user as { is_anonymous?: boolean }).is_anonymous || !user.email) {
                setSesion("invitado");
                return;
            }
            setSesion("cuenta");
            let perfil = false;
            try {
                const { data: prof } = await sb.from("profiles").select("handle").eq("user_id", user.id).maybeSingle();
                perfil = Boolean((prof as { handle?: string } | null)?.handle);
            } catch {
                perfil = false; // sin datos, no se abre nada encima de nadie
            }
            const id = thisDeviceId();
            let estado: EstadoNeurona;
            try {
                const { data: fila, error } = await sb
                    .from("neuron_devices")
                    .select("id, name, created_at")
                    .eq("id", id)
                    .maybeSingle();
                const f = fila as { name?: string; created_at?: string } | null;
                estado = {
                    configuradaAqui: leerMarca(CLAVE_NEURONA_CONFIGURADA),
                    // Con error de red no se sabe: se decide solo por nombre/ajustes y la marca.
                    enCuenta: error ? true : Boolean(f),
                    creadaEnEsteArranque: error ? false : creadaDesde(f?.created_at, arranqueRef.current),
                    tieneNombreOAjustes: tieneNombreOAjustes(id),
                };
                setNombreNeurona(f?.name ?? "");
            } catch {
                estado = { configuradaAqui: leerMarca(CLAVE_NEURONA_CONFIGURADA), enCuenta: true, creadaEnEsteArranque: false, tieneNombreOAjustes: tieneNombreOAjustes(id) };
            }
            setTienePerfil(perfil);
            setNeurona(estado);
        } catch {
            setSesion("comprobando"); // fallo raro: mejor no abrir nada
        }
    }, [leerMarcas]);

    useEffect(() => {
        arranqueRef.current = inicioDelArranque();
        setModo(modoActual());
        void evaluar();
        let quitarAuth: (() => void) | undefined;
        try {
            const { data: sub } = createClient().auth.onAuthStateChange(() => {
                void evaluar();
            });
            quitarAuth = () => sub.subscription.unsubscribe();
        } catch { /* sin suscripción: basta la comprobación inicial */ }
        const quitarRito = suscribirRito((etapa) => setRitoEnCurso(etapa !== null));
        return () => {
            quitarAuth?.();
            quitarRito();
        };
    }, [evaluar]);

    const decision = useMemo(
        () =>
            decidirPrimerArranque({
                ruta,
                esConsola: esRutaConsola(ruta),
                sesion,
                modo,
                introSaltada: marcas.introSaltada,
                avisoWebCerrado: marcas.avisoWebCerrado,
                ritoEnCurso,
                tienePerfil,
                neurona,
                neuronaPospuesta: marcas.neuronaPospuesta,
            }),
        [ruta, sesion, modo, marcas, ritoEnCurso, tienePerfil, neurona],
    );

    // Apertura automática: una sola vez por visita y esperando a que el primer plano esté libre.
    useEffect(() => {
        if (decision.tipo === "nada" || decision.tipo === "esperar") return;
        const clave = decision.tipo === "acceso" ? `acceso-${decision.forma}` : decision.tipo;
        if (atendidaRef.current.has(clave) || abierta) return;
        const abrir = () => {
            atendidaRef.current.add(clave);
            if (decision.tipo === "neurona-nueva") setAbierta({ tipo: "neurona" });
            else if (decision.forma === "completa") setAbierta({ tipo: "acceso", paso: "intro" });
            else setAbierta({ tipo: "aviso" });
        };
        return esperarPrimerPlano(abrir, esperaMs);
    }, [decision, abierta, esperaMs]);

    // Al entrar (o entrar como invitado) la bienvenida y el aviso sobran.
    useEffect(() => {
        if (sesion !== "cuenta" && sesion !== "invitado") return;
        setAbierta((a) => (a && (a.tipo === "acceso" || a.tipo === "aviso") ? null : a));
    }, [sesion]);

    // Apertura a mano desde cualquier botón del OS.
    useEffect(() => {
        const alAbrir = (e: Event) => {
            const paso = (e as CustomEvent<{ paso?: PasoInicial }>).detail?.paso;
            if (paso === "neurona" || (sesion === "cuenta" && paso !== "intro" && paso !== "acceso")) {
                setAbierta({ tipo: "neurona" });
            } else {
                setAbierta({ tipo: "acceso", paso: paso === "acceso" ? "acceso" : "intro" });
            }
        };
        window.addEventListener(EVENTO_ABRIR_PRIMER_ARRANQUE, alAbrir);
        return () => window.removeEventListener(EVENTO_ABRIR_PRIMER_ARRANQUE, alAbrir);
    }, [sesion]);

    const saltar = useCallback(() => {
        ponerMarca(CLAVE_INTRO_SALTADA);
        setMarcas((m) => ({ ...m, introSaltada: true }));
        setAbierta(null);
    }, []);

    const cerrarAviso = useCallback(() => {
        ponerMarca(CLAVE_AVISO_WEB, "sesion");
        setMarcas((m) => ({ ...m, avisoWebCerrado: true }));
        setAbierta(null);
    }, []);

    const posponerNeurona = useCallback(() => {
        ponerMarca(CLAVE_NEURONA_POSPUESTA, "sesion");
        setMarcas((m) => ({ ...m, neuronaPospuesta: true }));
        setAbierta(null);
    }, []);

    if (!abierta) return null;
    if (abierta.tipo === "neurona") {
        return (
            <NeuronSetup
                nombreInicial={nombreNeurona}
                onPosponer={posponerNeurona}
                onClose={() => {
                    setNeurona((n) => (n ? { ...n, configuradaAqui: leerMarca(CLAVE_NEURONA_CONFIGURADA) } : n));
                    setAbierta(null);
                }}
            />
        );
    }
    if (abierta.tipo === "aviso") {
        return (
            <AvisoBienvenidaWeb
                onAbrir={(paso) => setAbierta({ tipo: "acceso", paso })}
                onCerrar={cerrarAviso}
                onSaltar={saltar}
            />
        );
    }
    return <VentanaBienvenida pasoInicial={abierta.paso} onSaltar={saltar} onCerrar={() => setAbierta(null)} />;
}

/* ───────────────────────── Aviso discreto (web sin sesión) ───────────────────────── */

export function AvisoBienvenidaWeb({
    onAbrir,
    onCerrar,
    onSaltar,
}: {
    onAbrir: (paso: "intro" | "acceso") => void;
    onCerrar: () => void;
    onSaltar: () => void;
}) {
    const reducir = useReducedMotion() ?? false;
    return (
        <motion.section
            role="region"
            aria-labelledby="aviso-bienvenida-titulo"
            initial={reducir ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducir ? 0.15 : 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-0 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+5.5rem)] z-[72] mx-auto w-[min(92vw,26rem)] rounded-2xl border border-white/12 bg-[#0c0e18]/90 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl"
            data-testid="aviso-bienvenida-web"
        >
            <BotonCerrar etiqueta="Cerrar el aviso" tamano="sm" posicion="interior" variante="sutil" onClick={onCerrar} />
            <div className="flex items-start gap-3 pr-8">
                <IconoStarSeed size={36} className="shrink-0" />
                <div className="min-w-0">
                    <h2 id="aviso-bienvenida-titulo" className="text-sm font-semibold text-white">
                        Te damos la bienvenida a StarSeed OS
                    </h2>
                    <p className="mt-0.5 text-xs leading-snug text-white/65">
                        Crea tu cuenta o entra para tener tus escritorios, tu biblioteca y a Aurora en todos tus dispositivos.
                    </p>
                </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" className="h-9 cursor-pointer" onClick={() => onAbrir("acceso")}>
                    Entrar o crear cuenta
                </Button>
                <Button size="sm" variant="outline" className="h-9 cursor-pointer border-white/15" onClick={() => onAbrir("intro")}>
                    Ver la introducción
                </Button>
                <button
                    type="button"
                    onClick={onSaltar}
                    className="ml-auto cursor-pointer rounded-md px-1 text-xs text-white/55 underline-offset-2 hover:text-white/85 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                >
                    Explorar sin cuenta
                </button>
            </div>
        </motion.section>
    );
}

/* ──────────────────── Ventana «bienvenida → qué es → gestos → acceso» ──────────────────── */

const PASOS = ["bienvenida", "que-es", "gestos", "acceso"] as const;
type PasoVentana = (typeof PASOS)[number];

const TEXTOS: Record<PasoVentana, { titulo: string; texto: string }> = {
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

const QUE_ES = [
    { icono: LayoutGrid, titulo: "Tus escritorios", texto: "Ventanas, widgets y apps que se sincronizan en todos tus dispositivos." },
    { icono: Sparkles, titulo: "Aurora, tu inteligencia", texto: "Una IA que es tuya: te guía, crea contigo y también funciona en tu propio equipo." },
    { icono: BookOpen, titulo: "Biblioteca y apps", texto: "Lo que guardas e instalas te sigue a cualquier dispositivo." },
    { icono: Users, titulo: "Comunidad y gobernanza", texto: "Decide con otras personas sin intermediarios: una persona, una voz." },
];

export function VentanaBienvenida({
    pasoInicial,
    onSaltar,
    onCerrar,
}: {
    pasoInicial: "intro" | "acceso";
    onSaltar: () => void;
    onCerrar: () => void;
}) {
    const reducir = useReducedMotion() ?? false;
    const [indice, setIndice] = useState(pasoInicial === "acceso" ? PASOS.length - 1 : 0);
    const [pestana, setPestana] = useState<"signin" | "signup">("signup");
    const direccion = useDireccionPaso(indice);
    const paso = PASOS[indice];
    const ultimo = indice === PASOS.length - 1;

    const siguiente = useCallback(() => setIndice((i) => Math.min(PASOS.length - 1, i + 1)), []);
    const anterior = useCallback(() => setIndice((i) => Math.max(0, i - 1)), []);
    const irAlAcceso = useCallback((p: "signin" | "signup") => {
        setPestana(p);
        setIndice(PASOS.length - 1);
    }, []);
    // Pasar de página deslizando solo en los pasos de lectura (la práctica de gestos y el
    // formulario usan el dedo para otra cosa).
    const deslizar = useDeslizarPasos({ alSiguiente: siguiente, alAnterior: anterior, habilitado: paso === "bienvenida" || paso === "que-es" });

    return (
        <Dialog open onOpenChange={(o) => { if (!o) onCerrar(); }}>
            <DialogContent className={cn(CLASES_VENTANA_ARRANQUE, "sm:max-w-2xl")} aria-describedby="bienvenida-desc" data-testid="ventana-bienvenida">
                <DialogHeader className="items-center text-center">
                    <IconoStarSeed className="mx-auto" size={48} />
                    <DialogTitle>{TEXTOS[paso].titulo}</DialogTitle>
                    <DialogDescription id="bienvenida-desc">{TEXTOS[paso].texto}</DialogDescription>
                    <div className="flex items-center justify-center gap-1.5 pt-1" aria-hidden>
                        {PASOS.map((p, i) => (
                            <span
                                key={p}
                                className={cn(
                                    "h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none",
                                    i === indice ? "w-6 bg-cyan-300" : "w-1.5 bg-white/25",
                                )}
                            />
                        ))}
                    </div>
                    <p className="sr-only" aria-live="polite">Paso {indice + 1} de {PASOS.length}</p>
                </DialogHeader>

                <div {...deslizar}>
                    <PasoAnimado clave={paso} direccion={direccion} className="min-h-[14rem]">
                        {paso === "bienvenida" && (
                            <div className="flex flex-col items-center gap-3 text-center">
                                <StepDemo stepKey="orbe" accent="#C9A8FF" reduce={reducir} />
                                <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                                    <Button className="cursor-pointer" onClick={siguiente}>
                                        Empezar la introducción
                                    </Button>
                                    <Button variant="outline" className="cursor-pointer border-white/15" onClick={() => irAlAcceso("signin")}>
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
                                                <span className="block text-xs leading-snug text-muted-foreground">{texto}</span>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {paso === "gestos" && <DemoGestosHibridos accent="#6FE6D6" reduce={reducir} />}
                        {paso === "acceso" && (
                            <div className="flex justify-center">
                                <AuthForm key={pestana} pestanaInicial={pestana} />
                            </div>
                        )}
                    </PasoAnimado>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                        type="button"
                        onClick={onSaltar}
                        className="cursor-pointer rounded-md px-1 text-xs text-white/60 underline-offset-2 hover:text-white/90 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                    >
                        Explorar sin cuenta
                    </button>
                    <div className="flex gap-2">
                        {indice > 0 && (
                            <Button variant="outline" size="sm" onClick={anterior} className="gap-1 cursor-pointer border-white/15">
                                <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Atrás
                            </Button>
                        )}
                        {!ultimo && (
                            <Button size="sm" onClick={siguiente} className="gap-1 cursor-pointer">
                                {indice === PASOS.length - 2 ? "Crear cuenta o entrar" : "Siguiente"} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default PrimerArranque;
