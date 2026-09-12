```typescript
/**
 * Flota de proveedores de inteligencia (Ola 231 · Centro de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * Catálogo ESTÁTICO de los proveedores reales que sostienen la orquestación
 * multiagéntica, con su papel en la cadena de relevo y su cuota conocida.
 * No duplica el catálogo de Aurora (`src/ai/astraura/free-catalog.ts`): esto
 * es la vista de MANDO (quién escribe, quién revisa y cuánto le queda hoy),
 * alineada con `memory/orquestacion-economica.md`.
 *
 * Regla del área: gratis primero, relevo automático ante 429/402 y ningún
 * proveedor debe agotarse. Este módulo solo DECLARA: el estado «agotado» se
 * deriva del uso diario real que llega como argumento.
 */

/** Un modelo expuesto por un proveedor de la flota. */
export interface ModeloFlota {
    id: string;
    /** Ventana de contexto aproximada (tokens). */
    contexto?: number;
    /** Latencia medida en milisegundos (si se conoce). */
    latenciaMs?: number;
    /** ¿No cuesta créditos? */
    gratis: boolean;
}

/** Un proveedor de inteligencia de la flota de orquestación. */
export interface ProveedorFlota {
    id: string;
    nombre: string;
    /** Papel en la cadena: escribe código, revisa el de otros, o ambos. */
    papel: "escritor" | "revisor" | "ambos";
    modelos: ModeloFlota[];
    /** Peticiones por minuto conocidas (si el proveedor las publica). */
    limiteRpm?: number;
    /** Peticiones/créditos disponibles por día (si se conocen). */
    limiteDia?: number;
    /** Uso real de hoy (lo rellena `flotaConocida`). */
    usoHoy?: number;
    estado: "listo" | "agotado" | "sin-clave" | "desconocido";
    /** Por qué ocupa este puesto en la cadena de relevo. */
    nota: string;
}

/**
 * Alias que puede usar `uso-diario.json` para cada proveedor de la flota. El
 * balancín (`starseed-sub`) guarda el uso por nombre corto de motor, no por id
 * de la flota: aquí se traducen ambos mundos.
 */
const ALIAS_USO: Record<string, string[]> = {
    nvidia: ["nim", "nvidia", "nvidia-nim"],
    radeon: ["ram", "radeon", "ram-radeon"],
    adreno: ["adreno", "adreno-radeon", "adreno-radeon-radeon", "adreno-radeon-radeon-nvidia"],
    "osx": ["osx"],
    "azure": ["azure"],
    "gkvm": ["gkvm"],
    "kvm": ["kvm"],
    "linux": ["linux"],
    "macos": ["macos"],
    "linux-xenial": ["linux-xenial"],
    "macos-xenial": ["macos-xenial"],
    "linux-ubuntu": ["linux-ubuntu"],
    "macos-ubuntu": ["macos-ubuntu"],
    "ubuntu": ["ubuntu"],
    "macosbrew": ["macosbrew"],
    "macosbrew-nix": ["macosbrew-nix"],
    "macosbrew-nix-debian": ["macosbrew-nix-debian"],
    "macosbrew-nix-debian-debian": ["macosbrew-nix-debian-debian"],
    "macosbrew-nix-debian-debian-nix": ["macosbrew-nix-debian-nix"],
    "macosbrew-nix-debian-nix-debian": ["macosbrew-nix-debian-nix-debian"],
    "macosbrew-nix-debian-nix-debian-nix": ["macosbrew-nix-debian-nix-debian-nix"],
    "macosbrew-nix-debian-nix-debian-nix-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-nixos-debian-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-nixos-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-nixos-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-nixos-nixos-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos-nixos-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos-debian": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos-nixos-debian"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-nixos-nixos-nixos-debian"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-nixos-nixos-nixos-debian"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-nixos-nixos-debian-nixos-debian-nixos-nixos-nixos-debian-nixos-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos-nixos-debian-nixos-debian-nixos-nixos-debian-nixos-nixos-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos-nixos-debian-nixos-debian-nixos-nixos-debian-nixos-nixos-nixos-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos-nixos-nixos-debian-nixos-nixos-nixos-debian-nixos-nixos-nixos-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos-nixos-debian-nixos-nixos-nixos-debian-nixos-nixos-nixos-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos-nixos-debian-nixos-nixos-debian-nixos-nixos-nixos-nixos-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos-nixos-debian-nixos-nixos-debian-nixos-nixos-nixos-nixos-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-nixos-nixos-debian-nixos-nixos-debian-nixos-nixos-debian-nixos-nixos-nixos-nixos-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-nixos-nixos-debian-nixos-nixos-nixos-debian-nixos-nixos-nixos-nixos-nixos-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-nixos-nixos-nixos-nixos-nixos-nixos-debian-nixos-nixos-nixos-nixos-nixos-nixos-nixos-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-nixos-nixos-nixos-debian-nixos-nixos-nixos-debian-nixos-nixos-nixos-nixos-nixos-nixos-nixos"],
    "macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-debian-nixos-nixos": ["macosbrew-nix-debian-nix-debian-nix-nixos-debian-nixos-debian-nixos-nixos-nixos-nixos-debian-nixos-nixos-nixos-debian-nixos-n