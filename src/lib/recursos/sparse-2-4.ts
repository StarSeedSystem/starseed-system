import { join } from 'node:path';

export type PlanPaso = {
  orden: number;
  descripcion: string;
  comando?: string;
  verificacion?: string;
};

export type PlanSparseBundle2_4Result = {
  pasos: PlanPaso[];
  rutaSparseBundle: string;
};

/**
 * Planifica la conversión de un modelo al formato disperso 2:4
 * @param params - Parámetros: carpetaDrive (ruta base en Google Drive), nombre (nombre del modelo), tamanoGB (tamaño del modelo en GB)
 * @returns Plan con pasos para convertir modelo al formato disperso 2:4
 */
export function planSparseBundle2_4(params: {
  carpetaDrive: string;
  nombre: string;
  tamanoGB: number;
}): PlanSparseBundle2_4Result {
  const sparseBundlePath = join(params.carpetaDrive, `${params.nombre}.sparsebundle`);
  
  const pasoVerificar: PlanPaso = {
    orden: 1,
    descripcion: 'Verificar que el modelo tiene un formato de 2:4',
    comando: `if [[ "${params.nombre}" == *.pt || "${params.nombre}" == *.bin ]]; then echo "Modelo encontrado"; else echo "Error: El modelo debe ser .pt o .bin"; exit 1; fi`,
    verificacion: 'El modelo debe ser un archivo .pt o .bin',
  };
  
  const pasoConvertir: PlanPaso = {
    orden: 2,
    descripcion: `Convertir modelo al formato disperso 2:4 con tamaño ${params.tamanoGB}GB`,
    comando: `python3 scripts/sparse/convert-2-4.py --input "${params.nombre}" --output "${sparseBundlePath}" --size ${params.tamanoGB}g`,
    verificacion: 'El modelo convertido debe estar disponible en la ruta especificada',
  };
  
  return {
    pasos: [pasoVerificar, pasoConvertir],
    rutaSparseBundle: sparseBundlePath,
  };
}
