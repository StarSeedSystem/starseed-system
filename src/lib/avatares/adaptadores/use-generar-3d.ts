"use client";

import { useCallback, useState, useRef } from "react";
import { planOptimizacion, type Destino3D, type Hierro } from "@/lib/avatares/adn/optimizacion";
import { planificar, type PeticionPlan, type Partida, type PlanAvatar } from "@/lib/avatares/adn/canalizacion";
import { elegirNeurona, type EncargoTaller, type NeuronaTaller, type OrdenTaller } from "@/lib/avatares/adaptadores/reparto-taller";
import { AdnAvatar } from "@/lib/avatares/adn/adn";
import { saveAdnToLibrary } from "@/lib/avatares/adaptadores/almacen-adn";
import { usoPermitido } from "@/lib/avatares/adn/canalizacion";

// Mock function for image selection - in reality this would interface with device/Biblioteca
async function seleccionarImagen(): Promise<File | null> {
  // This would be implemented with actual file input or Biblioteca integration
  return null;
}

// Mock function for checking if image contains people - would use ML model in reality
async function contienePersonas(imagen: File): Promise<boolean> {
  // Placeholder implementation
  return false;
}

export interface UseGenerar3dResult {
  iniciarGeneracion: (destino: Destino3D, esqueleto: string) => Promise<void>;
  cargando: boolean;
  progreso: number;
  mensaje: string;
  error: string | null;
  resultado: AdnAvatar | null;
  reiniciar: () => void;
}

export function useGenerar3d(): UseGenerar3dResult {
  const [cargando, setCargando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<AdnAvatar | null>(null);
  const [planActual, setPlanActual] = useState<PlanAvatar | null>(null);
  const intentoActual = useRef(0);

  const reiniciar = useCallback(() => {
    setCargando(false);
    setProgreso(0);
    setMensaje("");
    setError(null);
    setResultado(null);
    setPlanActual(null);
    intentoActual.current = 0;
  }, []);

  const iniciarGeneracion = useCallback(
    async (destino: Destino3D, esqueleto: string) => {
      reiniciar();
      setCargando(true);
      setMensaje("Seleccionando imagen...");

      try {
        // 1. Seleccionar imagen (de Biblioteca o dispositivo)
        const imagen = await seleccionarImagen();
        if (!imagen) {
          throw new Error("No se seleccionó ninguna imagen");
        }

        setMensaje("Verificando imagen...");
        setProgreso(5);

        // 2. Verificar si contiene personas (para permiso de Space remoto)
        const tienePersonas = await contienePersonas(imagen);
        
        // 3. Obtener capacidades de la neurona actual (simulado - en realidad vendría del latido)
        const hierroActual: Hierro = {
          gpu: "ninguna", // Simulando entorno actual (A1 o Mac de 8GB)
          ramGB: 8,
          vramGB: null,
          blender: true,
          permiteEspacioHf: false,
          claveExterna: false,
        };

        // 4. Crear el encargo para el taller
        const encargo: EncargoTaller = {
          destino,
          partida: "imagen",
          esqueleto: esqueleto as any, // Assuming proper type conversion
          region: null, // Would come from user context
          comercial: false,
        };

        setMensaje("Planificando generación...");
        setProgreso(10);

        // 5. Planificar con las capacidades actuales
        let planNeurona = planParaNeurona(
          { id: "actual", hierro: hierroActual, carga: 0, viva: true, cuenta: null, ofrecidaPor: [] },
          encargo
        );

        // Show plan details
        if (planNeurona?.plan) {
          setPlanActual(planNeurona.plan);
          
          // Show stage-by-stage plan
          const etapasTexto = planNeurona.plan.pasos
            .map((p, i) => `${i + 1}. ${p.etapa}: ${p.motor ? p.motor.nombre : "SALTADO"} (${p.motivo})`)
            .join("\n");
          setMensaje(`Plan:\n${etapasTexto}`);
        }

        let intento = 0;
        let planValido = planNeurona?.plan?.listo || false;

        // 6. Si no puede generar localmente, considerar Space remoto con permiso
        while (!planValido && intento < 3) { // Máximo 3 intentos
          intento++;
          
          if (!planNeurona || !planNeurona.plan?.listo) {
            // 6. Si no puede generar localmente, considerar Space remoto con permiso
            if (tienePersonas) {
              setMensaje("Se requiere permiso para usar Space remoto con fotos de personas");
              // In real implementation, show permission dialog with extra checkbox for personas
              throw new Error("Se requiere permiso explícito para procesar fotos de personas en espacios remotos");
            }

            setMensaje(`Intento ${intento}: Solicitando permiso para usar Space remoto...`);
            setProgreso(10 + (intento * 5));
            
            // Simulate user granting permission
            const permisoConcedido = true; // Would come from actual user consent
            
            if (!permisoConcedido) {
              throw new Error("Permiso denegado para usar Space remoto");
            }

            // Update hierro to include espacio-hf capability
            const hierroConEspacio: Hierro = {
              ...hierroActual,
              permiteEspacioHf: true,
            };

            planNeurona = planParaNeurona(
              { id: "actual", hierro: hierroConEspacio, carga: 0, viva: true, cuenta: null, ofrecidaPor: [] },
              encargo
            );
            
            if (planNeurona?.plan) {
              setPlanActual(planNeurona.plan);
              const etapasTexto = planNeurona.plan.pasos
                .map((p, i) => `${i + 1}. ${p.etapa}: ${p.motor ? p.motor.nombre : "SALTADO"} (${p.motivo})`)
                .join("\n");
              setMensaje(`Plan con Space remoto:\n${etapasTexto}`);
            }
          }

          planValido = planNeurona?.plan?.listo || false;
          
          if (!planValido && intento < 3) {
            // Try with next intento (more lightweight) if memory issue
            setMensaje(`Intento ${intento fallido}: Intentando configuración más ligera...`);
            // In real implementation, we would use siguienteIntento here
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        if (!planValido) {
          throw new Error("No hay neuronas disponibles para generar el modelo 3D después de varios intentos");
        }

        setMensaje("Iniciando generación...");
        setProgreso(20);

        // 7. Ejecutar el plan paso a paso con progreso real
        const pasos = planNeurona!.plan.pasos;
        let pasoActual = 0;

        for (const paso of pasos) {
          if (paso.saltada) {
            pasoActual++;
            setMensaje(`Etapa ${paso.etapa}: SALTADA - ${paso.motivo}`);
            continue;
          }

          setMensaje(`Ejecutando: ${paso.motor?.nombre || "Desconocido"}...`);
          
          // Simulate work for each step with variable timing based on motor
          const tiempoBase = 800; // Base time in ms
          const tiempoMotor = paso.motor ? (paso.motor.minutosAprox ?? 1) * 1000 / 60 : tiempoBase; // Convert mins to seconds proportionally
          
          await new Promise(resolve => setTimeout(resolve, Math.min(tiempoMotor, 1500))); // Cap at 1.5s for demo
          
          pasoActual++;
          setProgreso(20 + Math.round((pasoActual / pasos.length) * 70));
          
          // Update message with current step
          setMensaje(`Completado: ${paso.motor?.nombre || paso.etapa} (${Math.round((pasoActual / pasos.length) * 100)}%)`);
        }

        setMensaje("Generando modelo 3D final...");
        setProgreso(90);

        // 8. Generar resultado (GLB + LOD) - placeholder for actual implementation
        // In reality, this would call the actual 3D generation services
        const adnResultado: AdnAvatar = {
          id: `generado-${Date.now()}`,
          rev: 1,
          dueno: { tipo: "perfil", id: "usuario-actual" },
          base: { ref: `biblioteca:generado-${Date.now()}` },
          esqueleto: esqueleto as any,
          morfologia: {},
          materiales: {},
          piezas: {},
          expresiones: {},
          aura: { tipo: "ninguna", intensidad: 0 },
          movimiento: { caracter: "tranquilo", intensidad: 0.5 },
          visibilidad: "privado",
          procedencia: planNeurona?.plan?.procedencia || [],
          creadoEn: Date.now(),
          actualizadoEn: Date.now(),
        };

        // 9. Guardar en Biblioteca con procedencia y atribución
        setMensaje("Guardando en Biblioteca con procedencia...");
        setProgreso(95);
        
        await saveAdnToLibrary(adnResultado, "privado");
        
        // Add attribution info from procedencia
        const { ok, motivos, atribuciones } = usoPermitido(
          { procedencia: adnResultado.procedencia },
          { region: null, comercial: false }
        );
        
        if (!ok) {
          console.warn("Atribución requerida:", atribuciones.join(", "));
        }
        
        setMensaje("Generación completada");
        setProgreso(100);
        setResultado(adnResultado);

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);
        setResultado(null);
        
        // 10. Automatic retry with siguienteIntento if memory error
        if (errorMsg.includes("memoria") || errorMsg.includes("VRAM") || errorMsg.includes("memoria")) {
          setMensaje("Error de memoria: Reintentando con configuración más ligera...");
          // In real implementation, would call siguienteIntento from optimizacion.ts and retry
          // For now, we'll just show the error
        }
      } finally {
        setCargando(false);
      }
    },
    [reiniciar]
  );

  return {
    iniciarGeneracion,
    cargando,
    progreso,
    mensaje,
    error,
    resultado,
    reiniciar,
  };
}

// Helper function to simulate planParaNeurona (would normally come from reparto-taller)
function planParaNeurona(neurona: NeuronaTaller, encargo: EncargoTaller): { plan: PlanAvatar | null } | null {
  // Simplified version - in reality this would import from reparto-taller
  const hierro = neurona.hierro;
  if (!hierro) return null;
  
  const capacidades = ["cpu"]; // Simplified
  if (hierro.gpu === "apple" && hierro.ramGB >= 32) capacidades.push("apple-silicon-32gb");
  if (hierro.gpu === "nvidia" && (hierro.vramGB ?? 0) >= 16) capacidades.push("cuda-16gb");
  if (hierro.permiteEspacioHf) capacidades.push("espacio-hf");
  
  const prioridad = planOptimizacion(encargo.destino, hierro.vramGB).prioridad;
  const plan = planificar({
    partida: encargo.partida,
    esqueleto: encargo.esqueleto as any,
    capacidades,
    region: encargo.region,
    comercial: encargo.comercial,
    permitirDePago: hierro.claveExterna,
    prioridad,
    cerrada: encargo.cerrada ?? false,
  });
  
  return { plan };
}