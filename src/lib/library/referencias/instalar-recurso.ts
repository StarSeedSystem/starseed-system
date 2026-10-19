import { ReferenciaEntrada } from './types';

export interface PlanInstalacion {
  permitido: boolean;
  pasos: string[];
  avisos: string[];
  atribucion?: string;
}

type RecursoInfo = {
  pasos: string[];
  baseCondition: string;
  atribucion?: string;
};

const RECURSOS_MAP: Record<string, RecursoInfo> = {
  'motion-primitives': {
    pasos: ['Utilizar los componentes de Motion Primitives ya adaptados a framer-motion en el OS.'],
    baseCondition: 'aviso MIT',
  },
  'transitions-dev': {
    pasos: ['Ejecutar el comando: npx transitions-dev add --free'],
    baseCondition: 'conservar el comentario «transitions.dev»',
  },
  'lottiefiles': {
    pasos: [
      'Instalar el reproductor: npm install @lottiefiles/dotlottie-react',
      'Configurar el MCP de LottieFiles si se requiere acceso a la biblioteca.',
    ],
    baseCondition: 'Lottie Simple License; en uso comercial, confirmar el plan',
    atribucion: undefined,
  },
  'fontshare': {
    pasos: [
      'Utilizar la CSS alojada de Fontshare mediante su API: https://api.fontshare.com/v2/css?f[]=satoshi@400&display=swap',
      'No empaquetar los archivos de fuente.',
    ],
    baseCondition: 'ITF FFL: nunca empaquetar los archivos',
    atribucion: undefined,
  },
  'icons8': {
    pasos: [
      'Utilizar el MCP de Icons8 para obtener iconos en formato PNG o usar el renderer PNG.',
      'Para SVG completo, requerir suscripción de pago.',
    ],
    baseCondition: 'enlace a Icons8 en el pie o «Acerca de»',
    atribucion: 'Enlace a Icons8 en el pie de la página o en la sección «Acerca de» de la aplicación.',
  },
  'flaticon': {
    pasos: [
      'Utilizar la API oficial de Flaticon para obtener iconos.',
      'No incluir los iconos en un pack que se redistribuya.',
    ],
    baseCondition: 'atribución; nunca en un pack de iconos; nunca para entrenar IA',
    atribucion: 'Atribución a Flaticon y al autor del icono.',
  },
  'higgsfield': {
    pasos: [
      'Utilizar el MCP oficial de Higgsfield o su CLI con la cuenta de la persona.',
      'Asegurarse de que la cuenta tenga créditos de pago.',
    ],
    baseCondition: 'créditos de pago suyos; revelar contenido sintético cuando toque',
    atribucion: undefined,
  },
  'slopmonster': {
    pasos: [
      'Instalar la skill de SlopMonster para revisión de textos en inglés.',
    ],
    baseCondition: 'aviso MIT',
    atribucion: undefined,
  },
};

export function planInstalacion(
  entrada: ReferenciaEntrada,
  recurso: string,
  contexto: 'personal' | 'grupo' | 'comunidad' | 'publico' | 'comercial'
): PlanInstalacion {
  // Check if the resource is installable based on class of use
  if (entrada.clase_uso !== 'reutilizable' && entrada.clase_uso !== 'reutilizable-con-condiciones') {
    return {
      permitido: false,
      pasos: [],
      avisos: ['No es instalable: solo referencia o solo enlace'],
    };
  }

  // Check if we have information for this resource
  const recursoInfo = RECURSOS_MAP[recurso];
  if (!recursoInfo) {
    return {
      permitido: false,
      pasos: [],
      avisos: [`Recurso no reconocido para instalación: ${recurso}`],
    };
  }

  // Build avisos from condiciones split by period
  const condicionesAvisos = entrada.condiciones
    .split('.')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // Start with base condition as an aviso
  let avisos: string[] = [recursoInfo.baseCondition];
  // Add additional avisos from condiciones, avoiding duplicates of base condition
  condicionesAvisos.forEach(aviso => {
    // Simple check: if the aviso is not already contained in the base condition (case insensitive) and not empty
    if (aviso.toLowerCase() !== recursoInfo.baseCondition.toLowerCase() &&
        !recursoInfo.baseCondition.toLowerCase().includes(aviso.toLowerCase())) {
      avisos.push(aviso);
    }
  });

  // Remove duplicates while preserving order
  avisos = Array.from(new Set(avisos));

  return {
    permitido: true,
    pasos: recursoInfo.pasos,
    avisos,
    atribucion: recursoInfo.atribucion,
  };
}