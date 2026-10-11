# Servidor de Estaciones en Vivo para Oracle

Este servidor WebSocket proporciona un rele de estaciones para StarSeed OS, diseñado para reducir el consumo de recursos de Supabase en transmisiones con muchos oyentes.

## ¿Qué hace y por qué

En lugar de difundir las respuestas de hora a todos los oyentes mediante Supabase Realtime (lo que genera un costo proporcional al cuadrado del número de oyentes), este servidor maneja conexiones WebSocket individuales y proporciona respuestas de hora uno a uno. Cada oyente se conecta directamente a este servidor, evitando el uso de Supabase para las comunicaciones de tiempo real entre la estación y sus oyentes.

Esto es especialmente útil para audiencias grandes, como se describe en `architecture/estaciones-en-vivo-parametricas.md` sección 4.1, donde se indica que para reducir el coste de mensajes de Realtime se debe utilizar un servidor de estaciones en Oracle con respuestas de hora uno a uno.

## Instalación en VM de Oracle

1. Clonar el repositorio de StarSeed OS en la VM.
2. Navegar al directorio `servicios/estaciones-rele/`.
3. Instalar dependencias de producción:
   ```bash
   npm ci --omit=dev
   ```
4. El servidor escucha por defecto en el puerto 8787, o puede configurarse mediante la variable de entorno `PUERTO`.
5. Para ejecutarlo como servicio, crear una unidad systemd de ejemplo:

   ```ini
   [Unit]
   Description=Servidor de Estaciones en Vivo de StarSeed OS
   After=network.target

   [Service]
   Type=simple
   WorkingDirectory=/ruta/al/repositorio/servicios/estaciones-rele
   ExecStart=/usr/bin/node servidor.mjs
   Restart=always
   RestartSec=10
   Environment=PUERTO=8787

   [Install]
   WantedBy=multi-user.target
   ```

   Guardar este archivo como `/etc/systemd/system/starseed-estaciones-rele.service`, luego:
   ```bash
   systemctl daemon-reload
   systemctl enable starseed-estaciones-rele.service
   systemctl start starseed-estaciones-rele.service
   ```

6. Para terminar TLS detrás de Caddy, configurar un reverse proxy en Caddy que termine TLS y reenvíe el tráfico WebSocket sin cifrar a este servidor (o usar la extensión WebSocket de Caddy para proxying directo).

## Pruebas

Probar el servidor utilizando `wscat`:

```bash
npx wscat -c "ws://localhost:8787?tema=prueba"
```

Una vez conectado, cualquier mensaje enviado será reenviado al cliente (en este caso, solo usted, ya que es el único conectado). Para probar la difusión, abra múltiples conexiones con el mismo tema y verá que los mensajes se comparten entre todos los clientes conectados a ese tema.

También puede observar los mensajes de presencia (`{"t":"rele","n":<número>}`) que se envían cuando clientes se conectan o desconectan.