# Motor Needle 3 en el Navegador (WASM)

Este directorio alberga las instrucciones y recursos para la inferencia de decisión en el dispositivo mediante WebAssembly (WASM).

## Archivos requeridos (no versionados en Git)

Por razones de tamaño (~35 MB), los archivos del motor NO deben incluirse en el repositorio Git:

1. `public/needle/needle.wasm` — Motor ejecutable compilado a WebAssembly.
2. `public/needle/needle.js` — Conector de Emscripten para la interfaz JS.
3. `public/needle/needle3.cact` — Pesos del modelo Needle 3 (~35 MB).

## Origen de descargas

Los binarios e instrucciones provienen del repositorio oficial en Hugging Face:
- Repositorio: `https://huggingface.co/Cactus-Compute/needle3`
- Motor WASM: carpeta `wasm/` (`needle.wasm` y `needle.js`)
- Pesos cuantizados: `needle3.cact`

## Integración con el Sistema

La carga perezosa y la gestión de memoria se realizan desde `src/lib/astraura/needle-wasm.ts`.
Los pesos se almacenan en la API **Cache Storage** del navegador (`needle-wasm-v1`), sin utilizar `localStorage`.
