import { REQUISITOS_1020D, type RequisitosParciales } from "../library/repos-externos-1020";
import { planificar, type OfertaNeurona, type Peticion } from "./oferta";

export type TipoDestino = "aparato" | "cuenta" | "cerebro" | "malla" | "capa-publica" | "web-gratis" | "ninguno";
export type Destino = { tipo: TipoDestino; id?: string };
export type Colocacion = { donde: Destino; motivo: string; respaldo?: Destino; falta: string[] };
export type Gpu = "no" | "opcional" | "recomendada" | "necesaria";
export type ServicioId = "comfyui" | "libretranslate" | "stirling-pdf" | "archivebox" | "openhands-agent-server" | "coolify";
export type RequisitosServicio = { id: ServicioId; nombre: string; ram_gb: number | null; ramMedidaMb: number | null; vram_gb: number | null; gpu: Gpu; docker: string; arquitecturas: string[]; so: string[]; fuente: string; medido: string | null };
export type Contexto = { cuentaId: string; grupos?: string[]; aparatoId?: string; servidoresCerebro?: string[]; privado?: boolean; enjambreEscribiendo?: boolean; presionMemoria?: "ok" | "aviso"; arquitecturas?: Record<string, string>; ofertasMedidas?: string[]; permisoEspaciosHf?: boolean; t?: number };
export type CapaPublica = { id: string; nombre: string; estado: "activa" | "inactiva" | "con-permiso"; ocpu: number | null; ramMb: number | null; arquitectura: string; gpu: boolean; motivo: string };
export type ServicioInstalado = { servicio: ServicioId; host: "127.0.0.1"; puerto: number; bajoDemanda: true; enciendeAlPrimerUso: true; apagaSinUsoMin: 15; cabeSiMb: number };
const QUE_1020D: Record<ServicioId, string> = {
  comfyui: "lib-comfyui", libretranslate: "lib-libretranslate", "stirling-pdf": "lib-stirling-pdf",
  archivebox: "lib-archivebox", "openhands-agent-server": "lib-openhands", coolify: "lib-coolify",
};
const GPUS_VALIDAS: Gpu[] = ["no", "opcional", "recomendada", "necesaria"];
const SIN_REQUISITO: RequisitosParciales = {};
const r = (id: ServicioId, nombre: string, extra?: Partial<RequisitosServicio>): RequisitosServicio => {
  const cat = REQUISITOS_1020D[QUE_1020D[id]] ?? SIN_REQUISITO;
  return {
    id, nombre, ramMedidaMb: null, medido: null,
    ram_gb: cat.ram_gb ?? null, vram_gb: cat.vram_gb ?? null,
    gpu: GPUS_VALIDAS.find((g) => g === cat.gpu) ?? "no",
    docker: cat.docker ?? "opcional", arquitecturas: cat.arquitecturas ?? ["amd64", "arm64"],
    so: cat.so ?? ["linux"], fuente: cat.fuente ?? "catálogo config/repos-libreria-1020d.json",
    ...extra,
  };
};
export const REQUISITOS_SERVICIO: Record<ServicioId, RequisitosServicio> = {
  comfyui: r("comfyui", "ComfyUI", { ramMedidaMb: 4096, medido: "4,1 GB en uso y más de 10 min por imagen en CPU (A1, 2026-10-20)" }),
  libretranslate: r("libretranslate", "LibreTranslate", { ramMedidaMb: 711, medido: "711 MiB con seis idiomas (A1, 2026-10-20)" }),
  "stirling-pdf": r("stirling-pdf", "Stirling-PDF", { ramMedidaMb: 1434, medido: "1,4 GiB y arranque en frío de 109 s (A1, 2026-10-20)" }),
  archivebox: r("archivebox", "ArchiveBox", { medido: "tiempo por página: 1 min 16 s; RAM sin medir (A1, 2026-10-20)" }),
  "openhands-agent-server": r("openhands-agent-server", "OpenHands Agent Server"),
  coolify: r("coolify", "Coolify"),
};
export const CAPAS_PUBLICAS_CONOCIDAS: CapaPublica[] = [
  { id: "oracle-a1", nombre: "el A1", estado: "activa", ocpu: 2, ramMb: 12288, arquitectura: "arm64", gpu: false, motivo: "encendida 24/7, sin GPU" },
  { id: "cloud-run", nombre: "Cloud Run", estado: "inactiva", ocpu: null, ramMb: null, arquitectura: "amd64", gpu: false, motivo: "facturación de Google desactivada desde el 2026-09-25" },
  { id: "espacios-hf", nombre: "Spaces de Hugging Face", estado: "con-permiso", ocpu: null, ramMb: null, arquitectura: "amd64", gpu: false, motivo: "solo con permiso de la persona" },
];
const i = (servicio: ServicioId, puerto: number, cabeSiMb: number): ServicioInstalado => ({ servicio, host: "127.0.0.1", puerto, bajoDemanda: true, enciendeAlPrimerUso: true, apagaSinUsoMin: 15, cabeSiMb });
export const SERVICIOS_INSTALADOS: Partial<Record<ServicioId, ServicioInstalado>> = {
  libretranslate: i("libretranslate", 5000, 1500),
  "stirling-pdf": i("stirling-pdf", 8180, 1500),
  archivebox: i("archivebox", 8001, 1200),
  comfyui: i("comfyui", 8188, 4500),
  "openhands-agent-server": i("openhands-agent-server", 8010, 2500),
};
const ofertaDeCapa = (capa: CapaPublica, t: number): OfertaNeurona => ({
  nodoId: capa.id, cuentaId: "", medio: "capa-publica",
  computo: { nucleos: capa.ocpu ?? 0, ramLibreMb: capa.ramMb ?? 0, gpu: capa.gpu, vramMb: undefined, motores: [] },
  almacen: { prestaMb: 0, volumenes: [] }, apps: [], enlaces: {}, energia: { enUso: false },
  presta: { cuenta: false, grupos: [], publico: true, topes: { cpuPct: 100, ramMb: capa.ramMb ?? 0, discoMb: 0, soloCargando: false } },
  t,
});
export function colocarServicio(servicio: ServicioId | RequisitosServicio, ofertas: OfertaNeurona[], contexto: Contexto): Colocacion {
  const req = typeof servicio === "string" ? REQUISITOS_SERVICIO[servicio] : servicio;
  if (!req) return { donde: { tipo: "ninguno" }, motivo: `No hay requisitos para «${servicio}»`, falta: ["declarar los requisitos del servicio"] };
  const ramMb = req.ram_gb != null ? req.ram_gb * 1024 : req.ramMedidaMb;
  const gpuNecesaria = req.gpu === "necesaria";
  const privado = contexto.privado === true;
  const servidores = new Set(contexto.servidoresCerebro ?? []);
  const medidas = new Set(contexto.ofertasMedidas ?? []);
  const tomadas = new Set<string>();
  const encontrados: Destino[] = [];
  const falta: string[] = [];
  const motivosCapas: string[] = [];
  let faltaMedida = false;
  const pedido: Peticion = { cuentaId: contexto.cuentaId, grupos: contexto.grupos ?? [], computo: { ramLibreMbMin: ramMb ?? 0, gpu: gpuNecesaria || undefined, vramMbMin: gpuNecesaria && req.vram_gb != null ? req.vram_gb * 1024 : undefined } };
  const anotar = (texto: string) => { if (!falta.includes(texto)) falta.push(texto); };
  const buscar = (bucket: OfertaNeurona[], tipo: TipoDestino) => {
    const validas = bucket.filter((o) => {
      if (tomadas.has(o.nodoId)) return false;
      const arq = contexto.arquitecturas?.[o.nodoId];
      if (arq && !req.arquitecturas.includes(arq)) { anotar(`medir ${arq} en ${o.nodoId}`); return false; }
      if (ramMb == null && !medidas.has(o.nodoId)) { faltaMedida = true; return false; }
      return true;
    });
    const plan = planificar(pedido, validas);
    if (plan.length > 0) { tomadas.add(plan[0].ofertaId); encontrados.push({ tipo, id: plan[0].ofertaId }); }
  };
  const aparato = ofertas.filter((o) => o.nodoId === contexto.aparatoId);
  const bloqueo = contexto.enjambreEscribiendo ? "el aparato no presta con el enjambre escribiendo" : contexto.presionMemoria === "aviso" ? "el aparato tiene la presión de memoria en aviso" : null;
  if (aparato.length > 0 && bloqueo) { anotar(bloqueo); if (contexto.aparatoId) tomadas.add(contexto.aparatoId); }
  else if (aparato.length > 0) buscar(aparato, "aparato");
  buscar(ofertas.filter((o) => o.cuentaId === contexto.cuentaId), "cuenta");
  buscar(ofertas.filter((o) => servidores.has(o.nodoId)), "cerebro");
  if (!privado) buscar(ofertas.filter((o) => o.presta.publico), "malla");
  const capas: CapaPublica[] = [];
  for (const capa of CAPAS_PUBLICAS_CONOCIDAS) {
    if (tomadas.has(capa.id)) continue;
    if (capa.estado === "inactiva") { motivosCapas.push(`${capa.nombre}: ${capa.motivo}`); continue; }
    if (capa.estado === "con-permiso" && !contexto.permisoEspaciosHf) { motivosCapas.push(`${capa.nombre}: ${capa.motivo}`); continue; }
    capas.push(capa);
  }
  if (!privado) for (const capa of capas) {
    if (!req.arquitecturas.includes(capa.arquitectura)) { anotar(`medir ${capa.arquitectura} en ${capa.nombre}`); continue; }
    if (ramMb == null && capa.ramMb == null) { faltaMedida = true; continue; }
    const plan = planificar(pedido, [ofertaDeCapa(capa, contexto.t ?? 0)]);
    if (plan.length > 0) { tomadas.add(capa.id); encontrados.push({ tipo: "capa-publica", id: capa.id }); break; }
  }
  if (encontrados.length === 0) {
    if (gpuNecesaria && !privado) {
      anotar("una capa con GPU (hoy ninguna capa gratis la tiene)");
      for (const m of motivosCapas) anotar(m);
      return { donde: { tipo: "web-gratis", id: "pollinations" }, motivo: `«${req.nombre}» necesita GPU y ninguna oferta a mano la tiene; la web gratuita (Pollinations) cubre la imagen. ${motivosCapas.join("; ")}`.trim(), falta };
    }
    if (gpuNecesaria) anotar("una oferta con GPU en el aparato, la cuenta o el cerebro");
    if (privado) anotar("lo privado solo se coloca en el aparato, la cuenta o el cerebro");
    if (faltaMedida) anotar("una oferta con la RAM medida");
    if (falta.length === 0) anotar("capacidad suficiente y visible");
    for (const m of motivosCapas) anotar(m);
    return { donde: { tipo: "ninguno" }, motivo: `No hay dónde colocar «${req.nombre}»: ${falta.join("; ")}.`, falta };
  }
  const primero = encontrados[0];
  const instalado = SERVICIOS_INSTALADOS[req.id];
  const puerto = instalado ? ` en 127.0.0.1:${instalado.puerto}, bajo demanda y se apaga a los ${instalado.apagaSinUsoMin} min sin uso` : "";
  const capa = CAPAS_PUBLICAS_CONOCIDAS.find((c) => c.id === primero.id);
  const motivos: Record<TipoDestino, string> = {
    aparato: `«${req.nombre}» cabe en lo que presta el aparato${puerto}`,
    cuenta: `«${req.nombre}» cabe en una neurona de la misma cuenta${puerto}`,
    cerebro: `«${req.nombre}» cabe en un servidor del cerebro${puerto}`,
    malla: `«${req.nombre}» cabe en un vecino de la malla que presta en público`,
    "capa-publica": `«${req.nombre}» cabe en la capa pública ${capa?.nombre ?? primero.id}${puerto}`,
    "web-gratis": `«${req.nombre}» se resuelve en la web gratuita`,
    ninguno: `«${req.nombre}» no tiene dónde correr`,
  };
  let motivo = motivos[primero.tipo];
  if (req.id === "comfyui" && primero.tipo === "capa-publica" && !capa?.gpu) motivo += "; sin GPU es solo cola sin prisa (más de 10 min por imagen medida en el A1)";
  if ((primero.tipo === "capa-publica" || primero.tipo === "ninguno" || primero.tipo === "web-gratis") && motivosCapas.length > 0) motivo += ` No se elige ${motivosCapas.join("; ")}.`;
  if (ramMb == null) anotar("a medir el consumo real del servicio");
  const salida: Colocacion = { donde: primero, motivo, falta };
  if (encontrados.length > 1) salida.respaldo = encontrados[1];
  return salida;
}
