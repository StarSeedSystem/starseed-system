# SOP · Launcher de Dashboard, Apps, Carpetas y Abridor Universal de Archivos

> Actualizado: 2026-06-20 · Regla dorada: este SOP se actualiza ANTES que el código.
> SOP hermano: `architecture/integracion-portal-starseed-os.md` (cuenta unificada, Trinity, sincronización de preferencias).

## 0. Propósito

Ampliar la sección de **Dashboards** del SOSD para que, además de widgets, pueda alojar **apps, carpetas y programas** y abrir **cualquier tipo de archivo o contenido** (imágenes, vídeo, PNG, GIF, PDF, HTML, Three.js, audio…). El dashboard debe comportarse como una **pantalla de inicio** soberana de smartphone / tableta / escritorio / VR-AR: fluida, adaptable a cada dispositivo, tema y configuración, y respetando la Tríada (Ontocracia, Ciberdelia, Transhumanismo Comunista) y las Invariantes (código abierto, identidad soberana, Lienzo Universal).

Este SOP describe **toda la visión** y marca con `🟢 Fase 1` lo implementado en esta iteración (launcher de apps y carpetas), y con `🟡 Fase 2+` lo planificado.

---

## 1. Principios de diseño (no negociables)

- **Asimetría funcional:** la complejidad (estrategia de apertura, resolución de CSP, adaptación a dispositivo, seguridad) vive en el sistema; el usuario percibe un gesto simple (un toque abre la app).
- **Lienzo Universal:** una app/archivo es una **Entidad Única** referenciada, no duplicada. "Clonar/duplicar" crea una referencia con overrides, no una copia opaca.
- **Soberanía:** todo embed se ejecuta aislado (`sandbox`, `referrerPolicy`), sin filtrar la sesión del usuario salvo consentimiento explícito. El Exocórtex y los datos son del usuario.
- **Adaptabilidad:** un único modelo declarativo se proyecta a grid de escritorio, lista táctil móvil, dock y, más adelante, plano espacial VR/AR. Nada se hardcodea por dispositivo.
- **Código abierto y degradación honesta:** si algo no se puede embeber (CSP) o aún no existe (módulo nativo en construcción), el sistema lo dice y ofrece la mejor alternativa (pestaña nueva / "próximamente"), nunca una pantalla rota.

---

## 2. Modelo de datos

### 2.1 App (entrada de catálogo) 🟢 Fase 1
Una **app** es una entidad declarativa del catálogo (`src/components/dashboard/apps/app-catalog.ts`):

```ts
interface StarseedApp {
  id: string;                 // 'nexus' | 'cafe' | 'audiomorphic' | 'messages' | ...
  name: string;
  short?: string;             // etiqueta corta para iconos
  description: string;
  icon: LucideIcon;           // icono (no emoji — Invariante de diseño)
  accent: string;             // color de acento (token o hex)
  category: AppCategory;      // 'starseed' | 'sistema' | 'media' | 'utilidad' | 'creacion'
  // Estrategia de apertura — decidida POR APP:
  open: {
    primary: OpenMode;        // modo por defecto
    allowed: OpenMode[];      // modos ofrecidos en el menú contextual
    href?: string;            // URL externa (embed/tab/popup)
    route?: string;           // ruta interna del SOSD (Next router)
    embeddable?: boolean;     // si false, embed cae a 'tab' automáticamente
  };
  status?: 'live' | 'native' | 'soon';  // 'soon' = módulo nativo en construcción
  vrCapable?: boolean;        // 🟡 marca apps con modo inmersivo
}

type OpenMode = 'embed' | 'window' | 'popup' | 'tab' | 'route' | 'installed';
```

`OpenMode`:
- **`embed`** — incrustada dentro del dashboard (en la propia tarjeta/área).
- **`window`** — ventana flotante del OS (modal arrastrable, `AppWindow`).
- **`popup`** — ventana nativa del navegador (`window.open` con features).
- **`tab`** — pestaña nueva (`target=_blank`, `noopener`).
- **`route`** — navegación interna del SOSD (módulos nativos: mensajes, red, biblioteca, agente).
- **`installed`** — intenta abrir la PWA/app instalada; si no, cae a `tab`. 🟡

### 2.2 Item del launcher (instancia en el dashboard) 🟢 Fase 1
Un widget `APP_LAUNCHER` guarda su estado en `DashboardWidget.settings` (jsonb ya existente — sin migración):

```ts
interface AppLauncherSettings {
  variant: 'folder' | 'single';     // carpeta (grid) o tile de una sola app
  label?: string;                   // título de la carpeta
  appIds: string[];                 // apps incluidas (orden = orden visual)
  collection?: 'starseed' | 'sistema' | 'media' | 'custom';  // preset de origen
  columns?: number;                 // 0 = auto por tamaño
  iconShape?: 'squircle' | 'circle' | 'rounded' | 'hex';     // preset de icono
  iconStyle?: 'glass' | 'solid' | 'outline' | 'gradient';
  density?: 'comfortable' | 'compact';
  showLabels?: boolean;
  defaultOpen?: OpenMode;           // anula open.primary de cada app
}
```

> **Lienzo Universal:** `appIds` son referencias al catálogo, no copias. Editar el catálogo actualiza todas las carpetas que referencian esa app.

### 2.3 Persistencia y sincronización
- Fase 1: `settings` viaja con el `DashboardWidget` (Supabase, igual que cualquier widget).
- 🟡 Fase 2: apps "instaladas" por el usuario y carpetas de inicio se reflejan en `cafe_accounts.apps` (jsonb, ya existe en el esquema unificado) y en `user_settings` (preferencias de dock/Trinity). Una sola cuenta soberana → mismas apps en Nexus, Café y OS.

---

## 3. Estrategia de apertura POR APP (decisión vigente)

| App | Destino | `primary` | Embeddable | Notas |
|---|---|---|---|---|
| **StarSeed Nexus** | `route:/nexus` (interna) + `https://starseed-nexus.vercel.app` | `route` | sí (fallback) | Existe ruta interna `/nexus`; el embed externo cae a `tab` si CSP bloquea. |
| **StarSeed Café** | `https://starseed-nexus.vercel.app/cafe/` | `window` | sí (fallback) | Mismo dominio que Nexus; ventana OS con botón "abrir en pestaña". |
| **Audiomorphic VR** | `https://audiomorphic.vercel.app` | `window` | **sí (probado)** | Ya se embebe como fondo del OS → framing permitido. `vrCapable`. |
| **Omnifrecuencias** | módulo nativo (player de frecuencias) | `route` | n/a | `status:'soon'` en Fase 1; player real en Fase 2 (media center). |
| **Mensajes** | `route:/messages` | `route` | n/a | Módulo nativo del SOSD. |
| **Red / Network** | `route:/network` | `route` | n/a | Módulo nativo. |
| **Biblioteca** | `route:/library` | `route` | n/a | Acciones guardar/instalar de archivos. |
| **Exocórtex / Agente** | `route:/agent` | `route` | n/a | IA personal del usuario. |
| **Clima** | módulo nativo (ya hay widgets `WEATHER_*`) | `route` | n/a | App = vista ampliada de los widgets de clima. |
| **Radio en vivo** | módulo nativo (streaming) | `window` | n/a | `status:'soon'` Fase 1. |
| **Música (biblioteca)** | módulo nativo (player estilo Spotify) | `route` | n/a | `status:'soon'` Fase 1; player real en Fase 2. |

**Regla de fallback de embed:** toda ventana/embed muestra SIEMPRE un botón "abrir en pestaña". Si el `iframe` no emite `load` en ~6 s (síntoma típico de `X-Frame-Options`/`frame-ancestors`), la `AppWindow` ofrece el fallback explícito. Nunca se queda en blanco.

> URLs canónicas: ver `~/Documents/StarSeed Ecosistema/MANUAL DE ENLACES Y CUENTAS · StarSeed.md` (punto único de verdad).

---

## 4. Abridor Universal de Archivos 🟢 Fase 2 (en progreso)

Servicio `openContent(resource)` que **detecta el tipo** (extensión / MIME / firma) y elige el visor:

| Tipo | Visor | Modo |
|---|---|---|
| Imagen (png, jpg, webp, svg, gif) | `ImageViewer` (zoom, GIF animado) | `window`/`embed` |
| Vídeo (mp4, webm) / Audio (mp3, wav) | `MediaPlayer` (controles, salida) | `window` + Trinity |
| PDF | visor PDF (ya hay capacidad PDF en el ecosistema) | `window`/`tab` |
| HTML / sitio | `iframe` sandbox + fallback tab | `window`/`embed` |
| Three.js / GLB / modelo 3D | `R3F`/`<model-viewer>` (ya hay Three.js/R3F) | `window`/`embed`/VR |
| Markdown / texto / código | `DocViewer` con resaltado | `window`/`embed` |
| Entidad StarSeed (post, página, curso) | navegación interna (Lienzo Universal) | `route` |

**Acciones universales** sobre cualquier recurso (barra de la ventana): `Abrir`, `Abrir en pestaña`, `Instalar` (a `cafe_accounts.apps`), `Guardar en Biblioteca` (`/library`), `Copiar` (enlace/contenido), `Clonar`/`Duplicar` (referencia con overrides — no copia opaca), `Guardar`. Librerías en línea (CDN permitido: `cdnjs.cloudflare.com`) por tipo, declaradas en un registro de visores extensible.

### 4.1 Implementación (Fase 2 · esta iteración) 🟢

| Pieza | Archivo | Estado |
|---|---|---|
| Modelo + detección + adaptadores | `dashboard/apps/content/content-types.ts` | 🟢 `ContentResource`/`ContentKind`, `detectKind`, `fromPostMedia`, `fromLibraryItem`, `fromFile` |
| Ventana OS reutilizable | `dashboard/apps/os-window.tsx` | 🟢 chrome compartido (arrastrable, Esc, acento) — usado por AppWindow y ContentWindow |
| Visores reales | `dashboard/apps/content/viewers.tsx` + `model-viewer.tsx` | 🟢 imagen (zoom/pan, GIF), galería, vídeo/audio, PDF nativo, HTML (sandbox/srcdoc), doc (markdown/código/texto), 3D (R3F+drei, dynamic), enlace/entidad, fallback |
| Registro de visores | `dashboard/apps/content/viewer-registry.tsx` | 🟢 mapa `kind → componente`, 3D con `next/dynamic` (ssr:false) |
| Opener + acciones | `dashboard/apps/content/content-opener.tsx` | 🟢 `useContentOpener` (cola, portal) + `ContentWindow` + barra de acciones universal |
| Widget Visor Universal | `dashboard/widgets/universal-opener-widget.tsx` | 🟢 abrir por URL, archivo local, ejemplos y items de biblioteca |

**Integración (Lienzo Universal / sincronía):** los adaptadores `fromPostMedia(media)` (publicaciones, `social-posts.ts`) y `fromLibraryItem(item)` (biblioteca, `widget-data/types.ts`) permiten que mensajes, publicaciones y biblioteca abran su contenido con el MISMO motor. `detectKind` cubre imagen/gif/vídeo/audio/pdf/html/3D/markdown/código/texto/dataset/enlace. Acciones `copiar`/`descargar`/`pestaña` reales; `guardar en biblioteca`/`instalar` vía callback (persistencia en `cafe_accounts.apps`/`user_settings` → Fase 2.1). Exocórtex y memoria del usuario: el opener emite eventos de "recurso abierto" reutilizables por el agente (gancho `onOpen`).

**Pendiente 4.x:** persistencia real de guardar/instalar; fuentes de datos oficiales en tiempo real con selector de fuente (capa `data-sources`); firma de tipo por magic-bytes para archivos sin extensión; visor de hoja de cálculo/CSV (dataset) enriquecido.

---

## 5. Media Center y Trinity 🟢 Fase 2 (en progreso — widgets hechos)

### 5.1 Implementación (esta iteración) 🟢
| Pieza | Archivo | Estado |
|---|---|---|
| Motor de reproducción (singleton, SSR-safe) | `dashboard/apps/media/media-engine.ts` | 🟢 `useMediaPlayer` (play/pause/next/prev/seek/volume, cola, 1 `<audio>` global) |
| Catálogo media | `dashboard/apps/media/media-catalog.ts` | 🟢 tracks (SoundHelix), emisoras (SomaFM), presets de frecuencia |
| Reproductor de música | `widgets/media/music-player-widget.tsx` (`MUSIC_PLAYER`) | 🟢 biblioteca + cola + progreso + volumen |
| Omnifrecuencias | `widgets/media/omnifrecuencias-widget.tsx` (`OMNIFRECUENCIAS`) | 🟢 WebAudio (osciladores sine, binaural L/R, fades) |
| Radio en vivo | `widgets/media/radio-widget.tsx` (`RADIO_LIVE`) | 🟢 streams reales |
| Audiomorphic como fondo | `widgets/media/audiomorphic-bg-widget.tsx` (`AUDIOMORPHIC_BG`) | 🟢 activa fondo + overlay + abrir en pestaña; gratis dentro del OS |

🟢 **Mini-reproductor global** `apps/media/media-mini-dock.tsx` (`MediaMiniDock`): barra flotante (fixed, z-90, bajo las ventanas modales z-120), aparece solo al reproducir, cableada a `useMediaPlayer` (prev/play/next/seek/volumen, "EN VIVO" en radio, sin barra de progreso en streams). Montada en el **RootLayout** (`src/app/layout.tsx`, junto a `OmniDock`, dentro de `AppearanceProvider`) → global en TODO el OS (ambos grupos de rutas).

**Pendiente 5.x:** integrarlo al panel Trinidad explícito (control-panel) y ajustes de salida de medios/conexiones; Omnifrecuencias enlazado al fondo Audiomorphic.

> Calidad: los 5 widgets nuevos recibieron una pasada profesional (adaptabilidad por `size` de WidgetShell, estados loading/error/vacío con reintento, accesibilidad aria/foco, reduced-motion, `tabular-nums`).



- **Reproductor de música** (estilo Spotify, mejor): biblioteca, playlists, cola, widgets de playback, persistencia en `user_settings`. Controles reales en el **centro de control del menú Trinidad** (ya existe `control-panel/`), con ajustes de salida de medios y conexiones.
- **Omnifrecuencias**: widget con playback de frecuencias/binaurales; integra con Audiomorphic.
- **Audiomorphic como fondo del sistema**: ya implementado (`src/components/ui/backgrounds/audiomorphic-background.tsx`, `config.background.type === 'audiomorphic'`). Fase 2 lo vuelve **ajustable y plenamente funcional** desde el OS (volumen, preset, micrófono/fuente) y permite además abrirlo en ventana/pestaña con el programa completo. **Gratis con acceso total dentro del SOSD** (la versión web embebida no exige suscripción cuando corre dentro de StarSeed OS).

---

## 5b. Persistencia soberana + Fuentes de datos oficiales 🟢 Fase 2 (en progreso)

| Pieza | Archivo | Estado |
|---|---|---|
| Store de biblioteca/apps (localStorage, SSR-safe) | `lib/library-store.ts` | 🟢 `saveResource`/`installApp` + hooks `useSavedLibrary`/`useInstalledApps`; eventos cross-widget |
| Wire de guardar/instalar | `dashboard/apps/content/content-opener.tsx` | 🟢 defaults → `saveResource`/`installApp` (Lienzo Universal) |
| Registro de fuentes oficiales | `dashboard/apps/data-sources/data-source-registry.ts` | 🟢 Open-Meteo (clima), NOAA SWPC (Kp), USGS (sismos), Spaceflight News — fetch real, sin clave, con atribución |
| Hook de fuente ajustable | `dashboard/apps/data-sources/use-data-source.ts` | 🟢 selección + auto-refresco + reintento |
| Widget Datos Oficiales | `widgets/data/official-data-widget.tsx` (`OFFICIAL_DATA`) | 🟢 selector de fuente + datos en vivo + atribución |

**Pendiente 5b.x:** subir el store soberano de localStorage a Supabase (`user_settings`/`cafe_accounts.apps`, RLS por `auth.uid()`); más fuentes; magic-bytes para archivos sin extensión.

## 5c. Siembra en dashboards predeterminados 🟢
`DefaultDashboardTemplate.widgets` ahora admite `settings?` (jsonb sembrado) y `dashboard-layout` lo propaga. Un helper `withSeededExtras` (en `dashboard-defaults.ts`) inyecta en CADA dashboard predeterminado: (1) la **carpeta de apps StarSeed** (dock; colección según el tema: `sistema`/`media`/`starseed`) y (2) los **elementos funcionales correspondientes al tema** (música/radio en cultura·entretenimiento, Omnifrecuencias en astrología·ciberdelia·ayudantía, Datos Oficiales en clima·sistema·astronomía·descubrimientos, Audiomorphic en personalización·ciberdelia, Visor Universal en archivos), calculando la posición sin solapes y sin duplicar. El **dashboard de inicio** es el muestrario completo: carpeta de apps + Visor Universal + Reproductor + Omnifrecuencias + Radio + Audiomorphic + Datos Oficiales + variaciones del launcher (tile único `circle` y carpeta `media` `hex`/`gradient`).

## 6. VR / AR 🟡 Fase 3 (diseño fijado aquí)

- El mismo modelo declarativo de items se proyecta a un **plano espacial** (WebXR). Apps `vrCapable` (Audiomorphic, Multiverso, portales) se abren como superficies inmersivas; el resto, como paneles flotantes.
- AR: apps ancladas al entorno vía passthrough. Reutiliza `OpenMode` añadiendo `immersive`.
- Degradación: sin WebXR, los modos VR/AR se ocultan; nada se rompe.

---

## 7. Adaptabilidad y rendimiento (transversal)

- **Carga diferida:** visores 3D/pesados con `next/dynamic` (`ssr:false`) — patrón ya usado para `WeatherHolistic`/`MapWidget`.
- **Embeds perezosos:** el `iframe` solo se monta cuando la ventana está abierta (patrón ya usado en el fondo Audiomorphic).
- **`@container` + tiers:** los iconos/carpeta heredan densidad del tamaño real del contenedor (igual que `WidgetShell`).
- **`prefers-reduced-motion`** respetado en todas las animaciones; "Ciclo de Respiración Digital" (transiciones 150–300 ms / largas 4–6 s) según `config.animations`.

---

## 8. Seguridad soberana (transversal)

- `iframe` con `sandbox="allow-scripts allow-same-origin allow-popups allow-forms"` y `referrerPolicy="no-referrer"` por defecto; relajable por app con justificación.
- Sin `postMessage` a orígenes no incluidos en una allow-list por app.
- "Instalar" / "Guardar" requieren sesión y escriben solo bajo RLS por `auth.uid()`.
- Apertura de enlaces externos siempre con `rel="noopener noreferrer"`.

---

## 9. Integración técnica (Fase 1) 🟢

Tipo nuevo de widget `APP_LAUNCHER` montado sobre la maquinaria existente (sin migración de DB, `settings` jsonb):

| Punto | Archivo | Cambio |
|---|---|---|
| Tipo | `dashboard-types.ts` | `WidgetType += 'APP_LAUNCHER'` |
| Catálogo | `dashboard/apps/app-catalog.ts` | apps + estrategia de apertura (nuevo) |
| Apertura | `dashboard/apps/app-launch.tsx` | `useAppLauncher` + `AppWindow` (portal, fallback) (nuevo) |
| Tipos launcher | `dashboard/apps/launcher-types.ts` | `AppLauncherSettings`, presets (nuevo) |
| Widget | `dashboard/widgets/app-launcher-widget.tsx` | render del grid/tile (nuevo) |
| Sizing | `widget-manifest.ts` | entrada `APP_LAUNCHER` |
| Categoría | `widget-categories.ts` | categoría `aplicaciones` |
| Registro | `widget-registry.tsx` | `case 'APP_LAUNCHER'` |
| Selector | `dashboard-defaults.ts` (`WIDGET_CATEGORY_MAP`) | aparece en "Añadir widget" |
| Semilla | `dashboard-defaults.ts` (template "Dashboards") | carpeta "Apps StarSeed" por defecto |

**Criterios de aceptación Fase 1:**
1. En el dashboard de inicio aparece por defecto una carpeta "Apps StarSeed" con los iconos de Nexus, Café, Audiomorphic, Omnifrecuencias y los módulos del sistema.
2. Un clic abre la app en su modo por defecto; un menú permite elegir modo (ventana / pestaña / popup / interna).
3. Las apps embebibles abren en `AppWindow`; si el framing falla, hay botón "abrir en pestaña".
4. La carpeta es personalizable vía `settings` (columnas, forma de icono, etiquetas, densidad, preset).
5. `next build`/typecheck pasa; ningún widget existente se rompe (cambio puramente aditivo).

---

## 10. Pendientes naturales (siguientes fases)

- Fase 2: abridor universal de archivos + media center (música/radio/Omnifrecuencias) + Audiomorphic ajustable y gratis dentro del OS + control Trinity.
- Fase 2: apps instaladas del usuario en `cafe_accounts.apps`; carpetas personalizadas persistentes en `user_settings`.
- Fase 3: VR/AR (WebXR), modo `immersive`.
- Marketplace de apps/widgets de la comunidad (economía de creadores: Semillas a los autores).
