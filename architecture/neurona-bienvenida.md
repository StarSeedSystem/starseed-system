# Contrato · «Esta neurona» tras iniciar sesión (NEU1107B · 2026-11-07)

Petición de Alex (07-11): «En las versiones instaladas, después de iniciar sesión falta una ventana: que
detecte si el aparato ya tiene un registro de neurona de otro medio donde se inició sesión y sugiera
fusionarlas automáticamente, y que ofrezca editar los ajustes básicos: el nombre y la función principal de
la neurona, sus capas de conciencia, sus medios de transmisión preferidos y más».

Regla de fondo (Alex, antes): **una neurona por aparato** y poder fusionar sus ajustes. Este contrato
amplía `neuronas-un-aparato.md` (huella, medios, fusión del panel) y la sincronización de
`sincronizacion-neuronas.md` §8–§9 (faro y presencia).

## 1 · Piezas

| Pieza | Archivo | Qué hace |
|---|---|---|
| Ranking (puro) | `src/lib/neurons/duplicadas-aparato.ts` | `detectarDuplicadas` ordena las neuronas de la cuenta que parecen ESTE aparato, con confianza y razón; `sugerirFusion` deja la fusión preseleccionada |
| Reglas (puro) | `src/lib/neurons/neurona-bienvenida.ts` | Una vez por cuenta × aparato (`decidirBienvenida`), registro local, carga de la fusión (`planFusionBienvenida`), borrador de ajustes y resumen (`resumenCambios`) |
| Acciones | `src/lib/neurons/neurona-bienvenida-acciones.ts` | Reúne los datos (lista de neuronas, presencia, app nativa, migración), aplica la fusión sin borrar y guarda cada ajuste en su sitio de siempre |
| Ventana | `src/components/neurons/bienvenida-neurona.tsx` | Tres pasos: fusión · ajustes · resumen |
| Orquestador | `src/components/onboarding/primer-arranque.tsx` + `src/lib/onboarding/primer-arranque.ts` | Decisión `bienvenida-neurona` en la app nativa; evento `starseed:abrir-bienvenida-neurona` |
| A mano | `src/components/settings/neurons/esta-neurona.tsx` | Ajustes › Neuronas › Esta neurona › «Revisar las neuronas de este aparato» |
| Fusión sin borrar | `src/lib/neurons/fusion.ts` (`conservarFilas`) + `fusion-alias.ts` (`fusionadaEn`, `idsConocidasConAlias`) | Marca, alias, respaldo, deshacer |
| Pista de la migración | `native/servidor-local/migracion-origen.js` + `src/lib/nativa/migracion-origen.ts` | `starseed.migracion-origen.neurona-anterior.v1` |
| Medios por neurona | `src/lib/mensajeria/medios/preferencias-store.ts` (`porNeurona`) | Orden de medios de ESTA neurona: chat → neurona → generales |

## 2 · Detección: ¿qué neuronas son este aparato en otro medio?

`detectarDuplicadas({ yo, todas, presentes, idAnteriorMigracion, alias, ahora })`, puro. `yo` lleva la ficha
recién medida (con la huella `maquina` de la app nativa) y, de `info_neurona`, `equipo` (modelo o nombre del
equipo) y `so`. `presentes` es la presencia de la cuenta (`PresenciaMedio`, con `d.equipo` de VER1107B).

| Señal | Puntos | Fuerte |
|---|---|---|
| Es el id que esta app usaba en el origen anterior (migración al servidor local) | +100 | sí |
| Mismo equipo o modelo (`info_neurona` ↔ `d.equipo` de su presencia) y mismo sistema | +70 | sí |
| Huella `mismo` (nombre de máquina igual, o GPU + núcleos + pantalla) | +55 | sí |
| Huella `probable` | +30 | |
| Huella `posible` (mismo sistema, pocos datos) | +8 | |
| Nombre «X» frente a «X phone / app / 2 / tablet…» (nunca con nombres genéricos del OS) | +22 | |
| Relevo: la otra nació antes y dejó de latir entre 3 días antes y 2 h después de que naciera esta | +20 | |
| Mismo navegador (familia) | +6 | |
| Vista en los últimos 30 días / hace más de 120 días | +4 / −6 | |

Descartes (siempre con su motivo en `descartadas`): otro sistema; otro equipo en vivo; huella `distinto`;
fila sin datos del aparato; ya fusionada (marca o alias); **en línea ahora mismo sin una señal fuerte** (es
otro aparato encendido a la vez). La migración es la única señal que pasa por encima de un sistema distinto.

Confianza: **alta** ≥ 60, **media** ≥ 28, **baja** ≥ 12 (se enseña sin marcar); por debajo, no se enseña.
La razón visible son las dos señales más fuertes en una frase.

Casos reales de la cuenta de Alex (fixtures en `__tests__/duplicadas-aparato.test.ts`):
- App de escritorio de la **MaggaBook** → sugiere la neurona «💻 macOS» que creó Chrome en la misma Mac
  (huella `mismo`); la tableta, el Android y el iOS se descartan por sistema.
- **Maggadroid phone** → sugiere **Maggadroid** (nombre + relevo del 06-11); la **Maggaboard** está en línea
  con otro equipo: fuera; «📱 iseed maggadroid» es iOS: el nombre nunca gana a un sistema distinto.
- **Maggaboard** → no se apropia de los registros del móvil (el móvil está en línea); reconoce la
  «📱 Android · Chrome 154» del 10-10 por GPU, núcleos y pantalla.

`sugerirFusion`: preselecciona las de confianza alta y media; se queda la neurona con nombre propio más
antigua (empate: esta, para no tener que recargar); el nombre, el primero propio del grupo.

## 3 · Fusión: semántica

- **Nunca sin el toque.** «Fusionar automáticamente» = la sugerida viene marcada y «Fusionar (N)» la aplica
  con un toque. La persona elige qué id se queda (radio) y qué nombre (texto + los nombres que ya tenía).
- **Carga** (`planFusionBienvenida`, pura): `{ principal, absorbidas, nombre, esteMedioCambiaDeId }`. Solo se
  aceptan ids que se enseñaron; el que se queda es esta neurona o una marcada; nombre sin caracteres de
  control, ≤ 60.
- **Nada se borra.** `fusionarNeuronas(principal, absorbidas, { conservarFilas: true, por: "bienvenida" })`:
  1. ficha fundida en la que se queda (la marca de una fusión anterior nunca pasa a ella);
  2. ajustes movidos en TODAS las claves que viajan con la cuenta (nombres, permisos, ajustes por neurona,
     sistemas por personalidad, `porNeurona` de Mensajería, avisos…), gana la que se queda;
  3. alias `absorbida → principal` y respaldo (filas tal cual + ajustes movidos) en
     `starseed.neuronas.fusiones.v1` (viaja con la cuenta, 10 últimos);
  4. cada fila absorbida se queda en `neuron_devices` con `capabilities.fusionada = { en, ts, por }`
     (jsonb que ya existe: **sin migración**). `listNeurons()` la salta;
  5. aviso por el canal de la cuenta (`neuronas:fusion`).
  El panel de siempre (`AparatosEnVivo`) no pasa la opción y sigue borrando con respaldo.
- **Este medio cambia de id** si se queda otra: `resolverAliasEsteMedio()` adopta el id que se queda (solo el
  id de neurona; los ids de sync y de malla no se comparten, ver `identidad-dispositivo.ts`) y al terminar la
  app se recarga para que todos los módulos lean el id nuevo.
- **Deshacer** (en el resumen, y en Ajustes › Neuronas): vuelve a subir las filas como estaban (sin marca),
  quita los alias y devuelve los ajustes a su id solo donde no haya nada; si este medio había adoptado el
  otro id, vuelve al suyo (`adoptarNeurona`).
- **Autocuración**: si un medio ve SU fila con la marca y el alias aún no le llegó (otra neurona fusionó y la
  cuenta no se ha bajado todavía), apunta el alias él mismo y adopta el id que se quedó.
- **Malla y faro**: la que se queda sigue en la lista de neuronas (presencia, latido, `conocidas`). Además,
  `conocidas` de `antenas.json` incluye los ids absorbidos que apuntan a una vigente
  (`idsConocidasConAlias`): un medio que aún se anuncia con el id viejo (app cerrada, sin internet) se sigue
  reconociendo como neurona de la cuenta. Tras fusionar, en la app nativa se vuelve a repartir la clave de
  faro al momento.

## 4 · Cuándo se abre

Registro local (de ESTE aparato, no viaja con la cuenta): `starseed.neurona.bienvenida.v1` =
`{ v: 1, cuentas: { <uid>: { ts, neurona, resultado: "completada" | "omitida" } } }`.

| Medio (`leerInstalada().medio`) | Sola tras iniciar sesión | A mano |
|---|---|---|
| `escritorio` (Tauri macOS/Windows/Linux) | Sí, una vez por cuenta × aparato | Sí |
| `android` (Tauri Android) | Sí, una vez por cuenta × aparato | Sí |
| `pwa`, `web`, `ios` | No | Sí |

`decidirBienvenida`: sin sesión, nunca; a mano, siempre; sola solo en escritorio/Android y si esa cuenta no
la vio aquí. Con candidatas: fusión → ajustes → resumen. Sin candidatas: ajustes → resumen, y no se abre
si la neurona ya estaba configurada (marca `neurona.configurada` de `avisos-cuenta`).

En el orquestador (`decidirPrimerArranque`), en la app nativa y con perfil: mientras se mira, `esperar`;
si toca, `bienvenida-neurona` **antes** que «Neurona nueva» (la sustituye allí); si no, la lógica de siempre.
Se mira una vez por cuenta y visita (un refresco del token no vuelve a leer nada). Nunca encima de la
consola, de las rutas de acceso, de un rito ni de una cuenta sin perfil. «Ahora no» (o Escape) la deja vista
y pospone «Neurona nueva» 24 h con la cuenta; «Aplicar y terminar» la deja vista y la neurona configurada.

## 5 · Ajustes básicos (paso 2): dónde vive cada uno

| Ajuste | Dónde | Ámbito |
|---|---|---|
| Nombre | `setNeuronName` → prefs `names` + fila | neurona |
| Función principal (Cerebro y servidor · Cerebro · Servidor) | `NeuronSettings.role` | neurona |
| Capas de conciencia (local, mesh, nube, colectiva) | `IntelligenceSettings.capa158*` (`saveIntelligenceSettings`) | **cuenta** (se dice en la ventana) |
| Motor 1.58 local en esta neurona | `NeuronSettings.astraura158.enabled` | neurona |
| Medios de transmisión preferidos, en orden | `starseed.mensajeria.medios.v1` → `porNeurona[id]` (`PreferenciasMedioForm`) | neurona; orden efectivo chat → neurona → generales |
| Escucha de fondo de Aurora | `NeuronSettings.auroraListening` | neurona |
| Prestar procesador / guardar copias | `permissions.compute` / `permissions.storage` | neurona |
| Aceptar solicitudes de archivos | `NeuronSettings.fileRequests` | neurona |
| Compartir carpetas (NAS) | `antenas.json` → `nas` (`antenas_config` / `antenas_configurar`, config entera con un solo campo cambiado) | aparato (solo app nativa) |
| Recibir primero las actualizaciones automáticas | `starseed.actualizaciones.neurona-elegida.v1` | cuenta (qué neurona) |
| Icono | `NeuronSettings.icono` + `kind` de la fila (manda sobre el detectado al subir la ficha) | neurona |

Solo se guarda lo que cambió; lo que falle se dice («Se guardó todo menos: …») y lo demás queda guardado.

## 6 · Binarios y webs anteriores

- La web llega a las apps instaladas con la web publicada; ningún binario nuevo es necesario.
- App sin `info_neurona` (anterior a VER1107B): `equipo`/`so` faltan → se decide con la huella y el resto;
  el medio sigue saliendo de `getVersion`/`plugin:app|version` (escritorio o Android), así que la ventana
  se abre igual.
- App sin `antenas_config`: la fila del NAS no aparece (`nas: null`).
- La pista de la migración solo existe con una capa del servidor local que lleve el `migracion-origen.js`
  nuevo y si hubo conflicto del id; sin ella, simplemente no se suma esa señal.
- Una pestaña con una web anterior: no filtra la marca `fusionada` (enseña la fila absorbida como
  «inactiva» hasta recargar) y, si reescribe las preferencias de Mensajería, pierde `porNeurona` (lo vuelve
  a poner la siguiente edición). Los alias siguen funcionando como antes.

## 7 · Base de datos

Ningún cambio. La marca va en `neuron_devices.capabilities` (jsonb). Si un día los lectores del servidor
(relé, recursos de IA, Hermes…) deben saltar las filas fusionadas sin leer el jsonb, una columna
`merged_into uuid null` con índice lo haría; no se ha preparado migración porque hoy no es imprescindible.

## 8 · Pruebas y lo que necesita un aparato de verdad

```
NODE_ENV=test npx vitest run src/lib/neurons/__tests__/duplicadas-aparato.test.ts \
  src/lib/neurons/__tests__/neurona-bienvenida.test.ts src/lib/neurons/__tests__/fusion-conservar.test.ts \
  src/lib/mensajeria/medios/__tests__/preferencias-neurona.test.ts src/lib/onboarding/__tests__/primer-arranque.test.ts \
  src/lib/nativa/__tests__/migracion-origen.test.ts src/components/neurons/__tests__/bienvenida-neurona.test.tsx \
  src/components/onboarding/__tests__/primer-arranque.test.tsx
```

A mano: iniciar sesión en la app de escritorio de la Mac y en la de Android → la ventana sale una vez; en
el móvil propone «Maggadroid»; fusionar eligiendo el id viejo recarga y la neurona queda única en Ajustes ›
Neuronas, con la absorbida fuera de la lista y su fila aún en `neuron_devices` con la marca; Deshacer la
devuelve; la tableta, encendida a la vez, nunca aparece como candidata del móvil; el faro de la otra app
sigue reconociendo al móvil por su id viejo hasta que este recarga.
