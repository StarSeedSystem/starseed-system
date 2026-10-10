# StarSeed Link · el kit para vincular cualquier app con StarSeed OS

Versión 1.0.1 (2026-10-10). Contrato: `architecture/vinculo-apps-starseed-link.md`.

Es un paquete pequeño de TypeScript, sin dependencias: usa las APIs del navegador (fetch, WebCrypto,
WebRTC y BroadcastChannel) y el cliente de Supabase que la app ya tenga (`@supabase/supabase-js` 2.x).
Sirve igual en una web, una PWA, Capacitor (Android/iOS), Electron o Tauri. Hoy lo usan
Omnifrecuencias (`services/starseed-link/`) y Audiomorphic (`lib/starseed-link/`).

## Qué da

| Función | Para qué |
|---|---|
| `config()` / `configSincrona()` | Saber a qué base de datos del OS conectarse. Se lo pide a `GET <os>/api/vinculo/config`; si no responde, usa lo último que guardó, luego el entorno y por último el respaldo de la app. Los proyectos retirados se descartan siempre. |
| `entrar()` / `alCambiarCuenta()` | Entrar con la misma cuenta del OS, con correo o con @usuario. |
| `presencia()` | Que la app aparezca como un MEDIO de su neurona en el panel de Neuronas, en vivo. |
| `estacion.publicar()` / `seguir()` / `retomar()` / `directorio()` | Transmitir o seguir en directo una estación pública o privada del OS, con el mismo enlace. |
| `relojComun()` | El reloj común de las estaciones (método NTP sobre el propio canal). |
| `crearTransporte().enviar()` | Mandar mensajes entre los medios de la cuenta. Usa el camino más directo: enlace local, otras pestañas o internet. |
| `iniciarEmparejamiento()` / `responderEmparejamiento()` | Enlazar dos aparatos sin internet con un código (o QR). Es compatible con las neuronas del OS. |
| `puenteOS()` | El lado de la app del puente `postMessage` cuando la app se abre dentro del OS. |
| `validarManifiesto()` | Comprobar lo que la app declara para registrarse en PoliGenesis o Genesis. |
| `motivoDe(r)` | El motivo de un `{ ok: false }`. Funciona también en apps que compilan sin «strict». |

## Cómo se añade a una app

1. Copia el kit con su huella, desde la raíz del OS:
   `bash integraciones-de-codigo/starseed-link/copiar-a-app.sh <carpeta de la app>/lib/starseed-link`.
   La copia no se edita: cada arreglo se hace aquí y se vuelve a copiar. El `LEEME.md` de la copia
   guarda la versión y las sumas sha256.
2. Crea el cliente de Supabase con la config del kit. Nunca escribas la base de datos a mano en el código:

   ```ts
   import { config, configSincrona } from './starseed-link/config';
   const ENTORNO = { url: import.meta.env.VITE_SUPABASE_URL ?? '', anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '' };
   const c = configSincrona({ entorno: ENTORNO, respaldo: PROYECTO_ACTIVO }); // respaldo: url + anon (públicas)
   export const supabase = createClient(c.supabase!.url, c.supabase!.anonKey, { auth: { storageKey: 'starseed.auth' } });
   void config({ entorno: ENTORNO, respaldo: PROYECTO_ACTIVO }); // en segundo plano: vale desde el próximo arranque
   ```

3. Escribe un adaptador propio de la app (como `vinculoStarSeed.ts` en las dos apps). Lleva el id de
   la app, la conversión de su estado a `ParametrosSesion` y de vuelta, `publicar` y `seguir` con
   `{ app, cliente }`, y `presencia({ cliente, app })` cuando hay sesión iniciada.
4. Para que suene o se vea a la vez en todos los aparatos, programa el inicio y la pausa con la foto
   de la estación (`ancla`, `proxima.t`) y `ahoraComun()` o `aLocal()`. No uses la hora de llegada
   del mensaje. Ejemplos:
   - Omnifrecuencias abre su salida de audio con la hora del AudioContext (`programarPuerta`).
   - Audiomorphic anima la espiral con la posición común (`tiempoComun`).
5. Publica el manifiesto en `<web>/starseed-link.json`. Los manifiestos de las dos apps están en
   `apps/`.

## Pruebas

```bash
npx vitest run --config integraciones-de-codigo/starseed-link/vitest.config.ts   # 35 pruebas
npx tsc -p integraciones-de-codigo/starseed-link/tsconfig.json                    # estricto
npx tsc -p integraciones-de-codigo/starseed-link/tsconfig.laxo.json               # sin «strict», como las apps
```

Las pruebas cubren lo siguiente:
- La config.
- La cuenta.
- Los manifiestos.
- Las conversiones.
- Una estación de punta a punta sobre un Supabase en memoria, pública y privada, con su control y su retoma.
- El transporte.
- La presencia.
- El puente con el OS.
- La compatibilidad con los módulos del OS (las mismas firmas, temas, enlaces y códigos, y la misma sesión en los dos sentidos).
- Los temporizadores del navegador, que lanzan «Illegal invocation» si se llaman con otro `this`.
- El aviso en el instante común de cada acción programada.
- Que el estado de una estación visual grande quepa en 24 KB.

## Lo que se aprendió al montarlo (2026-10-10)

- **`setTimeout` guardado en un campo y llamado como método** lanza «Illegal invocation» en el
  navegador, pero no en Node. La estación se creaba y el panel no arrancaba. Ahora va ligado a
  `globalThis` y hay una prueba con temporizadores estrictos.
- **Las acciones se programan 600 ms en el futuro.** Quien pinta la foto la veía «esperando» aunque
  ya sonara. Ahora `suscribir` avisa también en el instante común de la próxima acción.
- **El estado de una estación visual pasaba de 24 KB** (85 KB medidos con 80 cambios), y quien
  llegaba tarde no podía leerlo. Ahora la línea se compacta también por tamaño. El OS lo lee igual,
  y está probado contra sus módulos.
- **`if (!r.ok) r.motivo` no compila en apps sin «strict».** El kit usa `in` para estrechar el tipo
  y exporta `motivoDe`.
