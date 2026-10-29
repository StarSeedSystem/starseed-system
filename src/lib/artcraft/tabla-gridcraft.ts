/**
 * GridCraft ↔ tabla viva (contrato: `architecture/artcraft-y-rare.md` §4.2).
 * Solo cálculos y conversión. Módulo PURO (sin `node:*`, sin React, sin red).
 */
import { csvDesdeTabla, MAX_BYTES_IMPORTAR } from "../vivo/tabla/csv";
import { columnasVisibles, filasVisibles, LIMITES, type Tabla } from "../vivo/tabla/modelo";
import { crearCalculadora, textoCalculado } from "../vivo/tabla/formulas";
import { textoDeCelda } from "../vivo/tabla/csv";

export function csvParaGridcraft(t: Tabla): string {
  return csvDesdeTabla(t, { separador: "," });
}

function columnaLetra(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const r = ((x - 1) % 26) + 1;
    s = String.fromCharCode(64 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

export function rangoA1(filas: number, columnas: number): string {
  if (filas <= 0 || columnas <= 0) return "A1";
  const letra = columnaLetra(columnas);
  return `${letra}${filas}`;
}

function escaparCampoCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    return String(v);
  }
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function matrizACsv(filas: unknown[][]): string {
  if (!filas.length) return "";
  const acotadas = filas.slice(0, LIMITES.filas).map((f) => f.slice(0, LIMITES.columnas));
  let total = 0;
  const lineas: string[] = [];
  for (const f of acotadas) {
    const campos = f.map(escaparCampoCsv);
    const linea = campos.join(",");
    const bytes = Buffer.byteLength(linea + "\r\n", "utf8");
    if (total + bytes > MAX_BYTES_IMPORTAR) {
      // lo demás se descarta con aviso (no devolvemos aviso aquí; el llamante decide)
      break;
    }
    total += bytes;
    lineas.push(linea);
  }
  if (lineas.length === 0) return "";
  return lineas.join("\r\n") + "\r\n";
}

export interface PlanGridcraftGrafica {
  tipo: string;
  titulo?: string;
}

export interface PlanGridcraftOpciones {
  archivo: string;
  encabezadoNegrita?: boolean;
  tabla?: boolean;
  grafica?: PlanGridcraftGrafica;
}

export interface LlamadaGridcraft {
  herramienta: string;
  parametros: Record<string, unknown>;
}

export interface PlanGridcraft {
  llamadas: LlamadaGridcraft[];
  avisos: string[];
}

function sanearNombreArchivo(archivo: string): string {
  const base = archivo.trim();
  // solo [a-z0-9-_]
  const limpio = base.replace(/[^a-z0-9\-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return limpio || "tabla";
}

export function planGridcraftDesdeTabla(
  t: Tabla,
  o: PlanGridcraftOpciones,
): PlanGridcraft {
  const avisos: string[] = [];
  const llamadas: LlamadaGridcraft[] = [];

  const archivoSan = sanearNombreArchivo(o.archivo);
  const nombre = archivoSan.endsWith(".xlsx") ? archivoSan.slice(0, -5) : archivoSan;

  const cols = columnasVisibles(t).slice(0, LIMITES.columnas);
  const filas = filasVisibles(t).slice(0, LIMITES.filas);
  const calc = crearCalculadora(t);

  // calcular matriz y avisar sobre calculados/formulas
  const matriz: unknown[][] = [];
  // encabezados
  matriz.push(cols.map((c) => c.nombre.v));
  for (const f of filas) {
    const filaArr: unknown[] = [];
    for (const c of cols) {
      if (c.tipo.v === "calculado") {
        avisos.push(`La columna «${c.nombre.v}» es calculada y se exporta como su valor.`);
        const v = calc.calculada(f.id, c.id);
        if (v && v.ok) filaArr.push(v.n);
        else filaArr.push(v ? textoCalculado(v) : "");
        continue;
      }
      // detectar si hay fórmula guardada (en modelo formula vive en columna) - según contrato: "las columnas calculado y las celdas de fórmula se exportan como su valor y se avisa"
      if ((c as any).formula?.v) {
        avisos.push(`Se ha exportado como valor una celda con fórmula.`);
      }
      const val = textoDeCelda(t, c, f.id, calc);
      // textoDeCelda ya convierte todo a string; queremos valores tal como pide matriz para write_range
      // pero contrato dice "write_range { range: \"A1\", values } (matriz 2-D con los encabezados)"
      filaArr.push(val === "" ? "" : val);
    }
    matriz.push(filaArr);
  }

  // Si hay columnas calculadas en general, ya avisamos arriba por cada celda/columna; contrato también dice "las columnas `calculado`..." se avisan
  // Añadir aviso general si alguna columna es calculado
  for (const c of cols) {
    if (c.tipo.v === "calculado") {
      // ya añadido, pero asegurar que aparece al menos una vez si no se añadió? el requisito dice "columna calculada avisa" - añadimos por cada aparición; también podemos añadir uno por columna distinta si prefieres, pero con la lógica de arriba ya lo hace
    }
  }

  llamadas.push({ herramienta: "new_workbook", parametros: {} });
  const rango = "A1";
  // pasar matriz tal cual; los valores son string/number/boolean|null como dice contrato
  const valoresMatriz = matriz.map((fila) => fila.map((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v;
    // intentar convertir números si viene como string numérico? textoDeCelda para numero ya devuelve string formateado con decimal según contexto; pero contrato dice valores string|number|boolean|null
    // mantener como string para coherencia con export desde textoDeCelda
    return String(v);
  }));
  llamadas.push({ herramienta: "write_range", parametros: { range: rango, values: valoresMatriz } });
  if (o.encabezadoNegrita !== false) {
    const filasTot = valoresMatriz.length;
    const colsTot = valoresMatriz[0]?.length ?? 0;
    const rangoEnc = `A1:${rangoA1(filasTot, colsTot)}`.replace(/1$/, "1"); // encabezados en fila 1
    // más preciso: rango hasta primera fila
    const letraFin = columnaLetra(colsTot);
    llamadas.push({ herramienta: "format_range", parametros: { range: `A1:${letraFin}1`, bold: true } });
  }
  if (o.tabla) {
    const filasTot = valoresMatriz.length;
    const colsTot = valoresMatriz[0]?.length ?? 0;
    const letraFin = columnaLetra(colsTot);
    llamadas.push({ herramienta: "create_table", parametros: { range: `A1:${letraFin}${filasTot}`, header: true } });
  }
  if (o.grafica) {
    const filasTot = valoresMatriz.length;
    const colsTot = valoresMatriz[0]?.length ?? 0;
    const letraFin = columnaLetra(colsTot);
    llamadas.push({ herramienta: "insert_chart", parametros: { range: `A1:${letraFin}${filasTot}`, type: o.grafica.tipo, title: o.grafica.titulo } });
  }
  llamadas.push({ herramienta: "save_workbook", parametros: { path: `salida/${nombre}.xlsx` } });
  return { llamadas, avisos };
}
