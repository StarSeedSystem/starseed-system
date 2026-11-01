"use client";
/**
 * StarSeed XR · COMODIDAD (XR1010F · contrato §3 j). Cascarón fino: por fotograma mide cómo se
 * mueve la cabeza y alimenta la viñeta (`opacidadVineta` del núcleo); las acciones «giro-izquierda/
 * -derecha» de `useEntradaXR` giran el rig por saltos con el ángulo configurado; pinta los subtítulos
 * de la voz de Astraura y de la transmisión a 1,5 m bajo la mirada; si la persona eligió caminar
 * continuo pero tiene movimiento reducido, manda el reducido y lo avisa una vez. Las funciones puras
 * de arriba se prueban sin WebGL ni visor.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { aGrados, type Mano, type ModoXR, type Postura, type Vec3 } from "@/lib/xr/tipos";
import { aplicarMovimientoReducido, altoMinimoTexto, opacidadVineta, siguienteGiro, type PreferenciasConfort } from "@/lib/xr/confort";
import { alturaOjosEfectiva } from "./use-disposicion";
import type { ContextoAcciones } from "./acciones-xr";
import { useEntradaXR } from "./use-entrada-xr";
import { usePrefsXR } from "./use-prefs-xr";
import { Vineta } from "./vineta";
import { Texto3D } from "./panel-cristal";

export interface EstadoCabeza { x: number; y: number; z: number; yaw: number }
export type Velocidad = { lineal: number; angularGradosS: number };

/** Velocidad de la cabeza entre dos fotogramas: m/s lineal y °/s angular (por el ángulo corto). */
export function velocidadEntre(a: EstadoCabeza, b: EstadoCabeza, dt: number): Velocidad {
  if (!Number.isFinite(dt) || dt <= 0) return { lineal: 0, angularGradosS: 0 };
  const lineal = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / dt;
  const angularGradosS = aGrados(Math.abs(Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)))) / dt;
  return { lineal, angularGradosS };
}

/** Paso (rad, con signo) de un salto de giro: `siguienteGiro` del núcleo con el ángulo configurado. */
export function pasoGiro(dir: -1 | 1, salida: PreferenciasConfort): number {
  return siguienteGiro(0, dir, aplicarMovimientoReducido(salida));
}

/** Qué aviso enseña el movimiento reducido: solo correjía una elección distinta a lo que manda. */
export function avisoReducido(crudo: PreferenciasConfort): string | null {
  if (!crudo.movimientoReducido) return null;
  const efecto = aplicarMovimientoReducido(crudo);
  return crudo.giro === "saltos" && crudo.locomocion === efecto.locomocion ? null : "Movimiento reducido: giro por saltos y sin caminar continuo.";
}

export const DISTANCIA_SUBTITULO = 1.5;
export const GRADOS_BAJO_MIRADA = 6;
/** La preferencia manda: los subtítulos se muestran u ocultan con ella. */
export const debeMostrarSubtitulos = (salida: PreferenciasConfort): boolean => aplicarMovimientoReducido(salida).subtitulos;

/** Posición (m) de la línea de subtítulo: al frente, a la distancia dada y bajo la mirada. */
export function posicionSubtitulo(alturaOjos: number, distancia = DISTANCIA_SUBTITULO): Vec3 {
  return [0, alturaOjos - altoMinimoTexto(distancia, GRADOS_BAJO_MIRADA), -distancia];
}

/** Entradas para `disponerTrinity` en el rig: postura, mano dominante, escala y altura de ojos efectivas. */
export function entradasTrinity(crudo: PreferenciasConfort, modo: ModoXR, alturaOjosMedida: number | null = null): { alturaOjos: number; postura: Postura; manoDominante: Mano; modo: ModoXR; escala: number } {
  const sal = aplicarMovimientoReducido(crudo);
  return { alturaOjos: alturaOjosEfectiva(sal.alturaOjos, alturaOjosMedida), postura: sal.postura, manoDominante: sal.manoDominante, escala: sal.escala, modo };
}

export interface PropsComodidad {
  modo: ModoXR;
  /** Lo que dice Astraura y lo que suena en la transmisión (subtítulos). */
  vozAstraura?: string | null;
  transmision?: string | null;
  /** Altura de ojos medida por el visor; manda la manual del confort. */
  alturaOjosMedida?: number | null;
  /** Grupo rig (XROrigin) al que aplicar los saltos de giro; si falta, el padre de la cámara. */
  rigRef?: { current: THREE.Group | null } | null;
}

export function Comodidad({ modo, vozAstraura = null, transmision = null, alturaOjosMedida = null, rigRef = null }: PropsComodidad) {
  const { confort: crudo } = usePrefsXR();
  const efecto = useMemo(() => aplicarMovimientoReducido(crudo), [crudo]);
  const aviso = useMemo(() => avisoReducido(crudo), [crudo]);
  const [opacidad, setOpacidad] = useState(0);
  const [anuncio, setAnuncio] = useState<string | null>(null);
  const avisado = useRef(false);
  const ultima = useRef(0);
  const previo = useRef<EstadoCabeza | null>(null);
  const pendiente = useRef(0);
  const subtitulo = useRef<THREE.Group>(null);

  // El aviso del movimiento reducido se dice UNA vez; si se apaga y vuelve a encenderse, otra vez.
  useEffect(() => {
    if (!aviso) { avisado.current = false; return; }
    if (avisado.current) return;
    avisado.current = true;
    setAnuncio(aviso);
    const reloj = window.setTimeout(() => setAnuncio(null), 4000);
    return () => window.clearTimeout(reloj);
  }, [aviso]);

  // De las 11 acciones, aquí sólo girar mueve el rig; las demás las cuidan los paneles del OS.
  const ctx = useMemo<ContextoAcciones>(() => {
    const nada = (): void => {};
    return {
      recentrar: nada, salir: () => Promise.resolve(), abrirMenuMano: nada, abrirDock: nada, hablar: nada,
      atras: nada, seleccionar: nada, agarrar: nada, teletransporte: nada, girar: (dir) => { pendiente.current += dir; },
    };
  }, []);
  useEntradaXR(ctx);

  useFrame((estado, dt) => {
    const camara = estado.camera;
    const frente = new THREE.Vector3(0, 0, -1).applyQuaternion(camara.quaternion);
    const cabeza: EstadoCabeza = { x: camara.position.x, y: camara.position.y, z: camara.position.z, yaw: Math.atan2(frente.x, -frente.z) };
    const antes = previo.current;
    previo.current = cabeza;
    if (antes && dt > 0) {
      // Velocidad por fotograma → viñeta del núcleo; se actúa al React solo en escalones de 0,05.
      const v = velocidadEntre(antes, cabeza, Math.min(dt, 0.2));
      const nueva = opacidadVineta(efecto, v);
      if (Math.abs(nueva - ultima.current) > 0.04) { ultima.current = Math.round(nueva * 20) / 20; setOpacidad(ultima.current); }
      // Giro por saltos acumulado desde el último fotograma.
      const rig = rigRef?.current ?? camara.parent;
      if (pendiente.current !== 0 && rig) {
        const n = pendiente.current;
        pendiente.current = 0;
        rig.rotation.y += pasoGiro(Math.sign(n) as -1 | 1, efecto) * Math.abs(n);
      }
    }
    const sub = subtitulo.current;
    if (sub) {
      sub.position.copy(camara.position);
      sub.quaternion.copy(camara.quaternion);
      sub.translateZ(-DISTANCIA_SUBTITULO);
      sub.translateY(-altoMinimoTexto(DISTANCIA_SUBTITULO, GRADOS_BAJO_MIRADA));
    }
  });

  const entradas = entradasTrinity(crudo, modo, alturaOjosMedida);
  const texto = debeMostrarSubtitulos(efecto) ? anuncio ?? vozAstraura ?? transmision : null;
  return (
    <>
      <Vineta opacidad={opacidad} />
      {texto !== null && (
        <group ref={subtitulo}>
          <Texto3D distancia={DISTANCIA_SUBTITULO} grados={efecto.textoMinGrados}>{texto}</Texto3D>
        </group>
      )}
    </>
  );
}

