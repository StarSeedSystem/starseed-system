/**
 * PRINCIPIOS DE USABILIDAD Y REGlas DE REDACCIÓN CLARA
 */

export interface PrincipioUsabilidad {
  id: string;
  titulo: string;
  descripcion: string;
  referencia: string;
}

export interface ReglaRedaccion {
  id: string;
  titulo: string;
  descripcion: string;
  referencia: string;
}

export interface AvisoTexto {
  tipo: 'longitud' | 'pasiva' | 'jerga';
  mensaje: string;
  indice: number;
}

/**
 * 8 principios de usabilidad (Don't Make Me Think)
 */
export const PRINCIPIOS_USABILIDAD: PrincipioUsabilidad[] = [
  {id:'usabilidad-1',t:'Interfaz autoexplicativa',d:'Elementos comunican función sin instrucciones',r:'dont-make-me-think'},
  {id:'usabilidad-2',t:'Seguir convenciones',d:'Patrones familiares reducen curva aprendizaje',r:'dont-make-me-think'},
  {id:'usabilidad-3',t:'Diseñar para escaneo',d:'Usuarios escanean; jerarquías visuales claras facilitan',r:'dont-make-me-think'},
  {id:'usabilidad-4',t:'Minimizar ruido cognitivo',d:'Eliminar elementos innecesarios que distraen o confunden',r:'dont-make-me-think'},
  {id:'usabilidad-5',t:'Indicadores de ubicación',d:'Navegación indica dónde está el usuario en el sistema',r:'dont-make-me-think'},
  {id:'usabilidad-6',t:'Hacer lo obvio realmente obvio',d:'Acciones inmediatamente perceptibles sin búsqueda',r:'dont-make-me-think'},
  {id:'usabilidad-7',t:'Reducir decisiones necesarias',d:'Simplificar elecciones para disminuir carga mental',r:'dont-make-me-think'},
  {id:'usabilidad-8',t:'Retroalimentación inmediata',d:'Respuesta rápida confirma funcionamiento correcto',r:'dont-make-me-think'}
].map(({id,t,d,r})=>({id,titulo:t,descripcion:d,referencia:r}));

/**
 * 8 reglas de redacción clara (ASD-STE100)
 */
export const REGlas_REDACCION: ReglaRedaccion[] = [
  {id:'redaccion-1',t:'Frases cortas y directas',d:'Una idea principal por frase mejora comprensión',r:'asd-ste100'},
  {id:'redaccion-2',t:'Voz activa preferente',d:'Sujeto-verbo-objeto para texto claro y directo',r:'asd-ste100'},
  {id:'redaccion-3',t:'Una instrucción por frase',d:'Una acción o información específica por frase para evitar sobrecarga',r:'asd-ste100'},
  {id:'redaccion-4',t:'Vocabulario simple y consistente',d:'Palabras comunes y términos técnicos definidos uniformemente',r:'asd-ste100'},
  {id:'redaccion-5',t:'Evitar construcciones pasivas',d:'Voz activa más directa que pasiva en textos técnicos',r:'asd-ste100'},
  {id:'redaccion-6',t:'Longitud máxima de frase',d:'Máximo 20 palabras por frase facilita lectura y comprensión',r:'asd-ste100'},
  {id:'redaccion-7',t:'Jerga técnica mínima y explicada',d:'Reducir mínimamente términos especializados con definiciones necesarias',r:'asd-ste100'},
  {id:'redaccion-8',t:'Puntuación estándar y correcta',d:'Signos de puntuación correctos evitan confusiones en lectura',r:'asd-ste100'}
].map(({id,t,d,r})=>({id,titulo:t,descripcion:d,referencia:r}));

/**
 * Analiza un texto y devuelve avisos medibles
 */
export function revisarTexto(texto: string): AvisoTexto[] {
  const avisos: AvisoTexto[] = [];
  const frases = texto.match(/[^.!?]+[.!?]/g) || [texto];
  
  frases.forEach((frase, i) => {
    const t = frase.trim();
    if (!t) return;
    
    let pos = 0;
    for (let j = 0; j < i; j++) pos += frases[j].length;
    
    // Frases largas (>20 palabras)
    if (t.split(/\s+/).length > 20) {
      avisos.push({tipo:'longitud',m:`Frase larga (${t.split(/\s+/).length} palabras). Máx: 20`,i:pos});
    }
    
    // Voz pasiva (ser + participio)
    if (/\b(es|era|eres|fue|fueron|ser|sido|siendo|está|estaban|estaba)\s+[a-z]*(ado|ido|to|cho|ta|da|te|ste|tto|ssto)\b/i.test(t)) {
      avisos.push({tipo:'pasiva',m:'Voz pasiva detectada. Prefiere activa.',i:pos});
    }
    
    // Jerga técnica
    const jerga = ['utilizar','facilitar','implementar','optimizar','synergy','leverage','stack','deploy','disrupt','innovative','solution','paradigm'];
    if (jerga.some(g => t.toLowerCase().includes(g))) {
      avisos.push({tipo:'jerga',m:'Jerga técnica detectada. Use términos simples.',i:pos});
    }
  });
  
  return avisos;
}