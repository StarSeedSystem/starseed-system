import { describe, expect, it } from "vitest";
import type { ContextoProto } from "../contrato";
import { aplicarReglas, esSoloModo, opcionesDePeticion, plano } from "../reglas";

const GRUPO: ContextoProto = { ruta: "/grupo/semilla", entidad: { tipo: "grupo", id: "semilla", nombre: "Semilla" }, gobernadaPor: { tipo: "grupo", id: "semilla", nombre: "Semilla" }, ambito: "grupo" };
const PERSONAL: ContextoProto = { ruta: "/profile", ambito: "personal" };
const MENSAJE: ContextoProto = { ruta: "/messages", entidad: { tipo: "mensaje", id: "hilo-1" }, ambito: "personal" };
const MOLECULA: ContextoProto = { ruta: "/protomolecula?molecula=m1", entidad: { tipo: "molecula", id: "m1" }, ambito: "personal" };
const ARCHIVO: ContextoProto = { ruta: "/library", entidad: { tipo: "archivo", id: "f1", nombre: "Notas" }, ambito: "personal" };

const reglas = (t: string, c: ContextoProto, modo?: "directo" | "rama") => aplicarReglas(t, c, opcionesDePeticion({ texto: t, modo }));

describe("reglas locales sin IA", () => {
  it("«hazme un cubo 3D girando» → un objeto 3D animado", () => {
    const r = reglas("hazme un cubo 3D girando", PERSONAL);
    expect(r.sinResolver).toEqual([]);
    expect(r.pasos).toEqual([{ tipo: "crear-objeto-3d", descripcion: "cubo 3D girando", animado: true }]);
  });

  it("sin verbo de movimiento el objeto no es animado", () => {
    expect(reglas("crea una esfera azul 3D", PERSONAL).pasos).toEqual([{ tipo: "crear-objeto-3d", descripcion: "esfera azul 3D", animado: false }]);
  });

  it("una imagen no es un objeto 3D, y el formato sale de la frase", () => {
    const r = reglas("genera una imagen de un atardecer en vertical", PERSONAL).pasos;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: "generar-imagen", formato: "9:16" });
    expect(reglas("dibuja un cartel horizontal", PERSONAL).pasos[0]).toMatchObject({ tipo: "generar-imagen", formato: "16:9" });
  });

  it("«cambia el fondo» → fondo", () => {
    expect(reglas("cambia el fondo a algo más cálido", PERSONAL).pasos).toEqual([{ tipo: "fondo", descripcion: "cambia el fondo a algo más cálido" }]);
  });

  it("«ábrelo en una pizarra» → abrir-en sin texto; con una cita, con ella", () => {
    expect(reglas("ábrelo en una pizarra", GRUPO).pasos).toEqual([{ tipo: "abrir-en", donde: "pizarra" }]);
    expect(reglas("abre «mi plan» en la pizarra", GRUPO).pasos).toEqual([{ tipo: "abrir-en", donde: "pizarra", que: "mi plan" }]);
    expect(reglas("llévalo al lienzo", GRUPO).pasos).toEqual([{ tipo: "abrir-en", donde: "lienzo" }]);
    expect(reglas("ábrelo en XR", GRUPO).pasos).toEqual([{ tipo: "abrir-en", donde: "xr" }]);
  });

  it("varias cosas en una frase salen como varios pasos, en orden y sin duplicados", () => {
    const r = reglas("hazme un cubo 3D y luego ábrelo en una pizarra", PERSONAL);
    expect(r.pasos.map((p) => p.tipo)).toEqual(["crear-objeto-3d", "abrir-en"]);
    const dup = reglas("ábrelo en una pizarra; ábrelo en una pizarra", PERSONAL);
    expect(dup.pasos).toHaveLength(1);
  });

  it("editar necesita una entidad en pantalla; sin ella, no se adivina", () => {
    const sin = reglas("cambia el título a Hola", PERSONAL);
    expect(sin.pasos).toEqual([]);
    expect(sin.sinResolver).toEqual(["cambia el título a Hola"]);
    const con = reglas("cambia el título a Hola", GRUPO);
    expect(con.pasos).toEqual([{ tipo: "editar-entidad", objetivo: GRUPO.entidad, cambio: "cambia el título a Hola", modo: "rama" }]);
  });

  it("la selección manda sobre la entidad de la pantalla cuando es una entidad", () => {
    const ctx: ContextoProto = { ...GRUPO, seleccion: { tipo: "archivo", id: "f9" } };
    const p = reglas("traduce esto al inglés", ctx).pasos[0];
    expect(p).toMatchObject({ tipo: "editar-entidad", objetivo: { tipo: "archivo", id: "f9" } });
  });

  it("modo: por defecto rama; directo solo si la persona lo pide; «en una rama» gana siempre", () => {
    const modoDe = (t: string, m?: "directo" | "rama") => (reglas(t, ARCHIVO, m).pasos[0] as { modo: string }).modo;
    expect(modoDe("corrige la ortografía")).toBe("rama");
    expect(modoDe("corrige la ortografía", "directo")).toBe("directo");
    expect(modoDe("corrige la ortografía directamente")).toBe("directo");
    expect(modoDe("corrige la ortografía en una rama", "directo")).toBe("rama");
    expect(modoDe("corrige la ortografía directamente", "rama")).toBe("rama");
  });

  it("«hazlo en una rama» o «directamente» solos modifican una petición, no son una", () => {
    for (const t of ["hazlo en una rama", "en una rama", "directamente", "Sin tocar el original.", "mejor como rama aparte"]) expect(esSoloModo(t)).toBe(true);
    for (const t of ["cambia el título en una rama", "hazme un cubo", ""]) expect(esSoloModo(t)).toBe(false);
  });

  it("con una molécula abierta, una orden de ajuste es un dictado", () => {
    expect(reglas("sube el brillo un 10 %", MOLECULA).pasos).toEqual([{ tipo: "dictar-molecula", orden: "sube el brillo un 10 %" }]);
    expect(reglas("sube el brillo un 10 %", PERSONAL).pasos).toEqual([]);
  });

  it("en un chat, «pon la molécula» es insertar en ese mensaje", () => {
    const r = reglas("pon la molécula en el chat", MENSAJE).pasos[0];
    expect(r).toMatchObject({ tipo: "insertar-en", destino: { tipo: "mensaje", id: "hilo-1" } });
  });

  it("proponer algo nuevo al sistema → borrador para MetaGenesis", () => {
    const r = reglas("propón a MetaGenesis un conversor de PDF a EPUB", PERSONAL).pasos[0];
    expect(r.tipo).toBe("proponer-metagenesis");
  });

  it("lo que las reglas no entienden se dice, no se inventa", () => {
    const r = reglas("cuéntame un chiste", GRUPO);
    expect(r.pasos).toEqual([]);
    expect(r.sinResolver).toEqual(["cuéntame un chiste"]);
  });

  it("mezcla: lo entendido sale como paso y lo demás en sinResolver", () => {
    const r = reglas("hazme un cubo 3D; cuéntame un chiste", GRUPO);
    expect(r.pasos.map((p) => p.tipo)).toEqual(["crear-objeto-3d"]);
    expect(r.sinResolver).toEqual(["cuéntame un chiste"]);
  });

  it("plano() quita tildes sin cambiar la longitud (los índices valen para el original)", () => {
    const t = "Ábrelo, ÑANDÚ ünico";
    expect(plano(t)).toHaveLength(t.length);
    expect(plano(t)).toBe("abrelo, nandu unico");
  });
});
