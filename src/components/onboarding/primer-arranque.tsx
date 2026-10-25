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
 *     real de la guía) → crear cuenta / entrar. Esa ventana es LA ventana de acceso única
 *     (`auth/ventana-acceso.tsx`, la misma que pintan /login y /bienvenida). «Explorar sin
 *     cuenta» la salta y ya no vuelve sola en este dispositivo.
 *   · Sin sesión, en una web normal → un aviso discreto que abre esa misma ventana.
 *   · Con cuenta y neurona nueva → los ajustes de la nueva neurona (NeuronSetup).
 *
 * Persistencia entre medios (2026-09-29): con cuenta, NO decide «neurona nueva» hasta que la
 * cuenta esté bajada (`esperarPullInicial`): un medio recién abierto tiene el localStorage vacío y
 * antes concluía «nunca configurada». «Configurada» y «Más tarde» (por neurona) viajan con la
 * cuenta (`avisos-cuenta`); la marca local antigua se respeta y se copia. Si la cuenta ya tiene
 * otras neuronas, «Neurona nueva» pregunta primero si ESTA es una de ellas (`NeuronSetup`).
 *
 * «Una ventana cada vez»: antes de abrir espera a que el primer plano quede libre (ningún
 * diálogo, ni la guía, ni una ventana del rito, ni el Configurar Neurona). Siempre se puede
 * abrir a mano con `abrirPrimerArranque()` (Ajustes → Personalización).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { BotonCerrar } from "@/components/ui/boton-cerrar";
import { VentanaAcceso } from "@/components/auth/ventana-acceso";
import { esRutaConsola } from "@/components/layout/solo-fuera-de-consola";
import { createClient } from "@/utils/supabase/client";
import { NEURON_PREFS_KEY, thisDeviceId } from "@/lib/neurons/neurons";
import { esAppNativa } from "@/lib/apps-oficiales/dispositivo-actual";
import { isRunningStandalone } from "@/lib/install/device-install";
import { etapaActual, suscribirRito } from "@/lib/onboarding/director-rito";
import { primerPlanoOcupado } from "@/lib/ui/fullscreen-modal";
import { cuandoCuentaFiable, esperarPullInicial } from "@/lib/sync/realtime-sync";
import { ritoActivo } from "@/lib/ui/rito-activo";
import {
    CLAVE_AVISO_WEB,
    CLAVE_INTRO_SALTADA,
    CLAVE_NEURONA_POSPUESTA,
    EVENTO_ABRIR_PRIMER_ARRANQUE,
    copiarNeuronaConfiguradaACuenta,
    creadaDesde,
    decidirPrimerArranque,
    leerMarca,
    neuronaConfiguradaAqui,
    neuronaPospuestaEnCuenta,
    ponerMarca,
    posponerNeuronaEnCuenta,
    type EstadoNeurona,
    type EstadoSesion,
    type ModoApp,
    type PasoInicial,
    type PestanaInicial,
} from "@/lib/onboarding/primer-arranque";

import { IconoStarSeed } from "./icono-starseed";
import { NeuronSetup } from "./neuron-setup";

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

type Abierta = null | { tipo: "acceso"; paso: "intro" | "acceso"; pestana?: PestanaInicial } | { tipo: "aviso" } | { tipo: "neurona" };

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
    /** Espera viva a que la cuenta sea fiable (una sola a la vez). */
    const esperaCuentaRef = useRef<(() => void) | null>(null);
    useEffect(() => () => { esperaCuentaRef.current?.(); }, []);

    const leerMarcas = useCallback(() => {
        setMarcas({
            introSaltada: leerMarca(CLAVE_INTRO_SALTADA),
            avisoWebCerrado: leerMarca(CLAVE_AVISO_WEB, "sesion"),
            // «Más tarde»: la de esta visita, o la que quedó en la cuenta para esta neurona.
            neuronaPospuesta: leerMarca(CLAVE_NEURONA_POSPUESTA, "sesion") || neuronaPospuestaEnCuenta(thisDeviceId()),
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
            // La cuenta debe estar BAJADA antes de decidir nada sobre esta neurona: en un medio
            // nuevo, lo que la cuenta ya sabe (configurada, «más tarde», nombre, ajustes) aún no
            // está en su localStorage. Si no se puede leer (corte, sin red), no se decide a ciegas:
            // se espera a que la lectura tenga éxito y entonces se vuelve a evaluar.
            const cuenta = await esperarPullInicial(4000);
            if (!cuenta.fiable) {
                esperaCuentaRef.current?.();
                esperaCuentaRef.current = cuandoCuentaFiable(() => { void evaluar(); }, 0);
                return;
            }
            let perfil = false;
            try {
                const { data: prof } = await sb.from("profiles").select("handle").eq("user_id", user.id).maybeSingle();
                perfil = Boolean((prof as { handle?: string } | null)?.handle);
            } catch {
                perfil = false; // sin datos, no se abre nada encima de nadie
            }
            const id = thisDeviceId();
            copiarNeuronaConfiguradaACuenta(id); // una marca local antigua se hereda en los demás medios
            leerMarcas(); // ya con la cuenta bajada: «Más tarde» y demás marcas al día
            let estado: EstadoNeurona;
            try {
                const { data: fila, error } = await sb
                    .from("neuron_devices")
                    .select("id, name, created_at")
                    .eq("id", id)
                    .maybeSingle();
                const f = fila as { name?: string; created_at?: string } | null;
                estado = {
                    configuradaAqui: neuronaConfiguradaAqui(id),
                    // Con error de red no se sabe: se decide solo por nombre/ajustes y la marca.
                    enCuenta: error ? true : Boolean(f),
                    creadaEnEsteArranque: error ? false : creadaDesde(f?.created_at, arranqueRef.current),
                    tieneNombreOAjustes: tieneNombreOAjustes(id),
                };
                setNombreNeurona(f?.name ?? "");
            } catch {
                estado = { configuradaAqui: neuronaConfiguradaAqui(id), enCuenta: true, creadaEnEsteArranque: false, tieneNombreOAjustes: tieneNombreOAjustes(id) };
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
            const detalle = (e as CustomEvent<{ paso?: PasoInicial; pestana?: PestanaInicial }>).detail;
            const paso = detalle?.paso;
            if (paso === "neurona" || (sesion === "cuenta" && paso !== "intro" && paso !== "acceso")) {
                setAbierta({ tipo: "neurona" });
            } else {
                const pestana = detalle?.pestana === "signin" || detalle?.pestana === "signup" ? detalle.pestana : undefined;
                setAbierta({ tipo: "acceso", paso: paso === "acceso" ? "acceso" : "intro", pestana });
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
        posponerNeuronaEnCuenta(thisDeviceId()); // y con la cuenta, por neurona: no vuelve al reiniciar ni en otro medio
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
                    setNeurona((n) => (n ? { ...n, configuradaAqui: neuronaConfiguradaAqui(thisDeviceId()) } : n));
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
    return (
        <VentanaAcceso
            pasoInicial={abierta.paso}
            pestanaInicial={abierta.pestana}
            onSaltar={saltar}
            onCerrar={() => setAbierta(null)}
        />
    );
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

export default PrimerArranque;
