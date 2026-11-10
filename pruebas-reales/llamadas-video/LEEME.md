# Banco real de vídeo de llamadas (LLA1110C)

Dos páginas de Chromium («mac» y «tableta») con el `MotorLlamada`, el `AdaptadorMotor` y la `SuperficieLlamada`
de verdad, la cámara falsa de Chromium y el aire simulado entre ellas (`BroadcastChannel`):

- **ble**: sin ruta IP. La señalización pasa, pero se tiran los candidatos ICE: WebRTC negocia y no conecta nunca.
  La voz y el vídeo ligero van por un enlace de datos con colas de voz y de vídeo como el Bluetooth (voz primero,
  bytes contados hasta el acuse de cada escritura).
- **fantasma**: el aparato cree que puede haber IP (Wi‑Fi encendido) y no la hay: la pista WebRTC llega `muted`.
- **webrtc**: con IP: el vídeo va por WebRTC y se ve en el `<video>`.
- **lento**: enlace de ≈136 kb/s con acuse por escritura (la Mac midió 97–325).
- **unaalavez**: HIPÓTESIS sin confirmar en la Mac: WebKit no abre una segunda cámara con otra abierta.

`mediaDevices` se envuelve para imitar a la Mac: etiquetas vacías hasta el primer permiso de cámara, la «Desk View»
del iPhone (la cámara falsa n.º 1, casi negra) como la que abre el sistema sin `deviceId`, y la integrada
(«FaceTime HD Camera», la n.º 0, verde con movimiento).

Cada caso mira **píxeles** de una captura real del mosaico remoto y de la vista previa: brillo medio, fracción de
píxeles no oscuros y cambio entre dos capturas a 0,9 s (imagen viva = no negra y moviéndose).

## Cómo correrlo (en un contenedor con Node 22 y Chromium de Playwright)

```sh
# 1. Paquetes del banco (no hace falta el node_modules entero del repo)
mkdir -p /tmp/banco && cd /tmp/banco && npm init -y >/dev/null
npm i react@19.0.0 react-dom@19.0.0 lucide-react@0.475.0 framer-motion@12 clsx@2 tailwind-merge@3 tailwindcss@3.4 esbuild@0.24 sonner@2
# 2. Construir la página (esbuild + Tailwind); lo que el banco no usa (Supabase, Tauri…) entra vacío
node pruebas-reales/llamadas-video/construir.mjs /tmp/banco/node_modules
# 3. Correr (capturas y registro en la carpeta que se diga; sale con 1 si algo falla)
node pruebas-reales/llamadas-video/correr.mjs /tmp/capturas /ruta/a/playwright/index.mjs
# Un solo caso: CASO=ble | unaalavez | fantasma | webrtc | lento
```

Casos combinados de LLA1110D (motor con carriles + ventana real en los dos lados): `CASO=carriles` (solo Bluetooth →
aparece la IP → se corta → vuelve, con muestras de brillo cada ~0,35 s para cazar huecos negros, la voz quieta en el
enlace de datos y la línea «Voz: … · Vídeo: WebRTC»), `CASO=tres` (tres llamadas con la cámara de quien llama) y
`CASO=sinservidor` (llama la tableta, sin servidor y con vídeo). La IP dinámica: `banco.ip(true|false)`; el corte se
simula con el estado ICE en «failed» y los emisores inactivos. `banco.stats()` da transceptores y cuadros por conexión.

Deja `NN-*.png`, `resultados.json` y `registro.json` (las líneas que irían a `enlaces.log`: cámara, contadores
`video-datos tx … motivos=…`, `visibilidad …`). `salida/` y `capturas/` no se suben.

Lo que Chromium no puede enseñar (WKWebView de la Mac, WebView de Android) queda en esas mismas líneas del registro
del enlace en los aparatos.
