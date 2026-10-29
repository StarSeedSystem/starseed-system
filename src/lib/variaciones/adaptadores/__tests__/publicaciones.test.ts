import { describe, it, expect, beforeEach } from "vitest";
import {
  crearAdaptadorPublicacion,
  parteDeClave,
  registrarAdaptadoresPublicaciones,
  validarVariacionBorrador,
  type BorradorPublicacion,
  type PuertoBorrador,
} from "../publicaciones";
import { adaptadorDe, familiasRegistradas, __resetRegistros } from "../../familias";

function puertoCon(inicial: BorradorPublicacion | null) {
  const estado = { actual: inicial };
  const escritos: BorradorPublicacion[] = [];
  const puerto: PuertoBorrador = {
    leer: () => estado.actual,
    escribir: (_familia, borrador) => {
      estado.actual = borrador;
      escritos.push(borrador);
    },
  };
  return { puerto, estado, escritos };
}

const ESTILO = {
  fuente: "outfit" as const,
  tamano: 18,
  color: "#7C5CFF",
  fondo: "aurora",
  animacionFondo: "aurora" as const,
};

beforeEach(() => {
  __resetRegistros();
});
describe("captura de estilo y plantilla", () => {
  it("captura el estilo del editor sin texto ni destinatarios", () => {
    const { puerto } = puertoCon({ estilo: ESTILO, bloques: [{ tipo: "parrafo", texto: "privado" }], destinatarios: ["ana"] });
    const capturado = crearAdaptadorPublicacion("mensaje", puerto).capturar("mensaje:editor#estilo");
    expect(capturado).toEqual({ parte: "estilo", estilo: ESTILO });
    const crudo = JSON.stringify(capturado);
    expect(crudo).not.toContain("privado");
    expect(crudo).not.toContain("ana");
  });
  it("captura la plantilla como tipos y alineación, jamás el texto", () => {
    const { puerto } = puertoCon({ bloques: [{ tipo: "portada" }, { tipo: "texto", alineacion: "centro", texto: "secreto" }] });
    const capturado = crearAdaptadorPublicacion("post", puerto).capturar("post:abc#plantilla");
    expect(capturado).toEqual({ parte: "plantilla", bloques: [{ tipo: "portada" }, { tipo: "texto", alineacion: "centro" }] });
    expect(JSON.stringify(capturado)).not.toContain("secreto");
  });
  it("la decoración solo lleva fondo, marco y animación", () => {
    const { puerto } = puertoCon({ estilo: { ...ESTILO, fuente: "mono", tamano: 30, negrita: true, colorMarco: "#10B981" } });
    const capturado = crearAdaptadorPublicacion("mensaje", puerto).capturar("mensaje:editor#decoracion");
    expect(capturado).toEqual({ parte: "decoracion", decoracion: { fondo: "aurora", animacionFondo: "aurora", colorMarco: "#10B981" } });
  });
  it("no captura sin borrador, con familia ajena ni con parte desconocida", () => {
    const vacio = puertoCon({ estilo: ESTILO });
    expect(crearAdaptadorPublicacion("mensaje", vacio.puerto).capturar("post:abc#estilo")).toBeNull();
    expect(crearAdaptadorPublicacion("post", vacio.puerto).capturar("post:abc")).toBeNull();
    expect(crearAdaptadorPublicacion("post", vacio.puerto).capturar("post:abc#otra")).toBeNull();
    expect(crearAdaptadorPublicacion("post", puertoCon(null).puerto).capturar("post:abc#estilo")).toBeNull();
    expect(parteDeClave("post:abc#plantilla")).toBe("plantilla");
    expect(parteDeClave("post:abc#otra")).toBeNull();
  });
});
describe("validación de la variación", () => {
  it("acepta estilos, plantillas y decoraciones bien formadas", () => {
    expect(validarVariacionBorrador({ parte: "estilo", estilo: ESTILO }).ok).toBe(true);
    expect(validarVariacionBorrador({ parte: "plantilla", bloques: [{ tipo: "texto", alineacion: "derecha" }] }).ok).toBe(true);
    expect(validarVariacionBorrador({ parte: "decoracion", decoracion: { fondo: "cosmos", grosorMarco: 3 } }).ok).toBe(true);
  });
  it("rechaza secretos, código y partes o bloques ajenos", () => {
    expect(validarVariacionBorrador({ parte: "estilo", estilo: { ...ESTILO, token: "sk-falso1234567890" } }).ok).toBe(false);
    expect(validarVariacionBorrador({ parte: "estilo", estilo: ESTILO, html: "<script>" }).ok).toBe(false);
    expect(validarVariacionBorrador({ parte: "fondo", estilo: ESTILO }).ok).toBe(false);
    expect(validarVariacionBorrador({ parte: "plantilla", bloques: [{ tipo: "TIPO INVENTADO" }] }).ok).toBe(false);
    expect(validarVariacionBorrador({ parte: "decoracion", decoracion: { tamano: 20 } }).ok).toBe(false);
  });
});
describe("aplicar sobre el borrador con deshacer", () => {
  it("fusiona el estilo conservando el texto y restaura al deshacer", () => {
    const { puerto, estado, escritos } = puertoCon({ estilo: { fuente: "inter" }, bloques: [{ tipo: "parrafo", texto: "hola" }] });
    const adaptador = crearAdaptadorPublicacion("mensaje", puerto);
    const { deshacer } = adaptador.aplicar("mensaje:editor#estilo", { parte: "estilo", estilo: { tamano: 22, color: "#10B981" } });
    expect(estado.actual?.estilo).toEqual({ fuente: "inter", tamano: 22, color: "#10B981" });
    expect(estado.actual?.bloques?.[0]).toEqual({ tipo: "parrafo", texto: "hola" });
    expect(escritos).toHaveLength(1);
    deshacer();
    expect(estado.actual?.estilo).toEqual({ fuente: "inter" });
    expect(escritos).toHaveLength(2);
  });

  it("la plantilla sustituye la estructura sin tocar el estilo ni el resto", () => {
    const { puerto, estado } = puertoCon({ estilo: { fuente: "mono" }, bloques: [{ tipo: "texto", texto: "hola" }] });
    const adaptador = crearAdaptadorPublicacion("post", puerto);
    const { deshacer } = adaptador.aplicar("post:abc#plantilla", { parte: "plantilla", bloques: [{ tipo: "portada" }] });
    expect(estado.actual?.bloques).toEqual([{ tipo: "portada" }]);
    expect(estado.actual?.estilo).toEqual({ fuente: "mono" });
    deshacer();
    expect(estado.actual?.bloques).toEqual([{ tipo: "texto", texto: "hola" }]);
  });

  it("no escribe si la clave o la parte no coinciden", () => {
    const { puerto, escritos } = puertoCon({ estilo: { fuente: "inter" } });
    const adaptador = crearAdaptadorPublicacion("post", puerto);
    adaptador.aplicar("post:abc#decoracion", { parte: "estilo", estilo: { tamano: 22 } }).deshacer();
    adaptador.aplicar("mensaje:editor#estilo", { parte: "estilo", estilo: { tamano: 22 } }).deshacer();
    expect(escritos).toHaveLength(0);
  });
});

describe("registro de familias", () => {
  it("registra post y mensaje en el registro compartido", () => {
    registrarAdaptadoresPublicaciones(puertoCon({ estilo: ESTILO }).puerto);
    expect(familiasRegistradas()).toEqual(["post", "mensaje"]);
    expect(adaptadorDe("post:abc#estilo")?.familia).toBe("post");
    expect(adaptadorDe("mensaje:editor#decoracion")?.familia).toBe("mensaje");
  });
});
