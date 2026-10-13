// Pruebas para el Centinela (antivirus propio) de la malla de sílice
import { describe, it, expect } from 'vitest';
import { analizarArchivo } from '../centinela';

describe('analizarArchivo', () => {
  // Helper para crear un archivo de prueba
  const crearArchivo = (nombre: string, tipoDeclarado: string | undefined, inicio: number[], tamano: number, entradasZip?: { ruta: string; tamano: number; comprimido: number }[]) => ({
    nombre,
    tipoDeclarado,
    inicio: Uint8Array.from(inicio),
    tamano,
    entradasZip: entradasZip ?? undefined
  });

  // Caso limpio: archivo de texto sin características sospechosas
  it('debe reconocer un archivo de texto limpio', () => {
    const arch = crearArchivo('documento.txt', undefined, [0x48, 0x65, 0x6C, 0x6C, 0x6F], 5);
    const resultado = analizarArchivo(arch);
    expect(resultado.nivel).toBe('limpio');
    expect(resultado.motivos).toHaveLength(0);
  });

  // Peligroso: ejecutable MZ
  it('debe detectar ejecutable MZ (bytes mágicos)', () => {
    const arch = crearArchivo('programa.exe', undefined, [0x4D, 0x5A, 0x90, 0x00], 100);
    const resultado = analizarArchivo(arch);
    expect(resultado.nivel).toBe('peligroso');
    expect(resultado.motivos).toContain('Peligroso: ejecutable detectado por bytes mágicos MZ');
  });

  // Peligroso: ejecutable ELF
  it('debe detectar ejecutable ELF (bytes mágicos)', () => {
    const arch = crearArchivo('programa.elf', undefined, [0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01, 0x00], 200);
    const resultado = analizarArchivo(arch);
    expect(resultado.nivel).toBe('peligroso');
    expect(resultado.motivos).toContain('Peligroso: ejecutable detectado por bytes mágicos ELF');
  });

  // Peligroso: ejecutable Mach-O
  it('debe detectar ejecutable Mach-O (bytes mágicos)', () => {
    const arch = crearArchivo('programa.macho', undefined, [0xFE, 0xED, 0xFA, 0xCE, 0x00, 0x00, 0x00, 0x00], 300);
    const resultado = analizarArchivo(arch);
    expect(resultado.nivel).toBe('peligroso');
    expect(resultado.motivos).toContain('Peligroso: ejecutable detectado por bytes mágicos Mach-O');
  });

  // Peligroso: extensión peligrosa
  it('debe detectar extensión peligrosa .exe', () => {
    const arch = crearArchivo('virus.exe', undefined, [0x00, 0x01, 0x02], 10);
    const resultado = analizarArchivo(arch);
    expect(resultado.nivel).toBe('peligroso');
    expect(resultado.motivos).toContain('Peligroso: extensión peligrosa .exe');
  });

  // Peligroso: doble extensión
  it('debe detectar doble extensión peligrosa (foto.jpg.exe)', () => {
    const arch = crearArchivo('foto.jpg.exe', undefined, [0x00, 0x01, 0x02], 10);
    const resultado = analizarArchivo(arch);
    expect(resultado.nivel).toBe('peligroso');
    expect(resultado.motivos).toContain('Peligroso: doble extensión detectada');
  });

  // Peligroso: entrada de ZIP con ruta de escape (..)
  it('debe detectar entrada de ZIP con ruta de escape (..)', () => {
    const arch = crearArchivo('malicioso.zip', undefined, [0x50, 0x4B, 0x03, 0x04], 100, [
      { ruta: '../etc/passwd', tamano: 100, comprimido: 50 }
    ]);
    const resultado = analizarArchivo(arch);
    expect(resultado.nivel).toBe('peligroso');
    expect(resultado.motivos).toContain('Peligroso: entrada de ZIP con ruta de escape: ../etc/passwd');
  });

  // Peligroso: entrada de ZIP con ruta absoluta
  it('debe detectar entrada de ZIP con ruta absoluta', () => {
    const arch = crearArchivo('malicioso2.zip', undefined, [0x50, 0x4B, 0x03, 0x04], 100, [
      { ruta: '/etc/passwd', tamano: 100, comprimido: 50 }
    ]);
    const resultado = analizarArchivo(arch);
    expect(resultado.nivel).toBe('peligroso');
    expect(resultado.motivos).toContain('Peligroso: entrada de ZIP con ruta de escape: /etc/passwd');
  });

  // Peligroso: bomba de compresión (ratio > 100 en entrada > 10 MB)
  it('debe detectar bomba de compresión en ZIP', () => {
    const entrada = { ruta: 'grande.dat', tamano: 11 * 1024 * 1024, comprimido: 100000 }; // >10 MB y ratio >100
    const arch = crearArchivo('bomba.zip', undefined, [0x50, 0x4B, 0x03, 0x04], 100, [entrada]);
    const resultado = analizarArchivo(arch);
    expect(resultado.nivel).toBe('peligroso');
    expect(resultado.motivos).toContain('Peligroso: bomba de compresión detectada (ratio 115.34)');
  });

  // Sospechoso: tipo real no coincide con extensión
  it('debe detectar tipo real PNG pero extensión .txt', () => {
    const arch = crearArchivo('falso.txt', undefined, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 50);
    const resultado = analizarArchivo(arch);
    expect(resultado.nivel).toBe('sospechoso');
    expect(resultado.motivos).toContain('Sospechoso: tipo real (png) no coincide con la extensión (txt)');
  });

  // Sospechoso: tipo real no coincide con tipo declarado
  it('debe detectar tipo real JPEG pero tipo declarado texto', () => {
    const arch = crearArchivo('falso.dat', 'texto', [0xFF, 0xD8, 0xFF, 0xE0], 50);
    const resultado = analizarArchivo(arch);
    expect(resultado.nivel).toBe('sospechoso');
    expect(resultado.motivos).toContain('Sospechoso: tipo real (jpeg) no coincide con el tipo declarado (texto)');
  });

  // Sospechoso: shebang
  it('debe detectar shebang (#!)', () => {
    const arch = crearArchivo('script.sh', undefined, [0x23, 0x21, 0x2F, 0x62, 0x69, 0x6E, 0x62, 0x61, 0x73, 0x68], 50);
    const resultado = analizarArchivo(arch);
    expect(resultado.nivel).toBe('sospechoso');
    expect(resultado.motivos).toContain('Sospechoso: archivo comienza con shebang (#!)');
  });

  // Sospechoso: contenido peligroso en HTML
  it('debe detectar script en HTML', () => {
    const arch = crearArchivo('pagina.html', undefined, [0x3C, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74, 0x3E], 50);
    const resultado = analizarArchivo(arch);
    expect(resultado.nivel).toBe('sospechoso');
    expect(resultado.motivos).toContain('Sospechoso: contenido peligroso detectado en HTML/SVG: <script');
  });

  // Sospechoso: vbaProject.bin en ZIP
  it('debe detectar vbaProject.bin dentro de ZIP', () => {
    const arch = crearArchivo('documento.zip', undefined, [0x50, 0x4B, 0x03, 0x04], 100, [
      { ruta: 'vbaProject.bin', tamano: 1000, comprimido: 500 }
    ]);
    const resultado = analizarArchivo(arch);
    expect(resultado.nivel).toBe('sospechoso');
    expect(resultado.motivos).toContain('Sospechoso: archivo vbaProject.bin encontrado dentro de ZIP');
  });

  // Sospechoso: PDF con JavaScript
  it('debe detectar PDF con JavaScript', () => {
    const arch = crearArchivo('malware.pdf', undefined, [0x25, 0x50, 0x44, 0x46, 0x2F, 0x4A, 0x61, 0x76, 0x61, 0x53, 0x63, 0x72, 0x69, 0x70, 0x74], 100);
    const resultado = analizarArchivo(arch);
    expect(resultado.nivel).toBe('sospechoso');
    expect(resultado.motivos).toContain('Sospechoso: PDF contiene JavaScript o OpenAction');
  });

  // Sospechoso: PDF con OpenAction
  it('debe detectar PDF con OpenAction', () => {
    const arch = crearArchivo('malware2.pdf', undefined, [0x25, 0x50, 0x44, 0x46, 0x2F, 0x4F, 0x70, 0x65, 0x41, 0x63, 0x74, 0x69, 0x6F, 0x6E], 100);
    const resultado = analizarArchivo(arch);
    expect(resultado.nivel).toBe('sospechoso');
    expect(resultado.motivos).toContain('Sospechoso: PDF contiene JavaScript o OpenAction');
  });

  // Múltiples motivos: peligroso y sospechoso (el nivel debe ser peligroso)
  it('debe priorizar peligroso sobre sospechoso', () => {
    const arch = crearArchivo('malvado.exe', 'texto', [0x4D, 0x5A, 0x90, 0x00], 100, [
      { ruta: 'vbaProject.bin', tamano: 1000, comprimido: 500 }
    ]);
    const resultado = analizarArchivo(arch);
    expect(resultado.nivel).toBe('peligroso');
    // Debe tener al menos un motivo de peligroso y posiblemente uno de sospechoso
    expect(resultado.motivos.some(m => m.startsWith('Peligroso'))).toBe(true);
    expect(resultado.motivos.some(m => m.startsWith('Sospechoso'))).toBe(true);
  });
});