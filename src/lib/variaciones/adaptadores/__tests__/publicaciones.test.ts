// Pruebas puras del adaptador de publicaciones y mensajes (Ola 1019V, tarea H):
// solo estilo, plantilla y decoración; nunca texto, URLs ni datos privados.
import { describe, it, expect, beforeEach } from "vitest";
import {
  crearAdaptadorPublicaciones, idDePublicacion, registrarAdaptadoresPublicaciones,
  validarDecoracion, validarEstilo, validarPlantilla, validarVariacionPublicacion,
  type BorradorCompositor, type PuertoBorrador,
} from "../publicaciones";
import { familiasRegistradas, __resetRegistros } from "../../familias";

const motivos = (r: { ok: boolean; motivos?: string[] }) => (r.ok ? "" : (r.motivos ?? []).join(" · "));

function puertoCon(parcial: Partial<BorradorCompositor>): { puerto: PuertoBorrador; borrador(): BorradorCompositor } {
  let b: BorradorCompositor = { estilo: null, plantilla: null, decoracion: null, ...parcial };
  return {
    puerto: { leer: () => b, escribir: (p) => { b = { ...b, ...p }; } },
    borrador: () => b,
  };
}

const CAJA = { tipo: "forma" as const, x: 10, y: 20, w: 100, h: 60, z: 1 };

beforeEach(() => {
  __resetRegistros();
});

describe("publicaciones · clave y partes", () => {
  it("resuelve post:<id>#parte y mensaje:<id>#parte, y nada más", () => {
    expect(idDePublicacion("post:c9#estilo")).toEqual({ familia: "post", parte: "estilo" });
    expect(idDePublicacion("mensaje:editor#decoracion")).toEqual({ familia: "mensaje", parte: "decoracion" });
    expect(idDePublicacion("post:borrador#plantilla")).toEqual({ familia: "post", parte: "plantilla" });
    expect(idDePublicacion("mensaje:editor")).toBeNull();
    expect(idDePublicacion("post:c9#texto")).toBeNull();
    expect(idDePublicacion("menu:trinity-fab#estilo")).toBeNull();
    expect(idDePublicacion("post:c9#estilo#plantilla")).toBeNull();
  });
});

describe("publicaciones · validación por parte", () => {
  it("estilo: vocabulario del editor y sin texto ni destinatarios", () => {
    expect(validarEstilo({ fuente: "inter", tamano: 24, fondo: "zenith", negrita: true }).ok).toBe(true);
    expect(validarEstilo({}).ok).toBe(true);
    expect(motivos(validarEstilo({ texto: "Hola mundo" }))).toContain("no es un campo");
    expect(motivos(validarEstilo({ destinatarios: ["yo"] }))).toContain("no es un campo");
    expect(motivos(validarEstilo({ fuente: "comic-sans" }))).toContain("vocabulario");
    expect(motivos(validarEstilo({ tamano: 80 }))).toContain("rango");
    expect(motivos(validarEstilo({ color: "#39FF1" }))).toContain("hex");
    expect(motivos(validarEstilo("negrita"))).toContain("objeto");
  });

  it("plantilla: cajas de composición sin contenido ni datos privados", () => {
    expect(validarPlantilla({ ancho: 800, alto: 600, elementos: [{ ...CAJA, radio: 12 }, { tipo: "texto", x: 0, y: 0, w: 200, h: 40, z: 2 }] }).ok).toBe(true);
    expect(motivos(validarPlantilla({ ancho: 800, alto: null }))).toContain("rango");
    expect(motivos(validarPlantilla({ ancho: 800, alto: 600, elementos: [{ ...CAJA, url: "https://x.test/a.png" }] }))).toContain("contenido o datos privados");
    expect(motivos(validarPlantilla({ ancho: 800, alto: 600, elementos: [{ ...CAJA, nombre: "mendes.jpg" }] }))).toContain("datos privados");
    expect(motivos(validarPlantilla({ ancho: 800, alto: 600, elementos: [{ ...CAJA, w: 5000 }] }))).toContain("fuera del lienzo");
    expect(motivos(validarPlantilla({ ancho: 800, alto: 600, elementos: [] }))).toBe("");
  });

  it("decoración: fondo de burbuja o hex, marco y animación del OS", () => {
    expect(validarDecoracion({ fondo: "cosmos", colorMarco: "#7C5CFF", grosorMarco: 3 }).ok).toBe(true);
    expect(validarDecoracion({}).ok).toBe(true);
    expect(motivos(validarDecoracion({ fondo: "marmol" }))).toContain("fondo de burbuja");
    expect(motivos(validarDecoracion({ grosorMarco: 10 }))).toContain("rango");
    expect(motivos(validarDecoracion({ texto: "brilla" }))).toContain("no es un campo");
  });
});

describe("publicaciones · variación completa", () => {
  it("declara una parte, solo esa", () => {
    expect(validarVariacionPublicacion({ parte: "estilo", estilo: { fuente: "outfit" } }).ok).toBe(true);
    expect(motivos(validarVariacionPublicacion({ parte: "estilo", decoracion: { fondo: "cinza" } }))).toContain("no lleva");
    expect(motivos(validarVariacionPublicacion({ parte: "plantilla" }))).toContain("no lleva su valor");
    expect(motivos(validarVariacionPublicacion({ parte: "color" }))).toContain("parte válida");
    expect(motivos(validarVariacionPublicacion("estilo"))).toContain("declarar");
  });

  it("captura solo la parte del borrador, sin texto ni destinatarios", () => {
    const { puerto } = puertoCon({ estilo: { fuente: "serif", tamano: 18 }, decoracion: { fondo: "violeta" } });
    const post = crearAdaptadorPublicaciones("post", puerto);
    expect(post.capturar("post:borrador#estilo")).toEqual({ parte: "estilo", estilo: { fuente: "serif", tamano: 18 } });
    expect(post.capturar("post:borrador#plantilla")).toBeNull();
    expect(post.capturar("mensaje:editor#decoracion")).toEqual({ parte: "decoracion", decoracion: { fondo: "violeta" } });
    expect(post.capturar("post:borrador")).toBeNull();
    expect(post.capturar("dock:genesis#estilo")).toBeNull();
  });

  it("aplica sobre el borrador y deshacer restaura el estado previo", () => {
    const { puerto, borrador } = puertoCon({});
    const mensaje = crearAdaptadorPublicaciones("mensaje", puerto);
    const aplicado = mensaje.aplicar("mensaje:editor#decoracion", { parte: "decoracion", decoracion: { fondo: "cristal", grosorMarco: 2 } });
    expect(borrador().decoracion).toEqual({ fondo: "cristal", grosorMarco: 2 });
    aplicado.deshacer();
    expect(borrador().decoracion).toBeNull();
    aplicado.deshacer();
    expect(borrador().decoracion).toBeNull();
  });

  it("aplicar reemplaza lo que ya estaba puesto en la parte", () => {
    const { puerto, borrador } = puertoCon({ estilo: { fuente: "mono" } });
    const post = crearAdaptadorPublicaciones("post", puerto);
    expect(post.capturar("post:borrador#estilo")).toEqual({ parte: "estilo", estilo: { fuente: "mono" } });
    post.aplicar("post:borrador#estilo", { parte: "estilo", estilo: { fuente: "titular", alineacion: "centro" } });
    expect(borrador().estilo).toEqual({ fuente: "titular", alineacion: "centro" });
  });

  it("nada se ejecuta sin validar", () => {
    const { puerto, borrador } = puertoCon({});
    const mensaje = crearAdaptadorPublicaciones("mensaje", puerto);
    expect(() => mensaje.aplicar("mensaje:editor#estilo", { parte: "estilo", estilo: { fuente: "no-es" } } as never)).toThrow("rechazada");
    expect(() => mensaje.aplicar("mensaje:editor#estilo", { parte: "color" } as never)).toThrow("parte válida");
    expect(() => mensaje.aplicar("mensaje:editor#estilo", 42 as never)).toThrow("declarar");
    expect(borrador().estilo).toBeNull();
  });
});

describe("publicaciones · registro de familias", () => {
  it("registra post y mensaje para el clic derecho", () => {
    registrarAdaptadoresPublicaciones({ post: puertoCon({}).puerto, mensaje: puertoCon({}).puerto });
    expect(familiasRegistradas().sort()).toEqual(["mensaje", "post"]);
  });
});
