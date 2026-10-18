/**
 * StarSeed OS — Corrector por glosario de oído.
 * "Astraura", "StarSeed", "MetaGenesis", "PoliGenesis", "Genesis", "ProtoGenesis",
 * "Aurora", "Hermes", "Servicio StarSeed", "Motor StarSeed".
 * Reemplaza solo palabras cercanas (≤ 0.34 edit‑distance normalizada) que NO son comunes.
 * Contrato: architecture/voz-fusionada-astraura.md (§3: nombres propios).
 */

type IdiomaComun = 'es' | 'en';

export interface CorreccionGlosario {
  original: string;
  corregido: string;
}

export const PALABRAS_COMUNES: Record<IdiomaComun, string[]> = {
  es: [
    'el', 'la', 'de', 'que', 'y', 'en', 'un', 'es', 'se', 'no', 'te', 'lo', 'le', 'da', 'su',
    'por', 'son', 'con', 'para', 'como', 'estar', 'haber', 'una', 'muy', 'años', 'hasta', 'desde',
    'está', 'todo', 'tiempo', 'esta', 'hay', 'cualquier', 'ser', 'será', 'este', 'sólo', 'tener',
    'hacer', 'otros', 'este', 'así', 'dicho', 'entre', 'ver', 'poder', 'otros', 'tras', 'porque',
    'año', 'dos', 'bien', 'vez', 'donde', 'ella', 'sin', 'tanto', 'toda', 'estar', 'mirar', 'saber',
    'ser', 'seguir', 'debajo', 'sacar', 'buscar', 'decir', 'por', 'mientras', 'llevar', 'creer',
    'querer', 'todo', 'sino', 'entre', 'ayer', 'mucho', 'dar', 'ver', 'casa', 'día', 'partir',
    'conseguir', 'hacer', 'otra', 'personas', 'servir', 'trabajo', 'tres', 'necesitar', 'tan',
    'hacer', 'sentir', 'año', 'seguir', 'bajar', 'estudiar', 'llegar', 'decidir', 'comenzar',
    'aprender', 'cambiar', 'salir', 'sin', 'día', 'donde', 'sea', 'sentir', 'vivir', 'empezar',
    'traer', 'pensar', 'decir', 'seguir', 'nada', 'al', 'sino', 'entonces', 'ver', 'cambiar',
    'seguir', 'casa', 'vamos', 'siguiente', 'otra', 'poco', 'hacer', 'mirar', 'estar', 'sentir',
    'vivo', 'juntos', 'creer', 'poder', 'ocurrir', 'llevar', 'después', 'siempre', 'casa',
    'mundo', 'morir', 'tierra', 'ver'
  ],
  en: [
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'I', 'it', 'for', 'not', 'on', 'with',
    'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if',
    'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just',
    'him', 'know', 'take', 'person', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see',
    'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back',
    'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because',
    'any', 'these', 'give', 'day', 'most', 'us'
  ]
};

export const DEFAULT_GLOSAARIO = [
  'Astraura', 'StarSeed', 'StarSeed OS', 'MetaGenesis', 'PoliGenesis', 'Genesis', 'ProtoGenesis',
  'Aurora', 'Hermes', 'Servicio StarSeed', 'Motor StarSeed'
];

function normalizarParaDistancia(texto: string): string {
  return texto.toLowerCase().replace(/\s+/g, '');
}

function distanciaEdicionNormalizada(str1: string, str2: string): number {
  const s1 = normalizarParaDistancia(str1);
  const s2 = normalizarParaDistancia(str2);
  
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length / Math.max(1, s2.length);
  if (s2.length === 0) return s1.length / Math.max(1, s1.length);
  
  const matriz = Array(s1.length + 1).fill(null).map(() => Array(s2.length + 1).fill(0));
  
  for (let i = 0; i <= s1.length; i++) matriz[i][0] = i;
  for (let j = 0; j <= s2.length; j++) matriz[0][j] = j;
  
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const costo = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matriz[i][j] = Math.min(
        matriz[i - 1][j] + 1,
        matriz[i][j - 1] + 1,
        matriz[i - 1][j - 1] + costo
      );
    }
  }
  
  return matriz[s1.length][s2.length] / Math.max(s1.length, s2.length);
}

function esPalabraComun(palabra: string, idioma: IdiomaComun): boolean {
  const normalizada = palabra.toLowerCase();
  return PALABRAS_COMUNES[idioma].includes(normalizada);
}

export function glosarioBase(): string[] {
  return [...DEFAULT_GLOSAARIO];
}

export function corregirConGlosario(
  texto: string,
  glosario: string[],
  idioma: IdiomaComun = 'es'
): { texto: string; cambios: CorreccionGlosario[] } {
  const palabras = texto.split(/\s+/);
  const cambios: CorreccionGlosario[] = [];
  
  for (let i = 0; i < palabras.length; i++) {
    const palabraOriginal = palabras[i];
    const sinSignos = palabraOriginal.replace(/[.,!?;:]*,\s*$/g, '');
    
    const esExactoEnGlosario = glosario.includes(sinSignos);
    if (esExactoEnGlosario) continue;
    
    for (const glosarioItem of glosario) {
      const distancia = distanciaEdicionNormalizada(sinSignos, glosarioItem);
      
      if (distancia <= 0.34 && !esPalabraComun(sinSignos, idioma)) {
        cambios.push({ original: sinSignos, corregido: glosarioItem });
        const mantengoMayuscula = palabraOriginal.charAt(0) === palabraOriginal.charAt(0).toUpperCase();
        palabras[i] = mantengoMayuscula ? 
          glosarioItem.charAt(0).toUpperCase() + glosarioItem.slice(1) : 
          glosarioItem;
        break;
      }
    }
  }
  
  return {
    texto: palabras.join(' '),
    cambios
  };
}

export function extraerPrimerasPalabras(texto: string, cantidad: number): string[] {
  const palabras = texto.split(/\s+/).filter(palabra => palabra.length > 0);
  return palabras.slice(0, cantidad);
}

export function detectarIdiomaTexto(texto: string): IdiomaComun {
  const palabras = texto.toLowerCase().split(/\s+/).filter(palabra => palabra.length > 0);
  
  const conteo = { es: 0, en: 0 };
  const vocalesEsp = /[áéíóú]/gi;
  const vocalesIng = /[aeiou]/gi;
  
  for (const palabra of palabras) {
    if (palabra.match(vocalesEsp)) conteo.es++;
    if (palabra.match(vocalesIng)) conteo.en++;
  }
  
  return conteo.es >= conteo.en ? 'es' : 'en';
}
