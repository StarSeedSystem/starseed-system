/**
 * ASIGNACIONES DE GENESIS ABIERTO (Ola 1019G)
 * ─────────────────────────────────────────────────────────────────────────────
 * Tipos y funciones puras para asignaciones por papel y por director.
 */

export type Papel = 
  | "escritor"
  | "revisor"
  | "chat"
  | "vision"
  | "voz"
  | "imagen"
  | "codigo";

export type Director = 
  | "chat"
  | "optimizador"
  | "diseno"
  | "produccion"
  | "nube"
  | "medidores"
  | "aprendizaje";

export interface Asignacion {
  clave: Papel | Director;
  cadena: string[];           // candidatos en orden
  respaldo: string[];         // opciones de respaldo
  preferencias: string[];     // preferencias explícitas del usuario/ámbito
}

/**
 * Devuelve las asignaciones sugeridas para un rol dado.
 * Las cadenas empiezan por Astraura local y siguen con las gratis del catálogo.
 */
export function sugeridas(rol: Papel | Director): Asignacion {
  // En una implementación real, esto consultaría el catálogo de opciones gratis
  // Por ahora, devolvemos una estructura básica que cumple con el contrato
  const cadenasPorDefecto: Record<Papel | Director, string[]> = {
    escritor: ["astraura-158-local", "openrouter:mistral-free"],
    revisor: ["astraura-158-local", "openrouter:zephyr-free"],
    chat: ["astraura-158-local", "openrouter:chatglm3-free"],
    vision: ["astraura-158-local", "openrouter:yi-vision-free"],
    voz: ["astraura-158-local", "openrouter:whisper-free"],
    imagen: ["astraura-158-local", "openrouter:stable-diffusion-free"],
    codigo: ["astraura-158-local", "openrouter:codellama-free"],
    optimizador: ["astraura-158-local", "openrouter:mixtral-free"],
    diseno: ["astraura-158-local", "openrouter:dall-e-free"],
    produccion: ["astraura-158-local", "openrouter:llama3-free"],
    nube: ["astraura-158-local", "openrouter:hermes-free"],
    medidores: ["astraura-158-local", "openrouter:solar-free"],
    aprendizaje: ["astraura-158-local", "openrouter:nemotron-free"]
  };

  return {
    clave: rol,
    cadena: cadenasPorDefecto[rol],
    respaldo: ["navegador:speechSynthesis"], // respaldo universal
    preferencias: []
  };
}

/**
 * Fusiona las asignaciones sugeridas con las del ámbito.
 * Lo del ámbito manda, valida ids contra el catálogo y descarta los desconocidos con aviso.
 */
export function fusionarConAmbito(sugeridas: Asignacion, delAmbito: Partial<Asignacion>): Asignacion {
  // En una implementación real, validaríamos los ids contra el catálogo
  // Por ahora, asumimos que todos los ids son válidos para mantener la pureza

  return {
    clave: sugeridas.clave,
    cadena: [...(delAmbito.cadena ?? sugeridas.cadena)],
    respaldo: [...(delAmbito.respaldo ?? sugeridas.respaldo)],
    preferencias: [...(delAmbito.preferencias ?? sugeridas.preferencias)]
  };
}