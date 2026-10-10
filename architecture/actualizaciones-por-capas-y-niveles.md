# Contrato · Actualizaciones por capas y por nivel de Genesis (2026-10-10)

Petición de Alex del 2026-10-10. Se apoya en lo que ya existe: modo por neurona manual/automático
(`src/lib/neurons/actualizaciones.ts`), aviso de versión por ntfy y recarga suave
(`src/lib/pwa/aviso-version.ts`, `recarga-por-version.ts`), service worker `public/sw-v7.js`,
actualizador nativo de Tauri (canales `latest*.json`, 0.3.0), autoactualización de la Biblioteca
(`starseed.library.autoupdate.v1`) y arranque de sistemas de Astraura (`startup-updates.ts`).

## 1 · Quién publica qué (niveles)

| Nivel | Publica versiones de | Quién aprueba | Alcance |
|---|---|---|---|
| **MetaGenesis** | El OS entero: núcleo web, service worker, servicios locales, capas de modelos, apps nativas | Desarrolladores con acceso (`metagenesis_accesos`). Cambio de núcleo: dueño o votación de desarrolladores (`votacion-desarrolladores.ts`: quórum y caducidad); urgencia de seguridad: un dueño, con aviso | Todas las cuentas |
| **PoliGenesis** | Sistemas de una entidad: sus páginas, apps y widgets propios, plantillas, configuraciones comunitarias; ramas públicas o privadas | Según el gobierno de la entidad: jerárquico → admin/dueño; democrático → propuesta y votación | Miembros y seguidores de la entidad (públicas: cualquiera que las use) |
| **Genesis** | Los sistemas de UNA cuenta: su interfaz (UiSpec), escritorios, dashboards, widgets propios, páginas personales | La persona | Solo sus perfiles y neuronas elegidas |

Nunca se mezclan: una versión de PoliGenesis o Genesis no puede tocar el núcleo (invariantes de
`src/lib/nucleo/invariantes.ts`); las de MetaGenesis no pisan los datos personales.

## 2 · Manifiesto único de versión

`{ sistema, nivel: meta|poli|genesis, dueño (cuenta o entidad), version, rama: estable|beta|propia,
capas: [...], requiere: { reinicio: [servicios], recarga: bool, reinstalar: bool }, tamaño, sha256,
notas, aprobacion (propuesta/votos), publicado_en }`. Las ramas: `estable` (lo que sigue la gente),
`beta` (quien la elija), `propia` (copia de una persona o grupo que puede proponer volver a la
original). Siempre se guarda la versión anterior para volver atrás.

## 3 · Capas: lo mínimo que hay que hacer en cada aparato

| Capa | Ejemplos | Cómo se aplica | ¿Reinstalar? |
|---|---|---|---|
| `datos` | UiSpec, ajustes, plantillas, widgets declarativos | En caliente, sin recargar | No |
| `interfaz` | JS/CSS de la web | Recarga suave cuando no se está escribiendo, en una llamada ni en un directo (o en la próxima navegación) | No |
| `sw` | Service worker / caché sin conexión | `skipWaiting` + recarga suave | No |
| `servicios` | Backend de Astraura, voz, BitNet, enjambre local | Reinicio de ESE servicio dentro de la app o de la neurona | No |
| `modelos` | Capas de Astraura (Needle, Bonsai, BitNet) | Descarga verificada por SHA (`config/capas-astraura.json`) y cambio en caliente | No |
| `nativa` | Binario de la app (Tauri) | Actualizador nativo y relanzar | Solo esta capa, y solo la publica MetaGenesis |

## 4 · Política de cada sistema (se elige al crear la entidad y se cambia en su Genesis)

- **Automática en todas mis neuronas** · **Automática solo en esta neurona** · **Programada**
  (ventana horaria) · **Manual (avisarme)**. Por capa: p. ej. datos e interfaz automáticas,
  servicios y modelos manuales.
- Por defecto según el tipo: perfil privado → automática para `datos`/`interfaz`, avisar para
  `servicios`/`modelos`; página o app pública de un grupo → sigue la rama `estable` automáticamente;
  grupo democrático → nada se publica sin votación, pero lo ya aprobado llega automático a sus
  miembros que lo tengan así.

## 5 · Inteligencia (más allá de lo pedido)

- **Momento**: nunca durante una llamada, un directo, una escritura activa o con batería < 20 %;
  descargas grandes (> 50 MB) solo con Wi-Fi o si la persona lo permite con datos.
- **Neurona canaria**: se aplica primero en una neurona (la elegida o la más usada); si pasa la
  prueba de humo (la página carga, los servicios responden), se propaga a las demás.
- **Vuelta atrás sola**: si la prueba de humo falla, se vuelve a la versión anterior y se avisa.
- **Por la malla**: una neurona que ya tiene el paquete lo pasa a las demás por el transporte
  universal (P2P local primero): menos datos y funciona sin internet.
- **Cada aparato dice qué tiene**: la presencia en vivo lleva la versión de cada capa, y el panel de
  cada Genesis muestra qué neuronas van atrasadas y por qué (pospuesta, en espera de Wi-Fi, falló).

## 6 · Dónde se administra

- MetaGenesis › **Publicación** (ya existe) + **Actualizaciones**: versiones del OS por capa y canal,
  estado en cada neurona de la red, votaciones de desarrolladores.
- PoliGenesis › **Versiones**: ramas y versiones de los sistemas de la entidad, propuestas, quién
  las sigue.
- Genesis › **Actualizaciones**: lo instalado en cada perfil y neurona, política por sistema y capa,
  historial y volver atrás.
- Al crear un perfil, página, grupo o comunidad: paso «Actualizaciones» con la política por defecto
  de su tipo.

## 7 · Pruebas de verdad

Neuronas de prueba de Alex: la Mac (localhost:9002) y una tablet Android con StarSeed instalada, en
Señales. Se verifica: presencia y medios de las dos, versión por capa, una actualización de `datos`
aplicada en caliente en ambas, una de `interfaz` con recarga suave, el canario y la vuelta atrás.
