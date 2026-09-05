/**
 * Raíz del repositorio para el Puente de Mando, OPACA para el trazador de archivos de Next.
 *
 * Con `const RAÍZ = process.cwd()` y lecturas `readFile(path.join(RAÍZ, rutaVariable))`,
 * `@vercel/nft` resuelve `process.cwd()` y, al no poder resolver el resto, mete TODO el
 * directorio del proyecto en la función (src/, venv/, .git/, .next/cache/…): el despliegue
 * de a3ff578 falló en Vercel con «api/mando/asistente is 2.21gb uncompressed». Leyendo la
 * raíz de una variable de entorno (con `process.cwd()` solo como respaldo en tiempo de
 * ejecución) el trazador no puede evaluarla y no arrastra nada. En producción el Mando es
 * 404 (`guardianMando`), así que no necesita ningún archivo del disco.
 */
export function raizDelProyecto(): string {
    const env = process.env.STARSEED_ROOT;
    return typeof env === "string" && env.length > 0 ? env : process.cwd();
}
