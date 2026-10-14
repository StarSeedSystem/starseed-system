"use client";

import { useRouter } from "next/navigation";
import { guardarMolecula } from "@/lib/protomolecula/almacen-moleculas";
import { formatearValor } from "@/lib/protomolecula/parametros";
import { leerBloque } from "@/lib/protomolecula/bloque-protomolecula";
import type { Molecula, Ambito } from "@/lib/protomolecula/tipos";
import { obtenerAtomo } from "@/lib/protomolecula/registro-atomos";

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

  const molecula = resultado.molecula;

  // Function to format a parameter value
  const getFormattedValue = (atomoId: string, parametroId: string): string => {
    const clave = `${atomoId}::${parametroId}`;
    const valor = molecula.valores[clave];
    if (valor === undefined) return "—";

    const def = obtenerAtomo(
      molecula.atomos.find((a) => a.id === atomoId)?.herramientaId ?? ""
    );
    if (!def) return String(valor);

    const parametro = def.parametros.find((p) => p.id === parametroId);
    if (!parametro) return String(valor);

    return formatearValor(parametro, valor as ValorParametro);
  };

  return (
    <div className="border rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-indigo-400">🧪</span>
        <h3 className="text-lg font-semibold">{molecula.titulo}</h3>
        <span
           className={`px-2 py-0.5 rounded text-xs font-medium ${
             molecula.ambito === "personal"
               ? "bg-blue-500/20 text-blue-400"
               : molecula.ambito === "perfil"
               ? "bg-purple-500/20 text-purple-400"
               : molecula.ambito === "grupo"
               ? "bg-green-500/20 text-green-400"
               : "bg-gray-500/20 text-gray-400"
           }`}
        >
          {molecula.ambito}
        </span>
      </div>

      <div className="mb-4">
        <h4 className="text-sm font-medium mb-1">Capas:</h4>
        <ul className="list-disc list-inside space-y-1 text-sm">
          {molecula.capas.map((capa) => (
            <li key={capa.id}>
              {capa.nombre} ({capa.tipo})
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-4">
        <h4 className="text-sm font-medium mb-1">Herramientas y valores:</h4>
        <div className="space-y-2">
          {molecula.atomos.map((atomo) => {
            const def = obtenerAtomo(atomo.herramientaId);
            if (!def) return null;

            return (
              <div key={atomo.id} className="border p-3 rounded">
                <h5 className="font-medium mb-2">{def.nombre}</h5>
                <div className="space-y-1 text-sm">
                  {def.parametros.map((parametro) => {
                    const valor = getFormattedValue(atomo.id, parametro.id);
                    return (
                      <div key={parametro.id} className="flex justify-between">
                        <span>{parametro.nombre}:</span>
                        <span className="font-mono">{valor}</span>
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
          const indice = Date.now();
          const idNuevo = `${molecula.id}-copia-${indice}`;
          const moleculaCopia = {
            ...molecula,
            id: idNuevo,
            titulo: `${molecula.titulo} (copia)`,
            creadaEn: Date.now(),
            actualizadaEn: Date.now(),
          };
          const almacen = guardarMolecula(typeof window !== "undefined" ? window.localStorage : null, moleculaCopia);
          if (almacen) {
            router.push(`/protomolecula?molecula=${idNuevo}`);
          } else {
            alert("No se pudo guardar la copia");
          }
        }}
        className="w-full items-center justify-center gap-2 px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded transition-colors"
      >
        Abrir copia propia
      </button>
    </div>
  );
}