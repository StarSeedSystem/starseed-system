// Importa traducciones de un paquete de idioma desde JSON plano, JSON anidado o CSV/TSV.
// Módulo puro: solo texto de entrada, sin red, sin disco y sin procesos.

export interface EntradaDescartada { motivo: string; linea?: number }
export interface ResultadoImportacion { entradas: Record<string, string>; descartadas: EntradaDescartada[] }

const CLAVES_PROHIBIDAS = new Set(["__proto__", "constructor", "prototype"]);
const CABECERAS = new Set(["key", "clave", "source"]);

const quitarBOM = (texto: string): string => (texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto);

const vacio = (motivo: string): ResultadoImportacion => ({ entradas: {}, descartadas: [{ motivo }] });

function tipoDe(valor: unknown): string {
  if (valor === null) return "nulo";
  if (Array.isArray(valor)) return "lista";
  const t = typeof valor;
  return t === "number" ? "número" : t === "boolean" ? "booleano" : t === "object" ? "objeto" : t;
}

const esObjetoRaiz = (valor: unknown): boolean =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

function parsearJson(texto: string): { ok: true; valor: unknown } | { ok: false; motivo: string } {
  try { return { ok: true, valor: JSON.parse(quitarBOM(texto)) as unknown }; }
  catch { return { ok: false, motivo: "El texto no es un JSON válido" }; }
}

export function desdeJsonPlano(texto: string): ResultadoImportacion {
  const parsed = parsearJson(texto);
  if (!parsed.ok) return vacio(parsed.motivo);
  if (!esObjetoRaiz(parsed.valor)) return vacio("El JSON no es un objeto de pares clave-valor");
  const resultado: ResultadoImportacion = { entradas: {}, descartadas: [] };
  for (const [clave, valor] of Object.entries(parsed.valor as Record<string, unknown>)) {
    if (CLAVES_PROHIBIDAS.has(clave)) resultado.descartadas.push({ motivo: `Clave prohibida: ${clave}` });
    else if (typeof valor === "string") resultado.entradas[clave] = valor;
    else resultado.descartadas.push({ motivo: `Valor no textual en "${clave}" (${tipoDe(valor)})` });
  }
  return resultado;
}

export function desdeJsonAnidado(texto: string): ResultadoImportacion {
  const parsed = parsearJson(texto);
  if (!parsed.ok) return vacio(parsed.motivo);
  if (!esObjetoRaiz(parsed.valor)) return vacio("El JSON no es un objeto de pares clave-valor");
  const resultado: ResultadoImportacion = { entradas: {}, descartadas: [] };
  const pila: Array<{ ruta: string; valor: unknown; nivel: number }> = [{ ruta: "", valor: parsed.valor, nivel: 0 }];
  while (pila.length > 0) {
    const nodo = pila.pop()!;
    if (typeof nodo.valor === "string") resultado.entradas[nodo.ruta] = nodo.valor;
    else if (typeof nodo.valor !== "object" || nodo.valor === null) {
      resultado.descartadas.push({ motivo: `Valor no textual en "${nodo.ruta}" (${tipoDe(nodo.valor)})` });
    } else if (nodo.nivel >= 8) {
      resultado.descartadas.push({ motivo: `Anidación demasiado profunda en "${nodo.ruta}"` });
    } else {
      for (const [clave, hijo] of Object.entries(nodo.valor as Record<string, unknown>)) {
        if (CLAVES_PROHIBIDAS.has(clave)) { resultado.descartadas.push({ motivo: `Clave prohibida: ${clave}` }); continue; }
        pila.push({ ruta: nodo.ruta === "" ? clave : `${nodo.ruta}.${clave}`, valor: hijo, nivel: nodo.nivel + 1 });
      }
    }
  }
  return resultado;
}

// Parte el texto en filas de campos: comillas dobles con comas y saltos dentro, «""» como comilla.
// Devuelve el número de línea (1-based) donde empieza cada fila, para las descartadas.
function partirCsv(texto: string, separador: string): { filas: string[][]; lineas: number[] } {
  const filas: string[][] = [];
  const lineas: number[] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  let arrancada = false;
  let linea = 1;
  let lineaFila = 1;
  const cerrarFila = (porSalto: boolean) => {
    fila.push(campo); filas.push(fila); lineas.push(lineaFila);
    fila = []; campo = ""; arrancada = false;
    if (porSalto) lineaFila = linea + 1;
  };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else comillas = false;
      } else campo += c;
    } else if (c === '"') { comillas = true; arrancada = true; }
    else if (c === separador) { fila.push(campo); campo = ""; arrancada = false; }
    else if (c === "\n" || (c === "\r" && texto[i + 1] !== "\n")) { cerrarFila(true); linea++; }
    else if (c !== "\r") { campo += c; arrancada = true; }
  }
  if (campo !== "" || arrancada || fila.length > 0) cerrarFila(false);
  return { filas, lineas };
}

export function desdeCsv(texto: string, separador: "," | "\t" | ";" = ","): ResultadoImportacion {
  if (texto.trim() === "") return vacio("El texto está vacío");
  const { filas, lineas } = partirCsv(quitarBOM(texto), separador);
  const resultado: ResultadoImportacion = { entradas: {}, descartadas: [] };
  const conCabecera = filas.length > 0 && filas[0].some((c) => CABECERAS.has(c.trim().toLowerCase()));
  for (let i = conCabecera ? 1 : 0; i < filas.length; i++) {
    const fila = filas[i];
    if (fila.every((c) => c.trim() === "")) continue;
    if (fila.length < 2) {
      resultado.descartadas.push({ motivo: "Fila sin las dos columnas (clave y traducción)", linea: lineas[i] });
      continue;
    }
    const clave = fila[0].trim();
    if (clave === "") resultado.descartadas.push({ motivo: "Clave vacía", linea: lineas[i] });
    else if (CLAVES_PROHIBIDAS.has(clave)) resultado.descartadas.push({ motivo: `Clave prohibida: ${clave}`, linea: lineas[i] });
    else resultado.entradas[clave] = fila[1];
  }
  return resultado;
}
