// ═══════════════════════════════════════════════════════════════════════════
// StarSeed OS · EGM · Peces (revisores sin contexto)
// ------------------------------------------------------------------------------
// Módulo PURO: funciones para revisar artefactos sin contexto.
// No importa `node:*`, no hace I/O. El cliente puede importarlo directamente.
// ═══════════════════════════════════════════════════════════════════════════

export type GravedadObjecion = "bloquea" | "importa" | "menor";

export interface Objecion {
  gravedad: GravedadObjecion;
  texto: string;
}

export interface ResultadoVeredicto {
  pasa: boolean;
  bloqueantes: Objecion[];
}

export type ArtefactoTipo = "respuesta" | "plan" | "ola" | "pagina" | "app";

export interface Artefacto {
  contenido: string;
  tipo: ArtefactoTipo;
}

export function promptDePez(artefacto: Artefacto, tipo: ArtefactoTipo): string {
  const tipoTexto = {
    respuesta: "respuesta larga",
    plan: "plan de trabajo",
    ola: "ola de tareas",
    pagina: "página de diseño",
    app: "aplicación",
  }[tipo];

  return `Eres un "pez", un revisor sin contexto que solo ve el ${tipoTexto} siguiente.
NO veas el proyecto, el cerebro del agente ni ningún contexto adicional.
Revisa línea por línea y responde una objeción por línea con su gravedad.

Formato de respuesta:
- Para cada línea problematica: [bloquea|importa|menor] texto de la objeción
- Usa "menor" para observaciones menores, "importa" para problemas que pueden solucionarse,
  "bloquea" para errores críticos que impiden continuar.

Artefacto a revisar:
${artefacto.contenido.slice(0, 3000)}${artefacto.contenido.length > 3000 ? "\n... (truncado)" : ""}

Responde SOLO con las objeciones en el formato indicado, sin explicaciones adicionales.`;
}

export function leerObjeciones(texto: string): Objecion[] {
  const lineas = texto.split("\n");
  const vistas = new Set<string>();
  const resultado: Objecion[] = [];

  for (const linea of lineas) {
    const coincidencia = linea.match(/^\[(bloquea|importa|menor)\]\s*(.+)$/i);
    if (!coincidencia) continue;

    const [, gravedad, textoObj] = coincidencia;
    const textoLimpio = textoObj.trim();
    if (!textoLimpio || vistas.has(textoLimpio)) continue;

    vistas.add(textoLimpio);
    resultado.push({ gravedad: gravedad.toLowerCase() as GravedadObjecion, texto: textoLimpio });
  }

  return resultado;
}

export function veredicto(objeciones: Objecion[]): ResultadoVeredicto {
  const bloqueantes = objeciones.filter((o) => o.gravedad === "bloquea");
  return {
    pasa: bloqueantes.length === 0,
    bloqueantes,
  };
}