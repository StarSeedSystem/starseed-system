// @vitest-environment jsdom
/**
 * Pruebas de la montura única (IMG1011J): las funciones puras que enchufan la herramienta
 * `generar_imagen` y la galería del proveedor «neuronas» con la tarjeta de opciones.
 * Sin red y sin GPU: entradas literales → salidas tal cual.
 */
import { describe, expect, it } from "vitest";
import { MODELOS_IMAGEN } from "@/lib/imagenes/modelos";
import { motorDeGaleria, opcionesDesdeGaleria, peticionDesdeHerramienta } from "../index";

const SDXL = MODELOS_IMAGEN.find((m) => m.id === "sdxl");

const GALERIA = {
  ok: true,
  opciones: [
    {
      url: "https://img.ejemplo/uno.png",
      modelo: SDXL ? SDXL.nombre : "SDXL 1.0",
      capa: "neurona" as const,
      neurona: "A1",
      semilla: 3,
      licencia: SDXL ? SDXL.licencia : "CreativeML OpenRAIL++-M",
      uso: "libre" as const,
      atribucion: `Generada con ${SDXL ? SDXL.nombre : "SDXL 1.0"} en tu neurona «A1».`,
      segundos: 5.2,
    },
    {
      modelo: "modelo-desconocido",
      capa: "navegador" as const,
      semilla: 9,
      licencia: "por decidir",
      uso: "libre" as const,
      atribucion: "",
      segundos: 0,
    },
  ],
  descartes: ["La pestaña no tiene el generador WebGPU registrado."],
};

describe("peticionDesdeHerramienta", () => {
  it("devuelve null sin prompt o con una entrada que no es objeto", () => {
    expect(peticionDesdeHerramienta(null)).toBeNull();
    expect(peticionDesdeHerramienta({ opciones: 4 })).toBeNull();
    expect(peticionDesdeHerramienta({ prompt: "   " })).toBeNull();
    expect(peticionDesdeHerramienta("un bosque")).toBeNull();
  });

  it("completa lo que falta con los valores por defecto de la tarjeta", () => {
    const p = peticionDesdeHerramienta({ prompt: "Un bosque de cristal" });
    expect(p).toBeTruthy();
    expect(p?.opciones).toBe(4);
    expect(p?.prioridad).toBe("calidad");
    expect(p?.comercial).toBe(false);
    expect(p?.conReferencia).toBe(false);
    expect(p?.prompt).toBe("Un bosque de cristal");
  });

  it("recorta las opciones a la franja 1–8 y suelta las capacidades que no existen", () => {
    const cero = peticionDesdeHerramienta({ prompt: "x", opciones: 0 });
    expect(cero?.opciones).toBe(1);
    const nueve = peticionDesdeHerramienta({ prompt: "x", opciones: 9 });
    expect(nueve?.opciones).toBe(8);
    const conRuido = peticionDesdeHerramienta({
      prompt: "x", opciones: 3.7,
      necesita: ["texto-a-imagen", "capacidad-inventada"],
    });
    expect(conRuido?.opciones).toBe(3);
    expect(conRuido?.necesita).toEqual(["texto-a-imagen"]);
  });

  it("marca la referencia y el uso comercial tal cual entra", () => {
    const conTodo = peticionDesdeHerramienta({
      prompt: "x", referencia: "https://f.ejemplo/ref.png", comercial: true,
    });
    expect(conTodo?.conReferencia).toBe(true);
    expect(conTodo?.comercial).toBe(true);
    const comercialQueNoEsBooleano = peticionDesdeHerramienta({ prompt: "x", comercial: "sí" });
    expect(comercialQueNoEsBooleano?.comercial).toBe(false);
  });
});

describe("opciones y motor de la galería", () => {
  it("deduce el motor por la capa que ya se sabe", () => {
    expect(motorDeGaleria("web-gratis")).toBe("pollinations");
    expect(motorDeGaleria("espacio")).toBe("espacio-hf");
    expect(motorDeGaleria("dispositivo")).toBe("sdcpp");
    expect(motorDeGaleria("malla")).toBe("sdcpp");
  });

  it("cambia la galería a opciones de tarjeta con su modelo REAl y su atribución como motivo", () => {
    const opciones = opcionesDesdeGaleria(GALERIA, "Un bosque de cristal");
    expect(opciones.length).toBe(1); // la del modelo desconocido y sin archivo se suelta
    const o = opciones[0];
    expect(o.modelo?.id).toBe("sdxl");
    expect(o.capa).toBe("neurona");
    expect(o.neuronaId).toBe("A1");
    expect(o.url).toBe("https://img.ejemplo/uno.png");
    expect(o.prompt).toBe("Un bosque de cristal");
    expect(o.motivo.startsWith("Generada con SDXL 1.0")).toBe(true);
    expect(o.modelo?.licencia).toBe(SDXL?.licencia);
  });

  it("devuelve vacía con una galería que no terminó o que no trae opciones", () => {
    expect(opcionesDesdeGaleria({ ...GALERIA, ok: false }, "x")).toEqual([]);
    expect(opcionesDesdeGaleria({ ok: true, opciones: [], descartes: [] }, "x")).toEqual([]);
  });

  it("conserva una opción con modelo REAL sin URL (se puede generar al elegir)", () => {
    const opciones = opcionesDesdeGaleria(
      { ok: true, descartes: [], opciones: [{ ...GALERIA.opciones[0], url: undefined }] },
      "x",
    );
    expect(opciones.length).toBe(1);
    expect(opciones[0].url).toBeUndefined();
    expect(opciones[0].modelo?.id).toBe("sdxl");
  });
});
