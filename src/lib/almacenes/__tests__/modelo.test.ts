import { describe, it, expect } from "vitest";
import {
  TipoAlmacen,
  ModalidadAlmacen,
  ModalidadCarpeta,
  MedidasAlmacen,
  Almacen,
  ManifiestoAlmacen,
  validarManifiestoAlmacen,
  crearAlmacen,
  esModalidadValida,
  esModalidadCarpetaValida,
  esTipoAlmacenValido,
} from "../modelo";

describe("modelo de almacenes", () => {
  describe("TipoAlmacen", () => {
    it("define todos los tipos válidos", () => {
      expect(TipoAlmacen.EXTRAIBLE).toBe("extraible");
      expect(TipoAlmacen.DISCO_INTERNO).toBe("disco_interno");
      expect(TipoAlmacen.RED).toBe("red");
      expect(TipoAlmacen.NUBE).toBe("nube");
      expect(TipoAlmacen.NEURONA).toBe("neurona");
      expect(TipoAlmacen.NODO).toBe("nodo");
    });

    it("esTipoAlmacenValido acepta tipos válidos", () => {
      expect(esTipoAlmacenValido("extraible")).toBe(true);
      expect(esTipoAlmacenValido("disco_interno")).toBe(true);
      expect(esTipoAlmacenValido("red")).toBe(true);
      expect(esTipoAlmacenValido("nube")).toBe(true);
      expect(esTipoAlmacenValido("neurona")).toBe(true);
      expect(esTipoAlmacenValido("nodo")).toBe(true);
    });

    it("esTipoAlmacenValido rechaza tipos inválidos", () => {
      expect(esTipoAlmacenValido("invalido")).toBe(false);
      expect(esTipoAlmacenValido("")).toBe(false);
      expect(esTipoAlmacenValido("usb")).toBe(false);
    });
  });

  describe("ModalidadAlmacen", () => {
    it("define todas las modalidades válidas por almacén", () => {
      expect(ModalidadAlmacen.CEREBRO_COMPLETO).toBe("cerebro-completo");
      expect(ModalidadAlmacen.PARTE).toBe("parte");
      expect(ModalidadAlmacen.REPLICA).toBe("replica");
      expect(ModalidadAlmacen.RESPALDO_VIVO).toBe("respaldo-vivo");
      expect(ModalidadAlmacen.NEURONA_NODO).toBe("neurona-nodo");
      expect(ModalidadAlmacen.SECUNDARIO).toBe("secundario");
    });

    it("esModalidadValida acepta modalidades válidas", () => {
      expect(esModalidadValida("cerebro-completo")).toBe(true);
      expect(esModalidadValida("parte")).toBe(true);
      expect(esModalidadValida("replica")).toBe(true);
      expect(esModalidadValida("respaldo-vivo")).toBe(true);
      expect(esModalidadValida("neurona-nodo")).toBe(true);
      expect(esModalidadValida("secundario")).toBe(true);
    });

    it("esModalidadValida rechaza modalidades inválidas", () => {
      expect(esModalidadValida("invalida")).toBe(false);
      expect(esModalidadValida("")).toBe(false);
      expect(esModalidadValida("backup")).toBe(false);
    });
  });

  describe("ModalidadCarpeta", () => {
    it("define todas las modalidades válidas por carpeta", () => {
      expect(ModalidadCarpeta.CEREBRO_COMPLETO).toBe("cerebro-completo");
      expect(ModalidadCarpeta.PARTE).toBe("parte");
      expect(ModalidadCarpeta.REPLICA).toBe("replica");
      expect(ModalidadCarpeta.RESPALDO_VIVO).toBe("respaldo-vivo");
      expect(ModalidadCarpeta.NEURONA_NODO).toBe("neurona-nodo");
      expect(ModalidadCarpeta.SECUNDARIO).toBe("secundario");
    });

    it("esModalidadCarpetaValida acepta modalidades válidas", () => {
      expect(esModalidadCarpetaValida("cerebro-completo")).toBe(true);
      expect(esModalidadCarpetaValida("parte")).toBe(true);
      expect(esModalidadCarpetaValida("replica")).toBe(true);
      expect(esModalidadCarpetaValida("respaldo-vivo")).toBe(true);
      expect(esModalidadCarpetaValida("neurona-nodo")).toBe(true);
      expect(esModalidadCarpetaValida("secundario")).toBe(true);
    });
  });

  describe("MedidasAlmacen", () => {
    it("crea medidas con todos los campos requeridos", () => {
      const medidas: MedidasAlmacen = {
        totalBytes: BigInt(500_000_000_000),
        libreBytes: BigInt(300_000_000_000),
        velocidadLecturaMbps: 30,
        velocidadEscrituraMbps: 25,
        salud: "buena",
        sistemaArchivos: "btrfs",
        enLinea: true,
        neuronaId: "neurona-123",
      };

      expect(medidas.totalBytes).toBe(BigInt(500_000_000_000));
      expect(medidas.libreBytes).toBe(BigInt(300_000_000_000));
      expect(medidas.velocidadLecturaMbps).toBe(30);
      expect(medidas.velocidadEscrituraMbps).toBe(25);
      expect(medidas.salud).toBe("buena");
      expect(medidas.sistemaArchivos).toBe("btrfs");
      expect(medidas.enLinea).toBe(true);
      expect(medidas.neuronaId).toBe("neurona-123");
    });

    it("permite salud como enum válido", () => {
      const saludValidas = ["excelente", "buena", "regular", "critica", "desconocida"] as const;
      for (const s of saludValidas) {
        const m: MedidasAlmacen = {
          totalBytes: BigInt(1000),
          libreBytes: BigInt(500),
          velocidadLecturaMbps: 10,
          velocidadEscrituraMbps: 5,
          salud: s,
          sistemaArchivos: "ext4",
          enLinea: true,
          neuronaId: "n1",
        };
        expect(m.salud).toBe(s);
      }
    });
  });

  describe("Almacen", () => {
    it("crea un almacén con identidad UUID + serie (nunca ruta)", () => {
      const almacen = crearAlmacen({
        idVolumen: "vol-abc-123",
        numeroSerie: "SN-XYZ-789",
        tipo: "extraible",
        nombre: "Mi USB",
        modalidad: "cerebro-completo",
        medidas: {
          totalBytes: BigInt(32_000_000_000),
          libreBytes: BigInt(28_000_000_000),
          velocidadLecturaMbps: 100,
          velocidadEscrituraMbps: 80,
          salud: "buena",
          sistemaArchivos: "exFAT",
          enLinea: true,
          neuronaId: "neurona-001",
        },
      });

      expect(almacen.idVolumen).toBe("vol-abc-123");
      expect(almacen.numeroSerie).toBe("SN-XYZ-789");
      expect(almacen.tipo).toBe("extraible");
      expect(almacen.nombre).toBe("Mi USB");
      expect(almacen.modalidad).toBe("cerebro-completo");
      expect(almacen.medidas.totalBytes).toBe(BigInt(32_000_000_000));
      // Identidad = UUID del volumen + número de serie, NUNCA la ruta de montaje
      expect(almacen.rutaMontaje).toBeUndefined();
    });

    it("incluye modalidades por carpeta opcionales", () => {
      const almacen = crearAlmacen({
        idVolumen: "vol-1",
        numeroSerie: "SN-1",
        tipo: "disco_interno",
        nombre: "Disco principal",
        modalidad: "parte",
        medidas: {
          totalBytes: BigInt(1_000_000_000_000),
          libreBytes: BigInt(500_000_000_000),
          velocidadLecturaMbps: 500,
          velocidadEscrituraMbps: 450,
          salud: "excelente",
          sistemaArchivos: "btrfs",
          enLinea: true,
          neuronaId: "neurona-001",
        },
        carpetas: {
          "/cerebros/privado": "cerebro-completo",
          "/respaldos": "respaldo-vivo",
          "/desarrollo": "secundario",
        },
      });

      expect(almacen.carpetas).toEqual({
        "/cerebros/privado": "cerebro-completo",
        "/respaldos": "respaldo-vivo",
        "/desarrollo": "secundario",
      });
    });

    it("rechaza modalidad inválida en carpetas", () => {
      expect(() =>
        crearAlmacen({
          idVolumen: "vol-1",
          numeroSerie: "SN-1",
          tipo: "disco_interno",
          nombre: "Test",
          modalidad: "parte",
          medidas: {
            totalBytes: BigInt(1000),
            libreBytes: BigInt(500),
            velocidadLecturaMbps: 10,
            velocidadEscrituraMbps: 5,
            salud: "buena",
            sistemaArchivos: "ext4",
            enLinea: true,
            neuronaId: "n1",
          },
          carpetas: {
            "/test": "invalida" as ModalidadCarpeta,
          },
        })
      ).toThrow();
    });
  });

  describe("ManifiestoAlmacen", () => {
    it("tiene versión de formato y campos requeridos", () => {
      const manifiesto: ManifiestoAlmacen = {
        versionFormato: 1,
        idVolumen: "vol-abc-123",
        numeroSerie: "SN-XYZ-789",
        dueño: "cuenta-123",
        cerebros: ["cerebro-1", "cerebro-2"],
        partes: { "/cerebros/privado": "cerebro-1" },
        cifrado: true,
        algoritmosCifrado: ["AES-GCM-256"],
        fechaCreacion: "2026-11-25T10:00:00Z",
        fechaActualizacion: "2026-11-25T10:00:00Z",
      };

      expect(manifiesto.versionFormato).toBe(1);
      expect(manifiesto.idVolumen).toBe("vol-abc-123");
      expect(manifiesto.numeroSerie).toBe("SN-XYZ-789");
      expect(manifiesto.dueño).toBe("cuenta-123");
      expect(manifiesto.cerebros).toEqual(["cerebro-1", "cerebro-2"]);
      expect(manifiesto.cifrado).toBe(true);
    });

    it("rechaza campos de secretos en validación estricta", () => {
      const manifiestoConSecretos = {
        versionFormato: 1,
        idVolumen: "vol-1",
        numeroSerie: "SN-1",
        dueño: "cuenta-1",
        cerebros: [],
        partes: {},
        cifrado: true,
        algoritmosCifrado: ["AES-GCM-256"],
        fechaCreacion: "2026-11-25T10:00:00Z",
        fechaActualizacion: "2026-11-25T10:00:00Z",
        // Campos prohibidos (secretos)
        clavePrivada: "secret-key",
        token: "secret-token",
        contraseña: "secret-password",
      };

      const resultado = validarManifiestoAlmacen(manifiestoConSecretos);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContainEqual(
        expect.stringContaining("campo prohibido")
      );
    });

    it("valida versión de formato soportada", () => {
      const manifiestoV1 = {
        versionFormato: 1,
        idVolumen: "vol-1",
        numeroSerie: "SN-1",
        dueño: "cuenta-1",
        cerebros: [],
        partes: {},
        cifrado: true,
        algoritmosCifrado: ["AES-GCM-256"],
        fechaCreacion: "2026-11-25T10:00:00Z",
        fechaActualizacion: "2026-11-25T10:00:00Z",
      };

      const resultado = validarManifiestoAlmacen(manifiestoV1);
      expect(resultado.valido).toBe(true);
    });

    it("rechaza versión de formato no soportada", () => {
      const manifiestoV99 = {
        versionFormato: 99,
        idVolumen: "vol-1",
        numeroSerie: "SN-1",
        dueño: "cuenta-1",
        cerebros: [],
        partes: {},
        cifrado: true,
        algoritmosCifrado: ["AES-GCM-256"],
        fechaCreacion: "2026-11-25T10:00:00Z",
        fechaActualizacion: "2026-11-25T10:00:00Z",
      };

      const resultado = validarManifiestoAlmacen(manifiestoV99);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContainEqual(
        expect.stringContaining("versión")
      );
    });

    it("requiere campos obligatorios", () => {
      const manifiestoIncompleto = {
        versionFormato: 1,
        // Falta idVolumen, numeroSerie, dueño, etc.
      };

      const resultado = validarManifiestoAlmacen(manifiestoIncompleto);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores.length).toBeGreaterThan(0);
    });
  });
});