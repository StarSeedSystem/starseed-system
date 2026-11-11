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

Casos de LLA1111A:

- `CASO=webkit`: la Mac de la prueba.35. `banco.camaras.rechazan` (expresión sobre la etiqueta) marca las cámaras con un
  solo ritmo, 30,00003 fps (la FaceTime y la virtual): un `frameRate` obligatorio que lo deje fuera (`max: 30`) o un
  `facingMode` exacto da OverconstrainedError con `constraint`, con o sin `deviceId`; sin `deviceId` el «sistema» abre
  la primera que cumpla empezando por `porDefecto`. `banco.camaras.regla = "id+tamano"` prueba la otra hipótesis
  (`deviceId` exacto junto a ancho/alto). `banco.camaras.ocupadas` da NotReadableError. Con el código anterior salen las
  mismas líneas que en la Mac (`cambio-a-preferida-fallo … OverconstrainedError`, «No encontramos ninguna cámara»).
- `CASO=ventana`: cada pestaña abierta («Puertos», «Medio», «Gente», «Invitar», «Grabar», «Astraura», «Chat») a
  320×568, 360×640, 390×844, 640×360 y 1280×800, más pantalla completa: mide que ninguna caja quede fuera de la
  pantalla salvo dentro de un antepasado desplazable, que los botones redondos estén enteros en ≤ 2 filas, que la
  cabecera y «Colgar» se vean y que la línea de estado salga una vez; y el carril por flujo de «Medio».
  `banco.marco(w, h)` pone el marco del lado al tamaño de la pantalla que se imita.

`CASO=carriles` (LLA1111A) mide cada muestra de dos maneras: la captura de Playwright y la página (lo que está
encima en el mosaico: el lienzo leído con `getImageData`, o el `<video>` dibujado en un canvas con su cuenta de
`requestVideoFrameCallback`), y cuenta cuadros congelados. `REPETIR=n` lo corre n veces para sacar una tasa. Al fallar
deja la serie de muestras alrededor del negro, la pista del `<video>`, las pistas recibidas, los emisores de la Mac y
`banco.probarRecepcion()` (cuadros recibidos/decodificados y si un `<video>` nuevo pinta esa pista).

LLA1111H · qué cuenta como negro: el vigía de la página (cada cuadro) o una muestra de la página en negro, o DOS capturas de Playwright
seguidas en negro. Una captura oscura SUELTA con la página a 0 es la captura vacía de Chromium sin cabeza: se informa y no decide.
Al fallar un tramo se imprime `SONDA …` (cada ~0,35 s: estado ICE/conexión REAL —sin el «failed» fingido del corte—, cuadros y bytes
que entran y salen, par ICE elegido) y, la primera vez, `RESCATE …` (`banco.rescate()`: estado de la pista y del transceptor,
estadísticas del decodificador y qué recupera la imagen: un `<video>` nuevo, una copia de la pista, apagarla y encenderla, o un
lector directo `MediaStreamTrackProcessor`). Con eso se separó «la pista no entrega cuadros» de «el `<video>` no pinta».

Deja `NN-*.png`, `resultados.json` y `registro.json` (las líneas que irían a `enlaces.log`: cámara, contadores
`video-datos tx … motivos=…`, `visibilidad …`). `salida/` y `capturas/` no se suben.

Lo que Chromium no puede enseñar (WKWebView de la Mac, WebView de Android) queda en esas mismas líneas del registro
del enlace en los aparatos.
