# Banco real de llamadas: carriles por flujo (LLA1110D)

Dos motores de llamada **de verdad** (`MotorLlamada`) en una página de Chromium, con `RTCPeerConnection` reales y la
cámara y el micro falsos de Chromium, unidos por una señalización en bucle y por un enlace de datos simulado (como el
Bluetooth L2CAP: retardo, capacidad y pérdida en `banco.datos`). La ruta IP se controla con `banco.red`:

- `red.ip = false`: la señalización no entrega candidatos ICE (como por Bluetooth: ICE no conecta) y, en una conexión
  ya hecha, el estado ICE se fuerza a `failed` (el corte se simula a nivel de estado: los paquetes siguen pasando);
- `red.ipVista.A/B`: lo que cada motor CREE (`hayRutaIp`), para reproducir la prueba 33 (IP de verdad, «sin IP» visto);
- `red.retardoIceMs` (1.5 s): lo que tarda ICE en un aparato.

## Correrlo (en un contenedor con Chromium y Playwright; no hace falta `npm install` del repo)

```sh
cd pruebas-reales/llamadas-medio
node construir.mjs ../.. salida/banco.js          # esbuild con el alias @/ (entra src/lib/llamadas y, MLL1111C, malla/senales-red y malla/cola-timbre)
cp index.html salida/
node correr.mjs salida todos 300 > resultados.json # o: aleteo, ip-aparece, choque, video, segunda, corte-ip, sin-servidor, paso-ip, paso-ip-silencioso, timbre-cola, video-sube, wifi-directo
```

Para comparar con otro árbol (p. ej. main): `node construir.mjs /ruta/al/otro/repo salida-viejo/banco.js`.
Necesita `esbuild` y `playwright` (globales o en `/opt/npm-tools`). No toca el Mac ni la red.

## Escenarios

| Escenario | Qué mira |
|---|---|
| `aleteo` | Prueba 33, llamada 3: IP real pero «sin IP» visto y enlace de datos arriba. Reinicios de la voz por datos. |
| `ip-aparece` | Solo Bluetooth 20 s, luego aparece la IP y sigue N s: carriles por flujo, ofertas sin IP, vídeo con cuadros y píxel no negro. |
| `choque` | Los dos encienden/apagan la cámara a la vez 5 veces: colisiones y convergencia. |
| `video` | Vídeo por WebRTC: A enciende, B enciende, A apaga y enciende: `framesDecoded` y píxel no negro. |
| `segunda` | Tres llamadas seguidas en la misma página: la cámara enciende en todas. |
| `corte-ip` | Voz por Bluetooth + vídeo por WebRTC; la IP se corta 20 s y vuelve. |
| `sin-servidor` | Llamada sin tema de Supabase, solo canal directo y sin IP: contestada en los dos y voz por datos. |
| `paso-ip` | (MLL1111C) Dos vías arriba, voz por WebRTC; corte de IP con señal del sistema (`offline`, ICE «failed»): ms hasta que la voz suena en los dos. |
| `paso-ip-silencioso` | (MLL1111C) Igual, pero ICE sigue «conectado» y solo dejan de entrar bytes (`red.modoCorte = "silencio"`): solo la comprobación de vida lo ve. |
| `timbre-cola` | (MLL1111C) Timbre sin ninguna vía; a los 5 s liga una (`banco.abrirVia`): debe salir solo. |
| `video-sube` | (MLL1111C) Contesta sin ruta IP y aparece a los 3 s: ms desde que WebRTC conecta hasta que el vídeo sube (vídeo ligero de mentira). |
| `wifi-directo` | (MLL1111C) Wi-Fi directo y router simulados con su medida (`banco.extras`): los datos toman el que más mide, con histéresis. |

Cada caso nuevo devuelve `pasa`. El árbol viejo se construye sin `cola-timbre` (el módulo llega vacío y el banco usa el
intento único de antes).

No está en CI (no hay trabajo de extremo a extremo con navegador). Lo que el banco NO cubre: radios reales, el
transporte universal, el timbre por la malla y las vistas de la ventana.
