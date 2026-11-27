# Ejemplo de uso: Agent Reach en el Enjambre

> **Objetivo:** Mostrar cómo una tarea del enjambre usa la skill `agent-reach` para leer contenido de plataformas externas.

---

## Escenario

**Tarea:** «Lee el hilo de Reddit sobre "rust async patterns" y extrae los 3 patrones principales que recomiendan.»

**Entrada del usuario:** `https://www.reddit.com/r/rust/comments/xyz123/async_patterns_discussion/`

---

## Paso 1: Identificar la capacidad

La URL es de Reddit → capacidad `read-web` (el proxy mapea URLs de Reddit al canal correspondiente).

```typescript
// En el código de la tarea (p. ej. un agente que procesa la petición)
const capacidad = "read-web";
const payload = { url: "https://www.reddit.com/r/rust/comments/xyz123/async_patterns_discussion/" };
```

---

## Paso 2: Llamar al proxy

```typescript
// Desde el cliente del enjambre (fetch directo al proxy)
const respuesta = await fetch("/api/agent-reach/read-web", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${tokenSupabase}` // obligatorio salvo STARSEED_LOCAL=1
  },
  body: JSON.stringify(payload)
});

const datos = await respuesta.json();
```

---

## Paso 3: Manejar la respuesta

### Caso A: Éxito (`ok: true`)

```json
{
  "ok": true,
  "content": "### Hilo de Reddit\n\n**Patrón 1: async/await con Tokio**...\n\n---\n\n### Comentario destacado\n\n**Patrón 2: Futures combinators**...\n\nFuente: https://www.reddit.com/r/rust/comments/xyz123/...\n\n---\n\n### Comentario destacado\n\n**Patrón 3: async-std + futures**...\n\nFuente: https://www.reddit.com/r/rust/comments/xyz123/...",
  "items": [
    { "title": "Hilo de Reddit", "url": "https://www.reddit.com/r/rust/comments/xyz123/...", "author": "rustacean42", "published_at": "2026-11-20", "text": "Patrón 1: async/await con Tokio..." },
    { "title": "Comentario destacado", "url": "https://www.reddit.com/r/rust/comments/xyz123/...", "author": "async_guru", "published_at": "2026-11-20", "text": "Patrón 2: Futures combinators..." },
    { "title": "Comentario destacado", "url": "https://www.reddit.com/r/rust/comments/xyz123/...", "author": "crab_dev", "published_at": "2026-11-20", "text": "Patrón 3: async-std + futures..." }
  ]
}
```

**Procesamiento en la tarea:**

```typescript
if (datos.ok) {
  // Extraer patrones del content (Markdown) o de items
  const patrones = extraerPatrones(datos.content);
  // patrones = ["async/await con Tokio", "Futures combinators", "async-std + futures"]
  return { ok: true, patrones };
}
```

### Caso B: Canal con sesión apagado (R1) — `NEED_LOGIN_BLOQUEADO`

```json
{
  "ok": false,
  "error": "Canal con sesión apagado (R1): solo canales públicos sin iniciar sesión.",
  "motivo": "NEED_LOGIN_BLOQUEADO",
  "codigo": "NEED_LOGIN_BLOQUEADO"
}
```

**Manejo:**

```typescript
if (!datos.ok && datos.motivo === "NEED_LOGIN_BLOQUEADO") {
  // Reddit requiere login para ver comentarios completos
  // Informar al usuario y ofrecer alternativa
  return {
    ok: false,
    mensaje: "Este hilo de Reddit requiere iniciar sesión para leer comentarios completos. Agent Reach tiene el canal Reddit apagado por política R1 (sin sesión). ¿Quieres que busque patrones async en la web pública en su lugar?",
    alternativa: { capacidad: "web-search", payload: { q: "rust async patterns Tokio futures combinators", limit: 5 } }
  };
}
```

### Caso C: CLI no instalado — `NEED_SETUP`

```json
{
  "ok": false,
  "error": "agent-reach no está instalado en esta neurona.",
  "hint": "Instala Agent-Reach con: uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip (queda en ~/.local/bin). Ojo: el paquete «agent-reach» de PyPI NO es este proyecto; no uses pip ni npx."
}
```

**Manejo:**

```typescript
if (!datos.ok && datos.hint?.includes("uv tool install")) {
  return {
    ok: false,
    mensaje: "Agent Reach no está instalado en esta neurona. Para leer este contenido, instálalo con:",
    comando: "uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip"
  };
}
```

### Caso D: Rate limited — `RATE_LIMITED`

```json
{
  "ok": false,
  "error": "El origen limita las peticiones; prueba más tarde.",
  "codigo": "RATE_LIMITED"
}
```

**Manejo:**

```typescript
if (!datos.ok && datos.codigo === "RATE_LIMITED") {
  // NO reintentar en bucle
  return {
    ok: false,
    mensaje: "Reddit está limitando peticiones. Espera un minuto y vuelve a intentarlo, o usa búsqueda web como alternativa.",
    reintentarEn: 60
  };
}
```

---

## Paso 4: Responder al usuario

```markdown
He leído el hilo de Reddit sobre "rust async patterns". Aquí están los 3 patrones principales que recomiendan:

1. **async/await con Tokio** — El runtime más usado; `tokio::spawn` para tareas paralelas, `join!` para esperar múltiples futures.
2. **Futures combinators** — `future::join_all`, `try_join`, `select!` para combinar futures sin spawn de tareas.
3. **async-std + futures** — Alternativa ligera; `async_std::task::spawn` + `futures::future::join_all`.

*Fuente: https://www.reddit.com/r/rust/comments/xyz123/async_patterns_discussion/*
```

---

## Ejemplo completo: Función de tarea del enjambre

```typescript
// src/lib/enjambre/tareas/leer-reddit-async.ts
import type { TareaEntrada, TareaSalida } from "../tipos";

export async function leerRedditAsyncPatterns(entrada: TareaEntrada): Promise<TareaSalida> {
  const { url } = entrada.payload as { url: string };

  // 1. Validar URL (SSRF básico)
  if (!url.startsWith("https://www.reddit.com/")) {
    return { ok: false, error: "Solo URLs de reddit.com son válidas para esta tarea." };
  }

  // 2. Llamar al proxy
  const resp = await fetch("/api/agent-reach/read-web", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${entrada.token}` },
    body: JSON.stringify({ url })
  });

  const datos = await resp.json();

  // 3. Manejar según código
  if (datos.ok) {
    const patrones = extraerPatronesAsync(datos.content);
    return { ok: true, data: { patrones, fuente: url } };
  }

  // 4. Errores manejables
  switch (datos.codigo) {
    case "NEED_LOGIN_BLOQUEADO":
      return {
        ok: false,
        error: "Reddit requiere login (canal apagado R1).",
        sugerencia: "Usa búsqueda web: web-search con 'rust async patterns'"
      };
    case "NEED_SETUP":
      return { ok: false, error: "Agent Reach no instalado.", hint: datos.hint };
    case "RATE_LIMITED":
      return { ok: false, error: "Rate limited.", reintentarEn: 60 };
    case "PLATFORM_BLOCKED":
      return { ok: false, error: "Reddit bloquea la lectura (captcha)." };
    default:
      return { ok: false, error: datos.error || "Error desconocido", codigo: datos.codigo };
  }
}

function extraerPatronesAsync(texto: string): string[] {
  // Lógica simple: buscar líneas que empiecen por "Patrón" o números
  return texto
    .split("\n")
    .filter(l => /^(Patrón|\d+\.)/i.test(l.trim()))
    .map(l => l.replace(/^(Patrón\s*\d+[:.]?\s*|\d+\.\s*)/i, "").trim())
    .slice(0, 5);
}
```

---

## Tests para la tarea (TDD)

```typescript
// src/lib/enjambre/tareas/__tests__/leer-reddit-async.test.ts
import { describe, it, expect, vi } from "vitest";
import { leerRedditAsyncPatterns } from "../leer-reddit-async";

describe("leerRedditAsyncPatterns · tarea del enjambre", () => {
  const token = "test-token";
  const url = "https://www.reddit.com/r/rust/comments/xyz123/async_patterns/";

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extrae patrones cuando el proxy devuelve ok", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        content: "Patrón 1: Tokio\nPatrón 2: Futures\nPatrón 3: async-std",
        items: []
      })
    } as unknown as Response);

    const r = await leerRedditAsyncPatterns({ token, payload: { url } });
    expect(r.ok).toBe(true);
    expect(r.data?.patrones).toContain("Tokio");
  });

  it("maneja NEED_LOGIN_BLOQUEADO con sugerencia", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: false,
        codigo: "NEED_LOGIN_BLOQUEADO",
        error: "Canal con sesión apagado (R1)"
      })
    } as unknown as Response);

    const r = await leerRedditAsyncPatterns({ token, payload: { url } });
    expect(r.ok).toBe(false);
    expect(r.sugerencia).toContain("web-search");
  });

  it("rechaza URLs no-Reddit", async () => {
    const r = await leerRedditAsyncPatterns({ token, payload: { url: "https://evil.com" } });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("reddit.com");
  });
});
```

---

## Ejecutar los tests

```bash
npx vitest run src/lib/enjambre/tareas/__tests__/leer-reddit-async.test.ts
```

---

## Checklist de integración en el enjambre

- [ ] La tarea usa **ids EXACTOS** de capacidades (`read-web`, `web-search`, `youtube-transcript`, `github-read`, `bilibili`, `health`)
- [ ] Maneja **todos los códigos de error** de la tabla (especialmente `NEED_LOGIN_BLOQUEADO`, `RATE_LIMITED`, `PLATFORM_BLOCKED`, `BUSY`)
- [ ] **No reintenta en bucle** ante códigos de parada
- [ ] Devuelve el `hint` de instalación **tal cual** si `NEED_SETUP`
- [ ] Valida entrada (SSRF, longitud, sin `-` inicial) **antes** de llamar al proxy
- [ ] Incluye **test vitest** que cubra éxito + al menos 2 códigos de error
- [ ] La tarea cabe en **≤ 3 archivos y ≤ 120 líneas por archivo**
- [ ] Pasa `npx tsc --noEmit` y `npx vitest run` en verde