import { describe, it, expect } from "vitest";
import { 
  Cadena, 
  iniciarCadena, 
  siguienteClave, 
  debeRotar, 
  cifrar, 
  descifrar 
} from "../trinquete";

describe("trinquete", () => {
  it("should initialize a chain with a secret", async () => {
    const secreto = new TextEncoder().encode("test-secret").buffer;
    const contexto = "test-context";
    const ahora = Date.now();
    
    const cadena = await iniciarCadena(secreto, contexto, ahora);
    
    expect(cadena).toHaveProperty("raiz");
    expect(typeof cadena.raiz).toBe("object");
    expect(cadena.n).toBe(0);
    expect(cadena.desde).toBe(ahora);
  });
  
  it("should derive message keys and next chain", async () => {
    const secreto = new TextEncoder().encode("test-secret").buffer;
    const contexto = "test-context";
    const ahora = Date.now();
    
    const cadena = await iniciarCadena(secreto, contexto, ahora);
    const result1 = await siguienteClave(cadena);
    
    expect(result1.clave).toHaveProperty("algorithm");
    expect(result1.clave.algorithm.name).toBe("AES-GCM");
    expect(result1.cadena.n).toBe(1);
    expect(result1.n).toBe(0);
    
    // Get the next key
    const result2 = await siguienteClave(result1.cadena);
    expect(result2.cadena.n).toBe(2);
    expect(result2.n).toBe(1);
  });
  
  it("should encrypt and decrypt data", async () => {
    const secreto = new TextEncoder().encode("test-secret").buffer;
    const contexto = "test-context";
    const ahora = Date.now();
    
    const cadena = await iniciarCadena(secreto, contexto, ahora);
    const result = await siguienteClave(cadena);
    const clave = result.clave;
    
    const datos = new TextEncoder().encode("Hola, mundo!");
    const aad = new TextEncoder().encode("auth-data");
    
    const cifrado = await cifrar(clave, datos, aad);
    const descifrado = await descifrar(clave, cifrado.iv, cifrado.cifrado, aad);
    
    expect(new TextDecoder().decode(descifrado)).toBe("Hola, mundo!");
  });
  
  it("should fail to decrypt with wrong AAD", async () => {
    const secreto = new TextEncoder().encode("test-secret").buffer;
    const contexto = "test-context";
    const ahora = Date.now();
    
    const cadena = await iniciarCadena(secreto, contexto, ahora);
    const result = await siguienteClave(cadena);
    const clave = result.clave;
    
    const datos = new TextEncoder().encode("Hola, mundo!");
    const aad1 = new TextEncoder().encode("auth-data");
    const aad2 = new TextEncoder().encode("wrong-auth-data");
    
    const cifrado = await cifrar(clave, datos, aad1);
    
    // This should throw an error
    await expect(descifrar(clave, cifrado.iv, cifrado.cifrado, aad2))
      .rejects
      .toThrow();
  });
  
  it("should derive same keys for same secret and context", async () => {
    const secreto = new TextEncoder().encode("test-secret").buffer;
    const contexto = "test-context";
    const ahora = Date.now();
    
    const cadena1 = await iniciarCadena(secreto, contexto, ahora);
    const cadena2 = await iniciarCadena(secreto, contexto, ahora);
    
    // Get the same key from both chains
    const result1 = await siguienteClave(cadena1);
    const result2 = await siguienteClave(cadena2);
    
    // Encrypt the same data with both keys
    const datos = new TextEncoder().encode("test data");
    const aad = new TextEncoder().encode("test-aad");
    
    const cifrado1 = await cifrar(result1.clave, datos, aad);
    const cifrado2 = await cifrar(result2.clave, datos, aad);
    
    // The ciphertexts should be different due to different IVs
    expect(cifrado1.iv).not.toEqual(cifrado2.iv);
    
    // But we should be able to decrypt each with the other's key
    const descifrado1 = await descifrar(result2.clave, cifrado1.iv, cifrado1.cifrado, aad);
    const descifrado2 = await descifrar(result1.clave, cifrado2.iv, cifrado2.cifrado, aad);
    
    expect(new TextDecoder().decode(descifrado1)).toBe(new TextDecoder().decode(datos));
    expect(new TextDecoder().decode(descifrado2)).toBe(new TextDecoder().decode(datos));
  });
  
  it("should determine when to rotate", () => {
    const ahora = Date.now();
    const hace15Min = ahora - 15 * 60 * 1000;
    const hace14Min = ahora - 14 * 60 * 1000;
    
    // Test with n < 500 and time < 15 min
    expect(debeRotar({ raiz: {} as CryptoKey, n: 499, desde: hace14Min }, ahora)).toBe(false);
    
    // Test with n >= 500
    expect(debeRotar({ raiz: {} as CryptoKey, n: 500, desde: ahora }, ahora)).toBe(true);
    
    // Test with time >= 15 min
    expect(debeRotar({ raiz: {} as CryptoKey, n: 0, desde: hace15Min }, ahora)).toBe(true);
  });
});