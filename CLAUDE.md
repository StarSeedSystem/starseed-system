# 🌌 CLAUDE.md — Memoria de Trabajo del Proyecto StarSeed OS

> **Propósito de este archivo:** Contexto rápido que cualquier sesión de Claude (o cualquier agente IA) debe leer al iniciar trabajo en este repositorio. Es la "memoria de trabajo" — un mapa para encontrar el resto.
>
> **Para profundizar:** Lee los archivos en `memory/` y los documentos fundacionales referenciados al final.

---

## 1. Identidad del proyecto

- **Nombre del producto:** StarSeed Network — Sistema Operativo Social Descentralizado (SOSD)
- **Alias internos:** StarSeed Nexus, StarSeed OS, SSSS (Sistema de la Sociedad StarSeed)
- **Naturaleza:** Sistema operativo social abierto, accesible online, instalable, integrable en Linux/Android, accesible vía web y apps dedicadas.
- **Propietario / Visionario:** Alex Bordón Garrigós (alexbordongarrigos@gmail.com)
- **Organización GitHub esperada:** `StarSeedSystem`
- **Repositorio esperado:** `StarSeedSystem/starseed-system`
- **URL de despliegue (oficial):** `https://starseed-os.vercel.app` — este repositorio ES "StarSeed OS". El portal de marca del ecosistema es **StarSeed Nexus** (`https://starseed-nexus.vercel.app`, repo `alexbordongarrigos/Starseed-Cafe`), con su propio Supabase (`dzkjapinnewkxzjltadv`) — ⚠️ **NO comparte cuentas con el OS** (ver §2). Ver `architecture/integracion-portal-starseed-os.md`.

---

## 2. Estado actual del repositorio (mayo 2026)

- **Stack:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + Supabase + Genkit (Google AI) + Three.js / React-Three-Fiber + Framer Motion + Spline
- **Carpeta local:** `/Users/alex/Documents/starseed-os-main`
- **Git:** ✅ La carpeta **SÍ es un repositorio git** en la rama `main` (HEAD `5de826a`+), vinculado a `StarSeedSystem/starseed-system`. Los push disparan auto-deploy en Vercel. *(corregido 2026-07-21: antes decía erróneamente "NO es un repositorio git inicializado".)*
- **Servidor / deployment:** Configurado para Vercel (auto-deploy desde GitHub). **Google Cloud Run activo** como alternativa soberana (`Dockerfile` + `cloudbuild.yaml`, min 0 / max 5) → todo lo nuevo debe funcionar en **standalone** y leer su config por **env vars**. Existe además `apphosting.yaml` (Firebase App Hosting).
- **Base de datos:** Supabase — **proyecto propio del OS `nxstilnyidvkqeosofuh`**, con cuentas **SEPARADAS** de las de Nexus/Café (que usan `dzkjapinnewkxzjltadv`). Config en `supabase/` + cliente **singleton** en `src/utils/supabase/client.ts`. Schema implementado (`Account`, `Profile`, `Page`, `Post`, `StoreItem`, `LibraryItem`, `os_*`, `entity_state`, `os_spaces`). Migración `supabase/migrations/20260711120000_realtime_publication.sql` **APLICADA** (2026-08-09, A149 tanda 4). El backend **Astraura 1.58-bit** (repo `StarSeedSystem/astraura`) sincroniza su estado en la tabla `astraura_state` de ESTE proyecto (clave `service_role`, `~/.astraura/supabase_astraura.json`); migración que la formaliza con RLS: `20260822120000_astraura_state.sql` (A153, pendiente de aplicar por Management API).
- **Tema visual:** Sistema "Crystal Liquid Glass" + "Trinity" (Zenith/Horizon/Logic/Anchor).
- **Diseño activo:** Documentado en `design-system/starseed-system/MASTER.md` y en `STARSEED_ANALISIS_COMPLETO.md`.

### Rutas principales ya implementadas

| Sección | Ruta | Estado |
|---|---|---|
| Auth | `/login` | Implementado |
| Dashboard | `/dashboard` | Implementado (widgets arrastrables) |
| Network feed | `/network` | Implementado (gráfico holográfico) |
| Gobernanza | `/network/politics` | Implementado |
| Cultura | `/network/culture` | Implementado |
| Educación | `/network/education` | Implementado |
| Hub (comunidades) | `/hub` | Implementado |
| AI Agents | `/agent` | Implementado |
| Biblioteca | `/library` | Implementado |
| Explorer | `/explorer` | Implementado |
| Perfil | `/profile/[username]` | Implementado |
| Trinity Lab | `/trinity/*` | Showcase + variations |

---

## 3. Tríada Ideológica Nuclear (cláusulas pétreas)

Toda decisión técnica, de diseño o de producto debe respetar estos tres principios fundacionales. Son **inmutables** salvo para ampliar libertad, nunca para restringir.

### 🜂 Ontocracia — El Gobierno del Ser
- **Soberanía Directa:** El poder de decisión reside en el individuo. No hay representantes intermediarios.
- **Meritocracia del Entendimiento:** Autoridad técnica asignada por sabiduría aplicada verificable (Sistema de Insignias y Logros), no por riqueza, linaje o popularidad.
- **"Una Persona, Una Voz"** garantizado por verificación biométrica con criptografía de conocimiento cero (no se almacenan datos biométricos brutos).
- **Voto Delegado Líquido:** Delegable de forma revocable a expertos en temas específicos, nunca alienado permanentemente.

### 🜁 Ciberdelia — Tecnología para la Expansión de la Conciencia
- La tecnología jamás se usa como instrumento de control, vigilancia masiva o alienación.
- Propósito exclusivo: amplificar cognición, facilitar conexión empática, disolver barreras del ego, potenciar inteligencia colectiva.
- Estética "Cyberdelic" + "Liquid Crystal" + biomimética.
- IA personal = **Exocórtex** (propiedad del usuario, lealtad al usuario, no al sistema).

### 🜃 Transhumanismo Comunista — Evolución y Abundancia
- **Comunismo de Abundancia (Post-Escasez):** Recursos e infraestructura son procomún. Automatización libera del trabajo forzoso.
- **Evolución Simbiótica:** Integración ética bio-tecnológica para erradicar sufrimiento innecesario.
- Modelo de transición en 3 fases (ver §5).

---

## 4. Arquitectura dual del sistema

| Dimensión | Manifestación | Responsabilidad técnica |
|---|---|---|
| **Física (Cuerpo)** | Comunidades StarSeed (*Sanghas*) — nodos territoriales | Fuera del scope del repo (planificación arquitectónica humana) |
| **Digital (Mente)** | Red StarSeed (SOSD) — este repositorio | Sistema Operativo Social, federado, descentralizado |

La Red Digital es el **sistema nervioso** que coordina la voluntad general. El repositorio implementa esta dimensión digital.

### Tres ecosistemas funcionales en la Red

1. **Ecosistema Político:** Democracia directa, votación segura, debate legislativo estructurado, gestión de recursos comunes. → Rutas `/network/politics`, `/hub`.
2. **Ecosistema Educativo:** Biblioteca universal, aprendizaje inmersivo, mentoría híbrida humano + IA. → Rutas `/network/education`, `/library`.
3. **Ecosistema Cultural:** Expresión artística, Multiverso, eventos físicos coordinados. → Rutas `/network/culture`, `/publish`.

---

## 5. Plan maestro evolutivo (3 fases)

Este es el roadmap a nivel de sociedad. Para el roadmap técnico ver `memory/roadmap.md`.

### Fase Semilla 🌱 (Génesis cultural y magnética)
- Centros sociales magnéticos primero. Cohesión humana antes que infraestructura pesada.
- Economía híbrida: aceptamos recursos externos (donaciones, inversión ética) para financiar.
- Internamente: modelo de "donación consciente" y reputación.

### Fase Fruto 🌿 (Materialización y arraigo)
- Vivienda permanente, granjas verticales, fábricas automatizadas.
- Costo de vida cae al automatizar energía / agua / alquiler.
- Excedentes comercializados con el exterior, reinvertidos en automatización.

### Fase Cosecha 🌾 (Plenitud sistémica)
- Gratuidad sistémica: vivienda, comida, educación, salud, transporte desmonetizados.
- Dinero obsoleto dentro de la red.
- **Mitosis social:** comunidades que llegan al tamaño óptimo se dividen en nuevas células (no crecimiento canceroso).

---

## 6. Invariantes técnicas del Sistema Operativo Social

Reglas que el código debe respetar siempre.

- **Descentralización (Fediverso):** No un servidor central único. Federación de nodos interconectados.
- **Identidad Soberana:** Usuario es único propietario de sus datos. Criptografía extremo-a-extremo. Identidad portátil.
- **Código Abierto absoluto:** Todo el software, algoritmos y protocolos son Open Source y auditables.
- **Singularidad del contenido (Lienzo Universal):** Todo contenido es una **Entidad Única**. Al compartirse se referencia, no se duplica. Las actualizaciones se reflejan en todas las instancias.
- **Privacidad ↔ Transparencia dual:** Privado en lo personal. Transparente en el ejercicio de poder público.
- **Dualidad Cuenta/Perfil:**
  - **Cuenta (privada):** ancla legal soberana, contiene el "Registro Acásico Personal".
  - **Perfiles (públicos):** múltiples facetas (cívico, artístico, profesional) vinculadas a la cuenta única.
  - Responsabilidad legal recae siempre sobre la Cuenta raíz.
- **Justicia restaurativa, no punitiva:** El sistema digital no implementa bloqueos punitivos sino procesos de mediación (Círculos de Paz).

---

## 7. Sistema Trinity (interfaz UI)

Cuatro nodos cardinales del paradigma de interfaz. Tienen significado **arquitectónico y filosófico**, no solo visual.

| Posición | Color | Función | Filosofía | Componente |
|---|---|---|---|---|
| **Zenith** (Norte) | Electric Azure `#007FFF` | AI Contextual Guide | Sabiduría, Iluminación | `ZenithCurtain` |
| **Horizon** (Oeste) | Neon Lime `#39FF14` / Emerald `#10B981` | Creation Canvas | Vitalidad, Génesis | `SideCurtains` izq |
| **Logic** (Este) | Solar Amber `#FFBF00` / Burnished `#D4AF37` | System Control | Orden, Ejecución | `SideCurtains` der |
| **Anchor** (Sur) | System Crimson `#DC143C` | Main Trinity Dock | Estabilidad, Acceso Raíz | `OmniDock` |

Más detalles en `STARSEED_ANALISIS_COMPLETO.md` y en `memory/design-tokens.md`.

---

## 8. Cómo trabajar en este repo (instrucciones operativas)

1. **Lee siempre primero** este `CLAUDE.md` + el archivo de memoria más relevante en `memory/`.
2. **Si la lógica cambia**, actualiza primero el SOP en `architecture/` o el doc relevante en `memory/`, **luego** modifica el código (regla dorada del proyecto).
3. **Antes de añadir una feature**, comprueba que respeta la Tríada Ideológica (§3) y las Invariantes (§6).
4. **Después de cambios significativos**, actualiza `memory/state.md` con la fecha, el cambio y la razón.
5. **Antes de cualquier deploy**, verifica `DESPLIEGUE.md` y que el repo git esté sincronizado con `StarSeedSystem/starseed-system`.
6. **Tono y diseño:** sigue `design-system/starseed-system/MASTER.md`. No usar emojis como iconos (usar Lucide/Heroicons). Cursor pointer en todo lo clicable. Transiciones 150-300ms.

---

## 9. Glosario rápido

| Término | Significado |
|---|---|
| **SOSD** | Sistema Operativo Social Descentralizado (este software) |
| **SSSS** | Sistema de la Sociedad StarSeed (el conjunto físico + digital) |
| **Sangha** | Comunidad StarSeed física (nodo territorial) |
| **E.F.** | Entidad Federativa (unidad de gobernanza territorial o digital) |
| **Oikos** | El hogar común (planeta + comunidad local) |
| **Exocórtex** | IA personal propiedad del usuario |
| **Multiverso** | Espacios de realidad virtual de la red |
| **B.L.A.S.T.** | Protocolo interno: Blueprint, Link, Architect, Stylize, Trigger |
| **A.N.T.** | Arquitectura interna de 3 capas: Abstract, Neural, Tangible |

---

## 10. Documentos fundacionales (fuente de verdad)

### Drive (Constituciones — autoridad máxima)
1. **Constitución de la Sociedad StarSeed** — `1XpltI3gkYN1Ma2wBVrlisPagL_HfeoF1RsnFKG09w4I` ([Drive](https://docs.google.com/document/d/1XpltI3gkYN1Ma2wBVrlisPagL_HfeoF1RsnFKG09w4I/edit))
2. **Manifiesto Fundacional** — `1YiX9QK_JJHbmRMRj8fXrJeNffsDQ8T2RhzMHTeyavA0` ([Drive](https://docs.google.com/document/d/1YiX9QK_JJHbmRMRj8fXrJeNffsDQ8T2RhzMHTeyavA0/edit))
3. **Codex StarSeed (Arquitectura social y hábitat)** — `1Q7ygZvMlrVD4I7nO36jC4t8ttFezw__2K_w54L6HXNc` ([Drive](https://docs.google.com/document/d/1Q7ygZvMlrVD4I7nO36jC4t8ttFezw__2K_w54L6HXNc/edit))
4. **Documento Maestro del SOSD** — `1DaX2bl8dIMSKR1yVtOHqh3iVtV_sLARMiSPFGkywa3M` ([Drive](https://docs.google.com/document/d/1DaX2bl8dIMSKR1yVtOHqh3iVtV_sLARMiSPFGkywa3M/edit)) — *documento técnico amplio, pendiente de lectura por chunks*
5. **Fundamentos de Sociedad StarSeed** — `1Mq0A529ZJyff7FaJcUNRNLjIkfodd9MRjWkvezAycjc`
6. **Comunidades StarSeed** — `1QKFprsQ4mF6YfV8FhPZryq-oETWrCyVaOHUTAvNQXN0`
7. **Fase Semilla (Docs 1, 2 y 3)** — `1zrpGdk27bDHYeaWo6FdwQ9mbioj_jdnJZ7TPhepbcpE`, `1s-AP5hy3IkY1yJmAIHN-ti4flAit6Q3RdQvmTOuNVd0`, `1Fd3WOcX8FDQ_6YAmc9V0StXmSdsxmX4c2wa3TpYW_ZQ`

### Locales (código y diseño)
- `STARSEED_ANALISIS_COMPLETO.md` — análisis completo del sistema actual
- `gemini.md` — constitución técnica del proyecto (B.L.A.S.T., A.N.T.)
- `DESIGN.md` — design rationale
- `DESPLIEGUE.md` — instrucciones de despliegue
- `design-system/starseed-system/MASTER.md` — design system completo
- `architecture/astraura-mesh-meshtastic.md` — **SOP de la Adenda 97**: Red Mesh Meshtastic/LoRa en el núcleo de Astraura (descubrimiento P2P pasivo, router inteligente Mesh↔Wi-Fi con histéresis, sync comprimida con presupuesto de duty cycle, hardware por Web Serial/BLE/daemon + simulador, reglas mesh por neurona, pestañas «Personalidades»/«Red Mesh» de /agent, OmniVoice Mixer y xAI one-shot). **Ampliado en la Adenda 98** (§11): modo dual malla+router simultáneo, autodetección de banda/preset, selector inteligente de radiofrecuencia, federación de topologías (os_mesh_topology), privacidad/permisos, Centro de Conexiones (Control Center + barra superior) y página /red-mesh con mapa 3D. Fuente de verdad de esa ola.
- `architecture/centro-creacion-sync-permisos.md` — **SOP de la Adenda 63** (2026-07-11/12): sesión persistente (singleton Supabase), Centro de Creación Trinity + `/crear`, sync realtime de la Biblioteca, **permisos universales** (`src/lib/sharing/access.ts`), neuronas + CasaOS, voz y personalidades de Aurora, mapa del Hub, seguridad estilo Strix. Fuente de verdad de esa ola.
- `architecture/astraura-158-sistema-primario.md` — **SOP de la Adenda 153** (2026-08-22): **Astraura 1.58-bit** (repo `StarSeedSystem/astraura`, carpeta `~/Documents/IA 1.58 bit`, Vercel `astraura.vercel.app`, Cloud Run, Supabase del OS) como **sistema PRIMARIO de inteligencia** del OS; todas las fuentes anteriores quedan como secundarias. Proveedor `src/ai/providers/astraura-158.ts`, fuentes `astraura-158-local`/`-nube`, capa `src/lib/astraura/primary-system.ts` (clave `starseed.astraura.primary-system.v1`; precedencia agente › personalidad › cerebro › neurona › cuenta › defecto), bloque «SISTEMA PRIMARIO» en `router.ts`, proxy `/api/ai/astraura-158`, panel `/agent?tab=astraura-158`, tarjeta en la pestaña LLM de la ventana A149, puente `backend/app/api/starseed_bridge.py` en el repo 1.58 y migración `astraura_state`. Fuente de verdad de esa ola.
- `architecture/astraura-config-sistemas-neurona.md` — **SOP de la Adenda 149** (2026-08-06): ventana «Configuración/actualización de sistemas de Astraura en esta neurona» (título por contexto; pestañas LLM · Astraura · OpenVoice · Cerebro · Señales POR PERSONALIDAD con procedencia y «volver a auto»), capa neurona×personalidad (`src/lib/astraura/neuron-persona-store.ts` + `neuron-persona-systems.ts`, clave `starseed.astraura.neuron-persona.v1`) **cableada al runtime** (router LLM `intelligencePinFor`, voz `engine-registry`, memoria `effectiveMemoryPolicy`, mesh `persona-antenna-gate.ts`) y accesos en 6 superficies. Fuente de verdad de esa ola.
- `starseed.config.json` — config global de runtime
- `task_plan.md` — checklist de fases B.L.A.S.T.

### Memoria activa (en `memory/`)
- `memory/principles.md` — desarrollo extendido de la Tríada y derivados
- `memory/roadmap.md` — roadmap técnico de 3 fases para el SO
- `memory/architecture.md` — decisiones de arquitectura técnica
- `memory/state.md` — bitácora de cambios (actualizar tras cada sesión)
- `memory/glossary.md` — glosario extendido

### Inteligencia de Aurora (Astraura) — capa agéntica
- `architecture/astraura-inteligencia.md` — **fuente de verdad** del router de IA gratis-primero, failover, uso/costes, sentidos (visión SmolVLM2 · voz Kokoro), neuronas (cada dispositivo = cerebro+servidor) y Biblioteca-Cydia. Núcleo en `src/ai/astraura/`. Adaptado a Nexus/Café vía `astraura-core.js`. Regla: Aurora **siempre** funciona (gratis y local primero) y cambia sola de fuente si una se agota.

---

## 11. ⚠️ MEDIOS DEL OS (navegación) y métodos de conexión/sincronización — LÉELO ANTES DE "AÑADIR UNA FUNCIÓN"

> **Regla dorada de descubribilidad:** crear una ruta `src/app/(app)/<x>/page.tsx` NO la hace accesible. El usuario navega por el **OmniDock** y el **App Launcher**, NO por URLs. Si una función no se registra en los medios correctos, para el usuario "no cambió nada". Registra SIEMPRE en los tres sitios.

### ⚠️ El menú de `/agent` son ahora las 21 áreas del sistema original (Adenda 158)

`src/app/(app)/agent/page.tsx` → `STUDIO_SECTIONS`. Desde la **Ola 6** el esqueleto del menú de «Astraura
AI & Orchestration» son las **21 áreas del programa original Astraura 1.58-bit** (Chat Multiagéntico &
Voz · VoiceStudio & Forja de Sonido · Proyectos y Creaciones · Imaginación Intuitiva · Enrutamiento de
Almacenamiento & Medios · Sensorium 360° & Clima · Privacidad & Permisos de Sensores · Notificaciones &
Logs · Cerebros Multidimensionales · Memorias y Recuerdos · Personalidades / Arquetipos · Enjambre de
Agentes · Navegador Autónomo · Explorador del Dispositivo · Workflows & Automatización · Habilidades &
Bóveda · Instalador Universal & Scan · Biblioteca StarSeed · Telemetría 1.58-Bit · Terminal & Sandbox ·
Configuración & Preferencias), más una sección 22 propia del OS: «Gobernanza de la Red».

- Las pestañas del Studio 1.58 (`src/components/astraura/s158/*`) se montan como secciones de primer nivel
  con **`S158TabHost`** (`src/components/astraura/s158-host.tsx`), que resuelve destino (local/nube),
  manifiesto y recarga. Añadir un área nueva = añadir su `value` a `STUDIO_SECTIONS` + un `<TabsContent>`
  con `<S158TabHost tab="…" />` + su alias.
- Los 45 `value` históricos **siguen existiendo** dentro del área que les corresponde. Nunca renombres un
  `value`: añade un alias en `TAB_ALIASES`. Un `value` desconocido falla **en silencio**.
- ⚠️ `navegador` (ventanas guardadas del OS) y `navegador-158` (navegador autónomo del backend) son cosas
  DISTINTAS. `navegador` no se aliasa.
- **Página propia nueva:** `/imaginacion` (Imaginación Intuitiva), también embebida en `?tab=imaginacion`.
- SOP de la ola: `architecture/astraura-158-ola6-menu-imaginacion-orbe.md`.

### Cómo se registra una app/página para que el usuario la vea
1. **OmniDock** (dock inferior, Trinity Anchor — el lanzador principal): `src/components/layout/dock-config.ts`
   - Añade un `DockItemConfig` a `DOCK_PRESETS` (`{id,label,iconKey,path,color,enabled:true,origin:'preset'}`).
   - Iconos: importa de lucide + añade la clave a `DockIconKey` y a `DOCK_ICON_MAP` (deben coincidir).
   - **CRÍTICO:** para cuentas ya existentes, `loadDockConfig` añade los presets nuevos como `enabled:false` (por eso "no aparecen"). La forma CORRECTA de garantizarlos hoy es subir `DOCK_DEFAULTS_VERSION` y añadir el id a `DOCK_DEFAULT_ON_IDS` en `src/lib/dock/dock-defaults.ts` — la versión viaja DENTRO del payload sincronizado, así que llega a todas las cuentas, neuronas y perfiles (las viejas migraciones one-shot `starseed.dock.items.migrated.vN` eran locales al navegador y no llegaban; se conservan por compatibilidad). El dock del usuario se guarda en **localStorage** (`starseed.dock.items.v2`) y se sincroniza con la cuenta vía `user_settings.prefs`.
2. **App Launcher / Catálogo**: `src/components/dashboard/apps/app-catalog.ts`
   - Añade un `StarseedApp` a `APP_CATALOG` (`open:{primary:'route',allowed:[...],route:'/x'}`) y su `id` a `APP_COLLECTIONS.starseed`/`.sistema`. Alimenta también el desktop add-panel y el XR hub.
3. **Biblioteca instalable** (opcional, paridad): `src/lib/library/packages.ts` (`kind:'app', payload:{route:'/x'}`). El icono string se resuelve por `ICON_MAP` en `package-store.tsx` (añade la clave allí si es nueva).

### Superficies de navegación (dónde vive cada cosa)
- **OmniDock** (`omni-dock.tsx` ← `dock-config.ts`) — lanzador principal, editable por el usuario (folders, orden), persistido en localStorage. Reusado por `quick-options-grid.tsx` y `quick-access-widget.tsx`.
- **Trinity Control Center** (`layout/trinity/control-center.tsx`) — se abre por el **borde derecho ámbar (Logic)** (hover 400ms o clic). Módulos: system, quick, **conexiones**, home, notif. La pestaña «Conexiones» monta `ConnectionsTab → ConnectionsCenter`.
- **Barra superior del escritorio** (`components/desktop/desktop-canvas.tsx:~1465`) — botón `ConnectionsMenu` (Wi-Fi + RadioTower) → `ConnectionsCenter compact`. **Solo en `/escritorios`.**
- **Hub de Conexiones** = componente `ConnectionsCenter` (`src/components/connectivity/connections-center.tsx`), pestañas internas **Conexiones · Señales(→SignalsCenter) · Internet(→RedMeshCenter)**. NO es una ruta.
- Rutas de red: `/red-mesh` (RedMeshCenter, mapa 3D), `/senales` (SignalsCenter), `/sincronizacion` (Syncthing), `/servidores` (AccountSync+Servers), `/red-3d`, `/conexiones` (⚠️ conectores de servicios, subsistema DISTINTO al mesh).
- ⚠️ **Dos "conexiones" distintas:** *conectividad/red* (mesh/wifi/bt = `ConnectionsCenter`) vs *conectores de servicios* (`/conexiones` = `UserConnectorsHub`). No confundir.

### Métodos de conexión y sincronización del OS
- **Malla LoRa** (`src/ai/astraura/mesh/`): cola por prioridad P0–P3 + duty cycle (`sync.ts`); transportes serial/BLE/**daemon(http/WiFi-TCP)**/simulador (`meshtastic-adapter.ts`); `connectWifiNode(host)` = mesh por IP a un nodo por TCP. Arranca con `startMeshSubsystem()` (`index.ts`).
- **Red sináptica** (Adenda 99, `synaptic-router.ts`/`delivery.ts`/`server-relay.ts`): política público→servidor / privado-local→P2P / privado-lejano→relé cifrado, con failover y recibos; faros de descubrimiento + bandeja de relé (`synaptic.ts`, sondeo 30–40s).
- **Federación de topologías** (`federation.ts`): Supabase `os_mesh_topology`, push 45s / pull 60s (RLS por owner). **Relé/feed/faros**: `os_mesh_relay` (Adenda 99).
- **Supabase Realtime** (`src/lib/realtime/realtime.ts`): `postgres_changes` sobre `supabase_realtime` (~31 tablas) — backbone de datos en vivo.
- **Sync de cuenta/dispositivos** (`src/lib/sync/realtime-sync.ts`): `postgres_changes` en `user_settings` + canal `broadcast acct:<uid>` (anti-eco por deviceId). Panel en `/servidores`.
- **Syncthing** (`/sincronizacion`): sync P2P cifrado de archivos entre dispositivos.
- **Memory-root** (`src/lib/memory-sync/manifest.ts`, SOP `architecture/memoria-cerebros-sync.md`): contrato de manifest (diseño, aún sin I/O real a cuenta).
- **App nativa** (Adenda 99c, `native-access.ts`): cuando el navegador no da acceso al hardware (BLE/serie en iOS/Firefox, WiFi directo, datos), recomienda instalar Meshtastic por SO. Detección PWA por `display-mode: standalone`.

*Fuente: exploración verificada 2026-07-29 (Adenda 99d). Detalle en `claude/os-medios-navegacion-conexion-sync` del proyecto.*

---

*Última actualización del archivo: 2026-08-24 (Adenda 158 · Ola 6 — el menú de `/agent` pasa a ser el del sistema original 1.58-bit, página propia de Imaginación Intuitiva y orbe cuántica de voz)*


---

## 🧠 Sistema de Memoria (memory root)

La memoria viva del proyecto vive en **`starseed_memory_root/`** — un *memory root*
portátil con **raíz + ramas**: `soul/ ego/ skills/ style/ memory/ dream/ accounts/
tasks/ logs/` + `index.md` + `sync.md` + `memory.manifest.json`.

- **Lee `starseed_memory_root/index.md` al iniciar.** Toda petición nueva → `tasks/tasks.md`; al completar → `tasks/past_task.md`; eventos → `logs/logs.md`.
- Espejo en Google Drive (*My Drive/StarSeed_Memory_Root*) + enlace en el Escritorio.
- Vinculable a cerebros/servidores/VMs (ver `sync.md` + `architecture/memoria-cerebros-sync.md`). ⚠️ No conectado a cuenta aún (prueba futura: *Ester*).
- La **memoria profunda** (architecture/principles/glossary/roadmap/state) sigue en `memory/`.

---

## 💠 Economía de créditos y orquestación multiagente (regla permanente · Adenda 219)

**Ningún modelo, proveedor ni sesión debe agotar sus créditos.** Quien trabaje aquí —Claude
Code, Cowork, Hermes, Gemini, Codex, OpenCode, Antigravity o el propio OS— ramifica las tareas
por coste (lo mecánico a subagentes gratis: `starseed-sub <rol> "prompt"`; lo difícil al modelo
capaz), releva al siguiente proveedor ante 429/402 sin insistir, y **deja el punto de relevo**
(commit + adenda + `starseed_memory_root/state.md`) antes de acercarse a su límite para que otro
modelo continúe solo. Capas y dónde se editan: `memory/orquestacion-economica.md` (léelo).
En esta flota, **AIHubMix** (`AIHUBMIX_API_KEY`, 412 modelos con 54 gratuitos) es el **revisor
principal**, y **UTIM** (`@emend-ai/utim` v2.3.19) actúa como **segundo agente de código** para
multiplicar agentes en paralelo; la tabla completa de proveedores y cupos está en
`memory/orquestacion-economica.md` (sección «Flota de proveedores»).
Proveedores comunitarios con clave solo en el servidor: `/api/ai/openrouter`
(`OPENROUTER_SHARED_KEY`) y `/api/ai/nvidia` (`NVIDIA_SHARED_KEY`, NVIDIA NIM · 82 modelos).
Hermes tiene `providers.nvidia` (`NVIDIA_API_KEY` en `~/.hermes/.env`). Claves: nunca en el repo
ni en memorias — solo nombres de variables. **Cada respuesta termina con un informe de uso**
(modelos/APIs/tokens/créditos usados, cuánto queda y opciones de enrutamiento).

## 📚 Fuentes externas de APIs, herramientas y patrones (regla permanente · 2026-09-04)

Antes de inventar un endpoint, un conector o un patrón de agente, **se mira si ya existe**. Seis
catálogos indexados en local, refrescables con `starseed-fuentes refrescar` y consultables con
`starseed-fuentes buscar <texto>` (acepta español). Índices en `starseed_memory_root/fuentes/`:

| Fuente | Licencia | Para qué |
|---|---|---|
| [public-apis](https://github.com/public-apis/public-apis) | MIT | 1737 APIs públicas gratuitas en 51 categorías → `apis-publicas.json` |
| [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) | MIT | 3477 servidores MCP → `mcp-servers.json`. Todo agente debe llevar los MCP que su tarea necesite |
| [awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps) | Apache-2.0 | 100+ agentes y habilidades: siempre activos, equipos multiagente, voz, UI generativa, memoria, RAG |
| [OpenDesign](https://github.com/nexu-io/open-design) | Apache-2.0 | Diseño nativo de agentes: prototipos, presentaciones, paneles, imágenes, documentos y motion MP4; importa de Figma |
| [Langflow](https://github.com/langflow-ai/langflow) | MIT | Flujos de agente visuales desplegables como API o servidor MCP; candidato a diseñar las olas |
| [OpenHands Agent Canvas](https://github.com/OpenHands/openhands) | MIT | Ejecuta agentes en local/Docker/VM. Sin CLI headless (verificado): sirve para paralelizar fuera de la Mac, no como ejecutor del enjambre |

El enjambre las reparte solo: `contexto_inteligente()` mira las palabras de cada tarea y le pasa al
agente **el puntero y el comando de búsqueda**, nunca el catálogo entero (economía de contexto).

## 🌌 Inteligencia primaria del OS (Adenda 155 · 2026-08-23)

**Astraura 1.58-bit** (backend soberano propio: BitNet b1.58 ternario nativo) es el **sistema
primario** de toda la inteligencia del OS; el resto de sistemas siguen como secundarios y se
configuran por **agente > personalidad > cerebro > neurona > cuenta**
(`src/lib/astraura/primary-system.ts`). Superficies: **Studio 1.58**
(`/agent?tab=astraura-158&sub=…`, 13 pestañas en `src/components/astraura/s158/`), feed de eventos
→ centro de notificaciones (`src/lib/astraura/astraura-158-feed.ts`), siembra de personalidades y
agentes (`astraura-158-import.ts`), proxy `/api/ai/astraura-158/*`. SOP:
`architecture/astraura-158-sistema-primario.md` (§14 Ola 3, §14.6 correcciones, §14.7 verificación
real 11/11). Antes de tocar esta capa, leer ese SOP.

## 🔁 Relevo Claude ⇄ Hermes ⇄ enjambre (regla permanente · 2026-09-03)

Estado ÚNICO compartido en la Mac: `starseed_memory_root/relevo/` (`estado.json`, `relevo.md`,
`bitacora.jsonl`, `PROMPT-HERMES.md`, `PROMPT-CLAUDE.md`), mantenido por `~/.local/bin/starseed-relevo`.
**Al empezar** cualquier sesión (Claude con puente, Hermes, Codex, OpenCode…): `starseed-relevo estado --por <agente>`
y leer `relevo.md`; continuar desde «Último relevo»/«Última nota». **Al avanzar:** `starseed-relevo nota
--de <agente> "hecho…; sigue…"`. **Al parar o cambiar de agente:** `starseed-relevo handoff --de <agente>
--a <otro> "resumen"` (regenera los PROMPT-*.md que Alex pega en un chat nuevo). Tareas compartidas:
`starseed-relevo tarea add|nota|done|list`. **Un solo agente escribe en el working tree a la vez** (si
`pgrep -f starseed-olas.py` responde, el enjambre está activo: nadie más edita ni commitea); los crons nunca
hacen `git add -A` ni `push`. Numeración de adendas: la del relevo. Sesión Claude SIN puente a la Mac: leer
el doc del proyecto `claude/relevo-actual.md` (copia de relevo.md subida en cada handoff). **Contexto largo
= créditos**: cada llamada reenvía todo el historial; antes que una sesión eterna, sesión nueva + relevo.
Hermes tiene la skill `~/.hermes/skills/starseed-relevo` y la regla en `~/.hermes/SOUL.md`.

### Flota de escritores del enjambre (verificada 2026-09-04)

**xKiro** (`https://api.xkiro.com/v1`, clave en la variable `XKIRO_API_KEY`) — 110 modelos, **40
gratis con tool-calling** y 5M tokens/día. Comprobado en vivo que **opencode SÍ edita archivos**
con ellos (qwen3-coder-plus, minimax-m3 y devstral-medium modificaron un archivo de prueba);
esto es lo que fallaba con aihubmix y tokenrouter, que se quedan de revisores. Su Cloudflare
rechaza el User-Agent por defecto de urllib con 403: las llamadas HTTP mandan uno propio.

Escritores en rotación, alternando proveedor para repartir carga:
xkiro/qwen3-coder-plus · nim/kimi-k3 · xkiro/minimax-m3 · nim/deepseek-v4-flash ·
xkiro/qwen3.8-max · nim/deepseek-v4-pro · xkiro/deepseek-v4-pro · xkiro/devstral-medium.

Revisores: xkiro/qwen3.7-plus y xkiro/minimax-m2.7-highspeed primero, luego aihubmix,
tokenrouter, NIM, OpenRouter y Gemini al final (Google se reserva).

`validar_modelos()` comprueba los catálogos de NIM y xKiro al arrancar cada ola y saca de la
rotación lo que ya no exista. Modelos caídos el 2026-09-04: gpt-oss-120b (410, fin de vida),
qwen3-coder-480b (fuera del catálogo) y kimi-k2.6 (opencode no lo resuelve).

⚠️ Claves SOLO en `~/.hermes/.env` (chmod 600) y `.env.local` (ignorado por git). Nunca en el
repositorio, ni en documentos, ni en memorias: solo el nombre de la variable.

### Supervisor en tiempo real (2026-09-04)

Nada espera a una comprobación programada. Tres capas, todas dentro del propio orquestador:

1. **Supervisor de proveedores** (`supervisor_proveedores`, cada `STARSEED_SONDEO_S`=60 s): sondea
   con un GET barato xkiro, nim, aihubmix, tokenrouter y openrouter. Dos fallos seguidos y el
   proveedor se marca **caído** en `~/.starseed/salud-proveedores.json`, que **comparten todas las
   olas**: sus modelos salen de la rotación al instante y ninguna tarea pierde el tiempo
   intentándolo. Cuando vuelve a responder, se reincorpora solo. Ambos sucesos avisan al momento
   (bus + Hermes).
2. **Reenrutado dentro del bucle**: antes de cada intento se relee la salud; si ese proveedor
   acaba de caerse, se salta sin gastar intento (evento `reenrutado`).
3. **Vigilante de tareas** (cada 20 s), en dos tiempos:
   - `STARSEED_ARRANQUE_S`=120 s sin escribir **ni una línea** desde que empezó la fase → no está
     pensando, está atascado: se corta y se reenruta.
   - `STARSEED_ESTANCADO_S`=420 s sin avance a mitad de trabajo → mismo corte.
   La línea de partida del log se guarda por fase, para no confundir «escribió algo» con «el log
   ya venía lleno de una ola anterior».

La espera por memoria bajó de 15 a 5 minutos (`STARSEED_ESPERA_MEM_S`): pasado ese plazo arranca
igual y, si de verdad no puede, el vigilante lo corta a los dos minutos.

`starseed-vivo` muestra la salud de los cinco proveedores junto al estado de cada tarea.

### Un solo orquestador para la Mac y la nube · espera en vez de rendirse (2026-09-04, noche)

`starseed-enjambre.py` es EL MISMO archivo en `~/.local/bin/` (Mac) y `~/bin/` (contenedor de
Cowork): adivina el repo (`~/Documents/starseed-os-main` o `~/starseed-system`) y los worktrees
si no hay `STARSEED_ROOT`/`STARSEED_WT`. Lo que aprendió esta noche:

- **Un 200 con aviso de cuota NO es una respuesta.** aihubmix devolvía «accounts that have not
  been recharged can only try 10 times» como contenido y seis commits (MD2, MD6, VZ1, VZ3-5) se
  integraron con eso archivado como «revisión ok». `es_aviso_de_cuota()` lo convierte en fallo del
  proveedor (revisor y sonda). Se revisaron después de verdad (revisiones.md, «RETROACTIVA»).
- **429 = esperar, no quemar la lista.** `ESPERA_429_S`=75 s y se reintenta el MISMO modelo (2
  veces) antes de pasar al siguiente. Si TODOS los proveedores útiles están caídos, la tarea espera
  hasta `ESPERA_PROVEEDOR_S`=45 min (fase «esperando proveedor») en vez de darse por perdida en
  2 segundos (VZ2, 22:31).
- **La cola viaja en el bus**: el evento `arranque` lleva las tareas (id, ola, título, depende)
  para que el Puente de Mando de la otra máquina las dibuje aunque no tenga el archivo
  (`starseed_memory_root/` no se versiona).
- xKiro tiene **cuota diaria** para los modelos `:free` (la agotamos el 04-09 a las ~20:50 UTC);
  aihubmix gratis solo permite 10 llamadas sin recarga. Revisores que sí quedan: tokenrouter
  (`z-ai/glm-5.3-free`, pensante: `max_tokens` 2500) y NIM.
- El supervisor avisa «recuperado» UNA vez (estado en memoria, no releyendo el archivo).

### Puente de Mando · Ramificación multiagéntica (2026-09-04, noche)

Pestaña **Procesos** → `RamificacionAgentes` (`src/components/mando/ramificacion-agentes.tsx`):
el árbol de cada ola por niveles de dependencia con flechas, tarjeta por tarea con su rama
agente → revisor → commit, latido vivo (fase, modelo·proveedor, tokens reales in/out, llamadas,
barra de ventana), ficha con pasos/eventos/contexto. Datos: `GET /api/mando/ramificacion`
(`src/lib/mando/ramificacion.ts`: colas de disco + colas del bus + progreso + pasos + eventos +
latidos). Se relee cada 20 s. En `/mando` no se montan los globales del OS (`AppGlobals`).

### Voz: una sola copia del modelo en la Mac (2026-09-04, noche)

`/api/voz/salud` y `/api/voz/hablar` prueban primero el tts-server crudo en 4500 y, si no hay,
hablan con el **demonio Astraura** (`native/astraura-voice/daemon.mjs`, 127.0.0.1:4444, pool de
tts-server en 4501+; launchd `com.starseed.astraura-voice`). No lances un segundo tts-server a
mano: son 900 MB por copia en una Mac de 8 GB.
