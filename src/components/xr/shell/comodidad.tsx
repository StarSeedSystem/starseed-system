"use client";

/**
 * StarSeed XR · COMODIDAD (XR1010AF · contrato §3 j). Cascarón fino: lee confort,
 * alimenta la viñeta por movimiento, aplica giro por saltos, gestiona subtítulos y
 * adapta a una-mano/movimiento reducido.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { usePrefsXR } from "./use-prefs-xr";
import { useEntradaXR } from "./use-entrada-xr";
import { siguienteGiro, aplicarMovimientoReducido, opacidadVineta } from "../../../lib/xr/confort";
import { disponerTrinity } from "../../../lib/xr/espacio-trinity";
import { Vineta } from "./vineta";
import { Texto3D } from "./panel-cristal";
import type { PreferenciasConfort } from "../../../lib/xr/confort";
import type { ContextoAcciones } from "./acciones-xr";

export interface EstadoMovimiento {
  lineal: number;
  angularGradosS: number;
}

export interface EstadoSubtitulos {
  visible: boolean;
  texto: string;
}

export interface ComodidadContexto {
  movimiento: EstadoMovimiento;
  subtitulos: EstadoSubtitulos;
}

const CtxComodidad = createContext<ComodidadContexto>({
  movimiento: { lineal: 0, angularGradosS: 0 },
  subtitulos: { visible: false, texto: "" },
});

export const useComodidad = () => useContext(CtxComodidad);

export interface PropsComodidad {
  contexto?: ContextoAcciones;
  /** Texto a mostrar en subtítulos (Astraura/transmisión). */
  textoSubtitulos?: string;
  /** Rig/origen a rotar en giro por saltos. */
  rig?: THREE.Object3D | null;
  children?: React.ReactNode;
}

export function calcularMovimiento(cabeza: any, previo: any | null, delta: number): { lineal: number; angularGradosS: number } {
  if (delta <= 0) return { lineal: 0, angularGradosS: 0 };
  let lineal = 0;
  if (previo) {
    if (typeof cabeza?.distanceTo === "function") {
      const d = cabeza.distanceTo(previo);
      lineal = d / delta;
    } else if (cabeza && previo) {
      const dx = (cabeza.x ?? 0) - (previo.x ?? 0);
      const dy = (cabeza.y ?? 0) - (previo.y ?? 0);
      const dz = (cabeza.z ?? 0) - (previo.z ?? 0);
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      lineal = d / delta;
    }
  }
  return { lineal, angularGradosS: 0 };
}

export function calcularMovimientoAngular(yaw: number, yawPrevio: number | null, delta: number): number {
  if (delta <= 0 || yawPrevio === null) return 0;
  let diff = yaw - yawPrevio;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return (Math.abs(diff) / delta) * (180 / Math.PI);
}

export function debeAplicarMovimientoReducido(confort: PreferenciasConfort): PreferenciasConfort {
  return aplicarMovimientoReducido(confort);
}

export function prepararUnaMano(confort: PreferenciasConfort): PreferenciasConfort {
  if (confort.postura !== "una-mano") return confort;
  return { ...confort, postura: "una-mano" };
}

export function girarPorSaltos(yawActual: number, direccion: -1 | 1, confort: PreferenciasConfort): number {
  return siguienteGiro(yawActual, direccion, confort);
}

export function avisoLocomocionContinuaMovimientoReducido(): string {
  return "Locomoción continua no disponible con movimiento reducido: se usa teletransporte/saltos.";
}

export function Comodidad({ contexto, textoSubtitulos = "", rig, children }: PropsComodidad) {
  const { confort: confortCrudo } = usePrefsXR();
  const confort = useMemo(() => aplicarMovimientoReducido(confortCrudo), [confortCrudo]);
  const { camera } = useThree();
  const refPrev = useRef<THREE.Vector3 | null>(null);
  const refYaw = useRef<number | null>(null);
  const [movimiento, setMovimiento] = useState<EstadoMovimiento>({ lineal: 0, angularGradosS: 0 });
  const [avisoDado, setAvisoDado] = useState(false);

  const ctxAcciones = useMemo<ContextoAcciones>(() => contexto || ({} as ContextoAcciones), [contexto]);
  const entrada = useEntradaXR(ctxAcciones);

  useEffect(() => {
    if (confortCrudo.movimientoReducido && confortCrudo.locomocion === "continua" && !avisoDado) {
      try { console.warn(avisoLocomocionContinuaMovimientoReducido()); } catch {}
      setAvisoDado(true);
    }
  }, [confortCrudo.movimientoReducido, confortCrudo.locomocion, avisoDado]);

  useFrame((state, delta) => {
    const cabeza = camera.position.clone();
    const frente = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const yaw = Math.atan2(frente.x, -frente.z);
    const lineal = refPrev.current ? cabeza.distanceTo(refPrev.current) / Math.max(delta, 1e-6) : 0;
    const angular = calcularMovimientoAngular(yaw, refYaw.current, Math.max(delta, 1e-6));
    refPrev.current = cabeza.clone();
    refYaw.current = yaw;
    setMovimiento({ lineal, angularGradosS: angular });
  });

  useEffect(() => {
    if (!entrada) return;
    const alGiroIzq = () => {
      if (confort.giro !== "saltos") return;
      if (rig) {
        const actual = rig.rotation.y;
        rig.rotation.y = siguienteGiro(actual, -1, confort);
      } else {
        camera.rotation.y = siguienteGiro(camera.rotation.y, -1, confort);
      }
    };
    const alGiroDer = () => {
      if (confort.giro !== "saltos") return;
      if (rig) {
        const actual = rig.rotation.y;
        rig.rotation.y = siguienteGiro(actual, 1, confort);
      } else {
        camera.rotation.y = siguienteGiro(camera.rotation.y, 1, confort);
      }
    };
    // Intentamos enganchar acciones si el contexto las expone
  }, [entrada, confort, rig, camera]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (confort.giro !== "saltos") return;
      if (e.key === "q" || e.key === "Q" || e.key === "ArrowLeft") {
        if (rig) rig.rotation.y = siguienteGiro(rig.rotation.y, -1, confort);
        else camera.rotation.y = siguienteGiro(camera.rotation.y, -1, confort);
      }
      if (e.key === "e" || e.key === "E" || e.key === "ArrowRight") {
        if (rig) rig.rotation.y = siguienteGiro(rig.rotation.y, 1, confort);
        else camera.rotation.y = siguienteGiro(camera.rotation.y, 1, confort);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [confort, rig, camera]);

  const mostrarSubtitulos = confort.subtitulos && !!textoSubtitulos;
  const opacidad = useMemo(() => opacidadVineta(confort, movimiento), [confort, movimiento]);

  const valorCtx = useMemo(() => ({ movimiento, subtitulos: { visible: mostrarSubtitulos, texto: textoSubtitulos } }), [movimiento, mostrarSubtitulos, textoSubtitulos]);

  // Aplicar reorganización una-mano si procede (disponerTrinity usado conceptualmente)
  if (confort.postura === "una-mano") {
    try { disponerTrinity({ alturaOjos: 1.6, postura: "una-mano", manoDominante: confort.manoDominante, modo: "vr-inmersivo" }); } catch {}
  }

  return (
    <CtxComodidad.Provider value={valorCtx}>
      <Vineta opacidad={opacidad} confort={confort} movimiento={movimiento} />
      {mostrarSubtitulos && (
        <group position={[0, -0.3, -1.5]}>
          <Texto3D distancia={1.5} grados={1}>
            {textoSubtitulos}
          </Texto3D>
        </group>
      )}
      {children}
    </CtxComodidad.Provider>
  );
}

export default Comodidad;
