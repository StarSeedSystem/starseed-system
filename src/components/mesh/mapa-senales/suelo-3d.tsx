"use client";

/**
 * Suelo del mapa 3D: el RADAR tendido. Disco de fondo, anillos de alcance SOLO donde la distancia
 * existe (círculo completo con GPS de ambos extremos; arco «≈» en el sector de la antena si solo hay
 * distancia estimada por RF; ninguno si no hay distancia), cuñas por familia de antena, «Tú» en el
 * centro, las antenas propias y la marca del norte. Cada pieza dice algo medido; ninguna es adorno.
 */

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { ANTENNA_COLOR } from "@/ai/astraura/mesh/signals";
import {
  ESTADO_ANTENA_ES, RADIO_ESCENA, radioDeAnillo,
  type AntenaPropia, type SectorEscena,
} from "@/lib/senales/mapa-3d";
import type { AnilloAlcance } from "@/lib/senales/tipos-vivo";
import { Etiqueta3D } from "./etiqueta-3d";

const PLANO: [number, number, number] = [-Math.PI / 2, 0, 0];
/** Ángulo (rad) donde se rotulan los anillos: entre los sectores BLE e IP, sin estorbar. */
const ANGULO_ROTULO = (21 * Math.PI) / 180;

/** Anillo o ARCO punteado (halo de precisión sin GPS; escala estimada por RF). `LineLoop`/`Line` discontinuo. */
export function AnilloPunteado({ radio, color, opacidad, y = 0.02, desde, hasta }: {
  radio: number; color: string; opacidad: number; y?: number; desde?: number; hasta?: number;
}) {
  const objeto = useMemo(() => {
    const arco = desde !== undefined && hasta !== undefined;
    const puntos: THREE.Vector3[] = [];
    const n = arco ? 28 : 72;
    for (let i = 0; i <= (arco ? n : n - 1); i++) {
      const a = arco ? desde! + ((hasta! - desde!) * i) / n : (i / n) * Math.PI * 2;
      puntos.push(new THREE.Vector3(Math.cos(a) * radio, 0, Math.sin(a) * radio));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(puntos);
    const mat = new THREE.LineDashedMaterial({
      color, dashSize: 0.14, gapSize: 0.1, transparent: true, opacity: opacidad, depthWrite: false,
    });
    const linea = arco ? new THREE.Line(geo, mat) : new THREE.LineLoop(geo, mat);
    linea.computeLineDistances();
    return linea;
  }, [radio, color, opacidad, desde, hasta]);
  useEffect(() => () => {
    objeto.geometry.dispose();
    (objeto.material as THREE.Material).dispose();
  }, [objeto]);
  return <primitive object={objeto} position={[0, y, 0]} />;
}

export function Suelo() {
  return (
    <group>
      <mesh rotation={PLANO} position={[0, -0.02, 0]}>
        <circleGeometry args={[RADIO_ESCENA + 0.5, 72]} />
        <meshBasicMaterial color="#0a1322" transparent opacity={0.6} depthWrite={false} />
      </mesh>
      {/* Borde del radar */}
      <mesh rotation={PLANO} position={[0, 0.004, 0]}>
        <ringGeometry args={[RADIO_ESCENA - 0.02, RADIO_ESCENA + 0.03, 120]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * Anillos de distancia honestos (`anillosDeAlcance`): círculo completo = hay GPS de ambos extremos
 * en esa escala; arco «≈» = solo distancia estimada por RF, y únicamente en el sector de su antena
 * (el rumbo se desconoce, así que no se finge un círculo). Sin distancia, no se dibuja nada.
 */
export function AnillosAlcance({ anillos }: { anillos: readonly AnilloAlcance[] }) {
  return (
    <group>
      {anillos.map((a) => {
        const r = radioDeAnillo(a.fraccion);
        if (a.real || a.desdeRad === null || a.hastaRad === null) {
          return (
            <group key={a.id}>
              <mesh rotation={PLANO} position={[0, 0.006, 0]}>
                <ringGeometry args={[r - 0.015, r + 0.015, 120]} />
                <meshBasicMaterial color="#22d3ee" transparent opacity={0.26} side={THREE.DoubleSide} depthWrite={false} />
              </mesh>
              <Etiqueta3D discreta titulo={a.etiqueta} color="#67e8f9" position={[Math.cos(ANGULO_ROTULO) * r, 0.03, Math.sin(ANGULO_ROTULO) * r]} />
            </group>
          );
        }
        const medio = (a.desdeRad + a.hastaRad) / 2;
        return (
          <group key={a.id}>
            <AnilloPunteado radio={r} color="#67e8f9" opacidad={0.4} y={0.008} desde={a.desdeRad} hasta={a.hastaRad} />
            <Etiqueta3D discreta titulo={a.etiqueta} color="#67e8f9" position={[Math.cos(medio) * r, 0.03, Math.sin(medio) * r]} />
          </group>
        );
      })}
    </group>
  );
}

export function SectoresSuelo({ sectores }: { sectores: SectorEscena[] }) {
  return (
    <group>
      {sectores.map((s) => (
        <group key={s.familia}>
          <mesh rotation={PLANO} position={[0, 0.002, 0]}>
            <ringGeometry args={[0.7, RADIO_ESCENA, 40, 1, s.thetaStart, s.thetaLength]} />
            <meshBasicMaterial
              color={ANTENNA_COLOR[s.familia]}
              transparent
              opacity={s.viva ? 0.11 : 0.025}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <Etiqueta3D
            discreta
            titulo={s.etiqueta}
            color={s.viva ? ANTENNA_COLOR[s.familia] : "#64748b"}
            position={[s.x, 0.05, s.z]}
          />
        </group>
      ))}
    </group>
  );
}

/** Una antena de ESTA neurona, en el eje de su sector. Cuanto más cerca del centro, más en uso. */
export function AntenaPropiaMarca({ antena }: { antena: AntenaPropia }) {
  const [sobre, setSobre] = useState(false);
  const fuerte = antena.estado === "active";
  return (
    <group position={[antena.x, 0.05, antena.z]}>
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); setSobre(true); }}
        onPointerOut={() => setSobre(false)}
      >
        <cylinderGeometry args={[0.17, 0.17, 0.1, 6]} />
        <meshStandardMaterial
          color={antena.color}
          emissive={antena.color}
          emissiveIntensity={fuerte ? 0.8 : 0.3}
          transparent
          opacity={antena.estado === "info" ? 0.5 : 0.95}
        />
      </mesh>
      {(fuerte || sobre) && (
        <Etiqueta3D
          position={[0, 0.45, 0]}
          titulo={antena.label}
          subtitulo={sobre ? `${ESTADO_ANTENA_ES[antena.estado]}` : undefined}
          color={antena.color}
          discreta={!sobre}
          distanceFactor={sobre ? 15 : 17}
        />
      )}
    </group>
  );
}

/** Marca del norte REAL: solo cuando alguna señal se coloca con GPS de ambos extremos. */
export function MarcaNorte() {
  return (
    <group position={[0, 0.05, -(RADIO_ESCENA + 1.9)]}>
      <mesh>
        <coneGeometry args={[0.2, 0.5, 3]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>
      <Etiqueta3D discreta titulo="N · norte real" color="#fbbf24" position={[0, 0.5, 0]} />
    </group>
  );
}
