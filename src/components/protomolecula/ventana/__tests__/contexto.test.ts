import { describe, expect, it } from "vitest";
import type { ContextoProto } from "@/lib/protomolecula/peticion/contrato";
import { acumularAnuncio, actorDeLaVentana, entidadGobernante, etiquetaContexto, etiquetaEntidad, fusionarContexto, normalizarAnuncio } from "../contexto";

const base: ContextoProto = { ruta: "/grupo/semilla", ambito: "personal" };

describe("normalizarAnuncio (lo que anuncia cualquier pantalla se comprueba)", () => {
  it("acepta un anuncio válido y recorta lo largo", () => {
    const a = normalizarAnuncio({
      ruta: "/grupo/semilla",
      entidad: { tipo: "grupo", id: "g1", nombre: "x".repeat(500) },
      seleccion: { tipo: "bloque", id: "b1", resumen: "y".repeat(500) },
      ambito: "grupo",
    });
    expect(a?.entidad?.nombre?.length).toBe(120);
    expect(a?.seleccion?.resumen?.length).toBe(160);
    expect(a?.ambito).toBe("grupo");
  });

  it("descarta tipos, ámbitos y rutas inventados, y limpia saltos de línea", () => {
    expect(normalizarAnuncio({ entidad: { tipo: "hackeo", id: "g1" }, ambito: "secreto", ruta: "javascript:alert(1)" })).toBeNull();
    expect(normalizarAnuncio(null)).toBeNull();
    expect(normalizarAnuncio("grupo")).toBeNull();
    const a = normalizarAnuncio({ entidad: { tipo: "grupo", id: "g1", nombre: "Uno\n\nDos\u0007" } });
    expect(a?.entidad?.nombre).toBe("Uno Dos");
  });

  it("«null» quiere decir «ya no hay»", () => {
    const a = normalizarAnuncio({ seleccion: null });
    expect(a).toEqual({ seleccion: null });
    const c = fusionarContexto({ ...base, seleccion: { tipo: "texto", id: "t" } }, a);
    expect(c.seleccion).toBeUndefined();
  });
});

describe("fusionar y acumular", () => {
  it("el anuncio se superpone a la base", () => {
    const c = fusionarContexto(base, { entidad: { tipo: "grupo", id: "g1", nombre: "Semilla" }, ambito: "grupo" });
    expect(c).toMatchObject({ ruta: "/grupo/semilla", ambito: "grupo", entidad: { id: "g1" } });
  });

  it("dos anuncios de la misma pantalla se suman; de otra pantalla, el último manda solo", () => {
    const a1 = acumularAnuncio(null, { ruta: "/p", entidad: { tipo: "publicacion", id: "p1" } }, "/p");
    const a2 = acumularAnuncio(a1, { ruta: "/p", seleccion: { tipo: "texto", id: "t1" } }, "/p");
    expect(a2).toMatchObject({ entidad: { id: "p1" }, seleccion: { id: "t1" } });
    const a3 = acumularAnuncio(a2, { ruta: "/otra", ambito: "publica" }, "/otra");
    expect(a3.entidad).toBeUndefined();
    expect(a3.ambito).toBe("publica");
  });
});

describe("gobierno y etiquetas", () => {
  it("la entidad que gobierna es la propia (grupo, comunidad, página) o la que gobierna lo de delante", () => {
    expect(entidadGobernante({ ...base, entidad: { tipo: "grupo", id: "g1" } })?.id).toBe("g1");
    expect(entidadGobernante({ ...base, entidad: { tipo: "publicacion", id: "p1" }, gobernadaPor: { tipo: "comunidad", id: "c1" } })?.id).toBe("c1");
    expect(entidadGobernante({ ...base, entidad: { tipo: "publicacion", id: "p1" } })).toBeUndefined();
    expect(entidadGobernante({ ...base, entidad: { tipo: "perfil", id: "u1" } })).toBeUndefined();
  });

  it("etiquetas legibles", () => {
    expect(etiquetaEntidad({ tipo: "grupo", id: "g1", nombre: "Semilla" })).toBe("Grupo · Semilla");
    expect(etiquetaEntidad({ tipo: "archivo", id: "a1" })).toBe("Archivo · a1");
    expect(etiquetaContexto(base)).toBe("Esta pantalla · /grupo/semilla");
  });

  it("el actor: dueño solo en lo personal; una IA actúa como «ia», un botón como «humano»", () => {
    expect(actorDeLaVentana({ ...base, ambito: "personal" }, "humano")).toMatchObject({ esDueno: true, origen: "humano" });
    expect(actorDeLaVentana({ ...base, ambito: "grupo" }, "ia")).toMatchObject({ esDueno: false, origen: "ia" });
  });
});
