"use client";
/**
 * StarSeed XR · COMODIDAD (XR1010AF · contrato `architecture/starseed-xr.md` §3 j). Viñeta al mover
 * la cabeza, giro por saltos (`siguienteGiro`), subtítulos de Astraura y de la transmisión, pestañas
 * de «una mano» y movimiento reducido que lo manda todo a saltos (avisado UNA vez). Cascarón fino: la
 * lógica vive en las funciones puras de aquí; el giro y los subtítulos los cablea XR1010AS.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Mano, Postura } from "../../../lib/xr/tipos";
import { aplicarMovimientoReducido, altoMinimoTexto, siguienteGiro, opacidadVineta, type PreferenciasConfort } from "../../../lib/xr/confort";
import type { ContextoAcciones } from "./acciones-xr";
import { Texto3D } from "./panel-cristal";
import { usePrefsXR } from "./use-prefs-xr";
import { useEntradaXR } from "./use-entrada-xr";
import { Vineta } from "./vineta";

/** Medida de la cabeza en un fotograma: posición en el plano, yaw y segundo del mismo reloj. */
export interface MedidaPose { x: number; z: number; yaw: number; t: number }
export interface Velocidades { lineal: number; angularGradosS: number }
/** Velocidad lineal (m/s) y angular (º/s) entre dos medidas; la primera, los cortos y los raros son cero. */
export function velocidades(prev: MedidaPose | null, cur: MedidaPose | null): Velocidades {
  if (!prev || !cur) return { lineal: 0, angularGradosS: 0 };
  const limpio = (n: number): number => (Number.isFinite(n) ? n : 0);
  const dt = limpio(cur.t) - limpio(prev.t);
  if (dt <= 0) return { lineal: 0, angularGradosS: 0 };
  const dyaw = Math.atan2(Math.sin(limpio(cur.yaw) - limpio(prev.yaw)), Math.cos(limpio(cur.yaw) - limpio(prev.yaw)));
  return { lineal: Math.hypot(limpio(cur.x) - limpio(prev.x), limpio(cur.z) - limpio(prev.z)) / dt, angularGradosS: (Math.abs(dyaw) * 180) / Math.PI / dt };
}
/** El movimiento reducido MANDA (§3 j): giro por saltos y teletransporte aunque se pidiera continuo. */
export function confortEfectivo(c: PreferenciasConfort): PreferenciasConfort {
  return aplicarMovimientoReducido(c);
}
/** Aviso que se dice UNA VEZ si la locomoción continua quedó anulada por el movimiento reducido. */
export function avisoMovimientoReducido(origen: PreferenciasConfort, efectivo: PreferenciasConfort): string | null {
  return origen.locomocion !== efectivo.locomocion
    ? "El movimiento reducido está activo: ya no se camina de forma continua, se salta a donde se mire."
    : null;
}
/** Paso DEL giro por saltos (rad, alineado a la rejilla del núcleo) sobre el yaw actual del rig. */
export function pasoDeGiro(yaw: number, dir: -1 | 1, c: PreferenciasConfort): number {
  return siguienteGiro(yaw, dir, c) - yaw;
}
/** `n` saltos acumulados desde yaw0 (8 saltos de 45° cierran la vuelta completa). */
export function totalGiro(yaw0: number, dir: -1 | 1, n: number, c: PreferenciasConfort): number {
  let yaw = yaw0;
  for (let i = 0; i < n; i += 1) yaw = siguienteGiro(yaw, dir, c);
  return yaw;
}
/** Qué subtítulo se pinta: con la preferencia apagada nada, y la primera frase con texto gana. */
export function lineaSubtitulo(activo: boolean, ...frases: Array<string | null | undefined>): string | null {
  if (!activo) return null;
  const letra = frases.map((f) => (typeof f === "string" ? f.trim() : "")).find((l) => l !== "");
  return letra || null;
}
/** Dónde va el subtítulo: `distancia` m delante, medio renglón y un dedo por debajo de la mirada. */
export function poseSubtitulo(distancia: number, grados: number, alturaCabeza: number): { pos: [number, number, number]; alto: number } {
  const alto = altoMinimoTexto(Math.max(0.1, distancia), grados);
  return { pos: [0, alturaCabeza - (alto / 2 + 0.05), -distancia], alto };
}
/** Pestañas de «una mano»: dock y menú se agrupan en la mano dominante; en otro modo no cambia nada. */
export interface PestañasUnaMano { mano: Mano; paneles: string[] }
export function agruparUnaMano(postura: Postura, manoDominante: Mano, paneles: readonly string[]): PestañasUnaMano | null {
  if (postura !== "una-mano") return null;
  const únicos = [...new Set(paneles.map((p) => p.trim()).filter(Boolean))];
  return únicos.length === 0 ? null : { mano: manoDominante, paneles: únicos };
}
export interface PropsComodidad {
  /** Lo que dice Astraura y lo que se oye de la transmisión (XR1010AS los trae). */
  fraseAstraura?: string | null;
  fraseTransmision?: string | null;
  /** Objeto del rig (XROrigin) al que girar; si falta, gira la cámara. */
  rig?: { current: { rotation: { y: number } } | null };
}
const SIN_ACCION = (): void => {};
const TODAS_OTRAS = { recentrar: SIN_ACCION, salir: () => Promise.resolve(), abrirMenuMano: SIN_ACCION, abrirDock: SIN_ACCION, hablar: SIN_ACCION, atras: SIN_ACCION, seleccionar: SIN_ACCION, agarrar: SIN_ACCION, teletransporte: SIN_ACCION };

export function Comodidad({ fraseAstraura, fraseTransmision, rig }: PropsComodidad) {
  const { confort } = usePrefsXR();
  const efectivo = useMemo(() => confortEfectivo(confort), [confort]);
  const camara = useThree((s) => s.camera);
  const [opacidad, setOpacidad] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const previa = useRef<MedidaPose | null>(null);
  const yawRig = useRef(0);
  const dicho = useRef(false);
  useFrame((estado) => {
    const pos = estado.camera.position;
    const cur = { x: pos.x, z: pos.z, yaw: estado.camera.rotation.y, t: estado.clock.elapsedTime };
    const o = opacidadVineta(efectivo, velocidades(previa.current, cur));
    previa.current = cur;
    setOpacidad((ant) => (Math.abs(o - ant) > 0.004 ? o : ant));
  });
  const gira = useCallback((dir: -1 | 1) => {
    const paso = pasoDeGiro(yawRig.current, dir, efectivo);
    const objetivo = rig?.current ?? camara;
    if (paso !== 0 && objetivo) { objetivo.rotation.y += paso; yawRig.current += paso; }
  }, [efectivo, rig, camara]);
  // El giro por saltos es de aquí (con `siguienteGiro`); las demás acciones las resuelve XR1010AS.
  useEntradaXR({ ...TODAS_OTRAS, girar: gira } satisfies ContextoAcciones);
  // «Se lo decimos una vez»: la locomoción continua anulada por el movimiento reducido se avisa.
  useEffect(() => {
    const literal = avisoMovimientoReducido(confort, efectivo);
    if (!literal || dicho.current) return;
    dicho.current = true;
    setAviso(literal);
    const reloj = window.setTimeout(() => setAviso(null), 4000);
    return () => window.clearTimeout(reloj);
  }, [confort, efectivo]);
  const linea = aviso ?? lineaSubtitulo(efectivo.subtitulos, fraseAstraura, fraseTransmision);
  const subtitulo = poseSubtitulo(1.5, Math.max(1, efectivo.textoMinGrados), 0);
  const pestaña = agruparUnaMano(efectivo.postura, efectivo.manoDominante, ["dock", "menú de mano"]);
  return (
    <>
      <Vineta opacidad={opacidad} />
      {linea && <group position={subtitulo.pos}><Texto3D distancia={1.5} grados={Math.max(1, efectivo.textoMinGrados)}>{linea}</Texto3D></group>}
      {pestaña && <group position={[pestaña.mano === "derecha" ? 0.35 : -0.35, 0, -0.6]}><Texto3D distancia={0.7} grados={1.2}>{`Modo a una mano: ${pestaña.paneles.join(" · ")}`}</Texto3D></group>}
    </>
  );
}
