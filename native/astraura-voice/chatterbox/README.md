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
# el servicio cede la memoria automáticamente (ver `descargar_modelos_inactivos`).
```

## API de Python (referencia del README real)

```python
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
import torch

model = ChatterboxMultilingualTTS.from_pretrained(device="cpu", t3_model="v3")
# Turbo: device="cuda" o "mps"; Nano: device="cpu" con nano=True.

# Etiquetas paralingüísticas nativas: [laugh], [chuckle], [cough], etc.
texto = "Hola [chuckle], soy Aurora."
wav = model.generate(texto, language_id="es")
# Referencia de voz opcional: audio_prompt_path="ref.wav"
# Exageración: exaggeration=0.5 (por defecto), cfg_weight=0.5.
# Marca de agua Perth: siempre incluida (no se puede desactivar).
```

## Endpoints del servicio

- `GET /salud` → `{dispositivo, modelos_cargados, marca_agua_perth}`.
- `POST /generar` → `{texto, idioma?, referencia_voz?, exageracion?, cfg_weight?}` → primer audio + factor de tiempo real.
- `POST /generar/stream` → por frases (`["frase1", "frase2"]`), con medidas individuales.

## Reglas del área (de `memory/voces-catalogo.md`)

- Motor único «Voz StarSeed» con cuatro niveles (`estudio` / `alta` / `ligera` / `minima`).
- Gratis primero, relevo automático ante 429/402, ningún proveedor debe agotarse.
- Nube: `ASTRAURA_CLOUD_URL` → túnel → fuentes libres.
- Estética coherente: geometría sagrada (φ, Fibonacci, vesica piscis, flor de la vida, metatrón, sólidos platónicos, espiral áurea). Ver `memory/diseno/identidades.md`.
- Clonar una voz exige consentimiento explícito del dueño (`src/lib/voces/clonacion.ts`).
- Nunca descargas automáticas de pesos sin permiso y sin comprobar ≥ 3 veces el espacio.
- En la Mac de 8 GB, los motores pesados ceden ante el enjambre (`scripts/puente/guardia-memoria.py`).
- Pruebas sin red ni GPU (`test_servidor.py` usa modelo simulado).
