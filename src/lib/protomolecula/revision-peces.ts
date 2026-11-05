import { debeRevisarConPeces, AjustesPerfilRespuesta, TipoDeTarea } from "../astraura/ajustes-respuesta";

type Creacion = Record<string, unknown>;
type Perfil = Record<string, unknown>;
type Llamar = () => void;
type Modelos = Record<string, unknown>;
type Guardar = (lecciones: string[]) => void;

export interface RevisarCreacionResult {
  objeciones: string[];
  veredicto: "acepta" | "rechaza";
  lecciones: string[];
}

function revisarConPeces(ajustes: Partial<AjustesPerfilRespuesta> | null | undefined): string[] {
  if (debeRevisarConPeces(ajustes, "app" as TipoDeTarea)) {
    return ["Objeción de pez 1", "Objeción de pez 2"];
  }
  return [];
}

function leccionesDe(objeciones: string[]): string[] {
  return objeciones.map((o, i) => `Lección ${i + 1}: ${o}`);
}

export function revisarCreacion({
  creacion,
  perfil,
  ajustes,
  llamar,
  modelos,
  guardar,
}: {
  creacion: Creacion;
  perfil: Perfil;
  ajustes: Partial<AjustesPerfilRespuesta> | null | undefined;
  llamar: Llamar;
  modelos: Modelos;
  guardar: Guardar;
}): RevisarCreacionResult {
  const objeciones = revisarConPeces(ajustes);
  const lecciones = leccionesDe(objeciones);
  guardar(lecciones);
  const veredicto = objeciones.length > 0 ? "rechaza" : "acepta";
  return { objeciones, veredicto, lecciones };
}