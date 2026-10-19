import { describe, test, expect } from 'vitest';
import { planInstalacion } from '../instalar-recurso';
import { ReferenciaEntrada } from '../types';

describe('planInstalacion', () => {
  // Mock entrada for each resource
  const createEntrada = (overrides: Partial<ReferenciaEntrada>): ReferenciaEntrada => ({
    id: 'test-id',
    nombre: 'Test Resource',
    url: 'https://example.com',
    tema: 'test',
    subtema: null,
    que_es: 'Test resource',
    tipo: 'test',
    acceso: 'libre',
    clase_uso: 'reutilizable',
    condiciones: 'Test conditions.',
    canales: ['test'],
    prohibido: [],
    actualizacion: [],
    integracion: [],
    terminos: null,
    og_imagen: null,
    verificado: '2026-10-18',
    sin_verificar: [],
    ...overrides,
  });

  const contexts: ('personal' | 'grupo' | 'comunidad' | 'publico' | 'comercial')[] = [
    'personal',
    'grupo',
    'comunidad',
    'publico',
    'comercial',
  ];

  describe('Motion Primitives', () => {
    const entrada = createEntrada({
      id: 'motion-primitives',
      clase_uso: 'reutilizable',
      condiciones: 'MIT (repo y paquete npm): conservar el aviso.',
    });

    contexts.forEach(contexto => {
      test(`returns correct plan for ${contexto} context`, () => {
        const result = planInstalacion(entrada, 'motion-primitives', contexto);
        expect(result.permitido).toBe(true);
        expect(result.pasos).toEqual([
          'Utilizar los componentes de Motion Primitives ya adaptados a framer-motion en el OS.'
        ]);
        expect(result.avisos).toContain('aviso MIT');
        expect(result.atribucion).toBeUndefined();
      });
    });
  });

  describe('transitions.dev', () => {
    const entrada = createEntrada({
      id: 'transitions-dev',
      clase_uso: 'reutilizable-con-condiciones',
      condiciones: 'Uso personal y comercial ilimitado dentro de productos; conservar el comentario «transitions.dev» en cada transición; no reempaquetar como librería; las «Pro» son de pago. CLI y Refine MIT.',
    });

    contexts.forEach(contexto => {
      test(`returns correct plan for ${contexto} context`, () => {
        const result = planInstalacion(entrada, 'transitions-dev', contexto);
        expect(result.permitido).toBe(true);
        expect(result.pasos).toEqual(['Ejecutar el comando: npx transitions-dev add --free']);
        expect(result.avisos).toContain('conservar el comentario «transitions.dev»');
        expect(result.atribucion).toBeUndefined();
      });
    });
  });

  describe('LottieFiles', () => {
    const entrada = createEntrada({
      id: 'lottiefiles',
      clase_uso: 'reutilizable-con-condiciones',
      condiciones: 'Animaciones gratuitas bajo Lottie Simple License (uso comercial, modificar, sin atribución obligatoria; derivadas bajo la misma licencia); pero sus Términos dicen que los planes Free/Individual son solo no comerciales: en uso comercial, confirmar el plan antes. Reproductores lottie-web y dotlottie-* MIT.',
    });

    contexts.forEach(contexto => {
      test(`returns correct plan for ${contexto} context`, () => {
        const result = planInstalacion(entrada, 'lottiefiles', contexto);
        expect(result.permitido).toBe(true);
        expect(result.pasos).toEqual([
          'Instalar el reproductor: npm install @lottiefiles/dotlottie-react',
          'Configurar el MCP de LottieFiles si se requiere acceso a la biblioteca.'
        ]);
        expect(result.avisos).toContain('Lottie Simple License; en uso comercial, confirmar el plan');
        expect(result.atribucion).toBeUndefined();
      });
    });
  });

  describe('Fontshare', () => {
    const entrada = createEntrada({
      id: 'fontshare',
      clase_uso: 'reutilizable-con-condiciones',
      condiciones: 'ITF Free Font License (no es de código abierto): uso personal y comercial gratis; no revender ni redistribuir. En el OS se sirven por su CSS API, nunca empaquetando los archivos, hasta leer el texto completo de la licencia.',
    });

    contexts.forEach(contexto => {
      test(`returns correct plan for ${contexto} context`, () => {
        const result = planInstalacion(entrada, 'fontshare', contexto);
        expect(result.permitido).toBe(true);
        expect(result.pasos).toEqual([
          'Utilizar la CSS alojada de Fontshare mediante su API: https://api.fontshare.com/v2/css?f[]=satoshi@400&display=swap',
          'No empaquetar los archivos de fuente.'
        ]);
        expect(result.avisos).toContain('ITF FFL: nunca empaquetar los archivos');
        expect(result.atribucion).toBeUndefined();
      });
    });
  });

  describe('Icons8', () => {
    const entrada = createEntrada({
      id: 'icons8',
      clase_uso: 'reutilizable-con-condiciones',
      condiciones: 'Gratis con enlace a Icons8 (pie de la web, «Acerca de» o ajustes de la app); SVG completo y sin enlace con suscripción; no distribuir de forma que se puedan extraer; UI kits y editores necesitan permiso escrito.',
    });

    contexts.forEach(contexto => {
      test(`returns correct plan for ${contexto} context`, () => {
        const result = planInstalacion(entrada, 'icons8', contexto);
        expect(result.permitido).toBe(true);
        expect(result.pasos).toEqual([
          'Utilizar el MCP de Icons8 para obtener iconos en formato PNG o usar el renderer PNG.',
          'Para SVG completo, requerir suscripción de pago.'
        ]);
        expect(result.avisos).toContain('enlace a Icons8 en el pie o «Acerca de»');
        expect(result.atribucion).toBe('Enlace a Icons8 en el pie de la página o en la sección «Acerca de» de la aplicación.');
      });
    });
  });

  describe('Flaticon', () => {
    const entrada = createEntrada({
      id: 'flaticon',
      clase_uso: 'reutilizable-con-condiciones',
      condiciones: 'Gratis con atribución a Flaticon y al autor (Premium la quita); no meterlos en un producto o base que ofrezca iconos; no revender; prohibido entrenar IA con ellos. Para incluirlos en el OS hace falta confirmación escrita o Premium.',
    });

    contexts.forEach(contexto => {
      test(`returns correct plan for ${contexto} context`, () => {
        const result = planInstalacion(entrada, 'flaticon', contexto);
        expect(result.permitido).toBe(true);
        expect(result.pasos).toEqual([
          'Utilizar la API oficial de Flaticon para obtener iconos.',
          'No incluir los iconos en un pack que se redistribuya.'
        ]);
        expect(result.avisos).toContain('atribución; nunca en un pack de iconos; nunca para entrenar IA');
        expect(result.atribucion).toBe('Atribución a Flaticon y al autor del icono.');
      });
    });
  });

  describe('Higgsfield', () => {
    const entrada = createEntrada({
      id: 'higgsfield',
      clase_uso: 'reutilizable-con-condiciones',
      condiciones: 'Lo generado no lo reclama Higgsfield y admite uso comercial; hay que revelar contenido sintético cuando la ley lo exija y no quitar marcas C2PA; sus salidas no pueden entrenar otros modelos; la cuenta y los créditos son de cada persona.',
    });

    contexts.forEach(contexto => {
      test(`returns correct plan for ${contexto} context`, () => {
        const result = planInstalacion(entrada, 'higgsfield', contexto);
        expect(result.permitido).toBe(true);
        expect(result.pasos).toEqual([
          'Utilizar el MCP oficial de Higgsfield o su CLI con la cuenta de la persona.',
          'Asegurarse de que la cuenta tenga créditos de pago.'
        ]);
        expect(result.avisos).toContain('créditos de pago suyos; revelar contenido sintético cuando toque');
        expect(result.atribucion).toBeUndefined();
      });
    });
  });

  describe('SlopMonster', () => {
    const entrada = createEntrada({
      id: 'slopmonster',
      clase_uso: 'reutilizable',
      condiciones: 'MIT: conservar el aviso de copyright. Solo analiza inglés.',
    });

    contexts.forEach(contexto => {
      test(`returns correct plan for ${contexto} context`, () => {
        const result = planInstalacion(entrada, 'slopmonster', contexto);
        expect(result.permitido).toBe(true);
        expect(result.pasos).toEqual(['Instalar la skill de SlopMonster para revisión de textos en inglés.']);
        expect(result.avisos).toContain('aviso MIT');
        expect(result.atribucion).toBeUndefined();
      });
    });
  });

  describe('Non-installable resources', () => {
    const entrada = createEntrada({
      id: 'some-non-installable',
      clase_uso: 'solo-referencia',
      condiciones: 'Some conditions.',
    });

    contexts.forEach(contexto => {
      test(`returns not permitted for ${contexto} context`, () => {
        const result = planInstalacion(entrada, 'some-non-installable', contexto);
        expect(result.permitido).toBe(false);
        expect(result.pasos).toEqual([]);
        expect(result.avisos).toEqual(['No es instalable: solo referencia o solo enlace']);
      });
    });
  });

  describe('Unknown resource', () => {
    const entrada = createEntrada({
      id: 'unknown-resource',
      clase_uso: 'reutilizable',
      condiciones: 'Some conditions.',
    });

    contexts.forEach(contexto => {
      test(`returns not permitted for unknown resource ${contexto} context`, () => {
        const result = planInstalacion(entrada, 'unknown-id', contexto);
        expect(result.permitido).toBe(false);
        expect(result.pasos).toEqual([]);
        expect(result.avisos).toEqual(['Recurso no reconocido para instalación: unknown-id']);
      });
    });
  });
});