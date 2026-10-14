"use client";

import { useEffect, useRef, useState } from "react";
import type { Ambito as AmbitoCore, Autor, Molecula as MoleculaCore, Rol } from "@/lib/protomolecula/tipos";
import type { Controlador } from "@/lib/protomolecula/controlador";
import type { 
  Ambito as AmbitoSimple,
  Molecula as MoleculaSimple,
} from "@/lib/protomolecula/molecula-estado-tipos";
import { 
  almacenNavegador,
  guardarMolecula,
  cargarMolecula,
  listarMoleculas
} from "@/lib/protomolecula/almacen-moleculas";
import { crearMolecula } from "@/lib/protomolecula/molecula-estado";
import { registrarControlador } from "@/lib/protomolecula/controlador-activo";
import { crearControlador } from "@/lib/protomolecula/controlador";

// Tipo para los valores de parámetros (número, boolean o string)
type ValorParametro = number | boolean | string;

// Conversión de molécula simple a núcleo
function convertirMoleculaSimpleACore(simple: MoleculaSimple): MoleculaCore {
  // Conversión de ambito: simple ambito es "personal" | "publico" | "privado" | "grupo"
  // núcleo ambito es "personal" | "perfil" | "grupo" | "publica"
  const ambitoMap: Record<AmbitoSimple, AmbitoCore> = {
    personal: "personal",
    publico: "publica",
    privado: "perfil",
    grupo: "grupo",
  };
  
  // Conversión de capas: simple capas no tiene toda la información, usamos valores por defecto
  // Nota: En una implementación real, estas capas vendrían del almacenamiento y deberían tener la información completa.
  // Pero como el almacenamiento simple no la tiene, tenemos que inventar valores razonables.
  // Como no tenemos información, dejamos las capas vacías y las llenamos cuando se añaden.
  // Sin embargo, la molécula simple tiene capas con id y nombre, pero sin tipo, formato, etc.
  // No podemos convertir de forma seguro, así que asumimos que las capas simples no se usan en el núcleo.
  // En su lugar, dejamos las capas vacías en el núcleo y permitimos que se añadan a través del controlador.
  // Esta es una limitación del almacenamiento simple.
  const capasCore: MoleculaCore["capas"] = [];
  
  // Conversión de atomos: similar a las capas, no tenemos la información completa.
  // Dejamos los atomos vacíos y permitimos que se añadan a través del controlador.
  const atomosCore: MoleculaCore["atomos"] = [];
  
  // Conversión de valores: simple valores es Record<string, number | string>
  // núcleo valores es Record<string, ValorParametro> (number | boolean | string)
  // Como number | string es subconjunto de number | boolean | string, podemos usar directamente
  const valoresCore: MoleculaCore["valores"] = simple.valores as unknown as MoleculaCore["valores"];
  
  return {
    id: simple.id,
    titulo: simple.titulo,
    ambito: ambitoMap[simple.ambito],
    capas: capasCore,
    atomos: atomosCore,
    valores: valoresCore,
    version: simple.version,
    creadaEn: simple.creadaEn,
    actualizadaEn: simple.actualizadaEn,
  };
}

// Conversión de núcleo a simple para guardar
function convertirMoleculaACoreASimple(core: MoleculaCore): MoleculaSimple {
  return {
    id: core.id,
    titulo: core.titulo,
    ambito: core.ambito === "personal" ? "personal" :
          core.ambito === "perfil" ? "privado" :
          core.ambito === "grupo" ? "grupo" :
          core.ambito === "publica" ? "publico" : "personal", // fallback
    capas: core.capas.map(capa => ({
      id: capa.id,
      nombre: capa.titulo,
      orden: capa.orden,
    })),
    atomos: core.atomos.map(atomo => ({
      id: atomo.id,
      capaId: atomo.capaId ?? "",
      tipo: atomo.herramientaId,
      estado: atomo.estado === "suspendido" ? "suspendido" : undefined,
    })),
    valores: core.valores as unknown as Record<string, number | string>,
    version: core.version,
    creadaEn: core.creadaEn,
    actualizadaEn: core.actualizadaEn,
  };
}

export function useMolecula(opts?: { moleculaId?: string; ambito?: AmbitoCore }) {
  const [controlador, setControlador] = useState<Controlador | null>(null);
  const [estado, setEstado] = useState<ReturnType<Controlador['obtener']> | null>(null);
  const [autor, setAutor] = useState<Autor>({ tipo: "persona", id: "local", nombre: "Yo" });
  const [rol, setRol] = useState<Rol>("dueno");
  
  // Almacenamiento del navegador
  const almacen = almacenNavegador();
   
  // Efecto para inicializar la molécula y el controlador
  useEffect(() => {
    async function inicializar() {
      let moleculaSimple: MoleculaSimple | null = null;
      let moleculaCore: MoleculaCore | null = null;
      
      // Si se proporciona un ID de molécula, intentar cargarla
      if (opts?.moleculaId && almacen) {
        moleculaSimple = await cargarMolecula(almacen, opts.moleculaId);
      }
      
      // Si no se proporcionó ID o no se encontró la molécula, intentar cargar la más reciente
      if (!moleculaSimple && almacen) {
        const moleculas = await listarMoleculas(almacen);
        if (moleculas.length > 0) {
          // Ordenar por actualizadaEn descendente y tomar la primera
          const masReciente = [...moleculas].sort((a, b) => b.actualizadaEn - a.actualizadaEn)[0];
          moleculaSimple = await cargarMolecula(almacen, masReciente.id);
        }
      }
      
      // Si aún no hay molécula, crear una nueva
      if (!moleculaSimple) {
        const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const ambitoSimple = opts?.ambito === "personal" ? "personal" :
                              opts?.ambito === "perfil" ? "privado" :
                              opts?.ambito === "grupo" ? "grupo" :
                              opts?.ambito === "publica" ? "publico" : "personal";
        moleculaSimple = crearMolecula({
          id,
          titulo: "Mi primera molécula",
          ambito: ambitoSimple,
        }, Date.now());
        if (almacen) {
          await guardarMolecula(almacen, moleculaSimple);
        }
      }
      
      // Convertir a molécula de núcleo
      moleculaCore = convertirMoleculaSimpleACore(moleculaSimple);
      
      // Crear el controlador con rol de dueño
      const controladorNuevo = crearControlador({
        molecula: moleculaCore,
        rol: "dueno",
        sesion: undefined,
        ahora: Date.now,
        nuevoId: () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
      });
      
      // Suscribirse a los cambios del controlador
      const suscripcion = controladorNuevo.suscribir((estadoNuevo) => {
        setEstado(estadoNuevo);
      });
      
      // Registrar el controlador
      if (almacen) {
        registrarControlador(moleculaCore.id, controladorNuevo);
      }
      
      setControlador(controladorNuevo);
      
      // Devolver la suscripción para limpiar al desmontar
      return () => {
        suscripcion();
        // TODO: Desregistro del controlador (necesario implementar en almacen-moleculas)
      };
    }
    
    inicializar();
  }, [opts, autor, almacen]);
   
  // Auto-guardado con debounce de 400ms
  useEffect(() => {
    if (!controlador || !estado || !almacen) return;
    
    const handler = setTimeout(async () => {
      const moleculaCore = controlador.obtener().molecula;
      // Convertir de núcleo a simple para guardar
      const moleculaSimple = convertirMoleculaACoreASimple(moleculaCore);
      await guardarMolecula(almacen, moleculaSimple);
    }, 400);
    
    return () => clearTimeout(handler);
  }, [controlador, estado, almacen]);
   
  return { controlador, estado, autor, rol };
}