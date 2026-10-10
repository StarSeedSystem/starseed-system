/**
 * StarSeed XR · tipos de las INTENCIONES DE VOZ. Frases en español → intención tipada con sus huecos.
 * Regla de oro: NUNCA se adivina un grupo, una persona ni un destino; si hay duda se pide elegir.
 */

export interface Referenciable {
    id: string;
    nombre: string;
    alias?: string[];
    miembros?: number;
}

export type TipoRef = "grupo" | "persona" | "estacion" | "servidor";
export interface RefResuelta { tipo: TipoRef; id: string; nombre: string; miembros?: number }

/** Lo que el aparato sabe en este momento (listas de la cuenta y lo que la persona señala o mira). */
export interface ContextoVoz {
    grupos: Referenciable[];
    contactos: Referenciable[];
    estaciones: Referenciable[];
    servidores: Referenciable[];
    enfoque?: { tipo: TipoRef; id: string } | null;
    mundoActual?: { id: string; nombre: string } | null;
}

export type SobreQue = "lo-creado" | "mundo-actual";
export type DestinoSubida =
    | { donde: "biblioteca" }
    | { donde: "estacion"; ref: RefResuelta | null; nueva: boolean }
    | { donde: "publicacion"; visibilidad: "yo" | "grupo" | "publica" | null; ref: RefResuelta | null }
    | { donde: "mensaje"; para: RefResuelta[] };

export type Intencion =
    | { tipo: "crear-mundo"; descripcion: string; caracteristicas: string[]; modo: "vr" | "ar" | "ambos"; libre: boolean }
    | { tipo: "editar-mundo"; campo: "cielo"; valor: string; sobre: SobreQue }
    | { tipo: "editar-mundo"; campo: "gravedad"; valor: "cero" | "luna" | "normal"; sobre: SobreQue }
    | { tipo: "editar-mundo"; campo: "otro"; texto: string; sobre: SobreQue }
    | { tipo: "invitar"; a: RefResuelta[]; sobre: SobreQue }
    | { tipo: "subir"; destino: DestinoSubida; sobre: SobreQue }
    | { tipo: "ir-a"; destino: RefResuelta }
    | { tipo: "abrir"; que: "pizarra" | "llamada"; con: RefResuelta[] }
    | { tipo: "sistema"; orden: "recentrar" | "salir" | "ayuda" | "silenciar" };

/** Qué capa de Astraura hace falta (contrato de capas autoadaptables): reflejo siempre encendida, razón bajo demanda. */
export type CapaIA = "reflejo" | "palabra" | "razon";
export interface PasoVoz { intencion: Intencion; capa: CapaIA }
export interface TarjetaConfirmacion {
    titulo: string;
    lineas: string[];
    acciones: ("confirmar" | "cambiar" | "cancelar")[];
}

export type ResultadoVoz =
    | { ok: true; pasos: PasoVoz[]; confirmar: boolean; tarjeta: TarjetaConfirmacion | null }
    | { ok: false; razon: "vacio" | "no-entendido" | "ambiguo" | "falta-dato" | "sin-contexto"; pregunta: string; sugerencias: string[]; candidatos?: RefResuelta[] };
