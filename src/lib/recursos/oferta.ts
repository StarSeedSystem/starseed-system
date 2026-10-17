import { MedioNodo } from '../network/capacidades-nodo';

export interface OfertaNeurona {
  nodoId: string;
  cuentaId: string;
  medio: MedioNodo;
  computo: {
    nucleos: number;
    ramLibreMb: number;
    gpu: boolean;
    vramMb?: number;
    motores: string[];
  };
  almacen: {
    prestaMb: number;
    volumenes: string[];
  };
  apps: {
    id: string;
    version: string;
  }[];
  enlaces: {
    subidaKbps?: number;
    bajadaKbps?: number;
    latenciaMs?: Record<string, number>;
  };
  energia: {
    bateriaPct?: number;
    cargando?: boolean;
    enUso: boolean;
  };
  presta: {
    cuenta: boolean;
    grupos: string[];
    publico: boolean;
    topes: {
      cpuPct: number;
      ramMb: number;
      discoMb: number;
      horas?: number;
      soloCargando: boolean;
    };
  };
  t: number;
}

export interface Quien {
  cuentaId: string;
  grupos: string[];
}

export function ofertaVisiblePara(oferta: OfertaNeurona, quien: Quien): OfertaNeurona | null {
  const { cuentaId: quienCuentaId, grupos: quienGrupos } = quien;
  const { cuenta, grupos: ofertaGrupos, publico, topes } = oferta.presta;

  // Check if the persona is allowed to use the offer
  const allowed =
    (cuenta && oferta.cuentaId === quienCuentaId) ||
    publico ||
    ofertaGrupos.some((grupo) => quienGrupos.includes(grupo));

  if (!allowed) {
    return null;
  }

  // Return a recortada offer: remove latencias to nodos ajenos by setting latenciaMs to undefined
  return {
    ...oferta,
    enlaces: {
      ...oferta.enlaces,
      latenciaMs: undefined,
    },
  };
}

export function capacidadPrestable(oferta: OfertaNeurona): OfertaNeurona {
  const { energia, computo, almacen, presta } = oferta;
  const { bateriaPct, cargando, enUso } = energia;
  const { cpuPct, ramMb, discoMb, soloCargando } = presta.topes;

  // If battery < 20% and not charging, or enUso is true, set computo to zero
  if ((bateriaPct !== undefined && bateriaPct < 20 && !cargando) || enUso) {
    return {
      ...oferta,
      computo: {
        ...computo,
        nucleos: 0,
        ramLibreMb: 0,
        gpu: false,
        vramMb: undefined,
        motores: [],
      },
    };
  }

  // Otherwise, apply topes
  return {
    ...oferta,
    computo: {
      ...computo,
      ramLibreMb: Math.min(computo.ramLibreMb, ramMb),
    },
    almacen: {
      ...almacen,
      prestaMb: Math.min(almacen.prestaMb, discoMb),
    },
  };
}