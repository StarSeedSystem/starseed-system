/**
 * Centro de Creación (cortina Horizon) · DATOS de sus entradas.
 *
 * Cada entrada lleva un destino REAL: una ruta que existe en `src/app/**` o un evento global que atiende un
 * anfitrión montado en el layout raíz (`starseed:open-editor` → GlobalEditorHost, `starseed:open-forge` →
 * GlobalForgeHost). La prueba `rutas-crear.test.ts` recorre `src/app` y falla si una ruta de esta lista deja
 * de existir: una ficha no promete lo que no hace.
 */
import {
  Box,
  Camera,
  FileText,
  Hammer,
  Library,
  Palette,
  Pencil,
  RefreshCw,
  Scale,
  School,
  Sparkles,
  Table2,
  type LucideIcon,
} from "lucide-react";

export type DestinoAccion =
  | { tipo: "ruta"; href: string }
  | { tipo: "editor" }
  | { tipo: "fragua" };

export interface AccionCrear {
  id: string;
  rotulo: string;
  /** Texto corto bajo el rótulo (una línea en 360 px). */
  sub: string;
  icono: LucideIcon;
  destino: DestinoAccion;
}

/** Rutas fijas de la cortina. */
export const RUTA_PAGINA_COMPLETA = "/crear";
export const RUTA_PROTOMOLECULA = "/protomolecula";
export const RUTA_PIZARRAS_NUBE = "/pizarras";

/** La entrada principal: el Lienzo Universal (publicaciones por bloques). */
export const LIENZO_UNIVERSAL: AccionCrear = {
  id: "lienzo",
  rotulo: "Lienzo Universal",
  sub: "Bloques, archivos y widgets para cualquier sección de la red",
  icono: Sparkles,
  destino: { tipo: "ruta", href: "/crear?area=lienzo" },
};

/** Rejilla de acciones rápidas (2 columnas desde 360 px). */
export const ACCIONES_CREAR: AccionCrear[] = [
  { id: "editor", rotulo: "Editor Universal", sub: "Edita cualquier sección", icono: Pencil, destino: { tipo: "editor" } },
  { id: "fragua", rotulo: "Fragua de Widgets", sub: "Widgets hechos con IA", icono: Hammer, destino: { tipo: "fragua" } },
  { id: "estudio", rotulo: "Estudio de Diseño", sub: "Diseño 2D y 3D", icono: Palette, destino: { tipo: "ruta", href: "/estudio" } },
  { id: "escena", rotulo: "Escenas 3D", sub: "Espacios en grupo", icono: Box, destino: { tipo: "ruta", href: "/escena" } },
  { id: "documentos", rotulo: "Documentos", sub: "Textos y diapositivas", icono: FileText, destino: { tipo: "ruta", href: "/documentos" } },
  { id: "tabla", rotulo: "Tablas de datos", sub: "Hojas en vivo", icono: Table2, destino: { tipo: "ruta", href: "/tabla" } },
  { id: "convertir", rotulo: "Convertir", sub: "Cambia de formato", icono: RefreshCw, destino: { tipo: "ruta", href: "/convertir" } },
  { id: "camara", rotulo: "Cámara", sub: "Foto y vídeo", icono: Camera, destino: { tipo: "ruta", href: "/camara" } },
];

export type IdDestinoPublicacion = "politica" | "educacion" | "cultura" | "biblioteca";

export interface DestinoPublicacion {
  id: IdDestinoPublicacion;
  rotulo: string;
  sub: string;
  icono: LucideIcon;
  href: string;
  /** Clases literales (Tailwind necesita verlas enteras) con el acento de cada pilar, igual que `/crear`. */
  caja: string;
  disco: string;
  texto: string;
}

/** Los cuatro destinos de la Zona de Publicación; acentos de `creation-config.ts` (política cielo, educación ámbar, cultura fucsia, biblioteca verde azulado). */
export const DESTINOS_PUBLICACION: DestinoPublicacion[] = [
  {
    id: "politica", rotulo: "Política", sub: "Propuestas y votos", icono: Scale,
    href: "/crear?area=publicar&dest=politica",
    caja: "border-sky-400/25 bg-sky-500/[0.06] hover:border-sky-300/60 hover:bg-sky-500/[0.14]",
    disco: "bg-sky-400/15 text-sky-300 group-hover:bg-sky-400/25", texto: "text-sky-100",
  },
  {
    id: "educacion", rotulo: "Educación", sub: "Cursos y guías", icono: School,
    href: "/crear?area=publicar&dest=educacion",
    caja: "border-amber-400/25 bg-amber-500/[0.06] hover:border-amber-300/60 hover:bg-amber-500/[0.14]",
    disco: "bg-amber-400/15 text-amber-300 group-hover:bg-amber-400/25", texto: "text-amber-100",
  },
  {
    id: "cultura", rotulo: "Cultura", sub: "Arte y eventos", icono: Palette,
    href: "/crear?area=publicar&dest=cultura",
    caja: "border-fuchsia-400/25 bg-fuchsia-500/[0.06] hover:border-fuchsia-300/60 hover:bg-fuchsia-500/[0.14]",
    disco: "bg-fuchsia-400/15 text-fuchsia-300 group-hover:bg-fuchsia-400/25", texto: "text-fuchsia-100",
  },
  {
    id: "biblioteca", rotulo: "Biblioteca", sub: "Archivo y wiki", icono: Library,
    href: "/crear?area=publicar&dest=biblioteca",
    caja: "border-teal-400/25 bg-teal-500/[0.06] hover:border-teal-300/60 hover:bg-teal-500/[0.14]",
    disco: "bg-teal-400/15 text-teal-300 group-hover:bg-teal-400/25", texto: "text-teal-100",
  },
];

/** Todas las rutas internas que enseña la cortina (la prueba comprueba que existen). */
export function rutasDeLaCortina(): string[] {
  const rutas = [RUTA_PAGINA_COMPLETA, RUTA_PROTOMOLECULA, RUTA_PIZARRAS_NUBE];
  for (const a of [LIENZO_UNIVERSAL, ...ACCIONES_CREAR]) if (a.destino.tipo === "ruta") rutas.push(a.destino.href);
  for (const d of DESTINOS_PUBLICACION) rutas.push(d.href);
  return rutas;
}
