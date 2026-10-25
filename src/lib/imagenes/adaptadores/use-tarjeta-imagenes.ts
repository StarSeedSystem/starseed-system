"use client";
/**
 * Gancho de la TARJETA DE OPCIONES DE IMAGEN (IMG1011C). Contrato: architecture/astraura-imagenes.md §4 y §6.
 *
 * Encaja con lo que YA está hecho y no lo dobla: el plan (`../plan`), el reparto por neuronas de
 * media-gen (`@/ai/astraura/media/proveedor-neuronas`) y la regla de oro de
 * `generateImage` (el suelo gratis de Pollinations SIEMPRE responde). La tarjeta recibe la galería
 * con varias opciones (o la genera con la entrada de un chat, agente o bot) y sobre cada opción:
 * elegir, variar (más semillas del mismo modelo), editar en la Protomolécula, ampliar, usarla como
 * referencia 3D, guardarla en la Biblioteca y preparar su borrador de publicación. Todo defensivo
 * y honesto: si una capa no corre aquí, se dice por qué. Los servicios (reparto, capa, neuronas)
 * entraN INYECTADOS para poder probarlo sin red ni disco.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateImage } from "@/ai/astraura/media/media-gen";
import { ejecutarOpcionReal } from "@/ai/astraura/media/proveedor-neuronas";
import {
  planImagen,
  type Cuantizacion,
  type OpcionImagen,
  type PeticionImagen,
  type NeuronaImg,
} from "../plan";
import { MOTORES_IMG, MODELOS_IMAGEN, modeloPorId, type CapacidadImg, type MotorImg } from "../modelos";
import { abrirImagenEnProtomolecula } from "@/lib/protomolecula/editor";
import { guardarImagenEnBiblioteca } from "@/lib/library";
import { prepararReferencia3D } from "@/lib/avatares/referencia3d";
import { crearBorradorPublicacion } from "@/lib/publicacion/borrador";
import { obtenerNeuronasParaImagen } from "./malla-imagenes";
import type { GaleriaImagenes, OpcionGaleria } from "@/ai/astraura/media/proveedor-neuronas";

/** Etiquetas del lugar de cada capa (§3, lo más cercano a lo más lejano). */
export const ETIQUETA_CAPA: Record<string, string> = {
  dispositivo: "Tu aparato",
  navegador: "Tu navegador",
  neurona: "Otra neurona tuya",
  malla: "La malla",
  espacio: "Un Space de Hugging Face",
  "web-gratis": "La web (gratis)",
  externo: "Un servicio de pago",
};

/** Lo que pide una generación de imagen. Entradilla compatible con la galería de media-gen. */
export interface EntradaGeneracion {
  prompt: string;
  opciones?: number;
  prioridad?: "calidad" | "rapidez";
  comercial?: boolean;
  necesita?: readonly CapacidadImg[];
  conReferencia?: boolean;
  permisoRemoto?: boolean;
  espacios?: readonly string[];
  semillaBase?: number;
}

/** Una opción de la tarjeta, lista para enseñarse (licencia y atribución VISIBLES). */
export interface OpcionTarjeta {
  id: string;
  url?: string;
  /** Referencia en otra neurona (la imagen aún sin traer). */
  ref?: string;
  capa: keyof typeof ETIQUETA_CAPA;
  modeloNombre: string | null;
  modeloId: string | null;
  motor: string;
  licencia: string;
  uso: string;
  atribucion: string;
  semilla: number;
  segundos?: number;
  cuantizacion?: string;
  neuronaId?: string;
  prompt: string;
}

/** Salida del reparto: subconjunto de lo que devuelven generateImage y la galería. */
export interface SalidaReparto {
  ok: boolean;
  url?: string;
  error?: string;
  provider?: string;
  galeria?: GaleriaImagenes;
}

/** Servicios externos al gancho; el por defecto RED existe en producción, pero no en pruebas. */
export interface DependenciasTarjeta {
  repartir: (e: EntradaGeneracion) => Promise<SalidaReparto>;
  ejecutar: (op: OpcionTarjeta, prompt: string) => Promise<{ url?: string; ref?: string } | null>;
  neuronas: () => Promise<readonly NeuronaImg[]>;
}

// ── Mapeadores PUROS (probados sin montar React) ────────────────────────────

/** Coerción amable a texto (nunca lanza). */
function texto(v: string | undefined | null): string {
  return typeof v === "string" ? v.trim() : "";
}

/** ¿Es un motor ejecutable de una opción de plan? */
function esMotor(m: string): m is MotorImg | "espacio-hf" | "pollinations" | "externo" {
  return (MOTORES_IMG as readonly string[]).includes(m) || m === "espacio-hf" || m === "pollinations" || m === "externo";
}

/** Opción de la galería (ya EJECUTADA) → tarjeta. PURO. */
export function opcionDeGaleria(o: OpcionGaleria, prompt: string, i: number): OpcionTarjeta {
  const modelo = o.modelo ? MODELOS_IMAGEN.find((m) => m.nombre === o.modelo) ?? null : null;
  return {
    id: `op-${o.semilla}-${i}`,
    ...(texto(o.url) ? { url: o.url } : {}),
    ...(o.ref ? { ref: o.ref } : {}),
    capa: o.capa,
    modeloNombre: o.modelo,
    modeloId: modelo?.id ?? null,
    motor: modelo?.motores[0] ?? (o.capa === "web-gratis" ? "pollinations" : "externo"),
    licencia: o.licencia,
    uso: o.uso,
    atribucion: o.atribucion,
    semilla: o.semilla,
    segundos: o.segundos,
    ...(o.neurona ? { neuronaId: o.neurona } : {}),
    prompt,
  };
}

/** Todas las opciones de la MINUTA de media-gen, o la única imagen del suelo gratis si la galería no vino. PURO. */
export function opcionesDeSalida(r: SalidaReparto, prompt: string): OpcionTarjeta[] {
  const deLaGaleria = r.galeria?.ok ? r.galeria.opciones.filter((o) => texto(o.url) || o.ref) : [];
  if (deLaGaleria.length) return deLaGaleria.map((o, i) => opcionDeGaleria(o, prompt, i));
  if (r.ok && texto(r.url)) {
    const web = (r.provider ?? "pollinations") === "pollinations";
    return [
      {
        id: `op-1-${texto(r.url).length}`,
        url: r.url,
        capa: web ? "web-gratis" : "externo",
        modeloNombre: null,
        modeloId: null,
        motor: "pollinations",
        licencia: "Servicio gratuito atribuido (Pollinations)",
        uso: "libre",
        atribucion: "Generada con Pollinations (la web gratis, suelo de media-gen).",
        semilla: 1,
        prompt,
      },
    ];
  }
  return [];
}

/** Candidata del PLAN (aún sin ejecutar) → tarjeta. PURO. */
export function opcionesDePlan(plan: readonly OpcionImagen[], prompt: string): OpcionTarjeta[] {
  return plan.map((o, i) => {
    const m = o.modelo;
    return {
      id: `pl-${o.semilla}-${i}`,
      capa: o.capa,
      modeloNombre: m?.nombre ?? null,
      modeloId: m?.id ?? null,
      motor: o.motor,
      licencia: m?.licencia ?? "según el servicio que la genere",
      uso: m?.uso ?? "libre",
      atribucion: m
        ? `Se generará con ${m.nombre} (${m.licencia})${o.cuantizacion !== "nativa" ? `, cuantizado a ${o.cuantizacion === "q8" ? "8" : "4"} bits` : ""}.`
        : "Se generará con Pollinations (la web gratis).",
      semilla: o.semilla,
      cuantizacion: o.cuantizacion,
      ...(o.neuronaId ? { neuronaId: o.neuronaId } : {}),
      prompt,
    };
  });
}

/** Tarjeta → la forma de plan que pide `ejecutarOpcionReal` (null si la capa de la tarjeta no cuadra). PURO. */
export function aOpcionPlan(op: OpcionTarjeta): OpcionImagen | null {
  const capas: readonly CapaImg[] = ["dispositivo", "navegador", "neurona", "malla", "espacio", "web-gratis", "externo"];
  const capa = capas.includes(op.capa) ? (op.capa as CapaImg) : null;
  const motor = esMotor(op.motor) ? (op.motor as OpcionImagen["motor"]) : null;
  const cuant: Cuantizacion = op.cuantizacion === "q8" || op.cuantizacion === "q4" ? op.cuantizacion : "nativa";
  if (!capa || !motor) return null;
  const modelo = op.modeloId ? modeloPorId(op.modeloId) ?? null : null;
  return {
    capa,
    ...(op.neuronaId ? { neuronaId: op.neuronaId } : {}),
    modelo,
    motor,
    cuantizacion: cuant,
    semilla: op.semilla,
    motivo: "",
  };
}


// ── Servicios por defecto (USO REAL: media-gen es el suelo, sin doblar nada) ─

/** El reparto real lo hace `generateImage` de media-gen (galería por neuronas + suelo gratis). */
async function repartirPorDefecto(e: EntradaGeneracion): Promise<SalidaReparto> {
  const r = await generateImage({
    prompt: e.prompt,
    ...(e.opciones ? { opciones: Math.max(1, Math.min(8, Math.floor(e.opciones))) } : { opciones: 4 }),
    ...(typeof e.semillaBase === "number" ? { seed: Math.floor(e.semillaBase) } : {}),
    ...(e.prioridad ? { prioridad: e.prioridad } : {}),
    comercial: e.comercial === true,
    conReferencia: e.conReferencia === true,
    permisoRemoto: e.permisoRemoto === true,
  });
  return { ok: r.ok, url: r.url, error: r.error, provider: r.provider, galeria: r.galeria };
}

/** Ejecuta UNA opción de la tarjeta contra su capa real (el web gratis pasa por media-gen). */
async function ejecutarPorDefecto(op: OpcionTarjeta, prompt: string): Promise<{ url?: string; ref?: string } | null> {
  const plan = aOpcionPlan(op);
  if (!plan) return null;
  if (op.motor === "pollinations") {
    const r = await generateImage({ prompt, seed: op.semilla, provider: "pollinations", opciones: 1 });
    return r.ok && r.url ? { url: r.url } : null;
  }
  const r = await ejecutarOpcionReal(plan, prompt, null);
  return r ? (r.url ? { url: r.url } : r.ref ? { ref: r.ref } : null) : null;
}

/** Gancho de la tarjeta. `inicio.entrada` genera al montar; `inicio.galeria` ya trae el resultado. */
export function useTarjetaImagenes(
  inicio?: { entrada?: EntradaGeneracion; galeria?: GaleriaImagenes },
  deps?: Partial<DependenciasTarjeta>,
) {
  const d = useMemo<DependenciasTarjeta>(
    () => ({
      repartir: deps?.repartir ?? repartirPorDefecto,
      ejecutar: deps?.ejecutar ?? ejecutarPorDefecto,
      neuronas: deps?.neuronas ?? obtenerNeuronasParaImagen,
    }),
    [deps],
  );
  const [opciones, setOpciones] = useState<OpcionTarjeta[]>(
    inicio?.galeria?.ok ? inicio.galeria.opciones.map((o, i) => opcionDeGaleria(o, inicio?.entrada?.prompt ?? "", i)) : [],
  );
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [referencia3d, setReferencia3d] = useState<{ url: string; titulo: string } | null>(null);
  const peticionRef = useRef<EntradaGeneracion | null>(null);

  /** Genera TODAS las opciones de una vez con el reparto por capas (§4). */
  const generarOpciones = useCallback(
    async (e: EntradaGeneracion) => {
      const prompt = e.prompt.trim();
      if (!prompt) {
        setError("Dime primero qué imagen quieres: falta el texto.");
        return;
      }
      setCargando(true);
      setError(null);
      try {
        const r = await d.repartir({ ...e, prompt });
        peticionRef.current = { ...e, prompt };
        const nuevas = opcionesDeSalida(r, prompt);
        setOpciones(nuevas);
        setSeleccionada(null);
        if (!nuevas.length) setError(r.error ?? "Ninguna capa respondió con opciones ahora mismo.");
      } catch {
        setError("Algo falló al repartir la generación. Prueba otra vez.");
      } finally {
        setCargando(false);
      }
    },
    [d],
  );

  /** Variar: MÁS SEMILLAS DEL MISMO MODELO (§4), añadidas al final y ejecutables al elegirlas. */
  const variar = useCallback(
    async (op: OpcionTarjeta) => {
      const e = peticionRef.current;
      if (!e) {
        setError("Primero genera las opciones de la tarjeta.");
        return;
      }
      const modelo = op.modeloId ? modeloPorId(op.modeloId) : null;
      if (!modelo) {
        setError("La web gratis y los servicios de pago no tienen un modelo fijo que variar: usa «Generar otra vez» para más semillas.");
        return;
      }
      setError(null);
      try {
        const peticion: PeticionImagen = {
          opciones: 4,
          prioridad: e.prioridad ?? "calidad",
          comercial: e.comercial === true,
          necesita: e.necesita ?? (["texto-a-imagen"] as const),
          conReferencia: e.conReferencia === true,
          permisoRemoto: e.permisoRemoto === true,
          permitirDePago: false,
          ...(e.espacios && e.espacios.length ? { espacios: e.espacios } : {}),
        };
        const lista = await d.neuronas();
        const plan = planImagen(peticion, lista, Date.now(), [modelo]);
        const nuevas = opcionesDePlan(plan.opciones, e.prompt);
        if (!nuevas.length) {
          setError(`No cabe ninguna semilla nueva de ${modelo.nombre} ahora: ${plan.descartes[0] ?? "cada capa está ocupada"}.`);
          return;
        }
        setOpciones((prev) => [...prev, ...nuevas]);
      } catch {
        setError("No se pudo calcular la variación de esta opción.");
      }
    },
    [d],
  );

  /** Elegir: la marca como la buena y, si aún no está hecha, se la pide a su capa. */
  const elegir = useCallback(
    async (op: OpcionTarjeta) => {
      setSeleccionada(op.id);
      setError(null);
      if (op.url || op.ref) return;
      setCargando(true);
      try {
        const r = await d.ejecutar(op, op.prompt);
        if (!r || (!texto(r.url) && !r.ref)) {
          setError(`Esta capa no respondió con imagen (${ETIQUETA_CAPA[op.capa] ?? op.capa}). Elegí otra o genera de nuevo.`);
          setSeleccionada(null);
          return;
        }
        setOpciones((prev) =>
          prev.map((o) => (o.id === op.id ? { ...o, ...(r.url ? { url: r.url } : {}), ...(r.ref ? { ref: r.ref } : {}) } : o)),
        );
      } catch {
        setError("La capa elegida falló: prueba otra opción.");
        setSeleccionada(null);
      } finally {
        setCargando(false);
      }
    },
    [d],
  );

  /** Ampliar: regenera el MISMO texto y semilla a la resolución del modelo (el suelo gratis hoy). */
  const ampliar = useCallback(
    async (op: OpcionTarjeta) => {
      if (!op.url && !op.ref) {
        setError("Esta opción todavía no está hecha: elige para generarla y luego amplíala.");
        return;
      }
      const lado = (op.modeloId ? modeloPorId(op.modeloId)?.resolucion : null) ?? 1024;
      setCargando(true);
      setError(null);
      try {
        const r = await d.repartir({ prompt: op.prompt, opciones: 1, semillaBase: op.semilla });
        const nuevas = opcionesDeSalida(r, op.prompt).filter((o) => o.url && o.url !== op.url);
        if (!nuevas.length) {
          setError("La ampliación no respondió ahora mismo.");
          return;
        }
        setOpciones((prev) => [
          ...prev,
          ...nuevas.map((o) => ({ ...o, id: `amp-${o.semilla}`, atribucion: `${o.atribucion} Ampliada a ${lado} px.` })),
        ]);
      } catch {
        setError("No se pudo ampliar esta imagen.");
      } finally {
        setCargando(false);
      }
    },
    [d],
  );

  /** Editar en la Protomolécula (abre su lienzo con la imagen). */
  const editarEnProtomolecula = useCallback((op: OpcionTarjeta) => {
    setError(null);
    if (!op.url) {
      setError(op.ref ? "La imagen está en otra neurona y aún sin traer: elige otra hecha." : "Esta opción todavía no está hecha: elige para generarla y luego edítala.");
      return;
    }
    const r = abrirImagenEnProtomolecula({
      url: op.url,
      titulo: op.prompt.slice(0, 60),
      licencia: op.licencia,
      atribucion: op.atribucion,
    });
    if (!r.ok) setError(r.mensaje);
  }, []);

  /** Usar como referencia 3D: la deja en la Biblioteca y devuelve los datos para el diálogo de G3D1011E. */
  const usarComoReferencia3D = useCallback((op: OpcionTarjeta) => {
    setError(null);
    const r = prepararReferencia3D({
      ...(op.url ? { url: op.url } : {}),
      titulo: op.prompt.slice(0, 60),
      prompt: op.prompt,
      modelo: op.modeloId ? modeloPorId(op.modeloId) : null,
    });
    if (r.ok && r.url) setReferencia3d({ url: r.url, titulo: r.titulo ?? "" });
    else setError(r.mensaje);
  }, []);

  /** Guardar en la Biblioteca con licencia y atribución visibles. */
  const guardarEnBiblioteca = useCallback((op: OpcionTarjeta) => {
    setError(null);
    const r = guardarImagenEnBiblioteca({
      ...(op.url ? { url: op.url } : {}),
      titulo: op.prompt.slice(0, 60),
      prompt: op.prompt,
      modelo: op.modeloId ? modeloPorId(op.modeloId) : null,
    });
    if (!r.ok) setError(r.mensaje);
    return r;
  }, []);

  /** Borrador de publicación: el Composer de Publicar, ya relleno. */
  const borradorPublicacion = useCallback((op: OpcionTarjeta) => {
    setError(null);
    const r = crearBorradorPublicacion({
      ...(op.url ? { url: op.url } : {}),
      prompt: op.prompt,
      modelo: op.modeloNombre,
      licencia: op.licencia,
      atribucion: op.atribucion,
    });
    if (!r.ok) setError(r.mensaje);
    return r;
  }, []);

  // Con una entrada inicial la tarjeta genera sola al montar (chats, agentes y bots).
  const entradaInicial = inicio?.entrada;
  useEffect(() => {
    if (entradaInicial && opciones.length === 0) void generarOpciones(entradaInicial);
    // Una sola vez: la entrada inicial no se vuelve a disparar en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    opciones,
    cargando,
    error,
    seleccionada,
    referencia3d,
    generarOpciones,
    elegir,
    variar,
    ampliar,
    editarEnProtomolecula,
    usarComoReferencia3D,
    guardarEnBiblioteca,
    borradorPublicacion,
  };
}
