/**
 * Contrato común de la Ola 1026P (ventana de la Protomolécula con control de Astraura y gobierno por entidad).
 * Solo tipos y constantes puras: sin «use client», sin `node:*` (lo importan componentes de cliente).
 *
 *  · P1 (ventana)  → pinta, usa `leerContexto`/`planificarPeticion`/`ejecutarPlan` (P3) y `decidirCambio` (P2).
 *  · P2 (gobierno) → reglas de la Protomolécula de cada grupo, comunidad o página y quién decide un cambio.
 *  · P3 (petición) → qué contexto está activo, de un texto a un plan de operaciones cerradas, y ejecutarlo.
 */
import type { Ambito } from "@/lib/protomolecula/tipos";
import type { ProposalDraft } from "@/lib/governance/propuestas";

/** Lo que la persona tiene delante cuando abre la ventana (sin salir de su contexto). */
export type TipoEntidadProto =
  | "perfil" | "grupo" | "comunidad" | "pagina"
  | "publicacion" | "mensaje" | "archivo" | "pizarra" | "escritorio" | "widget" | "molecula";

export interface EntidadProto { tipo: TipoEntidadProto; id: string; nombre?: string }

export interface ContextoProto {
  /** Ruta actual (p. ej. `/grupo/semilla`). */
  ruta: string;
  /** Entidad principal de la pantalla, si la hay. */
  entidad?: EntidadProto;
  /** Lo seleccionado o enfocado dentro de ella (un bloque, un archivo, un mensaje…), si lo hay. */
  seleccion?: { tipo: TipoEntidadProto | "bloque" | "texto" | "imagen" | "objeto3d"; id: string; resumen?: string };
  /** Ámbito de memoria y gobierno que manda (personal › perfil › grupo › pública). */
  ambito: Ambito;
  /** Grupo, comunidad o página cuyo gobierno aplica, si la entidad cuelga de una. */
  gobernadaPor?: EntidadProto;
}

/**
 * Cualquier pantalla anuncia su contexto con este evento (`detail: ContextoProto` parcial) al montarse o al
 * cambiar la selección. La ventana se queda con el último. Sin anuncio, P3 lo deduce de la ruta.
 */
export const EVENTO_CONTEXTO_PROTO = "starseed:protomolecula-contexto";

/** Qué tipo de cambio es (decide qué regla de gobierno aplica). */
export type TipoCambioProto = "contenido" | "diseno" | "funciones" | "permisos" | "reglas" | "creacion";
export const TIPOS_CAMBIO_PROTO: readonly TipoCambioProto[] = ["contenido", "diseno", "funciones", "permisos", "reglas", "creacion"];

/** Cómo se aplica un cambio sobre algo existente: encima, o en una rama (Entidad Única: cita, nunca copia). */
export type ModoEdicion = "directo" | "rama";

/** Vocabulario CERRADO de operaciones que una petición puede producir. Nada de código suelto. */
export type OperacionPedida =
  | { tipo: "crear-objeto-3d"; descripcion: string; animado: boolean }
  | { tipo: "generar-imagen"; descripcion: string; formato?: "1:1" | "4:5" | "9:16" | "16:9" }
  | { tipo: "editar-entidad"; objetivo: EntidadProto; cambio: string; modo: ModoEdicion }
  | { tipo: "insertar-en"; destino: EntidadProto; que: string }
  | { tipo: "abrir-en"; donde: "pizarra" | "lienzo" | "protomolecula" | "xr"; que?: string }
  | { tipo: "fondo"; descripcion: string }
  | { tipo: "dictar-molecula"; orden: string }
  | { tipo: "proponer-metagenesis"; que: string };

export interface PeticionProto { texto: string; contexto: ContextoProto; modo?: ModoEdicion }

export interface PlanPeticion {
  resumen: string;
  tipoCambio: TipoCambioProto;
  pasos: OperacionPedida[];
  /** Lo que se pidió y no cabe en el vocabulario: se dice, no se inventa. */
  fuera: string[];
  /** Quién lo planificó (motor local, enrutador, regla) para la honestidad de la interfaz. */
  motor: string;
}

export type FalloPeticion = { error: "sin-ia" | "sin-contexto" | "vacia" | "fuera-de-vocabulario" | "tope"; motivo: string };

/** Quién pide el cambio dentro de una entidad. */
export interface ActorProto { usuarioId: string | null; rol?: string | null; esDueno?: boolean; origen: "humano" | "ia" | "agente" }

/** Lo que dice el gobierno de la entidad sobre un cambio. */
export interface VeredictoGobierno {
  decision: "aplicar" | "proponer" | "votar" | "denegar";
  motivo: string;
  /** Borrador listo para el compositor de propuestas cuando hay que proponer o votar. */
  propuesta?: ProposalDraft;
  /** Si se aplica, ¿pide confirmación de la persona? (siempre que lo propone una IA). */
  confirmar: boolean;
}
