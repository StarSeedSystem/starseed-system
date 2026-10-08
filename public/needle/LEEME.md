# Motor Needle 3 en el Navegador (WASM)

Motor oficial de decisión en el dispositivo (architecture/capas-autoadaptables.md §1, §3
y §6): Cactus **Needle 3** (`Cactus-Compute/needle3`), 121 M parámetros con profundidad
variable de 2 a 20 capas, para llamada a herramientas, clasificación, extracción y
embeddings. Corre como `needle.js` (pegamento Emscripten) + `needle.wasm`.

## Archivos requeridos (NO versionados en Git)

1. `needle.wasm` — motor ejecutable compilado a WebAssembly.
2. `needle.js` — conector Emscripten; expone la factoría global `createNeedleModule`.
3. `needle3.cact` — pesos cuantizados (8–29 MB según la profundidad elegida).

## Cómo se generan

Con el CLI oficial `needle` instalado en la Mac:

```bash
python3 scripts/puente/needle_web_paquete.py
```

El script corre `needle build --platform web` (y `needle weights` si los pesos no
vinieron), calcula el SHA-256 de cada archivo y lo anota en
`config/capas-astraura.json` (campo `sha256` de los pesos y mapa `archivos` de la
entrada `needle3-reflejo`). **No sube nada**: deja los binarios en
`.transfer/capas/needle-web/` para que el espejo los recoja, y el catálogo listo para
firmar. Una capa cuyo SHA no está en el catálogo no se usa jamás (§6, §11).

## Cómo carga el sistema

`src/lib/astraura/needle-wasm.ts`:

1. Comprueba WebAssembly y que la entrada `needle3-reflejo` del catálogo es usable
   (SHA verificado y estado recomendado o respaldo).
2. Elige la profundidad con `profundidadNeedle(presupuestoMb)` (2→20 capas, 8→29 MB).
3. Busca los pesos primero en el **almacén de capas** (OPFS / Cache API, §6), y si no
   están, en las fuentes en orden: copia local de esta carpeta, espejos del catálogo y
   por último la fuente oficial de Hugging Face, verificando el SHA-256 siempre.
4. Instancia el motor con `createNeedleModule` y expone `llamarHerramientas`,
   `clasificar`, `extraer` y `embeber` con el contrato de `needle3-client.ts`.

Si falta WebAssembly o el SHA no casa, devuelve `no-disponible` y la decisión cae a
`/api/needle/decidir` en el servidor, como hasta ahora. Todo lo externo (red, almacén,
fábrica) se inyecta: las pruebas usan un módulo WASM falso sin descargar modelos.
