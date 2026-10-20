interface StorageInterface {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let storage: StorageInterface = typeof localStorage !== "undefined" ? localStorage : ({} as StorageInterface);

export function setStorage(injectedStorage: StorageInterface): void {
  storage = injectedStorage;
}

export function crearToken(ambito: string, alcance: string, caduca: number): string {
  const valor = crypto.randomUUID();
  const hash = Array.from(new Uint8Array(crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor))))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  storage.setItem(`ssm_${hash}`, JSON.stringify({
    ambito,
    alcance,
    caduca,
    usos: 0,
    revocado: false
  }));
  return valor;
}

export function verificarToken(valor: string): { ambito: string; alcance: string } | null {
  if (!valor || typeof valor !== "string") {
    return null;
  }
  const hash = Array.from(new Uint8Array(crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor))))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const registro = storage.getItem(`ssm_${hash}`);
  if (!registro) {
    return null;
  }
  const datos = JSON.parse(registro) as {
    ambito: string;
    alcance: string;
    caduca: number;
    usos: number;
    revocado: boolean;
  };
  const ahora = Date.now();
  if (datos.caduca && ahora > datos.caduca) {
    storage.removeItem(`ssm_${hash}`);
    return null;
  }
  if (datos.revocado) {
    storage.removeItem(`ssm_${hash}`);
    return null;
  }
  datos.usos++;
  storage.setItem(`ssm_${hash}`, JSON.stringify(datos));
  return { ambito: datos.ambito, alcance: datos.alcance };
}