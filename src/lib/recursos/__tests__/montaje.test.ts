import { describe, it, expect } from 'vitest';
import { ordenesMontaje } from '../montaje';

describe('ordenesMontaje', () => {
  it('debe generar órdenes válidas para macOS con webdav', () => {
    const params = {
      sistema: 'macos',
      origen: {
        tipo: 'webdav',
        url: 'https://example.com/webdav'
      },
      punto: '/home/usuario/montaje',
      soloLectura: false
    } as const;
    
    const resultado = ordenesMontaje(params);
    expect(resultado).toBeDefined();
    // Verificamos que el comando de montaje sea correcto
    expect(resultado.montaje.textoParaCopiar).toBe(`mount_webdav https://example.com/webdav /home/usuario/montaje`);
  });
  
  it('debe generar órdenes válidas para windows con webdav', () => {
    const params = {
      sistema: 'windows',
      origen: {
        tipo: 'webdav',
        url: 'https://example.com/webdav'
      },
      punto: 'C:\\montaje',
      soloLectura: true
    };
    
    const resultado = ordenesMontaje(params);
    expect(resultado).toBeDefined();
  });
  
  it('debe generar órdenes válidas para linux con webdav readonly', () => {
    const params = {
      sistema: 'windows',
      origen: {
        tipo: 'webdav',
        url: 'https://example.com/webdav'
      },
      punto: 'C:\\montaje',
      soloLectura: true
    } as const;
    
    const resultado = ordenesMontaje(params);
    expect(resultado).toBeDefined();
    expect(resultado.montaje.textoParaCopiar).toContain('-o ro');
  });
  
  it('debe generar órdenes válidas para windows con webdav readonly', () => {
    const params = {
      sistema: 'windows',
      origen: {
        tipo: 'webdav',
        url: 'https://example.com/webdav'
      },
      punto: 'C:\\montaje',
      soloLectura: true
    };
    
    const resultado = ordenesMontaje(params);
    expect(resultado).toBeDefined();
    expect(resultado.montaje.textoParaCopiar).toContain('/readonly');
  });
  
  it('debe generar órdenes válidas para macOS con rclone readonly', () => {
    const params = {
      sistema: 'macos',
      origen: {
        tipo: 'rclone',
        remoto: 'miremoto',
        url: 'ruta/dentro'
      },
      punto: '/mnt/mi-montaje',
      soloLectura: true
    };
    
    const resultado = ordenesMontaje(params);
    expect(resultado).toBeDefined();
    expect(resultado.montaje.textoParaCopiar).toContain('--read-only');
  });
  
  it('debe lanzar un error si el punto de montaje contiene ".."', () => {
    const params = {
      sistema: 'linux',
      origen: {
        tipo: 'webdav',
        url: 'https://example.com/webdav'
      },
      punto: '/mnt/mi-montaje',
      soloLectura: true
    } as const;
    
    expect(() => ordenesMontaje(params)).toThrow(/Punto de montaje inválido/);
  });
  
  it('debe lanzar un error si el punto de montaje no es absoluto', () => {
    const params = {
      sistema: 'linux',
      origen: {
        tipo: 'webdav',
        url: 'https://example.com/webdav'
      },
      punto: 'montaje/relativo',
      soloLectura: false
    };
    
    expect(() => ordenesMontaje(params)).toThrow(/Punto de montaje inválido/);
  });
});