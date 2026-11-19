// Test suite para analisis-seguridad.ts (análisis de seguridad pura)
// TDD: las pruebas buscan el contrato, no la implementación interna.
import { describe, expect, it } from "vitest";
import { Nivel, AnalisisEntrada, ResultadoAnalisis, analizarArchivo } from "@/lib/transferencias/analisis-seguridad";

describe("analisis-seguridad", () => {
  function crearEntrada(
    nombre: string,
    inicio: Uint8Array,
    tamano: number,
    tipoDeclarado?: string,
    entradasZip?: Array<{ ruta: string; tamano: number; comprimido: number }>,
    entradasCerebro?: Array<{ ruta: string; tamano: number; tipo?: string }>,
  ): AnalisisEntrada {
    return {
      nombre,
      inicio,
      tamano,
      ...(tipoDeclarado !== undefined && { tipoDeclarado }),
      ...(entradasZip !== undefined && { entradasZip }),
      ...(entradasCerebro !== undefined && { entradasCerebro }),
    };
  }

  describe("detectar Ejecutable DOS (MZ)", () => {
    it("detecta MZ en el inicio", () => {
      const inicio = new Uint8Array([0x4D, 0x5A, 0x90, 0x00]);
      const entrada = crearEntrada("malicioso.exe", inicio, 4096);
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('peligroso');
      expect(resultado.motivos).toContain('Ejecutable DOS (MZ) detectado por bytes mágicos');
    });

    it("no false positive con otros bytes", () => {
      const inicio = new Uint8Array([0x50, 0x4E, 0x47, 0x0D]);
      const entrada = crearEntrada("imagen.png", inicio, 4096);
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('limpio');
    });
  });

  describe("detectar Ejecutable ELF", () => {
    it("detecta ELF en el inicio", () => {
      const inicio = new Uint8Array([0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01]);
      const entrada = crearEntrada("binario", inicio, 4096);
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('peligroso');
      expect(resultado.motivos).toContain('Ejecutable ELF detectado por bytes mágicos');
    });
  });

  describe("detectar Mach-O (big endian)", () => {
    it("detecta Mach-O FE ED FA CE", () => {
      const inicio = new Uint8Array([0xFE, 0xED, 0xFA, 0xCE]);
      const entrada = crearEntrada("mac.exe", inicio, 4096);
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('peligroso');
      expect(resultado.motivos).toContain('Ejecutable Mach-O (big endian) detectado por bytes mágicos');
    });
  });

  describe("detectar Extensiones peligrosas", () => {
    it("detecta extensión .exe", () => {
      const inicio = new Uint8Array([0x50, 0x4E]);
      const entrada = crearEntrada("virus.exe", inicio, 4096);
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('peligroso');
      expect(resultado.motivos).toContain('Extensión peligrosa: .exe');
    });

    it("no detecta extensión segura", () => {
      const inicio = new Uint8Array([0x50, 0x4E]);
      const entrada = crearEntrada("foto.jpg", inicio, 4096);
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('limpio');
    });
  });

  describe("detectar Doble extensión (.jpg.exe)", () => {
    it("detecta doble extensión peligrosa", () => {
      const inicio = new Uint8Array([0x50, 0x4E]);
      const entrada = crearEntrada("foto.jpg.exe", inicio, 4096);
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('peligroso');
      expect(resultado.motivos).toContain('Doble extensión sospechosa: .jpg.exe');
    });

    it("no detecta doble extensión segura (.txt.jpg)", () => {
      const inicio = new Uint8Array([0x50, 0x4E]);
      const entrada = crearEntrada("documento.txt.jpg", inicio, 4096);
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('limpio');
    });
  });

  describe("detectar Shebang (#!)", () => {
    it("detecta shebang", () => {
      const inicio = new Uint8Array([0x23, 0x21, 0x2F, 0x62, 0x69, 0x6E]);
      const entrada = crearEntrada("script.sh", inicio, 4096);
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('sospechoso');
      expect(resultado.motivos).toContain('Shebang (#!) detectado al inicio del archivo');
    });
  });

  describe("detectar Tipo real vs extensión", () => {
    it("detecta PNG pero extensión .exe", () => {
      const inicio = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const entrada = crearEntrada("fake.exe", inicio, 4096);
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('peligroso');
      expect(resultado.motivos).toContain('Extensión peligrosa: .exe');
    });

    it("permite extensión correcta para tipo declarado", () => {
      const inicio = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const entrada = crearEntrada("imagen.png", inicio, 4096, 'image/png');
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('limpio');
    });
  });

  describe("detectar HTML/SVG con JavaScript", () => {
    it("detecta <script en el inicio", () => {
      const inicio = new Uint8Array([0x3C, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74]);
      const entrada = crearEntrada("pagina.html", inicio, 4096);
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('sospechoso');
      expect(resultado.motivos).toContain('Contenido HTML/SVG con JavaScript detectado en los primeros 64 KB');
    });
  });

  describe("detectar vbaProject.bin", () => {
    it("detecta vbaProject.bin en entradas ZIP", () => {
      const inicio = new Uint8Array([0x50, 0x4B, 0x03, 0x04]);
      const entradasZip = [{ ruta: "vbaProject.bin", tamano: 1000, comprimido: 500 }];
      const entrada = crearEntrada("macro.docx", inicio, 4096, undefined, entradasZip);
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('peligroso');
      expect(resultado.motivos).toContain('Archivo vbaProject.bin encontrado dentro de un ZIP (posible macro de Office)');
    });
  });

  describe("detectar rutas de escape en ZIP (..)", () => {
    it("detecta ruta ../malicioso", () => {
      const inicio = new Uint8Array([0x50, 0x4B]);
      const entradasZip = [{ ruta: "../a.txt", tamano: 100, comprimido: 50 }];
      const entrada = crearEntrada("mal.zip", inicio, 4096, undefined, entradasZip);
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('peligroso');
      expect(resultado.motivos).toContain('Entrada de ZIP con ruta de escape: ../a.txt');
    });
  });

  describe("detectar compresión excesiva", () => {
    it("detecta ratio > 100 en entrada >10 MB", () => {
      const inicio = new Uint8Array([0x50, 0x4B]);
      const entradasZip = [{ ruta: "archivo.bin", tamano: 20 * 1024 * 1024, comprimido: 100 * 1024 }];
      const entrada = crearEntrada("big.zip", inicio, 4096, undefined, entradasZip);
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('peligroso');
      expect(resultado.motivos).toContain('Ratio de compresión excesivo');
    });
  });

  describe("detectar ZIP dentro de ZIP", () => {
    it("detecta .zip dentro de .zip", () => {
      const inicio = new Uint8Array([0x50, 0x4B]);
      const entradasZip = [{ ruta: "infectado.zip", tamano: 100, comprimido: 50 }];
      const entrada = crearEntrada("contenedor.zip", inicio, 4096, undefined, entradasZip);
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('sospechoso');
      expect(resultado.motivos).toContain('Archivo comprimido dentro de otro comprimido: infectado.zip');
    });
  });

  describe("detectar entradas de cerebros con tipos sospechosos", () => {
    it("detecta tipo ejecutable en entrada de cerebro", () => {
      const inicio = new Uint8Array([0x50, 0x4B]);
      const entradasCerebro = [{ ruta: "mal.exe", tamano: 100, tipo: "executable" }];
      const entrada = crearEntrada("cerebro", inicio, 4096, undefined, undefined, entradasCerebro);
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('sospechoso');
      expect(resultado.motivos).toContain('Entrada de cerebro con tipo ejecutable sospechoso: mal.exe (executable)');
    });
  });

  describe("caso de archivo limpio", () => {
    it("devuelve limpio para archivo PNG seguro", () => {
      const inicio = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const entrada = crearEntrada("foto.png", inicio, 4096, 'image/png');
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('limpio');
      expect(resultado.motivos).toHaveLength(0);
    });

    it("devuelve limpio para archivo JPEG seguro", () => {
      const inicio = new Uint8Array([0xFF, 0xD8, 0xFF]);
      const entrada = crearEntrada("foto.jpg", inicio, 4096, 'image/jpeg');
      const resultado = analizarArchivo(entrada);
      expect(resultado.nivel).toBe('limpio');
      expect(resultado.motivos).toHaveLength(0);
    });
  });
});