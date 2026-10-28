import { describe, expect, it, vi } from "vitest";
import type { CandidatoParametro } from "../tipos";
import { medioGenerativoDisponible, pedirImagen, type DependenciasGeneracion } from "../generacion-capas";
import { claveDeCandidato, elegirControles, elegirPorNombre, herramientasDeCandidatos } from "../elegir-controles";

const cand = (atomoId: string, nombre: string, sinonimos: string[] = []): CandidatoParametro => ({
  ref: { atomoId, parametroId: nombre.toLowerCase().replace(/\s+/g, "-") },
  parametro: { id: nombre.toLowerCase().replace(/\s+/g, "-"), nombre, tipo: "numero", sinonimos },
});
const ids = (cs: CandidatoParametro[]): string[] => cs.map(claveDeCandidato);

describe("pedirImagen", () => {
  it("devuelve una capa CANDIDATA lienzo2d con referencia a la entidad", async () => {
    let pedido: unknown;
    const deps: DependenciasGeneracion = {
      generar: async (p) => {
        pedido = p;
        return { ok: true, url: "https://media/x.png", provider: "pollinations", entidad: { tipo: "imagen", id: "ent-1" } };
      },
      nuevoId: () => "capa-7", orden: 3, formato: "16:9",
    };
    const r = await pedirImagen("  un faro  ", deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidata).toBe(true);
    expect(r.capa).toMatchObject({ id: "capa-7", tipo: "lienzo2d", formato: "png", orden: 3, visible: true, bloqueada: false });
    expect(r.capa.referencia).toEqual({ tipo: "imagen", id: "ent-1" });
    expect(r.proveedor).toBe("pollinations");
    expect(pedido).toEqual({ prompt: "un faro", formato: "16:9" });
  });
  it("sin cupo dice «No disponible» con el motivo del router, sin fingir", async () => {
    const r = await pedirImagen("algo", {
      generar: async () => ({ ok: false, provider: "pollinations", error: "Sin cupo diario de imágenes." }),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("No disponible: Sin cupo diario de imágenes.");
  });
  it("router caído o sin url: falla sin lanzar", async () => {
    const caido = await pedirImagen("algo", { generar: async () => { throw new Error("red caída"); } });
    expect(caido).toEqual({ ok: false, motivo: "No disponible: red caída" });
    const sinUrl = await pedirImagen("algo", { generar: async () => ({ ok: true, provider: "x" }) });
    expect(sinUrl.ok).toBe(false);
  });
  it("sin router o sin prompt lo dice y no llama a la red", async () => {
    expect(await pedirImagen("algo")).toEqual({ ok: false, motivo: "No disponible: no hay router de imágenes conectado." });
    const sinPrompt = await pedirImagen("   ", { generar: async () => { throw new Error("no debería llamarse"); } });
    expect(sinPrompt).toEqual({ ok: false, motivo: "Describe qué imagen quieres generar." });
  });
  it("registra la entidad si el router no la da; sin registro lo avisa", async () => {
    const r = await pedirImagen("gato", {
      generar: async () => ({ ok: true, url: "https://x/1.png", provider: "foo" }),
      registrarEntidad: ({ url }) => ({ tipo: "imagen", id: url }),
    });
    expect(r.ok && r.capa.referencia).toEqual({ tipo: "imagen", id: "https://x/1.png" });
    const sin = await pedirImagen("gato", { generar: async () => ({ ok: true, url: "https://x/1.png", provider: "foo" }) });
    expect(sin.ok && sin.aviso).toMatch(/no quedó registrada/);
  });
  it("imagen está disponible; audio, vídeo y 3D se declaran «próximamente»", () => {
    expect(medioGenerativoDisponible("imagen")).toEqual({ ok: true });
    for (const m of ["audio", "video", "3d"] as const) {
      const r = medioGenerativoDisponible(m);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toMatch(/^próximamente:/);
    }
  });
});

const muchos = (n = 35): CandidatoParametro[] => [
  cand("mez", "Reverberación", ["reverb"]),
  cand("fon", "Brillo", ["luminosidad"]),
  ...Array.from({ length: n - 2 }, (_, i) => cand(`a${i}`, `Control ${String(i).padStart(2, "0")}`)),
];

describe("elegirControles", () => {
  it("con 30 o menos devuelve los mismos candidatos y no consulta a la IA", async () => {
    const pocos = muchos(30);
    const preguntar = vi.fn(async () => ["no"]);
    expect(await elegirControles("sube la reverb", pocos, { preguntar })).toEqual(pocos);
    expect(preguntar).not.toHaveBeenCalled();
  });
  it("con más de 30 pide a la IA y devuelve solo ids reales, en su orden y sin repetir", async () => {
    const cs = muchos();
    let vistas: unknown[] = [];
    const r = await elegirControles("sube la reverb un 10 %", cs, {
      preguntar: async (frase, herramientas, maximo) => {
        vistas = [frase, herramientas.length, maximo, herramientas[0]?.name];
        return [claveDeCandidato(cs[2]), "no-existe", claveDeCandidato(cs[0]), claveDeCandidato(cs[2])];
      },
    });
    expect(vistas).toEqual(["sube la reverb un 10 %", 35, 5, claveDeCandidato(cs[0])]);
    expect(ids(r)).toEqual([claveDeCandidato(cs[2]), claveDeCandidato(cs[0])]);
  });
  it("si Needle está caído o inventa ids, cae al respaldo por nombre", async () => {
    const cs = muchos();
    const caido = await elegirControles("sube la reverb un 10 %", cs, { preguntar: async () => { throw new Error("sin red"); } });
    const inventado = await elegirControles("sube la reverb un 10 %", cs, { preguntar: async () => ["x::y"] });
    expect(ids(caido)[0]).toBe(claveDeCandidato(cs[0]));
    expect(ids(inventado)).toEqual(ids(caido));
  });
  it("el respaldo es determinista, devuelve como mucho 5 y usa nombres y sinónimos", async () => {
    const cs = muchos();
    const a = await elegirControles("baja el brillo", cs, { preguntar: async () => null });
    const b = await elegirControles("baja el brillo", cs, { preguntar: async () => null });
    expect(ids(a)).toEqual(ids(b));
    expect(a).toHaveLength(5);
    expect(ids(a)).toContain(claveDeCandidato(cs[1]));
    expect(elegirPorNombre("reverb", cs)).toHaveLength(5);
    expect(herramientasDeCandidatos(cs).slice(0, 2).map((h) => h.name)).toEqual(ids(cs).slice(0, 2));
  });
  it("sin candidatos no hay nada que elegir", async () => {
    expect(await elegirControles("sube", [])).toEqual([]);
  });
});
