/**
 * ProtoGenesis · validación de encargo y plan (PG1013A)
 * Módulo puro: sin node:, sin Supabase, sin window.
 * Contratación: architecture/protogenesis.md §2 y architecture/protomolecula.md §3·7·8.
 */

import type { Ambito } from "@/lib/protomolecula/tipos";
import type { Computo } from "@/lib/protomolecula/tipos";

export const TIPOS_CRITERIO = ["formato", "duracion-max", "tamano-max", "sin-secretos", "capas-presentes", "persona"] as const;
import { nivelesDe, pasosListos, repartirPasos, progreso, type EstadoPaso } from "./reparto";

export type Criterio = {
  tipo: (typeof TIPOS_CRITERIO)[number];
  valor?: string | number;
  texto: string;
};

export type Autor = {
  tipo: "persona" | "agente";
  id: string;
};

export interface Encargo {
  id: string;
  moleculaId: string;
  ambito: Ambito;
  entidadId?: string;
  intencion: string;
  criterios: Criterio[];
  autor: Autor;
  origen: "texto" | "dictado" | "agente";
  creadoEn: number;
}

export type Paso = {
  id: string;
  atomo: string;
  titulo: string;
  entradas: string[];
  salida: { formato: string };
  depende: string[];
  criterios: Criterio[];
  computo?: Computo;
};

export interface Plan {
  encargoId: string;
  pasos: Paso[];
};

export const LIMITES = {
  pasos: 24,
  agentes: 8,
  intentos: 2,
  intencion: 2000,
};

/**
 * Validar un encargo.
 * - Si no tiene criterios → error: "sin criterios comprobables no hay encargo"
 * - Devuelve {ok: true, encargo} o {ok: false, errores: string[]}
 */
export function validarEncargo(x: unknown): {
  ok: true; encargo: Encargo;
} | { ok: false; errores: string[] } {
  if (typeof x !== "object" || x === null || Array.isArray(x)) {
    return { ok: false, errores: ["encargo debe ser un objeto"] };
  }

  const encargo = x as Partial<Encargo>;

  if (!encargo.criterios || encargo.criterios.length === 0) {
    return { ok: false, errores: ["sin criterios comprobables no hay encargo"] };
  }

  // Validar tipos de criterio
  const tiposValidos = new Set(TIPOS_CRITERIO);
  for (const criterio of encargo.criterios) {
    if (!tiposValidos.has(criterio.tipo)) {
      return {
        ok: false,
        errores: [`tipo de criterio inválido: ${criterio.tipo}`],
      };
    }
    if (typeof criterio.texto !== "string") {
      return {
        ok: false,
        errores: ["cada criterio debe tener una propiedad texto string"],
      };
    }
  }

  // Validar ambito
  const ambitosValidos: Ambito[] = ["personal", "perfil", "grupo", "publica"];
  if (!ambitosValidos.includes(encargo.ambito as Ambito)) {
    return {
      ok: false,
      errores: [`ambito inválido: ${encargo.ambito}`],
    };
  }

  // Validar intencion
  if (typeof encargo.intencion !== "string" || encargo.intencion.length > LIMITES.intencion) {
    return { ok: false, errores: ["intencion inválida o demasiado larga"] };
  }

  // Validar autor
  if (
    typeof encargo.autor !== "object" ||
    encargo.autor === null ||
    !("tipo" in encargo.autor) ||
    !("id" in encargo.autor)
  ) {
    return { ok: false, errores: ["autor debe tener tipo e id"] };
  }
  if (encargo.autor.tipo !== "persona" && encargo.autor.tipo !== "agente") {
    return { ok: false, errores: [`autor tipo inválido: ${encargo.autor.tipo}`] };
  }

  // Validar origen
  const origenesValidos = ["texto", "dictado", "agente"];
  if (!origenesValidos.includes(encargo.origen as string)) {
    return {
      ok: false,
      errores: [`origen inválido: ${encargo.origen}`],
    };
  }

  return { ok: true, encargo: encargo as Encargo };
}

/**
 * Validar un plan de pasos.
 * Reglas:
 * - ids únicos
 * - depende a pasos existentes
 * - SIN ciclos (indica el ciclo)
 * - ≤ 24 pasos
 * - átomo 'no' → error
 * - 'solo-enlace' → aviso "próximamente"
 * - para cada entrada que es la salida de otro paso, si el formato no coincide y no hay conversión → aviso "falta conversor de X a Y"
 */
export function validarPlan(
  plan: unknown,
  ctx: {
    existeAtomo: (id: string) => "si" | "solo-enlace" | "no";
    hayConversion: (de: string, a: string) => boolean;
    formatoDe: (entrada: string) => string | null;
  }
): { ok: boolean; errores: string[]; avisos: string[] } {
  const errores: string[] = [];
  const avisos: string[] = [];

  if (typeof plan !== "object" || plan === null || Array.isArray(plan)) {
    return { ok: false, errores: ["plan debe ser un objeto"], avisos: [] };
  }

  const p = plan as Partial<Plan>;

  // Verificar pasos
  if (!p.pasos || !Array.isArray(p.pasos)) {
    return { ok: false, errores: ["plan debe tener un array de pasos"], avisos: [] };
  }

  const pasos = p.pasos;

  // ≤ 24 pasos
  if (pasos.length > LIMITES.pasos) {
    errores.push(`máximo ${LIMITES.pasos} pasos, recibieron ${pasos.length}`);
  }

  // IDs únicos y construiremos un mapa
  const idsPasos = new Set<string>();
  const pasoMap = new Map<string, Paso>();

  for (const paso of pasos) {
    if (paso.id) {
      if (idsPasos.has(paso.id)) {
        errores.push(`id de paso duplicado: ${paso.id}`);
      } else {
        idsPasos.add(paso.id);
      }
    }
    if (paso.depende && Array.isArray(paso.depende)) {
      for (const dep of paso.depende) {
        if (!idsPasos.has(dep)) {
          errores.push(`paso ${paso.id}: depende de paso inexistente: ${dep}`);
        }
      }
    }
    pasoMap.set(paso.id || `anon-${Math.random()}`, paso);
  }

  // Detectar ciclos usando DFS
  const visitando = new Set<string>();
  const visitado = new Set<string>();

  function tieneCiclo(id: string): boolean {
    visitando.add(id);
    const paso = pasoMap.get(id);
    if (paso && paso.depende && Array.isArray(paso.depende)) {
      for (const dep of paso.depende) {
        if (visitando.has(dep)) {
          return true;
        }
        if (!visitado.has(dep) && tieneCiclo(dep)) {
          return true;
        }
      }
    }
    visitando.delete(id);
    visitado.add(id);
    return false;
  }

  for (const paso of pasos) {
    if (paso.id && !visitado.has(paso.id)) {
      if (tieneCiclo(paso.id)) {
        errores.push(`plan tiene un ciclo en los pasos`);
        break;
      }
    }
  }

  // Validar cada paso
  for (const paso of pasos) {
    // átomo 'no' → error
    if (paso.atomo === "no") {
      errores.push(`paso ${paso.id || '?'}: átomo 'no' no es válido`);
    }

    // 'solo-enlace' → aviso "próximamente"
    if (paso.atomo === "solo-enlace") {
      avisos.push(`paso ${paso.id || '?'}: átomo 'solo-enlace' — próximamente`);
    }

    // Validar entradas que son salidas de otros pasos
    if (paso.entradas && Array.isArray(paso.entradas)) {
      for (const entrada of paso.entradas) {
        // Buscar si esta entrada es la salida de otro paso
        const pasoOrigen = pasos.find(
          (p) => p.id && p.id !== paso.id && p.salida && p.salida.formato === entrada
        );

        if (pasoOrigen) {
          const formatoSalida = pasoOrigen.salida?.formato || "";
          const hayConv = ctx.hayConversion(formatoSalida, entrada);
          if (!hayConv) {
            const formatoEntrada = ctx.formatoDe(entrada);
            if (!formatoEntrada) {
              avisos.push(`falta conversor de ${formatoSalida} a ${entrada}`);
            }
          }
        }
      }
    }
  }

  return {
    ok: errores.length === 0,
    errores,
    avisos,
  };
}

/**
 * Proceso principal del plan: calcula niveles, pasos listos, asignaciones y progreso.
 */
export function procesarPlan(
  plan: Plan,
  estados: Record<string, EstadoPaso>,
  agentes: Array<{ id: string; ocupado: boolean; puede?: string[] }> = [],
  tope = LIMITES.agentes
) {
  const niveles = nivelesDe(plan);
  const listos = pasosListos(plan, estados);
  const asignaciones = repartirPasos(listos, agentes, tope);
  const prog = progreso(plan, estados);
  return { niveles, listos, asignaciones, progreso: prog };
}
