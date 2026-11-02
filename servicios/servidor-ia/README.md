# Servidor propio de IA

Servidor Hono OpenAI-compatible que une los motores locales de una neurona (BitNet 1.58, TurboFieldfare, Ollama, LM Studio, Laya) para la topología `servidor-propio`.

## Arranque con launchd (macOS)

El servicio queda apagado por defecto. Para gestionarlo usa el guion del Puente.

```bash
bash scripts/puente/servidor_ia_servicio.sh encender
bash scripts/puente/servidor_ia_servicio.sh estado
bash scripts/puente/servidor_ia_servicio.sh apagar
```

El guion copia `servicios/servidor-ia/launchd/com.starseed.servidor-ia.plist` a `~/Library/LaunchAgents`, sustituye la ruta del repositorio y ejecuta `launchctl bootstrap/bootout gui/$(id -u)`.

## Puerto y seguridad

* Puerto por defecto: **4480**
* Sin `STARSEED_SERVIDOR_IA_TOKEN` el servidor solo escucha en `127.0.0.1`.
* Para exponerlo fuera de la máquina define `STARSEED_SERVIDOR_IA_TOKEN` y usa `STARSEED_SERVIDOR_IA_HOST` distinto de localhost. Las rutas `/v1/*` y `/motores` requieren Bearer.

Variables de entorno soportadas:
* `STARSEED_SERVIDOR_IA_PUERTO` (4480)
* `STARSEED_SERVIDOR_IA_HOST` (127.0.0.1)
* `STARSEED_SERVIDOR_IA_TOKEN`
* `STARSEED_SERVIDOR_IA_ORIGENES`

Logs: `/tmp/starseed-servidor-ia.log`.

Ejecución manual:

```bash
node servicios/servidor-ia/bin/servidor-ia.mjs
```
