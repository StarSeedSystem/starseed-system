'use client';

/**
 * Componente para mostrar un pato simulado basado en Open Duck Mini.
 * Usa MuJoCo para WebAssembly y onnxruntime-web para ejecutar la política de needle-duck.
 * Los recursos pesados se cargan solo cuando se activa la simulación.
 * Si el navegador no puede manejarla, muestra un respaldo (orbe).
 */

import React, { useState, useEffect, useRef } from "react";
import type { AccionPato, accionToComando, EstadoSimulacion, estadoInicial } from "@/lib/robots/pato-simulado";
import { cn } from "@/lib/utils";

/**
 * Props del componente PatosSimulado
 */
export interface PatosSimuladoProps {
  /** ID único del pato (para múltiples instancias) */
  id?: string;
  /** Acciones que el pato puede realizar (por defecto, las 5 acciones estándar) */
  acciones?: AccionPato[];
  /** Intensidad de las acciones (0-1) */
  intensidad?: number;
  /** Si el pato debe estar activo o en modo de espera */
  activo?: boolean;
  /** Clase CSS adicional */
  className?: string;
}

/**
 * Componente principal que muestra el pato simulado o un respaldo.
 */
export default function PatosSimulado({
  id = `pato-${Math.random().toString(36).slice(2, 9)}`,
  acciones,
  intensidad = 0.7,
  activo = true,
  className,
}: PatosSimuladoProps) {
  const [estado, setEstado] = useState<EstadoSimulacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const simulationRef = useRef<number | null>(null); // ID de requestAnimationFrame
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Acciones por defecto si no se especifican
  const accionesDisponibles = acciones ?? ["caminar", "girar", "emocion", "bailar", "negacion"];
  const intensidadAccion = Math.max(0, Math.min(1, intensidad ?? 0.7));

  // Verificar si se puede ejecutar la simulación
  useEffect(() => {
    if (!activo) {
      setUsingFallback(true);
      return;
    }

    // Verificar capacidades del navegador
    if (!window.WebGLRenderingContext && !navigator.gpu) {
      setError("Su navegador no soporta WebGL/WebGPU necesario para la simulación.");
      setUsingFallback(true);
      return;
    }

    // En una implementación real, aquí verificaríamos la disponibilidad de:
    // - WebAssembly
    // - onnxruntime-web
    // - MuJoCo Web
    // Por ahora, asumimos que está disponible y intentamos cargar
    setCargando(true);
    
    // Simular carga de recursos pesados (en realidad se haría con import() dinámicas)
    const cargarRecursos = async () => {
      try {
        // En una implementación real, sería algo como:
        // const { initSimulacion } = await import("@/lib/robots/simulacion-worker");
        // Pero como no existen esos módulos, simulamos el proceso
        
        await new Promise(resolve => setTimeout(resolve, 1500)); // Simular carga
        
        // Inicializar estado
        setEstado(estadoInicial());
        setCargando(false);
        
        // Comenzar la simulación
        if (activo && estado) {
          iniciarSimulacion();
        }
      } catch (err) {
        console.error("Error al cargar recursos de simulación:", err);
        setError("No se pudieron cargar los recursos necesarios para la simulación.");
        setUsingFallback(true);
        setCargando(false);
      }
    };

    cargarRecursos();
    
    // Cleanup
    return () => {
      if (simulationRef.current) {
        cancelAnimationFrame(simulationRef.current);
      }
    };
  }, [activo, id]);

  // Bucle de simulación
  const iniciarSimulacion = () => {
    if (!estado || !activo) return;
    
    const pasoSimulacion = (timestamp: number) => {
      if (!activo || !estado) return;
      
      // Simular paso de física (en realidad sería manejado por MuJoCo)
      const estadoActualizado = simularPaso(estado, accionesDisponibles, intensidadAccion);
      
      setEstado(estadoActualizado);
      
      // Continuar el bucle
      simulationRef.current = requestAnimationFrame(pasoSimulacion);
    };
    
    simulationRef.current = requestAnimationFrame(pasoSimulacion);
  };

  // Simular un paso de física (versión simplificada)
  const simularPaso = (
    estadoActual: EstadoSimulacion,
    accionesDisponibles: AccionPato[],
    intensidad: number
  ): EstadoSimulacion => {
    // En una implementación real, esto sería:
    // 1. Obtener acción de alto nivel (por ejemplo, desde needle-duck ONNX)
    // 2. Convertirla a comandos de articulaciones usando accionToComando
    // 3. Aplicar los comandos a la simulación de MuJoCo
    // 4. Obtener el nuevo estado desde MuJoCo
    
    // Para esta simulación simplificada, generamos movimientos aleatorios sutiles
    const nuevoEstado: EstadoSimulacion = {
      ...estadoActual,
      tiempo: estadoActual.tiempo + 1/60, // Asumiendo 60 FPS
    };
    
    // Pequeño movimiento aleatorio para dar vida al pato
    const movimiento = 0.005 * intensidad;
    nuevoEstado.posicion = [
      nuevoEstado.posicion[0] + (Math.random() - 0.5) * movimiento,
      nuevoEstado.posicion[1], // Mantener altura constante (suelo)
      nuevoEstado.posicion[2] + (Math.random() - 0.5) * movimiento,
    ];
    
    // Rotación lenta en Y (giro horizontal)
    nuevoEstado.rotacion = [
      nuevoEstado.rotacion[0],
      nuevoEstado.rotacion[1] + (Math.random() - 0.5) * movimiento * 0.5,
      nuevoEstado.rotacion[2],
    ];
    
    return nuevoEstado;
  };

  // Si hay error o no se puede ejecutar, mostrar respaldo
  if (error || usingFallback) {
    return (
      <div className={cn("relative w-64 h-64 rounded-xl overflow-hidden", className)}>
        {/* Respaldo: orbe simple (simulando la orbe de Astraura) */}
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
            <span className="text-white text-xs">🦆</span>
          </div>
        </div>
        {/* Mensaje de error si existe */}
        {error && (
          <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-black/50 text-xs text-white text-center">
            {error}
          </div>
        )}
      </div>
    );
  }

  // Mientras se carga, mostrar indicador
  if (cargando) {
    return (
      <div className={cn("relative w-64 h-64 rounded-xl overflow-hidden", className)}>
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-xs text-gray-600">Iniciando simulación...</span>
        </div>
      </div>
    );
  }

  // Renderizar la simulación real (cuando esté lista)
  if (!estado) {
    return (
      <div className={cn("relative w-64 h-64 rounded-xl overflow-hidden", className)}>
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <span className="text-xs text-gray-500">Preparando pato...</span>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={cn("relative w-64 h-64 rounded-xl overflow-hidden", className)}
      ref={canvasRef}
    >
      {/* En una implementación real, aquí iría el canvas de WebGL/WebGPU 
          que renderizaría la simulación de MuJoCo */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-green-50 to-yellow-50">
        {/* Representación simplificada del pato */}
        <div className="relative w-20 h-12">
          {/* Cuerpo */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-6 bg-yellow-300 rounded-full"></div>
          {/* Cabeza */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-8 h-8 bg-yellow-300 rounded-full 
                transform-origin-bottom 
                style={{ transform: `rotate(${estado.rotacion[0]}rad)` }}>
            {/* Pico */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-1 bg-orange-400"></div>
          </div>
          {/* Alas (simplificadas) */}
          <div className="absolute bottom-2 left-0 w-2 h-4 bg-yellow-200 rounded-r-lg 
                transform-origin-left 
                style={{ transform: `rotate(${Math.sin(estado.tiempo * 2) * 0.2}rad)` }}></div>
          <div className="absolute bottom-2 right-0 w-2 h-4 bg-yellow-200 rounded-l-lg 
                transform-origin-right 
                style={{ transform: `rotate(${Math.sin(estado.tiempo * 2 + 1) * -0.2}rad)` }}></div>
          {/* Patas */}
          <div className="absolute bottom-0 left-2 w-1 h-3 bg-yellow-400"></div>
          <div className="absolute bottom-0 right-2 w-1 h-3 bg-yellow-400"></div>
        </div>
        
        {/* Indicadores de estado */}
        <div className="absolute bottom-2 left-2 text-xs text-green-600">
          • Activo
        </div>
        <div className="absolute bottom-2 right-2 text-xs text-gray-500">
          Simulado
        </div>
      </div>
    </div>
  );
}