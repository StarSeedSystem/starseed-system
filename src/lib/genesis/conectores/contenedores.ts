export interface ContenedorOpcion {
  id: string;
  nombre: string;
  enlaceAlta: string | null;
  guia: string | null;
  requiereCuenta: boolean;
  requierePago: boolean;
  aptoPrivado: boolean;
  verificado: boolean | null;
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
    id: 'google-cloud',
    nombre: 'Google Cloud Run',
    enlaceAlta: 'https://cloud.google.com/run',
    guia: null, // TODO: ruta de guía en el repo
    requiereCuenta: true,
    requierePago: false,
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