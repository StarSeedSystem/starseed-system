/**
 * Sugerencias de acomodamiento para almacenes de cerebros
 *
 * Propósito: proporcionar recomendaciones sobre cómo acomodar cada almacén
 * según su tipo, velocidad, salud y capacidad. Nunca aplica automáticamente;
 * el dueño decide.
 */

import type { TipoAlmacen, ModalidadAlmacen, MedidasAlmacen } from "./modelo";

export interface MedidasAlmacenParcial {
  tipo: TipoAlmacen;
  totalBytes: bigint;
  libreBytes: bigint;
  velocidadLecturaMbps: number;
  velocidadEscrituraMbps: number;
  salud: MedidasAlmacen["salud"];
  nombre?: string;
  numeroSerie?: string;
}

export interface VelocidadRecomendada {
  tipo: "muy-alta" | "alta" | "media" | "baja";
  minMBs: number;
  uso: string;
}

export interface SaludRecomendada {
  alerta: boolean;
  recomendacion: string;
  accion?: string;
}

export type TipoAlmacenRecomendado = "cerebro-activa" | "respaldo" | "secundario" | "neurona-nodo";

export interface ResultadoAcomodar {
  almacen: {
    tipo: TipoAlmacen;
    nombre?: string;
    totalBytes: bigint;
    velocidadLecturaMbps: number;
    velocidadEscrituraMbps: number;
    salud: MedidasAlmacen["salud"];
  };
  modalidad: ModalidadAlmacen;
  ubicacion: "activo" | "secundario" | "respaldo" | "neurona-nodo";
  nota: string;
  ideas: string[];
}

export type CategoriaAlmacen = "propietario" | "extraíble" | "red" | "comunidad";

export function sugerirModalidadAlmacen(medidas: MedidasAlmacenParcial): ModalidadAlmacen {
  const esExtraible = medidas.tipo === "extraible";
  const esDiscoInterno = medidas.tipo === "disco_interno";
  const esRed = medidas.tipo === "red" || medidas.tipo === "nube";

  if (esDiscoInterno && medidas.velocidadLecturaMbps >= 100) {
    return "cerebro-completo";
  }

  if (esExtraible) {
    return "parte";
  }

  if (esRed && medidas.salud !== "excelente") {
    return "neurona-nodo";
  }

  if (esRed || medidas.tipo === "nube") {
    return "respaldo-vivo";
  }

  return "parte";
}

export function tipoAlmacenRecomendado(para: "cerebro-activa" | "respaldo" | "respaldo-vivo" | "secundario"): TipoAlmacen {
  const mapa: Record<NonNullable<typeof para>, TipoAlmacen> = {
    "cerebro-activa": "disco_interno",
    "respaldo": "extraible",
    "respaldo-vivo": "red",
    "secundario": "disco_interno",
  };
  return mapa[para];
}

export function velocidadRecomendada(tipo: TipoAlmacen, subtipo?: string): VelocidadRecomendada {
  const NVMe = subtipo === "nvme";

  if (tipo === "disco_interno") {
    if (NVMe) {
      return { tipo: "muy-alta", minMBs: 500, uso: "cerebro activo, caché de compilación, acceso frecuente" };
    }
    return { tipo: "alta", minMBs: 200, uso: "cerebro activo, acceso frecuente" };
  }

  if (tipo === "red") {
    return { tipo: "media", minMBs: 50, uso: "respaldo vivo, acceso por red" };
  }

  if (tipo === "extraible") {
    return { tipo: "baja", minMBs: 10, uso: "respaldo, réplica, almacén portátil" };
  }

  return { tipo: "media", minMBs: 50, uso: "almacén de red o nube" };
}

export function medidasSaludRecomendadas(salud: MedidasAlmacen["salud"]): SaludRecomendada {
  if (salud === "critica") {
    return {
      alerta: true,
      recomendacion: "Salud crítica: sustituir el medio cuanto antes",
      accion: "respaldar y reemplazar",
    };
  }

  if (salud === "regular") {
    return {
      alerta: false,
      recomendacion: "Salud regular: monitorizar de cerca, posible degradación",
      accion: "revisiones frecuentes",
    };
  }

  if (salud === "excelente") {
    return {
      alerta: false,
      recomendacion: "Estado óptimo: sin inconvenientes",
      accion: "mantener",
    };
  }

  return {
    alerta: false,
    recomendacion: "Salud desconocida: verificar estado con SMART",
    accion: "comprobar",
  };
}

export function acomodarAlmacen(almacen: MedidasAlmacenParcial & { nombre?: string }): ResultadoAcomodar {
  const vel = velocidadRecomendada(almacen.tipo, "nvme" as any);
  const salud = medidasSaludRecomendadas(almacen.salud);

  let modalidad = sugerirModalidadAlmacen(almacen);
  let ubicacion: "activo" | "secundario" | "respaldo" | "neurona-nodo" = "secundario";

  const ideas: string[] = [];

  if (almacen.tipo === "extraible") {
    const esUSB2 = vel.minMBs < 40;
    if (esUSB2) {
      modalidad = "respaldo-vivo";
    } else {
      const totalGB = Number(almacen.totalBytes) / 1e9;
      if (totalGB >= 128) {
        modalidad = "cerebro-completo";
        ubicacion = "respaldo";
        ideas.push("réplica independiente: copia congelada en un momento");
      } else {
        modalidad = "parte";
      }
    }
  }

  if (salud.alerta) {
    ideas.push("ALERTA: " + salud.recomendacion);
  }

  if (modalidad === "cerebro-completo" && almacen.velocidadLecturaMbps >= 100) {
    ubicacion = "activo";
    ideas.push("cerebro activo: uso principal de memoria viva");
  }

  if (modalidad === "respaldo-vivo" && almacen.tipo === "red") {
    ideas.push("respaldo vivo: sincronización automática en tiempo real");
    ideas.push("versión por bloques con histórico");
  }

  if (almacen.tipo === "extraible" && vel.tipo !== "muy-alta") {
    ideas.push("réplica independiente: guarda archivos ya existentes");
  }

  if (almacen.tipo === "disco_interno") {
    ubicacion = "activo";
    ideas.push("SSD para cerebro activo: acceso rápido y siempre disponible");
  }

  const notaBase =
    almacen.tipo === "extraible" && vel.tipo === "baja"
      ? `USB ${vel.tipo === "baja" ? "lento (USB 2.0)" : "moderado"}: ideal para respaldos y réplicas`
      : `Almacén de ${almacen.tipo}: ${modalidad}`;

  return {
    almacen: {
      tipo: almacen.tipo,
      nombre: almacen.nombre,
      totalBytes: almacen.totalBytes,
      velocidadLecturaMbps: almacen.velocidadLecturaMbps,
      velocidadEscrituraMbps: almacen.velocidadEscrituraMbps,
      salud: almacen.salud,
    },
    modalidad,
    ubicacion,
    nota: notaBase,
    ideas,
  };
}

export interface TipoAlmacenInfo {
  categoria: CategoriaAlmacen;
  permiteRespaldo: boolean;
  uso: string;
}

export function tipoAlmacenComo(tipo: TipoAlmacen): TipoAlmacenInfo {
  const info: Record<TipoAlmacen, TipoAlmacenInfo> = {
    extraible: { categoria: "extraíble", permiteRespaldo: true, uso: "USB, tarjetas SD, discos externos" },
    disco_interno: { categoria: "propietario", permiteRespaldo: true, uso: "SSD/NVMe o HDD interno" },
    red: { categoria: "red", permiteRespaldo: true, uso: "NAS, servidor, red local" },
    nube: { categoria: "red", permiteRespaldo: true, uso: "Google Drive, S3, WebDAV" },
    neurona: { categoria: "propietario", permiteRespaldo: false, uso: "almacén por bandas en otra neurona" },
    nodo: { categoria: "comunidad", permiteRespaldo: true, uso: " nodo de la malla P2P" },
  };
  return info[tipo];
}