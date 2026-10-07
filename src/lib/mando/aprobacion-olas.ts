// StarSeed · Olas de mando con votación democrática (PT1009E)
// Funciones puras — sin red, sin disco, sin node:fs, sin Date.now().

import { proposalForChange } from "@/lib/governance/permissions";

// Los cuatro permisos que requieren propuesta aprobada en modo democrático (contrato §3).
const CAPACIDADES_QUE_REQUIEREN_VOTACION = new Set([
  "lanzar-olas",
  "publicar",
  "gestionar-motores",
  "usar-apis",
]);

/**
 * Determina si una capacidad dada en un ámbito necesita votación democrática para usarse.
 * Cuando la capacidad coincide con cualquiera de las cuatro requeridas y el ámbito ya
 * está en modo democrático, el usuario debe presentar una propuesta que se ejecute
 * al aprobarse. En jerárquico o en capacidades no listadas, basta con tener rol admin.
 */
export function necesitaVotacion(ambito: string, capacidad: string): boolean {
  return (
    CAPACIDADES_QUE_REQUIEREN_VOTACION.has(capacidad) &&
    ambito === "democratico"
  );
}

/**
 * Construye un borrador de propuesta para una ola completa: extrae cada capacidad
 * que necesita votación, arma un `proposalForChange` por capacidad y devuelve un solo
 * `ProposalDraft` donde la descripción enumera los permisos, el título lleva el número
 * de tareas y el payload es el cambio del MISMO tipo para TODO el borrador (para poder
 * llamarlo "propuesta única", tal como lo usa el motor).
 */
export function propuestaDeOla(
  ambito: string,
  ola: {
    nombre: string;
    tareas: { id: string; archivos?: string[] }[];
  },
  autor: string,
) {
  const todasLasCapacidades: string[] = [];
  for (const t of ola.tareas) {
    if (t.archivos) {
      todasLasCapacidades.push(...t.archivos);
    }
  }

  const unicas = Array.from(new Set(todasLasCapacidades));
  const relevantes = unicas.filter((c) => necesitaVotacion(ambito, c));

  if (relevantes.length === 0) {
    return null;
  }

  const todosLosArchivos = relevantes.flatMap((c) => ola.tareas.flatMap((t) => t.archivos || []));
  const archivosUnicos = Array.from(new Set(todosLosArchivos));

  const change = {
    kind: "set_permission" as const,
    permission: relevantes.join(", "),
    value: "true",
    label: `Las cuatro capacidades del modo democrático para la ola ${ola.nombre}`,
    note: `Permite a la ola "${ola.nombre}" lanzar tareas y gestionar motores.

Número de tareas: ${ola.tareas.length}
Archivos tocados: ${archivosUnicos.join(", ")}
Usará proveedores de pago: sí`,
  };

  const draft = proposalForChange(ambito, "", change);

  return {
    ...draft,
    title: `Lanzamiento de ola ${ola.nombre} (democrático)`, // título legible
    description: `Propone permitir las cuatro capacidades del modo democrático para la ola ${ola.nombre}:

- Lanzar olas
- Publicar
- Gestionar motores
- Usar APIs

${ola.tareas.length} tareas, ${archivosUnicos.length} archivos únicos tocados.
Aprobado por: ${autor}

La opción democrática siempre está disponible: este cambio se aplicará automáticamente si la mayoría lo aprueba.`,
  };
}

/**
 * Filtra un array de propuestas de gobernanza, devolviendo solo aquellas cuyos campos
 * coinciden con capacidades aprobadas: `aprobada` y no `vencida` (vence === undefined
 * o la fecha actual es anterior). Las propuestas `rechazada` nunca son aprobadas.
 */
export function capacidadesAprobadas(
  propuestas: { capacidad: string; estado: string; vence?: string }[],
  ahora: number,
): string[] {
  const ahoraMs = new Date(ahora).getTime();

  return propuestas
    .filter((p) => {
      if (p.estado !== "aprobada") return false;
      if (p.estado === "rechazada") return false;
      if (p.vence) {
        const venceMs = new Date(p.vence).getTime();
        if (venceMs <= ahoraMs) return false;
      }
      return true;
    })
    .map((p) => p.capacidad);
}
