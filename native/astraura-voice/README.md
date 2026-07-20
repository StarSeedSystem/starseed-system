# 🎙️ Astraura Voice — Motor de Voz Híbrido (paquete NATIVO)

Voz local, privada y gratuita para **Aurora / Astraura** en StarSeed OS. Envuelve
el motor C++ **[omnivoice.cpp](https://github.com/ServeurpersoCom/omnivoice.cpp)**
(TTS OmniVoice sobre GGML) en un **daemon Node** que el frontend consume por HTTP
en `http://127.0.0.1:4444`. Cuando el motor local no está disponible, el frontend
usa la **nube** (HF Space `k2-fsa/OmniVoice`) — de ahí lo de **híbrido**.

> Paquete **autocontenido**: sólo módulos nativos de Node (`http`, `child_process`,
> `fs`, `os`, `crypto`, `path`). **Cero dependencias npm.** No forma parte del árbol
> TypeScript de Next ni entra en su typecheck: es un paquete aparte que se instala y
> corre en la máquina del usuario (Mac/PC), no en el servidor web.

---

## 1 · Arquitectura (edge local + nube de respaldo)

```
   ┌──────────────────────────── StarSeed OS (navegador) ────────────────────────────┐
   │  Aurora quiere hablar → lee `astraura_voice_config`                              │
   │                                                                                  │
   │   1) GET  http://127.0.0.1:4444/status   (handshake)                             │
   │        · ok && ready:true  → 2) POST /tts  →  WAV 24 kHz  ▶  (EDGE local)        │
   │        · no responde / ready:false        →  nube (HF Space)  ▶  (CLOUD)         │
   └──────────────────────────────────┬───────────────────────────────────────────────┘
                                       │  loopback 127.0.0.1 (nunca sale a la red)
   ┌───────────────────────────────────▼──────────────── ASTRAURA DAEMON (daemon.mjs) ┐
   │  servidor http puro · CORS estricto · caché · auto-sleep                          │
   │        └─ spawn ─▶  omnivoice-tts  (CLI one-shot de omnivoice.cpp)                 │
   │                       --model base.gguf --codec tokenizer.gguf --lang … -o out.wav │
   └───────────────────────────────────────────────────────────────────────────────────┘

   ~/.starseed/astraura-voice/           (datos del usuario, fuera del repo)
     ├─ omnivoice.cpp/  (clon + build/ con los binarios + models/ con los GGUF)
     ├─ config.json  versions.json       (qué variante, rutas, ETags)
     ├─ cache/   (WAV por hash)          logs/   (daemon.log · build.log · autosync.log)
```

- **EDGE (local):** este daemon + `omnivoice.cpp`. Privado, offline, sin coste.
- **CLOUD (respaldo):** HF Space `k2-fsa/OmniVoice` (Gradio). Lo maneja el **frontend**;
  el daemon **no** lo necesita ni lo llama.

---

## 2 · Matriz de hardware → modelo

El instalador sondea la máquina (`probe.mjs`) y elige la cuantización del modelo
0.6B **OmniVoice** (base + tokenizer) y el script de compilación de `omnivoice.cpp`:

| Gama      | Cuándo (aceleración + memoria)                          | Cuantización | Ficheros GGUF                                              | Build            |
| --------- | ------------------------------------------------------- | ------------ | ---------------------------------------------------------- | ---------------- |
| **Alta**  | CUDA ≥ 12 con ≥ 16 GB VRAM · o Metal con ≥ 16 GB UMA     | **BF16**     | `omnivoice-base-BF16.gguf` + `omnivoice-tokenizer-BF16.gguf`   | `./buildcuda.sh` / `./buildcpu.sh`* |
| **Media** | Vulkan / Metal / CUDA con ~8 GB                          | **Q8_0**     | `omnivoice-base-Q8_0.gguf` + `omnivoice-tokenizer-Q8_0.gguf`   | `./buildvulkan.sh` / `./buildcpu.sh`* |
| **Baja**  | CPU puro · o ≤ 4 GB de memoria de aceleración           | **Q4_K_M**   | `omnivoice-base-Q4_K_M.gguf` + `omnivoice-tokenizer-Q4_K_M.gguf` | `./buildcpu.sh`  |

\* **macOS Apple Silicon:** el backend **Metal** se compila junto con GGML dentro de
`./buildcpu.sh` (GGML activa Accelerate/Metal según su propia detección). Si el repo
publicara un script Metal explícito, `install.mjs` lo intentaría antes; si cualquier
build acelerado falla, **cae automáticamente a `./buildcpu.sh`** (siempre funciona).

Scripts de build reales del repo: `buildcuda.sh`, `buildvulkan.sh`, `buildcpu.sh`,
`buildall.sh`, `checkpoints.sh`. Clonado **con submódulos** (`--recurse-submodules`).

Pesos en HuggingFace: **`Serveurperso/OmniVoice-GGUF`** (descarga directa por
`https://huggingface.co/Serveurperso/OmniVoice-GGUF/resolve/main/<fichero>`; el HEAD
trae `X-Linked-Etag` = SHA-256 del blob LFS y `X-Linked-Size`).

---

## 3 · Ficheros del paquete

| Fichero                                   | Qué hace                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `probe.mjs`                               | Sondeo de hardware multiplataforma + selección de variante. Ejecutable directo.  |
| `lib.mjs`                                 | Sala de máquinas compartida: rutas, log, config/versions, cliente HTTPS+HF, CORS, WAV. |
| `install.mjs`                             | Instalador idempotente: clona · compila · descarga · config · servicio.          |
| `daemon.mjs`                              | El daemon HTTP (127.0.0.1:4444): `/status` + `/tts`, caché, auto-sleep, CORS.     |
| `autosync.mjs`                            | Sincronización de pesos cada 7 días (HEAD + reemplazo atómico, sin cortar voz).   |
| `com.starseed.astraura-voice.plist`       | Plantilla launchd (macOS): RunAtLoad + KeepAlive.                                 |
| `astraura-voice.service`                  | Plantilla systemd `--user` (Linux): Restart on-failure.                           |
| `Motor de Voz Astraura (StarSeed).command`| Lanzador de doble clic (macOS): instala y arranca, mensajes en español.          |
| `README.md`                               | Este documento.                                                                  |

---

## 4 · Instalación y uso

**macOS:** doble clic en `Motor de Voz Astraura (StarSeed).command`. Instala (clona,
compila, descarga el modelo — puede tardar la primera vez) y deja el servicio activo.

**Cualquier SO (terminal):**

```bash
node install.mjs                 # instala/actualiza + servicio (idempotente)
node install.mjs --cpu-only      # ignora la GPU: gama BAJA (Q4_K_M) + buildcpu.sh
node install.mjs --reinstall     # rehace clon/compilación/descarga desde cero
node install.mjs --no-service    # no instala el servicio del sistema

node daemon.mjs                  # arranca el daemon a mano (si no usas el servicio)
node probe.mjs                   # imprime el informe de hardware/variante (JSON)
node autosync.mjs                # una comprobación de actualización y salir (cron)
node autosync.mjs --loop         # residente: comprueba cada 7 días
```

Requisitos en la máquina del usuario: **Node ≥ 18**, **git**, y un toolchain de
compilación C++ (más CUDA/Vulkan si aplica). El daemon en sí sólo necesita Node.

---

## 5 · Endpoints del daemon

### `GET /status` — handshake

```jsonc
{
  "ok": true,
  "engine": "omnivoice.cpp",
  "ready": true,             // false → el frontend muestra "instalar motor local" y usa la nube
  "model": "omnivoice-base-Q4_K_M.gguf",
  "tier": "baja",
  "backend": "cpu",
  "quant": "Q4_K_M",
  "version": "1.0.0",
  "warm": true,              // false = dormido (caché en RAM purgada tras 10 min)
  "uptime": 1234,            // segundos
  "sampleRate": 24000,
  "idleMs": 5000,            // ms desde la última síntesis (lo usa autosync)
  "busy": false,             // ¿síntesis en vuelo?
  "cloudFallback": "k2-fsa/OmniVoice",
  "reasons": ["…"]           // sólo si ready:false: por qué (falta binario/modelo…)
}
```

### `POST /tts` — síntesis

Cuerpo JSON (sólo `text` es obligatorio):

```jsonc
{
  "text": "Hola, soy Aurora.",
  "lang": "es",                  // es→Spanish, en→English… (por defecto Spanish)
  "speed": 1.0,                  // remuestreo por cabecera WAV (afecta al tono; ver §7)
  "ref_wav_path": "/ruta/ref.wav",   // clonación: audio de referencia
  "ref_text": "transcripción de la referencia",  // → se escribe a un .txt para --ref-text
  "voice_clone_prompt": "/ruta/ref.wav",          // alias de ref_wav_path si es un .wav
  "instruct": "habla despacio",   // aceptado pero IGNORADO por este CLI (ver §9)
  "voice_design": "voz cálida",   // idem
  "normalize": true,              // idem
  "allow_non_verbal": false       // idem
}
```

**Respuesta:** cuerpo binario **`audio/wav`** (mono, 24 kHz). Cabeceras informativas:
`X-Astraura-Cache: miss|ram|disk`, `X-Astraura-SampleRate: 24000`,
`X-Astraura-Speed: …` (si se remuestreó), `X-Astraura-Ignored: campo1,campo2` (campos
aceptados pero no soportados por el CLI). Errores → JSON `{ ok:false, error, reasons? }`
con `503` (motor no listo), `400` (texto/JSON inválido), `413` (cuerpo enorme).

```bash
curl -s -X POST http://127.0.0.1:4444/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hola, soy Aurora.","lang":"es"}' --output aurora.wav
```

---

## 6 · Seguridad — CORS estricto

El daemon escucha **sólo en loopback** (`127.0.0.1`) y aplica una **allowlist de
Origin** (parseada con la API `URL`, no con regex frágil). Emite
`Access-Control-Allow-Origin` **sólo** si el `Origin` casa con:

- `https://starseed-os.vercel.app`
- `https://*.starseed-os.com` (y el ápice `starseed-os.com`)
- `https://*-alexbordongarrigos-projects.vercel.app` (previews de Vercel)
- `http://localhost:*` · `http://127.0.0.1:*` · `http://[::1]:*`

Cualquier otro `Origin` presente → **`403` sin cuerpo**. El preflight `OPTIONS` se
maneja igual. Una petición **sin** `Origin` (curl, apps nativas) se sirve normal (en
loopback no hay nada que "cross-originar"). Verificado: `starseed-os.vercel.app.evil.com`
y el downgrade a `http://` para dominios de producción se **rechazan**.

---

## 7 · Lazy-load / auto-sleep (honestidad radical)

El CLI `omnivoice-tts` es **one-shot**: carga el modelo, sintetiza y **muere**. No hay
un proceso de modelo persistente que "precalentar", así que somos honestos sobre qué
significan los estados:

- **`warm: true` (caliente)** = daemon listo + modelos probablemente en la **caché de
  página del SO** por un uso reciente. El overhead del **daemon** es **< 500 ms**.
- **`warm: false` (dormido)** = tras **10 min sin síntesis**, purgamos la caché de WAV
  en **RAM** y sugerimos al SO recolectar (libera memoria). La siguiente petición
  vuelve a `warm: true`.

El **coste real** de cargar el modelo lo paga el CLI **en cada llamada** — eso no se
puede eliminar sin un servidor de modelo persistente (que omnivoice.cpp no ofrece hoy).
Para amortiguarlo, el daemon **cachea** cada WAV por `hash(texto+idioma+clon+velocidad+
variante)` en RAM (LRU) y en disco (`cache/`): repetir una frase es **instantáneo**.

---

## 8 · Auto-sincronización de pesos

`autosync.mjs` (cada 7 días, por temporizador propio `--loop` o por cron/launchd):

1. `HEAD` a la URL `resolve` de cada GGUF de la variante instalada.
2. Compara el `X-Linked-Etag` (SHA-256) con `versions.json`.
3. Si cambió → descarga a `<fichero>.new`, valida el tamaño, y hace un **reemplazo
   atómico** (`fs.rename`) — **sin cortar** ninguna síntesis: espera a `busy:false`
   consultando `/status`, y sólo descarga si el sistema está **inactivo** (`idleMs`
   ≥ 10 min). Un **lock** de fichero evita dos autosyncs solapados.

Programación recomendada — launchd (macOS) o cron/systemd-timer (Linux):

```bash
# cron: cada domingo a las 4:00
0 4 * * 0  /usr/bin/node ~/.starseed/astraura-voice/omnivoice.cpp/../autosync.mjs
```

---

## 9 · Cómo lo consume el frontend

StarSeed OS guarda la config del motor híbrido en **`astraura_voice_config`** y, al
hablar, hace el handshake `GET /status`; si `ok && ready` usa el **edge** (`POST /tts`),
si no, cae a la **nube**:

```json
{
  "astraura_voice_config": {
    "engine": "astraura",
    "mode": "hybrid",
    "prefer": "edge",
    "edge": {
      "enabled": true,
      "endpoint": "http://127.0.0.1:4444",
      "status_path": "/status",
      "tts_path": "/tts",
      "handshake_interval_ms": 30000,
      "sample_rate": 24000
    },
    "cloud": {
      "enabled": true,
      "provider": "hf-space",
      "space": "k2-fsa/OmniVoice",
      "url": "https://k2-fsa-omnivoice.hf.space"
    },
    "lang": "es",
    "preset": "aurora-organica",
    "speed": 1.0,
    "clone": { "ref_wav_path": null, "ref_text": null }
  }
}
```

> El motor de voz existente `omnivoice` en `src/lib/aurora/tts-oss/` ya sabe hablar con
> un endpoint por HTTP; para usar este daemon basta apuntar su `endpoint` a
> `http://127.0.0.1:4444/tts`. `astraura` es el modo **híbrido** que además hace el
> handshake `/status` y gestiona el respaldo a la nube.

---

## 10 · Suposiciones sobre el CLI a verificar en el Mac

Estos puntos se dedujeron del uso documentado de `omnivoice-tts`; conviene confirmarlos
al compilar de verdad en el Mac (y ajustar `daemon.mjs`/`config.capabilities` si difiere):

- **Flags soportados** que usamos: `--model`, `--codec`, `--lang <Nombre en inglés>`,
  `-o <salida.wav>`, texto por **STDIN**, y clonación `--ref-wav` / `--ref-text`
  (donde `--ref-text` recibe una **ruta a un .txt**, según el ejemplo oficial).
- **Nombre del idioma**: pasamos el **nombre en inglés** (`Spanish`, `English`, …). Si
  el CLI esperara códigos ISO, ajustar `LANG_MAP`/`resolveLang` en `lib.mjs`.
- **Sin flags** para `instruct`, `voice_design`, `normalize`, `allow_non_verbal`,
  `speed`: hoy los **ignoramos** (con `X-Astraura-Ignored`) o los emulamos por cabecera
  (`speed` = remuestreo WAV, que **también cambia el tono**). Si una versión del CLI los
  añade, pasar a flags reales y poner `capabilities.instruct/voiceDesign` a `true`.
- **Salida**: asumimos **WAV mono 24 kHz** en la ruta de `-o`. `daemon.mjs` valida la
  cabecera RIFF antes de servir.
- **Script Metal** en macOS: usamos `./buildcpu.sh` como base (Metal vía GGML). Si el
  repo añade un `buildmetal.sh`, `install.mjs` puede preferirlo antes del fallback CPU.

---

*StarSeed OS · Adenda 77-voz · Motor de Voz Astraura (edge OmniVoice + nube k2-fsa).*
