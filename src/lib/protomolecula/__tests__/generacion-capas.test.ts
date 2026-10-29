import { describe, expect, it } from "vitest";
import { pedirImagen, type DependenciasGeneracion } from "../generacion-capas";
import { elegirControles, refDe, seleccionDeterminista } from "../elegir-controles";
import type { CandidatoParametro, ReferenciaEntidad } from "../tipos";

const cand = (nombre: string, i: number): CandidatoParametro => ({
  ref: { atomoId: `a${i}`, parametroId: `p${i}` },
  parametro: { id: `p${i}`, nombre, tipo: "numero", min: 0, max: 100 },
});
const muchos = (): CandidatoParametro[] => [
  ...Array.from({ length: 31 }, (_, i) => cand(`Control ${i + 1}`, i)),
  cand("Reverberación", 99),
];
const ref: ReferenciaEntidad = { tipo: "media", id: "m1" };
const deps = (over: Partial<DependenciasGeneracion> = {}): DependenciasGeneracion => ({
  generarImagen: async () => ({ ok: true, url: "https://x/faro.png", provider: "pollinations" }),
  guardarEntidad: async () => ref,
  ahora: () => 1000,
  nuevoId: () => "capa-1",
  ...over,
});

describe("pedirImagen", () => {
  it("devuelve una capa candidata lienzo2d con referencia, sin insertarla", async () => {
    const r = await pedirImagen("un faro al atardecer", deps());
    if (!r.ok) throw new Error(r.motivo);
    expect(r.candidata).toMatchObject({ id: "capa-1", tipo: "lienzo2d", formato: "png", referencia: ref, visible: true, bloqueada: false });
    expect(r.candidata.titulo).toContain("faro");
    expect(r.proveedor).toBe("pollinations");
    expect(r.aviso).toContain("candidata");
  });

  it("sin cupo o sin medio dice el motivo del router, sin falsear", async () => {
    const r = await pedirImagen("x", deps({ generarImagen: async () => ({ ok: false, provider: "pollinations", error: "sin cupo" }) }));
    expect(r).toEqual({ ok: false, motivo: "próximamente/no disponible: sin cupo" });
  });

  it("si el router lanza, no propaga la excepción", async () => {
    const r = await pedirImagen("x", deps({ generarImagen: async () => { throw new Error("caído"); } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("próximamente/no disponible: caído");
  });

  it("sin entidad guardada no hay capa que cite", async () => {
    const r = await pedirImagen("x", deps({ guardarEntidad: async () => null }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("no se pudo guardar");
  });

  it("un prompt vacío se rechaza antes de llamar al router", async () => {
    let llamado = false;
    const r = await pedirImagen("  ", deps({ generarImagen: async () => { llamado = true; return { ok: true }; } }));
    expect(r.ok).toBe(false);
    expect(llamado).toBe(false);
  });
});

describe("elegirControles", () => {
  it("con 30 controles o menos no consulta y devuelve todos", async () => {
    let llamado = false;
    const pocos = [cand("Brillo", 1), cand("Volumen", 2)];
    const r = await elegirControles("sube el brillo", pocos, { consultar: async () => { llamado = true; return { ok: true, ids: [] }; } });
    expect(r).toEqual(pocos);
    expect(llamado).toBe(false);
  });

  it("con más de 30 pide los 5 a Needle y devuelve esos candidatos en su orden", async () => {
    const lista = muchos();
    const ids = [lista[31], lista[3], lista[7]].map(refDe);
    const r = await elegirControles("sube la reverberación un 10 %", lista, {
      consultar: async (_f, cs, max) => { expect(cs.length).toBe(lista.length); expect(max).toBe(5); return { ok: true, ids }; },
    });
    expect(r.map(refDe)).toEqual(ids);
  });

  it("si Needle cae, respaldo determinista por distancia de nombres", async () => {
    const r = await elegirControles("sube la reverberación un 10 %", muchos(), { consultar: async () => { throw new Error("caído"); } });
    expect(r.length).toBe(5);
    expect(r[0].parametro.nombre).toBe("Reverberación");
  });

  it("sin cupo no consulta y usa el respaldo", async () => {
    let llamado = false;
    const r = await elegirControles("volumen", muchos(), { hayCupo: () => false, consultar: async () => { llamado = true; return { ok: true, ids: [] }; } });
    expect(llamado).toBe(false);
    expect(r.length).toBe(5);
  });

  it("ids desconocidos caen al respaldo y el orden es estable", async () => {
    const depsConsulta = { consultar: async () => ({ ok: true, ids: ["no::existe"] }) };
    const a = await elegirControles("sube la reverberación", muchos(), depsConsulta);
    const b = await elegirControles("sube la reverberación", muchos(), depsConsulta);
    expect(a.map(refDe)).toEqual(b.map(refDe));
    expect(a[0].parametro.nombre).toBe("Reverberación");
  });

  it("el respaldo no muta la lista y respeta el máximo pedido", () => {
    const lista = muchos();
    const copia = lista.map(refDe);
    const r = seleccionDeterminista("reverberación", lista, 2);
    expect(r.length).toBe(2);
    expect(lista.map(refDe)).toEqual(copia);
  });
});
