import { describe, it, expect } from "vitest";
import {
  estadoUpdaterInicial,
  normalizarEstadoUpdater,
  calcularProgreso,
  textoEstado,
  puedeMostrarToast,
  necesitaReinicio,
  compararVersionesInstaladas,
  formatearNotasVersion,
  crearResultadoComprobacion,
  crearResultadoActualizacion,
  verificarActualizacion,
  type EstadoUpdater,
  type ResultadoComprobacion,
  type ResultadoActualizacion,
} from "../actualizador";

describe("estadoUpdaterInicial", () => {
  it("devuelve estado desconocido", () => {
    const estado = estadoUpdaterInicial();
    expect(estado).toEqual({ fase: "desconocido" } as EstadoUpdater);
  });
});

describe("normalizarEstadoUpdater", () => {
  it("devuelve desconocido para null, undefined, y no-objeto", () => {
    expect(normalizarEstadoUpdater(null)).toEqual({ fase: "desconocido" });
    expect(normalizarEstadoUpdater(undefined)).toEqual({ fase: "desconocido" });
    expect(normalizarEstadoUpdater("string")).toEqual({ fase: "desconocido" });
    expect(normalizarEstadoUpdater(123)).toEqual({ fase: "desconocido" });
  });

  it("normaliza al-día con versión", () => {
    expect(normalizarEstadoUpdater({ fase: "al-día", version: "0.3.0" }))
      .toEqual({ fase: "al-día", version: "0.3.0" } as EstadoUpdater);
  });

  it("normaliza buscando con versión", () => {
    expect(normalizarEstadoUpdater({ fase: "buscando", version: "0.3.0" }))
      .toEqual({ fase: "buscando", version: "0.3.0" } as EstadoUpdater);
  });

  it("normaliza descargando con progreso", () => {
    const raw = { fase: "descargando", version: "0.3.0", descargado: 500, total: 1000 };
    const estado = normalizarEstadoUpdater(raw);
    expect(estado).toEqual({ fase: "descargando", version: "0.3.0", progreso: 50 } as EstadoUpdater);
  });

  it("calcula progreso correcto con total cero", () => {
    const estado = normalizarEstadoUpdater({ fase: "descargando", version: "0.3.0", descargado: 0, total: 0 });
    expect(estado).toEqual({ fase: "descargando", version: "0.3.0", progreso: 0 } as EstadoUpdater);
  });

  it("normaliza instalando, lista, error", () => {
    expect(normalizarEstadoUpdater({ fase: "instalando", version: "0.3.0" }))
      .toEqual({ fase: "instalando", version: "0.3.0" } as EstadoUpdater);
    expect(normalizarEstadoUpdater({ fase: "lista", version: "0.3.0" }))
      .toEqual({ fase: "lista", version: "0.3.0" } as EstadoUpdater);
    expect(normalizarEstadoUpdater({ fase: "error", version: "0.3.0", mensaje: "Fallo" }))
      .toEqual({ fase: "error", version: "0.3.0", error: "Fallo" } as EstadoUpdater);
    expect(normalizarEstadoUpdater({ fase: "error", version: "0.3.0" }))
      .toEqual({ fase: "error", version: "0.3.0", error: "Error desconocido" } as EstadoUpdater);
  });

  it("ignora fase desconocido", () => {
    expect(normalizarEstadoUpdater({ fase: "unknown", version: "0.3.0" }))
      .toEqual({ fase: "desconocido" });
  });
});

describe("calcularProgreso", () => {
  it("devuelve el progreso para descargando", () => {
    const estado: EstadoUpdater = { fase: "descargando", version: "0.3.0", progreso: 42 };
    expect(calcularProgreso(estado)).toBe(42);
  });

  it("devuelve null para al-día", () => {
    const estado: EstadoUpdater = { fase: "al-día", version: "0.3.0" };
    expect(calcularProgreso(estado)).toBeNull();
  });

  it("devuelve null para desconocido", () => {
    const estado: EstadoUpdater = { fase: "desconocido" };
    expect(calcularProgreso(estado)).toBeNull();
  });
});

describe("textoEstado", () => {
  it("devuelve vacío para desconocido", () => {
    expect(textoEstado({ fase: "desconocido" })).toBe("");
  });

  it("devuelve texto para al-día", () => {
    expect(textoEstado({ fase: "al-día", version: "0.3.0" })).toBe("Ya estás en la última versión.");
  });

  it("devuelve texto para buscando", () => {
    expect(textoEstado({ fase: "buscando", version: "0.3.0" })).toBe("Buscando actualización...");
  });

  it("devuelve texto para descargando", () => {
    expect(textoEstado({ fase: "descargando", version: "0.3.0", progreso: 75 })).toBe("Descargando 75%...");
  });

  it("devuelve texto para instalar, lista, error", () => {
    expect(textoEstado({ fase: "instalando", version: "0.3.0" })).toBe("Instalando actualización...");
    expect(textoEstado({ fase: "lista", version: "0.3.0" })).toBe("Actualización lista: reinicia para aplicarla.");
    expect(textoEstado({ fase: "error", version: "0.3.0", error: "Server error" })).toBe("Server error");
  });
});

describe("puedeMostrarToast", () => {
  it("devuelve false para desconocido y al-día", () => {
    expect(puedeMostrarToast({ fase: "desconocido" })).toBe(false);
    expect(puedeMostrarToast({ fase: "al-día", version: "0.3.0" })).toBe(false);
  });

  it("devuelve true para los demás estados", () => {
    expect(puedeMostrarToast({ fase: "buscando", version: "0.3.0" })).toBe(true);
    expect(puedeMostrarToast({ fase: "descargando", version: "0.3.0", progreso: 50 })).toBe(true);
    expect(puedeMostrarToast({ fase: "lista", version: "0.3.0" })).toBe(true);
    expect(puedeMostrarToast({ fase: "error", version: "0.3.0", error: "Fallo" })).toBe(true);
  });
});

describe("necesitaReinicio", () => {
  it("devuelve true solo para lista", () => {
    expect(necesitaReinicio({ fase: "lista", version: "0.3.0" })).toBe(true);
  });

  it("devuelve false para otros estados", () => {
    expect(necesitaReinicio({ fase: "descargando", version: "0.3.0", progreso: 50 })).toBe(false);
    expect(necesitaReinicio({ fase: "al-día", version: "0.3.0" })).toBe(false);
  });
});

describe("compararVersionesInstaladas", () => {
  it("devuelve true cuando disponible es más nuevo", () => {
    expect(compararVersionesInstaladas("0.2.0", "0.3.0")).toBe(true);
  });

  it("devuelve false cuando actual es más reciente o igual", () => {
    expect(compararVersionesInstaladas("0.3.0", "0.2.0")).toBe(false);
    expect(compararVersionesInstaladas("0.3.0", "0.3.0")).toBe(false);
  });
});

describe("formatearNotasVersion", () => {
  it("recorta espacios alrededor", () => {
    expect(formatearNotasVersion("  notas  ")).toBe("notas");
  });

  it("devuelve tal cual si no hay espacios", () => {
    expect(formatearNotasVersion("notas")).toBe("notas");
  });
});

describe("crearResultadoComprobacion", () => {
  it("crea resultado válido con datos completos", () => {
    const r = crearResultadoComprobacion("0.2.0", "0.3.0", "Nuevas funciones");
    expect(r).toEqual<ResultadoComprobacion>({
      ok: true,
      versionActual: "0.2.0",
      versionNueva: "0.3.0",
      notas: "Nuevas funciones",
      puedeActualizar: true,
    });
  });

  it("indica que no se puede actualizar cuando versión es igual", () => {
    const r = crearResultadoComprobacion("0.3.0", "0.3.0", "Nuevas funciones");
    expect(r.puedeActualizar).toBe(false);
  });
});

describe("crearResultadoActualizacion", () => {
  it("crea resultado de éxito con reinicio", () => {
    const r = crearResultadoActualizacion(true, "Actualización aplicada", true);
    expect(r).toEqual<ResultadoActualizacion>({ ok: true, mensaje: "Actualización aplicada", requiereReinicio: true });
  });

  it("crea resultado de error sin reinicio", () => {
    const r = crearResultadoActualizacion(false, "Error de red", false);
    expect(r).toEqual<ResultadoActualizacion>({ ok: false, mensaje: "Error de red", requiereReinicio: false });
  });
});

describe("verificarActualizacion", () => {
  it("crea resultado indicando disponibilidad de actualización", () => {
    const r = verificarActualizacion("0.2.0", "0.3.0");
    expect(r).toEqual<ResultadoComprobacion>({
      ok: true,
      versionActual: "0.2.0",
      versionNueva: "0.3.0",
      notas: "Versión 0.3.0 disponible.",
      puedeActualizar: true,
    });
  });

  it("crea resultado indicando que no hay actualización", () => {
    expect(verificarActualizacion("0.3.0", "0.2.0").puedeActualizar).toBe(false);
  });
});