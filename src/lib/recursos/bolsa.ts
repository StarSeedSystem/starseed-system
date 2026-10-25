// Bolsa de recursos (§4 de architecture/apps-en-la-malla.md): empareja peticiones y ofertas.
// Pura y determinista; las reglas van en este orden y los empates se rompen por nodoId:
// 1 permisos y privacidad · 2 latencia · 3 y 4 energía y capacidad prestable ·
// 5 gratis y propio primero · 6 reparto en varias fuentes · 7 suelo (nunca vacío).
import { OfertaNeurona, capacidadPrestable, ofertaVisiblePara } from "./oferta";

export type ClaseParte = "computo" | "bytes" | "ventana" | "relevo";

export interface NecesidadesParte {
  ramMb?: number;
  gpu?: boolean;
  motor?: string;
  appId?: string;
  volumen?: number;
  kbps?: number;
}

export interface PartePeticion {
  clase: ClaseParte;
  necesita: NecesidadesParte;
  latenciaMaxMs?: number;
}

export interface ContextoPeticion {
  tipo: "cuenta" | "grupo" | "comunidad" | "publicacion" | "estacion";
  id: string;
  privado: boolean;
}

export interface PeticionBolsa {
  id: string;
  contexto: ContextoPeticion;
  partes: PartePeticion[];
}

/** Resultado por parte: `destino` es un nodoId, «local» o «nube» (gratuita del contexto).
 *  `fuentes` llega con varios nodos solo si la parte se ramifica; `respaldo` es la fuente
 *  siguiente por si la principal se va; `enlace` es el medio por el que va el tráfico. */
export interface ResultadoParte {
  destino: string;
  fuentes?: string[];
  enlace?: string;
  respaldo?: string;
  motivo: string;
}

/** Ni la red alcanza: se abre en local o en la web y se dice qué falta; nunca queda vacío. */
export interface SueloPlan {
  destino: "local" | "nube";
  motivo: string;
  falta: string[];
}

export interface ResultadoPlanificacion {
  porParte: Record<string, ResultadoParte[]>;
  suelo?: SueloPlan;
}

export interface ReglasBolsa {
  latenciaMaxMs?: number;
  maxFuentes?: number;
}

// CONTINUAR: regla de latencia, cobertura por clase y `planificar`.
