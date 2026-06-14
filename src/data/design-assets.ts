/* ============================================================
   STARSEED · DESIGN ASSETS (Librería Global · Diseños · Código abierto)
   Modelo de "asset de diseño" + dataset open-source para la Librería:
   - Temas StarSeed (Aurora, Café) como recursos integrables.
   - Tokens (paletas/tipografía) desde architecture/design-system-figma.md.
   - Componentes de fondo del OS (Spline, WebGL/Living + 10 variantes,
     Materia Viva, Audiomorphic) como recursos "background".
   - Enlaces externos a sitios de fondos creativos gratuitos
     (Haikei, uiGradients, CSS Gradient, SVGBackgrounds, Cool
     Backgrounds, Animista, pattern.css, Hero Patterns).
   Todo libre / open-source, con licencia y atribución por item.
   Pensado para abrirse en una ventana de PREVIEW tipo "app-store"
   (AssetPreviewModal) y para editarse "al subir cada archivo".
   ============================================================ */

export type AssetKind =
  | "theme"
  | "tokens"
  | "background"
  | "component"
  | "snippet"
  | "external";

export type AssetLicense = "MIT" | "CC0" | "OpenSource";

export interface AssetReview {
  user: string;
  /** 1–5 */
  stars: number;
  text: string;
}

export interface AssetBranch {
  /** Autor de la rama (la primera suele ser el autor original) */
  author: string;
  /** Nombre de la rama o versión (p.ej. "main", "v2", "café-fork") */
  name: string;
  /** Nota / changelog corto */
  note: string;
  /** Enlace opcional al repo/rama/recurso */
  url?: string;
}

export interface AssetMedia {
  /** URLs o data-URIs de imágenes/portadas (preview de galería) */
  images: string[];
  /** URLs de vídeos (mp4/webm) o embeds (con fallback en el modal) */
  videos: string[];
}

export interface DesignAsset {
  id: string;
  name: string;
  kind: AssetKind;
  description: string;
  tags: string[];
  author: string;
  /** Versión semántica o etiqueta ("1.0.0", "beta") */
  version: string;
  license: AssetLicense;
  /** Atribución / nota de licencia legible */
  attribution?: string;
  media: AssetMedia;
  /**
   * Código embebido (snippet/tokens/tema) o una referencia a fichero
   * del propio repo (fileRef) para integrarlo/descargarlo.
   */
  code?: string;
  /** Ruta a un fichero del repo (recurso integrable del OS) */
  fileRef?: string;
  /** Enlace externo (sitios de fondos gratuitos, demos) */
  externalUrl?: string;
  /** Repo / fuente open-source */
  repoUrl?: string;
  reviews: AssetReview[];
  branches: AssetBranch[];
  downloads?: number;
  /** Marca de assets creados por el usuario (persistidos en localStorage) */
  userCreated?: boolean;
}

export interface DesignAssetFolder {
  id: string;
  title: string;
  desc: string;
  assets: DesignAsset[];
}

/* ------------------------------------------------------------
   Portadas SVG inline (data-URI) — sin dependencias ni red.
   Sirven de preview por defecto en la galería del modal.
   ------------------------------------------------------------ */
const svgCover = (a: string, b: string, label: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'>
      <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/>
      </linearGradient></defs>
      <rect width='640' height='360' fill='url(#g)'/>
      <circle cx='520' cy='80' r='120' fill='rgba(255,255,255,0.10)'/>
      <circle cx='120' cy='300' r='90' fill='rgba(255,255,255,0.08)'/>
      <text x='32' y='330' font-family='Georgia, serif' font-size='30' fill='rgba(255,255,255,0.92)'>${label}</text>
    </svg>`
  );

/* ============================================================
   1) TEMAS STARSEED (integrables como CSS variables)
   ============================================================ */
const THEMES: DesignAsset[] = [
  {
    id: "theme-aurora",
    name: "Tema · Aurora StarSeed",
    kind: "theme",
    description:
      "El tema original del OS. Violeta/cian sobre cosmos profundo, con modo claro de pergamino lavanda. Cristal líquido + Art Nouveau retrofuturista.",
    tags: ["theme", "aurora", "dark", "light", "violeta", "cian", "cristal-líquido"],
    author: "StarSeed Core",
    version: "1.0.0",
    license: "MIT",
    attribution: "StarSeed OS · libre uso y adaptación (MIT).",
    media: { images: [svgCover("#0a0118", "#c084fc", "Aurora · OS")], videos: [] },
    repoUrl: "https://github.com/StarSeedSystem/starseed-system",
    code: `:root[data-theme="aurora"] {
  --background: #0a0118;
  --card: #160b30;
  --primary: #c084fc;   /* violeta */
  --accent: #22d3ee;    /* cian */
}
:root[data-theme="aurora-light"] {
  --background: #f6f3fb;
  --card: #fdfcff;
  --primary: #9333ea;
  --accent: #0f766e;
}`,
    reviews: [
      { user: "@nova", stars: 5, text: "El cristal líquido sienta de maravilla en el dashboard." },
      { user: "@kael", stars: 4, text: "Precioso en oscuro; el claro lo uso menos." },
    ],
    branches: [
      { author: "StarSeed Core", name: "main", note: "Tema base del OS." },
      { author: "@nova", name: "aurora-soft", note: "Bajada de saturación para lectura larga." },
    ],
    downloads: 1280,
  },
  {
    id: "theme-cafe",
    name: "Tema · StarSeed Café",
    kind: "theme",
    description:
      "Verde-negro con oro y lima en oscuro; pergamino, terracota y musgo en claro. La identidad de la cafetería traída al OS.",
    tags: ["theme", "café", "oro", "lima", "pergamino", "terracota"],
    author: "StarSeed Studio",
    version: "1.0.0",
    license: "MIT",
    attribution: "StarSeed Café · libre uso y adaptación (MIT).",
    media: { images: [svgCover("#0d130e", "#E9C46A", "Café")], videos: [] },
    repoUrl: "https://github.com/StarSeedSystem/starseed-system",
    code: `:root[data-theme="cafe"] {
  --background: #0d130e;
  --card: #141b14;
  --primary: #E9C46A;   /* oro */
  --accent: #9FE870;    /* lima */
}
:root[data-theme="cafe-light"] {
  --background: #fdf7ea; /* pergamino */
  --foreground: #3B2818; /* tinta cacao */
  --primary: #C05C3B;    /* terracota */
  --accent: #3f7a2a;     /* musgo */
}`,
    reviews: [
      { user: "@barista", stars: 5, text: "El oro sobre verde-negro es pura calidez." },
    ],
    branches: [
      { author: "StarSeed Studio", name: "main", note: "Identidad oficial del Café." },
      { author: "@gaia", name: "café-amanecer", note: "Variante clara con más bronce." },
    ],
    downloads: 940,
  },
];

/* ============================================================
   2) TOKENS (paletas + tipografía, desde design-system-figma.md)
   ============================================================ */
const TOKENS: DesignAsset[] = [
  {
    id: "tokens-palette",
    name: "Tokens · Paleta StarSeed extendida",
    kind: "tokens",
    description:
      "Paleta cromática completa del ecosistema: tierras (musgo, terracota, ámbar, cacao, bronce) y neones (lime, amber, lavanda, cyan, coral). Lista para CSS custom properties.",
    tags: ["tokens", "palette", "colors", "neón", "tierra"],
    author: "StarSeed Studio",
    version: "1.0.0",
    license: "CC0",
    attribution: "Paleta de marca StarSeed · dominio público (CC0).",
    media: { images: [svgCover("#2D4A22", "#F6A21E", "Paleta")], videos: [] },
    code: `:root {
  /* Tierras */
  --ss-musgo: #2D4A22;
  --ss-terracota: #C05C3B;
  --ss-ambar: #F6A21E;
  --ss-cacao: #3B2818;
  --ss-lavanda: #B59ECF;
  --ss-oro: #E9C46A;
  --ss-bronce: #9C6B3F;
  /* Neón */
  --ss-neon-lime: #9FE870;
  --ss-neon-amber: #FFC247;
  --ss-neon-lavanda: #C9A8FF;
  --ss-neon-cyan: #6FE6D6;
  --ss-neon-coral: #FF8A5C;
}`,
    reviews: [
      { user: "@pixel", stars: 5, text: "Cohesión brutal entre tierras y neones." },
    ],
    branches: [
      { author: "StarSeed Studio", name: "main", note: "Paleta canónica." },
    ],
    downloads: 612,
  },
  {
    id: "tokens-typography",
    name: "Tokens · Tipografía (Fraunces · Space Grotesk · Space Mono)",
    kind: "tokens",
    description:
      "Sistema tipográfico StarSeed: Fraunces para titulares (Art Nouveau), Space Grotesk para interfaz, Space Mono para datos/código. Easings y duraciones de la 'Respiración Digital'.",
    tags: ["tokens", "typography", "fraunces", "space-grotesk", "space-mono", "easing"],
    author: "StarSeed Studio",
    version: "1.0.0",
    license: "OpenSource",
    attribution:
      "Fuentes Fraunces / Space Grotesk / Space Mono bajo SIL Open Font License (Google Fonts).",
    media: { images: [svgCover("#160b30", "#7FD8E8", "Tipografía")], videos: [] },
    externalUrl: "https://fonts.google.com/?query=fraunces+space",
    code: `:root {
  --font-display: "Fraunces", Georgia, serif;     /* titulares */
  --font-sans: "Space Grotesk", system-ui, sans-serif; /* interfaz */
  --font-mono: "Space Mono", ui-monospace, monospace;  /* datos/código */
  /* Respiración Digital */
  --ease-organic: cubic-bezier(.22, 1, .36, 1);
  --ease-glide:   cubic-bezier(.16, 1, .3, 1);
  --dur-fast: 150ms; --dur-base: 220ms; --dur-slow: 300ms;
}`,
    reviews: [
      { user: "@type", stars: 5, text: "Fraunces + Space Mono = elegancia técnica." },
    ],
    branches: [
      { author: "StarSeed Studio", name: "main", note: "Escala áurea φ=1.618." },
    ],
    downloads: 503,
  },
  {
    id: "tokens-trinity",
    name: "Tokens · Trinity (cardinales)",
    kind: "tokens",
    description:
      "Los cuatro colores cardinales del paradigma Trinity: Zenith (guía IA), Horizon (creación), Logic (control), Anchor (dock/raíz).",
    tags: ["tokens", "trinity", "zenith", "horizon", "logic", "anchor"],
    author: "StarSeed Core",
    version: "1.0.0",
    license: "CC0",
    attribution: "Tokens Trinity · dominio público (CC0).",
    media: { images: [svgCover("#007FFF", "#DC143C", "Trinity")], videos: [] },
    code: `:root {
  --trinity-zenith:  #007FFF; /* norte · guía IA */
  --trinity-horizon: #39FF14; /* oeste · creación */
  --trinity-logic:   #FFBF00; /* este · control */
  --trinity-anchor:  #DC143C; /* sur · dock/raíz */
}`,
    reviews: [
      { user: "@cardinal", stars: 4, text: "Buen sistema de orientación por color." },
    ],
    branches: [{ author: "StarSeed Core", name: "main", note: "Cardinales base." }],
    downloads: 388,
  },
  {
    id: "tokens-glass",
    name: "Tokens · Recetas Cristal Líquido (glass)",
    kind: "snippet",
    description:
      "Recetas de cristal líquido: blur, color-mix, borde de acento, highlight interno y sombra cálida. Variantes clear / frosted / holographic / obsidian / organic.",
    tags: ["glass", "cristal-líquido", "backdrop-filter", "blur", "snippet"],
    author: "StarSeed Studio",
    version: "1.0.0",
    license: "MIT",
    attribution: "Recetas glass StarSeed · MIT.",
    media: { images: [svgCover("#141b14", "#7FD8E8", "Glass")], videos: [] },
    code: `.ss-glass {
  backdrop-filter: blur(24px);
  background: color-mix(in srgb, var(--card) 55%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.12),
    0 18px 48px -20px rgba(0,0,0,.45);
  border-radius: 1rem;
}
/* Variantes: --frosted(blur 30) · --holographic(aberración 5px)
   --obsidian(opacidad .85) · --organic(displacement) */`,
    reviews: [
      { user: "@glassy", stars: 5, text: "Copio y pego y queda perfecto." },
    ],
    branches: [{ author: "StarSeed Studio", name: "main", note: "5 variantes." }],
    downloads: 720,
  },
];

/* ============================================================
   3) COMPONENTES DE FONDO DEL OS (integrables / adaptables)
   ============================================================ */
const livingVariants =
  "aurora · nebula · starfield · mycelium · plasma · prisma · ocean · ribbons · petals · grid-pulse";

const BACKGROUNDS: DesignAsset[] = [
  {
    id: "bg-living-webgl",
    name: "Fondo · Living (Canvas 2D · 10 variantes)",
    kind: "background",
    description:
      `Fondo vivo performante con 10 variantes creativas (${livingVariants}). Persiste entre rutas, lee config (variante, velocidad, intensidad, colores, auto-cycle). Integrable y adaptable a cualquier tema.`,
    tags: ["background", "webgl", "canvas", "living", "animado", "10-variantes"],
    author: "StarSeed Core",
    version: "1.2.0",
    license: "MIT",
    attribution: "StarSeed OS · componente de fondo Living (MIT).",
    media: {
      images: [
        svgCover("#0a0118", "#22d3ee", "Living · aurora"),
        svgCover("#0d130e", "#9FE870", "Living · mycelium"),
        svgCover("#160b30", "#c084fc", "Living · nebula"),
      ],
      videos: [],
    },
    fileRef: "src/components/ui/backgrounds/living-background.tsx",
    repoUrl: "https://github.com/StarSeedSystem/starseed-system",
    code: `import { LivingBackground } from "@/components/ui/backgrounds/living-background";
// Variantes: ${livingVariants}
<LivingBackground /> // lee config.background.living del tema`,
    reviews: [
      { user: "@flux", stars: 5, text: "10 variantes y ni un salto de FPS." },
      { user: "@mira", stars: 5, text: "Mycelium es hipnótico." },
    ],
    branches: [
      { author: "StarSeed Core", name: "main", note: "10 variantes + auto-cycle." },
      { author: "@flux", name: "living-lowpower", note: "Modo ahorro para móviles." },
    ],
    downloads: 1540,
  },
  {
    id: "bg-spline",
    name: "Fondo · Spline (escena 3D)",
    kind: "background",
    description:
      "Fondo 3D basado en Spline para escenas inmersivas. Carga diferida con fallback al fondo Living si la escena no está disponible.",
    tags: ["background", "spline", "3d", "inmersivo"],
    author: "StarSeed Studio",
    version: "1.0.0",
    license: "MIT",
    attribution: "Integración Spline StarSeed (MIT). Escenas: licencia del autor de la escena.",
    media: { images: [svgCover("#0a0118", "#7FD8E8", "Spline 3D")], videos: [] },
    fileRef: "src/components/ui/SplineBackground.tsx",
    externalUrl: "https://spline.design",
    code: `import { SplineBackground } from "@/components/ui/SplineBackground";
<SplineBackground /> // fallback a Living si la escena falla`,
    reviews: [
      { user: "@deep", stars: 4, text: "Espectacular; ojo con el peso en móvil." },
    ],
    branches: [
      { author: "StarSeed Studio", name: "main", note: "Escena por defecto + fallback." },
    ],
    downloads: 410,
  },
  {
    id: "bg-materia",
    name: "Fondo · Materia Viva",
    kind: "background",
    description:
      "Acentos orgánicos (oro-vivo, cristal-líquido, bosque-dorado) sobre canvas verde-negro. Intensidad 0–1. Pensado como capa de marca sobre cualquier tema.",
    tags: ["background", "materia-viva", "orgánico", "oro", "canvas"],
    author: "StarSeed Studio",
    version: "1.0.0",
    license: "MIT",
    attribution: "Materia Viva StarSeed (MIT).",
    media: { images: [svgCover("#0d130e", "#E9C46A", "Materia Viva")], videos: [] },
    fileRef: "src/components/backgrounds/materia-viva-background.tsx",
    code: `import { MateriaVivaBackground } from "@/components/backgrounds/materia-viva-background";
<MateriaVivaBackground intensity={0.7} />`,
    reviews: [
      { user: "@root", stars: 5, text: "La capa de marca perfecta." },
    ],
    branches: [
      { author: "StarSeed Studio", name: "main", note: "Acentos oro sobre verde-negro." },
    ],
    downloads: 360,
  },
  {
    id: "bg-audiomorphic",
    name: "Fondo · Audiomorphic (reactivo a audio)",
    kind: "background",
    description:
      "Visualizador de consciencia reactivo al audio con geometría sagrada (Flor de la Vida, Metatrón, toro). Integrable como fondo vivo o como widget.",
    tags: ["background", "audiomorphic", "audio-reactivo", "geometría-sagrada"],
    author: "Audiomorphic",
    version: "1.0.0",
    license: "MIT",
    attribution: "Audiomorphic AR · StarSeed (MIT).",
    media: { images: [svgCover("#160b30", "#6FE6D6", "Audiomorphic")], videos: [] },
    fileRef: "src/components/ui/backgrounds/audiomorphic-background.tsx",
    externalUrl: "https://audiomorphic.vercel.app",
    code: `import { AudiomorphicBackground } from "@/components/ui/backgrounds/audiomorphic-background";
<AudiomorphicBackground /> // requiere permiso de audio; con fallback estático`,
    reviews: [
      { user: "@sound", stars: 5, text: "Reacciona al beat con una belleza absurda." },
    ],
    branches: [
      { author: "Audiomorphic", name: "main", note: "Geometrías sagradas reactivas." },
      { author: "@sound", name: "audio-mic", note: "Entrada de micrófono opcional." },
    ],
    downloads: 880,
  },
];

/* ============================================================
   4) ENLACES EXTERNOS · sitios de fondos creativos GRATUITOS
   ============================================================ */
const ext = (
  id: string,
  name: string,
  url: string,
  description: string,
  license: AssetLicense,
  attribution: string,
  tags: string[],
  cover: [string, string]
): DesignAsset => ({
  id,
  name,
  kind: "external",
  description,
  tags: ["external", "fondos", "gratis", ...tags],
  author: name.split(" ")[0],
  version: "web",
  license,
  attribution,
  media: { images: [svgCover(cover[0], cover[1], name)], videos: [] },
  externalUrl: url,
  reviews: [],
  branches: [{ author: "comunidad", name: "web", note: "Recurso externo libre." }],
});

const EXTERNAL: DesignAsset[] = [
  ext(
    "ext-haikei",
    "Haikei",
    "https://haikei.app",
    "Generador de fondos SVG: blobs, ondas, gradientes en malla, patrones. Exporta SVG/PNG listos para usar.",
    "OpenSource",
    "Haikei · gratis para uso personal y comercial; revisa términos del sitio.",
    ["svg", "generador", "blobs", "ondas"],
    ["#1a1033", "#7C5CFF"]
  ),
  ext(
    "ext-uigradients",
    "uiGradients",
    "https://uigradients.com",
    "Galería de degradados de dos colores con código CSS copiable al instante.",
    "MIT",
    "uiGradients · proyecto open-source (MIT).",
    ["gradientes", "css"],
    ["#FF512F", "#DD2476"]
  ),
  ext(
    "ext-cssgradient",
    "CSS Gradient",
    "https://cssgradient.io",
    "Editor visual de degradados CSS (lineales/radiales) con exportación de código.",
    "OpenSource",
    "CSS Gradient · gratis para cualquier uso.",
    ["gradientes", "editor", "css"],
    ["#0F2027", "#2C5364"]
  ),
  ext(
    "ext-svgbackgrounds",
    "SVGBackgrounds",
    "https://svgbackgrounds.com",
    "Fondos SVG personalizables (color, patrón) listos para fondo de página.",
    "OpenSource",
    "SVGBackgrounds · uso libre; atribución apreciada.",
    ["svg", "patrones"],
    ["#13547a", "#80d0c7"]
  ),
  ext(
    "ext-coolbackgrounds",
    "Cool Backgrounds",
    "https://coolbackgrounds.io",
    "Generadores de fondos (partículas, triángulos, gradientes) con descarga en alta resolución.",
    "OpenSource",
    "Cool Backgrounds · uso libre del resultado.",
    ["generador", "partículas"],
    ["#4568DC", "#B06AB3"]
  ),
  ext(
    "ext-animista",
    "Animista",
    "https://animista.net",
    "Biblioteca de animaciones CSS configurables; copia el keyframe que necesites.",
    "MIT",
    "Animista · animaciones CSS bajo MIT.",
    ["animaciones", "css", "keyframes"],
    ["#232526", "#414345"]
  ),
  ext(
    "ext-patterncss",
    "Pattern.css",
    "https://bansal.io/pattern-css",
    "Librería CSS de patrones (rayas, lunares, zigzag) aplicables con una clase.",
    "MIT",
    "Pattern.css · MIT.",
    ["patrones", "css"],
    ["#000428", "#004e92"]
  ),
  ext(
    "ext-heropatterns",
    "Hero Patterns",
    "https://heropatterns.com",
    "Patrones SVG en mosaico, gratuitos, personalizables en color y opacidad.",
    "CC0",
    "Hero Patterns · dominio público (CC0).",
    ["patrones", "svg", "tileable"],
    ["#3a1c71", "#d76d77"]
  ),
];

/* ============================================================
   CARPETAS (la estructura "Diseños · Código abierto")
   ============================================================ */
export const DESIGN_ASSET_FOLDERS: DesignAssetFolder[] = [
  {
    id: "themes",
    title: "Temas StarSeed · integrables",
    desc: "Los temas del propio OS como recursos descargables y adaptables (CSS variables).",
    assets: THEMES,
  },
  {
    id: "tokens",
    title: "Tokens · paletas, tipografía y glass",
    desc: "Colores, tipografía y recetas de cristal líquido del sistema de diseño.",
    assets: TOKENS,
  },
  {
    id: "backgrounds",
    title: "Fondos del OS · componentes",
    desc: "Spline, Living/WebGL (10 variantes), Materia Viva y Audiomorphic como recursos integrables.",
    assets: BACKGROUNDS,
  },
  {
    id: "external",
    title: "Fondos creativos gratuitos · enlaces externos",
    desc: "Sitios libres para generar fondos, degradados y patrones. Cada uno con su licencia/atribución.",
    assets: EXTERNAL,
  },
];

/** Todos los assets del dataset base (sin los del usuario). */
export const ALL_DESIGN_ASSETS: DesignAsset[] = DESIGN_ASSET_FOLDERS.flatMap(
  (f) => f.assets
);

/** Clave de persistencia local para assets subidos por el usuario. */
export const USER_ASSETS_STORAGE_KEY = "starseed.library.assets.v1";

/** Crea un asset vacío para el modo "Subir diseño" / edición. */
export function emptyDesignAsset(): DesignAsset {
  return {
    id: `user-${Date.now().toString(36)}`,
    name: "",
    kind: "component",
    description: "",
    tags: [],
    author: "",
    version: "1.0.0",
    license: "MIT",
    attribution: "",
    media: { images: [], videos: [] },
    code: "",
    externalUrl: "",
    repoUrl: "",
    reviews: [],
    branches: [],
    downloads: 0,
    userCreated: true,
  };
}
