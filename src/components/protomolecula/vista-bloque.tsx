"use client";
import { useRouter } from "next/navigation";
import { guardarMolecula, almacenNavegador } from "@/lib/protomolecula/almacen-moleculas";
import { leerBloque } from "@/lib/protomolecula/bloque-protomolecula";
import { formatearValor } from "@/lib/protomolecula/parametros";
import type { ValorParametro } from "@/lib/protomolecula/tipos";
import type { Parametro } from "@/lib/protomolecula/tipos";
import type { Molecula } from "@/lib/protomolecula/tipos";

export function VistaBloqueProtomolecula({ texto }: { texto: string }) {
  const router = useRouter();
  const resultado = leerBloque(texto);

  if (!resultado.ok) {
    return (
      <div className="p-4 text-sm text-destructive">
        Esta molécula no se puede mostrar: {resultado.motivo}
      </div>
    );
  }

  const m = resultado.valor;

  return (
    <div className="border rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-indigo-400">🧪</span>
        <h3 className="text-lg font-semibold">{m.titulo}</h3>
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${
            m.ambito === "personal"
              ? "bg-blue-500/20 text-blue-400"
              : m.ambito === "perfil"
              ? "bg-purple-500/20 text-purple-400"
              : m.ambito === "grupo"
              ? "bg-green-500/20 text-green-400"
              : "bg-gray-500/20 text-gray-400"
          }`}
        >
          {m.ambito}
        </span>
      </div>

      <div className="mb-4">
        <h4 className="text-sm font-medium mb-1">Capas:</h4>
        <ul className="list-disc list-inside space-y-1 text-sm">
          {m.capas.map((c) => (
            <li key={c.id}>
              {(c as any).titulo || c.id} ({c.tipo})
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-4">
        <h4 className="text-sm font-medium mb-1">Herramientas y valores:</h4>
        <div className="space-y-2">
          {m.atomos.map((atomo) => {
            const claves = Object.keys(m.valores).filter((k) => k.startsWith(`${atomo.id}::`));
            return (
              <div key={atomo.id} className="border p-3 rounded">
                <h5 className="font-medium mb-2">{(atomo as any).titulo || atomo.id}</h5>
                <div className="space-y-1 text-sm">
                  {claves.map((k) => {
                    const paramId = k.slice(`${atomo.id}::`.length);
                    const valor = m.valores[k];
                    const param: Parametro = {
                      id: paramId,
                      nombre: paramId,
                      tipo: "numero",
                      unidad: "",
                    };
                    return (
                      <div key={k} className="flex justify-between">
                        <span>{paramId}:</span>
                        <span className="font-mono">{formatearValor(param, valor as ValorParametro)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => {
          const idNuevo = `copia-${m.id}-${Date.now()}`;
          const ambitoCopia = m.ambito === "grupo" ? "grupo" : m.ambito === "perfil" ? "privado" : m.ambito === "publica" ? "publico" : "personal";
          const copia: any = {
            id: idNuevo,
            titulo: `${m.titulo} (copia)`,
            ambito: ambitoCopia,
            capas: m.capas.map((c) => ({
              id: c.id,
              nombre: (c as any).titulo || c.id,
              tipo: c.tipo,
            })),
            atomos: m.atomos.map((a) => ({
              id: a.id,
              capaId: a.capaId,
              tipo: a.herramientaId,
            })),
            valores: { ...m.valores },
            version: 1,
            creadaEn: Date.now(),
            actualizadaEn: Date.now(),
          };
          const almacen = almacenNavegador();
          if (almacen && guardarMolecula(almacen, copia)) {
            router.push(`/protomolecula?molecula=${idNuevo}`);
          } else {
            alert("No se pudo guardar la copia");
          }
        }}
        className="cursor-pointer w-full items-center justify-center gap-2 px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded transition-colors"
      >
        Abrir copia propia
      </button>
    </div>
  );
}
