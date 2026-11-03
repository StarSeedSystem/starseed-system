"use client";

/**
 * StarSeed XR · ESCENA OS (XR1010G, §3 a y c): el OS en 3D en `/xr/os` con lienzo R3F, almacén XR (XR1010D),
 * `<XROrigin>`, fondo y luz de `tokens-3d.ts`; encima, siempre en 2D, el botón universal y «Salir al sistema».
 * Entrada automática UNA vez si el plan la permite (un rechazo no se reintenta); altura de ojos en `alturaOjosRef`.
 * El rig de la Trinity (XR1010J) monta aquí sus cuatro nodos cardinales; sin WebXR, misma escena con OrbitControls; `onSessionEnd` vuelve sin perder estado; `offerSession` lo lleva el almacén.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { XR, XROrigin, useXR, type XRStore } from "@react-three/xr";
import { OrbitControls } from "@react-three/drei";
import nextDynamic from "next/dynamic";
import Link from "next/link";
import { nivelInicial, perfilDeNivel } from "@/lib/xr/calidad";
import { modeloQuest, type PlanEntrada } from "@/lib/xr/capacidades";
import { useCalidadDinamica } from "./use-calidad-dinamica";
import { leerMundo } from "@/lib/vivo/xr-mundo";
import type { MundoSpec } from "@/lib/xr/mundo-tipos";
import type { ContextoAcciones } from "./acciones-xr";
import { refSalaDeUrl } from "./ejecutor-mundo";
import type { ModoXR } from "@/lib/xr/tipos";
import { CRISTAL } from "@/lib/xr/tokens-3d";
import { mensajeErrorXR } from "@/components/vivo/espacial/use-sesion-xr";
import type { ModoXR as ModoURL } from "@/lib/vivo/xr";
import { BotonEntradaXR } from "./boton-entrada-xr";
import { useCapacidadesXR } from "./use-capacidades-xr";

type ModoRuta = ModoURL | "pantalla" | null;
type Props = { modo?: ModoRuta };

export type ModoSesion = "vr-inmersivo" | "ar-passthrough" | "ar-mano";

/** Montaje final (XR1010AS): la Trinity con sus cuatro nodos, menú, mundos, presencia y audio; perezoso. */
const MontajeTrinityDinamico = nextDynamic(() => import("./contenido-trinity").then((m) => m.MontajeTrinity), { ssr: false });

/** Comodidad (XR1010AF): viñeta, giro por saltos, subtítulos y postura; carga perezosa como el resto. */
const ComodidadDinamica = nextDynamic(() => import("./comodidad").then((m) => m.Comodidad), { ssr: false });

export interface CapaUiSpec { forma?: string; uiSpec?: unknown }

/** El UiSpec del ÚLTIMO widget de capa (lo publica Astraura): la página declarativa que toca pintar. */
export function uiSpecDeCapas(capas: readonly CapaUiSpec[]): unknown | null {
    for (let i = capas.length - 1; i >= 0; i -= 1) {
        const capa = capas[i];
        if (capa?.forma === "widget" && capa.uiSpec != null) return capa.uiSpec;
    }
    return null;
}

/** El modo con que `disponerTrinity` coloca la Trinity según lo pedido por la URL. */
export function modoTrinity(modoUrl: ModoURL | null, plan: PlanEntrada): ModoXR {
    if (modoUrl === "vr") return "vr-inmersivo";
    if (modoUrl === "ar") return plan.modo === "ar-mano" ? "ar-mano" : "ar-passthrough";
    return "3d-pantalla";
}

/** ¿Entrar solo al abrir la página? URL que pide modo + plan de PWA instalada en Quest + primera vez. */
export function debeAutoEntrar(o: { modo: ModoURL | null; plan: PlanEntrada; yaIntentado: boolean }): ModoSesion | null {
    if (o.yaIntentado || o.modo === null || o.plan.estrategia !== "auto-al-abrir" || o.plan.requiereGesto) return null;
    if (o.modo === "vr") return o.plan.modo === "vr-inmersivo" ? "vr-inmersivo" : null;
    return o.plan.modo === "ar-passthrough" || o.plan.modo === "ar-mano" ? o.plan.modo : null;
}

/** El modo pedido por la URL, como lo pide el botón (para AR, el que este aparato puede). */
export function modoBotonDe(modo: ModoURL | null, modos: readonly ModoXR[]): ModoXR | "auto" {
    if (modo === null) return "auto";
    const pedidos: ModoXR[] = modo === "vr" ? ["vr-inmersivo"] : ["ar-passthrough", "ar-mano"];
    return pedidos.find((m) => modos.includes(m)) ?? "auto";
}

/** Altura de ojos saneada en metros (0,8–2,2) para el recentrado de XR1010J. */
export function alturaOjosDe(metros: number): number {
    if (!Number.isFinite(metros)) return 1.7;
    return Math.round(Math.min(2.2, Math.max(0.8, metros)) * 100) / 100;
}

function AlturaOjos({ refAltura, alMedir }: { refAltura: { current: { metros: number } | null }; alMedir: (m: number) => void }) {
    const sesion = useXR((s) => s.session);
    const camara = useThree((s) => s.camera);
    useEffect(() => {
        if (!sesion) return;
        const reloj = window.setTimeout(() => {
            const metros = alturaOjosDe(camara.position.y);
            refAltura.current = { metros };
            alMedir(metros);
        }, 600);
        return () => window.clearTimeout(reloj);
    }, [sesion, camara, refAltura, alMedir]);
    return null;
}

export function EscenaOS({ modo = null }: Props) {
    const modoUrl: ModoURL | null = modo === "vr" || modo === "ar" ? modo : null;
    const { estado, datos, capacidades, plan } = useCapacidadesXR({ modo: modoUrl === "vr" ? "vr-inmersivo" : modoUrl === "ar" ? "ar-passthrough" : "auto" });
    const [almacen, setAlmacen] = useState<XRStore | null>(null);
    const [fallo, setFallo] = useState<string | null>(null);
    const [enSesion, setEnSesion] = useState(false);
    const [alturaOjosMedida, setAlturaOjosMedida] = useState<number | null>(null);
    const [giroRig, setGiroRig] = useState(0);
    const [pagina, setPagina] = useState<unknown | null>(null);
    const [mundo, setMundo] = useState<MundoSpec | null>(null);
    const [mundoRefId, setMundoRefId] = useState<string | null>(null);
    const [menuAbierto, setMenuAbierto] = useState(false);
    const intentadoRef = useRef(false);
    const alturaOjosRef = useRef<{ metros: number } | null>(null);
    const { nivel: calidadNivel, cambio, aviso } = useCalidadDinamica();

    // Mundo abierto por la URL (?mundo=<id> o /sala-xr/<id>): se lee UNA vez de la misma fila de la sala.
    useEffect(() => {
        const refId = refSalaDeUrl(window.location.pathname, window.location.search);
        if (!refId) return;
        let vivo = true;
        setMundoRefId(refId);
        void leerMundo(refId).then((m) => { if (vivo) setMundo(m); });
        return () => { vivo = false; };
    }, []);

    // Acciones del menú de mano y del motor de entrada (XR1010L): salir y recentrar, reales.
    const acciones: ContextoAcciones = {
        recentrar: () => setGiroRig(0),
        salir: async () => { try { await almacen?.getState().session?.end(); } catch { /* sin sesión abierta */ } },
        abrirMenuMano: () => setMenuAbierto((v) => !v), abrirDock: () => setMenuAbierto(false), atras: () => setMenuAbierto(false),
        hablar: () => undefined, seleccionar: () => undefined, agarrar: () => undefined, teletransporte: () => undefined, girar: () => undefined,
    };

    // Página declarativa del OS: el widget UiSpec que publica Astraura se pinta en 3D (nunca código).
    useEffect(() => {
        let vivo = true; let soltar: (() => void) | null = null;
        void import("@/lib/astraura-bots/adaptadores/ejecutor-acciones").then((m) => {
            if (!vivo) return;
            const aplicar = (capas: readonly CapaUiSpec[]) => setPagina(uiSpecDeCapas(capas));
            aplicar(m.capasPanelAhora());
            const oyente = (e: Event) => { const c = (e as CustomEvent<{ capas?: readonly CapaUiSpec[] }>).detail?.capas; if (Array.isArray(c)) aplicar(c); };
            window.addEventListener(m.EVENTO_CAPA_BOT, oyente);
            soltar = () => window.removeEventListener(m.EVENTO_CAPA_BOT, oyente);
        }).catch(() => undefined);
        return () => { vivo = false; soltar?.(); };
    }, []);

    // Una sola pasada: conseguir el almacén (el botón comparte el singleton) y, si toca, entrar solo.
    useEffect(() => {
        if (estado !== "listo" || intentadoRef.current) return;
        intentadoRef.current = true;
        let vivo = true;
        void (async () => {
            try {
                const { obtenerAlmacenXR } = await import("./almacen-xr");
                // Perfil de calidad INICIAL del aparato (núcleo puro): el nivel guardado entra en la primera sesión.
                const perfil = perfilDeNivel(nivelInicial({ plataforma: capacidades.plataforma, modelo: modeloQuest(datos.ua) }));
                const a = await obtenerAlmacenXR({ perfil, capacidades });
                if (!vivo) return;
                setAlmacen(a);
                const destino = debeAutoEntrar({ modo: modoUrl, plan, yaIntentado: false });
                if (destino === null) return;
                await (destino === "vr-inmersivo" ? a.enterVR() : a.enterAR());
                if (vivo) setEnSesion(true);
            } catch (e) {
                if (vivo) setFallo(mensajeErrorXR(e));
            }
        })();
        return () => { vivo = false; };
    }, [estado, datos, modoUrl, plan, capacidades]);
    useEffect(() => {
        if (almacen === null) return;
        const soltar = almacen.onSessionEnd(() => setEnSesion(false));
        return () => { soltar(); };
    }, [almacen]);

    return (
        <div className="relative h-full w-full" data-testid="escena-os">
            <Canvas>
                <color attach="background" args={[CRISTAL.fondoB.color]} />
                <ambientLight intensity={0.7} />
                <Suspense fallback={null}>
                {almacen !== null && (
                    <XR store={almacen}>
                        <XROrigin rotation={[0, -giroRig, 0]} />
                        <AlturaOjos refAltura={alturaOjosRef} alMedir={setAlturaOjosMedida} />
                        {/* Montaje final (XR1010AS): dentro del almacén, porque el menú de mano lee las entradas XR. */}
                        <group rotation={[0, -giroRig, 0]}>
                            <MontajeTrinityDinamico
                                modo={modoTrinity(modoUrl, plan)}
                                nivel={calidadNivel}
                                alturaOjos={alturaOjosMedida ?? undefined}
                                mundo={mundo}
                                mundoRefId={mundoRefId}
                                pagina={pagina}
                                acciones={acciones}
                                menuAbierto={menuAbierto}
                            />
                        </group>
                    </XR>
                )}
                    {/* Comodidad (XR1010AF): aquí se APLICA el confort (§3 j), no solo se exporta. */}
                    <ComodidadDinamica
                        modo={modoTrinity(modoUrl, plan)}
                        alturaOjos={alturaOjosMedida ?? 1.6}
                        yawActual={() => giroRig}
                        alGirar={setGiroRig}
                    />
                    {!enSesion && <OrbitControls />}
                </Suspense>
            </Canvas>
            <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-3 p-4" data-testid="corte-xr">
                {aviso && <p className="max-w-xs text-xs text-[#F5F7FF] bg-[#1E1E2E] px-3 py-1 rounded text-center" role="alert">{aviso}</p>}
                <BotonEntradaXR variante="insertado" modo={modoBotonDe(modoUrl, capacidades.modos)} alEntrar={() => setEnSesion(true)} />
                {fallo !== null && <p className="max-w-xs text-xs text-[#DC143C]" role="alert" data-testid="fallo-auto-entrar">{fallo}</p>}
                <Link href="/dashboard" data-testid="salir-sistema" className="cursor-pointer ml-auto inline-flex min-h-11 items-center text-sm text-[#F5F7FF] underline decoration-white/30 underline-offset-4 hover:decoration-[#39FF14]">
                    Salir al sistema
                </Link>
            </div>
        </div>
    );
}

export default EscenaOS;
