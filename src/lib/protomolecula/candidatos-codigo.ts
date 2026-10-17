// Protomolécula · CANDIDATOS DE CÓDIGO (PM1010F7A)
// Contrato: `architecture/protomolecula.md` §8.2, §11.1
// Módulo PURO: sin React, sin red, sin `node:*`.

import type { Autor } from "./tipos";

export interface Candidato {
  id: string;
  capaId: string;
  lenguajeOrigen: string;
  lenguajeDestino?: string;
  propuesto: string;
  original: string;
  autor: Autor;
  estado: "propuesto" | "aceptado" | "rechazado";
  avisos: string[];
}

/**
 * Guarda un candidato de código sin ejecutarlo ni tocar la capa.
 * @param estadoActual Estado actual que contiene un array de pendientes (de tipo Candidato[])
 * @param candidato Candidato a guardar
 * @returns Nuevo estado con el candidato añadido al array de pendientes
 */
export function proposer(
  estadoActual: { pendientes: Candidato[] },
  candidato: Candidato
): { pendientes: Candidato[] } {
  return {
    pendientes: [...estadoActual.pendientes, candidato]
  };
}

/**
 * Revisa un candidato de código y marca avisos (secretos, usos prohibidos, etc.).
 * @param candidato Candidato a revisar
 * @returns Nuevo candidato con avisos marcados
 */
export function revisar(candidato: Candidato): Candidato {
  // Clones the candidate to avoid mutating the original
  const nuevo: Candidato = { ...candidato, avisos: [...candidato.avisos] };

  // Define patterns for secrets and prohibited usage
  const patronesSecretos = [
    /sk_[a-zA-Z0-9_]{32,}/, // Stripe secret key pattern (allows underscore)
    /gsk_[a-zA-Z0-9_]{32,}/, // GitHub secret key pattern (allows underscore)
    /Bearer\s+[a-zA-Z0-9\-_\.=]+/, // Bearer token
  ];

  const codigo = candidato.propuesto;

  // Check for secrets
  if (patronesSecretos.some(patron => patron.test(codigo))) {
    nuevo.avisos.push("Secreto detectado en el código");
  }

  // Check for prohibited patterns
  const patronesProhibidos = [
    /eval\s*\(/,
    /new\s+Function\s*\(/,
    /import\s*\(/,
    /node:[fs]|child_process|os|path/ // Simplified, we'll check for node: followed by module names
  ];

  if (patronesProhibidos.some(patron => patron.test(codigo))) {
    nuevo.avisos.push("Uso de funcionalidad prohibida (eval, new Function, import dinámico o node:*)");
  }

  return nuevo;
}

/**
 * Calcula el diff línea a línea entre dos strings.
 * @param original Código original
 * @param propuesto Código propuesto
 * @returns Objeto con líneas añadidas y eliminadas
 */
export function diff(original: string, propuesto: string): {
  añadidas: string[];
  eliminadas: string[];
} {
  const lineasOrig = original.split('\n');
  const lineasProp = propuesto.split('\n');
  const maxLen = Math.max(lineasOrig.length, lineasProp.length);
  const añadidas: string[] = [];
  const eliminadas: string[] = [];

  for (let i = 0; i < maxLen; i++) {
    const lineaOrig = lineasOrig[i] ?? '';
    const lineaProp = lineasProp[i] ?? '';

    if (lineaOrig !== lineaProp) {
      if (lineaOrig && !lineaProp) {
        eliminadas.push(lineaOrig);
      } else if (!lineaOrig && lineaProp) {
        añadidas.push(lineaProp);
      } else {
        // Line changed: consider as removal and addition
        eliminadas.push(lineaOrig);
        añadidas.push(lineaProp);
      }
    }
  }

  return { añadidas, eliminadas };
}

/**
 * Acepta un candidato de código, reemplazando el contenido de una capa de código de la molécula.
 * @param candidato Candidato a aceptar
 * @param ctx Contexto que debe incluir una función `decidir` para validar la acción humana
 * @param estadoActual Estado actual que contiene una molécula con capas
 * @returns Nuevo estado con la capa de código actualizada y el candidato marcado como aceptado
 */
export function aceptar(
  candidato: Candidato,
  ctx: { decidir: (accion: { accion: string; origen: string }) => boolean },
  estadoActual: {
    molecula: {
      capas: {
        id: string;
        tipo: string;
        contenido: string; // We assume the capa has a content field
      }[];
    };
  }
): {
  molecula: {
    capas: {
      id: string;
      tipo: string;
      contenido: string;
    }[];
  };
  candidato: Candidato; // Updated candidate state (accepted)
} {
  // First, validate the human action
  const accionValida = ctx.decidir({ accion: "aplicar-codigo", origen: "mano" });
  if (!accionValida) {
    // If not valid, we return the state unchanged and the candidate remains proposed
    return {
      molecula: estadoActual.molecula,
      candidato: { ...candidato } // Return the candidate unchanged
    };
  }

  // We assume the molecula has capas and that the capa with the given id has a content field
  const molecula = estadoActual.molecula;
  const capaIndex = molecula.capas.findIndex(capa => capa.id === candidato.capaId && capa.tipo === "codigo");
  if (capaIndex === -1) {
    // If no matching code layer is found, we return the state unchanged and the candidate unchanged
    return {
      molecula: estadoActual.molecula,
      candidato: { ...candidato }
    };
  }

  // We assume the Capa interface has a content field (we will access it as any)
  const capaActual = molecula.capas[capaIndex];
  // We create a new capa with the updated content
  const capaActualizada = {
    ...capaActual,
    contenido: candidato.propuesto // We assume the capa has a content field
  };

  // We update the molecula's capas array
  const nuevasCapas = [...molecula.capas];
  nuevasCapas[capaIndex] = capaActualizada;

  // We return the updated state and the candidate marked as accepted
  return {
    molecula: {
      ...estadoActual.molecula,
      capas: nuevasCapas
    },
    candidato: { ...candidato, estado: "aceptado" }
  };
}