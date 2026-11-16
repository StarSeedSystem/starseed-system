import type { EntidadRed } from "@/lib/agentes-red/perfil-agente";

export type AmbitoLibreta = "personal" | "pagina" | "grupo" | "colectivo" | "fabrica";

export interface EjemploLibreta {
  id: string;
  punto: string;
  ambito: AmbitoLibreta;
  estado: string;
  esPrivado: boolean;
  entidad?: EntidadRed & { aprobado?: boolean };
}

export interface EjemploPublicoParaAdaptador {
  punto: string;
  ejemplos: EjemploLibreta[];
  adaptadorId: string;
}

export interface QuienPuedeLeer {
  esPropietario: boolean;
  aprobadoPorEntidad?: boolean;
}

export function puedeLeer(ambito: AmbitoLibreta, quien: QuienPuedeLeer): boolean {
  if (ambito === "personal") return quien.esPropietario;
  if (ambito === "pagina" || ambito === "grupo") return Boolean(quien.aprobadoPorEntidad);
  if (ambito === "colectivo") return true;
  return false;
}

export function puedeSalir(
  ambito: AmbitoLibreta,
  ejemplo: EjemploLibreta,
  eleccion?: "sal" | "no-sal" | "explicito"
): boolean {
  if (ejemplo.esPrivado) return false;
  if (ambito === "fabrica") return false;
  if (ambito === "personal") return eleccion === "explicito";
  if (ambito === "pagina" || ambito === "grupo") return Boolean(ejemplo.entidad?.aprobado);
  if (ambito === "colectivo") return true;
  return false;
}

export function soloPublicoParaAdaptador(ejemplos: EjemploLibreta[], ambito: AmbitoLibreta): boolean {
  if (ambito !== "pagina" && ambito !== "grupo" && ambito !== "colectivo") return true;
  return ejemplos.every((e) => !e.esPrivado && e.entidad?.aprobado === true);
}