# Servicio local de imágenes por neurona · IMG1011A

Servicio Python (biblioteca estándar) para generación de imágenes locales por capas,
con motor `stable-diffusion.cpp` (MIT) y ComfyUI si está corriendo. Reglas: nunca
`next build` con enjambre vivo; en Mac 8 GB cede ante el enjambre; en A1 limita
hilos; un trabajo a la vez; sin sondeos a Supabase; textos en español.

## Rutas

- `/salud` — estado del servicio.
- `/capacidades` — hierro (`HierroImg`) + modelos instalados + medidas de memoria.
- `POST /generar` — modelo, cuantización, semilla, ancho/alto, referencia opcional; devuelve PNG + procedencia.
- `POST /instalar` — solo con orden explícita; mide y guarda pico real.
- `/medidas` — medidas almacenadas.

## Token

Lee `IMAGENES_LOCAL_TOKEN` de archivo de entorno (`.env.local` o `/etc/starseed/env`);
solo `127.0.0.1`. Nada de claves en código.

## Guardián

En Mac: si el enjambre trabaja (`ps` con `starseed-enjambre`) y memoria libre baja
(`vm_stat` < 1600 MB), rechaza `/generar`. En A1: `CPU_COUNT` limitado a 2 hilos.

## Systemd (A1)

Ver `imagenes-local.service`: `ExecStart=/opt/starseed/imagenes-local/servicio.py`,
`MemoryMax=4G`, `Restart=always`.
