"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  filaNodo, resumen, type FilaNodo, type MeshNodoInput, type EstadoBitnetInput,
} from "@/lib/mando/nodos-bitnet";
import { nodoParaBitnet } from "@/lib/astraura/astraura-158-client";

export function PanelNodosBitnet() {
  const [filas, setFilas] = useState<FilaNodo[]>([]);
  const [nodoEnUsoId, setNodoEnUsoId] = useState<string | null>(null);
  const [cargando, setCargando] = useState<boolean>(false);
  const [meshError, setMeshError] = useState<boolean>(false);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setMeshError(false);
    try {
      const candidato = await nodoParaBitnet("local").catch(() => null);
      if (candidato?.id) setNodoEnUsoId(candidato.id);

      const resMesh = await fetch("/api/ai/astraura-158/api/mesh/nodes", { signal: AbortSignal.timeout(3000) }).catch(() => null);
      if (!resMesh || !resMesh.ok) setMeshError(true);

      const dataMesh: unknown = resMesh && resMesh.ok ? await resMesh.json().catch(() => null) : null;
      let lista: MeshNodoInput[] = [];
      if (Array.isArray(dataMesh)) {
        lista = dataMesh as MeshNodoInput[];
      } else if (dataMesh && typeof dataMesh === "object" && "nodes" in dataMesh && Array.isArray((dataMesh as { nodes: unknown }).nodes)) {
        lista = (dataMesh as { nodes: MeshNodoInput[] }).nodes;
      }

      if (lista.length === 0) {
        lista = [{ id: "local", nombre: "Mac (Local)", hostname: "mac", medio: "mac", os: "darwin", arq: "arm64", ram_gb: 8, cpu_cores: 8 }];
      }

      const construidas = await Promise.all(
        lista.map(async (n) => {
          const resEst = await fetch("/api/ai/astraura-158/api/bitnet/estado", { signal: AbortSignal.timeout(2000) }).catch(() => null);
          const dataEst = (resEst && resEst.ok ? await resEst.json().catch(() => null) : null) as EstadoBitnetInput | null;
          return filaNodo(n, dataEst, null);
        })
      );
      setFilas(construidas);
    } catch {
      setMeshError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  const res = resumen(filas);
  const tonoColor: Record<string, string> = { verde: "bg-emerald-500", ambar: "bg-amber-500", rojo: "bg-rose-500", gris: "bg-neutral-500" };

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4 text-sm text-neutral-200">
      <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
        <div>
          <h3 className="font-semibold text-neutral-100">Nodos BitNet de la mesh</h3>
          <p className="text-xs text-neutral-400 mt-0.5">{res.frase}</p>
        </div>
        <button onClick={() => void cargarDatos()} disabled={cargando} className="cursor-pointer rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-50">
          {cargando ? "Cargando..." : "Refrescar"}
        </button>
      </div>

      {meshError && <div className="mt-3 rounded-md bg-rose-950/40 border border-rose-800/40 p-2 text-xs text-rose-300">Astraura no responde</div>}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs font-mono text-neutral-300">
          <thead>
            <tr className="border-b border-neutral-800 text-neutral-400">
              <th className="pb-2">Medio</th>
              <th className="pb-2">Arq</th>
              <th className="pb-2">RAM</th>
              <th className="pb-2">Hilos</th>
              <th className="pb-2">tok/s</th>
              <th className="pb-2">Agentes</th>
              <th className="pb-2">Permanente</th>
              <th className="pb-2 text-right">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const esEnUso = f.id === nodoEnUsoId || (nodoEnUsoId === "local" && f.medio === "mac");
              return (
                <tr key={f.id} className="border-b border-neutral-800/50 hover:bg-neutral-800/30">
                  <td className="py-2 capitalize font-medium text-neutral-200">{f.medio}</td>
                  <td className="py-2">{f.arq}</td>
                  <td className="py-2">{f.ramGb} GB</td>
                  <td className="py-2">{f.nucleos}</td>
                  <td className="py-2">{f.tokS}</td>
                  <td className="py-2">{f.agentesAhora}/{f.agentesMax}</td>
                  <td className="py-2">{f.permanente ? "Sí" : "Efímero"}</td>
                  <td className="py-2 text-right flex items-center justify-end gap-1.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${tonoColor[f.tono] || "bg-neutral-500"}`} />
                    {esEnUso ? <span className="font-semibold text-emerald-400">← en uso</span> : <span>{f.vivo ? "Vivo" : "Inactivo"}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {res.agentesMaxTotal <= 3 && (
        <div className="mt-3 rounded-lg border border-amber-800/40 bg-amber-950/30 p-2.5 text-xs text-amber-300">
          Para más agentes a la vez añade un medio: Oracle Free Tier ARM (4 OCPU/24 GB, gratis) → 3 agentes permanentes; receta en memory/orquestacion-economica.md §10
        </div>
      )}
    </div>
  );
}
