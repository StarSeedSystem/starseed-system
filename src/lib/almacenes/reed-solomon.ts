/**
 * Reed-Solomon erasure coding over GF(2^8)
 *
 * Implementación propia en TypeScript sin dependencias externas.
 * Polinomio primitivo: 0x11d (x^8 + x^4 + x^3 + x^2 + 1)
 * Codificación sistemática: los primeros k shards son los datos originales.
 */

export class ReedSolomonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReedSolomonError";
  }
}

/** Tabla de exponenciación: exp[e] = alpha^e */
const EXP_TABLE = new Uint8Array(512);
/** Tabla de logaritmo: log[v] = e donde alpha^e = v (solo para v != 0) */
const LOG_TABLE = new Uint16Array(256);

/** Inicializa las tablas de GF(2^8) con polinomio primitivo 0x11d */
function initGf256Tables(): void {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  // Extender tabla de exp para acceso directo sin módulo
  for (let i = 255; i < 512; i++) {
    EXP_TABLE[i] = EXP_TABLE[i - 255];
  }
  EXP_TABLE[255] = 1; // alpha^255 = 1
}

initGf256Tables();

/**
 * Suma en GF(2^8) = XOR
 */
export function gf256Add(a: number, b: number): number {
  return a ^ b;
}

/**
 * Multiplicación en GF(2^8) usando tablas de logaritmo
 */
export function gf256Mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

/**
 * División en GF(2^8): a / b = a * b^-1
 */
export function gf256Div(a: number, b: number): number {
  if (b === 0) {
    throw new ReedSolomonError("División por cero en GF(256)");
  }
  if (a === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] - LOG_TABLE[b] + 255];
}

/**
 * Potencia en GF(2^8): a^e
 */
export function gf256Pow(a: number, e: number): number {
  if (e === 0) return 1;
  if (a === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[a] * e) % 255];
}

/**
 * Inverso multiplicativo en GF(2^8): a^-1
 */
export function gf256Inv(a: number): number {
  if (a === 0) {
    throw new ReedSolomonError("Inverso de cero en GF(256)");
  }
  return EXP_TABLE[255 - LOG_TABLE[a]];
}

/**
 * Tabla de exponenciación (para acceso directo)
 */
export function gf256Exp(e: number): number {
  return EXP_TABLE[e % 255];
}

/**
 * Tabla de logaritmo (para acceso directo)
 */
export function gf256Log(v: number): number {
  if (v === 0) {
    throw new ReedSolomonError("Logaritmo de cero en GF(256)");
  }
  return LOG_TABLE[v];
}

/**
 * Genera matriz de Vandermonde k x n para evaluación en puntos 1, 2, ..., n
 * M[i][j] = (j+1)^i en GF(256)
 */
export function generateVandermondeMatrix(k: number, n: number): number[][] {
  if (k <= 0 || n <= 0) {
    throw new ReedSolomonError("k y n deben ser positivos");
  }
  if (k > n) {
    throw new ReedSolomonError("k no puede ser mayor que n");
  }
  if (n > 255) {
    throw new ReedSolomonError("n no puede exceder 255 (elementos no-cero máximos en GF(256))");
  }

  const matrix: number[][] = [];
  for (let i = 0; i < k; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      const x = j + 1; // Puntos de evaluación: 1, 2, 3, ..., n
      row.push(gf256Pow(x, i));
    }
    matrix.push(row);
  }
  return matrix;
}

/**
 * Multiplica matriz por vector columna en GF(256): matrix (rows x cols) * vector (cols) = result (rows)
 */
export function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  const rows = matrix.length;
  const cols = matrix[0].length;
  if (vector.length !== cols) {
    throw new ReedSolomonError("Dimensiones incompatibles: matriz cols != vector length");
  }

  const result: number[] = [];
  for (let i = 0; i < rows; i++) {
    let sum = 0;
    for (let j = 0; j < cols; j++) {
      sum = gf256Add(sum, gf256Mul(matrix[i][j], vector[j]));
    }
    result.push(sum);
  }
  return result;
}

/**
 * Multiplica vector fila por matriz en GF(256): vector (cols) * matrix (rows x cols) = result (rows)
 * Equivalente a matrix^T * vector^T
 */
export function multiplyVectorMatrix(vector: number[], matrix: number[][]): number[] {
  const rows = matrix.length;
  const cols = matrix[0].length;
  if (vector.length !== rows) {
    throw new ReedSolomonError("Dimensiones incompatibles: vector length != matrix rows");
  }

  const result: number[] = [];
  for (let j = 0; j < cols; j++) {
    let sum = 0;
    for (let i = 0; i < rows; i++) {
      sum = gf256Add(sum, gf256Mul(vector[i], matrix[i][j]));
    }
    result.push(sum);
  }
  return result;
}

/**
 * Invierte matriz cuadrada en GF(256) usando eliminación gaussiana
 */
export function invertMatrix(matrix: number[][]): number[][] {
  const n = matrix.length;
  if (n === 0 || matrix[0].length !== n) {
    throw new ReedSolomonError("La matriz debe ser cuadrada");
  }

  // Aumentar con identidad
  const aug: number[][] = [];
  for (let i = 0; i < n; i++) {
    aug.push([...matrix[i], ...(i === 0 ? new Array(n).fill(0).map((_, j) => (j === 0 ? 1 : 0)) : new Array(n).fill(0).map((_, j) => (j === i ? 1 : 0)))]);
    // Actually, let's build it properly
  }

  // Rebuild properly
  for (let i = 0; i < n; i++) {
    aug[i] = [...matrix[i]];
    for (let j = 0; j < n; j++) {
      aug[i].push(i === j ? 1 : 0);
    }
  }

  // Eliminación gaussiana
  for (let col = 0; col < n; col++) {
    // Buscar pivote
    let pivotRow = -1;
    for (let row = col; row < n; row++) {
      if (aug[row][col] !== 0) {
        pivotRow = row;
        break;
      }
    }
    if (pivotRow === -1) {
      throw new ReedSolomonError("Matriz singular (no invertible)");
    }

    // Intercambiar filas si es necesario
    if (pivotRow !== col) {
      [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];
    }

    // Normalizar fila pivote
    const pivot = aug[col][col];
    const pivotInv = gf256Inv(pivot);
    for (let j = 0; j < 2 * n; j++) {
      aug[col][j] = gf256Mul(aug[col][j], pivotInv);
    }

    // Eliminar otras filas
    for (let row = 0; row < n; row++) {
      if (row !== col && aug[row][col] !== 0) {
        const factor = aug[row][col];
        for (let j = 0; j < 2 * n; j++) {
          aug[row][j] = gf256Add(aug[row][j], gf256Mul(factor, aug[col][j]));
        }
      }
    }
  }

  // Extraer inversa
  const inverse: number[][] = [];
  for (let i = 0; i < n; i++) {
    inverse.push(aug[i].slice(n));
  }
  return inverse;
}

/**
 * Codifica datos en n shards usando Reed-Solomon sistemático (k de n)
 * @param data Datos a codificar (longitud debe ser múltiplo de k)
 * @param k Número de shards de datos (mínimo para reconstruir)
 * @param n Número total de shards (k datos + n-k paridad)
 * @returns Array de n Uint8Array (shards)
 *
 * Layout: datos se dividen en k chunks contiguos de tamaño shardSize = data.length / k.
 * El shard i (0 <= i < k) contiene el chunk i de los datos originales.
 * Los shards de paridad (k <= i < n) se calculan por bloque.
 */
export function reedSolomonEncode(data: Uint8Array, k: number, n: number): Uint8Array[] {
  if (k <= 0 || n <= 0) {
    throw new ReedSolomonError("k y n deben ser positivos");
  }
  if (k > n) {
    throw new ReedSolomonError("k no puede ser mayor que n");
  }
  if (n > 255) {
    throw new ReedSolomonError("n no puede exceder 255");
  }
  if (data.length % k !== 0) {
    throw new ReedSolomonError(`Longitud de datos (${data.length}) debe ser múltiplo de k (${k})`);
  }

  const shardSize = data.length / k;
  const shards: Uint8Array[] = new Array(n);

  // Generar matriz de Vandermonde k x n
  const vandermonde = generateVandermondeMatrix(k, n);

  // Para codificación sistemática: G = V_k^{-1} * V
  // donde V_k son las primeras k columnas de V
  const vk: number[][] = vandermonde.map((row) => row.slice(0, k));
  const vkInv = invertMatrix(vk);

  // G = V_k^{-1} * V (matriz k x n)
  const generatorMatrix: number[][] = [];
  for (let i = 0; i < k; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let l = 0; l < k; l++) {
        sum = gf256Add(sum, gf256Mul(vkInv[i][l], vandermonde[l][j]));
      }
      row.push(sum);
    }
    generatorMatrix.push(row);
  }

  // Inicializar shards
  for (let i = 0; i < n; i++) {
    shards[i] = new Uint8Array(shardSize);
  }

  // Copiar datos originales a los primeros k shards (chunks contiguos)
  for (let i = 0; i < k; i++) {
    shards[i].set(data.subarray(i * shardSize, (i + 1) * shardSize));
  }

  // Calcular shards de paridad
  // Para cada posición de byte dentro del shard, tomamos el byte de cada shard de datos
  // y calculamos los bytes de paridad correspondientes
  for (let block = 0; block < shardSize; block++) {
    // Vector de datos para este bloque (k elementos, uno de cada shard de datos)
    const dataVector: number[] = [];
    for (let i = 0; i < k; i++) {
      dataVector[i] = shards[i][block];
    }

    // Calcular codeword completo: c = dataVector * G
    const codeword = multiplyVectorMatrix(dataVector, generatorMatrix);

    // Los primeros k elementos del codeword deben ser iguales a dataVector (sistemático)
    // Solo escribimos los shards de paridad (índices k a n-1)
    for (let i = k; i < n; i++) {
      shards[i][block] = codeword[i];
    }
  }

  return shards;
}

/**
 * Decodifica datos desde k shards cualesquiera de n
 * @param shards Array de k Uint8Array (shards disponibles)
 * @param indices Índices originales de los shards (0 a n-1)
 * @param k Número de shards de datos originales
 * @param n Número total de shards
 * @param originalLength Longitud original de los datos
 * @returns Uint8Array con los datos reconstruidos
 */
export function reedSolomonDecode(
  shards: Uint8Array[],
  indices: number[],
  k: number,
  n: number,
  originalLength: number
): Uint8Array {
  if (shards.length !== k) {
    throw new ReedSolomonError(`Se esperaban ${k} shards, se recibieron ${shards.length}`);
  }
  if (indices.length !== k) {
    throw new ReedSolomonError(`Se esperaban ${k} índices, se recibieron ${indices.length}`);
  }
  if (new Set(indices).size !== k) {
    throw new ReedSolomonError("Índices duplicados");
  }

  const shardSize = originalLength / k;
  if (originalLength % k !== 0) {
    throw new ReedSolomonError("Longitud original no múltiplo de k");
  }

  for (const shard of shards) {
    if (shard.length !== shardSize) {
      throw new ReedSolomonError(`Tamaño de shard inválido: ${shard.length}, esperado ${shardSize}`);
    }
  }

  // Generar matriz de Vandermonde k x n
  const vandermonde = generateVandermondeMatrix(k, n);

  // Extraer V_k (primeras k columnas) y V_J (columnas en indices)
  const vk: number[][] = vandermonde.map((row) => row.slice(0, k));
  const vj: number[][] = [];
  for (let i = 0; i < k; i++) {
    const row: number[] = [];
    for (let j = 0; j < k; j++) {
      row.push(vandermonde[i][indices[j]]);
    }
    vj.push(row);
  }

  // Calcular matriz de decodificación: D = V_J^{-1} * V_k
  // Porque: shardVector = dataVector * V_k^{-1} * V_J
  // => dataVector = shardVector * V_J^{-1} * V_k
  const vjInv = invertMatrix(vj);

  // D = V_J^{-1} * V_k (k x k)
  const decodeMatrix: number[][] = [];
  for (let i = 0; i < k; i++) {
    const row: number[] = [];
    for (let j = 0; j < k; j++) {
      let sum = 0;
      for (let l = 0; l < k; l++) {
        sum = gf256Add(sum, gf256Mul(vjInv[i][l], vk[l][j]));
      }
      row.push(sum);
    }
    decodeMatrix.push(row);
  }

  const result = new Uint8Array(originalLength);

  // Procesar cada bloque
  for (let block = 0; block < shardSize; block++) {
    // Vector de shards disponibles para este bloque
    const shardVector: number[] = [];
    for (let i = 0; i < k; i++) {
      shardVector[i] = shards[i][block];
    }

    // Recuperar vector de datos original: dataVector = shardVector * D
    const dataVector = multiplyVectorMatrix(shardVector, decodeMatrix);
    for (let i = 0; i < k; i++) {
      result[i * shardSize + block] = dataVector[i];
    }
  }

  return result;
}

/**
 * Repara shards faltantes desde k shards disponibles
 * @param shards Array de n elementos (Uint8Array | null) con shards disponibles y null para faltantes
 * @param k Número de shards de datos
 * @param n Número total de shards
 * @returns Array de n Uint8Array con todos los shards reparados
 */
export function reedSolomonRepair(
  shards: (Uint8Array | null)[],
  k: number,
  n: number
): Uint8Array[] {
  if (shards.length !== n) {
    throw new ReedSolomonError(`Array de shards debe tener longitud ${n}`);
  }

  const availableIndices: number[] = [];
  const availableShards: Uint8Array[] = [];
  let shardSize: number | null = null;

  for (let i = 0; i < n; i++) {
    if (shards[i] !== null) {
      availableIndices.push(i);
      availableShards.push(shards[i]);
      if (shardSize === null) {
        shardSize = shards[i]!.length;
      } else if (shards[i]!.length !== shardSize) {
        throw new ReedSolomonError("Todos los shards deben tener el mismo tamaño");
      }
    }
  }

  if (availableIndices.length < k) {
    throw new ReedSolomonError(`Se necesitan al menos ${k} shards para reparar, hay ${availableIndices.length}`);
  }

  // Si tenemos todos, devolver tal cual
  if (availableIndices.length === n) {
    return shards as Uint8Array[];
  }

  // Usar solo los primeros k disponibles para reconstruir
  const decodeIndices = availableIndices.slice(0, k);
  const decodeShards = availableShards.slice(0, k);
  const originalLength = k * shardSize!;

  const decoded = reedSolomonDecode(decodeShards, decodeIndices, k, n, originalLength);

  // Re-codificar para obtener todos los shards
  const allShards = reedSolomonEncode(decoded, k, n);

  return allShards;
}