import { describe, it, expect, beforeEach } from "vitest";
import {
  crearAdaptadorPublicaciones,
  parteDeClave,
  registrarAdaptadoresPublicaciones,
  validarDecoracionPublicacion,
  validarEstiloPublicacion,
  validarPlantillaPublicacion,
  type BorradorPublicacion,
  type PuertoBorrador,
} from "../publicaciones";
import { adaptadorDe, familiasRegistradas, __resetRegistros } from "../../familias";

type BorradorConPrivados = BorradorPublicacion & { texto?: string; destinatarios?: string[] };

function puertoFalso(inicial: Partial<Record<"post" | "mensaje", BorradorConPrivados>> = {}) {
  const borradores: Record<string, BorradorConPrivados> = { ...inicial };
  const escritos: Array<{ familia: string; parte: string; valor: unknown }> = [];
  const puerto: PuertoBorrador = {
    leer: (familia) => borradores[familia] ?? null,
    escribirParte: (familia, parte, valor) => {
      const actual = borradores[familia] ?? {};
      borradores[familia] = { ...actual, [parte]: valor };
      escritos.push({ familia, parte, valor });
    },
  };
  return { puerto, borradores, escritos };
}

beforeEach(() => __resetRegistros());

describe("adaptador de publicaciones y mensajes", () => {
  it("captura solo el estilo, nunca el texto ni los destinatarios", () => {
    const { puerto } = puertoFalso({
      post: { estilo: { fuente: "inter", color: "#ffffff", tamano: 18 }, texto: "hola", destinatarios: ["ana"] },
    });
    const capturado = crearAdaptadorPublicaciones("post", puerto).capturar("post:abc#estilo");
    expect(capturado).toEqual({ fuente: "inter", color: "#ffffff", tamano: 18 });
    expect(JSON.stringify(capturado)).not.toContain("hola");
    expect(JSON.stringify(capturado)).not.toContain("ana");
  });

  it("captura plantilla y decoración sin contenido", () => {
    const plantilla: NonNullable<BorradorPublicacion["plantilla"]> = {
      titulo: { fuente: "outfit", tamano: 24 },
      parrafo: { color: "#ff0000" },
    };
    const decoracion: NonNullable<BorradorPublicacion["decoracion"]> = { fondo: "violeta", grosorMarco: 2 };
    const { puerto } = puertoFalso({ mensaje: { plantilla, decoracion } });
    const adaptador = crearAdaptadorPublicaciones("mensaje", puerto);
    expect(adaptador.capturar("mensaje:editor#plantilla")).toEqual(plantilla);
    expect(adaptador.capturar("mensaje:editor#decoracion")).toEqual(decoracion);
  });

  it("exige familia y parte válidas en la clave", () => {
    const { puerto } = puertoFalso({ post: { estilo: { color: "#fff" } } });
    const adaptador = crearAdaptadorPublicaciones("post", puerto);
    expect(adaptador.capturar("post:abc")).toBeNull();
    expect(adaptador.capturar("post:abc#otra")).toBeNull();
    expect(adaptador.capturar("tema:abc#estilo")).toBeNull();
    expect(adaptador.capturar("post:abc#estilo")).toEqual({ color: "#fff" });
    expect(parteDeClave("mensaje:editor#decoracion")).toEqual({ familia: "mensaje", parte: "decoracion" });
  });

  it("valida y descarta texto y campos ajenos", () => {
    expect(validarEstiloPublicacion({ color: "#123456", texto: "secreto", destinatarios: ["x"] })).toEqual({ color: "#123456" });
    expect(validarEstiloPublicacion({ texto: "solo texto" })).toBeNull();
    expect(validarPlantillaPublicacion({ titulo: { tamano: 20 }, parrafo: { texto: "no" } })).toEqual({ titulo: { tamano: 20 } });
    expect(validarDecoracionPublicacion({ fondo: "violeta", animacionFondo: "aurora" })).toEqual({ fondo: "violeta", animacionFondo: "aurora" });
  });

  it("rechaza secretos y claves privadas en el payload", () => {
    expect(validarEstiloPublicacion({ color: "#123456", token: "sk-fake123def456ghi789" })).toBeNull();
    expect(validarDecoracionPublicacion({ fondo: "violeta", password: "x" })).toBeNull();
    expect(validarPlantillaPublicacion({ titulo: { color: "#123456" }, apikey: "secreta" })).toBeNull();
  });
});
