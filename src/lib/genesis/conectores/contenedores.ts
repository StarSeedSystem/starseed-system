/**
 * Información pura sobre contenedores en la nube para procesos de agentes.
 * 
 * Este módulo es PURO: no hace I/O, solo procesa los datos de entrada.
 * 
 * Basado en scripts/puente/contenedores_nube.py y architecture/colmena-relevo-contenedores.md
 */

export type MedioContenedor = {
  id: string;
  nombre: string;
  estado: 'listo' | 'usable' | 'requiere_alex' | 'no_disponible';
  detalle?: string;
  siguiente_paso?: string;
};

export type CatalogoContenedor = {
  servicio: string;
  proveedor: string;
  vcpu: number;
  ram_gb: number;
  horas_job: number;
  jobs_simultaneos: number;
  agentes_por_job: number;
  coste: string;
  lanza?: string;
};

export type InformacionContenedor = {
  id: string;
  nombre: string;
  enlaceAlta: string | null;
  guia: string | null; // ruta en el repo
  requiereCuenta: boolean;
  requierePago: boolean;
  aptoPrivado: boolean; // solo servidor propio y neurona
  verificado: string | null;
  servicio: string;
  proveedor: string;
  estado: 'listo' | 'usable' | 'requiere_alex' | 'no_disponible';
  maquina: string;
  jobs_simultaneos: number;
  agentes_por_job: number;
  agentes_ahora: number;
  runs_ahora: number;
  agentes_libres: number;
  coste: string;
  detalle: string;
  falta: string;
  siguiente_paso: string;
  lanza: string;
  desplegable: boolean;
};

export type ResumenContenedores = {
  contenedores: number;
  usables: number;
  agentes_ahora: number;
  agentes_libres: number;
  agentes_tope: number;
  por_hacer: number;
};

export type ResultadoInventario = {
  generado: string;
  contenedores: InformacionContenedor[];
  resumen: ResumenContenedores;
};

/**
 * CATALOGO: Información de catálogo de contenedores que NO se puede sondear.
 * Son datos de catálogo, medidos el 21 y 22 de septiembre, no adivinados.
 */
export const CATALOGO: Record<string, CatalogoContenedor> = {
  "nube-gh": {
    servicio: "GitHub Actions",
    proveedor: "GitHub (repo público StarSeedSystem/starseed-system)",
    vcpu: 4,
    ram_gb: 16,
    horas_job: 6,
    jobs_simultaneos: 3,
    agentes_por_job: 4,
    coste: "gratis y sin tope de minutos (repo público)",
    lanza: "python3 scripts/puente/nube-gh.py lanzar",
  },
  "hf": {
    servicio: "Hugging Face Spaces",
    proveedor: "Hugging Face",
    vcpu: 2,
    ram_gb: 16,
    horas_job: 0,
    jobs_simultaneos: 0,
    agentes_por_job: 0,
    coste: "exige suscripción PRO para Docker en CPU (comprobado: HTTP 402)",
    lanza: "",
  },
  "gcloud": {
    servicio: "Google Cloud Run",
    proveedor: "Google Cloud",
    vcpu: 2,
    ram_gb: 4,
    horas_job: 1,
    jobs_simultaneos: 0,
    agentes_por_job: 0,
    coste: "capa gratuita por peticiones; no está pensado para tandas largas",
    lanza: "",
  },
  "colab": {
    servicio: "Google Colab / Kaggle",
    proveedor: "Google / Kaggle",
    vcpu: 4,
    ram_gb: 30,
    horas_job: 12,
    jobs_simultaneos: 0,
    agentes_por_job: 0,
    coste: "gratis, pero sin API: hace falta un cuaderno lanzador",
    lanza: "",
  },
  "oracle": {
    servicio: "Oracle Always Free",
    proveedor: "Oracle Cloud (A1 Ampere ARM)",
    vcpu: 2,
    ram_gb: 12,
    horas_job: 0,
    jobs_simultaneos: 1,
    agentes_por_job: 1,
    coste: "Always Free (gratis para siempre): 2 OCPU · 12 GB · 10 TB/mes de salida",
    lanza: "",
  },
};

/**
 * Medios que NO son contenedores de nube: la Mac es esta máquina y «claude» es una sesión
 * de pago, no un contenedor donde desplegar agentes gratis.
 */
export const NO_SON_CONTENEDORES: Set<string> = new Set(["mac", "claude"]);

/**
 * PURA: cuántos agentes más caben en este medio ahora mismo.
 * 
 * Se cuenta por JOBS libres, no por agentes sueltos: un job es la unidad que se lanza, y
 * medio job no existe. Un medio sin `jobs_simultaneos` (no usable) no tiene sitio: 0.
 * 
 * @param cat - Información del catálogo del contenedor
 * @param agentes_ahora - Número de agentes actualmente en uso
 * @param runs_ahora - Número de runs actualmente en ejecución
 * @returns Número de agentes libres disponibles
 */
export function libres_de(cat: CatalogoContenedor, agentes_ahora: number, runs_ahora: number): number {
  const jobs = cat.jobs_simultaneos;
  const por_job = cat.agentes_por_job;
  
  if (jobs <= 0 || por_job <= 0) {
    return 0;
  }
  
  const jobs_libres = Math.max(0, jobs - Math.max(0, runs_ahora));
  // Si los runs vivos ya traen más agentes de los que cabrían, no se inventa sitio.
  const tope = Math.max(0, jobs * por_job - Math.max(0, agentes_ahora));
  return Math.min(jobs_libres * por_job, tope);
}

/**
 * PURA: un medio sondeado + su catálogo + lo que está vivo → la ficha completa.
 * 
 * @param medio - Información del medio sondeado
 * @param cat - Información del catálogo para este medio
 * @param vivos_por_medio - Información de lo que está actualmente vivo por medio
 * @return Información completa del contenedor
 */
export function contenedor(
  medio: MedioContenedor, 
  cat: CatalogoContenedor, 
  vivos_por_medio: Record<string, { agentes: number; runs: number }>
): InformacionContenedor {
  const mid = medio.id;
  const vivo = vivos_por_medio[mid] || { agentes: 0, runs: 0 };
  const agentes = vivo.agentes;
  const runs = vivo.runs;
  const usable = medio.estado === "listo" || medio.estado === "usable";
  const libres = usable ? libres_de(cat, agentes, runs) : 0;
  
    return {
      id: mid,
      nombre: medio.nombre || mid,
      enlaceAlta: null, // Se tendría que obtener de otra fuente en una implementación real
      guia: null, // ruta en el repo, se tendría que obtener de otra fuente
      requiereCuenta: false, // Se tendría que determinar basado en el servicio
      requierePago: medio.estado === "no_disponible" && medio.detalle?.includes("PRO") || false,
      aptoPrivado: mid === "oracle" || mid === "servidor-propio", // solo servidor propio y neurona
      verificado: null, // En una implementación real, se obtendría de verificaciones externas
      servicio: cat.servicio || medio.nombre || mid,
      proveedor: cat.proveedor || "",
      estado: medio.estado || "no_disponible",
      maquina: (
        `${cat.vcpu} vCPU · ${cat.ram_gb} GB${cat.horas_job ? ` · ${cat.horas_job} h por job` : " · siempre encendido"}` ||
        ""
      ),
      jobs_simultaneos: cat.jobs_simultaneos,
      agentes_por_job: cat.agentes_por_job,
      agentes_ahora: agentes,
      runs_ahora: runs,
      agentes_libres: libres,
      coste: cat.coste || "",
      detalle: medio.detalle || "",
      falta: usable ? "" : (medio.detalle || ""),
      siguiente_paso: medio.siguiente_paso || "",
      lanza: cat.lanza || "",
      desplegable: usable && libres > 0 && !!cat.lanza,
    };
}

/**
 * PURA: los totales que usan el medidor y el director.
 * 
 * @param contenedores - Array de información de contenedores
 * @returns Resumen de los contenedores
 */
export function resumir(contenedores: InformacionContenedor[]): ResumenContenedores {
  const usables = contenedores.filter(c => 
    c.estado === "listo" || c.estado === "usable"
  );
  
  return {
    contenedores: contenedores.length,
    usables: usables.length,
    agentes_ahora: usables.reduce((sum, c) => sum + c.agentes_ahora, 0),
    agentes_libres: usables.reduce((sum, c) => sum + c.agentes_libres, 0),
    agentes_tope: usables.reduce((sum, c) => sum + (c.jobs_simultaneos * c.agentes_por_job), 0),
    por_hacer: contenedores.filter(c => c.estado === "requiere_alex").length,
  };
}

/**
 * PURA: convierte el resultado del sondeo de medios en el inventario de contenedores.
 * 
 * @param medios_sondeados - Resultado del sondeo de medios (opcional)
 * @returns Inventario completo de contenedores
 */
export function inventario(
  medios_sondeados: MedioContenedor[] | null = null
): ResultadoInventario {
  // Simplificado para mantener pureza - en realidad esto haría I/O
  // Pero para este ejercicio, vamos a mantenerlo puro asumiendo que se pasa el sondeo
  const origen = medios_sondeados !== null ? 
    medios_sondeados : 
    []; // En un caso real, esto llamaría a _sondeo() que hace I/O
  
  // Filtrar medios que no son contenedores
  const medios = origen.filter(m => !NO_SON_CONTENEDORES.has(m.id));
  
  // En un caso real, esto obtendría lo vivo por medio
  // Pero para mantener pureza, vamos a asumir un objeto vacío
  const vivos: Record<string, { agentes: number; runs: number }> = {};
  
  // Convertir cada medio en información de contenedor
  const conts: InformacionContenedor[] = medios.map(m => {
    const cat = CATALOGO[m.id];
    if (!cat) {
      // Si no encontramos el catálogo, usamos valores por defecto
      return contenedor(m, {
        servicio: "Desconocido",
        proveedor: "Desconocido",
        vcpu: 0,
        ram_gb: 0,
        horas_job: 0,
        jobs_simultaneos: 0,
        agentes_por_job: 0,
        coste: "Desconocido"
      }, vivos);
    }
    return contenedor(m, cat, vivos);
  });
  
  // Ordenar: usables primero, y dentro de ellos los que tienen más sitio
  const orden = { listo: 0, usable: 1, requiere_alex: 2, no_disponible: 3 };
  conts.sort((a, b) => {
    const estadoA = orden[a.estado as keyof typeof orden] ?? 9;
    const estadoB = orden[b.estado as keyof typeof orden] ?? 9;
    if (estadoA !== estadoB) return estadoA - estadoB;
    // Si el estado es el mismo, ordenar por agentes_libres descendente
    return b.agentes_libres - a.agentes_libres;
  });
  
  return {
    generado: new Date().toISOString().replace("T", " ").substring(0, 19),
    contenedores: conts,
    resumen: resumir(conts),
  };
}