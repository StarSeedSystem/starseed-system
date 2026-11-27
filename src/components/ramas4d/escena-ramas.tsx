'use client';

/**
 * Escena R3F de Ramas 4D (MV1125G). Solo se importa con next/dynamic({ ssr: false }).
 * Cuerpos instanciados, aristas en un LineSegments, partículas de señal en un buffer,
 * etiquetas cercanas y vuelo suave al nodo. Topes por aparato y modo de rendimiento
 * (`@/lib/ramas4d/topes`): el modo baja cuadros, nunca quita funciones ni diseños.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { Grafo4D } from '@/lib/ramas4d/modelo';
import { seleccionarVisibles, topesEscena } from '@/lib/ramas4d/topes';
import { MODO_CHANGED_EVENT, type ModoRendimiento, type PerfTierAuto } from '@/lib/perf/modo-rendimiento';
import { PERF_CHANGED_EVENT, detectTier, modoEfectivo } from '@/lib/perf/device-tier';
import { NodosInstanciados, type Cuerpo } from './nodos-instanciados';
import { AristasRamas, construirSegmentos } from './aristas-ramas';
import { SenalesParticulas } from './senales-particulas';
import { EtiquetasCercanas } from './etiquetas-cercanas';

export interface EscenaRamasProps {
  grafo: Grafo4D;
  /** x,y,z por nodo, en el orden de `grafo.nodos`. */
  posiciones: Float32Array | null;
  seleccionado: string | null;
  onSeleccionar: (id: string | null) => void;
  /** Vacío = todas las capas. */
  capasVisibles: string[];
}

const IDLE_MS = 60_000;
const VUELO_DIST = 14;

interface ControlesOrbita { target: THREE.Vector3; update: () => void }

function usePerfil() {
  const [tier, setTier] = useState<PerfTierAuto>('mid');
  const [modo, setModo] = useState<ModoRendimiento>('auto');
  const [sinUso, setSinUso] = useState(false);
  const [reducido, setReducido] = useState(false);
  useEffect(() => {
    const leer = () => { setTier(detectTier()); setModo(modoEfectivo()); };
    leer();
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducido(mq.matches);
    const alMq = () => setReducido(mq.matches);
    let idle: ReturnType<typeof setTimeout>;
    const vivo = () => { setSinUso(document.hidden); clearTimeout(idle); idle = setTimeout(() => setSinUso(true), IDLE_MS); };
    vivo();
    const eventos = ['pointermove', 'pointerdown', 'wheel', 'keydown', 'visibilitychange'] as const;
    eventos.forEach((e) => window.addEventListener(e, vivo, { passive: true }));
    window.addEventListener(PERF_CHANGED_EVENT, leer);
    window.addEventListener(MODO_CHANGED_EVENT, leer);
    mq.addEventListener('change', alMq);
    return () => {
      clearTimeout(idle);
      eventos.forEach((e) => window.removeEventListener(e, vivo));
      window.removeEventListener(PERF_CHANGED_EVENT, leer);
      window.removeEventListener(MODO_CHANGED_EVENT, leer);
      mq.removeEventListener('change', alMq);
    };
  }, []);
  return { tier, modo, sinUso, reducido };
}

/** Marca el ritmo de cuadros: sin límite, con tope (eco/eficiente) o pausado sin uso. */
function RitmoCuadros({ cuadros, reducido }: { cuadros: number; reducido: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (reducido || cuadros <= 0) return;
    const id = setInterval(invalidate, 1000 / cuadros);
    return () => clearInterval(id);
  }, [cuadros, reducido, invalidate]);
  return null;
}

/** Vuelo suave de la cámara al nodo elegido (salto directo con «reducir movimiento»). */
function Vuelo({ objetivo, reducido }: { objetivo: [number, number, number] | null; reducido: boolean }) {
  const controles = useThree((s) => s.controls) as unknown as ControlesOrbita | null;
  const invalidate = useThree((s) => s.invalidate);
  const activo = useRef(false);
  const meta = useMemo(() => new THREE.Vector3(), []);
  const camaraMeta = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => { if (objetivo) { meta.set(...objetivo); activo.current = true; invalidate(); } }, [objetivo, meta, invalidate]);
  useFrame(({ camera }, delta) => {
    if (!activo.current || !controles) return;
    const dir = camera.position.clone().sub(controles.target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    camaraMeta.copy(meta).add(dir.normalize().multiplyScalar(VUELO_DIST));
    const k = reducido ? 1 : 1 - Math.exp(-4 * Math.min(delta, 0.1));
    controles.target.lerp(meta, k);
    camera.position.lerp(camaraMeta, k);
    controles.update();
    if (controles.target.distanceTo(meta) < 0.02) activo.current = false;
    else invalidate();
  });
  return null;
}

export default function EscenaRamas({ grafo, posiciones, seleccionado, onSeleccionar, capasVisibles }: EscenaRamasProps) {
  const { tier, modo, sinUso, reducido } = usePerfil();
  const topes = useMemo(() => topesEscena({ tier, modo, sinUso }), [tier, modo, sinUso]);
  const [hover, setHover] = useState<string | null>(null);

  const cuerpos = useMemo<Cuerpo[]>(() => {
    if (!posiciones) return [];
    const todos: Cuerpo[] = [];
    let i = 0;
    for (const n of grafo.nodos.values()) {
      const o = i++ * 3;
      if (o + 2 >= posiciones.length) break;
      if (capasVisibles.length > 0 && !n.capas.some((c) => capasVisibles.some((v) => c.startsWith(v)))) continue;
      todos.push({ id: n.id, tipo: n.tipo, titulo: n.titulo, peso: n.peso, pos: [posiciones[o], posiciones[o + 1], posiciones[o + 2]] });
    }
    const forzado = todos.findIndex((c) => c.id === seleccionado);
    const idx = seleccionarVisibles(todos.map((c) => c.peso), topes.maxCuerpos, forzado >= 0 ? [forzado] : []);
    return idx.map((k) => todos[k]);
  }, [grafo, posiciones, capasVisibles, seleccionado, topes.maxCuerpos]);

  const porId = useMemo(() => new Map(cuerpos.map((c) => [c.id, c])), [cuerpos]);
  const segmentos = useMemo(() => construirSegmentos(grafo.aristas, porId, topes.maxAristas), [grafo, porId, topes.maxAristas]);
  const radio = useMemo(() => cuerpos.reduce((m, c) => Math.max(m, Math.hypot(...c.pos)), 10), [cuerpos]);
  const objetivo = seleccionado ? porId.get(seleccionado)?.pos ?? null : null;

  return (
    <div className="relative h-full w-full cursor-grab active:cursor-grabbing" role="img" aria-label={`Universo de Ramas 4D con ${cuerpos.length} cuerpos visibles. La lista accesible está junto a la vista.`}>
      <Canvas
        frameloop={topes.cuadros === 0 && !reducido ? 'always' : 'demand'}
        dpr={tier === 'high' ? [1, 2] : [1, 1.25]}
        camera={{ position: [0, radio * 0.5, radio * 2.2 + 10], fov: 55, near: 0.1, far: radio * 12 + 200 }}
        gl={{ alpha: true, antialias: tier !== 'low', powerPreference: tier === 'low' ? 'low-power' : 'high-performance' }}
        onPointerMissed={() => onSeleccionar(null)}
      >
        <RitmoCuadros cuadros={topes.cuadros} reducido={reducido} />
        <OrbitControls makeDefault enableDamping={!reducido} dampingFactor={0.08} maxDistance={radio * 8 + 60} />
        <Vuelo objetivo={objetivo} reducido={reducido} />
        <AristasRamas segmentos={segmentos} />
        <SenalesParticulas segmentos={segmentos} max={topes.maxParticulas} reducido={reducido || topes.cuadros < 0} />
        <NodosInstanciados cuerpos={cuerpos} seleccionado={seleccionado} hover={hover} onSeleccionar={onSeleccionar} onHover={setHover} />
        <EtiquetasCercanas cuerpos={cuerpos} seleccionado={seleccionado} hover={hover} max={topes.maxEtiquetas} radio={18} />
      </Canvas>
    </div>
  );
}
