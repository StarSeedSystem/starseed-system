"use client";

/**
 * StarSeed XR · ESCENA OS (XR1010G, contrato §3 a y c). El núcleo del OS en 3D en `/xr/os`: lienzo R3F con el
 * almacén XR (XR1010D), `<XROrigin>`, fondo y luz de `tokens-3d.ts`; encima, en 2D SIEMPRE visible, el botón
 * universal (XR1010E) y «Salir al sistema». Entrada automática UNA vez si el plan la permite (Quest con la PWA
 * instalada: tocar el icono ya es el gesto); si el navegador la rechaza NO insiste: quedan botón y motivo. Con
 * `offerSession` entra el navegador por su cuenta (lo lleva el almacén): no se repite. Sin WebXR, la misma escena
 * en pantalla con OrbitControls; al terminar (`onSessionEnd`) se vuelve a esa vista sin perder estado y la
 * altura de ojos de la pose queda en `alturaOjosRef` para el recentrado (XR1010J).
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { XR, XROrigin, useXR, type XRStore } from "@react-three/xr";
import { OrbitControls } from "@react-three/drei";
import Link from "next/link";
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import type { PlanEntrada } from "@/lib/xr/capacidades";
import type { ModoXR } from "@/lib/xr/tipos";
import { CRISTAL } from "@/lib/xr/tokens-3d";
import { mensajeErrorXR } from "@/components/vivo/espacial/use-sesion-xr";
import type { ModoXR as ModoURL } from "@/lib/vivo/xr";
import { BotonEntradaXR } from "./boton-entrada-xr";
import { useCapacidadesXR } from "./use-capacidades-xr";

const PERFIL = PERFILES.media;
type Props = { modo?: ModoURL | null };

export type ModoSesion = "vr-inmersivo" | "ar-passthrough" | "ar-mano";

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

function AlturaOjos({ refAltura }: { refAltura: { current: { metros: number } | null } }) {
    const sesion = useXR((s) => s.session);
    const camara = useThree((s) => s.camera);
    useEffect(() => {
        if (!sesion) return;
        const reloj = window.setTimeout(() => { refAltura.current = { metros: alturaOjosDe(camara.position.y) }; }, 600);
        return () => window.clearTimeout(reloj);
    }, [sesion, camara, refAltura]);
    return null;
}

export default function EscenaOS({ modo = null }: Props) {
    // El sondeo pide en concreto el modo de la URL (en móvil el botón se ajusta con `modoBotonDe`).
    const { estado, capacidades, plan } = useCapacidadesXR({ modo: modo === "vr" ? "vr-inmersivo" : modo === "ar" ? "ar-passthrough" : "auto" });
    const [almacen, setAlmacen] = useState<XRStore | null>(null);
    const [fallo, setFallo] = useState<string | null>(null);
    const [enSesion, setEnSesion] = useState(false);
    const intentadoRef = useRef(false);
    const alturaOjosRef = useRef<{ metros: number } | null>(null);

    // Una sola pasada: conseguir el almacén (el botón comparte el singleton) y, si toca, entrar solo;
    // un rechazo del navegador no se vuelve a intentar.
    useEffect(() => {
        if (estado !== "listo" || intentadoRef.current) return;
        intentadoRef.current = true;
        let vivo = true;
        void (async () => {
            try {
                const { obtenerAlmacenXR } = await import("./almacen-xr");
                const a = await obtenerAlmacenXR({ perfil: PERFIL, capacidades });
                if (!vivo) return;
                setAlmacen(a);
                const destino = debeAutoEntrar({ modo, plan, yaIntentado: false });
                if (destino === null) return;
                await (destino === "vr-inmersivo" ? a.enterVR() : a.enterAR());
                if (vivo) setEnSesion(true);
            } catch (e) {
                if (vivo) setFallo(mensajeErrorXR(e));
            }
        })();
        return () => { vivo = false; };
    }, [estado, modo, plan, capacidades]);
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
                    <XR store={almacen}><XROrigin /><AlturaOjos refAltura={alturaOjosRef} /></XR>
                )}
                    {!enSesion && <OrbitControls />}
                </Suspense>
            </Canvas>
            <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-3 p-4" data-testid="corte-xr">
                <BotonEntradaXR variante="insertado" modo={modoBotonDe(modo, capacidades.modos)} />
                {fallo !== null && <p className="max-w-xs text-xs text-[#DC143C]" role="alert" data-testid="fallo-auto-entrar">{fallo}</p>}
                <Link href="/dashboard" data-testid="salir-sistema" className="cursor-pointer ml-auto inline-flex min-h-11 items-center text-sm text-[#F5F7FF] underline decoration-white/30 underline-offset-4 hover:decoration-[#39FF14]">
                    Salir al sistema
                </Link>
            </div>
        </div>
    );
}
