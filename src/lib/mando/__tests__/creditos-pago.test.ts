import { describe, it, expect } from 'vitest';
import { estadoCreditos, resumenCredito, textoExtras, DocCreditos } from '../creditos-pago';

// Example data from §3 of the contract
const ejemploDoc: DocCreditos = {
  version: 1,
  t: '2026-10-06T18:05:00-06:00',
  medidores: {
    claude: {
      id: 'claude',
      proveedor: 'anthropic',
      nombre: 'Claude · plan',
      tipo: 'plan',
      plan: 'suscripción',
      ventanas: [
        { id: 'sesion', etiqueta: 'Sesión (5 h)', usado_pct: 23, reinicia: '2026-10-06T18:10:00-06:00' },
        { id: 'semana', etiqueta: 'Semana (todos los modelos)', usado_pct: 41, reinicia: '2026-10-10T04:00:00-06:00' },
        { id: 'semana-fable', etiqueta: 'Semana (Fable)', usado_pct: 0, reinicia: '2026-10-10T04:00:00-06:00' }
      ],
      saldo: null,
      extras: {},
      fuente: 'terminal: claude -p /usage',
      leido: '2026-10-06T18:05:00-06:00',
      ok: true,
      obsoleto: false,
      error: null,
      enlace: 'https://claude.ai/settings/usage'
    },
    codex: {
      id: 'codex',
      proveedor: 'openai',
      nombre: 'ChatGPT · Codex',
      tipo: 'plan',
      plan: 'plus',
      ventanas: [
        { id: '5h', etiqueta: '5 horas', usado_pct: 0, reinicia: '2026-10-06T22:58:40-06:00' },
        { id: 'semana', etiqueta: 'Semana', usado_pct: 100, reinicia: '2026-10-09T22:12:51-06:00' }
      ],
      saldo: { valor: 0, unidad: 'créditos' },
      extras: {
        bloqueado: 'rate_limit_reached',
        uso_normal: false,
        reinicios_gratis: 1,
        reinicio_gratis_vence: '2026-10-29T12:10:00-06:00'
      },
      fuente: 'terminal: codex app-server',
      leido: '2026-10-06T18:05:00-06:00', // same as claude for simplicity
      ok: true,
      obsoleto: false,
      error: null,
      enlace: 'https://chatgpt.com/codex/settings/usage'
    }
  },
  historial: {
    claude: [{ t: '2026-10-06T18:00:00-06:00', v: { sesion: 22, semana: 40 } }]
  }
};

describe('estadoCreditos', () => {
  it('returns empty array for null doc', () => {
    const resultado = estadoCreditos(null, Date.now());
    expect(resultado).toEqual([]);
  });

  it('processes claude and codex correctly', () => {
    // Use a fixed timestamp for testing: 2026-10-06T18:05:00-06:00 (same as leido)
    const ahora = new Date('2026-10-06T18:05:00-06:00').getTime();
    const resultado = estadoCreditos(ejemploDoc, ahora);
    
    expect(resultado.length).toBe(2);
    
    // Find claude and codex
    const claude = resultado.find(m => m.id === 'claude');
    const codex = resultado.find(m => m.id === 'codex');
    
    expect(claude).toBeDefined();
    expect(codex).toBeDefined();
    
    // Check claude
    if (claude) {
      // Windows
      expect(claude.ventanas[0]).toMatchObject({
        id: 'sesion',
        usado_pct: 23,
        tono: 'ok', // 23% < 70
        queda: 77,
        reiniciada: false, // not yet
        minutosParaReinicio: 5 // 18:10 - 18:05 = 5 minutes
      });
      expect(claude.ventanas[1]).toMatchObject({
        id: 'semana',
        usado_pct: 41,
        tono: 'ok', // 41% < 70
        queda: 59,
        reiniciada: false,
        minutosParaReinicio: 4915 // 3 days 9 hours 55 minutes from Oct 6 18:05 to Oct 10 04:00
      });
      expect(claude.ventanas[2]).toMatchObject({
        id: 'semana-fable',
        usado_pct: 0,
        tono: 'ok',
        queda: 100,
        reiniciada: false,
        minutosParaReinicio: 4915 // same as semana
      });
      
      // Medidor level
      expect(claude.tono).toBe('ok'); // worst window is ok
      expect(claude.haceMin).toBe(0);
      expect(claude.obsoleto).toBe(false);
      expect(claude.resumen).toBe('41 % semana · reinicia sáb 4:00'); // semana is the most used at 41%
    }
    
    // Check codex
    if (codex) {
      // Windows
       expect(codex.ventanas[0]).toMatchObject({
         id: '5h',
         usado_pct: 0,
         tono: 'ok',
         queda: 100,
         reiniciada: false,
         minutosParaReinicio: 294 // 4 hours 53 minutes 40 seconds from 18:05 to 22:58:40 -> 294 minutes (ceil)
       });
      expect(codex.ventanas[1]).toMatchObject({
        id: 'semana',
        usado_pct: 100,
        tono: 'peligro', // >=90
        queda: 0,
        reiniciada: false,
        minutosParaReinicio: 4568 // 3 days 4 hours 7 minutes 51 seconds from 18:05 to 22:12:51 -> 4568 minutes (ceil)
      });
      
      // Medidor level
      expect(codex.tono).toBe('peligro'); // worst window is peligro
      expect(codex.haceMin).toBe(0);
      expect(codex.obsoleto).toBe(false);
      expect(codex.resumen).toBe('100 % semana · reinicia vie 22:12'); // semana is the most used at 100%
    }
    
    // Order: claude first, then codex
    expect(resultado[0].id).toBe('claude');
    expect(resultado[1].id).toBe('codex');
  });

  it('marks as obsoleto if leido older than 45 minutes', () => {
    const ahora = new Date('2026-10-06T18:05:00-06:00').getTime();
    const leidoAntiguo = new Date('2026-10-06T17:00:00-06:00').getTime(); // 65 minutes ago
    
    const docConLeidoAntiguo = {
      ...ejemploDoc,
      medidores: {
        ...ejemploDoc.medidores,
        claude: {
          ...ejemploDoc.medidores.claude,
          leido: new Date(leidoAntiguo).toISOString()
        }
      }
    };
    
    const resultado = estadoCreditos(docConLeidoAntiguo, ahora);
    const claude = resultado.find(m => m.id === 'claude');
    expect(claude).toBeDefined();
    if (claude) {
      expect(claude.obsoleto).toBe(true);
      expect(claude.haceMin).toBeGreaterThan(45);
    }
  });

  it('marks ventana as reiniciada if reinicia time passed', () => {
    const ahora = new Date('2026-10-06T18:15:00-06:00').getTime(); // after sesion reinicia (18:10)
    const resultado = estadoCreditos(ejemploDoc, ahora);
    const claude = resultado.find(m => m.id === 'claude');
    expect(claude).toBeDefined();
    if (claude) {
      const sesionVentana = claude.ventanas.find(v => v.id === 'sesion');
      expect(sesionVentana).toBeDefined();
      if (sesionVentana) {
        expect(sesionVentana.usado_pct).toBe(0); // reset to 0
        expect(sesionVentana.reiniciada).toBe(true);
        expect(sesionVentana.minutosParaReinicio).toBe(0);
        expect(sesionVentana.tono).toBe('ok'); // 0% -> ok
      }
    }
  });

  it('orders medidores: claude, codex, then others by name', () => {
    // Add a third medidor 'aaa' and 'zzz'
    const docConTres = {
      ...ejemploDoc,
      medidores: {
        ...ejemploDoc.medidores,
        aaa: {
          id: 'aaa',
          proveedor: 'test',
          nombre: 'AAA',
          tipo: 'test',
          plan: null,
          ventanas: [],
          saldo: null,
          extras: {},
          fuente: 'test',
          leido: '2026-10-06T18:05:00-06:00',
          ok: true,
          obsoleto: false,
          error: null,
          enlace: ''
        },
        zzz: {
          id: 'zzz',
          proveedor: 'test',
          nombre: 'ZZZ',
          tipo: 'test',
          plan: null,
          ventanas: [],
          saldo: null,
          extras: {},
          fuente: 'test',
          leido: '2026-10-06T18:05:00-06:00',
          ok: true,
          obsoleto: false,
          error: null,
          enlace: ''
        }
      }
    };
    
    const ahora = new Date('2026-10-06T18:05:00-06:00').getTime();
    const resultado = estadoCreditos(docConTres, ahora);
    
    expect(resultado.map(m => m.id)).toEqual(['claude', 'codex', 'aaa', 'zzz']);
  });

  it('returns [] when doc is null', () => {
    expect(estadoCreditos(null, Date.now())).toEqual([]);
  });
});

describe('resumenCredito', () => {
  it('returns resumen for claude example', () => {
    const claude = ejemploDoc.medidores.claude;
    expect(resumenCredito(claude)).toBe('41 % semana · reinicia sáb 4:00');
  });

  it('returns resumen for codex example', () => {
    const codex = ejemploDoc.medidores.codex;
    expect(resumenCredito(codex)).toBe('100 % semana · reinicia vie 22:12');
  });

  it('returns saldo format when no windows but has saldo', () => {
    const medidorConSaldo: any = {
      id: 'test',
      proveedor: 'test',
      nombre: 'Test',
      tipo: 'test',
      plan: null,
      ventanas: [],
      saldo: { valor: 7.5, unidad: 'USD' },
      extras: {},
      fuente: 'test',
      leido: '2026-10-06T18:05:00-06:00',
      ok: true,
      obsoleto: false,
      error: null,
      enlace: ''
    };
    expect(resumenCredito(medidorConSaldo)).toBe('saldo 7,50 USD');
  });

  it('returns sin lectura when no windows and no saldo', () => {
    const medidorSinDatos: any = {
      id: 'test',
      proveedor: 'test',
      nombre: 'Test',
      tipo: 'test',
      plan: null,
      ventanas: [],
      saldo: null,
      extras: {},
      fuente: 'test',
      leido: '2026-10-06T18:05:00-06:00',
      ok: true,
      obsoleto: false,
      error: null,
      enlace: ''
    };
    expect(resumenCredito(medidorSinDatos)).toBe('sin lectura');
  });
});

describe('textoExtras', () => {
  it('returns combined extras for codex example', () => {
    const codex = ejemploDoc.medidores.codex;
    expect(textoExtras(codex)).toBe('1 reinicio gratis hasta el 29 oct, bloqueado: rate_limit_reached, uso normal cortado');
  });

  it('returns only reinicio gratis when present', () => {
    const medidor: any = {
      id: 'test',
      proveedor: 'test',
      nombre: 'Test',
      tipo: 'test',
      plan: null,
      ventanas: [],
      saldo: null,
      extras: {
        reinicios_gratis: 2,
        reinicio_gratis_vence: '2026-11-01T12:00:00-06:00'
      },
      fuente: 'test',
      leido: '2026-10-06T18:05:00-06:00',
      ok: true,
      obsoleto: false,
      error: null,
      enlace: ''
    };
    expect(textoExtras(medidor)).toBe('2 reinicio gratis hasta el 1 nov');
  });

  it('returns only bloqueado when present', () => {
    const medidor: any = {
      id: 'test',
      proveedor: 'test',
      nombre: 'Test',
      tipo: 'test',
      plan: null,
      ventanas: [],
      saldo: null,
      extras: {
        bloqueado: 'some_error'
      },
      fuente: 'test',
      leido: '2026-10-06T18:05:00-06:00',
      ok: true,
      obsoleto: false,
      error: null,
      enlace: ''
    };
    expect(textoExtras(medidor)).toBe('bloqueado: some_error');
  });

  it('returns only uso normal cortado when uso_normal is false', () => {
    const medidor: any = {
      id: 'test',
      proveedor: 'test',
      nombre: 'Test',
      tipo: 'test',
      plan: null,
      ventanas: [],
      saldo: null,
      extras: {
        uso_normal: false
      },
      fuente: 'test',
      leido: '2026-10-06T18:05:00-06:00',
      ok: true,
      obsoleto: false,
      error: null,
      enlace: ''
    };
    expect(textoExtras(medidor)).toBe('uso normal cortado');
  });

  it('returns empty string when no extras', () => {
    const medidor: any = {
      id: 'test',
      proveedor: 'test',
      nombre: 'Test',
      tipo: 'test',
      plan: null,
      ventanas: [],
      saldo: null,
      extras: {},
      fuente: 'test',
      leido: '2026-10-06T18:05:00-06:00',
      ok: true,
      obsoleto: false,
      error: null,
      enlace: ''
    };
    expect(textoExtras(medidor)).toBe('');
  });
});