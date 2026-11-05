import { describe, it, expect } from "vitest";
import {
  estadoPorDefecto,
  normalizarEstado,
  calcularProgreso,
  necesitaActualizacion,
  resultadoCheck,
  comprobarActualizacion,
  estadoAlDescargar,
  estadoAlInstalar,
  estadoAlError,
  estadoALista,
  informeActualizacion,
  crearObraActualizacion,
  esPlataformaSoportada,
  medirPlataforma,
  esEventoValido,
} from "../actualizador";

describe("estadoPorDefecto", () => {
  it("devuelve un estado con fase al-día", () => {
    const estado = estadoPorDefecto();
    expect(estado.fase).toBe("al-dia");
  });
});

describe("normalizarEstado", () => {
  it("convierte un payload válido a EstadoActualizacion", () => {
    const raw = {
      fase: "descargando",
      version: "1.0.0",
      descargado: 500,
      total: 1000,
      mensaje: "Bajando...",
    };
    const estado = normalizarEstado(raw);
    expect(estado).not.toBeNull();
    expect(estado!.fase).toBe("descargando");
    expect(estado!.versionActual).toBe("1.0.0");
    expect(estado!.descargado).toBe(500);
    expect(estado!.total).toBe(1000);
  });

  it("devuelve null para payload inválido", () => {
    expect(normalizarEstado(null)).toBeNull();
    expect(normalizarEstado(undefined)).toBeNull();
    expect(normalizarEstado({})).toBeNull();
    expect(normalizarEstado({ fase: "desconocida" })).toBeNull();
  });

  it("maneja valores null sin lanzar", () => {
    const raw = { fase: "al-dia" };
    const estado = normalizarEstado(raw);
    expect(estado).not.toBeNull();
    expect(estado!.versionActual).toBeNull();
  });
});

describe("calcularProgreso", () => {
  it("calcula el porcentaje correctamente", () => {
    expect(calcularProgreso({ fase: "descargando", descargado: 25, total: 100 })).toBe(25);
    expect(calcularProgreso({ fase: "descargando", descargado: 0, total: 100 })).toBe(0);
    expect(calcularProgreso({ fase: "descargando", descargado: 100, total: 100 })).toBe(100);
  });

  it("devuelve null si total es cero o no numérico", () => {
    expect(calcularProgreso({ fase: "descargando", descargado: 50, total: 0 })).toBeNull();
    expect(calcularProgreso({ fase: "descargando", descargado: 50, total: null })).toBeNull();
    expect(calcularProgreso({ fase: "al-dia" })).toBeNull();
  });

  it("limita a 100%", () => {
    expect(calcularProgreso({ fase: "descargando", descargado: 150, total: 100 })).toBe(100);
  });
});

describe("necesitaActualizacion", () => {
  it("devuelve true si hay versión remota más nueva", () => {
    expect(necesitaActualizacion({ versionActual: "1.0.0", versionRemota: "1.1.0" })).toBe(true);
    expect(necesitaActualizacion({ versionActual: "0.9.9", versionRemota: "1.0.0" })).toBe(true);
  });

  it("devuelve false si la versión actual es igual o más nueva", () => {
    expect(necesitaActualizacion({ versionActual: "1.0.0", versionRemota: "1.0.0" })).toBe(false);
    expect(necesitaActualizacion({ versionActual: "1.1.0", versionRemota: "1.0.0" })).toBe(false);
  });

  it("devuelve true si no hay versión actual", () => {
    expect(necesitaActualizacion({ versionRemota: "1.0.0" })).toBe(true);
    expect(necesitaActualizacion({ versionActual: undefined, versionRemota: "1.0.0" })).toBe(true);
  });

  it("devuelve false si no hay versión remota", () => {
    expect(necesitaActualizacion({ versionActual: "1.0.0" })).toBe(false);
    expect(necesitaActualizacion({ versionActual: "1.0.0", versionRemota: undefined })).toBe(false);
    expect(necesitaActualizacion({ versionActual: "1.0.0", versionRemota: null as unknown as undefined })).toBe(false);
  });
});

describe("resultadoCheck", () => {
  it("devuelve ok:true y estado al-día sin versión nueva", () => {
    const r = resultadoCheck("1.0.0", null);
    expect(r.ok).toBe(true);
    expect(r.estado.fase).toBe("al-dia");
    expect(r.versionNueva).toBeUndefined();
  });

  it("devuelve ok:true con estado lista cuando hay versión nueva", () => {
    const r = resultadoCheck("1.0.0", "1.1.0");
    expect(r.ok).toBe(true);
    expect(r.estado.fase).toBe("lista");
    expect(r.estado.versionNueva).toBe("1.1.0");
    expect(r.versionNueva).toBe("1.1.0");
  });

  it("incluye versión actual en el estado", () => {
    const r = resultadoCheck("1.0.0", null);
    expect(r.estado.versionActual).toBe("1.0.0");
  });
});

describe("comprobarActualizacion", () => {
  it("indica que no hay actualización cuando las versiones coinciden", () => {
    const r = comprobarActualizacion("1.0.0", "1.0.0", "https://example.com");
    expect(r.ok).toBe(true);
    expect(r.versionNueva).toBeNull();
  });

  it("indica nueva versión cuando es mayor", () => {
    const r = comprobarActualizacion("1.0.0", "1.1.0", "https://github.com/StarSeedSystem/starseed-system");
    expect(r.ok).toBe(true);
    expect(r.versionNueva).toBe("1.1.0");
    expect(r.urlDescarga).toBe("https://github.com/StarSeedSystem/starseed-system/download/v1.1.0");
  });

  it("devuelve error si no hay versión remota", () => {
    const r = comprobarActualizacion("1.0.0", null, "https://example.com");
    expect(r.ok).toBe(true);
    expect(r.error).toBe("No se pudo obtener la versión remota.");
  });
});

describe("funciones de transición de estado", () => {
  const estadoBase = estadoPorDefecto();
  estadoBase.versionActual = "1.0.0";
  estadoBase.versionNueva = "1.1.0";

  it("estadoAlDescargar actualiza la fase y progreso", () => {
    const nuevo = estadoAlDescargar(estadoBase, 250, 1000);
    expect(nuevo.fase).toBe("descargando");
    expect(nuevo.descargado).toBe(250);
    expect(nuevo.total).toBe(1000);
  });

  it("estadoAlInstalar cambia a fase instalar", () => {
    const nuevo = estadoAlInstalar(estadoBase);
    expect(nuevo.fase).toBe("instalando");
    expect(nuevo.descargado).toBeNull();
  });

  it("estadoAlError establece el mensaje de error", () => {
    const nuevo = estadoAlError(estadoBase, "Error de red");
    expect(nuevo.fase).toBe("error");
    expect(nuevo.mensaje).toBe("Error de red");
  });

  it("estadoALista deja la versión nueva y mensaje", () => {
    const nuevo = estadoALista({ ...estadoBase, fase: "descargando" });
    expect(nuevo.fase).toBe("lista");
  });
});

describe("informeActualizacion", () => {
  it("indica si hay actualización disponible", () => {
    const informe = informeActualizacion("1.0.0", "1.1.0", "darwin");
    expect(informe.esActualizacion).toBe(true);
    expect(informe.versionActual).toBe("1.0.0");
    expect(informe.versionNueva).toBe("1.1.0");
    expect(informe.aplicable).toBe(true);
  });

  it("marca como no aplicable plataformas desconocidas", () => {
    const informe = informeActualizacion("1.0.0", "1.1.0", "unknown");
    expect(informe.aplicable).toBe(false);
  });
});

describe("esPlataformaSoportada", () => {
  it("devuelve true para darwin, windows y linux", () => {
    expect(esPlataformaSoportada("darwin")).toBe(true);
    expect(esPlataformaSoportada("windows")).toBe(true);
    expect(esPlataformaSoportada("linux")).toBe(true);
  });
});

describe("crearObraActualizacion", () => {
  it("crea el enlace correcto con etiqueta v", () => {
    const obra = crearObraActualizacion("1.0.0", "https://github.com/StarSeedSystem/starseed-system");
    expect(obra.ok).toBe(true);
    if (obra.ok) {
      expect(obra.version).toBe("1.0.0");
      expect(obra.enlace).toBe(
        "https://github.com/StarSeedSystem/starseed-system/download/v1.0.0",
      );
    }
  });

  it("maneja etiquetas que ya tienen v", () => {
    const obra = crearObraActualizacion("v1.0.0", "https://github.com/StarSeedSystem/starseed-system");
    if (obra.ok) {
      expect(obra.enlace).toBe(
        "https://github.com/StarSeedSystem/starseed-system/download/v1.0.0",
      );
    }
  });
});

describe("esEventoValido", () => {
  it("acepta payloads con fase válida", () => {
    expect(esEventoValido({ fase: "buscando" })).toBe(true);
    expect(esEventoValido({ fase: "descargando", version: "1.0.0" })).toBe(true);
    expect(esEventoValido({ fase: "instalando" })).toBe(true);
    expect(esEventoValido({ fase: "lista" })).toBe(true);
    expect(esEventoValido({ fase: "error", mensaje: "Fallo" })).toBe(true);
    expect(esEventoValido({ fase: "al-dia" })).toBe(true);
  });

  it("rechaza payloads con fase inválida", () => {
    expect(esEventoValido({ fase: "cualquier-cosa" })).toBe(false);
    expect(esEventoValido({})).toBe(false);
    expect(esEventoValido(null)).toBe(false);
    expect(esEventoValido(undefined)).toBe(false);
    expect(esEventoValido("string")).toBe(false);
  });
});

describe("medirPlataforma", () => {
  it("devuelve la plataforma del UA del navegador", () => {
    expect(medirPlataforma()).toBeDefined();
  });
});