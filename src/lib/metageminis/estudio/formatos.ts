/*
 * formatos — catálogo VERIFICADO de formatos de publicidad y contenido compartible (2026-10-10).
 * Rama `estudio` de MetaGeminis. Contrato: architecture/metageminis-estudio.md.
 *
 * Qué es: por cada medio y formato, el tamaño en píxeles, la relación de aspecto, la duración, el peso
 * máximo, el contenedor y códec, los márgenes de interfaz (zonas seguras) y DE DÓNDE sale cada dato.
 *
 * Reglas de honestidad (las vigilan las pruebas de __tests__/formatos.test.ts):
 *  - Cada formato cita al menos una fuente de `FUENTES` (URL https + fecha de consulta). Una fuente es
 *    «oficial» solo si es de la propia plataforma o del estándar; si es de un tercero, es «secundaria».
 *  - Cuando dos fuentes discrepan, `pesoMax` y `duracion.max` guardan el valor MÁS ESTRICTO y la
 *    discrepancia queda escrita en `conflictos`: nunca se elige el número más cómodo.
 *  - Los márgenes que no vienen de una fuente se marcan `margenesOrigen: "criterio-estudio"`; no se
 *    presentan como cifras de la plataforma.
 *  - Los límites cambian: `consultada` dice cuándo se leyó. Pasados 90 días, hay que volver a verificar
 *    (`caducados()` lo dice).
 *
 * Este archivo es TypeScript «borrable» (sin enum ni namespace) y sin importaciones locales, para que
 * `scripts/sociales/estudio/exportar_formatos.mjs` lo lea con Node y genere `formatos.json`, que es lo que
 * usa el motor de render en Python. Una prueba comprueba que ambos son idénticos.
 */

// ───────────────────────── tipos ─────────────────────────

/** Los mismos seis tipos de `metageminis_piezas.tipo` (src/lib/metageminis/tipos.ts). */
export type TipoPiezaEstudio = "imagen" | "video" | "animacion3d" | "anuncio" | "cartel" | "carrusel";

export type Contenedor = "mp4" | "webm" | "mov" | "gif" | "apng" | "png" | "jpg" | "pdf";

export type ConfianzaFuente = "oficial" | "secundaria" | "calculo" | "repositorio";

export interface FuenteDato {
  id: string;
  url: string;
  titulo: string;
  /** Día en que se leyó (AAAA-MM-DD). */
  consultada: string;
  /** Fecha que declara la propia fuente, si la declara. */
  fechaFuente?: string;
  confianza: ConfianzaFuente;
}

/** Margen en píxeles del lienzo nativo, medido desde cada borde hacia dentro. */
export interface Margenes {
  arriba: number;
  abajo: number;
  izquierda: number;
  derecha: number;
}

/** Un rectángulo en el que la interfaz tapa la imagen (marca de duración, foto de perfil…). */
export interface ZonaEvitar {
  motivo: string;
  izquierda: number;
  arriba: number;
  ancho: number;
  alto: number;
}

export interface RangoSegundos {
  min?: number;
  /** Duración que recomienda la fuente o la campaña para el formato. */
  recomendada?: readonly [number, number];
  max?: number;
}

export interface PesoMax {
  /** Bytes (1 MB = 1 000 000 B: es el cálculo prudente, el más pequeño). */
  imagen?: number;
  video?: number;
}

export interface Formato {
  id: string;
  /** Cumple `^[a-z0-9_]{2,40}$`, igual que `metageminis_piezas.medio`. */
  medio: string;
  nombre: string;
  tipos: readonly TipoPiezaEstudio[];
  ancho: number;
  alto: number;
  /** Solo impresos. */
  dpi?: number;
  /** Solo impresos: sangrado en píxeles por lado (3 mm). */
  sangradoPx?: number;
  duracion?: RangoSegundos;
  fps?: { min?: number; max?: number; recomendado?: number };
  pesoMax?: PesoMax;
  pesoRecomendado?: PesoMax;
  contenedores: readonly Contenedor[];
  codec?: { video?: string; audio?: string };
  /** Solo carruseles. */
  laminas?: { min: number; max: number };
  margenes: Margenes;
  margenesOrigen: "fuente" | "criterio-estudio" | "mixto";
  evitar?: readonly ZonaEvitar[];
  fuentes: readonly string[];
  conflictos?: readonly string[];
  notas?: readonly string[];
}

// ───────────────────────── fuentes ─────────────────────────

const HOY = "2026-10-10";

function fuente(id: string, url: string, titulo: string, confianza: ConfianzaFuente, fechaFuente?: string): FuenteDato {
  return fechaFuente ? { id, url, titulo, consultada: HOY, fechaFuente, confianza } : { id, url, titulo, consultada: HOY, confianza };
}

export const FUENTES: readonly FuenteDato[] = [
  fuente("socialpilot-ig", "https://www.socialpilot.co/instagram-marketing/instagram-video-size", "SocialPilot · Instagram video sizes 2026", "secundaria", "2025-12-04"),
  fuente("socialcal-ig", "https://www.socialcal.app/blog/instagram-video-length-limits-2026", "SocialCal · Instagram video length limits 2026 (Reels hasta 20 min, Stories 60 s por tarjeta, vídeo de feed 60 min)", "secundaria", "2026-03-30"),
  fuente("moda-ig", "https://moda.app/resources/sizes/instagram", "Moda · Instagram sizes", "secundaria", "2026-08-28"),
  fuente("hom-zonas", "https://www.houseofmarketers.com/guide-to-safe-zones-tiktok-facebook-instagram-stories", "House of Marketers · safe zones (porcentajes de Meta convertidos a píxeles)", "secundaria", "2026-09-23"),
  fuente("moda-fb", "https://moda.app/resources/sizes/facebook", "Moda · Facebook sizes", "secundaria", "2026-08-28"),
  fuente("moda-tiktok", "https://moda.app/resources/sizes/tiktok", "Moda · TikTok sizes", "secundaria", "2026-08-28"),
  fuente("sovran-tiktok", "https://sovran.ai/blog/tiktok-video-ad-specs", "Sovran · TikTok ad specs 2026", "secundaria", "2026-06-16"),
  fuente("ayrshare-yt", "https://www.ayrshare.com/docs/media-guidelines/youtube", "Ayrshare · media guidelines YouTube", "secundaria"),
  fuente("moda-yt", "https://moda.app/resources/sizes/youtube", "Moda · YouTube sizes", "secundaria", "2026-08-28"),
  fuente("youtube-ayuda-miniaturas", "https://support.google.com/youtube/answer/72431", "Ayuda de YouTube · miniaturas personalizadas", "oficial"),
  fuente("ayrshare-x", "https://ayrshare.com/docs/media-guidelines/x_twitter", "Ayrshare · media guidelines X/Twitter", "secundaria"),
  fuente("ayrshare-linkedin", "https://ayrshare.com/docs/media-guidelines/linkedin", "Ayrshare · media guidelines LinkedIn", "secundaria"),
  fuente("moda-linkedin", "https://moda.app/resources/sizes/linkedin", "Moda · LinkedIn sizes", "secundaria", "2026-08-28"),
  fuente("ayrshare-bluesky", "https://www.ayrshare.com/docs/es/media-guidelines/bluesky.md", "Ayrshare · media guidelines Bluesky", "secundaria"),
  fuente("shacknews-bluesky", "https://www.shacknews.com/article/143406/bluesky-app-version-199-patch-notes", "Shacknews · Bluesky 1.99 amplía el vídeo a 3 minutos", "secundaria", "2025-03-10"),
  fuente("mastodon-instancia", "https://mastodon.social/api/v2/instance", "API de instancia de mastodon.social (versión 4.8.0-nightly.2026-10-06)", "oficial", "2026-10-06"),
  fuente("telegram-faq", "https://core.telegram.org/bots/faq", "Telegram · FAQ de bots (archivos de hasta 50 MB)", "oficial"),
  fuente("moda-whatsapp", "https://moda.app/resources/sizes/whatsapp-status", "Moda · WhatsApp Status", "secundaria"),
  fuente("pinterest-ayuda", "https://help.pinterest.com/en/business/article/pinterest-product-specs", "Ayuda de Pinterest · especificaciones de Pines", "oficial"),
  fuente("vizup-reddit", "https://www.tryvizup.com/blog/reddit-ad-specs-2026-sizes-formats-and-creative-rules", "Vizup · Reddit ad specs 2026", "secundaria", "2026-06-19"),
  fuente("meta-threads", "https://developers.facebook.com/docs/threads/overview", "Meta · Threads API (límites de medios)", "oficial"),
  fuente("discord-faq", "https://support.discord.com/hc/en-us/articles/25444343291031-File-Attachments-FAQ", "Discord · File Attachments FAQ", "oficial"),
  fuente("moda-twitch", "https://moda.app/resources/sizes/twitch", "Moda · Twitch sizes", "secundaria", "2026-03-20"),
  fuente("google-ads-display", "https://support.google.com/google-ads/answer/1722096?hl=en", "Google Ads · especificaciones de anuncios de display subidos", "oficial"),
  fuente("iab-tamanos-fijos", "https://www.iab.com/wp-content/uploads/2019/04/IABNewAdPortfolio_LW_FixedSizeSpec.pdf", "IAB Tech Lab · New Ad Portfolio, tamaños fijos", "oficial", "2017"),
  fuente("facebook-og", "https://developers.facebook.com/docs/sharing/webmasters", "Meta · Open Graph para webs (formato de og:image)", "oficial"),
  fuente("topol-correo", "https://topol.io/blog/what-size-should-email-images-be", "Topol · tamaños de imagen para correo", "secundaria", "2026-08-06"),
  fuente("iso216", "https://www.iso.org/standard/36631.html", "ISO 216 · tamaños de papel A (A3 = 297 × 420 mm, A4 = 210 × 297 mm)", "oficial"),
  fuente("calculo-300ppp", "https://www.iso.org/standard/36631.html", "Cálculo: píxeles = milímetros × 300 / 25,4 (redondeado)", "calculo"),
  fuente("adquick-dooh", "https://www.adquick.com/answers/digital-billboards/digital-billboard-creative-specs", "AdQuick · especificaciones de carteleras digitales", "secundaria", "2026-09"),
  fuente("repo-estudio-escenas", "src/lib/estaciones/estudio-escenas.ts", "Repositorio · SALIDAS del estudio de estaciones (horizontal, vertical, cuadrada, malla-baja)", "repositorio"),
];

export const IDS_FUENTE: readonly string[] = FUENTES.map((f) => f.id);

// ───────────────────────── utilidades de construcción ─────────────────────────

const KB = 1_000;
const MB = 1_000_000;
const GB = 1_000_000_000;

function m(arriba: number, abajo: number, izquierda: number, derecha: number): Margenes {
  return { arriba, abajo, izquierda, derecha };
}
function sim(v: number): Margenes {
  return { arriba: v, abajo: v, izquierda: v, derecha: v };
}

const H264 = { video: "H.264 (High, yuv420p, 4:2:0)", audio: "AAC-LC estéreo 48 kHz" } as const;

// Margen vertical de 9:16 que usa toda la familia (el más estricto de Reels, TikTok y Stories).
const VERTICAL_ESTRICTO = m(269, 672, 65, 100);

// ───────────────────────── catálogo ─────────────────────────

export const FORMATOS: readonly Formato[] = [
  // ── Instagram ──
  {
    id: "instagram-feed-1x1", medio: "instagram", nombre: "Instagram · publicación cuadrada", tipos: ["imagen", "video", "animacion3d", "anuncio"],
    ancho: 1080, alto: 1080, duracion: { recomendada: [8, 15], max: 900 }, fps: { min: 30, recomendado: 30 },
    pesoMax: { imagen: 30 * MB, video: 650 * MB }, contenedores: ["jpg", "png", "mp4", "mov"], codec: H264,
    margenes: sim(50), margenesOrigen: "mixto", fuentes: ["moda-ig", "socialpilot-ig"],
    conflictos: ["Peso del vídeo: SocialPilot da 4 GB en una lista y 650 MB (Reels de menos de 10 min) en otra; se usa 650 MB."],
    notas: ["Margen arriba y abajo de 50 px: la rejilla del perfil puede recortar (Moda). Los laterales son criterio del estudio."],
  },
  {
    id: "instagram-feed-4x5", medio: "instagram", nombre: "Instagram · publicación vertical 4:5", tipos: ["imagen", "video", "animacion3d", "anuncio"],
    ancho: 1080, alto: 1350, duracion: { recomendada: [8, 15], max: 900 }, fps: { min: 30, recomendado: 30 },
    pesoMax: { imagen: 30 * MB, video: 650 * MB }, contenedores: ["jpg", "png", "mp4", "mov"], codec: H264,
    margenes: sim(50), margenesOrigen: "mixto", fuentes: ["moda-ig", "socialpilot-ig"],
    conflictos: ["Peso del vídeo: SocialPilot da 4 GB en una lista y 650 MB en otra; se usa 650 MB."],
    notas: ["4:5 (1080×1350) es el formato recomendado en el feed y el más alto que admite sin recorte."],
  },
  {
    id: "instagram-carrusel", medio: "instagram", nombre: "Instagram · carrusel 4:5", tipos: ["carrusel", "imagen"],
    ancho: 1080, alto: 1350, laminas: { min: 2, max: 20 }, pesoMax: { imagen: 30 * MB }, contenedores: ["jpg", "png"],
    margenes: sim(50), margenesOrigen: "mixto", fuentes: ["moda-ig"],
    notas: ["Todas las láminas se recortan a la proporción de la primera: mantener 1080×1350 en todas."],
  },
  {
    id: "instagram-reels", medio: "instagram", nombre: "Instagram · Reels", tipos: ["video", "animacion3d", "anuncio"],
    ancho: 1080, alto: 1920, duracion: { recomendada: [12, 20], max: 1200 }, fps: { min: 30, recomendado: 30 },
    pesoMax: { video: 650 * MB }, contenedores: ["mp4", "mov"], codec: H264,
    margenes: m(269, 672, 65, 65), margenesOrigen: "fuente", fuentes: ["hom-zonas", "moda-ig", "socialpilot-ig", "socialcal-ig"],
    conflictos: [
      "Duración: Moda dice 90 s y SocialPilot 3 min grabando en la app y 15 min subiendo; SocialCal (2026-03-30, modificado 2026-10-09) y otras guías de 2026 dicen hasta 20 min. Se usa 20 min como máximo y 12–20 s recomendados: la regla creativa pesa más que el límite técnico.",
      "Margen inferior: House of Marketers (porcentajes de Meta) da 35 % = 672 px; Moda da 340 px. Se usa 672 px.",
    ],
  },
  {
    id: "instagram-stories", medio: "instagram", nombre: "Instagram · Stories", tipos: ["imagen", "video", "animacion3d", "anuncio"],
    ancho: 1080, alto: 1920, duracion: { recomendada: [8, 15], max: 60 }, fps: { min: 30, recomendado: 30 },
    pesoMax: { imagen: 30 * MB, video: 650 * MB }, contenedores: ["jpg", "png", "mp4", "mov"], codec: H264,
    margenes: m(250, 340, 65, 65), margenesOrigen: "mixto", fuentes: ["moda-ig", "hom-zonas", "socialpilot-ig"],
    conflictos: ["Cada clip de Story dura hasta 15 s (SocialPilot); Moda admite hasta 60 s de vídeo. Se usa 60 s como máximo y 8–15 s recomendados."],
    notas: ["Margen superior 250 px (Moda); inferior 340 px; laterales 65 px (6 %)."],
  },

  // ── Facebook ──
  {
    id: "facebook-post", medio: "facebook", nombre: "Facebook · publicación vertical 4:5", tipos: ["imagen", "video", "animacion3d", "anuncio"],
    ancho: 1080, alto: 1350, duracion: { recomendada: [8, 15], max: 14_400 }, pesoMax: { imagen: 10 * MB, video: 10 * GB },
    contenedores: ["jpg", "png", "mp4", "mov"], codec: H264, margenes: sim(50), margenesOrigen: "criterio-estudio", fuentes: ["moda-fb"],
    notas: ["El vídeo también admite 1920×1080 y 1080×1920. Los márgenes son criterio del estudio (la fuente no los da)."],
  },
  {
    id: "facebook-enlace", medio: "facebook", nombre: "Facebook · imagen de enlace", tipos: ["imagen"],
    ancho: 1200, alto: 630, contenedores: ["jpg", "png"], margenes: sim(48), margenesOrigen: "criterio-estudio", fuentes: ["moda-fb", "facebook-og"],
    notas: ["Bajo 600×315 px se muestra como miniatura pequeña (Moda)."],
  },
  {
    id: "facebook-portada", medio: "facebook", nombre: "Facebook · portada de página (retina)", tipos: ["imagen"],
    ancho: 1640, alto: 624, pesoMax: { imagen: 10 * MB }, contenedores: ["jpg", "png"],
    margenes: m(24, 24, 180, 180), margenesOrigen: "mixto", fuentes: ["moda-fb"],
    notas: ["Escritorio muestra ~820×312 y móvil recorta más: la zona visible en ambos es ~640×312 centrada, es decir 1280×624 en este lienzo de doble densidad."],
    conflictos: ["La fuente da 851×315 como medida base y 1640×624 como sugerencia retina; se usa la retina."],
  },
  {
    id: "facebook-evento", medio: "facebook", nombre: "Facebook · portada de evento", tipos: ["imagen"],
    ancho: 1920, alto: 1005, pesoMax: { imagen: 10 * MB }, contenedores: ["jpg", "png"], margenes: sim(96), margenesOrigen: "criterio-estudio", fuentes: ["moda-fb"],
  },

  // ── TikTok ──
  {
    id: "tiktok", medio: "tiktok", nombre: "TikTok · vídeo vertical", tipos: ["video", "animacion3d", "anuncio"],
    ancho: 1080, alto: 1920, duracion: { recomendada: [12, 20], max: 600 }, fps: { recomendado: 30 },
    pesoMax: { video: 72 * MB }, contenedores: ["mp4", "mov", "webm"], codec: H264,
    margenes: m(192, 384, 65, 100), margenesOrigen: "mixto", fuentes: ["moda-tiktok", "sovran-tiktok", "hom-zonas"],
    conflictos: [
      "Peso: 72 MB desde la app, 287,6 MB desde la web (Moda); se usa 72 MB.",
      "Margen inferior: 270 px (Moda) frente a 384 px = 20 % (House of Marketers); se usa 384 px. Derecha: 100 px (Moda).",
      "Duración máxima: 10 min en la mayoría de cuentas, 30 min en algunas (Moda); se usa 10 min.",
    ],
    notas: ["Para anuncios In-Feed, Sovran recomienda probar entre 9 y 20 s."],
  },

  // ── YouTube ──
  {
    id: "youtube-horizontal", medio: "youtube", nombre: "YouTube · vídeo 16:9", tipos: ["video", "animacion3d", "anuncio"],
    ancho: 1920, alto: 1080, duracion: { recomendada: [20, 30], max: 43_200 }, fps: { min: 24, max: 60, recomendado: 30 },
    pesoMax: { video: 256 * GB }, contenedores: ["mp4", "mov"], codec: H264, margenes: m(54, 54, 96, 96), margenesOrigen: "criterio-estudio",
    fuentes: ["moda-yt", "ayrshare-yt"], notas: ["Margen del 5 % (zona de título segura). Las pantallas finales ocupan la parte baja derecha en los últimos segundos."],
  },
  {
    id: "youtube-shorts", medio: "youtube", nombre: "YouTube · Shorts", tipos: ["video", "animacion3d"],
    ancho: 1080, alto: 1920, duracion: { recomendada: [12, 20], max: 180 }, fps: { recomendado: 30 }, pesoMax: { video: 256 * GB },
    contenedores: ["mp4", "mov"], codec: H264, margenes: VERTICAL_ESTRICTO, margenesOrigen: "criterio-estudio", fuentes: ["moda-yt", "ayrshare-yt"],
    notas: ["YouTube no publica márgenes para Shorts: se usan los del grupo vertical más estricto (Reels y TikTok)."],
  },
  {
    id: "youtube-miniatura", medio: "youtube", nombre: "YouTube · miniatura", tipos: ["imagen"],
    ancho: 1280, alto: 720, pesoMax: { imagen: 2 * MB }, contenedores: ["jpg", "png"], margenes: sim(40), margenesOrigen: "criterio-estudio",
    evitar: [{ motivo: "Marca de duración del vídeo (esquina inferior derecha)", izquierda: 1120, arriba: 650, ancho: 160, alto: 70 }],
    fuentes: ["moda-yt", "youtube-ayuda-miniaturas"],
    conflictos: ["La ayuda oficial recomienda 3840×2160 y 2 MB solo para subidas desde móvil (50 MB en escritorio); Moda indica 1280×720 y 2 MB. Se usa 1280×720 y 2 MB."],
  },

  // ── X ──
  {
    id: "x-imagen", medio: "x_twitter", nombre: "X · imagen 16:9", tipos: ["imagen"],
    ancho: 1200, alto: 675, pesoMax: { imagen: 5 * MB }, contenedores: ["jpg", "png", "gif"], margenes: sim(64), margenesOrigen: "criterio-estudio", fuentes: ["ayrshare-x"],
    notas: ["Hasta 4 imágenes por publicación; 16:9 evita el recorte en la cronología."],
  },
  {
    id: "x-video", medio: "x_twitter", nombre: "X · vídeo 16:9", tipos: ["video", "animacion3d", "anuncio"],
    ancho: 1280, alto: 720, duracion: { min: 0.5, recomendada: [6, 15], max: 140 }, fps: { max: 60, recomendado: 30 },
    pesoMax: { video: 512 * MB }, contenedores: ["mp4", "mov"], codec: { video: "H.264 High Profile", audio: "AAC mono o estéreo" },
    margenes: sim(64), margenesOrigen: "criterio-estudio", fuentes: ["ayrshare-x"],
    conflictos: ["Duración y peso: la ayuda de X para cuentas gratuitas da 140 s y 512 MB (se usa); la documentación para desarrolladores (sep. 2026) lista 20 min y 8 GB. Se usa el menor porque el estudio no sabe qué cuenta publicará."],
    notas: ["Resolución máxima 1280×1024; relación entre 1:3 y 3:1; píxel cuadrado 1:1."],
  },

  // ── LinkedIn ──
  {
    id: "linkedin-imagen", medio: "linkedin", nombre: "LinkedIn · imagen", tipos: ["imagen"],
    ancho: 1200, alto: 627, pesoMax: { imagen: 5 * MB }, contenedores: ["jpg", "png", "gif"], margenes: sim(56), margenesOrigen: "criterio-estudio",
    fuentes: ["ayrshare-linkedin", "moda-linkedin"], conflictos: ["Peso de imagen: 5 MB (Ayrshare) frente a 8 MB (Moda); se usa 5 MB."],
  },
  {
    id: "linkedin-video", medio: "linkedin", nombre: "LinkedIn · vídeo 16:9", tipos: ["video", "animacion3d", "anuncio"],
    ancho: 1920, alto: 1080, duracion: { min: 3, recomendada: [15, 30], max: 900 }, fps: { recomendado: 30 }, pesoMax: { video: 500 * MB },
    contenedores: ["mp4"], codec: H264, margenes: m(54, 54, 96, 96), margenesOrigen: "criterio-estudio", fuentes: ["ayrshare-linkedin", "moda-linkedin"],
    conflictos: [
      "Duración máxima: 30 min (Ayrshare) frente a 15 min (Moda); se usa 15 min.",
      "Peso máximo: 500 MB (Ayrshare) frente a 5 GB (Moda); se usa 500 MB.",
    ],
    notas: ["Admite también 1:1 y 9:16 (relación entre 1:2,4 y 2,4:1)."],
  },
  {
    id: "linkedin-documento", medio: "linkedin", nombre: "LinkedIn · documento PDF (carrusel)", tipos: ["carrusel"],
    ancho: 1080, alto: 1350, laminas: { min: 2, max: 300 }, pesoMax: { imagen: 100 * MB }, contenedores: ["pdf"],
    margenes: sim(56), margenesOrigen: "criterio-estudio", fuentes: ["ayrshare-linkedin", "moda-linkedin"],
    notas: ["Un carrusel de LinkedIn es un PDF (hasta 100 MB y 300 páginas). Cada lámina 1080×1350."],
  },

  // ── Bluesky ──
  {
    id: "bluesky-imagen", medio: "bluesky", nombre: "Bluesky · imagen", tipos: ["imagen"],
    ancho: 1200, alto: 627, pesoMax: { imagen: 1 * MB }, contenedores: ["jpg", "png"], margenes: sim(56), margenesOrigen: "criterio-estudio", fuentes: ["ayrshare-bluesky"],
    notas: ["Límite de 1 MB por imagen: se exporta en JPG ajustando la calidad."],
  },
  {
    id: "bluesky-video", medio: "bluesky", nombre: "Bluesky · vídeo", tipos: ["video", "animacion3d"],
    ancho: 1280, alto: 720, duracion: { min: 1, recomendada: [6, 15], max: 180 }, fps: { recomendado: 30 }, pesoMax: { video: 50 * MB },
    contenedores: ["mp4"], codec: H264, margenes: sim(64), margenesOrigen: "criterio-estudio", fuentes: ["ayrshare-bluesky", "shacknews-bluesky"],
    conflictos: [
      "Duración máxima: 3 min (Shacknews, versión 1.99 del 2025-03-10) frente a 10 min (Ayrshare); se usa 3 min.",
      "Peso máximo: 50 MB (Shacknews) frente a 300 MB (Ayrshare); se usa 50 MB.",
    ],
    notas: ["La cuenta debe tener el correo verificado y hay un tope diario de vídeos (la documentación de Bluesky no da el número)."],
  },

  // ── Mastodon ──
  {
    id: "mastodon-imagen", medio: "mastodon", nombre: "Mastodon · imagen", tipos: ["imagen"],
    ancho: 1280, alto: 720, pesoMax: { imagen: 16_777_216 }, contenedores: ["jpg", "png", "gif"], margenes: sim(64), margenesOrigen: "criterio-estudio", fuentes: ["mastodon-instancia"],
    notas: ["Límites leídos en mastodon.social; CADA servidor fija los suyos. Hasta 4 adjuntos y 500 caracteres. La cronología recorta a 16:9."],
  },
  {
    id: "mastodon-video", medio: "mastodon", nombre: "Mastodon · vídeo", tipos: ["video", "animacion3d"],
    ancho: 1280, alto: 720, duracion: { recomendada: [6, 15] }, fps: { max: 120, recomendado: 30 }, pesoMax: { video: 103_809_024 },
    contenedores: ["mp4", "webm", "mov"], codec: H264, margenes: sim(64), margenesOrigen: "criterio-estudio", fuentes: ["mastodon-instancia"],
    notas: ["Límite de píxeles de vídeo en mastodon.social: 8 294 400 (3840×2160). Sin duración máxima declarada por la instancia."],
  },

  // ── Telegram ──
  {
    id: "telegram-imagen", medio: "telegram", nombre: "Telegram · imagen", tipos: ["imagen"],
    ancho: 1280, alto: 720, pesoMax: { imagen: 10 * MB }, contenedores: ["jpg", "png"], margenes: sim(64), margenesOrigen: "criterio-estudio", fuentes: ["telegram-faq"],
    conflictos: ["El límite de 10 MB para fotos por la API de bots no pudo releerse en esta pasada (la FAQ solo confirma 50 MB para archivos): se usa 10 MB por prudencia."],
  },
  {
    id: "telegram-video", medio: "telegram", nombre: "Telegram · vídeo", tipos: ["video", "animacion3d"],
    ancho: 1280, alto: 720, duracion: { recomendada: [6, 30] }, pesoMax: { video: 50 * MB }, contenedores: ["mp4"], codec: H264,
    margenes: sim(64), margenesOrigen: "criterio-estudio", fuentes: ["telegram-faq"],
    notas: ["Los bots envían archivos de hasta 50 MB y descargan hasta 20 MB (FAQ de bots)."],
  },

  // ── WhatsApp ──
  {
    id: "whatsapp-estado", medio: "whatsapp", nombre: "WhatsApp · estado", tipos: ["imagen", "video", "animacion3d"],
    ancho: 1080, alto: 1920, duracion: { recomendada: [12, 20], max: 90 }, pesoMax: { imagen: 16 * MB }, contenedores: ["jpg", "png", "mp4"], codec: H264,
    margenes: m(120, 200, 65, 65), margenesOrigen: "mixto", fuentes: ["moda-whatsapp"],
    notas: ["Margen superior 120 px e inferior 200 px (Moda); WhatsApp recomprime el vídeo a menor tasa."],
  },

  // ── Pinterest ──
  {
    id: "pinterest-pin", medio: "pinterest", nombre: "Pinterest · Pin de imagen 2:3", tipos: ["imagen", "anuncio"],
    ancho: 1000, alto: 1500, pesoMax: { imagen: 20 * MB }, contenedores: ["png", "jpg"], margenes: sim(64), margenesOrigen: "criterio-estudio", fuentes: ["pinterest-ayuda"],
    conflictos: ["Peso: 20 MB en escritorio y 32 MB en la app; se usa 20 MB."],
    notas: ["Las imágenes más anchas que 2:3 pueden recortarse en el feed. PNG en sRGB."],
  },
  {
    id: "pinterest-video", medio: "pinterest", nombre: "Pinterest · Pin de vídeo", tipos: ["video", "animacion3d", "anuncio"],
    ancho: 1080, alto: 1920, duracion: { min: 4, recomendada: [6, 15], max: 900 }, pesoMax: { video: 2 * GB }, contenedores: ["mp4", "mov"],
    codec: { video: "H.264 o H.265", audio: "AAC" }, margenes: sim(64), margenesOrigen: "criterio-estudio", fuentes: ["pinterest-ayuda"],
    notas: ["Relación entre 1:2 y 1,91:1; recomendados 1:1, 2:3, 4:5 y 9:16."],
  },

  // ── Reddit ──
  {
    id: "reddit-imagen", medio: "reddit", nombre: "Reddit · imagen", tipos: ["imagen", "anuncio"],
    ancho: 1080, alto: 1080, pesoMax: { imagen: 3 * MB }, contenedores: ["jpg", "png"], margenes: sim(48), margenesOrigen: "criterio-estudio", fuentes: ["vizup-reddit"],
    notas: ["Cifras de anuncios de Reddit (fuente secundaria); las publicaciones normales no tienen una tabla oficial. Cada comunidad añade sus reglas."],
  },
  {
    id: "reddit-video", medio: "reddit", nombre: "Reddit · vídeo", tipos: ["video", "animacion3d", "anuncio"],
    ancho: 1080, alto: 1080, duracion: { recomendada: [5, 30], max: 900 }, pesoMax: { video: 1 * GB }, contenedores: ["mp4", "mov"], codec: H264,
    margenes: sim(48), margenesOrigen: "criterio-estudio", fuentes: ["vizup-reddit"], notas: ["Admite 1:1, 4:5 y 16:9; mínimo 720p."],
  },

  // ── Threads ──
  {
    id: "threads-imagen", medio: "threads", nombre: "Threads · imagen", tipos: ["imagen"],
    ancho: 1080, alto: 1350, pesoMax: { imagen: 8 * MB }, contenedores: ["jpg", "png"], margenes: sim(50), margenesOrigen: "criterio-estudio", fuentes: ["meta-threads"],
    notas: ["Ancho útil entre 320 y 1440 px; relación máxima 10:1; sRGB. Un carrusel admite de 2 a 20 elementos."],
  },
  {
    id: "threads-video", medio: "threads", nombre: "Threads · vídeo", tipos: ["video", "animacion3d"],
    ancho: 1080, alto: 1920, duracion: { recomendada: [12, 20], max: 300 }, fps: { min: 23, max: 60, recomendado: 30 }, pesoMax: { video: 1 * GB },
    contenedores: ["mp4", "mov"], codec: { video: "H.264 o HEVC, progresivo, GOP cerrado, 4:2:0", audio: "AAC ≤128 kb/s, mono o estéreo" },
    margenes: VERTICAL_ESTRICTO, margenesOrigen: "criterio-estudio", fuentes: ["meta-threads"],
    notas: ["Ancho máximo 1920 px; 9:16 recomendado. Los márgenes verticales son los del grupo estricto (la fuente no los da)."],
  },

  // ── Discord y Twitch ──
  {
    id: "discord-imagen", medio: "discord", nombre: "Discord · imagen", tipos: ["imagen"],
    ancho: 1280, alto: 720, pesoMax: { imagen: 20 * MB }, contenedores: ["jpg", "png", "gif"], margenes: sim(64), margenesOrigen: "criterio-estudio", fuentes: ["discord-faq"],
    notas: ["Sin Nitro el límite es de 20 MB por archivo (subió desde 10 MB en agosto de 2026, según la FAQ); con Nitro Basic 50 MB."],
  },
  {
    id: "discord-video", medio: "discord", nombre: "Discord · vídeo", tipos: ["video", "animacion3d"],
    ancho: 1280, alto: 720, duracion: { recomendada: [6, 30] }, pesoMax: { video: 20 * MB }, contenedores: ["mp4", "webm"], codec: H264,
    margenes: sim(64), margenesOrigen: "criterio-estudio", fuentes: ["discord-faq"],
  },
  {
    id: "twitch-banner", medio: "twitch", nombre: "Twitch · banner de perfil", tipos: ["imagen"],
    ancho: 1200, alto: 480, pesoMax: { imagen: 10 * MB }, contenedores: ["jpg", "png"], margenes: sim(48), margenesOrigen: "criterio-estudio", fuentes: ["moda-twitch"],
  },
  {
    id: "twitch-offline", medio: "twitch", nombre: "Twitch · pantalla sin conexión", tipos: ["imagen"],
    ancho: 1920, alto: 1080, pesoMax: { imagen: 10 * MB }, contenedores: ["jpg", "png"], margenes: sim(96), margenesOrigen: "criterio-estudio", fuentes: ["moda-twitch"],
  },

  // ── Banners IAB ──
  banner("iab-300x250", "Banner IAB · rectángulo mediano 300×250", 300, 250, 150 * KB, 10),
  banner("iab-728x90", "Banner IAB · supercartelera 728×90", 728, 90, 150 * KB, 6),
  banner("iab-160x600", "Banner IAB · rascacielos ancho 160×600", 160, 600, 150 * KB, 8),
  banner("iab-320x50", "Banner IAB · móvil 320×50", 320, 50, 50 * KB, 4),
  banner("iab-300x600", "Banner IAB · media página 300×600", 300, 600, 150 * KB, 10),
  banner("iab-970x250", "Banner IAB · billboard 970×250", 970, 250, 150 * KB, 12),

  // ── Web, correo, impresos, pantallas, estaciones ──
  {
    id: "open-graph", medio: "web", nombre: "Open Graph · imagen para compartir enlaces", tipos: ["imagen"],
    ancho: 1200, alto: 630, pesoRecomendado: { imagen: 300 * KB }, contenedores: ["jpg", "png"], margenes: sim(60), margenesOrigen: "criterio-estudio",
    fuentes: ["moda-fb", "facebook-og"], notas: ["1200×630 (1,91:1) sale de Moda; por debajo de 600×315 se ve pequeña. La página de Meta confirma los tipos MIME (jpeg, png, gif), que hay que declarar alto y ancho y que la imagen se cachea por URL. 300 kB es una recomendación del estudio, no un límite verificado."],
  },
  {
    id: "correo-cabecera", medio: "correo", nombre: "Correo · cabecera (se muestra a 600×200)", tipos: ["imagen", "anuncio"],
    ancho: 1200, alto: 400, pesoMax: { imagen: 200 * KB }, contenedores: ["jpg", "png", "gif"], margenes: sim(48), margenesOrigen: "criterio-estudio", fuentes: ["topol-correo"],
    notas: ["Cuerpo de 600 px de ancho; se exporta al doble para pantallas de alta densidad. Menos de 200 kB por imagen y menos de 1 MB en total."],
  },
  {
    id: "cartel-a3", medio: "cartel_impreso", nombre: "Cartel impreso A3 (300 ppp, con sangrado de 3 mm)", tipos: ["cartel", "imagen"],
    ancho: 3508, alto: 4961, dpi: 300, sangradoPx: 35, contenedores: ["pdf", "png"], margenes: sim(94), margenesOrigen: "criterio-estudio",
    fuentes: ["iso216", "calculo-300ppp"],
    notas: ["297 × 420 mm = 3508 × 4961 px a 300 ppp. Con sangrado de 3 mm por lado el lienzo es de 3579 × 5031 px (303 × 426 mm). Margen de texto: 8 mm desde el corte."],
  },
  {
    id: "cartel-a4", medio: "cartel_impreso", nombre: "Cartel impreso A4 (300 ppp, con sangrado de 3 mm)", tipos: ["cartel", "imagen"],
    ancho: 2480, alto: 3508, dpi: 300, sangradoPx: 35, contenedores: ["pdf", "png"], margenes: sim(94), margenesOrigen: "criterio-estudio",
    fuentes: ["iso216", "calculo-300ppp"],
    notas: ["210 × 297 mm = 2480 × 3508 px a 300 ppp. Con sangrado, 2551 × 3579 px (216 × 303 mm)."],
  },
  {
    id: "dooh-horizontal", medio: "pantalla_dooh", nombre: "Pantalla / DOOH · 1920×1080", tipos: ["video", "imagen", "anuncio", "animacion3d"],
    ancho: 1920, alto: 1080, duracion: { min: 3, recomendada: [6, 10], max: 15 }, fps: { recomendado: 30 }, pesoRecomendado: { video: 200 * MB, imagen: 150 * KB },
    contenedores: ["mp4", "jpg", "png", "gif"], codec: { video: "H.264 progresivo, fps fijo, píxel cuadrado", audio: "ninguno (o AAC ≥128 kb/s si el operador lo exige)" },
    margenes: m(54, 54, 96, 96), margenesOrigen: "criterio-estudio", fuentes: ["adquick-dooh"],
    conflictos: ["La duración y el peso varían por operador; la fuente habla de 6–10 s por rotación y de menos de 200 MB. El máximo de 15 s es un tope del estudio."],
  },
  {
    id: "dooh-vertical", medio: "pantalla_dooh", nombre: "Pantalla / DOOH · 1080×1920", tipos: ["video", "imagen", "anuncio", "animacion3d"],
    ancho: 1080, alto: 1920, duracion: { min: 3, recomendada: [6, 10], max: 15 }, fps: { recomendado: 30 }, pesoRecomendado: { video: 200 * MB, imagen: 150 * KB },
    contenedores: ["mp4", "jpg", "png", "gif"], codec: { video: "H.264 progresivo, fps fijo, píxel cuadrado", audio: "ninguno" },
    margenes: m(96, 96, 54, 54), margenesOrigen: "criterio-estudio", fuentes: ["adquick-dooh"],
    notas: ["La fuente solo cita la relación 9:16 para pantallas verticales; 1080×1920 es la medida habitual, no una cifra de la fuente."],
  },
  {
    id: "estacion-horizontal", medio: "estaciones", nombre: "Estaciones de StarSeed OS · horizontal", tipos: ["video", "imagen", "animacion3d"],
    ancho: 1920, alto: 1080, fps: { recomendado: 30 }, contenedores: ["mp4", "webm", "jpg", "png"], codec: H264, margenes: m(54, 54, 96, 96), margenesOrigen: "criterio-estudio",
    fuentes: ["repo-estudio-escenas"], notas: ["Salida «horizontal» del estudio de estaciones: 1920×1080 a 30 fps, hasta 6000 kb/s."],
  },
  {
    id: "estacion-vertical", medio: "estaciones", nombre: "Estaciones de StarSeed OS · vertical", tipos: ["video", "imagen", "animacion3d"],
    ancho: 1080, alto: 1920, fps: { recomendado: 30 }, contenedores: ["mp4", "webm", "jpg", "png"], codec: H264, margenes: m(96, 96, 54, 54), margenesOrigen: "criterio-estudio",
    fuentes: ["repo-estudio-escenas"], notas: ["Salida «vertical»: 1080×1920 a 30 fps, hasta 6000 kb/s."],
  },
  {
    id: "estacion-cuadrada", medio: "estaciones", nombre: "Estaciones de StarSeed OS · cuadrada", tipos: ["video", "imagen", "animacion3d"],
    ancho: 1080, alto: 1080, fps: { recomendado: 30 }, contenedores: ["mp4", "webm", "jpg", "png"], codec: H264, margenes: sim(64), margenesOrigen: "criterio-estudio",
    fuentes: ["repo-estudio-escenas"], notas: ["Salida «cuadrada»: 1080×1080 a 30 fps, hasta 6000 kb/s."],
  },
  {
    id: "estacion-malla-baja", medio: "estaciones", nombre: "Estaciones de StarSeed OS · malla baja", tipos: ["video", "imagen"],
    ancho: 640, alto: 360, fps: { max: 15, recomendado: 15 }, contenedores: ["mp4", "webm", "jpg", "png"], codec: H264, margenes: sim(32), margenesOrigen: "criterio-estudio",
    fuentes: ["repo-estudio-escenas"], notas: ["Salida «malla-baja»: 640×360 a 15 fps y como mucho 300 kb/s, para redes de poco ancho de banda."],
  },
];

/** Un banner IAB de imagen o GIF animado: el más estricto entre IAB (carga inicial) y Google Ads (150 kB). */
function banner(id: string, nombre: string, ancho: number, alto: number, pesoMax: number, margen: number): Formato {
  return {
    id, medio: "banner_iab", nombre, tipos: ["anuncio", "imagen"], ancho, alto,
    duracion: { max: 30 }, fps: { max: 4 }, pesoMax: { imagen: pesoMax }, contenedores: ["png", "jpg", "gif"],
    margenes: sim(margen), margenesOrigen: "criterio-estudio", fuentes: ["google-ads-display", "iab-tamanos-fijos"],
    conflictos: [
      "Peso: Google Ads admite 150 kB por imagen; la carga inicial de IAB es de 50 kB en 320×50 y de 150–250 kB en los demás. Se usa el menor.",
      "GIF animado: Google exige menos de 5 fotogramas por segundo y 30 s como máximo (el bucle se detiene a los 30 s); IAB no fija estos números. Se usa 4 fps.",
    ],
  };
}

// ───────────────────────── consultas y comprobaciones ─────────────────────────

export const IDS_FORMATO: readonly string[] = FORMATOS.map((f) => f.id);

export function formatoPorId(id: string): Formato | undefined {
  return FORMATOS.find((f) => f.id === id);
}

export function formatosDeMedio(medio: string): Formato[] {
  return FORMATOS.filter((f) => f.medio === medio);
}

export function mediosDelCatalogo(): string[] {
  return [...new Set(FORMATOS.map((f) => f.medio))];
}

function mcd(a: number, b: number): number {
  return b === 0 ? a : mcd(b, a % b);
}

/** «9:16», «4:5», «1.91:1»… Si la fracción reducida no es corta, usa decimales con el lado menor a 1. */
export function relacion(ancho: number, alto: number): string {
  const g = mcd(ancho, alto);
  const a = ancho / g;
  const b = alto / g;
  if (a <= 32 && b <= 32) return `${a}:${b}`;
  const r = ancho / alto;
  return r >= 1 ? `${(Math.round(r * 100) / 100).toString()}:1` : `1:${(Math.round((1 / r) * 100) / 100).toString()}`;
}

/** El campo `formato` de `metageminis_piezas`: «1080x1920@15s» o «1080x1080» (cumple FORMATO_RE de tipos.ts). */
export function formatoDePieza(f: Pick<Formato, "ancho" | "alto">, duracionS?: number): string {
  const base = `${f.ancho}x${f.alto}`;
  if (duracionS === undefined) return base;
  const d = Number.isInteger(duracionS) ? String(duracionS) : String(Math.round(duracionS * 100) / 100);
  return `${base}@${d}s`;
}

export interface Rect {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** El rectángulo en el que puede ir texto, logo y llamada a la acción. */
export function areaSegura(f: Pick<Formato, "ancho" | "alto" | "margenes">, margenes: Margenes = f.margenes): Rect {
  return {
    x: margenes.izquierda,
    y: margenes.arriba,
    ancho: f.ancho - margenes.izquierda - margenes.derecha,
    alto: f.alto - margenes.arriba - margenes.abajo,
  };
}

/** Los márgenes más estrictos de un grupo de formatos: un solo archivo válido para todos. */
export function margenesComunes(ids: readonly string[]): Margenes {
  const fs = ids.map((id) => {
    const f = formatoPorId(id);
    if (!f) throw new Error(`formato desconocido: ${id}`);
    return f;
  });
  return fs.reduce<Margenes>(
    (acc, f) => ({
      arriba: Math.max(acc.arriba, f.margenes.arriba),
      abajo: Math.max(acc.abajo, f.margenes.abajo),
      izquierda: Math.max(acc.izquierda, f.margenes.izquierda),
      derecha: Math.max(acc.derecha, f.margenes.derecha),
    }),
    { arriba: 0, abajo: 0, izquierda: 0, derecha: 0 },
  );
}

export function rectDentro(r: Rect, area: Rect): boolean {
  return r.x >= area.x && r.y >= area.y && r.x + r.ancho <= area.x + area.ancho && r.y + r.alto <= area.y + area.alto;
}

export function rectsSeSolapan(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto;
}

/** ¿Cabe un texto en `r` sin entrar en las zonas que la interfaz tapa ni salir del área segura? */
export function rectValido(f: Formato, r: Rect, margenes: Margenes = f.margenes): boolean {
  if (!rectDentro(r, areaSegura(f, margenes))) return false;
  return !(f.evitar ?? []).some((z) => rectsSeSolapan(r, { x: z.izquierda, y: z.arriba, ancho: z.ancho, alto: z.alto }));
}

/** El peso máximo (en bytes) de un archivo de `clase` para este formato, o `undefined` si no hay límite verificado. */
export function pesoMaximo(f: Formato, clase: "imagen" | "video"): number | undefined {
  return f.pesoMax?.[clase];
}

/** Días entre la consulta más antigua de las fuentes de un formato y `hoy`. */
export function diasDesdeConsulta(f: Formato, hoy: string = HOY): number {
  const base = Date.parse(hoy);
  const fechas = f.fuentes.map((id) => FUENTES.find((x) => x.id === id)?.consultada).filter((x): x is string => !!x);
  if (fechas.length === 0) return Number.POSITIVE_INFINITY;
  const masAntigua = Math.min(...fechas.map((d) => Date.parse(d)));
  return Math.round((base - masAntigua) / 86_400_000);
}

/** Formatos cuyos datos hay que volver a verificar (más de 90 días desde la consulta). */
export function caducados(hoy: string = HOY): Formato[] {
  return FORMATOS.filter((f) => diasDesdeConsulta(f, hoy) > 90);
}

/** Problemas del catálogo (lista vacía = coherente). Las pruebas exigen que esté vacía. */
export function problemasDelCatalogo(): string[] {
  const out: string[] = [];
  const vistos = new Set<string>();
  for (const f of FORMATOS) {
    const p = (msg: string) => out.push(`${f.id}: ${msg}`);
    if (vistos.has(f.id)) p("id repetido");
    vistos.add(f.id);
    if (!/^[a-z0-9_]{2,40}$/.test(f.medio)) p(`medio inválido «${f.medio}»`);
    if (!Number.isInteger(f.ancho) || !Number.isInteger(f.alto) || f.ancho <= 0 || f.alto <= 0) p("tamaño no entero");
    if (f.fuentes.length === 0) p("sin fuente");
    for (const id of f.fuentes) if (!IDS_FUENTE.includes(id)) p(`fuente desconocida «${id}»`);
    const a = areaSegura(f);
    if (a.ancho < f.ancho * 0.4 || a.alto < f.alto * 0.4) p("los márgenes dejan menos del 40 % del lienzo");
    for (const z of f.evitar ?? []) if (z.izquierda < 0 || z.arriba < 0 || z.izquierda + z.ancho > f.ancho || z.arriba + z.alto > f.alto) p(`zona a evitar fuera del lienzo: ${z.motivo}`);
    const d = f.duracion;
    if (d) {
      if (d.min !== undefined && d.max !== undefined && d.min > d.max) p("duración mínima mayor que la máxima");
      if (d.recomendada) {
        if (d.recomendada[0] > d.recomendada[1]) p("rango recomendado al revés");
        if (d.max !== undefined && d.recomendada[1] > d.max) p("duración recomendada mayor que la máxima");
        if (d.min !== undefined && d.recomendada[0] < d.min) p("duración recomendada menor que la mínima");
      }
    }
    if (f.dpi !== undefined && f.sangradoPx === undefined) p("impreso sin sangrado");
  }
  return out;
}
