type Ambito = 'privado' | 'grupo' | 'comunidad' | 'publico';

export type Ficha = {
  nodoId: string;
  capacidad: { nucleos: number; ramLibreMb: number };
  almacen?: {
    libreMb: number;
    prestaMb: number;
    ambitos: Ambito[];
  };
};

type Politica = {
  sembrarPublico: boolean;
  presta: {
    cuenta: boolean;
    publico: boolean;
  };
};

export function almacenEnFicha(entrada: {
  ficha: Ficha;
  libreMb: number;
  prestaMb: number;
  ambitos: Ambito[];
}): Ficha {
  return {
    ...entrada.ficha,
    almacen: {
      libreMb: entrada.libreMb,
      prestaMb: entrada.prestaMb,
      ambitos: entrada.ambitos
    }
  };
}

export function fichaAlmacenCompacta(ficha: Ficha): Ficha {
  return ficha;
}

export function ambitosPermitidos(entrada: {
  politica: Politica;
  ambitoPedido: Ambito;
  tieneConsentimiento: boolean;
  cuotaPublicaMB?: number;
}): Ambito[] {
  const resultados: Ambito[] = [];

  if (entrada.ambitoPedido === 'privado') {
    resultados.push('privado');
    return resultados;
  }

  const politica = entrada.politica;

  if (politica.sembrarPublico && politica.presta.publico && entrada.tieneConsentimiento) {
    resultados.push('publico');
  }

  return resultados;
}