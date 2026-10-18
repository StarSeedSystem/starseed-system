# Selkies en el nodo A1

Este servicio proporciona un entorno de escritorio Linux completo usando la plataforma Selkies (MPL-2.0), accesible a través del navegador.

## Estado predeterminado
El servicio está **apagado por defecto** (política de reinicio: `no`).

## Cómo encenderlo
Para iniciar el servicio:
```bash
docker compose -f compose-selkies.yml up -d
```

## Cómo apagarlo
Para detener el servicio:
```bash
docker compose -f compose-selkies.yml down
```

## Acceso
Una vez encendido, el servicio está disponible en la ruta `/apps-linux/` del nodo, accesible únicamente desde `127.0.0.1` a través de Caddy.
Se requiere la misma sesión que el resto del nodo (autenticación manejada por Caddy).

## Volumen de datos
Los datos persistentes se almacenan en el volumen llamado `selkies_data`.