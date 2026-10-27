// PDF · Modelo puro del panel «Editar PDF» (PDF1020B): tipos, catálogo y funciones
// puras — sin red, sin disco y sin `node:*` (lo importan el cliente y las pruebas).
// Rutas y parámetros verificados EN docs.stirlingpdf.com el 2026-10-27 (v3.2.0, la
// medida del A1); la descripción de API de la instancia vive en `/v1/api-docs`.

/** Configuración del servidor Stirling-PDF (endpoint y clave opcionales). */
export type ConfigStirlingPdf = { endpoint?: string; apiKey?: string };

/** Un parámetro mínimo que la operación pide (etiqueta en español). */
export type ParamPdf = {
  id: string; etiqueta: string; tipo: "texto" | "numero" | "lista";
  obligatorio?: boolean; defecto?: string; opciones?: string[]; ejemplo?: string;
};
/** Una operación que el panel sabe pedir a un Stirling-PDF con API MIT. */
export type OperacionPdf = { id: string; etiqueta: string; descripcion: string; ruta: string; params: ParamPdf[] };
/** Valores del formulario, listos para ir al servidor. */
export type ValoresPdf = Record<string, string>;
/** La forma mínima del archivo que se edita (tolerante a FileLike del OS). */
export type ArchivoPdf = { nombre?: string | null; url?: string | null; tamano?: number | string | null };
/** Resultado honesto de ejecutar una operación (blob NUEVO, nunca el original). */
export type ResOperacion = { ok: boolean; blob?: Blob; contentType?: string; error?: string };
/** Lo que el cliente cuenta del servidor antes de ejecutar nada. */
export type PreparacionPdf = { ok: boolean; endpoint?: string; operaciones?: OperacionPdf[]; aviso?: string; error?: string };
/** Cliente de PDF: inyectable (real en el navegador, simulado en pruebas). */
export type ClientePdf = {
  preparar: (cfg: ConfigStirlingPdf) => Promise<PreparacionPdf>;
  ejecutar: (op: OperacionPdf, archivo: ArchivoPdf, valores: ValoresPdf, cfg: ConfigStirlingPdf) => Promise<ResOperacion>;
};


export const MENSAJE_SIN_SERVIDOR =
  "Editar PDF necesita un servidor Stirling-PDF; conecta uno en Conectores o deja que la malla lo busque.";
export const MENSAJE_DESCRIPCION_INDISPONIBLE =
  "No pude leer la descripción de la API del servidor; te enseño el catálogo completo y, si una operación no existe, el servidor lo dirá al ejecutarla.";
export const RUTA_API_DESCRIPCION = "/v1/api-docs";
export const ENLACE_GITHUB_STIRLING = "https://github.com/Stirling-Tools/Stirling-PDF";

export const OPERACIONES_PDF: OperacionPdf[] = [
  {
    id: "rotar-paginas", etiqueta: "Rotar páginas", descripcion: "Gira las páginas 90, 180 o 270 grados.",
    ruta: "/api/v1/general/rotate-pdf",
    params: [{ id: "angle", etiqueta: "Giro", tipo: "lista", opciones: ["90", "180", "270"], defecto: "90" }],
  },
  {
    id: "reorganizar-paginas", etiqueta: "Reordenar páginas",
    descripcion: "Reordena las páginas con el orden nuevo que escribas (duplica si se repiten).", ruta: "/api/v1/general/rearrange-pages",
    params: [{ id: "pageNumbers", etiqueta: "Orden nuevo", tipo: "texto", obligatorio: true, ejemplo: "3,1,2,4" }],
  },
  {
    id: "dividir-paginas", etiqueta: "Dividir",
    descripcion: "Parte el PDF en los números de página indicados; devuelve un paquete ZIP.", ruta: "/api/v1/general/split-pages",
    params: [{ id: "pageNumbers", etiqueta: "Partir en", tipo: "texto", obligatorio: true, ejemplo: "1-3" }],
  },
  {
    id: "quitar-paginas", etiqueta: "Quitar páginas",
    descripcion: "Borra del PDF las páginas indicadas y guarda el resto.",
    ruta: "/api/v1/general/remove-pages",
    params: [{ id: "pageNumbers", etiqueta: "Páginas a quitar", tipo: "texto", obligatorio: true, ejemplo: "2,7" }],
  },
  {
    id: "comprimir-pdf", etiqueta: "Comprimir",
    descripcion: "Reduce el peso del PDF con el nivel de optimización elegido.", ruta: "/api/v1/misc/compress-pdf",
    params: [{ id: "optimizeLevel", etiqueta: "Nivel de optimización", tipo: "numero", defecto: "5" }],
  },
  {
    id: "ocr-pdf", etiqueta: "OCR (hacer buscable)",
    descripcion: "Reconoce el texto de las imágenes del PDF para que sea buscable.", ruta: "/api/v1/misc/ocr-pdf",
    params: [
      { id: "languages", etiqueta: "Idiomas", tipo: "texto", obligatorio: true, ejemplo: "spa" },
      { id: "ocrType", etiqueta: "Modo OCR", tipo: "texto", defecto: "skip-text" },
      { id: "ocrRenderType", etiqueta: "Cómo se dibuja", tipo: "texto", defecto: "hocr" },
    ],
  },
  {
    id: "marca-agua", etiqueta: "Marca de agua",
    descripcion: "Añade un texto de marca de agua a todas las páginas.", ruta: "/api/v1/security/add-watermark",
    params: [
      { id: "watermarkText", etiqueta: "Texto", tipo: "texto", obligatorio: true, ejemplo: "Copias de trabajo" },
      { id: "fontSize", etiqueta: "Tamaño de letra", tipo: "numero", defecto: "30" },
      { id: "rotation", etiqueta: "Giro del texto", tipo: "numero", defecto: "0" },
      { id: "opacity", etiqueta: "Opacidad", tipo: "numero", defecto: "0.5" },
    ],
  },
];

/** Valores iniciales del formulario: el defecto del modelo o vacío. */
export function valoresIniciales(op: OperacionPdf): ValoresPdf {
  const valores: ValoresPdf = {};
  for (const p of op.params) valores[p.id] = p.defecto ?? "";
  return valores;
}
/** Los parámetros obligatorios que siguen vacíos (no se deja ejecutar). */
export function camposFaltantes(op: OperacionPdf, valores: ValoresPdf): string[] {
  return op.params.filter((p) => p.obligatorio && !(valores[p.id] ?? "").trim()).map((p) => p.id);
}
/** Pares exactos `<campo servidor, valor>` que se envían, sin vacíos. */
export function camposFormularioPdf(op: OperacionPdf, valores: ValoresPdf): Array<[string, string]> {
  return op.params.map((p) => [p.id, (valores[p.id] ?? "").trim()] as [string, string]).filter(([, v]) => v !== "");
}
/** Interseca el catálogo con las rutas de la descripción de API real. */
export function operacionesDesdeDescripcion(dato: unknown): { disponibles: OperacionPdf[]; leida: boolean } {
  let rutas: string[] = [];
  try {
    const json = typeof dato === "string" ? (JSON.parse(dato) as unknown) : dato;
    const paths = (json as { paths?: Record<string, unknown> } | null)?.paths;
    rutas = paths && typeof paths === "object" ? Object.keys(paths) : [];
  } catch {
    rutas = [];
  }
  if (rutas.length === 0) return { disponibles: [...OPERACIONES_PDF], leida: false };
  const rutasNorm = new Set(rutas.map((r) => r.replace(/\/+$/, "")));
  return { disponibles: OPERACIONES_PDF.filter((op) => rutasNorm.has(op.ruta)), leida: true };
}
/** Nombre de la versión nueva: NUNCA sobre el original (extensión según blob). */
export function nombreVersionNueva(nombreOriginal: string, tipoContenido = ""): string {
  const sinExt = nombreOriginal.replace(/\.[a-zA-Z0-9]+$/, "");
  const salida = /zip/i.test(tipoContenido) ? "zip" : "pdf";
  return `${sinExt || "documento"} · versión nueva.${salida}`;
}
