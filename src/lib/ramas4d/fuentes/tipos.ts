import type { Observador } from "../alcance";
import type { Grafo4D } from "../modelo";

export interface Fuente {
  id: string;
  capa: string;
  leer: (observador: Observador) => Promise<{ nodos: Grafo4D["nodos"]; aristas: Grafo4D["aristas"] }>;
  suscribir: (callback: (evento: { tipo: string; datos: unknown }) => void) => () => void;
}

export type FuenteEventoTipo =
  | "nodo_creado"
  | "nodo_actualizado"
  | "nodo_eliminado"
  | "arista_creada"
  | "arista_eliminada"
  | "rama_creada"
  | "rama_eliminada";

export interface FuenteEvento {
  tipo: FuenteEventoTipo;
  fuenteId: string;
  datos: unknown;
  t: number;
}