"use client";
import { useState } from "react";
import { useGenerar3d } from "@/lib/avatares/adaptadores/use-generar-3d";
import type { Destino3D } from "@/lib/avatares/adn/optimizacion";
import { PasoPlan } from "@/lib/avatares/adn/canalizacion";

interface Props {
  destino: Destino3D;
  textoBoton?: string;
  claseBoton?: string;
}

export function Generar3D({
  destino,
  textoBoton = "Crear en 3D",
  claseBoton = "",
}: Props) {
  const [abrirSelector, setAbrirSelector] = useState(false);
  const [imagenSeleccionada, setImagenSeleccionada] = useState<File | null>(null);
  const { estado, iniciarGeneracion, reiniciarEstado } = useGenerar3d(destino);

  const manejarSeleccionArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0] ?? null;
    if (archivo) {
      setImagenSeleccionada(archivo);
      setAbrirSelector(false);
      iniciarGeneracion(archivo);
    }
  };

  const formatearPlan = (pasos: PasoPlan[] | null): string => {
    if (!pasos) return "Plan no disponible";
    return pasos
      .map((p, i) => {
        const estadoTexto = p.saltada ? "(saltada)" : p.motor ? p.motor.nombre : "FALLO";
        const motivo = p.motivo ? ` - ${p.motivo}` : "";
        return `${i + 1}. ${p.etapa}: ${estadoTexto}${motivo}`;
      })
      .join("\n");
  };

  return (
    <div>
      <button
        className={`btn btn-primary ${claseBoton} cursor-pointer`}
        onClick={() => setAbrirSelector(true)}
        disabled={estado.idle === false && estado.cargandoImagen === false}
      >
        {textoBoton}
      </button>

      {abrirSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-lg font-semibold mb-4">Seleccionar imagen para generar 3D</h2>
            {imagenSeleccionada ? (
              <div>
                <p className="mb-2">Imagen seleccionada:</p>
                <img
                  src={URL.createObjectURL(imagenSeleccionada)}
                  alt="Previsualización"
                  className="max-w-full h-auto rounded mb-4"
                />
                <p className="text-sm text-gray-500">
                  {imagenSeleccionada.name} ({Math.round(imagenSeleccionada.size / 1024)} KB)
                </p>
                <button
                  className="btn btn-secondary w-full mb-4 cursor-pointer"
                  onClick={() => {
                    setImagenSeleccionada(null);
                    URL.revokeObjectURL(imagenSeleccionada as any);
                  }}
                >
                  Cambiar imagen
                </button>

                {estado.plan && (
                  <div className="mb-4">
                    <h3 className="font-medium mb-2">Plan de generación:</h3>
                    <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-32">
                      {formatearPlan(estado.plan)}
                    </pre>
                  </div>
                )}

                <div className="mb-4 text-sm">
                  <h3 className="font-medium mb-1">Neurona actual:</h3>
                  <p className="mb-1">GPU: {estado.hierro.gpu} | VRAM: {estado.hierro.vramGB ?? "N/A"} GB</p>
                  <p className="mb-1">RAM: {estado.hierro.ramGB} GB | Blender: {estado.hierro.blender ? "Sí" : "No"}</p>
                  <p>Permiso HF: {estado.permisoEspacioHf ? "Sí" : "No"}</p>
                </div>
              </div>
            ) : (
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  className="file-input file-input-bordered w-full mb-4"
                  onChange={manejarSeleccionArchivo}
                />
                Seleccionar una imagen...
              </label>
            )}
            {!estado.idle && (
              <div className="mt-4">
                <div className="mb-2">
                  <span className="font-medium">{estado.mensaje}</span>
                  {estado.progreso > 0 && (
                    <div className="mt-2 h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-primary-600 transition-all duration-300 ${estado.generando ? "animate-pulse" : ""}`}
                        style={{ width: `${estado.progreso}%` }}
                      ></div>
                    </div>
                  )}
                </div>
                {estado.error && (
                  <p className="text-sm text-red-600">{estado.error}</p>
                )}
                {estado.adn && (
                  <p className="text-sm text-green-600">Modelo 3D generado exitosamente</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}