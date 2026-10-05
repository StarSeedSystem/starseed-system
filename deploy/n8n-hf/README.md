# n8n Community en un Space de Hugging Face

Puente propio de producción (ola 1005B, contrato `architecture/director-produccion.md` §10).
n8n Community corre en un Space **Docker privado**; los flujos viven versionados aquí
(`flujos/*.json`) porque el disco gratuito del Space no persiste: `arranque.sh` los
importa y activa en cada arranque.

## Qué hace

Tres webhooks firmados; el director (`scripts/puente/produccion_webhooks.py`) emite
POST JSON con cabecera `X-StarSeed-Firma: sha256=<hmac-sha256 del cuerpo>`:

| Ruta | Evento | Acción |
|---|---|---|
| `/webhook/publicada` | `produccion.publicada` | guarda las notas de versión en Drive si hay credencial; si no, termina sin error |
| `/webhook/pieza-lista` | `produccion.pieza_lista` | crea un **borrador** para redes; nunca publica solo (lo aprueba Alex) |
| `/webhook/revertida` | `produccion.revertida` | aviso por Telegram si hay credencial |

Cada flujo empieza con un nodo *Verificar firma* que compara el HMAC con el secreto
`PRODUCCION_WEBHOOK_SECRETO`; una firma mala descarta el evento en silencio.

## Cómo se despliega

1. Crear el Space (Docker, privado) o apuntar a uno existente con `N8N_HF_SPACE=usuario/nombre`
   en `~/.starseed/env`, y tener `HF_TOKEN` con permiso de escritura en ese mismo archivo.
2. `scripts/puente/n8n_hf.py desplegar --seco` para ver qué subiría.
3. `scripts/puente/n8n_hf.py desplegar` sube `Dockerfile`, `arranque.sh` y `flujos/`.
4. `scripts/puente/n8n_hf.py estado` / `despertar` para comprobar que arranca.

## Secretos que Alex pone en el Space (Settings → Secrets)

- `PRODUCCION_WEBHOOK_SECRETO` — secreto HMAC compartido con el director.
- Opcionales: `N8N_ENCRYPTION_KEY` (recomendada), y las credenciales de Drive y
  Telegram se dan de alta en la propia UI de n8n (nunca en este repo).

Las claves viven solo en el Space y en `~/.starseed/env`; aquí solo nombres de variable.
