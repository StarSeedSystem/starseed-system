// perfil-marca — Perfil de marca de Diagram Design desde los tokens del tema del OS.
// Puro (sin red ni disco): convierte los ThemeTokens del contexto (persona, página o
// grupo, entity-theme-scope.ts) en los tokens semánticos de la guía de estilo de la
// skill MIT diagram-design (references/style-guide.md) y lo escribe como perfil activo
// (references/profiles.md), con contraste AA medido contra el papel real (≥ 4,5:1
// texto; ≥ 3:1 trazos esenciales) y el velo del fondo de Shaders (fondos-shaders.md
// §4). Fuentes del OS; contrato: architecture/diagramas.md §4 (Ola 1018D, tarea E).

import type { ThemeTokens } from "@/lib/design/theme-engine";

export type RGB = [number, number, number];
/** Paleta muestreada del fondo elegido (un set de Shaders u otro fondo). */
export interface PaletaFondo { colores: string[]; velo?: number }
/** Tokens semánticos de la guía de estilo, por el nombre español del rol. */
export interface TokensGuia {
    papel: string; papel2: string; tinta: string; tintaFuerte: string;
    apagado: string; suave: string; regla: string; reglaSolida: string;
    acento: string; acentoVelo: string; enlace: string;
}
export interface PerfilMarca {
    nombre: string; // por defecto; el receptor renombra si guarda la copia
    /** Slug válido para `~/.diagram-design/profiles/`: ASCII minúsculas y guiones (≤ 64). */
    slug: string;
    creado: string; actualizado: string; // fechas AAAA-MM-DD del bloque
    modo: "claro" | "oscuro";
    notas?: string;
    urlOrigen?: string;
    tokens: TokensGuia;
    contraste: Record<string, number>; // AA medido de cada token de texto vs papel
}

/** HSL (0–360, 0–100, 0–100) a RGB 0–255. */
export function hslARgb(h: number, s: number, l: number): RGB {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const seg: RGB = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return seg.map((v) => Math.round((v + m) * 255)) as RGB;
}

/** RGB 0–255 a HSL (0–360, 0–100, 0–100). */
export function rgbAHsl([r, g, b]: RGB): [number, number, number] {
    const R = r / 255, G = g / 255, B = b / 255, max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min, l = (max + min) / 2;
    if (!d) return [0, 0, l * 100];
    const h = max === R ? (((G - B) / d + 6) % 6) * 60 : max === G ? ((B - R) / d + 2) * 60 : ((R - G) / d + 4) * 60;
    return [((h % 360) + 360) % 360, (d / (1 - Math.abs(2 * l - 1))) * 100, l * 100];
}

/** hex, rgb()/rgba() (alfa ignorado) o el triple HSL «45 50% 95%» de los temas del OS
 *  (claves `*-hsl`/`*-rgb`). null si no se entiende: el color irá al valor por defecto. */
export function parsearColor(valor: string): RGB | null {
    const v = valor.trim().toLowerCase();
    if (/^(oklch|lab|lch|oklab)/.test(v)) return null;
    const hex = /^#([0-9a-f]{3,8})$/.exec(v);
    if (hex) {
        const d = hex[1], f = d.length <= 4 ? [...d.slice(0, 3)].map((c) => c + c).join("") : d.slice(0, 6);
        return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
    }
    const n = v.replace(/[a-z()%#]/g, " ").split(/\s+/).filter(Boolean).map(Number).filter((x) => !isNaN(x));
    if (n.length < 3) return null;
    if (v.includes("%")) return hslARgb(Math.abs(n[0]), Math.min(100, Math.abs(n[1])), Math.min(100, Math.abs(n[2])));
    const c = (x: number) => Math.max(0, Math.min(255, x));
    return [c(n[0]), c(n[1]), c(n[2])];
}

/** Ratio de contraste WCAG 2.x entre dos colores RGB. */
export function contraste(a: RGB, b: RGB): number {
    const lum = (c: number) => {
        const t = c / 255;
        return t <= 0.03928 ? t / 12.92 : Math.pow((t + 0.055) / 1.055, 2.4);
    };
    const la = 0.2126 * lum(a[0]) + 0.7152 * lum(a[1]) + 0.0722 * lum(a[2]);
    const lb = 0.2126 * lum(b[0]) + 0.7152 * lum(b[1]) + 0.0722 * lum(b[2]);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Slug de perfil (references/profiles.md): minúsculas ASCII y guiones, ≤ 64, no vacío. */
export function slugificar(nombre: string): string {
    const s = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
    return s.replace(/-+$/, "") || "perfil";
}

const mezclar = (a: RGB, b: RGB, p: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * p)) as RGB;
const aHex = (rgb: RGB): string => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");

/** La regla de la guía: se elige el valor y se mueve su luminosidad en el MISMO hue
 *  hasta el umbral (4,5 texto; 3 trazos). Si ninguna L llega, se mezcla hacia `hacia`
 *  (la tinta ya pasa) y se repite: converge en pocas vueltas. */
function asegurar(color: RGB, fondo: RGB, hacia: RGB, umbral = 4.5): RGB {
    if (contraste(color, fondo) >= umbral) return color;
    const [h, s, l0] = rgbAHsl(color);
    let mejor: RGB | null = null, dist = Infinity;
    for (let l = 2; l <= 98; l += 2) {
        const c = hslARgb(h, s, l);
        if (contraste(c, fondo) >= umbral && Math.abs(l - l0) < dist) { mejor = c; dist = Math.abs(l - l0); }
    }
    if (mejor) return mejor;
    return asegurar(mezclar(color, hacia, 0.5), fondo, hacia, umbral);
}

/** Lee `base-hsl` o `base` de los vars del tema; si no hay, el defecto de la guía. */
function colorDe(vars: Record<string, string>, base: string, defecto: RGB): RGB {
    return parsearColor(vars[`${base}-hsl`] ?? vars[base] ?? "") ?? defecto;
}

/** La piel por defecto es la del propio style-guide.md de la skill (claro y oscuro). */
const DEFECTOS: Record<"claro" | "oscuro", { papel: RGB; tinta: RGB; acento: RGB; enlace: RGB; apagado: RGB; borde: RGB }> = {
    claro: { papel: [245, 245, 245], tinta: [45, 49, 66], acento: [191, 69, 32], enlace: [46, 90, 168], apagado: [79, 93, 117], borde: [191, 192, 192] },
    oscuro: { papel: [45, 49, 66], tinta: [245, 245, 245], acento: [240, 138, 89], enlace: [115, 159, 223], apagado: [191, 192, 192], borde: [191, 192, 192] },
};

/** Perfil de marca desde los tokens del tema y su modo, ajustado hasta AA. */
export function perfilDesdeTema(tokens: ThemeTokens, modo: "claro" | "oscuro", paletaFondo?: PaletaFondo): PerfilMarca {
    const oscuro = modo === "oscuro", d = DEFECTOS[modo], vars = tokens?.vars ?? {};
    const hoy = new Date().toISOString().slice(0, 10);
    let papel = colorDe(vars, "background", d.papel);
    const tinta0 = colorDe(vars, "foreground", d.tinta);
    const acento0 = colorDe(vars, "primary", colorDe(vars, "accent", d.acento));
    // Velo de difusión del fondo (capa de Shaders o degradado): el papel se tiñe con
    // la media muestreada ANTES de medir — la guía pide compositar primero y después
    // contrastar sobre la superficie resultante.
    const mues = (paletaFondo?.colores ?? []).map(parsearColor).filter((c): c is RGB => c !== null);
    if (mues.length) {
        const media = mues.reduce((acc, c) => [acc[0] + c[0] / mues.length, acc[1] + c[1] / mues.length, acc[2] + c[2] / mues.length] as RGB, [0, 0, 0] as RGB);
        papel = mezclar(papel, media, Math.min(1, Math.max(0, paletaFondo.velo ?? 0.16)));
    }
    const tinta = asegurar(tinta0, papel, tinta0);
    const acento = asegurar(acento0, papel, tinta);
    const apagado = asegurar(colorDe(vars, "muted-foreground", d.apagado), papel, tinta);
    const suave = asegurar(mezclar(apagado, tinta, 0.35), papel, tinta);
    const enlace = asegurar(d.enlace, papel, tinta); // familia azul-hierro de la guía, calibrada al papel
    const reglaSolida = asegurar(colorDe(vars, "border", d.borde), papel, tinta, 3);
    const tintaFuerte = asegurar(mezclar(tinta, oscuro ? [255, 255, 255] : [17, 17, 17], 0.6), papel, tinta);
    const tokens: TokensGuia = {
        papel: aHex(papel), papel2: aHex(mezclar(papel, tinta, 0.05)), tinta: aHex(tinta), tintaFuerte: aHex(tintaFuerte),
        apagado: aHex(apagado), suave: aHex(suave), regla: `rgba(${tinta.join(",")},0.12)`, reglaSolida: aHex(reglaSolida),
        acento: aHex(acento), acentoVelo: `rgba(${acento.join(",")},${oscuro ? "0.10" : "0.08"})`, enlace: aHex(enlace),
    };
    const mediciones: Record<string, number> = {}; // ≥ 4,5 todos salvo reglaSolida (trazo: ≥ 3)
    for (const [k, rgb] of [["tinta", tinta], ["tintaFuerte", tintaFuerte], ["apagado", apagado], ["suave", suave], ["enlace", enlace], ["acento", acento], ["reglaSolida", reglaSolida]] as [string, RGB][]) {
        mediciones[k] = +contraste(rgb, papel).toFixed(2);
    }
    return { nombre: "Diagramas StarSeed", slug: "diagramas-starseed", creado: hoy, actualizado: hoy, modo, contraste: mediciones, tokens };
}

const ROLES: [keyof TokensGuia, string][] = [
    ["papel", "paper"], ["papel2", "paper-2"], ["tinta", "ink"], ["tintaFuerte", "ink-strong"], ["apagado", "muted"],
    ["suave", "soft"], ["regla", "rule"], ["reglaSolida", "rule-solid"], ["acento", "accent"], ["acentoVelo", "accent-tint"], ["enlace", "link"],
];

/** Los valores del bloque van en una línea: sin saltos ni «--» (profiles.md). */
const datoSeguro = (valor: string): string => valor.replace(/[\r\n]+/g, " ").replace(/--/g, "–").trim() || "none";

/** Escribe el bloque «<!-- diagram-design-profile … -->» + cuerpo del perfil activo
 *  (references/profiles.md). Con `previo`, retira SU cabecera antes de poner la nueva
 *  (strip, then prepend: las cabeceras nunca se apilan). */
export function bloquePerfil(perfil: PerfilMarca, previo?: string): string {
    const cabecera =
        `<!-- diagram-design-profile\nname: ${datoSeguro(perfil.nombre)}\nslug: ${/^[a-z0-9][a-z0-9-]{0,63}$/.test(perfil.slug) ? perfil.slug : slugificar(perfil.slug)}\nsource-url: ${datoSeguro(perfil.urlOrigen ?? "none")}\ncreated: ${perfil.creado}\nupdated: ${perfil.actualizado}\nnotes: ${datoSeguro(perfil.notas ?? "none")}\n-->`;
    const filasContraste: [string, string][] = [
        ["tinta", "texto y trazo principales"], ["apagado", "texto secundario y flechas"], ["suave", "subetiquetas"],
        ["enlace", "llamadas externas"], ["acento", "foco: texto, trazo y rellenos"], ["reglaSolida", "trazo esencial"],
    ];
    const propio =
        `# Style Guide\n\n## Tokens\n\n### Semantic roles\n\n| Role | Valor |\n|---|---|\n` +
        ROLES.map(([k, n]) => `| \`${n}\` | \`${perfil.tokens[k]}\` |`).join("\n") +
        `\n\n### Contrast contract (AA medido sobre el papel)\n\n| Token | Ratio | Uso |\n|---|---|---|\n` +
        filasContraste.map(([k, uso]) => `| \`${k}\` | ${(perfil.contraste[k] ?? 0).toFixed(1).replace(".", ",")}:1 | ${uso} |`).join("\n") +
        `\n\n## Typography\n\nFont source: \`system\` — fuentes servidas por el OS, sin Google Fonts (architecture/diagramas.md §3).\n\n| Role | Familia |\n|---|---|\n| \`title\` | Instrument Serif, Noto Serif, serif |\n| \`node-name\` | Geist, system-ui, sans-serif |\n| \`sublabel\` · \`eyebrow\` · \`arrow-label\` | Geist Mono, ui-monospace, monospace |\n| \`callout\` | Instrument Serif, Noto Serif, serif (cursiva) |\n\n### Stroke, radius, spacing\n\n\`stroke-thin\` 0,8 · \`stroke-default\` 1 · \`stroke-strong\` 1,2 · \`radius-sm\` 4 · \`radius-md\` 6 · \`radius-lg\` 8 · \`grid\` 4`;
    const cuerpo = previo ? previo.replace(/^<!-- diagram-design-profile\n[\s\S]*?-->\n\n?/, "") : propio;
    return `${cabecera}\n\n${cuerpo}`;
}
