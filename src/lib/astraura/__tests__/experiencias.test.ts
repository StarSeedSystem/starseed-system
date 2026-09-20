import { describe, it, expect } from "vitest";
import {
  nueva, anotar, cerrar, leer, paraNeedle, calibracion, exportar, recortar,
} from "../experiencias";
import type { Almacen, Experiencia, CierreExperiencia } from "../experiencias";

function almacenMemoria(): Almacen {
  const datos: (Experiencia | CierreExperiencia)[] = [];
  return {
    poner: async (l) => { datos.push(l); },
    lineas: async () => [...datos],
  };
}

const intencionBase = {
  capa: "needle" as const,
  tipo: "intencion" as const,
  entrada: "pon la alarma",
  salida: { herramientas: ["reloj"], llamadas: [{ nombre: "crear_alarma", argumentos: { h: 7 } }], razonamiento: "hora" },
};

describe("experiencias", () => {
  it("nueva recorta entrada a 400 y da id de 12 hex", async () => {
    const e = await nueva({ ...intencionBase, entrada: "x".repeat(500), confianza: 0.812345 });
    expect(e.entrada.length).toBe(401); // 400 + "…"
    expect(e.id).toMatch(/^[0-9a-f]{12}$/);
    expect(e.confianza).toBe(0.8123);
    expect(e.resultado).toBeNull();
  });

  it("anotar + cerrar aplican el resultado al leer", async () => {
    const al = almacenMemoria();
    const e = await nueva(intencionBase);
    await anotar(e, al);
    await cerrar(e.id, true, "funcionó", al);
    const leidas = await leer(10, al);
    expect(leidas).toHaveLength(1);
    expect(leidas[0].resultado).toBe(true);
    expect(leidas[0].nota_resultado).toBe("funcionó");
  });

  it("un cierre huérfano se ignora", async () => {
    const al = almacenMemoria();
    const e = await nueva(intencionBase);
    await anotar(e, al);
    await cerrar("idquenoexiste", false, "huérfano", al);
    const leidas = await leer(10, al);
    expect(leidas).toHaveLength(1);
    expect(leidas[0].resultado).toBeNull();
  });

  it("paraNeedle solo exporta intenciones acertadas", async () => {
    const ok = await nueva(intencionBase);
    ok.resultado = true;
    const mal = await nueva({ ...intencionBase, entrada: "fallida" });
    mal.resultado = false;
    const juicio = await nueva({ capa: "jev", tipo: "si_no", entrada: "¿sí?", salida: true });
    juicio.resultado = true;
    const lineas = paraNeedle([ok, mal, juicio]);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toEqual({
      query: "pon la alarma",
      tools: ["reloj"],
      answers: [{ name: "crear_alarma", arguments: { h: 7 } }],
      reasoning: "hora",
    });
  });

  it("calibracion agrupa por décimas de confianza", async () => {
    const a = await nueva({ capa: "jev", tipo: "si_no", entrada: "a", salida: true, confianza: 0.83 });
    a.resultado = true;
    const b = await nueva({ capa: "jev", tipo: "si_no", entrada: "b", salida: false, confianza: 0.87 });
    b.resultado = false;
    const c = await nueva({ ...intencionBase });
    c.resultado = true; // capa needle: se ignora
    const tramos = calibracion([a, b, c], "jev");
    expect(tramos["0.8"]).toEqual({ n: 2, aciertos: 1 });
  });

  it("exportar genera JSONL una línea por registro", async () => {
    const al = almacenMemoria();
    const e = await nueva(intencionBase);
    await anotar(e, al);
    await cerrar(e.id, true, "", al);
    const jsonl = await exportar(al);
    const lineas = jsonl.trimEnd().split("\n");
    expect(lineas).toHaveLength(2);
    expect(JSON.parse(lineas[0]).id).toBe(e.id);
    expect(JSON.parse(lineas[1]).ref).toBe(e.id);
  });

  it("recortar serializa objetos", () => {
    expect(recortar({ a: 1 })).toBe('{"a":1}');
    expect(recortar("hola")).toBe("hola");
  });
});
