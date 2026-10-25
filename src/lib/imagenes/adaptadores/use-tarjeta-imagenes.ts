/**
 * Adaptador de tarjeta de imágenes (IMG1011): tarjeta UI reactiva para generar y editar imágenes usando tarjetas.
 * 
 * Hook que gestiona el estado de las tarjetas de imágenes y coordina la generación de imágenes,
 * selección de tarjetas, y ejecución de acciones relacionadas (guardado en biblioteca, uso como referencia 3D,
 * edición en protomolécula). Funciona con los adaptadores planImagen, generarImagen, guardarEnBiblioteca,
 * usarComoReferencia3D y abrirEnProtomolecula.
 */
import { useReducer, useCallback } from "react";
import type { PeticionImagen } from "@/lib/imagenes/plan";
import { planImagen } from "@/lib/imagenes/adaptadores/plan-imagen";
import { generarImagen } from "@/lib/imagenes/adaptadores/generar-imagen";
import { guardarEnBiblioteca } from "@/lib/imagenes/adaptadores/guardar-biblioteca";
import { usarComoReferencia3D as usarComoReferencia3DFunc } from "@/lib/imagenes/adaptadores/usar-como-referencia-3d";
import { abrirEnProtomoleculaEditor as abrirEnProtomoleculaFunc } from "@/lib/imagenes/adaptadores/abrir-protomolecula";
import type { OpcionImagen } from "@/lib/imagenes/plan";

/** Estado del adaptador de tarjeta de imágenes */
export interface EstadoTarjetaImagenes {
  opciones: OpcionImagen[];
  cargando: boolean;
  error: string | null;
  generadas: Array<{ url: string; id: number; opcion: OpcionImagen }>;
}

/** Acciones para el reducer */
export type AccionTarjetaImagenes = 
  | { tipo: 'SET_OPCIONES'; payload: OpcionImagen[] }
  | { tipo: 'SET_CARGANDO'; payload: boolean }
  | { tipo: 'SET_ERROR'; payload: string | null }
  | { tipo: 'AGREGAR_GENERADA'; payload: { url: string; id: number; opcion: OpcionImagen } }
  | { tipo: 'RESET' };

/** Reducer para gestionar el estado */
function reducerEstadoTarjetaImagenes(
  estado: EstadoTarjetaImagenes,
  accion: AccionTarjetaImagenes
): EstadoTarjetaImagenes {
  switch (accion.tipo) {
    case 'SET_OPCIONES':
      return { ...estado, opciones: accion.payload };
    case 'SET_CARGANDO':
      return { ...estado, cargando: accion.payload };
    case 'SET_ERROR':
      return { ...estado, error: accion.payload };
    case 'AGREGAR_GENERADA':
      return { ...estado, generadas: [...estado.generadas, accion.payload] };
    case 'RESET':
      return {
        opciones: [],
        cargando: false,
        error: null,
        generadas: [],
      };
    default:
      return estado;
  }
}

/** Funciones expuestas por el adaptador */
export interface FuncionesTarjetaImagenes {
  generarOpciones: (peticion: PeticionImagen) => Promise<void>;
  elegirOpcion: (opcion: OpcionImagen) => Promise<void>;
  usarComoReferencia3D: (opcion: OpcionImagen) => Promise<void>;
  abrirEnProtomolecula: (opcion: OpcionImagen) => Promise<void>;
  resetear: () => void;
}

/** Hook personalizado para gestionar tarjetas de imágenes */
export function useTarjetaImagenes(): EstadoTarjetaImagenes & FuncionesTarjetaImagenes {
  const [estado, dispatch] = useReducer(reducerEstadoTarjetaImagenes, {
    opciones: [],
    cargando: false,
    error: null,
    generadas: [],
  });

  const generarOpciones = useCallback(async (peticion: PeticionImagen) => {
    dispatch({ tipo: 'SET_CARGANDO', payload: true });
    dispatch({ tipo: 'SET_ERROR', payload: null });
    
    try {
      const { opciones, descartes } = await planImagen(peticion, [], 0);
      dispatch({ tipo: 'SET_OPCIONES', payload: opciones });
    } catch (err) {
      const mensajeError = err instanceof Error ? err.message : "Error al generar opciones";
      dispatch({ tipo: 'SET_ERROR', payload: mensajeError });
      dispatch({ tipo: 'SET_OPCIONES', payload: [] });
    } finally {
      dispatch({ tipo: 'SET_CARGANDO', payload: false });
    }
  }, []);

  const elegirOpcion = useCallback(async (opcion: OpcionImagen) => {
    dispatch({ tipo: 'SET_CARGANDO', payload: true });
    dispatch({ tipo: 'SET_ERROR', payload: null });
    
    try {
      const respuesta = await generarImagen({
        prompt: "Una imagen de prueba",
        modelo: "sd-turbo",
        semilla: opcion.semilla,
      });
      
      if (respuesta.ok) {
        const guardada = await guardarEnBiblioteca({
          url: respuesta.url || "",
          prompt: "Una imagen de prueba",
          modelo: "sd-turbo",
          semilla: opcion.semilla,
        });
        
        dispatch({ 
          tipo: 'AGREGAR_GENERADA', 
          payload: { url: respuesta.url || "", id: guardada.id, opcion } 
        });
      } else {
        dispatch({ tipo: 'SET_ERROR', payload: "Error al generar la imagen" });
      }
    } catch (err) {
      const mensajeError = err instanceof Error ? err.message : "Error al elegir opción";
      dispatch({ tipo: 'SET_ERROR', payload: mensajeError });
    } finally {
      dispatch({ tipo: 'SET_CARGANDO', payload: false });
    }
  }, []);

  const usarComoReferencia3D = useCallback(async (opcion: OpcionImagen) => {
    try {
      await usarComoReferencia3DFunc(opcion);
    } catch (err) {
      const mensajeError = err instanceof Error ? err.message : "Error al usar como referencia 3D";
      dispatch({ tipo: 'SET_ERROR', payload: mensajeError });
    }
  }, []);

  const abrirEnProtomolecula = useCallback(async (opcion: OpcionImagen) => {
    try {
      await abrirEnProtomoleculaFunc(opcion);
    } catch (err) {
      const mensajeError = err instanceof Error ? err.message : "Error al abrir en protomolecula";
      dispatch({ tipo: 'SET_ERROR', payload: mensajeError });
    }
  }, []);

  const resetear = useCallback(() => {
    dispatch({ tipo: 'RESET' });
  }, []);

  return {
    ...estado,
    generarOpciones,
    elegirOpcion,
    usarComoReferencia3D,
    abrirEnProtomolecula,
    resetear,
  };
}
