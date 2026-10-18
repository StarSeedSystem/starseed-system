"use client";

import { type AdnAvatar } from "@/lib/avatares/adn/adn";
import { proponerCambioAvatar } from "@/lib/avatares/adaptadores/propuesta-avatar";
import { type Ambito } from "@/lib/genesis/operaciones";

/**
 * Componente para proponer un cambio de avatar.
 * Muestra el avatar actual y un formulario para proponer cambios.
 * En una implementación real, se integraría con el editor de avatares y el
 * mecanismo de votación de PoliGenesis.
 */
export default function PropuestaAvatar({
  actual,
  propuesto,
  ambito,
}: {
  actual: AdnAvatar;
  propuesto: AdnAvatar;
  ambito: Ambito;
}) {
  const handleProponer = () => {
    const resultado = proponerCambioAvatar(
      actual.id,
      actual,
      propuesto,
      "Cambio de avatar propuesto desde la UI",
      ambito
    );
    if (resultado.ok) {
      // En una app real, se enviaría la operación al orquestador
      console.log("Operación válida:", resultado.op);
    } else {
      console.error("Operación inválida:", resultado.problemas);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 border rounded-lg">
      <h2 className="text-lg font-bold">Proponer cambio de avatar</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="font-medium">Actual</h3>
          {/* Aquí se renderizaría el avatar actual */}
          <div className="h-24 w-24 bg-gray-200 rounded flex items-center justify-center">
            ID: {actual.id}
          </div>
        </div>
        <div>
          <h3 className="font-medium">Propuesto</h3>
          {/* Aquí se renderizaría el avatar propuesto */}
          <div className="h-24 w-24 bg-blue-200 rounded flex items-center justify-center">
            ID: {propuesto.id}
          </div>
        </div>
      </div>
      <button
        onClick={handleProponer}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        Proponer cambio
      </button>
    </div>
  );
}