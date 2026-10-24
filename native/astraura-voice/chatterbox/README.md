# Chatterbox TTS — Servicio local StarSeed OS

Referencia real: https://github.com/resemble-ai/chatterbox (MIT, verificado 2026-10-11).

## Qué es

Servicio local en `127.0.0.1:4505` (puerto libre del rango del demonio de voz; ver `daemon.mjs`) que expone los modelos de **Chatterbox**:

- **Multilingual V3** (500M, 23+ idiomas, MIT): español (es), latam (es-mx-latam), España (es-es), inglés (en), francés (fr), chino (zh), etc.
- **Turbo** (350M, inglés, baja latencia, paralingüísticas nativas: `[laugh]`, `[chuckle]`).
- **Nano** (110M, inglés, CPU ~3× tiempo real en 8 núcleos).

## Instalación

```bash
# Requiere Python ≥ 3.11 y espacio verificado (≥ 3 comprobaciones antes de descargar pesos).
pip install chatterbox-tts
# Si no hay espacio suficiente o hay un motor pesado corriendo (enjambre vivo en la Mac 8 GB),
# el servicio cede la memoria solo: descarga el modelo tras 5 min sin uso y no lo carga si no cabe.
```

**El servicio nunca descarga pesos por su cuenta**: fuerza `HF_HUB_OFFLINE=1`, así que solo carga el
modelo si sus pesos ya están en la caché local de Hugging Face. Si no están, `/salud` lo dice
(`disponible: false` y el motivo). Traerlos es una decisión de la persona, con permiso y tras
comprobar el espacio (unos 3 GB), con una orden aparte:

```bash
HF_HUB_OFFLINE=0 python3 -c "from chatterbox.mtl_tts import ChatterboxMultilingualTTS as M; M.from_pretrained(device='cpu')"
```

## API de Python (referencia del README real)

```python
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
import torch

model = ChatterboxMultilingualTTS.from_pretrained(device="cpu")  # lo que usa servidor.py: cpu · mps · cuda
# El servicio carga SOLO Multilingual (una copia para los 23 idiomas, inglés incluido): Turbo y Nano
# serían un segundo modelo en memoria en la Mac de 8 GB.

# Etiquetas paralingüísticas nativas: [laugh], [chuckle], [cough], etc.
texto = "Hola [chuckle], soy Aurora."
wav = model.generate(texto, language_id="es")
# Referencia de voz opcional: audio_prompt_path="ref.wav"
# Exageración: exaggeration=0.5 (por defecto), cfg_weight=0.5.
# Marca de agua Perth: siempre incluida (no se puede desactivar).
```

## Arrancar el servicio

```bash
cd native/astraura-voice/chatterbox
python3 servidor.py               # 127.0.0.1:4505, el puerto que espera el cliente del OS
python3 servidor.py 4510          # otro puerto (también --puerto 4510 o CHATTERBOX_PORT=4510)
python3 servidor.py --simulado    # tono de prueba SIN modelo: comprueba el cableado desde el navegador
```

Escucha **solo en 127.0.0.1** (no hay opción para abrirlo a la red). Al arrancar dice si el motor
está disponible y, si no, por qué. Se para con Ctrl+C. El cliente del OS
(`src/lib/aurora/tts-oss/chatterbox.ts`) siempre llama al **4505**: otro puerto solo sirve para
pruebas o diagnóstico. Dejarlo como servicio permanente (launchd) es otra tarea; aquí no se instala
ninguno.

Comprobarlo a mano:

```bash
curl -s http://127.0.0.1:4505/salud
curl -s -X POST http://127.0.0.1:4505/generar -H 'Content-Type: application/json' \
  -d '{"texto":"Hola, soy Aurora.","idioma":"es"}' \
  | python3 -c "import sys,json,base64; open('aurora.wav','wb').write(base64.b64decode(json.load(sys.stdin)['audio_base64']))"
```

Límites (por petición): `CHATTERBOX_TEXTO_MAX` caracteres (1000; `--texto-max`), `CHATTERBOX_TIEMPO_MAX_S`
segundos (55, por debajo de los 60 s del cliente; `--tiempo-max`), cuerpo de 64 KB y una síntesis a la
vez. Memoria: `CHATTERBOX_MEMORIA_MIN_MB` libres para cargar (2500) y nunca con la presión de memoria
del sistema en aviso; `CHATTERBOX_INACTIVIDAD_S` sin uso para descargar (300). Dispositivo:
`CHATTERBOX_DISPOSITIVO=cpu|mps|cuda` lo fuerza (si no, CUDA → MPS → CPU).

## Endpoints del servicio (contrato de `chatterbox.ts`)

- `GET /salud` → **200** `{disponible: true, dispositivo, motor, modelos_cargados, marca_agua_perth, idiomas, limites, …}`
  si puede hablar; **503** con `disponible: false` y `motivo` si no (paquete sin instalar, sin
  memoria, pesos que no están en la caché). El cliente toma un no-200 como «no hay servicio local» y
  va a los Spaces sin gastar un `/generar`.
- `POST /generar` (`Content-Type: application/json`) → `{texto, idioma?, exageracion?, cfg_weight?}`
  (idioma por defecto `es`, de los 23 de Multilingual; exageración 0–2 y `cfg_weight` 0–1, 0,5 por
  defecto) → **200** `{audio_base64, factor_tiempo_real, duracion_s, frecuencia_hz, …}`: WAV RIFF PCM
  16 bits mono en base64. `factor_tiempo_real` = segundos de proceso por segundo de audio (< 1 = más
  rápido que el tiempo real), como `factorTiempoReal` de `src/lib/mejoras/calidad.ts`.
  Errores: **400** cuerpo malo · **413** texto o cuerpo demasiado grandes · **415** no es JSON ·
  **503** sin motor, sin memoria u ocupado (`Retry-After`) · **504** pasó del tiempo máximo (la síntesis
  acaba por detrás y el modelo queda cargado) · **500** el motor falló. Nunca un 200 sin audio.
- La clonación (`referencia_voz`) **no** va por esta puerta: pide el consentimiento del dueño
  (`src/lib/voces/clonacion.ts`); el servicio responde 400.
- CORS con la misma lista de orígenes que el demonio de voz (`../lib.mjs · isAllowedOrigin`: OS en
  Vercel, `starseed-os.com`, previsualizaciones y `localhost`); un `Origin` ajeno o un `Host` que no sea
  de loopback → 403. Responde al preflight de red privada de Chrome; nunca `Allow-Credentials`.

## Pruebas

```bash
python3 -m pytest -q test_servidor.py   # o: python3 run_tests.py
```

Sin red exterior, sin GPU y sin modelo: levantan el servidor de verdad en un puerto libre de
127.0.0.1 y le hablan con urllib (salud sin paquete, 503, 400 por cuerpo malo, generación con el
motor simulado, tiempo máximo, CORS y Host).

## Reglas del área (de `memory/voces-catalogo.md`)

- Motor único «Voz StarSeed» con cuatro niveles (`estudio` / `alta` / `ligera` / `minima`).
- Gratis primero, relevo automático ante 429/402, ningún proveedor debe agotarse.
- Nube: `ASTRAURA_CLOUD_URL` → túnel → fuentes libres.
- Estética coherente: geometría sagrada (φ, Fibonacci, vesica piscis, flor de la vida, metatrón, sólidos platónicos, espiral áurea). Ver `memory/diseno/identidades.md`.
- Clonar una voz exige consentimiento explícito del dueño (`src/lib/voces/clonacion.ts`).
- Nunca descargas automáticas de pesos sin permiso y sin comprobar ≥ 3 veces el espacio.
- En la Mac de 8 GB, los motores pesados ceden ante el enjambre (`scripts/puente/guardia-memoria.py`).
- Pruebas sin red ni GPU (`test_servidor.py` usa el motor simulado).
