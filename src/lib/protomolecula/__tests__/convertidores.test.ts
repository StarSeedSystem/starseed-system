import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizarFormato,
  registrarConversor,
  limpiarConversores,
  listarConversores,
  rutaDeConversion,
  ejecutarRuta,
  explicarSinRuta,
  type ConversorDef,
} from "../convertidores";

function conv(
  de: string,
  a: string,
  costo: number,
  nombre: string,
  extra?: Partial<ConversorDef>,
): ConversorDef {
  return { de, a, via: "js", costo, nombre, ...extra };
}

beforeEach(() => {
  limpiarConversores();
});

describe("normalizarFormato", () => {
  it("quita el punto y baja a minúsculas", () => {
    expect(normalizarFormato(".GLB")).toBe("glb");
  });

  it("traduce tipos MIME conocidos", () => {
    expect(normalizarFormato("image/png")).toBe("png");
    expect(normalizarFormato("audio/x-wav")).toBe("wav");
    expect(normalizarFormato("text/csv")).toBe("csv");
    expect(normalizarFormato("application/json")).toBe("json");
  });

  it("devuelve un desconocido en minúsculas sin punto", () => {
    expect(normalizarFormato(".ExR")).toBe("exr");
    expect(normalizarFormato("FLAC")).toBe("flac");
  });
});

describe("registrarConversor y listarConversores", () => {
  it("normaliza de/a al registrar", () => {
    registrarConversor(conv(".PNG", "Image/JPEG", 1, "png-a-jpg"));
    expect(listarConversores()[0]).toMatchObject({ de: "png", a: "jpg" });
  });

  it("ignora duplicados de la misma pareja con el mismo nombre", () => {
    registrarConversor(conv("png", "jpg", 1, "png-a-jpg"));
    registrarConversor(conv("png", "jpg", 9, "png-a-jpg"));
    expect(listarConversores()).toHaveLength(1);
  });

  it("admite la misma pareja con nombres distintos", () => {
    registrarConversor(conv("png", "jpg", 1, "uno"));
    registrarConversor(conv("png", "jpg", 5, "dos"));
    expect(listarConversores()).toHaveLength(2);
  });
});

describe("rutaDeConversion", () => {
  it("encuentra una ruta directa", () => {
    registrarConversor(conv("png", "jpg", 2, "png-a-jpg"));
    const ruta = rutaDeConversion("png", "jpg");
    expect(ruta).not.toBeNull();
    expect(ruta?.pasos).toHaveLength(1);
    expect(ruta?.costo).toBe(2);
  });

  it("encadena tres pasos", () => {
    registrarConversor(conv("a", "b", 1, "a-b"));
    registrarConversor(conv("b", "c", 1, "b-c"));
    registrarConversor(conv("c", "d", 1, "c-d"));
    const ruta = rutaDeConversion("a", "d");
    expect(ruta?.pasos.map((p) => p.nombre)).toEqual(["a-b", "b-c", "c-d"]);
    expect(ruta?.costo).toBe(3);
  });

  it("gana la ruta más barata aunque tenga más pasos", () => {
    registrarConversor(conv("a", "d", 10, "directa-cara"));
    registrarConversor(conv("a", "b", 1, "a-b"));
    registrarConversor(conv("b", "d", 2, "b-d"));
    const ruta = rutaDeConversion("a", "d");
    expect(ruta?.costo).toBe(3);
    expect(ruta?.pasos.map((p) => p.nombre)).toEqual(["a-b", "b-d"]);
  });

  it("en empate de costo gana la de menos pasos", () => {
    registrarConversor(conv("a", "d", 4, "directa"));
    registrarConversor(conv("a", "b", 2, "a-b"));
    registrarConversor(conv("b", "d", 2, "b-d"));
    const ruta = rutaDeConversion("a", "d");
    expect(ruta?.pasos).toHaveLength(1);
    expect(ruta?.pasos[0].nombre).toBe("directa");
  });

  it("devuelve null cuando no hay ruta", () => {
    registrarConversor(conv("png", "jpg", 1, "png-a-jpg"));
    expect(rutaDeConversion("jpg", "png")).toBeNull();
  });

  it("de === a devuelve ruta vacía de costo 0", () => {
    expect(rutaDeConversion(".PNG", "image/png")).toEqual({
      pasos: [],
      costo: 0,
    });
  });

  it("no entra en ciclos infinitos", () => {
    registrarConversor(conv("a", "b", 1, "a-b"));
    registrarConversor(conv("b", "a", 1, "b-a"));
    expect(rutaDeConversion("a", "z")).toBeNull();
  });
});

describe("ejecutarRuta", () => {
  it("encadena los convertir en orden", () => {
    registrarConversor(
      conv("txt", "mayus", 1, "a-mayus", {
        convertir: (e) => String(e).toUpperCase(),
      }),
    );
    registrarConversor(
      conv("mayus", "grito", 1, "a-grito", {
        convertir: (e) => `${e}!`,
      }),
    );
    const ruta = rutaDeConversion("txt", "grito");
    expect(ruta).not.toBeNull();
    const resultado = ejecutarRuta(ruta as NonNullable<typeof ruta>, "hola");
    expect(resultado).toEqual({ ok: true, salida: "HOLA!" });
  });

  it("devuelve ok:false cuando un paso no tiene convertir", () => {
    registrarConversor(
      conv("png", "jpg", 1, "por-servicio", { via: "servicio" }),
    );
    const ruta = rutaDeConversion("png", "jpg");
    const resultado = ejecutarRuta(ruta as NonNullable<typeof ruta>, "datos");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toContain("por-servicio");
    }
  });

  it("captura un paso que lanza y devuelve su mensaje", () => {
    registrarConversor(
      conv("png", "jpg", 1, "rompe", {
        convertir: () => {
          throw new Error("píxeles corruptos");
        },
      }),
    );
    const ruta = rutaDeConversion("png", "jpg");
    const resultado = ejecutarRuta(ruta as NonNullable<typeof ruta>, "datos");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toContain("píxeles corruptos");
    }
  });

  it("pasa las opciones a cada paso", () => {
    registrarConversor(
      conv("txt", "num", 1, "con-opciones", {
        convertir: (e, opciones) =>
          `${e}-${opciones?.calidad ?? "sin-calidad"}`,
      }),
    );
    const ruta = rutaDeConversion("txt", "num");
    const resultado = ejecutarRuta(ruta as NonNullable<typeof ruta>, "x", {
      calidad: 90,
    });
    expect(resultado).toEqual({ ok: true, salida: "x-90" });
  });
});

describe("explicarSinRuta", () => {
  it("lista los destinos alcanzables cuando no hay ruta", () => {
    registrarConversor(conv("png", "jpg", 1, "png-a-jpg"));
    registrarConversor(conv("jpg", "webp", 1, "jpg-a-webp"));
    const mensaje = explicarSinRuta("png", "glb");
    expect(mensaje).toContain("No hay conversor de png a glb");
    expect(mensaje).toContain("jpg");
    expect(mensaje).toContain("webp");
  });

  it("dice que no conoce nada desde un formato sin salidas", () => {
    registrarConversor(conv("png", "jpg", 1, "png-a-jpg"));
    expect(explicarSinRuta("glb", "png")).toBe(
      "No conozco ningún conversor desde glb.",
    );
  });
});
