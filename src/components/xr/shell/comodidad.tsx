"use client";

/**
 * StarSeed XR · COMODIDAD (XR1010AF · contrato §3 j).
 * <Comodidad> lee usePrefsXR().confort y:
 * 1. Calcula velocidad lineal y angular de cabeza/rig por fotograma y alimenta la viñeta.
 * 2. Aplica giro por saltos (acciones giro-izquierda/derecha con siguienteGiro).
 * 3. Subtítulos: línea 3D (Texto3D ≥ 1°) a 1,5 m, ligeramente por debajo de la mirada.
 * 4. Modo una-mano: reorganiza con disponerTrinity (postura) y agrupa en pestañas.
 * 5. Con movimientoReducido: todo en saltos, sin caminar continuo.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import * as THREE from "three";
import { usePrefsXR } from "./use-prefs-xr";
import { aplicarMovimientoReducido, siguienteGiro } from "@/lib/xr/confort";
import { Texto3D } from "./panel-cristal";
import { Vineta } from "./vineta";
import type { ContextoAcciones } from "./acciones-xr";

export interface PropsComodidad {
    ctx: ContextoAcciones;
    subtitulos?: string;
}

export function Comodidad({ ctx, subtitulos }: PropsComodidad) {
    const { camera } = useThree();
    const { confort } = usePrefsXR();
    const [velocidad, setVelocidad] = useState({ lineal: 0, angular: 0 });
    const anteriorPos = useRef<THREE.Vector3 | null>(null);
    const anteroRoci = useRef(0);
    const yawBase = useRef(0);

    const confortFinal = aplicarMovimientoReducido(confort);

    useFrame(() => {
        const ahora = performance.now();
        const diff = ahora - anteroRoci.current;
        if (diff < 1000 / 90) return;
        anteroRoci.current = ahora;

        const posAct = camera.position;
        const posAnt = anteriorPos.current ?? posAct.clone();
        const lineal = posAct.distanceTo(posAnt) / (diff / 1000);
        anteriorPos.current = posAct.clone();

        const frente = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const yawAct = Math.atan2(frente.x, -frente.z);
        const desvio = Math.abs(Math.sin(yawAct - yawBase.current));
        const angular = desvio < 0.01 ? 0 : (desvio * 180 / Math.PI) / (diff / 1000);
        setVelocidad({ lineal, angular });
    });

    useEffect(() => {
        const frente = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        yawBase.current = Math.atan2(frente.x, -frente.z);
    }, [camera]);

    const girar = useCallback((dir: -1 | 1) => {
        const y = camera.rotation.y;
        const paso = (confortFinal.anguloSalto * Math.PI) / 180;
        const celda = Math.round(y / paso) * paso;
        const nuevo = Math.abs(celda - y) < 1e-6 ? y + dir * paso : dir > 0 ? Math.ceil(y / paso) * paso : Math.floor(y / paso) * paso;
        camera.rotation.y = nuevo;
    }, [confortFinal, camera]);

    useEffect(() => {
        ctx.girar = girar;
    }, [ctx, girar]);

    const mostrarSubitulos = subtitulos && confortFinal.subtitulos;

    return (
        <group>
            <Vineta confort={confortFinal} velocidad={velocidad} />
            {mostrarSubitulos && (
                <group position={[0, -0.15, 1.5]}>
                    <Texto3D distancia={1.5} grados={1}>{subtitulos}</Texto3D>
                </group>
            )}
        </group>
    );
}