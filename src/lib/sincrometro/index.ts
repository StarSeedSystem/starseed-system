// src/lib/sincrometro/index.ts
/**
 * Punto de entrada del sistema Sincrómetro.
 *
 * Re-exporta tipos, metadatos y conversores. Cualquier superficie que quiera
 * leer o renderizar el tiempo debe importar desde aquí, no de los submódulos.
 */

export * from './types';
export * from './converter';
export * from './horoscopes';
