// Ajustes del cerebro: modelo puro con herencia.
// Contrato: architecture/cerebros-fusion-telepatia.md §8.

export type Capacidad = "texto" | "imagen" | "voz" | "video" | "embeddings" | "agentes";

export interface AjustesObjetivo {
  privacidad: "privado" | "perfil" | "grupo" | "publico";
  cifradoLocal: boolean;
  medios: { capacidades: Partial<Record<Capacidad, string>>; almacenamiento: string[] };
  sync: { direccion: "enviar" | "recibir" | "ambas" | "ninguna"; auto: boolean; destinos: string[] };
  acceso: { quien: string; nivel: "leer" | "escribir" | "admin" }[];
}

export interface AjustesCerebro {
  cerebro: AjustesObjetivo;
  memorias: Record<string, Partial<AjustesObjetivo>>;
  carpetas: Record<string, Partial<AjustesObjetivo>>;
}

export function ajustesEfectivos(ajustes: AjustesCerebro, objetivo: "cerebro" | string): AjustesObjetivo {
  const base = ajustes.cerebro;
  if (objetivo === "cerebro") return base;
  const parcial = ajustes.memorias[objetivo] ?? ajustes.carpetas[objetivo] ?? {};
  return {
    privacidad: parcial.privacidad ?? base.privacidad,
    cifradoLocal: parcial.cifradoLocal ?? base.cifradoLocal,
    medios: {
      capacidades: { ...base.medios.capacidades, ...(parcial.medios?.capacidades ?? {}) },
      almacenamiento: parcial.medios?.almacenamiento ?? base.medios.almacenamiento,
    },
    sync: {
      direccion: parcial.sync?.direccion ?? base.sync.direccion,
      auto: parcial.sync?.auto ?? base.sync.auto,
      destinos: parcial.sync?.destinos ?? base.sync.destinos,
    },
    acceso: parcial.acceso ?? base.acceso,
  };
}
