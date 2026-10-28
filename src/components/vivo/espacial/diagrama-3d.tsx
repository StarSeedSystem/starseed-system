"use client";

/**
 * Diagrama 3D y XR (Ola 1018D · tarea L): pinta la escena pura de `diagrama-3d.ts` con
 * @react-three/fiber para girarla y recorrerla. Los rótulos son `Html` de drei: siempre de
 * cara a la cámara y con las fuentes del OS, sin cargar ninguna fuente remota.
 * Basado en la skill MIT diagram-design (vendor/habilidades/diagram-design/), citada en
 * architecture/diagramas.md §3 y §4. Se monta dentro de `escena-compartida` y en salas XR.
 */

import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import { escena3d, estructuraDeSvg, type Arista3D, type Escena3D, type Nodo3D, type TipoEscena } from "@/lib/diagramas/diagrama-3d";

export interface PropsDiagrama3D {
  /** HTML+SVG validado por `aislar-diagrama.ts`; la escena solo lee su estructura. */
  svg: string;
  tipo?: TipoEscena;
  alto?: number;
  etiqueta?: string;
}

const FONDO = "#0b0d18";

function Rotulo({ nodo, alto }: { nodo: Nodo3D; alto: number }) {
  if (!nodo.etiqueta) return null;
  return (
    <Html center distanceFactor={10} position={[0, alto / 2 + 0.18, 0]} style={{ pointerEvents: "none" }}>
      <span className="whitespace-nowrap rounded-full border border-white/15 bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur">
        {nodo.etiqueta}
      </span>
    </Html>
  );
}

function Nodo({ nodo, activo, onElegir }: { nodo: Nodo3D; activo: boolean; onElegir: (id: string) => void }) {
  const [ancho, alto] = nodo.tamano;
  useEffect(() => () => { document.body.style.cursor = ""; }, []);
  return (
    <group position={nodo.pos}>
      <mesh
        onClick={(e) => { e.stopPropagation(); onElegir(nodo.id); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = ""; }}
      >
        <boxGeometry args={[ancho, alto, nodo.tamano[2]]} />
        <meshStandardMaterial color={nodo.color} emissive={nodo.color} emissiveIntensity={activo ? 0.7 : 0.15} roughness={0.45} metalness={0.15} transparent opacity={0.94} />
      </mesh>
      <mesh position={[0, 0, nodo.tamano[2] / 2 + 0.002]}>
        <planeGeometry args={[ancho * 1.01, alto * 1.01]} />
        <meshBasicMaterial color={nodo.color} transparent opacity={activo ? 0.35 : 0.1} />
      </mesh>
      <Rotulo nodo={nodo} alto={alto} />
    </group>
  );
}

function Aristas({ escena }: { escena: Escena3D }) {
  const posiciones = useMemo(() => new Map(escena.nodos.map((n) => [n.id, n.pos])), [escena]);
  return (
    <>
      {escena.aristas.map((a: Arista3D) => {
        const desde = posiciones.get(a.fuente), hasta = posiciones.get(a.destino);
        if (!desde || !hasta) return null;
        return <Line key={a.id} points={[desde, hasta]} color="#7C5CFF" lineWidth={1.2} transparent opacity={0.45} />;
      })}
    </>
  );
}

export function Diagrama3D({ svg, tipo = "grafo", alto = 420, etiqueta = "Diagrama en 3D" }: PropsDiagrama3D) {
  const [listo, setListo] = useState(false);
  const [activo, setActivo] = useState<string | null>(null);
  useEffect(() => setListo(true), []);
  const escena = useMemo(() => escena3d(estructuraDeSvg(svg), tipo), [svg, tipo]);
  const distancia = useMemo(() => Math.max(escena.radio, 2) * 2.1 + 4, [escena.radio]);
  const seleccionado = escena.nodos.find((n) => n.id === activo);

  if (!listo) return <div role="status" style={{ height: alto }} className="grid place-items-center rounded-2xl bg-[#0b0d18] text-[12.5px] text-white/60">Preparando la escena…</div>;
  if (!escena.nodos.length) return <div role="status" style={{ height: alto }} className="grid place-items-center rounded-2xl bg-[#0b0d18] px-6 text-center text-[12.5px] text-white/60">Este diagrama no tiene nodos que llevar al espacio.</div>;

  return (
    <figure aria-label={etiqueta} className="relative m-0 overflow-hidden rounded-2xl border border-white/10" style={{ height: alto }}>
      <Canvas dpr={[1, 2]} camera={{ position: [distancia * 0.55, distancia * 0.5, distancia], fov: 45 }}>
        <color attach="background" args={[FONDO]} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[8, 12, 6]} intensity={1.5} />
        <pointLight position={[-8, -4, -6]} intensity={0.45} color="#00F0FF" />
        {escena.aristas.length > 0 && <Aristas escena={escena} />}
        {escena.nodos.map((n) => <Nodo key={n.id} nodo={n} activo={n.id === activo} onElegir={setActivo} />)}
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} onStart={() => setActivo(null)} />
      </Canvas>
      <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent p-3 text-[11px] text-white/65">
        <span>{seleccionado ? seleccionado.etiqueta : "Arrastra para girar · rueda o pellizca para recorrer"}</span>
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-white/50">{escena.tipo}</span>
      </figcaption>
    </figure>
  );
}

export default Diagrama3D;
