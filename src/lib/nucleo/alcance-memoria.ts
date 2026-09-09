// Alcance de la memoria de los cerebros (Ola 307, 2026-09-09).
//
// El rumbo de Alex pide cerebros y agentes «con memoria y acceso a toda la red e internet».
// El acceso amplio es la mitad buena; la otra mitad es que un agente de un grupo público
// no debe poder contar lo que sabe de la vida privada de su dueño. Sin esta capa,
// «memoria + acceso total» es una fuga esperando a ocurrir, y una sola fuga sonada mata
// la confianza en la red entera.
//
// Módulo PURO: sin red, sin disco, sin procesos. Solo el contrato de qué puede ver y
// escribir cada actor, y una red de seguridad contra el copiar-y-pegar de contexto privado.

/** Ámbitos de memoria, de lo más privado a lo más abierto. */
export type AlcanceMemoria = "personal" | "perfil" | "grupo" | "publica";

/** Quién pregunta: la persona dueña, o un agente con su ámbito de vida. */
export type TipoActor = "usuario" | "agente-personal" | "agente-grupo" | "agente-publico";

export interface ActorMemoria {
  tipo: TipoActor;
  /** Grupo al que sirve el agente. Obligatorio para escribir en la memoria de grupo. */
  grupoId?: string;
}

export interface FragmentoMemoria {
  id: string;
  alcance: AlcanceMemoria;
  texto: string;
  /** De dónde salió el recuerdo: página, publicación, widget, conversación… */
  origen: string;
  /** Marca de tiempo en milisegundos. */
  at: number;
  etiquetas?: string[];
}

/** Orden canónico: de lo más privado a lo más abierto. Nunca al revés. */
export const ORDEN_ALCANCE: AlcanceMemoria[] = ["personal", "perfil", "grupo", "publica"];

/** Longitud mínima, en caracteres, de una coincidencia que consideramos fuga. */
export const MINIMO_FUGA = 40;

// La matriz es explícita a propósito: leer una tabla es más difícil de estropear
// por accidente que deducir permisos con comparaciones de índices.
const VISIBILIDAD: Record<TipoActor, AlcanceMemoria[]> = {
  // La persona dueña ve toda su memoria.
  usuario: ["personal", "perfil", "grupo", "publica"],
  // La memoria personal solo es visible para el usuario y sus agentes personales.
  "agente-personal": ["personal", "perfil", "grupo", "publica"],
  // Un agente que sirve a un grupo ve lo del grupo y lo público, nada más.
  "agente-grupo": ["grupo", "publica"],
  // Un agente público solo ve lo que ya es público.
  "agente-publico": ["publica"],
};

/** Ámbitos que este actor puede leer, en el orden canónico. */
export function alcanceVisiblePara(actor: ActorMemoria): AlcanceMemoria[] {
  const permitidos = VISIBILIDAD[actor.tipo] ?? ["publica"];
  return ORDEN_ALCANCE.filter((alcance) => permitidos.includes(alcance));
}

/**
 * Deja pasar solo los fragmentos cuyo ámbito está en la lista de permitidos.
 * Conserva el orden de entrada: quien llama decide cómo ordenar los recuerdos.
 */
export function filtrarParaAlcance(
  frs: FragmentoMemoria[],
  permitidos: AlcanceMemoria[],
): FragmentoMemoria[] {
  const juego = new Set(permitidos);
  return frs.filter((fr) => juego.has(fr.alcance));
}

/**
 * Si este actor puede *escribir* en un ámbito. La regla base es que nadie escribe
 * donde no puede leer —un agente público no escribe en la memoria personal de nadie—
 * y, además, un agente de grupo tiene que declarar a qué grupo sirve antes de dejar
 * un recuerdo en la memoria de ese grupo.
 */
export function puedeEscribirEn(actor: ActorMemoria, destino: AlcanceMemoria): boolean {
  if (!alcanceVisiblePara(actor).includes(destino)) return false;
  if (actor.tipo === "agente-grupo" && destino === "grupo") {
    return typeof actor.grupoId === "string" && actor.grupoId.trim().length > 0;
  }
  return true;
}

// Normaliza para comparar: minúsculas y espacios colapsados. No quitamos acentos
// a propósito: el español acentuado es el texto real que escriben las personas.
function normalizar(texto: string): string {
  return texto.toLowerCase().replace(/\s+/g, " ").trim();
}

// Busca los trozos del fragmento privado que aparecen literalmente en el texto emitido.
// Avanza por ventanas del tamaño mínimo y, cuando una encaja, la estira todo lo que puede
// para reportar la coincidencia entera y no veinte subcadenas anidadas de lo mismo.
function coincidenciasLargas(textoNorm: string, fragNorm: string, minimo: number): string[] {
  const hallazgos: string[] = [];
  if (fragNorm.length < minimo || textoNorm.length < minimo) return hallazgos;
  let i = 0;
  while (i + minimo <= fragNorm.length) {
    if (!textoNorm.includes(fragNorm.slice(i, i + minimo))) {
      i += 1;
      continue;
    }
    let fin = i + minimo;
    while (fin < fragNorm.length && textoNorm.includes(fragNorm.slice(i, fin + 1))) fin += 1;
    // Recortamos los bordes: la coincidencia útil es la frase, no el espacio que la sigue.
    hallazgos.push(fragNorm.slice(i, fin).trim());
    i = fin;
  }
  return hallazgos;
}

/**
 * Red de seguridad, NO garantía criptográfica: esto no es infalible y hay que decirlo sin
 * adornos. Un agente decidido puede parafrasear, traducir o trocear un secreto y salir
 * limpio de aquí. Lo que sí atrapa es el caso común y tonto: pegar contexto privado tal
 * cual en una respuesta que va a un grupo o al mundo.
 *
 * Quien llama pasa en `personales` únicamente los fragmentos que NO son visibles para el
 * destino de ese texto (normalmente los de alcance `personal`); una frase que además ya
 * es pública debe quedarse fuera de esa lista para no dar falsas alarmas.
 *
 * Devuelve los trozos coincidentes (normalizados) de ≥ `MINIMO_FUGA` caracteres, sin
 * repetidos. Lista vacía significa «no he visto nada», nunca «esto es seguro».
 */
export function detectarFuga(texto: string, personales: FragmentoMemoria[]): string[] {
  const textoNorm = normalizar(texto);
  if (textoNorm.length < MINIMO_FUGA) return [];
  const fugas: string[] = [];
  for (const fr of personales) {
    for (const trozo of coincidenciasLargas(textoNorm, normalizar(fr.texto), MINIMO_FUGA)) {
      if (!fugas.includes(trozo)) fugas.push(trozo);
    }
  }
  return fugas;
}
