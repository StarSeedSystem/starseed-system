"use client";
import { useCallback, useState, useRef } from "react";
import type { AdnAvatar } from "@/lib/avatares/adn/adn";
import {
  planOptimizacion,
  siguienteIntento,
  resolucionPara,
  Destino3D,
  Hierro,
  capacidadesDe,
} from "@/lib/avatares/adn/optimizacion";
import {
  planificar,
  PeticionPlan,
  PasoPlan,
} from "@/lib/avatares/adn/canalizacion";
import { MOTORES_3D } from "@/lib/avatares/adn/motores";
import { saveAdnToLibrary } from "@/lib/avatares/adaptadores/almacen-adn";
import { v4 as uuidv4 } from "uuid";

export function useGenerar3d(
  destino: Destino3D,
  hierroOpcional?: Hierro,
  onSuccess?: (adn: AdnAvatar) => void,
  onError?: (error: string) => void
) {
  const [estado, setEstado] = useState({
    idle: true,
    cargandoImagen: false,
    planificando: false,
    generando: false,
    progreso: 0,
    mensaje: "",
    error: null,
    adn: null,
    plan: null,
    hierro: hierroOpcional ?? {
      gpu: "ninguna",
      ramGB: navigator.deviceMemory ?? 8,
      vramGB: null,
      blender: false,
      permiteEspacioHf: false,
      claveExterna: false,
    },
    capacidades: [] as string[],
    permisoEspacioHf: false,
  });
  const imagenRef = useRef<File | null>(null);
  const intentoRef = useRef<number>(0);
  const planOptRef = useRef<ReturnType<typeof planOptimizacion> | null>(null);

  const getHierroActual = useCallback(() => hierroOpcional ?? {
    gpu: "ninguna",
    ramGB: navigator.deviceMemory ?? 8,
    vramGB: null,
    blender: false,
    permiteEspacioHf: false,
    claveExtera: false,
  }, [hierroOpcional]);

  const reiniciarEstado = useCallback(() => {
    const hierro = getHierroActual();
    setEstado(s => ({
      ...s,
      idle: true,
      cargandoImagen: false,
      planificando: false,
      generando: false,
      progreso: 0,
      mensaje: "",
      error: null,
      adn: null,
      plan: null,
      hierro,
      capacidades: capacidadesDe(hierro),
      permisoEspacioHf: false,
    }));
    imagenRef.current = null;
    intentoRef.current = 0;
    planOptRef.current = null;
  }, [getHierroActual]);

  const iniciarGeneracion = useCallback(async (imagen: File) => {
    setEstado(s => ({ ...s, idle: false, cargandoImagen: true, mensaje: "Preparando imagen..." }));
    imagenRef.current = imagen;
    intentoRef.current = 0;
    try {
      if (!imagen.type.startsWith("image/")) throw new Error("No es una imagen");
      if (imagen.size > 8 * 1024 * 1024) throw new Error("Imagen demasiado grande (>8 MB)");

      const hierro = getHierroActual();
      const capacidades = capacidadesDe(hierro);
      setEstado(s => ({ ...s, cargandoImagen: false, planificando: true, mensaje: "Planificando generación...", hierro, capacidades }));

      const peticion: PeticionPlan = {
        partida: "imagen",
        esqueleto: "ninguno",
        capacidades,
        region: null,
        comercial: false,
        permitirDePago: false,
        detallar: false,
        prioridad: "calidad",
      };

      const planOpt = planOptimizacion(destino, hierro.vramGB);
      planOptRef.current = planOpt;
      peticion.prioridad = planOpt.prioridad;

      const planAvatar = planificar(peticion, MOTORES_3D);
      setEstado(s => ({ ...s, planificando: false, generando: true, progreso: 10, mensaje: "Iniciando generación...", plan: planAvatar.pasos }));

      await simularGeneracionEtapas(planAvatar, imagen, hierro);

      const adnGenerado: AdnAvatar = {
        id: uuidv4(),
        base: { ref: `biblioteca:${uuidv4()}`, tipo: "malla" },
        esqueleto: "ninguno",
        morfologia: {},
        materiales: {},
        piezas: {},
        expresiones: {},
        aura: { tipo: "ninguna", intensidad: 0 },
        carácter: { tipo: "quieto", intensidad: 0 },
        visibilidad: "privado",
        procedencia: [],
        rev: 0,
      };

      setEstado(s => ({ ...s, generando: false, progreso: 100, mensaje: "Generación completada", adn: adnGenerado }));
      await saveAdnToLibrary(adnGenerado, "privado");
      if (onSuccess) onSuccess(adnGenerado);
    } catch (err: any) {
      setEstado(s => ({ ...s, idle: true, cargandoImagen: false, planificando: false, generando: false, progreso: 0, mensaje: "", error: err.message || "Error desconocido" }));
      if (onError) onError(err.message || "Error desconocido");
    }
  }, [destino, getHierroActual, capacidadesDe, planOptimizacion, planificar, MOTORES_3D, saveAdnToLibrary, onSuccess, onError]);

  const simularGeneracionEtapas = useCallback(async (planAvatar: ReturnType<typeof planificar>, imagen: File, hierro: Hierro) => {
    const pasos = planAvatar.pasos;
    for (let i = 0; i < pasos.length; i++) {
      const paso = pasos[i];
      setEstado(s => ({ ...s, mensaje: `Etapa ${paso.etapa}: ${paso.motor?.nombre || "Sin motor"}`, progreso: Math.round(10 + (i / pasos.length) * 80) }));
      await new Promise(r => setTimeout(r, 600));
      if (Math.random() < 0.1 && intentoRef.current < 2) {
        intentoRef.current++;
        throw new Error("sin-memoria");
      }
    }
    setEstado(s => ({ ...s, progreso: 100, mensaje: "Finalizando..." }));
  }, []);

  return { estado, iniciarGeneracion, reiniciarEstado };
}