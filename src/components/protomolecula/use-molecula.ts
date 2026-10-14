"use client";

import { useEffect, useRef, useState } from "react";
import type { Ambito, Autor, Molecula, Rol } from "@/lib/protomolecula/tipos";
import { 
  crearMolecula, 
  listarMoleculas, 
  cargarMolecula, 
  guardarMolecula,
  registrarControlador
} from "@/lib/protomolecula/almacen-moleculas";
import { crearControlador } from "@/lib/protomolecula/controlador";

export function useMolecula(opts?: { moleculaId?: string; ambito?: Ambito }) {
  const [controlador, setControlador] = useState<any>(null);
  const [estado, setEstado] = useState<any>(null);
  const [autor, setAutor] = useState<Autor>({ tipo: "persona", id: "local", nombre: "Yo" });
  const [rol, setRol] = useState<Rol>("dueno");
  
  // Efecto para inicializar la molécula y el controlador
  useEffect(() => {
    async function inicializar() {
      let molecula: Molecula | null = null;
      
      // Si se proporciona un ID de molécula, intentar cargarla
      if (opts?.moleculaId) {
        molecula = await cargarMolecula(opts.moleculaId);
      }
      
      // Si no se proporcionó ID o no se encontró la molécula, intentar cargar la más reciente
      if (!molecula) {
        const moleculas = await listarMoleculas();
        if (moleculas.length > 0) {
          // Ordenar por actualizadaEn descendente y tomar la primera
          const masReciente = [...moleculas].sort((a, b) => b.actualizadaEn - a.actualizadaEn)[0];
          molecula = await cargarMolecula(masReciente.id);
        }
      }
      
      // Si aún no hay molécula, crear una nueva
      if (!molecula) {
        molecula = await crearMolecula({
          titulo: "Mi primera molécula",
          ambito: opts?.ambito ?? "personal",
          capas: [],
          atomos: [],
          valores: {},
          version: 1,
          creadaEn: Date.now(),
          actualizadaEn: Date.now()
        });
        await guardarMolecula(molecula);
      }
      
      // Crear el controlador con rol de dueño
      const controladorNuevo = crearControlador({
        molecula,
        rol: "dueno",
        autor: autor,
        ahora: Date.now()
      });
      
      // Suscribirse a los cambios del controlador
      const suscripcion = controladorNuevo.suscribir((estadoNuevo) => {
        setEstado(estadoNuevo);
      });
      
      // Registrar el controlador
      registrarControlador(molecula.id, controladorNuevo);
      
      setControlador(controladorNuevo);
      
      // Devolver la suscripción para limpiar al desmontar
      return () => {
        suscripcion();
        // TODO: Desregistro del controlador (necesario implementar en almacen-moleculas)
      };
    }
    
    inicializar();
  }, [opts, autor]);
  
  // Auto-guardado con debounce de 400ms
  useEffect(() => {
    if (!controlador || !estado) return;
    
    const handler = setTimeout(async () => {
      const moleculaActual = controlador.obtener();
      await guardarMolecula(moleculaActual);
    }, 400);
    
    return () => clearTimeout(handler);
  }, [controlador, estado]);
  
  return { controlador, estado, autor, rol };
}