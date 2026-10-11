# Chatterbox local — servicio Astraura VZR1011A

Servicio local en `127.0.0.1:4600` (puerto libre del rango del demonio de voz: 4444 daemon, 4500+ pool TTS; 4600 queda libre y no colisiona). MIT (`https://github.com/resemble-ai/chatterbox`).

- Multilingual V3: español (`language="es"`) + paquetes dedicados `es-mx-latam` y `es-es` si su README los publica con nombre (`ResembleAI/Chatterbox-Multilingual-es-mx-latam`, `es-es`).
- Turbo (350M, inglés, baja latencia, paralinguísticos nativos: `[laugh]`, `[cough]`, etc.).
- Nano (110M, inglés, CPU ~3× real, mismo decodificador de 1 paso).
- Marca de agua Perth (`perth`) se conserva SIEMPRE en cada audio generado.
- Uso: CPU / MPS / CUDA según haya (`torch.cuda.is_available()`, `torch.backends.mps.is_available()`).
- Carga perezosa (`lazy_load`) y descarga del modelo tras 5 min sin uso (respeta cesión de memoria del daemon: si `memDisponible()` baja, se libera el modelo; `guardia-memoria.py` lo vigila).
- Sin descargas automáticas de pesos: solo tras permiso explícito y comprobación de espacio (≥ 3 veces). Nunca en código valores de claves.

## Endpoints

- `GET /salud` → `{ dispositivo, modelos_cargados: [...], memoria_mb: ... }`
- `POST /generar` → `{ texto, idioma?, referencia_voz?, exageracion?, referencia_path?, exageracion? }` → WAV con marca Perth; mide primer audio (`first_audio_ms`) y factor de tiempo real (`rtf = audio_s / texto_s`).
- `POST /generar/stream` → por frases (`trocear` en cláusulas: fin de frase / coma con ≥6 palabras / tope 14); emite chunks WAV con Perth; mide `rtf` acumulado.

## Dependencias

`pip install chatterbox-tts` (MIT, `pyproject.toml` del repo). Modelo V3 (`chatterbox.mtl_tts`) carga perezosa desde `~/.starseed/chatterbox/` o ruta env `CHATTERBOX_MODEL_DIR`. Nada de descargas automáticas sin permiso.
