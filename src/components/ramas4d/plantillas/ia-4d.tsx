'use client';

/**
 * IA 4D — Visualización 3D de la plantilla IA (MV1125O).
 * Astraura en el centro (estrella), agentes y bots como cometas que viajan,
 * habilidades y conectores como lunas orbitando, llamadas como partículas vivas.
 * Solo se importa con next/dynamic({ ssr: false }).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { Grafo4D } from '@/lib/ramas4d/modelo';
import type { PlantillaIA } from '@/lib/ramas4d/plantillas/ia';
import { seleccionarVisibles, topesEscena } from '@/lib/ramas4d/topes';
import { MODO_CHANGED_EVENT, type ModoRendimiento, type PerfTierAuto } from '@/lib/perf/modo-rendimiento';
import { PERF_CHANGED_EVENT, detectTier, modoEfectivo } from '@/lib/perf/device-tier';
import { NodosInstanciados, type Cuerpo } from '@/components/ramas4d/nodos-instanciados';
import { AristasRamas, construirSegmentos } from '@/components/ramas4d/aristas-ramas';
import { SenalesParticulas } from '@/components/ramas4d/senales-particulas';
import { EtiquetasCercanas } from '@/components/ramas4d/etiquetas-cercanas';

export interface IA4DProps {
  plantilla: PlantillaIA;
  posiciones: Float32Array | null;
  seleccionado: string | null;
  onSeleccionar: (id: string | null) => void;
  capasVisibles: string[];
}

const IDLE_MS = 60_000;
const VUELO_DIST = 14;
const ORBITA_RADIO_BASE = 18;
const COMETA_LONGITUD = 35;
const LUNA_RADIO = 8;
const PARTICULA_VELOCIDAD = 12;

interface ControlesOrbita { target: THREE.Vector3; update: () => void }

interface Cometa {
  id: string;
  posInicial: THREE.Vector3;
  posActual: THREE.Vector3;
  objetivo: THREE.Vector3;
  progreso: number;
  color: THREE.Color;
}

interface Luna {
  id: string;
  angulo: number;
  radio: number;
  velocidad: number;
  color: THREE.Color;
  posActual: THREE.Vector3;
}

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

function RitmoCuadros({ cuadros, reducido }: { cuadros: number; reducido: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (reducido || cuadros <= 0) return;
    const id = setInterval(invalidate, 1000 / cuadros);
    return () => clearInterval(id);
  }, [cuadros, reducido, invalidate]);
  return null;
}

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

function CentroEstrella({ posicion, brillo, pulsando }: { posicion: [number, number, number]; brillo: number; pulsando: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (!ref.current) return;
    const escala = pulsando ? 1 + 0.15 * Math.sin(Date.now() / 300) : 1;
    ref.current.scale.setScalar(escala * (0.8 + 0.4 * brillo));
    ref.current.rotation.y += delta * 0.15;
    ref.current.rotation.x += delta * 0.07;
  });
  return (
    <group position={posicion}>
      <mesh ref={ref} castShadow receiveShadow>
        <icosahedronGeometry args={[2.2, 0]} />
        <meshStandardMaterial
          color="#00f0ff"
          emissive="#00f0ff"
          emissiveIntensity={0.6 * brillo}
          metalness={0.3}
          roughness={0.2}
          transparent
          opacity={0.9}
        />
      </mesh>
      <mesh castShadow receiveShadow>
        <icosahedronGeometry args={[2.8, 1]} />
        <meshBasicMaterial
          color="#00f0ff"
          transparent
          opacity={0.12 * brillo}
          side={THREE.BackSide}
        />
      </mesh>
      <pointLight color="#00f0ff" intensity={1.5 * brillo} distance={40} decay={1.5} />
    </group>
  );
}

function CometaVisual({ cometa, tiempo }: { cometa: Cometa; tiempo: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!ref.current) return;
    cometa.progreso = (cometa.progreso + delta * 0.3) % 1;
    const pos = cometa.posInicial.clone().lerp(cometa.objetivo, cometa.progreso);
    cometa.posActual.copy(pos);
    ref.current.position.copy(pos);
    ref.current.rotation.y += delta * 2;
    ref.current.rotation.x += delta * 1.3;
  });
  return (
    <group ref={ref} position={cometa.posInicial.toArray()}>
      <mesh castShadow receiveShadow>
        <coneGeometry args={[0.6, 3, 8]} />
        <meshStandardMaterial
          color={cometa.color}
          emissive={cometa.color}
          emissiveIntensity={0.8}
          metalness={0.5}
          roughness={0.1}
        />
      </mesh>
      <mesh castShadow receiveShadow>
        <coneGeometry args={[0.3, 6, 8]} />
        <meshBasicMaterial
          color={cometa.color}
          transparent
          opacity={0.4}
          side={THREE.BackSide}
        />
      </mesh>
      <line2
        geometry={new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, -COMETA_LONGITUD, 0),
        ])}
        material={new THREE.LineMaterial({
          color: cometa.color.getHex(),
          linewidth: 0.02,
          transparent: true,
          opacity: 0.6,
          dashed: true,
          dashScale: 2,
          dashSize: 1.5,
          gapSize: 1,
        })}
      />
    </group>
  );
}

function LunaVisual({ luna, centro }: { luna: Luna; centro: THREE.Vector3 }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (!ref.current) return;
    luna.angulo += delta * luna.velocidad;
    const x = Math.cos(luna.angulo) * luna.radio;
    const z = Math.sin(luna.angulo) * luna.radio;
    const y = Math.sin(luna.angulo * 2) * (luna.radio * 0.15);
    luna.posActual.set(centro.x + x, centro.y + y, centro.z + z);
    ref.current.position.copy(luna.posActual);
    ref.current.rotation.y += delta * 0.5;
  });
  return (
    <mesh ref={ref} castShadow receiveShadow position={centro.toArray()}>
      <sphereGeometry args={[1.2, 16, 16]} />
      <meshStandardMaterial
        color={luna.color}
        emissive={luna.color}
        emissiveIntensity={0.4}
        metalness={0.2}
        roughness={0.4}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}

function AnilloOrbita({ radio, color = '#00f0ff', opacidad = 0.08 }: { radio: number; color?: string; opacidad?: number }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
      <ringGeometry args={[radio - 0.15, radio + 0.15, 64]} />
      <meshBasicMaterial color={color} transparent opacity={opacidad} side={THREE.DoubleSide} />
    </mesh>
  );
}

export default function IA4D({ plantilla, posiciones, seleccionado, onSeleccionar, capasVisibles }: IA4DProps) {
  const { tier, modo, sinUso, reducido } = usePerfil();
  const topes = useMemo(() => topesEscena({ tier, modo, sinUso }), [tier, modo, sinUso]);
  const [hover, setHover] = useState<string | null>(null);
  const [tiempo, setTiempo] = useState(0);

  useFrame((_, delta) => { setTiempo((t) => t + delta); });

  const centroPos = useMemo(() => {
    if (!plantilla.centro || !posiciones) return [0, 0, 0] as [number, number, number];
    const idx = [...plantilla.grafo.nodos.keys()].indexOf(plantilla.centro);
    if (idx < 0) return [0, 0, 0] as [number, number, number];
    const o = idx * 3;
    if (o + 2 >= posiciones.length) return [0, 0, 0] as [number, number, number];
    return [posiciones[o], posiciones[o + 1], posiciones[o + 2]] as [number, number, number];
  }, [plantilla.centro, posiciones]);

  const centroVec3 = useMemo(() => new THREE.Vector3(...centroPos), [centroPos]);

  const cometas = useMemo<Cometa[]>(() => {
    if (!posiciones) return [];
    const resultado: Cometa[] = [];
    const nodosArray = [...plantilla.grafo.nodos.keys()];
    for (const cometaId of plantilla.cometas) {
      const idx = nodosArray.indexOf(cometaId);
      if (idx < 0) continue;
      const o = idx * 3;
      if (o + 2 >= posiciones.length) continue;
      const posInicial = new THREE.Vector3(posiciones[o], posiciones[o + 1], posiciones[o + 2]);
      const angulo = Math.random() * Math.PI * 2;
      const distancia = ORBITA_RADIO_BASE + Math.random() * 12;
      const objetivo = new THREE.Vector3(
        centroPos[0] + Math.cos(angulo) * distancia,
        centroPos[1] + (Math.random() - 0.5) * 6,
        centroPos[2] + Math.sin(angulo) * distancia
      );
      const nodo = plantilla.grafo.nodos.get(cometaId);
      const color = nodo?.etiquetas.some((e) => e.startsWith('trabajando')) ? new THREE.Color('#39ff14') : new THREE.Color('#ffbf00');
      resultado.push({ id: cometaId, posInicial, posActual: posInicial.clone(), objetivo, progreso: 0, color });
    }
    return resultado;
  }, [plantilla.cometas, plantilla.grafo.nodos, posiciones, centroPos]);

  const lunas = useMemo<Luna[]>(() => {
    const resultado: Luna[] = [];
    for (const lunaId of plantilla.lunas) {
      const nodo = plantilla.grafo.nodos.get(lunaId);
      const anguloInicial = Math.random() * Math.PI * 2;
      const radio = LUNA_RADIO + Math.random() * 6;
      const velocidad = 0.3 + Math.random() * 0.5;
      let color = new THREE.Color('#a855f7');
      if (nodo?.tipo === 'conector') color = new THREE.Color('#00f0ff');
      if (nodo?.tipo === 'habilidad') color = new THREE.Color('#ffbf00');
      resultado.push({
        id: lunaId,
        angulo: anguloInicial,
        radio,
        velocidad,
        color,
        posActual: new THREE.Vector3(),
      });
    }
    return resultado;
  }, [plantilla.lunas, plantilla.grafo.nodos]);

  const cuerpos = useMemo<Cuerpo[]>(() => {
    if (!posiciones) return [];
    const todos: Cuerpo[] = [];
    let i = 0;
    for (const n of plantilla.grafo.nodos.values()) {
      const o = i++ * 3;
      if (o + 2 >= posiciones.length) break;
      if (capasVisibles.length > 0 && !n.capas.some((c) => capasVisibles.some((v) => c.startsWith(v)))) continue;
      if (plantilla.cometas.includes(n.id) || plantilla.lunas.includes(n.id) || n.id === plantilla.centro) continue;
      todos.push({ id: n.id, tipo: n.tipo, titulo: n.titulo, peso: n.peso, pos: [posiciones[o], posiciones[o + 1], posiciones[o + 2]] });
    }
    const forzado = todos.findIndex((c) => c.id === seleccionado);
    const idx = seleccionarVisibles(todos.map((c) => c.peso), topes.maxCuerpos, forzado >= 0 ? [forzado] : []);
    return idx.map((k) => todos[k]);
  }, [plantilla.grafo, posiciones, capasVisibles, seleccionado, topes.maxCuerpos, plantilla.cometas, plantilla.lunas, plantilla.centro]);

  const porId = useMemo(() => new Map(cuerpos.map((c) => [c.id, c])), [cuerpos]);
  const segmentos = useMemo(() => construirSegmentos(plantilla.grafo.aristas, porId, topes.maxAristas), [plantilla.grafo.aristas, porId, topes.maxAristas]);
  const radio = useMemo(() => Math.max(centroVec3.length() + 30, ...cuerpos.map((c) => Math.hypot(...c.pos))), [centroVec3, cuerpos]);
  const objetivo = seleccionado ? porId.get(seleccionado)?.pos ?? null : null;
  const centroBrillo = plantilla.centro ? plantilla.brillo.get(plantilla.centro) ?? 1 : 1;

  return (
    <div className="relative h-full w-full cursor-grab active:cursor-grabbing" role="img" aria-label={`Universo IA 4D: ${plantilla.grafo.nodos.size} entidades, ${plantilla.cometas.length} cometas, ${plantilla.lunas.length} lunas, ${plantilla.particulas.length} partículas vivas.`}>
      <Canvas
        frameloop={topes.cuadros === 0 && !reducido ? 'always' : 'demand'}
        dpr={tier === 'high' ? [1, 2] : [1, 1.25]}
        camera={{ position: [centroPos[0], centroPos[1] + radio * 0.3, centroPos[2] + radio * 2.2 + 10], fov: 55, near: 0.1, far: radio * 12 + 200 }}
        gl={{ alpha: true, antialias: tier !== 'low', powerPreference: tier === 'low' ? 'low-power' : 'high-performance' }}
        onPointerMissed={() => onSeleccionar(null)}
      >
        <RitmoCuadros cuadros={topes.cuadros} reducido={reducido} />
        <OrbitControls makeDefault enableDamping={!reducido} dampingFactor={0.08} maxDistance={radio * 8 + 60} />
        <Vuelo objetivo={objetivo} reducido={reducido} />

        <AnilloOrbita radio={ORBITA_RADIO_BASE} color="#00f0ff" opacidad={0.06} />
        <AnilloOrbita radio={ORBITA_RADIO_BASE + 6} color="#a855f7" opacidad={0.04} />
        <AnilloOrbita radio={ORBITA_RADIO_BASE + 14} color="#ffbf00" opacidad={0.03} />

        <CentroEstrella posicion={centroPos} brillo={centroBrillo} pulsando={true} />

        {cometas.map((c) => (
          <CometaVisual key={c.id} cometa={c} tiempo={tiempo} />
        ))}

        {lunas.map((l) => (
          <LunaVisual key={l.id} luna={l} centro={centroVec3} />
        ))}

        <AristasRamas segmentos={segmentos} />
        <SenalesParticulas segmentos={segmentos} max={topes.maxParticulas} reducido={reducido || topes.cuadros < 0} />
        <NodosInstanciados cuerpos={cuerpos} seleccionado={seleccionado} hover={hover} onSeleccionar={onSeleccionar} onHover={setHover} />
        <EtiquetasCercanas cuerpos={cuerpos} seleccionado={seleccionado} hover={hover} max={topes.maxEtiquetas} radio={18} />

        <ambientLight color="#ffffff" intensity={0.3} />
        <directionalLight color="#ffffff" intensity={0.6} position={[50, 100, 50]} castShadow />
        <directionalLight color="#00f0ff" intensity={0.2} position={[-50, 50, -50]} />
      </Canvas>
    </div>
  );
}