import { describe, it, expect } from 'vitest';
import { aplicarEscalera } from '../aplicar-escalera';
import type { Tarea, OfertaContexto, Preferencias, OpcionCatalogo, Candidato } from '../escalera';
import type { CatalogSource, CatalogModel } from '@/ai/astraura/free-catalog';
import type { PapelRuta } from '@/lib/mando/enrutamiento';

type TestCatalogSource = CatalogSource;
type TestPapelRuta = PapelRuta;

const CATALOGO_ASTRAURA: TestCatalogSource[] = [
  {
    id: 'astraura-158-local', label: 'Astraura 1.58-bit (esta neurona)', tier: 'local',
    providerId: 'astraura-158', baseUrl: 'http://127.0.0.1:8000', requiresKey: false,
    limits: 'Sin límites', why: 'Local', privacy: 'local', weight: 1.3,
    timeoutMs: 200_000, firstTokenGraceMs: 120_000, cooldownMinutes: 2,
    models: [{ id: 'astraura-158/auto', label: 'Astraura (auto)', strengths: ['chat'], quality: 7, context: 4096 }],
  },
  {
    id: 'ollama-local', label: 'Ollama (este equipo)', tier: 'local', providerId: 'ollama',
    baseUrl: 'http://localhost:11434', requiresKey: false, limits: 'Sin límites',
    why: 'Privacidad total', privacy: 'local', weight: 1.15,
    timeoutMs: 20_000, cooldownMinutes: 2,
    models: [{ id: 'llama3', label: 'Llama 3', strengths: ['chat', 'code'], quality: 7, context: 8192 }],
  },
  {
    id: 'openrouter-free', label: 'OpenRouter (modelos gratuitos)', tier: 'free-key',
    providerId: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', requiresKey: true,
    getKeyUrl: 'https://openrouter.ai/keys', limits: '50 req/min, 1000 req/día',
    why: 'Modelos gratuitos variados', privacy: 'cloud', weight: 1.0,
    timeoutMs: 40_000, cooldownMinutes: 60,
    models: [{ id: 'meta-llama/llama-3-8b-instruct:free', label: 'Llama 3 8B (free)', strengths: ['chat'], quality: 6, context: 8192 }],
  },
];

const CATALOGO_UNIFICADO: OpcionCatalogo[] = [
  { id: 'astraura-158-local', nombre: 'Astraura 1.58-bit (esta neurona)', tipo: 'modelo', papeles: ['escritor', 'revisor', 'chat'],
    gratis: { rpm: null, porDia: null, horasMes: null, almacenamientoGb: null, nota: 'Sin límites' },
    requiereCuenta: false, enlaceAlta: null, enlaceClave: null, variables: [], privacidad: 'local', licencia: null, verificado: null, fuente: 'free-catalog' },
  { id: 'ollama-local', nombre: 'Ollama (este equipo)', tipo: 'modelo', papeles: ['escritor', 'chat'],
    gratis: { rpm: null, porDia: null, horasMes: null, almacenamientoGb: null, nota: 'Sin límites' },
    requiereCuenta: false, enlaceAlta: null, enlaceClave: null, variables: [], privacidad: 'local', licencia: null, verificado: null, fuente: 'free-catalog' },
  { id: 'openrouter-free', nombre: 'OpenRouter (modelos gratuitos)', tipo: 'proveedor', papeles: ['escritor', 'revisor'],
    gratis: { rpm: 50, porDia: 1000, horasMes: null, almacenamientoGb: null, nota: '50 req/min, 1000 req/día' },
    requiereCuenta: true, enlaceAlta: 'https://openrouter.ai/keys', enlaceClave: 'https://openrouter.ai/keys', variables: ['OPENROUTER_API_KEY'],
    privacidad: 'nube-sin-retencion', licencia: null, verificado: null, fuente: 'free-catalog' },
  { id: 'proveedor-prohibido', nombre: 'Proveedor Prohibido', tipo: 'proveedor', papeles: ['escritor'],
    gratis: { rpm: 10, porDia: 100, horasMes: null, almacenamientoGb: null, nota: 'Limitado' },
    requiereCuenta: true, enlaceAlta: 'https://ejemplo.com', enlaceClave: 'https://ejemplo.com', variables: ['CLAVE_PROHIBIDA'],
    privacidad: 'nube-con-retencion', licencia: null, verificado: null, fuente: 'proveedores-catalogo' },
];

const TAREA: Tarea = { papel: 'escritor', privado: false, tamano: 1000 };
const OFERTAS: OfertaContexto[] = [
  { id: 'astraura-158-local', nombre: 'Astraura 1.58-bit (esta neurona)', tipo: 'modelo', papel: ['escritor', 'revisor', 'chat'] },
  { id: 'ollama-local', nombre: 'Ollama (este equipo)', tipo: 'modelo', papel: ['escritor', 'chat'] },
];
const VINCULADAS = new Set(['openrouter-free']);
const PREFERENCIAS: Preferencias = { permitirPago: false, topeDiario: null, prohibidos: ['proveedor-prohibido'] };
const PAPEL: PapelRuta = 'escritor';

describe('aplicarEscalera', () => {
  const base = () => aplicarEscalera({ tarea: TAREA, ofertas: OFERTAS, catalogo: CATALOGO_UNIFICADO, vinculadas: VINCULADAS, preferencias: PREFERENCIAS, catalogoAstraura: CATALOGO_ASTRAURA, papelActual: PAPEL });

  it('pone la candidata local del peldaño 1 (Astraura 1.58 local) en primer lugar', () => {
    const { candidatos } = base();
    expect(candidatos[0].source.id).toBe('astraura-158-local');
    expect(candidatos[0].local158Priority).toBe(true);
    expect(candidatos[0].reason).toContain('Astraura local');
  });

  it('no incluye candidatas prohibidas', () => {
    const { candidatos } = base();
    expect(candidatos.map((c) => c.source.id)).not.toContain('proveedor-prohibido');
  });

  it('incluye opciones de ranking para los tres papeles', () => {
    const { opcionesPorPapel } = base();
    expect(opcionesPorPapel).toHaveProperty('escritor');
    expect(opcionesPorPapel).toHaveProperty('revisor');
    expect(opcionesPorPapel).toHaveProperty('director');
  });

  it('ordena candidatos por peldaño ascendente', () => {
    const { candidatos } = base();
    const i1 = candidatos.findIndex((c) => c.source.id === 'astraura-158-local');
    const i2 = candidatos.findIndex((c) => c.source.id === 'ollama-local');
    expect(i1).toBeLessThan(i2);
  });

  it('marca fromUser correctamente para proveedores vinculados', () => {
    const { candidatos } = base();
    const or = candidatos.find((c) => c.source.id === 'openrouter-free');
    expect(or?.fromUser).toBe(true);
  });
});