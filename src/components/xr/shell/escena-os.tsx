"use client";

/**
 * StarSeed XR · ESCENA DEL OS (XR1010G, contrato §3 a y c de `architecture/starseed-xr.md`): lo que
 * enseña `/xr/os`. Canvas R3F con `<XR store>` (el ÚNICO almacén de XR1010D con el perfil inicial
 * `nivelInicial` de `useCapacidadesXR`), `<XROrigin>`, fondo `CRISTAL.fondoB`, luz y `<Suspense>`;
 * encima, en 2D, el botón universal (XR1010E) y «Salir al sistema», SIEMPRE visibles. Entrada
 * automática (§3 c): UNA vez al cargar, sólo si la URL la pide y el plan dice `auto-al-abrir` (PWA
 * de Quest: tocar el icono ya ES el gesto); si el navegador la rechaza NO insiste. Sin WebXR, la
 * misma escena en pantalla (`3d-pantalla`, OrbitControls). Recentrado: al empezar la sesión la
 * altura de ojos de la pose entra en `alturaOjosOS` (XR1010J la lee); al terminar se vuelve al 2D.
 */
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { XR, XROrigin, useXR, type XRStore } from "@react-three/xr";
import { BotonEntradaXR } from "./boton-entrada-xr";
import { useCapacidadesXR } from "./use-capacidades-xr";
import { mensajeErrorXR } from "@/components/vivo/espacial/use-sesion-xr";
import { modeloQuest, type PlanEntrada } from "@/lib/xr/capacidades";
import { nivelInicial, type PerfilDispositivo } from "@/lib/xr/calidad";
import { perfilDeNivel } from "@/lib/xr/calidad-perfiles";
import { CRISTAL } from "@/lib/xr/tokens-3d";
import type { ModoXR as ModoXRUrl } from "@/lib/vivo/xr";
import type { PlataformaVisor } from "@/lib/xr/tipos";

export type ModoSesion = "vr-inmersivo" | "ar-passthrough";
/** `?modo=vr|ar` → sesión inmersiva; `pantalla` (o nada) → sin sesión, 3D en pantalla. */
export const modoSesionDe = (m: ModoXRUrl | null | undefined): ModoSesion | null =>
    m === "vr" ? "vr-inmersivo" : m === "ar" ? "ar-passthrough" : null;

/** Entrada automática del §3 c: la URL la pide, el plan la permite (`auto-al-abrir` y ese modo) y no se intentó antes. */
export function debeAutoEntrar(o: {
    modo: ModoXRUrl | null; // el modo que pidió la URL (`modoXRDe`); si es null, nada entra solo
    plan: PlanEntrada;
    yaIntentado: boolean; // ya se intentó antes: no se insiste más de una vez
}): ModoSesion | null {
    const sesion = modoSesionDe(o.modo);
    if (!sesion || o.yaIntentado) return null;
    return o.plan.estrategia === "auto-al-abrir" && o.plan.modo === sesion ? sesion : null;
}

/** Lo que `nivelInicial` necesita hoy: plataforma y modelo de Quest por UA (XR1010AE trae batería/térmica). */
export function perfilDispositivoOS(plataforma: PlataformaVisor, ua: string): PerfilDispositivo {
    return { plataforma, modelo: modeloQuest(ua) };
}

/** Tramo saneado de una altura de ojos en metros: entre 30 cm y 2,6 m una lectura tiene sentido. */
export const ALTURA_OJOS_TRAMO = { min: 0.3, max: 2.6 } as const;

/** Altura de ojos (m) de una lectura de pose del visor; `null` si la lectura no es creíble. */
export function alturaOjosDePose(y: number): number | null {
    return Number.isFinite(y) && y >= ALTURA_OJOS_TRAMO.min && y <= ALTURA_OJOS_TRAMO.max ? Math.round(y * 100) / 100 : null;
}

/** LA ALTURA DE OJOS MEDIDA para el recentrado: la lee XR1010J. */
export const alturaOjosOS: { valor: number | null } = { valor: null };

/** Mientras la sesión vive, guarda UNA vez la altura de ojos saneada de la pose del visor. */
function VigiaAlturaOjos() {
    const sesion = useXR((s) => s.session);
    const tramo = useRef({ abierta: false, medida: false });
    useFrame((estado) => {
        if (!sesion) { tramo.current = { abierta: false, medida: false }; return; }
        if (!tramo.current.abierta) tramo.current = { abierta: true, medida: false };
        if (tramo.current.medida) return;
        const y = alturaOjosDePose(estado.camera.position.y);
        if (y !== null) { tramo.current.medida = true; alturaOjosOS.valor = y; }
    });
    return null;
}

/** La escena del OS: fondo cristal, luz suave y origen; la Trinity despliega con XR1010AM. */
const ESCENA = (
    <>
        <color attach="background" args={[CRISTAL.fondoB.color]} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[2, 3, 2]} intensity={0.5} />
        <Suspense><XROrigin /></Suspense>
        <OrbitControls />
    </>
);

export interface EscenaOSProps {
    modo?: ModoXRUrl | null;
    /** Fin de la sesión (`onSessionEnd`): se vuelve al 2D sin perder estado; XR1010J conecta aquí. */
    alSalirSesion?: () => void;
}

export function EscenaOS({ modo, alSalirSesion }: EscenaOSProps) {
    const { estado, datos, capacidades, plan } = useCapacidadesXR({ modo: modoSesionDe(modo) ?? "auto" });
    const [almacen, ponerAlmacen] = useState<XRStore | null>(null);
    const [problema, ponerProblema] = useState<string | null>(null);
    const vivos = useRef({ alSalirSesion });
    vivos.current = { alSalirSesion };
    const intentos = useRef({ auto: false, fin: false });
    const perfilOS = () => perfilDeNivel(nivelInicial(perfilDispositivoOS(capacidades.plataforma, datos.ua)));

    useEffect(() => {
        let vivo = true;
        import("./almacen-xr").then((m) => m.obtenerAlmacenXR({ perfil: perfilOS(), capacidades }))
            .then((a) => { if (vivo) ponerAlmacen(a); }, () => undefined);
        return () => { vivo = false; };
    }, [capacidades, datos, perfilOS]);

    const entrar = useCallback(async (m: ModoSesion) => {
        const { obtenerAlmacenXR } = await import("./almacen-xr");
        const a = await obtenerAlmacenXR({ perfil: perfilOS(), capacidades });
        if (!intentos.current.fin) {
            intentos.current.fin = true;
            a.onSessionEnd(() => vivos.current.alSalirSesion?.());
        }
        const sesion = await (m === "vr-inmersivo" ? a.enterVR() : a.enterAR());
        if (!sesion) throw new Error("El navegador no abrió la sesión inmersiva.");
    }, [capacidades, datos, perfilOS]);

    useEffect(() => {
        if (estado === "sondeando" || intentos.current.auto) return;
        intentos.current.auto = true;
        const sesion = debeAutoEntrar({ modo: modo ?? null, plan });
        if (sesion) entrar(sesion).catch((e) => ponerProblema(mensajeErrorXR(e)));
    }, [estado, plan, modo, entrar]);

    return (
        <section className="relative flex min-h-[50vh] flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#060814]/90 shadow-2xl">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <BotonEntradaXR modo={modoSesionDe(modo) ?? "auto"} variante="insertado" />
                {problema !== null && <p role="alert" data-testid="auto-entrada-error" className="text-xs text-[#DC143C]">{problema}</p>}
                <Link href="/dashboard" data-testid="salir-al-sistema"
                    className="cursor-pointer ml-auto rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-[#F5F7FF] transition duration-150 hover:bg-white/10">
                    Salir al sistema
                </Link>
            </div>
            <Canvas className="min-h-[50vh] flex-1" camera={{ fov: 70, position: [0, 1.65, 3.2] }}>
                {almacen === null ? ESCENA : (<XR store={almacen}><VigiaAlturaOjos />{ESCENA}</XR>)}
            </Canvas>
        </section>
    );
}