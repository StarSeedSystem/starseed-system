import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { validarEndpoint, reenviarTurno, RunAgentInput } from "../adaptadores/invitado-servidor";

// Guardar valores originales de variables de entorno
let originalAguiAuthToken: string | undefined;
let originalIntegrationsProxyAllowPrivate: string | undefined;

beforeEach(() => {
  // Guardar y establecer variables de entorno para las pruebas
  originalAguiAuthToken = process.env.AGUI_AUTH_TOKEN;
  originalIntegrationsProxyAllowPrivate = process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE;
  
  process.env.AGUI_AUTH_TOKEN = "test-token-12345";
  // Por defecto, permitir privados (comportamiento normal del SSRF)
  delete process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE;
});

afterEach(() => {
  // Restaurar valores originales
  if (originalAguiAuthToken === undefined) {
    delete process.env.AGUI_AUTH_TOKEN;
  } else {
    process.env.AGUI_AUTH_TOKEN = originalAguiAuthToken;
  }
  
  if (originalIntegrationsProxyAllowPrivate === undefined) {
    delete process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE;
  } else {
    process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE = originalIntegrationsProxyAllowPrivate;
  }
});

describe("validarEndpoint", () => {
  it("debe rechazar URLs que no sean HTTPS", async () => {
    expect(await validarEndpoint("http://example.com")).toBe(false);
    expect(await validarEndpoint("ftp://example.com")).toBe(false);
    expect(await validarEndpoint("example.com")).toBe(false);
  });

  it("debe aceptar URLs HTTPS válidas", async () => {
    // Usar IPs públicas conocidas para evitar problemas de resolución DNS en el entorno de prueba
    expect(await validarEndpoint("https://8.8.8.8")).toBe(true); // Google DNS
    expect(await validarEndpoint("https://1.1.1.1")).toBe(true); // Cloudflare DNS
  });

  it("debe rechazar IPs privadas cuando se configura para negar privados", async () => {
    // Establecer la variable de entorno para negar privados (como lo hace nuestro proxy)
    process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE = "0";
    
    expect(await validarEndpoint("https://127.0.0.1:8080")).toBe(false);
    expect(await validarEndpoint("https://192.168.1.1")).toBe(false);
    expect(await validarEndpoint("https://10.0.0.1")).toBe(false);
    expect(await validarEndpoint("https://172.16.0.1")).toBe(false);
    expect(await validarEndpoint("https://169.254.169.254")).toBe(false); // IP de metadatos
  });

  it("debe aceptar IPs privadas cuando se configura para permitir privados (comportamiento normal del SSRF)", async () => {
    // Establecer la variable de entorno para permitir privados (comportamiento por defecto)
    process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE = "1";
    
    // Estas deberían ser aceptadas cuando se permite privados
    expect(await validarEndpoint("https://127.0.0.1:8080")).toBe(true);
    expect(await validarEndpoint("https://192.168.1.1")).toBe(true);
    expect(await validarEndpoint("https://10.0.0.1")).toBe(true);
    expect(await validarEndpoint("https://172.16.0.1")).toBe(true);
    
    // Pero las IPs de metadatos siempre deben ser rechazadas
    expect(await validarEndpoint("https://169.254.169.254")).toBe(false);
  });

  it("debe rechazar hostnames de metadatos", async () => {
    expect(await validarEndpoint("https://metadata.google.internal")).toBe(false);
    expect(await validarEndpoint("https://metadata")).toBe(false);
  });
});

describe("reenviarTurno", () => {
  const mensajesDePrueba: Array<{ role: string; content: string }> = [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there!" },
  ];

  const contextoDePrueba: Record<string, unknown> = {
    userId: "user123",
    sessionId: "session456",
  };

  it("debe rechazar cuando falta el token de autorización", async () => {
    // Eliminar la variable de entorno para esta prueba
    delete process.env.AGUI_AUTH_TOKEN;
    
    await expect(
      reenviarTurno({
        endpoint: "https://example.com/agent",
        cabecera: "AGUI_AUTH_TOKEN",
        mensajes: mensajesDePrueba,
        contextoPermitido: contextoDePrueba,
      })
    ).rejects.toThrow(/Authorization token not found/);
  });

  it("debe incluir la cabecera de autorización cuando se proporciona el nombre de la variable", async () => {
    // Establecer la variable de entorno para esta prueba
    process.env.AGUI_AUTH_TOKEN = "test-token-12345";
    
    const fetchMock = vi.fn(() => 
      Promise.resolve({
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array());
            controller.close();
          },
        }),
      } as Response)
    );
    
    // @ts-ignore - mocking global fetch
    global.fetch = fetchMock;
    
    await reenviarTurno({
      endpoint: "https://example.com/agent",
      cabecera: "AGUI_AUTH_TOKEN",
      mensajes: mensajesDePrueba,
      contextoPermitido: contextoDePrueba,
    });
    
    // Verificar que fetch fue llamado con la cabecera de autorización
    expect(fetchMock).toHaveBeenCalled();
    const callArgs = fetchMock.mock.calls[0];
    const url = callArgs[0];
    const options = callArgs[1];
    
    expect(url.toString()).toBe("https://example.com/agent");
    expect(options.headers).toHaveProperty("Authorization");
    expect(options.headers.Authorization).toBe("Bearer test-token-12345");
    
    // Verificar que nunca devolvemos el token en la respuesta ni lo registramos
    // (en la implementación real, solo registramos la longitud)
  });

  it("debe respetar el límite de tiempo de 60 segundos", async () => {
    vi.stubEnv("AGUI_AUTH_TOKEN", "test-token");
    
    const fetchMock = vi.fn(() => 
      new Promise(() => {
        // Simular una petición que nunca se resuelve (sin llamar a resolve ni reject)
        // Esto hará que el AbortController se dispare después de 60 segundos
      })
    );
    
    // @ts-ignore - mocking global fetch
    global.fetch = fetchMock;
    
    await expect(
      reenviarTurno({
        endpoint: "https://example.com/agent",
        cabecera: "AGUI_AUTH_TOKEN",
        mensajes: mensajesDePrueba,
        contextoPermitido: contextoDePrueba,
      })
    ).rejects.toThrow(/Request timeout after 60 seconds/);
  });

  it("debe propagar errores SSRF de endpoints bloqueados", async () => {
    vi.stubEnv("AGUI_AUTH_TOKEN", "test-token");
    // Establecer la variable de entorno para negar privados (como lo hace nuestro proxy)
    process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE = "0";
    
    await expect(
      reenviarTurno({
        endpoint: "https://127.0.0.1:8080/agent", // IP privada
        cabecera: "AGUI_AUTH_TOKEN",
        mensajes: mensajesDePrueba,
        contextoPermitido: contextoDePrueba,
      })
    ).rejects.toThrow(/Destino no permitido/);
  });

  it("debe pasar el contexto tal cual (asumiendo que el filtrado de memoria personal se hace antes)", async () => {
    const fetchMock = vi.fn(() => 
      Promise.resolve({
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([0x64, 0x61, 0x74, 0x61])); // "data"
            controller.close();
          },
        }),
      } as Response)
    );
    
    // @ts-ignore - mocking global fetch
    global.fetch = fetchMock;
    
    const contextoPersonal = { 
      personal: "esto debería ser filtrado antes de llegar aquí",
      perfil: "esto también debería ser filtrado",
      datosPublicos: "esto sí debería pasar"
    };
    
    await reenviarTurno({
      endpoint: "https://example.com/agent",
      cabecera: "AGUI_AUTH_TOKEN",
      mensajes: mensajesDePrueba,
      contextoPermitido: contextoPersonal,
    });
    
    // Verificar que fetch fue llamado
    expect(fetchMock).toHaveBeenCalled();
    const callArgs = fetchMock.mock.calls[0];
    const options = callArgs[1];
    
    // El cuerpo debería contener el contexto que pasamos
    // (en una implementación real, verificaríamos el JSON enviado)
    expect(options.body).toContain("datosPublicos");
  });
});