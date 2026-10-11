/**
 * Túnel de MetaGenesis · lo PURO (tipos y tachado), sin nada de Node.
 *
 * Por qué existe (2026-10-11): el componente de cliente importaba `tacharTexto` desde
 * `tunel-metagenesis-estado.ts`, que abre con `node:child_process`, `node:fs/promises` y
 * `node:util`. tsc y las pruebas de la tarea pasaron, pero `next build` murió con
 * «UnhandledSchemeError: node:child_process» y la guarda `sin-node-en-cliente` se puso roja:
 * main quedó rojo y el nodo de MetaGenesis en la A1 dejó de tomar tareas. Regla de CLAUDE.md
 * («Publicar: next build»): lo que lee el navegador va aquí; el servidor lo reexporta.
 */

export interface EstadoTunelMetaGenesis {
  cargado: boolean;
  pid: number | null;
  ultimasLineas: string[];
  /** ISO 8601 */
  medidoEn: string;
}

/** Sustituye las URL de trycloudflare por «[túnel]»: la dirección del túnel nunca se enseña. */
export function tacharTexto(texto: string): string {
  return texto.replace(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g, "[túnel]");
}
