"use client";

/**
 * El CENTRO del radar en 3D: ESTA neurona, con su nombre, la foto del perfil activo como cartel (o su
 * avatar 3D si es ligero y se midió su peso) y su estado. Sustituye al punto azul de antes. Se puede
 * pulsar: su ficha enseña el aparato, el medio, las antenas, el radio y la privacidad del radar.
 */

import { Component, Suspense, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { Html, useGLTF } from "@react-three/drei";
import type { CentroNeurona } from "@/lib/senales/centro";
import { FACTOR_ETIQUETA, ZINDEX_ETIQUETAS } from "./etiqueta-3d";
import { FotoPerfil } from "./foto-perfil";

const PLANO: [number, number, number] = [-Math.PI / 2, 0, 0];
const ALTO_MODELO = 1.5;

/** El modelo 3D del perfil, escalado a una altura fija y centrado. */
function ModeloAvatar({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const { modelo, escala, dy } = useMemo(() => {
    const clon = scene.clone(true);
    const caja = new THREE.Box3().setFromObject(clon);
    const tam = caja.getSize(new THREE.Vector3());
    const centro = caja.getCenter(new THREE.Vector3());
    clon.position.sub(centro);
    return { modelo: clon, escala: tam.y > 0 ? ALTO_MODELO / tam.y : 1, dy: ALTO_MODELO / 2 + 0.05 };
  }, [scene]);
  return <group position={[0, dy, 0]} scale={escala}><primitive object={modelo} /></group>;
}

/** Si el modelo no carga o está roto, el centro conserva su cuerpo y su cartel con la foto. */
class LimiteModelo extends Component<{ children: ReactNode; respaldo: ReactNode }, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() { return { fallo: true }; }
  render() { return this.state.fallo ? this.props.respaldo : this.props.children; }
}

const SIN_PUNTERO = { pointerEvents: "none" } as const;

function CartelCentro({ centro, color }: { centro: CentroNeurona; color: string }) {
  return (
    <Html position={[0, 1.9, 0]} center distanceFactor={FACTOR_ETIQUETA} zIndexRange={ZINDEX_ETIQUETAS} pointerEvents="none" wrapperClass="pointer-events-none" style={SIN_PUNTERO}>
      <div className="pointer-events-none flex select-none items-center gap-2 whitespace-nowrap rounded-xl border bg-black/85 px-2 py-1.5 text-left" style={{ borderColor: `${color}88` }} data-testid="cartel-centro">
        <FotoPerfil url={centro.avatar.modo === "foto" ? centro.avatar.url : null} iniciales={centro.iniciales} size={38} color={color} />
        <span className="min-w-0">
          <span className="block max-w-[190px] truncate text-[11px] font-bold leading-tight text-white">{centro.nombreNeurona}</span>
          <span className="block max-w-[190px] truncate text-[9px] leading-tight text-sky-200/85">
            {centro.nombrePerfil ? `${centro.nombrePerfil}${centro.usuario ? ` · @${centro.usuario.replace(/^@/, "")}` : ""}` : "sin perfil cargado"}
          </span>
          <span className="block max-w-[190px] truncate text-[9px] leading-tight text-white/50">
            {centro.subtitulo} · {centro.textoMedios}
          </span>
        </span>
      </div>
    </Html>
  );
}

export function Centro3D({ centro, seleccionado, apuntado, onSeleccionar, onApuntar }: {
  centro: CentroNeurona;
  seleccionado: boolean;
  apuntado: boolean;
  onSeleccionar: () => void;
  onApuntar: (sobre: boolean) => void;
}) {
  const color = "#38bdf8";
  const cuerpo = (
    <mesh position={[0, 0.2, 0]} scale={seleccionado ? 1.25 : apuntado ? 1.12 : 1}>
      <sphereGeometry args={[0.42, 28, 28]} />
      <meshStandardMaterial color={color} emissive="#0ea5e9" emissiveIntensity={seleccionado ? 1 : 0.75} />
    </mesh>
  );
  const conModelo = centro.avatar.modo === "avatar3d" && !!centro.avatar.url;
  return (
    <group>
      {conModelo ? (
        <LimiteModelo respaldo={cuerpo}>
          <Suspense fallback={cuerpo}>
            <ModeloAvatar url={centro.avatar.url!} />
          </Suspense>
        </LimiteModelo>
      ) : cuerpo}
      <mesh rotation={PLANO} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.62, seleccionado ? 0.78 : 0.7, 48]} />
        <meshBasicMaterial color={seleccionado ? "#ffffff" : "#7dd3fc"} transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Zona de pulsación cómoda (invisible) */}
      <mesh
        position={[0, 0.5, 0]}
        onClick={(e) => { e.stopPropagation(); onSeleccionar(); }}
        onPointerOver={(e) => { e.stopPropagation(); onApuntar(true); }}
        onPointerOut={() => onApuntar(false)}
      >
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <CartelCentro centro={centro} color={color} />
    </group>
  );
}

export default Centro3D;
