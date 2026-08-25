"use client";

/**
 * mundo-escena-3d.tsx — El mundo en React Three Fiber: un único `<Canvas>`
 * compartido donde vive cada `<AvatarSer>` (que a propósito NO trae Canvas
 * propio — treinta contextos WebGL agotarían el límite del navegador mucho
 * antes de treinta seres; ver el comentario de cabecera de avatar-ser.tsx).
 *
 * QUÉ SE INSTANCIA (lo que se repite, una sola llamada de dibujado):
 *   - Pedestal bajo los pies de cada ser (`<Instances>`/`<Instance>`).
 *   - Toda arista visible — vínculos o ramas de linaje — en un solo
 *     `<Segments>` (drei), no una `<line>` por arista.
 * Lo que NO se instancia aquí es el propio `<AvatarSer>`: no es cosa de
 * este fichero optimizarlo por dentro (sería "escribir otro avatar"), y a
 * `detalle="bajo"` ya comparte geometría de núcleo entre instancias (ver
 * geometria.ts) y omite el halo — la instanciación de accesorios de aquí es
 * lo que SÍ está en el alcance de "mundo".
 *
 * CÁMARA: `OrbitControls` de drei cubre ratón (arrastrar/rueda) y TÁCTIL
 * (un dedo orbita, dos dedos acercan/desplazan — nativo de three.js, sin
 * código propio). El teclado es un puente propio (`useApiCamara` +
 * `alTecladoMundo`) sobre el <div> exterior, no sobre el <canvas> — así no
 * depende de si @react-three/fiber reenvía `tabIndex`/`onKeyDown` al
 * elemento interno, que no está garantizado entre versiones.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Instance, Instances, Line, OrbitControls, Segment, Segments } from "@react-three/drei";
import { AvatarSer } from "../avatar/avatar-ser";
import { adnEfectivo } from "./mundo-adn";
import { contornoEspacio } from "./mundo-espacio-forma";
import { aEscalaEscena, aPosicionEscena } from "./mundo-constantes";
import { resolveQuantumOrbTheme } from "@/lib/aurora/quantum-orb-theme";
import type { SerListado } from "@/lib/astraura/genesis-types";
import type { AristaVisible, PosicionMundo, RegionVisible } from "./mundo-tipos";

const TEMA = resolveQuantumOrbTheme("aurora");
const COLOR_FONDO = "#05070d";
const COLOR_SELECCION = TEMA.accent;
const COLOR_ARISTA_DEFECTO = TEMA.secondary;
const COLOR_PEDESTAL = TEMA.primary;

// ─────────────────────────────────────────────────────────── Cámara

interface ApiCamara {
  orbitar: (dTheta: number, dPhi: number) => void;
  acercar: (factor: number) => void;
  reset: () => void;
}

const PASO_ANGULO = THREE.MathUtils.degToRad(4);
const LIMITE_PHI_INFERIOR = 0.18;
const LIMITE_PHI_SUPERIOR = Math.PI - 0.18;

/**
 * OrbitControls (ratón + tacto) + el puente imperativo que usa el teclado
 * del `<div>` exterior + el retargeting suave del pivote de órbita cuando
 * cambia la selección (instantáneo si `animar` es falso — nada de tween
 * bajo movimiento reducido).
 */
function ControladorCamara({
  apiRef,
  seleccionId,
  posiciones,
  animar,
}: {
  apiRef: React.MutableRefObject<ApiCamara | null>;
  seleccionId: string | null;
  posiciones: ReadonlyMap<string, PosicionMundo>;
  animar: boolean;
}) {
  const { camera } = useThree();
  const controlesRef = useRef<React.ElementRef<typeof OrbitControls>>(null);
  const objetivoDeseado = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    apiRef.current = {
      orbitar(dTheta, dPhi) {
        const controles = controlesRef.current;
        if (!controles) return;
        const esferico = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controles.target));
        esferico.theta -= dTheta;
        esferico.phi = THREE.MathUtils.clamp(esferico.phi + dPhi, LIMITE_PHI_INFERIOR, LIMITE_PHI_SUPERIOR);
        camera.position.copy(new THREE.Vector3().setFromSpherical(esferico).add(controles.target));
        controles.update();
      },
      acercar(factor) {
        const controles = controlesRef.current;
        if (!controles) return;
        const distancia = camera.position.distanceTo(controles.target);
        const nueva = THREE.MathUtils.clamp(distancia * factor, controles.minDistance, controles.maxDistance);
        const direccion = camera.position.clone().sub(controles.target).normalize();
        camera.position.copy(direccion.multiplyScalar(nueva).add(controles.target));
        controles.update();
      },
      reset() {
        controlesRef.current?.reset();
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, camera]);

  // Retargeting suave hacia el ser seleccionado: mueve el PIVOTE, no la
  // cámara — el usuario conserva su ángulo/zoom, solo cambia sobre qué gira.
  useEffect(() => {
    if (!seleccionId) return;
    const posicion = posiciones.get(seleccionId);
    if (!posicion) return;
    const [x, y, z] = aPosicionEscena(posicion);
    objetivoDeseado.current = new THREE.Vector3(x, y, z);
    if (!animar && controlesRef.current) {
      controlesRef.current.target.set(x, y, z);
      controlesRef.current.update();
      objetivoDeseado.current = null;
    }
  }, [seleccionId, posiciones, animar]);

  useFrame((_, delta) => {
    const controles = controlesRef.current;
    const objetivo = objetivoDeseado.current;
    if (controles && objetivo) {
      controles.target.lerp(objetivo, Math.min(1, delta * 4));
      if (controles.target.distanceTo(objetivo) < 0.01) {
        controles.target.copy(objetivo);
        objetivoDeseado.current = null;
      }
      controles.update();
    }
  });

  return (
    <OrbitControls
      ref={controlesRef}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      minDistance={2}
      maxDistance={90}
      maxPolarAngle={LIMITE_PHI_SUPERIOR}
      minPolarAngle={LIMITE_PHI_INFERIOR}
    />
  );
}

// ─────────────────────────────────────────────────────────── Un ser

function NodoSer({
  ser,
  posicion,
  seleccionado,
  animar,
  onSeleccionar,
}: {
  ser: SerListado;
  posicion: PosicionMundo;
  seleccionado: boolean;
  animar: boolean;
  onSeleccionar: (id: string) => void;
}) {
  const [sobrevolado, setSobrevolado] = useState(false);
  const adn = useMemo(() => adnEfectivo(ser), [ser]);
  const posEscena = useMemo(() => aPosicionEscena(posicion), [posicion]);

  return (
    <group
      position={posEscena as unknown as [number, number, number]}
      onClick={(e) => {
        e.stopPropagation();
        onSeleccionar(ser.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setSobrevolado(true);
      }}
      onPointerOut={() => setSobrevolado(false)}
    >
      {/* Diana invisible más generosa que el núcleo — cómoda con el dedo. */}
      <mesh visible={false}>
        <sphereGeometry args={[1.1, 8, 8]} />
        <meshBasicMaterial />
      </mesh>

      <AvatarSer adn={adn} detalle="bajo" animar={animar} />

      {(seleccionado || sobrevolado) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.85, 1.02, 32]} />
          <meshBasicMaterial
            color={seleccionado ? COLOR_SELECCION : "#ffffff"}
            transparent
            opacity={seleccionado ? 0.85 : 0.35}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {(seleccionado || sobrevolado) && (
        <Html center distanceFactor={9} position={[0, 1.5, 0]} pointerEvents="none" occlude={false}>
          <div className="whitespace-nowrap rounded-md border border-white/15 bg-black/70 px-2 py-1 text-xs text-white shadow-lg backdrop-blur-sm">
            {ser.nombre} <span className="text-white/50">· {ser.rol}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────────────── Pedestales (instanciados)

function Pedestales({ seres, posiciones }: { seres: readonly SerListado[]; posiciones: ReadonlyMap<string, PosicionMundo> }) {
  if (seres.length === 0) return null;
  return (
    <Instances limit={Math.max(seres.length, 1)} range={seres.length}>
      <cylinderGeometry args={[0.72, 0.86, 0.06, 12]} />
      <meshStandardMaterial color={COLOR_PEDESTAL} transparent opacity={0.22} roughness={0.6} />
      {seres.map((ser) => {
        const posicion = posiciones.get(ser.id);
        if (!posicion) return null;
        const [x, y, z] = aPosicionEscena(posicion);
        return <Instance key={ser.id} position={[x, y - 0.62, z]} />;
      })}
    </Instances>
  );
}

// ─────────────────────────────────────────────────────── Aristas (instanciadas)

function AristasBatch({
  aristas,
  posiciones,
}: {
  aristas: readonly AristaVisible[];
  posiciones: ReadonlyMap<string, PosicionMundo>;
}) {
  const segmentos = useMemo(() => {
    return aristas
      .map((arista) => {
        const a = posiciones.get(arista.origenId);
        const b = posiciones.get(arista.destinoId);
        if (!a || !b) return null;
        return { arista, a: aPosicionEscena(a), b: aPosicionEscena(b) };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [aristas, posiciones]);

  if (segmentos.length === 0) return null;

  return (
    <Segments limit={segmentos.length} lineWidth={1.1}>
      {segmentos.map(({ arista, a, b }) => (
        <Segment
          key={arista.id}
          start={a as unknown as [number, number, number]}
          end={b as unknown as [number, number, number]}
          color={arista.tipo === "linaje" ? TEMA.core : COLOR_ARISTA_DEFECTO}
        />
      ))}
    </Segments>
  );
}

// ─────────────────────────────────────────────────────── Regiones (comunidad/espacio)

function RegionVisual({ region }: { region: RegionVisible }) {
  const [cx, cy, cz] = aPosicionEscena(region.centro);
  const radioEscena = aEscalaEscena(region.radio);

  const puntos = useMemo(() => {
    if (region.tipo === "espacio" && region.semilla !== null) {
      const contorno = contornoEspacio(region.semilla, radioEscena);
      const cerrado = [...contorno, contorno[0]];
      return cerrado.map(([x, z]) => new THREE.Vector3(x, 0, z));
    }
    // 22 segmentos, no 40+: a la escala de una región (unos pocos px de
    // radio en pantalla) es indistinguible de un círculo más fino, y con
    // varias comunidades a la vez en un rasterizador por software cada
    // vértice de más se nota (medido: ver el informe de rendimiento).
    const segmentosCirculo = 22;
    return Array.from({ length: segmentosCirculo + 1 }, (_, i) => {
      const a = (i / segmentosCirculo) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * radioEscena, 0, Math.sin(a) * radioEscena);
    });
  }, [region.tipo, region.semilla, radioEscena]);

  const color = region.color ?? (region.tipo === "espacio" ? TEMA.core : TEMA.primary);

  return (
    <group position={[cx, cy - 0.65, cz]}>
      <Line points={puntos} color={color} lineWidth={region.tipo === "espacio" ? 1.6 : 1} transparent opacity={0.55} />
      {/* ShapeGeometry se dibuja en el plano XY local; al rotarla -90° en X
          para tumbarla sobre el suelo XZ, un punto local (a,b) acaba en
          mundo (a, 0, -b) — así que se le pasa (x, -z), no (x, z), para que
          el relleno caiga EXACTAMENTE bajo el contorno de `<Line>` de
          arriba (que sí usa (x, 0, z) directo) y no una versión reflejada. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[new THREE.Shape(puntos.map((p) => new THREE.Vector2(p.x, -p.z)))]} />
        <meshBasicMaterial color={color} transparent opacity={region.tipo === "espacio" ? 0.06 : 0.045} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────── Mundo vacío digno

function MundoVacio() {
  return (
    <Html center pointerEvents="none">
      <div className="whitespace-nowrap rounded-lg border border-white/10 bg-black/50 px-4 py-2 text-sm text-white/70">
        Aún no hay seres en este mundo.
      </div>
    </Html>
  );
}

// ─────────────────────────────────────────────────────── Escena raíz

export interface MundoEscena3DProps {
  seres: readonly SerListado[];
  posiciones: ReadonlyMap<string, PosicionMundo>;
  aristas: readonly AristaVisible[];
  regiones: readonly RegionVisible[];
  seleccion: string | null;
  onSeleccionar: (id: string | null) => void;
  animar: boolean;
  className?: string;
}

export function MundoEscena3D({
  seres,
  posiciones,
  aristas,
  regiones,
  seleccion,
  onSeleccionar,
  animar,
  className,
}: MundoEscena3DProps) {
  const apiCamaraRef = useRef<ApiCamara | null>(null);

  const alTeclado = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const api = apiCamaraRef.current;
    if (!api) return;
    switch (e.key) {
      case "ArrowLeft":
        api.orbitar(-PASO_ANGULO, 0);
        e.preventDefault();
        break;
      case "ArrowRight":
        api.orbitar(PASO_ANGULO, 0);
        e.preventDefault();
        break;
      case "ArrowUp":
        api.orbitar(0, -PASO_ANGULO);
        e.preventDefault();
        break;
      case "ArrowDown":
        api.orbitar(0, PASO_ANGULO);
        e.preventDefault();
        break;
      case "+":
      case "=":
        api.acercar(0.88);
        e.preventDefault();
        break;
      case "-":
      case "_":
        api.acercar(1.14);
        e.preventDefault();
        break;
      case "Home":
        api.reset();
        e.preventDefault();
        break;
      case "Escape":
        onSeleccionar(null);
        break;
      default:
        break;
    }
  };

  return (
    <div
      className={className}
      role="application"
      tabIndex={0}
      aria-label="Vista 3D del mundo de seres. Flechas para orbitar la cámara, + y - para acercar o alejar, Inicio para restablecer la vista. La lista de seres, debajo, permite seleccionar y escuchar cada uno sin depender de esta vista."
      onKeyDown={alTeclado}
      onClick={(e) => {
        // Clic en vacío (nada capturó el evento antes) = deseleccionar.
        if (e.target === e.currentTarget) onSeleccionar(null);
      }}
    >
      <Canvas
        dpr={[1, 2]}
        shadows={false}
        camera={{ position: [0, 6, 16], fov: 52, near: 0.1, far: 400 }}
        gl={{ antialias: true, alpha: false }}
        onPointerMissed={() => onSeleccionar(null)}
      >
        <color attach="background" args={[COLOR_FONDO]} />
        <fog attach="fog" args={[COLOR_FONDO, 22, 95]} />

        <ambientLight intensity={0.55} />
        <pointLight position={[12, 14, 10]} intensity={0.7} color={TEMA.secondary} />
        <pointLight position={[-12, -6, -10]} intensity={0.35} color={TEMA.primary} />

        <ControladorCamara apiRef={apiCamaraRef} seleccionId={seleccion} posiciones={posiciones} animar={animar} />

        {seres.length === 0 ? (
          <MundoVacio />
        ) : (
          <>
            {regiones.map((region) => (
              <RegionVisual key={region.id} region={region} />
            ))}
            {/* `key` por recuento: `limit` de <Instances>/<Segments> dimensiona
                el buffer instanciado AL MONTAR — si el número de seres o de
                aristas crece en una prop posterior (un backend que añade un
                vínculo en caliente), forzar un remontaje completo es la
                forma segura de que el nuevo tamaño se refleje siempre, en
                vez de confiar en que el pool interno se redimensione solo. */}
            <Pedestales key={seres.length} seres={seres} posiciones={posiciones} />
            <AristasBatch key={aristas.length} aristas={aristas} posiciones={posiciones} />
            {seres.map((ser) => {
              const posicion = posiciones.get(ser.id);
              if (!posicion) return null;
              return (
                <NodoSer
                  key={ser.id}
                  ser={ser}
                  posicion={posicion}
                  seleccionado={seleccion === ser.id}
                  animar={animar}
                  onSeleccionar={onSeleccionar}
                />
              );
            })}
          </>
        )}
      </Canvas>
    </div>
  );
}

export default MundoEscena3D;
