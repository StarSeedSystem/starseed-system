# MetaGenesis autónoma · sin Claude y sin esta Mac (IND1029)

**Alex (2026-10-29), con el 3 % del crédito semanal de Claude:** «enruta los procesos activos de dirección que usen
Claude a Hermes… usaremos el chat principal como canal del chat del director de toda la dirección general de
MetaGenesis, completamente vinculado con todas las herramientas, conectores, memorias y contextos, incluyendo los
accesos y permisos de dirección… y mejora la independencia de MetaGenesis con o sin esta computadora… Hermes lo
usemos como la herramienta para conectar, sincronizar y vincularlo con el Puente de Mando, pero que no sea
dependiente. El autodesarrollo y las tareas de MetaGenesis y sus contenedores activos, con los accesos y permisos
de publicación, deben ser independientes, autogestionados en los servidores disponibles inteligentemente, con los
mismos datos de los medidores desde cualquier neurona de la cuenta y desde cualquier dispositivo (automeshrouting).»

## 1. Hecho el 29-10 (DIR1029A, `6c5cfe389`)

- **La dirección va por Hermes:**
  - interruptor `~/.starseed/direccion-motor.json` (`{"motor": "hermes", "sesion": <id>}`) o `STARSEED_DIRECCION_MOTOR`;
  - el cartero contesta por Hermes lo que va a `claude-mac` o `claude-cowork`, en la sesión «Dirección MetaGenesis»;
  - `opus_director.consultar` pregunta a Hermes;
  - el chat del director arranca en `hermes/predeterminado`.
- **Hermes:**
  - modelo `freellmapi/auto` con las 10 pasarelas de respaldo de `enrutar-hermes.py`: el mismo autoenrutado y las
    mismas APIs que MetaGenesis;
  - MCP `starseed-director` (chat del director y producción), más Vercel y Supabase.
- **Reparado:** la app de Hermes se quedó en la página de recuperación tras actualizarse sola. Corría el paquete
  viejo mientras se reemplazaba el nuevo; se reinició.

## 2. La regla

- Ningún proceso de dirección necesita Claude, ni la Mac, ni Hermes para seguir.
- Hermes es el puente (chat, Telegram, herramientas), no el motor.
- La dirección (orquestador, autocuración, autopublicación, autodesarrollo, cartero y reconstructor) corre donde
  haya un **líder** de la cuenta:
  - el A1 siempre encendido;
  - la Mac cuando está;
  - cualquier neurona capaz.
- Todos leen y escriben el **mismo estado**.

## 3. Piezas

| Pieza | Qué hace |
|---|---|
| **Líder de dirección** | Un arriendo con caducidad (3 min) en la puerta de datos del A1. Solo el líder lanza, publica y decide; los demás miran. Si nadie lo renueva, lo toma la neurona siguiente por prioridad (A1 › Mac › otras). Sin puerta, cada uno sigue en local como hoy |
| **Estado compartido** | `progreso.json`, las colas, el chat del director y una foto de los medidores, cada minuto en la puerta (los escribe el líder). Genesis, en cualquier dispositivo, lee de la puerta cuando lo local es viejo o no existe |
| **Dirección en el A1** | `oracle_nodo direccion --aplicar` instala en el A1 (systemd, `# requiere:`) el orquestador, la autocuración, la autopublicación, el cartero y el gateway de Hermes. Las claves vienen de la bóveda del A1, nunca del repo |
| **Builds sin la Mac** | El CI sube el `.next` como artefacto, y el reconstructor de la Mac lo descarga en vez de compilar (hoy Genesis se quedó sin build: la Mac no puede compilar) |
| **Publicación autónoma** | La autopublicación corre en el líder, con un token de despliegue con permisos mínimos que crea Alex (paso único suyo, con enlace y comando) |
| **Genesis desde cualquier dispositivo** | La Genesis publicada lee los medidores de la cuenta desde la puerta, con la sesión de la cuenta y solo para su dueño (o quien la cuenta autorice) |
| **Automeshrouting** | Cada neurona anuncia lo que puede (CPU, RAM, GPU, red), y el líder reparte trabajadores y servicios entre neuronas, contenedores y nube por capacidad y coste (con `buscar_capacidad` y la colmena) |

## 4. Lo que NO se hace

- Mover claves a terceros o al repo: cada servidor usa su bóveda.
- Dos líderes a la vez: la escritura con el arriendo es atómica.
- Publicar sin las puertas de siempre (detector, pruebas del puente, CI y verificación).
- Abrir la Genesis publicada a quien no sea el dueño de la cuenta.

## 5. Ola IND1029 (≤ 3 archivos y ≤ 120 líneas por archivo y tarea)

Cola: `starseed_memory_root/olas/cola-metagenesis-autonoma-1029.json`.

| Tarea | Qué |
|---|---|
| A | artefacto `.next` en el CI y el reconstructor lo descarga |
| B | líder de dirección (arriendo en la puerta) |
| C | los servicios de dirección solo actúan si son líderes |
| D | dirección en el A1 (unidades systemd y `oracle_nodo direccion`) |
| E | estado compartido en la puerta |
| F | la API de medidores lee de la puerta cuando lo local falta |
| G | Hermes y Telegram en el líder |
| H | chat del director compartido entre neuronas |
| I | token de despliegue: acción «Te toca a ti» con enlace y comando |
