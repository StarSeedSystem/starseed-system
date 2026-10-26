/**
 * Ventana de la Protomolécula · cómo se cuenta un plan (puro). Cada paso del vocabulario cerrado tiene su
 * frase en español y su icono; los fallos tienen un texto honesto y un camino.
 */
import type { OperacionPedida, VeredictoGobierno } from "@/lib/protomolecula/peticion/contrato";
import { ETIQUETA_ENTIDAD, nombreEntidad } from "./contexto";
import type { TipoFallo } from "./tipos";

export interface PasoLegible { icono: "objeto3d" | "imagen" | "editar" | "insertar" | "abrir" | "fondo" | "orden" | "metagenesis"; titulo: string; detalle?: string }

const DONDE: Record<Extract<OperacionPedida, { tipo: "abrir-en" }>["donde"], string> = {
  pizarra: "una pizarra", lienzo: "el lienzo", protomolecula: "la Protomolécula", xr: "XR (realidad virtual o aumentada)",
};

export function describirPaso(op: OperacionPedida): PasoLegible {
  switch (op.tipo) {
    case "crear-objeto-3d":
      return { icono: "objeto3d", titulo: op.animado ? "Crear un objeto 3D animado" : "Crear un objeto 3D", detalle: op.descripcion };
    case "generar-imagen":
      return { icono: "imagen", titulo: op.formato ? `Generar una imagen (${op.formato})` : "Generar una imagen", detalle: op.descripcion };
    case "editar-entidad":
      return {
        icono: "editar",
        titulo: `Editar ${ETIQUETA_ENTIDAD[op.objetivo.tipo].toLowerCase()} «${nombreEntidad(op.objetivo)}» ${op.modo === "rama" ? "en una rama" : "directamente"}`,
        detalle: op.cambio,
      };
    case "insertar-en":
      return { icono: "insertar", titulo: `Insertar en ${ETIQUETA_ENTIDAD[op.destino.tipo].toLowerCase()} «${nombreEntidad(op.destino)}»`, detalle: op.que };
    case "abrir-en":
      return { icono: "abrir", titulo: `Abrir en ${DONDE[op.donde]}`, detalle: op.que };
    case "fondo":
      return { icono: "fondo", titulo: "Cambiar el fondo", detalle: op.descripcion };
    case "dictar-molecula":
      return { icono: "orden", titulo: "Dar una orden a la molécula", detalle: op.orden };
    case "proponer-metagenesis":
      return { icono: "metagenesis", titulo: "Proponer a MetaGenesis", detalle: op.que };
  }
}

/** Qué pasa con este plan según el gobierno, en una frase, y cómo se llama el botón que lo confirma. */
export function textoVeredicto(v: VeredictoGobierno): { titulo: string; boton: string; tono: "aplicar" | "proponer" | "votar" | "denegar" } {
  switch (v.decision) {
    case "aplicar": return { titulo: "Se aplica en cuanto lo confirmes", boton: "Aplicar", tono: "aplicar" };
    case "proponer": return { titulo: "Se propone: no cambia nada hasta que lo decida quien gestiona", boton: "Revisar y proponer", tono: "proponer" };
    case "votar": return { titulo: "Se vota: no cambia nada hasta que la comunidad lo decida", boton: "Revisar y proponer a votación", tono: "votar" };
    case "denegar": return { titulo: "No tienes permiso para esto aquí", boton: "No permitido", tono: "denegar" };
  }
}

/** Texto honesto de un fallo (con su camino). Nunca promete lo que no hace. */
export function textoFallo(tipo: TipoFallo, motivo: string): string {
  const base = motivo.trim();
  switch (tipo) {
    case "sin-ia":
      return "Sin IA disponible: puedo hacerlo con las reglas locales, que solo entienden órdenes a los controles de una molécula («sube la mezcla un 10 %»). Para lo demás, usa las herramientas de abajo, que no necesitan IA." + (base ? ` (${base})` : "");
    case "sin-contexto":
      return `No sé qué tienes delante, así que no puedo planificar ahí.${base ? ` ${base}` : ""} Abre lo que quieres cambiar y vuelve a pedirlo.`;
    case "vacia":
      return "Escribe qué quieres hacer.";
    case "fuera-de-vocabulario":
      return `Eso aún no sé hacerlo.${base ? ` ${base}` : ""} Puedo crear objetos 3D animados e imágenes, editar (directo o en una rama), insertar, abrir en pizarra, lienzo o XR, cambiar el fondo, dar órdenes a una molécula y proponer a MetaGenesis.`;
    case "tope":
      return `Se alcanzó el tope de peticiones a la IA.${base ? ` ${base}` : ""} Las herramientas de abajo no gastan IA y siguen disponibles.`;
    case "tarda":
      return "Astraura tarda demasiado en responder. No se aplicó nada; puedes reintentarlo o usar las herramientas de abajo.";
    case "fallo":
      return `No pude completarlo.${base ? ` ${base}` : ""} No se aplicó nada.`;
  }
}

/** Si el fallo se arregla reintentando o probando las reglas locales. */
export const permiteReglasLocales = (tipo: TipoFallo): boolean => tipo === "sin-ia" || tipo === "tope" || tipo === "tarda";
export const permiteReintento = (tipo: TipoFallo): boolean => tipo === "sin-ia" || tipo === "tarda" || tipo === "fallo";

