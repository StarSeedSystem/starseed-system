const STARSEED_COLOR_PALETTE = [
  { h: 270, s: 20, l: 97 }, // background
  { h: 265, s: 25, l: 12 }, // foreground
  { h: 270, s: 25, l: 99 }, // card
  { h: 276, s: 85, l: 55 }, // primary
  { h: 39, s: 95, l: 52 }, // secondary
  { h: 270, s: 15, l: 93 }, // muted
  { h: 265, s: 15, l: 38 }, // muted-foreground
  { h: 150, s: 70, l: 35 }, // accent
  { h: 0, s: 80, l: 60 }, // destructive
  { h: 270, s: 18, l: 88 }, // border
  { h: 270, s: 18, l: 91 }, // input
  { h: 210, s: 100, l: 50 }, // trinity-azure
  { h: 111, s: 100, l: 54 }, // trinity-lime
  { h: 160, s: 84, l: 39 }, // trinity-emerald
  { h: 45, s: 100, l: 50 }, // trinity-amber
  { h: 348, s: 83, l: 47 }, // trinity-crimson
  { h: 187, s: 92, l: 55 }, // trinity-cyan
  { h: 300, s: 85, l: 60 }, // trinity-magenta
  { h: 340, s: 90, l: 62 }, // trinity-rose
  { h: 240, s: 80, l: 62 }, // trinity-indigo
];
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash) + str.charCodeAt(i);
  return hash;
}
function getTwoColorsFromDomain(domain: string): string[] {
  const hash = hashString(domain);
  const idx1 = Math.abs(hash) % STARSEED_COLOR_PALETTE.length;
  let idx2 = (Math.abs(hash) + 1) % STARSEED_COLOR_PALETTE.length;
  if (idx2 === idx1) idx2 = (idx2 + 1) % STARSEED_COLOR_PALETTE.length;
  const color1 = STARSEED_COLOR_PALETTE[idx1];
  const color2 = STARSEED_COLOR_PALETTE[idx2];
  return [
    `hsl(${color1.h} ${color1.s}% ${color1.l}%)`,
    `hsl(${color2.h} ${color2.s}% ${color2.l}%)`
  ];
}
function getIniciales(nombre: string): string {
  if (!nombre) return '??';
  const words = nombre.trim().split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return '??';
  let initials = '';
  for (const word of words) {
    initials += word[0];
    if (initials.length >= 2) break;
  }
  if (initials.length >= 2) {
    return initials.slice(0, 2).toUpperCase();
  }
   const firstWord = words[0];
  if (firstWord.length >= 2) {
    return (firstWord[0] + firstWord[1]).toUpperCase();
  }
  // firstWord length is 1
  return (firstWord[0] + firstWord[0]).toUpperCase();
}
const TIPO_TO_ICONO: Record<string, string> = {
  'herramienta-ia': 'Bot',
  'guia-principios': 'BookOpen',
  'recursos-descargables': 'Package',
  'galeria-inspiracion': 'Image',
  'comunidad-curso': 'Users',
  'codigo-abierto': 'Code',
  'otro': 'HelpCircle'
};
export interface PortadaGenerada {
  degradado: string[]; // Two HSL color strings
  iniciales: string;
  icono: string; // Lucide icon name
}

export function portadaGenerada(entrada: Entry): PortadaGenerada {
  // Extract domain from URL
  let domain = '';
  try {
    const url = new URL(entrada.url);
    domain = url.hostname;
  } catch (e) {
    // If URL is invalid, use the whole url as domain?
    domain = entrada.url;
  }
  const degradado = getTwoColorsFromDomain(domain);
  const iniciales = getIniciales(entrada.nombre);
  const icono = TIPO_TO_ICONO[entrada.tipo] || 'BookOpen';
  return {
    degradado,
    iniciales,
    icono
  };
}

export function portadaRemota(entrada: Entry, abierta: boolean): string | null {
  // If the entry has 'caché' in prohibido, return null
  if (entrada.prohibido.includes('caché')) {
    return null;
  }
  // If not opened, return null
  if (!abierta) {
    return null;
  }
  // Return the og_imagen, but if it's a YouTube URL, we should use youtube-nocookie.com?
  // However, the og_imagen for YouTube is from i.ytimg.com, which is not the main YouTube domain.
  // The task says: "vídeos de YouTube por youtube-nocookie.com." - this might be for the video embed, not the image.
  // We'll return the og_imagen as is, but note that for YouTube we are not changing the image domain.
  // We'll assume the og_imagen is already correct or that the task only refers to the video player.
  return entrada.og_imagen;
}

// Define the Entry type based on the config structure
interface Entry {
  url: string;
  nombre: string;
  tipo: string;
  tema: string;
  subtema: string | null;
  og_imagen: string | null;
  prohibido: string[];
  // Other fields are not needed for this function
}