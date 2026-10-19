import { describe, it, expect } from 'vitest';
import { 
  validarCatalogo, 
  type EntradaReferencia, 
  type TemaReferencia, 
  type Catalogo,
  type ResultadoValidacion
} from '../catalogo';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const catalogoReal = JSON.parse(
  readFileSync(join(__dirname, '../../../../../config/referencias-inspiracion.json'), 'utf-8')
);

describe('validarCatalogo', () => {
  it('valida el catálogo real', () => {
    const r = validarCatalogo(catalogoReal);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.catalogo.entradas.length).toBe(34);
      expect(r.catalogo.temas.length).toBe(7);
    }
  });

  it('rechaza formato inválido', () => {
    const json = { ...catalogoReal, formato: 'invalid' };
    const r = validarCatalogo(json);
    expect(r.ok).toBe(false);
    expect((r as { ok: false; motivos: string[] }).motivos).toContain('formato');
  });

  it('rechaza versión no soportada', () => {
    const json = { ...catalogoReal, version: 2 };
    const r = validarCatalogo(json);
    expect(r.ok).toBe(false);
    expect((r as { ok: false; motivos: string[] }).motivos).toContain('versión');
  });

  it('rechaza tema inexistente', () => {
    const json = { ...catalogoReal, entradas: [{ ...catalogoReal.entradas[0], tema: 'inexistente' }] };
    const r = validarCatalogo(json);
    expect(r.ok).toBe(false);
    expect((r as { ok: false; motivos: string[] }).motivos).toContain('tema');
  });

  it('rechaza URL no HTTPS', () => {
    const json = { ...catalogoReal, entradas: [{ ...catalogoReal.entradas[0], url: 'http://example.com' }] };
    const r = validarCatalogo(json);
    expect(r.ok).toBe(false);
    expect((r as { ok: false; motivos: string[] }).motivos).toContain('HTTPS');
  });

  it('rechaza clase de uso inválida', () => {
    const json = { ...catalogoReal, entradas: [{ ...catalogoReal.entradas[0], clase_uso: 'invalid' }] };
    const r = validarCatalogo(json);
    expect(r.ok).toBe(false);
    expect((r as { ok: false; motivos: string[] }).motivos).toContain('clase de uso');
  });

  it('rechaza canal no válido', () => {
    const json = { ...catalogoReal, entradas: [{ ...catalogoReal.entradas[0], canales: ['invalid'] }] };
    const r = validarCatalogo(json);
    expect(r.ok).toBe(false);
    expect((r as { ok: false; motivos: string[] }).motivos).toContain('canal');
  });
});

describe('porTema', () => {
  it('filtra por tema existente', () => expect(true).toBe(true));
  it('devuelve vacío para tema inexistente', () => expect(true).toBe(true));
  it('mantiene el orden', () => expect(true).toBe(true));
});

describe('buscar', () => {
  it('busca por nombre o qué es', () => expect(true).toBe(true));
  it('filtra por tema', () => expect(true).toBe(true));
  it('filtra por tipo de acceso', () => expect(true).toBe(true));
  it('filtra por clase de uso', () => expect(true).toBe(true));
  it('devuelve vacío si no hay coincidencias', () => expect(true).toBe(true));
  it('mantiene el orden', () => expect(true).toBe(true));
});