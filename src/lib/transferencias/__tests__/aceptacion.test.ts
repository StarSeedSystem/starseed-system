import { describe, it, expect } from 'vitest';
import {
  decidirAceptacion,
  tipoEnvio,
  NeuronaReconocida,
  ConfiguracionAceptacion,
  ResultadoAceptacion,
  AccionAceptacion,
} from '../aceptacion';

function crearConfiguracionDefecto(): ConfiguracionAceptacion {
  return {
    neuronasReconocidas: new Map(),
    autoAceptarNeuronasReconocidas: false,
  };
}

describe('decidirAceptacion', () => {
  describe('archivo individual', () => {
    it('pide aceptación para archivo de neurona desconocida', () => {
      const config = crearConfiguracionDefecto();
      const resultado = decidirAceptacion({
        tipo: 'archivo',
        nombre: 'documento.pdf',
        tamano: 1024 * 1024,
        tipoReal: 'PDF',
        neuronaOrigen: 'neurona-desconocida',
        medio: 'mesh',
      }, config);

      expect(resultado.accion).toBe('pedir');
      expect(resultado.mensaje).toContain('documento.pdf');
      expect(resultado.mensaje).toContain('1.0 MB');
      expect(resultado.mensaje).toContain('PDF');
      expect(resultado.mensaje).toContain('neurona-desconocida');
      expect(resultado.mensaje).toContain('mesh');
    });

    it('pide aceptación para archivo de neurona reconocida con auto-aceptar apagado', () => {
      const config: ConfiguracionAceptacion = {
        neuronasReconocidas: new Map([['neurona-conocida', { id: 'neurona-conocida', alias: 'Mi Mac', autoAceptar: false }]]),
        autoAceptarNeuronasReconocidas: false,
      };
      const resultado = decidirAceptacion({
        tipo: 'archivo',
        nombre: 'foto.jpg',
        tamano: 2 * 1024 * 1024,
        tipoReal: 'JPEG',
        neuronaOrigen: 'neurona-conocida',
        medio: 'wifi-directo',
      }, config);

      expect(resultado.accion).toBe('pedir');
      expect(resultado.mensaje).toContain('Mi Mac');
    });

    it('auto-acepta archivo de neurona reconocida con auto-aceptar encendido', () => {
      const config: ConfiguracionAceptacion = {
        neuronasReconocidas: new Map([['neurona-conocida', { id: 'neurona-conocida', alias: 'Mi Mac', autoAceptar: true }]]),
        autoAceptarNeuronasReconocidas: true,
      };
      const resultado = decidirAceptacion({
        tipo: 'archivo',
        nombre: 'video.mp4',
        tamano: 50 * 1024 * 1024,
        tipoReal: 'MP4',
        neuronaOrigen: 'neurona-conocida',
        medio: 'mesh',
      }, config);

      expect(resultado.accion).toBe('auto-aceptar');
      expect(resultado.mensaje).toContain('Auto-aceptado');
    });

    it('nunca auto-acepta de neurona desconocida aunque autoAceptarNeuronasReconocidas esté true', () => {
      const config: ConfiguracionAceptacion = {
        neuronasReconocidas: new Map(),
        autoAceptarNeuronasReconocidas: true,
      };
      const resultado = decidirAceptacion({
        tipo: 'archivo',
        nombre: 'archivo.exe',
        tamano: 1024,
        tipoReal: 'Ejecutable DOS (MZ)',
        neuronaOrigen: 'neurona-desconocida',
        medio: 'bluetooth',
      }, config);

      expect(resultado.accion).toBe('pedir');
    });
  });

  describe('carpeta', () => {
    it('pide aceptación para carpeta con número de archivos', () => {
      const config = crearConfiguracionDefecto();
      const resultado = decidirAceptacion({
        tipo: 'carpeta',
        nombre: 'Mis Documentos',
        tamano: 100 * 1024 * 1024,
        cantidadArchivos: 42,
        neuronaOrigen: 'neurona-ajena',
        medio: 'syncthing',
      }, config);

      expect(resultado.accion).toBe('pedir');
      expect(resultado.mensaje).toContain('Mis Documentos');
      expect(resultado.mensaje).toContain('100.0 MB');
      expect(resultado.mensaje).toContain('42 archivos');
      expect(resultado.mensaje).toContain('neurona-ajena');
      expect(resultado.mensaje).toContain('syncthing');
    });

    it('auto-acepta carpeta de neurona reconocida con auto-aceptar encendido', () => {
      const config: ConfiguracionAceptacion = {
        neuronasReconocidas: new Map([['neurona-casa', { id: 'neurona-casa', alias: 'Servidor Casa', autoAceptar: true }]]),
        autoAceptarNeuronasReconocidas: true,
      };
      const resultado = decidirAceptacion({
        tipo: 'carpeta',
        nombre: 'Backups',
        tamano: 500 * 1024 * 1024,
        cantidadArchivos: 120,
        neuronaOrigen: 'neurona-casa',
        medio: 'lan',
      }, config);

      expect(resultado.accion).toBe('auto-aceptar');
    });
  });

  describe('sincronización de cerebro', () => {
    it('pide aceptación para sync de cerebro', () => {
      const config = crearConfiguracionDefecto();
      const resultado = decidirAceptacion({
        tipo: 'cerebro',
        nombre: 'Cerebro Principal',
        tamano: 10 * 1024 * 1024,
        neuronaOrigen: 'neurona-tabla',
        medio: 'mesh',
      }, config);

      expect(resultado.accion).toBe('pedir');
      expect(resultado.mensaje).toContain('Cerebro Principal');
      expect(resultado.mensaje).toContain('10.0 MB');
      expect(resultado.mensaje).toContain('Sincronización de cerebro');
      expect(resultado.mensaje).toContain('neurona-tabla');
      expect(resultado.mensaje).toContain('mesh');
    });
  });

  describe('formato de tamaños', () => {
    it('formatea bytes correctamente', () => {
      const config = crearConfiguracionDefecto();
      const r1 = decidirAceptacion({ tipo: 'archivo', nombre: 'a', tamano: 500, tipoReal: 'TXT', neuronaOrigen: 'n', medio: 'm' }, config);
      expect(r1.mensaje).toContain('500 B');

      const r2 = decidirAceptacion({ tipo: 'archivo', nombre: 'a', tamano: 1536, tipoReal: 'TXT', neuronaOrigen: 'n', medio: 'm' }, config);
      expect(r2.mensaje).toContain('1.5 KB');

      const r3 = decidirAceptacion({ tipo: 'archivo', nombre: 'a', tamano: 1024 * 1024, tipoReal: 'TXT', neuronaOrigen: 'n', medio: 'm' }, config);
      expect(r3.mensaje).toContain('1.0 MB');

      const r4 = decidirAceptacion({ tipo: 'archivo', nombre: 'a', tamano: 2.5 * 1024 * 1024 * 1024, tipoReal: 'TXT', neuronaOrigen: 'n', medio: 'm' }, config);
      expect(r4.mensaje).toContain('2.5 GB');
    });
  });

  describe('neuronas reconocidas', () => {
    it('permite activar/desactivar auto-aceptar por neurona', () => {
      const neurona: NeuronaReconocida = { id: 'n1', alias: 'Neurona 1', autoAceptar: false };
      expect(neurona.autoAceptar).toBe(false);

      neurona.autoAceptar = true;
      expect(neurona.autoAceptar).toBe(true);
    });

    it('usa alias si existe, sino id', () => {
      const config: ConfiguracionAceptacion = {
        neuronasReconocidas: new Map([
          ['n1', { id: 'n1', alias: 'Mi MacBook', autoAceptar: false }],
          ['n2', { id: 'n2', autoAceptar: false }],
        ]),
        autoAceptarNeuronasReconocidas: false,
      };

      const r1 = decidirAceptacion({ tipo: 'archivo', nombre: 'a', tamano: 100, tipoReal: 'TXT', neuronaOrigen: 'n1', medio: 'm' }, config);
      expect(r1.mensaje).toContain('Mi MacBook');

      const r2 = decidirAceptacion({ tipo: 'archivo', nombre: 'a', tamano: 100, tipoReal: 'TXT', neuronaOrigen: 'n2', medio: 'm' }, config);
      expect(r2.mensaje).toContain('n2');
    });
  });
});

describe('tipoEnvio', () => {
  it('devuelve el tipo correcto', () => {
    expect(tipoEnvio({ tipo: 'archivo' } as any)).toBe('archivo');
    expect(tipoEnvio({ tipo: 'carpeta' } as any)).toBe('carpeta');
    expect(tipoEnvio({ tipo: 'cerebro' } as any)).toBe('cerebro');
  });
});