'use client';

/**
 * Cuerpos celestes de Ramas 4D: un InstancedMesh por tipo de cuerpo (MV1125G).
 * Se carga solo con next/dynamic({ ssr: false }) desde la escena.
 * Colores: tokens del tema (variables CSS), nunca colores sueltos.
 */

import { useLayoutEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { parsearHsl } from '@/lib/ramas4d/topes';

export type GrupoCuerpo = 'estrella' | 'galaxia' | 'sistema' | 'planeta' | 'cometa' | 'constelacion';

export interface Cuerpo {
  id: string;
  tipo: string;
  titulo: string;
  peso: number;
  pos: [number, number, number];
}

const GRUPOS: GrupoCuerpo[] = ['estrella', 'galaxia', 'sistema', 'planeta', 'cometa', 'constelacion'];

/** Gramática visual del contrato: neurona=estrella, cerebro=galaxia, carpeta=sistema… */
export function grupoDe(tipo: string): GrupoCuerpo {
  switch (tipo) {
    case 'neurona': return 'estrella';
    case 'cerebro': case 'proyecto': case 'ola': return 'galaxia';
    case 'carpeta': case 'proceso': return 'sistema';
    case 'agente': case 'bot': case 'habilidad': case 'conector': return 'cometa';
    case 'entidad': case 'propuesta': case 'capa': return 'constelacion';
    default: return 'planeta';
  }
}

const TOKEN_GRUPO: Record<GrupoCuerpo, [string, [number, number, number]]> = {
  estrella: ['--trinity-amber-hsl', [45 / 360, 1, 0.5]],
  galaxia: ['--trinity-azure-hsl', [210 / 360, 1, 0.5]],
  sistema: ['--trinity-emerald-hsl', [160 / 360, 0.84, 0.39]],
  planeta: ['--trinity-lime-hsl', [111 / 360, 1, 0.54]],
  cometa: ['--accent-hsl', [210 / 360, 1, 0.6]],
  constelacion: ['--primary-hsl', [210 / 360, 1, 0.5]],
};

/** Color de un token del tema; el valor de respaldo es el mismo del token. */
export function colorToken(variable: string, respaldo: [number, number, number]): THREE.Color {
  let hsl = respaldo;
  if (typeof document !== 'undefined') {
    const valor = getComputedStyle(document.documentElement).getPropertyValue(variable);
    hsl = parsearHsl(valor) ?? respaldo;
  }
  return new THREE.Color().setHSL(hsl[0], hsl[1], hsl[2]);
}

function geometriaDe(g: GrupoCuerpo): THREE.BufferGeometry {
  switch (g) {
    case 'estrella': return new THREE.IcosahedronGeometry(1, 0);
    case 'galaxia': return new THREE.DodecahedronGeometry(1, 0);
    case 'sistema': return new THREE.OctahedronGeometry(1, 0);
    case 'cometa': return new THREE.ConeGeometry(0.7, 1.8, 6);
    case 'constelacion': return new THREE.TetrahedronGeometry(1.1, 0);
    default: return new THREE.SphereGeometry(1, 12, 10);
  }
}

interface Props {
  cuerpos: Cuerpo[];
  seleccionado: string | null;
  hover: string | null;
  onSeleccionar: (id: string | null) => void;
  onHover: (id: string | null) => void;
}

const PHI = 1.618;

function GrupoInstancias({ grupo, lista, seleccionado, hover, onSeleccionar, onHover }: Omit<Props, 'cuerpos'> & { grupo: GrupoCuerpo; lista: Cuerpo[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometria = useMemo(() => geometriaDe(grupo), [grupo]);
  useLayoutEffect(() => {
    const malla = ref.current;
    if (!malla) return;
    const [variable, respaldo] = TOKEN_GRUPO[grupo];
    const base = colorToken(variable, respaldo);
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    lista.forEach((c, i) => {
      const activo = c.id === seleccionado || c.id === hover;
      const radio = (0.28 + Math.min(1, Math.max(0, c.peso)) * 0.5) * (activo ? PHI : 1);
      m.makeScale(radio, radio, radio).setPosition(c.pos[0], c.pos[1], c.pos[2]);
      malla.setMatrixAt(i, m);
      color.copy(base).multiplyScalar(0.55 + Math.min(1, Math.max(0, c.peso)) * 0.9);
      if (c.id === seleccionado) color.lerp(new THREE.Color(1, 1, 1), 0.5);
      malla.setColorAt(i, color);
    });
    malla.count = lista.length;
    malla.instanceMatrix.needsUpdate = true;
    if (malla.instanceColor) malla.instanceColor.needsUpdate = true;
    malla.computeBoundingSphere();
  }, [grupo, lista, seleccionado, hover]);
  const idDe = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId === undefined ? null : lista[e.instanceId]?.id ?? null);
  if (lista.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometria, undefined, lista.length]}
      onClick={(e) => { e.stopPropagation(); onSeleccionar(idDe(e)); }}
      onPointerMove={(e) => { e.stopPropagation(); onHover(idDe(e)); }}
      onPointerOut={() => onHover(null)}
    >
      <meshBasicMaterial transparent opacity={0.92} toneMapped={false} />
    </instancedMesh>
  );
}

export function NodosInstanciados({ cuerpos, ...resto }: Props) {
  const porGrupo = useMemo(() => {
    const mapa = new Map<GrupoCuerpo, Cuerpo[]>(GRUPOS.map((g) => [g, []]));
    for (const c of cuerpos) mapa.get(grupoDe(c.tipo))?.push(c);
    return mapa;
  }, [cuerpos]);
  return (
    <>
      {GRUPOS.map((g) => (
        <GrupoInstancias key={g} grupo={g} lista={porGrupo.get(g) ?? []} {...resto} />
      ))}
    </>
  );
}
