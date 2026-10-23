import { OfertaNeurona, Peticion, planificar } from "./oferta";

/**
 * Regla de Alex (2026-10-20, architecture/repos-libreria-1020d.md §3): lo que pide RAM o GPU
 * lo colocan la malla local y las capas de conciencia, nunca la neurona por su cuenta.
 */
export type ServicioId =
  | "comfyui"
  | "libretranslate"
  | "stirling-pdf"
  | "archivebox"
  | "openhands-agent-server"
  | "coolify";

export type RequisitosServicio = {
  servicio: ServicioId;
  ramGb: number | null;
  ramMedidaMb: number | null;
  gpu: "necesaria" | "recomendada" | "opcional" | "no";
  docker: "necesaria" | "recomendada" | "opcional" | "no" | "la instala";
  arm64Verificado: boolean;
  nota: string;
};

export type CapaPublica = {
  id: string;
  nucleos: number | null;
  ramMb: number | null;
  arquitectura?: "arm64" | "amd64";
  gpu: boolean;
  estado: "activa" | "inactiva" | "con-permiso";
  motivo?: string;
};

export type ServicioInstalado = {
  servicio: ServicioId;
  capaId: string;
  host: "127.0.0.1";
  puerto: number;
  modo: "bajo-demanda";
  cabeMb: number;
  minutosSinUso: 15;
};

export type ContextoServicio = {
  cuentaId: string;
  grupos: string[];
  aparatoId: string;
  privado: boolean;
  permisoEspaciosHf?: boolean;
};

export type Donde = {
  tipo: "aparato" | "cuenta" | "cerebro" | "malla" | "capa-publica" | "web-gratis" | "ninguno";
  id?: string;
};

export type Colocacion = {
  donde: Donde;
  motivo: string;
  respaldo?: Donde;
  falta: string[];
};

const MEDIDA_A1 = "Medido en el A1 el 2026-10-20 (architecture/repos-libreria-1020d.md §7).";

export const REQUISITOS_SERVICIO: Record<ServicioId, RequisitosServicio> = {
  comfyui: {
    servicio: "comfyui", ramGb: 8, ramMedidaMb: 4100, gpu: "recomendada", docker: "opcional", arm64Verificado: true,
    nota: `${MEDIDA_A1} ComfyUI 0.42.1 con SD 1.5 en fp32 ocupa 4,1 GB y una imagen de 512 px con 12 pasos tarda más de 10 min en CPU: solo cola sin prisa.`,
  },
  libretranslate: {
    servicio: "libretranslate", ramGb: null, ramMedidaMb: 711, gpu: "opcional", docker: "opcional", arm64Verificado: true,
    nota: `${MEDIDA_A1} v1.9.6 con es, en, pt, fr, de e it ocupa 711 MiB.`,
  },
  "stirling-pdf": {
    servicio: "stirling-pdf", ramGb: null, ramMedidaMb: 1400, gpu: "no", docker: "recomendada", arm64Verificado: true,
    nota: `${MEDIDA_A1} v3.2.0 ocupa 1,4 GiB y arranca en frío en 109 s.`,
  },
  archivebox: {
    servicio: "archivebox", ramGb: null, ramMedidaMb: null, gpu: "no", docker: "recomendada", arm64Verificado: true,
    nota: "RAM sin medir; en el A1 (2026-10-20) v0.9.73 archiva una página en 1 min 16 s y su unidad pide 1,2 GB libres para arrancar.",
  },
  "openhands-agent-server": {
    servicio: "openhands-agent-server", ramGb: null, ramMedidaMb: null, gpu: "no", docker: "necesaria", arm64Verificado: true,
    nota: "Imagen arm64 comprobada el 2026-10-20 (ghcr.io/openhands/agent-server:1.7.1-python, 4,4 GB de disco); RAM en uso por medir (375 MiB observados solo en reposo).",
  },
  coolify: {
    servicio: "coolify", ramGb: null, ramMedidaMb: null, gpu: "no", docker: "la instala", arm64Verificado: false,
    nota: "La portada no da cifras de RAM (sin medir); cita Raspberry Pi como servidor válida. Los puertos 80 y 443 (Caddy) son suyos: nunca con el enjambre escribiendo en ese servidor.",
  },
};

export const CAPAS_PUBLICAS_CONOCIDAS: CapaPublica[] = [
  { id: "oracle-a1", nucleos: 2, ramMb: 12288, arquitectura: "arm64", gpu: false, estado: "activa" },
  {
    id: "cloud-run", nucleos: null, ramMb: null, gpu: false, estado: "inactiva",
    motivo: "facturación de Google desactivada desde el 2026-09-25",
  },
  {
    id: "espacios-hf", nucleos: null, ramMb: null, gpu: false, estado: "con-permiso",
    motivo: "solo con permiso de la persona",
  },
];

export const SERVICIOS_INSTALADOS = [
  { servicio: "libretranslate", capaId: "oracle-a1", host: "127.0.0.1", puerto: 5000, modo: "bajo-demanda", cabeMb: 1500, minutosSinUso: 15 },
  { servicio: "stirling-pdf", capaId: "oracle-a1", host: "127.0.0.1", puerto: 8180, modo: "bajo-demanda", cabeMb: 1500, minutosSinUso: 15 },
  { servicio: "archivebox", capaId: "oracle-a1", host: "127.0.0.1", puerto: 8001, modo: "bajo-demanda", cabeMb: 1200, minutosSinUso: 15 },
  { servicio: "comfyui", capaId: "oracle-a1", host: "127.0.0.1", puerto: 8188, modo: "bajo-demanda", cabeMb: 4500, minutosSinUso: 15 },
  { servicio: "openhands-agent-server", capaId: "oracle-a1", host: "127.0.0.1", puerto: 8010, modo: "bajo-demanda", cabeMb: 2500, minutosSinUso: 15 },
] as const satisfies readonly ServicioInstalado[];

function ramNecesariaMb(req: RequisitosServicio): number | null {
  if (req.ramMedidaMb != null) return req.ramMedidaMb;
  if (req.ramGb != null) return req.ramGb * 1024;
  return null;
}

function petPara(req: RequisitosServicio, conGpu: boolean): Peticion {
  const ram = ramNecesariaMb(req);
  return {
    computo: {
      ramLibreMbMin: ram ?? undefined,
      gpu: conGpu ? true : undefined,
    },
  };
}

function variantesDeGpu(req: RequisitosServicio): { pet: Peticion; conGpu: boolean; nota: string | null }[] {
  if (req.gpu === "necesaria") return [{ pet: petPara(req, true), conGpu: true, nota: null }];
  if (req.gpu === "recomendada") {
    return [
      { pet: petPara(req, true), conGpu: true, nota: null },
      {
        pet: petPara(req, false), conGpu: false,
        nota: "sin GPU: cola lenta sin prisa (medido: más de 10 min por imagen en CPU)",
      },
    ];
  }
  return [{ pet: petPara(req, false), conGpu: false, nota: null }];
}

function mejorPlan(
  variantes: { pet: Peticion; conGpu: boolean; nota: string | null }[],
  subofertas: OfertaNeurona[],
  contexto: ContextoServicio
): { nodoId: string; nota: string | null; conGpu: boolean } | null {
  for (const v of variantes) {
    const peticion = { ...v.pet, cuentaId: contexto.cuentaId, grupos: contexto.grupos };
    const resultado = planificar(peticion, subofertas)[0];
    if (resultado) return { nodoId: resultado.ofertaId, nota: v.nota, conGpu: v.conGpu };
  }
  return null;
}

/**
 * Colocación genérica por requisitos (§3, de lo más cercano a lo más lejano):
 * aparato › neuronas de la cuenta › servidores del cerebro (aún fuera de la bolsa) ›
 * vecinos públicos de la malla › capas de conciencia públicas › web gratis › ninguno.
 */
export function colocarConRequisitos(
  req: RequisitosServicio,
  ofertas: OfertaNeurona[],
  contexto: ContextoServicio,
  capas: CapaPublica[] = CAPAS_PUBLICAS_CONOCIDAS
): Colocacion {
  const falta: string[] = [];
  if (ramNecesariaMb(req) == null) {
    falta.push("RAM del servicio a medir: colocación «a medir» con una oferta con medida");
  }

  const variantes = variantesDeGpu(req);
  const grupos: { tipo: Donde["tipo"]; soloPublicoMayor: boolean; sub: OfertaNeurona[] }[] = [
    { tipo: "aparato", soloPublicoMayor: false, sub: ofertas.filter(o => o.nodoId === contexto.aparatoId) },
    { tipo: "cuenta", soloPublicoMayor: false, sub: ofertas.filter(o => o.nodoId !== contexto.aparatoId && o.presta.cuenta && o.cuentaId === contexto.cuentaId) },
    { tipo: "cerebro", soloPublicoMayor: false, sub: [] },
    { tipo: "malla", soloPublicoMayor: true, sub: ofertas.filter(o => o.nodoId !== contexto.aparatoId && o.presta.publico && o.cuentaId !== contexto.cuentaId) },
  ];

  for (const grupo of grupos) {
    if (grupo.soloPublicoMayor && contexto.privado) {
      falta.push("contenido privado solo en aparato, cuenta o cerebro: nunca en vecinos de la malla, capas públicas o webs de tercero");
      continue;
    }
    if (grupo.sub.length === 0) {
      if (grupo.tipo === "cerebro") {
        falta.push("los servidores del cerebro (brain_server_links) aún no declaran su oferta a la bolsa");
      }
      continue;
    }
    const plan = mejorPlan(variantes, grupo.sub, contexto);
    if (!plan) continue;
    if (plan.nota) falta.push(plan.nota);
    const motivo = `${motivoDeRed(grupo.tipo, plan.nodoId, plan.conGpu && req.gpu === "recomendada")} ${req.nota}`.trim();
    return {
      donde: { tipo: grupo.tipo, id: plan.nodoId },
      motivo,
      respaldo: respaldoPosible(req, contexto),
      falta,
    };
  }
  return colocarEnCapaPublica(req, contexto, capas, falta);
}

function motivoDeRed(tipo: Donde["tipo"], nodoId: string, conGpuRecomendada: boolean): string {
  const con = conGpuRecomendada ? " con GPU" : "";
  switch (tipo) {
    case "aparato":
      return `Corre en el propio aparato ${nodoId}${con}: su oferta presta lo que el servicio pide (medido en su latido).`;
    case "cuenta":
      return `Corre en la neurona ${nodoId}${con}, de la misma cuenta.`;
    case "cerebro":
      return `Corre en el servidor del cerebro ${nodoId}${con}.`;
    case "malla":
      return `Corre en el vecino ${nodoId}${con} de la malla, que presta capacidad en público.`;
    default:
      return `Corre en ${nodoId}${con}.`;
  }
}

function respaldoPosible(req: RequisitosServicio, contexto: ContextoServicio): Donde | undefined {
  if (contexto.privado) return undefined;
  const capa = CAPAS_PUBLICAS_CONOCIDAS.find(c => {
    if (c.estado !== "activa") return false;
    if (c.arquitectura === "arm64" && !req.arm64Verificado) return false;
    const ram = ramNecesariaMb(req);
    return c.ramMb == null || ram == null || c.ramMb >= ram;
  });
  return capa ? { tipo: "capa-publica", id: capa.id } : undefined;
}

function colocarEnCapaPublica(
  req: RequisitosServicio,
  contexto: ContextoServicio,
  capas: CapaPublica[],
  falta: string[]
): Colocacion {
  const ram = ramNecesariaMb(req);
  for (const capa of capas) {
    if (contexto.privado) {
      falta.push("contenido privado solo en aparato, cuenta o cerebro: la capa pública no lo toma");
      break;
    }
    if (capa.estado === "inactiva") {
      falta.push(`Capa ${capa.id} sin actividad: ${capa.motivo}`);
      continue;
    }
    if (capa.estado === "con-permiso" && !contexto.permisoEspaciosHf) {
      falta.push(`Capa ${capa.id} sin permiso: ${capa.motivo}`);
      continue;
    }
    if (req.gpu === "necesaria" && !capa.gpu) {
      falta.push(`La capa ${capa.id} no tiene GPU hoy`);
      continue;
    }
    if (capa.arquitectura === "arm64" && !req.arm64Verificado) {
      falta.push("medir arm64 en el A1");
      continue;
    }
    if (capa.ramMb != null && ram != null && capa.ramMb < ram) {
      falta.push(`La capa ${capa.id} no cabe: pide ${ram} MB y presta ${capa.ramMb} MB`);
      continue;
    }
    const instala = SERVICIOS_INSTALADOS.find(s => s.servicio === req.servicio && s.capaId === capa.id);
    const motivoInstalado = instala
      ? ` Ya está instalado en el A1 en ${instala.host}:${instala.puerto} (bajo demanda): se enciende al primer uso si caben ${instala.cabeMb} MB y se apaga a los 15 min sin uso.`
      : "";
    return {
      donde: { tipo: "capa-publica", id: capa.id },
      motivo: `Corre en la capa pública ${capa.id} (estado ${capa.estado}, arquitectura ${capa.arquitectura ?? "sin declarar"}, RAM ${capa.ramMb != null ? `${capa.ramMb} MB` : "sin declarar"}${capa.gpu ? ", con GPU" : ", sin GPU"}).${motivoInstalado} ${req.nota}`,
      falta,
    };
  }
  if (req.gpu === "necesaria" && !contexto.privado) {
    falta.push("GPU necesaria: hoy ninguna capa gratis la tiene de forma persistente");
    return terminar("web-gratis", "GPU necesaria y ninguna oferta con GPU: el suelo honesto es la web gratis (Pollinations o un Space), nunca un «nada» ni un servicio que no cabe", falta);
  }
  if (req.gpu === "necesaria") {
    falta.push("GPU necesaria y contenido privado: no hay destino con GPU (ninguna capa gratuita la tiene persistente)");
  }
  return terminar("ninguno", "Ningún destino cumple los requisitos hoy", falta);
}

function terminar(tipo: Donde["tipo"], motivo: string, falta: string[]): Colocacion {
  return { donde: { tipo }, motivo, falta };
}

export function colocarServicio(
  servicio: ServicioId,
  ofertas: OfertaNeurona[],
  contexto: ContextoServicio
): Colocacion {
  return colocarConRequisitos(REQUISITOS_SERVICIO[servicio], ofertas, contexto);
}




