import { describe, it, expect } from "vitest";
import {
  TipoAlmacen,
  ModalidadAlmacen,
  type Almacen,
  type MedidasAlmacen,
  crearAlmacen,
} from "../modelo";
import {
  SugerenciaAlmacen,
  MotivoSugerencia,
  NivelConfianza,
  sugerirModalidad,
  sugerirAcomodo,
  sugerirConfiguracionCompleta,
  evaluarSaludAlmacen,
  calcularAptitudModalidad,
  type ConfiguracionSugerida,
} from "../sugerencias";

describe("sugerencias de almacenes", () => {
  const crearMedidas = (overrides: Partial<MedidasAlmacen> = {}): MedidasAlmacen => ({
    totalBytes: BigInt(500_000_000_000),
    libreBytes: BigInt(300_000_000_000),
    velocidadLecturaMbps: 500,
    velocidadEscrituraMbps: 400,
    salud: "buena",
    sistemaArchivos: "btrfs",
    enLinea: true,
    neuronaId: "neurona-001",
    ...overrides,
  }) as MedidasAlmacen;

  const crearAlmacenBase = (
    tipo: TipoAlmacen,
    overrides: Partial<Omit<Almacen, "tipo" | "medidas">> & { medidas?: Partial<MedidasAlmacen> } = {}
  ): Almacen => {
    const medidas = crearMedidas(overrides.medidas);
    return crearAlmacen({
      idVolumen: `vol-${tipo}-001`,
      numeroSerie: `SN-${tipo.toUpperCase()}-123`,
      tipo,
      nombre: `Almacén ${tipo}`,
      modalidad: "parte",
      medidas,
      ...overrides,
    });
  };

  describe("evaluarSaludAlmacen", () => {
    it("devuelve 'excelente' para SSD rápido y saludable", () => {
      const almacen = crearAlmacenBase("disco_interno", {
        medidas: { velocidadLecturaMbps: 3000, velocidadEscrituraMbps: 2500, salud: "excelente" },
      });
      const evaluacion = evaluarSaludAlmacen(almacen);
      expect(evaluacion.nivel).toBe("excelente");
      expect(evaluacion.puntuacion).toBeGreaterThanOrEqual(90);
    });

    it("devuelve 'buena' para disco interno estándar", () => {
      const almacen = crearAlmacenBase("disco_interno", {
        medidas: { velocidadLecturaMbps: 500, velocidadEscrituraMbps: 400, salud: "buena" },
      });
      const evaluacion = evaluarSaludAlmacen(almacen);
      expect(evaluacion.nivel).toBe("buena");
      expect(evaluacion.puntuacion).toBeGreaterThanOrEqual(70);
      expect(evaluacion.puntuacion).toBeLessThan(90);
    });

    it("devuelve 'regular' para USB lento", () => {
      const almacen = crearAlmacenBase("extraible", {
        medidas: { velocidadLecturaMbps: 30, velocidadEscrituraMbps: 20, salud: "buena" },
      });
      const evaluacion = evaluarSaludAlmacen(almacen);
      expect(evaluacion.nivel).toBe("regular");
      expect(evaluacion.puntuacion).toBeGreaterThanOrEqual(40);
      expect(evaluacion.puntuacion).toBeLessThan(70);
    });

    it("devuelve 'critica' para disco con salud crítica", () => {
      const almacen = crearAlmacenBase("disco_interno", {
        medidas: { salud: "critica" },
      });
      const evaluacion = evaluarSaludAlmacen(almacen);
      expect(evaluacion.nivel).toBe("critica");
      expect(evaluacion.puntuacion).toBeLessThan(40);
    });

    it("incluye factores en la evaluación", () => {
      const almacen = crearAlmacenBase("extraible", {
        medidas: { velocidadLecturaMbps: 30, velocidadEscrituraMbps: 20, salud: "regular" },
      });
      const evaluacion = evaluarSaludAlmacen(almacen);
      expect(evaluacion.factores).toBeDefined();
      expect(evaluacion.factores.velocidad).toBeDefined();
      expect(evaluacion.factores.salud).toBeDefined();
      expect(evaluacion.factores.tipo).toBeDefined();
      expect(evaluacion.factores.capacidad).toBeDefined();
    });
  });

  describe("calcularAptitudModalidad", () => {
    it("da alta aptitud a 'cerebro-completo' en disco interno rápido", () => {
      const almacen = crearAlmacenBase("disco_interno", {
        medidas: { velocidadLecturaMbps: 3000, velocidadEscrituraMbps: 2500, salud: "excelente", libreBytes: BigInt(500_000_000_000) },
      });
      const aptitud = calcularAptitudModalidad(almacen, "cerebro-completo");
      expect(aptitud.puntuacion).toBeGreaterThanOrEqual(80);
      expect(aptitud.motivos).toContainEqual(expect.objectContaining({ clave: "velocidad_adecuada" }));
    });

    it("da baja aptitud a 'cerebro-completo' en USB lento", () => {
      const almacen = crearAlmacenBase("extraible", {
        medidas: { velocidadLecturaMbps: 30, velocidadEscrituraMbps: 20, salud: "buena", libreBytes: BigInt(100_000_000_000) },
      });
      const aptitud = calcularAptitudModalidad(almacen, "cerebro-completo");
      expect(aptitud.puntuacion).toBeLessThan(50);
      expect(aptitud.motivos).toContainEqual(expect.objectContaining({ clave: "velocidad_insuficiente" }));
    });

    it("da alta aptitud a 'respaldo-vivo' en NAS", () => {
      const almacen = crearAlmacenBase("red", {
        medidas: { velocidadLecturaMbps: 1000, velocidadEscrituraMbps: 800, salud: "buena", libreBytes: BigInt(2_000_000_000_000) },
      });
      const aptitud = calcularAptitudModalidad(almacen, "respaldo-vivo");
      expect(aptitud.puntuacion).toBeGreaterThanOrEqual(75);
      expect(aptitud.motivos).toContainEqual(expect.objectContaining({ clave: "adecuado_para_sync" }));
    });

    it("da alta aptitud a 'secundario' en disco viejo con avisos", () => {
      const almacen = crearAlmacenBase("disco_interno", {
        medidas: { velocidadLecturaMbps: 100, velocidadEscrituraMbps: 80, salud: "regular", libreBytes: BigInt(1_000_000_000_000) },
      });
      const aptitud = calcularAptitudModalidad(almacen, "secundario");
      expect(aptitud.puntuacion).toBeGreaterThanOrEqual(70);
    });

    it("da alta aptitud a 'replica' en cualquier medio con espacio", () => {
      const almacen = crearAlmacenBase("extraible", {
        medidas: { velocidadLecturaMbps: 30, velocidadEscrituraMbps: 20, salud: "buena", libreBytes: BigInt(50_000_000_000) },
      });
      const aptitud = calcularAptitudModalidad(almacen, "replica");
      expect(aptitud.puntuacion).toBeGreaterThanOrEqual(60);
    });

    it("da aptitud media a 'neurona-nodo' en red", () => {
      const almacen = crearAlmacenBase("red", {
        medidas: { velocidadLecturaMbps: 500, velocidadEscrituraMbps: 400, salud: "buena", libreBytes: BigInt(1_000_000_000_000) },
      });
      const aptitud = calcularAptitudModalidad(almacen, "neurona-nodo");
      expect(aptitud.puntuacion).toBeGreaterThanOrEqual(60);
    });
  });

  describe("sugerirModalidad", () => {
    it("sugiere 'cerebro-completo' para SSD interno rápido", () => {
      const almacen = crearAlmacenBase("disco_interno", {
        medidas: { velocidadLecturaMbps: 3000, velocidadEscrituraMbps: 2500, salud: "excelente", libreBytes: BigInt(500_000_000_000) },
      });
      const sugerencia = sugerirModalidad(almacen);
      expect(sugerencia.modalidad).toBe("cerebro-completo");
      expect(sugerencia.confianza).toBe("alta");
      expect(sugerencia.motivos.some((m) => m.clave === "velocidad_adecuada")).toBe(true);
    });

    it("sugiere 'respaldo-vivo' para NAS con buena capacidad", () => {
      const almacen = crearAlmacenBase("red", {
        medidas: { velocidadLecturaMbps: 1000, velocidadEscrituraMbps: 800, salud: "buena", libreBytes: BigInt(2_000_000_000_000) },
      });
      const sugerencia = sugerirModalidad(almacen);
      expect(sugerencia.modalidad).toBe("respaldo-vivo");
      expect(sugerencia.confianza).toBe("alta");
    });

    it("sugiere 'secundario' para disco interno viejo con salud regular", () => {
      const almacen = crearAlmacenBase("disco_interno", {
        medidas: { velocidadLecturaMbps: 100, velocidadEscrituraMbps: 80, salud: "regular", libreBytes: BigInt(1_000_000_000_000) },
      });
      const sugerencia = sugerirModalidad(almacen);
      expect(sugerencia.modalidad).toBe("secundario");
      expect(sugerencia.confianza).toBe("media");
    });

    it("sugiere 'replica' para USB lento con espacio limitado", () => {
      const almacen = crearAlmacenBase("extraible", {
        medidas: { velocidadLecturaMbps: 30, velocidadEscrituraMbps: 20, salud: "buena", libreBytes: BigInt(50_000_000_000) },
      });
      const sugerencia = sugerirModalidad(almacen);
      expect(sugerencia.modalidad).toBe("replica");
      expect(sugerencia.confianza).toBe("media");
    });

    it("sugiere 'parte' para almacenamiento en nube", () => {
      const almacen = crearAlmacenBase("nube", {
        medidas: { velocidadLecturaMbps: 100, velocidadEscrituraMbps: 50, salud: "buena", libreBytes: BigInt(100_000_000_000) },
      });
      const sugerencia = sugerirModalidad(almacen);
      expect(sugerencia.modalidad).toBe("parte");
    });

    it("incluye advertencias para medios extraíbles como única copia fundamental", () => {
      const almacen = crearAlmacenBase("extraible", {
        medidas: { velocidadLecturaMbps: 100, velocidadEscrituraMbps: 80, salud: "buena", libreBytes: BigInt(100_000_000_000) },
      });
      const sugerencia = sugerirModalidad(almacen);
      expect(sugerencia.advertencias.length).toBeGreaterThan(0);
      expect(sugerencia.advertencias.some((a) => a.includes("extraíble"))).toBe(true);
    });

    it("devuelve todas las modalidades ordenadas por aptitud", () => {
      const almacen = crearAlmacenBase("disco_interno", {
        medidas: { velocidadLecturaMbps: 500, velocidadEscrituraMbps: 400, salud: "buena", libreBytes: BigInt(300_000_000_000) },
      });
      const sugerencia = sugerirModalidad(almacen);
      expect(sugerencia.alternativas).toBeDefined();
      expect(sugerencia.alternativas.length).toBe(6); // todas las modalidades
      // La primera debe ser la sugerida
      expect(sugerencia.alternativas[0].modalidad).toBe(sugerencia.modalidad);
      // Deben estar ordenadas por puntuación descendente
      for (let i = 1; i < sugerencia.alternativas.length; i++) {
        expect(sugerencia.alternativas[i].puntuacion).toBeLessThanOrEqual(sugerencia.alternativas[i - 1].puntuacion);
      }
    });
  });

  describe("sugerirAcomodo", () => {
    it("sugiere carpeta 'cerebros' para modalidad cerebro-completo en disco interno", () => {
      const almacen = crearAlmacenBase("disco_interno", {
        medidas: { velocidadLecturaMbps: 3000, velocidadEscrituraMbps: 2500, salud: "excelente", libreBytes: BigInt(500_000_000_000) },
      });
      const acomodo = sugerirAcomodo(almacen, "cerebro-completo");
      expect(acomodo.rutaSugerida).toBe("/cerebros");
      expect(acomodo.razon).toContain("cerebro completo");
    });

    it("sugiere carpeta 'respaldos' para modalidad respaldo-vivo", () => {
      const almacen = crearAlmacenBase("red", {
        medidas: { velocidadLecturaMbps: 1000, velocidadEscrituraMbps: 800, salud: "buena", libreBytes: BigInt(2_000_000_000_000) },
      });
      const acomodo = sugerirAcomodo(almacen, "respaldo-vivo");
      expect(acomodo.rutaSugerida).toBe("/respaldos");
    });

    it("sugiere carpeta 'desarrollo' para modalidad secundario", () => {
      const almacen = crearAlmacenBase("disco_interno", {
        medidas: { velocidadLecturaMbps: 100, velocidadEscrituraMbps: 80, salud: "regular", libreBytes: BigInt(1_000_000_000_000) },
      });
      const acomodo = sugerirAcomodo(almacen, "secundario");
      expect(acomodo.rutaSugerida).toBe("/desarrollo");
    });

    it("sugiere carpeta 'publico' para modalidad neurona-nodo", () => {
      const almacen = crearAlmacenBase("red", {
        medidas: { velocidadLecturaMbps: 500, velocidadEscrituraMbps: 400, salud: "buena", libreBytes: BigInt(1_000_000_000_000) },
      });
      const acomodo = sugerirAcomodo(almacen, "neurona-nodo");
      expect(acomodo.rutaSugerida).toBe("/publico");
    });

    it("incluye estimación de capacidad disponible", () => {
      const almacen = crearAlmacenBase("disco_interno", {
        medidas: { libreBytes: BigInt(500_000_000_000) },
      });
      const acomodo = sugerirAcomodo(almacen, "cerebro-completo");
      expect(acomodo.capacidadDisponibleBytes).toBe(BigInt(500_000_000_000));
      expect(acomodo.capacidadDisponibleLegible).toContain("GB");
    });
  });

  describe("sugerirConfiguracionCompleta", () => {
    it("devuelve configuración completa para SSD interno", () => {
      const almacen = crearAlmacenBase("disco_interno", {
        medidas: { velocidadLecturaMbps: 3000, velocidadEscrituraMbps: 2500, salud: "excelente", libreBytes: BigInt(500_000_000_000) },
      });
      const config = sugerirConfiguracionCompleta(almacen);
      expect(config.modalidad).toBeDefined();
      expect(config.acomodo).toBeDefined();
      expect(config.evaluacionSalud).toBeDefined();
      expect(config.aptitudes).toBeDefined();
      expect(config.aptitudes.length).toBe(6);
      expect(config.resumen).toBeDefined();
      expect(typeof config.resumen).toBe("string");
    });

    it("incluye aviso de dos copias para datos fundamentales", () => {
      const almacen = crearAlmacenBase("extraible", {
        medidas: { velocidadLecturaMbps: 100, velocidadEscrituraMbps: 80, salud: "buena", libreBytes: BigInt(100_000_000_000) },
      });
      const config = sugerirConfiguracionCompleta(almacen);
      expect(config.avisos.some((a) => a.includes("dos copias") || a.includes("extraíble"))).toBe(true);
    });

    it("nunca aplica cambios, solo sugiere", () => {
      const almacen = crearAlmacenBase("disco_interno", {
        medidas: { velocidadLecturaMbps: 3000, velocidadEscrituraMbps: 2500, salud: "excelente" },
      });
      const config = sugerirConfiguracionCompleta(almacen);
      // Verificar que no hay métodos de aplicación
      expect(config).not.toHaveProperty("aplicar");
      expect(config).not.toHaveProperty("guardar");
      expect(config).not.toHaveProperty("ejecutar");
    });
  });

  describe("tipos exportados", () => {
    it("SugerenciaAlmacen tiene estructura correcta", () => {
      const almacen = crearAlmacenBase("disco_interno", {});
      const sugerencia = sugerirModalidad(almacen);
      expect(sugerencia).toHaveProperty("modalidad");
      expect(sugerencia).toHaveProperty("confianza");
      expect(sugerencia).toHaveProperty("motivos");
      expect(sugerencia).toHaveProperty("advertencias");
      expect(sugerencia).toHaveProperty("alternativas");
    });

    it("MotivoSugerencia tiene clave y mensaje", () => {
      const almacen = crearAlmacenBase("disco_interno", {});
      const sugerencia = sugerirModalidad(almacen);
      for (const motivo of sugerencia.motivos) {
        expect(motivo).toHaveProperty("clave");
        expect(motivo).toHaveProperty("mensaje");
        expect(typeof motivo.clave).toBe("string");
        expect(typeof motivo.mensaje).toBe("string");
      }
    });

    it("NivelConfianza solo acepta valores válidos", () => {
      const niveles: NivelConfianza[] = ["alta", "media", "baja"];
      for (const nivel of niveles) {
        expect(["alta", "media", "baja"]).toContain(nivel);
      }
    });

    it("ConfiguracionSugerida tiene todos los campos", () => {
      const almacen = crearAlmacenBase("disco_interno", {});
      const config = sugerirConfiguracionCompleta(almacen);
      expect(config).toHaveProperty("modalidad");
      expect(config).toHaveProperty("acomodo");
      expect(config).toHaveProperty("evaluacionSalud");
      expect(config).toHaveProperty("aptitudes");
      expect(config).toHaveProperty("resumen");
      expect(config).toHaveProperty("avisos");
    });
  });
});