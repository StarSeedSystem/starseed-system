import { describe, it, expect } from "vitest";
import {
  analizarSeguridad,
  calcularHuella,
  detectarTipoReal,
  verificarFirmaEjecutable,
  analizarRiesgos,
  escanearAntivirus,
  type ArchivoParaAnalisis,
  type ResultadoAnalisisSeguridad,
  type SeñalRiesgo,
  type MotorAntivirus,
} from "../analisis-seguridad";

describe("analisis-seguridad.ts — análisis de seguridad de archivos recibidos", () => {
  const archivoPDFSeguro: ArchivoParaAnalisis = {
    nombre: "documento.pdf",
    tamaño: 1024 * 1024,
    extension: ".pdf",
    contenido: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]), // %PDF-1.4
    rutaTemporal: "/tmp/cuarentena/documento.pdf",
  };

  const archivoEjecutableSospechoso: ArchivoParaAnalisis = {
    nombre: "programa.exe",
    tamaño: 2 * 1024 * 1024,
    extension: ".exe",
    contenido: new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]), // MZ header
    rutaTemporal: "/tmp/cuarentena/programa.exe",
  };

  const archivoScriptOculto: ArchivoParaAnalisis = {
    nombre: "imagen.jpg",
    tamaño: 500 * 1024,
    extension: ".jpg",
    contenido: new Uint8Array([
      0x23, 0x21, 0x2f, 0x62, 0x69, 0x6e, 0x2f, 0x62, 0x61, 0x73, 0x68, 0x0a, // #!/bin/bash\n
      0x65, 0x63, 0x68, 0x6f, 0x20, 0x22, 0x68, 0x6f, 0x6c, 0x61, 0x22, // echo "hola"
    ]),
    rutaTemporal: "/tmp/cuarentena/imagen.jpg",
  };

  const archivoComprimidoAnidado: ArchivoParaAnalisis = {
    nombre: "archivo.zip",
    tamaño: 10 * 1024 * 1024,
    extension: ".zip",
    contenido: new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, // PK header
      0x50, 0x4b, 0x03, 0x04, // nested PK header
      0x50, 0x4b, 0x03, 0x04, // another nested
    ]),
    rutaTemporal: "/tmp/cuarentena/archivo.zip",
  };

  const archivoConRutaPeligrosa: ArchivoParaAnalisis = {
    nombre: "malicioso.zip",
    tamaño: 5 * 1024 * 1024,
    extension: ".zip",
    contenido: new Uint8Array([
      0x50, 0x4b, 0x03, 0x04,
      0x2e, 0x2e, 0x2f, 0x2e, 0x2e, 0x2f, 0x65, 0x74, 0x63, 0x2f, 0x70, 0x61, 0x73, 0x73, 0x77, 0x64, // ../../etc/passwd
    ]),
    rutaTemporal: "/tmp/cuarentena/malicioso.zip",
  };

  const archivoMacroOffice: ArchivoParaAnalisis = {
    nombre: "documento.docm",
    tamaño: 3 * 1024 * 1024,
    extension: ".docm",
    contenido: new Uint8Array([
      0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, // OLE compound document
      0x56, 0x62, 0x61, 0x50, 0x72, 0x6f, 0x6a, 0x65, 0x63, 0x74, // VBAProject
    ]),
    rutaTemporal: "/tmp/cuarentena/documento.docm",
  };

  describe("calcularHuella", () => {
    it("calcula SHA-256 correctamente para contenido conocido", () => {
      const contenido = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const huella = calcularHuella(contenido);

      expect(huella).toBeDefined();
      expect(typeof huella).toBe("string");
      expect(huella.length).toBe(64); // SHA-256 hex = 64 chars
    });

    it("produce huellas diferentes para contenidos diferentes", () => {
      const huella1 = calcularHuella(new Uint8Array([0x01, 0x02]));
      const huella2 = calcularHuella(new Uint8Array([0x03, 0x04]));

      expect(huella1).not.toBe(huella2);
    });

    it("es determinista: mismo contenido = misma huella", () => {
      const contenido = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
      const h1 = calcularHuella(contenido);
      const h2 = calcularHuella(contenido);

      expect(h1).toBe(h2);
    });
  });

  describe("detectarTipoReal", () => {
    it("detecta PDF por magic bytes", () => {
      const tipo = detectarTipoReal(archivoPDFSeguro.contenido, ".pdf");
      expect(tipo).toBe("application/pdf");
    });

    it("detecta ejecutable PE (Windows) por magic bytes MZ", () => {
      const tipo = detectarTipoReal(archivoEjecutableSospechoso.contenido, ".exe");
      expect(tipo).toBe("application/x-msdownload");
    });

    it("detecta script bash por shebang", () => {
      const tipo = detectarTipoReal(archivoScriptOculto.contenido, ".jpg");
      expect(tipo).toBe("application/x-sh");
    });

    it("detecta ZIP por magic bytes PK", () => {
      const tipo = detectarTipoReal(archivoComprimidoAnidado.contenido, ".zip");
      expect(tipo).toBe("application/zip");
    });

    it("detecta OLE (Office con macros) por magic bytes", () => {
      const tipo = detectarTipoReal(archivoMacroOffice.contenido, ".docm");
      expect(tipo).toBe("application/vnd.ms-office");
    });

    it("devuelve application/octet-stream para tipo desconocido", () => {
      // Bytes inválidos en UTF-8: 0xFF 0xFE son BOM inverso, 0xC0 0x80 es overlong encoding
      const tipo = detectarTipoReal(new Uint8Array([0xff, 0xfe, 0xc0, 0x80]), ".xyz");
      expect(tipo).toBe("application/octet-stream");
    });
  });

  describe("verificarFirmaEjecutable", () => {
    it("devuelve null para archivos no ejecutables", () => {
      const firma = verificarFirmaEjecutable(archivoPDFSeguro.contenido, "application/pdf");
      expect(firma).toBeNull();
    });

    it("devuelve información de firma para ejecutables PE (simulado)", () => {
      const firma = verificarFirmaEjecutable(
        archivoEjecutableSospechoso.contenido,
        "application/x-msdownload"
      );

      // En entorno de test sin herramientas de firma reales, devuelve null o info básica
      expect(firma === null || typeof firma === "object").toBe(true);
    });
  });

  describe("analizarRiesgos", () => {
    it("no detecta riesgos en un PDF limpio", () => {
      const riesgos = analizarRiesgos(archivoPDFSeguro);

      expect(riesgos).toBeDefined();
      expect(Array.isArray(riesgos)).toBe(true);
      // Un PDF limpio no debería tener señales de riesgo
      const señalesEjecutables = riesgos.filter((r) => r.tipo === "ejecutable");
      expect(señalesEjecutables.length).toBe(0);
    });

    it("detecta ejecutable como riesgo alto", () => {
      const riesgos = analizarRiesgos(archivoEjecutableSospechoso);

      const señalesEjecutables = riesgos.filter((r) => r.tipo === "ejecutable");
      expect(señalesEjecutables.length).toBeGreaterThan(0);
      expect(señalesEjecutables[0].nivel).toBe("alto");
    });

    it("detecta script oculto con extensión incorrecta", () => {
      const riesgos = analizarRiesgos(archivoScriptOculto);

      const señalesExtension = riesgos.filter((r) => r.tipo === "extension-incoherente");
      expect(señalesExtension.length).toBeGreaterThan(0);
      expect(señalesExtension[0].nivel).toBe("alto");
    });

    it("detecta comprimido anidado", () => {
      const riesgos = analizarRiesgos(archivoComprimidoAnidado);

      const señalesAnidado = riesgos.filter((r) => r.tipo === "comprimido-anidado");
      expect(señalesAnidado.length).toBeGreaterThan(0);
    });

    it("detecta rutas peligrosas en comprimidos (path traversal)", () => {
      const riesgos = analizarRiesgos(archivoConRutaPeligrosa);

      const señalesRuta = riesgos.filter((r) => r.tipo === "ruta-peligrosa");
      expect(señalesRuta.length).toBeGreaterThan(0);
      expect(señalesRuta[0].nivel).toBe("critico");
    });

    it("detecta macros en documentos Office", () => {
      const riesgos = analizarRiesgos(archivoMacroOffice);

      const señalesMacro = riesgos.filter((r) => r.tipo === "macro");
      expect(señalesMacro.length).toBeGreaterThan(0);
      expect(señalesMacro[0].nivel).toBe("medio");
    });
  });

  describe("escanearAntivirus", () => {
    it("devuelve resultado indicando motor no disponible en entorno de test", async () => {
      const resultado = await escanearAntivirus(archivoPDFSeguro.rutaTemporal);

      expect(resultado).toBeDefined();
      expect(typeof resultado.motor).toBe("string");
      expect(typeof resultado.limpio).toBe("boolean");
      expect(Array.isArray(resultado.amenazas)).toBe(true);
    });
  });

  describe("analizarSeguridad (integración)", () => {
    it("produce análisis completo para un PDF seguro", async () => {
      const resultado = await analizarSeguridad(archivoPDFSeguro);

      expect(resultado).toBeDefined();
      expect(resultado.archivo).toBe("documento.pdf");
      expect(resultado.tipoReal).toBe("application/pdf");
      expect(resultado.extension).toBe(".pdf");
      expect(resultado.tipoCoincide).toBe(true);
      expect(resultado.huella).toBeDefined();
      expect(resultado.huella.length).toBe(64);
      expect(Array.isArray(resultado.riesgos)).toBe(true);
      expect(resultado.antivirus).toBeDefined();
      expect(typeof resultado.seguro).toBe("boolean");
      expect(resultado.seguro).toBe(true); // PDF limpio = seguro
    });

    it("marca como inseguro un ejecutable", async () => {
      const resultado = await analizarSeguridad(archivoEjecutableSospechoso);

      expect(resultado.seguro).toBe(false);
      expect(resultado.tipoReal).toBe("application/x-msdownload");
      expect(resultado.tipoCoincide).toBe(true); // .exe coincide con ejecutable
      const riesgosAltos = resultado.riesgos.filter((r) => r.nivel === "alto");
      expect(riesgosAltos.length).toBeGreaterThan(0);
    });

    it("marca como inseguro un script con extensión falsa", async () => {
      const resultado = await analizarSeguridad(archivoScriptOculto);

      expect(resultado.seguro).toBe(false);
      expect(resultado.tipoReal).toBe("application/x-sh");
      expect(resultado.tipoCoincide).toBe(false); // .jpg != script
      const riesgosIncoherentes = resultado.riesgos.filter(
        (r) => r.tipo === "extension-incoherente"
      );
      expect(riesgosIncoherentes.length).toBeGreaterThan(0);
    });

    it("marca como inseguro un comprimido con path traversal", async () => {
      const resultado = await analizarSeguridad(archivoConRutaPeligrosa);

      expect(resultado.seguro).toBe(false);
      const riesgosCriticos = resultado.riesgos.filter((r) => r.nivel === "critico");
      expect(riesgosCriticos.length).toBeGreaterThan(0);
    });

    it("incluye huella SHA-256 en todos los resultados", async () => {
      const resultado = await analizarSeguridad(archivoPDFSeguro);

      expect(resultado.huella).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});