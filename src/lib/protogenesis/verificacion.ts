/**
 * ProtoGenesis · Verificación por criterios (PG1013C)
 * Módulo puro: sin node:, sin Supabase, sin window.
 * Contracto: architecture/protogenesis.md §6·§6.2 (PG1013C), §2 y §6.2 (verificación), arquitectura/protomolecula.md §3·7·8.
 */

import type { Paso } from "./encargo";

export interface Resultado {
  formato: string;
  duracionS?: number;
  bytes?: number;
  texto?: string;
  capas?: string[];
}

export interface ResultadoVerificacion {
  ok: boolean;
  pendientes: string[];
  fallos: string[];
}

export type Quien = {
  id: string;
  tipo: "pruebas" | "bot" | "persona";
};

export const LIMITES = {
  intentos: 2,
};

/**
 * Normaliza un string para comparar formatos.
 */
export function normalizarFormato(x: unknown): string {
  if (typeof x !== "string") {
    return "";
  }
  return x.trim().toLowerCase();
}

/**
 * Verifica un paso según su criterio, resultado y quién lo verifica.
 * Reglas:
 * - El autor no puede verificarse a sí mismo.
 * - 'formato' compara normalizado.
 * - 'duracion-max' y 'tamano-max' numéricos.
 * - 'sin-secretos' busca patrones y monta con join.
 * - 'capas-presentes' exige todas.
 * - 'persona' queda pendiente hasta manuales[i].
 */
export function verificarPaso(
  paso: Paso,
  r: Resultado,
  quien: Quien,
  autorId: string,
  manuales?: Record<number, boolean>
): ResultadoVerificacion {
  const pendientes: string[] = [];
  const fallos: string[] = [];

  // El autor no puede verificarse a sí mismo
  if (quien.id === autorId) {
    return { ok: false, pendientes: [], fallos: ["el autor no puede verificarse a sí mismo"] };
  }

  for (const criterio of paso.criterios) {
    const index = paso.criterios.indexOf(criterio);

    switch (criterio.tipo) {
      case "formato":
        if (!r.formato || normalizarFormato(r.formato) !== normalizarFormato(criterio.valor)) {
          fallos.push(`formato '${criterio.texto}' no coincide (esperado: ${criterio.valor}, recibido: ${r.formato})`);
        }
        break;

      case "duracion-max":
        if (typeof r.duracionS !== "number" || r.duracionS > (criterio.valor as number)) {
          fallos.push(`duración ${r.duracionS} excede el máximo de ${criterio.valor}`);
        }
        break;

      case "tamano-max":
        if (typeof r.bytes !== "number" || r.bytes > (criterio.valor as number)) {
          fallos.push(`tamaño ${r.bytes} excede el máximo de ${criterio.valor}`);
        }
        break;

      case "sin-secretos":
        const secretos = [
          "sk-",
          "gsk_",
          "Bearer ",
          "ghp_",
          "AKIA",
          ...((criterio.valor as string[]) || []).map((v) => v.trim()),
        ];
        const texto = r.texto || "";
        const coincidencia = secretos.some((s) => texto.toLowerCase().includes(s.toLowerCase()));
        if (coincidencia) {
          fallos.push(`el resultado contiene texto secreto: ${criterio.texto}`);
        }
        break;

      case "capas-presentes":
        if (!r.capas || !criterio.valor || !Array.isArray(criterio.valor)) {
          pendientes.push(criterio.texto);
        } else {
          const faltantes = (criterio.valor as string[]).filter((c) => !r.capas?.includes(c));
          if (faltantes.length > 0) {
            fallos.push(`falta capas: ${faltantes.join(", ")}`);
          }
        }
        break;

      case "persona":
        if (manuales && manuales[index]) {
          // Criterio manual aprobado
        } else {
          pendientes.push(criterio.texto);
        }
        break;

      default:
        fallos.push(`tipo de criterio no implementado: ${criterio.tipo}`);
        break;
    }
  }

  return { ok: fallos.length === 0, pendientes, fallos };
}

/**
 * Decide el siguiente intento tras un fallo.
 * Reglas:
 * - Si intentos < LIMITES.intentos → 'reintentar'
 * - Si no → 'necesita-mano'
 */
export function siguienteIntento(intentos: number): "reintentar" | "necesita-mano" {
  if (intentos < LIMITES.intentos) {
    return "reintentar";
  }
  return "necesita-mano";
}
