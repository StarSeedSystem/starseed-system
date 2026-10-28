/**
 * Pruebas de PM1010F7B: `generacion-capas.ts` y `elegir-controles.ts`.
 * Solo funciones puras con dependencias inyectadas: sin red, sin disco, sin `node:*`
 * ni `vi.mock`. Casos pedidos: dependencias falsas · cupo agotado · Needle caído →
 * respaldo · orden estable.
 */
import { describe, expect, it } from "vitest";
import { pedirImagen, type DependenciasImagen, type ResultadoRouter } from "../generacion-capas";
import { elegirControles, MAX_SIN_ELECCION, CUANTOS_ELEGIDOS } from "../elegir-controles";
import type { CandidatoParametro } from "../tipos";

/** Dependencias de imagen que contestan lo que se les pide (sin red) y cuentan llamadas. */
function depsImagen(
  respuesta: ResultadoRouter | Error,
  extra: Partial<DependenciasImagen> = {}
): DependenciasImagen & { llamadas: () => number } {
  let n = 0;
  return {
    ...extra,
    generar: async (prompt: string) => {
      n++;
      if (extra.generar) return extra.generar(prompt);
      if (respuesta instanceof Error) throw respuesta;
      return respuesta;
    },
    llamadas: () => n,
  };
}

const candidato = (id: string, parametroId: string, nombre: string, sinonimos?: string[]): CandidatoParametro => ({
  ref: { atomoId: id, parametroId },
  parametro: { id: parametroId, nombre, tipo: "numero", min: 0, max: 1, sinonimos },
});

const muchos = (cuantos: number): CandidatoParametro[] =>
  [...Array(cuantos).keys()].map((i) => candidato(`atomo-${i}`, `p${i}`, `control ${i}`));

describe("generacion-capas · pedirImagen", () => {
  it("con dependencias falsas devuelve una capa CANDIDATA lienzo2d que cita la entidad", async () => {
    const r = await pedirImagen("una nebulosa violeta", depsImagen(
      { ok: true, url: "https://gratis.example/img.png", provider: "pollinations" },
      {
        guardar: async () => ({ id: "ent-1", version: "v1" }),
        ahora: () => 5,
        nuevoId: () => "img-si-no-hay-entidad",
      }
    ));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidato.capa.tipo).toBe("lienzo2d");
    expect(r.candidato.capa.formato).toBe("png");
    expect(r.candidato.capa.referencia).toEqual({ tipo: "imagen", id: "ent-1", version: "v1" });
    expect(r.candidato.proveedor).toBe("pollinations");
    expect(r.mensaje).toContain("CANDIDATA");
    expect(r.mensaje).toContain("no se ha insertado");
  });

  it("sin entidad que guarde, la capa cita un id provisional y no toca ninguna molécula", async () => {
    const r = await pedirImagen("un puente colgante", depsImagen(
      { ok: true, url: "https://gratis.example/v.jpg", provider: "pollinations" },
      { ahora: () => 123456 }
    ));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidato.capa.referencia).toEqual({ tipo: "imagen", id: "imagen-gen-123456", version: undefined });
  });

  it("cupo agotado: mensaje honesto con el motivo y el reintento, y el router ni se llama", async () => {
    const deps = depsImagen({ ok: true, url: "https://x/y.png" }, {
      consumirCupo: () => ({ ok: false, motivo: "tope de generaciones por hora", reintentoEnMin: 7 }),
    });
    const r = await pedirImagen("una ballena", deps);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.mensaje.startsWith("no disponible:")).toBe(true);
    expect(r.mensaje).toContain("tope de generaciones por hora");
    expect(r.mensaje).toContain("7 min");
    expect(deps.llamadas()).toBe(0);
  });

  it("sin cupo declarado no hay tope: llama al router igual", async () => {
    const deps = depsImagen({ ok: true, url: "https://x/z.png" });
    const r = await pedirImagen("una selva densa", deps);
    expect(r.ok).toBe(true);
    expect(deps.llamadas()).toBe(1);
  });

  it("el router contesta con ok:false y su motivo: sale tal cual, sin falsear", async () => {
    const r = await pedirImagen("un mapa", depsImagen({ ok: false, error: "HTTP 429 del proveedor" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.mensaje).toBe("no disponible: HTTP 429 del proveedor");
  });

  it("el router lanza (sin medio): «no disponible» con el motivo de la excepción", async () => {
    const r = await pedirImagen("una sensedera", depsImagen(new Error("sin conexión")));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.mensaje).toContain("no disponible");
    expect(r.mensaje).toContain("sin conexión");
  });

  it("respuesta sin URL ni error: no disponible, y el prompt vacío pide texto", async () => {
    const sinUrl = await pedirImagen("atomos", depsImagen({ ok: true }));
    expect(sinUrl.ok).toBe(false);
    const vacio = await pedirImagen("   ", depsImagen({ ok: true, url: "https://x.png" }));
    expect(vacio.ok).toBe(false);
    if (vacio.ok) return;
    expect(vacio.mensaje).toContain("escribe qué imagen");
  });

  it("el prompt viaja recortado al máximo declarado", async () => {
    let recibido = "";
    const deps = depsImagen({ ok: true, url: "https://x.png" }, {
      generar: async (prompt) => { recibido = prompt; return { ok: true, url: "https://x.png" }; },
    });
    await pedirImagen("x .".repeat(300), deps);
    expect(recibido.length).toBe(500);
  });
});


describe("elegir-controles · elegirControles", () => {
  it("con 30 controles o menos los devuelve TODOS sin llamar a la IA", async () => {
    let llamada = false;
    const cs = muchos(MAX_SIN_ELECCION);
    const r = await elegirControles("sube el control 3", cs, {
      preguntar: async () => { llamada = true; return null; },
    });
    expect(llamada).toBe(false);
    expect(r.origen).toBe("respaldo");
    expect(r.elegidos).toEqual(cs);
  });

  it("con más de 30: pide a Needle y devuelve sus 5 elegidos, en el orden dado", async () => {
    const cs = muchos(40);
    const caja: { nombres?: string[] } = {};
    const r = await elegirControles("sube algo", cs, {
      preguntar: async (_f, nombres) => {
        caja.nombres = nombres;
        return [nombres[2], nombres[7], nombres[0]];
      },
    });
    expect(r.origen).toBe("needle");
    expect(r.elegidos).toEqual([cs[2], cs[7], cs[0]]);
    expect(caja.nombres?.length).toBe(40);
  });

  it("acepta el nombre del parámetro a secas si es único entre los abiertos", async () => {
    const cs = [candidato("vip", "vibrato", "Vibrato"), ...muchos(39)];
    const r = await elegirControles("un poco más de vibrato", cs, {
      preguntar: async () => ["vibrato"],
    });
    expect(r.origen).toBe("needle");
    expect(r.elegidos).toEqual([cs[0]]);
  });

  it("las repeticiones y la basura de la IA se descartan, y se corta a 5", async () => {
    const cs = muchos(40);
    const r = await elegirControles("sube algo", cs, {
      preguntar: async (_f, nombres) => [...nombres.slice(0, 7), "no-existe-ni-a-juro", "control 2 de atomo-2"],
    });
    expect(r.origen).toBe("needle");
    expect(r.elegidos.length).toBe(CUANTOS_ELEGIDOS);
    expect(r.elegidos).toEqual(cs.slice(0, 5));
  });

  it("Needle caído (lanza): cae al respaldo determinista y da siempre el MISMO orden", async () => {
    const cs = [candidato("b1", "brillo", "Brillo", ["luminosidad"]), ...many(39, "b")];
    const r1 = await elegirControles("sube el brillo", cs, {
      preguntar: async () => { throw new Error("Needle sin conexión"); },
    });
    const r2 = await elegirControles("sube el brillo", [...cs].reverse(), { preguntar: async () => null });
    expect(r1.origen).toBe("respaldo");
    expect(r1.elegidos.length).toBe(CUANTOS_ELEGIDOS);
    expect(r1.elegidos[0]).toBe(cs[0]);
    expect(r2.elegidos).toEqual(r1.elegidos);
  });

  it("respaldo sin IA: la frase manda, orden estable en llamadas sucesivas", async () => {
    const cs = muchos(40);
    const r1 = await elegirControles("sube el control 5", cs, { preguntar: async () => null });
    const r2 = await elegirControles("sube el control 5", cs, { preguntar: async () => ["inexistente"] });
    expect(r1).toEqual(r2);
    expect(JSON.stringify(r1.elegidos)).toContain("p5");
  });

  it("sin candidatos: respaldo vacío, y con IA basura también cae al respaldo", async () => {
    const vacio = await elegirControles("sube el brillo", []);
    expect(vacio).toEqual({ elegidos: [], origen: "respaldo" });
    const cs = muchos(40);
    const r = await elegirControles("sube el brillo", cs, {
      preguntar: async () => ["plumífero", "lateralidad"],
    });
    expect(r.origen).toBe("respaldo");
    expect(r.elegidos.length).toBe(CUANTOS_ELEGIDOS);
  });
});

/** Muchos candidatos con un prefijo de ids distinto, para mezclar con `muchos` sin chocar. */
function many(cuantos: number, prefijo: string): CandidatoParametro[] {
  return [...Array(cuantos).keys()].map((i) => candidato(`${prefijo}-${i}`, `p${prefijo}${i}`, `control ${prefijo} ${i}`));
}
