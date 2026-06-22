# Servidores de Cerebro · StarSeed OS

Un **cerebro** (sección *Cerebros* de StarSeed OS) empaqueta todo tu contexto y
puede **conectarse a un servidor real** para **ejecutar tareas** y
**sincronizar** su contenido. Un *servidor de cerebro* es cualquier servidor
HTTP que cumple este contrato.

## Contrato del servidor de cerebro

| Método | Ruta      | Cuerpo (JSON)        | Respuesta (JSON)              |
| ------ | --------- | -------------------- | ----------------------------- |
| `GET`  | `/health` | —                    | `{ "ok": true, "name": "…" }` |
| `POST` | `/run`    | `{ task, context? }` | `{ "ok": true, "result": … }` |
| `POST` | `/sync`   | `{ bundle }`         | `{ "ok": true, "stored": … }` |

- **`/run`** ejecuta una tarea (un texto/`task`, opcionalmente con `context`) y
  devuelve un `result`. Aquí es donde conectas tu IA o tu agente.
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
   Escuchará en `http://127.0.0.1:8800` e imprimirá el contrato.
3. En **StarSeed OS → Cerebros**, edita (o crea) un cerebro y **añade un
   servidor** de tipo **"Servidor local"** con la URL `http://localhost:8800`.
4. Pulsa **Probar** (debería marcar *OK*), **Ejecutar** para mandarle una tarea
   y **Sincronizar** para enviarle el contenido del cerebro.

### Conecta tu propia IA

En `local_brain.py`, edita la función `handle_run(task, context)` — está marcada
con `# TODO: conecta aquí tu IA/agente local`. Ahí puedes enchufar un modelo
local (Ollama, llama.cpp…), un agente, herramientas o RAG sobre el bundle
sincronizado. Devuelve un `dict` y se enviará como `result`.

## Sincronización multi-dispositivo con Syncthing

`/sync` guarda el último bundle en `./starseed_brain/bundle.json`. Si apuntas una
**carpeta de [Syncthing](https://syncthing.net/)** a `./starseed_brain`, tu
cerebro queda replicado entre todos tus equipos: ejecuta `local_brain.py` en cada
uno y todos compartirán el mismo contexto sincronizado. Puedes cambiar la carpeta
con la variable de entorno `STARSEED_BRAIN_DIR`.

## Variables de entorno (opcionales)

| Variable               | Por defecto                | Para qué                         |
| ---------------------- | -------------------------- | -------------------------------- |
| `STARSEED_BRAIN_HOST`  | `127.0.0.1`                | Interfaz de escucha              |
| `STARSEED_BRAIN_PORT`  | `8800`                     | Puerto                           |
| `STARSEED_BRAIN_NAME`  | `Cerebro local`            | Nombre que devuelve `/health`    |
| `STARSEED_BRAIN_DIR`   | `./starseed_brain`         | Carpeta del bundle (Syncthing)   |

Es software libre: cópialo, modifícalo y adáptalo a tu equipo.
