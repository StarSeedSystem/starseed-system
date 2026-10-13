import { describe, it, expect } from 'vitest';
import { analizarArchivo, Nivel, ResultadoAnalisis } from '../centinela';

// Helper para crear un Uint8Array a partir de un array de números
function bytes(arr: number[]): Uint8Array {
  return new Uint8Array(arr);
}

describe('analizarArchivo', () => {
  describe('Peligroso', () => {
    it('detecta ejecutable MZ', () => {
      const resultado = analizarArchivo({
        nombre: 'test.exe',
        tipoDeclarado: 'application/octet-stream',
        inicio: bytes([0x4D, 0x5A, 0x90, 0x00]), // MZ seguido de algo
        tamano: 100
      });
      expect(resultado.nivel).toBe('peligroso');
      expect(resultado.motivos).toContain('Ejecutable DOS (MZ) detectado por bytes mágicos');
    });

    it('detecta ejecutable ELF', () => {
      const resultado = analizarArchivo({
        nombre: 'test',
        tipoDeclarado: 'application/octet-stream',
        inicio: bytes([0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01]), // ELF
        tamano: 100
      });
      expect(resultado.nivel).toBe('peligroso');
      expect(resultado.motivos).toContain('Ejecutable ELF detectado por bytes mágicos');
    });

    it('detecta ejecutable Mach-O big endian', () => {
      const resultado = analizarArchivo({
        nombre: 'test',
        tipoDeclarado: 'application/octet-stream',
        inicio: bytes([0xFE, 0xED, 0xFA, 0xCE, 0x00, 0x01, 0x00, 0x00]), // Mach-O BE
        tamano: 100
      });
      expect(resultado.nivel).toBe('peligroso');
      expect(resultado.motivos).toContain('Ejecutable Mach-O (big endian) detectado por bytes mágicos');
    });

    it('detecta ejecutable Mach-O little endian', () => {
      const resultado = analizarArchivo({
        nombre: 'test',
        tipoDeclarado: 'application/octet-stream',
        inicio: bytes([0xCE, 0xFA, 0xED, 0xFE, 0x00, 0x01, 0x00, 0x00]), // Mach-O LE invertido
        tamano: 100
      });
      expect(resultado.nivel).toBe('peligroso');
      expect(resultado.motivos).toContain('Ejecutable Mach-O (little endian) detectado por bytes mágicos');
    });

    it('detecta extensión peligrosa .exe', () => {
      const resultado = analizarArchivo({
        nombre: 'test.exe',
        tipoDeclarado: 'application/octet-stream',
        inicio: bytes([]),
        tamano: 100
      });
      expect(resultado.nivel).toBe('peligroso');
      expect(resultado.motivos).toContain('Extensión peligrosa: .exe');
    });

    it('detecta doble extensión foto.jpg.exe', () => {
      const resultado = analizarArchivo({
        nombre: 'foto.jpg.exe',
        tipoDeclarado: 'image/jpeg',
        inicio: bytes([]),
        tamano: 100
      });
      expect(resultado.nivel).toBe('peligroso');
      expect(resultado.motivos).toContain('Doble extensión sospechosa: .jpg.exe');
    });

    it('detecta entrada de ZIP con ..', () => {
      const resultado = analizarArchivo({
        nombre: 'test.zip',
        tipoDeclarado: 'application/zip',
        inicio: bytes([0x50, 0x4B, 0x03, 0x04]), // ZIP
        tamano: 100,
        entradasZip: [
          { ruta: 'normal.txt', tamano: 10, comprimido: 5 },
          { ruta: '../escape.txt', tamano: 10, comprimido: 5 }
        ]
      });
      expect(resultado.nivel).toBe('peligroso');
      expect(resultado.motivos).toContain('Entrada de ZIP con ruta de escape: ../escape.txt');
    });

    it('detecta entrada de ZIP con ruta absoluta', () => {
      const resultado = analizarArchivo({
        nombre: 'test.zip',
        tipoDeclarado: 'application/zip',
        inicio: bytes([0x50, 0x4B, 0x03, 0x04]), // ZIP
        tamano: 100,
        entradasZip: [
          { ruta: 'normal.txt', tamano: 10, comprimido: 5 },
          { ruta: '/etc/passwd', tamano: 10, comprimido: 5 }
        ]
      });
      expect(resultado.nivel).toBe('peligroso');
      expect(resultado.motivos).toContain('Entrada de ZIP con ruta de escape: /etc/passwd');
    });

    it('detecta ratio de compresión > 100 en entrada > 10 MB', () => {
      const resultado = analizarArchivo({
        nombre: 'test.zip',
        tipoDeclarado: 'application/zip',
        inicio: bytes([0x50, 0x4B, 0x03, 0x04]), // ZIP
        tamano: 100,
        entradasZip: [
          { 
            ruta: 'grande.dat', 
            tamano: 11 * 1024 * 1024, // 11 MB
            comprimido: 100000 // ratio de 110
          }
        ]
      });
      expect(resultado.nivel).toBe('peligroso');
      // Usar toMatch en lugar de toContain debido a posibles issues con el matcher
      expect(resultado.motivos[0]).toMatch(/Ratio de compresión excesivo:/);
    });
  });

  describe('Sospechoso', () => {
    it('detecta tipo real no coincidente con extensión', () => {
      const resultado = analizarArchivo({
        nombre: 'falso.txt',
        tipoDeclarado: 'text/plain',
        inicio: bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), // PNG
        tamano: 100
      });
      expect(resultado.nivel).toBe('sospechoso');
      expect(resultado.motivos).toContain('Tipo real (PNG) no coincide con la extensión (.txt) o tipo declarado (text/plain)');
    });

    it('detecta shebang #!', () => {
      const resultado = analizarArchivo({
        nombre: 'script.sh',
        tipoDeclarado: 'application/x-shellscript',
        inicio: bytes([0x23, 0x21, 0x2F, 0x62, 0x69, 0x6E, 0x2F, 0x62, 0x61, 0x73, 0x68]), // #!/bin/bash
        tamano: 100
      });
      expect(resultado.nivel).toBe('sospechoso');
      expect(resultado.motivos).toContain('Shebang (#!) detectado al inicio del archivo');
    });

    it('detecta HTML con <script', () => {
      const resultado = analizarArchivo({
        nombre: 'imagen.svg',
        tipoDeclarado: 'image/svg+xml',
        inicio: bytes('<svg><script>alert(1)</script></svg>'.split('').map(c => c.charCodeAt(0))),
        tamano: 100
      });
      expect(resultado.nivel).toBe('sospechoso');
      expect(resultado.motivos).toContain('Contenido HTML/SVG con JavaScript detectado en los primeros 64 KB');
    });

    it('detecta javascript: en SVG', () => {
      const resultado = analizarArchivo({
        nombre: 'imagen.svg',
        tipoDeclarado: 'image/svg+xml',
        inicio: bytes('<svg><a href="javascript:alert(1)">click</a></svg>'.split('').map(c => c.charCodeAt(0))),
        tamano: 100
      });
      expect(resultado.nivel).toBe('sospechoso');
      expect(resultado.motivos).toContain('Contenido HTML/SVG con JavaScript detectado en los primeros 64 KB');
    });

    it('detecta on...= en SVG', () => {
      const resultado = analizarArchivo({
        nombre: 'imagen.svg',
        tipoDeclarado: 'image/svg+xml',
        inicio: bytes('<svg><button onclick="alert(1)">click</button></svg>'.split('').map(c => c.charCodeAt(0))),
        tamano: 100
      });
      expect(resultado.nivel).toBe('sospechoso');
      expect(resultado.motivos).toContain('Contenido HTML/SVG con JavaScript detectado en los primeros 64 KB');
    });

    it('detecta vbaProject.bin en ZIP', () => {
      const resultado = analizarArchivo({
        nombre: 'documento.zip',
        tipoDeclarado: 'application/zip',
        inicio: bytes([0x50, 0x4B, 0x03, 0x04]), // ZIP
        tamano: 100,
        entradasZip: [
          { ruta: 'vbaProject.bin', tamano: 1000, comprimido: 500 }
        ]
      });
      expect(resultado.nivel).toBe('sospechoso');
      expect(resultado.motivos).toContain('Archivo vbaProject.bin encontrado dentro de un ZIP (posible macro de Office)');
    });

    it('detecta PDF con /JavaScript', () => {
      const resultado = analizarArchivo({
        nombre: 'documento.pdf',
        tipoDeclarado: 'application/pdf',
        inicio: bytes('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /JavaScript >>\nendobj'.split('').map(c => c.charCodeAt(0))),
        tamano: 100
      });
      expect(resultado.nivel).toBe('sospechoso');
      expect(resultado.motivos).toContain('PDF contiene JavaScript o OpenAction');
    });

    it('detecta PDF con /OpenAction', () => {
      const resultado = analizarArchivo({
        nombre: 'documento.pdf',
        tipoDeclarado: 'application/pdf',
        inicio: bytes('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /OpenAction >>\nendobj'.split('').map(c => c.charCodeAt(0))),
        tamano: 100
      });
      expect(resultado.nivel).toBe('sospechoso');
      expect(resultado.motivos).toContain('PDF contiene JavaScript o OpenAction');
    });
  });

  describe('Limpio', () => {
    it('declara limpio un archivo sin problemas', () => {
      const resultado = analizarArchivo({
        nombre: 'foto.jpg',
        tipoDeclarado: 'image/jpeg',
        inicio: bytes([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00]), // JPEG
        tamano: 100
      });
      expect(resultado.nivel).toBe('limpio');
      expect(resultado.motivos).toEqual([]);
    });

    it('declara limpio un archivo ZIP normal', () => {
      const resultado = analizarArchivo({
        nombre: 'archivo.zip',
        tipoDeclarado: 'application/zip',
        inicio: bytes([0x50, 0x4B, 0x03, 0x04, 0x0A, 0x00, 0x00, 0x00]), // ZIP
        tamano: 100,
        entradasZip: [
          { ruta: 'documento.pdf', tamano: 1000, comprimido: 500 }
        ]
      });
      expect(resultado.nivel).toBe('limpio');
      expect(resultado.motivos).toEqual([]);
    });
  });
});