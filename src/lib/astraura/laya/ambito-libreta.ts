export type AmbitoLibreta = "personal" | "pagina" | "grupo" | "colectivo" | "fabrica";
export type tipoLibreta = AmbitoLibreta;

export interface Ejemplo {
  id: string;
  ambito: AmbitoLibreta;
  privado: boolean;
  aprobadoPorEntidad?: boolean;
  contenido: string;
}

export interface Entidad {
  id: string;
  tipo: "pagina" | "grupo" | "colectivo";
}

export function puedeLeer(ambito: AmbitoLibreta, quien: string): boolean {
  switch (ambito) {
    case "personal":
      return true;
    case "pagina":
    case "grupo":
    case "colectivo":
      return false;
    case "fabrica":
      return false;
    default:
      return false;
  }
}

export function puedeSalir(
  ambito: AmbitoLibreta,
  ejemplo: Ejemplo,
  eleccion?: string
): boolean {
  switch (ambito) {
    case "personal":
      return eleccion === "si";
    case "pagina":
      return ejemplo.aprobadoPorEntidad === true;
    case "grupo":
      return ejemplo.aprobadoPorEntidad === true;
    case "colectivo":
      return !ejemplo.privado;
    case "fabrica":
      return false;
    default:
      return false;
  }
}

export function soloPublicoParaAdaptador(
  ejemplos: readonly Ejemplo[],
  ambito: "pagina" | "colectivo"
): boolean {
  if (ambito === "pagina") {
    return ejemplos.every((e) => !e.privado && e.aprobadoPorEntidad !== true);
  }
  if (ambito === "colectivo") {
    return ejemplos.every((e) => !e.privado);
  }
  return false;
}