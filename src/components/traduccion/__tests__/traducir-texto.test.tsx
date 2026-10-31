import { describe, expect, it } from "vitest";
import { crearTraductor } from "@/lib/traduccion/motor";
import {
  avisoProgreso,
  crearMotores,
  entradasTraduccion,
  nombreMotor,
  puedeLibreTranslate,
  textosATraducir,
  traducirConAstraura,
  type PaginaActual,
} from "../traducir-texto";
import { entradasVisibles, type ContextoMenuTexto } from "../menu-texto";

/** Translator API simulada: disponible y traduce devolviendo el texto con una marca. */
const translatorSimulado = {
  availability: async () => "available",
  create: async () => ({ translate: async (t: string) => `${t} hello (simulado)` }),
};

function montarParrafo(): HTMLElement {
  const p = document.createElement("p");
  p.textContent = "Trama viva del párrafo";
  document.body.append(p);
  return p;
}

function ctx(opciones: { seleccion?: string; objetivo?: Element | null; paginaTraducida?: boolean }): ContextoMenuTexto {
  return {
    seleccion: opciones.seleccion ?? "",
    objetivo: opciones.objetivo ?? null,
    paginaTraducida: opciones.paginaTraducida ?? false,
  };
}

describe("puedeLibreTranslate · LibreTranslate de la neurona solo donde se alcanza 127.0.0.1", () => {
  it("permite https en localhost y 127.0.0.1, y lo deniega en una página https pública", () => {
    expect(puedeLibreTranslate({ protocolo: "https:", maquina: "localhost" })).toBe(true);
    expect(puedeLibreTranslate({ protocolo: "https:", maquina: "127.0.0.1" })).toBe(true);
    expect(puedeLibreTranslate({ protocolo: "https:", maquina: "starseed-os.vercel.app" })).toBe(false);
  });

  it("permite http y la app nativa; nada sin página y sin ser nativa", () => {
    expect(puedeLibreTranslate({ protocolo: "http:" })).toBe(true);
    expect(puedeLibreTranslate({ nativa: true, protocolo: "https:", maquina: "starseed-os.vercel.app" })).toBe(true);
    expect(puedeLibreTranslate({})).toBe(false);
  });
});

describe("textosATraducir · selección acotada y el bloque bajo el puntero como párrafo", () => {
  it("recorta la selección al tope y toma el párrafo del bloque más cercano", () => {
    const p = montarParrafo();
    const r = textosATraducir(ctx({ seleccion: "a".repeat(5000), objetivo: p }), 100);
    expect(r.seleccion).toHaveLength(100);
    expect(r.parrafo).toBe("Trama viva del párrafo");
  });

  it("sin bloque reconocido usa el objetivo tal cual y respeta el texto vacío", () => {
    const div = document.createElement("div");
    const span = document.createElement("span");
    span.textContent = "Solo un contenedor";
    div.append(span);
    document.body.append(div);
    const r = textosATraducir(ctx({ objetivo: span }));
    expect(r.parrafo).toBe("Solo un contenedor");
    expect(textosATraducir(ctx({ seleccion: "algo", objetivo: null })).parrafo).toBe("");
  });
});

describe("nombres y avisos que ve la persona", () => {
  it("nombreMotor enseña un nombre amable y un id nuevo tal cual", () => {
    expect(nombreMotor("navegador")).toBe("Traductor del navegador");
    expect(nombreMotor("libretranslate")).toBe("LibreTranslate de la neurona");
    expect(nombreMotor("astraura")).toBe("Astraura");
    expect(nombreMotor("motor-futuro")).toBe("motor-futuro");
  });

  it("avisoProgreso dice cuánto va y admite que no haya nada que traducir", () => {
    expect(avisoProgreso(0, 0)).toBe("No hay nada que traducir");
    expect(avisoProgreso(3, 10)).toBe("Traduciendo la página: 3 de 10…");
    expect(avisoProgreso(12, 10)).toBe("Traduciendo la página: 10 de 10…");
  });
});

describe("crearMotores · capas según la página, con el motor simulado", () => {
  it("con Translator simulada en https pública: navegador › Astraura (sin 127.0.0.1)", () => {
    const ids = crearMotores({ protocolo: "https:", maquina: "starseed-os.vercel.app", translator: translatorSimulado }).map((m) => m.id);
    expect(ids).toEqual(["navegador", "astraura"]);
  });

  it("en localhost entra también LibreTranslate de la neurona; sin Translator, no hay capa navegador", () => {
    expect(crearMotores({ protocolo: "https:", maquina: "localhost" }).map((m) => m.id)).toEqual(["libretranslate", "astraura"]);
    expect(crearMotores({ protocolo: "http:", translator: translatorSimulado }).map((m) => m.id)).toEqual(["navegador", "libretranslate", "astraura"]);
    expect(crearMotores({ protocolo: "http:" }).map((m) => m.id)).toEqual(["libretranslate", "astraura"]);
  });

  it("costura real sin red: el motor simulado del navegador traduce y dice qué motor hizo", async () => {
    const r = await crearTraductor(crearMotores({ translator: translatorSimulado, protocolo: "https:", maquina: "starseed-os.vercel.app" })).traducir(["hola"], "auto", "en");
    expect(r[0].motor).toBe("navegador");
    expect(r[0].texto).toContain("hello (simulado)");
  });

  it("sin ningún motor que llegue, el fallo es honesto y no hay traducción inventada", async () => {
    await expect(crearTraductor(crearMotores({ protocolo: "https:", maquina: "starseed-os.vercel.app" })).traducir(["hola"], "auto", "en")).rejects.toThrow("Ningún traductor disponible para auto → en");
  });
});


describe("entradasTraduccion · las cuatro entradas del menú de TRD1020E", () => {
  const hechas: string[] = [];
  const acciones = {
    traducirSeleccion: (t: string) => hechas.push(`seleccion:${t}`),
    traducirParrafo: (t: string) => hechas.push(`parrafo:${t}`),
    traducirPagina: () => hechas.push("pagina"),
    verOriginal: () => hechas.push("original"),
  };
  const porId = Object.fromEntries(entradasTraduccion(acciones).map((e) => [e.id, e]));

  it("producen exactamente las cuatro, con visibilidad por caso", () => {
    expect(entradasTraduccion(acciones).map((e) => e.etiqueta)).toEqual([
      "Traducir selección",
      "Traducir este párrafo",
      "Traducir toda la página",
      "Ver original",
    ]);
    // Visibilidad juzgada por entradasVisibles, el filtro que usa de verdad el menú.
    expect(entradasVisibles([porId["traducir-seleccion"]], ctx({ seleccion: "hola" }))).toHaveLength(1);
    expect(entradasVisibles([porId["traducir-seleccion"]], ctx({}))).toHaveLength(0);
    // Sin predicado declarado la entrada se ve siempre (contrato del menú de TRD1020E).
    expect(entradasVisibles([porId["traducir-parrafo"], porId["traducir-pagina"]], ctx({}))).toHaveLength(2);
    // «Ver original» solo con la página ya traducida (se marca al aplicar la página entera).
    expect(entradasVisibles([porId["ver-original"]], ctx({ paginaTraducida: true }))).toHaveLength(1);
    expect(entradasVisibles([porId["ver-original"]], ctx({}))).toHaveLength(0);
  });

  it("ejecutan con el ctx del menú", () => {
    const p = montarParrafo();
    porId["traducir-seleccion"].ejecutar(ctx({ seleccion: "hola mundo", objetivo: p }));
    porId["traducir-parrafo"].ejecutar(ctx({ objetivo: p }));
    porId["traducir-pagina"].ejecutar(ctx({}));
    porId["ver-original"].ejecutar(ctx({}));
    expect(hechas).toEqual([
      "seleccion:hola mundo",
      "parrafo:Trama viva del párrafo",
      "pagina",
      "original",
    ]);
  });
});
