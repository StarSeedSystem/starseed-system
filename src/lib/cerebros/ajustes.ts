/** Ajustes del cerebro (puro). Contrato: architecture/cerebros-fusion-telepatia.md §8. */
export type Capacidad = "texto" | "imagen" | "voz" | "video" | "embeddings" | "agentes";
export interface AjustesObjetivo {
  privacidad: "privado" | "perfil" | "grupo" | "publico";
  cifradoLocal: boolean;
  medios: { capacidades: Partial<Record<Capacidad, string>>; almacenamiento: string[] };
  sync: { direccion: "enviar" | "recibir" | "ambas" | "ninguna"; auto: boolean; destinos: string[] };
  acceso: { quien: string; nivel: "leer" | "escribir" | "admin" }[];
}
export interface AjustesCerebro { cerebro: AjustesObjetivo; memorias: Record<string, Partial<AjustesObjetivo>>; carpetas: Record<string, Partial<AjustesObjetivo>>; }
export const CAPACIDADES: Record<Capacidad, string> = { texto: "Texto", imagen: "Imagen", voz: "Voz", video: "Vídeo", embeddings: "Embeddings", agentes: "Agentes" };
function privScope(s?: string | null) { const v = String(s || "").trim().toLowerCase(); return v === "group" || v === "page" || v === "community" ? "grupo" : "privado"; }
export const AJUSTES_POR_DEFECTO: AjustesObjetivo = {
  privacidad: "privado", cifradoLocal: false,
  medios: { capacidades: { texto: "auto", imagen: "auto", voz: "auto", video: "auto", embeddings: "auto", agentes: "auto" }, almacenamiento: [] },
  sync: { direccion: "ambas", auto: true, destinos: [] }, acceso: [] };
export const APLICACION: Record<"medios.almacenamiento" | "privacidad" | "acceso" | "cifradoLocal" | "sync" | "medios.capacidades", "se-aplica" | "solo-se-guarda"> = {
  "medios.almacenamiento": "se-aplica", "privacidad": "se-aplica", "acceso": "solo-se-guarda",
  "cifradoLocal": "solo-se-guarda", "sync": "se-aplica", "medios.capacidades": "solo-se-guarda" };

export function leerAjustes(cerebro: { scope?: string | null; config?: Record<string, unknown> | null }): AjustesCerebro {
  const raw = ((cerebro?.config || {}) as Record<string, unknown>).ajustes as Partial<AjustesCerebro> || {};
  const c = (raw.cerebro || {}) as Partial<AjustesObjetivo>;
  const base: AjustesObjetivo = {
    privacidad: (c.privacidad as AjustesObjetivo["privacidad"]) ?? privScope(cerebro.scope),
    cifradoLocal: (c.cifradoLocal as boolean) ?? AJUSTES_POR_DEFECTO.cifradoLocal,
    medios: { capacidades: { ...AJUSTES_POR_DEFECTO.medios.capacidades, ...(c.medios?.capacidades as Partial<Record<Capacidad, string>> || {}) },
      almacenamiento: (c.medios?.almacenamiento as string[] | undefined)?.length ? (c.medios!.almacenamiento as string[]) : AJUSTES_POR_DEFECTO.medios.almacenamiento },
    sync: { direccion: (c.sync?.direccion as AjustesObjetivo["sync"]["direccion"]) ?? AJUSTES_POR_DEFECTO.sync.direccion,
      auto: (c.sync?.auto as boolean) ?? AJUSTES_POR_DEFECTO.sync.auto,
      destinos: (c.sync?.destinos as string[] | undefined)?.length ? (c.sync!.destinos as string[]) : AJUSTES_POR_DEFECTO.sync.destinos },
    acceso: Array.isArray(c.acceso) ? (c.acceso as AjustesObjetivo["acceso"]) : AJUSTES_POR_DEFECTO.acceso,
  };
  return {
    cerebro: base,
    memorias: (typeof raw.memorias === "object" && raw.memorias && !Array.isArray(raw.memorias)) ? raw.memorias as Record<string, Partial<AjustesObjetivo>> : {},
    carpetas: (typeof raw.carpetas === "object" && raw.carpetas && !Array.isArray(raw.carpetas)) ? raw.carpetas as Record<string, Partial<AjustesObjetivo>> : {},
  };
}

export function conAjustes(config: Record<string, unknown>, objetivo: { tipo: "cerebro" } | { tipo: "memoria" | "carpeta"; id: string }, parcial: Partial<AjustesObjetivo>): Record<string, unknown> {
  const nuevo = { ...config };
  const a = leerAjustes({ scope: (nuevo.scope as string | null) ?? null, config: nuevo });
  if (objetivo.tipo === "cerebro") {
    const c = a.cerebro;
    const p = parcial;
    a.cerebro = {
      ...c, ...p,
      medios: { capacidades: { ...c.medios.capacidades, ...(p.medios?.capacidades || {}) }, almacenamiento: p.medios?.almacenamiento !== undefined ? p.medios!.almacenamiento : c.medios.almacenamiento },
      sync: p.sync ? { ...c.sync, ...p.sync, destinos: p.sync.destinos !== undefined ? p.sync.destinos : c.sync.destinos } : c.sync,
      acceso: p.acceso !== undefined ? p.acceso : c.acceso,
    };
  } else {
    const campo = objetivo.tipo === "memoria" ? "memorias" : "carpetas";
    const actual = (a[campo][objetivo.id] || {}) as Partial<AjustesObjetivo>;
    const combinado = { ...actual, ...parcial };
    const c = a.cerebro;
    const tieneMedios = !!(parcial.medios || actual.medios);
    const tieneSync = !!(parcial.sync || actual.sync);
    const tieneAcceso = !!(parcial.acceso || actual.acceso);
    const difiere: Partial<AjustesObjetivo> = {};
    const cerebro = a.cerebro;
    const clavesAComparar = new Set([...Object.keys(parcial as object), ...Object.keys(actual as object)]);
    const comparar = (k: "privacidad" | "cifradoLocal" | "medios" | "sync" | "acceso") => {
      if (!clavesAComparar.has(k)) return;
      if (k === "medios" && !tieneMedios) return;
      if (k === "sync" && !tieneSync) return;
      if (k === "acceso" && !tieneAcceso) return;
      if (k === "medios") {
        const cap = combinado.medios?.capacidades || {};
        const alm = combinado.medios?.almacenamiento || [];
        const capC = cerebro.medios.capacidades || {};
        const almC = cerebro.medios.almacenamiento || [];
        const capKeys = Array.from(new Set(Object.keys(capC).concat(Object.keys(cap))));
        const capD = capKeys.some((kk) => cap[kk as Capacidad] !== capC[kk as Capacidad]) || capKeys.length !== Object.keys(capC).length || Object.keys(cap).length !== 0;
        const almD = JSON.stringify(alm) !== JSON.stringify(almC);
        if (capD || almD) difiere.medios = { capacidades: cap, almacenamiento: alm };
      } else if (k === "sync") {
        const s = combinado.sync || ({} as AjustesObjetivo["sync"]);
        const sC = cerebro.sync;
        if (JSON.stringify(s) !== JSON.stringify(sC)) difiere.sync = s as AjustesObjetivo["sync"];
      } else if (k === "acceso") {
        if (JSON.stringify(combinado.acceso || []) !== JSON.stringify(cerebro.acceso || [])) difiere.acceso = combinado.acceso || [];
      } else {
        if (combinado[k] !== cerebro[k]) difiere[k] = combinado[k] as never;
      }
    };
    (["privacidad", "cifradoLocal", "medios", "sync", "acceso"] as ("privacidad" | "cifradoLocal" | "medios" | "sync" | "acceso")[]).forEach((kk) => comparar(kk));
    const resto = { ...a[campo] };
    if (Object.keys(difiere).length === 0) delete resto[objetivo.id];
    else resto[objetivo.id] = difiere;
    a[campo] = resto as Record<string, Partial<AjustesObjetivo>>;
  }
  nuevo.ajustes = a;
  return nuevo;
}

export function ajustesEfectivos(a: AjustesCerebro, objetivo: { tipo: "cerebro" } | { tipo: "memoria" | "carpeta"; id: string }): AjustesObjetivo {
  if (objetivo.tipo === "cerebro") return { ...a.cerebro };
  const campo = objetivo.tipo === "memoria" ? "memorias" : "carpetas";
  const parcial = a[campo][objetivo.id] || {};
  const base = a.cerebro;
  const c = { ...base, ...parcial };
  return {
    privacidad: (c.privacidad as AjustesObjetivo["privacidad"]) ?? base.privacidad,
    cifradoLocal: c.cifradoLocal !== undefined ? c.cifradoLocal : base.cifradoLocal,
    medios: { capacidades: { ...base.medios.capacidades, ...(c.medios?.capacidades || {}) }, almacenamiento: c.medios?.almacenamiento !== undefined ? c.medios!.almacenamiento : base.medios.almacenamiento },
    sync: c.sync ? { ...base.sync, ...c.sync, destinos: c.sync.destinos !== undefined ? c.sync.destinos : base.sync.destinos } : base.sync,
    acceso: c.acceso !== undefined ? c.acceso : base.acceso,
  };
}
