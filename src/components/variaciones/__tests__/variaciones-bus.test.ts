import { describe, it, expect } from "vitest";
import {
  abrirVariaciones, apilarVariaciones, cerrarVariacion, sanearDetalle, suscribirVariaciones, tituloVariaciones,
  MAX_VENTANAS_VARIACIONES, VARIACIONES_ABRIR_EVENTO, type DetalleVariaciones, type EntradaVariaciones,
} from "../variaciones-bus";

// Sin DOM: el bus recibe un EventTarget inyectado, como haría con `window`.
function bus() {
  const destino = new EventTarget();
  const recibidos: DetalleVariaciones[] = [];
  const baja = suscribirVariaciones((d) => recibidos.push(d), destino);
  return { destino, recibidos, baja };
}

describe("abrirVariaciones y suscribirVariaciones", () => {
  it("entrega al suscriptor la clave y las opciones saneadas", () => {
    const { destino, recibidos } = bus();
    expect(abrirVariaciones("widget:clima", { nombre: "  Clima ", pestana: "notas", buscar: " cristal ", publicar: true }, destino)).toBe(true);
    expect(recibidos).toEqual([{ clave: "widget:clima", opciones: { nombre: "Clima", pestana: "notas", buscar: "cristal", publicar: true } }]);
  });

  it("una clave inválida no emite nada", () => {
    const { destino, recibidos } = bus();
    for (const clave of ["", "widget", "Widget:Clima", "widget:clima con espacios", "post:1#"]) {
      expect(abrirVariaciones(clave, {}, destino)).toBe(false);
    }
    expect(recibidos).toEqual([]);
  });

  it("descarta opciones desconocidas o mal tipadas, también en eventos que despacha cualquiera", () => {
    const { destino, recibidos } = bus();
    const extrano = { pestana: "ajustes", nombre: 42, publicar: "sí", buscar: "   ", secreto: "x" };
    destino.dispatchEvent(new CustomEvent(VARIACIONES_ABRIR_EVENTO, { detail: { clave: "fondo:aurora", opciones: extrano } }));
    destino.dispatchEvent(new CustomEvent(VARIACIONES_ABRIR_EVENTO, { detail: { clave: "javascript:alert(1)" } }));
    destino.dispatchEvent(new CustomEvent(VARIACIONES_ABRIR_EVENTO, { detail: null }));
    destino.dispatchEvent(new Event(VARIACIONES_ABRIR_EVENTO));
    expect(recibidos).toEqual([{ clave: "fondo:aurora", opciones: {} }]);
  });

  it("recorta los textos largos", () => {
    expect(sanearDetalle("app:notas", { nombre: "n".repeat(500) })?.opciones.nombre).toHaveLength(120);
  });

  it("tras la baja ya no recibe", () => {
    const { destino, recibidos, baja } = bus();
    baja();
    abrirVariaciones("app:notas", {}, destino);
    expect(recibidos).toEqual([]);
  });

  it("es seguro en servidor: sin window no emite ni suscribe, y no lanza", () => {
    expect(typeof window).toBe("undefined");
    expect(abrirVariaciones("widget:clima")).toBe(false);
    const baja = suscribirVariaciones(() => {});
    expect(() => baja()).not.toThrow();
  });
});

describe("apilarVariaciones y cerrarVariacion", () => {
  const d = (clave: string, opciones = {}): DetalleVariaciones => ({ clave, opciones });

  it("apila en orden y trae al frente la de la misma clave sin duplicarla", () => {
    let pila: EntradaVariaciones[] = [];
    pila = apilarVariaciones(pila, d("widget:clima"));
    pila = apilarVariaciones(pila, d("fondo:aurora"));
    pila = apilarVariaciones(pila, d("widget:clima", { pestana: "repos" }));
    expect(pila).toEqual([
      { clave: "fondo:aurora", opciones: {}, vez: 1 },
      { clave: "widget:clima", opciones: { pestana: "repos" }, vez: 2 },
    ]);
  });

  it("no pasa del tope: se van las de más abajo", () => {
    let pila: EntradaVariaciones[] = [];
    for (let i = 0; i < MAX_VENTANAS_VARIACIONES + 3; i++) pila = apilarVariaciones(pila, d(`app:a${i}`));
    expect(pila).toHaveLength(MAX_VENTANAS_VARIACIONES);
    expect(pila[0].clave).toBe("app:a3");
    expect(pila.at(-1)?.clave).toBe(`app:a${MAX_VENTANAS_VARIACIONES + 2}`);
  });

  it("cerrar quita solo esa clave y no muta la pila", () => {
    const pila = apilarVariaciones(apilarVariaciones([], d("widget:clima")), d("app:notas"));
    expect(cerrarVariacion(pila, "widget:clima").map((e) => e.clave)).toEqual(["app:notas"]);
    expect(pila).toHaveLength(2);
  });
});

describe("tituloVariaciones", () => {
  it("usa el nombre si lo hay; si no, lo deduce de la clave, con su familia en el subtítulo", () => {
    expect(tituloVariaciones({ clave: "widget:clima", opciones: { nombre: "El clima" } })).toEqual({ titulo: "El clima", subtitulo: "Variaciones públicas · widget" });
    expect(tituloVariaciones({ clave: "ajuste:apariencia.radio", opciones: {} }).titulo).toBe("Apariencia radio");
    expect(tituloVariaciones({ clave: "post:abc-1#estilo", opciones: {} })).toEqual({ titulo: "Abc 1 · estilo", subtitulo: "Variaciones públicas · post" });
  });
});
