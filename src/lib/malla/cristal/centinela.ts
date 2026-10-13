// Centinela: antivirus propio por bytes mágicos y estructura (malla cristalina §4.5).
// Módulo puro: nada de disco, red, node:* ni ClamAV (eso vive en la app nativa).

export const MOTIVOS = [
  'ejecutable', 'guion', 'doble-extension', 'tipo-real-distinto',
  'html-con-codigo', 'macro-office', 'ruta-escape-zip', 'bomba-compresion',
  'tamano-excedido',
] as const;
export type MotivoPeligro = typeof MOTIVOS[number];

export interface EntradaZip { nombre: string; tamanoDescomprimido: number; tamanoComprimido: number }

export interface CandidatoArchivo {
  nombre: string;
  tipoDeclarado?: string; // MIME declarado por el emisor
  bytes: Uint8Array;      // al menos las primeras ~600 bytes del archivo
  tamano: number;         // tamaño total en bytes
  entradasZip?: EntradaZip[]; // si es ZIP, su índice ya leído
}

export interface Veredicto { peligroso: boolean; motivos: MotivoPeligro[] }

const MAGICOS: Array<{ offset: number; firma: number[]; mime: string }> = [
  { offset: 0, firma: [0x89, 0x50, 0x4e, 0x47], mime: 'image/png' },
  { offset: 0, firma: [0xff, 0xd8, 0xff], mime: 'image/jpeg' },
  { offset: 0, firma: [0x25, 0x50, 0x44, 0x46], mime: 'application/pdf' },
  { offset: 0, firma: [0x50, 0x4b, 0x03, 0x04], mime: 'application/zip' },
  { offset: 0, firma: [0x1f, 0x8b], mime: 'application/gzip' },
  { offset: 0, firma: [0x52, 0x61, 0x72, 0x21], mime: 'application/vnd.rar' },
];

// Firmas de ejecutables y contenedores de macros (OLE2 de Office antiguo).
const MAGICOS_PELIGROSOS: Array<{ firma: number[]; motivo: MotivoPeligro }> = [
  { firma: [0x4d, 0x5a], motivo: 'ejecutable' },              // MZ (PE/EXE/DLL)
  { firma: [0x7f, 0x45, 0x4c, 0x46], motivo: 'ejecutable' },  // ELF
  { firma: [0xd0, 0xcf, 0x11, 0xe0], motivo: 'macro-office' }, // OLE2 (.doc/.xls/)
];

const EXT_EJECUTABLE = /\.(exe|dll|so|dylib|app|msi|bat|cmd|com|scr|ps1)$/i;
const EXT_GUION = /\.(js|mjs|vbs|sh|py|rb|pl|php)$/i;
const EXT_TEXTO_PLANO = /\.(txt|md|csv)$/i; // en estas, la «extensión» anterior no engaña
const LIMITE_TAMANO = 512 * 1024 * 1024; // 512 MB por archivo en la malla
const RAZON_BOMBA = 100; // descomprimido / comprimido máximo admitido por entrada
function coincide(bytes: Uint8Array, firma: number[], offset = 0): boolean {
  return firma.every((b, i) => bytes[offset + i] === b);
}

function textoVisible(bytes: Uint8Array): string {
  let s = '';
  const tope = Math.min(bytes.length, 4096);
  for (let i = 0; i < tope; i++) s += bytes[i] >= 0x20 && bytes[i] < 0x7f ? String.fromCharCode(bytes[i]) : ' ';
  return s.toLowerCase();
}

function tieneDobleExtension(nombre: string): boolean {
  const base = nombre.split('/').pop() ?? nombre;
  const partes = base.split('.');
  if (partes.length < 3) return false;
  if (EXT_TEXTO_PLANO.test(base)) return false;
  return EXT_EJECUTABLE.test(base) || EXT_GUION.test(base);
}

// Veredicto del centinela: firmas reales frente a lo declarado y trucos de estructura.
// El centro solo manda a cuarentena si ≥ 2 cuentas lo marcan (resonancias, §4.6).
export function examinar(c: CandidatoArchivo): Veredicto {
  const motivos = new Set<MotivoPeligro>();
  const b = c.bytes;

  if (c.tamano > LIMITE_TAMANO) motivos.add('tamano-excedido');
  if (EXT_EJECUTABLE.test(c.nombre)) motivos.add('ejecutable');
  if (EXT_GUION.test(c.nombre)) motivos.add('guion');
  if (tieneDobleExtension(c.nombre)) motivos.add('doble-extension');

  for (const m of MAGICOS_PELIGROSOS) if (coincide(b, m.firma)) motivos.add(m.motivo);

  if (c.tipoDeclarado) {
    const declara = c.tipoDeclarado.toLowerCase();
    const esImagenOgg = declara === 'application/octet-stream';
    const real = MAGICOS.find((m) => coincide(b, m.firma, m.offset));
    if (real) {
      if (!esImagenOgg && declara !== real.mime && !(real.mime === 'application/zip' && declara.includes('officedocument'))) {
        motivos.add('tipo-real-distinto');
      }
    } else if (!esImagenOgg && declara.startsWith('image/') && b.length >= 12) {
      motivos.add('tipo-real-distinto'); // declara imagen sin firma alguna
    }
  }

  // HTML y SVG con código incrustado.
  const texto = textoVisible(b);
  const pareceHtml = texto.includes('<html') || texto.includes('<svg');
  if (pareceHtml && (texto.includes('<script') || texto.includes('javascript:') || texto.includes('onload='))) {
    motivos.add('html-con-codigo');
  }

  // ZIP: rutas de escape y bombas de compresión (el índice lo lee el llamador).
  if (c.entradasZip) {
    let total = 0;
    let comprimido = 0;
    for (const e of c.entradasZip) {
      const limpia = e.nombre.replace(/\\/g, '/');
      if (limpia.startsWith('/') || limpia.split('/').includes('..')) motivos.add('ruta-escape-zip');
      total += e.tamanoDescomprimido;
      comprimido += Math.max(1, e.tamanoComprimido);
      if (e.tamanoComprimido > 0 && e.tamanoDescomprimido / e.tamanoComprimido > RAZON_BOMBA) {
        motivos.add('bomba-compresion');
      }
    }
    if (total > LIMITE_TAMANO && total / comprimido > RAZON_BOMBA * PORCENTAJE_BOMBA) {
      motivos.add('bomba-compresion');
    }
  }

  return { peligroso: motivos.size > 0, motivos: [...motivos] };
}
