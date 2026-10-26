// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EVENTO_CONTEXTO_PROTO } from "../contrato";
import { anunciarContexto, contextoDeRuta, fusionarContexto, leerContexto, reiniciarContexto, sanearAnuncio, sanearEntidad, versionContexto } from "../contexto";

beforeEach(() => reiniciarContexto());
afterEach(() => reiniciarContexto());

describe("contextoDeRuta · qué dice la ruta por sí sola", () => {
  it.each([
    ["/grupo/semilla", "grupo", "semilla", "grupo", true],
    ["/grupo-ai/g1", "grupo", "g1", "grupo", true],
    ["/pagina/nexus", "pagina", "nexus", "publica", true],
    ["/evento/encuentro", "pagina", "encuentro", "publica", true],
    ["/partido/verde", "comunidad", "verde", "grupo", true],
    ["/entidad/ef-1", "comunidad", "ef-1", "grupo", true],
    ["/profile/ana", "perfil", "ana", "perfil", false],
    ["/post/p-123", "publicacion", "p-123", "publica", false],
    ["/article/a-9", "publicacion", "a-9", "publica", false],
    ["/documento/d1", "archivo", "d1", "personal", false],
    ["/tabla/t1", "archivo", "t1", "personal", false],
    ["/escena/e1", "archivo", "e1", "personal", false],
  ] as const)("%s → %s/%s en ámbito %s", (ruta, tipo, id, ambito, gobierna) => {
    const c = contextoDeRuta(ruta);
    expect(c.entidad).toEqual({ tipo, id });
    expect(c.ambito).toBe(ambito);
    expect(c.gobernadaPor).toEqual(gobierna ? { tipo, id } : undefined);
  });

  it("lo propio es personal; un grupo es de grupo; una página pública es pública", () => {
    expect(contextoDeRuta("/profile")).toMatchObject({ entidad: { tipo: "perfil", id: "propio" }, ambito: "personal" });
    expect(contextoDeRuta("/grupo/x").ambito).toBe("grupo");
    expect(contextoDeRuta("/pagina/x").ambito).toBe("publica");
  });

  it("pizarra, escritorio y molécula salen de la ruta y su consulta", () => {
    expect(contextoDeRuta("/pizarra?canvas=abc123")).toMatchObject({ entidad: { tipo: "pizarra", id: "abc123" }, ambito: "personal" });
    expect(contextoDeRuta("/pizarra").entidad).toBeUndefined();
    expect(contextoDeRuta("/escritorios").entidad).toEqual({ tipo: "escritorio", id: "actual" });
    expect(contextoDeRuta("/protomolecula?molecula=m-1").entidad).toEqual({ tipo: "molecula", id: "m-1" });
  });

  it("una ruta rara no lanza y da un contexto personal sin entidad", () => {
    for (const rara of ["", "sin-barra", "//evil.example/x", "/a".repeat(400)]) {
      const c = contextoDeRuta(rara);
      expect(typeof c.ruta).toBe("string");
      expect(c.ambito).toBe("personal");
    }
    expect(contextoDeRuta("/otra/cosa").entidad).toBeUndefined();
    expect(() => contextoDeRuta("/grupo/%E0%A4%A")).not.toThrow();
  });

  it("ignora la barra final, el hash y no se deja engañar por un id con basura", () => {
    expect(contextoDeRuta("/grupo/semilla/#x").entidad).toEqual({ tipo: "grupo", id: "semilla" });
    expect(contextoDeRuta("/grupo/a b").entidad).toBeUndefined();
  });
});

describe("saneado de lo que anuncia una pantalla", () => {
  it("solo pasa lo que tiene la forma exacta", () => {
    expect(sanearEntidad({ tipo: "grupo", id: "g1", nombre: "  Semilla\n\u0000 " })).toEqual({ tipo: "grupo", id: "g1", nombre: "Semilla" });
    expect(sanearEntidad({ tipo: "inventado", id: "g1" })).toBeUndefined();
    expect(sanearEntidad({ tipo: "grupo", id: "<script>" })).toBeUndefined();
    expect(sanearEntidad("grupo")).toBeUndefined();
    expect(sanearEntidad(null)).toBeUndefined();
    expect(sanearAnuncio({ ambito: "universo" })).toBeNull();
    expect(sanearAnuncio({ ambito: "grupo", extra: "no" })).toEqual({ ambito: "grupo" });
  });
});

describe("anunciarContexto · el último anuncio afina la ruta", () => {
  it("el anuncio se funde con la ruta y manda en entidad, selección y ámbito", () => {
    window.history.pushState({}, "", "/post/p1");
    const retirar = anunciarContexto({ entidad: { tipo: "publicacion", id: "p1", nombre: "Mi texto" }, ambito: "personal", seleccion: { tipo: "texto", id: "t1", resumen: "hola" } });
    const c = leerContexto();
    expect(c.ruta).toBe("/post/p1");
    expect(c.entidad?.nombre).toBe("Mi texto");
    expect(c.ambito).toBe("personal");
    expect(c.seleccion).toEqual({ tipo: "texto", id: "t1", resumen: "hola" });
    retirar();
    expect(leerContexto().ambito).toBe("publica");
    expect(leerContexto().seleccion).toBeUndefined();
  });

  it("el anuncio de otra ruta se ignora: al navegar, el viejo no vale", () => {
    window.history.pushState({}, "", "/grupo/a");
    anunciarContexto({ entidad: { tipo: "grupo", id: "a", nombre: "A" }, ambito: "grupo" });
    expect(leerContexto("/grupo/b").entidad).toEqual({ tipo: "grupo", id: "b" });
    expect(leerContexto("/grupo/a").entidad?.nombre).toBe("A");
  });

  it("el cleanup solo retira lo suyo: no pisa el anuncio de otra pantalla", () => {
    window.history.pushState({}, "", "/post/p1");
    const retirarPrimero = anunciarContexto({ entidad: { tipo: "publicacion", id: "p1", nombre: "Primero" }, ambito: "personal" });
    const retirarSegundo = anunciarContexto({ entidad: { tipo: "publicacion", id: "p1", nombre: "Segundo" }, ambito: "personal" });
    retirarPrimero();
    expect(leerContexto().entidad?.nombre).toBe("Segundo");
    retirarSegundo();
    expect(leerContexto().entidad?.nombre).toBeUndefined();
  });

  it("dispara EVENTO_CONTEXTO_PROTO y cambia la versión; un evento de fuera también cuenta", () => {
    window.history.pushState({}, "", "/pizarra");
    const vistos: unknown[] = [];
    window.addEventListener(EVENTO_CONTEXTO_PROTO, (e) => vistos.push((e as CustomEvent).detail));
    const v0 = versionContexto();
    anunciarContexto({ entidad: { tipo: "pizarra", id: "p9" } });
    expect(vistos).toHaveLength(1);
    expect(versionContexto()).toBeGreaterThan(v0);
    window.dispatchEvent(new CustomEvent(EVENTO_CONTEXTO_PROTO, { detail: { entidad: { tipo: "pizarra", id: "p10" }, ambito: "grupo" } }));
    expect(leerContexto().entidad?.id).toBe("p10");
    expect(leerContexto().ambito).toBe("grupo");
  });

  it("un anuncio basura no cambia nada y no lanza", () => {
    window.history.pushState({}, "", "/pizarra");
    const v0 = versionContexto();
    const retirar = anunciarContexto({ entidad: { tipo: "nada", id: "<x>" } as never });
    expect(versionContexto()).toBe(v0);
    expect(() => retirar()).not.toThrow();
    window.dispatchEvent(new CustomEvent(EVENTO_CONTEXTO_PROTO, { detail: "texto suelto" }));
    expect(versionContexto()).toBe(v0);
  });

  it("fusionarContexto es puro y no muta la base", () => {
    const base = contextoDeRuta("/grupo/a");
    const copia = JSON.stringify(base);
    const f = fusionarContexto(base, { ruta: "/grupo/a", ambito: "personal" });
    expect(f.ambito).toBe("personal");
    expect(JSON.stringify(base)).toBe(copia);
    expect(fusionarContexto(base, null)).toBe(base);
  });
});
