"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { AppearanceProvider } from "@/context/appearance-context";
import { PrimerArranque } from "@/components/onboarding/primer-arranque";
import { getOnboarding, saveOnboarding, type OnboardingState } from "@/lib/onboarding/onboarding";
import { useAurora } from "@/components/aurora/aurora-provider";

/**
 * Espera a que una condición se cumpla, reintentando cada intervalo hasta el timeout.
 * Versión de producción (sin dependencias de testing-library) para condiciones observables.
 */
async function esperarCondicion<T>(
  condicion: () => T | Promise<T> | null | undefined,
  opciones: { timeout?: number; intervalo?: number } = {}
): Promise<T> {
  const { timeout = 5000, intervalo = 50 } = opciones;
  const inicio = Date.now();

  while (Date.now() - inicio < timeout) {
    try {
      const resultado = await condicion();
      if (resultado !== null && resultado !== undefined) {
        return resultado;
      }
    } catch {
      // La condición lanzó error: seguimos reintentando
    }
    await new Promise((r) => setTimeout(r, intervalo));
  }
  throw new Error(`Timeout: la condición no se cumplió en ${timeout}ms`);
}

/**
 * Onboarding principal — componente contenedor que maneja el estado de onboarding
 * usando condiciones observables en lugar de temporizadores estáticos.
 *
 * @example
 * <Onboarding />
 */
export default function Onboarding() {
  const router = useRouter();
  const pathname = usePathname();
  const aurora = useAurora();

  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [onboardingData, setOnboardingData] = useState<OnboardingState | null>(null);

  // Cargar estado de onboarding al montar
  useEffect(() => {
    const cargarEstado = async () => {
      try {
        const estado = await getOnboarding();
        setOnboardingData(estado);
        setIsOpen(!estado.completed);
      } catch (error) {
        toast.error("No se pudo cargar el estado de onboarding");
      }
    };

    cargarEstado();
  }, []);

  // Guardar progreso cuando cambie el estado
  useEffect(() => {
    if (!isOpen || !onboardingData) return;

    const guardarProgreso = async () => {
      try {
        await saveOnboarding({
          steps: { ...(onboardingData.steps ?? {}), last: currentStep },
        });
      } catch (error) {
        console.error("No se pudo guardar el progreso:", error);
      }
    };

    guardarProgreso();
  }, [isOpen, currentStep, onboardingData]);

  // Monitorear cambios de ruta para cerrar el onboarding cuando sea apropiado
  useEffect(() => {
    const handleRouteChange = async () => {
      if (pathname === "/escritorios" && isOpen) {
        setIsOpen(false);
        await saveOnboarding({ completed: true });
        toast.success("¡Onboarding completado!");
      }
    };

    handleRouteChange();
  }, [pathname, isOpen]);

  // Inicializar componentes de asistencia cuando se abra
  useEffect(() => {
    if (!isOpen) return;

    const inicializarAsistencia = async () => {
      setIsLoading(true);
      try {
        // Esperar a que los componentes de asistencia estén listos (condición observable)
        await esperarCondicion(() => {
          if (aurora?.speak) return true;
          return null;
        }, { timeout: 5000 });

        // Iniciar narración de bienvenida si está habilitado
        if (aurora?.speak) {
          aurora.speak("Te damos la bienvenida a StarSeed. ¿Cómo prefieres empezar?");
        }
      } catch (error) {
        console.error("Error al inicializar asistencia:", error);
      } finally {
        setIsLoading(false);
      }
    };

    inicializarAsistencia();
  }, [isOpen]);

  const closeOnboarding = useCallback(async () => {
    setIsOpen(false);
    await saveOnboarding({ completed: true });
    toast.success("¡Onboarding completado!");
  }, []);

  const nextStep = useCallback(async () => {
    if (currentStep < STEPS.length - 1 && onboardingData) {
      setCurrentStep(currentStep + 1);
      await saveOnboarding({ steps: { ...(onboardingData.steps ?? {}), last: currentStep + 1 } });
    }
  }, [currentStep, onboardingData]);

  const prevStep = useCallback(() => {
    setCurrentStep(currentStep => Math.max(0, currentStep - 1));
  }, []);

  const skipOnboarding = useCallback(async () => {
    setIsOpen(false);
    await saveOnboarding({ skipped: true, skippedAt: new Date().toISOString() });
    toast.message("Onboarding pospuesto", {
      description: "Puedes retomar la guía más tarde desde la sección de Ajustes.",
    });
  }, []);

  return (
    <AppearanceProvider>
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-gray-900 p-6 shadow-xl">
              <h2 className="text-2xl font-bold text-white">Guía de StarSeed</h2>
              <p className="text-gray-400">Paso {currentStep + 1} de {STEPS.length}</p>

              {isLoading && (
                <div className="my-4 text-center">
                  <div className="inline-block h-8 w-8 text-gray-500">Cargando...</div>
                </div>
              )}

              {/* Contenido del paso */}
              <div className="my-4">
                {(() => {
                  const Comp = STEPS[currentStep]?.component;
                  return Comp ? <Comp /> : null;
                })()}
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  onClick={prevStep}
                  disabled={currentStep === 0}
                  className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50"
                >
                  Anterior
                </button>

                <button
                  onClick={nextStep}
                  disabled={isLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50"
                >
                  Siguiente
                </button>

                <button
                  onClick={skipOnboarding}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500"
                >
                  Saltar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppearanceProvider>
  );
}

// Definición de pasos y sus componentes
const STEPS = [
  { key: "welcome", label: "Bienvenida", component: WelcomeStep },
  { key: "profile", label: "Perfil", component: ProfileStep },
  { key: "recovery", label: "Recuperación", component: RecoveryStep },
  { key: "preferences", label: "Preferencias", component: PreferencesStep },
  { key: "neurons", label: "Neuronas", component: NeuronsStep },
  { key: "setup", label: "Configuración", component: SetupStep },
];

// Ejemplo de componentes de paso
function WelcomeStep() {
  return <div>Bienvenida al onboarding</div>;
}

function ProfileStep() {
  return <div>Configuración de perfil</div>;
}

function RecoveryStep() {
  return <div>Configuración de recuperación</div>;
}

function PreferencesStep() {
  return <div>Preferencias</div>;
}

function NeuronsStep() {
  return <div>Configuración de neuronas</div>;
}

function SetupStep() {
  return <div>Configuración final</div>;
}