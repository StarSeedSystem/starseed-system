/**
 * Protomolécula · Planificador de cómputo.
 * Contrato: architecture/protomolecula.md §7 y §11.1.
 * Módulo PURO: sin React, sin red, sin `node:*`.
 */
import type { Computo, Ambito } from "./tipos";

/** Tipo de candidato para el planificador. */
export interface Candidato {
  tipo: Computo;
  neuronaId?: string;
  libreMB: number;
  gpu: boolean;
  consentimiento: boolean;
  cuentaPropia: boolean;
  ocupacion: number; // porcentaje de ocupación (0-100)
}

/**
 * Elige dónde ejecutar un átomo basado en sus requisitos y las capacidades de las neuronas disponibles.
 * @param req - Requisitos del átomo: memoriaMB, gpu, latenciaCritica, ambito, pesado.
 * @param candidatos - Lista de neuronas o destinos disponibles con sus características.
 * @returns Objeto con el destino elegido, opcionalmente el ID de la neurona y los motivos de la decisión.
 */
export function elegirComputo(
  req: {
    memoriaMB: number;
    gpu: boolean;
    latenciaCritica: boolean;
    ambito: Ambito;
    pesado: boolean;
  },
  candidatos: Candidato[]
): { destino: Computo; neuronaId?: string; motivos: string[] } {
  const motivos: string[] = [];

  // Paso 1: Filtrar por cuenta y permisos según el ámbito
  let filtrados = candidatos.filter(c => {
    if (req.ambito === "personal" || req.ambito === "perfil") {
      return c.cuentaPropia;
    }
    return c.cuentaPropia || c.consentimiento;
  });

  if (filtrados.length === 0) {
    motivos.push("No hay candidatos tras filtrar por cuenta y permisos; se usa el navegador");
    return { destino: "navegador", motivos };
  }

  // Paso 2: Si latencia crítica, preferir ejecución local (navegador o app-nativa)
  if (req.latenciaCritica) {
    const locales = filtrados.filter(c => c.tipo === "navegador" || c.tipo === "app-nativa");
    if (locales.length > 0) {
      const mejorLocal = locales.reduce((best, c) => c.libreMB > best.libreMB ? c : best);
      motivos.push(
        `Latencia crítica: se elige ${mejorLocal.tipo} por ejecución local (memoria libre: ${mejorLocal.libreMB} MB)`
      );
      return {
        destino: mejorLocal.tipo,
        neuronaId: mejorLocal.neuronaId,
        motivos,
      };
    }
  }

  // Paso 3: Si es pesado, buscar neurona con consentimiento, GPU (si se requiere) y suficiente memoria
  if (req.pesado) {
    const candidatosPesado = filtrados.filter(c => {
      if (!c.consentimiento) return false;
      if (req.gpu && !c.gpu) return false;
      return c.libreMB >= req.memoriaMB;
    });
    if (candidatosPesado.length > 0) {
      const mejor = candidatosPesado.reduce((best, c) => c.libreMB > best.libreMB ? c : best);
      motivos.push(
        `Tarea pesada: se elige ${mejor.tipo} ${mejor.neuronaId ?? ""} por consentimiento, GPU${req.gpu ? " requerida y disponible" : " no requerida"} y memoria suficiente (${mejor.libreMB} MB >= ${req.memoriaMB} MB)`
      );
      return {
        destino: mejor.tipo,
        neuronaId: mejor.neuronaId,
        motivos,
      };
    }
  }

  // Paso 4: Para tareas ligeras, considerar oracle-a1 (sin GPU, solo para lo ligero)
  if (!req.pesado && !req.gpu) {
    const oracleCandidates = filtrados.filter(c => c.tipo === "oracle-a1" && c.libreMB >= req.memoriaMB);
    if (oracleCandidates.length > 0) {
      const mejorOracle = oracleCandidates.reduce((best, c) => c.libreMB > best.libreMB ? c : best);
      motivos.push(
        `Tarea ligera: se elige oracle-a1 ${mejorOracle.neuronaId ?? ""} por memoria suficiente (${mejorOracle.libreMB} MB >= ${req.memoriaMB} MB) y no requiere GPU`
      );
      return {
        destino: "oracle-a1",
        neuronaId: mejorOracle.neuronaId,
        motivos,
      };
    }
  }

  // Paso 5: Considerar la nube (tipo "nube") si está disponible
  const nubeCandidates = filtrados.filter(c => c.tipo === "nube");
  if (nubeCandidates.length > 0) {
    const mejorNube = nubeCandidates.reduce((best, c) => c.libreMB > best.libreMB ? c : best);
    motivos.push(
      `Se elige nube ${mejorNube.neuronaId ?? ""} por memoria disponible (${mejorNube.libreMB} MB >= ${req.memoriaMB} MB)`
    );
    return {
      destino: "nube",
      neuronaId: mejorNube.neuronaId,
      motivos,
    };
  }

  // Paso 6: Como último recurso, usar el navegador
  motivos.push(
    "No se encontró candidato adecuado; se usa el navegador como último recurso"
  );
  return { destino: "navegador", motivos };
}