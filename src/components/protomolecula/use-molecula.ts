"use client";

import { useEffect, useRef, useState } from "react";
import type { 
  Ambito, 
  Autor, 
  Molecula as NucleoMolecula, 
  Rol, 
  Capa as NucleoCapa, 
  AtomoEnUso as NucleoAtomoEnUso,
  ValorParametro,
  EstadoValores
} from "@/lib/protomolecula/tipos";
import type { 
  Molecula as LegacyMolecula, 
  Capa as LegacyCapa, 
  Atomo as LegacyAtomo,
  AtomoEnUso as LegacyAtomoEnUso,
  Operacion as LegacyOperacion
} from "@/lib/protomolecula/molecula-estado-tipos";
import { 
  listarMoleculas as legacyListarMoleculas, 
  cargarMolecula as legacyCargarMolecula, 
  guardarMolecula as legacyGuardarMolecula,
  registrarControlador as legacyRegistrarControlador
} from "@/lib/protomolecula/almacen-moleculas";
import { crearControlador } from "@/lib/protomolecula/controlador";

// Conversion functions
const toLegacyMolecula = (nucleo: NucleoMolecula): LegacyMolecula => ({
  id: nucleo.id,
  titulo: nucleo.titulo,
  ambito: nucleo.ambito === "personal" ? "personal" :
         nucleo.ambito === "perfil" ? "privado" : // Assuming perfil maps to privado
         nucleo.ambito === "grupo" ? "grupo" :
         "publico", // publica maps to publico
  capas: nucleo.capas.map(capa => ({
    id: capa.id,
    nombre: capa.titulo, // Assuming titulo maps to nombre
    orden: capa.orden
  })),
  atomos: nucleo.atomos.map(atomo => ({
    id: atomo.id,
    capaId: atomo.capaId ?? "",
    tipo: atomo.herramientaId, // Assuming herramientaId maps to tipo
    estado: atomo.estado
  })),
  valores: nucleo.valores,
  version: nucleo.version,
  creadaEn: nucleo.creadaEn,
  actualizadaEn: nucleo.actualizadaEn
});

const toNucleoMolecula = (legacy: LegacyMolecula): NucleoMolecula => ({
  id: legacy.id,
  titulo: legacy.titulo,
  ambito: legacy.ambito === "personal" ? "personal" :
         legacy.ambito === "privado" ? "perfil" : // Assuming privado maps to perfil
         legacy.ambito === "grupo" ? "grupo" :
         "publica", // publico maps to publica
  capas: legacy.capas.map(capa => ({
    id: capa.id,
    tipo: "datos", // Placeholder, we don't have the actual type from legacy
    titulo: capa.nombre,
    formato: "", // Placeholder
    referencia: null, // Placeholder
    orden: capa.orden ?? 0,
    visible: true, // Placeholder
    bloqueada: false // Placeholder
  })),
  atomos: legacy.atomos.map(atomo => ({
    id: atomo.id,
    herramientaId: atomo.tipo, // Assuming tipo maps to herramientaId
    capaId: atomo.capaId || undefined,
    titulo: undefined, // Placeholder
    ejecutaEn: undefined, // Placeholder
    estado: atomo.estado || "activo"
  })),
  valores: legacy.valores,
  version: legacy.version,
  creadaEn: legacy.creadaEn,
  actualizadaEn: legacy.actualizadaEn
});

export function useMolecula(opts?: { moleculaId?: string; ambito?: Ambito }) {
  const [controlador, setControlador] = useState<any>(null);
  const [estado, setEstado] = useState<any>(null);
  const [autor, setAutor] = useState<Autor>({ tipo: "persona", id: "local", nombre: "Yo" });
  const [rol, setRol] = useState<Rol>("dueno");
  
  // Efecto para inicializar la molécula y el controlador
  useEffect(() => {
    async function inicializar() {
      let nucleoMolecula: NucleoMolecula | null = null;
      
      // Si se proporciona un ID de molécula, intentar cargarla
      if (opts?.moleculaId) {
        const legacyMolecula = await legacyCargarMolecula(opts.moleculaId);
        if (legacyMolecula) {
          nucleoMolecula = toNucleoMolecula(legacyMolecula);
        }
      }
      
      // Si no se proporcionó ID o no se encontró la molécula, intentar cargar la más reciente
      if (!nucleoMolecula) {
        const legacyMoleculas = await legacyListarMoleculas();
        if (legacyMoleculas.length > 0) {
          // Ordenar por actualizadaEn descendente y tomar la primera
          const masReciente = [...legacyMoleculas].sort((a, b) => b.actualizadaEn - a.actualizadaEn)[0];
          nucleoMolecula = toNucleoMolecula(masReciente);
        }
      }
      
       // Si aún no hay molécula, crear una nueva
       if (!nucleoMolecula) {
         const nucleoMolecula: NucleoMolecula = {
           id: `${Date.now()}-${Math.random()}`, // Generate a unique id
           titulo: "Mi primera molécula",
           ambito: opts?.ambito ?? "personal",
           capas: [],
           atomos: [],
           valores: {},
           version: 1,
           creadaEn: Date.now(),
           actualizadaEn: Date.now()
         };
         const legacyMolecula = toLegacyMolecula(nucleoMolecula);
         await legacyGuardarMolecula(legacyMolecula);
       }
      
      // Crear el controlador con rol de dueño
      const controladorNuevo = crearControlador({
        molecula: nucleoMolecula,
        rol: "dueno",
        autor: autor,
        ahora: Date.now()
      });
      
      // Suscribirse a los cambios del controlador
      const suscripcion = controladorNuevo.suscribir((estadoNuevo) => {
        setEstado(estadoNuevo);
      });
      
      // Registrar el controlador
      await legacyRegistrarControlador(nucleoMolecula.id, controladorNuevo);
      
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
      const nucleoMoleculaActual = controlador.obtener();
      const legacyMolecula = toLegacyMolecula(nucleoMoleculaActual);
      await legacyGuardarMolecula(legacyMolecula);
    }, 400);
    
    return () => clearTimeout(handler);
  }, [controlador, estado]);
  
  return { controlador, estado, autor, rol };
}