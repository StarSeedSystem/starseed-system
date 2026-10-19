// Tipo para representar una opción de contenedor
export interface ContenedorOpcion {
  id: string;
  nombre: string;
  enlaceAlta: string;
  guia: string;
  requiereCuenta: boolean;
  requierePago: boolean;
  aptoPrivado: boolean;
  verificado: boolean | null;
}

// Opciones de contenedores disponibles
export const CONTENEDORES_DISPONIBLES: ContenedorOpcion[] = [
  {
    id: "nube-gh",
    nombre: "GitHub Actions",
    enlaceAlta: "https://github.com/features/actions",
    guia: ".github/workflows/enjambre-nube.yml",
    requiereCuenta: true,
    requierePago: false,
    aptoPrivado: false,
    verificado: true,
  },
  {
    id: "oracle",
    nombre: "Oracle Always Free",
    enlaceAlta: "https://www.oracle.com/cloud/free/",
    guia: "architecture/oracle-nube.md",
    requiereCuenta: true,
    requierePago: false,
    aptoPrivado: false,
    verificado: true,
  },
  {
    id: "hf",
    nombre: "Hugging Face Spaces",
    enlaceAlta: "https://huggingface.co/spaces",
    guia: "architecture/colmena-relevo-contenedores.md",
    requiereCuenta: true,
    requierePago: true,
    aptoPrivado: false,
    verificado: true,
  },
  {
    id: "gcloud",
    nombre: "Google Cloud Run",
    enlaceAlta: "https://cloud.google.com/run",
    guia: "architecture/colmena-relevo-contenedores.md",
    requiereCuenta: true,
    requierePago: false,
    aptoPrivado: false,
    verificado: true,
  },
  {
    id: "servidor-propio",
    nombre: "Servidor propio",
    enlaceAlta: "https://docs.starseed-os.vercel.app/servidor-propio",
    guia: "architecture/colmena-relevo-contenedores.md",
    requiereCuenta: false,
    requierePago: false,
    aptoPrivado: true,
    verificado: null,
  },
  {
    id: "neurona-contenedor",
    nombre: "Neurona como contenedor",
    enlaceAlta: "https://docs.starseed-os.vercel.app/neurona-contenedor",
    guia: "architecture/colmena-relevo-contenedores.md",
    requiereCuenta: false,
    requierePago: false,
    aptoPrivado: true,
    verificado: null,
  },
];

/**
 * Obtiene los contenedores disponibles según el ámbito y si se requieren privados
 * @param ambito El ámbito de la cuenta (opcional)
 * @param opciones Opciones de filtrado
 * @returns Arreglo de opciones de contenedores que coinciden con los criterios
 */
export function contenedoresPara(
  ambito: string | undefined,
  { privado }: { privado?: boolean }
): ContenedorOpcion[] {
  let resultado = CONTENEDORES_DISPONIBLES;

  // Filtrar por privado: si se requiere privado, solo devolver los que son aptoPrivado
  if (privado === true) {
    resultado = resultado.filter((c) => c.aptoPrivado === true);
  }

  // TODO: filtrar por ambito si se proporciona información sobre cómo el ambito afecta a los contenedores
  // Por ahora, ignoramos el ambito ya que no tenemos datos al respecto

  return resultado;
}