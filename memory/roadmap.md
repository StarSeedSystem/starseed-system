# 🗺️ Roadmap técnico — StarSeed OS

> Plan de desarrollo en 3 fases macro alineadas con las fases evolutivas Semilla/Fruto/Cosecha de la Constitución. Cada fase tiene hitos verificables y criterios de salida para pasar a la siguiente.

---

## Filosofía del roadmap

1. **Software-First.** Construimos la dimensión digital (Red StarSeed) que servirá a las comunidades físicas cuando existan.
2. **WebOS antes que distro Linux.** La pregunta "instálalo en mi dispositivo" se responde inicialmente vía PWA + apps wrapper (Capacitor/Tauri), después como capa multiplataforma, y como última fase opcional con distro Linux propia.
3. **Servidor gratuito → propio.** Vercel + Supabase free tier en Semilla. Migración a infra autogestionada (Hetzner / OVH / nodos comunitarios) en Fruto.
4. **Federación desde el inicio.** Aunque arrancamos con un nodo único, el diseño de datos y APIs ya soporta múltiples nodos federados.

---

## 🌱 Fase 1: SEMILLA (Q3-Q4 2026)

**Objetivo:** Producto online accesible vía navegador (WebOS), instalable como PWA, con las 3 ecosistemas básicos operativos a nivel MVP. Comunidad inicial de ~100 usuarios activos.

### Hito 1.1 — Cimientos del repositorio (semanas 1-2)
- [ ] Inicializar git, crear repo `StarSeedSystem/starseed-system` en GitHub.
- [ ] Configurar CI/CD (GitHub Actions): lint, typecheck, build.
- [ ] Configurar Vercel auto-deploy desde `main`.
- [ ] Licencia AGPLv3, CODE_OF_CONDUCT (basado en principios), CONTRIBUTING.md.
- [ ] Limpieza: borrar `temp-*.html`, `apply_mock_fetch.js`, `fix-widgets.js` y otros scripts huérfanos a `scripts/legacy/` o eliminar.
- [ ] README real (no el template de Firebase Studio).
- [ ] Variables de entorno documentadas (`.env.example`).

### Hito 1.2 — Identidad soberana y verificación (semanas 3-4)
- [ ] Auth Supabase con email + OAuth (Google, GitHub) como prueba de humanidad ligera.
- [ ] Modelo Account + Profile múltiple operativo en Supabase con RLS.
- [ ] Recovery con frase semilla (BIP39) — backup de identidad portable.
- [ ] Investigación / spike: WorldID o Proof of Personhood alternativo para fase posterior.

### Hito 1.3 — Ecosistema Político MVP (semanas 5-7)
- [ ] CRUD de propuestas (`Post.type = PROPOSAL`).
- [ ] Votación con tracking de delegación líquida (mínimo viable).
- [ ] Visualización de resultados en tiempo real.
- [ ] Página de detalle con discussion / enmiendas estructuradas.
- [ ] Implementación del principio de Singularidad del Contenido (referencias, no copias).

### Hito 1.4 — Ecosistema Cultural MVP (semanas 6-8, en paralelo)
- [ ] Feed `/network` con posts enriquecidos (texto, imagen, gallery, evento).
- [ ] Sistema de comentarios y reacciones.
- [ ] HolographicGraph estable y performante (lazy load).
- [ ] Publicación desde `/publish` con editor block-based.

### Hito 1.5 — Ecosistema Educativo MVP (semanas 7-9)
- [ ] Biblioteca de recursos (`/library`) con tipos: DOC, COURSE, ASSET.
- [ ] Reproductor / lector embebido.
- [ ] Sistema de insignias v1 (manual: admin asigna; auto solo para insignia "Visitante inicial").

### Hito 1.6 — Hub de comunidades MVP (semanas 9-10)
- [ ] Crear/unirse a Pages (`Page.type = COMMUNITY`).
- [ ] Cada Page tiene su feed, propuestas, biblioteca propios.
- [ ] Roles dentro de una Page basados en insignias (no en cargos arbitrarios).

### Hito 1.7 — Trinity Interface + Liquid Glass (semanas 4-10, continuo)
- [ ] Trinity Interface flotante con los 4 nodos cardinales operativos.
- [ ] AppearanceContext + editor en `/settings` permite al usuario customizar todo.
- [ ] Performance: 60fps en MacBook Air M1, 30fps en Android medio.
- [ ] Modo `prefers-reduced-motion` respetado.

### Hito 1.8 — PWA + instalación móvil (semanas 10-12)
- [ ] Service Worker con offline support básico.
- [ ] Manifest para instalación en iOS/Android como app.
- [ ] Notificaciones push (opt-in, granular).
- [ ] Lighthouse score ≥ 90 en PWA.

### Hito 1.9 — Exocórtex v1 (semanas 11-12)
- [ ] Página `/agent` permite configurar agente personal.
- [ ] Genkit + Google AI como primer backend (opt-in del usuario).
- [ ] Conversaciones cifradas en cliente (clave derivada del passphrase).
- [ ] Spike: probar backend con modelo open-weight (Ollama / vLLM).

### Hito 1.10 — Documentación y comunidad (semanas 12-14)
- [ ] Constitución del proyecto publicada en `/info/constitution` (sincronizada con Drive).
- [ ] Tutorial onboarding interactivo.
- [ ] Server de Discord / Matrix / o foro propio para feedback.
- [ ] Convocar la primera "Asamblea Beta" con 20-50 usuarios.

### Criterios de salida de la Fase Semilla
- 100+ usuarios verificados activos al mes.
- 50+ propuestas votadas.
- 0 incidentes de seguridad críticos no resueltos.
- Open Source ≥ 95% del código (vendor lock-in solo en lo justificable).
- Build estable, sin errores TypeScript ni lint.

---

## 🌿 Fase 2: FRUTO (Q1-Q3 2027)

**Objetivo:** Capa multiplataforma. App nativa Linux + Android + iOS. Federación operativa con 3+ nodos independientes. Infraestructura propia. ~1000 usuarios activos.

### Hito 2.1 — Federación
- [ ] Protocolo de federación definido (ActivityPub-compatible o protocolo propio basado en estándares abiertos).
- [ ] Posibilidad de correr un nodo StarSeed con Docker Compose.
- [ ] Identidad portable: migración entre nodos sin pérdida de datos ni reputación.
- [ ] 3+ nodos federados operativos (idealmente: 1 principal + 2 de Sanghas físicas o asociaciones aliadas).

### Hito 2.2 — Apps nativas
- [ ] Wrapper Tauri para desktop (Linux, macOS, Windows). Tamaño bundle < 20MB.
- [ ] Capacitor (o nativo si se justifica) para iOS y Android.
- [ ] Auto-updater integrado para apps desktop.
- [ ] Distribución: Flathub (Linux), F-Droid (Android, en paralelo a Play Store), Mac App Store, Microsoft Store.

### Hito 2.3 — Integración Linux profunda
- [ ] App como ciudadano de primera clase del escritorio Linux:
  - Notificaciones nativas (DBus / org.freedesktop.Notifications).
  - Integración con keyring (libsecret) para cifrado de Exocórtex.
  - Indicador de tray (StatusNotifierItem).
- [ ] Skill: paquete `.deb` y `.rpm` mantenidos en el CI.

### Hito 2.4 — Integración Android profunda
- [ ] App tipo "Launcher complementario" (Layer): widgets de propuestas activas, feed cultural, etc. en home screen.
- [ ] Compartir desde otras apps al feed StarSeed (intent receiver).
- [ ] Cuenta StarSeed disponible para otras apps (AccountManager API).

### Hito 2.5 — Infraestructura propia
- [ ] Migración Supabase → Postgres autogestionado en VPS propios.
- [ ] Storage: MinIO / Garage S3-compatible autohospedado.
- [ ] Edge: Caddy / Traefik con autocert.
- [ ] Backup automatizado off-site cifrado.
- [ ] Postmortem público de cualquier downtime.

### Hito 2.6 — Sistema de Insignias v2
- [ ] Insignias verificables criptográficamente (firmadas por la entidad emisora).
- [ ] Marketplace de "rutas de aprendizaje" para desbloquear insignias.
- [ ] Insignia "Mediador" + Círculos de Paz UI funcional.
- [ ] Insignia "Validador" para verificación de hechos en propuestas.

### Hito 2.7 — Exocórtex v2 (modelo propio)
- [ ] Backend de inferencia con vLLM en hardware propio o federado.
- [ ] Modelo finetuneado sobre el corpus de la Constitución y docs Starseed.
- [ ] Modo "agente local": ejecución del agente personal en el dispositivo del usuario (Ollama integrado).

### Hito 2.8 — Multiverso (espacios virtuales)
- [ ] Spike: integración R3F + multiplayer (WebRTC) para "Ágoras virtuales".
- [ ] Habitaciones temáticas: por Comunidad, por evento, abiertas para encuentros.
- [ ] Avatar simple (no fotorrealista) — privacidad over fidelidad.

### Criterios de salida de la Fase Fruto
- 3+ nodos federados estables ≥ 6 meses.
- 1000+ usuarios activos mensuales.
- Apps nativas en stores principales.
- Costos operativos cubiertos por donaciones/grants comunitarios (no dependencia de un patrón externo).

---

## 🌾 Fase 3: COSECHA (2028+)

**Objetivo:** Distro Linux propia, gratuidad sistémica de servicios digitales, comunidad autosuficiente. ~10,000+ usuarios.

### Hito 3.1 — StarSeed OS (distro Linux)
- [ ] Fork basado en Debian Stable o Arch (a evaluar):
  - **Opción A (Debian):** estable, conservador, comunidad amplia.
  - **Opción B (Arch):** rolling release, bleeding edge, comunidad técnica.
  - **Opción C (NixOS):** declarativo, reproducible, ideal para federación.
- [ ] Escritorio "Trinity DE" como entorno de escritorio nativo (basado en Wayland + custom shell).
- [ ] Apps StarSeed preinstaladas + integración SO profunda.
- [ ] Instalador gráfico amigable (estilo Ubuntu/Pop!_OS).
- [ ] Live USB + ISO descargable.

### Hito 3.2 — Hardware certificado
- [ ] Lista de hardware compatible/recomendado (especial foco en privacidad: portátiles sin ME/PSP, FairPhone, etc.).
- [ ] Acuerdos con fabricantes éticos (Framework, System76, MNT Pocket Reform) para preinstalación opcional.

### Hito 3.3 — Servidor propio para cada Sangha física
- [ ] Imagen "StarSeed Server" para Raspberry Pi 5 / mini-PC en cada Sangha.
- [ ] Setup en 1 hora máximo.
- [ ] Auto-federación al onboarding.

### Hito 3.4 — Gratuidad sistémica digital
- [ ] Todos los servicios core gratuitos para ciudadanos verificados.
- [ ] Sostenimiento mediante:
  - Aporte voluntario en tiempo de cómputo (BOINC-like: tu equipo ayuda al cluster cuando no lo usas).
  - Donaciones recurrentes opcionales.
  - Marketplace físico de las Sanghas (porcentaje a la red).

### Hito 3.5 — Mitosis del proyecto
- [ ] Forks regionales / culturales bienvenidos y soportados.
- [ ] Cada región puede mantener su propia distro con identidad local.
- [ ] Protocolo común garantiza interoperabilidad pan-Starseed.

---

## Stack tecnológico de referencia

### Confirmado para Fase Semilla
- **Frontend:** Next.js 15 + React 18 + TypeScript + Tailwind + shadcn/ui
- **3D / WebGL:** Three.js + React Three Fiber + Spline (para escenas declarativas)
- **Animación:** Framer Motion
- **Backend / DB:** Supabase (Postgres + Auth + Realtime + Storage)
- **IA:** Genkit (Google AI) — opt-in del usuario, con plan de migración a modelos open
- **Hosting Fase Semilla:** Vercel
- **CI/CD:** GitHub Actions

### A evaluar en Fase Fruto
- **Federación:** ActivityPub vs. protocolo propio vs. Matrix
- **Apps nativas:** Tauri vs. Electron (Tauri preferido por tamaño/seguridad)
- **Mobile:** Capacitor vs. React Native vs. native Kotlin/Swift
- **Inferencia IA propia:** vLLM, llama.cpp, Ollama
- **Storage objeto:** MinIO vs. Garage vs. Seaweedfs

### A evaluar en Fase Cosecha
- **Base distro Linux:** Debian / Arch / NixOS
- **Display server:** Wayland (asumido) — compositor: wlroots-based custom o fork de Sway/Hyprland
- **Init / service:** systemd (pragmático) — alternativa: dinit / runit en versión "minimal"
- **Empaquetado:** Flatpak para apps de terceros, nativo para apps StarSeed

---

## Anti-features (lo que NO haremos)

Lista explícita de cosas que rechazamos por incompatibilidad con los principios:

- ❌ **Algoritmos de "engagement maximizado":** sin scroll infinito explotador, sin notificaciones manipuladoras.
- ❌ **Publicidad y tracking de terceros.** Ni siquiera "anonymized analytics" externos (PostHog/Plausible self-hosted vale si la comunidad lo aprueba).
- ❌ **Tier de pago con funcionalidad cerrada.** No "Premium" para votar más, ni para acceder a propuestas.
- ❌ **Modelos IA cerrados como única opción.** Siempre debe haber alternativa open-weight.
- ❌ **Bans automáticos definitivos.** Toda suspensión revisable por humanos.
- ❌ **Datos biométricos en servidor.** Si los usamos, siempre zk-proof local.
- ❌ **Centralización del contenido.** Todo replicable/exportable por el usuario.
- ❌ **Acuerdos NDA con corporaciones que comprometan apertura.** Acuerdos siempre públicos.

---

## Cómo proponer cambios al roadmap

Este roadmap **no es estático**. Cualquier ciudadano puede:
1. Abrir un issue en GitHub con la propuesta.
2. Discutirla en `/network/politics` (cuando la fase Semilla esté operativa, las decisiones del propio roadmap se votarán en el sistema mismo — *dogfooding*).
3. Si la propuesta gana consenso, este archivo se actualiza.

---

*Última revisión: 2026-05-24*
