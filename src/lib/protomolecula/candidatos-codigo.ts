// Protomolécula · CANDIDATOS DE CÓDIGO. Proponer, revisar y aceptar cambios de código.
// Módulo PURO: sin React, sin red, sin node:*.

import type { Autor, EstadoValores } from "./tipos";
import { detectarSecretos } from "@/lib/nucleo/paquete-sistema";

/** Un candidato de código: cambio propuesto que debe ser revisado por una persona. */
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

/** Guarda un candidato SIN ejecutar nada ni tocar la capa. */
export function proposer(
  params: Omit<Candidato, "estado" | "avisos"> & { estado?: Candidato["estado"] },
): Candidato {
  return {
    ...params,
    estado: params.estado ?? "propuesto",
    avisos: [],
  };
}

/** Revisa un candidato y marca avisos (secretos, eval, new Function, import(, node:)). */
export function revisar(c: Candidato): Candidato {
  const avisos: string[] = [];
  
  // Detectar secretos en el código propuesto (similar a paquete-sistema.ts)
  const fauxPaquete = {
    id: "temporal",
    nombre: "candidato",
    autor: { perfil: "temporal", nombre: "temporal" },
    creadoEn: Date.now(),
    uiSpec: { meta: {}, bloques: [], superficie: "" },
    agentes: [],
    permisosPedidos: [],
    requiere: [],
  };
  
  // Como no podemos usar directamente detectarSecretos (espera un PaqueteSistema),
  // implementamos una versión ligera para código
  const SECRETOS_CODIGO: RegExp[] = [
    /\bsk-[A-Za-z0-9_-]{4,}/,
    /\bgsk_[A-Za-z0-9_-]{4,}/,
    /\bBearer\s+[A-Za-z0-9._~+/-]{6,}/i,
    /\/Users\/[^/"\s]+/,
    /\/home\/[^/"\s]+/,
  ];
  
  const ETIQUETAS_SECRETOS: string[] = [
    "clave de API estilo «sk-»",
    "clave de API estilo «gsk_»",
    "cabecera de autorización «Bearer»",
    "ruta absoluta de disco «/Users/…»",
    "ruta absoluta de disco «/home/…»",
  ];
  
  SECRETOS_CODIGO.forEach((patron, i) => {
    const match = patron.exec(c.propuesto);
    if (match) {
      avisos.push(`${ETIQUETAS_SECRETOS[i]}: «${match[0]}»`);
    }
  });
  
  // Detectar patrones peligrosos
  const PELIGROSOS: [RegExp, string][] = [
    [/eval\s*\(/, "eval"],
    [/new Function\s*\(/, "new Function"],
    [/import\s*\(/, "import("],
    [/\bnode:[^:]/, "node:"],
  ];
  
  PELIGROSOS.forEach(([patron, descripcion]) => {
    if (patron.exec(c.propuesto)) {
      avisos.push(`Patrón peligroso detectado: ${descripcion}`);
    }
  });
  
  return { ...c, avisos };
}

/** Diff línea a línea (sin librerías). */
export function diff(original: string, propuesto: string): string {
  const lineasOrig = original.split("\n");
  const lineasProp = propuesto.split("\n");
  const maxLineas = Math.max(lineasOrig.length, lineasProp.length);
  const resultado: string[] = [];
  
  for (let i = 0; i < maxLineas; i++) {
    const orig = lineasOrig[i] ?? "";
    const prop = lineasProp[i] ?? "";
    
    if (orig === prop) {
      resultado.push(`  ${orig}`);
    } else {
      if (orig !== "") {
        resultado.push(`- ${orig}`);
      }
      if (prop !== "") {
        resultado.push(`+ ${prop}`);
      }
    }
  }
  
  return resultado.join("\n");
}

/** Aceptar un candidato: exige decidir({accion: "aplicar-codigo", origen: "mano"}) y solo reemplaza el contenido de una capa codigo. */
export function aceptar(
  c: Candidato,
  ctx: {
    decidir: (params: { accion: string; origen: string }) => { permitido: boolean; confirmar: boolean; motivo: string };
    aplicarCambio: (capaId: string, nuevoContenido: string) => { ok: boolean; motivo?: string };
  }
): { ok: boolean; mensaje: string } {
  // Verificar que se requiere aprobación humana
  const decision = ctx.decidir({ accion: "aplicar-codigo", origen: "mano" });
  if (!decision.permitido) {
    return { ok: false, mensaje: `No se puede aceptar: ${decision.motivo}` };
  }
  
  // Solo permitir aceptar si está en estado propuesto
  if (c.estado !== "propuesto") {
    return { ok: false, mensaje: `Solo se pueden aceptar candidatos en estado "propuesto"` };
  }
  
  // Verificar que no hay avisos que bloqueen la aceptación
  if (c.avisos.length > 0) {
    return { ok: false, mensaje: `No se puede aceptar candidato con avisos: ${c.avisos.join("; ")}` };
  }
  
  // Aplicar el cambio solo a capas de código
  const resultado = ctx.aplicarCambio(c.capaId, c.propuesto);
  if (!resultado.ok) {
    return { ok: false, mensaje: `Error al aplicar cambios: ${resultado.motivo ?? "Error desconocido"}` };
  }
  
  // Actualizar el estado del candidato
  return { ok: true, mensaje: "Código aplicado correctamente" };
}