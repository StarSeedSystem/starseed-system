// Pruebas puras del perfil de marca de los diagramas (contrato architecture/diagramas.md §3-2, tarea E). El contraste
// se comprueba con una implementación PROPIA de la fórmula WCAG 2.1 (no la del módulo), con la composición en 8 bits que
// hace el navegador, y se ancla primero contra las cifras que publica la guía de la skill. Sin red ni navegador.
import { describe, it, expect } from "vitest";
import { aHex, bloquePerfil, perfilDesdeTema, type PerfilDiagrama } from "../perfil-marca";
import { THEME_REGISTRY } from "../../design/theme-engine";
import "../../design/theme-catalog";

const lin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const rgb = (c: string): number[] =>
  c.startsWith("#") ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : (c.match(/[\d.]+/g) ?? []).map(Number);
/** Compone un color (con alfa si es rgba) sobre `fondo`, redondeando a 8 bits como el navegador. */
const sobre = (c: string, fondo: string) => {
  const [r, g, b, a = 1] = rgb(c), f = rgb(fondo);
  return [r, g, b].map((x, i) => Math.round(x * a + f[i] * (1 - a)));
};
const lum = (v: number[]) => 0.2126 * lin(v[0]) + 0.7152 * lin(v[1]) + 0.0722 * lin(v[2]);
const razon = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hex = rgb, rgbaDe = (h: string, a: number) => `rgba(${rgb(h).join(",")},${a})`;
const tono = (h: string) => { const [r, g, b] = rgb(h); return Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * (180 / Math.PI); };

/** Todo texto ≥ 4,5:1 contra paper, paper-2 y la caja focal; ink-strong sobre el acento al 0,85; y la medida del perfil, cierta. */
function cumpleAA(p: PerfilDiagrama) {
  const c = p.colores, superficies = [hex(c.paper), hex(c["paper-2"]), sobre(c["accent-tint"], c.paper)];
  for (const rol of ["ink", "muted", "soft", "accent", "link"] as const) {
    const peor = Math.min(...superficies.map((s) => razon(hex(c[rol]), s)));
    expect(peor, `${p.modo}:${rol}`).toBeGreaterThanOrEqual(4.5);
    expect(p.contraste[rol]).toBeCloseTo(Math.floor(peor * 100) / 100, 2);
  }
  expect(razon(hex(c["ink-strong"]), sobre(rgbaDe(c.accent, 0.85), c.paper))).toBeGreaterThanOrEqual(4.5);
}
describe("la fórmula de la prueba es la de WCAG", () => {
  it("reproduce las cifras «Current defaults» de style-guide.md", () => {
    const guia: [string, string, number][] = [["#bf4520", "#f5f5f5", 4.71], ["#5a6580", "#f5f5f5", 5.34], ["#2e5aa8", "#f5f5f5", 6.13],
      ["#f08a59", "#2d3142", 5.21], ["#949eb2", "#2d3142", 4.78], ["#739fdf", "#2d3142", 4.76]];
    for (const [texto, papel, cifra] of guia) expect(razon(hex(texto), hex(papel))).toBeCloseTo(cifra, 2);
  });
});

describe("perfilDesdeTema", () => {
  it("tokens incompletos en claro: la piel de la skill, pero el acento corregido en la caja focal (daba 4,23:1)", () => {
    const p = perfilDesdeTema({ vars: {} }, "light");
    expect(p.colores).toMatchObject({ paper: "#f5f5f5", ink: "#2d3142", muted: "#4f5d75", soft: "#5a6580", link: "#2e5aa8" });
    expect(Math.abs(tono(p.colores.accent) - tono("#bf4520"))).toBeLessThan(3);
    expect(p.avisos[0]).toMatch(/^Faltan background-hsl, foreground-hsl, primary-hsl, muted-foreground-hsl/);
    expect(p.avisos.join("\n")).toMatch(/accent: #bf4520 daba 4\.23:1/);
    expect(p.radios).toEqual({ sm: 4, md: 6, lg: 8 });
    cumpleAA(p);
  });
  it("tokens incompletos en oscuro: soft y link de la skill no llegaban sobre paper-2 y se ajustan", () => {
    const p = perfilDesdeTema({ vars: { "primary-hsl": "no es un color" } }, "dark");
    expect(p.colores.paper).toBe("#2d3142");
    expect(p.avisos.join("\n")).toMatch(/soft: #949eb2 daba 3\.9\d?:1[\s\S]*link: #739fdf daba 3\.9\d?:1/);
    cumpleAA(p);
  });
  it("tema real del catálogo en claro y en oscuro: respeta sus tokens y solo corrige lo que no llega", () => {
    const pack = THEME_REGISTRY.get("art-nouveau");
    if (!pack?.modes.light || !pack.modes.dark) throw new Error("falta el tema art-nouveau del catálogo");
    const claro = perfilDesdeTema(pack.modes.light, "light"), oscuro = perfilDesdeTema(pack.modes.dark, "dark");
    expect(claro.colores.paper).toBe(aHex(pack.modes.light.vars["background-hsl"]));
    expect(claro.colores.ink).toBe(aHex(pack.modes.light.vars["foreground-hsl"]));
    expect(Math.abs(tono(claro.colores.accent) - tono(aHex(pack.modes.light.vars["primary-hsl"]) ?? ""))).toBeLessThan(4);
    expect(claro.radios.md).toBe(11); // radius 1.75rem del catálogo
    expect(oscuro.avisos).toEqual([]);
    expect(oscuro.colores.accent).toBe(aHex(pack.modes.dark.vars["primary-hsl"]));
    [claro, oscuro].forEach(cumpleAA);
  });
  it("los 24 temas del catálogo, en sus dos modos, salen con AA", () => {
    expect(THEME_REGISTRY.size).toBeGreaterThanOrEqual(24);
    for (const pack of THEME_REGISTRY.values())
      for (const modo of ["light", "dark"] as const) { const t = pack.modes[modo]; if (t) cumpleAA(perfilDesdeTema(t, modo)); }
  });
  it("si el papel del tema no es del modo pedido, no lo usa y lo dice", () => {
    const p = perfilDesdeTema({ vars: { "background-hsl": "42 35% 96%", "foreground-hsl": "150 30% 14%" } }, "dark");
    expect(p.colores.paper).toBe("#2d3142");
    expect(p.avisos.join("\n")).toMatch(/paper: #\w{6} no es un papel de modo oscuro[\s\S]*\nink: #\w{6} daba 1\.\d+:1; se ajusta a #f5f5f5/);
    cumpleAA(p);
  });
  it("fondo de Shaders con paleta: el papel toma el dominante, el acento el más vivo y link el siguiente de otro tono", () => {
    const paleta = ["#0b1d3a", "#7c3aed", "#22d3ee", "no-color"];
    const p = perfilDesdeTema({ vars: {}, background: "shader-aurora" }, "dark", paleta);
    expect(p.colores.paper).not.toBe("#2d3142");
    expect(Math.abs(tono(p.colores.paper) - tono("#0b1d3a"))).toBeLessThan(10); // el tono del color dominante del fondo
    expect(p.colores.accent).toBe("#22d3ee");
    expect(Math.abs(tono(p.colores.link) - tono("#7c3aed"))).toBeLessThan(6);
    expect(p.avisos[0]).toMatch(/la paleta del fondo/);
    cumpleAA(p);
    const conTema = perfilDesdeTema({ vars: { "background-hsl": "#faf7f2", "primary-hsl": "#bf4520" } }, "light", paleta);
    expect(conTema.colores.paper).toBe("#faf7f2");
    expect(Math.abs(tono(conTema.colores.link) - tono("#22d3ee"))).toBeLessThan(6); // el acento sigue siendo el del tema
    cumpleAA(conTema);
  });
  it("tipografía: la familia concreta del tema entra en su rol; var(), genéricos o inyecciones no", () => {
    expect(perfilDesdeTema({ vars: {}, fontFamily: "'Satoshi', sans-serif" }, "light").fuentes.sans).toMatch(/^'Satoshi', 'Geist'/);
    expect(perfilDesdeTema({ vars: {}, fontFamily: "Playfair Display, serif" }, "light").fuentes.serif).toMatch(/^'Playfair Display'/);
    for (const mala of ["var(--font-headline)", "x'</style><script>", "sans-serif"])
      expect(perfilDesdeTema({ vars: {}, fontFamily: mala }, "light").fuentes.sans).toBe("'Geist', system-ui, sans-serif");
  });
});

describe("bloquePerfil", () => {
  const p = perfilDesdeTema({ vars: {} }, "dark"), reloj = () => new Date("2026-10-23T09:00:00Z");
  it("escribe la cabecera de perfil activo de profiles.md y una guía estructuralmente completa", () => {
    const b = bloquePerfil(p, { nombre: "Grupo Café" }, reloj);
    expect(b).toMatch(new RegExp("^<!-- diagram-design-profile\nname: Grupo Café\nslug: grupo-cafe\nsource-url: none\n" +
      "created: 2026-10-23\nupdated: 2026-10-23\nnotes: .+\n-->\n# Style Guide\n"));
    for (const rol of Object.keys(p.colores)) expect(b).toContain(`| \`${rol}\` |`);
    for (const rol of ["title", "node-name", "sublabel", "eyebrow", "arrow-label", "callout"]) expect(b).toContain(`| \`${rol}\` |`);
    for (const s of ["### Semantic roles", "## Typography", "Font source: `system`"]) expect(b).toContain(s);
    expect(b).toContain(`| \`paper\` | Fondo de página, relleno por defecto | \`${p.colores.paper}\` |`);
    expect(b).not.toMatch(/googleapis|gstatic/);
  });
  it("los metadatos no pueden cerrar el comentario y el slug cumple la expresión de profiles.md", () => {
    const b = bloquePerfil(p, { nombre: "Ana --> <script>\nmal", slug: "Default", fecha: "ayer" }, reloj);
    expect(b.match(/-->/g)).toHaveLength(1);
    expect(b).toMatch(/\nname: Ana — script mal\nslug: default-starseed\n[\s\S]*\ncreated: 2026-10-23\n/);
    expect(bloquePerfil(p, { nombre: "***" }, reloj)).toMatch(/\nslug: starseed\n/);
    expect(bloquePerfil(p, { nombre: "x".repeat(90) }, reloj).match(/\nslug: ([^\n]+)\n/)?.[1]).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
  });
});
