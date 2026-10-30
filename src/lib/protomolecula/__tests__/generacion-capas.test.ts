import { describe, expect, it } from "vitest";
import { pedirImagen, PROXIMAMENTE_MEDIOS } from "../generacion-capas";
import type { DependenciasGeneracion } from "../generacion-capas";
import { claveDe, elegirControles } from "../elegir-controles";
import type { CandidatoParametro } from "../tipos";

const depsBase = (over: Partial<DependenciasGeneracion> = {}): DependenciasGeneracion => ({
  generarImagen: async () => ({ ok: true, url: "https://media.test/gato.png", provider: "pollinations" }),
  guardarEntidad: async () => ({ id: "ent-1", version: "v1" }),
  nuevoId: () => "capa-1",
  orden: 3,
  ...over,
});

describe("pedirImagen · capa candidata", () => {
  it("con dependencias falsas devuelve una capa lienzo2d con referencia y NO la inserta", async () => {
    const r = await pedirImagen("  un gato astronauta  ", depsBase());
    if (!r.ok) throw new Error(r.motivo);
    expect(r.candidata).toMatchObject({ candidata: true, proveedor: "pollinations", prompt: "un gato astronauta" });
    expect(r.candidata.capa).toMatchObject({
      id: "capa-1", tipo: "lienzo2d", titulo: "un gato astronauta", formato: "png", orden: 3, visible: true, bloqueada: false,
      referencia: { tipo: "imagen", id: "ent-1", version: "v1" },
    });
  });

  it("cupo agotado: «no disponible» con el motivo del router y ninguna capa", async () => {
    const r = await pedirImagen("gato", depsBase({
      generarImagen: async () => ({ ok: false, provider: "pollinations", error: "Cupo diario agotado" }),
    }));
    expect(r).toMatchObject({ ok: false, codigo: "sin-cupo" });
    if (r.ok) throw new Error("no debía haber capa");
    expect(r.motivo).toBe("no disponible: Cupo diario agotado");
  });

  it("sin router o sin guardado: «próximamente» y no se finge una capa", async () => {
    const sinRouter = await pedirImagen("gato", depsBase({ generarImagen: undefined }));
    const sinGuardado = await pedirImagen("gato", depsBase({ guardarEntidad: async () => null }));
    expect(sinRouter).toMatchObject({ ok: false, codigo: "sin-router" });
    expect(sinGuardado).toMatchObject({ ok: false, codigo: "sin-guardado" });
    if (!sinRouter.ok) expect(sinRouter.motivo).toMatch(/^próximamente:/);
    if (!sinGuardado.ok) expect(sinGuardado.motivo).toMatch(/^próximamente:/);
  });

  it("un router que lanza se cuenta como error legible; audio/vídeo/3D se declaran pendientes", async () => {
    const r = await pedirImagen("gato", depsBase({ generarImagen: async () => { throw new Error("sin red"); } }));
    expect(r).toMatchObject({ ok: false, codigo: "error", motivo: "no disponible: sin red" });
    expect(PROXIMAMENTE_MEDIOS.audio).toMatch(/^próximamente:/);
    expect(PROXIMAMENTE_MEDIOS.video).toMatch(/^próximamente:/);
    expect(PROXIMAMENTE_MEDIOS["3d"]).toMatch(/^próximamente:/);
  });
});

const cand = (n: number, nombre = `Control ${n}`, sinonimos?: string[]): CandidatoParametro => ({
  ref: { atomoId: "a1", parametroId: `p${n}` },
  parametro: { id: `p${n}`, nombre, ...(sinonimos ? { sinonimos } : {}), tipo: "numero" },
});

const muchos = (): CandidatoParametro[] => [...Array.from({ length: 34 }, (_, i) => cand(i)), cand(99, "Reverberación", ["reverb"])];

describe("elegirControles · Needle o distancia", () => {
  it("con 35 controles pide 5 candidatos a Needle y respeta su orden", async () => {
    const lista = muchos();
    const reverb = lista[lista.length - 1];
    const ids = [claveDe(reverb), ...lista.slice(0, 4).map(claveDe)];
    let llamadas = 0;
    const r = await elegirControles("sube la reverb un 10 %", lista, {
      elegirConIA: async () => { llamadas++; return { ids, motor: "needle" }; },
    });
    expect(llamadas).toBe(1);
    expect(r.motor).toBe("needle");
    expect(r.candidatos.map(claveDe)).toEqual(ids);
  });

  it("Needle caído (lanza o devuelve null): respaldo determinista por distancia, mismo orden", async () => {
    const lista = muchos();
    const caido = await elegirControles("sube la reverb un 10 %", lista, {
      elegirConIA: async () => { throw new Error("caído"); },
    });
    const vacio = await elegirControles("sube la reverb un 10 %", lista, { elegirConIA: async () => null });
    expect(caido.motor).toBe("distancia");
    expect(caido.candidatos).toHaveLength(5);
    expect(caido.candidatos[0].parametro.nombre).toBe("Reverberación");
    expect(vacio.candidatos.map(claveDe)).toEqual(caido.candidatos.map(claveDe));
  });

  it("ids desconocidos de la IA también caen al respaldo; con pocos controles no se gasta IA", async () => {
    const desconocidos = await elegirControles("frase", muchos(), { elegirConIA: async () => ({ ids: ["no::existe"] }) });
    expect(desconocidos.motor).toBe("distancia");
    let llamadas = 0;
    const pocos = [cand(1), cand(2)];
    const r = await elegirControles("sube control 1", pocos, {
      elegirConIA: async () => { llamadas++; return null; },
    });
    expect(r.motor).toBe("sin-necesidad");
    expect(r.candidatos).toEqual(pocos);
    expect(llamadas).toBe(0);
  });
});
