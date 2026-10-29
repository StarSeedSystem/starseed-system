'use client';

import { useEffect, useState } from "react";
import type { ObjetoMundo } from "@/lib/xr/mundo-tipos";
import type { NivelCalidad } from "@/lib/xr/tipos";
import { puedeUsarSplat, cargarSplat } from "./cargar-splat";

export interface SplatObjetoProps {
  objeto: ObjetoMundo;
  nivel: NivelCalidad;
}

export function SplatObjeto({ objeto, nivel }: SplatObjetoProps) {
  const [mesh, setMesh] = useState<unknown | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      if (!puedeUsarSplat(nivel)) {
        setMotivo("Este objeto necesita un aparato más potente.");
        setMesh(null);
        return;
      }
      // Extraer URL de la fuente del objeto (biblioteca con formato splat).
      let url = "";
      if (objeto.fuente.tipo === "biblioteca" && objeto.fuente.formato === "splat") {
        url = `https://starseed-os.vercel.app/biblioteca/${objeto.fuente.id}.splat`;
      }
      if (!url) {
        setMotivo("Objeto sin fuente de splat válida.");
        setMesh(null);
        return;
      }
      const res = await cargarSplat(url);
      if (cancelado) return;
      if (!res.ok) {
        setMotivo(res.motivo || "Error al cargar el splat.");
        setMesh(null);
      } else {
        setMesh(res.mesh);
        setMotivo(null);
      }
    }
    cargar();
    return () => { cancelado = true; };
  }, [objeto.id, nivel]);

  if (motivo) {
    return (
      <group position={objeto.pos} rotation={objeto.rot} scale={objeto.esc}>
        <mesh>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshStandardMaterial color="#dc143c" />
        </mesh>
      </group>
    );
  }

  if (mesh && mesh instanceof Object) {
    // Usar primitive para renderizar el SplatMesh de Spark.
    return <primitive object={mesh} position={objeto.pos} rotation={objeto.rot} scale={objeto.esc} />;
  }

  // Mientras carga, un marcador mínimo.
  return (
    <group position={objeto.pos} rotation={objeto.rot} scale={objeto.esc}>
      <mesh>
        <boxGeometry args={[0.2, 0.2, 0.2]} />
        <meshStandardMaterial color="#ffbf00" />
      </mesh>
    </group>
  );
}
