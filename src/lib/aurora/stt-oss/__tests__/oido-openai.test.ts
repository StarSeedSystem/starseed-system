import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { transcribirOpenAI, urlOidoLocal, type ResultadoTranscripcion } from "../oido-openai";

describe("urlOidoLocal", () => {
  it("devuelve la ruta correcta para phonon-2", () => {
    expect(urlOidoLocal("phonon-2")).toBe("/api/voz-local/oido/phonon");
  });

  it("devuelve la ruta correcta para parakeet-v3", () => {
    expect(urlOidoLocal("parakeet-v3")).toBe("/api/voz-local/oido/parakeet");
  });

  it("devuelve una ruta genérica para otros motores", () => {
    expect(urlOidoLocal("motoro")).toBe("/api/voz-local/oido/motoro");
  });
});

describe("transcribirOpenAI", () => {
  const audioBlob = new Blob(["dummy"], { type: "audio/mp3" });
  const baseUrl = "http://localhost:8000";
  const modelo = "whisper-1";

  let mockFetch: ReturnType<typeof vi.fn>;
  let fetchImpl: typeof fetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    fetchImpl = mockFetch as typeof fetch;
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

it("tiene éxito y devuelve texto y idioma", async () => {
     const respuestaMock = {
       text: "Hola mundo",
       language: "es",
     };
     mockFetch.mockResolvedValueOnce(
       new Response(JSON.stringify(respuestaMock), {
         status: 200,
         headers: { "Content-Type": "application/json" },
       })
     );

     const resultado = await transcribirOpenAI(audioBlob, {
       base: baseUrl,
       modelo,
       idioma: "es",
       hotwords: ["StarSeed", "Astraura"],
       fetchImpl,
     });

     const res = resultado as ResultadoTranscripcion;
     expect(res.ok).toBe(true);
     if (res.ok) {
       expect(res.texto).toBe("Hola mundo");
       expect(res.idioma).toBe("es");
       expect(res.motor).toBe("openai"); // maybe motor from config? Actually function may set motor from base? Not sure; we can skip motor check.
       expect(res.ms).toBeGreaterThan(0);
     }

     // Verificar que fetch fue llamado con la URL correcta
     expect(mockFetch).toHaveBeenCalled();
     const [url, init] = mockFetch.mock.calls[0];
     expect(url).toBe(`${baseUrl}/v1/audio/transcriptions`);
     expect(init?.method).toBe("POST");

     // Verificar que el body es FormData y contiene los campos esperados
     if (init?.body instanceof FormData) {
       const formData = init.body as FormData;
       expect(formData.get("model")).toBe(modelo);
       expect(formData.get("language")).toBe("es");
       const prompt = formData.get("prompt");
       expect(prompt).toBe("StarSeed,Astraura");
       // El archivo debe ser un Blob con nombre "file"
       const fileItem = formData.get("file");
       expect(fileItem).toBeInstanceOf(Blob);
       // No verificamos el contenido exacto del blob
     } else {
       throw new Error("El body no es un FormData");
     }
   });

it("tiene éxito sin idioma ni hotwords", async () => {
     const respuestaMock = { text: "Hello", language: "en" };
     mockFetch.mockResolvedValueOnce(
       new Response(JSON.stringify(respuestaMock), {
         status: 200,
         headers: { "Content-Type": "application/json" },
       })
     );

     const resultado = await transcribirOpenAI(audioBlob, {
       base: baseUrl,
       modelo,
       fetchImpl,
     });

     const res = resultado as ResultadoTranscripcion;
     expect(res.ok).toBe(true);
     if (res.ok) {
       expect(res.texto).toBe("Hello");
       expect(res.idioma).toBe("en");
     }

     const [, init] = mockFetch.mock.calls[0];
     if (init?.body instanceof FormData) {
       const formData = init.body as FormData;
       expect(formData.get("model")).toBe(modelo);
       // No debe haber language ni prompt
       expect(formData.get("language")).toBeNull();
       expect(formData.get("prompt")).toBeNull();
     } else {
       throw new Error("El body no es un FormData");
     }
   });

it("devuelve ok:false cuando el servidor responde con error HTTP", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Error interno", {
          status: 500,
          statusText: "Internal Error",
        })
      );

      const resultado = await transcribirOpenAI(audioBlob, {
        base: baseUrl,
        modelo,
        fetchImpl,
      });

      const res = resultado as ResultadoTranscripcion;
      expect(res.ok).toBe(false);
      if (res.ok === false) {
        expect(res.motivo).toBe("Internal Error");
      }
    });

    it("devuelve ok:false cuando se agota el timeout", async () => {
       // Simular una petición que puede ser abortada
       mockFetch.mockImplementationOnce((url, init) => {
         return new Promise((resolve, reject) => {
           // Si la señal ya está abortada, rechazar inmediatamente
           if (init?.signal?.aborted) {
             const err = new Error('Aborted');
             err.name = 'AbortError';
             return reject(err);
           }
           // Escuchar el evento de abort
           const abortListener = () => {
             const err = new Error('Aborted');
             err.name = 'AbortError';
             reject(err);
           };
           init?.signal?.addEventListener('abort', abortListener);
           // Nunca resolvemos, pero rechazaremos cuando se abra el abort
         });
       });

       const resultado = await transcribirOpenAI(audioBlob, {
         base: baseUrl,
         modelo,
         timeoutMs: 10, // timeout muy corto
         fetchImpl,
       });

       const res = resultado as ResultadoTranscripcion;
       expect(res.ok).toBe(false);
       if (res.ok === false) {
         // El motivo esperado puede ser "Timeout" o similar
         expect(res.motivo).toMatch(/Timeout/);
       }
     });
});