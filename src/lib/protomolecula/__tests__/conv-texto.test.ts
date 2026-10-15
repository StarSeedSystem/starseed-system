import { describe, it, expect } from 'vitest';
import { CONVERSORES_TEXTO } from '../conv-texto';
import { registrarConversor, limpiarConversores, rutaDeConversion } from '../convertidores';

describe('Conversores de texto', () => {
  // Buscar los conversores por nombre
  const csvJson = CONVERSORES_TEXTO.find(c => c.nombre === 'CSV a JSON')!;
  const jsonCsv = CONVERSORES_TEXTO.find(c => c.nombre === 'JSON a CSV')!;
  const srtVtt = CONVERSORES_TEXTO.find(c => c.nombre === 'SRT a VTT')!;
  const vttSrt = CONVERSORES_TEXTO.find(c => c.nombre === 'VTT a SRT')!;

  describe('CSV a JSON', () => {
    it('debe convertir CSV simple a JSON', () => {
      const entrada = 'a,b\n1,2';
      const salida = csvJson.convertir!(entrada);
      expect(salida).toBe('[{"a":"1","b":"2"}]');
    });

    it('debe manejar campos entre comillas', () => {
      const entrada = '"a","b"\n"1","2"';
      const salida = csvJson.convertir!(entrada);
      expect(salida).toBe('[{"a":"1","b":"2"}]');
    });

    it('debe manejar comas dentro de comillas', () => {
      const entrada = 'a,b\n"1,2",3';
      const salida = csvJson.convertir!(entrada);
      expect(salida).toBe('[{"a":"1,2","b":"3"}]');
    });

    it('debe manejar saltos de línea dentro de comillas', () => {
      const entrada = 'a,b\n"1\n2",3';
      const salida = csvJson.convertir!(entrada);
      expect(salida).toBe('[{"a":"1\\n2","b":"3"}]');
    });

    it('debe manejar comillas dobles escapadas', () => {
      const entrada = 'a,b\n"1""2",3';
      const salida = csvJson.convertir!(entrada);
      expect(salida).toBe('[{"a":"1\\"2","b":"3"}]');
    });

    it('debe lanzar error por columnas desiguales', () => {
      const entrada = 'a,b\n1';
      expect(() => csvJson.convertir!(entrada)).toThrowError(/Fila 2:.*columnas/);
    });

    it('debe manejar entrada vacía', () => {
      const entrada = '';
      const salida = csvJson.convertir!(entrada);
      expect(salida).toBe('[]');
    });

    it('debe tolerar BOM', () => {
      const entrada = '\uFEFFa,b\n1,2';
      const salida = csvJson.convertir!(entrada);
      expect(salida).toBe('[{"a":"1","b":"2"}]');
    });

    it('debe tolerar finales de línea mixtos', () => {
      const entrada = 'a,b\r\n1,2\n3,4\r\n';
      const salida = csvJson.convertir!(entrada);
      expect(salida).toBe('[{"a":"1","b":"2"},{"a":"3","b":"4"}]');
    });
  });

  describe('JSON a CSV', () => {
    it('debe convertir JSON simple a CSV', () => {
      const entrada = '[{"a":1,"b":2}]';
      const salida = jsonCsv.convertir!(entrada);
      expect(salida).toBe('a,b\n1,2');
    });

    it('debe manejar valores nulos', () => {
      const entrada = '[{"a":null,"b":2}]';
      const salida = jsonCsv.convertir!(entrada);
      expect(salida).toBe('a,b\n,2');
    });

    it('debe entrecomillar valores con coma', () => {
      const entrada = '[{"a":"hola,mundo","b":2}]';
      const salida = jsonCsv.convertir!(entrada);
      expect(salida).toBe('a,b\n"hola,mundo",2');
    });

    it('debe entrecomillar valores con salto de línea', () => {
      const entrada = '[{"a":"hola\\nmundo","b":2}]';
      const salida = jsonCsv.convertir!(entrada);
      expect(salida).toBe('a,b\n"hola\nmundo",2');
    });

    it('debe entrecomillar valores con comillas dobles', () => {
      const entrada = '[{"a":"hola \\"mundo\\"","b":2}]';
      const salida = jsonCsv.convertir!(entrada);
      expect(salida).toBe('a,b\n"hola ""mundo""",2');
    });

    it('debe lanzar error por objeto anidado', () => {
      const entrada = '[{"a":{"b":1}}]';
      expect(() => jsonCsv.convertir!(entrada)).toThrowError(/JSON demasiado anidado/);
    });

    it('debe lanzar error por array anidado', () => {
      const entrada = '[{"a":[1]}]';
      expect(() => jsonCsv.convertir!(entrada)).toThrowError(/JSON demasiado anidado/);
    });

    it('debe manejar entrada vacía', () => {
      const entrada = '[]';
      const salida = jsonCsv.convertir!(entrada);
      expect(salida).toBe('');
    });
  });

  describe('SRT a VTT', () => {
    it('debe convertir SRT simple a VTT', () => {
      const entrada = '1\n00:00:01,000 --> 00:00:02,000\nHola mundo\n';
      const salida = srtVtt.convertir!(entrada);
      const expected = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHola mundo\n';
      if (salida !== expected) {
        console.log('SRT a VTT simple: Length mismatch:', salida.length, expected.length);
        console.log('SRT a VTT simple: Salida chars:', [...salida].map(c => c.charCodeAt(0)));
        console.log('SRT a VTT simple: Expected chars:', [...expected].map(c => c.charCodeAt(0)));
      }
      expect(salida).toBe(expected);
    });

    it('debe manejar múltiples bloques', () => {
      const entrada = '1\n00:00:01,000 --> 00:00:02,000\nPrimero\n\n2\n00:00:03,000 --> 00:00:04,000\nSegundo\n';
      const salida = srtVtt.convertir!(entrada);
      const expected = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nPrimero\n\n\n00:00:03.000 --> 00:00:04.000\nSegundo\n';
      if (salida !== expected) {
        console.log('SRT a VTT multiple: Length mismatch:', salida.length, expected.length);
        console.log('SRT a VTT multiple: Salida chars:', [...salida].map(c => c.charCodeAt(0)));
        console.log('SRT a VTT multiple: Expected chars:', [...expected].map(c => c.charCodeAt(0)));
      }
      expect(salida).toBe(expected);
    });

    it('debe tolerar BOM', () => {
      const entrada = '\uFEFF1\n00:00:01,000 --> 00:00:02,000\nHola\n';
      const salida = srtVtt.convertir!(entrada);
      expect(salida).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHola\n');
    });

    it('debe tolerar finales de línea mixtos', () => {
      const entrada = '1\r\n00:00:01,000 --> 00:00:02,000\r\nHola\r\n\r\n';
      const salida = srtVtt.convertir!(entrada);
      expect(salida).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHola\n');
    });
  });

  describe('VTT a SRT', () => {
    it('debe convertir VTT simple a SRT', () => {
      const entrada = 'WEBVTT\n\n00:00:01,000 --> 00:00:02,000\nHola mundo\n\n';
      const salida = vttSrt.convertir!(entrada);
      expect(salida).toBe('1\n00:00:01,000 --> 00:00:02,000\nHola mundo\n\n');
    });

    it('debe numerar los bloques correctamente', () => {
      const entrada = 'WEBVTT\n\n00:00:01,000 --> 00:00:02,000\nPrimero\n\n00:00:03,000 --> 00:00:04,000\nSegundo\n\n';
      const salida = vttSrt.convertir!(entrada);
      expect(salida).toBe('1\n00:00:01,000 --> 00:00:02,000\nPrimero\n\n2\n00:00:03,000 --> 00:00:04,000\nSegundo\n\n');
    });

    it('debe quitar notas y cabecera', () => {
      const entrada = 'WEBVTT\nNota al pie\n\n00:00:01,000 --> 00:00:02,000\nHola\n\n';
      const salida = vttSrt.convertir!(entrada);
      expect(salida).toBe('1\n00:00:01,000 --> 00:00:02,000\nHola\n\n');
    });

    it('debe tolerar BOM', () => {
      const entrada = '\uFEFFWEBVTT\n\n00:00:01,000 --> 00:00:02,000\nHola\n\n';
      const salida = vttSrt.convertir!(entrada);
      expect(salida).toBe('1\n00:00:01,000 --> 00:00:02,000\nHola\n\n');
    });

    it('debe tolerar finales de línea mixtos', () => {
      const entrada = 'WEBVTT\r\n\r\n00:00:01,000 --> 00:00:02,000\r\nHola\r\n\r\n';
      const salida = vttSrt.convertir!(entrada);
      expect(salida).toBe('1\n00:00:01,000 --> 00:00:02,000\nHola\n\n');
    });
  });

  describe('Integración con rutaDeConversion', () => {
    it('debe encontrar la ruta srt->vtt después de registrar los conversores', () => {
      limpiarConversores();
      for (const conv of CONVERSORES_TEXTO) {
        registrarConversor(conv);
      }
      const ruta = rutaDeConversion('srt', 'vtt');
      expect(ruta).not.toBeNull();
      expect(ruta?.pasos.length).toBe(1);
      expect(ruta?.pasos[0].nombre).toBe('SRT a VTT');
    });
  });
});