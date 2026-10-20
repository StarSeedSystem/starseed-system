'use client';

import * as React from "react";
import { useState, useEffect } from "react";
import { useAppearance } from "@/context/appearance-context";
import { WidgetStyleOverrideProvider } from "../dashboard/kit/widget-style-override";
import { getWidgetFunctionStyle } from "../dashboard/widget-function-style";
import { acentoDeTipo } from "@/components/widgets-libres/acentos-categoria";
import { MarcoUnificado, type VarianteMarco } from "@/components/widgets-libres/marco-unificado";
import type { DashboardWidget } from "../dashboard-types";

// Types for our component state
interface Capa {
  id: string;
  nombre: string;
  tipo: string;
  // Add more properties as needed
}

interface LineaDeTiempo {
  // Simple timeline based on data-* attributes
  tiempoActual: number;
  duracion: number;
}

interface EstadoComposicion {
  capas: Capa[];
  lineaDeTiempo: LineaDeTiempo;
  tieneGSAP: boolean;
  servicioDisponible: boolean;
}

// Placeholder for operations SDK - we'll define the types we need
interface OperacionSDK {
  type: string;
  payload: any;
}

const EstudioVideoVentana: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const [estado, setEstado] = useState<EstadoComposicion>({
    capas: [],
    lineaDeTiempo: { tiempoActual: 0, duracion: 0 },
    tieneGSAP: false,
    servicioDisponible: false,
  });

  const { config } = useAppearance();
  const fn = getWidgetFunctionStyle(widget.widget_type);

  // Check if hyperframes service is available
  useEffect(() => {
    const verificarServicio = async () => {
      try {
        const response = await fetch(`http://localhost:4490/health`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        setEstado(prev => ({ ...prev, servicioDisponible: response.ok }));
      } catch (error) {
        setEstado(prev => ({ ...prev, servicioDisponible: false }));
      }
    };

    verificarServicio();
    const intervalo = setInterval(verificarServicio, 5000);
    return () => clearInterval(intervalo);
  }, []);

  // Placeholder for loading composition data
  useEffect(() => {
    // In a real implementation, we would load the composition from somewhere
    // For now, we'll set some dummy data
    setEstado(prev => ({
      ...prev,
      capas: [
        { id: 'capa1', nombre: 'Capa 1', tipo: 'video' },
        { id: 'capa2', nombre: 'Capa 2', tipo: 'imagen' },
      ],
      lineaDeTiempo: { tiempoActual: 0, duracion: 10 },
      tieneGSAP: false, // We would check the composition for GSAP usage
    }));
  }, []);

  const handleOperacion = (operacion: OperacionSDK) => {
    // Emit operation to operations-sdk.ts
    // In a real implementation, we would send this to the hyperframes service
    console.log('Operación emitida:', operacion);
    // TODO: Implement actual operation sending
  };

  const variantDeMarco = (v: string | undefined): VarianteMarco => {
    return v === "solido" ? "solido" : v === "transparente" ? "transparente" : "cristal";
  };

  return (
    <div className="h-full w-full" data-widget-fn={fn.kind} data-widget-weight={fn.weight} style={{ ["--w-fn-accent" as string]: fn.accent }}>
      <WidgetStyleOverrideProvider value={{ variant: widget.settings?.styleVariant, trinityNode: widget.settings?.trinityNode }}>
        <MarcoUnificado
          acento={acentoDeTipo(widget.widget_type).acento}
          acento2={acentoDeTipo(widget.widget_type).acento2}
          etiqueta="Estudio de vídeo"
          variante={variantDeMarco(widget.settings?.styleVariant)}
          compacto={config.widgets?.compact === true}
          tipo={widget.widget_type}
          familia={acentoDeTipo(widget.widget_type).familia}
        >
          {/* Contenido del componente */}
          <div className="p-4">
            {/* Placeholder for the actual UI */}
            <div>
              <h2 className="text-xl font-bold mb-4">Estudio de vídeo</h2>
              
              {/* Lista de capas */}
              <div className="mb-4">
                <h3 className="font-semibold mb-2">Capas</h3>
                <ul className="list-disc list-inside">
                  {estado.capas.map(capa => (
                    <li key={capa.id}>{capa.nombre} ({capa.tipo})</li>
                  ))}
                </ul>
              </div>
              
              {/* Línea de tiempo simple */}
              <div className="mb-4">
                <h3 className="font-semibold mb-2">Línea de tiempo</h3>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className="bg-blue-500 h-2.5 rounded-full" 
                    style={{ width: `${(estado.lineaDeTiempo.tiempoActual / estado.lineaDeTiempo.duracion) * 100}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span>{estado.lineaDeTiempo.tiempoActual}s</span>
                  <span>{estado.lineaDeTiempo.duracion}s</span>
                </div>
              </div>
              
              {/* Vista previa o mensaje de servicio no disponible */}
              <div className="mb-4">
                {estado.servicioDisponible ? (
                  <div>
                    {/* In a real implementation, we would render the hyperframes-player here */}
                    <div className="border rounded p-4">
                      <p className="text-center text-muted-foreground">Vista previa de HyperFrames (simulada)</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="mb-4">Servicio de HyperFrames no disponible</p>
                    <button 
                      className="bg-primary text-white px-4 py-2 rounded hover:bg-primary/90"
                      onClick={() => {
                        // TODO: Implement opening in another neuron
                        alert('Abrir en otra neurona no implementado');
                      }}
                    >
                      Abrir en otra neurona
                    </button>
                  </div>
                )}
                
                {/* Aviso de GSAP */}
                {estado.tieneGSAP && (
                  <div className="mt-4 p-3 bg-yellow-50 border-l-4 border-yellow-400">
                    <p className="text-yellow-800">
                      <strong>Aviso:</strong> Esta composición utiliza GSAP. Las animaciones GSAP no se pueden editar en este entorno.
                    </p>
                  </div>
                )}
              </div>
              
              {/* Panel de propiedades (placeholder) */}
              <div className="mt-4 p-3 bg-muted-border rounded">
                <h3 className="font-semibold mb-2">Propiedades</h3>
                <p className="text-sm text-muted-foreground">Panel de propiedades que emite órdenes de operaciones-sdk.ts</p>
                {/* Example button to emit an operation */}
                <button 
                  className="btn btn-primary w-full mt-2"
                  onClick={() => {
                    handleOperacion({ type: 'ADD_LAYER', payload: { nombre: 'Nueva capa', tipo: 'video' } });
                  }}
                 >
                   Añadir capa de ejemplo
                 </button>
               </div>
             </div>
           </div>
         </MarcoUnificado>
       </WidgetStyleOverrideProvider>
     </div>
  );
};

export default EstudioVideoVentana;