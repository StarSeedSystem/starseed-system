import { describe, it, expect } from "vitest";
import { crearDatosVariaciones, faltaEnLaBase, COLUMNAS_VARIACION, TABLA_VARIACIONES, TABLA_VALORACIONES, RPC_USADA } from "../datos";
import type { ClienteVariaciones, ConsultaVariaciones, ErrorBd, FilaVariacion, NuevaVariacion } from "../datos";

// Supabase falso, sin red: anota cada llamada y responde lo que diga la prueba.
interface Respuestas {
  lista?: { data: unknown[] | null; error: ErrorBd | null; count?: number | null }; fila?: { data: unknown; error: ErrorBd | null };
  upsert?: { error: ErrorBd | null }; rpc?: { data: unknown; error: ErrorBd | null }; usuario?: { id: string } | null; lanza?: boolean;
}
function falso(r: Respuestas = {}) {
  const llamadas: unknown[][] = [];
  const red = <T,>(v: T) => (r.lanza ? Promise.reject(new Error("fetch failed")) : Promise.resolve(v));
  const anota = (...l: unknown[]) => (llamadas.push(l), consulta);
  const consulta: ConsultaVariaciones = {
    eq: (c, v) => anota("eq", c, v), contains: (c, v) => anota("contains", c, v), or: (f) => anota("or", f),
    order: (c, o) => anota("order", c, o.ascending), range: (a, b) => anota("range", a, b),
    then: (ok, ko) => red(r.lista ?? { data: [], error: null, count: 0 }).then(ok, ko),
  };
  const cliente: ClienteVariaciones = {
    from: (tabla) => ({
      select: (cols, op) => anota("from", tabla, cols, op?.count),
      insert: (fila) => (llamadas.push(["insert", tabla, fila]), { select: () => ({ single: () => red(r.fila ?? { data: null, error: null }) }) }),
      upsert: (fila, op) => (llamadas.push(["upsert", tabla, fila, op.onConflict]), red({ data: null, error: null, ...r.upsert })),
    }),
    rpc: (nombre, args) => (llamadas.push(["rpc", nombre, args]), red({ data: null, error: null, ...r.rpc })),
    auth: { getUser: () => Promise.resolve({ data: { user: r.usuario === undefined ? { id: "persona-1" } : r.usuario } }) },
  };
  return { llamadas, datos: crearDatosVariaciones(cliente) };
}
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const fila = (extra: Partial<FilaVariacion> = {}): FilaVariacion => ({
  id: ID, clave: "widget:clima", familia: "widget", tipo: "variacion", titulo: "Clima cristal", descripcion: null, payload: { radio: 12 },
  version: "1.0.0", de_variacion: null, licencia: "CC-BY-SA-4.0", enlace_externo: null, etiquetas: ["cristal"], tema: null, autor: "persona-1",
  publicado_en: "2026-10-20T10:00:00Z", usos: 3, valoracion_media: 4.5, valoraciones: 2, updated_at: "2026-10-20T10:00:00Z", ...extra,
});
const nueva = (extra: Partial<NuevaVariacion> = {}): NuevaVariacion =>
  ({ clave: "widget:clima", titulo: " Clima cristal ", payload: { radio: 12, color: "var(--primary)" }, licencia: "CC-BY-SA-4.0", ...extra });
const sinTabla = { code: "PGRST205", message: "Could not find the table 'public.os_variaciones' in the schema cache" };
const conError = (code: string, message: string) => ({ data: null, error: { code, message } });
describe("listarVariaciones", () => {
  it("consulta la clave con filtros, búsqueda saneada, orden y página, y devuelve las filas con su total", async () => {
    const { datos, llamadas } = falso({ lista: { data: [fila()], error: null, count: 31 } });
    const r = await datos.listarVariaciones("widget:clima", { buscar: "  cristal, (azul)*% ", orden: "valoradas", pagina: 2, porPagina: 10,
      filtros: { tipo: "variacion", etiquetas: [" cristal ", ""], licencia: "MIT" } });
    expect(r).toEqual({ disponible: true, variaciones: [fila()], total: 31, pagina: 2, porPagina: 10 });
    expect(llamadas).toEqual([
      ["from", TABLA_VARIACIONES, COLUMNAS_VARIACION, "exact"], ["eq", "clave", "widget:clima"], ["eq", "tipo", "variacion"],
      ["eq", "licencia", "MIT"], ["contains", "etiquetas", ["cristal"]], ["or", "titulo.ilike.*cristal azul*,descripcion.ilike.*cristal azul*"],
      ["order", "valoracion_media", false], ["order", "valoraciones", false], ["range", 10, 19],
    ]);
  });
  it("por defecto ordena por novedades en páginas de 24, acota la página y ordena alfabéticamente si se pide", async () => {
    const a = falso(), b = falso();
    expect(await a.datos.listarVariaciones("tema:synthwave-horizon", { pagina: -3, porPagina: 5000 })).toMatchObject({ pagina: 1, porPagina: 100 });
    expect(a.llamadas.filter((l) => l[0] === "order" || l[0] === "range")).toEqual([["order", "publicado_en", false], ["range", 0, 99]]);
    await b.datos.listarVariaciones("widget:clima", { orden: "alfabetico" });
    expect(b.llamadas.filter((l) => l[0] === "order")).toEqual([["order", "titulo", true]]);
  });
  it("nunca rompe la ventana: sin tabla, sin red o con una clave inválida da lista vacía", async () => {
    const vacia = { variaciones: [], total: 0, pagina: 1, porPagina: 24 };
    expect(await falso({ lista: { data: null, error: sinTabla } }).datos.listarVariaciones("widget:clima")).toEqual({ ...vacia, disponible: false, error: undefined });
    expect(await falso({ lanza: true }).datos.listarVariaciones("widget:clima")).toEqual({ ...vacia, disponible: false, error: "fetch failed" });
    const mala = falso();
    expect(await mala.datos.listarVariaciones("Widget Clima")).toEqual({ ...vacia, disponible: true, error: "Clave de elemento no válida" });
    expect(mala.llamadas).toEqual([]);
  });
});
describe("publicarVariacion", () => {
  it("valida y guarda el autor de la sesión, la familia y de_variacion, sin contadores; el código se marca aislado", async () => {
    const { datos, llamadas } = falso({ fila: { data: fila({ de_variacion: ID }), error: null } });
    const r = await datos.publicarVariacion(nueva({ deVariacion: ID, etiquetas: ["cristal"], enlaceExterno: "https://example.org/repo" }));
    expect(r).toEqual({ ok: true, valor: { variacion: fila({ de_variacion: ID }), requiereAislamiento: false } });
    expect(llamadas).toEqual([["insert", TABLA_VARIACIONES, {
      clave: "widget:clima", familia: "widget", tipo: "variacion", titulo: "Clima cristal", descripcion: null, payload: { radio: 12, color: "var(--primary)" },
      version: null, de_variacion: ID, licencia: "CC-BY-SA-4.0", enlace_externo: "https://example.org/repo", etiquetas: ["cristal"], tema: null, autor: "persona-1",
    }]]);
    const codigo = await falso({ fila: { data: fila({ clave: "atomo:video-html" }), error: null } }).datos
      .publicarVariacion(nueva({ clave: "atomo:video-html", payload: { html: "<p>hola</p>" } }));
    expect(codigo.ok && codigo.valor.requiereAislamiento).toBe(true); // el código solo se abre aislado
  });
  it("rechaza secretos, claves privadas y campos inválidos sin tocar la base", async () => {
    const { datos, llamadas } = falso();
    const r = await datos.publicarVariacion(nueva({ clave: "no es clave", titulo: " ", licencia: "", deVariacion: "123", enlaceExterno: "http://inseguro.example",
      payload: { apiKey: "abc", fondo: "starseed.appearance" }, descripcion: ["Bearer ", "abcdefghijklmnop"].join("") }));
    const esperados = ["Clave:", "Título:", "Licencia:", "Origen:", "Url:", "Privacidad: la clave «apiKey»", "Privacidad: «payload.fondo", "Privacidad: «payload.desc"];
    expect(r.ok).toBe(false);
    if (!r.ok) for (const p of esperados) expect(r.motivos.some((m) => m.startsWith(p)), p).toBe(true);
    expect(llamadas).toEqual([]);
  });
  it("sin sesión no publica; sin tabla da disponible:false; el rechazo de la base o la red se dicen", async () => {
    const anonimo = falso({ usuario: null });
    expect(await anonimo.datos.publicarVariacion(nueva())).toEqual({ ok: false, disponible: true, motivos: ["Sesión: hace falta iniciar sesión para publicar"] });
    expect(anonimo.llamadas).toEqual([]);
    const publicar = (r: Respuestas) => falso(r).datos.publicarVariacion(nueva());
    expect(await publicar({ fila: conError("42P01", 'relation "os_variaciones" does not exist') })).toMatchObject({ ok: false, disponible: false });
    expect(await publicar({ fila: conError("42501", "violates row-level security") })).toEqual({ ok: false, disponible: true, motivos: ["Base: violates row-level security"] });
    expect(await publicar({ lanza: true })).toEqual({ ok: false, disponible: false, motivos: ["Red: fetch failed"] });
  });
});
describe("valorar, registrarUso y faltaEnLaBase", () => {
  it("valorar hace upsert de una valoración por persona y rechaza lo inválido sin llamar", async () => {
    const { datos, llamadas } = falso();
    expect(await datos.valorar(ID, 4)).toEqual({ ok: true, valor: 4 });
    for (const [id, v] of [[ID, 0], [ID, 6], [ID, 3.5], ["x", 3]] as const) expect((await datos.valorar(id, v)).ok).toBe(false);
    expect(llamadas).toEqual([["upsert", TABLA_VALORACIONES, { variacion: ID, persona: "persona-1", valor: 4 }, "variacion,persona"]]);
    expect(await falso({ usuario: null }).datos.valorar(ID, 5)).toMatchObject({ ok: false, disponible: true });
    expect(await falso({ upsert: { error: sinTabla } }).datos.valorar(ID, 5)).toMatchObject({ ok: false, disponible: false });
  });
  it("registrarUso llama a la RPC os_variacion_usada y devuelve el total", async () => {
    const { datos, llamadas } = falso({ rpc: { data: 8, error: null } });
    expect([await datos.registrarUso(ID), await datos.registrarUso("nada")]).toMatchObject([{ ok: true, valor: 8 }, { ok: false }]);
    expect(llamadas).toEqual([["rpc", RPC_USADA, { p_variacion: ID }]]);
    expect(await falso({ rpc: conError("PGRST202", "Could not find the function") }).datos.registrarUso(ID)).toMatchObject({ ok: false, disponible: false });
    expect(await falso({ rpc: conError("P0001", "hace falta sesión") }).datos.registrarUso(ID)).toEqual({ ok: false, disponible: true, motivos: ["Base: hace falta sesión"] });
  });
  it("faltaEnLaBase reconoce la tabla o la función ausentes por código o por mensaje", () => {
    const casos: ErrorBd[] = [...["42P01", "42883", "PGRST202", "PGRST205"].map((code) => ({ code })), { message: "relation does not exist" }];
    expect([...casos, { code: "42501", message: "permission denied" }, null].map(faltaEnLaBase)).toEqual([true, true, true, true, true, false, false]);
  });
});
