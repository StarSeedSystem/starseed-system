"use client";

/**
 * AVATAR de una personalidad de Aurora (Adenda 67 · P1-1).
 * ============================================================================
 * Dos caminos, ambos GRATIS y sin dependencias nuevas:
 *
 *  1) PROCEDURAL (por defecto, siempre funciona, offline, determinista):
 *     un SVG generado a partir del nombre + rasgos de la personalidad. El mismo
 *     perfil produce SIEMPRE el mismo avatar; dos perfiles distintos, dos avatares
 *     distintos. La paleta la marcan sus rasgos (calidez → ámbar/rosa; serenidad →
 *     azules; creatividad → violetas), así que el avatar «se parece» a la
 *     personalidad de verdad, no es ruido.
 *
 *  2) GENERADA con IA (opcional, gratis y sin clave): construye la URL de
 *     Pollinations Image a partir de un prompt derivado del perfil. Es un `<img>`
 *     con una URL — cero dependencias. HONESTIDAD: es un servicio EXTERNO; si no
 *     hay red o el servicio falla, la UI se queda con el avatar procedural y lo
 *     dice. Nunca se guarda nada en Pollinations: sólo se lee una imagen.
 *
 * SSR-safe: son funciones puras; `btoa` sólo se usa dentro de guardas.
 */

import type { PersonalityProfile } from "@/lib/aurora/personalities";

/* ─────────────────── Hash determinista (FNV-1a 32 bits) ─────────────────── */

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** PRNG determinista (mulberry32) sembrado por el hash del nombre. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/* ─────────────────── Paleta derivada de los rasgos ─────────────────── */

/**
 * Tono base (0-360) a partir de los rasgos: no es aleatorio, la personalidad
 * MANDA. Calidez/pasión empujan al ámbar-rosa; serenidad, al azul-cian;
 * creatividad e imaginación, al violeta.
 */
function baseHue(p: Pick<PersonalityProfile, "traits" | "name">): number {
  const t = p.traits ?? {};
  const calidez = t.calidez ?? 50;
  const serenidad = t.serenidad ?? 50;
  const creatividad = t.creatividad ?? 50;
  const analisis = t.analisis ?? 50;
  // Mezcla ponderada de cuatro polos cromáticos.
  const pesos: Array<[number, number]> = [
    [28, calidez], // ámbar
    [200, serenidad], // azul
    [280, creatividad], // violeta
    [170, analisis], // cian-verde
  ];
  const total = pesos.reduce((acc, [, w]) => acc + w, 0) || 1;
  // Media circular sencilla (los polos están lo bastante separados para que baste).
  let x = 0;
  let y = 0;
  for (const [hue, w] of pesos) {
    const rad = (hue * Math.PI) / 180;
    x += Math.cos(rad) * w;
    y += Math.sin(rad) * w;
  }
  const mean = (Math.atan2(y / total, x / total) * 180) / Math.PI;
  // Un desplazamiento estable por nombre para que dos personalidades con rasgos
  // parecidos no salgan idénticas.
  const jitter = (hash32(p.name || "aurora") % 24) - 12;
  return (mean + 360 + jitter) % 360;
}

export interface PersonaPalette {
  hue: number;
  primary: string;
  secondary: string;
  accent: string;
  bgFrom: string;
  bgTo: string;
}

export function personaPalette(p: PersonalityProfile): PersonaPalette {
  const t = p.traits ?? {};
  const h = baseHue(p);
  const energia = clamp((t.entusiasmo ?? 50) + (t.pasion ?? 50) - 50, 0, 100);
  const sat = Math.round(clamp(45 + energia * 0.4, 40, 90));
  const lum = Math.round(clamp(70 - (t.formalidad ?? 40) * 0.15, 50, 74));
  const hsl = (hh: number, ss: number, ll: number) => `hsl(${Math.round((hh + 360) % 360)} ${ss}% ${ll}%)`;
  return {
    hue: h,
    primary: hsl(h, sat, lum),
    secondary: hsl(h + 42, sat - 8, lum - 10),
    accent: hsl(h - 48, Math.min(95, sat + 15), Math.min(82, lum + 12)),
    bgFrom: hsl(h + 12, Math.max(22, sat - 30), 14),
    bgTo: hsl(h - 24, Math.max(18, sat - 34), 8),
  };
}

/* ─────────────────── Avatar PROCEDURAL (SVG) ─────────────────── */

/**
 * SVG determinista: un orbe de cristal líquido con anillos, pétalos y una
 * constelación única por personalidad. Sin dependencias, sin red, sin fuentes
 * externas (la inicial va como `<text>` con la familia del sistema).
 */
export function proceduralAvatarSvg(p: PersonalityProfile, size = 256): string {
  const pal = personaPalette(p);
  const seed = hash32(`${p.id}|${p.name}`);
  const rand = rng(seed);
  const initial = (p.name || "A").trim().charAt(0).toUpperCase();

  const t = p.traits ?? {};
  // Nº de pétalos: más creatividad/imaginación → forma más rica.
  const petals = Math.round(clamp(3 + ((t.creatividad ?? 50) + (t.imaginacion ?? 50)) / 40, 3, 9));
  // Nº de estrellas de la constelación: curiosidad.
  const stars = Math.round(clamp(3 + (t.curiosidad ?? 50) / 18, 3, 9));
  // Grosor del anillo: protección/confianza.
  const ring = clamp(1.5 + (t.proteccion ?? 50) / 40, 1.5, 4).toFixed(1);

  const cx = 128;
  const cy = 128;

  const petalPaths: string[] = [];
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 + rand() * 0.3;
    const r = 54 + rand() * 26;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    const rx = 26 + rand() * 16;
    const ry = 12 + rand() * 12;
    const rot = ((a * 180) / Math.PI).toFixed(1);
    petalPaths.push(
      `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(
        1,
      )}" transform="rotate(${rot} ${px.toFixed(1)} ${py.toFixed(1)})" fill="url(#petal)" opacity="0.5"/>`,
    );
  }

  const starDots: string[] = [];
  for (let i = 0; i < stars; i++) {
    const a = rand() * Math.PI * 2;
    const r = 30 + rand() * 78;
    const sx = cx + Math.cos(a) * r;
    const sy = cy + Math.sin(a) * r;
    const rr = (0.9 + rand() * 2.1).toFixed(1);
    starDots.push(
      `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${rr}" fill="${pal.accent}" opacity="${(
        0.4 +
        rand() * 0.5
      ).toFixed(2)}"/>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="${size}" height="${size}" role="img" aria-label="Avatar de ${escapeXml(
    p.name,
  )}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="35%" r="75%">
      <stop offset="0%" stop-color="${pal.bgFrom}"/>
      <stop offset="100%" stop-color="${pal.bgTo}"/>
    </radialGradient>
    <radialGradient id="orb" cx="38%" cy="32%" r="70%">
      <stop offset="0%" stop-color="${pal.accent}" stop-opacity="0.95"/>
      <stop offset="55%" stop-color="${pal.primary}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${pal.secondary}" stop-opacity="0.55"/>
    </radialGradient>
    <linearGradient id="petal" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${pal.primary}" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="${pal.accent}" stop-opacity="0.15"/>
    </linearGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
  </defs>
  <rect width="256" height="256" rx="56" fill="url(#bg)"/>
  <g filter="url(#soft)">${petalPaths.join("")}</g>
  ${starDots.join("")}
  <circle cx="${cx}" cy="${cy}" r="62" fill="url(#orb)"/>
  <circle cx="${cx}" cy="${cy}" r="62" fill="none" stroke="${pal.accent}" stroke-opacity="0.55" stroke-width="${ring}"/>
  <circle cx="${cx}" cy="${cy}" r="78" fill="none" stroke="${pal.primary}" stroke-opacity="0.22" stroke-width="1"/>
  <ellipse cx="106" cy="104" rx="20" ry="12" fill="#fff" opacity="0.22" transform="rotate(-28 106 104)"/>
  <text x="${cx}" y="${cy + 13}" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif"
        font-size="52" font-weight="700" fill="#fff" fill-opacity="0.92">${escapeXml(initial)}</text>
</svg>`;
}

function escapeXml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** El SVG procedural como `data:` URL, listo para `<img src>` o para guardar. */
export function proceduralAvatarDataUrl(p: PersonalityProfile, size = 256): string {
  const svg = proceduralAvatarSvg(p, size);
  // `encodeURIComponent` evita los problemas de `btoa` con caracteres no ASCII
  // (acentos del nombre) y funciona igual en cualquier navegador.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ─────────────────── Avatar GENERADO con IA (gratis, sin clave) ─────────────────── */

/** Prompt derivado del perfil (determinista y legible: el usuario puede editarlo). */
export function avatarPromptFor(p: PersonalityProfile): string {
  const t = p.traits ?? {};
  const alto = (k: string) => (t[k] ?? 50) >= 68;
  const rasgos: string[] = [];
  if (alto("calidez")) rasgos.push("warm");
  if (alto("serenidad")) rasgos.push("serene");
  if (alto("creatividad") || alto("imaginacion")) rasgos.push("imaginative");
  if (alto("analisis") || alto("precision")) rasgos.push("precise");
  if (alto("proteccion")) rasgos.push("protective");
  if (alto("curiosidad")) rasgos.push("curious");
  if (alto("humor")) rasgos.push("playful");
  const persona = [p.personaje, p.cultura, p.filosofia].filter(Boolean).join(", ");
  return [
    `portrait avatar of "${p.name}"`,
    persona ? `archetype: ${persona}` : "",
    rasgos.length ? `traits: ${rasgos.join(", ")}` : "",
    "liquid crystal glass aesthetic, cyberdelic, luminous aurora tones, soft volumetric light, translucent facets",
    "digital painting, centered, clean dark background, no text, no watermark",
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * URL de imagen generada con Pollinations (gratis, sin clave, sin dependencias).
 * Es una URL directa: se usa como `src` de un `<img>`. Determinista gracias a
 * `seed` (el mismo perfil → la misma imagen).
 *
 * Servicio EXTERNO: si no hay red o Pollinations falla, hay que caer al avatar
 * procedural (la UI lo hace y lo dice explícitamente).
 */
export function generatedAvatarUrl(p: PersonalityProfile, opts?: { prompt?: string; size?: number }): string {
  const prompt = (opts?.prompt || avatarPromptFor(p)).slice(0, 600);
  const size = opts?.size ?? 512;
  const seed = hash32(`${p.id}|${p.name}`) % 100000;
  const qs = new URLSearchParams({
    width: String(size),
    height: String(size),
    seed: String(seed),
    nologo: "true",
    model: "flux",
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${qs.toString()}`;
}
