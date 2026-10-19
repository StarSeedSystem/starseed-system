import { describe, expect, it } from "vitest";
import { MAX_DIRECTIVAS, extraerDirectivas } from "../directiva-bot";

const navega = (ruta: string) => `[[BOT: {"tipo":"navegar","args":{"ruta":"${ruta}"}}]]`;

describe("extraerDirectivas", () => {
  it("extrae una directiva válida y limpia el texto que se lee en voz alta", () => {
    const r = extraerDirectivas(`Hola mundo. ${navega("/pizarras")}Adiós.`);
    expect(r.acciones).toEqual([{ tipo: "navegar", args: { ruta: "/pizarras" } }]);
    expect(r.limpio).toBe("Hola mundo. Adiós.");
    expect(r.problemas).toEqual([]);
  });

  it("extrae varias directivas en orden", () => {
    const r = extraerDirectivas(`${navega("/red")} vamos, ${`[[BOT: {"tipo":"notificar","args":{"texto":"hola"}}]]`}`);
    expect(r.acciones.map((a) => a.tipo)).toEqual(["navegar", "notificar"]);
    expect(r.problemas).toEqual([]);
  });

  it("el JSON roto va a problemas y no se ejecuta nada", () => {
    const r = extraerDirectivas(`Mira ${`[[BOT: {"tipo": navegar}]]`} ¿viste?`);
    expect(r.acciones).toEqual([]);
    expect(r.problemas.join(" ")).toContain("JSON está roto");
    expect(r.limpio).toBe("Mira ¿viste?");
  });

  it("una acción desconocida se rechaza con problema, sin lanzar", () => {
    const r = extraerDirectivas(`[[BOT: {"tipo":"borrar-todo","args":{}}]]`);
    expect(r.acciones).toEqual([]);
    expect(r.problemas.some((p) => p.includes("Acción desconocida"))).toBe(true);
  });

  it("un texto sin bloques vuelve igual y sin acciones", () => {
    const r = extraerDirectivas("Solo voz, sin directivas.");
    expect(r).toEqual({ limpio: "Solo voz, sin directivas.", acciones: [], problemas: [] });
  });

  it(`como mucho ${MAX_DIRECTIVAS} directivas por respuesta; la sexta se dice y se descarta`, () => {
    const r = extraerDirectivas(["/a", "/b", "/c", "/d", "/e", "/f"].map(navega).join(" "));
    expect(r.acciones).toHaveLength(MAX_DIRECTIVAS);
    expect(r.problemas.some((p) => p.includes(`máximo ${MAX_DIRECTIVAS}`))).toBe(true);
  });

  it("código suelto fuera de un candidato se rechaza", () => {
    const r = extraerDirectivas(`[[BOT: {"tipo":"notificar","args":{"texto":"<script>alert(1)</script>"}}]]`);
    expect(r.acciones).toEqual([]);
    expect(r.problemas.some((p) => p.includes("parece código"))).toBe(true);
  });

  it("una ruta externa se rechaza: las directivas no salen del OS", () => {
    const r = extraerDirectivas(`[[BOT: {"tipo":"navegar","args":{"ruta":"https://fuera.example"}}]]`);
    expect(r.acciones).toEqual([]);
    expect(r.problemas.some((p) => p.includes("no es una ruta interna"))).toBe(true);
  });

  it("un candidato de código válido sí pasa por la directiva", () => {
    const r = extraerDirectivas(`[[BOT: {"tipo":"codigo.proponer","args":{"destino":"src/lib/x.ts","codigo":"export const a = 1"}}]]`);
    expect(r.acciones).toHaveLength(1);
    expect(r.acciones[0].tipo).toBe("codigo.proponer");
  });

   it("un bloque sin cierre no rompe el extractor", () => {
     const r = extraerDirectivas("Empiezo [[BOT: {\"tipo\":\"navegar\"");
     expect(r.acciones).toEqual([]);
     expect(r.problemas.some((p) => p.includes("sin cierre"))).toBe(true);
   });

   it("no procesa texto vacío", () => {
     const r = extraerDirectivas("");
     expect(r.limpio).toBe("");
     expect(r.acciones).toEqual([]);
     expect(r.problemas).toEqual([]);
   });
 });
