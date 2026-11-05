import { describe, it, expect } from "vitest";
import {
  MEDIOS_PANEL,
  filasDeMedios,
  validarPeticion,
  type EstadoLanzamiento,
  type FilaMedio,
  type PeticionLanzamiento,
} from "@/lib/mando/lanzamientos";

const ESTADO_EJEMPLO: EstadoLanzamiento = {
  fase: "compilando",
  detalle: "compilando v0.4.0 en GitHub",
  version: "0.4.0",
  t: 1730800000,
  pasos: [
    { fase: "esperando-lista", t: 1730790000, detalle: "lista terminada" },
    { fase: "esperando-publicacion", t: 1730795000, detalle: "publicada la versión: etiqueto" },
    { fase: "preparando", t: 1730796000, detalle: "preparo v0.4.0" },
    { fase: "etiquetando", t: 1730797000, detalle: "etiqueta v0.4.0 subida" },
    { fase: "compilando", t: 1730798000, detalle: "compilando v0.4.0 en GitHub" },
  ],
  jobs: [
    { medio: "macos", job: "macOS · macos-latest", estado: "ok", id: 1, url: "https://github.com/.../jobs/1", inicio: "2024-11-05T10:00:00Z", fin: "2024-11-05T10:15:00Z" },
    { medio: "windows", job: "Windows · windows-latest", estado: "en-curso", id: 2, url: "https://github.com/.../jobs/2", inicio: "2024-11-05T10:00:00Z", fin: null },
    { medio: "linux", job: "Linux · ubuntu-22.04", estado: "en-cola", id: 3, url: "https://github.com/.../jobs/3", inicio: null, fin: null },
    { medio: "android", job: "Android · android", estado: "fallo", id: 4, url: "https://github.com/.../jobs/4", inicio: "2024-11-05T10:00:00Z", fin: "2024-11-05T10:10:00Z" },
    { medio: "ios", job: "iOS · ios", estado: "omitido", id: 5, url: "https://github.com/.../jobs/5", inicio: "2024-11-05T10:00:00Z", fin: "2024-11-05T10:05:00Z" },
    { medio: "canales", job: "Canales · escritorio", estado: "en-cola", id: 6, url: "https://github.com/.../jobs/6", inicio: null, fin: null },
  ],
  medios: {
    macos: { estado: "generando", faltan: [], pequenos: [] },
    windows: { estado: "generando", faltan: [], pequenos: [] },
    linux: { estado: "verificando", faltan: [], pequenos: [] },
    android: { estado: "atascado", faltan: ["StarSeed.OS_0.4.0_x64_en-US.msi"], pequenos: [] },
    ios: { estado: "no-disponible", faltan: ["StarSeed-os-0.4.0-unsigned.ipa"], pequenos: [] },
    canales: { estado: "verificando", faltan: [], pequenos: [] },
    web: { estado: "al-dia", faltan: [], pequenos: [] },
    pwa: { estado: "al-dia", faltan: [], pequenos: [] },
    libreria: { estado: "al-dia", faltan: [], pequenos: [] },
  },
  run_url: "https://github.com/StarSeedSystem/starseed-system/actions/runs/12345",
  release_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.4.0",
  historial: [
    { t: 1730000000, tipo: "lanzado", version: "0.3.0" },
  ],
  pausado: false,
  tono: "aviso",
};

describe("MEDIOS_PANEL", () => {
  it("tiene 9 medios en el orden correcto del contrato §1", () => {
    expect(MEDIOS_PANEL).toHaveLength(9);
    expect(MEDIOS_PANEL.map((m) => m.id)).toEqual([
      "web", "pwa", "macos", "windows", "linux", "android", "ios", "canales", "libreria",
    ]);
  });

  it("cada medio tiene id, titulo y formatos", () => {
    for (const m of MEDIOS_PANEL) {
      expect(m.id).toBeTruthy();
      expect(m.titulo).toBeTruthy();
      expect(Array.isArray(m.formatos)).toBe(true);
      expect(m.formatos.length).toBeGreaterThan(0);
    }
  });

  it("web tiene formato con URL de Vercel", () => {
    const web = MEDIOS_PANEL.find((m) => m.id === "web");
    expect(web).toBeDefined();
    expect(web?.formatos.some((f) => f.nombre === "sitio" && f.url?.includes("vercel.app"))).toBe(true);
  });

  it("macos tiene formatos .dmg y .app.tar.gz", () => {
    const macos = MEDIOS_PANEL.find((m) => m.id === "macos");
    expect(macos).toBeDefined();
    const nombres = macos?.formatos.map((f) => f.nombre) ?? [];
    expect(nombres).toContain(".dmg universal");
    expect(nombres).toContain(".app.tar.gz");
  });
});

describe("filasDeMedios", () => {
  it("devuelve una fila por cada medio (9 filas)", () => {
    const filas = filasDeMedios(ESTADO_EJEMPLO, "0.3.0");
    expect(filas).toHaveLength(9);
  });

  it("cada fila tiene todos los campos requeridos", () => {
    const filas = filasDeMedios(ESTADO_EJEMPLO, "0.3.0");
    for (const fila of filas) {
      expect(fila.id).toBeTruthy();
      expect(fila.titulo).toBeTruthy();
      expect(Array.isArray(fila.formatos)).toBe(true);
      expect(typeof fila.version).toBe("string");
      expect(typeof fila.estado).toBe("string");
      expect(typeof fila.detalle).toBe("string");
      expect(typeof fila.accion).toBe("string");
    }
  });

  it("usa la versión publicada para medios al-día y la versión en curso para los demás", () => {
    const filas = filasDeMedios(ESTADO_EJEMPLO, "0.3.0");
    const web = filas.find((f) => f.id === "web");
    const macos = filas.find((f) => f.id === "macos");
    expect(web?.version).toBe("0.3.0");
    expect(macos?.version).toBe("0.4.0");
  });

  it("genera URLs de descarga correctas para GitHub releases", () => {
    const filas = filasDeMedios(ESTADO_EJEMPLO, "0.3.0");
    const macos = filas.find((f) => f.id === "macos");
    expect(macos?.formatos.some((f) => f.url?.includes("releases/download/v0.4.0/"))).toBe(true);
  });

  it("para web usa la URL de Vercel", () => {
    const filas = filasDeMedios(ESTADO_EJEMPLO, "0.3.0");
    const web = filas.find((f) => f.id === "web");
    expect(web?.formatos.some((f) => f.url === "https://starseed-os.vercel.app")).toBe(true);
  });

  it("el estado y detalle reflejan el estado del medio", () => {
    const filas = filasDeMedios(ESTADO_EJEMPLO, "0.3.0");
    const android = filas.find((f) => f.id === "android");
    expect(android?.estado).toBe("atascado");
    expect(android?.detalle).toContain("falta");
  });

  it("la acción es 'Generar/Actualizar' para medios no al-día", () => {
    const filas = filasDeMedios(ESTADO_EJEMPLO, "0.3.0");
    const windows = filas.find((f) => f.id === "windows");
    expect(windows?.accion).toBe("Generar/Actualizar");
  });

  it("la acción es 'Al día' para medios al-día", () => {
    const filas = filasDeMedios(ESTADO_EJEMPLO, "0.3.0");
    const web = filas.find((f) => f.id === "web");
    expect(web?.accion).toBe("Al día");
  });

  it("iOS muestra 'No disponible' y acción vacía", () => {
    const filas = filasDeMedios(ESTADO_EJEMPLO, "0.3.0");
    const ios = filas.find((f) => f.id === "ios");
    expect(ios?.estado).toBe("no-disponible");
    expect(ios?.accion).toBe("");
  });
});

describe("validarPeticion", () => {
  it("acepta acción 'lanzar'", () => {
    const r = validarPeticion({ accion: "lanzar" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.peticion.accion).toBe("lanzar");
  });

  it("acepta acción 'pausar'", () => {
    const r = validarPeticion({ accion: "pausar" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.peticion.accion).toBe("pausar");
  });

  it("acepta acción 'reanudar'", () => {
    const r = validarPeticion({ accion: "reanudar" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.peticion.accion).toBe("reanudar");
  });

  it("acepta acción 'reintentar'", () => {
    const r = validarPeticion({ accion: "reintentar" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.peticion.accion).toBe("reintentar");
  });

  it("acepta acción 'regenerar' con medio válido", () => {
    const r = validarPeticion({ accion: "regenerar", medio: "macos" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.peticion.accion).toBe("regenerar");
      expect(r.peticion.medio).toBe("macos");
    }
  });

  it("acepta acción 'auto' con activo booleano", () => {
    const r = validarPeticion({ accion: "auto", activo: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.peticion.accion).toBe("auto");
      expect(r.peticion.activo).toBe(true);
    }
  });

  it("rechaza acción desconocida", () => {
    const r = validarPeticion({ accion: "inventada" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("acción no válida");
  });

  it("rechaza 'regenerar' sin medio", () => {
    const r = validarPeticion({ accion: "regenerar" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("medio");
  });

  it("rechaza 'regenerar' con medio inválido", () => {
    const r = validarPeticion({ accion: "regenerar", medio: "inventado" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Medio no válido");
  });

  it("rechaza 'auto' sin activo", () => {
    const r = validarPeticion({ accion: "auto" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("activo");
  });

  it("rechaza body no objeto", () => {
    const r = validarPeticion(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Cuerpo inválido");
  });

  it("rechaza body sin accion", () => {
    const r = validarPeticion({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("acción");
  });
});