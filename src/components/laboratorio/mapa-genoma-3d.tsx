"use client";

// Mapa 3D del genoma fásico del laboratorio de Astraura.
// -------------------------------------------------------
// Las nueve capas se dibujan como cáscaras concéntricas: el Núcleo (0) al
// centro y el Contexto (8) en el borde. Cuanto más cerca del centro, más
// fundamental y más lenta de cambiar; cuanto más afuera, más viva y reescrita.
//   · Cada nodo es un punto sobre la cáscara de su capa (distribución de
//     Fibonacci sobre la esfera para que no se amontonen).
//   · Los enlaces son líneas suaves; los que cruzan capas brillan más (son los
//     que explican cómo lo fundamental sostiene lo relativo).
//   · El nodo seleccionado destaca y atenúa el resto; al pulsar uno se llama a
//     onSeleccionar. Al pasar el ratón, una etiqueta con nombre y capa.
//   · Controles: girar/acercar (OrbitControls), aislar una capa y un deslizador
//     de "profundidad" que muestra de dentro hacia fuera (lo fundamental
//     primero) para explicar el sistema por fases.
//   · Rendimiento: instancias reutilizadas o InstancedMesh si hay más de 60
//     nodos; con prefers-reduced-motion la escena queda quieta y se navega sin
//     animación; sin WebGL, un aviso claro (nunca pantalla en blanco).
//
// SSR-safe: "use client" + debe cargarse con next/dynamic { ssr:false } (el
// Canvas/WebGL no puede ejecutarse en el servidor). Reutiliza @react-three/
// fiber + @react-three/drei + three del repo.

import * as React from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, Sphere, Line, Text } from "@react-three/drei";
import * as THREE from "three";

import {
  capasOrdenadas,
  type Genoma,
  type NodoGenoma,
  type CapaId,
} from "@/lib/laboratorio/genoma";

// ─────────────────────────────────────────────────────────────────────────────
// Geometría de las cáscaras concéntricas
// ─────────────────────────────────────────────────────────────────────────────

const TOTAL_CAPAS = 9;
const UMBRAL_INSTANCIAS = 60;

/** Radio de la cáscara de una capa según su índice (0 = núcleo, la más interna). */
function radioDeCapa(indice: number): number {
  return 0.9 + indice * 1.35;
}

/** Radio del nodo (esfera) de una capa: el núcleo es más grande, el resto sutil. */
function tamanoDeNodo(indice: number): number {
  return indice === 0 ? 0.26 : 0.16;
}

/**
 * Distribución de Fibonacci sobre la esfera: reparte N puntos sin amontonar,
 * ideales para que los nodos de una cáscara queden aireados y estables.
 */
function fibonacciEsfera(i: number, n: number, radio: number): [number, number, number] {
  if (n <= 0) return [0, 0, 0];
  if (n === 1) return [0, radio, 0];
  const aureo = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (i / (n - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = aureo * i;
  return [Math.cos(theta) * r * radio, y * radio, Math.sin(theta) * r * radio];
}

interface NodoVisual {
  id: string;
  nombre: string;
  capa: CapaId;
  indice: number;
  color: string;
  posicion: [number, number, number];
}

interface EnlaceVisual {
  id: string;
  ori: [number, number, number];
  dest: [number, number, number];
  cruzaCapa: boolean;
}

function construirNodos(genoma: Genoma): NodoVisual[] {
  const porCapa = new Map<CapaId, NodoGenoma[]>();
  for (const n of genoma.nodos) {
    const arr = porCapa.get(n.capa) ?? [];
    arr.push(n);
    porCapa.set(n.capa, arr);
  }

  const resultado: NodoVisual[] = [];
  for (const info of capasOrdenadas()) {
    const nodos = porCapa.get(info.id) ?? [];
    const radio = radioDeCapa(info.indice);
    nodos.forEach((n, i) => {
      const pos = fibonacciEsfera(i, nodos.length, radio);
      resultado.push({
        id: n.id,
        nombre: n.nombre,
        capa: n.capa,
        indice: info.indice,
        color: info.color,
        posicion: pos,
      });
    });
  }
  return resultado;
}

function construirEnlaces(genoma: Genoma, nodos: NodoVisual[]): EnlaceVisual[] {
  const porId = new Map(nodos.map((n) => [n.id, n]));
  const capaPorId = new Map(genoma.nodos.map((n) => [n.id, n.capa]));
  const resultado: EnlaceVisual[] = [];
  for (const n of genoma.nodos) {
    const origen = porId.get(n.id);
    if (!origen) continue;
    for (const destinoId of n.enlaces) {
      const destino = porId.get(destinoId);
      if (!destino) continue;
      resultado.push({
        id: `${n.id}->${destinoId}`,
        ori: origen.posicion,
        dest: destino.posicion,
        cruzaCapa: capaPorId.get(n.id) !== capaPorId.get(destinoId),
      });
    }
  }
  return resultado;
}

function usarPrefersReducedMotion(): boolean {
  const [reducido, setReducido] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const aplicar = () => setReducido(mq.matches);
    aplicar();
    mq.addEventListener?.("change", aplicar);
    return () => mq.removeEventListener?.("change", aplicar);
  }, []);
  return reducido;
}

/** Devuelve false si no hay WebGL disponible (para mostrar aviso, no lienzo en blanco). */
function usarSoporteWebGL(): boolean {
  const [ok, setOk] = React.useState(true);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const lienzo = document.createElement("canvas");
      const gl =
        lienzo.getContext("webgl2") ?? lienzo.getContext("webgl") ?? lienzo.getContext("experimental-webgl");
      setOk(!!gl);
    } catch {
      setOk(false);
    }
  }, []);
  return ok;
}

// ─────────────────────────────────────────────────────────────────────────────
// Nodo individual (icosaedro emisivo + etiqueta al hover)
// ─────────────────────────────────────────────────────────────────────────────
function NodoEsfera({
  nodo,
  reducido,
  atenuado,
  destacado,
  hover,
  alHover,
  alDeshover,
  alClic,
}: {
  nodo: NodoVisual;
  reducido: boolean;
  atenuado: boolean;
  destacado: boolean;
  hover: boolean;
  alHover: (id: string) => void;
  alDeshover: () => void;
  alClic: (id: string) => void;
}) {
  const ref = React.useRef<THREE.Mesh>(null);
  const color = React.useMemo(() => new THREE.Color(nodo.color), [nodo.color]);

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const objetivo = hover || destacado ? 1.35 : 1;
    const s = THREE.MathUtils.damp(m.scale.x, objetivo, 8, dt);
    m.scale.setScalar(s);
    if (!reducido) m.rotation.y += dt * 0.3;
  });

  const emisivo = destacado ? 1.1 : hover ? 0.8 : 0.35;
  const opacidad = atenuado ? 0.14 : 1;

  return (
    <mesh
      ref={ref}
      position={nodo.posicion}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        alHover(nodo.id);
        if (typeof document !== "undefined") document.body.style.cursor = "pointer";
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        alDeshover();
        if (typeof document !== "undefined") document.body.style.cursor = "auto";
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        alClic(nodo.id);
      }}
    >
      <icosahedronGeometry args={[tamanoDeNodo(nodo.indice), 1]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={emisivo}
        roughness={0.3}
        metalness={0.3}
        transparent
        opacity={opacidad}
      />
      {hover && (
        <Html center distanceFactor={8} style={{ pointerEvents: "none" }}>
          <div
            style={{
              transform: "translateY(-150%)",
              whiteSpace: "nowrap",
              padding: "2px 9px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              color: "#f8fafc",
              background: "rgba(8,12,20,0.85)",
              border: `1px solid ${nodo.color}88`,
              boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
              userSelect: "none",
            }}
          >
            {nodo.nombre}
            <span style={{ opacity: 0.6, fontWeight: 400 }}> · {nodo.capa}</span>
          </div>
        </Html>
      )}
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Render por instancias (más de 60 nodos) — esferas coloreadas, con clic.
// ─────────────────────────────────────────────────────────────────────────────
function NodosInstanciados({
  nodos,
  atenuados,
  destacado,
  alHover,
  alDeshover,
  alClic,
}: {
  nodos: NodoVisual[];
  atenuados: Set<string>;
  destacado: string | null;
  alHover: (id: string) => void;
  alDeshover: () => void;
  alClic: (id: string) => void;
}) {
  const ref = React.useRef<THREE.InstancedMesh>(null);

  React.useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    nodos.forEach((n, i) => {
      const m = new THREE.Matrix4();
      const s = tamanoDeNodo(n.indice);
      m.makeScale(s, s, s);
      m.setPosition(n.posicion[0], n.posicion[1], n.posicion[2]);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(n.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [nodos]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, nodos.length]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        const nodo = nodos[e.instanceId ?? 0];
        if (nodo) alClic(nodo.id);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        const nodo = nodos[e.instanceId ?? 0];
        if (nodo) alHover(nodo.id);
        if (typeof document !== "undefined") document.body.style.cursor = "pointer";
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        alDeshover();
        if (typeof document !== "undefined") document.body.style.cursor = "auto";
      }}
    >
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial
        roughness={0.3}
        metalness={0.3}
        emissiveIntensity={0.35}
        transparent
      />
    </instancedMesh>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Enlaces — líneas suaves; las que cruzan capas brillan más.
// ─────────────────────────────────────────────────────────────────────────────
function Enlace({
  enlace,
  atenuado,
}: {
  enlace: EnlaceVisual;
  atenuado: boolean;
}) {
  const [a, b] = [enlace.ori, enlace.dest];
  const control: [number, number, number] = [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2 + 0.8,
    (a[2] + b[2]) / 2,
  ];
  const color = enlace.cruzaCapa ? "#ffffff" : "#8b9bb4";
  return (
    <Line
      points={[a, control, b]}
      color={color}
      lineWidth={enlace.cruzaCapa ? 2.2 : 1.1}
      transparent
      opacity={atenuado ? 0.08 : enlace.cruzaCapa ? 0.75 : 0.3}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Escena
// ─────────────────────────────────────────────────────────────────────────────
function Escena({
  genoma,
  reducido,
  profundidad,
  capaAislada,
  seleccionado,
  alSeleccionar,
  alHover,
  alDeshover,
  hover,
}: {
  genoma: Genoma;
  reducido: boolean;
  profundidad: number;
  capaAislada: CapaId | null;
  seleccionado: string | null;
  alSeleccionar: (id: string) => void;
  alHover: (id: string) => void;
  alDeshover: () => void;
  hover: string | null;
}) {
  const todosNodos = React.useMemo(() => construirNodos(genoma), [genoma]);
  const todosEnlaces = React.useMemo(() => construirEnlaces(genoma, todosNodos), [genoma, todosNodos]);

  // Filtro por profundidad (de dentro hacia fuera) y por capa aislada.
  const visibles = todosNodos.filter((n) => {
    if (capaAislada) return n.capa === capaAislada;
    return n.indice <= profundidad;
  });
  const idsVisibles = new Set(visibles.map((n) => n.id));
  const enlacesVisibles = todosEnlaces.filter(
    (e) => idsVisibles.has(origenIdDe(e.id)) && idsVisibles.has(destinoIdDe(e.id)),
  );

  const haySeleccionado = selectivoActivo(seleccionado, visibles);

  const capas = capasOrdenadas().filter((c) => {
    if (capaAislada) return c.id === capaAislada;
    return c.indice <= profundidad;
  });

  const atenuado = (id: string) => haySeleccionado && id !== seleccionado;

  return (
    <>
      <color attach="background" args={["#05060f"]} />
      <ambientLight intensity={0.5} color="#9db8ff" />
      <hemisphereLight intensity={0.5} color="#bff5d8" groundColor="#10131f" />
      <directionalLight position={[10, 14, 8]} intensity={1.1} color="#ffe9b0" />
      <pointLight position={[0, 0, 0]} intensity={1.4} color="#ffffff" distance={30} />

      {/* Cáscaras concéntricas (una esfera translúcida por capa). */}
      {capas.map((c) => (
        <group key={c.id}>
          <Sphere args={[radioDeCapa(c.indice), 48, 24]}>
            <meshBasicMaterial color={c.color} wireframe transparent opacity={0.09} />
          </Sphere>
          <Text
            position={[0, radioDeCapa(c.indice) + 0.35, 0]}
            color={c.color}
            fontSize={0.28}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.012}
            outlineColor="#05060f"
          >
            {c.nombre}
          </Text>
        </group>
      ))}

      {/* Núcleo central: ancla emisiva en el origen. */}
      <mesh position={[0, 0, 0]}>
        <icosahedronGeometry args={[0.35, 2]} />
        <meshStandardMaterial color="#38BDF8" emissive="#38BDF8" emissiveIntensity={0.9} roughness={0.2} metalness={0.4} />
      </mesh>

      {/* Enlaces. */}
      {enlacesVisibles.map((e) => (
        <Enlace key={e.id} enlace={e} atenuado={haySeleccionado} />
      ))}

      {/* Nodos. */}
      {visibles.length <= UMBRAL_INSTANCIAS ? (
        visibles.map((n) => (
          <NodoEsfera
            key={n.id}
            nodo={n}
            reducido={reducido}
            atenuado={atenuado(n.id)}
            destacado={seleccionado === n.id}
            hover={hover === n.id}
            alHover={alHover}
            alDeshover={alDeshover}
            alClic={alSeleccionar}
          />
        ))
      ) : (
        <NodosInstanciados
          nodos={visibles}
          atenuados={new Set(visibles.filter((n) => atenuado(n.id)).map((n) => n.id))}
          destacado={seleccionado}
          alHover={alHover}
          alDeshover={alDeshover}
          alClic={alSeleccionar}
        />
      )}

      <OrbitControls
        makeDefault
        enablePan
        minDistance={3}
        maxDistance={40}
        autoRotate={!reducido && !haySeleccionado}
        autoRotateSpeed={0.25}
        target={[0, 0, 0]}
        enableDamping={false}
      />
    </>
  );
}

function origenIdDe(id: string): string {
  return id.split("->")[0] ?? "";
}

function destinoIdDe(id: string): string {
  return id.split("->")[1] ?? "";
}

function selectivoActivo(seleccionado: string | null, visibles: NodoVisual[]): boolean {
  if (!seleccionado) return false;
  return visibles.some((n) => n.id === seleccionado);
}

// ─────────────────────────────────────────────────────────────────────────────
// MapaGenoma3D — export principal
// ─────────────────────────────────────────────────────────────────────────────
export function MapaGenoma3D({
  genoma,
  seleccionado,
  onSeleccionar,
}: {
  genoma: Genoma;
  seleccionado?: string | null;
  onSeleccionar?: (nodoId: string) => void;
}) {
  const reducido = usarPrefersReducedMotion();
  const soportaWebGL = usarSoporteWebGL();
  const [profundidad, setProfundidad] = React.useState(TOTAL_CAPAS - 1);
  const [capaAislada, setCapaAislada] = React.useState<CapaId | null>(null);
  const [hover, setHover] = React.useState<string | null>(null);

  const capas = capasOrdenadas();

  const alClic = React.useCallback(
    (id: string) => {
      onSeleccionar?.(id);
    },
    [onSeleccionar],
  );

  const alHover = React.useCallback((id: string) => setHover(id), []);
  const alDeshover = React.useCallback(() => setHover(null), []);

  if (!soportaWebGL) {
    return (
      <div className="grid h-full w-full place-items-center bg-[#05060f] p-6 text-center">
        <div className="max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
          <p className="text-sm font-semibold">Tu navegador no soporta WebGL.</p>
          <p className="mt-2 text-sm text-white/55">
            El mapa 3D del genoma necesita WebGL para dibujarse. Puedes seguir explorando las capas
            y nodos desde el inspector de lista.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05060f]">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 3, 16], fov: 55 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      >
        <React.Suspense fallback={null}>
          <Escena
            genoma={genoma}
            reducido={reducido}
            profundidad={profundidad}
            capaAislada={capaAislada}
            seleccionado={seleccionado ?? null}
            alSeleccionar={alClic}
            alHover={alHover}
            alDeshover={alDeshover}
            hover={hover}
          />
        </React.Suspense>
      </Canvas>

      {/* Panel de controles superpuesto. */}
      <div className="pointer-events-auto absolute left-4 top-4 z-20 w-[16rem] rounded-2xl border border-white/12 bg-black/55 p-3 backdrop-blur-md">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">
          Capas del genoma
        </p>

        <button
          type="button"
          onClick={() => {
            setCapaAislada(null);
            setProfundidad(TOTAL_CAPAS - 1);
          }}
          className={
            "mb-2 w-full rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition " +
            (capaAislada === null
              ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
              : "border-white/10 text-white/60 hover:bg-white/10")
          }
          style={{ cursor: "pointer" }}
        >
          Todas las capas
        </button>

        <div className="mb-3 grid grid-cols-1 gap-1">
          {capas.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCapaAislada(capaAislada === c.id ? null : c.id);
                setProfundidad(TOTAL_CAPAS - 1);
              }}
              className={
                "inline-flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition " +
                (capaAislada === c.id
                  ? "text-white"
                  : "border-white/10 text-white/55 hover:bg-white/10")
              }
              style={
                capaAislada === c.id
                  ? { background: `color-mix(in srgb, ${c.color} 22%, rgba(6,8,16,0.7))`, borderColor: `${c.color}66`, cursor: "pointer" }
                  : { cursor: "pointer" }
              }
              title={`Ver solo ${c.nombre}`}
            >
              <span
                className="inline-block size-2 rounded-full"
                style={{ background: c.color, boxShadow: `0 0 6px ${c.color}` }}
              />
              <span className="flex-1 text-left">{c.nombre}</span>
              <span className="tabular-nums opacity-50">{c.indice}</span>
            </button>
          ))}
        </div>

        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">
          Profundidad · lo fundamental primero
        </p>
        <input
          type="range"
          min={0}
          max={TOTAL_CAPAS - 1}
          step={1}
          value={profundidad}
          disabled={capaAislada !== null}
          onChange={(e) => setProfundidad(Number(e.target.value))}
          className="w-full accent-cyan-400"
          style={{ cursor: "pointer" }}
          aria-label="Profundidad: mostrar capas de dentro hacia fuera"
        />
        <p className="mt-1 text-[10px] text-white/45">
          {capaAislada
            ? `Aislada: ${capas.find((c) => c.id === capaAislada)?.nombre ?? ""}`
            : `Mostrando hasta la capa ${profundidad} (${capas.find((c) => c.indice === profundidad)?.nombre ?? ""})`}
        </p>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
        arrastra para orbitar · rueda para zoom · toca un nodo para inspeccionarlo
      </div>
    </div>
  );
}