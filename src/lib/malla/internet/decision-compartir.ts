import { PuertaInternet, puedeUsar, restanteParaOtrosMb, Compartir, Solicitante } from '../cristal/puertas-internet';
import { Audiencia, AjustesInternet, Contadores } from './tipos';
import { cupoBanco } from './cupo-banco';
import { usadoHoyMb } from './contadores';

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

function evaluarBanco(
  ajustes: AjustesInternet,
  contadores: Contadores,
  ahora: number,
  desfaseMin: number
): { aplica: boolean; permitido: boolean; restanteMb: number | null; motivo: string } {
  if (!ajustes.banco.activo) {
    return { aplica: false, permitido: true, restanteMb: null, motivo: 'banco inactivo' };
  }

  const usadosHoyOtros = usadoHoyMb(contadores, 'otros', ahora, desfaseMin);
  const resultadoCupo = cupoBanco(ajustes.banco, usadosHoyOtros, new Date(ahora), desfaseMin);

  const restanteMb = resultadoCupo.permitido ? resultadoCupo.restanteMb : 0;
  return {
    aplica: true,
    permitido: resultadoCupo.permitido,
    restanteMb: Number.isFinite(restanteMb) ? restanteMb : null,
    motivo: resultadoCupo.motivo,
  };
}

const solicitanteOtros: Solicitante = {
  cuenta: 'otra-cuenta',
  vinculado: false,
  grupos: [],
};

export function decidirCompartir(entrada: EntradaDecidirCompartir): ResultadoDecidirCompartir {
  const { audiencia, ajustes, contadores, puerta, ahora, desfaseMin } = entrada;

  const porAudiencia = ajustes.porAudiencia[audiencia];
  const esMiCuenta = audiencia === 'mi-cuenta';

  // Regla 1: mi-cuenta
  if (esMiCuenta) {
    const limiteAudiencia = porAudiencia.limiteMeshMb;

    if (!porAudiencia.mesh) {
      return {
        permitido: false,
        hastaMb: null,
        motivo: `Compartir malla desactivado para audiencia mi-cuenta`,
      };
    }

    const banco = evaluarBanco(ajustes, contadores, ahora, desfaseMin);
    const limites: (number | null)[] = [limiteAudiencia];
    if (banco.aplica) limites.push(banco.restanteMb);

    const hastaMb = minimoNoNull(...limites);

    if (banco.aplica && !banco.permitido) {
      return {
        permitido: false,
        hastaMb: 0,
        motivo: `banco: ${banco.motivo}`,
      };
    }

    return {
      permitido: true,
      hastaMb,
      motivo: `mi-cuenta: ${banco.aplica ? `banco (${banco.motivo})` : 'sin límite de banco'}${limiteAudiencia !== null ? `, límite audiencia ${limiteAudiencia} MB` : ''}`,
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

  // Regla 4: la puerta manda - usar puedeUsar para permiso, restanteParaOtrosMb para límite
  const puedeUsarResultado = puedeUsar(puerta, solicitanteOtros);
  const restantePuerta = restanteParaOtrosMb(puerta);

  if (!puedeUsarResultado.ok) {
    // Determinar hastaMb según la causa
    let hastaMb: number | null = null;
    if (puedeUsarResultado.motivo === 'No queda datos disponibles para compartir') {
      hastaMb = 0;
    } else if (puedeUsarResultado.motivo === 'Puerta no medida o sin tope definido') {
      hastaMb = null;
    } else {
      // Config failures (nadie, mi-cuenta, vinculos, grupo) → sin límite aplicable
      hastaMb = null;
    }

    return {
      permitido: false,
      hastaMb,
      motivo: `puerta: ${puedeUsarResultado.motivo}`,
    };
  }

  // Regla 5: modo banco
  const banco = evaluarBanco(ajustes, contadores, ahora, desfaseMin);

  // Regla 6: hastaMb = mínimo de los límites que apliquen
  const limites: (number | null)[] = [porAudiencia.limiteMeshMb];
  if (restantePuerta !== null) limites.push(restantePuerta);
  if (banco.aplica) limites.push(banco.restanteMb);

  const hastaMb = minimoNoNull(...limites);

  if (banco.aplica && !banco.permitido) {
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