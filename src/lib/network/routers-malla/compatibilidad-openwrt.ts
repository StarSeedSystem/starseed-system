/**
 * Compatibilidad de routers con OpenWrt (primer punto de §8 del contrato de la
 * malla cristalina SiO₂): comprobar si un router concreto puede instalar
 * OpenWrt y, si puede, dar el enlace exacto a su imagen y los pasos honestos.
 * Módulo puro: sin red, sin disco, sin `node:*`. La tabla de hardware entra
 * por parámetro (la lee quien tenga acceso a ella).
 *
 * Quien flashea es SIEMPRE la persona; un fallo puede dejar el router
 * inservible. Por eso el aviso se devuelve en todos los estados.
 */

export interface ModeloRouter {
  fabricante: string;
  modelo: string;
  version?: string;
  /** true si es un router que regala o alquila el operador (suelen ir bloqueados). */
  deOperador?: boolean;
}

export interface EntradaTabla {
  fabricante: string;
  modelo: string;
  /** Versiones de hardware soportadas; si falta, se acepta cualquiera. */
  versiones?: string[];
  /** Target de OpenWrt, p. ej. "ramips/mt7621". */
  target: string;
  /** Perfil/id del selector, p. ej. "tplink_archer-c7-v5". */
  perfil: string;
  soportado: boolean;
  nota?: string;
}

export interface ResultadoCompatibilidad {
  estado: "soportado" | "no-soportado" | "bloqueado-operador" | "desconocido";
  enlace: string | null;
  pasos: string[];
  aviso: string;
}

export const AVISO_FLASHEO =
  "Flashear puede dejar el router inservible si la imagen no es la de tu modelo y versión " +
  "exactos; hazlo tú, con cable y sin cortar la luz";

const SELECTOR = "https://firmware-selector.openwrt.org/?";

const PASOS_FLASHEO = [
  "Haz una copia de seguridad de la configuración actual del router",
  "Descarga la imagen «factory» exacta de tu modelo y versión desde el enlace",
  "Sube la imagen desde el panel del router, conectado por cable (nunca por wifi)",
  "Espera a que termine y se reinicie; no lo apagues aunque tarde",
  "Entra a http://192.168.1.1 y pon una contraseña de administrador",
  "Vuelve a StarSeed y pulsa «Adoptar» en la neurona o el cerebro",
];

/** Minúsculas, sin espacios dobles y sin adornos: «router», «wifi» y guiones finales. */
export function normalizarModelo(texto: string): string {
  return texto
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/-/g, " ")
    .split(" ")
    .filter((palabra) => palabra !== "router" && palabra !== "wifi")
    .join(" ")
    .trim();
}

/** Busca la entrada de la tabla que casa con fabricante y modelo normalizados. */
function buscarEntrada(m: ModeloRouter, tabla: EntradaTabla[]): EntradaTabla | null {
  const fabricante = normalizarModelo(m.fabricante);
  const modelo = normalizarModelo(m.modelo);
  for (const entrada of tabla) {
    if (normalizarModelo(entrada.fabricante) !== fabricante) continue;
    if (normalizarModelo(entrada.modelo) !== modelo) continue;
    if (entrada.versiones && m.version) {
      const version = normalizarModelo(m.version);
      const casa = entrada.versiones.some((v) => normalizarModelo(v) === version);
      if (!casa) continue;
    }
    return entrada;
  }
  return null;
}

/** Construye la URL del selector de firmware de OpenWrt, con parámetros codificados. */
function enlaceSelector(target: string, perfil: string): string {
  const params = new URLSearchParams({ target, id: perfil });
  return `${SELECTOR}${params.toString()}`;
}

/** Comprueba si un modelo concreto puede instalar OpenWrt y devuelve pasos y avisos honestos. */
export function compatibilidad(m: ModeloRouter, tabla: EntradaTabla[]): ResultadoCompatibilidad {
  const entrada = buscarEntrada(m, tabla);

  if (!entrada && m.deOperador === true) {
    return {
      estado: "bloqueado-operador",
      enlace: null,
      pasos: [
        "Los routers del operador suelen ir bloqueados y no dejan instalar OpenWrt",
        "Alternativa: pon detrás un router compatible con OpenWrt en modo puente " +
          "(el del operador da internet, el nuevo hace de nodo de la malla)",
      ],
      aviso: AVISO_FLASHEO,
    };
  }

  if (!entrada) {
    return {
      estado: "desconocido",
      enlace: null,
      pasos: [
        "No consta en la tabla de hardware: confirma el modelo exacto y su versión " +
          "(viene en la pegatina de debajo del router)",
        "Busca el modelo en la tabla de hardware de OpenWrt antes de descargar nada",
      ],
      aviso: AVISO_FLASHEO,
    };
  }

  if (!entrada.soportado) {
    return {
      estado: "no-soportado",
      enlace: null,
      pasos: [
        "Este modelo aparece en la tabla de OpenWrt pero sin soporte para tu versión o hardware",
        "Alternativa: usa un router compatible en su sitio (los hay pequeños y baratos)",
      ],
      aviso: AVISO_FLASHEO,
    };
  }

  const pasos = [...PASOS_FLASHEO];
  if (entrada.nota) pasos.push(`Aviso de la tabla: ${entrada.nota}`);
  return {
    estado: "soportado",
    enlace: enlaceSelector(entrada.target, entrada.perfil),
    pasos,
    aviso: AVISO_FLASHEO,
  };
}
