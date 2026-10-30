import { parseSha256Sums, verificarActivo, nombreActivoWeb, esActivoPermitido } from './huellas';

declare const Deno: {
  readFile(path: string): Promise<Uint8Array>;
};

export interface ContextoVerifica {
  zipPath: string;
  shaSumas: string;
}

/**
 * Comprueba que el activo ZIP existe en la suma de SHA256 y es confiable.
 */
export async function comprobarActivoZip({ zipPath, shaSumas }: ContextoVerifica): Promise<boolean> {
  const sumas = parseSha256Sums(shaSumas);
  const nombre = nombreActivoWeb(zipPath.split('-')[0] as any, zipPath.split('-')[1] ?? '');
  const result = await verificarActivo(nombre, new Uint8Array(await Deno.readFile(zipPath)), sumas);
  return result.ok;
}
