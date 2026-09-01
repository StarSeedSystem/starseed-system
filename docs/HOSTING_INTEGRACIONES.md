# 🌐 Hospedaje GRATIS de las integraciones OSS

> **Propósito.** Guía honesta para hospedar de forma **gratuita** cada conector
> del catálogo de integraciones (`src/lib/integrations/registry.ts`) y decidir
> cuáles pueden estar **activadas por defecto para cada usuario** y cuáles deben
> quedarse en *self-host* con `localhost`.
>
> **Regla de oro.** Solo se pone un `defaultEndpoint` público cuando el servicio
> está **claramente pensado para uso público** y es **fiable**. Hoy **ninguno**
> de los conectores cumple ambas cosas sin que StarSeed hospede su propia
> instancia oficial → todos mantienen `localhost` como default y llevan una
> pista (`freeHostingHint`) de la mejor opción gratuita.

---

## 0. TL;DR — Qué desplegar primero (para que StarSeed las active por defecto)

Para tener herramientas **on-by-default** hace falta un endpoint hospedado por
StarSeed. Prioriza estas tres, en este orden, porque son **stateless / sin datos
sensibles del usuario** y baratísimas de operar:

| Prioridad | Servicio | Por qué primero | Endpoint oficial sugerido |
|---|---|---|---|
| 1 | **SearXNG** | Buscar en la web es la capacidad más transversal. Ligero. Las públicas fallan (JSON 403), así que StarSeed *necesita* la suya. | `https://search.starseed-os.<dominio>` |
| 2 | **Crawl4AI** | Ingesta web → Markdown para RAG. Complementa a SearXNG. Sin estado. | `https://crawl.starseed-os.<dominio>` |
| 3 | **Stirling-PDF** | Utilidades PDF universales. Totalmente stateless, sin secretos. El demo público OSS ya no existe. | `https://pdf.starseed-os.<dominio>` |

Cuando estén desplegadas y estables:
1. Cambia su `defaultEndpoint` en `registry.ts` al endpoint oficial.
2. Marca `onByDefault: true` en su descriptor.
3. En SearXNG, asegúrate de `search.formats: [html, json]` en `settings.yml`.

El resto de conectores **no** deben activarse por defecto (usan claves, ejecutan
código, o requieren GPU) — quedan como *self-host* opcional del usuario.

---

## 1. Plataformas de hospedaje GRATIS (tabla de referencia)

| Plataforma | Gratis real | Duerme por inactividad | Ideal para | Ojo |
|---|---|---|---|---|
| **Oracle Cloud — Always Free** | Sí, de por vida | **No** (VM 24/7) | Cualquier contenedor Docker permanente (SearXNG, Crawl4AI, n8n, Stirling…) | ARM Ampere A1: 4 OCPU / 24 GB RAM / ~200 GB. A veces "Out of Capacity" en la región; usa imágenes `linux/arm64`. **La mejor opción "siempre encendida".** |
| **Hugging Face Spaces** | Sí (`cpu-basic`) | Sí, a las **48 h** (revive con una visita) | Servicios Docker sin estado y de arranque rápido (SearXNG, Crawl4AI, Stirling, Langflow) | 16 GB RAM / 2 vCPU / 50 GB. Ideal para instancias oficiales de bajo tráfico. |
| **Render (free web service)** | Sí (750 h/mes) | Sí, a los **15 min** (cold start 30–60 s) | Demos y pruebas | El sueño **rompe webhooks entrantes** (n8n). |
| **Railway** | Solo *trial* ($5 crédito único) + Hobby con $5/mes | Depende del plan | Despliegues rápidos de 1 clic | No es gratis permanente; se agota el crédito. |
| **Koyeb (free instance)** | Sí (1 servicio) | Sí, a la **1 h** (no desactivable) | Pruebas puntuales | 512 MB / 0.1 vCPU, sin volúmenes, 1 región. No sirve para "always-on". |
| **Fly.io** | **Ya NO** tiene free tier (retirado en 2026) | — | — | Evitar para "gratis". |
| **Cloudflare Workers** | Sí (100k req/día) | No (edge) | *Proxies* ligeros, no contenedores | No corre Docker; útil como capa proxy/CORS delante de otro servicio. |
| **Deno Deploy** | Sí (free tier) | No (edge) | Funciones/proxies ligeros | Igual que Workers: no ejecuta contenedores arbitrarios. |

> **Recomendación general de StarSeed:** para instancias **oficiales permanentes**
> usar **Oracle Cloud Always Free** (24/7, sin sueño). Para instancias oficiales de
> tráfico bajo/experimentales, **Hugging Face Spaces** (aceptando el sueño de 48 h).
> Cloudflare Workers/Deno Deploy sirven solo como *proxy* delante, no como host del servicio.

---

## 2. Conector por conector

Para cada uno: **qué es · hospedaje gratis · ¿instancia pública fiable? ·
recomendación StarSeed**.

### 🔎 SearXNG — Metabúsqueda web (`data-ingest`)
- **Qué es:** metabuscador privado que agrega +70 motores y puede devolver JSON.
- **Hospedaje gratis:** Hugging Face Spaces (Docker, imagen `searxng/searxng`, puerto 8080) o VM Always Free de Oracle Cloud (24/7).
- **¿Pública fiable?** **NO.** La inmensa mayoría de instancias de `searx.space`
  tienen el **formato JSON deshabilitado** y devuelven **403** al pedir
  `format=json` (JSON no está activo por defecto porque los bots abusan de él).
  Fijar una pública como default **rompería el conector**.
- **Recomendación:** **Instancia oficial StarSeed = prioridad #1.** Desplegar con
  `search.formats: [html, json]` en `settings.yml`, poner esa URL como
  `defaultEndpoint` y `onByDefault: true`. Opcional: Cloudflare Worker delante para caché/CORS.

### 🕷️ Crawl4AI — Rastreo web → Markdown para RAG (`data-ingest`)
- **Qué es:** crawler *LLM-friendly* que convierte páginas en Markdown limpio.
- **Hospedaje gratis:** Hugging Face Spaces (Docker, imagen `unclecode/crawl4ai`, puerto 11235) o VM Always Free de Oracle Cloud.
- **¿Pública fiable?** No hay instancia pública multi-tenant fiable. La solución
  Docker oficial ha estado marcada como no estable; probar antes de producción.
- **Recomendación:** **Instancia oficial StarSeed = prioridad #2.** Sin estado y
  sin secretos → apto para `onByDefault: true` una vez desplegada.

### 🔥 Firecrawl — Scraping y rastreo a Markdown/estructurado (`data-ingest`)
- **Qué es:** motor de scraping/crawl con salida Markdown y datos estructurados.
- **Hospedaje gratis:** SaaS oficial `https://api.firecrawl.dev` con free tier
  **limitado** (créditos *one-shot*, tope por minuto y **clave obligatoria**).
  Para uso libre: self-host con **Docker Compose** (repo `firecrawl`) en VM
  Always Free de Oracle Cloud (necesita **Redis** + navegador headless).
- **¿Pública fiable?** El SaaS es fiable pero de pago/rate-limited → **no apto como default**.
- **Recomendación:** dejar `localhost` (`needsKey: true`). El usuario elige entre
  su clave del SaaS o su self-host. **No** activar por defecto.

### 🧠 Dify — Apps de chat/agente + workflows LLM + RAG (`app-platform`)
- **Qué es:** plataforma para construir apps LLM (chat, agentes, workflows, RAG).
- **Hospedaje gratis:** **Dify Cloud** (`https://cloud.dify.ai`) plan *Sandbox*
  gratis pero con **200 créditos one-shot** y **clave por app**. Uso libre:
  self-host con Docker Compose (`langgenius/dify`) en VM Always Free de Oracle Cloud.
- **¿Pública fiable?** No como endpoint compartido (clave por app).
- **Recomendación:** dejar `localhost` (`needsKey: true`). **No** on-by-default.

### 🌊 Langflow — Flujos visuales / agentes low-code (`app-platform`)
- **Qué es:** constructor visual *drag-and-drop* de flujos y agentes LLM.
- **Hospedaje gratis:** "Duplicate Space" del Space oficial
  `huggingface.co/spaces/Langflow/Langflow` (Docker, puerto 7860; duerme a 48 h) o
  VM Always Free de Oracle Cloud (24/7 con persistencia).
- **¿Pública fiable?** No hay instancia pública compartible (los flujos y claves son propios).
- **Recomendación:** `localhost`. Self-host opcional del usuario. **No** on-by-default.

### 🔀 Flowise — Predicción de chatflow / agentes visuales (`app-platform`)
- **Qué es:** alternativa low-code a Langflow para chatflows y agentes.
- **Hospedaje gratis:** Hugging Face Spaces (Docker) o VM Always Free de Oracle Cloud.
  Activar autenticación (`FLOWISE_USERNAME` / `FLOWISE_PASSWORD`).
- **¿Pública fiable?** No procede endpoint público (depende de tus flows/claves LLM).
- **Recomendación:** `localhost`. Self-host opcional. **No** on-by-default.

### 💬 Open WebUI — Chat con LLM compatible OpenAI + RAG (`app-platform`)
- **Qué es:** interfaz de chat personal con cuentas, RAG y API compatible OpenAI.
- **Hospedaje gratis:** Hugging Face Spaces (Docker, `ghcr.io/open-webui/open-webui`) o VM Always Free de Oracle Cloud.
- **¿Pública fiable?** Nunca un endpoint público compartido: es una interfaz
  **personal** con cuentas y **clave** (`needsKey: true`).
- **Recomendación:** `localhost`. Instancia por usuario. **No** on-by-default.

### 🤖 OpenHands — Agente de software que escribe/ejecuta código (`app-platform`)
- **Qué es:** agente experimental que **ejecuta código** para tareas de programación.
- **Hospedaje gratis:** VM Always Free de Oracle Cloud como **sandbox dedicado** (Docker).
- **¿Pública fiable?** **NO** y por diseño no debe serlo (ejecutar código expuesto = riesgo grave).
- **Recomendación:** `localhost`, **siempre aislado**. **Jamás** público ni on-by-default.

### 📄 Stirling-PDF — Utilidades PDF (fusionar, a imagen, extraer texto) (`app-platform`)
- **Qué es:** navaja suiza de PDF (60+ operaciones) totalmente local y sin telemetría.
- **Hospedaje gratis:** Hugging Face Spaces (Docker, imagen `stirlingtools/stirling-pdf`, puerto 8080) o VM Always Free de Oracle Cloud.
- **¿Pública fiable?** **NO.** El antiguo demo `stirlingpdf.io` hoy **redirige
  (302) a un producto comercial** distinto del proyecto OSS. No hay API pública OSS fiable.
- **Recomendación:** **Instancia oficial StarSeed = prioridad #3.** Es **stateless
  y sin secretos** → candidato ideal a `onByDefault: true` una vez desplegada.

### 🦙 Ollama — Inferencia local compatible OpenAI (`runtime`)
- **Qué es:** servidor de modelos locales con API compatible OpenAI.
- **Hospedaje gratis:** su gracia es correr **en la máquina/exocórtex del usuario**.
  El hosting gratis **sin GPU** (HF/VMs) solo mueve modelos diminutos.
- **¿Pública fiable?** No procede (requeriría GPU cara para ser útil).
- **Recomendación:** mantener `localhost`. **No** on-by-default.

### 🚪 LiteLLM — Gateway 100+ LLM compatible OpenAI (`runtime`)
- **Qué es:** proxy que unifica 100+ proveedores LLM bajo formato OpenAI.
- **Hospedaje gratis:** Hugging Face Spaces (Docker) o VM Always Free de Oracle
  Cloud, protegido con `LITELLM_MASTER_KEY`.
- **¿Pública fiable?** **NO:** contiene **tus claves** de proveedores → nunca público.
- **Recomendación:** `localhost` (`needsKey: true`). Self-host privado. **No** on-by-default.

### 🧩 LocalAI — Inferencia local multimodal compatible OpenAI (`runtime`)
- **Qué es:** motor de inferencia local (texto, imagen, audio) compatible OpenAI.
- **Hospedaje gratis:** pruebas con modelos pequeños en Hugging Face Spaces (Docker); real requiere GPU.
- **¿Pública fiable?** No procede (como Ollama, pensado para local).
- **Recomendación:** mantener `localhost`. **No** on-by-default.

### ⚙️ n8n — Disparar workflows / automatización / webhooks (`automation`)
- **Qué es:** automatización low-code con webhooks entrantes.
- **Hospedaje gratis:** **VM Always Free de Oracle Cloud** (Docker, 24/7). **Evita**
  Render/Railway/Koyeb free: se **duermen** y eso **rompe los webhooks entrantes**.
- **¿Pública fiable?** No: cada usuario tiene sus propios workflows/credenciales.
- **Recomendación:** `localhost`. Self-host permanente por usuario. **No** on-by-default.

### 🧭 Browser Use — Agente de navegador / automatización web (`automation`)
- **Qué es:** agente experimental que controla un **navegador real**.
- **Hospedaje gratis:** VM Always Free de Oracle Cloud (Docker con navegador headless), aislado.
- **¿Pública fiable?** **NO** y no debe serlo (control de navegador expuesto = riesgo).
- **Recomendación:** `localhost`, aislado. **Jamás** público ni on-by-default.

---

## 3. Resumen de decisiones (estado en `registry.ts`)

| Conector | `defaultEndpoint` | `onByDefault` | Mejor hospedaje gratis | Motivo |
|---|---|---|---|---|
| SearXNG | `localhost` *(→ oficial pendiente)* | pendiente → `true` | Oracle Always Free / HF Spaces | Públicas dan 403 en JSON |
| Crawl4AI | `localhost` *(→ oficial pendiente)* | pendiente → `true` | HF Spaces / Oracle Always Free | Sin pública fiable; stateless |
| Stirling-PDF | `localhost` *(→ oficial pendiente)* | pendiente → `true` | HF Spaces / Oracle Always Free | Demo OSS extinto; stateless |
| Firecrawl | `localhost` | — | Self-host Oracle (o SaaS con clave) | Free tier de pago/limitado |
| Dify | `localhost` | — | Self-host Oracle (o Cloud Sandbox) | Clave por app / créditos one-shot |
| Langflow | `localhost` | — | HF Spaces / Oracle Always Free | Flujos y claves propias |
| Flowise | `localhost` | — | HF Spaces / Oracle Always Free | Depende de flows/claves |
| Open WebUI | `localhost` | — | HF Spaces / Oracle Always Free | Interfaz personal con clave |
| OpenHands | `localhost` | — | Oracle Always Free (aislado) | Ejecuta código: nunca público |
| Ollama | `localhost` | — | Máquina del usuario | Necesita GPU / es local |
| LiteLLM | `localhost` | — | HF Spaces / Oracle Always Free | Contiene claves de proveedores |
| LocalAI | `localhost` | — | HF Spaces (pruebas) | Necesita GPU / es local |
| n8n | `localhost` | — | Oracle Always Free (24/7) | Webhooks se rompen si duerme |
| Browser Use | `localhost` | — | Oracle Always Free (aislado) | Controla navegador: nunca público |

> **Nota de seguridad.** El registro **no** contiene secretos: las claves las
> aporta el usuario en su configuración (localStorage, por cuenta o por cerebro).
> Los `freeHostingHint` son solo **informativos** para la UI de configuración; no
> alteran el comportamiento del *runner* (que sigue siendo defensivo y degrada con
> `{ ok:false, error }`).

---

## 4. Campos añadidos al descriptor (aditivos y retrocompatibles)

En `src/lib/integrations/registry.ts` se definió `IntegrationDescriptorExt`
(extiende `IntegrationDescriptor` del tipo base, sin modificarlo):

- **`freeHostingHint?: string`** — pista (ES) de la mejor opción de hospedaje
  gratuito cuando no hay endpoint público fiable.
- **`onByDefault?: boolean`** — `true` solo si la herramienta es genuinamente
  segura de activar para todo el mundo (endpoint público fiable). Hoy ausente en
  todas (la UI debe tratar `undefined` como `false`).

Ambos son **opcionales**: cualquier consumidor existente que use
`IntegrationDescriptor` sigue funcionando sin cambios.

---

*Última actualización: 2026-06-30. Fuente de verdad del catálogo: `src/lib/integrations/registry.ts`.*

## Selector de carpetas de Google (Adenda 196)

El explorador propio de Drive se sustituyó por el **selector oficial de Google**
(Picker), porque `drive.file` —el scope que usa ahora StarSeed— es NO SENSIBLE:
la app se publica para cualquiera sin verificación de Google ni auditoría anual,
y solo ve las carpetas que el usuario elige. Variables públicas necesarias
(creadas por terminal, ver `scripts/google-picker-setup.sh`):

- `NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER` — número del proyecto de Google Cloud.
- `NEXT_PUBLIC_GOOGLE_API_KEY` — clave de API restringida al Picker y a los
  dominios del OS. Es pública por diseño.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — ID del cliente OAuth (único paso manual:
  Google no expone API para crearlo).

Al ser `NEXT_PUBLIC_*` se incrustan en el BUILD: tras cambiarlas hay que
redesplegar para que producción las vea.
