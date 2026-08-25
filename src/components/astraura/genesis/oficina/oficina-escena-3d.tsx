"use client";

/**
 * oficina-escena-3d.tsx — La oficina en React Three Fiber: salas navegables
 * con su columna de actividad, ocupantes que planean hacia su sitio y viven
 * su actividad con una capa de animación propia por encima del latido que ya
 * trae `AvatarSer` de fábrica.
 *
 * PORTADO DE HERMES3D (MIT, © 2026 Luke The Dev — ver LICENSE-hermes3d.md) en
 * el sentido de CÁMARA Y NAVEGACIÓN: la idea de "una cámara que puedes mover
 * con teclado y que puede saltar de sala en sala" viene de ahí, pero la
 * cámara concreta (OrbitControls + puente de teclado + retargeting suave) es
 * la MISMA pieza que ya construyó `genesis/mundo/mundo-escena-3d.tsx` para el
 * mundo compartido — se reutiliza el patrón tal cual, con las mismas teclas,
 * para que moverse por la oficina y por el mundo se sienta igual. Lo único
 * añadido aquí es `[`/`]` para saltar de sala en sala (algo que el mundo no
 * necesita porque no tiene "salas").
 *
 * NO se portan los avatares de Hermes3D (sprites 2D con ciclo de piernas) —
 * cada ocupante es nuestro `<AvatarSer>`, el cuerpo derivado del ADN del ser.
 * "Caminar" aquí es planear: un organismo sin piernas no anda, se desplaza.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import { AvatarSer } from "../avatar/avatar-ser";
// `adnEfectivo` es de `genesis/mundo/` — se importa por su ÍNDICE PÚBLICO
// (nunca alcanzando un fichero interno suyo), igual que `oficina-salas.ts`
// hace con `contornoEspacio`: son las dos únicas piezas que esta carpeta
// toma prestadas de `mundo/`, y las dos por la puerta de entrada oficial.
import { adnEfectivo } from "@/components/astraura/genesis/mundo";
import { fnv1a32 } from "@/lib/astraura/genesis-dna";
import { resolveQuantumOrbTheme } from "@/lib/aurora/quantum-orb-theme";
import { describirOcupante } from "./oficina-ocupantes";
import { actividadVisible } from "./oficina-honestidad";
import { ALTURA_COLUMNA_ACTIVIDAD, COLOR_FONDO_OFICINA, RADIO_COLUMNA_ACTIVIDAD, RADIO_OCUPANTE, VELOCIDAD_TRASLADO_OCUPANTE } from "./oficina-constantes";
import type { DisposicionOficina, OcupanteResuelto, PosicionOficina, SalaDispuesta } from "./oficina-tipos";

const TEMA = resolveQuantumOrbTheme("aurora");
const COLOR_SELECCION = TEMA.accent;

// ─────────────────────────────────────────────────────────── Cámara

interface ApiCamara {
  orbitar: (dTheta: number, dPhi: number) => void;
  acercar: (factor: number) => void;
  reset: () => void;
}

const PASO_ANGULO = THREE.MathUtils.degToRad(4);
const LIMITE_PHI_INFERIOR = 0.18;
const LIMITE_PHI_SUPERIOR = Math.PI - 0.18;

/** Mismo controlador que `mundo-escena-3d.tsx` (OrbitControls + puente de
 * teclado + retargeting suave del pivote), generalizado a un `objetivo` que
 * el padre decide libremente (sala enfocada u ocupante seleccionado). */
function ControladorCamara({
  apiRef,
  objetivo,
  animar,
}: {
  apiRef: React.MutableRefObject<ApiCamara | null>;
  objetivo: PosicionOficina | null;
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

  useEffect(() => {
    if (!objetivo) return;
    const destino = new THREE.Vector3(objetivo.x, objetivo.y, objetivo.z);
    objetivoDeseado.current = destino;
    if (!animar && controlesRef.current) {
      controlesRef.current.target.copy(destino);
      controlesRef.current.update();
      objetivoDeseado.current = null;
    }
  }, [objetivo, animar]);

  useFrame((_, delta) => {
    const controles = controlesRef.current;
    const destino = objetivoDeseado.current;
    if (controles && destino) {
      controles.target.lerp(destino, Math.min(1, delta * 4));
      if (controles.target.distanceTo(destino) < 0.01) {
        controles.target.copy(destino);
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
      minDistance={3}
      maxDistance={140}
      maxPolarAngle={LIMITE_PHI_SUPERIOR}
      minPolarAngle={LIMITE_PHI_INFERIOR}
    />
  );
}

// ─────────────────────────────────────────────────────────── Una sala

function SalaVisual({
  sala,
  datosReales,
  enfocada,
  onEnfocar,
}: {
  sala: SalaDispuesta;
  datosReales: boolean;
  enfocada: boolean;
  onEnfocar: (id: string) => void;
}) {
  const [sobrevolada, setSobrevolada] = useState(false);
  const actividad = actividadVisible(sala.actividad, datosReales);

  const puntosContorno = useMemo(() => {
    const cerrado = [...sala.contorno, sala.contorno[0]];
    return cerrado.map(([x, z]) => new THREE.Vector3(sala.centro.x + x, 0, sala.centro.z + z));
  }, [sala.contorno, sala.centro]);

  const formaRelleno = useMemo(
    () => new THREE.Shape(sala.contorno.map(([x, z]) => new THREE.Vector2(x, -z))),
    [sala.contorno],
  );

  const mostrarEtiqueta = enfocada || sobrevolada;

  return (
    <group>
      <Line points={puntosContorno} color={sala.color} lineWidth={enfocada ? 2 : 1.3} transparent opacity={enfocada ? 0.85 : 0.5} />
      <mesh
        position={[sala.centro.x, 0, sala.centro.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onEnfocar(sala.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setSobrevolada(true);
        }}
        onPointerOut={() => setSobrevolada(false)}
      >
        <shapeGeometry args={[formaRelleno]} />
        <meshBasicMaterial color={sala.color} transparent opacity={0.06 + actividad * 0.22} side={THREE.DoubleSide} />
      </mesh>

      {/* Columna de actividad — la señal de "aquí pasa algo" a distancia.
          Colapsada a (casi) nada cuando la actividad visible es 0: una sala
          quieta se ve quieta, no con una columna a media asta fingiendo algo. */}
      {actividad > 0.02 && (
        <mesh position={[sala.centro.x, (ALTURA_COLUMNA_ACTIVIDAD * actividad) / 2, sala.centro.z]}>
          <cylinderGeometry args={[RADIO_COLUMNA_ACTIVIDAD, RADIO_COLUMNA_ACTIVIDAD * 1.4, ALTURA_COLUMNA_ACTIVIDAD * actividad, 10]} />
          <meshBasicMaterial color={sala.color} transparent opacity={0.16 + actividad * 0.3} />
        </mesh>
      )}

      {mostrarEtiqueta && (
        <Html center distanceFactor={16} position={[sala.centro.x, 1.4, sala.centro.z]} pointerEvents="none" occlude={false}>
          <div className="whitespace-nowrap rounded-md border border-white/15 bg-black/70 px-2 py-1 text-xs text-white shadow-lg backdrop-blur-sm">
            {sala.nombre}
            <span className="text-white/50">
              {" "}
              · {sala.ocupantes} {sala.ocupantes === 1 ? "ser" : "seres"} · {Math.round(actividad * 100)}% actividad
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────────────────── Un ocupante

function OcupanteVisual({
  ocupante,
  seleccionado,
  animar,
  onSeleccionar,
}: {
  // `ser` ya viene garantizado no-nulo — el padre filtra antes de montar
  // este componente (ver `ocupantesRenderizables` en OficinaEscena3D). Así
  // ningún hook de aquí abajo queda tras un `return` condicional: las Reglas
  // de los Hooks exigen que se llamen siempre en el mismo orden, y un early
  // return por "ser no encontrado" antes de un useMemo/useFrame lo rompería.
  ocupante: OcupanteResuelto & { ser: NonNullable<OcupanteResuelto["ser"]> };
  seleccionado: boolean;
  animar: boolean;
  onSeleccionar: (id: string) => void;
}) {
  const [sobrevolado, setSobrevolado] = useState(false);
  const grupoRef = useRef<THREE.Group>(null);
  const grupoActividadRef = useRef<THREE.Group>(null);
  const posicionActual = useRef<{ x: number; y: number; z: number }>({ ...ocupante.objetivo });
  // Fase propia determinista (mismo truco que avatar-ser.tsx: de la semilla,
  // no de Math.random) — así no todos los ocupantes de una sala laten a la
  // vez, cada uno lleva su propio compás.
  const faseRef = useRef(((fnv1a32(ocupante.serId) % 1000) / 1000) * Math.PI * 2);
  const adn = useMemo(() => adnEfectivo(ocupante.ser), [ocupante.ser]);

  useFrame((state, delta) => {
    const p = posicionActual.current;
    const objetivo = ocupante.objetivo;
    if (animar) {
      const factor = 1 - Math.exp(-delta * VELOCIDAD_TRASLADO_OCUPANTE);
      p.x += (objetivo.x - p.x) * factor;
      p.y += (objetivo.y - p.y) * factor;
      p.z += (objetivo.z - p.z) * factor;
    } else {
      p.x = objetivo.x;
      p.y = objetivo.y;
      p.z = objetivo.z;
    }
    grupoRef.current?.position.set(p.x, p.y, p.z);

    const capa = grupoActividadRef.current;
    if (!capa) return;
    if (!animar) {
      capa.position.y = 0;
      capa.rotation.z = 0;
      capa.rotation.y = 0;
      capa.scale.setScalar(1);
      return;
    }
    const { amplitudBob, frecuenciaBobHz, oscilacionLateral, velocidadGiroExtra, escalaExtra } = ocupante.animacion;
    const t = state.clock.elapsedTime;
    const fase = t * frecuenciaBobHz * Math.PI * 2 + faseRef.current;
    capa.position.y = Math.sin(fase) * amplitudBob;
    capa.rotation.z = Math.sin(fase * 0.5) * oscilacionLateral;
    if (velocidadGiroExtra) capa.rotation.y += delta * velocidadGiroExtra;
    capa.scale.setScalar(1 + Math.pow(Math.max(0, Math.sin(fase)), 4) * escalaExtra);
  });

  const nombre = ocupante.ser.nombre;

  return (
    <group
      ref={grupoRef}
      onClick={(e) => {
        e.stopPropagation();
        onSeleccionar(ocupante.serId);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setSobrevolado(true);
      }}
      onPointerOut={() => setSobrevolado(false)}
    >
      {/* Diana invisible, más generosa que el propio cuerpo — cómoda con el dedo. */}
      <mesh visible={false}>
        <sphereGeometry args={[RADIO_OCUPANTE * 1.7, 8, 8]} />
        <meshBasicMaterial />
      </mesh>

      <group ref={grupoActividadRef}>
        <AvatarSer adn={adn} detalle="bajo" animar={animar} radio={RADIO_OCUPANTE} />
      </group>

      {(seleccionado || sobrevolado) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[RADIO_OCUPANTE * 1.25, RADIO_OCUPANTE * 1.45, 28]} />
          <meshBasicMaterial
            color={seleccionado ? COLOR_SELECCION : "#ffffff"}
            transparent
            opacity={seleccionado ? 0.85 : 0.35}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {(seleccionado || sobrevolado) && (
        <Html center distanceFactor={9} position={[0, RADIO_OCUPANTE * 2.3, 0]} pointerEvents="none" occlude={false}>
          <div className="whitespace-nowrap rounded-md border border-white/15 bg-black/70 px-2 py-1 text-xs text-white shadow-lg backdrop-blur-sm">
            {describirOcupante(ocupante, nombre, Date.now())}
          </div>
        </Html>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────────────────── Oficina vacía

function OficinaVacia() {
  return (
    <Html center pointerEvents="none">
      <div className="whitespace-nowrap rounded-lg border border-white/10 bg-black/50 px-4 py-2 text-sm text-white/70">
        Aún no hay salas en esta oficina.
      </div>
    </Html>
  );
}

// ─────────────────────────────────────────────────────────── Escena raíz

export interface OficinaEscena3DProps {
  disposicion: DisposicionOficina;
  ocupantes: readonly OcupanteResuelto[];
  datosReales: boolean;
  animar: boolean;
  ocupanteSeleccionado: string | null;
  salaEnfocada: string | null;
  onSeleccionarOcupante: (id: string | null) => void;
  onEnfocarSala: (id: string | null) => void;
  onCiclarSala: (direccion: 1 | -1) => void;
  className?: string;
}

export function OficinaEscena3D({
  disposicion,
  ocupantes,
  datosReales,
  animar,
  ocupanteSeleccionado,
  salaEnfocada,
  onSeleccionarOcupante,
  onEnfocarSala,
  onCiclarSala,
  className,
}: OficinaEscena3DProps) {
  const apiCamaraRef = useRef<ApiCamara | null>(null);

  const objetivoCamara = useMemo((): PosicionOficina | null => {
    if (ocupanteSeleccionado) {
      const ocupante = ocupantes.find((o) => o.serId === ocupanteSeleccionado);
      if (ocupante) return ocupante.objetivo;
    }
    if (salaEnfocada) return disposicion.salas.get(salaEnfocada)?.centro ?? null;
    return null;
  }, [ocupanteSeleccionado, salaEnfocada, ocupantes, disposicion]);

  // Solo los ocupantes cuyo `ser` se pudo resolver contra la lista `seres`
  // llegan a montarse como `<OcupanteVisual>` — una referencia colgante
  // (serId sin ser correspondiente) no debe romper el render, simplemente no
  // dibuja un cuerpo. Filtrar AQUÍ (no dentro del componente) es lo que deja
  // a `OcupanteVisual` llamar sus hooks siempre en el mismo orden.
  const ocupantesRenderizables = useMemo(
    () => ocupantes.filter((o): o is OcupanteResuelto & { ser: NonNullable<OcupanteResuelto["ser"]> } => o.ser !== null),
    [ocupantes],
  );

  const alTeclado = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const api = apiCamaraRef.current;
    switch (e.key) {
      case "ArrowLeft":
        api?.orbitar(-PASO_ANGULO, 0);
        e.preventDefault();
        break;
      case "ArrowRight":
        api?.orbitar(PASO_ANGULO, 0);
        e.preventDefault();
        break;
      case "ArrowUp":
        api?.orbitar(0, -PASO_ANGULO);
        e.preventDefault();
        break;
      case "ArrowDown":
        api?.orbitar(0, PASO_ANGULO);
        e.preventDefault();
        break;
      case "+":
      case "=":
        api?.acercar(0.88);
        e.preventDefault();
        break;
      case "-":
      case "_":
        api?.acercar(1.14);
        e.preventDefault();
        break;
      case "Home":
        api?.reset();
        e.preventDefault();
        break;
      case "[":
        onCiclarSala(-1);
        e.preventDefault();
        break;
      case "]":
        onCiclarSala(1);
        e.preventDefault();
        break;
      case "Escape":
        onSeleccionarOcupante(null);
        onEnfocarSala(null);
        break;
      default:
        break;
    }
  };

  const vacia = disposicion.salas.size === 0 && ocupantes.length === 0;

  return (
    <div
      className={className}
      role="application"
      tabIndex={0}
      aria-label="Vista 3D de la oficina de seres. Flechas para orbitar la cámara, + y - para acercar o alejar, corchetes para saltar de sala en sala, Inicio para restablecer la vista, Escape para deseleccionar. Las listas de salas y seres, debajo, permiten navegar sin depender de esta vista."
      onKeyDown={alTeclado}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onSeleccionarOcupante(null);
          onEnfocarSala(null);
        }
      }}
    >
      <Canvas
        dpr={[1, 2]}
        shadows={false}
        camera={{ position: [0, 22, 26], fov: 50, near: 0.1, far: 400 }}
        gl={{ antialias: true, alpha: false }}
        onPointerMissed={() => {
          onSeleccionarOcupante(null);
          onEnfocarSala(null);
        }}
      >
        <color attach="background" args={[COLOR_FONDO_OFICINA]} />
        <fog attach="fog" args={[COLOR_FONDO_OFICINA, 40, 160]} />

        <ambientLight intensity={0.55} />
        <pointLight position={[18, 20, 14]} intensity={0.7} color={TEMA.secondary} />
        <pointLight position={[-18, -8, -14]} intensity={0.35} color={TEMA.primary} />

        <ControladorCamara apiRef={apiCamaraRef} objetivo={objetivoCamara} animar={animar} />

        {vacia ? (
          <OficinaVacia />
        ) : (
          <>
            {[...disposicion.salas.values()].map((sala) => (
              <SalaVisual key={sala.id} sala={sala} datosReales={datosReales} enfocada={salaEnfocada === sala.id} onEnfocar={onEnfocarSala} />
            ))}
            {ocupantesRenderizables.map((ocupante) => (
              <OcupanteVisual
                key={ocupante.serId}
                ocupante={ocupante}
                seleccionado={ocupanteSeleccionado === ocupante.serId}
                animar={animar}
                onSeleccionar={onSeleccionarOcupante}
              />
            ))}
          </>
        )}
      </Canvas>
    </div>
  );
}

export default OficinaEscena3D;
