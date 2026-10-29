"use client";
/**
 * Imágenes locales de Astraura · HOOK de la tarjeta de opciones (IMG1011C-parte 2). Contrato: architecture/astraura-imagenes.md §4–§6.
 *
 * Planifica las opciones (planImagen, sin modificación) y las sirve con prompt y, al generarse, con
 * su URL: cada acción es honesta — variar replanifica con SEMILLAS nuevas del mismo modelo, la
 * Protomolécula, la referencia 3D y el borrador de publicación piden una imagen ya generada y
 * guardan la atribución (modelo · licencia · repositorio) donde vaya a parar el archivo.
 */
import { useState, useCallback, useMemo, useRef } from "react";
import { planImagen, type PeticionImagen, type OpcionImagen, type NeuronaImg } from "../plan";
import { MODELOS_IMAGEN, modeloPorId } from "../modelos";
import { generarImagen } from "@/lib/aurora/generate/service-generation";
import { abrirEnProtomolecula as editorProtomolecula } from "@/lib/protomolecula/editor";
import { guardarEnBiblioteca } from "@/lib/library";
import { usarComoReferencia3D } from "@/lib/avatares/referencia3d";
import { borradorPublicacion } from "@/lib/publicacion/borrador";
import { useMallaNeuronasEstado } from "@/lib/network/malla-neuronas";

/** Una opción de la tarjeta: la del plan más su prompt y, si ya se generó, su URL y su marca. */
export type OpcionTarjeta = OpcionImagen & { prompt?: string; url?: string; elegida?: boolean };

/** La petición por defecto: comparar varios modelos, calidad primero, sin pago ni referencia. */
export const PETICION_DEFECTO: PeticionImagen = {
  opciones: 4, prioridad: "calidad", comercial: false, necesita: ["texto-a-imagen"],
  conReferencia: false, permisoRemoto: false, permitirDePago: false,
};

/** Atribución visible de una opción: modelo · licencia · repositorio (la tarjeta la enseña y la Biblioteca la guarda). */
export function atribucionDe(opcion: Pick<OpcionTarjeta, "modelo">): string {
  const m = opcion.modelo;
  return m
    ? `${m.nombre} · licencia: ${m.licencia} · repositorio: https://huggingface.co/${m.hf}`
    : "Modelo a decidir por el plan";
}

/** Extrae la URL honesta del resultado de `generarImagen` (nunca inventa un archivo). */
export function urlDeResultado(resultado: unknown): string | null {
  const data = (resultado as { data?: unknown } | null | undefined)?.data;
  const url = data && typeof data === "object" && "url" in data ? (data as { url?: unknown }).url : undefined;
  return typeof url === "string" && url.trim() ? url : null;
}

/** Adjunta el prompt a cada opción del plan: después «elegir» y «variar» lo necesitan. */
export function opcionesConPrompt(opciones: readonly OpcionImagen[], prompt: string): OpcionTarjeta[] {
  return opciones.map((o) => ({ ...o, prompt }));
}

/** De las opciones nuevas de «variar» se queda solo con las semillas que la tarjeta aún no tiene. */
export function semillasNuevas(previas: readonly OpcionImagen[], nuevas: readonly OpcionImagen[]): OpcionImagen[] {
  const usadas = new Set(previas.map((o) => `${o.modelo?.id ?? "sin"}#${o.semilla}`));
  return nuevas.filter((o) => !usadas.has(`${o.modelo?.id ?? "sin"}#${o.semilla}`));
}

export function useTarjetaImagenes() {
  const [opciones, setOpciones] = useState<OpcionTarjeta[]>([]);
  const [cargando, setCargando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const peticionRef = useRef<PeticionImagen>(PETICION_DEFECTO);
  const { misDispositivos } = useMallaNeuronasEstado();

  const neuronas: NeuronaImg[] = useMemo(() => misDispositivos.map((d) => ({
    id: d.neuronId,
    capa: d.esEsteDispositivo ? "dispositivo" : "neurona",
    gpu: "ninguna",
    vramGB: null,
    ramLibreGB: 8,
    motores: ["sdcpp", "onnx-web"],
    instalados: (d as { instalados?: readonly string[] }).instalados ?? [],
    ocupada: false,
    medidas: {},
  })), [misDispositivos]);

  /** Generar las opciones: plan por capas con el catálogo completo, el prompt pegado a cada una. */
  const generarOpciones = useCallback(async (peticion: PeticionImagen & { prompt?: string }) => {
    setCargando(true);
    setError(null);
    try {
      const prompt = peticion.prompt ?? "Una imagen de prueba";
      peticionRef.current = peticion;
      const plan = planImagen(peticion, neuronas, Date.now(), MODELOS_IMAGEN);
      setOpciones(opcionesConPrompt(plan.opciones, prompt));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude planificar las opciones de imagen");
    } finally {
      setCargando(false);
    }
  }, [neuronas]);

  /** Elegir: genera la imagen con el servicio enrutado (Pollinations como suelo gratis) y guarda su URL. */
  const elegirOpcion = useCallback(async (opcion: OpcionTarjeta): Promise<string | null> => {
    if (!opcion.prompt) {
      setError("Esa opción no lleva prompt: genera las opciones otra vez.");
      return null;
    }
    setCargando(true);
    setError(null);
    try {
      const resultado = await generarImagen(opcion.prompt);
      const url = urlDeResultado(resultado);
      if (!url) {
        setError(`No salió archivo de ${opcion.modelo?.nombre ?? "el modelo elegido"}: prueba otra opción.`);
        return null;
      }
      setOpciones((prev) => prev.map((o) =>
        (o.modelo?.id === opcion.modelo?.id && o.semilla === opcion.semilla) ? { ...o, url, elegida: true } : o));
      await guardarEnBiblioteca({
        kind: "image",
        title: `Imagen: ${opcion.prompt.slice(0, 60)}`,
        url,
        origin: atribucionDe(opcion),
      });
      return url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude generar la imagen elegida");
      return null;
    } finally {
      setCargando(false);
    }
  }, []);

  /** Variar: replanifica con SOLO ese modelo y semilla nueva; añade las que la tarjeta no tuviera. */
  const variarOpcion = useCallback((opcion: OpcionTarjeta): OpcionTarjeta[] => {
    const modelo = opcion.modelo?.id ? modeloPorId(opcion.modelo.id) : undefined;
    if (!modelo) {
      setError("No sé qué modelo variar: la opción no lleva modelo identificado.");
      return [];
    }
    const plan = planImagen(peticionRef.current, neuronas, Date.now(), [modelo]);
    const nuevas = semillasNuevas(opciones, plan.opciones).map((o) => ({ ...o, prompt: opcion.prompt }));
    if (!nuevas.length) {
      setError(`No hay más semillas distintas de ${modelo.nombre} ahora mismo: prueba más tarde o cambia de modelo.`);
      return [];
    }
    setOpciones((prev) => [...prev, ...nuevas]);
    setError(null);
    return nuevas;
  }, [opciones, neuronas]);

  /** Editar en la Protomolécula: abre la imagen YA generada en su lienzo (parte 3 con el editor real). */
  const editarProtomolecula = useCallback(async (destino: OpcionTarjeta | string): Promise<void> => {
    const url = typeof destino === "string" ? destino : destino.url;
    if (!url) {
      setError("Primero elige la opción: la Protomolécula edita una imagen ya generada.");
      return;
    }
    try {
      await editorProtomolecula.abrirProtomoleculaEditor(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude abrir la Protomolécula");
    }
  }, []);

  /** Ampliar: devuelve la URL de la imagen para verla grande (la tarjeta monta el diálogo). */
  const ampliar = useCallback((opcion: OpcionTarjeta): string | null => {
    if (!opcion.url) {
      setError("Esa opción aún no tiene imagen: elige la opción para tener su archivo.");
      return null;
    }
    return opcion.url;
  }, []);

  /** Usar como referencia para 3D (G3D1011E): pide una imagen ya generada en la tarjeta. */
  const usarReferencia3D = useCallback(async (opcion: OpcionTarjeta): Promise<void> => {
    if (!opcion.url) {
      setError("Sin imagen generada no hay referencia 3D: elige primero la opción.");
      return;
    }
    try {
      await usarComoReferencia3D(opcion.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude usar la imagen como referencia 3D");
    }
  }, []);

  /** Guardar en la Biblioteca: archivo ya generado, con su atribución completa en el origen. */
  const guardarOpcion = useCallback(async (opcion: OpcionTarjeta): Promise<{ id: string } | null> => {
    if (!opcion.url) {
      setError("Guarda una opción ya generada: elige primero para tener su archivo.");
      return null;
    }
    try {
      return await guardarEnBiblioteca({
        kind: "image",
        title: `Imagen: ${opcion.prompt?.slice(0, 60) ?? opcion.modelo?.nombre ?? "sin título"}`,
        url: opcion.url,
        origin: atribucionDe(opcion),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude guardar la imagen en la Biblioteca");
      return null;
    }
  }, []);

  /** Borrador de publicación (parte 3 lo completa): pide una opción ya generada. */
  const crearBorrador = useCallback(async (opcion: OpcionTarjeta): Promise<void> => {
    if (!opcion.url) {
      setError("El borrador necesita una imagen ya generada: elige primero la opción.");
      return;
    }
    try {
      await borradorPublicacion();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude crear el borrador de publicación");
    }
  }, []);

  /** La API de la tarjeta: presentación (parte 1) y pruebas consumen exactamente esto. */
  return {
    opciones,
    cargando,
    error,
    generarOpciones,
    elegirOpcion,
    variarOpcion,
    abrirEnProtomolecula: { abrirProtomoleculaEditor: editarProtomolecula },
    ampliar,
    usarComoReferencia3D: usarReferencia3D,
    guardarEnBiblioteca: guardarOpcion,
    borradorPublicacion: crearBorrador,
  };
}
