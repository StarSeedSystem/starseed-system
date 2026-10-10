// Registro de convertidores de formato para la Protomolécula.
// Módulo puro: sin red, sin disco, sin dependencias de Node ni del navegador.

export type ViaConversion = "js" | "wasm" | "servicio";

export interface ConversorDef {
  de: string;
  a: string;
  via: ViaConversion;
  costo: number;
  nombre: string;
  convertir?: (
    entrada: Uint8Array | string,
    opciones?: Record<string, number | string>,
  ) => Uint8Array | string;
}

export interface RutaConversion {
  pasos: ConversorDef[];
  costo: number;
}

export type ResultadoEjecucion =
  | { ok: true; salida: Uint8Array | string }
  | { ok: false; motivo: string };

const conversores: ConversorDef[] = [];

const MIME_CONOCIDOS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "audio/x-wav": "wav",
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "text/csv": "csv",
  "text/plain": "txt",
  "text/markdown": "md",
  "application/json": "json",
  "application/pdf": "pdf",
  "model/gltf-binary": "glb",
  "model/gltf+json": "gltf",
};

export function normalizarFormato(x: string): string {
  const crudo = x.trim().toLowerCase();
  if (crudo.length === 0) return crudo;
  if (MIME_CONOCIDOS[crudo]) return MIME_CONOCIDOS[crudo];
  if (crudo.includes("/")) {
    const subtipo = crudo.split("/").pop() ?? crudo;
    return subtipo.replace(/^x-/, "").replace(/\+.*$/, "");
  }
  return crudo.replace(/^\.+/, "");
}

export function registrarConversor(def: ConversorDef): void {
  const normalizado: ConversorDef = {
    ...def,
    de: normalizarFormato(def.de),
    a: normalizarFormato(def.a),
  };
  const duplicado = conversores.some(
    (c) =>
      c.de === normalizado.de &&
      c.a === normalizado.a &&
      c.nombre === normalizado.nombre,
  );
  if (!duplicado) conversores.push(normalizado);
}

export function limpiarConversores(): void {
  conversores.length = 0;
}

export function listarConversores(): ConversorDef[] {
  return [...conversores];
}

interface NodoCamino {
  formato: string;
  costo: number;
  pasos: ConversorDef[];
}

export function rutaDeConversion(de: string, a: string): RutaConversion | null {
  const origen = normalizarFormato(de);
  const destino = normalizarFormato(a);
  if (origen.length === 0 || destino.length === 0) return null;
  if (origen === destino) return { pasos: [], costo: 0 };

  const mejor = new Map<string, number>();
  const cola: NodoCamino[] = [{ formato: origen, costo: 0, pasos: [] }];
  mejor.set(origen, 0);

  while (cola.length > 0) {
    let indiceMin = 0;
    for (let i = 1; i < cola.length; i++) {
      const candidato = cola[i];
      const actual = cola[indiceMin];
      if (
        candidato.costo < actual.costo ||
        (candidato.costo === actual.costo &&
          candidato.pasos.length < actual.pasos.length)
      ) {
        indiceMin = i;
      }
    }
    const nodo = cola.splice(indiceMin, 1)[0];
    if (nodo.formato === destino) {
      return { pasos: nodo.pasos, costo: nodo.costo };
    }
    const costoConocido = mejor.get(nodo.formato);
    if (costoConocido !== undefined && nodo.costo > costoConocido) continue;

    for (const c of conversores) {
      if (c.de !== nodo.formato) continue;
      const nuevoCosto = nodo.costo + c.costo;
      const previo = mejor.get(c.a);
      if (previo !== undefined && previo <= nuevoCosto) continue;
      mejor.set(c.a, nuevoCosto);
      cola.push({ formato: c.a, costo: nuevoCosto, pasos: [...nodo.pasos, c] });
    }
  }
  return null;
}

export function ejecutarRuta(
  ruta: RutaConversion,
  entrada: Uint8Array | string,
  opciones?: Record<string, number | string>,
): ResultadoEjecucion {
  let actual: Uint8Array | string = entrada;
  for (const paso of ruta.pasos) {
    if (typeof paso.convertir !== "function") {
      return {
        ok: false,
        motivo: `El paso «${paso.nombre}» (${paso.de} → ${paso.a}, vía ${paso.via}) no está conectado todavía.`,
      };
    }
    try {
      actual = paso.convertir(actual, opciones);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        motivo: `El paso «${paso.nombre}» (${paso.de} → ${paso.a}) falló: ${mensaje}`,
      };
    }
  }
  return { ok: true, salida: actual };
}

export function explicarSinRuta(de: string, a: string): string {
  const origen = normalizarFormato(de);
  const destino = normalizarFormato(a);
  const alcanzables = new Set<string>();
  const visitados = new Set<string>([origen]);
  const pendientes = [origen];
  while (pendientes.length > 0) {
    const actual = pendientes.pop() as string;
    for (const c of conversores) {
      if (c.de !== actual || visitados.has(c.a)) continue;
      visitados.add(c.a);
      alcanzables.add(c.a);
      pendientes.push(c.a);
    }
  }
  if (alcanzables.size === 0) {
    return `No conozco ningún conversor desde ${origen}.`;
  }
  const lista = [...alcanzables].sort().join(", ");
  return `No hay conversor de ${origen} a ${destino}. Desde ${origen} sé llegar a: ${lista}.`;
}
