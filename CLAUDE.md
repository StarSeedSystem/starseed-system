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
- **Base de datos:** Supabase — **proyecto propio del OS `nxstilnyidvkqeosofuh`**, con cuentas **SEPARADAS** de las de Nexus/Café (que usan `dzkjapinnewkxzjltadv`). Config en `supabase/` + cliente **singleton** en `src/utils/supabase/client.ts`. Schema implementado (`Account`, `Profile`, `Page`, `Post`, `StoreItem`, `LibraryItem`, `os_*`, `entity_state`, `os_spaces`). ⚠️ Migración `supabase/migrations/20260711120000_realtime_publication.sql` **pendiente de aplicar**.
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
- `architecture/centro-creacion-sync-permisos.md` — **SOP de la Adenda 63** (2026-07-11/12): sesión persistente (singleton Supabase), Centro de Creación Trinity + `/crear`, sync realtime de la Biblioteca, **permisos universales** (`src/lib/sharing/access.ts`), neuronas + CasaOS, voz y personalidades de Aurora, mapa del Hub, seguridad estilo Strix. Fuente de verdad de esa ola.
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

*Última actualización del archivo: 2026-07-04 (Adenda 62 · Astraura)*


---

## 🧠 Sistema de Memoria (memory root)

La memoria viva del proyecto vive en **`starseed_memory_root/`** — un *memory root*
portátil con **raíz + ramas**: `soul/ ego/ skills/ style/ memory/ dream/ accounts/
tasks/ logs/` + `index.md` + `sync.md` + `memory.manifest.json`.

- **Lee `starseed_memory_root/index.md` al iniciar.** Toda petición nueva → `tasks/tasks.md`; al completar → `tasks/past_task.md`; eventos → `logs/logs.md`.
- Espejo en Google Drive (*My Drive/StarSeed_Memory_Root*) + enlace en el Escritorio.
- Vinculable a cerebros/servidores/VMs (ver `sync.md` + `architecture/memoria-cerebros-sync.md`). ⚠️ No conectado a cuenta aún (prueba futura: *Ester*).
- La **memoria profunda** (architecture/principles/glossary/roadmap/state) sigue en `memory/`.
