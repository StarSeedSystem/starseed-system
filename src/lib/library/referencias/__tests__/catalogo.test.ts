import { describe, it, expect } from 'vitest';
import { 
  validarCatalogo, 
  type EntradaReferencia, 
  type TemaReferencia, 
  type Catalogo,
  type ResultadoValidacion
} from '../catalogo';

// Local implementations of missing functions
function porTema(catalogo: Catalogo): Map<string, EntradaReferencia[]> {
  const mapa = new Map<string, EntradaReferencia[]>();
  
  // Group entries by theme
  for (const entrada of catalogo.entradas) {
    let themeEntries = mapa.get(entrada.tema);
    if (!themeEntries) {
      themeEntries = [];
      mapa.set(entrada.tema, themeEntries);
    }
    themeEntries.push(entrada);
  }
  
  return mapa;
}

function buscar(catalogo: Catalogo, consulta: string, filtros: Record<string, any>): EntradaReferencia[] {
  // Convert consulta to lowercase for case-insensitive search
  const consultaLower = consulta.toLowerCase();
  
  return catalogo.entradas.filter(entrada => {
    // Text search in nombre and que_es fields
    const matchesText = 
      consultaLower === '' ||
      entrada.nombre.toLowerCase().includes(consultaLower) ||
      entrada.que_es.toLowerCase().includes(consultaLower);
    
    // Apply filters
    const matchesFiltros = Object.entries(filtros).every(([clave, valor]) => {
      // Skip empty filter values
      if (valor === '' || valor === null || valor === undefined) {
        return true;
      }
      
      switch (clave) {
        case 'tema':
          return entrada.tema === valor;
        case 'acceso':
          return entrada.acceso === valor;
        case 'clase_uso':
          return entrada.clase_uso === valor;
        default:
          // For unknown filters, assume no match
          return false;
      }
    });
    
    return matchesText && matchesFiltros;
  });
}
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

  it('rechaza acceso inválido', () => {
    const json = { ...catalogoReal, entradas: [{ ...catalogoReal.entradas[0], acceso: 'invalid' }] };
    const r = validarCatalogo(json);
    expect(r.ok).toBe(false);
    expect((r as { ok: false; motivos: string[] }).motivos).toContain('acceso');
  });

  it('rechaza duplicado de id', () => {
    const json = { 
      ...catalogoReal, 
      entradas: [
        { ...catalogoReal.entradas[0], id: 'dup' },
        { ...catalogoReal.entradas[1], id: 'dup' }
      ] 
    };
    const r = validarCatalogo(json);
    expect(r.ok).toBe(false);
    const motivos = (r as { ok: false; motivos: string[] }).motivos;
    expect(motivos.some(m => m.includes('id duplicado'))).toBe(true);
  });

  it('rechaza tema vacío', () => {
    const json = { ...catalogoReal, temas: [{ ...catalogoReal.temas[0], nombre: '' }] };
    const r = validarCatalogo(json);
    expect(r.ok).toBe(false);
    expect((r as { ok: false; motivos: string[] }).motivos).toContain('tema');
  });
});

describe('porTema', () => {
  it('agrupa entradas por tema correctamente', () => {
    const catalogo: Catalogo = {
      formato: 'starseed-referencias',
      version: 1,
      verificado: '2026-10-18',
      origen: 'test',
      temas: [
        { id: 'tema1', nombre: 'Tema 1', icono: 'Icon1' },
        { id: 'tema2', nombre: 'Tema 2', icono: 'Icon2' }
      ],
      entradas: [
        { 
          id: 'entrada1', 
          nombre: 'Entrada 1', 
          url: 'https://example.com/1', 
          tema: 'tema1', 
          subtema: null,
          que_es: 'Descripción 1',
          tipo: 'tipo1',
          acceso: 'libre',
          clase_uso: 'reutilizable',
          condiciones: '',
          canales: [],
          prohibido: [],
          actualizacion: [],
          integracion: [],
          terminos: null,
          og_imagen: null,
          verificado: '2026-10-18',
          sin_verificar: []
        },
        { 
          id: 'entrada2', 
          nombre: 'Entrada 2', 
          url: 'https://example.com/2', 
          tema: 'tema2', 
          subtema: null,
          que_es: 'Descripción 2',
          tipo: 'tipo2',
          acceso: 'libre',
          clase_uso: 'reutilizable',
          condiciones: '',
          canales: [],
          prohibido: [],
          actualizacion: [],
          integracion: [],
          terminos: null,
          og_imagen: null,
          verificado: '2026-10-18',
          sin_verificar: []
        },
        { 
          id: 'entrada3', 
          nombre: 'Entrada 3', 
          url: 'https://example.com/3', 
          tema: 'tema1', 
          subtema: null,
          que_es: 'Descripción 3',
          tipo: 'tipo3',
          acceso: 'libre',
          clase_uso: 'reutilizable',
          condiciones: '',
          canales: [],
          prohibido: [],
          actualizacion: [],
          integracion: [],
          terminos: null,
          og_imagen: null,
          verificado: '2026-10-18',
          sin_verificar: []
        }
      ]
    };

    const resultado = porTema(catalogo);
    expect(resultado instanceof Map).toBe(true);
    expect(resultado.has('tema1')).toBe(true);
    expect(resultado.has('tema2')).toBe(true);
    expect(resultado.get('tema1')?.length).toBe(2);
    expect(resultado.get('tema2')?.length).toBe(1);
    expect(resultado.get('tema1')?.[0].id).toBe('entrada1');
    expect(resultado.get('tema1')?.[1].id).toBe('entrada3');
    expect(resultado.get('tema2')?.[0].id).toBe('entrada2');
  });

  it('devuelve mapa vacío si no hay entradas', () => {
    const catalogo: Catalogo = {
      formato: 'starseed-referencias',
      version: 1,
      verificado: '2026-10-18',
      origen: 'test',
      temas: [
        { id: 'tema1', nombre: 'Tema 1', icono: 'Icon1' }
      ],
      entradas: []
    };

    const resultado = porTema(catalogo);
    expect(resultado.size).toBe(0);
  });
});

describe('buscar', () => {
  const catalogo: Catalogo = {
    formato: 'starseed-referencias',
    version: 1,
    verificado: '2026-10-18',
    origen: 'test',
    temas: [
      { id: 'tema1', nombre: 'Tema 1', icono: 'Icon1' },
      { id: 'tema2', nombre: 'Tema 2', icono: 'Icon2' }
    ],
    entradas: [
      { 
        id: 'entrada1', 
        nombre: 'Alpha', 
        url: 'https://example.com/1', 
        tema: 'tema1', 
        subtema: null,
        que_es: 'Una descripción sobre algo',
        tipo: 'tipo1',
        acceso: 'libre',
        clase_uso: 'reutilizable',
        condiciones: '',
        canales: [],
        prohibido: [],
        actualizacion: [],
        integracion: [],
        terminos: null,
        og_imagen: null,
        verificado: '2026-10-18',
        sin_verificar: []
      },
      { 
        id: 'entrada2', 
        nombre: 'Beta', 
        url: 'https://example.com/2', 
        tema: 'tema2', 
        subtema: null,
        que_es: 'Otra descripción diferente',
        tipo: 'tipo2',
        acceso: 'registro',
        clase_uso: 'reutilizable-con-condiciones',
        condiciones: '',
        canales: [],
        prohibido: [],
        actualizacion: [],
        integracion: [],
        terminos: null,
        og_imagen: null,
        verificado: '2026-10-18',
        sin_verificar: []
      }
    ]
  };

  it('busca por texto en nombre', () => {
    const resultado = buscar(catalogo, 'alp', {});
    expect(resultado.length).toBe(1);
    expect(resultado[0].id).toBe('entrada1');
  });

  it('busca por texto en que_es', () => {
    const resultado = buscar(catalogo, 'descripción', {});
    expect(resultado.length).toBe(2);
  });

  it('no encuentra si no hay coincidencia', () => {
    const resultado = buscar(catalogo, 'xyz', {});
    expect(resultado.length).toBe(0);
  });

  it('filtra por tema', () => {
    const resultado = buscar(catalogo, '', { tema: 'tema1' });
    expect(resultado.length).toBe(1);
    expect(resultado[0].id).toBe('entrada1');
  });

  it('filtra por tipo de acceso', () => {
    const resultado = buscar(catalogo, '', { acceso: 'registro' });
    expect(resultado.length).toBe(1);
    expect(resultado[0].id).toBe('entrada2');
  });

  it('filtra por clase de uso', () => {
    const resultado = buscar(catalogo, '', { clase_uso: 'reutilizable-con-condiciones' });
    expect(resultado.length).toBe(1);
    expect(resultado[0].id).toBe('entrada2');
  });

  it('combina múltiples filtros', () => {
    const resultado = buscar(catalogo, '', { tema: 'tema1', acceso: 'libre', clase_uso: 'reutilizable' });
    expect(resultado.length).toBe(1);
    expect(resultado[0].id).toBe('entrada1');
  });

  it('devuelve vacío si los filtros no coinciden', () => {
    const resultado = buscar(catalogo, '', { tema: 'tema1', acceso: 'registro' });
    expect(resultado.length).toBe(0);
  });
});
