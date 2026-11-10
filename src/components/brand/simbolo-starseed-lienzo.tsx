'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Lienzo R3F del símbolo 3D (ESC1110A · ESC1110B)
// ----------------------------------------------------------------
// Se carga en diferido desde `simbolo-starseed-3d.tsx`. Pinta la escena
// de `simbolo-starseed-escena.ts` (la misma que generó la imagen fija)
// con la cámara de R3F, a demanda: ~30 fps solo mientras algo se mueve
// (flotación, mirada, parpadeo, giro de la flor), nada cuando está quieto,
// oculto o fuera de pantalla.
// ESC1110B: la flor fundida, el ojo que mira y parpadea (vía el control
// que le pasa el componente) y el símbolo propio del archivo, si lo hay.
// ════════════════════════════════════════════════════════════════

import React from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { crearEscenaSimbolo, encuadreSimbolo, EXPOSICION } from "./simbolo-starseed-escena";
import { SIMBOLO_OFICIAL, type ArchivoSimbolo } from "./simbolo-archivo";
import { crearControlSimbolo, type ControlSimbolo } from "./simbolo-control";

/** Cámara de la pose por defecto (igual que en el banco de pruebas), sin flor. */
export const CAMARA_SIMBOLO = { fov: 22, posicion: [0, 0.05, 5] as [number, number, number], mira: [0, -0.06, 0] as [number, number, number] };

/** Intervalo entre fotogramas mientras se anima (≈ 30 fps: el movimiento es lento). */
const PASO_MS = 33;

interface Props {
    activo: boolean;
    quieto: boolean;
    onListo: () => void;
    onContextoPerdido: () => void;
    /** ESC1110B: la flor fundida detrás de los discos. */
    conFlor?: boolean;
    /** ESC1110B: el archivo de símbolo. Por defecto, el oficial. */
    archivo?: ArchivoSimbolo;
    /** ESC1110B: mirada, parpadeo y flor (lo alimentan los eventos del componente). */
    control?: ControlSimbolo;
    /** ESC1110B: el símbolo propio no se pudo cargar (se queda el oficial). */
    onErrorModelo?: (motivo: string) => void;
}

function Escena({ activo, quieto, onListo, conFlor = false, archivo = SIMBOLO_OFICIAL, control, onErrorModelo }: Omit<Props, "onContextoPerdido">): null {
    const { gl, invalidate } = useThree();
    // El entorno (PMREM) se genera antes del primer fotograma: la imagen que funde ya va iluminada.
    const s = React.useMemo(() => {
        const e = crearEscenaSimbolo({ sombraContacto: !conFlor, resolucionSombra: 512, flor: conFlor, archivo });
        e.prepararEntorno(gl);
        return e;
    }, [gl, conFlor, archivo]);
    const propio = React.useMemo(() => control ?? crearControlSimbolo(archivo, { reducido: quieto }), [control, archivo, quieto]);
    const avisado = React.useRef(false);
    const temporizador = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const ultimo = React.useRef<number | null>(null);

    React.useEffect(() => {
        invalidate();
        return () => {
            if (temporizador.current) clearTimeout(temporizador.current);
            s.liberar();
        };
    }, [s, invalidate]);

    // ESC1110B: el símbolo propio se carga en diferido; si falla, se queda el oficial.
    React.useEffect(() => {
        if (archivo.fuente.tipo === "oficial") return;
        let vivo = true;
        let cargado: THREE.Object3D | null = null;
        let liberar: ((o: THREE.Object3D) => void) | null = null;
        import("./simbolo-personalizado")
            .then(async (m) => {
                liberar = m.liberarModelo;
                const obj = await m.cargarModeloPropio(archivo);
                if (!vivo) { m.liberarModelo(obj); return; }
                cargado = obj;
                s.usarModeloPropio(obj);
                invalidate();
            })
            .catch((e: unknown) => { if (vivo) onErrorModelo?.((e as Error)?.message || "no se pudo cargar el símbolo propio"); });
        return () => {
            vivo = false;
            if (cargado) { s.usarModeloPropio(null); liberar?.(cargado); }
        };
    }, [s, archivo, invalidate, onErrorModelo]);

    // Cualquier entrada (puntero, clic, flor) pide un fotograma.
    React.useEffect(() => propio.suscribir(() => invalidate()), [propio, invalidate]);
    React.useEffect(() => { if (activo) invalidate(); }, [activo, invalidate]);

    // Prioridad 1: este useFrame pinta (R3F deja de pintar su escena vacía).
    useFrame(({ gl: renderer, camera, clock }) => {
        const ahora = performance.now();
        const dt = ultimo.current === null ? 0 : (ahora - ultimo.current) / 1000;
        ultimo.current = ahora;
        const est = propio.paso(dt, ahora, clock.getElapsedTime());
        s.actualizar({ ...est, quieto: quieto || est.quieto });
        s.antesDeRender(renderer);
        renderer.render(s.escena, camera);
        if (!avisado.current) {
            avisado.current = true;
            onListo();
        }
        const seguir = activo && propio.enMovimiento();
        if (temporizador.current) clearTimeout(temporizador.current);
        if (seguir) temporizador.current = setTimeout(() => invalidate(), PASO_MS);
        else ultimo.current = null;
    }, 1);

    return null;
}

export default function LienzoSimbolo({ activo, quieto, onListo, onContextoPerdido, conFlor = false, archivo, control, onErrorModelo }: Props): React.ReactElement {
    const enc = conFlor ? encuadreSimbolo(true) : { fov: CAMARA_SIMBOLO.fov, posicion: CAMARA_SIMBOLO.posicion, mira: CAMARA_SIMBOLO.mira };
    return (
        <Canvas
            frameloop="demand"
            dpr={[1, 2]}
            shadows="percentage"
            gl={{ antialias: true, alpha: true, powerPreference: "low-power", preserveDrawingBuffer: false }}
            camera={{ fov: enc.fov, position: enc.posicion, near: 0.1, far: 40 }}
            style={{ width: "100%", height: "100%", background: "transparent" }}
            onCreated={({ gl, camera }) => {
                gl.toneMapping = THREE.NeutralToneMapping;
                gl.toneMappingExposure = EXPOSICION;
                gl.outputColorSpace = THREE.SRGBColorSpace;
                gl.setClearColor(0x000000, 0);
                camera.lookAt(...enc.mira);
                gl.domElement.addEventListener("webglcontextlost", (e) => {
                    e.preventDefault();
                    onContextoPerdido();
                }, { once: true });
            }}
        >
            <Escena activo={activo} quieto={quieto} onListo={onListo} conFlor={conFlor} archivo={archivo} control={control} onErrorModelo={onErrorModelo} />
        </Canvas>
    );
}
