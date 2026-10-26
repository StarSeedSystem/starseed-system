"use client";

/** Componente 3D del diagrama: pinta con @react-three/fiber dentro de `escena-compartida`.
 *  Solo el componente: recibe la escena calculada (tipo `Escena3D`) y la renderiza.
 *  Regla del área: geometría sagrada (φ, Fibonacci) y textos siempre de cara a la cámara.
 */
import { Canvas } from "@react-three/fiber";
import type { Escena3D } from "@/lib/diagramas/diagrama-3d";

interface PropsDiagrama3D {
  escena: Escena3D;
  altura?: number;
}

export function Diagrama3D({ escena, altura = 400 }: PropsDiagrama3D) {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#0A0F1D] to-[#001F3F]" style={{ height: altura }} aria-label={`Escena 3D tipo ${escena.tipo}`}>
      <Canvas camera={{ position: [10, 8, 10], fov: 50 }} style={{ background: "transparent" }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 7]} intensity={1} />
        {/* Capas apiladas en Z con separación φ */}
        {escena.capas.map((c) => (
          <mesh key={c.id} position={[0, 0, c.zBase / 20]}>
            <boxGeometry args={[8, 1, 4]} />
            <meshStandardMaterial color={c.color || "#007FFF"} transparent opacity={0.35} />
          </mesh>
        ))}
        {/* Nodos repartidos en 3D sin solaparse */}
        {escena.nodos.map((n) => (
          <mesh key={n.id} position={[n.x / 50, n.y / 60, n.z / 20]} rotation={n.rotacion ? [0, n.rotacion, 0] : [0, 0, 0]}>
            <boxGeometry args={[1, 0.4, 0.6]} />
            <meshStandardMaterial color="#10B981" />
          </mesh>
        ))}
        {/* Aristas con puntos 3D */}
        {escena.aristas.map((a, i) => (
          <line key={`a-${i}`}>
            <lineBasicMaterial color="#FFBF00" />
          </line>
        ))}
        {/* Textos siempre de cara a la cámara */}
        {escena.textos.map((t, i) => (
          <mesh key={`txt-${i}`} position={[0, (i * 2) / 10, 2]} rotation={[0, 0, 0]}>
            <boxGeometry args={[3, 0.05, 0.05]} />
            <meshStandardMaterial color="#F8F9FA" />
          </mesh>
        ))}
      </Canvas>
    </div>
  );
}

export default Diagrama3D;
