# 🏗️ Arquitectura técnica — StarSeed OS

> Decisiones arquitectónicas vivas. Cuando se cambia algo importante, primero se actualiza este doc, luego el código (regla dorada del proyecto).

---

## 1. Modelo de capas (A.N.T.)

Heredado del `gemini.md` original. Tres capas claras:

```
┌─────────────────────────────────────────────────────────┐
│  TANGIBLE (Capa Tangible)                               │
│  - src/        → código de la app (React, Next.js)      │
│  - tools/      → scripts CLI utilitarios                │
│  - public/     → assets estáticos                       │
└─────────────────────────────────────────────────────────┘
              ▲
              │ implementa
              │
┌─────────────────────────────────────────────────────────┐
│  NEURAL (Capa Neural)                                   │
│  - .agent/     → skills, agentes, workflows IA          │
│  - src/ai/     → flujos de Genkit, agentes Exocórtex    │
└─────────────────────────────────────────────────────────┘
              ▲
              │ ejecuta
              │
┌─────────────────────────────────────────────────────────┐
│  ABSTRACT (Capa Abstracta)                              │
│  - architecture/      → SOPs, specs, fundamentos        │
│  - memory/            → estado, principios, roadmap     │
│  - CLAUDE.md / gemini.md → constitución del proyecto    │
└─────────────────────────────────────────────────────────┘
```

**Regla dorada:** *Si la lógica cambia, actualiza el SOP en la capa Abstracta ANTES de tocar la capa Tangible.*

---

## 2. Stack runtime (estado actual)

### Frontend
- **Framework:** Next.js 15 (App Router) con Turbopack en dev
- **Lenguaje:** TypeScript estricto
- **UI primitivas:** shadcn/ui (sobre Radix UI)
- **Estilos:** Tailwind CSS + variables CSS personalizadas
- **Estado global:** React Context API (sin Redux/Zustand por ahora)
- **3D:** Three.js + React Three Fiber + Drei + Spline
- **Animación:** Framer Motion
- **Formularios:** React Hook Form + Zod (validación)
- **Iconos:** Lucide React (Heroicons como alternativa)
- **Fuentes:** Satoshi (headers), General Sans (body), JetBrains Mono (código)

### Backend
- **Auth:** Supabase Auth (email + OAuth Google/GitHub)
- **DB:** Supabase Postgres con RLS (Row Level Security)
- **Realtime:** Supabase Realtime (websockets nativos)
- **Storage:** Supabase Storage (futuro: IPFS para `LibraryItem`)
- **Edge functions:** Supabase Edge Functions (Deno) — no usadas todavía
- **IA (server-side legacy):** Genkit + Google AI para flujos que requieren ejecución en servidor (RAG con datos privados, schedulers).
- **IA (client-side, capa nueva):** Capa multi-proveedor en `src/ai/providers/` + `src/ai/client/`. Ver §12.

### Infraestructura
- **Hosting Fase Semilla:** Vercel (auto-deploy desde `main`)
- **Hosting alternativo:** Firebase App Hosting (`apphosting.yaml` ya configurado)
- **CDN:** Vercel CDN integrado
- **DNS:** A definir (sugerencia: Cloudflare para Fase Semilla, propio en Fruto)

---

## 3. Modelo de datos

Schema completo en `gemini.md` §2. Resumen:

```
Account (1)
   ├── Profile (N) — múltiples facetas: OFFICIAL, ARTISTIC, ANONYMOUS
   │      ├── Badge[] — insignias verificables
   │      └── stats { reputation, contributions }
   │
   ├── Page (N) — comunidades, entidades federativas, partidos, lugares, grupos
   │      ├── members: Profile[]
   │      ├── governance: GovernanceConfig
   │      └── tabs: TabConfig[] (customizable)
   │
   ├── Post (N) — atómico, referenciado no duplicado
   │      ├── type: TEXT | GALLERY | CANVAS | EVENT | PROPOSAL
   │      ├── references[] — { context_id, context_type }
   │      └── interactions { likes, comments_count }
   │
   ├── StoreItem (N) — bienes digitales/físicos
   │      └── price.currency: SEEDS | KARMA (no fiat directo)
   │
   └── LibraryItem (N) — biblioteca personal/comunitaria
          └── ipfs_cid — futura integración IPFS
```

### Invariantes de schema
- **`Account.id` es inmutable y único por humano** (Una Persona, Una Voz).
- **Profile.account_id es inmutable** una vez creado (no se puede transferir).
- **Post.references[] reemplaza el "share":** nunca duplicar contenido.
- **`Badge[]` no se compra ni se transfiere** entre cuentas.

---

## 4. Reglas de Row Level Security (RLS) en Supabase

Patrones a aplicar consistentemente. (A documentar en `architecture/specifications/rls.md` cuando se formalice.)

### `accounts`
- Lectura: solo el propietario (excepto campos públicos).
- Escritura: solo el propietario, salvo campos verificados por sistema (insignias).

### `profiles`
- Lectura pública (datos del perfil son por definición públicos).
- Escritura: solo el `account_id` propietario.

### `posts`
- Lectura: según `visibility` (PUBLIC accesible a todos; SEGMENTED a miembros del Page contexto; PRIVATE solo al autor).
- Escritura: solo el `author_id`. Actualización propaga a todas las `references`.

### `votes`
- Escritura: solo el propietario del Profile que vota; voto único por propuesta.
- Lectura: agregada pública (resultados), individual privada (excepto función pública).

### `page_memberships`
- Lectura pública (transparencia).
- Escritura: el propio Profile (unirse/salirse). Admins de Page validan ingreso si el Page lo requiere.

---

## 5. Estructura de carpetas (`src/`)

```
src/
├── app/
│   ├── (main)/          ← rutas con layout principal autenticado
│   │   ├── login/
│   │   ├── dashboard/
│   │   ├── messages/
│   │   └── settings/
│   ├── (app)/           ← rutas de la app principal
│   │   ├── network/
│   │   ├── nexus/
│   │   ├── hub/
│   │   ├── agent/
│   │   ├── library/
│   │   ├── explorer/
│   │   ├── profile/
│   │   ├── publish/
│   │   └── info/
│   ├── trinity/         ← lab, showcase, settings de Trinity
│   ├── api/             ← API routes
│   ├── liquid-demo/     ← demos liquid glass
│   └── layout.tsx
│
├── components/
│   ├── ui/              ← shadcn primitives
│   ├── crystal/         ← sistema de diseño Crystal/Liquid Glass
│   ├── layout/          ← Trinity, Perimeter, Sidebar, Header
│   ├── dashboard/       ← widgets de dashboard
│   ├── network/         ← feed, holographic graph, post cards
│   ├── control-panel/   ← board manager, marketplace, widgets
│   ├── settings/        ← appearance editor
│   ├── auth/            ← formularios de auth
│   ├── profile/
│   ├── publish/
│   └── theme/
│
├── ai/                  ← flujos Genkit, agentes Exocórtex
├── backend/             ← lógica de negocio compartida
├── services/            ← servicios (network-simulation-service, etc.)
├── lib/                 ← utilidades genéricas
├── utils/               ← helpers, supabase client
├── hooks/               ← React hooks custom
├── contexts/            ← React contexts (deprecating en favor de `context/`)
├── context/             ← React contexts (canonical)
├── modules/             ← módulos de features grandes
├── types/               ← TypeScript types compartidos
├── config/              ← config runtime
└── styles/              ← globals.css + theme tokens
```

### Decisiones pendientes
- Unificar `contexts/` y `context/` (canonical: `context/` en singular según convención existente en código nuevo).
- Mover servicios fuera de `services/` a `lib/services/` para reducir profundidad.
- Limpiar archivos temporales en raíz (`temp-aurora.html`, `apply_mock_fetch.js`, etc.).

---

## 6. Diseño de federación (Fase Fruto)

### Identidad portable
- Cada Account tiene un par de llaves Ed25519 generado en cliente.
- Llave pública = identificador federado (formato sugerido: `did:starseed:<base58(pubkey)>`).
- Llave privada se guarda en:
  - **Browser:** WebCrypto API + IndexedDB cifrado.
  - **Mobile:** Keychain (iOS) / Keystore (Android).
  - **Linux:** libsecret / gnome-keyring / KWallet.
- Recovery: frase BIP39 de 12 palabras.

### Protocolo de federación (a decidir)
- **Opción A — ActivityPub:** estándar W3C, compatibilidad con Mastodon, PeerTube, etc. Conocido pero limitado para use cases complejos (gobernanza).
- **Opción B — Protocolo propio basado en NATS o libp2p:** flexibilidad total, ecosistema más pequeño.
- **Opción C — Híbrido:** ActivityPub para feed cultural (interop con fediverse), protocolo propio para gobernanza y biblioteca.
- **Recomendación inicial:** Opción C.

### Replicación de datos
- **Eventual consistency** entre nodos (no transacciones distribuidas).
- CRDTs (Yjs, Automerge) para colaboración en propuestas y documentos compartidos.
- Posts firmados por la llave del autor → cualquier nodo puede verificar autenticidad sin confiar en el nodo origen.

---

## 7. Seguridad y privacidad

### Principios
1. **Lo más privado por defecto.** Compartir es siempre acto explícito.
2. **Cifrado end-to-end** para mensajes directos y conversaciones con Exocórtex.
3. **Llaves bajo control del usuario.** El servidor nunca tiene la llave privada.
4. **No logging sensible.** Logs no contienen contenido de usuario, solo metadatos mínimos para debugging.

### Vectores a defender activamente
- **Sybil attacks** en votaciones → verificación de humanidad.
- **Bot farms** posteando spam → rate limiting + reputation gating.
- **Manipulación de propuestas** vía sock-puppets → análisis grafo social + denuncia comunitaria.
- **DDoS** a nodos pequeños → arquitectura federada inherentemente resistente.

### Cumplimiento legal
- GDPR / DSA / CCPA: ofrecemos derecho a exportar, derecho a borrar (con propagación federada), DPO designado.
- Open Source license: AGPLv3 (garantiza apertura incluso en uso SaaS).

---

## 8. Performance targets

### Web (PWA)
- **First Contentful Paint** < 1.5s en conexión 4G simulada.
- **Time to Interactive** < 3s.
- **Lighthouse Performance** ≥ 90.
- **Bundle JS inicial** < 250 KB (gzipped) para shell.
- **3D scenes lazy-loaded** y desactivables vía toggle de usuario.

### Apps nativas (Fase Fruto)
- **Cold start** < 1.5s en hardware modesto (M1 / Snapdragon 700-tier / Pi 5).
- **RAM idle** < 200 MB.
- **CPU idle** < 1%.

---

## 9. Observabilidad

### Fase Semilla
- Logs: Vercel logs nativos.
- Errores: Sentry self-hosted o GlitchTip (open source).
- Métricas: Plausible Analytics self-hosted (sin cookies, sin tracking individual).

### Fase Fruto
- Logs centralizados: Loki + Grafana.
- Métricas: Prometheus + Grafana.
- Tracing: opcional, Jaeger / Tempo si la complejidad lo justifica.
- Dashboards públicos (transparencia radical): uptime, latencia, número de usuarios.

---

## 10. Estructura de testing

### A implementar (no existe todavía)
- **Unit tests:** Vitest para utils, hooks, helpers.
- **Component tests:** React Testing Library para componentes UI.
- **E2E:** Playwright (ya está en deps).
- **Visual regression:** Chromatic o Loki.
- **Accessibility:** axe-core integrado en CI.
- **Performance regression:** Lighthouse CI en PRs.

### Coverage target
- 70% para módulos críticos (auth, votación, identidad).
- No imponer coverage mínimo en código UI (preferir tests de comportamiento).

---

## 12. Capa de IA multi-proveedor (Exocórtex soberano)

Añadida en sesión 2 (2026-05-24). Implementa el principio constitucional del
Exocórtex: la IA personal es **propiedad del usuario**, no del sistema.

### Layout

```
src/ai/
├── genkit.ts                   ← legacy server-side (se conserva)
├── flows/                      ← legacy flows server-side
├── providers/
│   ├── types.ts                ← interfaz Provider + tipos compartidos
│   ├── index.ts                ← registry + orden de presentación
│   ├── ollama.ts               ← local (sin clave)
│   ├── openai.ts               ← OpenAI + compatibles (Groq, Together, ...)
│   ├── anthropic.ts            ← Claude (direct-browser-access)
│   ├── google.ts               ← Gemini REST
│   └── README.md
└── client/
    ├── chat.ts                 ← punto único de entrada
    ├── keyStorage.ts           ← AES-GCM + PBKDF2 (WebCrypto)
    └── providerStore.ts        ← localStorage + export/import
```

### Cómo se usa

```ts
import { chat } from "@/ai/client/chat";

const response = await chat({
  messages: [
    { role: "system", content: "Eres el Núcleo StarSeed." },
    { role: "user", content: "Hola." },
  ],
  passphrase,                  // si el usuario configuró frase
  onChunk: (delta) => updateUI(delta),
});
```

`chat()` resuelve qué proveedor está activo, descifra la clave en memoria, y
delega al adapter correspondiente. Streaming uniforme.

### Cómo añadir un nuevo proveedor

1. Crear `src/ai/providers/mi-proveedor.ts` que exporte un objeto `Provider`
   con `info` y `chat()`.
2. Registrarlo en `src/ai/providers/index.ts` (mapa `PROVIDERS` y
   `PROVIDER_ORDER`).
3. (Opcional) Implementar `listModels()` para que el botón "Refrescar modelos"
   funcione en la UI.

Sin tocar UI: el panel `ai-providers-panel.tsx` recorre el registry y los
muestra automáticamente.

### Modelo de seguridad

- **Cifrado:** AES-GCM 256-bit; clave derivada con PBKDF2-SHA256, 250k iter,
  salt aleatorio por instalación (almacenado en `starseed.ai.salt`).
- **Frase de paso opcional:** si el usuario no introduce frase, se usa una
  default device-bound (menos segura, pero conveniente).
- **Verificador de frase:** `starseed.ai.verifier` guarda un ciphertext de "ok"
  para validar la frase rápidamente sin tener que descifrar todas las claves.
- **Llaves descifradas:** solo en memoria, durante la duración de una llamada
  a `provider.chat()`. Jamás se serializan, jamás se logean.
- **Tráfico:** las llamadas a proveedores externos parten siempre del
  navegador del usuario. El backend de Next.js nunca ve las claves ni las
  conversaciones.

### UI de gestión

- `/settings` → tab "IA & Modelos" (`AiProvidersPanel`): catálogo + gestor de
  proveedores con guardado cifrado, test de conexión, refresh de modelos,
  gestión de frase de paso.
- `/settings` → tab "Privacidad" (`PrivacyPanel`): Modo Fantasma, telemetría
  opt-in, exportar/importar configuración IA, ver desglose de localStorage,
  borrado total.
- `/agent`: selector de proveedor activo + input opcional de frase + botón
  Detener (AbortController). Streaming visible con cursor parpadeante.

### Integración con el sistema de agentes

Cada agente del Foundry (system prompt, temperatura, capacidades) es
provider-agnostic. La capa multi-proveedor solo ejecuta el contrato del
agente sobre el modelo que el usuario eligió. Las reglas (`rules`) activas se
inyectan automáticamente en el `system` prompt en cada llamada.

### Roadmap específico de esta capa

- [ ] Streaming real para Google AI (`streamGenerateContent`).
- [ ] Soporte de vision (imágenes) por proveedor.
- [ ] Tool-use / function calling unificado.
- [ ] Provider "Federación StarSeed": un nodo ofrece su modelo a otros nodos.
- [ ] Vector store local (IndexedDB + embeddings) para memoria persistente
      del Exocórtex.

---

## 13. Decisiones pendientes (lista de ADRs futuros)

A documentar en `architecture/specifications/decisions/` como ADRs (Architecture Decision Records):

- [ ] ADR-001: Elección de protocolo de federación
- [ ] ADR-002: Migración Supabase → Postgres propio (cuándo y cómo)
- [x] ADR-003: Sistema de cifrado E2E para Exocórtex → **DECIDIDO sesión 2**: AES-GCM 256 + PBKDF2-SHA256 250k iter, WebCrypto API, claves en localStorage cifrado.
- [ ] ADR-004: Tauri vs. Capacitor para apps nativas
- [ ] ADR-005: Distro base para StarSeed OS (Debian / Arch / NixOS)
- [ ] ADR-006: Manejo de moneda interna (Seeds / Karma) — si es token, qué tipo
- [ ] ADR-007: Provider de Proof of Personhood
- [ ] ADR-008: Política de retención de datos y derecho al olvido federado
- [ ] ADR-009: Estrategia de migración Genkit → capa cliente para flujos sin estado

---

*Última revisión: 2026-05-24*
