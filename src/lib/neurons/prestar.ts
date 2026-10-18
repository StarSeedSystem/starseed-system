import type { MedioNodo } from "@/lib/network/capacidades-nodo";

export interface NeuronPrestarPrefs {
  computacion: boolean;
  almacenamiento: boolean;
  apps: string[];
  ancho: number;
  aQuien: {
    cuenta: boolean;
    grupos: boolean;
    publico: boolean;
  };
  topes: {
    cpu: number; // percent
    ram: number; // MB
    disco: number; // MB
    soloCargando: boolean;
  };
}

export interface NeuronMedidas {
  nodoId: string;
  medio: MedioNodo;
  ramLibreMb: number;
  cpu: number; // percent
}

export function aOferta(prefs: NeuronPrestarPrefs, medidas: NeuronMedidas) {
  // Default values for prefs (defensive reading)
  const defaultPrefs: NeuronPrestarPrefs = {
    computacion: true,
    almacenamiento: true,
    apps: [],
    ancho: 0,
    aQuien: {
      cuenta: true,
      grupos: false,
      publico: false,
    },
    topes: {
      cpu: 50,
      ram: 1024,
      disco: 2048,
      soloCargando: false,
    },
  };

  const p = { ...defaultPrefs, ...prefs };

  // Default values for medidas (if missing) - but note: medidas is required to have nodoId, medio, ramLibreMb, cpu
  // We'll still provide defaults in case some fields are missing (defensive)
  const m = {
    nodoId: medidas.nodoId ?? '',
    medio: medidas.medio ?? 'navegador',
    ramLibreMb: medidas.ramLibreMb ?? 0,
    cpu: medidas.cpu ?? 0,
  };

  // Compute offered resources based on prefs and medidas
  const offeredRam = p.almacenamiento ? Math.min(m.ramLibreMb, p.topes.ram) : 0;
  const offeredCpu = p.computacion ? Math.min(m.cpu, p.topes.cpu) : 0;

  // Build the offer object
  return {
    nodoId: m.nodoId,
    medio: m.medio,
    offeredRam,
    offeredCpu,
    apps: [...p.apps],
    ancho: p.ancho,
    aQuien: { ...p.aQuien },
    topes: { ...p.topes },
  };
}