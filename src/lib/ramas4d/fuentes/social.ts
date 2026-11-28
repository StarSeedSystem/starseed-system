import type { Observador } from "../alcance";
import type { Nodo, Arista, AlcanceNodo } from "../modelo";
import type { Fuente } from "./tipos";
import type { NormalizedPost, PostMediaKind } from "@/lib/social-posts";
import type { FeedPost } from "@/lib/feed/network-feed";

export interface EntidadDePublicacion {
  tipo: "page" | "group" | "community" | "profile";
  slug: string;
}

export interface PublicacionVista {
  id: string;
  titulo?: string;
  creadaEn: string;
  tipo?: string;
  medio?: PostMediaKind | "gallery" | null;
  etiquetas?: string[];
  autor?: string;
  entidad?: EntidadDePublicacion;
  alcance?: AlcanceNodo;
  dueno?: string;
  interacciones?: number;
}

export interface DatosSociales {
  publicaciones?: PublicacionVista[];
}

export type LectorSocial = (observador: Observador) => Promise<DatosSociales>;

function fecha(valor: string | null | undefined): number {
  const t = valor ? new Date(valor).getTime() : NaN;
  return Number.isFinite(t) ? t : Date.now();
}

export function formatoDeMedio(medio: PublicacionVista["medio"]): string {
  switch (medio) {
    case "image":
    case "gallery":
      return "imagen";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "pdf":
    case "file":
      return "documento";
    case "link":
      return "enlace";
    default:
      return "texto";
  }
}

function tituloDePublicacion(publicacion: PublicacionVista): string {
  const titulo = publicacion.titulo?.trim();
  if (titulo) return titulo;
  return publicacion.autor ? `Publicación de ${publicacion.autor}` : "Publicación";
}

export function nodoDesdePublicacion(publicacion: PublicacionVista): Nodo {
  const t = fecha(publicacion.creadaEn);
  const formato = formatoDeMedio(publicacion.medio);
  const tipo = publicacion.tipo ?? "post";
  const interacciones = Math.max(0, publicacion.interacciones ?? 0);
  return {
    id: `publicacion:${publicacion.id}`,
    tipo: "publicacion",
    titulo: tituloDePublicacion(publicacion),
    formato,
    ref: `/post/${publicacion.id}`,
    alcance: publicacion.alcance ?? "publico",
    dueno: publicacion.dueno ?? "red",
    capas: ["social", "publicaciones", tipo],
    t_creado: t,
    t_actividad: t,
    peso: Math.round((0.5 + Math.min(0.5, interacciones / 100)) * 100) / 100,
    tema: tipo,
    categoria: "publicacion",
    etiquetas: [tipo, formato, publicacion.medio ?? "texto", ...(publicacion.etiquetas ?? []), "real"],
  };
}

export function aristasDePublicacion(publicacion: PublicacionVista): Arista[] {
  if (!publicacion.entidad?.slug) return [];
  return [
    {
      de: `entidad:${publicacion.entidad.tipo}:${publicacion.entidad.slug}`,
      a: `publicacion:${publicacion.id}`,
      tipo: "contiene",
      t: fecha(publicacion.creadaEn),
      intensidad: 0.7,
    },
  ];
}

export function publicacionDesdeNormalizada(post: NormalizedPost): PublicacionVista {
  return {
    id: post.id,
    titulo: post.title,
    creadaEn: post.createdAt,
    tipo: post.kind,
    medio: post.media?.kind ?? null,
    etiquetas: post.tags,
    autor: post.authorName,
    interacciones: post.likes + post.commentsCount,
  };
}

export function publicacionDesdeFeed(post: FeedPost): PublicacionVista {
  const medio: PublicacionVista["medio"] = post.media.length > 0
    ? post.type === "video"
      ? "video"
      : "image"
    : null;
  return {
    id: post.postId || post.id,
    creadaEn: post.createdAt,
    tipo: post.type,
    medio,
    etiquetas: post.tags,
    autor: post.author.name,
    interacciones: post.likes + post.commentsCount,
  };
}

async function leerSocialReal(): Promise<DatosSociales> {
  try {
    const { fetchNetworkFeed } = await import("@/lib/feed/network-feed");
    const publicaciones = await fetchNetworkFeed({ limit: 120 });
    return { publicaciones: publicaciones.map(publicacionDesdeFeed) };
  } catch {
    return {};
  }
}

export function crearFuenteSocial(leer: LectorSocial = leerSocialReal): Fuente {
  const suscriptores = new Set<(evento: { tipo: string; datos: unknown }) => void>();

  function emitir(evento: { tipo: string; datos: unknown }) {
    for (const cb of suscriptores) {
      try {
        cb(evento);
      } catch {
        // silencioso
      }
    }
  }

  return {
    id: "social",
    capa: "social",
    leer: async (observador: Observador) => {
      const datos = await leer(observador);
      const nodos = new Map<string, Nodo>();
      const aristas: Arista[] = [];

      for (const publicacion of datos.publicaciones ?? []) {
        const nodo = nodoDesdePublicacion(publicacion);
        nodos.set(nodo.id, nodo);
        aristas.push(...aristasDePublicacion(publicacion));
      }

      const validas = aristas.filter((a) => nodos.has(a.de) && nodos.has(a.a));
      emitir({
        tipo: "fuente_leida",
        datos: { fuenteId: "social", nodos: nodos.size, aristas: validas.length },
      });
      return { nodos, aristas: validas };
    },
    suscribir: (callback) => {
      suscriptores.add(callback);
      return () => {
        suscriptores.delete(callback);
      };
    },
  };
}

export const fuenteSocial = crearFuenteSocial();
