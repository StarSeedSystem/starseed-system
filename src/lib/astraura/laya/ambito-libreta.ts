// Reglas de ámbito de la libreta de Jev/Laya (architecture/jev-entrena-laya.md §5, OLA JLA1116A).
// Módulo PURE: sin red, sin disco, sin reloj. Todo es tipado y retorna booleanos/strings.
// Los ambitos definen quién puede leer y quién puede sacar ejemplos del entorno.

export type AmbitoLibreta =
  | "personal"
  | "pagina"
  | "grupo"
  | "colectivo"
  | "fabrica";

export interface EjemploLibreta {
  readonly contenido: string;
  readonly ambito: AmbitoLibreta;
  readonly hayDesenlace: boolean; // si Jev confirmó el desenlace real
  readonly id: string;
}

// ¿Quién puede leer la libreta en un dado ámbito?
export function puedeLeer(ambito: AmbitoLibreta, quien: string): boolean {
  switch (ambito) {
    case "personal":
      return quien === "propiaPersona";
    case "pagina":
    case "grupo":
      return true; // cualquier entidad puede leer, pero solo ejemplos aprobados para salir
    case "colectivo":
      return true;
    case "fabrica":
      return quien === "alex";
  }
}

// ¿Puede un ejemplo salir del ámbito? (exportar/visible fuera)
// ejemplo: { contenido, ambito, hayDesenlace, id }
export function puedeSalir(ambito: AmbitoLibreta, ejemplo: EjemploLibreta, eleccion?: string): boolean {
  if (ambito === "fabrica") return false; // la fábrica nunca sale al repo

  if (ambito === "personal") {
    // lo personal solo sale con elección explícita de la persona
    return !!(eleccion && eleccion.length > 0);
  }

  if (ambito === "pagina" || ambito === "grupo") {
    // página/grupo solo si la entidad lo aprobó (aprobadoPorEntidad)
    return !!ejemplo.hayDesenlace;
  }

  if (ambito === "colectivo") {
    // colectivo solo admite ejemplos públicos (sin texto privado)
    return !contenidoPrivado(ejemplo.contenido);
  }

  return false;
}

// Verifica si el contenido contiene datos personales/privados
function contenidoPrivado(contenido: string): boolean {
  const privadas = ["correo", "teléfono", "tel", "dirección", "direccion", "ip", "facebook", "twitter", "instagram", "salud", "medicamento", "psicólogo", "psicologa"];
  return privadas.some((p) => contenido.toLowerCase().includes(p));
}

// ¿Un adaptador de página/colectivo no puede haber visto ejemplos personales?
export function soloPublicoParaAdaptador(ejemplos: EjemploLibreta[], ambito: AmbitoLibreta): boolean {
  if (ambito !== "pagina" && ambito !== "colectivo") return true; // solo aplica a estos ámbitos

  for (const ej of ejemplos) {
    if (ej.ambito === "personal") return false; // personal never enters page/collective adapter
  }
  return true;
}

// Devolver el texto por defecto cuando algo no sale (para tests y UI)
export function textoPorDefecto(ambito: AmbitoLibreta): string {
  switch (ambito) {
    case "personal":
      return "no sale (personal, requiere elección)";
    case "pagina":
      return "sale solo si la entidad lo aprobó";
    case "grupo":
      return "sale solo si la entidad lo aprobó";
    case "colectivo":
      return "sale sin texto privado";
    case "fabrica":
      return "no sale al repo";
    default:
      return "desconocido";
  }
}