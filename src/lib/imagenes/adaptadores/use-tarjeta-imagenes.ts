import { useState, useCallback } from "react";
import { planImagen, type PeticionImagen, type OpcionImagen } from "../plan";
import { generarImagen } from "@/lib/integrations/aurora-tools"; // Asumiendo que esta herramienta existe
import { guardarEnBiblioteca } from "/home/starseed/starseed-wt/IMG1011C/src/lib/library"; // Asumiendo que esta función existe
import { usarComoReferencia3D } from "@/lib/avatares/referencia3d"; // Asumiendo que esta función existe
import { abrirEnProtomolecula } from "@/lib/protomolecula/editor"; // Asumiendo que esta función existe

export function useTarjetaImagenes() {
  const [opciones, setOpciones] = useState<OpcionImagen[]>([]);
  const [cargando, setCargando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const generarOpciones = useCallback(async (
    peticion: PeticionImagen
  ) => {
    setCargando(true);
    setError(null);
    try {
      const resultado = await planImagen(peticion);
      setOpciones(resultado.opciones);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      console.error(err);
    } finally {
      setCargando(false);
    }
  }, []);

  const elegirOpcion = useCallback(async (opcion: OpcionImagen) => {
    // Implementar lógica para elegir una opción
    // Esto podría involucrar generar la imagen con la opción seleccionada
    try {
      setCargando(true);
      const resultado = await generarImagen({
        prompt: opcion.prompt ?? "", // Necesitamos obtener el prompt de somewhere
        modelo: opcion.modelo?.id,
        semilla: opcion.semilla,
        // Otros parámetros necesarios
      });
      
      if (resultado.ok && resultado.url) {
        // Guardar en biblioteca o hacer algo con la imagen
        await guardarBiblioteca({
          kind: "image",
          title: `Imagen generada con ${opcion.modelo?.label}`,
          url: resultado.url,
          origen: opcion.modelo?.label ?? "Desconocido"
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar imagen");
      console.error(err);
    } finally {
      setCargando(false);
    }
  }, []);

  const variarOpcion = useCallback(async (opcion: OpcionImagen) => {
    // Implementar lógica para variar (más semillas del mismo modelo)
    try {
      setCargando(true);
      // Aquí generaríamos más opciones con el mismo modelo pero diferentes semillas
      const peticion: PeticionImagen = {
        // Necesitamos reconstruir la petición original con el mismo modelo
        // pero solicitando más opciones
        opciones: 4, // Por ejemplo, 4 variaciones
        prioridad: "calidad", // O lo que fuera
        comercial: false, // Necesitamos obtener esto de la petición original
        necesita: ["texto-a-imagen"], // Asumiendo por defecto
        conReferencia: false,
        permisoRemoto: false,
        permitirDePago: false
      };
      
      const resultado = await planImagen(peticion);
      setOpciones(resultado.opciones);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al variar");
      console.error(err);
    } finally {
      setCargando(false);
    }
  }, []);

    const manejarAbrirEnProtomolecula = useCallback(async (opcion: OpcionImagen) => {
    // Abrir la imagen en el lienzo de la Protomolécula
    try {
      if (opcion.url) {
        await abrirEnProtomolecula(opcion.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al abrir en Protomolécula");
      console.error(err);
    }
  }, []);

  const ampliar = useCallback(async (opcion: OpcionImagen) => {
    // Implementar lógica para ampliar la imagen
    // Esto podría envolver usar un modelo de upscaling o simplemente mostrarla a tamaño completo
    try {
      // Por ahora, simplemente estableceríamos alguna estado para mostrarla ampliada
      // En una implementación real, esto podría involucrar llamar a un servicio de upscaling
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al ampliar");
      console.error(err);
    }
  }, []);

    const manejarUsarComoReferencia3D = useCallback(async (opcion: OpcionImagen) => {
    // Usar la imagen como referencia para 3D
    try {
      if (opcion.url) {
        await usarComoReferencia3D(opcion.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al usar como referencia 3D");
      console.error(err);
    }
  }, []);

    const guardarEnBibliotecaUseCallback = useCallback(async (opcion: OpcionImagen) => {
    // Guardar en la Biblioteca
    try {
      if (opcion.url) {
        await guardarEnBiblioteca({
          kind: "image",
          title: `Imagen: ${opcion.prompt?.slice(0, 50) ?? "Sin título"}`,
          url: opcion.url,
          origen: opcion.modelo?.label ?? "Desconocido"
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar en biblioteca");
      console.error(err);
    }
  }, []);

  const borradorPublicacion = useCallback(async (opcion: OpcionImagen) => {
    // Pasar a borrador de publicación
    try {
      if (opcion.url) {
        // Implementar lógica para crear borrador de publicación
        // Esto probablemente involucraría algún servicio de publicaciones
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear borrador de publicación");
      console.error(err);
    }
  }, []);

  return {
    opciones,
    cargando,
    error,
    generarOpciones,
    elegirOpcion,
    variarOpcion,
    abrirEnProtomolecula: manejarAbrirEnProtomolecula,
    ampliar,
    usarComoReferencia3D: manejarUsarComoReferencia3D,
    guardarEnBiblioteca: guardarEnBibliotecaUseCallback,
    borradorPublicacion
  };
}