import { isBlocked } from "@/lib/security/ssrf";

async function test() {
  // Establecer la variable de entorno para negar privados
  process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE = "0";
  
  console.log("INTEGRATIONS_PROXY_ALLOW_PRIVATE:", process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE);
  
  const urls = [
    "https://example.com",
    "https://api.example.com/path",
    "https://127.0.0.1:8080",
    "https://metadata.google.internal"
  ];
  
  for (const url of urls) {
    try {
      const parsedUrl = new URL(url);
      const blocked = await isBlocked(parsedUrl);
      console.log(`${url} -> blocked: ${blocked}`);
    } catch (error) {
      console.error(`Error processing ${url}:`, error.message);
    }
  }
  
  // Restaurar
  delete process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE;
}

test();