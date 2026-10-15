import { useCallback, useEffect, useState } from "react";
import type { Destino3D } from "@/lib/avatares/adn/optimizacion";
import { planOptimizacion, type PlanOptimizacion, capacidadesDe, siguienteIntento, type Hierro } from "@/lib/avatares/adn/optimizacion";
import { planificar, type PeticionPlan, type Etapa, type Motor3D, type Requisito3D } from "@/lib/avatares/adn/canalizacion";
import type { Esqueleto } from "@/lib/avatares/adn/adn";

function useHierro(): Hierro {
  return {
    gpu: "ninguna",
    ramGB: 8,
    vramGB: null,
    blender: false,
    permiteEspacioHf: false,
    claveExterna: false,
  };
}

export function useGenerar3D(
  destino: Destino3D,
  opciones: {
    esqueleto?: Esqueleto;
    hierro?: Hierro;
    onSuccess?: (glb: string, lods: number[], atribuciones: string[]) => void;
    onError?: (error: string) => void;
  } = {}
) {
  const { esqueleto: esqueletoParam, hierro: hierroParam, onSuccess, onError } = opciones;
  const hierro = hierroParam ?? useHierro();
  const [plan, setPlan] = useState<PlanOptimizacion | null>(null);
  const [pasos, setPasos] = useState<Array<{ etapa: Etapa; motor: Motor3D | null; saltada: boolean; motivo: string; descartes: string[] }>>([]);
  const [progreso, setProgreso] = useState<number>(0);
  const [estado, setEstado] = useState<"idle" | "generating" | "success" | "error">("idle");
  const [imagen, setImagen] = useState<File | null>(null);
  const [intentos, setIntentos] = useState<number>(0);

  const getEsqueleto = useCallback(() => {
    if (esqueletoParam) return esqueletoParam;
    switch (destino) {
      case "protomolecula":
      case "pieza":
        return "ninguno";
      case "avatar":
      case "bot":
        return "vrm-humanoide";
      default:
        return "ninguno";
    }
  }, [esqueletoParam, destino]);

  useEffect(() => {
    if (!imagen) {
      setPlan(null);
      setPasos([]);
      return;
    }
    const optimizacionPlan = planOptimizacion(destino, hierro.vramGB);
    setPlan(optimizacionPlan);
    const peticion: PeticionPlan = {
      partida: "imagen",
      esqueleto: getEsqueleto(),
      capacidades: capacidadesDe(hierro),
      region: null,
      comercial: false,
      permitirDePago: false,
      detallar: false,
      prioridad: optimizacionPlan.prioridad,
    };
    const planAvatar = planificar(peticion);
    setPasos(planAvatar.pasos);
  }, [imagen, destino, hierro, getEsqueleto, hierro.vramGB]);

  const generar = useCallback(() => {
    if (!imagen || !plan) return;
    setEstado("generating");
    setProgreso(0);
    setIntentos(0);
    simularGeneracion();
  }, [imagen, plan]);

  const simularGeneracion = useCallback(async () => {
    try {
      const etapas = ["generar", "remallar", "riggear", "detallar", "animar"] as const;
      for (let i = 0; i < etapas.length; i++) {
        const etapa = etapas[i];
        await new Promise(resolve => setTimeout(resolve, 80));
        setProgreso(((i + 1) / etapas.length) * 100);
        if (etapa === "generar" && intentos === 0 && hierro.vramGB === null && destino === "protomolecula") {
          throw new Error("sin-memoria");
        }
      }
      const mockGlb = "data:application/octet-stream;base64,AAAA";
      const mockLods = plan ? plan.lods : [1000];
      const atribuciones: string[] = [];
      if (plan) {
        atribuciones.push("Modelo 3D generado conimage-to-3dlab");
      }
      setEstado("success");
      onSuccess?.(mockGlb, mockLods, atribuciones);
    } catch (error: any) {
      if (error.message === "sin-memoria") {
        const siguiente = siguienteIntento(plan, "sin-memoria");
        if (siguiente) {
          setIntentos(prev => prev + 1);
          setPlan(siguiente);
          setTimeout(() => generar(), 500);
          return;
        }
      }
      setEstado("error");
      setProgreso(0);
      onError?.(error.message || "Error desconocido");
    }
  }, [generar, hierro.vramGB, destino, plan, imagen, onSuccess, onError, siguienteIntento]);

  return {
    imagen,
    setImagen,
    plan,
    pasos,
    progreso,
    estado,
    generar,
  };
}