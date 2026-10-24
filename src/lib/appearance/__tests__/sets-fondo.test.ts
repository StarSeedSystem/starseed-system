import { describe, it, expect } from "vitest";
import { construirCatalogo } from "../catalogo-shaders";
import { createLayer, type BackgroundLayer } from "../background-layers";
import { exportarSet, importarSet, validarSet, urlAdmitida, LICENCIA_SHADERS, MAX_SET_BYTES, type OpcionesSet } from "../sets-fondo";

// Catálogo de prueba con la MISMA forma que da `shaders/registry` (sin GPU, sin red).
const catalogo = construirCatalogo([
  { name: "LinearGradient", category: "Gradients", propsMetadata: { colorA: { default: "#000000" } } },
  { name: "ImageTexture", category: "Textures", propsMetadata: { url: { default: "https://shaders.com/sample.jpg" } } },
  { name: "Text", category: "Textures", propsMetadata: { text: { default: "Hola" } } },
  { name: "WebcamTexture", category: "Textures" },
]);
const BIB = "https://proyecto.supabase.co/storage/v1/object/public/os-files/";
const o: OpcionesSet = { catalogo, biblioteca: [BIB] };
const PNG = `data:image/png;base64,iVBORw0KGgo${"A".repeat(40)}`;
const shader = (components: unknown[]): BackgroundLayer => ({ ...createLayer("shader"), id: "s1", preset: { components } });
const base = (capas: unknown[], extra: Record<string, unknown> = {}) => ({ formato: "starseed-fondo", version: 1, id: "set-1",
  nombre: "Aurora", base: null, capas, autor: "Alex", licencias: [], creado: "2026-10-23T10:00:00.000Z", ...extra });
const motivos = (r: ReturnType<typeof validarSet>): string => (r.ok ? "" : r.motivos.join(" | "));

describe("sets-fondo · exportar e importar", () => {
  it("ida y vuelta: mismo set, licencia MIT de shaders, reloj e id inyectados, nombre de archivo sin acentos", () => {
    const capas = [shader([{ type: "LinearGradient", id: "g", props: { colorA: "#7C3AED" } }]), createLayer("difusion")];
    const e = exportarSet({ nombre: "Aurora Cristalina · ñandú", base: "spline", capas, autor: "Alex", vistaPrevia: PNG },
      { ...o, ahora: () => new Date("2026-10-23T10:00:00Z"), crearId: () => "fijo" });
    if (!e.ok) throw new Error(e.motivos.join());
    expect(e.archivo).toBe("aurora-cristalina-nandu.starseed-fondo.json");
    expect(e.set).toMatchObject({ id: "fijo", creado: "2026-10-23T10:00:00.000Z", licencias: [LICENCIA_SHADERS], vistaPrevia: PNG });
    const i = importarSet(e.json, o);
    expect(i).toEqual({ ok: true, set: e.set });
  });
  it("sin capas shader no añade la licencia; sobrantes fuera; nunca muta el objeto de entrada", () => {
    const entrada = base([{ kind: "difusion", difusion: { modo: "tono", tono: "url(https://x.y/p.png)", textura: "lava", desenfoquePx: 999 } }],
      { secreto: "no viaja" });
    const copia = JSON.parse(JSON.stringify(entrada));
    const r = validarSet(entrada, o);
    expect(entrada).toEqual(copia);
    if (!r.ok) throw new Error(r.motivos.join());
    expect(r.set).not.toHaveProperty("secreto");
    expect(r.set.capas[0].difusion).toEqual({ modo: "tono", tono: "#ffffff", textura: "ninguna", desenfoquePx: 80, opacidad: 1 });
  });
  it("sanea posición, máscara y Audiomorphic (sin clics robados; micro fuera en lo compartido)", () => {
    const r = validarSet(base([
      { kind: "imagen", value: `${BIB}uid/fondo.png`, transform: { x: -3, y: "1", escala: 9, rotacion: 1e9, ancho: NaN }, mascara: "estrella" },
      { kind: "audiomorphic", audiomorphic: { mic: true, interactive: true } }]), { ...o, compartido: true });
    if (!r.ok) throw new Error(r.motivos.join());
    expect(r.set.capas[0]).toMatchObject({ mascara: "ninguna", transform: { x: 0, y: 0, escala: 1, rotacion: 360, ancho: 1, alto: 1 } });
    expect(r.set.capas[1].audiomorphic).toMatchObject({ mic: false, interactive: false });
  });
  it("una difusión corrupta no revienta la normalización (antes lanzaba TypeError)", () => {
    expect(() => validarSet(base([{ kind: "difusion", difusion: "x" }]), o)).not.toThrow();
    expect(validarSet(base([{ kind: "difusion", difusion: "x" }]), o).ok).toBe(true);
  });
});

describe("sets-fondo · casos malos", () => {
  const malo = (capas: unknown[], extra?: Record<string, unknown>, op: OpcionesSet = o) => motivos(validarSet(base(capas, extra), op));
  it("componente desconocido, sin tipo o con datos demasiado anidados", () => {
    expect(malo([shader([{ type: "Minador" }])])).toMatch(/«Minador» desconocido/);
    expect(malo([shader([{ props: {} }])])).toMatch(/sin tipo/);
    let hondo: unknown = "x"; for (let i = 0; i < 20; i++) hondo = { n: hondo };
    expect(malo([shader([{ type: "Text", props: { a: hondo } }])])).toMatch(/demasiado anidados/);
  });
  it("URLs fuera de la Biblioteca, en props, en capas y con trucos de prefijo", () => {
    expect(malo([shader([{ type: "ImageTexture", props: { url: "https://malo.example/x.png" } }])])).toMatch(/URL fuera de la Biblioteca/);
    expect(malo([shader([{ type: "LinearGradient", props: { colorA: "//malo.example/p.gif" } }])])).toMatch(/URL fuera/);
    expect(malo([{ kind: "video", value: "https://malo.example/v.mp4" }])).toMatch(/capa 1: URL fuera/);
    for (const u of [`${BIB}../otro/x.png`, `${BIB}%2e%2e/otro/x.png`, "https://proyecto.supabase.co.malo.example/storage/v1/object/public/os-files/x",
      "https://proyecto.supabase.co@malo.example/storage/v1/object/public/os-files/x", "javascript:alert(1)", "data:text/html,<b>", "blob:x", "fondo.png"])
      expect(urlAdmitida(u, o), u).toBe(false);
    for (const u of [`${BIB}uid/a b.png`, "data:image/webp;base64,AAAA", "starseed://library/item-1", "local-archivos-malla://f1", ""])
      expect(urlAdmitida(u, o), u).toBe(true);
    expect(urlAdmitida("local-archivos-malla://f1", { ...o, compartido: true })).toBe(false);
    expect(malo([shader([{ type: "Text", props: { text: "visita https://starseed.network" } }])])).toBe(""); // solo se muestra
  });
  it("ImageTexture sin url propia cargaría la muestra de shaders.com: rechazado", () => {
    expect(malo([shader([{ type: "ImageTexture" }])])).toMatch(/sin «url» propio cargaría https:\/\/shaders\.com/);
    expect(malo([shader([{ type: "ImageTexture", props: { url: "" } }])])).toMatch(/shaders\.com/);
    expect(malo([shader([{ type: "ImageTexture", props: { url: `${BIB}uid/a.jpg` } }])])).toBe("");
  });
  it("CSS de color o degradado que pediría algo a la red", () => {
    expect(malo([{ kind: "gradiente", value: "linear-gradient(red, blue), url(https://malo.example/t.png)" }])).toMatch(/CSS no permitido/);
    expect(malo([{ kind: "color", value: "image-set(x 1x)" }])).toMatch(/CSS no permitido/);
    expect(malo([{ kind: "color", value: "red; position: fixed" }])).toMatch(/CSS no permitido/);
    expect(malo([{ kind: "gradiente", value: "linear-gradient(135deg, #7C3AED 0%, rgb(34 211 238 / 50%) 100%)" }])).toBe("");
  });
  it("cámara: nunca en un set compartido; en uno privado sí (el permiso se pide al pintar)", () => {
    const cam = [shader([{ type: "WebcamTexture" }])];
    expect(malo(cam, {}, { ...o, compartido: true })).toMatch(/usa la cámara/);
    expect(malo(cam)).toBe("");
    const sinCatalogo = construirCatalogo([{ name: "ObjectTracker", category: "Stylize" }]).Stylize.map((e) => ({ ...e, requiereCamara: false }));
    expect(malo([shader([{ type: "ObjectTracker" }])], {}, { catalogo: { Stylize: sinCatalogo }, compartido: true })).toMatch(/cámara/);
  });
  it("tamaños: set > 2 MB, vista previa > 300 KB o que no es PNG", () => {
    const enorme = `${PNG}${"A".repeat(MAX_SET_BYTES)}`;
    expect(malo([], { vistaPrevia: enorme })).toMatch(/2 MB/);
    expect(importarSet(JSON.stringify(base([], { vistaPrevia: enorme })), o)).toEqual({ ok: false, motivos: ["pesa más de 2 MB"] });
    expect(malo([], { vistaPrevia: `${PNG}${"A".repeat(410_000)}` })).toMatch(/300 KB/);
    expect(malo([], { vistaPrevia: "data:image/jpeg;base64,/9j/4AAQ" })).toMatch(/vistaPrevia/);
    expect(malo([], { vistaPrevia: `${PNG}<script>` })).toMatch(/vistaPrevia/);
  });
  it("estructura: formato, versión, id, campos, capas de más o desconocidas, JSON roto o circular", () => {
    expect(malo([], { formato: "otro", version: 2, id: "../x", nombre: " ", base: "Spline!", licencias: [3], creado: "ayer" }).split(" | "))
      .toHaveLength(7);
    expect(malo([{ kind: "flash" }])).toMatch(/tipo desconocido/);
    expect(malo(Array.from({ length: 9 }, () => ({ kind: "color", value: "#000" })))).toMatch(/8 como mucho/);
    expect(malo([{ kind: "audiomorphic", audiomorphic: { engine: "iframe", url: "https://malo.example" } }])).toMatch(/URL oficial/);
    expect(motivos(importarSet("{no", o))).toMatch(/no es JSON válido/);
    const ciclo: Record<string, unknown> = {}; ciclo.yo = ciclo;
    expect(motivos(validarSet(ciclo, o))).toMatch(/serializar/);
    expect(motivos(validarSet("texto", o))).toMatch(/no es un set/);
  });
  it("con el registro REAL de shaders 4.0.4: sus tipos se aceptan y ImageTexture sin url se rechaza", async () => {
    const { shaderRegistry } = await import("shaders/registry");
    const real = { catalogo: construirCatalogo(shaderRegistry), biblioteca: [BIB] };
    expect(motivos(validarSet(base([shader([{ type: "Aurora" }, { type: "FilmGrain" }])]), real))).toBe("");
    expect(motivos(validarSet(base([shader([{ type: "ImageTexture" }])]), real))).toMatch(/shaders\.com/);
  });
});
