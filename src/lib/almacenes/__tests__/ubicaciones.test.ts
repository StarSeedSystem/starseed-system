import { describe, it, expect } from "vitest";
import {
  TipoAlmacen,
  ModalidadAlmacen,
  ModalidadCarpeta,
  type Almacen,
  type ManifiestoAlmacen,
  crearAlmacen,
} from "../modelo";
import {
  CopiaUbicacion,
  UbicacionCarpeta,
  UbicacionCerebro,
  MapaUbicacionesCerebro,
  registrarUbicacion,
  actualizarEstadoEnLinea,
  obtenerCopiasDeCarpeta,
  obtenerCopiasDeCerebro,
  validarReglaDosCopias,
  esFundamental,
  obtenerEstadoCarpeta,
  obtenerResumenCerebro,
  type ResultadoValidacionDosCopias,
  type EstadoCarpeta,
} from "../ubicaciones";

describe("ubicaciones de almacenes (mapa de ubicaciones)", () => {
  const almacenUSB: Almacen = crearAlmacen({
    idVolumen: "vol-usb-001",
    numeroSerie: "SN-USB-123",
    tipo: "extraible",
    nombre: "USB Trabajo",
    modalidad: "parte",
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
    carpetas: {
      "/cerebros/privado": "cerebro-completo",
      "/respaldos": "respaldo-vivo",
    },
  });

  const almacenDiscoInterno: Almacen = crearAlmacen({
    idVolumen: "vol-interno-001",
    numeroSerie: "SN-INTERNO-456",
    tipo: "disco_interno",
    nombre: "SSD Principal",
    modalidad: "cerebro-completo",
    medidas: {
      totalBytes: BigInt(1_000_000_000_000),
      libreBytes: BigInt(500_000_000_000),
      velocidadLecturaMbps: 3000,
      velocidadEscrituraMbps: 2500,
      salud: "excelente",
      sistemaArchivos: "btrfs",
      enLinea: true,
      neuronaId: "neurona-001",
    },
  });

  const almacenNAS: Almacen = crearAlmacen({
    idVolumen: "vol-nas-001",
    numeroSerie: "SN-NAS-789",
    tipo: "red",
    nombre: "NAS Casa",
    modalidad: "respaldo-vivo",
    medidas: {
      totalBytes: BigInt(4_000_000_000_000),
      libreBytes: BigInt(2_000_000_000_000),
      velocidadLecturaMbps: 1000,
      velocidadEscrituraMbps: 800,
      salud: "buena",
      sistemaArchivos: "btrfs",
      enLinea: true,
      neuronaId: "neurona-001",
    },
  });

  describe("CopiaUbicacion", () => {
    it("representa una copia en un almacén específico", () => {
      const copia: CopiaUbicacion = {
        almacenId: almacenUSB.idVolumen,
        almacenTipo: almacenUSB.tipo,
        almacenNombre: almacenUSB.nombre,
        modalidad: "parte",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      };

      expect(copia.almacenId).toBe("vol-usb-001");
      expect(copia.almacenTipo).toBe("extraible");
      expect(copia.enLinea).toBe(true);
      expect(copia.esFundamental).toBe(true);
    });
  });

  describe("UbicacionCarpeta", () => {
    it("agrupa copias de una carpeta específica", () => {
      const ubicacion: UbicacionCarpeta = {
        ruta: "/cerebros/privado",
        cerebroId: "cerebro-1",
        copias: [
          {
            almacenId: almacenUSB.idVolumen,
            almacenTipo: almacenUSB.tipo,
            almacenNombre: almacenUSB.nombre,
            modalidad: "parte",
            enLinea: true,
            rutaEnAlmacen: "/cerebros/privado",
            esFundamental: true,
          },
          {
            almacenId: almacenDiscoInterno.idVolumen,
            almacenTipo: almacenDiscoInterno.tipo,
            almacenNombre: almacenDiscoInterno.nombre,
            modalidad: "cerebro-completo",
            enLinea: true,
            rutaEnAlmacen: "/cerebros/privado",
            esFundamental: true,
          },
        ],
      };

      expect(ubicacion.ruta).toBe("/cerebros/privado");
      expect(ubicacion.cerebroId).toBe("cerebro-1");
      expect(ubicacion.copias.length).toBe(2);
    });
  });

  describe("UbicacionCerebro", () => {
    it("contiene el mapa completo de ubicaciones de un cerebro", () => {
      const ubicacion: UbicacionCerebro = {
        cerebroId: "cerebro-1",
        carpetas: {
          "/cerebros/privado": {
            ruta: "/cerebros/privado",
            cerebroId: "cerebro-1",
            copias: [
              {
                almacenId: almacenDiscoInterno.idVolumen,
                almacenTipo: almacenDiscoInterno.tipo,
                almacenNombre: almacenDiscoInterno.nombre,
                modalidad: "cerebro-completo",
                enLinea: true,
                rutaEnAlmacen: "/cerebros/privado",
                esFundamental: true,
              },
            ],
          },
          "/respaldos": {
            ruta: "/respaldos",
            cerebroId: "cerebro-1",
            copias: [
              {
                almacenId: almacenUSB.idVolumen,
                almacenTipo: almacenUSB.tipo,
                almacenNombre: almacenUSB.nombre,
                modalidad: "respaldo-vivo",
                enLinea: true,
                rutaEnAlmacen: "/respaldos",
                esFundamental: true,
              },
              {
                almacenId: almacenNAS.idVolumen,
                almacenTipo: almacenNAS.tipo,
                almacenNombre: almacenNAS.nombre,
                modalidad: "respaldo-vivo",
                enLinea: true,
                rutaEnAlmacen: "/respaldos",
                esFundamental: true,
              },
            ],
          },
        },
        fechaActualizacion: new Date().toISOString(),
      };

      expect(ubicacion.cerebroId).toBe("cerebro-1");
      expect(Object.keys(ubicacion.carpetas).length).toBe(2);
    });
  });

  describe("registrarUbicacion", () => {
    it("registra una nueva ubicación para una carpeta en un almacén", () => {
      const mapa: MapaUbicacionesCerebro = {};
      const resultado = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenDiscoInterno.idVolumen,
        almacenTipo: almacenDiscoInterno.tipo,
        almacenNombre: almacenDiscoInterno.nombre,
        modalidad: "cerebro-completo",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });

      expect(resultado.cerebroId).toBe("cerebro-1");
      expect(resultado.carpetas["/cerebros/privado"]).toBeDefined();
      expect(resultado.carpetas["/cerebros/privado"].copias.length).toBe(1);
    });

    it("añade copia a carpeta existente sin duplicar", () => {
      let mapa: MapaUbicacionesCerebro = {};
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenDiscoInterno.idVolumen,
        almacenTipo: almacenDiscoInterno.tipo,
        almacenNombre: almacenDiscoInterno.nombre,
        modalidad: "cerebro-completo",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenUSB.idVolumen,
        almacenTipo: almacenUSB.tipo,
        almacenNombre: almacenUSB.nombre,
        modalidad: "parte",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });

      const copias = mapa.carpetas["/cerebros/privado"].copias;
      expect(copias.length).toBe(2);
      expect(copias.map((c) => c.almacenId)).toEqual(
        expect.arrayContaining([almacenDiscoInterno.idVolumen, almacenUSB.idVolumen])
      );
    });

    it("no duplica la misma copia (mismo almacenId + rutaEnAlmacen)", () => {
      let mapa: MapaUbicacionesCerebro = {};
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenDiscoInterno.idVolumen,
        almacenTipo: almacenDiscoInterno.tipo,
        almacenNombre: almacenDiscoInterno.nombre,
        modalidad: "cerebro-completo",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenDiscoInterno.idVolumen,
        almacenTipo: almacenDiscoInterno.tipo,
        almacenNombre: almacenDiscoInterno.nombre,
        modalidad: "cerebro-completo",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });

      expect(mapa.carpetas["/cerebros/privado"].copias.length).toBe(1);
    });
  });

  describe("actualizarEstadoEnLinea", () => {
    it("actualiza el estado en línea de todas las copias de un almacén", () => {
      let mapa: MapaUbicacionesCerebro = {};
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenUSB.idVolumen,
        almacenTipo: almacenUSB.tipo,
        almacenNombre: almacenUSB.nombre,
        modalidad: "parte",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });
      mapa = registrarUbicacion(mapa, "cerebro-1", "/respaldos", {
        almacenId: almacenUSB.idVolumen,
        almacenTipo: almacenUSB.tipo,
        almacenNombre: almacenUSB.nombre,
        modalidad: "respaldo-vivo",
        enLinea: true,
        rutaEnAlmacen: "/respaldos",
        esFundamental: true,
      });

      const actualizado = actualizarEstadoEnLinea(mapa, almacenUSB.idVolumen, false);

      expect(actualizado.carpetas["/cerebros/privado"].copias[0].enLinea).toBe(false);
      expect(actualizado.carpetas["/respaldos"].copias[0].enLinea).toBe(false);
    });

    it("no modifica otros almacenes", () => {
      let mapa: MapaUbicacionesCerebro = {};
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenUSB.idVolumen,
        almacenTipo: almacenUSB.tipo,
        almacenNombre: almacenUSB.nombre,
        modalidad: "parte",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenDiscoInterno.idVolumen,
        almacenTipo: almacenDiscoInterno.tipo,
        almacenNombre: almacenDiscoInterno.nombre,
        modalidad: "cerebro-completo",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });

      const actualizado = actualizarEstadoEnLinea(mapa, almacenUSB.idVolumen, false);

      expect(actualizado.carpetas["/cerebros/privado"].copias[0].enLinea).toBe(false);
      expect(actualizado.carpetas["/cerebros/privado"].copias[1].enLinea).toBe(true);
    });
  });

  describe("obtenerCopiasDeCarpeta", () => {
    it("devuelve todas las copias de una carpeta", () => {
      let mapa: MapaUbicacionesCerebro = {};
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenDiscoInterno.idVolumen,
        almacenTipo: almacenDiscoInterno.tipo,
        almacenNombre: almacenDiscoInterno.nombre,
        modalidad: "cerebro-completo",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenUSB.idVolumen,
        almacenTipo: almacenUSB.tipo,
        almacenNombre: almacenUSB.nombre,
        modalidad: "parte",
        enLinea: false,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });

      const copias = obtenerCopiasDeCarpeta(mapa, "/cerebros/privado");
      expect(copias.length).toBe(2);
      expect(copias.filter((c) => c.enLinea).length).toBe(1);
    });

    it("devuelve array vacío si la carpeta no existe", () => {
      const mapa: MapaUbicacionesCerebro = {};
      const copias = obtenerCopiasDeCarpeta(mapa, "/inexistente");
      expect(copias).toEqual([]);
    });
  });

  describe("obtenerCopiasDeCerebro", () => {
    it("devuelve todas las copias de todas las carpetas del cerebro", () => {
      let mapa: MapaUbicacionesCerebro = {};
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenDiscoInterno.idVolumen,
        almacenTipo: almacenDiscoInterno.tipo,
        almacenNombre: almacenDiscoInterno.nombre,
        modalidad: "cerebro-completo",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });
      mapa = registrarUbicacion(mapa, "cerebro-1", "/respaldos", {
        almacenId: almacenUSB.idVolumen,
        almacenTipo: almacenUSB.tipo,
        almacenNombre: almacenUSB.nombre,
        modalidad: "respaldo-vivo",
        enLinea: true,
        rutaEnAlmacen: "/respaldos",
        esFundamental: true,
      });

      const copias = obtenerCopiasDeCerebro(mapa);
      expect(copias.length).toBe(2);
    });
  });

  describe("esFundamental", () => {
    it("identifica modalidades fundamentales", () => {
      expect(esFundamental("cerebro-completo")).toBe(true);
      expect(esFundamental("parte")).toBe(true);
      expect(esFundamental("respaldo-vivo")).toBe(true);
    });

    it("identifica modalidades NO fundamentales", () => {
      expect(esFundamental("replica")).toBe(false);
      expect(esFundamental("neurona-nodo")).toBe(false);
      expect(esFundamental("secundario")).toBe(false);
    });
  });

  describe("validarReglaDosCopias", () => {
    it("pasa si hay al menos 2 copias en medios distintos para datos fundamentales", () => {
      let mapa: MapaUbicacionesCerebro = {};
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenDiscoInterno.idVolumen,
        almacenTipo: almacenDiscoInterno.tipo,
        almacenNombre: almacenDiscoInterno.nombre,
        modalidad: "cerebro-completo",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenUSB.idVolumen,
        almacenTipo: almacenUSB.tipo,
        almacenNombre: almacenUSB.nombre,
        modalidad: "parte",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });

      const resultado = validarReglaDosCopias(mapa);
      expect(resultado.cumple).toBe(true);
      expect(resultado.incumplimientos.length).toBe(0);
    });

    it("falla si solo hay 1 copia en medio extraíble para datos fundamentales", () => {
      let mapa: MapaUbicacionesCerebro = {};
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenUSB.idVolumen,
        almacenTipo: almacenUSB.tipo,
        almacenNombre: almacenUSB.nombre,
        modalidad: "parte",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });

      const resultado = validarReglaDosCopias(mapa);
      expect(resultado.cumple).toBe(false);
      expect(resultado.incumplimientos.length).toBe(1);
      expect(resultado.incumplimientos[0].tipo).toBe("solo_extraible");
      expect(resultado.incumplimientos[0].ruta).toBe("/cerebros/privado");
      expect(resultado.incumplimientos[0].mensaje).toContain("extraíble");
    });

    it("falla si solo hay 1 copia en cualquier medio para datos fundamentales", () => {
      let mapa: MapaUbicacionesCerebro = {};
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenDiscoInterno.idVolumen,
        almacenTipo: almacenDiscoInterno.tipo,
        almacenNombre: almacenDiscoInterno.nombre,
        modalidad: "cerebro-completo",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });

      const resultado = validarReglaDosCopias(mapa);
      expect(resultado.cumple).toBe(false);
      expect(resultado.incumplimientos.length).toBe(1);
      expect(resultado.incumplimientos[0].tipo).toBe("una_sola_copia");
    });

    it("ignora carpetas no fundamentales (replica, secundario, etc.)", () => {
      let mapa: MapaUbicacionesCerebro = {};
      mapa = registrarUbicacion(mapa, "cerebro-1", "/desarrollo", {
        almacenId: almacenUSB.idVolumen,
        almacenTipo: almacenUSB.tipo,
        almacenNombre: almacenUSB.nombre,
        modalidad: "secundario",
        enLinea: true,
        rutaEnAlmacen: "/desarrollo",
        esFundamental: false,
      });

      const resultado = validarReglaDosCopias(mapa);
      expect(resultado.cumple).toBe(true);
      expect(resultado.incumplimientos.length).toBe(0);
    });

    it("detecta múltiples incumplimientos en distintas carpetas", () => {
      let mapa: MapaUbicacionesCerebro = {};
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenUSB.idVolumen,
        almacenTipo: almacenUSB.tipo,
        almacenNombre: almacenUSB.nombre,
        modalidad: "parte",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });
      mapa = registrarUbicacion(mapa, "cerebro-1", "/otra/parte", {
        almacenId: almacenDiscoInterno.idVolumen,
        almacenTipo: almacenDiscoInterno.tipo,
        almacenNombre: almacenDiscoInterno.nombre,
        modalidad: "parte",
        enLinea: true,
        rutaEnAlmacen: "/otra/parte",
        esFundamental: true,
      });

      const resultado = validarReglaDosCopias(mapa);
      expect(resultado.cumple).toBe(false);
      expect(resultado.incumplimientos.length).toBe(2);
    });
  });

  describe("obtenerEstadoCarpeta", () => {
    it("devuelve 'en_linea' si al menos una copia está en línea", () => {
      let mapa: MapaUbicacionesCerebro = {};
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenDiscoInterno.idVolumen,
        almacenTipo: almacenDiscoInterno.tipo,
        almacenNombre: almacenDiscoInterno.nombre,
        modalidad: "cerebro-completo",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenUSB.idVolumen,
        almacenTipo: almacenUSB.tipo,
        almacenNombre: almacenUSB.nombre,
        modalidad: "parte",
        enLinea: false,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });

      const estado = obtenerEstadoCarpeta(mapa, "/cerebros/privado");
      expect(estado).toBe("en_linea");
    });

    it("devuelve 'fuera_de_linea' si ninguna copia está en línea pero existen copias", () => {
      let mapa: MapaUbicacionesCerebro = {};
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenUSB.idVolumen,
        almacenTipo: almacenUSB.tipo,
        almacenNombre: almacenUSB.nombre,
        modalidad: "parte",
        enLinea: false,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenDiscoInterno.idVolumen,
        almacenTipo: almacenDiscoInterno.tipo,
        almacenNombre: almacenDiscoInterno.nombre,
        modalidad: "cerebro-completo",
        enLinea: false,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });

      const estado = obtenerEstadoCarpeta(mapa, "/cerebros/privado");
      expect(estado).toBe("fuera_de_linea");
    });

    it("devuelve 'sin_copias' si no hay copias registradas", () => {
      const mapa: MapaUbicacionesCerebro = {};
      const estado = obtenerEstadoCarpeta(mapa, "/inexistente");
      expect(estado).toBe("sin_copias");
    });
  });

  describe("obtenerResumenCerebro", () => {
    it("devuelve resumen completo del estado de ubicaciones del cerebro", () => {
      let mapa: MapaUbicacionesCerebro = {};
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenDiscoInterno.idVolumen,
        almacenTipo: almacenDiscoInterno.tipo,
        almacenNombre: almacenDiscoInterno.nombre,
        modalidad: "cerebro-completo",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenUSB.idVolumen,
        almacenTipo: almacenUSB.tipo,
        almacenNombre: almacenUSB.nombre,
        modalidad: "parte",
        enLinea: false,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });
      mapa = registrarUbicacion(mapa, "cerebro-1", "/respaldos", {
        almacenId: almacenNAS.idVolumen,
        almacenTipo: almacenNAS.tipo,
        almacenNombre: almacenNAS.nombre,
        modalidad: "respaldo-vivo",
        enLinea: true,
        rutaEnAlmacen: "/respaldos",
        esFundamental: true,
      });
      mapa = registrarUbicacion(mapa, "cerebro-1", "/desarrollo", {
        almacenId: almacenUSB.idVolumen,
        almacenTipo: almacenUSB.tipo,
        almacenNombre: almacenUSB.nombre,
        modalidad: "secundario",
        enLinea: true,
        rutaEnAlmacen: "/desarrollo",
        esFundamental: false,
      });

      const resumen = obtenerResumenCerebro(mapa);

      expect(resumen.cerebroId).toBe("cerebro-1");
      expect(resumen.totalCarpetas).toBe(3);
      expect(resumen.carpetasEnLinea).toBe(2); // /cerebros/privado y /respaldos
      expect(resumen.carpetasFueraDeLinea).toBe(0);
      expect(resumen.carpetasSinCopias).toBe(0);
      expect(resumen.incumplimientosDosCopias).toBe(0);
      expect(resumen.advertenciasExtraibleUnico).toBe(0);
    });

    it("cuenta advertencias de extraíble como única copia", () => {
      let mapa: MapaUbicacionesCerebro = {};
      mapa = registrarUbicacion(mapa, "cerebro-1", "/cerebros/privado", {
        almacenId: almacenUSB.idVolumen,
        almacenTipo: almacenUSB.tipo,
        almacenNombre: almacenUSB.nombre,
        modalidad: "parte",
        enLinea: true,
        rutaEnAlmacen: "/cerebros/privado",
        esFundamental: true,
      });

      const resumen = obtenerResumenCerebro(mapa);
      expect(resumen.advertenciasExtraibleUnico).toBe(1);
      expect(resumen.incumplimientosDosCopias).toBe(1);
    });
  });
});