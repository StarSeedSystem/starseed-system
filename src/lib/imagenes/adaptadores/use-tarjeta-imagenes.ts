"use client";

/**
 * Tarjeta de opciones de imagen · HOOK (IMG1011C, parte 2). Contrato: architecture/astraura-imagenes.md §4 y §6.
 *
 * Planifica las opciones con el núcleo puro (`planImagen`) y ejecuta SOLO la que la persona elige
 * (o nuevas semillas al variar) con el motor de media-gen. No duplica generación: la regla de oro
 * —Pollinations como suelo gratis y el proveedor «neuronas» repartiendo por capas— sigue viviendo
 * en `src/ai/astraura/media/media-gen.ts`.
 *
 * Honestidad («basta de ilusiones»): si una acción necesita un archivo y la opción todavía no lo
 * tiene, se dice con claridad; nunca se llama a la Biblioteca, a la Protomolécula ni al taller 3D
 * con una URL inventada.
 */
import { useState, useCallback, useMemo, useRef } from "react";
import { planImagen, type PeticionImagen, type OpcionImagen, type NeuronaImg } from "../plan";
import { MODELOS_IMAGEN, type ModeloImagen } from "../modelos";
import { generateImage, type MediaProviderId } from "@/ai/astraura/media/media-gen";
import { abrirEnProtomolecula } from "@/lib/protomolecula/editor";
import { guardarEnBiblioteca as guardarEnBibliotecaFn } from "@/lib/library";
import { usarComoReferencia3D as usarComoReferencia3DFn } from "@/lib/avatares/referencia3d";
import { borradorPublicacion as borradorPublicacionFn } from "@/lib/publicacion/borrador";
import { useMallaNeuronasEstado } from "@/lib/network/malla-neuronas";

export type PeticionConPrompt = PeticionImagen & { prompt?: string };
export type OpcionTarjetaImagen = OpcionImagen & { prompt?: string; url?: string; elegida?: boolean };

/** Qué proveedor de media-gen ejecuta una opción del plan. Puro. */
export function proveedorParaOpcion(opcion: Pick<OpcionImagen, "capa" | "motor">): MediaProviderId {
  if (opcion.capa === "web-gratis" || opcion.motor === "pollinations") return "pollinations";
  if (opcion.motor === "comfyui") return "comfyui";
  return "neuronas";
}

/** Título legible de una opción para la Biblioteca. Puro. */
export function tituloDeOpcion(opcion: Pick<OpcionTarjetaImagen, "prompt" | "modelo">): string {
  const modelo = opcion.modelo?.nombre ?? "Astraura";
  const texto = (opcion.prompt ?? "").trim().slice(0, 60);
  return texto ? `${modelo} · ${texto}` : `Imagen generada con ${modelo}`;
}

/** ¿Son la misma casilla de la rejilla? (semilla, modelo y capa, sin depender de la identidad del objeto). */
function mismoDestino(a: OpcionTarjetaImagen, b: OpcionTarjetaImagen): boolean {
  return a.semilla === b.semilla && (a.modelo?.id ?? "") === (b.modelo?.id ?? "") && a.capa === b.capa;
}

function mensajeDeError(error: unknown, porDefecto: string): string {
  return error instanceof Error && error.message ? error.message : porDefecto;
}

export function useTarjetaImagenes() {
  const [opciones, setOpciones] = useState<OpcionTarjetaImagen[]>([]);
  const [descartes, setDescartes] = useState<string[]>([]);
  const [cargando, setCargando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const peticionRef = useRef<PeticionConPrompt | null>(null);
  const { misDispositivos } = useMallaNeuronasEstado();

  const neuronas: NeuronaImg[] = useMemo(() => {
    return misDispositivos.map(d => ({
      id: d.neuronId,
      capa: d.esEsteDispositivo ? "dispositivo" : "neurona",
      gpu: "ninguna",
      vramGB: null,
      ramLibreGB: 8,
      motores: ["sdcpp", "onnx-web"],
      instalados: (d as { instalados?: readonly string[] }).instalados ?? [],
      ocupada: false,
      medidas: {}
    }));
  }, [misDispositivos]);

  const catalogo: readonly ModeloImagen[] = MODELOS_IMAGEN;

  const generarOpciones = useCallback(async (peticion: PeticionConPrompt) => {
    setCargando(true);
    setError(null);
    peticionRef.current = peticion;
    try {
      const resultado = await planImagen(peticion, neuronas, Date.now(), catalogo);
      setDescartes(resultado.descartes);
      const planificadas: OpcionTarjetaImagen[] = resultado.opciones.map(opcion => ({
        ...opcion,
        prompt: peticion.prompt,
        elegida: false
      }));
      setOpciones(planificadas);
      return planificadas;
    } catch (err) {
      setError(mensajeDeError(err, "No se pudieron planificar las opciones de imagen."));
      console.error(err);
      return [];
    } finally {
      setCargando(false);
    }
  }, [neuronas, catalogo]);

  const promptDe = useCallback((opcion: OpcionTarjetaImagen): string => {
    return (opcion.prompt ?? peticionRef.current?.prompt ?? "").trim();
  }, []);

  /** Ejecuta UNA opción con su motor real (media-gen decide el suelo gratis y el reparto por capas). */
  const generarUna = useCallback(async (opcion: OpcionTarjetaImagen, semilla: number): Promise<string> => {
    const prompt = promptDe(opcion);
    if (!prompt) throw new Error("Describe qué imagen quieres generar antes de usar esta opción.");
    const resultado = await generateImage({
      prompt,
      seed: semilla,
      provider: proveedorParaOpcion(opcion),
      ...(opcion.modelo?.id ? { model: opcion.modelo.id } : {})
    });
    if (!resultado.ok || !resultado.url) {
      throw new Error(resultado.error ?? "El motor no devolvió ninguna imagen.");
    }
    return resultado.url;
  }, [promptDe]);

  const elegirOpcion = useCallback(async (opcion: OpcionTarjetaImagen): Promise<string | null> => {
    setCargando(true);
    setError(null);
    try {
      const url = await generarUna(opcion, opcion.semilla);
      setOpciones(prev => prev.some(o => mismoDestino(o, opcion))
        ? prev.map(o => mismoDestino(o, opcion) ? { ...o, url, elegida: true, prompt: promptDe(o) } : { ...o, elegida: false })
        : [...prev, { ...opcion, url, elegida: true, prompt: promptDe(opcion) }]);
      return url;
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo generar la imagen elegida."));
      console.error(err);
      return null;
    } finally {
      setCargando(false);
    }
  }, [generarUna, promptDe]);

  /** Más semillas del MISMO modelo: genera de verdad, no solo propone otra ficha. */
  const variarOpcion = useCallback(async (opcion: OpcionTarjetaImagen, cuantas = 2): Promise<OpcionTarjetaImagen[]> => {
    if (!promptDe(opcion)) {
      setError("Describe qué imagen quieres generar antes de variar.");
      return [];
    }
    const total = Math.max(1, Math.min(4, Math.floor(cuantas) || 2));
    setCargando(true);
    setError(null);
    try {
      const semillas = Array.from({ length: total }, (_, i) => opcion.semilla + i + 1);
      const intentos = await Promise.allSettled(semillas.map(semilla => generarUna(opcion, semilla)));
      const nuevas: OpcionTarjetaImagen[] = [];
      intentos.forEach((intento, i) => {
        if (intento.status === "fulfilled" && intento.value) {
          nuevas.push({ ...opcion, semilla: semillas[i], url: intento.value, elegida: false, prompt: promptDe(opcion) });
        }
      });
      if (!nuevas.length) throw new Error("El motor no devolvió ninguna variación.");
      setOpciones(prev => [...prev, ...nuevas]);
      return nuevas;
    } catch (err) {
      setError(mensajeDeError(err, "No se pudieron generar variaciones."));
      console.error(err);
      return [];
    } finally {
      setCargando(false);
    }
  }, [generarUna, promptDe]);

  /** Ampliar solo tiene sentido si la opción ya tiene archivo; la tarjeta abre su diálogo. */
  const ampliar = useCallback(async (opcion: OpcionTarjetaImagen): Promise<string | null> => {
    if (!opcion.url) {
      setError("Esta opción todavía no tiene una imagen que ampliar.");
      return null;
    }
    setError(null);
    return opcion.url;
  }, []);

  /** Usar como referencia para 3D: el taller recibe SIEMPRE el archivo real, nunca un modelo. */
  const usarComoReferencia3D = useCallback(async (opcion: OpcionTarjetaImagen): Promise<void> => {
    if (!opcion.url) {
      setError("Elige o genera la imagen antes de usarla como referencia para 3D.");
      return;
    }
    setError(null);
    try {
      await usarComoReferencia3DFn(opcion.url);
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo abrir el taller 3D con esta referencia."));
      console.error(err);
    }
  }, []);

  const guardarEnBiblioteca = useCallback(async (opcion: OpcionTarjetaImagen) => {
    if (!opcion.url) {
      setError("Elige o genera la imagen antes de guardarla en la Biblioteca.");
      return null;
    }
    setError(null);
    try {
      return await guardarEnBibliotecaFn({
        kind: "image",
        title: tituloDeOpcion(opcion),
        url: opcion.url,
        origin: opcion.modelo?.nombre ?? "Astraura"
      });
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo guardar en la Biblioteca."));
      console.error(err);
      return null;
    }
  }, []);

  const borradorPublicacion = useCallback(async (opcion?: OpcionTarjetaImagen): Promise<void> => {
    if (opcion && !opcion.url) {
      setError("Elige o genera la imagen antes de preparar el borrador de publicación.");
      return;
    }
    setError(null);
    try {
      await borradorPublicacionFn();
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo preparar el borrador de publicación."));
      console.error(err);
    }
  }, []);

  return {
    opciones,
    descartes,
    cargando,
    error,
    generarOpciones,
    elegirOpcion,
    variarOpcion,
    ampliar,
    abrirEnProtomolecula,
    usarComoReferencia3D,
    guardarEnBiblioteca,
    borradorPublicacion
  };
}