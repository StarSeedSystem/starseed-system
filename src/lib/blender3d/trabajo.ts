/**
 * Trabajo 3D puro TypeScript · BLD1025C
 * Vocabulario cerrado leído desde vocabulario.json.
 * Validador genérico: ningún switch por operación, todo por intérprete de especificaciones.
 * Sin node:, sin eval, sin new Function, sin red, sin disco.
 */

import vocabulario from "./vocabulario.json";

export const VERSION_VOCABULARIO = 1;

export type ParamEspec = {
  t: "num" | "enum" | "bool" | "vec" | "rgba" | "nombre" | "ref" | "txt" | "ruta" | "lista" | "obj";
  v?: readonly string[];
  min?: number;
  max?: number;
  ent?: boolean;
  n?: number;
  patron?: string;
  ext?: readonly string[];
  max?: number;
  opc?: boolean;
  def?: unknown;
};

export type Operacion = {
  op: string;
  params: Record<string, unknown>;
};

export type Salida = {
  tipo: string;
  params: Record<string, unknown>;
};

export type Trabajo3D = {
  v: 1;
  titulo: string;
  calidad: "borrador" | "normal" | "final";
  ambito: "personal" | "perfil" | "grupo" | "publica";
  origen:
    | "protomolecula"
    | "astraura"
    | "estudio"
    | "xr"
    | "avatares"
    | "orbe"
    | "api";
  quien: "persona" | "agente";
  escena: Operacion[];
  salidas: Salida[];
  limites?: {
    segundos?: number;
    memoriaMB?: number;
  };
};

function esNumeroFinito(n: unknown): n is number {
  return typeof n === "number" && isFinite(n);
}

function esEntero(n: number): boolean {
  return Number.isInteger(n);
}

function validarParametro(valor: unknown, espec: ParamEspec): { ok: boolean; motivo?: string } {
  if (valor === undefined || valor === null) {
    if (espec.opc) return { ok: true };
    return { ok: false, motivo: "campo obligatorio faltante" };
  }

  switch (espec.t) {
    case "num": {
      if (!esNumeroFinito(valor)) return { ok: false, motivo: "no es un número finito" };
      if (espec.ent === true && !esEntero(valor as number)) return { ok: false, motivo: "no es entero" };
      if (espec.min !== undefined && valor < espec.min) return { ok: false, motivo: `menor que ${espec.min}` };
      if (espec.max !== undefined && valor > espec.max) return { ok: false, motivo: `mayor que ${espec.max}` };
      return { ok: true };
    }

    case "enum": {
      const val = valor as string;
      if (!espec.v || !espec.v.includes(val)) {
        return { ok: false, motivo: `valor no admitido: ${val}` };
      }
      return { ok: true };
    }

    case "bool": {
      if (typeof valor !== "boolean") return { ok: false, motivo: "no es booleano" };
      return { ok: true };
    }

    case "vec": {
      if (!Array.isArray(valor)) return { ok: false, motivo: "no es array" };
      if (valor.length !== (espec.n ?? 3)) return { ok: false, motivo: `se esperan ${espec.n ?? 3} dimensiones` };
      for (let i = 0; i < valor.length; i++) {
        const v = valor[i];
        if (!esNumeroFinito(v)) return { ok: false, motivo: `dimension ${i} no es finite` };
        if (espec.min !== undefined && v < espec.min) return { ok: false, motivo: `dim ${i} menor que min` };
        if (espec.max !== undefined && v > espec.max) return { ok: false, motivo: `dim ${i} mayor que max` };
      }
      return { ok: true };
    }

    case "rgba": {
      if (!Array.isArray(valor) || valor.length !== 4) return { ok: false, motivo: "rgba debe tener 4 componentes" };
      for (let i = 0; i < 4; i++) {
        const v = valor[i];
        if (!esNumeroFinito(v)) return { ok: false, motivo: `componente ${i} no es finite` };
        if (v < 0 || v > 1) return { ok: false, motivo: `componente ${i} fuera de 0-1` };
      }
      return { ok: true };
    }

    case "nombre": {
      const val = valor as string;
      if (typeof val !== "string") return { ok: false, motivo: "no es string" };
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(val)) {
        return { ok: false, motivo: "formato de nombre inválido" };
      }
      return { ok: true };
    }

    case "ref": {
      const val = valor as string;
      if (typeof val !== "string") return { ok: false, motivo: "ref no es string" };
      return { ok: true };
    }

    case "txt": {
      const val = valor as string;
      if (typeof val !== "string") return { ok: false, motivo: "no es string" };
      const max = espec.max ?? 64;
      if (val.length > max) return { ok: false, motivo: `texto mayor a ${max} caracteres` };
      if (!/^[A-Za-z0-9 tildesñ.,:;!?¡¿'()+-]+$/.test(val)) {
        return { ok: false, motivo: "patrón de texto no válido" };
      }
      return { ok: true };
    }

    case "ruta": {
      const val = valor as string;
      if (typeof val !== "string") return { ok: false, motivo: "no es string" };
      if (val.startsWith("/")) return { ok: false, motivo: "ruta absoluta no permitida" };
      if (val.includes("..")) return { ok: false, motivo: "ruta con '..' no permitida" };
      if (val.startsWith(".")) return { ok: false, motivo: "ruta con './' inicial no permitida" };
      if (espec.ext && !espec.ext.includes(val.split(".").pop() ?? "")) {
        return { ok: false, motivo: `extensión no permitida` };
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(val)) {
        return { ok: false, motivo: "formato de ruta inválido" };
      }
      return { ok: true };
    }

    case "lista": {
      if (!Array.isArray(valor)) return { ok: false, motivo: "no es array" };
      const max = espec.max ?? Infinity;
      if (valor.length > max) return { ok: false, motivo: `lista mayor a ${max} elementos` };
      const itemEspec = espec.de;
      for (let i = 0; i < valor.length; i++) {
        const res = validarParametro(valor[i], itemEspec);
        if (!res.ok) return { ok: false, motivo: `elemento ${i}: ${res.motivo ?? ""}` };
      }
      return { ok: true };
    }

    case "obj": {
      if (typeof valor !== "object" || Array.isArray(valor) || valor === null) {
        return { ok: false, motivo: "no es objeto" };
      }
      const campos = espec.campos;
      for (const [clave, subEspec] of Object.entries(campos)) {
        if (!(clave in valor)) return { ok: false, motivo: `falta campo ${clave}` };
        const res = validarParametro((valor as Record<string, unknown>)[clave], subEspec);
        if (!res.ok) return { ok: false, motivo: `campo ${clave}: ${res.motivo ?? ""}` };
      }
      return { ok: true };
    }

    default:
      return { ok: false, motivo: `tipo de parámetro desconocido: ${espec.t}` };
  }
}

function hayOperacionProximamente(escena: Operacion[]): { rechazado: boolean; motivo: string } {
  for (const op of escena) {
    if (vocabulario.operaciones[op.op]?.estado === "proximamente") {
      return { rechazado: true, motivo: vocabulario.operaciones[op.op].motivo ?? "operación próximamente" };
    }
  }
  return { rechazado: false, motivo: "" };
}

function validarNombreUnico(titulo: string, escena: Operacion[], salidas: Salida[]): { ok: boolean; motivo?: string } {
  const nombres: string[] = [];
  for (const op of escena) {
    const p = op.params.nombre ?? "";
    if (p && nombres.includes(p)) return { ok: false, motivo: `nombre repetido: ${p}` };
    if (p) nombres.push(p);
  }
  for (const s of salidas) {
    const p = s.params.nombre ?? "";
    if (p && nombres.includes(p)) return { ok: false, motivo: `nombre repetido: ${p}` };
    if (p) nombres.push(p);
  }
  return { ok: true };
}

export function validarTrabajo(bruto: unknown): { ok: true; trabajo: Trabajo3D } | { ok: false; motivos: string[] } {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    return { ok: false, motivos: ["entrada no es un objeto"] };
  }

  const trabajo = bruto as Record<string, unknown>;
  const motivos: string[] = [];

  // v
  if (trabajo.v !== VERSION_VOCABULARIO) {
    motivos.push(`v ${trabajo.v} no es compatible, esperado ${VERSION_VOCABULARIO}`);
  }

  // titulo
  if (typeof trabajo.titulo !== "string") {
    motivos.push("título es obligatorio y debe ser string");
  } else if (trabajo.titulo.length > 80) {
    motivos.push("título mayor a 80 caracteres");
  }

  // calidad
  if (
    trabajo.calidad !== "borrador" &&
    trabajo.calidad !== "normal" &&
    trabajo.calidad !== "final"
  ) {
    motivos.push("calidad debe ser borrador|normal|final");
  }

  // ambito
  if (
    trabajo.ambito !== "personal" &&
    trabajo.ambito !== "perfil" &&
    trabajo.ambito !== "grupo" &&
    trabajo.ambito !== "publica"
  ) {
    motivos.push("ambito debe ser personal|perfil|grupo|publica");
  }

  // origen
  const origenesValidos = [
    "protomolecula", "astraura", "estudio", "xr", "avatares", "orbe", "api",
  ];
  if (!origenesValidos.includes(trabajo.origen as string)) {
    motivos.push("origen inválido");
  }

  // quien
  if (trabajo.quien !== "persona" && trabajo.quien !== "agente") {
    motivos.push("quien debe ser persona|agente");
  }

  // campos desconocidos al nivel superior
  const camposPermitidos = new Set(["v", "titulo", "calidad", "ambito", "origen", "quien", "escena", "salidas", "limites"]);
  for (const clave of Object.keys(trabajo)) {
    if (!camposPermitidos.has(clave)) {
      motivos.push(`campo desconocido: ${clave}`);
    }
  }

  // escena
  if (!Array.isArray(trabajo.escena)) {
    motivos.push("escena debe ser array");
  } else if (trabajo.escena.length > vocabulario.topes.operaciones) {
    motivos.push(`escena mayor a ${vocabulario.topes.operaciones} operaciones`);
  } else {
    // Validar cada operación contra el vocabulario
    for (const op of trabajo.escena) {
      // Verificar operación desconocida
      if (!vocabulario.operaciones[op.op]) {
        motivos.push(`operación desconocida: ${op.op}`);
        continue;
      }

      // Verificar operación "proximamente"
      const prox = hayOperacionProximamente(trabajo.escena);
      if (prox.rechazado) {
        motivos.push(prox.motivo);
        break;
      }

      // Validar parámetros
      const paramsEspec = vocabulario.operaciones[op.op]?.params;
      if (!paramsEspec) {
        motivos.push(`sin especificación de parámetros para ${op.op}`);
        continue;
      }

      for (const [clave, valor] of Object.entries(op.params)) {
        if (!(clave in paramsEspec)) {
          motivos.push(`campo ${clave} no esperado en operación ${op.op}`);
          continue;
        }
        const res = validarParametro(valor, paramsEspec[clave]);
        if (!res.ok) {
          motivos.push(res.motivo!);
        }
      }
    }

    // Validar nombres únicos
    const uniqueCheck = validarNombreUnico(
      trabajo.titulo,
      trabajo.escena,
      trabajo.salidas
    );
    if (!uniqueCheck.ok) {
      motivos.push(uniqueCheck.motivo!);
    }
  }

  // salidas
  if (!Array.isArray(trabajo.salidas)) {
    motivos.push("salidas debe ser array");
  } else if (trabajo.salidas.length < 1 || trabajo.salidas.length > 4) {
    motivos.push("salidas debe tener entre 1 y 4 elementos");
  } else {
    for (const salida of trabajo.salidas) {
      if (!vocabulario.salidas[salida.tipo]) {
        motivos.push(`tipo de salida desconocido: ${salida.tipo}`);
        continue;
      }
      const salidaEspec = vocabulario.salidas[salida.tipo]?.params;
      if (!salidaEspec) continue;
      for (const [clave, valor] of Object.entries(salida.params)) {
        if (!(clave in salidaEspec)) {
          motivos.push(`campo ${clave} no esperado en salida ${salida.tipo}`);
          continue;
        }
        const res = validarParametro(valor, salidaEspec[clave]);
        if (!res.ok) {
          motivos.push(res.motivo!);
        }
      }
    }
  }

  // limites
  if (trabajo.limites) {
    if (trabajo.limites.segundos !== undefined && !esNumeroFinito(trabajo.limites.segundos)) {
      motivos.push("limites.segundos no es finite");
    }
    if (trabajo.limites.memoriaMB !== undefined && !esNumeroFinito(trabajo.limites.memoriaMB)) {
      motivos.push("limites.memoriaMB no es finite");
    }
  }

  if (motivos.length > 0) {
    return { ok: false, motivos };
  }

  const trabajoValido: Trabajo3D = {
    v: VERSION_VOCABULARIO,
    titulo: trabajo.titulo,
    calidad: trabajo.calidad,
    ambito: trabajo.ambito,
    origen: trabajo.origen,
    quien: trabajo.quien,
    escena: trabajo.escena,
    salidas: trabajo.salidas,
    limites: trabajo.limitres,
  };

  return { ok: true, trabajo: trabajoValido };
}

export function estimarCoste(trabajo: Trabajo3D): { vertices: number; segundos: number } {
  let verticesTotal = 0;
  let pixelesTotales = 0;
  let muestasTotales = 1;
  let fotogramasTotales = 0;

  for (const op of trabajo.escena) {
    if (op.op === "primitiva") {
      const params = op.params;
      let primVertices = 0;
      switch (params.tipo) {
        case "cubo": primVertices = 8; break;
        case "esfera": primVertices = 32; break;
        case "icosfera": primVertices = 42; break;
        case "cilindro": primVertices = 24; break;
        case "cono": primVertices = 12; break;
        case "toro": primVertices = 36; break;
        case "plano": primVertices = 4; break;
        case "circulo": primVertices = 32; break;
        default: primVertices = 8;
      }
      const niveces = (params as any).segmentos ?? 1;
      const multiplicador = Math.pow(4, niveces);
      verticesTotal += primVertices * multiplicador;
    }
  }

  // Calcular píxeles de las salidas
  for (const salida of trabajo.salidas) {
    if (salida.tipo === "render_png" || salida.tipo === "render_exr" || salida.tipo === "render_mp4") {
      const w = salida.params.ancho ?? 256;
      const h = salida.params.alto ?? 256;
      pixelesTotales += w * h;
    }
  }

  fotogramasTotales = trabajo.escena.length > 0 ? trabajo.escena.length : 1;
  muestasTotales = vocabulario.topes.muestras;

  const CONSTANTE = 1000; // factor empírico: segundos ≈ píxeles × muestras × fotogramas / constante

  const segundos = Math.round(pixelesTotales * muestasTotales * fotogramasTotales / CONSTANTE);

  return { vertices: verticesTotal, segundos };
}

export function necesitaConfirmacion(
  trabajo: Trabajo3D,
  perfil: "ninguno" | "ligero" | "estandar" | "estudio"
): boolean {
  // true si ámbito grupo/publica
  if (trabajo.ambito === "grupo" || trabajo.ambito === "publica") {
    return true;
  }

  // true si hay importar
  const tieneImportar = trabajo.escena.some((op) => op.op === "importar");
  if (tieneImportar) {
    return true;
  }

  // true si calidad final
  if (trabajo.calidad === "final") {
    return true;
  }

  // true si el coste pasa los topes del perfil ligero
  const coste = estimarCoste(trabajo);
  const topesLigero = { vertices: 2000000, segundos: 120 };
  if (coste.vertices > topesLigero.vertices || coste.segundos > topesLigero.segundos) {
    return true;
  }

  return false;
}