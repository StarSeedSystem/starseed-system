import { isSafeHttpUrl } from "@/lib/library/url-utils";

export const TIPOS_ESTACION = ["audio","video","xr","evento","anuncio","juego","pizarra","dashboard","programa","app","mixto"] as const;
export type TipoEstacion = typeof TIPOS_ESTACION[number];

export const FUENTES_ESTACION = ["enlace","starseed","estudio"] as const;
export type FuenteEstacion = typeof FUENTES_ESTACION[number];

export const LICENCIAS_LIBRES = ["cc0","cc-by","cc-by-sa","dominio-publico","libre-otra","propia-abierta"] as const;
export type LicenciaEstacion = typeof LICENCIAS_LIBRES[number];

export type VisibilidadEstacion = "publica" | "grupo";
export type EstadoDirecto = "en-directo" | "programada" | "pausada" | "terminada";

export interface Estacion {
  id: string;
  owner_id: string;
  ambito_tipo: "persona" | "entidad";
  entidad_ref: string | null;
  titulo: string;
  descripcion: string;
  tipo: TipoEstacion;
  fuente: FuenteEstacion;
  enlace: string;
  formato: string;
  imagen: string | null;
  idioma: string;
  categorias: string[];
  licencia: LicenciaEstacion;
  visibilidad: VisibilidadEstacion;
  empieza_en: string | null;
  termina_en: string | null;
  ultimo_latido: string | null;
  pausada: boolean;
  en_malla: boolean;
  espectadores: number;
  created_at: string;
  updated_at: string;
}

export type BorradorEstacion = Pick<Estacion,"titulo"|"tipo"|"fuente"|"enlace"|"licencia"> &
  Partial<Pick<Estacion,"descripcion"|"imagen"|"idioma"|"categorias"|"visibilidad"|"empieza_en"|"termina_en"|"en_malla"|"ambito_tipo"|"entidad_ref">>;

export type ResultadoValidacion = { ok: true; estacion: BorradorEstacion } | { ok: false; errores: string[] };

export const ETIQUETA_TIPO: Record<TipoEstacion, string> = {
  audio: "Audio",
  video: "Vídeo",
  xr: "Realidad virtual",
  evento: "Evento",
  anuncio: "Anuncio",
  juego: "Juego",
  pizarra: "Pizarra",
  dashboard: "Dashboard",
  programa: "Programa",
  app: "App",
  mixto: "Mixto",
};

export const ETIQUETA_LICENCIA: Record<LicenciaEstacion, string> = {
  cc0: "CC0 · dominio público dedicado",
  "cc-by": "CC BY",
  "cc-by-sa": "CC BY-SA",
  "dominio-publico": "Dominio público",
  "libre-otra": "Otra licencia libre",
  "propia-abierta": "Propia y abierta",
};

export function normalizarCategorias(bruto: string | string[]): string[] {
  if (bruto == null) return [];
  const arr = typeof bruto === "string" ? bruto.split(",") : bruto;
  const set = new Set<string>();
  for (const raw of arr) {
    const v = raw.trim().toLowerCase();
    if (v) set.add(v);
  }
  const out = Array.from(set);
  return out.slice(0, 8);
}

function esFechaISO(v: string | null | undefined): boolean {
  if (!v) return true;
  const d = new Date(v);
  return !isNaN(d.getTime()) && d.toISOString().startsWith(v.slice(0,10));
}

export function validarEstacion(b: BorradorEstacion): ResultadoValidacion {
  const errores: string[] = [];
  const datos = { ...b } as BorradorEstacion;

  if (typeof datos.titulo !== "string") {
    errores.push("Título es obligatorio.");
  } else {
    const t = datos.titulo.trim();
    if (t.length < 2 || t.length > 100) {
      errores.push("El título debe tener entre 2 y 100 caracteres.");
    }
    datos.titulo = t;
  }

  if (datos.descripcion != null) {
    if (typeof datos.descripcion !== "string" || datos.descripcion.length > 1000) {
      errores.push("La descripción no puede superar 1000 caracteres.");
    } else {
      datos.descripcion = datos.descripcion.trim();
    }
  }

  if (!TIPOS_ESTACION.includes(datos.tipo as any)) {
    errores.push("Tipo no válido. Usa uno de: audio, video, xr, evento, anuncio, juego, pizarra, dashboard, programa, app, mixto.");
  }
  if (!FUENTES_ESTACION.includes(datos.fuente as any)) {
    errores.push("Fuente no válida. Usa enlace, starseed o estudio.");
  }
  if (!LICENCIAS_LIBRES.includes(datos.licencia as any)) {
    errores.push("Licencia no válida. Elige una licencia libre.");
  }

  if (typeof datos.enlace !== "string" || !datos.enlace.trim()) {
    errores.push("Enlace es obligatorio.");
  } else {
    const enlace = datos.enlace.trim();
    datos.enlace = enlace;
    if (datos.fuente === "enlace") {
      if (!isSafeHttpUrl(enlace)) {
        errores.push("El enlace debe ser una URL https segura.");
      } else {
        try {
          const u = new URL(enlace);
          if (u.protocol !== "https:") errores.push("Para fuentes externas se exige https.");
        } catch {
          errores.push("El enlace no es una URL válida.");
        }
      }
    } else if (datos.fuente === "starseed" || datos.fuente === "estudio") {
      if (!enlace.startsWith("/") || enlace.startsWith("//") || enlace.startsWith("/\\")) {
        errores.push("Para fuente interna el enlace debe empezar por / y no ser relativo.");
      }
    }
  }

  if (datos.imagen != null && datos.imagen !== "") {
    if (typeof datos.imagen !== "string" || !isSafeHttpUrl(datos.imagen)) {
      errores.push("La imagen debe ser una URL https segura o null.");
    } else {
      try {
        const u = new URL(datos.imagen);
        if (u.protocol !== "https:") errores.push("La imagen debe usar https.");
      } catch {}
    }
  }

  if (datos.empieza_en) {
    if (!esFechaISO(datos.empieza_en)) errores.push("empieza_en debe ser una fecha ISO válida.");
  }
  if (datos.termina_en) {
    if (!esFechaISO(datos.termina_en)) errores.push("termina_en debe ser una fecha ISO válida.");
  }
  if (datos.empieza_en && datos.termina_en) {
    const e = new Date(datos.empieza_en).getTime();
    const t = new Date(datos.termina_en).getTime();
    if (!isNaN(e) && !isNaN(t) && t <= e) {
      errores.push("termina_en debe ser posterior a empieza_en.");
    }
  }

  if (datos.ambito_tipo === "entidad") {
    if (!datos.entidad_ref || typeof datos.entidad_ref !== "string" || !datos.entidad_ref.trim()) {
      errores.push("Cuando ambito_tipo es entidad, entidad_ref es obligatorio.");
    }
  }

  const cats = normalizarCategorias(datos.categorias as any);
  for (const c of cats) {
    if (c.length > 24) {
      errores.push(`Categoría "${c}" supera 24 caracteres.`);
      break;
    }
  }
  datos.categorias = cats;

  if (!datos.idioma) datos.idioma = "es";
  if (!datos.visibilidad) datos.visibilidad = "publica";
  if (datos.en_malla == null) datos.en_malla = false;
  if (!datos.ambito_tipo) datos.ambito_tipo = "persona";

  if (errores.length) return { ok: false, errores };
  return { ok: true, estacion: datos };
}

