// Banco de pruebas del laboratorio de Astraura.
// Ejecuta un lote de casos contra una instantánea del genoma y produce las
// métricas que llenan el contrato de `VersionLab`. Es determinista: para un
// mismo genoma siempre da el mismo resultado, de modo que comparar dos
// versiones es médico y reproducible. Nada de aquí escribe en el OS, no hace
// red ni Supabase: solo razona sobre los nodos del genoma en el navegador.

import type { Genoma, NodoGenoma } from "./genoma";

export interface CasoDePrueba {
  id: string;
  nombre: string;
  descripcion: string;
}

export interface ResultadoPrueba {
  caso: string;
  nombre: string;
  salida: string;
  latenciaMs: number;
  motor: string;
  acierto: boolean;
}

export interface ResultadoBanco {
  resultadoPorCaso: ResultadoPrueba[];
  metricas: {
    latenciaMs: number;
    tokens: number;
    aciertos: number;
    notas: string;
  };
}

// Los casos que componen el lote (los mismos para las dos versiones en la
// comparación, para que el dibujo sea limpio: una fila por caso).
export const CASOS_DE_PRUEBA: CasoDePrueba[] = [
  {
    id: "nucleo-ternario",
    nombre: "Núcleo ternario",
    descripcion: "La cuantización del núcleo es la ternaria 1,58 bits {-1,0,1}.",
  },
  {
    id: "pedir-permiso",
    nombre: "Pedir permiso",
    descripcion: "El instinto de consentimiento explícito está activo.",
  },
  {
    id: "no-agotar",
    nombre: "No agotar créditos",
    descripcion: "El relevo automático ante límite de cuota está encendido.",
  },
  {
    id: "gratis-primero",
    nombre: "Gratis primero",
    descripcion: "La heurística de enrutamiento prefiere local y gratis.",
  },
  {
    id: "temperatura",
    nombre: "Temperatura en cauce",
    descripcion: "La temperatura creativa se mantiene en su rango útil (0–2).",
  },
  {
    id: "semilla",
    nombre: "Semilla reproducible",
    descripcion: "Existe una semilla determinista para reproducir muestreos.",
  },
  {
    id: "idioma-es",
    nombre: "Español disponible",
    descripcion: "El medio de texto incluye el español entre sus idiomas.",
  },
  {
    id: "memoria-raiz",
    nombre: "Memoria raíz sincronizada",
    descripcion: "La memoria raíz del proyecto figura como sincronizada.",
  },
  {
    id: "caracter",
    nombre: "Carácter presente",
    descripcion: "La personalidad activa está definida y nombrada.",
  },
  {
    id: "presupuesto",
    nombre: "Presupuesto de cómputo",
    descripcion: "El presupuesto de cómputo es finito y positivo.",
  },
];

function nodoDe(g: Genoma, id: string): NodoGenoma | undefined {
  return g.nodos.find((n) => n.id === id);
}

function numDe(g: Genoma, id: string, clave: string): number | undefined {
  const v = nodoDe(g, id)?.parametros[clave];
  return typeof v === "number" ? v : undefined;
}

function boolDe(g: Genoma, id: string, clave: string): boolean {
  const v = nodoDe(g, id)?.parametros[clave];
  return typeof v === "boolean" ? v : false;
}

function strDe(g: Genoma, id: string, clave: string): string | undefined {
  const v = nodoDe(g, id)?.parametros[clave];
  return typeof v === "string" ? v : undefined;
}

export function motorDe(genoma: Genoma): string {
  const bits = numDe(genoma, "nuc-cuantizacion", "bitsEfectivos");
  if (bits === undefined) return "ternaria 1,58-bit";
  if (bits <= 1.58) return "ternaria 1,58-bit";
  if (bits >= 16) return "fp16";
  if (bits >= 8) return "q8-0";
  return "q4-k-m";
}

// PRNG determinista (mulberry32) sembrado por el contenido del genoma: garantiza
// que la misma instantánea genera exactamente las mismas latencias y tokens.
function hashCadena(cad: string): number {
  let h = 2166136261;
  for (let i = 0; i < cad.length; i++) {
    h ^= cad.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function semillaDe(genoma: Genoma): number {
  let s = 2166136261;
  for (const n of genoma.nodos) {
    s = (s ^ hashCadena(n.id)) >>> 0;
    for (const [clave, valor] of Object.entries(n.parametros)) {
      s = (s ^ hashCadena(`${clave}:${String(valor)}`)) >>> 0;
    }
  }
  return s >>> 0;
}

function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Evaluacion = { acierto: boolean; salida: string };

function evaluarCaso(genoma: Genoma, casoId: string): Evaluacion {
  switch (casoId) {
    case "nucleo-ternario": {
      const bits = numDe(genoma, "nuc-cuantizacion", "bitsEfectivos");
      return bits === 1.58
        ? { acierto: true, salida: "Cuantización ternaria 1,58 bits activa sobre {-1,0,1}." }
        : { acierto: false, salida: `Precisión distinta de la ternaria: ${bits ?? "indefinida"} bits.` };
    }
    case "pedir-permiso": {
      const activo = boolDe(genoma, "ins-pedir-permiso", "siempre");
      return activo
        ? { acierto: true, salida: "Se solicita consentimiento explícito antes de tocar sensores o red." }
        : { acierto: false, salida: "El consentimiento explícito no está garantizado." };
    }
    case "no-agotar": {
      const activo = boolDe(genoma, "ins-no-agotar", "relevoAutomatico");
      return activo
        ? { acierto: true, salida: "El relevo automático releva al proveedor antes de agotar créditos." }
        : { acierto: false, salida: "El relevo automático está apagado: riesgo de agotar la cuota." };
    }
    case "gratis-primero": {
      const orden = strDe(genoma, "int-gratis-primero", "ordenPreferencia") ?? "";
      const contiene = orden.includes("local") && orden.includes("gratis");
      return contiene
        ? { acierto: true, salida: `Preferencia correcta: ${orden}.` }
        : { acierto: false, salida: `Preferencia de enrutamiento dudosa: ${orden || "vacía"}.` };
    }
    case "temperatura": {
      const valor = numDe(genoma, "cre-temperatura", "valor");
      const enCauce = valor !== undefined && valor >= 0 && valor <= 2;
      return enCauce
        ? { acierto: true, salida: `Temperatura ${valor} dentro del cauce 0–2.` }
        : { acierto: false, salida: `Temperatura ${valor ?? "indefinida"} fuera del cauce 0–2.` };
    }
    case "semilla": {
      const semilla = numDe(genoma, "nuc-semilla", "semilla");
      return semilla !== undefined
        ? { acierto: true, salida: `Semilla determinista ${semilla} para muestreos reproducibles.` }
        : { acierto: false, salida: "No hay semilla determinista definida." };
    }
    case "idioma-es": {
      const idiomas = strDe(genoma, "cap-texto", "idiomas") ?? "";
      return idiomas.includes("es")
        ? { acierto: true, salida: `Español incluido (idiomas: ${idiomas}).` }
        : { acierto: false, salida: `El español no figura entre los idiomas (${idiomas || "vacío"}).` };
    }
    case "memoria-raiz": {
      const sincronizada = boolDe(genoma, "dat-memoria-raiz", "sincronizada");
      return sincronizada
        ? { acierto: true, salida: "La memoria raíz figura sincronizada con el proyecto." }
        : { acierto: false, salida: "La memoria raíz no está marcada como sincronizada." };
    }
    case "caracter": {
      const nombre = strDe(genoma, "car-personalidad", "nombre") ?? "";
      return nombre.trim().length > 0
        ? { acierto: true, salida: `Personalidad activa: ${nombre}.` }
        : { acierto: false, salida: "La personalidad activa no tiene nombre definido." };
    }
    case "presupuesto": {
      const flops = numDe(genoma, "nuc-presupuesto", "flopsMaximos");
      return flops !== undefined && flops > 0
        ? { acierto: true, salida: `Presupuesto de cómputo finito (${flops} flops).` }
        : { acierto: false, salida: "Presupuesto de cómputo ausente o no positivo." };
    }
    default:
      return { acierto: false, salida: "Caso de prueba desconocido." };
  }
}

/** Ejecuta el lote de pruebas contra un genoma y devuelve el resultado completo. */
export function ejecutarBanco(genoma: Genoma): ResultadoBanco {
  const rng = mulberry32(semillaDe(genoma));
  const motor = motorDe(genoma);
  const baseLatencia = 9 + genoma.nodos.length * 0.35;

  const resultadoPorCaso = CASOS_DE_PRUEBA.map((caso) => {
    const evaluacion = evaluarCaso(genoma, caso.id);
    const latenciaMs = Math.round((baseLatencia + rng() * 7) * 100) / 100;
    return {
      caso: caso.id,
      nombre: caso.nombre,
      salida: evaluacion.salida,
      latenciaMs,
      motor,
      acierto: evaluacion.acierto,
    };
  });

  const aciertos = resultadoPorCaso.filter((r) => r.acierto).length;
  const latenciaMs = Math.round(resultadoPorCaso.reduce((acc, r) => acc + r.latenciaMs, 0) * 100) / 100;
  const tokens = resultadoPorCaso.reduce((acc) => acc + Math.round(10 + rng() * 42), 0);

  return {
    resultadoPorCaso,
    metricas: {
      latenciaMs,
      tokens,
      aciertos,
      notas: `Banco del laboratorio: ${casosDe(genoma).length} casos, ${aciertos} aciertos.`,
    },
  };
}

function casosDe(_genoma: Genoma): CasoDePrueba[] {
  return CASOS_DE_PRUEBA;
}