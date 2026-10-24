// Perfil de marca de los diagramas (contrato architecture/diagramas.md §3-2, tarea E): los tokens de tema de la persona,
// página o grupo —y la paleta de su fondo de Shaders— pasan a los roles de la guía de estilo de la skill diagram-design (MIT,
// Cathryn Lavery; vendor/habilidades/diagram-design/references/style-guide.md) con el contraste AA MEDIDO (luminancia WCAG 2.x
// de xr/tokens-3d) contra la peor superficie con texto: paper, paper-2 y la caja focal (accent-tint sobre paper).
// `bloquePerfil` lo escribe con la cabecera de perfil de references/profiles.md. Módulo PURO (reloj inyectable), sin `any`.
import type { ThemePack, ThemeTokens } from "@/lib/design/theme-engine";
import { contraste, luminancia, mezclar } from "@/lib/xr/tokens-3d";

/** Roles de color de la guía, con su propósito (columna «Purpose» del bloque). */
const PROPOSITO = { paper: "Fondo de página, relleno por defecto", "paper-2": "Contenedor, relleno secundario",
  ink: "Texto y trazo principal", "ink-strong": "Texto sobre rellenos de acento", muted: "Texto secundario, flecha por defecto",
  soft: "Subetiquetas, etiquetas de límite", rule: "Filetes finos", "rule-solid": "Bordes fuertes, líneas base",
  accent: "Foco: 1–2 por diagrama como mucho", "accent-tint": "Relleno de cajas con borde de acento", link: "HTTP/API, flechas externas" };
export type RolColor = keyof typeof PROPOSITO;
export type ModoPerfil = Exclude<keyof ThemePack["modes"], "auto">;
/** Colores del preset y de una muestra del fotograma (fondos-shaders.md §4-1); el primero es el dominante. */
export type PaletaFondo = readonly string[];
/** `contraste`: razón WCAG de cada texto contra su peor superficie (ink-strong: sobre el acento al 0,85); `avisos`: el motivo. */
export interface PerfilDiagrama {
  modo: ModoPerfil; colores: Record<RolColor, string>; contraste: Partial<Record<RolColor, number>>; avisos: string[];
  fuentes: { serif: string; sans: string; mono: string };
  trazos: { thin: number; default: number; strong: number }; radios: { sm: number; md: number; lg: number };
}
export interface MetaPerfil { nombre: string; slug?: string; fecha?: string; notas?: string }
const AA = 4.5, TRAZOS = { thin: 0.8, default: 1, strong: 1.2 };
const PIEL = { // piel por defecto de la skill (style-guide.md): respaldo de lo que el tema no trae
  light: { paper: "#f5f5f5", "paper-2": "#ececec", ink: "#2d3142", muted: "#4f5d75", soft: "#5a6580", accent: "#bf4520", link: "#2e5aa8" },
  dark: { paper: "#2d3142", "paper-2": "#393e53", ink: "#f5f5f5", muted: "#bfc0c0", soft: "#949eb2", accent: "#f08a59", link: "#739fdf" } };
const PILA = { serif: "'Instrument Serif', 'Noto Serif', serif", sans: "'Geist', system-ui, sans-serif", mono: "'Geist Mono', ui-monospace, monospace" };
const hx = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0"), piso2 = (x: number) => Math.floor(x * 100) / 100;
const canales = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgba = (hex: string, a: number) => `rgba(${canales(hex).join(",")},${a})`;
/** Lee #rgb, #rrggbb, «H S% L%» (las vars -hsl del OS), hsl()/rgb() y «r, g, b»; null si no es un color. */
export function aHex(valor?: string): string | null {
  const v = (valor ?? "").trim().toLowerCase(), m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (m) return m[1].length === 6 ? v : `#${[...m[1]].map((c) => c + c).join("")}`;
  const n = v.replace(/^(hsla?|rgba?)\(|\)$/g, "").split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(parseFloat);
  if (n.length < 3 || n.some((x) => !Number.isFinite(x))) return null;
  if (v.startsWith("rgb") || !v.includes("%")) return `#${n.map(hx).join("")}`;
  const h = ((n[0] % 360) + 360) % 360, [s, l] = [n[1], n[2]].map((x) => Math.max(0, Math.min(1, x / 100)));
  const k = (i: number) => (i + h / 30) % 12, a = s * Math.min(l, 1 - l);
  return `#${[0, 8, 4].map((i) => hx(255 * (l - a * Math.max(-1, Math.min(k(i) - 3, 9 - k(i), 1))))).join("")}`;
}
/** Tono (0-360) y saturación HSL (0-1), para escoger colores de la paleta del fondo. */
function tonoSat(hex: string): [number, number] {
  const [r, g, b] = canales(hex).map((c) => c / 255), max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return d === 0 ? [0, 0] : [h * 60, d / (1 - Math.abs(2 * (max - d / 2) - 1))];
}
/** Primera familia concreta de la pila del tema (sin var(), genéricos ni caracteres que rompan el HTML). */
function familia(pila = ""): { nombre: string; rol: keyof typeof PILA } | null {
  const nombre = pila.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  if (!/^[\p{L}\p{N} _-]{1,64}$/u.test(nombre) || /^(serif|sans-serif|monospace|system-ui|ui-[a-z-]+|inherit)$/i.test(nombre)) return null;
  return { nombre, rol: /monospace/i.test(pila) ? "mono" : /(^|[,\s])serif\b/i.test(pila) ? "serif" : "sans" };
}
export function perfilDesdeTema(tokens: ThemeTokens, modo: ModoPerfil, paletaFondo: PaletaFondo = []): PerfilDiagrama {
  const v = tokens.vars ?? {}, piel = PIEL[modo], claro = modo === "light", avisos: string[] = [];
  const medidas: PerfilDiagrama["contraste"] = {}, fondo = paletaFondo.map((c) => aHex(c)).filter((c): c is string => !!c);
  const token = (...k: string[]) => k.map((x) => aHex(v[x])).find((c): c is string => !!c) ?? null;
  const encaja = (c: string) => (claro ? luminancia(c) >= 0.4 : luminancia(c) <= 0.18);
  const faltan = ["background-hsl", "foreground-hsl", "primary-hsl", "muted-foreground-hsl"].filter((k) => !aHex(v[k]));
  if (faltan.length) avisos.push(`Faltan ${faltan.join(", ")}: se toman de ${fondo.length ? "la paleta del fondo y " : ""}la piel de la skill.`);
  /** Acerca `color` a negro o a blanco (lo que más contraste dé) en pasos de 2 % hasta ≥ 4,5:1 contra la PEOR de las
   *  superficies `sup(c)`: el acento las recalcula con su propio tinte, que se oscurece o aclara con él. */
  const fijar = (rol: RolColor, color: string, sup: (c: string) => string[], origen = color): string => {
    const peor = (c: string) => Math.min(...sup(c).map((f) => contraste(c, f))), ext = peor("#000000") >= peor("#ffffff") ? "#000000" : "#ffffff";
    let c = color;
    for (let t = 0.02; peor(c) < AA && t < 1.01; t += 0.02) c = mezclar(ext, Math.min(t, 1), color);
    if (c !== origen) avisos.push(`${rol}: ${origen} daba ${piso2(peor(origen))}:1; se ajusta a ${c} (${piso2(peor(c))}:1).`);
    medidas[rol] = piso2(peor(c)); return c;
  };
  const papelT = token("background-hsl"), p2T = token("muted-hsl", "card-hsl");
  const paper = papelT && encaja(papelT) ? papelT : fondo[0] ? mezclar(fondo[0], claro ? 0.1 : 0.22, claro ? "#fafafa" : "#141414") : piel.paper;
  if (papelT && paper !== papelT) avisos.push(`paper: ${papelT} no es un papel de modo ${claro ? "claro" : "oscuro"}; se usa ${paper}.`);
  const paper2 = p2T && paper === papelT && encaja(p2T) ? p2T
    : paper === piel.paper ? piel["paper-2"] : mezclar(claro ? "#000000" : "#ffffff", 0.05, paper);
  const vivos = fondo.filter((c) => tonoSat(c)[1] >= 0.3).sort((a, b) => tonoSat(b)[1] - tonoSat(a)[1]); // del fondo, el más vivo antes
  const alfa = claro ? 0.08 : 0.1, tinte = (a: string) => mezclar(a, alfa, paper);
  const accent = fijar("accent", token("primary-hsl", "accent-hsl", "ring-hsl") ?? vivos[0] ?? piel.accent, (c) => [paper, paper2, tinte(c)]);
  const sup = () => [paper, paper2, tinte(accent)], inkT = token("foreground-hsl"), mutedT = token("muted-foreground-hsl");
  const ink = fijar("ink", inkT && contraste(inkT, paper) >= AA ? inkT : piel.ink, sup, inkT ?? piel.ink); // si no se lee, la de la skill
  const muted = fijar("muted", mutedT ?? piel.muted, sup), soft = fijar("soft", mutedT ? mezclar(mutedT, 0.85, paper) : piel.soft, sup);
  const [ta] = tonoSat(accent), dist = (h: number) => Math.min(Math.abs(h - ta), 360 - Math.abs(h - ta));
  const link = fijar("link", vivos.find((c) => dist(tonoSat(c)[0]) >= 40) ?? piel.link, sup); // otro tono del fondo, si lo hay
  const relleno = mezclar(accent, 0.85, paper), inkStrong = ["#111111", "#ffffff"].find((c) => contraste(c, relleno) >= AA) ?? "#000000";
  medidas["ink-strong"] = piso2(contraste(inkStrong, relleno));
  const rm = /(\d*\.?\d+)(rem|px)\s*\)?\s*$/.exec(v.radius ?? ""), px = rm ? parseFloat(rm[1]) * (rm[2] === "rem" ? 16 : 1) : 16;
  const md = Math.max(2, Math.min(12, Math.round(px * 0.375))); // `radius` en rem/px o el máximo del clamp(): 1rem → 4/6/8
  const f = familia(tokens.fontFamily), fuentes = f ? { ...PILA, [f.rol]: `'${f.nombre}', ${PILA[f.rol]}` } : { ...PILA };
  const colores: Record<RolColor, string> = { paper, "paper-2": paper2, ink, "ink-strong": inkStrong, muted, soft, accent, link,
    rule: rgba(ink, 0.12), "rule-solid": (paper === papelT && token("border-hsl")) || mezclar(ink, 0.25, paper), "accent-tint": rgba(accent, alfa) };
  return { modo, colores, contraste: medidas, avisos, fuentes, trazos: { ...TRAZOS }, radios: { sm: Math.max(2, md - 2), md, lg: md + 2 } };
}
const TIPOS: [string, keyof PerfilDiagrama["fuentes"], string][] = [["title", "serif", "1.75rem | 400 | Título H1"],
  ["node-name", "sans", "12px | 600 | Nombres legibles"], ["sublabel", "mono", "9px | 400 | Puerto, protocolo, URL, tipo de campo"],
  ["eyebrow", "mono", "7–8px | 500, tracked 0.18em, uppercase | Etiquetas de tipo y de eje"], ["arrow-label", "mono",
  "8px | 400, tracked 0.06em | Anotaciones de flecha"], ["callout", "serif", "14px | 400 italic | Apartes editoriales"]];
/** Un valor de metadatos por línea y sin `--` ni `<>`: no puede cerrar el comentario (profiles.md). */
const linea = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/-{2,}/g, "—").replace(/[<>]/g, "").trim() || "none";
/** Escribe el perfil como guía de estilo con la cabecera de perfil activo (references/profiles.md). */
export function bloquePerfil(perfil: PerfilDiagrama, meta: MetaPerfil = { nombre: "StarSeed" }, reloj: () => Date = () => new Date()): string {
  const base = (meta.slug ?? meta.nombre).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 64).replace(/-+$/, "");
  const slug = !base ? "starseed" : base === "default" ? "default-starseed" : base, oscuro = perfil.modo === "dark";
  const fecha = meta.fecha && /^\d{4}-\d{2}-\d{2}$/.test(meta.fecha) ? meta.fecha : reloj().toISOString().slice(0, 10);
  const { trazos: t, radios: r } = perfil, medido = Object.entries(perfil.contraste).map(([k, x]) => `${k} ${x}:1`).join(", ");
  const trazos: [string, number, string][] = [["stroke-thin", t.thin, "Contornos de etiqueta, hojas"], ["stroke-default", t.default,
    "Casi todos los trazos"], ["stroke-strong", t.strong, "Énfasis"], ["radius-sm", r.sm, "Etiquetas"], ["radius-md", r.md, "Cajas de nodo"],
    ["radius-lg", r.lg, "Contenedores"], ["grid", 4, "Toda coordenada, tamaño y hueco divisible por 4"]];
  return ["<!-- diagram-design-profile", `name: ${linea(meta.nombre)}`, `slug: ${slug}`, "source-url: none", `created: ${fecha}`,
    `updated: ${fecha}`, `notes: ${linea(meta.notas ?? `Perfil de marca de StarSeed OS, modo ${oscuro ? "oscuro" : "claro"}`)}`, "-->",
    "# Style Guide", "", `Skin: \`${perfil.modo}\` (plantilla \`${oscuro ? "template-dark.html" : "template.html"}\`), con los tokens del contexto.`,
    "", "## Tokens", "", "### Semantic roles", "", `| Role | Purpose | Default (${perfil.modo}) |`, "|---|---|---|",
    ...Object.entries(PROPOSITO).map(([k, p]) => `| \`${k}\` | ${p} | \`${perfil.colores[k as RolColor]}\` |`), "", "### Contrast contract", "",
    `Todo rol de texto ≥ 4.5:1 contra su peor superficie (paper, paper-2 y accent-tint sobre paper). Medido: ${medido}.`,
    "", "## Typography", "", "| Role | Family | Size | Weight | Usage |", "|---|---|---|---|---|",
    ...TIPOS.map(([k, f, resto]) => `| \`${k}\` | \`${perfil.fuentes[f]}\` | ${resto} |`), "", "### Font source", "", "Font source: `system`", "",
    "Fuentes servidas por el OS dentro del iframe aislado: nunca Google Fonts ni recursos externos.", "", "## Stroke, radius, spacing", "",
    "| Token | Value | Use |", "|---|---|---|", ...trazos.map(([k, x, u]) => `| \`${k}\` | \`${x}\` | ${u} |`), ""].join("\n");
}
