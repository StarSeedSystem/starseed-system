export interface ContenedorOpcion {
  id: string;
  nombre: string;
  enlaceAlta: string | null;
  guia: string | null;
  requiereCuenta: boolean;
  requierePago: boolean;
  aptoPrivado: boolean;
  verificado: boolean | null;
  /** Requisitos del medio que deben mostrarse antes de vincularlo. */
  requisitos?: string[];
  /** Cupo explícito del servicio; no equivale a un coste de dinero. */
  cupo?: string;
}

// Datos verificados de contenedores en la nube y locales
export const CONTENEDORES_OPCIONES: ContenedorOpcion[] = [
  {
    id: 'servidor-propio',
    nombre: 'Servidor propio',
    enlaceAlta: null,
    guia: null,
    requiereCuenta: false,
    requierePago: false,
    aptoPrivado: true,
    verificado: true,
  },
  {
    id: 'neurona-contenedor',
    nombre: 'Neurona como contenedor',
    enlaceAlta: null,
    guia: null,
    requiereCuenta: false,
    requierePago: false,
    aptoPrivado: true,
    verificado: true,
  },
  {
    id: 'oracle-a1',
    nombre: 'Oracle Always Free',
    enlaceAlta: 'https://www.oracle.com/cloud/free/',
    guia: null, // TODO: ruta de guía en el repo
    requiereCuenta: true,
    requierePago: false,
    aptoPrivado: false,
    verificado: true,
  },
  {
    id: 'github-actions',
    nombre: 'GitHub Actions',
    enlaceAlta: 'https://github.com/features/actions',
    guia: null, // TODO: ruta de guía en el repo
    requiereCuenta: true,
    requierePago: false,
    aptoPrivado: false,
    verificado: true,
  },
  {
    id: 'cloudroom',
    nombre: 'Cloudroom',
    enlaceAlta: 'https://cloudroom.dev',
    guia: null,
    requiereCuenta: true,
    requierePago: false,
    aptoPrivado: false,
    verificado: true,
    cupo: '100 agentes en la nube cada 30 días por cuenta; agentes locales sin cupo.',
    requisitos: ['App de escritorio en macOS 13+ con Apple Silicon o Linux x64', 'Cuenta de Cloudroom', 'GitHub conectado', 'Agente de código conectado'],
  },
  {
    id: 'google-cloud',
    nombre: 'Google Cloud Run',
    enlaceAlta: 'https://cloud.google.com/run',
    guia: null, // TODO: ruta de guía en el repo
    requiereCuenta: true,
    // Cloud Run solo corre en un proyecto con facturación (método de pago), también dentro de su capa
    // gratuita. La de la fundación está desactivada desde el 2026-09-25 y volver a activarla es decisión
    // de Alex (architecture/repos-libreria-1020d.md, estado del 2026-10-20; genesis-conectores-abiertos.md).
    // El «Google Cloud Run activo» de CLAUDE.md §2 es del estado de mayo de 2026 y quedó superado.
    requierePago: true,
    aptoPrivado: false,
    verificado: true,
  },
  {
    id: 'huggingface-spaces',
    nombre: 'Hugging Face Spaces',
    enlaceAlta: 'https://huggingface.co/spaces',
    guia: null, // TODO: ruta de guía en el repo
    requiereCuenta: true,
    requierePago: true,
    aptoPrivado: false,
    verificado: true,
  },
  // cloudflare/computer (MIT, alfa 0.7.0): un ordenador virtual por agente (sistema de archivos en un
  // Durable Object + shell/JavaScript aislados y contenedor Linux). De pago porque los Dynamic Workers
  // piden el plan Workers Paid (desde 5 USD/mes): choca con «gratis primero», así que solo entra como
  // opción de pago. Alternativa a vigilar sin plan de pago: denoland/celld (ya en la Librería).
  {
    id: 'cloudflare-computer',
    nombre: 'Cloudflare Computer',
    enlaceAlta: 'https://dash.cloudflare.com/sign-up',
    guia: null, // TODO: ruta de guía en el repo
    requiereCuenta: true,
    requierePago: true,
    aptoPrivado: false,
    // A propósito: el repo y su precio constan en la ficha de la Librería (architecture/repos-libreria-1025.md
    // §8), pero el enlace de alta no se comprobó en la ola.
    verificado: null,
    cupo: 'Sin cupo gratuito comprobado: los Dynamic Workers (shell y JavaScript aislados) piden el plan Workers Paid.',
    requisitos: [
      'Cuenta de Cloudflare propia (el OS no abre cuentas)',
      'Plan Workers Paid (desde 5 USD al mes) para los Dynamic Workers y los contenedores',
      'Token de wrangler solo en variables de entorno',
      'Alfa: ContainerBackend, WorkerShellBackend y computerd no son aptos para producción',
    ],
  },
];

/**
 * Devuelve las opciones de contenedores disponibles según el ámbito y si se requieren contenedores privados.
 * @param ambito - El ámbito de uso (personal, grupo, página, etc.)
 * @param opciones - Opciones de filtrado, actualmente solo { privado: boolean }
 * @returns Arreglo de opciones de contenedores que cumplen con los criterios
 */
export function contenedoresPara(
  ambito: string,
  { privado }: { privado?: boolean }
): ContenedorOpcion[] {
  let filtrados = CONTENEDORES_OPCIONES;

  // Si se requieren contenedores privados, filtrar por aptoPrivado
  if (privado === true) {
    filtrados = filtrados.filter((c) => c.aptoPrivado);
  }

  // Ordenar por preferencia: locales primero, luego gratuitos, luego de pago
  // Dentro de cada grupo, mantener el orden definido en CONTENEDORES_OPCIONES
  filtrados.sort((a, b) => {
    // Primero, locales (aptoPrivado: true) vs no locales
    if (a.aptoPrivado && !b.aptoPrivado) return -1;
    if (!a.aptoPrivado && b.aptoPrivado) return 1;

    // Segundo, gratuitos (requierePago: false) vs de pago
    if (a.requierePago === false && b.requierePago === true) return -1;
    if (a.requierePago === true && b.requierePago === false) return 1;

    // Tercero, mantener el orden original
    return CONTENEDORES_OPCIONES.indexOf(a) - CONTENEDORES_OPCIONES.indexOf(b);
  });

  return filtrados;
}
