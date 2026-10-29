import { describe, it, expect } from "vitest";
import { buscarReferencias, preguntaTema, type DepsBuscarReferencias } from "../buscar-referencias";
import type { Catalogo, EntradaReferencia } from "../catalogo";

const base = {
  subtema: null as string | null, que_es: "", tipo: "galeria-inspiracion", acceso: "libre" as const,
  clase_uso: "solo-referencia" as const, condiciones: "", canales: ["navegador-de-la-persona"] as string[],
  prohibido: [] as string[], actualizacion: [], integracion: [], terminos: null, og_imagen: null,
  verificado: "2026-10-25", sin_verificar: [],
};
const entrada = (id: string, tema: string, extra: Partial<EntradaReferencia> = {}): EntradaReferencia =>
  ({ ...base, id, nombre: id, url: `https://${id}.example`, tema, ...extra });
const entradas: EntradaReferencia[] = [
  entrada("lottiefiles", "movimiento", { subtema: "animaciones", que_es: "animaciones lottie para interfaz" }),
  entrada("transitions", "movimiento", { subtema: "transiciones", que_es: "transiciones de interfaz con spring" }),
  entrada("navbar-gallery", "inspiracion-ui", { subtema: "navegación", que_es: "menús y barras de navegación" }),
  entrada("asd-ste100", "reglas", { que_es: "reglas de redacción clara y frases cortas" }),
];
const catalogo: Catalogo = {
  formato: "starseed-referencias", version: 1, verificado: "2026-10-25", origen: "prueba",
  temas: [
    { id: "movimiento", nombre: "Movimiento", icono: "Wind" },
    { id: "inspiracion-ui", nombre: "Inspiración de interfaz", icono: "LayoutGrid" },
    { id: "reglas", nombre: "Reglas y principios", icono: "Ruler" },
  ],
  entradas,
};
const deps = (extra: Partial<DepsBuscarReferencias> = {}): DepsBuscarReferencias =>
  ({ catalogo, conectados: new Set<string>(), ahora: () => 0, ...extra });
const contexto = { tipo: "pizarra" as const, privado: false };

describe("buscarReferencias", () => {
  it("preguntaTema ofrece todos los temas del catálogo a Laya", () => {
    const p = preguntaTema(catalogo);
    expect(p.type).toBe("choice");
    expect(Object.keys(p.criteria)).toEqual(["movimiento", "inspiracion-ui", "reglas"]);
  });

  it("sin Laya elige tema y subtema por las palabras de la petición", async () => {
    const tarjetas = await buscarReferencias({ peticion: "transiciones de interfaz con spring", contexto }, deps());
    expect(tarjetas[0].entradaId).toBe("transitions");
    expect(tarjetas.every((t) => t.entradaId.startsWith("lottie") || t.entradaId === "transitions")).toBe(true);
    expect(tarjetas[0].porque).toContain("transitions");
  });

  it("con Laya respeta el tema y el subtema elegidos", async () => {
    const tarjetas = await buscarReferencias({
      peticion: "lo que sea", contexto, laya: { tema: "movimiento", subtema: "animaciones", answer_confidence: 0.9 },
    }, deps());
    expect(tarjetas.map((t) => t.entradaId)).toEqual(["lottiefiles"]);
  });

  it("ordena por personalidad y por el ADN de diseño", async () => {
    const conEnergia = await buscarReferencias({ peticion: "algo para la pantalla", contexto, personalidad: { energia: 1 } }, deps());
    expect(["lottiefiles", "transitions"]).toContain(conEnergia[0].entradaId);
    const conAdn = await buscarReferencias({ peticion: "algo para la pantalla", contexto, adnDiseno: { temas: ["reglas"] } }, deps());
    expect(conAdn[0].entradaId).toBe("asd-ste100");
    expect(conAdn[0].porque).toContain("ADN de diseño");
  });

  it("consulta el canal oficial conectado y devuelve sus enlaces", async () => {
    let visto = "";
    const soloMcp: Catalogo = { ...catalogo, entradas: [entrada("mobbin", "inspiracion-ui", { canales: ["mcp-oficial"] })] };
    const tarjetas = await buscarReferencias({ peticion: "inspiración de interfaz", contexto }, deps({
      catalogo: soloMcp, conectados: new Set(["mcp-oficial"]),
      consultar: async (_peticion, e, canal) => { visto = `${e.id}:${canal}`; return { enlaces: ["https://mcp.example/mobbin"] }; },
    }));
    expect(visto).toBe("mobbin:mcp-oficial");
    expect(tarjetas[0]).toMatchObject({ canalUsado: "mcp-oficial", enlaces: ["https://mcp.example/mobbin"] });
    expect(tarjetas[0].porque).toContain("canal oficial mcp-oficial");
  });

  it("sin MCP ni API conectados la devuelve como enlace", async () => {
    const soloMcp: Catalogo = { ...catalogo, entradas: [entrada("mobbin", "inspiracion-ui", { canales: ["mcp-oficial"] })] };
    const tarjetas = await buscarReferencias({ peticion: "inspiración de interfaz", contexto }, deps({ catalogo: soloMcp }));
    expect(tarjetas[0]).toMatchObject({ canalUsado: "enlace", enlaces: ["https://mobbin.example"] });
    expect(tarjetas[0].porque).toContain("se abre como enlace");
  });

  it("lo privado nunca consulta el canal ni sale de las neuronas", async () => {
    let llamadas = 0;
    const soloMcp: Catalogo = { ...catalogo, entradas: [entrada("mobbin", "inspiracion-ui", { canales: ["mcp-oficial"] })] };
    const tarjetas = await buscarReferencias({ peticion: "inspiración de interfaz", contexto: { tipo: "perfil", privado: true } }, deps({
      catalogo: soloMcp, conectados: new Set(["mcp-oficial"]), consultar: async () => { llamadas++; return { enlaces: ["https://externo"] }; },
    }));
    expect(llamadas).toBe(0);
    expect(tarjetas[0].canalUsado).toBe("enlace");
    expect(tarjetas[0].porque).toContain("privado");
  });

  it("respeta el tope de tarjetas", async () => {
    const tarjetas = await buscarReferencias({ peticion: "animaciones transiciones", contexto }, deps({ tope: 1 }));
    expect(tarjetas).toHaveLength(1);
  });

  it("la acción referencias.buscar devuelve las tarjetas y respeta lo privado", async () => {
    const { manejarAccionProtomoleculaAsync } = await import("../../../protomolecula/accion-agente");
    const r = await manejarAccionProtomoleculaAsync(
      { accion: "referencias.buscar", peticion: "transiciones de interfaz", contexto: { tipo: "pizarra", privado: true } },
      { referencias: deps() },
    );
    expect(r.ok).toBe(true);
    expect(r.message).toContain("Referencias para «transiciones de interfaz» (pizarra, privado)");
    expect((r.datos as { tarjetas: unknown[] }).tarjetas).toHaveLength(1);
  });
});
