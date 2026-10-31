// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { SKILL_CAPABILITIES } from "../../skills";
import { contarPalabras } from "../diagramas";
import { buscarEnOssu } from "@/lib/education/ossu";
import {
  ATRIBUCION_EDUCACION_INFORMATICA,
  HABILIDAD_EDUCACION_INFORMATICA,
  MAX_PALABRAS_RESUMEN,
  MAX_PALABRAS_TARJETA,
  comoCapacidadEducacion,
  sugerirRuta,
} from "../educacion-informatica";

const h = HABILIDAD_EDUCACION_INFORMATICA;

describe("HABILIDAD_EDUCACION_INFORMATICA", () => {
  it("respeta los límites de palabras de las capas pequeñas (60 y 120)", () => {
    expect(MAX_PALABRAS_TARJETA).toBe(60);
    expect(MAX_PALABRAS_RESUMEN).toBe(120);
    const tarjeta = contarPalabras(h.tarjeta);
    const resumen = contarPalabras(h.resumen);
    expect(tarjeta).toBeGreaterThan(30);
    expect(tarjeta).toBeLessThanOrEqual(MAX_PALABRAS_TARJETA);
    expect(resumen).toBeGreaterThan(tarjeta);
    expect(resumen).toBeLessThanOrEqual(MAX_PALABRAS_RESUMEN);
  });

  it("dice cuándo aplica en una sola frase", () => {
    expect(h.cuando.startsWith("Cuando ")).toBe(true);
    expect(h.cuando.endsWith(".")).toBe(true);
    expect(h.cuando.slice(0, -1)).not.toMatch(/[.!?]\s/);
  });

  it("apunta al dato de OSSU y declara su licencia y autoría", () => {
    expect(h.id).toBe("educacion-informatica");
    expect(h.rutaCompleta).toBe("config/educacion-ossu.json");
    expect(h.rutaCompleta.startsWith("/")).toBe(false);
    expect(h.licencia).toBe("MIT");
    expect(h.autor).toBe("OSSU");
  });

  it("la atribución cita MIT y a OSSU", () => {
    expect(ATRIBUCION_EDUCACION_INFORMATICA).toContain("MIT");
    expect(ATRIBUCION_EDUCACION_INFORMATICA).toContain("OSSU");
    expect(ATRIBUCION_EDUCACION_INFORMATICA).toContain("ossu/computer-science");
  });

  it("ningún texto lleva rutas absolutas ni direcciones de máquina", () => {
    const textos = [h.cuando, h.tarjeta, h.resumen, ATRIBUCION_EDUCACION_INFORMATICA];
    for (const texto of textos) {
      expect(texto).not.toMatch(/\/Users\/|\/home\/|https?:\/\/|\b\d{1,3}(\.\d{1,3}){3}\b/);
    }
  });
});

describe("sugerirRuta", () => {
  it("encuentra cursos de bases de datos con nombre, anfitrión y enlace", () => {
    const ruta = sugerirRuta("bases de datos");
    expect(ruta.length).toBeGreaterThan(0);
    expect(ruta.length).toBeLessThanOrEqual(3);
    for (const curso of ruta) {
      expect(Object.keys(curso).sort()).toEqual(["anfitrion", "enlace", "nombre"]);
      expect(curso.nombre.length).toBeGreaterThan(0);
      expect(curso.anfitrion.length).toBeGreaterThan(0);
      expect(curso.enlace.startsWith("https://")).toBe(true);
    }
    expect(ruta.some((curso) => /database/i.test(curso.nombre))).toBe(true);
  });

  it("respeta el máximo pedido y no inventa cursos sin coincidencia", () => {
    expect(sugerirRuta("bases de datos", 1)).toHaveLength(1);
    expect(sugerirRuta("bases de datos", 0)).toEqual([]);
    expect(sugerirRuta("xyz-no-existe")).toEqual([]);
  });

  it("ignora acentos y mayúsculas", () => {
    const normal = sugerirRuta("bases de datos").map((c) => c.nombre);
    expect(sugerirRuta("BASES DE DATOS").map((c) => c.nombre)).toEqual(normal);
    expect(sugerirRuta("PROGRAMACIÓN").length).toBeGreaterThan(0);
  });

  it("sale del buscador del currículo y mantiene su orden (de lo básico a lo avanzado)", () => {
    const ruta = sugerirRuta("bases de datos");
    const ordenes = buscarEnOssu("bases de datos", 3).map((c) => c.orden);
    expect(ruta.length).toBe(ordenes.length);
    const copia = [...ordenes]; copia.sort((a, b) => a - b);
    expect(ordenes).toEqual(copia);
  });

  it("devuelve vacío con máximos raros y consultas vacías, sin lanzar", () => {
    expect(sugerirRuta("bases de datos", -1)).toEqual([]);
    expect(sugerirRuta("bases de datos", -2.7)).toEqual([]);
    expect(sugerirRuta("", 3)).toEqual([]);
  });
});

describe("comoCapacidadEducacion", () => {
  it("adapta a la forma del registro con el tamaño pedido", () => {
    const tarjeta = comoCapacidadEducacion(h, "tarjeta");
    expect(tarjeta).toEqual({
      id: "educacion-informatica",
      label: h.nombre,
      systemPrompt: `${h.tarjeta} (OSSU, MIT)`,
    });
    const resumen = comoCapacidadEducacion(h, "resumen");
    expect(resumen.systemPrompt).toBe(`${h.resumen} (OSSU, MIT)`);
  });
});

describe("registro en SKILL_CAPABILITIES", () => {
  it("está registrada una sola vez, encendida por defecto y con su systemPrompt", () => {
    const caps = SKILL_CAPABILITIES.filter((c) => c.id === "educacion-informatica");
    expect(caps).toHaveLength(1);
    expect(caps[0].defaultOn).toBe(true);
    expect(caps[0].skillIds).toEqual(["educacion-informatica"]);
    expect(caps[0].routing).toEqual({});
    expect(caps[0].systemPrompt).toContain(h.resumen);
    expect(caps[0].systemPrompt).toContain(h.rutaCompleta);
    expect(caps[0].systemPrompt).toContain(ATRIBUCION_EDUCACION_INFORMATICA);
  });
});
