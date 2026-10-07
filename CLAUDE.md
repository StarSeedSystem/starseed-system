# 🌌 CLAUDE.md — Memoria de Trabajo del Proyecto StarSeed OS

## Nombre: **Genesis** (antes «Puente de Mando») · regla permanente (Alex, 2026-10-07)

«En todo StarSeed OS, en todos sus contextos, tanto para individuales como grupales y comunales;
renombra todo el Puente de Mando a Genesis.» Así se llama el producto en TODO texto que lea una
persona o un agente: interfaz, avisos, Chat Director, Telegram, plugin, documentos y prompts
(«el Mando» → «Genesis», «del Mando» → «de Genesis», «Genesis de <grupo>», «Genesis para todos»).
La página es **`/genesis`** (`/mando` redirige con su `?pestana=`/`?ambito=`), la orden de Claude
Code es `/genesis` (`/mando` sigue como alias) y el lanzador del Escritorio `Genesis.command`.
**Los identificadores de código NO cambian, a propósito:** `src/lib/mando`, `src/components/mando`,
`/api/mando/*`, tablas `mando_*`, `STARSEED_MANDO*`, servicios `com.starseed.mando`, `scripts/puente/`,
el plugin `puente-de-mando` y su prefijo de herramientas — renombrarlos rompería servicios,
migraciones, el enjambre en marcha y los enlaces guardados, sin que nadie lo vea. Guardia:
`src/lib/__tests__/nombre-genesis.test.ts` (falla si un texto de `src/` vuelve a decir «Puente de
Mando», «Centro de Mando» o «Mando» a secas). El botón guardado del dock se renombra solo
(`renombrarMandoAGenesis` en `src/lib/dock/dock-defaults.ts`, sin volver a encender nada).

## Acceso a Genesis · léelo antes de tocar nada (2026-09-12)

**[Abrir Genesis](http://localhost:9002/genesis)** — la aplicación Next.js del repo, servida
por launchd (`com.starseed.mando`, `next start` sobre el build compilado). **Doble clic en
`~/Desktop/Genesis.command`** (fuente: `scripts/puente/Genesis.command`, que
`instalar-servicios.sh` copia al Escritorio): revive por launchd lo caído (Astraura, gobernador,
vigilante, director), compila el OS si falta `.next/BUILD_ID` con el turno de la máquina
(`scripts/puente/con-turno.py`), arranca el servidor ligero y abre el navegador. A mano:
`bash scripts/puente/instalar-servicios.sh` y luego `estado`. *(El 9003 fue un `next dev` provisional
de Astra del 09-11; no es Genesis. `Orquestacion-StarSeed.command` —Adenda 185, visor Python en
:8899— quedó retirado el 2026-09-20: su copia vive en `docs/legado/` y lo único que aportaba y Genesis no tenía, la cuenta de tokens de las sesiones de Claude Code, es la cola 352.)*

**Cómo se opera, quién vigila qué y con qué modelo, cuotas, recursos de API y la revisión horaria
de Fable/Opus: `memory/orquestacion-economica.md` §0.** Es la regla permanente; va vinculada a
cada sesión que abra el Puente desde cualquier IDE. Resumen de una línea: el enjambre escribe con
modelos gratuitos, seis directores en Python (cero créditos) lo mantienen vivo y honesto, Astra dirige,
y un modelo caro solo audita una vez por hora y arregla lo que los demás no saben.

No confundir HTTP 200 con tareas verificadas. **UN** orquestador, N agentes; tres puertas
(`tsc`, `vitest`, `next build`) o nada; nunca `next build` con el enjambre vivo; **la salida de un
motor de escritura es un candidato, no un archivo** (un archivo que encoge más de la mitad no se integra).

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
- **Malla de neuronas — detección y auto-vínculo** (Ola 366, `src/lib/network/malla-neuronas.ts`): montaje global (`MallaNeuronasMount`, layout raíz, excluido de `/genesis`/`/voces`) que detecta las neuronas de la MISMA cuenta (`neuron_devices`, online <3min, heartbeat lento en pestaña oculta) y las auto-vincula por WebRTC **sin botón** cuando hay ≥2 online (glare cortés/descortés por id, reintento con backoff, ficha de dispositivo intercambiada al conectar); además detecta neuronas cercanas de OTRAS cuentas solo por faros (`os_mesh_relay`, nunca radio LoRa, respeta `capaMeshCompartiendo()`). Unifica los 3 namespaces de id históricos (`identidad-dispositivo.ts`) sin invalidar los ya guardados. UI en el Hub de Conexiones (pestaña «Malla») y en `/red-mesh` (`MallaNeuronasPanel`). Vínculo entre cuentas queda **fuera de alcance** (pide consentimiento de ambas): botón «Solicitar vínculo» deshabilitado a propósito. Hook de resumen para otros módulos: `usePeersMalla()`. SOP: `architecture/malla-neuronas-autovinculo.md`.
- **Syncthing** (`/sincronizacion`): sync P2P cifrado de archivos entre dispositivos.
- **Memory-root** (`src/lib/memory-sync/manifest.ts`, SOP `architecture/memoria-cerebros-sync.md`): contrato de manifest (diseño, aún sin I/O real a cuenta).
- **Google Drive como medio de cualquier cerebro/memoria** (Ola 374, 2026-09-27, mismo SOP §«Ola 374»): REAL, no diseño — OAuth con custodia en SERVIDOR (`storage_credentials` cifrado AES-256-GCM, `src/lib/storage/credenciales-servidor.ts`; nunca `refresh_token` al navegador), driver real `src/lib/storage/gdrive-driver.ts`, sync por cerebro `src/lib/storage/gdrive-brain-sync.ts` (regla: el más nuevo gana, ningún borrado se propaga solo) wired en `syncBrainMemoryNow`, backend genérico `gdrive` en `REAL_DRIVER_KINDS`, UI en Cerebro → Memoria → Fuentes.
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
**Núcleo de IA de Astraura** (2026-09-20, `memory/astraura-nucleo-158-needle3.md`): BitNet 1.58
genera, **Needle 3** decide con herramientas en local (0,12 s, 22–127 MB, `POST /api/needle/decidir`
en el backend de Astraura, renovación automática cada 6 h) y Jev decide con mundo; primero Needle,
luego Jev, luego LLM. Needle 2 queda para el ESP32.
**Trinidad de razonamiento** (2026-09-20, `memory/trinidad-razonamiento-astraura.md`): reflejo (Needle,
intención → herramienta) → juicio (Jev, elegir/sí-no con probabilidad) → deliberación (BitNet o el enrutador
económico); una puerta por medio (`scripts/puente/razonador.py`), cada decisión anotada como experiencia y
un ciclo nocturno que entrena el adaptador colectivo de Needle con lo acertado. Needle no juzga: medido.
**Jev** (2026-09-20, `memory/orquestacion-economica.md` §9): decisiones tipadas con probabilidad
por $0,00002 (`scripts/puente/jev.py`) para veredictos de bloqueadas, Telegram, errores de pasarela
y el veto de la aprobación sola; consejero con umbral, nunca oráculo; techo 0,05 $/día; en
OpenRouter solo ids `:free` (hay 10 $ de crédito que nadie debe gastar sin querer).
**Jev nativo** (2026-09-20, ola 357): Jev pasa de cliente a ENRUTADOR con pirámide — 1) motor
LOCAL gratis sobre el BitNet b1.58-2B que ya sirve en `127.0.0.1:8790` (`/completion` con
`n_probs` devuelve las probabilidades por token: es la misma técnica de openjev, decider y
nimble — no se genera texto, se leen los logits de las opciones); 2) OpenRouter
`~typesafe/jev-latest` con techo; 3) la regla determinista de quien llama, siempre. Puerta única
para Astraura, el enjambre y todos los IDE: `POST /api/jev/systemone`, con el contrato de
openjev, para poder cambiar el motor de debajo sin tocar a nadie. **El motor local está
congelado mientras el enjambre escribe** (`guardia-memoria.py`, Mac de 8 GB): por eso es una
pirámide y no un reemplazo.
**Protocolo común de los agentes** (2026-09-30, `architecture/protocolo-comun-agentes.md`, §17 de la
orquestación): TODO agente —escritor y revisor del enjambre, analista de los sueños, supervisor
Claude, subagente de Claude en la terminal, Hermes, un IDE— carga el MISMO contexto de su rol
(`python3 scripts/puente/contexto_agente.py --rol <rol> [--area X]`: reglas con su fuente, protocolo
Jev, herramientas con su orden exacta, área y relevo) y decide la zona de duda por la MISMA puerta
(`python3 scripts/puente/decidir.py si-no|elegir|puntuar … --regla <lo que harías> --quien <tú>`):
la regla primero y de respaldo, Jev solo con p ≥ 0,8 (veta, nunca convierte un «no» en «sí»),
«jev: p=…» anotado y `decidir.py confirmar <exp>` cuando se sabe si acertó; si Jev calla, se sigue.
`decidir.py uso` da el gasto del día frente al techo.
**Toda repo o modelo que Alex traiga y se integre entra en la Biblioteca del OS**
(`src/lib/library/packages.ts`, `kind: "ai-source"` o `"repo"`) con su ficha de información y
comprobación automática de versión contra el upstream (`/api/library/actualizaciones`). Lo que
no corre en esta máquina se marca `comingSoon` con el motivo a la vista: una ficha no promete
lo que no hace. (Regla de Alex, 2026-09-20.)
**Gobernador de recursos** (2026-09-20, §10): `scripts/puente/gobernador-recursos.py` escribe
cada minuto `~/.starseed/gobernador.json` con el tope VIVO de trabajadores = siempre el máximo
(`maximo_hardware` = 3 en 8 GB; Alex 22:40: «olvida lo de 1 agente, la mayor cantidad posible»);
solo con < 150 MB de RAM libre quita uno, nunca menos de 2; el orquestador lo relee (`tope_gobernador`).
Los agentes de la nube se suman con `scripts/puente/repartir-a-nube.py` (cola-nube versionada). **Más agentes a la vez = más medios**, nunca más procesos en una
máquina que no cabe: la receta para sumar un medio está en §10. **Regla permanente de explicación** (2026-09-20): cada paso que se le pida a Alex viene
explicado — **QUÉ es, POR QUÉ hace falta y CÓMO se hace** — sin dar por sabido ningún término de
infraestructura. «Secretos del repo», «pasarela», «fichaje», «variable de entorno»: si aparece un
concepto, se explica ahí mismo, en una frase. Nombrar algo no es explicarlo, y un paso que Alex no
entiende no lo va a dar. **Los avisos de fichaje diario van al chat de Hermes** con el enlace
directo (`hermes send -t telegram:Maggasukha -s "<asunto>" "<cuerpo>"`, comprobado el 2026-09-20),
para que pueda reactivar la pasarela desde el móvil.
**Regla permanente de prioridad** (Alex, 2026-09-20): los directores ordenan la lista con
inteligencia de importancia, y **lo que sube el TECHO del sistema va primero** — activar más
agentes simultáneos y elegir o arreglar los modelos que usan mandan sobre el resto. En
`scripts/puente/prioridad_logica.py` es un **tramo propio**, no un peso más: como peso, cualquier
tarea de ayer la adelantaba solo por antigüedad, y una prioridad que se pierde acumulando horas
no es una prioridad. Se detecta por las rutas que gobiernan la capacidad (gobernador, medios,
nube, pasarelas, renovador, modelos, el workflow del enjambre) o marcando `importancia:
"capacidad"` en la tarea.
**Regla permanente de entrega a Alex** (2026-09-20): para todo lo que requiera una acción suya,
dale el **enlace directo y/o el comando exacto de terminal**, listo para copiar y pegar — nunca la
descripción de lo que tendría que hacer. Y antes de pedírselo, comprobar si se puede hacer desde
aquí: si se puede, se hace. Varias acciones suyas se reducen a una sola (un guion que las agrupe)
antes que repartirle deberes. Lo único que se le reserva de verdad es lo que mueve CREDENCIALES
suyas a un tercero o cambia la configuración de sus cuentas.
**Regla permanente de capacidad**
(Alex, 2026-09-20): usar siempre la mayor capacidad simultánea disponible — antes de dar por bueno
un número de agentes hay que SONDEAR todos los medios (`scripts/puente/medios_disponibles.py`) y
ENCENDER los que estén en `usable`, que son medios apagados, no medios trabajando. Y decir siempre
el número con su desglose por medio y con cuántas tareas quedan en cola: más agentes que tareas no
es capacidad, es ruido. **Desde Genesis es UN botón** (2026-10-05): «Buscar más capacidad en todos
los medios», el único botón general de los medidores Agentes, Tareas en curso, Listas y Contenedores
(Alex: «son demasiados botones… que sea solo uno fusionado funcional»; `scripts/puente/buscar_capacidad.py`):
llena la Mac hasta su tope, vuelve a medir los contenedores, reabre en la nube lo que solo agotó sus tres envíos con los proveedores
saturados (`~/.starseed/nube-reaperturas.json`: una reapertura devuelve un envío, como mucho dos por
tarea en dos días y nunca dejando a la Mac sin trabajo para su tope), lanza hasta 2 jobs de GitHub
Actions y dice medio por medio qué sumó y por qué no más. La autocuración lo repite cada 30 min.
**Ramas de la nube: nada se tira sin revisar** (2026-10-06, `memory/aprendizaje-ramas-nube.md`): en la misma pasada de
30 min, `traer_nube.py` trae lo integrado, repara lo que quedó a medias y `revisar_ramas_nube.py` revisa lo que main ya
superó —las pruebas que main no tiene pasan a una tarea de rescate (regla ≥ 3 casos; Jev solo veta perder, p ≥ 0,8)—,
archiva en `refs/archivo/nube/…` + paquete en `starseed_memory_root/archivo/`, anota lo aprendido y solo entonces borra
del remoto (permiso permanente de Alex). En el orquestador, **una rama reutilizada se pone al día con main antes de
escribir** (`poner_al_dia`): sin eso las puertas corrían sobre un main de hace días (0 de 12 integradas el 2026-10-05).
**Lo que hace la nube llega a main solo** (2026-10-05, `scripts/puente/traer_nube.py`, cada 30 min
desde la autocuración): lo integrado en una rama `nube/*` entra por cherry-pick con el cerrojo
`integrar` tras pasar `tsc` y las pruebas relacionadas EN LA MAC (si no, se deshace con
`reset --keep`); lo que quedó a medias se convierte en una tarea sucesora en
`cola-reparar-nube.json` que continúa desde su rama y comprueba el propósito en el contexto de hoy;
lo que repararlo sería contraproducente (ya en main, sustituido, propuesta de los sueños) se
pregunta en el Chat Director. **Ninguna rama se borra sin la palabra de Alex** (Alex: «en vez de
borrar ramas que se corrijan, arreglen y desarrollen… se pregunta antes de borrar»):
`traer_nube.py borrar --ramas …` solo borra las que constan como superadas. BitNet
vive en cualquier medio con `scripts/nodo-bitnet.sh` (repo de Astraura), que mide RAM/núcleos y
elige hilos/contexto/slots solo.
En esta flota, **AIHubMix** (`AIHUBMIX_API_KEY`, 412 modelos con 54 gratuitos) es el **revisor
principal**, y **UTIM** (`@emend-ai/utim` v2.3.19) actúa como **segundo agente de código** para
multiplicar agentes en paralelo; la tabla completa de proveedores y cupos está en
`memory/orquestacion-economica.md` (sección «Flota de proveedores»).
Proveedores comunitarios con clave solo en el servidor: `/api/ai/openrouter`
(`OPENROUTER_SHARED_KEY`) y `/api/ai/nvidia` (`NVIDIA_SHARED_KEY`, NVIDIA NIM · 82 modelos).
Hermes tiene `providers.nvidia` (`NVIDIA_API_KEY` en `~/.hermes/.env`). Claves: nunca en el repo
ni en memorias — solo nombres de variables. **Cada respuesta termina con un informe de uso**
(modelos/APIs/tokens/créditos usados, cuánto queda y opciones de enrutamiento).
**Consumo de bases de datos** (2026-09-29, `memory/orquestacion-economica.md` §15): el plan gratuito
de Supabase NO tiene límite de gasto diario, así que lo ponemos nosotros. `scripts/puente/vigia_consumo.py`
(cada 15 min, sin tráfico del proyecto) mide peticiones y salida estimada por día UTC contra
`~/.starseed/presupuestos.json` (25.000 peticiones · 150 MB/día · 5 GB/ciclo): aviso al 70 %, **freno
remoto** en `os_freno` al 100 % hasta las 00:00 UTC, y alarma de **bucles** (ruta > 1.500/h o agente +
ruta > 800/h). `scripts/puente/limites_supabase.py` pone los topes del servidor (PostgREST `max_rows`
1000, límites de Auth y Realtime). Se verifica en el medidor **«Consumo y créditos»** de Genesis.

## 🌐 Navegador de los agentes: extensiones de Claude y de ChatGPT en el Chrome de la fundación (2026-09-08)

En el Chrome de la Mac, con la sesión de **fundacionstarseed@gmail.com**, están instaladas y
**verificadas en vivo** las extensiones de **Claude** y de **ChatGPT**. Los agentes las usan para
lo que necesiten: leer documentación, entrar a paneles que no tienen API (NotebookLM, Google AI
Studio, los paneles de claves de los proveedores), comprobar el OS desplegado y rellenar
formularios con el visto bueno de Alex.

Dos caminos, y no son el mismo:

| Camino | Herramientas | Quién puede usarlo |
|---|---|---|
| **Claude en Chrome** (extensión) | `mcp__claude-in-chrome__*` | Sesiones de Claude. Comprobado: 1 navegador conectado (`Browser 1`, macOS) |
| **Control Chrome** (MCP local de la Mac) | `mcp__remote-devices__Control_Chrome__*` | Cualquier agente que corra EN la Mac: Hermes, Codex, opencode local. Comprobado: `list_tabs` responde |
| **Navegador del backend 1.58** | `backend/app/tools/browser_tool.py` | Los agentes de Astraura, por `/api/ai/astraura-158/*` |

⚠️ **El navegador es una capacidad de la MAC, no de la nube.** Los agentes del enjambre que
corren en el contenedor de Cowork **no** llegan al Chrome de Alex: si una tarea necesita el
navegador, se lanza en la Mac (`STARSEED_MEDIO=mac`) o se reasigna a ese servidor desde Genesis.
Escribirlo en el prompt de una tarea de la nube es pedirle algo que no puede hacer.

Reglas de uso, que valen para todos: nunca introducir contraseñas ni datos de pago; nunca aceptar
términos, publicar, enviar formularios ni comprar sin la palabra explícita de Alex; en avisos de
cookies, elegir siempre la opción más restrictiva; y **jamás sacar claves ni tokens de la máquina
dentro de un contexto de navegación**.

En el **Taller del agente** (`src/lib/agentes/taller.ts`, Ola 291) estas tres vías aparecen como
recursos de tipo `herramienta`/`mcp` con origen `os` y `astraura`, para que cada agente las tenga
declaradas junto a sus habilidades, conexiones, prompts y plugins.

## 🚦 Publicar: `next build` es la ÚNICA puerta que ve los errores de empaquetado (2026-09-08)

`tsc` y `vitest` **no detectan** que un módulo de servidor se cuele en el paquete del
navegador. El primer despliegue de los 176 commits murió con `Failed to compile · node:crypto ·
UnhandledSchemeError` porque un componente de cliente (`nuevo-vinculo.tsx`) importaba el VALOR
`PERMISOS_DEFECTO` de `src/lib/externos/vinculos.ts`, que abre con `import { createHash,
randomBytes } from "node:crypto"`. Las dos puertas del enjambre estaban en verde.

Reglas del área:
- **Antes de publicar, `next build` completo** (en la nube: `NODE_ENV=production
  NODE_OPTIONS=--max-old-space-size=5120 npx next build`). Ninguna otra comprobación lo sustituye.
- Un módulo que importe `node:*` (`node:crypto`, `node:fs`, `node:child_process`) es **solo de
  servidor**: sus tipos y constantes puras van en un archivo aparte (`tipos.ts`) que el cliente
  importa, y el módulo de servidor los reexporta. `import type` no contamina; **un import de valor
  sí**. Hoy son solo de servidor: `externos/vinculos.ts`, `mando/modelos-disponibles.ts`,
  `mando/claves-servidor.ts`, `mando/colas.ts`, `security/rate-limit.ts`.
- **El push va desde la Mac**, no desde el contenedor: el proxy de la nube deniega el
  `git push` («not in this session's authorized repository set»). Flujo: `git bundle create` en la
  nube → SendUserFile → `device_commit_files` a `.transfer/` → en la Mac `git fetch -q
  .transfer/<bundle> +main:nubeN && git merge --ff-only nubeN && git push origin main`.
- Verificar el despliegue con `npx vercel ls starseed-os --scope starseeds-projects` hasta «Ready»
  y, si sale «Error», `npx vercel inspect <url> --logs --scope starseeds-projects`.
- **El layout raíz no carga motores pesados de forma estática** (2026-09-27). Medido: con los relés
  de IA, archivos y vínculos de la malla importados estáticamente en `malla-neuronas-mount.tsx`
  (layout raíz, todas las rutas) y el relé genérico dentro de `providers/index.ts`, Vercel pasó de
  ~3 min a **«Compiled successfully in 27.6min»** y la build de la Mac no terminaba (swap 11 GB).
  Cargándolos a demanda (`import()` en un efecto, `next/dynamic` sin SSR) volvió a 3 min.
  Regla: lo que cuelga del layout raíz o de `providers/index.ts` y no hace falta para pintar se
  carga perezoso. Después de publicar, mira el tiempo de compilación en `vercel inspect --logs`:
  si se multiplica, algo nuevo entró en el grafo común.
- **Main quieto mientras se publica** (2026-10-05): `publicar.py` toma el cerrojo `integrar` (el
  del orquestador y `commit-seguro.py`) desde el principio hasta el push. Si el enjambre integra un
  cambio de `src/` durante las puertas, la build instalada deja de servir y la publicación intenta
  compilar EN LA MAC, que ya no cabe (la build en frío pide más de 7 GB: dos publicaciones
  cayeron así). Las tareas no fallan: esperan e integran al acabar el push. La build se hace en la
  nube (swap de 6 GB en el contenedor) y se instala con `instalar_build.py` ANTES de publicar.
- **Una ruta de Next solo exporta** `GET/POST/…/config/runtime/dynamic/maxDuration…`: cualquier
  otra función exportada rompe la comprobación de tipos de Next (`.next/types`, TS2344). Las
  funciones auxiliares van en `src/lib/…`.

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
| [Flowise](https://github.com/FlowiseAI/Flowise) | Apache-2.0 | **Archivado el 2026-08-13 (EOL, sin sucesor)**: no se instala. Se tomó como patrón: el **Diseñador de olas** de Genesis (nodos editables → guardar cola → lanzar por API, aquí o en la nube con orden firmada), la ficha de ejecución por nodo y los nodos de aprobación humana (ya reales) |
| [itsfree.ai](https://itsfree.ai/?cat=api) · [FreeTheAi](https://github.com/Free-The-Ai/free-ai) · [freellmapi](https://github.com/tashfeenahmed/freellmapi) | — · — · MIT | Catálogos de **APIs de IA gratuitas** para la orquestación económica (2026-09-05): de itsfree.ai entró **LLM7.io** (sin clave: `gpt-oss`, `minimax-m2.7`; revisor siempre disponible) y la lista de cuentas que solo Alex puede abrir (Groq, Cerebras, Cloudflare, ModelScope, Z.ai, SambaNova, OpenCode Zen); FreeTheAi entra con `FREETHEAI_API_KEY` (Discord); freellmapi es un enrutador autoalojado (29 proveedores, un bearer, failover) que se conecta como **pasarela declarada por entorno** (`STARSEED_PASARELA_<NOMBRE>_URL/_KEY/_MODELOS/_RPM`, sin tocar código). Tabla completa en `memory/orquestacion-economica.md` §5 |
| [GitNexus](https://github.com/abhigyanpatwari/GitNexus) | PolyForm Noncommercial | **Grafo del código** del repositorio (`.gitnexus/`, ignorado): símbolos, llamadas, comunidades y flujos. El orquestador da a cada agente el **mapa** de su tarea, al revisor el **radio de impacto** del diff y al visto bueno humano los flujos que la rama toca; la orbe de Genesis lo consulta con `{"accion":"mapa"}`. Habilidad `.agent/skills/grafo-codigo`. Solo uso interno (no se empaqueta en el producto) |

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
  para que Genesis de la otra máquina las dibuje aunque no tenga el archivo
  (`starseed_memory_root/` no se versiona).
- xKiro tiene **cuota diaria** para los modelos `:free` (la agotamos el 04-09 a las ~20:50 UTC);
  aihubmix gratis solo permite 10 llamadas sin recarga. Revisores que sí quedan: tokenrouter
  (`z-ai/glm-5.3-free`, pensante: `max_tokens` 2500) y NIM.
- El supervisor avisa «recuperado» UNA vez (estado en memoria, no releyendo el archivo).

### Genesis · Ramificación multiagéntica (2026-09-04, noche)

Pestaña **Procesos** → `RamificacionAgentes` (`src/components/mando/ramificacion-agentes.tsx`):
el árbol de cada ola por niveles de dependencia con flechas, tarjeta por tarea con su rama
agente → revisor → commit, latido vivo (fase, modelo·proveedor, tokens reales in/out, llamadas,
barra de ventana), ficha con pasos/eventos/contexto. Datos: `GET /api/mando/ramificacion`
(`src/lib/mando/ramificacion.ts`: colas de disco + colas del bus + progreso + pasos + eventos +
latidos). Se relee cada 20 s. En `/genesis` no se montan los globales del OS (`AppGlobals`).

### Diseñador de olas y lanzamiento remoto (2026-09-05)

Pestaña Procesos → botón **Diseñar ola**: tareas con id, título, archivos, prompt, dependencias
(chips) y modelo; importar una cola existente para rehacer lo que falló; vista previa con el
mismo árbol; **Validar · Guardar cola · Lanzar** (`src/lib/mando/colas.ts`, `/api/mando/colas`).
Lanzar «aquí» arranca `~/.local/bin/starseed-enjambre.py` desacoplado; lanzar «en la nube»
publica en el bus un evento `lanzar` con la cola entera y una firma HMAC
(`STARSEED_LANZADOR_SECRETO`, solo en `.env.local` y `~/.starseed/env` de las dos máquinas) que
recoge `~/starseed-vigia/lanzador.py` en el contenedor (`setsid -f python3 -u …`; no sobrevive a
un reinicio del contenedor: relanzarlo al retomar la sesión). Órdenes sin firma, caducadas
(>15 min) o de otra máquina se anotan como `lanzar_rechazado`. Verificado de punta a punta el
2026-09-05 con `cola-241-prueba-disenador` (P1 → commit e3c22c9).

### Asistente técnico de Genesis · la orbe (2026-09-05)

En `/genesis`, tocar la orbe de Astraura abre el **asistente técnico de administración de la
orquestación** (`src/components/mando/{asistente-mando,orbe-asistente}.tsx`); la pestaña Chat
tiene la sección «Asistente técnico» (mismos chats, guardados en
`starseed_memory_root/mando/chats/`, no versionados) y la sección «Orquestación (bus)».
Selector de modelo con TODO lo disponible (`GET /api/mando/modelos`: los 40 gratuitos de xKiro
por su catálogo, NIM, aihubmix, tokenrouter, OpenRouter, Gemini y Ollama local; salud del
supervisor, claves de `process.env` o de `~/.starseed/env`/`~/.hermes/.env`, nunca al cliente).
Cada turno (`POST /api/mando/asistente`, `src/lib/mando/asistente.ts`) lleva el estado vivo
(repo, olas y tareas, agentes con tokens/fase, proveedores, fila, relevo, bus) y memorias por
palabras (memory/*.md, CLAUDE.md, relevo, progreso, revisiones, informes). El modelo puede
proponer acciones en JSON —`ver_tarea`, `leer` (rutas de una lista blanca; nunca .env),
`lanzar`, `detener`— que la interfaz ejecuta; lanzar y detener piden confirmación humana.
Verificado el 2026-09-05 con Kimi K3 (4.573/260 tokens, 35 s) y xKiro qwen3-coder-plus.

### Medidores de tareas y «medio» de cada agente (2026-09-05)

Cabecera de Genesis: además de ola activa, en curso, commits y proveedores, **Integradas · En
curso · Fallidas · Sin cambios · Pendientes** de la ola activa (detalle: total de las últimas
olas), calculados por la ramificación (`cuentas` en `/api/mando/estado`). Cada agente y cada
tarea llevan su **medio** —desde dónde se están usando las APIs: quién lanzó el orquestador—:
`hermes`, `claude` (Cowork/Claude Code, también el contenedor), `terminal`, `mando` (Diseñador
de olas o lanzador de la nube), `cron`, `opencode`. Lo detecta `medio_de_lanzamiento()` en el
orquestador (`STARSEED_MEDIO` explícito → `CLAUDECODE` → ejecutables de la cadena de procesos
padre → consola) y viaja en todos los eventos, en los latidos locales y en la foto del bus. Las
colas son portables: el evento `arranque` lleva también el prompt de cada tarea y el Diseñador
de la otra máquina las importa («de la otra máquina»).

### Reasignar agentes: servidor, API y modelo por tarea (2026-09-05)

En la ficha de cada tarea de la ramificación (botón **Reasignar**; también desde «Agentes en
vivo») se elige **Servidor** (Mac ⇄ nube), **API** (xkiro, nim, aihubmix, tokenrouter,
openrouter: las que opencode puede usar para escribir) y **Modelo** (catálogo vivo de
`/api/mando/modelos`), con confirmación. `POST /api/mando/colas {accion:"reasignar"}` →
`reasignarTarea()` (`src/lib/mando/colas.ts`):

- **Mismo servidor** → orden `reasignar` por tarea: archivo `olas/control-<cola>.json` en la
  Mac o evento firmado `control` en el bus para la nube (el lanzador lo deja en el archivo).
  El vigilante del orquestador lo lee cada 20 s: si la tarea está escribiendo, corta ese
  opencode, descarta lo que dejó a medias y sigue **el mismo flujo** (escritura → tsc → tests
  → revisión → integración) con el nuevo modelo, sin gastar intento; si está en otra fase,
  queda anotado para la próxima escritura; si aún no empezó, empieza con él. Un modelo que
  no esté en `~/.config/opencode/opencode.json` se añade al vuelo (solo el nombre; las claves
  siguen en `{env:…}`). Si el proveedor consta «caído» por un dato viejo (>10 min), se
  sondea antes de apartarlo.
- **Otro servidor** → la tarea y sus dependientes aún no terminados se `sueltan` donde estaban
  (estado `reasignada`, no se vuelven a ejecutar allí) y se lanzan en el destino como cola
  nueva `cola-<nombre>-<tarea>` con el modelo elegido. El otro servidor debe tener `main` al
  día (paquete) para que las dependencias ya integradas existan allí; en el árbol la tarea
  movida es una sola rama.

Verificado el 2026-09-05 con la Ola 242 (tres tests reales): P1 reasignada de NIM a xkiro
mientras escribía (API), P2 movida de la nube a la Mac (API) e integrada allí, P3 reasignada
de DeepSeek a Kimi desde la ficha de Genesis (UI) e integrada en la nube; 115 tests en verde.

### Nodos de aprobación humana (2026-09-05)

Patrón «human in the loop» de Flowise, ya real: en el Diseñador de olas la casilla **«mi visto
bueno antes de integrar»** lanza la cola con `--aprobacion` (Mac) o `aprobacion: true` en la
orden firmada (nube → `STARSEED_APROBACION=1`); también vale `"aprobacion": true` en una tarea
suelta de la cola. El orquestador hace todo lo de siempre (escritura → tsc → tests → revisión)
y, en vez de integrar, deja la rama `ola/<id>` lista, publica `esperando_aprobacion` (rama, sha,
diffstat, dictamen del revisor, modelo) y espera hasta `STARSEED_ESPERA_APROBACION_S` (6 h). Genesis lo enseña arriba de Procesos («Esperando tu visto bueno», con el diff y el dictamen), en
la ficha de la tarea y en la cabecera («Tu visto bueno»). **Aprobar e integrar** / **Rechazar**
viajan como orden de control (`aprobar`/`rechazar`: archivo `control-<cola>.json` en la Mac o
evento firmado `control` para la nube): aprobar integra en main por ff; rechazar conserva la
rama (`rechazada`); sin decisión a tiempo, `pendiente_aprobacion` con la rama conservada
(`git merge --ff-only ola/<id>` a mano o relanzar `--solo`). El worker queda ocupado mientras
espera: con 2 trabajadores, dos ramas esperando paran la cola hasta que decidas.

Otras lecciones del 05-09: `database is locked` (dos opencode arrancando a la vez sobre su
SQLite) ya no cuenta como «sin cambios» del modelo: se espera 8 s y se reintenta el mismo, y los
arranques de opencode se escalonan 4 s. `venv/` estaba versionado por error (1.623 archivos):
fuera del repo, sigue ignorado. `.env.example` sí se versiona (`!.env.example` en .gitignore).

### Grafo del código (GitNexus) en la orquestación (2026-09-05)

`npm i -g gitnexus && gitnexus analyze --skip-agents-md --skip-skills --no-stats .` en la raíz
deja en `.gitnexus/` (652 MB, ignorado por git) un grafo de conocimiento del código: 70.844 nodos,
177.834 aristas, 1.578 comunidades y 909 flujos de ejecución. Indexar cuesta 337 s y 2,2 GB de
pico → **solo en la nube**; la Mac recibe el índice copiado (`tar` de `.gitnexus/`) y lo consulta.
Consultar cuesta 1-2 s y cero tokens. Tres usos, todos en `starseed-enjambre.py`:

1. `mapa_codigo(t)` → en el contexto de cada tarea: los símbolos (archivo:líneas) y flujos que el
   grafo liga al título y a los archivos, más los comandos `gitnexus context|impact|query|
   detect-changes` para que el agente no haga grep a ciegas.
2. `impacto_cambios("ola/<id>")` antes de la revisión → paso `impacto` (archivos, símbolos, flujos,
   riesgo low…critical) y el radio de impacto entra en el prompt del revisor.
3. El evento `esperando_aprobacion` lleva `impacto`; Genesis lo enseña como chip en «Esperando
   tu visto bueno» y en la ficha de la tarea (`ImpactoDiff`, `data-testid="impacto-diff"`).

La orbe de Genesis puede proponer `{"accion":"mapa","consulta":"reasignarTarea"}` (símbolo →
`context`; «impacto <símbolo>» → `impact`; concepto → `query`), que `consultarGrafo()` ejecuta y
deja como turno «grafo» del chat. **No** se configura su servidor MCP en opencode (`gitnexus
setup`): 17 herramientas por turno cuestan más contexto de lo que ahorran; la CLI basta. Licencia
PolyForm Noncommercial: uso interno de la fundación, nunca dentro del producto.

### Pasarelas OpenAI-compatibles declaradas por entorno (2026-09-05)

Cualquier enrutador gratuito entra en la flota sin tocar código, con cuatro variables en
`~/.starseed/env` (chmod 600): `STARSEED_PASARELA_<NOMBRE>_URL` (base `/v1`), `_KEY`
(«sin-clave» si no exige), `_MODELOS` (revisores en orden; el primero es la sonda) y `_RPM`.
El orquestador lo sondea, lo mete en `REVISORES`/`CUPOS_RPM` y `llamar_llm` le habla; el catálogo
de Genesis (`/api/mando/modelos`, `modelosPasarelas()`) lo lista y `llamarModelo` lo usa. Verificado
con una pasarela de prueba sobre LLM7 (sonda 1,1 s; respuesta 3,8 s). Candidato: **freellmapi**
en local (`http://127.0.0.1:3001/v1`) cuando Alex cargue sus claves en su panel.

### Vercel: 250 MB por función y el trazador de archivos (2026-09-05)

El primer despliegue de Genesis falló: «api/mando/asistente is 2.21gb uncompressed». Causa: con
`const RAÍZ = process.cwd()` y lecturas `readFile(path.join(RAÍZ, rutaVariable))`, el trazador
(`@vercel/nft`) mete el proyecto entero en la función (src/, venv/, .git/, .next/cache/…).
Regla: en código de servidor la raíz sale de `raizDelProyecto()` (`src/lib/mando/raiz.ts`:
`STARSEED_ROOT` o `process.cwd()` en tiempo de ejecución, opaco para el trazador) y
`next.config.ts` lleva `outputFileTracingExcludes` (venv, .git, .next/cache para todo; src,
public, memorias, docs… para `/api/mando/**`). `maxDuration` de las rutas: 60 s como máximo
(plan de Vercel). Para ver los registros de un despliegue: `vercel inspect <dpl_…> --logs
--scope starseeds-projects` (la CLI de la Mac está en el equipo StarSeed's projects).

### Voz: una sola copia del modelo en la Mac (2026-09-04, noche)

`/api/voz/salud` y `/api/voz/hablar` prueban primero el tts-server crudo en 4500 y, si no hay,
hablan con el **demonio Astraura** (`native/astraura-voice/daemon.mjs`, 127.0.0.1:4444, pool de
tts-server en 4501+; launchd `com.starseed.astraura-voice`). No lances un segundo tts-server a
mano: son 900 MB por copia en una Mac de 8 GB.

### Modo ligero, oído residente y BitNet estable (2026-09-06)

El **modo ligero** (`scripts/starseed-ligero.sh {construir|arrancar|parar|estado|dev}`) sirve el OS
compilado (`next start -p 9002`, ~48 MB) y exporta `STARSEED_MANDO=1` y `STARSEED_LOCAL=1`: la **voz
y Genesis funcionan sin sesión en localhost** (nunca en Vercel). El build necesita **heap 4096**
por defecto, `construir --limpiar` y **≥ 4 GB de disco**; `construir/arrancar` descargan el vigilante
launchd `com.starseed.dev-vigilante` y `dev` lo recarga. El demonio de voz (`daemon.mjs`) usa el
**residente `asr_stream_server`** de VibeASR.cpp (modelos cargados una vez, sueño a los 5 min,
cesión de memoria del pool TTS cuando quedan < 1200 MB y 10 s sin síntesis) y **debe ir en
`ProcessType Interactive`** (Background hace que macOS ahogue CPU/I/O: un reconocimiento pasó de
15 s a 186+ s). El llama-server **BitNet** del backend Astraura (repo `astraura`) segfaulteaba en
`dequantize_row_i2_s` (BLAS) con prompts ≥ 32 tokens: se lanza con **`-ub 24 -b 24`** y la sonda de
cordura prueba un prompt ≥ 64 tokens; Ollama solo actúa con `ASTRAURA_OLLAMA_RESPALDO=1`. Detalle
en `docs/adendas/adenda-227-ligero-oido-residente-bitnet-estable-olas-254-256-2026-09-06.md`.

## 🧬 Aprendizaje continuo de Astraura 1.58 (2026-09-07)

Astraura 1.58 **aprende sola**: cada personalidad, agente, bot 3D y proceso imaginativo mejora
con su contexto mediante **adaptadores LoRA GGUF** cargados con `llama-server --lora` — **nunca
reentrenando el modelo base en la Mac**. Cinco capas: corpus vivo (JSONL por personalidad en
`data/aprendizaje/corpus/`, con privacidad y consentimiento), fábrica (QVAC `llama-finetune-lora`
en Metal por turnos; onebitllms en GPU de nube para el base), evaluación con puerta de regresión,
despliegue con registro y rollback (`starseed_memory_root/aprendizaje/adaptadores.json`) y cinco
agentes (Curador, Entrenador, Evaluador, Desplegador, Cronista) que corren como olas de tipo
`aprendizaje`. Manifiesto: `src/lib/astraura/aprendizaje/manifiesto.ts`. **SOP:**
`architecture/astraura-158-aprendizaje-continuo.md`. Soberanía: los datos no salen de la neurona
sin consentimiento y el usuario es dueño de cada adaptador.

## 🧭 Genesis ampliado y flota honesta (Adenda 228 · 2026-09-07)

Las olas 257–276 convirtieron Genesis en la **sala de control honesta y ampliada** de toda la
orquestación y de la inteligencia 1.58. Todo el código lo escribió el enjambre económico (NIM
kimi-k3/deepseek-v4 y xKiro; revisores kimi-k3/llm7) y **Claude supervisó, verificó cada endpoint
en la Mac y aprobó**. Fuente de verdad: `docs/adendas/adenda-228-mando-ampliado-aprendizaje-158-olas-257-276-2026-09-07.md`.

### Pestañas y superficies nuevas de Genesis
- **Oficina 3D** — `src/lib/mando/oficina.ts` (seres con ADN determinista `derivarAdn`, 7 salas,
  xp/nivel, `fusionarGenoma` nunca baja), servidor `/api/mando/oficina` (genomas en
  `starseed_memory_root/mando/oficina/genomas.json`, `exportar-predeterminado`), UI reusa `OficinaSeres`.
- **Almacenamiento/Drive en Neurona** — `/api/mando/almacenamiento` (df, regenerables con lista
  blanca, DriveFS, espejo rsync sin `--delete` a `My Drive/StarSeed_Memory_Root/neurona-<host>`,
  swap honesta, «aliviar»); tarjetas y «Disco libre» en cabecera; `POST /ceder` del demonio.
- **Commits pendientes** — `/api/mando/publicaciones` (commits sin publicar del OS y Astraura por
  ola, diffstat, delante/detrás, árbol limpio, enjambre escribiendo) + diálogo de confirmación.
- **Voces** — `voz-mando.ts`, `/api/mando/voces` + `voz-del-mando.tsx`, `panel-voces.tsx`, soporte
  de `?pestana=`; `TIMBRES` vive en `timbres-catalogo.ts` (sin «use client», para no romper el build).
- **Aprendizaje** — pestaña «Aprendizaje» y «Ramificación 1.58» en Procesos (BitNet → personalidades
  → agentes → procesos); `/api/aprendizaje/agentes|procesos`; corpus por HTTP con envoltorio `{procesos:[…]}`.
- **Servidor 1.58** — administrador de servidor de Astraura 1.58 para la capa nube (esta Mac hoy,
  Oracle u otro mañana): interruptor «Mantener encendida» (`caffeinate -i -m -s`, sin `-d`, vía
  launchd), «Apagar pantalla» (`pmset displaysleepnow`), estado backend/BitNet/túnel (solo huellas,
  nunca la URL), servicios `com.starseed.*` reiniciables y registro de servidores. Tipos puros
  `mando/servidor-astraura-tipos.ts`, servidor `mando/servidor-astraura.ts`, UI `panel-servidor.tsx`.
  SOP: `architecture/servidor-astraura-mando.md`.

### Reglas duras del área
- **Publicación**: solo desde la **Mac**, con `STARSEED_LOCAL=1` y la confirmación **escrita `PUBLICAR`**
  (o la palabra de Alex). **Excepción autorizada por Alex (2026-10-05 y 2026-10-07): la
  AUTOPUBLICACIÓN**, interruptor en Genesis · Ajustes (y en Publicación → Producción). Encendida,
  `scripts/puente/autopublicar.py` (servicio `com.starseed.produccion`, cada 5 min) publica ESE commit
  solo si pasa: análisis del lote (secretos, migraciones destructivas, vetos, Jev que solo frena) →
  pruebas del puente en la Mac (unittest + pytest) → CI de GitHub en `produccion/candidato` (tsc,
  vitest, núcleo mesh, `next build` con 8 GB de heap) → push fast-forward sin force → despliegue de
  Vercel en «success» + humo de `/`, `/login` y `/version.json`. Un fallo veta ese sha (espera un
  commit nuevo) y se dice en el Chat Director con el enlace y el motivo. Estado en
  `~/.starseed/produccion/autopublicar-estado.json`. Apagada, nada se publica solo. Rutas `/api/mando/*` son SOLO locales (404 en producción)
  y jamás devuelven claves ni rutas del disco.
- **Claves por medio (P9)**: capa `CLAVES_POR_PROVEEDOR` con `claves_de`, `clave_activa`, `agotar_clave`,
  `estado_claves`, sufijos `_2…_9` y **huellas sha256** (solo huellas, nunca valores). 429 → 1 h,
  402/cuota → 24 h, aviso único.
- **Sonda ligera `GET /models`**: la sonda por minuto es la de listado de modelos, **jamás generación** —
  la de generación quemaba el cupo diario de OpenRouter/aihubmix y tres 429 dejaban xKiro 24 h fuera.
- **Flota honesta**: Genesis clasifica proveedores con las claves presentes en la neurona
  (`clavesPresentes`), «dato antiguo» y la foto del bus; «Por conseguir» solo lista lo que Alex debe crear.
- **Tareas del enjambre**: **≤ 3 archivos y ≤ 120 líneas por archivo** (ESCRITURA_S 1500 s cortaba las de
  4–5), con **verificación en la Mac tras cada despliegue** — destapó 9 defectos que ningún revisor vio.
- **Aprendizaje continuo**: cinco agentes (Curador 30 min, Evaluador 60 min, Cronista 60 min; Entrenador/
  Desplegador «esperando fábrica»); el fondo **nunca despierta el BitNet** y no cae a Ollama salvo
  `ASTRAURA_OLLAMA_RESPALDO=1`; Curador atómico con `.bak` y `os.replace`; rotación de `logs.md`/`cronica.md` a 2 MB.
- **Verificación de la neurona**: `scripts/verificar-neurona.mjs` (checks HTTP, umbrales, `--voz/--oido/--bitnet`,
  `--help`, `starseed_memory_root/verificaciones/ultimo.json`); primera corrida real 92/100.
- **Cuidado**: `pgrep -f` mata la propia shell si el patrón aparece en la orden → usar `patr[o]n`.

## 📦 Versión del OS: UNA sola verdad y un checkpoint que la sella (Ola 303 · 2026-09-09)

Alex lo vio antes que nadie: la Librería anunciaba «última versión: 1 de julio de 2026» cuando el
OS iba por agosto. La causa era que **cada medio guardaba su propia versión**:

| Medio | Lo que decía |
|---|---|
| `src/app/(app)/library/page.tsx:1342` | `NEXT_PUBLIC_BUILD_DATE \|\| "2026.07.01"` — y esa variable no existe en ninguna parte |
| `src/components/library/os-download-card.tsx` | `version = "1.0.0-alpha"` |
| `src/data/starseed-apps-listings.ts` | `build: "2026.08.23"`, con el historial ordenado «por costumbre» |
| `package.json` | `0.1.3` |

Reglas del área, permanentes:

- **`src/lib/version/os-release.ts` es la ÚNICA fuente**: `OS_VERSION` (AAAA.MM.DD), `OS_FECHA`,
  `OS_CANAL`, `OS_NOTAS`, `formatearFechaBuild`, `versionMasReciente` (ordena por FECHA, nunca por
  posición en el array) y `etiquetaBuild()`. Es un módulo **puro**: lo importan componentes de
  cliente, así que jamás puede tocar `node:*` (ver §«Publicar: next build»).
- **Ningún medio escribe una fecha ni una versión a mano.** El test
  `src/lib/__tests__/medios-version-coherentes.test.ts` se pone rojo si alguien lo intenta; el
  historial `versions[]` del listado es la única excepción (ahí sí viven las versiones viejas).
- **Checkpoint al cerrar una ola:** `node scripts/checkpoint-version.mjs [--version AAAA.MM.DD]
  [--notas "…"] [--seco]` sella la versión en todos los medios a la vez y falla en alto si alguno
  no encaja. Se ejecuta **al completar una tarea u ola**, antes de publicar — es lo que hace que
  todos los usuarios vean la misma versión.
- **El instalador se decide por dispositivo**: `detectOS()` + `nativePackages()` en
  `src/lib/install/device-install.ts` y `mejorDescargaPara()` en `src/lib/install/mejor-descarga.ts`.
  Un formato que todavía no existe se enseña como `soon` con su motivo honesto: **nunca se ofrece
  un binario que no está firmado**.
- **Cada neurona decide cómo se actualiza** (`src/lib/neurons/actualizaciones.ts`): `manual` por
  defecto —nadie se lleva una recarga por sorpresa a mitad de trabajo— o `automatica` si el usuario
  la enciende.

## 🌍 El OS universal, libre y seguro: editable por la IA, compartible, con núcleo intocable (rumbo permanente · 2026-09-09)

Alex fijó el norte con estas palabras, y valen para toda decisión de arquitectura de aquí en
adelante:

> Cada usuario debe poder **editar su sistema con facilidad**, manteniendo conexiones seguras y
> coherentes con la red StarSeed y con todos los demás usuarios, incluida la **red mesh P2P** y todo
> tipo de telecomunicaciones, medios y dispositivos. Debe integrarse con **cerebros y agentes con
> memoria** y acceso a toda la red e internet. **Todo el UI y UX debe ser editable desde el código en
> tiempo real por la misma IA**, con cualquier agente y personalidad, y **compartible manteniendo las
> funciones y opciones principales y fundamentales de StarSeed OS por seguridad**, facilidad y
> estética intuitiva útil. También debe permitir **salas virtuales 2D y 3D en AR y VR**, con
> pizarras, escritorios, dashboards y widgets **sincronizables para modificar en grupo**, en
> servidores públicos o privados, para cualquier propósito. La IA también debe poder **crear agentes
> privados y públicos para grupos** de cualquier tipo.

### Cómo se implementa esto sin abrir un agujero (decisión de arquitectura, Ola 307)

- **La interfaz es un DATO, no código suelto.** `src/lib/nucleo/ui-spec.ts` define `UiSpec`: un
  árbol declarativo de bloques con **vocabulario cerrado** y `PROPS_PERMITIDAS`. La IA lo reescribe
  entero en tiempo real —eso es «editar el UI desde el código en vivo»— y el OS lo renderiza. No hay
  bloque `script`, ni HTML crudo, ni manejadores con código: **nadie ejecuta código de nadie**. Si
  esto se hiciera con `eval`, el primer paquete compartido malicioso acabaría con la confianza en la
  red entera.
- **El núcleo intocable.** `src/lib/nucleo/invariantes.ts` lista lo que ninguna edición, paquete ni
  instalación puede quitar: salida siempre (Ajustes y restaurar), identidad soberana, permisos
  visibles, navegación fundamental, integridad del voto, datos honestos y deshacer.
  `validarContraInvariantes` devuelve **todas** las violaciones con *cómo arreglarlo* — un validador
  que solo dice «no» enseña a saltárselo.
- **Compartir se revisa antes de entrar.** `paquete-sistema.ts`: el paquete lleva su `UiSpec`, su
  apariencia y sus agentes; `revisar()` lo pasa por los invariantes, rastrea `CLAVES_PROHIBIDAS`
  (`sk-`, `gsk_`, `Bearer`, rutas del disco) y produce un resumen legible en diez segundos. **Nada se
  instala sin que el usuario lo lea.**
- **Salas con un solo contrato** (`src/lib/salas/sala.ts`): pizarra · escritorio · dashboard ·
  escena3d · xr, sobre `os_spaces`, con roles (dueño/editor/comentarista/observador) y
  `elegirTransporte()`, que prefiere **servidor privado o malla antes que público para una sala
  privada, aunque haya internet**. La fusión de cambios concurrentes (`sincronia-sala.ts`) es
  **determinista en ambos sentidos** — si no, dos neuronas acaban en realidades distintas — y usa
  lápidas, nunca borrado físico.
- **Agentes de grupo que no filtran.** `agentes-grupo.ts`: `sanearParaGrupo()` quita memoria
  personal, claves y bindings privados; los límites de fábrica son restrictivos (sin escribir, sin
  salir a internet) porque a un agente público del grupo lo invoca mucha gente.
- **Alcance de memoria** (`alcance-memoria.ts`): personal › perfil › grupo › pública, y nunca al
  revés. Un agente público no lee la memoria personal de su creador ni escribe en ella.

Regla corta para quien retome: **editable sí, ejecutable no; compartible sí, sin revisar no;
conectado a todo sí, con la memoria personal quieta.**

## 🖥️ Un commit en la nube NO cambia Genesis de Alex (regla permanente · 2026-09-09)

Lo dijo él después de que se lo enseñara tres veces como «arreglado»:

> «no ha cambiado nada, Genesis sigue diciendo *Tareas en curso 0 · 128 pendientes*; es
> importante que recuerdes **fundamentalmente verificar los resultados y la orquestación en el
> Genesis en localhost**.»

Tenía razón, y el error era de método, no de código. Entre un commit en el contenedor de la nube y
lo que Alex ve en `localhost:9002` hay **tres puertas**, y saltarse cualquiera significa anunciar
como hecho algo que él no puede ver:

1. **Transferir** — el push no sale de la nube. `git bundle create` → `SendUserFile` →
   `device_commit_files` a `.transfer/` → en la Mac `git fetch` + `merge --ff-only`.
2. **Reconstruir** — `next start` sirve lo COMPILADO. Un archivo nuevo en el disco de la Mac no
   cambia nada hasta `bash scripts/starseed-ligero.sh construir` (heap 4096) y reiniciar el
   servidor ligero.
3. **Verificar EN localhost** — abrir `/genesis`, mirar el medidor concreto, y solo entonces decirlo.

Y una cuarta, distinta y fácil de confundir con las anteriores: **Genesis lee la carpeta
`starseed_memory_root/olas/` de la máquina donde corre**. El enjambre trabaja en la nube y esa
carpeta **no se versiona**, así que Genesis de la Mac puede enseñar «0 en curso» con seis agentes
escribiendo a toda máquina. Copiar el estado a mano es un parche que caduca en minutos; el arreglo
de verdad es el latido remoto por Supabase (tarea `zM1`).

**Regla corta: nada está hecho hasta que se ve en Genesis de la Mac.** «tsc en verde», «tests en
verde» y «commit integrado» son pasos intermedios, no el resultado.

---

## 💠 Cuatro trampas del entorno que parecen fallos del código (2026-09-09)

Las cuatro costaron horas y ninguna estaba en el código que se estaba escribiendo. Antes de culpar
a una tarea, a un modelo o a un agente, descarta estas:

### 1. `npm config omit=dev` deja la máquina sin herramientas de prueba

En la Mac, `npm config get omit` devolvía **`dev`**. Con esa configuración, `npm install` instala
las dependencias de producción y **borra en silencio las de desarrollo**. Los síntomas no se
parecen en nada a la causa:

- `npx tsc --noEmit` → 26 errores del tipo «Property 'toHaveAttribute' does not exist on type
  'Assertion<any>'», todos en un solo archivo de test (faltaba `@testing-library/jest-dom`).
- `npx vitest run` → «Cannot find package 'jsdom'», aunque `jsdom` **sí** está en `package.json`.
- `next build` → `ENOENT: … node_modules/typescript/package.json` al copiar el `standalone`.

Tres puertas rojas, una sola causa. El arreglo es `npm install --include=dev`. **Comprueba
`npm config get omit` antes de dar por rota una prueba que ayer pasaba.**

### 2. Un `id` de tarea solo puede vivir en UNA cola

Genesis empareja cada latido con su tarea por la clave `cola|id`. Si el mismo `id` aparece en dos
archivos `cola-*.json`, el árbol se queda con **una** de las dos colas y, si elige la que no está
corriendo, el latido no casa: la tarea se pinta pendiente y la cabecera enseña **0 en curso con los
agentes escribiendo**. Medido hoy con `pRJ1`-`pRJ3` duplicadas en `cola-309` y `cola-310`.

**Regla: al combinar colas, la cola vieja sale de `starseed_memory_root/olas/`** (muévela a
`starseed_memory_root/colas-fuente/`, no la borres). Los `id` siguen siendo únicos en todo el
histórico; lo nuevo es que además han de ser únicos *entre los archivos vivos*.

### 3. Una ola viva nunca puede quedar fuera del recuento

`construirRamificacion(cuantas)` recortaba a las últimas `cuantas` olas **por número**. Una cola
relanzada mezcla tareas de olas antiguas, así que ese recorte escondía agentes que estaban
escribiendo en ese momento: 5 vivos, la cabecera enseñaba 3. Ahora se eligen las últimas por número
**y además, sin excepción, toda ola con al menos un latido fresco**.

**Regla: cualquier recorte de Genesis (por número, por fecha, por página) se aplica después de
garantizar que lo vivo está dentro.** Lo vivo es justo lo que hay que ver.

### 4. El permiso de disco de macOS se concede POR BINARIO, no por carpeta (2026-09-10)

`com.starseed.mando` moría con **exit 127** y esta línea en el log:

```
/bin/zsh: can't open input file: …/scripts/puente/arrancar-mando.sh
```

El archivo existía, era `-rwxr-xr-x`, y otros servicios de launchd leían **esa misma carpeta** sin
problema. La causa no es la carpeta: es TCC, y se aplica al **programa** que abre el archivo. En
esta Mac `/opt/homebrew/bin/python3` tiene «Acceso total al disco» y `/bin/zsh` y `/bin/bash` no.
Medido con una sonda de launchd, y el detalle importa porque despista:

| desde launchd                | `ls` del archivo | leer su contenido            |
| ---------------------------- | ---------------- | ---------------------------- |
| `/bin/zsh`                   | ✅ funciona       | ❌ `Operation not permitted` |
| `/opt/homebrew/bin/python3`  | ✅                | ✅                            |
| `/bin/zsh` **hijo** de ese python3 | ✅          | ✅                            |

Es decir: **el hijo hereda el permiso del padre**. Por eso el servicio de Telegram sí vivía (su zsh
solo hace `source` de `~/.hermes/.env`, que está fuera de `~/Documents`, y luego `exec python3`).

**Regla: ningún servicio de launchd puede tener un shell como `ProgramArguments[0]` si va a leer
algo de `~/Documents`.** Se envuelve en `scripts/puente/lanzador-tcc.py`, que lo corre como hijo de
python3. Mover los guiones fuera de `~/Documents` **no** arregla nada: lo que hacen es trabajar ahí
dentro. Y recuerda la trampa hermana: **launchd no usa el PATH para el ejecutable** — ruta absoluta
siempre, o sale exit 2. Ambas viven documentadas en `scripts/puente/instalar-servicios.py`.

### 5. Una variable CSS se resuelve DONDE se declara, no donde se usa (2026-09-28)

Todo el OS se pintaba en **Times**. `AppearanceProvider` escribe `--font-body: var(--font-inter)`
en `<html>`, pero las variables de `next/font` (`--font-inter`, …) estaban en la clase de `<body>`:
en `<html>` no existían, `--font-body` quedaba inválida y `font-family: var(--font-body)` caía a la
fuente por defecto del navegador. **Regla: las variables de `next/font` van en `<html>`** (así está
`src/app/layout.tsx`). Síntoma para reconocerlo: `getComputedStyle(document.body).fontFamily`
devuelve `"Times"` con las fuentes de `/_next/static/media` servidas sin error.

### 6. Un `next start` huérfano en el 9002 sirve páginas nuevas con rutas viejas (2026-09-28)

Tras instalar un build, las rutas NUEVAS (`/documentos`, `/tabla`, `/juego`…) daban **404** y el
registro decía «Genesis reiniciado: la pantalla ya sirve el código nuevo». El que escuchaba en el
9002 era un `next start` lanzado a las 15:31 por fuera de launchd (un `python -` del `.command`
del Escritorio); el servicio relanzado no podía escuchar. Y la comprobación se dejaba engañar:
Next lee las páginas del disco en cada petición (el HTML llevaba el BUILD_ID nuevo), pero la
tabla de rutas es la que cargó al arrancar. **Regla:** `reiniciar_mando()` llama a
`liberar_puerto()` justo después del `bootout` — si alguien sigue escuchando, no es el servicio,
y se para. Síntoma para reconocerlo: una ruta que existe en `.next/server/app` da 404 con
`x-nextjs-cache: HIT`; `lsof -iTCP:9002 -sTCP:LISTEN` + `ps -o lstart=` enseña un proceso más
viejo que la instalación.

### 7. Subir Next de versión «a mano» tumba Genesis entero (2026-10-03)

Hermes no podía abrir Genesis: `/tmp/starseed-mando.log` repetía «Could not find a production
build in the '.next' directory» con **Next.js 16.3.8**. Alguien había empezado a subir el OS a
Next 16 sin terminar: `package.json` con `"next": "16.3.8"`, `package-lock.json` BORRADO, un
`pnpm-lock.yaml` nuevo, `node_modules` instalado con pnpm, `tsconfig.json` reescrito por Next 16
(`jsx: react-jsx`, `.next/dev/types`) y, de paso, `almacenamiento.ts` con código metido dentro de
comentarios (`\n` literales). El build de Next 15 ya no servía con el `node_modules` de Next 16 y el
de Next 16 nunca llegó a existir. El intento quedó guardado en `.transfer/intento-next16-2026-10-03/`.

**Reglas:** subir Next (o React) de versión MAYOR es una ola propia, con su rama y las tres puertas
en la nube — nunca un cambio suelto en el árbol de la Mac; el gestor de paquetes es **npm** (el
lock es `package-lock.json`); y para volver a lo que dice el lock: `npm ci --include=dev`.
`reconstruir_mando.py` ya no compila si el `next` de `node_modules` no es el del lock, ni con el
enjambre vivo (orquestador o `opencode run`), ni con más de 4 GB de swap en uso. Síntoma para
reconocerlo: `node -e "console.log(require('next/package.json').version)"` no coincide con
`node_modules/next` dentro de `package-lock.json`.

### 8. Sondeos que se apilan dejan la pestaña sin recursos · Genesis se autorrepara (2026-10-05)

Alex, dos veces en una noche: «no carga Genesis». El servidor respondía (`/genesis` 200 en
0,5 s), pero la pestaña llevaba horas abierta y Chrome contestaba `net::ERR_INSUFFICIENT_RESOURCES`
a todo (más de 35.000 peticiones descartadas, cada pastilla en «—»): treinta y un paneles sondean
con `setInterval` sin mirar si su lectura anterior volvió y, con la Mac cargada (medidores de hasta
46 s, `reunir lenta` en `/tmp/starseed-mando.log`), las vueltas se apilaban. Y después: «eso
debería el propio puente autorrepararse sin tener que pedírtelo». Tres capas, todas automáticas:

- **Lecturas** (`src/lib/mando/guardia-fetch.ts`, instalada al cargar `centro-mando.tsx`): las GET
  idénticas en vuelo se comparten, como mucho 4 distintas a la vez con una cola acotada (40; la más
  vieja sobra), y las colgadas se cortan a los 45 s. Un sondeo nuevo no necesita hacer nada.
- **Página** (`src/lib/mando/autocuracion-pagina.ts` + `aviso-autocuracion.tsx`): cada 15 s mira la
  salud de las lecturas; si está atascada y el servidor responde, suelta lo atascado y, si no basta,
  se recarga sola (máximo una vez cada 10 min). Lo dice en un aviso discreto.
- **Servidor y disco** (`scripts/puente/autocuracion_mando.py`, en cada pasada del vigía de
  medidores): si `/api/mando/latido` no responde a tres sondas, reinicia Genesis con
  `reiniciar_mando()` (no durante una publicación que lo compila); por debajo de 6 GB limpia lo
  regenerable con la lista blanca de Genesis (la caché de Next solo por debajo de 3 GB). La
  publicación hace sitio con lo mismo antes de rendirse por disco. Estado en
  `~/.starseed/autocuracion-mando.json`; cada remedio, una línea en el Chat Director.

### 9. «Ningún agente trabaja» y «Buscar más capacidad» no lo arregla: el límite son los cupos (2026-10-06)

Medido a las 14:47 (hora de la Mac): OpenRouter con su tope diario de modelos `:free` (429
«free-models-per-day», 1.000/día), xKiro con su cupo diario (429; sus premium piden plan),
Gemini sin cuota (429), NIM con kimi-k3 sin contestar y modelos retirados (410), Hugging Face
sin crédito mensual (402), Codex con su límite semanal. Los cupos diarios vuelven a las 00:00
UTC (18:00 en la Mac). opencode reintentaba esos 429/402 en silencio y cada modelo se
«colgaba» 5 min; además cada agente levantaba un `tsserver` de ~2 GB y la swap llegó a 10 GB
con el disco en 1 GB. Arreglos: **sonda de 1 token** antes de escribir
(`scripts/enjambre/sonda_escritor.py`, `escritor_listo()`; cupo del día → proveedor sin cupo
hasta las 00:00 UTC en la salud compartida), el botón **dice cuándo el límite son los
modelos** y cuándo vuelve cada uno, y opencode va **sin LSP de TypeScript**
(`"lsp": {"typescript": {"disabled": true}}`, que el orquestador pone si falta). Más huecos
no son más trabajo si ningún modelo tiene cupo: lo que suma de verdad es otro proveedor.

### 10. Trabajadores «esperando proveedor» con proveedores que ya volvieron → se repara solo (2026-10-06)

A las 22:56 tres trabajadores llevaban 30-40 min «esperando proveedor» con apinex, freellmapi
y Google respondiendo a la sonda, y ningún director lo veía («esperando» contaba como
trabajando). Causas: los vetos del orquestador (`MUERTOS`) duraban toda la corrida, la espera
solo miraba los apartados de esa tarea, la salud tenía marcas viejas de «sin cupo» y
`colgados.json` volvía a vetar al arrancar. Ahora: los vetos **caducan**
(`ConjuntoCaduco`, 45 min; pago 6 h, retirado 12 h, cuelgues lo que quede de su racha), la
espera mira la rotación entera, el orquestador atiende la orden de flota
`refrescar_proveedores` y no repite tareas que `progreso.json` ya cerró. La **autocuración**
(punto 6 de `scripts/puente/autocuracion_mando.py`, cada 120 s por el vigía) ve tareas
esperando > 20 min → sonda → levanta las marcas viejas y perdona rachas de quien responde →
refresca → si a los 10 min sigue igual, reinicia el orquestador (máx. cada 45 min). Botón
**«Reactivar directores»** arriba de Genesis (`scripts/puente/reactivar_mando.py`,
`/api/mando/reactivar`): servicios `com.starseed.*`, autocuración forzada, orquestador y
medidores, con parte en el Chat Director. Comprobado: tras el refresco las tres tareas
siguieron con freellmapi en 1 min.

### 11. `next build` roto sin que tsc ni vitest lo vean: nada de `node:*` en código de cliente (2026-10-06)

`medidores.ts` (va al navegador con `centro-mando.tsx`) importó `creditos-pago.ts`, que leía
el disco con `node:fs`: tsc y vitest en verde y `next build` con «UnhandledSchemeError:
node:fs» → Genesis no se podía reconstruir. Regla: lo puro va en `*-tipos.ts` sin Node; la
lectura de disco en otro archivo solo de servidor. Puerta:
`src/lib/mando/__tests__/sin-node-en-cliente.test.ts` (recorre el grafo desde `/genesis`).

### 12. Claves de EJEMPLO en pruebas bloquean todos los empujes (2026-10-06)

El repositorio tiene la protección de secretos de GitHub activa: un commit con una clave de
ejemplo con forma real (`xoxb-…`, `ghp_…`, `AKIA…`, bloques PEM) hace que GitHub rechace
CUALQUIER empuje que lo lleve («push declined due to repository rule violations», GH013),
también las ramas `colas/nube-*` (la nube se queda sin agentes) y la publicación de main. En
pruebas, montar esas cadenas en tiempo de ejecución (`["gh", "p_…"].join("")`). Si ya entró
una, `nube-gh.py` dice ahora el tipo, la ruta y el enlace de GitHub para permitirla.
