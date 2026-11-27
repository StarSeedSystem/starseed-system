import { describe, it, expect } from "vitest";
import {
  clasificarVelocidad,
  clasificarEspacio,
  evaluarSalud,
  calcularUso,
  esExtraible,
  esSistema,
  sugerirModalidadAlmacen,
  sugerirPlanAcomodo,
  esModalidadCompatible,
  describirModalidad,
} from "../sugerencias";
import {
  TipoAlmacen,
  ModalidadAlmacen,
  MedidasAlmacen,
  type Almacen,
  type ManifiestoAlmacen,
} from "../modelo";

/* ───────── helpers ───────── */

function medidasBase(overrides: Partial<MedidasAlmacen> = {}): MedidasAlmacen {
  return {
    totalBytes: BigInt(500_000_000_000), // 500 GB
    libreBytes: BigInt(300_000_000_000), // 300 GB
    velocidadLecturaMbps: 500,
    velocidadEscrituraMbps: 450,
    salud: "buena",
    sistemaArchivos: "btrfs",
    enLinea: true,
    neuronaId: "neurona-1",
    ...overrides,
  };
}

function almacenBase(overrides: Partial<Almacen> = {}): Almacen {
  return {
    idVolumen: "vol-1",
    numeroSerie: "SN-1",
    tipo: "disco_interno",
    nombre: "Disco principal",
    modalidad: "cerebro-completo",
    medidas: medidasBase(),
    fechaDeteccion: "2026-11-25T10:00:00Z",
    fechaUltimaConexion: "2026-11-25T10:00:00Z",
    ...overrides,
  };
}

function manifiestoBase(overrides: Partial<ManifiestoAlmacen> = {}): ManifiestoAlmacen {
  return {
    versionFormato: 1,
    idVolumen: "vol-1",
    numeroSerie: "SN-1",
    dueño: "cuenta-1",
    cerebros: ["cerebro-1"],
    partes: { "/cerebros/privado": "cerebro-1" },
    cifrado: true,
    algoritmosCifrado: ["AES-GCM-256"],
    fechaCreacion: "2026-11-25T10:00:00Z",
    fechaActualizacion: "2026-11-25T10:00:00Z",
    ...overrides,
  };
}

/* ───────── clasificadores ───────── */

describe("clasificarVelocidad", () => {
  it("clasifica lento (< 50 MB/s)", () => {
    expect(clasificarVelocidad(medidasBase({ velocidadLecturaMbps: 30, velocidadEscrituraMbps: 25 }))).toBe("lento");
    expect(clasificarVelocidad(medidasBase({ velocidadLecturaMbps: 10, velocidadEscrituraMbps: 8 }))).toBe("lento");
  });

  it("clasifica medio (50-400 MB/s)", () => {
    expect(clasificarVelocidad(medidasBase({ velocidadLecturaMbps: 100, velocidadEscrituraMbps: 80 }))).toBe("medio");
    expect(clasificarVelocidad(medidasBase({ velocidadLecturaMbps: 300, velocidadEscrituraMbps: 250 }))).toBe("medio");
  });

  it("clasifica rápido (> 400 MB/s)", () => {
    expect(clasificarVelocidad(medidasBase({ velocidadLecturaMbps: 500, velocidadEscrituraMbps: 450 }))).toBe("rapido");
    expect(clasificarVelocidad(medidasBase({ velocidadLecturaMbps: 1000, velocidadEscrituraMbps: 900 }))).toBe("rapido");
  });

  it("usa el máximo de lectura/escritura", () => {
    // Lectura lenta, escritura rápida → rápido
    expect(clasificarVelocidad(medidasBase({ velocidadLecturaMbps: 30, velocidadEscrituraMbps: 500 }))).toBe("rapido");
  });
});

describe("clasificarEspacio", () => {
  it("escaso (< 10 GB)", () => {
    expect(clasificarEspacio(medidasBase({ libreBytes: BigInt(5_000_000_000) }))).toBe("escaso");
    expect(clasificarEspacio(medidasBase({ libreBytes: BigInt(9_000_000_000) }))).toBe("escaso");
  });

  it("moderado (10-50 GB)", () => {
    expect(clasificarEspacio(medidasBase({ libreBytes: BigInt(15_000_000_000) }))).toBe("moderado");
    expect(clasificarEspacio(medidasBase({ libreBytes: BigInt(40_000_000_000) }))).toBe("moderado");
  });

  it("amplio (> 50 GB)", () => {
    expect(clasificarEspacio(medidasBase({ libreBytes: BigInt(100_000_000_000) }))).toBe("amplio");
    expect(clasificarEspacio(medidasBase({ libreBytes: BigInt(300_000_000_000) }))).toBe("amplio");
  });
});

describe("evaluarSalud", () => {
  it("buena para excelente/buena", () => {
    expect(evaluarSalud(medidasBase({ salud: "excelente" }))).toBe("buena");
    expect(evaluarSalud(medidasBase({ salud: "buena" }))).toBe("buena");
  });

  it("regular para regular", () => {
    expect(evaluarSalud(medidasBase({ salud: "regular" }))).toBe("regular");
  });

  it("mala para critica/desconocida", () => {
    expect(evaluarSalud(medidasBase({ salud: "critica" }))).toBe("mala");
    expect(evaluarSalud(medidasBase({ salud: "desconocida" }))).toBe("mala");
  });
});

describe("calcularUso", () => {
  it("calcula uso correctamente", () => {
    expect(calcularUso(medidasBase({ totalBytes: BigInt(100), libreBytes: BigInt(25) }))).toBe(0.75);
    expect(calcularUso(medidasBase({ totalBytes: BigInt(100), libreBytes: BigInt(100) }))).toBe(0);
    expect(calcularUso(medidasBase({ totalBytes: BigInt(100), libreBytes: BigInt(0) }))).toBe(1);
  });

  it("total 0 → uso 0", () => {
    expect(calcularUso(medidasBase({ totalBytes: BigInt(0), libreBytes: BigInt(0) }))).toBe(0);
  });
});

describe("esExtraible / esSistema", () => {
  it("detecta extraíble", () => {
    expect(esExtraible(almacenBase({ tipo: "extraible" }))).toBe(true);
    expect(esExtraible(almacenBase({ tipo: "disco_interno" }))).toBe(false);
    expect(esExtraible(almacenBase({ tipo: "red" }))).toBe(false);
  });

  it("detecta sistema", () => {
    expect(esSistema(almacenBase({ tipo: "disco_interno" }))).toBe(true);
    expect(esSistema(almacenBase({ tipo: "neurona" }))).toBe(true);
    expect(esSistema(almacenBase({ tipo: "extraible" }))).toBe(false);
    expect(esSistema(almacenBase({ tipo: "red" }))).toBe(false);
  });
});

/* ───────── sugerirModalidadAlmacen ───────── */

describe("sugerirModalidadAlmacen", () => {
  const otrosAlmacenes: Almacen[] = [];

  it("offline → solo secundario", () => {
    const a = almacenBase({ medidas: medidasBase({ enLinea: false }) });
    const r = sugerirModalidadAlmacen({ almacen: a, otrosAlmacenes });
    expect(r.modalidadSugerida).toBe("secundario");
    expect(r.razones.some(x => x.includes("fuera de línea"))).toBe(true);
    expect(r.confianza).toBeGreaterThan(0.8);
  });

  it("salud crítica → solo secundario con aviso fuerte", () => {
    const a = almacenBase({ medidas: medidasBase({ salud: "critica" }) });
    const r = sugerirModalidadAlmacen({ almacen: a, otrosAlmacenes });
    expect(r.modalidadSugerida).toBe("secundario");
    expect(r.advertencias.some(x => x.includes("Salud"))).toBe(true);
    expect(r.confianza).toBeGreaterThan(0.9);
  });

  it("disco interno amplio y rápido → cerebro-completo", () => {
    const a = almacenBase({
      tipo: "disco_interno",
      medidas: medidasBase({ libreBytes: BigInt(200_000_000_000), velocidadLecturaMbps: 500 }),
    });
    const r = sugerirModalidadAlmacen({ almacen: a, otrosAlmacenes });
    expect(r.modalidadSugerida).toBe("cerebro-completo");
    expect(r.confianza).toBeGreaterThan(0.8);
  });

  it("disco interno moderado → parte", () => {
    const a = almacenBase({
      tipo: "disco_interno",
      medidas: medidasBase({ libreBytes: BigInt(30_000_000_000) }),
    });
    const r = sugerirModalidadAlmacen({ almacen: a, otrosAlmacenes });
    expect(r.modalidadSugerida).toBe("parte");
  });

  it("disco interno casi lleno → secundario", () => {
    const a = almacenBase({
      tipo: "disco_interno",
      medidas: medidasBase({ libreBytes: BigInt(5_000_000_000) }),
    });
    const r = sugerirModalidadAlmacen({ almacen: a, otrosAlmacenes });
    expect(r.modalidadSugerida).toBe("secundario");
  });

  it("SSD extraíble rápido y amplio → respaldo-vivo", () => {
    const a = almacenBase({
      tipo: "extraible",
      medidas: medidasBase({ velocidadLecturaMbps: 1000, libreBytes: BigInt(400_000_000_000) }),
    });
    const r = sugerirModalidadAlmacen({ almacen: a, otrosAlmacenes });
    expect(r.modalidadSugerida).toBe("respaldo-vivo");
  });

  it("extraíble medio y amplio → respaldo-vivo", () => {
    const a = almacenBase({
      tipo: "extraible",
      medidas: medidasBase({ velocidadLecturaMbps: 200, libreBytes: BigInt(200_000_000_000) }),
    });
    const r = sugerirModalidadAlmacen({ almacen: a, otrosAlmacenes });
    expect(r.modalidadSugerida).toBe("respaldo-vivo");
  });

  it("extraíble lento → secundario", () => {
    const a = almacenBase({
      tipo: "extraible",
      medidas: medidasBase({ velocidadLecturaMbps: 30, velocidadEscrituraMbps: 25, libreBytes: BigInt(100_000_000_000) }),
    });
    const r = sugerirModalidadAlmacen({ almacen: a, otrosAlmacenes });
    expect(r.modalidadSugerida).toBe("secundario");
  });

  it("NAS/red rápido y amplio → neurona-nodo", () => {
    const a = almacenBase({
      tipo: "red",
      medidas: medidasBase({ velocidadLecturaMbps: 1000, libreBytes: BigInt(1_000_000_000_000) }),
    });
    const r = sugerirModalidadAlmacen({ almacen: a, otrosAlmacenes });
    expect(r.modalidadSugerida).toBe("neurona-nodo");
  });

  it("nube → respaldo-vivo", () => {
    const a = almacenBase({
      tipo: "nube",
      medidas: medidasBase({ velocidadLecturaMbps: 100, libreBytes: BigInt(1_000_000_000_000) }),
    });
    const r = sugerirModalidadAlmacen({ almacen: a, otrosAlmacenes });
    expect(r.modalidadSugerida).toBe("respaldo-vivo");
  });

  it("neurona/nodo → neurona-nodo", () => {
    const a = almacenBase({
      tipo: "neurona",
      medidas: medidasBase({ velocidadLecturaMbps: 500, libreBytes: BigInt(500_000_000_000) }),
    });
    const r = sugerirModalidadAlmacen({ almacen: a, otrosAlmacenes });
    expect(r.modalidadSugerida).toBe("neurona-nodo");
  });

  it("con manifiesto: cerebros completos → mantiene cerebro-completo", () => {
    const a = almacenBase({ tipo: "extraible", medidas: medidasBase({ velocidadLecturaMbps: 200 }) });
    const m = manifiestoBase({ cerebros: ["cerebro-1", "cerebro-2"] });
    const r = sugerirModalidadAlmacen({ almacen: a, manifiesto: m, otrosAlmacenes });
    expect(r.modalidadSugerida).toBe("cerebro-completo");
  });

  it("con manifiesto: partes → parte si era secundario", () => {
    const a = almacenBase({ tipo: "extraible", medidas: medidasBase({ velocidadLecturaMbps: 30, velocidadEscrituraMbps: 25 }) });
    const m = manifiestoBase({ cerebros: [], partes: { "/respaldos": "cerebro-1" } });
    const r = sugerirModalidadAlmacen({ almacen: a, manifiesto: m, otrosAlmacenes });
    expect(r.modalidadSugerida).toBe("parte");
  });

  it("advierte si extraíble es única copia fundamental", () => {
    const a = almacenBase({ tipo: "extraible", medidas: medidasBase({ velocidadLecturaMbps: 200 }) });
    const m = manifiestoBase({ cerebros: ["cerebro-1"] });
    const r = sugerirModalidadAlmacen({ almacen: a, manifiesto: m, otrosAlmacenes });
    expect(r.advertencias.some(x => x.includes("ÚNICA copia"))).toBe(true);
  });

  it("no advierte si hay otro almacén online con espacio", () => {
    const a = almacenBase({ tipo: "extraible", idVolumen: "vol-1", medidas: medidasBase({ velocidadLecturaMbps: 200 }) });
    const otro = almacenBase({ idVolumen: "vol-2", tipo: "disco_interno", medidas: medidasBase({ enLinea: true, libreBytes: BigInt(100_000_000_000) }) });
    const m = manifiestoBase({ cerebros: ["cerebro-1"] });
    const r = sugerirModalidadAlmacen({ almacen: a, manifiesto: m, otrosAlmacenes: [otro] });
    expect(r.advertencias.some(x => x.includes("ÚNICA copia"))).toBe(false);
  });

  it("sugiere modalidades por carpeta", () => {
    const a = almacenBase({ medidas: medidasBase() });
    const m = manifiestoBase({
      partes: {
        "/cerebros/privado": "cerebro-1",
        "/respaldos": "cerebro-1",
        "/desarrollo/build": "cerebro-1",
      },
    });
    const r = sugerirModalidadAlmacen({ almacen: a, manifiesto: m, otrosAlmacenes });
    expect(r.carpetasSugeridas["/cerebros/privado"]).toBe("parte");
    expect(r.carpetasSugeridas["/respaldos"]).toBe("respaldo-vivo");
    expect(r.carpetasSugeridas["/desarrollo/build"]).toBe("secundario");
  });
});

/* ───────── sugerirPlanAcomodo ───────── */

describe("sugerirPlanAcomodo", () => {
  it("genera plan con múltiples almacenes", () => {
    const interno = almacenBase({
      idVolumen: "vol-interno",
      tipo: "disco_interno",
      nombre: "Disco interno",
      medidas: medidasBase({ libreBytes: BigInt(200_000_000_000) }),
    });
    const ssd = almacenBase({
      idVolumen: "vol-ssd",
      tipo: "extraible",
      nombre: "SSD USB-C",
      medidas: medidasBase({ velocidadLecturaMbps: 1000, libreBytes: BigInt(400_000_000_000) }),
    });
    const hdd = almacenBase({
      idVolumen: "vol-hdd",
      tipo: "extraible",
      nombre: "HDD USB 2.0",
      medidas: medidasBase({ velocidadLecturaMbps: 30, velocidadEscrituraMbps: 25, libreBytes: BigInt(500_000_000_000) }),
    });

    const manifiestos = new Map<string, ManifiestoAlmacen>([
      ["vol-interno", manifiestoBase({ idVolumen: "vol-interno", cerebros: ["cerebro-1"] })],
      ["vol-ssd", manifiestoBase({ idVolumen: "vol-ssd", cerebros: [], partes: { "/respaldos": "cerebro-1" } })],
      ["vol-hdd", manifiestoBase({ idVolumen: "vol-hdd", cerebros: [], partes: { "/desarrollo": "cerebro-1" } })],
    ]);

    const plan = sugerirPlanAcomodo([interno, ssd, hdd], manifiestos);

    expect(plan.porAlmacen).toHaveLength(3);
    expect(plan.porAlmacen.find(p => p.almacenId === "vol-interno")?.modalidad).toBe("cerebro-completo");
    expect(plan.porAlmacen.find(p => p.almacenId === "vol-ssd")?.modalidad).toBe("respaldo-vivo");
    expect(plan.porAlmacen.find(p => p.almacenId === "vol-hdd")?.modalidad).toBe("parte");
    expect(plan.resumen).toContain("3 almacenes");
  });

  it("advierte regla de 2 copias: cerebro solo en extraíble", () => {
    const ssd = almacenBase({
      idVolumen: "vol-ssd",
      tipo: "extraible",
      nombre: "SSD USB-C",
      medidas: medidasBase({ velocidadLecturaMbps: 1000, libreBytes: BigInt(400_000_000_000) }),
    });
    const manifiestos = new Map<string, ManifiestoAlmacen>([
      ["vol-ssd", manifiestoBase({ idVolumen: "vol-ssd", cerebros: ["cerebro-1"] })],
    ]);
    const plan = sugerirPlanAcomodo([ssd], manifiestos);
    expect(plan.advertenciasGlobales.some(x => x.includes("2 copias") && x.includes("extraíble"))).toBe(true);
  });

  it("advierte regla de 2 copias: cerebro en un solo medio (no extraíble)", () => {
    const interno = almacenBase({
      idVolumen: "vol-interno",
      tipo: "disco_interno",
      nombre: "Disco interno",
      medidas: medidasBase({ libreBytes: BigInt(200_000_000_000) }),
    });
    const manifiestos = new Map<string, ManifiestoAlmacen>([
      ["vol-interno", manifiestoBase({ idVolumen: "vol-interno", cerebros: ["cerebro-1"] })],
    ]);
    const plan = sugerirPlanAcomodo([interno], manifiestos);
    expect(plan.advertenciasGlobales.some(x => x.includes("1 copia"))).toBe(true);
  });

  it("advierte si múltiples copias pero mismo tipo de medio", () => {
    const interno1 = almacenBase({
      idVolumen: "vol-1",
      tipo: "disco_interno",
      nombre: "Disco 1",
      medidas: medidasBase(),
    });
    const interno2 = almacenBase({
      idVolumen: "vol-2",
      tipo: "disco_interno",
      nombre: "Disco 2",
      medidas: medidasBase(),
    });
    const manifiestos = new Map<string, ManifiestoAlmacen>([
      ["vol-1", manifiestoBase({ idVolumen: "vol-1", cerebros: ["cerebro-1"] })],
      ["vol-2", manifiestoBase({ idVolumen: "vol-2", cerebros: ["cerebro-1"] })],
    ]);
    const plan = sugerirPlanAcomodo([interno1, interno2], manifiestos);
    expect(plan.advertenciasGlobales.some(x => x.includes("disco_interno") && x.includes("medios físicos distintos"))).toBe(true);
  });

  it("advierte parte fundamental solo en extraíble", () => {
    const ssd = almacenBase({
      idVolumen: "vol-ssd",
      tipo: "extraible",
      nombre: "SSD USB-C",
      medidas: medidasBase({ velocidadLecturaMbps: 1000 }),
    });
    const manifiestos = new Map<string, ManifiestoAlmacen>([
      ["vol-ssd", manifiestoBase({ idVolumen: "vol-ssd", cerebros: [], partes: { "/cerebros/privado": "cerebro-1" } })],
    ]);
    const plan = sugerirPlanAcomodo([ssd], manifiestos);
    expect(plan.advertenciasGlobales.some(x => x.includes("extraíble") && x.includes("fundamental"))).toBe(true);
  });
});

/* ───────── esModalidadCompatible ───────── */

describe("esModalidadCompatible", () => {
  it("salud mala solo admite secundario", () => {
    const a = almacenBase({ medidas: medidasBase({ salud: "critica" }) });
    expect(esModalidadCompatible("cerebro-completo", a).compatible).toBe(false);
    expect(esModalidadCompatible("secundario", a).compatible).toBe(true);
  });

  it("extraíble lento no admite cerebro-completo", () => {
    const a = almacenBase({ tipo: "extraible", medidas: medidasBase({ velocidadLecturaMbps: 30, velocidadEscrituraMbps: 25 }) });
    expect(esModalidadCompatible("cerebro-completo", a).compatible).toBe(false);
    expect(esModalidadCompatible("parte", a).compatible).toBe(true);
  });

  it("extraíble lento no admite respaldo-vivo", () => {
    const a = almacenBase({ tipo: "extraible", medidas: medidasBase({ velocidadLecturaMbps: 30, velocidadEscrituraMbps: 25 }) });
    expect(esModalidadCompatible("respaldo-vivo", a).compatible).toBe(false);
  });

  it("espacio escaso no admite cerebro-completo ni respaldo-vivo", () => {
    const a = almacenBase({ medidas: medidasBase({ libreBytes: BigInt(5_000_000_000) }) });
    expect(esModalidadCompatible("cerebro-completo", a).compatible).toBe(false);
    expect(esModalidadCompatible("respaldo-vivo", a).compatible).toBe(false);
    expect(esModalidadCompatible("secundario", a).compatible).toBe(true);
  });

  it("offline solo admite secundario", () => {
    const a = almacenBase({ medidas: medidasBase({ enLinea: false }) });
    expect(esModalidadCompatible("cerebro-completo", a).compatible).toBe(false);
    expect(esModalidadCompatible("secundario", a).compatible).toBe(true);
  });

  it("caso válido → compatible", () => {
    const a = almacenBase({ tipo: "disco_interno", medidas: medidasBase() });
    expect(esModalidadCompatible("cerebro-completo", a).compatible).toBe(true);
  });
});

/* ────────- describirModalidad ───────── */

describe("describirModalidad", () => {
  it("devuelve descripción para cada modalidad", () => {
    expect(describirModalidad("cerebro-completo")).toContain("cerebro entero");
    expect(describirModalidad("parte")).toContain("carpetas o capas concretas");
    expect(describirModalidad("replica")).toContain("copia congelada");
    expect(describirModalidad("respaldo-vivo")).toContain("se pone al día sola");
    expect(describirModalidad("neurona-nodo")).toContain("ofrece capacidad a la malla");
    expect(describirModalidad("secundario")).toContain("regenerables");
  });
});