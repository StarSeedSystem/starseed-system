/**
 * Imágenes de Astraura · BORRADOR DE PUBLICACIÓN (IMG1011C). Contrato: architecture/astraura-imagenes.md §6.
 *
 * La regla del taller de agentes manda («deja el borrador para visto bueno: nunca publiques
 * solo», src/lib/agentes/taller.ts): esto NO publica nada en ningún canal ni en Supabase.
 * Prepara el TEXTO del borrador (que es lo que la persona confirma) con la atribución y la
 * licencia a la vista, más el enlace de la imagen. Cómo se guarda lo decide el hook
 * (hoy: como apartado «borrador-publicacion» de la Biblioteca local). PURO.
 */
export interface OpcionBorrador {
  /** Enlace de la imagen ya generada (una opción solo sirve la referencia: aún no hay URL). */
  url?: string;
  /** Lo que se pidió (el prompt), con su apodo para el título. */
  tema: string;
  modelo: string | null;
  licencia: string;
  atribucion: string;
}

export interface BorradorPublicacion {
  titulo: string;
  texto: string;
}

/** El primer renglón del título: las initial de la idea de quien pide. */
export function tituloDeBorrador(op: OpcionBorrador): string {
  const tema = (op.tema || "imagen").trim().replace(/\s+/g, " ").slice(0, 60);
  const quien = op.modelo ? op.modelo : "imagen Astraura";
  return `Borrador · ${quien}: ${tema}`;
}

/** Una sola cita de la imagen con la licencia visible, del atribución dada por la galería. */
export function textoDeBorrador(op: OpcionBorrador): string {
  const lineas = [op.atribucion || "Imagen generada con Astraura.", `Licencia: ${op.licencia || "sin declarar"}.`];
  if (op.url) lineas.push(`Imagen: ${op.url}`);
  return lineas.join("\n");
}

/** El borrador completo, sin publicar nada. PURO: entra una opción, sale { titulo, texto }. */
export function borradorDePublicacion(op: OpcionBorrador): BorradorPublicacion {
  return { titulo: tituloDeBorrador(op), texto: textoDeBorrador(op) };
}
