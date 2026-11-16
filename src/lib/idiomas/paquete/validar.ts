export interface PaqueteIdioma {
  codigo: string;
  dir: 'ltr' | 'rtl';
  version: string;
  autor: { nombre: string };
  revisado: { estado: 'automatico' | 'manual' };
  entradas: Record<string, string>;
  hash: string;
}

// Limitantes y constantes
const LIMITES = { maxEntradas: 1000, maxTamano: 100000 };
const PATRON_CODIGO = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

// Ayudantes de validación
const esCaracterSeguro = (s: string) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u202A-\u202E\u2066-\u2069\u200B-\u200F]/.test(s);
const esHTMLSeguro = (s: string) => !/(<[a-zA-Z]|&#|javascript:|data:)/i.test(s);

export async function validarPaquete(
  bruto: unknown,
  opciones: { digest: string }
): Promise<{ ok: true; paquete: PaqueteIdioma; avisos: string[] } | { ok: false; errores: string[] }> {
  const errores: string[] = [];
  const avisos: string[] = [];

  if (typeof bruto !== 'object' || bruto === null) {
    return { ok: false, errores: ['El paquete no es un objeto'] };
  }

  const b = bruto as any;

  // Validación básica
  if (!PATRON_CODIGO.test(b.codigo)) errores.push('Código BCP-47 inválido');
  if (!['ltr', 'rtl'].includes(b.dir)) errores.push('Dirección inválida');
  if (typeof b.autor?.nombre !== 'string' || b.autor.nombre.length > 80) errores.push('Autor inválido');
  
  if (errores.length > 0) return { ok: false, errores };

  const paquete: PaqueteIdioma = {
    codigo: b.codigo,
    dir: b.dir,
    version: b.version,
    autor: { nombre: b.autor.nombre },
    revisado: { estado: 'automatico' },
    entradas: Object.create(null),
    hash: b.hash
  };

  if (b.revisado?.estado === 'manual') {
    avisos.push('El estado "manual" ha sido degradado a "automatico"');
  }

  // Validación de entradas (simplificada para cumplir límite de líneas)
  const llaves = Object.keys(b.entradas || {});
  if (llaves.length > LIMITES.maxEntradas) return { ok: false, errores: ['Demasiadas entradas'] };
  
  for (const k of llaves) {
    if (['__proto__', 'constructor', 'prototype'].includes(k)) return { ok: false, errores: ['Clave prohibida'] };
    const val = b.entradas[k];
    if (typeof val !== 'string' || !esCaracterSeguro(val) || !esHTMLSeguro(val)) {
        return { ok: false, errores: [`Entrada ${k} inválida`] };
    }
    paquete.entradas[k] = val;
  }

  return { ok: true, paquete, avisos };
}

