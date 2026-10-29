"use client";

/**
 * StarSeed XR · ESCENA OS (XR1010G, §3 a y c): el OS en 3D en `/xr/os` con lienzo R3F, almacén XR (XR1010D),
 * `<XROrigin>`, fondo y luz de `tokens-3d.ts`; encima, siempre en 2D, el botón universal y «Salir al sistema».
 * Entrada automática UNA vez si el plan la permite (un rechazo no se reintenta); altura de ojos en `alturaOjosRef`.
 * Para el recentrado (XR1010J); sin WebXR, misma escena con OrbitControls; `onSessionEnd` vuelve sin perder estado; `offerSession` lo lleva el almacén.
 * Física (XR1010W): `useFisica` corre Rapier y pinta las poses de los cuerpos dinámicos; el mundo real lo cablea XR1010AS.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { XR, XROrigin, useXR, type XRStore } from "@react-three/xr";
import { OrbitControls } from "@react-three/drei";
import nextDynamic from "next/dynamic";
import Link from "next/link";
import { nivelInicial, perfilDeNivel } from "@/lib/xr/calidad";
import { modeloQuest, type PlanEntrada } from "@/lib/xr/capacidades";
import { useCalidadDinamica } from "./use-calidad-dinamica";
import type { ModoXR, NivelCalidad } from "@/lib/xr/tipos";
import { CRISTAL } from "@/lib/xr/tokens-3d";
import { mensajeErrorXR } from "@/components/vivo/espacial/use-sesion-xr";
import type { ModoXR as ModoURL } from "@/lib/vivo/xr";
import { BotonEntradaXR } from "./boton-entrada-xr";
import { useCapacidadesXR } from "./use-capacidades-xr";
import { useFisica } from "./use-fisica";
import { aplicarFuerza, leerChoques, type ChoqueCuerpo } from "./fisica-rapier";
import type { MundoSpec } from "@/lib/xr/mundo-tipos";

type ModoRuta = ModoURL | "pantalla" | null;
type Props = { modo?: ModoRuta; esAnfitrion?: boolean; mundo?: MundoSpec };

/** Mundo por defecto (XR1010W): orbes dinámicos que caen al suelo; XR1010AS pasará el mundo real. */
const MUNDO_BIENVENIDA: MundoSpec = {
    version: 1, tipo: "mundo-xr", nombre: "Bienvenida", modo: "ambos",
    entorno: { cielo: "nebulosa", terreno: "plano", tamano: 20, colorSuelo: "#101426", semilla: 1, alturaMax: 2 },
    fisica: { gravedad: -9.81, suelo: true }, interaccion: { tocar: "observador", agarrar: "editor" }, maxJugadores: 8,
    spawns: [{ id: "entrada", pos: [0, 0, 0], yaw: 0 }], luces: [], portales: [], zonas: [], pizarras: [], pantallas: [], reglas: [],
    objetos: [
        { id: "orbe-verde", nombre: "Orbe verde", fuente: { tipo: "primitiva", forma: "esfera" }, pos: [-0.6, 2.2, -1], rot: [0, 0, 0], esc: [0.3, 0.3, 0.3], color: "#39FF14", prioridad: 2, cuerpo: { tipo: "dinamico", forma: "esfera", masa: 1, rebote: 0.4, friccion: 0.8, agarrable: true } },
        { id: "orbe-violeta", nombre: "Orbe violeta", fuente: { tipo: "primitiva", forma: "esfera" }, pos: [0.6, 2.8, -1], rot: [0, 0, 0], esc: [0.24, 0.24, 0.24], color: "#7c5cff", prioridad: 2, cuerpo: { tipo: "dinamico", forma: "esfera", masa: 1, rebote: 0.4, friccion: 0.8, agarrable: true } },
    ],
};

/** Cuerpos del mundo con Rapier (XR1010W): simula en el anfitrión y pinta las poses de los dinámicos. */
function CuerposFisicos({ mundo, nivel, esAnfitrion, onFallo, onChoque }: { mundo: MundoSpec; nivel: NivelCalidad; esAnfitrion: boolean; onFallo: (motivo: string) => void; onChoque: (choque: ChoqueCuerpo) => void }) {
    const { poses, refMundo } = useFisica({ mundo, nivel, esAnfitrion, onFallo });
    useFrame(() => { const mf = refMundo.current; if (mf) for (const c of leerChoques(mf)) onChoque(c); });
    return (
        <>
            {[...poses].map(([id, pose]) => {
                const objeto = mundo.objetos.find((o) => o.id === id);
                return objeto ? (
                    <mesh key={id} position={pose.pos} quaternion={pose.rot} scale={objeto.esc} onClick={() => { const mf = refMundo.current; if (mf) aplicarFuerza(mf, id, [0, 2.5, 0]); }}>
                        <sphereGeometry args={[0.5, 16, 16]} />
                        <meshStandardMaterial color={objeto.color} roughness={0.35} metalness={0.2} />
                    </mesh>
                ) : null;
            })}
        </>
    );
}

export type ModoSesion = "vr-inmersivo" | "ar-passthrough" | "ar-mano";

/** Panel de cristal del OS (XR1010H): uikit se carga solo al entrar en /xr/os, nunca en el layout raíz. */
const PanelOS = nextDynamic(
    () =>
        import("./panel-cristal").then(({ NivelCalidadContext, PanelCristal, Texto3D }) =>
            function PanelOS({ nivel, opacidadMinima }: { nivel: NivelCalidad; opacidadMinima?: number }) {
                return (
                    <NivelCalidadContext.Provider value={nivel}>
                        <group position={[0, 1.45, -1.35]}>
                            <PanelCristal nodo="logic" ancho={0.8} alto={0.3} curvatura={2.5} opacidadMinima={opacidadMinima}>
                                <Texto3D distancia={1.35}>StarSeed OS</Texto3D>
                            </PanelCristal>
                        </group>
                    </NivelCalidadContext.Provider>
                );
            },
        ),
    { ssr: false },
);

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

export function EscenaOS({ modo = null, esAnfitrion = true, mundo = MUNDO_BIENVENIDA }: Props) {
    const modoUrl: ModoURL | null = modo === "vr" || modo === "ar" ? modo : null;
    const { estado, datos, capacidades, plan } = useCapacidadesXR({ modo: modoUrl === "vr" ? "vr-inmersivo" : modoUrl === "ar" ? "ar-passthrough" : "auto" });
    const [almacen, setAlmacen] = useState<XRStore | null>(null);
    const [fallo, setFallo] = useState<string | null>(null);
    const [falloFisica, setFalloFisica] = useState<string | null>(null);
    const [choque, setChoque] = useState<string | null>(null);
    const [enSesion, setEnSesion] = useState(false);
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
                    <XR store={almacen}><XROrigin /><AlturaOjos refAltura={alturaOjosRef} /></XR>
                )}
                    {estado === "listo" && <CuerposFisicos mundo={mundo} nivel={calidadNivel} esAnfitrion={esAnfitrion} onFallo={setFalloFisica} onChoque={(c) => setChoque(`${c.a} chocó con ${c.b}`)} />}
                    <PanelOS nivel={calidadNivel} opacidadMinima={modoUrl === "ar" ? 0.82 : undefined} />
                    {!enSesion && <OrbitControls />}
                </Suspense>
            </Canvas>
            <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-3 p-4" data-testid="corte-xr">
                {aviso && <p className="max-w-xs text-xs text-[#F5F7FF] bg-[#1E1E2E] px-3 py-1 rounded text-center" role="alert">{aviso}</p>}
                <BotonEntradaXR variante="insertado" modo={modoBotonDe(modoUrl, capacidades.modos)} alEntrar={() => setEnSesion(true)} />
                {fallo !== null && <p className="max-w-xs text-xs text-[#DC143C]" role="alert" data-testid="fallo-auto-entrar">{fallo}</p>}
                {falloFisica !== null && <p className="max-w-xs text-xs text-[#F5F7FF] bg-[#1E1E2E] px-3 py-1 rounded text-center" role="alert" data-testid="fallo-fisica">{falloFisica}</p>}
                {choque !== null && <p className="max-w-xs text-xs text-[#F5F7FF] bg-[#1E1E2E] px-3 py-1 rounded text-center" role="status" data-testid="choque-fisica">{choque}</p>}
                <Link href="/dashboard" data-testid="salir-sistema" className="cursor-pointer ml-auto inline-flex min-h-11 items-center text-sm text-[#F5F7FF] underline decoration-white/30 underline-offset-4 hover:decoration-[#39FF14]">
                    Salir al sistema
                </Link>
            </div>
        </div>
    );
}

export default EscenaOS;
