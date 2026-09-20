export type MedioNodo = "mac" | "nube" | "vps" | "dispositivo" | "otro";
export type TonoNodo = "verde" | "ambar" | "rojo" | "gris";

export interface MeshNodoInput {
  id?: string;
  node_id?: string;
  nombre?: string;
  hostname?: string;
  medio?: string;
  arq?: string;
  architecture?: string;
  os?: string;
  hardware?: { ram_gb?: number; nucleos?: number; cpu_cores?: number; arq?: string };
  ram_gb?: number;
  nucleos?: number;
  cpu_cores?: number;
  status?: string;
  vivo?: boolean;
  permanente?: boolean;
}

export interface GobernadorInput {
  servidor?: string;
  maximo_hardware?: number;
  trabajadores?: number;
  ram_total_mb?: number;
  ram_libre_mb?: number;
  swap_mb?: number;
  nucleos?: number;
}

export interface EstadoBitnetInput {
  salud?: { vivo?: boolean; tok_s?: number; ram_libre_mb?: number; swap_mb?: number; health?: string };
  vivo?: boolean;
  tok_s?: number;
  speed_tps?: number;
  tokens_per_second?: number;
  ram_libre_mb?: number;
  ram_free_mb?: number;
  swap_mb?: number;
  ok?: boolean;
}

export interface FilaNodo {
  id: string;
  nombre: string;
  medio: MedioNodo;
  arq: string;
  ramGb: number;
  nucleos: number;
  vivo: boolean;
  tokS: number;
  ramLibreMb: number;
  swapMb: number;
  agentesMax: number;
  agentesAhora: number;
  permanente: boolean;
  tono: TonoNodo;
}

export interface ResumenNodos {
  nodosVivos: number;
  tokSTotal: number;
  agentesMaxTotal: number;
  frase: string;
}

export function filaNodo(
  nodo?: MeshNodoInput | null,
  estadoBitnet?: EstadoBitnetInput | null,
  gobernador?: GobernadorInput | null,
): FilaNodo {
  const host = (nodo?.hostname || nodo?.id || nodo?.node_id || "nodo").toLowerCase();
  const rawMedio = nodo?.medio?.toLowerCase();
  let medio: MedioNodo = "otro";
  if (rawMedio === "mac" || rawMedio === "nube" || rawMedio === "vps" || rawMedio === "dispositivo" || rawMedio === "otro") {
    medio = rawMedio;
  } else if (host.includes("mac") || host.includes("apple") || nodo?.os?.toLowerCase().includes("darwin")) {
    medio = "mac";
  } else if (/claude|codespace|container|docker|pod|ephemeral|vercel|cloud/i.test(host)) {
    medio = "nube";
  } else if (/oracle|vps|hetzner|aws|gcp|digitalocean|linode/i.test(host)) {
    medio = "vps";
  } else if (/android|ios|pixel|phone|dispositivo/i.test(host) || nodo?.os?.toLowerCase().includes("android")) {
    medio = "dispositivo";
  }

  const id = nodo?.id || nodo?.node_id || nodo?.hostname || nodo?.nombre || "local";
  const nombre = nodo?.nombre || nodo?.hostname || nodo?.id || nodo?.node_id || "Nodo BitNet";
  const arq = nodo?.arq || nodo?.architecture || nodo?.hardware?.arq || "x86_64";
  const ramGb = nodo?.ram_gb ?? nodo?.hardware?.ram_gb ?? (gobernador?.ram_total_mb ? Math.round((gobernador.ram_total_mb / 1024) * 10) / 10 : 8);
  const nucleos = nodo?.nucleos ?? nodo?.cpu_cores ?? nodo?.hardware?.nucleos ?? nodo?.hardware?.cpu_cores ?? gobernador?.nucleos ?? 2;

  const vivo = Boolean(estadoBitnet?.salud?.vivo ?? estadoBitnet?.vivo ?? estadoBitnet?.ok ?? (nodo?.status === "online" || nodo?.vivo));
  const tokS = Number(estadoBitnet?.salud?.tok_s ?? estadoBitnet?.tok_s ?? estadoBitnet?.speed_tps ?? estadoBitnet?.tokens_per_second ?? 0);
  const ramLibreMb = Number(gobernador?.ram_libre_mb ?? estadoBitnet?.salud?.ram_libre_mb ?? estadoBitnet?.ram_libre_mb ?? estadoBitnet?.ram_free_mb ?? 0);
  const swapMb = Number(gobernador?.swap_mb ?? estadoBitnet?.salud?.swap_mb ?? estadoBitnet?.swap_mb ?? 0);

  const agentesMax = Number(gobernador?.maximo_hardware ?? (medio === "vps" ? 3 : 2));
  const agentesAhora = Number(gobernador?.trabajadores ?? 0);
  const permanente = nodo?.permanente !== undefined ? Boolean(nodo.permanente) : !/claude|codespace|container|ephemeral|docker|runner|pod/i.test(host);

  const tono: TonoNodo = !vivo ? (swapMb > 8192 ? "rojo" : "gris") : tokS >= 5 && swapMb <= 8192 ? "verde" : "ambar";

  return { id, nombre, medio, arq, ramGb, nucleos, vivo, tokS, ramLibreMb, swapMb, agentesMax, agentesAhora, permanente, tono };
}

export function resumen(filas: FilaNodo[]): ResumenNodos {
  const nodosVivos = filas.filter((f) => f.vivo).length;
  const tokSTotal = Math.round(filas.filter((f) => f.vivo).reduce((acc, f) => acc + f.tokS, 0) * 10) / 10;
  const agentesMaxTotal = filas.reduce((acc, f) => acc + f.agentesMax, 0);
  const agentesAhoraTotal = filas.reduce((acc, f) => acc + f.agentesAhora, 0);
  const caben = Math.max(0, agentesMaxTotal - agentesAhoraTotal);
  const tagVivos = nodosVivos === 1 ? "1 nodo vivo" : `${nodosVivos} nodos vivos`;
  const frase = `${tagVivos} · ${tokSTotal} tok/s en total · caben ${caben} agentes más`;

  return { nodosVivos, tokSTotal, agentesMaxTotal, frase };
}
