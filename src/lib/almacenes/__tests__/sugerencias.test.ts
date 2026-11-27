import { describe, it, expect } from "vitest";
import {
  sugerirModalidadAlmacen,
  tipoAlmacenRecomendado,
  velocidadRecomendada,
  medidasSaludRecomendadas,
  acomodarAlmacen,
  tipoAlmacenComo,
} from "../sugerencias";
import { TipoAlmacen, ModalidadAlmacen } from "../modelo";

describe("sugerencias de almacenes", () => {
  describe("sugerirModalidadAlmacen", () => {
    it("sugiere cerebro-completo para un SSD rápido con espacio", () => {
      const resultado = sugerirModalidadAlmacen({
        tipo: "disco_interno",
        totalBytes: BigInt(1_000_000_000_000),
        libreBytes: BigInt(800_000_000_000),
        velocidadLecturaMbps: 3000,
        velocidadEscrituraMbps: 2500,
        salud: "excelente",
      });
      expect(resultado).toBe("cerebro-completo");
    });

    it("sugiere parte para un USB extraíble", () => {
      const resultado = sugerirModalidadAlmacen({
        tipo: "extraible",
        totalBytes: BigInt(32_000_000_000),
        libreBytes: BigInt(28_000_000_000),
        velocidadLecturaMbps: 100,
        velocidadEscrituraMbps: 80,
        salud: "buena",
      });
      expect(resultado).toBe("parte");
    });

    it("sugiere neurona-nodo para un almacén de red con baja salud", () => {
      const resultado = sugerirModalidadAlmacen({
        tipo: "red",
        totalBytes: BigInt(4_000_000_000_000),
        libreBytes: BigInt(2_000_000_000_000),
        velocidadLecturaMbps: 1000,
        velocidadEscrituraMbps: 800,
        salud: "regular",
      });
      expect(resultado).toBe("neurona-nodo");
    });
  });

  describe("tipoAlmacenRecomendado", () => {
    it("recomienda SSD para cerebro activo", () => {
      const resultado = tipoAlmacenRecomendado("cerebro-activa");
      expect(resultado).toBe("disco_interno");
    });

    it("recomienda USB extraíble para respaldos", () => {
      const resultado = tipoAlmacenRecomendado("respaldo");
      expect(resultado).toBe("extraible");
    });

    it("recomienda NAS para respaldo vivo", () => {
      const resultado = tipoAlmacenRecomendado("respaldo-vivo");
      expect(resultado).toBe("red");
    });

    it("recomienda disco interno para secundario (caché/compilaciones)", () => {
      const resultado = tipoAlmacenRecomendado("secundario");
      expect(resultado).toBe("disco_interno");
    });
  });

  describe("velocidadRecomendada", () => {
    it("devuelve velocidad alta para SSD", () => {
      const resultado = velocidadRecomendada("disco_interno");
      expect(resultado.minMBs).toBeGreaterThanOrEqual(200);
      expect(resultado.tipo).toBe("alta");
    });

    it("devuelve velocidad media para red/NAS", () => {
      const resultado = velocidadRecomendada("red");
      expect(resultado.minMBs).toBeGreaterThanOrEqual(50);
      expect(resultado.tipo).toBe("media");
    });

    it("devuelve velocidad baja para USB 2.0", () => {
      const resultado = velocidadRecomendada("extraible");
      expect(resultado.minMBs).toBeLessThanOrEqual(50);
      expect(resultado.tipo).toBe("baja");
    });

    it("devuelve velocidad muy alta para NVMe", () => {
      const resultado = velocidadRecomendada("disco_interno", "nvme");
      expect(resultado.minMBs).toBeGreaterThanOrEqual(500);
      expect(resultado.tipo).toBe("muy-alta");
    });
  });

  describe("medidasSaludRecomendadas", () => {
    it("recomienda alerta para salud crítica", () => {
      const resultado = medidasSaludRecomendadas("critica");
      expect(resultado.alerta).toBe(true);
      expect(resultado.recomendacion).toMatch(/sustituir|revisar/i);
    });

    it("recomienda supervisión para salud regular", () => {
      const resultado = medidasSaludRecomendadas("regular");
      expect(resultado.alerta).toBe(false);
      expect(resultado.recomendacion).toMatch(/monitorizar|atento/i);
    });

    it("no alerta para salud excelente", () => {
      const resultado = medidasSaludRecomendadas("excelente");
      expect(resultado.alerta).toBe(false);
      expect(resultado.recomendacion).toMatch(/óptimo|buen estado/i);
    });
  });

  describe("acomodarAlmacen", () => {
    it("sugiere acomodamiento completo para un disco nuevo", () => {
      const resultado = acomodarAlmacen({
        tipo: "extraible",
        nombre: "Samsung HM500JI",
        totalBytes: BigInt(500_000_000_000),
        libreBytes: BigInt(450_000_000_000),
        velocidadLecturaMbps: 30,
        velocidadEscrituraMbps: 25,
        salud: "buena",
      });

      expect(resultado.almacen.tipo).toBe("extraible");
      expect(resultado.almacen.nombre).toBe("Samsung HM500JI");
      expect(resultado.modalidad).toBe("respaldo-vivo");
      expect(resultado.ubicacion).toBe("secundario");
      expect(resultado.nota).toContain("USB");
      expect(typeof resultado.ideas).toBe("object");
      expect(resultado.ideas.length).toBeGreaterThan(0);
    });

    it("sugiere cerebro activo para SSD principal", () => {
      const resultado = acomodarAlmacen({
        tipo: "disco_interno",
        nombre: "SSD NVMe Crucial",
        totalBytes: BigInt(1_000_000_000_000),
        libreBytes: BigInt(800_000_000_000),
        velocidadLecturaMbps: 3500,
        velocidadEscrituraMbps: 3000,
        salud: "excelente",
      });

      expect(resultado.modalidad).toBe("cerebro-completo");
      expect(resultado.ubicacion).toBe("activo");
    });
  });

  describe("tipoAlmacenComo", () => {
    it("clasifica disco interno", () => {
      const resultado = tipoAlmacenComo("disco_interno");
      expect(resultado.categoria).toBe("propietario");
      expect(resultado.permiteRespaldo).toBe(true);
    });

    it("clasifica USB como extraíble", () => {
      const resultado = tipoAlmacenComo("extraible");
      expect(resultado.categoria).toBe("extraíble");
      expect(resultado.permiteRespaldo).toBe(true);
    });

    it("clasifica red como compartido", () => {
      const resultado = tipoAlmacenComo("red");
      expect(resultado.categoria).toBe("red");
      expect(resultado.permiteRespaldo).toBe(true);
    });
  });

  describe("sugerencia de uso por contexto", () => {
    it("sugiere usar USB como réplica independiente para archivos ya existentes", () => {
      const resultado = acomodarAlmacen({
        tipo: "extraible",
        nombre: "USB Trabajo",
        totalBytes: BigInt(64_000_000_000),
        libreBytes: BigInt(50_000_000_000),
        velocidadLecturaMbps: 80,
        velocidadEscrituraMbps: 60,
        salud: "buena",
      });

      expect(resultado.ideas).toContainEqual(
        expect.stringContaining("réplica independiente")
      );
    });

    it("sugiere NAS como respaldo vivo con versiones", () => {
      const resultado = acomodarAlmacen({
        tipo: "red",
        nombre: "NAS Synology",
        totalBytes: BigInt(8_000_000_000_000),
        libreBytes: BigInt(6_000_000_000_000),
        velocidadLecturaMbps: 200,
        velocidadEscrituraMbps: 150,
        salud: "excelente",
      });

      expect(resultado.modalidad).toBe("respaldo-vivo");
      expect(resultado.ideas).toContainEqual(
        expect.stringContaining("respaldo vivo")
      );
    });
  });
});