import { describe, it, expect } from 'vitest';
import { analizarArchivo, Nivel } from '../centinela';

describe('centinela', () => {
  it('should detect executable by MZ magic bytes', () => {
    const result = analizarArchivo({
      nombre: 'test.exe',
      tipoDeclarado: 'application/octet-stream',
      inicio: new Uint8Array([0x4D, 0x5A]), // MZ
      tamano: 100,
    });
    expect(result.nivel).toBe('peligroso');
    expect(result.motivos).toContain('Archivo ejecutable detectado por bytes mágicos');
  });

  it('should detect dangerous extension', () => {
    const result = analizarArchivo({
      nombre: 'test.exe',
      tipoDeclarado: 'application/octet-stream',
      inicio: new Uint8Array(),
      tamano: 100,
    });
    expect(result.nivel).toBe('peligroso');
    expect(result.motivos).toContain('Extensión de archivo peligrosa');
  });

  it('should detect double extension', () => {
    const result = analizarArchivo({
      nombre: 'foto.jpg.exe',
      tipoDeclarado: 'application/octet-stream',
      inicio: new Uint8Array(),
      tamano: 100,
    });
    expect(result.nivel).toBe('peligroso');
    expect(result.motivos).toContain('Doble extensión peligrosa detectada');
  });

  it('should detect ZIP with path traversal', () => {
    const result = analizarArchivo({
      nombre: 'archive.zip',
      tipoDeclarado: 'application/zip',
      inicio: new Uint8Array([0x50, 0x4B, 0x03, 0x04]), // ZIP local header
      tamano: 100,
      entradasZip: [{ ruta: '../evil.txt', tamano: 100, comprimido: 50 }]
    });
    expect(result.nivel).toBe('peligroso');
    expect(result.motivos).toContain('Entrada de ZIP con ruta peligrosa');
  });

  it('should detect ZIP with vbaProject.bin', () => {
    const result = analizarArchivo({
      nombre: 'archive.zip',
      tipoDeclarado: 'application/zip',
      inicio: new Uint8Array([0x50, 0x4B, 0x03, 0x04]),
      tamano: 100,
      entradasZip: [{ ruta: 'vbaProject.bin', tamano: 1000, comprimido: 500 }]
    });
    expect(result.nivel).toBe('peligroso');
    expect(result.motivos).toContain('Entrada de ZIP contiene vbaProject.bin');
  });

  it('should detect ZIP compression bomb', () => {
    const result = analizarArchivo({
      nombre: 'archive.zip',
      tipoDeclarado: 'application/zip',
      inicio: new Uint8Array([0x50, 0x4B, 0x03, 0x04]),
      tamano: 100,
      entradasZip: [{ ruta: 'large.txt', tamano: 11 * 1024 * 1024, comprimido: 100000 }] // >10MB uncompressed, ratio >100
    });
    expect(result.nivel).toBe('peligroso');
    expect(result.motivos).toContain('ratio de compresión sospechosamente alto');
  });

  it('should detect shebang', () => {
    const result = analizarArchivo({
      nombre: 'script.sh',
      tipoDeclarado: 'text/plain',
      inicio: new Uint8Array([0x23, 0x21]), // #!
      tamano: 100,
    });
    expect(result.nivel).toBe('sospechoso');
    expect(result.motivos).toContain('Archivo comienza con shebang (#!)');
  });

  it('should detect mismatched extension and tipoDeclarado', () => {
    const result = analizarArchivo({
      nombre: 'image.txt',
      tipoDeclarado: 'image/png',
      inicio: new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), // PNG
      tamano: 100,
    });
    expect(result.nivel).toBe('sospechoso');
    expect(result.motivos).toContain('Tipo real (png) no coincide con la extensión (txt) o tipo declarado (image/png)');
  });

  it('should detect HTML with script tag', () => {
    const result = analizarArchivo({
      nombre: 'document.html',
      tipoDeclarado: 'text/html',
      inicio: new Uint8Array('<html><body><script>alert(1)</script></body></html>'.split('').map(c => c.charCodeAt(0))),
      tamano: 100,
    });
    expect(result.nivel).toBe('sospechoso');
    expect(result.motivos).toContain('HTML o SVG con contenido peligroso (script, javascript: o on...)');
  });

  it('should detect PDF with JavaScript', () => {
    const result = analizarArchivo({
      nombre: 'document.pdf',
      tipoDeclarado: 'application/pdf',
      inicio: new Uint8Array('%PDF-1.4\n/%JavaScript'.split('').map(c => c.charCodeAt(0))),
      tamano: 100,
    });
    expect(result.nivel).toBe('sospechoso');
    expect(result.motivos).toContain('PDF contiene JavaScript o OpenAction');
  });

  it('should return limpio for a safe file', () => {
    const result = analizarArchivo({
      nombre: 'image.png',
      tipoDeclarado: 'image/png',
      inicio: new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), // PNG
      tamano: 100,
    });
    expect(result.nivel).toBe('limpio');
    expect(result.motivos).toHaveLength(0);
  });
});