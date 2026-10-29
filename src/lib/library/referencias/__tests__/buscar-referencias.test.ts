import { describe, it, expect } from "vitest";
import { buscarReferencias, type DepsBuscarReferencias, type LayaReferencias } from "../buscar-referencias";
import type { Catalogo, EntradaReferencia } from "../catalogo";
import real from "../../../../../config/referencias-inspiracion.json";
const entrada = (p: Pick<EntradaReferencia, "id" | "nombre" | "tema"> & Partial<EntradaReferencia>): EntradaReferencia => ({
  url: `https://${p.id}.example/`, subtema: null, que_es: `${p.nombre} para inspirarse`, tipo: "galeria-inspiracion",
  acceso: "libre", clase_uso: "solo-referencia", condiciones: "Solo referencia: se estudia el patrón y se crea una versión propia.",
  canales: ["navegador-de-la-persona"], prohibido: ["copiar-capturas"], actualizacion: [], integracion: [],
  terminos: null, og_imagen: null, verificado: "2026-10-18", sin_verificar: [], ...p,
});
const catalogo: Catalogo = {
  formato: "starseed-referencias", version: 1, verificado: "2026-10-18", origen: "prueba",
  temas: [{ id: "movimiento", nombre: "Movimiento", icono: "Wind" }, { id: "marca", nombre: "Marca", icono: "Gem" }, { id: "inspiracion-ui", nombre: "Inspiración de interfaz", icono: "LayoutGrid" }],
  entradas: [
    entrada({ id: "lottie", nombre: "LottieFiles", tema: "movimiento", subtema: "animaciones gráficas", que_es: "Animaciones de movimiento listas.", canales: ["mcp-oficial", "navegador-de-la-persona"] }),
    entrada({ id: "kinetics", nombre: "Kinetics", tema: "movimiento", que_es: "Referencias de cinética y movimiento." }),
    entrada({ id: "deck", nombre: "Deck.Gallery", tema: "marca", subtema: "presentaciones HTML", que_es: "Presentaciones y decks de marca." }),
    entrada({ id: "logo", nombre: "Logosystem", tema: "marca", que_es: "Logos e identidad de marca.", canales: ["api-oficial"] }),
    entrada({ id: "navbar", nombre: "Navbar Gallery", tema: "inspiracion-ui", subtema: "navegación", que_es: "Galería de menús y navegación web.", canales: ["sitemap-respetando-robots", "navegador-de-la-persona"] }),
  ],
};

const base = (extra: Partial<DepsBuscarReferencias> = {}): DepsBuscarReferencias => ({ catalogo, maximo: 6, ...extra });
describe("buscarReferencias", () => {
  it("sin Laya elige tema y subtema por palabras y devuelve enlaces citando la fuente", async () => {
    const r = await buscarReferencias({ peticion: "quiero animaciones de movimiento para la pizarra", contexto: { tipo: "pizarra", privado: true } }, base());
    expect(r.map((t) => t.entradaId)).toEqual(["lottie", "kinetics"]);
    expect(r[0].porque).toContain("Tema «Movimiento»");
    expect(r[0].porque).toContain("diseño propio");
    expect(r[0].enlaces[0]).toEqual({ titulo: "LottieFiles", url: "https://lottie.example/" });
    expect(r[0].canalUsado).toBe("enlace");
  });

  it("con Laya pide un choice con los temas y otro con los subtemas del tema elegido", async () => {
    const criterios: Array<Record<string, string>> = [];
    const laya: LayaReferencias = async (preguntas) => {
      const p = preguntas.tema ?? preguntas.subtema;
      if (p && p.type === "choice") criterios.push(p.criteria);
      return preguntas.tema ? { answers: { tema: { choice: "marca" } } } : { answers: { subtema: { choice: "s0" } } };
    };
    const r = await buscarReferencias({ peticion: "algo para mi identidad", contexto: { tipo: "perfil", privado: true }, laya }, base());
    expect(Object.keys(criterios[0])).toEqual(["movimiento", "marca", "inspiracion-ui"]);
    expect(criterios[1]).toEqual({ s0: "presentaciones HTML" });
    expect(r[0].entradaId).toBe("deck");
    expect(r[0].porque).toContain("Marca");
  });

  it("si Laya falla vuelve a las palabras sin romper la búsqueda", async () => {
    const laya = async () => { throw new Error("sin Laya"); };
    const r = await buscarReferencias({ peticion: "logos de marca", contexto: { tipo: "perfil", privado: true }, laya }, base());
    expect(r.map((t) => t.entradaId)).toContain("logo");
  });

  it("consulta el canal oficial conectado y suma sus enlaces", async () => {
    let pedido: { entrada: EntradaReferencia; canal: string; peticion: string } | null = null;
    const consultar = async (p: { entrada: EntradaReferencia; canal: string; peticion: string }) => {
      pedido = p;
      return [{ titulo: "Patrón de animación", url: "https://patron.example/a" }, { titulo: "Repetido", url: "https://lottie.example/" }];
    };
    const r = await buscarReferencias({ peticion: "animaciones de movimiento", contexto: { tipo: "pizarra", privado: false } },
      base({ conectado: new Set(["mcp-oficial"]), consultar }));
    expect(pedido).toEqual({ entrada: expect.objectContaining({ id: "lottie" }), canal: "mcp-oficial", peticion: "animaciones de movimiento" });
    expect(r[0].canalUsado).toBe("mcp-oficial");
    expect(r[0].enlaces.map((e) => e.url)).toEqual(["https://lottie.example/", "https://patron.example/a"]);
  });

  it("sin canal oficial conectado no consulta nada y devuelve el enlace directo", async () => {
    let llamado = 0;
    const r = await buscarReferencias({ peticion: "animaciones de movimiento", contexto: { tipo: "pizarra", privado: false } },
      base({ consultar: async () => { llamado++; return []; } }));
    expect(llamado).toBe(0);
    expect(r[0].canalUsado).toBe("enlace");
    expect(r[0].enlaces).toHaveLength(1);
  });

  it("lo privado nunca sale: no consulta aunque el canal oficial esté conectado", async () => {
    let llamado = 0;
    const r = await buscarReferencias({ peticion: "animaciones de movimiento", contexto: { tipo: "pizarra", privado: true } },
      base({ conectado: new Set(["mcp-oficial"]), consultar: async () => { llamado++; return [{ titulo: "x", url: "https://x.example" }]; } }));
    expect(llamado).toBe(0);
    expect(r[0].canalUsado).toBe("enlace");
  });

  it("respeta el sitemap como enlace: no lo usa para consultar", async () => {
    let llamado = 0;
    const r = await buscarReferencias({ peticion: "galería de navegación web", contexto: { tipo: "escritorio", privado: false } },
      base({ conectado: new Set(["sitemap-respetando-robots"]), consultar: async () => { llamado++; return []; } }));
    expect(llamado).toBe(0);
    expect(r[0].entradaId).toBe("navbar");
    expect(r[0].canalUsado).toBe("enlace");
  });

  it("si el canal oficial falla, cae al enlace sin propagar el error", async () => {
    const r = await buscarReferencias({ peticion: "animaciones de movimiento", contexto: { tipo: "pizarra", privado: false } },
      base({ conectado: new Set(["mcp-oficial"]), consultar: async () => { throw new Error("429"); } }));
    expect(r[0].canalUsado).toBe("enlace");
    expect(r[0].enlaces).toEqual([{ titulo: "LottieFiles", url: "https://lottie.example/" }]);
  });

  it("ordena por la personalidad y el ADN de diseño dentro del tema", async () => {
    const conPersonalidad = await buscarReferencias({ peticion: "marca", contexto: { tipo: "perfil", privado: true }, personalidad: "amante de los logos y la identidad" }, base());
    const conAdn = await buscarReferencias({ peticion: "marca", contexto: { tipo: "perfil", privado: true }, adnDiseno: "presentación y decks" }, base());
    expect(conPersonalidad.map((t) => t.entradaId)).toEqual(["logo", "deck"]);
    expect(conAdn.map((t) => t.entradaId)).toEqual(["deck", "logo"]);
  });

  it("respeta el máximo de tarjetas pedido", async () => {
    const r = await buscarReferencias({ peticion: "marca", contexto: { tipo: "perfil", privado: true } }, base({ maximo: 1 }));
    expect(r).toHaveLength(1);
  });

  it("funciona con el catálogo real sin red ni canales conectados", async () => {
    const r = await buscarReferencias({ peticion: "animaciones y transiciones de movimiento", contexto: { tipo: "publicacion", privado: true } },
      { catalogo: real as unknown as Catalogo, maximo: 4 });
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThanOrEqual(4);
    expect(r.every((t) => t.enlaces[0].url.startsWith("https://"))).toBe(true);
    expect(r.every((t) => t.porque.includes("diseño propio"))).toBe(true);
  });
});
