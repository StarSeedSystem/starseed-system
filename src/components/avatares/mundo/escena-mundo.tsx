"use client";

/**
 * La escena 3D del mundo de los avatares (Ola 234; separada y ampliada en la Ola 1025U · U1):
 * suelo, zonas del escenario (dispuestas con `disponerSalas` de la oficina de Genesis, portada de
 * Hermes3D · MIT · Luke The Dev), vínculos fuertes, habitantes y cámara.
 *
 * Solo se monta dentro de un `<Canvas>`; el consumidor la carga ya en cliente (la página usa
 * `next/dynamic` con `ssr:false`).
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls, Sparkles, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { FuenteAvatar } from "../avatar-vivo";
import { Habitante3D } from "./habitante-3d";
import type { AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { ETIQUETA_ORIGEN } from "@/lib/avatares/mundo/habitantes";
import { gestoParaOcupacion } from "@/lib/avatares/mundo/gestos";
import type { EstadoMundo } from "@/lib/avatares/mundo/simulacion";
import { posicionEnEscena, SUELO_Y, type DisposicionZonas, type ZonaDispuesta } from "@/lib/avatares/mundo/zonas";

/** A qué distancia queda la cámara de quien se centra. */
const DISTANCIA_CORTESIA = 3.4;

export type ControlesRef = React.MutableRefObject<{ target: THREE.Vector3; update?: () => void } | null>;

/* ───────────────────────────── Vínculos ───────────────────────────── */

interface VinculoFuerte {
  a: [number, number, number];
  b: [number, number, number];
  intensidad: number;
  clave: string;
}

function LineaVinculo({ v }: { v: VinculoFuerte }) {
  return (
    <Line
      points={[v.a, v.b]}
      color={v.intensidad > 0.85 ? "#fbbf24" : "#22d3ee"}
      lineWidth={1.2 + v.intensidad * 1.6}
      transparent
      opacity={0.35 + v.intensidad * 0.45}
    />
  );
}

/* ───────────────────────────── Cámara ───────────────────────────── */

/**
 * La cámara sigue a quien se centró. Vuela hasta su distancia de cortesía UNA vez (`llegando`) y después solo
 * acompaña el objetivo: así el zoom y la órbita de la persona no se pelean con la cámara cada fotograma.
 */
function CameraRig({ objetivo, clave, controlsRef }: { objetivo: [number, number, number] | null; clave: string | null; controlsRef: ControlesRef }) {
  const dir = useRef(new THREE.Vector3());
  const destino = useRef(new THREE.Vector3());
  const llegando = useRef(false);
  useEffect(() => {
    llegando.current = clave !== null;
  }, [clave]);
  useFrame((state, dt) => {
    if (!objetivo) return;
    const paso = 1 - Math.pow(0.001, dt);
    destino.current.set(objetivo[0], objetivo[1] + 0.6, objetivo[2]);
    const cam = state.camera;
    if (llegando.current) {
      dir.current.subVectors(cam.position, destino.current).normalize();
      const deseado = destino.current.clone().add(dir.current.multiplyScalar(DISTANCIA_CORTESIA));
      cam.position.lerp(deseado, paso);
      if (cam.position.distanceTo(deseado) < 0.15) llegando.current = false;
    }
    const ctr = controlsRef.current;
    if (ctr) {
      ctr.target.lerp(destino.current, paso);
      ctr.update?.();
    }
  });
  return null;
}

/* ───────────────────────────── Suelo y zonas ───────────────────────────── */

function Suelo({ radio }: { radio: number }) {
  const anillos = useMemo(() => [0.25, 0.45, 0.65, 0.85].map((f) => Math.round(radio * f)), [radio]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SUELO_Y, 0]} receiveShadow>
        <circleGeometry args={[radio, 64]} />
        <meshStandardMaterial color="#0b1020" emissive="#0a1430" emissiveIntensity={0.35} roughness={0.85} metalness={0.1} />
      </mesh>
      {anillos.map((r, i) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, SUELO_Y + 0.01 + i * 0.001, 0]}>
          <ringGeometry args={[r - 0.02, r, 96]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.08 - i * 0.012} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function ZonaPlano({ zona, reducido, enXR }: { zona: ZonaDispuesta; reducido: boolean; enXR: boolean }) {
  const geometria = useMemo(() => {
    // La forma vive en el plano XY y se tumba con -90° en X: (x, y) → (x, 0, -y); por eso se pasa -z.
    const forma = new THREE.Shape();
    zona.contorno.forEach(([x, z], i) => (i === 0 ? forma.moveTo(x, -z) : forma.lineTo(x, -z)));
    forma.closePath();
    return new THREE.ShapeGeometry(forma);
  }, [zona.contorno]);
  useEffect(() => () => geometria.dispose(), [geometria]);
  const borde = useMemo<[number, number, number][]>(
    () => [...zona.contorno, zona.contorno[0]].map(([x, z]) => [x, 0, z] as [number, number, number]),
    [zona.contorno],
  );
  return (
    <group position={[zona.centro.x, SUELO_Y + 0.02, zona.centro.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={geometria}>
        <meshBasicMaterial color={zona.color} transparent opacity={0.12 + zona.actividad * (reducido ? 0 : 0.2)} side={THREE.DoubleSide} />
      </mesh>
      <Line points={borde} color={zona.color} lineWidth={1.4} transparent opacity={0.55} />
      {!enXR && (
        <Html center position={[0, 0.2, -zona.radio * 0.95]} distanceFactor={18} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <span
            data-testid="etiqueta-zona"
            className="whitespace-nowrap rounded-md border border-white/10 bg-[rgba(8,12,20,0.5)] px-2 py-0.5 font-headline text-[11px] font-bold uppercase tracking-[0.14em] text-white/75 backdrop-blur-md"
          >
            {zona.nombre} · {zona.ocupantes}
          </span>
        </Html>
      )}
    </group>
  );
}

/* ───────────────────────────── Escena ───────────────────────────── */

export interface EscenaMundoProps {
  estado: EstadoMundo;
  disposicion: DisposicionZonas;
  radioSuelo: number;
  /** Habitante → su referencia de agente (id del habitante). */
  refs: ReadonlyMap<string, AgenteMundoRef>;
  fuentes: ReadonlyMap<string, FuenteAvatar>;
  fuenteSinAvatar: FuenteAvatar;
  reducido: boolean;
  enXR: boolean;
  centradoId: string | null;
  onElegir: (id: string) => void;
  controlsRef: ControlesRef;
}

export function EscenaMundo({
  estado,
  disposicion,
  radioSuelo,
  refs,
  fuentes,
  fuenteSinAvatar,
  reducido,
  enXR,
  centradoId,
  onElegir,
  controlsRef,
}: EscenaMundoProps) {
  const vinculos = useMemo<VinculoFuerte[]>(() => {
    const pos = new Map(estado.habitantes.map((h) => [h.id, posicionEnEscena(h.posicion)] as const));
    const out: VinculoFuerte[] = [];
    const vistos = new Set<string>();
    for (const h of estado.habitantes) {
      for (const [otroId, fuerza] of Object.entries(h.vinculos)) {
        if (fuerza < 0.6) continue;
        const clave = [h.id, otroId].sort().join("::");
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        const a = pos.get(h.id);
        const b = pos.get(otroId);
        if (a && b) out.push({ a, b, intensidad: fuerza, clave });
      }
    }
    return out;
  }, [estado.habitantes]);

  const objetivo = useMemo(() => {
    if (!centradoId) return null;
    const h = estado.habitantes.find((x) => x.id === centradoId);
    return h ? posicionEnEscena(h.posicion) : null;
  }, [centradoId, estado.habitantes]);

  return (
    <>
      <fog attach="fog" args={["#05060f", radioSuelo * 0.7, radioSuelo * 2.4]} />
      <color attach="background" args={["#05060f"]} />
      <ambientLight intensity={0.55} color="#9db8ff" />
      <hemisphereLight intensity={0.5} color="#bff5d8" groundColor="#0a0d1a" />
      <directionalLight position={[8, 12, 6]} intensity={0.9} color="#ffe9b0" />
      <pointLight position={[0, 6, 0]} intensity={0.6} color="#a855f7" distance={radioSuelo * 1.6} />

      <Stars radius={140} depth={60} count={reducido ? 800 : 2500} factor={4} saturation={0} fade speed={reducido ? 0 : 0.4} />
      <Sparkles count={60} scale={[radioSuelo * 1.1, 12, radioSuelo * 1.1]} size={2.4} speed={reducido ? 0 : 0.22} color="#7CF6C8" opacity={0.4} />

      <Suelo radio={radioSuelo} />
      {disposicion.zonas.map((z) => (
        <ZonaPlano key={z.id} zona={z} reducido={reducido} enXR={enXR} />
      ))}
      {vinculos.map((v) => (
        <LineaVinculo key={v.clave} v={v} />
      ))}

      {estado.habitantes.map((h) => {
        const ref = refs.get(h.id);
        return (
          <Habitante3D
            key={h.id}
            habitante={h}
            fuente={fuentes.get(h.id) ?? fuenteSinAvatar}
            gesto={gestoParaOcupacion(h)}
            origen={ref ? ETIQUETA_ORIGEN[ref.origen] : "Bot de IA"}
            resaltado={centradoId === h.id}
            atenuado={centradoId !== null && centradoId !== h.id}
            enXR={enXR}
            onElegir={onElegir}
          />
        );
      })}

      <OrbitControls
        ref={controlsRef as unknown as React.Ref<OrbitControlsImpl>}
        makeDefault
        enablePan
        minDistance={3}
        maxDistance={Math.max(42, radioSuelo * 2)}
        maxPolarAngle={Math.PI / 2 - 0.05}
        autoRotate={!reducido && !centradoId}
        autoRotateSpeed={0.18}
        target={[0, 0.3, 0]}
      />
      <CameraRig objetivo={objetivo} clave={centradoId} controlsRef={controlsRef} />
    </>
  );
}
