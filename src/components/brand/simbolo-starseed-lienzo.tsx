'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Lienzo R3F del símbolo 3D (ESC1110A)
// ----------------------------------------------------------------
// Se carga en diferido desde `simbolo-starseed-3d.tsx`. Pinta la escena
// de `simbolo-starseed-escena.ts` (la misma que generó la imagen fija)
// con la cámara de R3F, a demanda: ~30 fps solo mientras se anima, nada
// cuando está quieto, oculto o fuera de pantalla.
// ════════════════════════════════════════════════════════════════

import React from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { crearEscenaSimbolo, EXPOSICION } from "./simbolo-starseed-escena";

/** Cámara de la pose por defecto (igual que en el banco de pruebas). */
export const CAMARA_SIMBOLO = { fov: 22, posicion: [0, 0.05, 5] as [number, number, number], mira: [0, -0.06, 0] as [number, number, number] };

/** Intervalo entre fotogramas mientras se anima (≈ 30 fps: el movimiento es lento). */
const PASO_MS = 33;

interface Props {
    activo: boolean;
    quieto: boolean;
    onListo: () => void;
    onContextoPerdido: () => void;
}

function Escena({ activo, quieto, onListo }: Omit<Props, "onContextoPerdido">): null {
    const { gl, invalidate } = useThree();
    // El entorno (PMREM) se genera antes del primer fotograma: la imagen que funde ya va iluminada.
    const s = React.useMemo(() => {
        const e = crearEscenaSimbolo({ sombraContacto: true, resolucionSombra: 512 });
        e.prepararEntorno(gl);
        return e;
    }, [gl]);
    const puntero = React.useRef({ x: 0, y: 0 });
    const suave = React.useRef({ x: 0, y: 0 });
    const avisado = React.useRef(false);
    const temporizador = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const animar = activo && !quieto;

    React.useEffect(() => {
        invalidate();
        return () => {
            if (temporizador.current) clearTimeout(temporizador.current);
            s.liberar();
        };
    }, [s, invalidate]);

    // Puntero en toda la ventana (el lienzo no recibe eventos), normalizado a [-1, 1].
    React.useEffect(() => {
        if (!animar) return;
        const mover = (e: PointerEvent) => {
            const r = gl.domElement.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            puntero.current.x = THREE.MathUtils.clamp((e.clientX - cx) / (window.innerWidth / 2), -1, 1);
            puntero.current.y = THREE.MathUtils.clamp(-(e.clientY - cy) / (window.innerHeight / 2), -1, 1);
        };
        window.addEventListener("pointermove", mover, { passive: true });
        invalidate();
        return () => window.removeEventListener("pointermove", mover);
    }, [animar, gl, invalidate]);

    // Prioridad 1: este useFrame pinta (R3F deja de pintar su escena vacía).
    useFrame(({ gl: renderer, camera, clock }) => {
        if (animar) {
            suave.current.x += (puntero.current.x - suave.current.x) * 0.08;
            suave.current.y += (puntero.current.y - suave.current.y) * 0.08;
            s.pose(clock.getElapsedTime(), suave.current);
        } else {
            s.pose(0, { x: 0, y: 0 }, true);
        }
        s.antesDeRender(renderer);
        renderer.render(s.escena, camera);
        if (!avisado.current) {
            avisado.current = true;
            onListo();
        }
        if (animar) {
            if (temporizador.current) clearTimeout(temporizador.current);
            temporizador.current = setTimeout(() => invalidate(), PASO_MS);
        }
    }, 1);

    return null;
}

export default function LienzoSimbolo({ activo, quieto, onListo, onContextoPerdido }: Props): React.ReactElement {
    return (
        <Canvas
            frameloop="demand"
            dpr={[1, 2]}
            shadows="percentage"
            gl={{ antialias: true, alpha: true, powerPreference: "low-power", preserveDrawingBuffer: false }}
            camera={{ fov: CAMARA_SIMBOLO.fov, position: CAMARA_SIMBOLO.posicion, near: 0.1, far: 30 }}
            style={{ width: "100%", height: "100%", background: "transparent" }}
            onCreated={({ gl, camera }) => {
                gl.toneMapping = THREE.NeutralToneMapping;
                gl.toneMappingExposure = EXPOSICION;
                gl.outputColorSpace = THREE.SRGBColorSpace;
                gl.setClearColor(0x000000, 0);
                camera.lookAt(...CAMARA_SIMBOLO.mira);
                gl.domElement.addEventListener("webglcontextlost", (e) => {
                    e.preventDefault();
                    onContextoPerdido();
                }, { once: true });
            }}
        >
            <Escena activo={activo} quieto={quieto} onListo={onListo} />
        </Canvas>
    );
}
