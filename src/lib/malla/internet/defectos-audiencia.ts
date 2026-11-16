import { AjustesInternet, AjustesAudiencia, Audiencia } from './tipos';

export function ajustesPorDefecto(): AjustesInternet {
  return {
    version: 1,
    compartirConOtros: false,
    banco: {
      activo: false,
      modo: 'diario',
      diarioMb: 1024,
      ventanas: [],
    },
    porAudiencia: {
      'mi-cuenta': { mesh: true, limiteMeshMb: null },
      entidad: { mesh: false, limiteMeshMb: null },
      publico: { mesh: false, limiteMeshMb: null },
    },
    declaraLimitada: null,
    compartirMedidas: false,
  };
}

export function audienciaDe(
  par: { cuentaId: string | null; entidades: string[] },
  yo: { cuentaId: string | null; entidades: string[] }
): Audiencia {
  if (par.cuentaId != null && par.cuentaId === yo.cuentaId) {
    return 'mi-cuenta';
  }
  const entidadesCompartidas = par.entidades.filter((e) => yo.entidades.includes(e));
  if (entidadesCompartidas.length > 0) {
    return 'entidad';
  }
  return 'publico';
}

export { Audiencia };