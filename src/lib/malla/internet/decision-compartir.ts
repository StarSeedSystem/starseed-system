import { PuertaInternet, puedeUsar, restanteParaOtrosMb, Compartir, Solicitante } from '../cristal/puertas-internet';
import { Audiencia, AjustesInternet } from './tipos';
import { Contadores, usadoHoyMb } from './contadores';
import { cupoBanco } from './cupo-banco';

export interface EntradaDecidirCompartir {
  audiencia: Audiencia;
  ajustes: AjustesInternet;
  contadores: Contadores;
  puerta: PuertaInternet;
  ahora: number;
  desfaseMin: number;
}

export interface ResultadoDecidirCompartir {
  permitido: boolean;
  hastaMb: number | null;
  motivo: string;
}

function minimoNoNull(...valores: (number | null)[]): number | null {
  const numericos = valores.filter((v): v is number => v !== null);
  if (numericos.length === 0) return null;
  return Math.min(...numericos);
}

const solicitanteOtros: Solicitante = {
  cuenta: 'otra-cuenta',
  vinculado: false,
  grupos: [],
};

function cupoParaOtros(
  ajustes: AjustesInternet,
  contadores: Contadores,
  ahora: number,
  desfaseMin: number
): { aplica: boolean; permite: boolean; restanteMb: number | null; motivo: string } {
  if (!ajustes.banco.activo) {
    return { aplica: false, permite: true, restanteMb: null, motivo: 'banco inactivo' };
  }

  const usadosHoy = usadoHoyMb(contadores, 'otros', ahora, desfaseMin);
  const cupo = cupoBanco(ajustes.banco, usadosHoy, new Date(ahora), desfaseMin);

  return {
    aplica: true,
    permite: cupo.permitido,
    restanteMb: cupo.restanteMb > 0 ? cupo.restanteMb : (cupo.permitido ? cupo.restanteMb : 0),
    motivo: cupo.motivo,
  };
}

export function decidirCompartir(entrada: EntradaDecidirCompartir): ResultadoDecidirCompartir {
  const { audiencia, ajustes, contadores, puerta, ahora, desfaseMin } = entrada;

  const porAudiencia = ajustes.porAudiencia[audiencia];
  const esMiCuenta = audiencia === 'mi-cuenta';

  // Regla 1: mi-cuenta
  if (esMiCuenta) {
    if (!porAudiencia.mesh) {
      return {
        permitido: false,
        hastaMb: null,
        motivo: 'Compartir malla desactivado para audiencia mi-cuenta',
      };
    }

    const limiteAudiencia = porAudiencia.limiteMeshMb;
    const restantePuerta = restanteParaOtrosMb(puerta);

    const limites: (number | null)[] = [limiteAudiencia];
    if (restantePuerta !== null) {
      limites.push(restantePuerta);
    }

    const hastaMb = minimoNoNull(...limites);

    return {
      permitido: true,
      hastaMb,
      motivo: hastaMb !== null ? `límite: ${hastaMb} MB` : 'sin límite',
    };
  }

  // Regla 2: entidad y público - compartirConOtros apagado
  if (!ajustes.compartirConOtros) {
    return {
      permitido: false,
      hastaMb: null,
      motivo: 'el dueño no ha encendido compartir con otros',
    };
  }

  // Regla 3: mesh apagado para la audiencia
  if (!porAudiencia.mesh) {
    return {
      permitido: false,
      hastaMb: null,
      motivo: `Compartir malla desactivado para audiencia ${audiencia}`,
    };
  }

  // Regla 4: la puerta manda
  const puedeUsarResultado = puedeUsar(puerta, solicitanteOtros);
  const restantePuerta = restanteParaOtrosMb(puerta);

  if (!puedeUsarResultado.ok) {
    let hastaMb: number | null = null;
    if (puedeUsarResultado.motivo === 'No queda datos disponibles para compartir') {
      hastaMb = 0;
    } else if (puedeUsarResultado.motivo === 'Puerta no medida o sin tope definido') {
      hastaMb = null;
    }

    return {
      permitido: false,
      hastaMb,
      motivo: `puerta: ${puedeUsarResultado.motivo}`,
    };
  }

  // Regla 5: modo banco
  const banco = cupoParaOtros(ajustes, contadores, ahora, desfaseMin);

  // Regla 6: hastaMb = mínimo de los límites que apliquen
  const limites: (number | null)[] = [porAudiencia.limiteMeshMb];
  if (restantePuerta !== null) limites.push(restantePuerta);
  if (banco.aplica) limites.push(banco.restanteMb);

  const hastaMb = minimoNoNull(...limites);

  if (banco.aplica && !banco.permite) {
    return {
      permitido: false,
      hastaMb: 0,
      motivo: `banco: ${banco.motivo}`,
    };
  }

  if (hastaMb !== null && hastaMb <= 0) {
    return {
      permitido: false,
      hastaMb: 0,
      motivo: 'sin datos disponibles tras aplicar límites',
    };
  }

  const partesMotivo: string[] = [];
  if (porAudiencia.limiteMeshMb !== null) partesMotivo.push(`audiencia ${porAudiencia.limiteMeshMb} MB`);
  if (restantePuerta !== null) partesMotivo.push(`puerta ${restantePuerta} MB`);
  if (banco.aplica && banco.restanteMb !== null) partesMotivo.push(`banco ${banco.restanteMb} MB`);

  const motivo = partesMotivo.length > 0
    ? `mínimo: ${partesMotivo.join(', ')}`
    : 'sin límite';

  return {
    permitido: true,
    hastaMb,
    motivo,
  };
}