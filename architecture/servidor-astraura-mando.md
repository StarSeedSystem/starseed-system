# SOP · Administrador de servidor de Astraura 1.58 (pestaña «Servidor 1.58» de Genesis)

> Alex pidió, en Genesis, un administrador de servidor de Astraura 1.58 para la
> capa nube (hoy esta Mac; mañana Oracle u otro servidor) con un interruptor para mantenerla
> encendida sin que se duerma sola durante horas o días, y un botón para apagar solo la
> pantalla y ahorrar batería sin cortar la sesión ni los procesos. Código: tipos puros
> `src/lib/mando/servidor-astraura-tipos.ts`, servidor `src/lib/mando/servidor-astraura.ts`,
> ruta `src/app/api/mando/servidor/route.ts`, UI `src/components/mando/panel-servidor.tsx`
> (pestaña «Servidor 1.58», grupo «Infraestructura», justo después de «Neurona»).

## 1. Propósito

Antes de esto, «mantener la Mac de servidor» era un conocimiento tribal (caffeinate a mano en
una Terminal que alguien podía cerrar sin querer) y no había un solo sitio para ver, a la vez,
si Astraura 1.58 seguía viva, si el túnel de esta Mac era el que el resto del OS estaba usando,
y qué servicios `com.starseed.*` seguían en pie. Esta pestaña junta las tres cosas y añade el
primer paso hacia un servidor que **no** sea esta Mac: un registro de servidores con Oracle
Always Free como sugerencia explicada, listo para sondear en cuanto exista.

## 2. Qué enseña cada sección

1. **Modo servidor · esta Mac** — el interruptor «Mantener encendida», el botón «Apagar
   pantalla» y la nota colapsable «Con la tapa cerrada» con los comandos exactos de
   `disablesleep`.
2. **Astraura 1.58 · capa nube** — backend (ping y latencia), BitNet (vivo/dormido y hace
   cuánto se usó por última vez), el motor `llama-server`, el «fondo» (ciclo, descanso,
   aplazadas/cedidas) y el túnel (activo, proveedor, huella, si coincide con lo publicado) más
   el destino actual de la capa nube.
3. **Procesos de Genesis** — todos los `com.starseed.*` con su pid o su último código
   de salida, botón «Reiniciar» solo en los reiniciables, y el estado del enjambre + el tope
   del gobernador.
4. **Servidores de Astraura** — tarjeta de «Esta Mac» (host, uptime, carga, RAM libre), tarjeta
   «Oracle Always Free» explicando qué/por qué/cómo mientras no haya ninguno guardado, tarjetas
   de los servidores guardados con «Sondear»/«Quitar», y el formulario «Añadir servidor».
5. **Avisos** arriba del todo cuando `calcularAvisos()` tiene algo que decir (batería, túnel
   desincronizado, backend/BitNet caídos, tapa cerrada sin `disablesleep`, orquestador parado).

## 3. `caffeinate -i -m -s`, no `-d`, y por qué `KeepAlive`

El interruptor «Mantener encendida» instala el launchd `com.starseed.despierto`
(`~/Library/LaunchAgents/com.starseed.despierto.plist`) con:

```xml
<key>ProgramArguments</key>
<array>
    <string>/usr/bin/caffeinate</string>
    <string>-i</string>
    <string>-m</string>
    <string>-s</string>
</array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ProcessType</key><string>Interactive</string>
```

- **`-i`** (no idle system sleep), **`-m`** (no disk idle sleep) y **`-s`** (no system sleep
  mientras esté en corriente) son justo lo que pidió Alex: la Mac no se duerme sola. **Sin
  `-d`**: esa flag impide que se apague la PANTALLA, y el punto entero del botón «Apagar
  pantalla» es que la pantalla sí se pueda apagar para ahorrar batería mientras el servidor
  sigue en marcha.
- **`KeepAlive: true`** para que launchd relance `caffeinate` si muriera por lo que sea (no
  hay un demonio vigilando al vigilante); **`RunAtLoad: true`** para que sobreviva a un
  reinicio de sesión sin que Alex tenga que volver a tocar el interruptor.
- **`ProcessType: Interactive`**, igual que el resto de demonios interactivos de Genesis (ver
  CLAUDE.md §«Modo ligero, oído residente y BitNet estable»): `Background` hace que macOS
  ahogue CPU/I/O a procesos que en realidad importan que respondan rápido.

Activar/desactivar hace `launchctl load -w`/`unload -w` (ignorando el error si ya estaba en el
estado pedido) y guarda `~/.starseed/despierto.json` (`{activo, desde}`) para que el panel
pueda decir «Despierta desde hace 3 h 12 min» sin depender de que el proceso siga vivo para
saber cuándo empezó.

## 4. `pmset displaysleepnow` — apagar solo la pantalla

El botón «Apagar pantalla» ejecuta `pmset displaysleepnow` sin `sudo`: apaga la pantalla YA,
sin tocar ningún ajuste de reposo ni cortar la sesión. Los procesos —el enjambre, Astraura, el
propio Genesis— siguen exactamente igual; mover el ratón o tocar una tecla enciende la pantalla
otra vez.

## 5. La tapa cerrada es harina de otro costal

`caffeinate -s` evita el reposo del sistema, pero macOS duerme la Mac al cerrar la tapa si no
hay pantalla externa, **da igual lo que diga cualquier aserción de `caffeinate`**: eso es un
comportamiento aparte, atado al firmware/SMC, no al reposo normal. La única forma honesta de
aguantar días con la tapa cerrada es desactivar el reposo del todo:

```bash
sudo pmset -a disablesleep 1   # activa: nunca se duerme, ni con la tapa cerrada
sudo pmset -a disablesleep 0   # desactiva: vuelve al comportamiento normal de macOS
```

El panel lo explica en la nota colapsable «Con la tapa cerrada», con botón de copiar para cada
comando y el estado actual (`reposoDesactivado`, leído de la línea `SleepDisabled` de
`pmset -g`). Es una acción manual a propósito — pide la contraseña de la Mac, así que el
panel **enseña el comando**, no lo ejecuta por Alex.

## 6. Regla de huellas: la URL del túnel nunca sale de la Mac

`GET /api/mando/servidor` **jamás** devuelve la URL del túnel de Astraura (el `active_tunnel.json`
que publica `scripts/puente/publicar_tunel_astraura.py`), ni la del túnel que el resto del OS
ve en Supabase (`tunelPublicado()` de `src/lib/astraura/destino-nube.ts`). Se comparan y se
muestran solo como **huella**: los 12 primeros hex de `sha256(url)` (`huellaCorta()`, en
`servidor-astraura.ts`, porque necesita `node:crypto` — por eso no vive en el módulo de tipos
puros). `nube.coincide` es `true`/`false`/`null` (si falta alguna de las dos huellas) y
`calcularAvisos()` avisa cuando no coinciden: «esta Mac ya publicó un túnel nuevo, el OS todavía
no lo ha recogido».

La única URL que el panel SÍ enseña es la de un servidor del **registro** (`servidores[].url`):
esa es la propia dirección que Alex dio para su Oracle/VPS, no un secreto — se valida con
`validarServidor()` (https, o http solo en LAN/`*.local`; nunca usuario:contraseña, query,
fragmento, ruta, ni nada con pinta de `key=`/`token=`/`sk-`).

## 7. Registro de servidores

`starseed_memory_root/mando/servidores-astraura.json` (carpeta NO versionada, se crea la
primera vez que hace falta). Siempre aparecen, calculados:

- `{id:"esta-mac", nombre:"Esta Mac", tipo:"esta-mac", activo:true}` — primero, siempre.
- `{id:"oracle-pendiente", tipo:"oracle", pendiente:true}` — solo mientras no haya ningún
  servidor de tipo `oracle` guardado; es la tarjeta que explica qué/por qué/cómo y enlaza a
  <https://www.oracle.com/cloud/free/>.

Los guardados llevan `{id, nombre, tipo, url, creado, ultimaSonda?}`; `ultimaSonda` es el
resultado de la última vez que se pidió `GET <url>/api/ping` (5 s de timeout), con `ok`, `ms`,
`t` y `detalle`. Escritura atómica (`.tmp` + `rename`), igual que el resto de JSON de Genesis.

## 8. Próximo paso: Oracle

Hoy la capa nube de Astraura es siempre esta Mac (por túnel) o un `ASTRAURA_CLOUD_URL` propio
(Cloud Run u otro despliegue fijo — ver `src/lib/astraura/destino-nube.ts`). El registro de
servidores de esta pestaña ya está preparado para el siguiente paso: en cuanto Alex cree la
cuenta gratuita de Oracle y añada el servidor aquí, el plan es:

1. Publicar ahí el destino de la capa nube (variante de `ASTRAURA_CLOUD_URL`, o un nuevo campo
   del registro marcado como «destino activo»), para que dejar de depender del túnel de esta
   Mac sea un cambio de configuración, no de código.
2. Usar ese mismo servidor como **réplica de Genesis**: los mismos endpoints `/api/mando/*`,
   detrás del mismo `guardianMando`, sirviendo desde una máquina que no se apaga con la Mac de
   Alex.

Nada de esto está construido todavía — esta pestaña dice la verdad sobre eso: la tarjeta de
Oracle es honesta en que hoy es «pendiente», no una simulación de que ya funciona.

## 9. Lo que NUNCA hace este panel

- Reiniciar `com.starseed.mando` desde sí mismo (mataría al servidor que está contestando la
  petición). La lista blanca de reiniciables vive en `ETIQUETAS_REINICIABLES`
  (`servidor-astraura-tipos.ts`) y **no** incluye `mando`.
- Usar `pgrep -l`/`-fl` ni `ps -E` para detectar el enjambre: esos comandos imprimen el entorno
  de cada proceso, con secretos. Se usa `ps -axo args=` y se busca la subcadena
  `starseed-enjambre` en la línea de comando.
- Devolver rutas absolutas del disco, claves, tokens o el contenido de ningún `.env`.
