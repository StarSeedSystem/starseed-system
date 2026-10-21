import type { Ambito } from "@/lib/protomolecula/tipos";

export interface Encargo {
  id: string;
  moleculaId: string;
  ambito: Ambito;
  intencion: string;
  criterios: { tipo: string; valor: unknown; texto?: string }[];
  autor: { tipo: "persona" | "agente" | "sistema"; id: string; nombre?: string; };
  origen: string;
  creadoEn: number;
}