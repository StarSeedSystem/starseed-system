// Centinela: antivirus propio para malla de sílice
export type Nivel = 'limpio' | 'sospechoso' | 'peligroso';
export interface ArchivoEntrada {
  nombre: string;
  tipoDeclarado?: string;
  inicio: Uint8Array;
  tamano: number;
  entradasZip?: Array<{ruta: string; tamano: number; comprimido: number}>;
}
export interface ResultadoAnalisis {
  nivel: Nivel;
  motivos: string[];
}
function detectarTipoReal(u: Uint8Array): string | null {
  if (!u.length) return null;
  if (u.length >= 8 && u[0]==0x89 && u[1]==0x50 && u[2]==0x4E && u[3]==0x47 && u[4]==0x0D && u[5]==0x0A && u[6]==0x1A && u[7]==0x0A) return 'png';
  if (u.length >= 3 && u[0]==0xFF && u[1]==0xD8 && u[2]==0xFF) return 'jpeg';
  if (u.length >= 6 && u[0]==0x47 && u[1]==0x49 && u[2]==0x46 && u[3]==0x38 && (u[4]==0x37&&u[5]==0x61 || u[4]==0x39&&u[5]==0x61)) return 'gif';
  if (u.length >= 4 && u[0]==0x25 && u[1]==0x50 && u[2]==0x44 && u[3]==0x46) return 'pdf';
  if (u.length >= 4 && ((u[0]==0x50 && u[1]==0x4B && u[2]==0x03 && u[3]==0x04) || (u[0]==0x50 && u[1]==0x4B && u[2]==0x05 && u[3]==0x06) || (u[0]==0x50 && u[1]==0x4B && u[2]==0x07 && u[3]==0x08))) return 'zip';
  if (u.length >= 8 && u[4]==0x66 && u[5]==0x74 && u[6]==0x79 && u[7]==0x70) return 'mp4';
  if (u.length >= 12 && u[0]==0x52 && u[1]==0x49 && u[2]==0x46 && u[3]==0x46 && u[8]==0x57 && u[9]==0x45 && u[10]==0x42 && u[11]==0x50) return 'webp';
  if (u.length >= 3 && u[0]==0x49 && u[1]==0x44 && u[2]==0x33) return 'mp3';
  return null;
}
export function analizarArchivo(e: ArchivoEntrada): ResultadoAnalisis {
  const m: string[] = [];
  const magic = e.inicio;
  const ext = e.nombre.substring(e.nombre.lastIndexOf('.')).toLowerCase();
  let txt = '';
  try {
    txt = new TextDecoder('utf-8').decode(e.inicio);
  } catch (_) {}
  // Peligrosos: ejecutables
  if (magic.length >= 2 && ((magic[0]===0x4D && magic[1]===0x5A) || (magic[0]===0x5A && magic[1]===0x4D))) m.push('Peligroso: ejecutable detectado por bytes mágicos MZ');
  if (magic.length >= 4) {
    const elf = [0x7F,0x45,0x4C,0x46], elfI = [0x46,0x4C,0x45,0x7F];
    if ((magic[0]===elf[0] && magic[1]===elf[1] && magic[2]===elf[2] && magic[3]===elf[3]) || (magic[0]===elfI[0] && magic[1]===elfI[1] && magic[2]===elfI[2] && magic[3]===elfI[3])) m.push('Peligroso: ejecutable detectado por bytes mágicos ELF');
    const m1 = [0xFE,0xED,0xFA,0xCE], m1I = [0xCE,0xFA,0xED,0xFE];
    const m2 = [0xFE,0xED,0xFA,0xCF], m2I = [0xCF,0xFA,0xED,0xFE];
    const m3 = [0xCA,0xFE,0xBA,0xBE], m3I = [0xBE,0xBA,0xFE,0xCA];
    if ((magic[0]===m1[0] && magic[1]===m1[1] && magic[2]===m1[2] && magic[3]===m1[3]) ||
        (magic[0]===m1I[0] && magic[1]===m1I[1] && magic[2]===m1I[2] && magic[3]===m1I[3]) ||
        (magic[0]===m2[0] && magic[1]===m2[1] && magic[2]===m2[2] && magic[3]===m2I[3]) ||
        (magic[0]===m2I[0] && magic[1]===m2I[1] && magic[2]===m2I[2] && magic[3]===m2I[3]) ||
        (magic[0]===m3[0] && magic[1]===m3[1] && magic[2]===m3[2] && magic[3]===m3I[3]) ||
        (magic[0]===m3I[0] && magic[1]===m3I[1] && magic[2]===m3I[2] && magic[3]===m3I[3])) m.push('Peligroso: ejecutable detectado por bytes mágicos Mach-O');
  }
  // Peligrosos: extensiones
  const extPel = ['.exe','.dll','.scr','.bat','.cmd','.com','.msi','.ps1','.vbs','.jar','.apk','.dmg','.pkg','.app'];
  if (extPel.includes(ext)) m.push(`Peligroso: extensión peligrosa ${ext}`);
  // Peligrosos: doble extensión
  const parts = e.nombre.split('.');
  if (parts.length >= 3) {
    const ext1 = `.${parts[parts.length-2]}`.toLowerCase();
    const ext2 = `.${parts[parts.length-1]}`.toLowerCase();
    if (extPel.includes(ext2) && !extPel.includes(ext1)) m.push('Peligroso: doble extensión detectada');
  }
  // Peligrosos: ZIP con rutas de escape
  if (e.entradasZip) {
    for (const ent of e.entradasZip) {
      if (ent.ruta.includes('..') || ent.ruta.startsWith('/')) {
        m.push(`Peligroso: entrada de ZIP con ruta de escape: ${ent.ruta}`);
        break;
      }
    }
  }
  // Peligrosos: bomba de compresión
  if (e.entradasZip) {
    const dix = 10*1024*1024;
    for (const ent of e.entradasZip) {
      if (ent.tamano > dix && ent.comprimido > 0) {
        const ratio = ent.tamano / ent.comprimido;
        if (ratio > 100) {
          m.push(`Peligroso: bomba de compresión detectada (ratio ${ratio.toFixed(2)})`);
          break;
        }
      }
    }
  }
  // Sospechosos: tipo real no coincide
  const tipoReal = detectarTipoReal(e.inicio);
  if (tipoReal !== null) {
    const extSin = ext.substring(1);
    if (extSin && tipoReal !== extSin && tipoReal.toLowerCase() !== extSin.toLowerCase()) m.push(`Sospechoso: tipo real (${tipoReal}) no coincide con la extensión (${extSin})`);
    if (e.tipoDeclarado && tipoReal !== e.tipoDeclarado && tipoReal.toLowerCase() !== e.tipoDeclarado.toLowerCase()) m.push(`Sospechoso: tipo real (${tipoReal}) no coincide con el tipo declarado (${e.tipoDeclarado})`);
  }
  // Sospechosos: shebang
  if (magic.length >= 2 && magic[0]===0x23 && magic[1]===0x21) m.push('Sospechoso: archivo comienza con shebang (#!)');
  // Sospechosos: HTML/JS
  if (txt) {
    const pat = ['<script','javascript:','onload=','onerror=','onclick=','onmouseover=','onfocus=','onblur=','onsubmit=','onchange=','onkeydown=','onkeyup=','onkeypress='];
    for (const p of pat) {
      if (txt.toLowerCase().includes(p.toLowerCase())) {
        m.push(`Sospechoso: contenido peligroso detectado en HTML/SVG: ${p}`);
        break;
      }
    }
  }
  // Sospechosos: vbaProject.bin en ZIP
  if (e.entradasZip) {
    for (const ent of e.entradasZip) {
      if (ent.ruta === 'vbaProject.bin') {
        m.push('Sospechoso: archivo vbaProject.bin encontrado dentro de ZIP');
        break;
      }
    }
  }
   // Sospechosos: PDF con JavaScript/OpenAction
   if (tipoReal === 'pdf') {
     if (txt && (txt.includes('/JavaScript') || txt.includes('/OpenAction') || txt.includes('/OpeAction'))) {
       m.push('Sospechoso: PDF contiene JavaScript o OpenAction');
     }
   }
   // Determinar nivel
  let niv: Nivel = 'limpio';
  if (m.some(s => s.startsWith('Peligroso'))) niv = 'peligroso';
  else if (m.length > 0) niv = 'sospechoso';
  return { nivel: niv, motivos: m };
}