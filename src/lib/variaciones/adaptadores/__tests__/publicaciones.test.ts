import { describe, it, expect, beforeEach } from "vitest";
import {
  capturarParte,
  crearAdaptadorPublicaciones,
  fusionarParte,
  parteDeClave,
  registrarAdaptadoresPublicaciones,
  validarParcheEditor,
  type BorradorEditor,
  type DecoracionEditor,
  type DepsPublicaciones,
  type EstiloEditor,
  type FamiliaEditor,
  type PlantillaEditor,
} from "../publicaciones";
import { adaptadorDe, familiasRegistradas, __resetRegistros } from "../../familias";

const ESTILO: EstiloEditor = { fuente: "outfit", tamano: 18, color: "#7C5CFF", negrita: true };
const PLANTILLA: PlantillaEditor = { formato: "markdown", layout: "bloques", preset: "articulo", bloques: ["parrafo", "titulo"] };
const DECORACION: DecoracionEditor = {
  fondo: "cristal", animacionFondo: "aurora", radio: 24, bloques: [{ tipo: "texto", color: "#E9C46A", radius: "lg" }],
};

function depsFalsas(inicial: Partial<Record<FamiliaEditor, BorradorEditor>> = {}) {
  const estados: Record<FamiliaEditor, BorradorEditor> = { post: inicial.post ?? {}, mensaje: inicial.mensaje ?? {} };
  const escrituras: Array<{ familia: FamiliaEditor; borrador: BorradorEditor }> = [];
  const deps: DepsPublicaciones = {
    leer: (familia) => estados[familia],
    escribir: (familia, borrador) => { estados[familia] = borrador; escrituras.push({ familia, borrador }); },
  };
  return { deps, estados, escrituras };
}

beforeEach(() => __resetRegistros());

describe("adaptador de publicaciones y mensajes", () => {
  it("lee familia y parte de la clave y rechaza las demás", () => {
    expect(parteDeClave("post:compositor#estilo")).toEqual({ familia: "post", parte: "estilo" });
    expect(parteDeClave("mensaje:editor#decoracion")).toEqual({ familia: "mensaje", parte: "decoracion" });
    expect(parteDeClave("post:compositor")).toBeNull();
    expect(parteDeClave("widget:clima#estilo")).toBeNull();
    expect(parteDeClave("mensaje:editor#texto")).toBeNull();
  });

  it("captura solo la parte pedida y nunca el texto ni los destinos", () => {
    const borrador: BorradorEditor = { estilo: ESTILO, plantilla: PLANTILLA, decoracion: DECORACION };
    expect(capturarParte(borrador, "estilo")).toEqual({ parte: "estilo", datos: ESTILO });
    expect(capturarParte(borrador, "plantilla")).toEqual({ parte: "plantilla", datos: PLANTILLA });
    expect(capturarParte(borrador, "decoracion")).toEqual({ parte: "decoracion", datos: DECORACION });
    expect(JSON.stringify(capturarParte(borrador, "estilo"))).not.toMatch(/cuerpo|destinos|title/);
    expect(capturarParte({}, "estilo")).toBeNull();
  });

  it("funde una parte sin tocar las demás", () => {
    const actual: BorradorEditor = { estilo: ESTILO, plantilla: PLANTILLA };
    const nuevo = fusionarParte(actual, { parte: "decoracion", datos: DECORACION });
    expect(nuevo.decoracion).toEqual(DECORACION);
    expect(nuevo.estilo).toBe(ESTILO);
    expect(nuevo.plantilla).toBe(PLANTILLA);
    expect(actual.decoracion).toBeUndefined();
  });

  it("valida los campos del editor y rechaza lo ajeno, los secretos y los tamaños", () => {
    expect(validarParcheEditor({ parte: "estilo", datos: ESTILO }).ok).toBe(true);
    expect(validarParcheEditor({ parte: "decoracion", datos: DECORACION }).ok).toBe(true);
    expect(validarParcheEditor({ parte: "estilo", datos: { ...ESTILO, html: "<script>" } }).ok).toBe(false);
    expect(validarParcheEditor({ parte: "estilo", datos: { ...ESTILO, token: "sk-fake123def456ghi789" } }).ok).toBe(false);
    expect(validarParcheEditor({ parte: "estilo", datos: { ...ESTILO, tamano: 200 } }).ok).toBe(false);
    expect(validarParcheEditor({ parte: "plantilla", datos: { ...PLANTILLA, bloques: ["inventado"] } }).ok).toBe(false);
    expect(validarParcheEditor({ parte: "otra", datos: {} }).ok).toBe(false);
    expect(validarParcheEditor({ parte: "estilo", datos: ESTILO, extra: true }).ok).toBe(false);
  });

  it("aplica sobre el borrador actual y deshace exactamente", () => {
    const { deps, estados, escrituras } = depsFalsas({ mensaje: { estilo: { fuente: "inter" }, plantilla: PLANTILLA } });
    const adaptador = crearAdaptadorPublicaciones("mensaje", deps);
    expect(adaptador.capturar("mensaje:editor#plantilla")).toEqual({ parte: "plantilla", datos: PLANTILLA });
    expect(adaptador.capturar("post:compositor#plantilla")).toBeNull();
    const antes = estados.mensaje;
    const { deshacer } = adaptador.aplicar("mensaje:editor#estilo", { parte: "estilo", datos: ESTILO });
    expect(estados.mensaje.estilo).toEqual(ESTILO);
    expect(estados.mensaje.plantilla).toBe(PLANTILLA);
    expect(escrituras).toHaveLength(1);
    deshacer();
    expect(estados.mensaje).toBe(antes);
  });

  it("no aplica sin validar ni cuando la parte no coincide", () => {
    const { deps, escrituras } = depsFalsas({ post: { estilo: ESTILO } });
    const adaptador = crearAdaptadorPublicaciones("post", deps);
    adaptador.aplicar("post:compositor#estilo", { parte: "estilo", datos: { ...ESTILO, token: "sk-fake123def456ghi789" } });
    adaptador.aplicar("post:compositor#estilo", { parte: "plantilla", datos: PLANTILLA });
    adaptador.aplicar("post:compositor#estilo", { parte: "estilo", datos: { ...ESTILO, tamano: 200 } });
    adaptador.aplicar("post:compositor#estilo", { parte: "estilo", datos: ESTILO, extra: true } as unknown as { parte: "estilo"; datos: EstiloEditor });
    expect(escrituras).toHaveLength(0);
  });

  it("registra post y mensaje en el registro compartido", () => {
    registrarAdaptadoresPublicaciones(depsFalsas().deps);
    expect(familiasRegistradas().sort()).toEqual(["mensaje", "post"]);
    expect(adaptadorDe("post:compositor#estilo")?.familia).toBe("post");
    expect(adaptadorDe("mensaje:editor#decoracion")?.familia).toBe("mensaje");
  });
});
