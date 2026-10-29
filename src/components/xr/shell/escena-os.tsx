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
import type { ModoXR } from "@/lib/xr/tipos";
import { CRISTAL } from "@/lib/xr/tokens-3d";
import { mensajeErrorXR } from "@/components/vivo/espacial/use-sesion-xr";
import type { ModoXR as ModoURL } from "@/lib/vivo/xr";
import { BotonEntradaXR } from "./boton-entrada-xr";
import { useCapacidadesXR } from "./use-capacidades-xr";

type ModoRuta = ModoURL | "pantalla" | null;
type Props = { modo?: ModoRuta };

export type ModoSesion = "vr-inmersivo" | "ar-passthrough" | "ar-mano";

/** El rig de la Trinity (XR1010J): uikit y three se cargan solo al entrar en /xr/os, nunca en el layout raíz. */
const RigTrinityDinamico = nextDynamic(() => import("./rig-trinity").then((m) => m.RigTrinity), { ssr: false });

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
    const intentadoRef = useRef(false);
    const alturaOjosRef = useRef<{ metros: number } | null>(null);
    const { nivel: calidadNivel, cambio, aviso } = useCalidadDinamica();

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
                    <XR store={almacen}><XROrigin /><AlturaOjos refAltura={alturaOjosRef} alMedir={setAlturaOjosMedida} /></XR>
                )}
                    {/* Rig de la Trinity (XR1010J): reemplaza al panel provisional de XR1010G. */}
                    <RigTrinityDinamico
                        modo={modoTrinity(modoUrl, plan)}
                        nivel={calidadNivel}
                        alturaOjosMedida={alturaOjosMedida}
                        contenido={{}}
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
