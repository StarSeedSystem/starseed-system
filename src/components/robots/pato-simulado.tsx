"use client";

import { useEffect, useState, useRef } from "react";
import { obtenerPatoSimulado, type AccionPato, type EstadoPato } from "../../lib/robots/pato-simulado";

export function PatoSimuladoComponent() {
  const [estado, setEstado] = useState<EstadoPato>({ estado: "no_disponible", motivo: "No inicializado" });
  const [activarSimulacion, setActivarSimulacion] = useState(false);
  const patoRef = useRef<ReturnType<typeof obtenerPatoSimulado> | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  
  // Inicializar el pato cuando se monta el componente
  useEffect(() => {
    patoRef.current = obtenerPatoSimulado();
    setEstado(patoRef.current.obtenerEstado());
    
    // Suscribirse a cambios de estado (en una implementación real usaríamos eventos o un store)
    const verificarEstado = setInterval(() => {
      if (patoRef.current) {
        const nuevoEstado = patoRef.current.obtenerEstado();
        setEstado(nuevoEstado);
      }
    }, 500);
    
    return () => clearInterval(verificarEstado);
  }, []);
  
  // Cuando el usuario activa la simulación, intentar cargar los recursos pesados
  useEffect(() => {
    if (activarSimulacion && patoRef.current) {
      patoRef.current.recargar().then(() => {
        setEstado(patoRef.current.obtenerEstado());
      }).catch(error => {
        setMensajeError(`Error al cargar recursos: ${error instanceof Error ? error.message : String(error)}`);
        setEstado({ estado: "error", mensaje: error instanceof Error ? error.message : String(error) });
      });
    }
  }, [activarSimulacion]);
  
  const manejarAccion = async (accion: AccionPato) => {
    if (!patoRef.current) {
      setMensajeError("Pato no inicializado");
      return;
    }
    
    const resultado = await patoRef.current.ejecutarAccion(accion);
    if (!resultado.éxito) {
      setMensajeError(resultado.mensaje || "Error desconocido");
    } else {
      setMensajeError(null);
    }
  };
  
  // Si está cargando (mostrar este estado primero)
  if (estado.estado === "cargando") {
    return (
      <div className="flex flex-col items-center p-6 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="w-16 h-16 bg-blue-500 dark:bg-blue-600 rounded-full flex items-center justify-center mb-4">
          <span className="text-white text-2xl">🦆</span>
        </div>
        <h3 className="mb-2 text-lg font-semibold">
          Pato Simulado
        </h3>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Cargando recursos de simulación... {estado.progreso}%
        </p>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded h-2.5">
          <div 
            className="bg-blue-500 h-2.5 rounded" 
            style={{ width: `${estado.progreso}%` }}
          ></div>
        </div>
      </div>
    );
  }
  
  // Si el pato no está disponible, mostrar el orbe de respaldo
  if (estado.estado === "no_disponible" || estado.estado === "error") {
    return (
      <div className="flex flex-col items-center p-6 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="w-16 h-16 bg-blue-500 dark:bg-blue-600 rounded-full flex items-center justify-center mb-4">
          <span className="text-white text-2xl">🦆</span>
        </div>
        <h3 className="mb-2 text-lg font-semibold">
          Pato Simulado
        </h3>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          {estado.estado === "error" 
            ? `Error: ${estado.mensaje}` 
            : "La simulación del pato requiere un navegador con WebAssembly y WebGPU"}
        </p>
        <button 
          onClick={() => setActivarSimulacion(true)}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50"
          disabled={false} // Siempre habilitado en estado de error/no_disponible
        >
          Activar Simulación
        </button>
        {mensajeError && (
          <p className="mt-2 text-sm text-red-500 dark:text-red-400">{mensajeError}</p>
        )}
      </div>
    );
  }
  
  // Si está listo para usar
  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 rounded-lg">
      <div className="flex flex-col items-center mb-6">
        <div className="w-20 h-20 bg-blue-500 dark:bg-blue-600 rounded-full flex items-center justify-center mb-4">
          <span className="text-white text-3xl">🦆</span>
        </div>
        <h3 className="mb-2 text-lg font-semibold">
          Pato Simulado (Listo)
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          El pato está listo para recibir comandos
        </p>
      </div>
      
      {/* Controles integrados directamente para evitar dependencias externas */}
      <div className="space-y-4">
        <div className="border-t pt-4">
          <h4 className="mb-2 font-medium text-gray-700 dark:text-gray-300">
            Controles de Movimiento
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Dirección de caminata:
              </label>
              <select 
                value={direccionCaminar}
                onChange={(e) => setDireccionCaminar(e.target.value as any)}
                className="w-full px-3 py-2 border rounded disabled:opacity-50"
                disabled={!patoRef.current?.estaListo()}
              >
                <option value="adelante">Adelante</option>
                <option value="atras">Atrás</option>
                <option value="izquierda">Izquierda</option>
                <option value="derecha">Derecha</option>
              </select>
            </div>
            <div>
              <button 
                onClick={manejarCaminar}
                className="w-full px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded disabled:opacity-50"
                disabled={!patoRef.current?.estaListo()}
              >
                Caminar
              </button>
            </div>
          </div>
          
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Dirección de giro:
              </label>
              <select 
                value={direccionGirar}
                onChange={(e) => setDireccionGirar(e.target.value as any)}
                className="w-full px-3 py-2 border rounded disabled:opacity-50"
                disabled={!patoRef.current?.estaListo()}
              >
                <option value="izquierda">Izquierda</option>
                <option value="derecha">Derecha</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Grados:
              </label>
              <input
                type="number"
                value={gradosGirar}
                onChange={(e) => setGradosGirar(parseInt(e.target.value) || 90)}
                className="w-full px-3 py-2 border rounded disabled:opacity-50"
                min="10"
                max="360"
                disabled={!patoRef.current?.estaListo()}
              />
            </div>
          </div>
          
          <div className="mt-4">
            <button 
              onClick={manejarGirar}
              className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50"
              disabled={!patoRef.current?.estaListo()}
            >
              Girar
            </button>
          </div>
        </div>
        
        <div className="border-t pt-4">
          <h4 className="mb-2 font-medium text-gray-700 dark:text-gray-300">
            Controles de Emoción
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Expresión:
              </label>
              <select 
                value={expresionEmoticon}
                onChange={(e) => setExpresionEmoticon(e.target.value as any)}
                className="w-full px-3 py-2 border rounded disabled:opacity-50"
                disabled={!patoRef.current?.estaListo()}
              >
                <option value="feliz">Feliz</option>
                <option value="triste">Triste</option>
                <option value="confundido">Confundido</option>
                <option value="asustado">Asustado</option>
                <option value="enojado">Enojado</option>
                <option value="somnoliento">Somnoliento</option>
                <option value="asentir">Asentir</option>
                <option value="mirar_arriba">Mirar Arriba</option>
                <option value="mirar_abajo">Mirar Abajo</option>
                <option value="mirar_izquierda">Mirar Izquierda</option>
                <option value="mirar_derecha">Mirar Derecha</option>
                <option value="mirar_alrededor">Mirar Alrededor</option>
              </select>
            </div>
            <div>
              <button 
                onClick={manejarEmoticon}
                className="w-full px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded disabled:opacity-50"
                disabled={!patoRef.current?.estaListo()}
              >
                Emoticon
              </button>
            </div>
          </div>
        </div>
        
        <div className="border-t pt-4">
          <h4 className="mb-2 font-medium text-gray-700 dark:text-gray-300">
            Controles de Baile
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Estilo de baile:
              </label>
              <select 
                value={estiloBaile}
                onChange={(e) => setEstiloBaile(e.target.value as any)}
                className="w-full px-3 py-2 border rounded disabled:opacity-50"
                disabled={!patoRef.current?.estaListo()}
              >
                <option value="moverse">Moverse</option>
                <option value="cabecear">Cabecear</option>
                <option value="girar">Girar</option>
                <option value="caminata_lunar">Caminata Lunar</option>
                <option value="pollo">Baile del Pollo</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Duración (seg):
              </label>
              <input
                type="number"
                value={4}
                className="w-full px-3 py-2 border rounded disabled:opacity-50"
                disabled={!patoRef.current?.estaListo()}
              />
            </div>
          </div>
          
          <div className="mt-4">
            <button 
              onClick={manejarBaile}
              className="w-full px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded disabled:opacity-50"
              disabled={!patoRef.current?.estaListo()}
            >
              Bailar
            </button>
          </div>
        </div>
        
        <div className="border-t pt-4">
          <button 
            onClick={manejarSacudirCabeza}
            className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded disabled:opacity-50"
            disabled={!patoRef.current?.estaListo()}
          >
            Sacudir Cabeza (Negativo)
          </button>
        </div>
      </div>
      
      {mensajeError && (
        <p className="mt-4 text-sm text-red-500 dark:text-red-400">{mensajeError}</p>
      )}
    </div>
  );
  
  // Estado para los controles (moved inside component to avoid closure issues)
  const [direccionCaminar, setDireccionCaminar] = useState<"adelante" | "atras" | "izquierda" | "derecha">("adelante");
  const [direccionGirar, setDireccionGirar] = useState<"izquierda" | "derecha">("izquierda");
  const [gradosGirar, setGradosGirar] = useState(90);
  const [expresionEmoticon, setExpresionEmoticon] = useState<"feliz" | "triste" | "confundido" | "asustado" | "enojado" | "somnoliento" | "asentir" | "mirar_arriba" | "mirar_abajo" | "mirar_izquierda" | "mirar_derecha" | "mirar_alrededor">("feliz");
  const [estiloBaile, setEstiloBaile] = useState<"moverse" | "cabecear" | "girar" | "caminata_lunar" | "pollo">("moverse");
}