# Servidores de Cerebro · StarSeed OS

Un **cerebro** (sección *Cerebros* de StarSeed OS) empaqueta todo tu contexto y
puede **conectarse a un servidor real** para **ejecutar tareas** y
**sincronizar** su contenido. Un *servidor de cerebro* es cualquier servidor
HTTP que cumple este contrato.

> **Filosofía: software libre primero.** Todo lo que necesitas para tener tu
> propio cerebro es **open-source y auto-alojable**: el servidor es Python de la
> biblioteca estándar (sin dependencias), la IA opcional es **Ollama** (LLM
> open-source), la sincronización entre dispositivos es **Syncthing** y el
> empaquetado es un **Dockerfile** mínimo. Tú controlas tus datos, en tu equipo
> o en tu VPS. Nada es obligatorio ni propietario: cópialo, modifícalo y adáptalo.

## Contrato del servidor de cerebro

| Método | Ruta      | Cuerpo (JSON)        | Respuesta (JSON)                          |
| ------ | --------- | -------------------- | ----------------------------------------- |
| `GET`  | `/`       | —                    | banner JSON con info del servidor         |
| `GET`  | `/health` | —                    | `{ "ok": true, "name": "…" }`             |
| `POST` | `/run`    | `{ task, context? }` | `{ "ok": true, "result": …, "via": "…" }` |
| `POST` | `/sync`   | `{ bundle }`         | `{ "ok": true, "stored": … }`             |

- **`/run`** ejecuta una tarea (un texto/`task`, opcionalmente con `context`) y
  devuelve un `result`. El campo `via` indica si respondió la IA (`"ollama"`) o
  el stub de eco (`"stub"`). Aquí es donde conectas tu IA o tu agente.
- **`/sync`** recibe el *bundle* del cerebro (el mismo JSON portable que se
  exporta como `.brain.json`) y lo almacena.

## Servidores locales vs. remotos

- **Local** (tipo `local`, p. ej. `http://localhost:8800`): StarSeed OS lo
  contacta **directamente desde el navegador**. `localhost` está exento del
  bloqueo de contenido mixto, así que funciona aunque la app vaya por HTTPS. El
  servidor local **debe** enviar **CORS permisivo** (`Access-Control-Allow-Origin: *`
  y responder a `OPTIONS`). `local_brain.py` ya lo hace.
- **Remoto / Higgsfield / VPS / online**: se conectan a través del **proxy del
  bot** (`POST https://starseed-neurocortex.vercel.app/api/brain`). El proxy
  hace la petición desde el servidor (evita CORS) y usa la **clave guardada en
  tu bóveda** (referenciada por su *nombre*, `key_ref` — nunca el valor en
  claro). Al añadir un servidor Higgsfield, rellena el endpoint
  (`https://api.higgsfield.ai`) y el **nombre** de tu clave en la bóveda.

## Convertir este equipo en un cerebro (`local_brain.py`)

1. Descarga [`local_brain.py`](./local_brain.py). No necesita dependencias: solo
   Python 3 estándar.
2. Arráncalo:
   ```bash
   python3 local_brain.py
   ```
   Por defecto escuchará en `http://0.0.0.0:8800` (apto para VPS). En tu propio
   equipo accédelo como `http://localhost:8800`.
3. En **StarSeed OS → Servidores** (o **Cerebros**), edita (o crea) un cerebro y
   **añade un servidor** de tipo **"Servidor local"** con la URL
   `http://localhost:8800`.
4. Pulsa **Probar** (debería marcar *OK*), **Ejecutar** para mandarle una tarea
   y **Sincronizar** para enviarle el contenido del cerebro.

---

## Hostinger (o cualquier VPS) — paso a paso

Aloja tu cerebro en la nube para que esté siempre disponible.

1. **Crea un VPS** en Hostinger (o tu proveedor): elige una plantilla
   **Ubuntu 22.04/24.04**. Anota la **IP pública** y entra por SSH:
   ```bash
   ssh root@TU_IP
   ```
2. **Instálalo con una sola línea** (descarga el servidor y lo arranca):
   ```bash
   bash <(curl -s https://starseed-os.vercel.app/brain/install.sh)
   ```
   Para incluir la **IA libre (Ollama)** en el mismo paso:
   ```bash
   bash <(curl -s https://starseed-os.vercel.app/brain/install.sh) --with-ollama
   ```
   <details>
   <summary>¿Prefieres hacerlo manual?</summary>

   ```bash
   sudo apt update && sudo apt install -y python3
   curl -fsSL https://starseed-os.vercel.app/brain/local_brain.py -o local_brain.py
   HOST=0.0.0.0 PORT=8800 python3 local_brain.py
   ```
   </details>
3. **Abre el puerto 8800** para poder llegar desde fuera:
   ```bash
   sudo ufw allow 8800/tcp
   ```
   En Hostinger, abre **también** el puerto `8800` en el **firewall del panel**
   del VPS (sección de red/firewall).
4. **Regístralo en StarSeed → Servidores** con la URL `http://TU_IP:8800`.
   Pulsa **Probar** → debería dar *OK*.

> **Que siga corriendo tras cerrar SSH.** Lanza el servidor con `nohup` o, mejor,
> usa **Docker** (ver abajo) o un servicio `systemd`. Ejemplo rápido con nohup:
> ```bash
> nohup python3 local_brain.py > brain.log 2>&1 &
> ```

---

## Ollama — IA libre (LLM open-source) opcional

Para que `/run` dé respuestas reales de un modelo de lenguaje **open-source**:

1. **Instala Ollama** (o usa `install.sh --with-ollama`, que lo hace por ti):
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```
2. **Descarga un modelo** (p. ej. `llama3`):
   ```bash
   ollama pull llama3
   ```
3. **Define las variables de entorno** y arranca el servidor:
   ```bash
   export OLLAMA_URL=http://127.0.0.1:11434   # base de Ollama (este es el valor por defecto)
   export OLLAMA_MODEL=llama3                 # modelo a usar
   python3 local_brain.py
   ```

**Cómo funciona el hook:** en `POST /run`, si `OLLAMA_URL` está definido y Ollama
responde, el servidor reenvía tu `task` como *prompt* a
`POST {OLLAMA_URL}/api/generate` (`{model, prompt, stream:false}`) y devuelve
`{ "ok": true, "result": <texto del modelo>, "via": "ollama" }`. Si Ollama **no**
está configurado o no responde (timeout corto), cae automáticamente al **stub de
eco** y devuelve `{ ..., "via": "stub" }`. Nunca se cuelga ni rompe StarSeed.
Todo con la **biblioteca estándar** de Python (`urllib`), sin dependencias.

> ¿Otro modelo? Cambia `OLLAMA_MODEL` (p. ej. `mistral`, `phi3`, `qwen2`) tras
> hacer su `ollama pull`. ¿Quieres otra IA o un agente con herramientas? Edita la
> función `handle_run()` en `local_brain.py`.

---

## Docker — empaquetado mínimo

Hay un [`Dockerfile`](./Dockerfile) basado en `python:3.12-slim` (sin
dependencias).

```bash
# Construir la imagen
docker build -t starseed-brain .

# Ejecutar (servidor en http://localhost:8800)
docker run -p 8800:8800 starseed-brain

# Conectarlo a un Ollama que corre en el host (IA libre)
docker run -p 8800:8800 \
  -e OLLAMA_URL=http://host.docker.internal:11434 \
  -e OLLAMA_MODEL=llama3 \
  starseed-brain

# Persistir el bundle sincronizado (carpeta apta para Syncthing)
docker run -p 8800:8800 -v "$PWD/starseed_brain:/app/starseed_brain" starseed-brain
```

Variables de entorno soportadas por la imagen: `HOST`, `PORT`, `OLLAMA_URL`,
`OLLAMA_MODEL`.

---

## Sincronización multi-dispositivo con Syncthing

`/sync` guarda el último bundle en `./starseed_brain/bundle.json`. Si apuntas una
**carpeta de [Syncthing](https://syncthing.net/)** (sincronización de archivos
open-source, P2P y cifrada) a `./starseed_brain`, tu cerebro queda replicado
entre todos tus equipos: ejecuta `local_brain.py` en cada uno y todos compartirán
el mismo contexto sincronizado. Puedes cambiar la carpeta con la variable de
entorno `STARSEED_BRAIN_DIR`.

1. Instala Syncthing en cada dispositivo.
2. Comparte la carpeta `starseed_brain` entre ellos.
3. Arranca `local_brain.py` en cada equipo apuntando a esa carpeta
   (`STARSEED_BRAIN_DIR=/ruta/a/starseed_brain`).

---

## Variables de entorno (opcionales)

| Variable               | Por defecto                | Para qué                                   |
| ---------------------- | -------------------------- | ------------------------------------------ |
| `HOST`                 | `0.0.0.0`                  | Interfaz de escucha (0.0.0.0 sirve en VPS) |
| `PORT`                 | `8800`                     | Puerto                                     |
| `OLLAMA_URL`           | `http://127.0.0.1:11434`   | Base de Ollama (IA libre); si no responde, stub |
| `OLLAMA_MODEL`         | `llama3`                   | Modelo de Ollama a usar                    |
| `STARSEED_BRAIN_NAME`  | `Cerebro local`            | Nombre que devuelve `/health`              |
| `STARSEED_BRAIN_DIR`   | `./starseed_brain`         | Carpeta del bundle (Syncthing)             |

> Compatibilidad: también se aceptan las variables históricas
> `STARSEED_BRAIN_HOST` y `STARSEED_BRAIN_PORT` (tienen prioridad `HOST`/`PORT`).

Es software libre: cópialo, modifícalo y adáptalo a tu equipo.
