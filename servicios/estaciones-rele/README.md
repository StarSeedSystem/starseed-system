# Servidor de Estaciones en Vivo

Este servidor implementa un relay de estaciones para StarSeed OS, permitiendo la transmisión en tiempo real de parámetros de audio (Omnifrecuencias y Audiomorphic) a través de conexiones WebSocket.

## ¿Por qué este servidor?

Las respuestas de hora con muchos oyentes gastan el cupo de Supabase Realtime. Este servidor permite que las estaciones se conecten a través de un relay dedicado, reduciendo el uso de Supabase al manejar la difusión de mensajes entre clientes conectados al mismo tema.

## Instalación en la VM de Oracle

1. Clonar el repositorio de StarSeed OS en la VM.
2. Navegar al directorio `servicios/estaciones-rele`.
3. Instalar las dependencias:
   ```bash
   npm ci --omit=dev
   ```
4. El servidor escuchará por defecto en el puerto 8787 (configurable vía variable de entorno `PUERTO`).

## Configuración de systemd (ejemplo)

Crear un archivo `/etc/systemd/system/starseed-estaciones-rele.service`:

```ini
[Unit]
Description=Servidor de estaciones en vivo de StarSeed OS
After=network.target

[Service]
Type=simple
WorkingDirectory=/ruta/al/repositorio/servicios/estaciones-rele
ExecStart=/usr/bin/npm start
Restart=always
Environment=PUERTO=8787
StandardOutput=append:/var/log/starseed-estaciones-rele.log
StandardError=append:/var/log/starseed-estaciones-rele-error.log

[Install]
WantedBy=multi-user.target
```

Luego ejecutar:
```bash
sudo systemctl daemon-reload
sudo systemctl enable starseed-estaciones-rele
sudo systemctl start starseed-estaciones-rele
```

## Prueba con wscat

Para probar el servidor, puedes usar `wscat` (instalable globalmente con `npm i -g wscat`):

```bash
wscat -c "ws://localhost:8787?tema=estacion-vivo:tu_tema_aqui"
```

Una vez conectado, cualquier mensaje de texto que envíes será difundido a otros clientes conectados al mismo tema.

## Notas importantes

- El servidor nunca registra el contenido de los mensajes, solo cuenta las conexiones por minuto para monitoreo.
- Las conexiones que no responden al ping cada 30 segundos son cerradas.
- El tema debe seguir el formato: `estacion-vivo:<identificador>` o `estacion-p:<identificador>` (privado), donde el identificador es una cadena de 8 a 80 caracteres alfanuméricos, incluyendo guiones bajos, guiones y dos puntos.

## Limitaciones actuales

Debido a la interfaz actual del módulo `salas.mjs`, el servidor no envía notificaciones de presencia (`{"t":"rele","n":<presencia−1 para cada uno>}`) al entrar o salir de una sala. Esta funcionalidad requiere modificaciones en `salas.mjs` que están fuera del alcance de este servidor.