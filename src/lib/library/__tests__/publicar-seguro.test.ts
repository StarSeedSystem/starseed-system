import { describe, it, expect } from "vitest";
import {
  hrefDeAdjunto,
  stagePublishAttach,
  readPublishAttach,
  limpiarAttachPublicacion,
  colorDeCategoria,
  inicialDeTitulo,
  portadaLocal,
} from "../publicar-seguro";
import type { SessionStorageLike } from "../publicar-seguro";

/** Storage en memoria para las pruebas (sin disco, sin red). */
function storageTest(): SessionStorageLike & { mapa: Map<string, string> } {
  const mapa = new Map<string, string>();
  return {
    mapa,
    getItem: (k) => mapa.get(k) ?? null,
    setItem: (k, v) => void mapa.set(k, v),
    removeItem: (k) => void mapa.delete(k),
  };
}

describe("hrefDeAdjunto", () => {
  it("prefiere la url externa frente a la ruta interna", () => {
    expect(hrefDeAdjunto({ url: "https://a.com/f.pdf", route: "/library?i=1" })).toBe("https://a.com/f.pdf");
  });

  it("usa la ruta interna cuando no hay url", () => {
    expect(hrefDeAdjunto({ route: "/library?i=1" })).toBe("/library?i=1");
  });

  it("devuelve null sin destino", () => {
    expect(hrefDeAdjunto({})).toBeNull();
    expect(hrefDeAdjunto({ url: "   " })).toBeNull();
  });
});

describe("stagePublishAttach / readPublishAttach", () => {
  it("guarda el ref en sessionStorage y devuelve una ruta con solo el flag", () => {
    const st = storageTest();
    const ruta = stagePublishAttach(st, { title: "Guía secreta", url: "https://a.com/f" });
    expect(ruta).toBe("/publish?ref=1");
    expect(JSON.parse(st.mapa.get("starseed.publish.attach.v1") ?? "")).toEqual({
      title: "Guía secreta",
      url: "https://a.com/f",
    });
  });

  it("no guarda ni falla cuando el ref no tiene destino", () => {
    const st = storageTest();
    expect(stagePublishAttach(st, { title: "solo título" })).toBe("/publish?ref=1");
    expect(st.mapa.size).toBe(0);
  });

  it("funciona sin storage (SSR): devuelve la ruta igualmente", () => {
    expect(stagePublishAttach(null, { url: "https://a.com" })).toBe("/publish?ref=1");
    expect(readPublishAttach(null)).toBeNull();
  });

  it("lee el adjunto una sola vez: lo limpia y no lo devuelve de nuevo", () => {
    const st = storageTest();
    stagePublishAttach(st, { title: "Nota", route: "/library?i=9" });
    expect(readPublishAttach(st)).toEqual({ title: "Nota", route: "/library?i=9" });
    expect(st.mapa.size).toBe(0);
    expect(readPublishAttach(st)).toBeNull();
  });

  it("devuelve null con JSON inválido o ref sin destino", () => {
    const st = storageTest();
    st.setItem("starseed.publish.attach.v1", "{no-es-json");
    expect(readPublishAttach(st)).toBeNull();
    st.setItem("starseed.publish.attach.v1", JSON.stringify({ title: "x" }));
    expect(readPublishAttach(st)).toBeNull();
  });

  it("limpiarAttachPublicacion borra la clave sin decodificar nada", () => {
    const st = storageTest();
    st.setItem("starseed.publish.attach.v1", "lo que sea");
    limpiarAttachPublicacion(st);
    expect(st.mapa.size).toBe(0);
  });
});

describe("colorDeCategoria", () => {
  it("da su par a cada categoría conocida y un par por defecto a la desconocida", () => {
    expect(colorDeCategoria("app")).toEqual(["#4C1D95", "#E0E7FF"]);
    expect(colorDeCategoria("cerebro")).toEqual(["#0C4A6E", "#E0F2FE"]);
    const [bg, fg] = colorDeCategoria("cualquiera");
    expect(bg.toUpperCase()).toBe("#1F2937");
    expect(fg.toUpperCase()).toBe("#E5E7EB");
  });
});

describe("inicialDeTitulo", () => {
  it("toma la primera letra segura en mayúscula", () => {
    expect(inicialDeTitulo("guía de ondas")).toBe("G");
    expect(inicialDeTitulo(" ¿qué? ")).toBe("Q");
    expect(inicialDeTitulo("")).toBe("✦");
    expect(inicialDeTitulo("***")).toBe("✦");
  });
});

describe("portadaLocal", () => {
  it("es un SVG de datos local: nada de placehold.co ni peticiones externas", () => {
    const uri = portadaLocal("app", "Guía secreta");
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    expect(uri).not.toContain("placehold.co");
    expect(uri).toContain("data:image/svg+xml");
  });

  it("determinista y con la inicial, nunca con el título entero", () => {
    const a = portadaLocal("tema", "Vida continua");
    const b = portadaLocal("tema", "Vida continua");
    expect(a).toBe(b);
    // El título completo nunca va codificado en la URL (fuga de datos).
    expect(decodeURIComponent(a).includes("Vida continua")).toBe(false);
  });

  it("escapa los # de los colores y usa la paleta de la categoría", () => {
    const uri = portadaLocal("app", "Tres");
    expect(uri).toContain("%234C1D95");
    expect(uri).toContain("%23E0E7FF");
    expect(uri).not.toMatch(/#\w/);
  });
});
