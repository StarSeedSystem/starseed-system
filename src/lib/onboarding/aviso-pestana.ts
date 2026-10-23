/**
 * Aviso accesible para enlaces que abren una pestaña nueva.
 *
 * El texto visible («Visitar», «Abrir Astraura AI») no dice que el contexto va a
 * cambiar; el nombre accesible sí debe decirlo para no desorientar a quien usa
 * lector de pantalla. El icono que acompaña al enlace es decorativo (`aria-hidden`),
 * así que el aviso viaja en la etiqueta.
 */
export const AVISO_PESTANA_NUEVA = '(se abre en una pestaña nueva)';

export function etiquetaEnlaceNuevaPestana(texto: string): string {
  if (texto.includes(AVISO_PESTANA_NUEVA)) return texto;
  return `${texto} ${AVISO_PESTANA_NUEVA}`;
}
