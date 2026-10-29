import { describe, it, expect } from "vitest";
import { buscarReferencias, type ElegirTemaLaya } from "../buscar-referencias";
import type { Catalogo, EntradaReferencia } from "../catalogo";

function entrada(id: string, tema: string, nombre: string, queEs: string, canales: string[], subtema: string | null = null): EntradaReferencia {
  return {
    id, nombre, url: `https://ejemplo.test/${id}`, tema, subtema, que_es: queEs, tipo: "galeria-inspiracion",
    acceso: "libre", clase_uso: "solo-referencia", condiciones: "Solo inspiración", canales, prohibido: [],
    actualizacion: [], integracion: [], terminos: null, og_imagen: null, verificado: "2026-10-18", sin_verificar: [],
  };
}

const catalogo: Catalogo = {
  formato: "starseed-referencias", version: 1, verificado: "2026-10-18", origen: "prueba",
  temas: [
    { id: "inspiracion-ui", nombre: "Inspiración de interfaz", icono: "LayoutGrid" },
    { id: "tipografia-iconos", nombre: "Tipografías e iconos", icono: "Type" },
    { id: "movimiento", nombre: "Movimiento", icono: "Wind" },
  ],
  entradas: [
    entrada("a-navbar", "inspiracion-ui", "Navbar Gallery", "Galería de barras de navegación", ["sitemap"], "navegación"),
    entrada("z-mobbin", "inspiracion-ui", "Mobbin", "Capturas de apps móviles", ["mcp-oficial"], "apps móviles y web"),
    entrada("con-mcp", "movimiento", "Con MCP", "Animaciones de movimiento", ["mcp-oficial"]),
    entrada("solo-navegador", "movimiento", "Solo navegador", "Transiciones de movimiento", ["navegador-de-la-persona"]),
    entrada("typewolf", "tipografia-iconos", "Typewolf", "Guía de tipografías y fuentes", ["rss"]),
  ],
};

const sinLaya = undefined;
const contexto = { tipo: "mensaje" as const, privado: false };

describe("buscarReferencias", () => {
  it("usa el tema y el subtema que elige Laya", async () => {
    const llamadas: Array<{ peticion: string; temas: ReadonlyArray<{ id: string }> }> = [];
    const laya: ElegirTemaLaya = async (peticion, temas) => {
      llamadas.push({ peticion, temas });
      return { tema: "inspiracion-ui", subtema: "navegación" };
    };
    const r = await buscarReferencias({ peticion: "algo sin pistas", contexto, laya }, { catalogo });
    expect(llamadas[0]?.temas).toHaveLength(3);
    expect(r[0]?.entradaId).toBe("a-navbar");
    expect(r[0]?.porque).toContain("elegida por Laya");
    expect(r[0]?.porque).toContain("subtema «navegación»");
  });

  it("sin Laya elige el tema por palabras", async () => {
    const r = await buscarReferencias({ peticion: "necesito una tipografía con fuentes", contexto, laya: sinLaya }, { catalogo });
    expect(r[0]?.entradaId).toBe("typewolf");
    expect(r[0]?.porque).toContain("Tipografías e iconos");
  });

  it("ordena por el ADN de diseño y la personalidad", async () => {
    const laya: ElegirTemaLaya = async () => ({ tema: "inspiracion-ui" });
    const r = await buscarReferencias({
      peticion: "interfaz", contexto, laya,
      personalidad: { nombre: "Aurora", temas: ["inspiracion-ui"] },
      adnDiseno: { tema: "inspiracion-ui", palabras: ["móviles"] },
    }, { catalogo });
    expect(r[0]?.entradaId).toBe("z-mobbin");
    expect(r[0]?.porque).toContain("afín a la personalidad «Aurora»");
    expect(r[0]?.porque).toContain("afín al ADN de diseño");
  });

  it("consulta solo los canales oficiales conectados y el resto va como enlace", async () => {
    const llamadas: Array<{ id: string; canal: string }> = [];
    const r = await buscarReferencias({ peticion: "movimiento", contexto, laya: sinLaya }, {
      catalogo,
      conectado: new Set(["mcp-oficial"]),
      consultar: async (e, canal) => { llamadas.push({ id: e.id, canal }); return ["https://mcp.test/resultado"]; },
      limite: 3,
    });
    const mcp = r.find((t) => t.entradaId === "con-mcp");
    const navegador = r.find((t) => t.entradaId === "solo-navegador");
    expect(mcp?.canalUsado).toBe("mcp-oficial");
    expect(mcp?.enlaces).toEqual(["https://mcp.test/resultado"]);
    expect(navegador?.canalUsado).toBe("enlace");
    expect(navegador?.enlaces).toEqual(["https://ejemplo.test/solo-navegador"]);
    expect(llamadas).toEqual([{ id: "con-mcp", canal: "mcp-oficial" }]);
  });

  it("no manda el contexto privado a Laya y lo deja en tus neuronas", async () => {
    let recibida = "";
    const laya: ElegirTemaLaya = async (peticion) => { recibida = peticion; return { tema: "inspiracion-ui" }; };
    const r = await buscarReferencias({
      peticion: "un menú", contexto: { tipo: "perfil", privado: true, palabras: ["secreto-privado"] }, laya,
    }, { catalogo });
    expect(recibida).toBe("un menú");
    expect(recibida).not.toContain("secreto");
    expect(r[0]?.porque).toContain("contexto privado");
  });

  it("cae a las palabras si Laya falla y respeta el límite", async () => {
    const laya: ElegirTemaLaya = async () => { throw new Error("sin Laya"); };
    const r = await buscarReferencias({ peticion: "tipografía", contexto, laya }, { catalogo, limite: 1 });
    expect(r).toHaveLength(1);
    expect(r[0]?.entradaId).toBe("typewolf");
  });

  it("devuelve vacío con un catálogo vacío", async () => {
    const r = await buscarReferencias({ peticion: "lo que sea", contexto }, { catalogo: { ...catalogo, temas: [], entradas: [] } });
    expect(r).toEqual([]);
  });
});
