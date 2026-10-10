# Contrato · MetaGenesis/Genesis/PoliGenesis, malla universal sin internet y estaciones sincronizadas (2026-10-09)

Petición de Alex del 2026-10-09 (cuatro mensajes seguidos). Este documento fija QUÉ se construye, en
qué ORDEN y qué es posible en cada medio, para que cualquier sesión o la flota lo continúe sin
reinventar ni prometer lo que un medio no puede hacer. Parte 1 (neuronas) ya está hecha:
`architecture/neuronas-un-aparato.md`.

---

## A · Tres niveles de Genesis

| Nivel | Para quién | Qué edita | Dónde corre |
|---|---|---|---|
| **MetaGenesis** | Desarrolladores de StarSeed OS: Alex (cuentas `maggasukha@star.seed` y `alex@star.seed`) y las cuentas a las que él dé permiso desde *Ajustes de MetaGenesis* | El CÓDIGO del OS: enjambre, olas, publicación, directores, servicios (el Genesis de hoy) | El motor está en la Mac (disco, launchd, enjambre). Se usa desde cualquier neurona con cuenta autorizada |
| **Genesis** | Cada persona | SU cuenta: perfil(es), páginas, apariencia, dock, escritorios, dashboards, agentes y enjambres propios | En su cuenta (Supabase) y en sus neuronas; los cambios son DATOS (UiSpec, ajustes), nunca código ejecutable |
| **PoliGenesis** | Grupos y comunidades (entidades) | Lo de la entidad: perfil, páginas, roles, agentes del grupo; en modo democrático cada cambio es una propuesta que se vota | En la cuenta de la entidad, con los roles de `os_entity_roles` |

### A.1 Acceso a MetaGenesis (Alex dio su palabra para la tabla el 2026-10-09)

- Tabla `metagenesis_accesos (account_id uuid PK → auth.users, rol 'dueño'|'desarrollador',
  otorgado_por, creado_en, nota)` con RLS: cada cuenta ve SU fila; los dueños ven y editan todas.
- Funciones `es_metagenesis(uid)` y `es_metagenesis_dueno(uid)` (SECURITY DEFINER, STABLE) y RPC
  `metagenesis_otorgar(identificador, rol)` (correo o @usuario) / `metagenesis_revocar(account_id)` /
  `metagenesis_miembros()`, solo para dueños. Semilla: las dos cuentas de Alex como `dueño`.
- **Puerta del servidor (lo primero, antes de abrir nada):** hoy `guardianMando` da por local
  CUALQUIER petición si `STARSEED_LOCAL=1`. Cambia a: local = `esPeticionDeEstaMaquina(req)`
  (bucle local estricto, sin cabeceras de túnel); remoto = sesión verificada + `es_metagenesis`.
- **Desde otras neuronas** (opción por defecto, Alex no eligió otra): la interfaz se sirve desde
  Vercel (`/metagenesis`) y los datos vienen del motor de la Mac por un túnel cifrado, con el token
  de sesión en `Authorization`. La URL del túnel la publica la Mac en una fila que solo leen los
  miembros (nunca se imprime). El envoltorio de `fetch` de Genesis (`guardia-fetch.ts`) reescribe
  `/api/mando/*` al motor remoto. CORS solo para el origen del OS. Si la Mac está apagada, se dice.
- Rutas: `/genesis` = entrada con selector de nivel (MetaGenesis solo si eres miembro); 
  `/metagenesis` (consola actual), `/poligenesis?entidad=<id>`. Los enlaces viejos `/genesis?pestana=`
  siguen abriendo MetaGenesis para los miembros.

### A.2 Genesis (personas) y PoliGenesis (grupos)

- Motor común `operaciones-genesis`: el agente (modelos gratuitos del enrutador) solo puede
  PROPONER operaciones tipadas — `perfil.editar`, `pagina.crear|editar`, `apariencia.aplicar`,
  `dock.añadir|quitar`, `escritorio.*`, `dashboard.widget.*`, `agente.crear` — que se validan contra
  los invariantes del núcleo (`src/lib/nucleo/invariantes.ts`), se enseñan como vista previa y se
  aplican con confirmación y deshacer. Nada de `eval`, nada de código.
- PoliGenesis usa el mismo motor con `ambito = entidad`: rol desde `os_entity_roles`; en modo
  democrático, `aplicar` crea una propuesta en vez de aplicar.
- El diseño de enjambres por usuario (`architecture/puente-mando-para-todos.md`, tablas `mando_*`)
  sigue siendo la base de «sus propios agentes»; sus migraciones NO están aplicadas (verificado el
  2026-10-09: 0 tablas `mando_*`) y tienen un fallo de nombres en `mando_capacidad` que hay que
  corregir antes.

---

## B · Malla universal: cualquier antena, con o sin internet, para TODO

Alex: llamadas y mensajes (pareja y grupo), archivos en mensajes y correos, transmisiones de
estaciones y las capas de conciencia de Astraura deben buscar SOLAS la conexión directa P2P con
cualquier antena disponible, también con personas de otras cuentas o de un grupo en común, sin
internet ni servicios externos.

### B.1 Lo que cada medio puede de verdad (no se promete más)

| Antena | Navegador (Chrome/Edge) | Safari/iOS | App nativa escritorio (Tauri) | App nativa Android |
|---|---|---|---|---|
| Wi-Fi / punto de acceso local SIN internet | WebRTC con candidatos locales ✔; **señalización** sin internet solo por QR o por otra antena | WebRTC ✔, QR ✔ | Descubrimiento UDP multicast + TCP directo ✔ (hay que escribirlo) | Igual + Wi-Fi Direct (plugin Kotlin) |
| Bluetooth | Solo central y con un gesto (Web Bluetooth); no anuncia | ✘ | Central BLE (btleplug) ✔ | Central + periférico (plugin) |
| LoRa (Meshtastic/RNode) | Web Serial / Web Bluetooth ✔ (ya funciona) | ✘ | Serie/BLE desde Rust ✔ | BLE ✔ |
| Reticulum | ✘ (no hay pila web) | ✘ | `rnsd` como proceso hermano (Python) o Reticulum-rs ✔ | Sideband/RNS ✔ con trabajo |
| Internet | ✔ | ✔ | ✔ | ✔ |

Conclusión honesta: un NAVEGADOR no puede descubrir solo a otro aparato sin internet; necesita un
gesto (escanear un QR) o un medio que sí pueda (la app nativa, una radio). La autonomía completa
sin internet llega con la app nativa.

### B.2 Orden elegido (Alex dejó el orden a la dirección: «el más directo y eficiente»)

1. **Transporte universal** (`src/lib/malla/transporte-universal.ts`): una sola puerta
   `enviar(destino, carga, clase)` / `abrirFlujo(destino, tipo)` que TODAS las funciones usan
   (llamadas, mensajes, archivos, estaciones, capas de Astraura). Elige por enlace disponible y
   clase de tráfico: P2P local > WebRTC por internet > relé del servidor; reparte por varios enlaces
   a la vez cuando el tráfico lo permite (multitrayecto del planificador CAMR, hoy solo simulado).
2. **Wi-Fi local sin internet en el navegador**: emparejar por QR (oferta/respuesta WebRTC
   comprimidas, candidatos mDNS del propio Wi-Fi o punto de acceso del móvil). Funciona hoy en
   cualquier navegador moderno, sin servidores.
3. **Wi-Fi local en la app nativa**: descubrimiento UDP multicast firmado con la clave de la neurona
   + canal directo; la app nativa hace de **señalizador local** para los navegadores del mismo Wi-Fi
   (así el navegador también se vincula solo). Requiere versión nativa 0.4.
4. **LoRa como señalizador**: con una radio Meshtastic, la oferta WebRTC comprimida (~400 B) viaja
   por LoRa en 2-3 paquetes y abre un enlace Wi-Fi directo entre aparatos cercanos.
5. **Bluetooth nativo** (central en escritorio; central+periférico en Android).
6. **Reticulum** como columna para todas las interfaces de radio (rnsd hermano de la app nativa).
7. **Proximidad entre cuentas**: con consentimiento — una llamada aceptada o pertenecer a un grupo en
   común es consentimiento para ESE enlace; los faros solo dicen «hay un miembro de StarSeed cerca»
   y nunca quién, salvo a sus contactos o grupos.

---

## C · Estaciones en directo sincronizadas: Omnifrecuencias y Audiomorphic

- **Transmisión paramétrica, no de audio.** Una entonación de Omnifrecuencias o una espiral de
  Audiomorphic se describe con sus parámetros. La estación transmite esos parámetros + una línea de
  tiempo con `t0` en un **reloj común** (sincronización tipo NTP por el mismo canal, compensando el
  retardo). Cada medio genera el mismo sonido/imagen en local con Web Audio programado al instante
  exacto. Por eso cabe en cualquier antena (incluso LoRa) y la precisión depende del reloj, no del
  ancho de banda: milisegundos en red local, decenas de ms por internet.
- **Un enlace, todos los medios.** Publicar una estación permite elegir el enlace de una entonación
  de Omnifrecuencias; la misma sesión aparece en la app de Omnifrecuencias (Entonaciones, sección
  Comunidad) y en Transmisiones de StarSeed OS con el mismo enlace y los mismos datos en vivo. Se
  puede iniciar, pausar y ajustar desde cualquiera de los dos.
- **Módulo en segundo plano en todo el OS**: el motor de Omnifrecuencias se carga como módulo de
  audio global del OS (sigue sonando al navegar), con su mini-control.
- **Audiomorphic**: sesiones de espirales como estaciones, con la configuración completa
  sincronizada y personalizable, y los mismos usuarios en todas las apps y medios.
- Repos: Omnifrecuencias = `StarSeedSystem/generador_frecuencias` (antes
  `alexbordongarrigos/omnifrecuencias`), Audiomorphic = su repo; rutas del OS `/omnifrecuencias`,
  `/audiomorphic`, `/estaciones`, `src/lib/estaciones/*` (ya tiene `malla.ts` y `directo.ts`).

---

## Orden de entrega

1. ✔ Neuronas una por aparato + estado en vivo + señales (2026-10-09).
2. Puerta estricta del servidor + tabla de accesos de MetaGenesis + selector de niveles.
3. Transporte universal + emparejado por QR sin internet (llamadas, mensajes y archivos lo usan).
4. Estaciones paramétricas con reloj común (Omnifrecuencias primero, luego Audiomorphic).
5. MetaGenesis remoto por túnel; Genesis y PoliGenesis con operaciones tipadas.
6. App nativa 0.4: Wi-Fi local autónomo, Bluetooth, LoRa por serie; luego Reticulum.
