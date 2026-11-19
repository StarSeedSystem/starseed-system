import { describe, it, expect } from 'vitest';
import {
  analizarSeguridad,
  ResultadoAnalisisSeguridad,
  SeñalRiesgo,
  TipoAntivirus,
  antivirusDisponibles,
  ejecutarAntivirus,
} from '../analisis-seguridad';

function bytes(arr: number[]): Uint8Array {
  return new Uint8Array(arr);
}

describe('analizarSeguridad', () => {
  describe('tipo real vs extensión', () => {
    it('detecta discrepancia: archivo .txt que es PNG por bytes', async () => {
      const resultado = await analizarSeguridad({
        nombre: 'documento.txt',
        tipoDeclarado: 'text/plain',
        inicio: bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), // PNG
        tamano: 1000,
      });

      expect(resultado.tipoReal).toBe('PNG');
      expect(resultado.extension).toBe('txt');
      expect(resultado.coincideTipoExtension).toBe(false);
      expect(resultado.señalesRiesgo.some(s => s.tipo === 'tipo-discrepante')).toBe(true);
    });

    it('confirma coincidencia: .jpg con bytes JPEG', async () => {
      const resultado = await analizarSeguridad({
        nombre: 'foto.jpg',
        tipoDeclarado: 'image/jpeg',
        inicio: bytes([0xFF, 0xD8, 0xFF, 0xE0]), // JPEG
        tamano: 1000,
      });

      expect(resultado.tipoReal).toBe('JPEG');
      expect(resultado.extension).toBe('jpg');
      expect(resultado.coincideTipoExtension).toBe(true);
    });

    it('detecta ejecutable MZ renombrado a .pdf', async () => {
      const resultado = await analizarSeguridad({
        nombre: 'documento.pdf',
        tipoDeclarado: 'application/pdf',
        inicio: bytes([0x4D, 0x5A, 0x90, 0x00]), // MZ
        tamano: 1000,
      });

      expect(resultado.tipoReal).toBe('Ejecutable DOS (MZ)');
      expect(resultado.señalesRiesgo.some(s => s.tipo === 'ejecutable')).toBe(true);
      expect(resultado.señalesRiesgo.some(s => s.tipo === 'tipo-discrepante')).toBe(true);
    });
  });

  describe('huella SHA-256', () => {
    it('calcula hash del inicio del archivo', async () => {
      const resultado = await analizarSeguridad({
        nombre: 'test.txt',
        tipoDeclarado: 'text/plain',
        inicio: bytes([0x48, 0x65, 0x6C, 0x6C, 0x6F]), // "Hello"
        tamano: 5,
      });

      expect(resultado.hashSha256).toBeDefined();
      expect(resultado.hashSha256.length).toBe(64); // SHA-256 hex
    });
  });

  describe('firma de ejecutable', () => {
    it('detecta firma PE en ejecutable Windows', async () => {
      // MZ header + PE signature at offset 0x3C
      const inicio = new Uint8Array(128);
      inicio[0] = 0x4D; // M
      inicio[1] = 0x5A; // Z
      // PE signature at offset 0x3C (60)
      inicio[60] = 0x50; // P
      inicio[61] = 0x45; // E
      inicio[62] = 0x00;
      inicio[63] = 0x00;

      const resultado = await analizarSeguridad({
        nombre: 'programa.exe',
        tipoDeclarado: 'application/x-msdownload',
        inicio,
        tamano: 1000,
      });

      expect(resultado.firmaEjecutable).toBeDefined();
      expect(resultado.firmaEjecutable?.tipo).toBe('PE');
      expect(resultado.señalesRiesgo.some(s => s.tipo === 'ejecutable')).toBe(true);
    });

    it('detecta firma Mach-O', async () => {
      const inicio = bytes([0xFE, 0xED, 0xFA, 0xCE, 0x00, 0x01, 0x00, 0x00]); // Mach-O 64-bit

      const resultado = await analizarSeguridad({
        nombre: 'app',
        tipoDeclarado: 'application/octet-stream',
        inicio,
        tamano: 1000,
      });

      expect(resultado.firmaEjecutable).toBeDefined();
      expect(resultado.firmaEjecutable?.tipo).toBe('Mach-O');
    });

    it('no detecta firma en archivo normal', async () => {
      const resultado = await analizarSeguridad({
        nombre: 'foto.jpg',
        tipoDeclarado: 'image/jpeg',
        inicio: bytes([0xFF, 0xD8, 0xFF, 0xE0]),
        tamano: 1000,
      });

      expect(resultado.firmaEjecutable).toBeUndefined();
    });
  });

  describe('señales de riesgo', () => {
    it('detecta macros de Office (vbaProject.bin)', async () => {
      const resultado = await analizarSeguridad({
        nombre: 'documento.docx',
        tipoDeclarado: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        inicio: bytes([0x50, 0x4B, 0x03, 0x04]), // ZIP
        tamano: 1000,
        entradasZip: [
          { ruta: 'word/document.xml', tamano: 1000, comprimido: 500 },
          { ruta: 'vbaProject.bin', tamano: 2000, comprimido: 1000 },
        ],
      });

      expect(resultado.señalesRiesgo.some(s => s.tipo === 'macro')).toBe(true);
    });

    it('detecta scripts (shebang)', async () => {
      const resultado = await analizarSeguridad({
        nombre: 'script.sh',
        tipoDeclarado: 'application/x-shellscript',
        inicio: bytes([0x23, 0x21, 0x2F, 0x62, 0x69, 0x6E, 0x2F, 0x62, 0x61, 0x73, 0x68]), // #!/bin/bash
        tamano: 100,
      });

      expect(resultado.señalesRiesgo.some(s => s.tipo === 'script')).toBe(true);
    });

    it('detecta JavaScript en HTML/SVG', async () => {
      const resultado = await analizarSeguridad({
        nombre: 'imagen.svg',
        tipoDeclarado: 'image/svg+xml',
        inicio: bytes('<svg><script>alert(1)</script></svg>'.split('').map(c => c.charCodeAt(0))),
        tamano: 100,
      });

      expect(resultado.señalesRiesgo.some(s => s.tipo === 'script')).toBe(true);
    });

    it('detecta ZIP anidado', async () => {
      const resultado = await analizarSeguridad({
        nombre: 'archivo.zip',
        tipoDeclarado: 'application/zip',
        inicio: bytes([0x50, 0x4B, 0x03, 0x04]),
        tamano: 1000,
        entradasZip: [
          { ruta: 'interno.zip', tamano: 500, comprimido: 200 },
          { ruta: 'normal.txt', tamano: 100, comprimido: 50 },
        ],
      });

      expect(resultado.señalesRiesgo.some(s => s.tipo === 'zip-anidado')).toBe(true);
    });

    it('detecta rutas peligrosas en ZIP (path traversal)', async () => {
      const resultado = await analizarSeguridad({
        nombre: 'malicioso.zip',
        tipoDeclarado: 'application/zip',
        inicio: bytes([0x50, 0x4B, 0x03, 0x04]),
        tamano: 1000,
        entradasZip: [
          { ruta: '../etc/passwd', tamano: 100, comprimido: 50 },
        ],
      });

      expect(resultado.señalesRiesgo.some(s => s.tipo === 'ruta-peligrosa')).toBe(true);
    });

    it('detecta ratio de compresión excesivo (zip bomb)', async () => {
      const resultado = await analizarSeguridad({
        nombre: 'bomba.zip',
        tipoDeclarado: 'application/zip',
        inicio: bytes([0x50, 0x0B, 0x03, 0x04]),
        tamano: 1000,
        entradasZip: [
          { ruta: 'grande.dat', tamano: 11 * 1024 * 1024, comprimido: 1000 }, // ratio > 100
        ],
      });

      expect(resultado.señalesRiesgo.some(s => s.tipo === 'zip-bomba')).toBe(true);
    });

    it('detecta PDF con JavaScript', async () => {
      const resultado = await analizarSeguridad({
        nombre: 'doc.pdf',
        tipoDeclarado: 'application/pdf',
        inicio: bytes('%PDF-1.4\n/JS /JavaScript'.split('').map(c => c.charCodeAt(0))),
        tamano: 1000,
      });

      expect(resultado.señalesRiesgo.some(s => s.tipo === 'pdf-javascript')).toBe(true);
    });
  });

  describe('archivo limpio', () => {
    it('no reporta señales en archivo JPEG normal', async () => {
      const resultado = await analizarSeguridad({
        nombre: 'foto.jpg',
        tipoDeclarado: 'image/jpeg',
        inicio: bytes([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00]),
        tamano: 1000,
      });

      expect(resultado.señalesRiesgo.length).toBe(0);
      expect(resultado.nivelRiesgo).toBe('bajo');
    });

    it('no reporta señales en PDF normal', async () => {
      const resultado = await analizarSeguridad({
        nombre: 'doc.pdf',
        tipoDeclarado: 'application/pdf',
        inicio: bytes('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< >>\nendobj'.split('').map(c => c.charCodeAt(0))),
        tamano: 1000,
      });

      expect(resultado.señalesRiesgo.length).toBe(0);
      expect(resultado.nivelRiesgo).toBe('bajo');
    });
  });

  describe('nivel de riesgo', () => {
    it('riesgo alto para ejecutable', async () => {
      const resultado = await analizarSeguridad({
        nombre: 'malware.exe',
        tipoDeclarado: 'application/pdf',
        inicio: bytes([0x4D, 0x5A]),
        tamano: 1000,
      });
      expect(resultado.nivelRiesgo).toBe('alto');
    });

    it('riesgo medio para macro', async () => {
      const resultado = await analizarSeguridad({
        nombre: 'doc.docx',
        tipoDeclarado: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        inicio: bytes([0x50, 0x4B, 0x03, 0x04]),
        tamano: 1000,
        entradasZip: [{ ruta: 'vbaProject.bin', tamano: 100, comprimido: 50 }],
      });
      expect(resultado.nivelRiesgo).toBe('medio');
    });

    it('riesgo medio para tipo discrepante', async () => {
      const resultado = await analizarSeguridad({
        nombre: 'foto.txt',
        tipoDeclarado: 'text/plain',
        inicio: bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), // PNG completo
        tamano: 1000,
      });
      expect(resultado.nivelRiesgo).toBe('medio');
    });
  });
});

describe('antivirusDisponibles', () => {
  it('devuelve lista de antivirus del sistema en orden de prioridad', () => {
    const disponibles = antivirusDisponibles();
    // Debe incluir al menos ClamAV, XProtect, Defender en ese orden
    expect(disponibles).toContain('clamav');
    expect(disponibles).toContain('xprotect');
    expect(disponibles).toContain('defender');
    // ClamAV primero
    expect(disponibles[0]).toBe('clamav');
  });
});

describe('ejecutarAntivirus', () => {
  it('reporta ClamAV no disponible en entorno de test', async () => {
    const resultado = await ejecutarAntivirus('clamav', new Uint8Array([1, 2, 3]), 'test.txt');
    expect(resultado.antivirus).toBe('clamav');
    expect(resultado.ejecutado).toBe(false);
    expect(resultado.error).toBeDefined();
  });

  it('reporta XProtect no disponible en entorno de test', async () => {
    const resultado = await ejecutarAntivirus('xprotect', new Uint8Array([1, 2, 3]), 'test.txt');
    expect(resultado.antivirus).toBe('xprotect');
    expect(resultado.ejecutado).toBe(false);
    expect(resultado.error).toBeDefined();
  });

  it('reporta Defender no disponible en entorno de test', async () => {
    const resultado = await ejecutarAntivirus('defender', new Uint8Array([1, 2, 3]), 'test.txt');
    expect(resultado.antivirus).toBe('defender');
    expect(resultado.ejecutado).toBe(false);
    expect(resultado.error).toBeDefined();
  });

  it('devuelve error si antivirus no existe', async () => {
    const resultado = await ejecutarAntivirus('inexistente' as any, new Uint8Array([1, 2, 3]), 'test.txt');
    expect(resultado.ejecutado).toBe(false);
    expect(resultado.error).toBeDefined();
  });
});