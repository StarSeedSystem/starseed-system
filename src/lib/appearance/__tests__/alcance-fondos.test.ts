import { describe, it, expect } from "vitest";
import { fondoEfectivo, paginaCoincide, setDePagina, type ConfigFondo, type ContextoFondo } from "../alcance-fondos";
import type { SetFondo } from "../sets-fondo";

/** Set mínimo de prueba: lo que `sets-fondo.ts` exporta. */
const set = (id: string): SetFondo => ({
  formato: "starseed-fondo", version: 1, id, nombre: id, autor: "Alex", licencias: [],
  base: null, capas: [], creado: "2026-10-24T10:00:00.000Z",
});

const config = (extra: ConfigFondo = {}): ConfigFondo => ({
  cuenta: set("cuenta"), perfil: { "perfil-a": set("perfil-a") },
  apps: { "app-a": set("app-a") }, paginas: { "/biblioteca": set("pagina-biblio") },
  secciones: { "s-1": set("seccion-1") }, entidad: { "ent-9": set("entidad-9") }, ...extra,
});

describe("alcance-fondos · fondoEfectivo (herencia cuenta › perfil › app › página › sección › entidad)", () => {
  it("sin nada configurado no inventa fondo", () => {
    expect(fondoEfectivo({}, {})).toEqual({ set: null, de: null });
    expect(fondoEfectivo({ cuenta: null }, { perfilId: "otro", appId: "otra", ruta: "/x", seccionId: "y", entidad: "z" }))
      .toEqual({ set: null, de: null });
  });

  it("cuenta es el piso: llega a todos los contextos", () => {
    expect(fondoEfectivo({ cuenta: set("cuenta") }, {})).toEqual({ set: set("cuenta"), de: "cuenta" });
    expect(fondoEfectivo(config(), {}).de).toBe("cuenta");
  });

  it("el perfil pisa a la cuenta solo cuando el perfilId coincide", () => {
    expect(fondoEfectivo(config(), { perfilId: "perfil-a" })).toEqual({ set: set("perfil-a"), de: "perfil" });
    expect(fondoEfectivo(config(), { perfilId: "otro" }).de).toBe("cuenta");
    expect(fondoEfectivo(config(), { perfilId: null }).de).toBe("cuenta");
  });

  it("la app pisa al perfil", () => {
    expect(fondoEfectivo(config(), { perfilId: "perfil-a", appId: "app-a" })).toEqual({ set: set("app-a"), de: "app" });
    expect(fondoEfectivo(config(), { perfilId: "perfil-a", appId: "otra" }).de).toBe("perfil");
  });

  it("la página pisa a la app: exacta, por prefijo y el prefijo más largo gana", () => {
    const c = config({ paginas: { "/biblioteca": set("biblio"), "/biblioteca/fondos": set("fondos") } });
    expect(fondoEfectivo(c, { appId: "app-a", ruta: "/biblioteca" })).toEqual({ set: set("biblio"), de: "pagina" });
    expect(fondoEfectivo(c, { appId: "app-a", ruta: "/biblioteca/fondos" })).toEqual({ set: set("fondos"), de: "pagina" });
    // Hija profunda hereda del padre más largo; ruta ajena vuelve a la app.
    expect(fondoEfectivo(c, { appId: "app-a", ruta: "/biblioteca/fondos/editor?x=1" }).set?.id).toBe("fondos");
    expect(fondoEfectivo(c, { appId: "app-a", ruta: "/dashboard" }).de).toBe("app");
  });

  it("la sección pisa a la página", () => {
    expect(fondoEfectivo(config(), { perfilId: "perfil-a", appId: "app-a", ruta: "/biblioteca", seccionId: "s-1" }))
      .toEqual({ set: set("seccion-1"), de: "seccion" });
    expect(fondoEfectivo(config(), { perfilId: "perfil-a", appId: "app-a", ruta: "/biblioteca", seccionId: "otra" }).de)
      .toBe("pagina");
  });

  it("la entidad manda dentro de su vista, y al cerrarla se vuelve al flujo normal", () => {
    const ctx: ContextoFondo = { perfilId: "perfil-a", appId: "app-a", ruta: "/biblioteca", seccionId: "s-1", entidad: "ent-9" };
    expect(fondoEfectivo(config(), ctx)).toEqual({ set: set("entidad-9"), de: "entidad" });
    // Sin set de entidad (o contexto sin entidad): se cae al más concreto que sí lo tenga.
    expect(fondoEfectivo(config({ entidad: {} }), ctx).de).toBe("seccion");
    expect(fondoEfectivo(config(), { ...ctx, entidad: null }).de).toBe("seccion");
  });
});

describe("alcance-fondos · páginas por prefijo (helpers puros)", () => {
  it("paginaCoincide replicas la herencia del contexto de apariencia", () => {
    expect(paginaCoincide("/biblioteca", "/biblioteca")).toBe(true);
    expect(paginaCoincide("/biblioteca/fondos", "/biblioteca")).toBe(true);
    expect(paginaCoincide("/biblioteca-otra", "/biblioteca")).toBe(false);
    expect(paginaCoincide("/", "/")).toBe(true);
  });

  it("setDePagina da undefined sin mapas o sin ruta que case, y devuelve el set de la ganadora", () => {
    expect(setDePagina(undefined, "/biblioteca")).toBeUndefined();
    expect(setDePagina({}, "/biblioteca")).toBeUndefined();
    expect(setDePagina({ "/biblioteca": set("b") }, "/ajena")).toBeUndefined();
    expect(setDePagina({ "/biblioteca": set("b") }, "/biblioteca")?.id).toBe("b");
  });
});
