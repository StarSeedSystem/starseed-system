import { useState } from "react";
import { useGenerar3D } from "@/lib/avatares/adaptadores/use-generar-3d";
import type { Destino3D } from "@/lib/avatares/adn/optimizacion";

interface Generar3DProps {
  destino: Destino3D;
  onClose?: () => void;
}

export function Generar3D({ destino, onClose }: Generar3DProps) {
  const [abierto, setAbierto] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const {
    imagen,
    setImagen,
    plan,
    pasos,
    progreso,
    estado,
    generar,
  } = useGenerar3D(destino, {
    onSuccess: (glb, lods, atribuciones) => {
      // Handle success: save to Library, etc.
      console.log("Éxito:", { glb, lods, atribuciones });
      setAbierto(false);
      onClose?.();
    },
    onError: (error) => {
      console.error("Error:", error);
      // Show error to user
    },
  });

  const handleImagenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImagen(e.target.files[0]);
    }
  };

  return (
    <div>
      <button onClick={() => setAbierto(true)} className="cursor-pointer">
        Crear en 3D desde imagen
      </button>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold">Crear en 3D desde una imagen</h2>
              <button
                onClick={() => {
                  setAbierto(false);
                  onClose?.();
                }}
                className="text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                ×
              </button>
            </div>
            <div className="mb-4">
              <h3 className="font-medium mb-2">Seleccionar imagen</h3>
              <div className="space-y-2">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImagenChange}
                    className="sr-only"
                  />
                  <span className="ml-2">Desde tu dispositivo</span>
                </label>
                <button
                  onClick={() => setLibraryOpen(true)}
                  className="cursor-pointer"
                >
                  Desde la Biblioteca
                </button>
                {libraryOpen && (
                  <div className="mt-2 p-3 bg-gray-50 rounded">
                    <p className="text-sm text-gray-500">
                      Selector de Biblioteca (simulado)
                    </p>
                    <button
                      onClick={() => {
                        // Simulate selecting an image from library
                        const mockFile = new File(["mock"], "mock.png", {
                          type: "image/png",
                        });
                        setImagen(mockFile);
                        setLibraryOpen(false);
                      }}
                      className="cursor-pointer underline text-sm"
                    >
                      Usar imagen de ejemplo
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            {imagen && (
              <div className="mb-4">
                <h3 className="font-medium mb-2">Vista previa</h3>
                <div className="aspect-square w-36 bg-gray-200 flex items-center justify-center">
                  <span className="text-gray-500">{imagen.name}</span>
                </div>
              </div>
            )}
            
            {plan && (
              <div className="mb-4">
                <h3 className="font-medium mb-2">Plan de optimización</h3>
                <div className="text-sm">
                  <p>Destino: {plan.destino}</p>
                  <p>Prioridad: {plan.prioridad}</p>
                  <p>Resolución: {plan.generador.resolucion}${
                    plan.generador.pocaMemoria ? " (poca memoria)" : ""
                  }</p>
                </div>
              </div>
            )}
            
            {pasos.length > 0 && (
              <div className="mb-4">
                <h3 className="font-medium mb-2">Pasos del taller</h3>
                {pasos.map((paso, index) => (
                  <div key={index} className="mb-2 p-3 rounded border">
                    <div className="flex justify-between items-start">
                      <span className="font-medium">
                        {paso.etapa}:
                        {paso.motor ? paso.motor.nombre : "Sin motor"}
                      </span>
                      <span className="px-2 py-1 rounded text-xs">
                        {paso.saltada ? "Saltado" : paso.motor ? "Listo" : "No disponible"}
                      </span>
                    </div>
                    {!paso.saltada && !paso.motor && (
                      <div className="mt-2 text-sm text-gray-500">
                        <strong>Motivo:</strong> {paso.motivo}
                      </div>
                    )}
                    {!paso.saltada && !paso.motor && paso.descartes.length > 0 && (
                      <div className="mt-1 text-sm text-gray-400">
                        <strong>Descartes:</strong> {paso.descartes.join(", ")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            <div className="mb-4">
              <h3 className="font-medium mb-2">Progreso</h3>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-500 h-2.5 rounded-full transition-width"
                  style={{ width: `${progreso}%` }}
                ></div>
              </div>
              {estado === "generating" && (
                <p className="mt-1 text-sm text-gray-500">
                  Generando modelo 3D...
                </p>
              )}
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setAbierto(false);
                  onClose?.();
                }}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Cancelar
              </button>
              <button
                onClick={generar}
                disabled={!imagen || !plan || estado === "generating"}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer"
                aria-disabled={!imagen || !plan || estado === "generating"}
              >
                {estado === "generating" ? "Generando..." : "Crear en 3D"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}