# SOP — Centro de Creación · Sesión persistente · Sync en tiempo real · Permisos (Adenda 63)

> Fuente de verdad de la ola 2026-07-11. Escrito ANTES de tocar código (regla dorada).
> Backend: GitHub + Supabase propio del OS (`nxstilnyidvkqeosofuh.supabase.co`, cuentas SEPARADAS de Nexus/Café) + Vercel.
> **Google Cloud activo:** `Dockerfile` + `cloudbuild.yaml` → Cloud Run (min 0 / max 5). Todo lo nuevo debe funcionar en standalone (sin depender de APIs propias de Vercel) y leer config por env vars.

## 1. Sesión persistente (bug: recarga cierra sesión / cuenta tarda)
- **Causa raíz:** cada `createClient()` creaba un `GoTrueClient` NUEVO sobre el mismo storage (auth-form, session-resume, settings-sync, auth-gate…) → carreras de refresh que invalidan la sesión de forma intermitente.
- **Fix:** singleton en `src/utils/supabase/client.ts` (una única instancia browser por pestaña).
- `src/app/auth/callback/route.ts` NUEVO: intercambia `?code=` por sesión (antes 404 → alta por correo rota).
- `account-context.tsx`: caché del perfil en `localStorage (starseed.account.profile.cache.v1)` → hidratación instantánea + refresco en 2º plano; NO recargar perfil en `TOKEN_REFRESHED` del mismo usuario; NUNCA cerrar sesión salvo `signOut()` manual.
- Tras login → `/escritorios` (página principal) con el último perfil activo (`starseed.profile.active.v1`).

## 2. Trinity · Centro de Creación (Horizon) — 4 herramientas, cada una con su propósito
| Herramienta | Propósito | Acción |
|---|---|---|
| **Lienzo Universal** | Creador de PUBLICACIONES específicas (no es la pizarra) | abre `/crear?area=lienzo` |
| **Fragua de Widgets** | Generar widgets IA | evento `starseed:open-forge` + **GlobalForgeHost** en root layout (antes solo escuchaba el Dashboard) |
| **Pizarras** | Espacio de trabajo ilimitado | cortina Logic (ya funcionaba) + enlace a `/pizarras` (nube) |
| **Zona de Publicación** | Publicar por contexto | botones AHORA navegan: Biblioteca→`/library`, Política/Educación/Cultura→`/publish?area=…` |
- **`/crear` NUEVO**: página completa del Centro de Creación con las 4 áreas + creación de grupos/páginas/partidos (entity-kinds) + tipos de publicación especializados por sección (política: propuesta/votación/debate · educación: curso/guía/recurso · cultura: obra/evento/convocatoria).
- `PublicationButton` recibe `onClick` (antes inerte).

## 3. Aurora — chat duplicado
- Causa: `AuroraChatFullscreen` (overlay completo) se superponía a la vista compacta de la pestaña "chat", que seguía visible detrás.
- Fix: cuando `fullscreen` está abierto, la vista base se OCULTA (la versión con más funciones queda sola). Sin tocar motor/Astraura.

## 4. Biblioteca + archivos — sync en tiempo real
- `entity-library.ts`: (a) suscripción realtime a `entity_state` (canal por entidad) → los ítems aparecen en TODOS los dispositivos sin recargar; (b) errores de `pushCloud` visibles + reintento; (c) botones de `/library` ("Subir a la Red", "Nuevo") cableados a Storage real (`os-files.ts`, bucket `os-files`) — fuera los mocks.
- Composer `/publish`: adjuntos suben a Storage (antes solo guardaba el nombre).
- ⚠️ Supabase realtime: las tablas (`entity_state`, `os_posts`, `canvases`, `user_settings`) deben estar en la publicación `supabase_realtime` (revisar migraciones locales `supabase/migrations/`; si falta, migración nueva + aplicar en dashboard/CLI).

## 5. Permisos y compartición (escritorios, dashboards, pizarras, cerebros, archivos, carpetas)
- Modelo único `src/lib/sharing/access.ts` sobre `os_spaces` (+ `os_space_editors`):
  - **Ámbitos:** `profile` (solo un perfil) · `account` (todos los perfiles de la cuenta) · `custom` (perfiles/cuentas/grupos externos) · `public`.
  - **Roles:** `view` · `comment` · `edit` · `admin` (acceso total o parcial por sección).
- UI reutilizable `ShareAccessDialog` integrada en: escritorios (menú del escritorio), pizarras (share dialogs existentes), biblioteca (ítems/carpetas), cerebro (ramas de memoria).

## 6. Cerebro · Neuronas (dispositivos)
- Panel "Neuronas" en `CerebroHub`: cada dispositivo conectado al perfil = neurona (cerebro+servidor). Presencia realtime (channel presence por cuenta, `deviceId` de realtime-sync), nombre/tipo/último visto y ajustes por neurona (recibir solicitudes de archivos, control de pantalla, sync) en `user_settings.prefs.neurons`.

## 6b. CasaOS (petición 2026-07-11) — servidor casero por neurona
- **Qué es:** [CasaOS](https://github.com/IceWhaleTech/CasaOS) — OS de nube personal (Go + Docker) que se instala EN el dispositivo (`curl -fsSL https://get.casaos.io | sudo bash`). NO puede correr dentro de Vercel: se integra como CONECTOR.
- **Neuronas:** cada neurona puede declarar su servidor CasaOS (URL `http://<ip>:80`, puerto configurable) → estado, panel embebido (iframe/enlace), instalación guiada, y sus apps Docker visibles desde el OS. Config en `user_settings.prefs.neurons[deviceId].casaos`.
- **Cerebros:** un cerebro puede usar una neurona-CasaOS como servidor/almacén de memorias (rama de fuentes/servidores existente) y como host de motores locales (Ollama/OpenLLM instalados vía app-store de CasaOS) para Aurora/Astraura.
- **Biblioteca/Librería OSS:** entradas de CasaOS (núcleo + app store + apps clave: Files, Nextcloud, Jellyfin, Ollama, Syncthing, AdGuard…) en `oss-library.ts` (categorías runtimes/almacenamiento/plugins) + sección "Servidores caseros" instalable desde la Biblioteca en TODAS las cuentas.

## 7. Responsive global (login, perfil y patrón general)
- Login: tarjetas centradas `w-full max-w-[380px]`, tabs del pill alineados (grid coherente con `rounded-full`), dock OCULTO en `/login`.
- Perfil: fila de pestañas con scroll-x limpio (`scrollbar-hide`, snap, sin recortes), redondeo consistente, contenido centrado `max-w` en pantallas grandes.
- Patrón: contenedores `mx-auto w-full max-w-*`, alturas con `svh/dvh` ancladas top+bottom, nunca anchos fijos en px para tarjetas.

## 8. Política · Educación · Cultura
- Publicaciones especializadas por sección (tipos arriba) + diseño de acciones mejorado + feeds con realtime (`os_posts`, `proposals`).

## 9. Propagación y despliegue
- Bump `DEFAULTS_VERSION` si cambian defaults persistidos; corregir mismatch `SYNCED_KEYS` (`starseed.dock.items.v1` → **v2**) para que el dock sincronice de verdad.
- tsc en el Mac (~90 s), commit como `alexbordongarrigos@gmail.com`, push a `StarSeedSystem/starseed-system` → Vercel; verificar status "Vercel" del commit.

## 10. Voz de Aurora (petición 2026-07-11) — Bark · GPT-SoVITS · OmniVoice
- Nuevos MOTORES del sistema de voz (`starseed.aurora.voice.v1`): **Bark** (suno-ai/bark, TTS generativo expresivo), **GPT-SoVITS** (RVC-Boss/GPT-SoVITS, clonación few-shot) y **OmniVoice** (k2-fsa/OmniVoice) — son servidores Python: se conectan por ENDPOINT configurable (neurona propia/CasaOS u hospedado), simbióticos entre sí (SoVITS puede clonar la voz que Bark genera; OmniVoice como multilingüe).
- **Regla Aurora siempre habla:** cadena de fallback gratis-primero (endpoint neural → Kokoro → voz del navegador mejor rankeada). Por defecto, voz NATURAL bonita: ranking automático de voces del navegador (neurales primero, es-*) sin configurar nada.
- Modulación EMOCIONAL/tonal por parámetros (velocidad, tono, energía, emoción) mapeada desde la personalidad activa; ajustable por chat y por contexto; Aurora puede auto-ajustarla por herramienta ("kind:'voice'" en aurora-tools). Ruteo inteligente vía Astraura/OmniRoute (+OpenRouter para lo generativo).

## 11. Personalidades de Aurora (petición 2026-07-11)
- `src/lib/aurora/personalities.ts`: personalidades como ARCHIVOS de configuración (JSON) compartibles/replicables/instalables (Biblioteca/entity-library) y elegibles POR CONTEXTO (global · por sección política/educación/cultura · por chat · por cerebro).
- Niveladores 0-100 por grupos: emociones, ego, filosofía, sentimientos, sentidos, capacidades/habilidades/skills, herramientas/plugins/MCP/API, contextos/conocimientos, alma, tono, género, estilo, actitud, carácter, forma de ser, sensibilidad, cultura, personaje, idioma, tipo de respuesta, recomendaciones, memorias/cerebros/preferencias.
- Compilación → system prompt de Astraura (mismo patrón que la capa de capacidades skills→astrauraChat) + mapeo a modulación de voz (§10). Presets incluidos + editor con sliders + import/export. Claves: `starseed.aurora.personalities.v1` (lista) + `starseed.aurora.personality.active.v1` (asignaciones por contexto) — añadir a SYNCED_KEYS.

## 12. Mapas en el Hub (petición 2026-07-11) — OrganicMaps/OSM
- Nueva sección **Mapa** en el Hub de Conexiones: Leaflet por CDN (sin dependencia de build) + capas conmutables: OSM estándar · satélite (Esri World Imagery) · topográfico (OpenTopoMap) · oscuro (Carto) · clima REAL (RainViewer radar sin clave + NASA GIBS satelital) — multi-fuente y ajustable.
- GPS del navegador + **compartir ubicación con permisos** (privado · usuarios/grupos seleccionados · toda la red) con presencia realtime; publicaciones/archivos/comentarios GEOLOCALIZADOS como marcadores (os_posts con metadata geo) integrados con el Lienzo Universal (/crear?geo=…); **propuestas democráticas** para nombres de zonas/lugares/comunidades y usos de suelo/espacios/eventos (tabla proposals, patrón de /network/politics).
- OrganicMaps se cataloga en la librería (app nativa OSM offline, misma filosofía de datos); atribución OSM obligatoria.

## 13. Seguridad integrada estilo Strix (petición 2026-07-11)
- `src/lib/security/scanner.ts`: escáner de SECRETOS/PII (claves API por patrón, tokens, cadenas de conexión, contraseñas, correos/teléfonos, rutas privadas) con niveles de riesgo y REDACCIÓN.
- Se ejecuta: (a) sobre memorias/cerebros/semillas por DEFECTO del sistema; (b) SIEMPRE al compartir/exportar y al instalar/importar cerebros, memorias, personalidades, archivos y configs (aviso + redactar antes de continuar). Panel "Seguridad" en Ajustes con escaneo bajo demanda. Strix (usestrix/strix) catalogado en la librería como suite avanzada para neuronas.

## 14. Raven · Skales · Mouzi (petición 2026-07-11)
- **Raven** (EverMind-AI/Raven) y **Skales** (skalesapp/skales): backends/adaptadores OPCIONALES de memoria e inteligencia para cerebros de Aurora/Astraura (endpoint por neurona; misma pauta conector que CasaOS), catalogados en la librería.
- **Mouzi** (hsr88/mouzi): inspiración del ORGANIZADOR INTELIGENTE — acción "Organizar inteligentemente" (clasifica por tipo/tema/fecha con Astraura, propone estructura, aplica con confirmación) disponible en biblioteca, cerebros (memorias), escritorios y carpetas de perfiles/cuentas/neuronas.

## 15. Bug de glitcheo en bucle ligado al scroll (petición 2026-07-11)
- Síntoma: en casi todas las secciones los elementos "se glichean/reinician en loop"; cambia o se detiene al hacer scroll en ciertas posiciones. Hipótesis a verificar: animaciones re-disparadas por visibilidad (whileInView/animate-in sin "once"), setState en scroll/intervalos que remonta subárboles, keys inestables. Corregir de raíz y documentar la causa real en state.md.
