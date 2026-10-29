import { describe, it, expect } from "vitest";
import type { Catalogo, EntradaReferencia } from "../catalogo";
import { buscarReferencias, type DepsBuscarReferencias, type LayaBusqueda, type PeticionBusqueda } from "../buscar-referencias";

const entrada = (id: string, tema: string, subtema: string | null, extra: Partial<EntradaReferencia> = {}): EntradaReferencia => ({
  id, nombre: id, url: `https://example.com/${id}`, tema, subtema,
  que_es: `Referencia de ${subtema ?? tema}.`, tipo: "galeria-inspiracion", acceso: "libre",
  clase_uso: "solo-referencia", condiciones: "", canales: ["mcp-oficial"], prohibido: [],
  actualizacion: [], integracion: [], terminos: null, og_imagen: null, verificado: "2026-10-18", sin_verificar: [], ...extra,
});

const catalogo: Catalogo = {
  formato: "starseed-referencias", version: 1, verificado: "2026-10-18", origen: "prueba",
  temas: [
    { id: "movimiento", nombre: "Movimiento", icono: "Wind" },
    { id: "inspiracion-ui", nombre: "Inspiración de interfaz", icono: "LayoutGrid" },
  ],
  entradas: [
    entrada("transiciones", "movimiento", null, { que_es: "Transiciones y animaciones de interfaz." }),
    entrada("movimiento-b", "movimiento", null, { que_es: "Otra referencia de movimiento." }),
    entrada("bento", "inspiracion-ui", "rejillas bento", { que_es: "Rejillas bento para paneles." }),
    entrada("navbar", "inspiracion-ui", "navegación", { que_es: "Barras de navegación y menús." }),
  ],
};

const base: PeticionBusqueda = { peticion: "quiero animaciones de transición", contexto: { tipo: "mensaje", privado: false } };
const deps = (extra: Partial<DepsBuscarReferencias> = {}): DepsBuscarReferencias =>
  ({ catalogo, conectados: new Set<string>(), ahora: () => 0, ...extra });

describe("buscarReferencias", () => {
  it("sin Laya elige tema por palabras y devuelve como mucho tres tarjetas", async () => {
    const r = await buscarReferencias(base, deps());
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThanOrEqual(3);
    expect(r.every((t) => t.entradaId !== "bento" && t.entradaId !== "navbar")).toBe(true);
  });

  it("Laya elige tema y subtema con dos choice del catálogo", async () => {
    const laya: LayaBusqueda = ({ preguntas }) => {
      const [clave] = Object.keys(preguntas), p = preguntas[clave];
      if (p.type !== "choice") return null;
      const valor = Object.keys(p.criteria).includes("navegación") ? "navegación" : "inspiracion-ui";
      return { [clave]: { tipo: "choice", valor, probabilidades: {}, confianza: 0.9 } };
    };
    const r = await buscarReferencias({ ...base, peticion: "algo bonito", laya }, deps());
    expect(r).toHaveLength(1);
    expect(r[0].entradaId).toBe("navbar");
    expect(r[0].porque).toContain("navegación");
  });

  it("con MCP conectado consulta el canal y marca canalUsado", async () => {
    const consultar = async ({ entrada: e, canal }: { entrada: EntradaReferencia; canal: string }) =>
      [{ titulo: `Ficha de ${e.id}`, url: `https://mcp.example/${e.id}`, canal }];
    const r = await buscarReferencias(base, deps({ conectados: new Set(["mcp-oficial"]), consultarCanal: consultar }));
    expect(r[0].canalUsado).toBe("mcp-oficial");
    expect(r[0].enlaces[0].url).toBe("https://mcp.example/transiciones");
  });

  it("sin canal oficial devuelve enlace y no llama a la red", async () => {
    let llamadas = 0;
    const r = await buscarReferencias(base, deps({ consultarCanal: async () => { llamadas++; return []; } }));
    expect(llamadas).toBe(0);
    expect(r[0].canalUsado).toBe("enlace");
    expect(r[0].enlaces[0].url).toBe("https://example.com/transiciones");
  });

  it("lo privado no consulta canales y no manda el texto a Laya", async () => {
    let estado: unknown = null, llamadas = 0;
    const laya: LayaBusqueda = ({ estado: e }) => { estado = e; return null; };
    const peticion = { ...base, contexto: { tipo: "perfil", privado: true } as const, laya };
    const r = await buscarReferencias(peticion, deps({ conectados: new Set(["mcp-oficial"]), consultarCanal: async () => { llamadas++; return []; } }));
    expect(llamadas).toBe(0);
    expect(estado).toEqual({ tipo: "perfil" });
    expect(r[0].canalUsado).toBe("enlace");
  });

  it("ordena por ADN de diseño dentro del tema elegido", async () => {
    const peticion: PeticionBusqueda = { ...base, adnDiseno: { palabras: ["movimiento-b"] } };
    const r = await buscarReferencias(peticion, deps({ conectados: new Set() }));
    expect(r[0].entradaId).toBe("movimiento-b");
  });
});
