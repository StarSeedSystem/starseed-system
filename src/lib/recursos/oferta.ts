export type OfertaNeurona = {
  nodoId: string;
  cuentaId: string;
  medio: string;
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
  apps: { id: string; version: string }[];
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
      horas?: { inicio: number; fin: number };
      soloCargando: boolean;
    };
  };
  t: number;
};

export function ofertaVisiblePara(
  oferta: OfertaNeurona,
  quien: { cuentaId: string; grupos: string[] }
): OfertaNeurona | null {
  const { cuentaId: quienCuentaId, grupos: quienGrupos } = quien;
  const { cuenta, grupos: offerGrupos, publico } = oferta.presta;
  if (!(cuenta && oferta.cuentaId === quienCuentaId || publico || offerGrupos.some(g => quienGrupos.includes(g)))) return null;
  return { ...oferta };
}

export function capacidadPrestable(oferta: OfertaNeurona): OfertaNeurona {
  const { computo, almacen, energia, presta, t } = oferta;
  const { cpuPct, ramMb, discoMb, horas, soloCargando } = presta.topes;
  const hour = new Date(t).getHours();
  let lendableMultiplier = 1;
  if (soloCargando && !energia.cargando) lendableMultiplier = 0;
  if (horas) {
    const { inicio, fin } = horas;
    if (hour < inicio || hour >= fin) lendableMultiplier = 0;
  }
  const zeroCompByBatteryOrEnUso = (energia.bateriaPct !== undefined && energia.bateriaPct < 20 && !energia.cargando) || energia.enUso;
  let prestableComputo: OfertaNeurona['computo'];
  if (zeroCompByBatteryOrEnUso || lendableMultiplier === 0) {
    prestableComputo = { nucleos: 0, ramLibreMb: 0, gpu: false, vramMb: undefined, motores: [] };
  } else {
    prestableComputo = {
      nucleos: Math.floor(computo.nucleos * (cpuPct / 100) * lendableMultiplier),
      ramLibreMb: Math.min(computo.ramLibreMb, ramMb) * lendableMultiplier,
      gpu: computo.gpu ? lendableMultiplier > 0 : false,
      vramMb: computo.vramMb ? (lendableMultiplier > 0 ? computo.vramMb : undefined) : undefined,
      motores: lendableMultiplier > 0 ? computo.motores : [],
    };
  }
  let prestableStorage: OfertaNeurona['almacen'];
  if (lendableMultiplier === 0) {
    prestableStorage = { prestaMb: 0, volumenes: [] };
  } else {
    prestableStorage = {
      prestaMb: Math.min(almacen.prestaMb, discoMb) * lendableMultiplier,
      volumenes: almacen.volumenes,
    };
  }
  return { ...oferta, computo: prestableComputo, almacen: prestableStorage };
}