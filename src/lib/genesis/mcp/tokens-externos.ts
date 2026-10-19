// ════════════════════════════════════════════════════════════════
// Tokens externos por ámbito para Genesis MCP — Ola 1019G · GCA1019T
// Lógica de servidor. El token completo solo se ve UNA vez al crear;
// en base solo vive su hash sha256.
// ════════════════════════════════════════════════════════════════
import { createHash, randomBytes } from "node:crypto";

// Injected store (set via injectStore for testing)
let store: TokenStore | null = null;

/** Store interface for token persistence. */
interface TokenStore {
  save(tokenHash: string, data: TokenData): Promise<void>;
  findByHash(tokenHash: string): Promise<TokenData | null>;
  // Note: revocation can be done by removing the token from the store.
}

/** Data stored for a token (excluding the token value itself). */
interface TokenData {
  ambito: string;
  alcance: string;
  caduca: string; // ISO date string
  usosMaximos: number;
  usosActuales: number;
}

/** Inyecta el almacenamiento (útil para tests). */
export function injectStore(s: TokenStore) {
  store = s;
}

/** Almacenamiento en memoria simple para cuando no se proporciona un store externo. */
class InMemoryTokenStore implements TokenStore {
  private map = new Map<string, TokenData>();
  async save(tokenHash: string, data: TokenData): Promise<void> {
    this.map.set(tokenHash, data);
  }
  async findByHash(tokenHash: string): Promise<TokenData | null> {
    return this.map.get(tokenHash) ?? null;
  }
}

// Proporcionar un almacenamiento por defecto si no se inyecta uno explícitamente.
if (store === null) {
  injectStore(new InMemoryTokenStore());
}

/** Genera `ssk_<prefijo 8>_<aleatorio 32>` y su hash sha256. */
function generarToken(): { token: string; prefijo: string; hash: string } {
  const prefijo = randomBytes(4).toString("hex"); // 8 caracteres hex
  const aleatorio = randomBytes(16).toString("hex"); // 32 hex
  const token = `ssk_${prefijo}_${aleatorio}`;
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, prefijo, hash };
}

/**
 * Crea un token externo para el ámbito y alcance dados.
 * El token solo se muestra una vez. Devuelve el token en claro.
 */
export async function crearToken(
  ambito: string,
  alcance: string,
  caduca: string | Date,
  usosMaximos: number = 1
): Promise<string> {
  if (!store) {
    throw new Error("Store not injected. Call injectStore first.");
  }
  if (!ambito || !alcance) {
    throw new Error("Ambito y alcance son requeridos.");
  }
  const { token, hash } = generarToken();
  const caducaISO =
    caduca instanceof Date ? caduca.toISOString() : String(caduca);
  await store.save(hash, {
    ambito,
    alcance,
    caduca: caducaISO,
    usosMaximos,
    usosActuales: 0,
  });
  return token;
}

/**
 * Verifica un token externo y devuelve su ambito y alcance si es válido.
 * En caso de éxito, incrementa el contador de usos.
 * Devuelve null si el token es inválido, expirado, revocado o ha superado el límite de usos.
 */
export async function verificarToken(
  valor: string
): Promise<{ ambito: string; alcance: string } | null> {
  if (!store) {
    throw new Error("Store not injected. Call injectStore first.");
  }
  const hash = createHash("sha256").update(valor).digest("hex");
  const data = await store.findByHash(hash);
  if (!data) return null;

  // Check expiration
  const ahora = new Date();
  const expira = new Date(data.caduca);
  if (expira.getTime() <= ahora.getTime()) {
    // Token expired, remove it from store to save space? Optional.
    // We'll leave it to the store's cleanup policy.
    return null;
  }

  // Check usage limit
  if (data.usosActuales >= data.usosMaximos) {
    return null;
  }

  // Increment usage count
  await store.save(hash, {
    ...data,
    usosActuales: data.usosActuales + 1,
  });

  return { ambito: data.ambito, alcance: data.alcance };
}