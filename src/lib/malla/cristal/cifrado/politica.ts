// Malla cristalina SiO₂: política de transporte por clase y medio.
// Módulo puro: sin node:*, sin Supabase, sin `window` — corre en navegador y en pruebas.

import type { ClaseDato, Dato, Medio } from '../tipos';

/** Resultado de la política de transporte para un dato y un medio concretos. */
export interface PoliticaTransporte {
  permitido: boolean;
  /** Cifrado de extremo a extremo obligatorio (capa 2 del contrato). */
  cifradoE2E: boolean;
  /** Firma del origen: siempre exigida (capa 4 del contrato). */
  firma: boolean;
  /** Explicación honesta en español, para pintarla en la UI. */
  motivo: string;
}

/** NFC solo lleva tramas cortas: tope para un dato público que viaje en claro por NFC. */
export const NFC_LIMITE_PUBLICO_BYTES = 32 * 1024;

/**
 * Política de transporte: — firma SIEMPRE; — cifrado E2E obligatorio para `interno` y
 * `privado` por CUALQUIER medio (también `lora`: la clave del canal de la radio no basta);
 * — `publico` va sin cifrar pero firmado; — ningún medio prohibido salvo `nfc` para un
 * `publico` de más de 32 KB.
 */
export function politicaDeTransporte(
  clase: ClaseDato,
  medio: Medio,
  bytes = 0,
): PoliticaTransporte {
  const cifradoE2E = clase !== 'publico';
  if (medio === 'nfc' && clase === 'publico' && bytes > NFC_LIMITE_PUBLICO_BYTES) {
    return {
      permitido: false,
      cifradoE2E,
      firma: true,
      motivo: 'NFC solo transporta tramas cortas: un dato público de más de 32 KB no cabe',
    };
  }
  if (cifradoE2E) {
    return {
      permitido: true,
      cifradoE2E: true,
      firma: true,
      motivo: `dato ${clase}: cifrado de extremo a extremo obligatorio por cualquier medio; firma siempre`,
    };
  }
  return {
    permitido: true,
    cifradoE2E: false,
    firma: true,
      motivo: 'dato público: viaja sin cifrar pero siempre firmado',
  };
}

/**
 * AAD (datos asociados autenticados) del cifrado E2E: UTF-8 de
 * `${dato.id}|${dato.clase}|${dato.tipo}|${epoca}` — la época del trinquete viaja aquí.
 */
export function aadDe(dato: Dato, epoca: number): Uint8Array {
  return new TextEncoder().encode(`${dato.id}|${dato.clase}|${dato.tipo}|${epoca}`);
}
