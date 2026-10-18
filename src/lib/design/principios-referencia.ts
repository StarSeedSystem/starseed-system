export const PRINCIPIOS_USABILIDAD = [
  {
    id: 'usabilidad-1',
    descripcion: 'La obvia no se piensa: las interfaces deben ser autoexplicativas, sin requerir pensamiento consciente para usarlas.',
    referencia: 'dont-make-me-think'
  },
  {
    id: 'usabilidad-2',
    descripcion: 'Sigue las convenciones: utiliza patrones familiares que los usuarios ya conocen de otros sitios o aplicaciones.',
    referencia: 'dont-make-me-think'
  },
  {
    id: 'usabilidad-3',
    descripcion: 'Diseña para escanear: las páginas deben permitir un escaneo rápido, con jerarquía visual clara y destacando lo importante.',
    referencia: 'dont-make-me-think'
  },
  {
    id: 'usabilidad-4',
    descripcion: 'Minimiza las palabras: elimina texto innecesario; cada palabra debe tener un propósito claro.',
    referencia: 'dont-make-me-think'
  },
  {
    id: 'usabilidad-5',
    descripcion: 'Navegación que orienta: muestra siempre dónde está el usuario, cómo llegó ahí y adónde puede ir.',
    referencia: 'dont-make-me-think'
  },
  {
    id: 'usabilidad-6',
    descripcion: 'Clics sin dudas: los elementos interactivos deben indicar claramente su función y qué ocurre al interactuar.',
    referencia: 'dont-make-me-think'
  },
  {
    id: 'usabilidad-7',
    descripcion: 'Evita ambigüedades: formularios, mensajes y opciones deben ser inequívocos y sin posibilidad de malinterpretación.',
    referencia: 'dont-make-me-think'
  },
  {
    id: 'usabilidad-8',
    descripcion: 'Recuperación de errores: cuando ocurren errores, proporciona mensajes claros que expliquen el problema y cómo solucionarlo.',
    referencia: 'dont-make-me-think'
  }
];

export const REGLAS_REDACT_CLARA = [
  {
    id: 'redacta-1',
    descripcion: 'Frases cortas: limita las oraciones a una idea principal y máximo 20 palabras.',
    referencia: 'asd-ste100'
  },
  {
    id: 'redacta-2',
    descripcion: 'Voz activa: utiliza construcciones en voz activa donde el sujeto realiza la acción.',
    referencia: 'asd-ste100'
  },
  {
    id: 'redacta-3',
    descripcion: 'Una instrucción por frase: cada oración debe contener solo una directiva o información.',
    referencia: 'asd-ste100'
  },
  {
    id: 'redacta-4',
    descripcion: 'Vocabulario simple y constante: emplea palabras comunes y evita sinónimos innecesarios para el mismo concepto.',
    referencia: 'asd-ste100'
  },
  {
    id: 'redacta-5',
    descripcion: 'Evita jerga técnica: reemplaza términos especializados por lenguaje cotidiano cuando sea posible.',
    referencia: 'asd-ste100'
  },
  {
    id: 'redacta-6',
    descripcion: 'Construcciones negativas mínimas: reduce el uso de negaciones que dificulten la comprensión.',
    referencia: 'asd-ste100'
  },
  {
    id: 'redacta-7',
    descripcion: 'Puntuación adecuada: utiliza comas y puntos para separar claramente las ideas sin sobrecargar.',
    referencia: 'asd-ste100'
  },
  {
    id: 'redacta-8',
    descripcion: 'Lectura en voz alta: las frases deben sonar naturales y fáciles de pronunciar en voz alta.',
    referencia: 'asd-ste100'
  }
];

export function revisarTexto(texto: string) {
  // Contar frases largas (>20 palabras)
  const frases = texto.trim().split(/[.!?]+/).filter(f => f.trim().length > 0);
  const frasesLargas = frases.filter(f => {
    const palabras = f.trim().split(/\s+/).length;
    return palabras >= 20;
  }).length;

   // Detectar pasiva frecuente: patrones simples de pasiva en español
   const pasivaMatches = texto.match(/se\s+[a-záéíóúñ]+/gi) || [];
   const pasivaSerEstar = texto.match(/\b(?:es|está|están|era|eras|eres|fue|fueron|sido)\s+[a-záéíóúñ]+/gi);
   const pasivaFrecuente = (pasivaMatches?.length || 0) + (pasivaSerEstar?.length || 0);

  // Detectar jerga (lista básica)
  const jergaLista = [
    'sinergia', 'leveraging', 'disruptivo', 'blockchain', 'big data', 'ai', 'machine learning',
    'deep learning', 'nft', 'metaverso', 'crypto', 'token', 'smart contract', 'web3', 'scalable',
    'solución integral', 'pensamiento fuera de la caja', 'rocket science', 'game changer'
  ];
  const jergaEncontrada: string[] = [];
  jergaLista.forEach(j => {
    const regex = new RegExp(`\\b${j}\\b`, 'gi');
    if (texto.match(regex)) {
      jergaEncontrada.push(j);
    }
  });

  return {
    frasesLargas,
    pasivaFrecuente,
    jerga: jergaEncontrada
  };
}