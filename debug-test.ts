import { validarEndpoint } from "./src/lib/astraura-bots/adaptadores/invitado-servidor";

async function test() {
  // Establecer la variable de entorno para negar privados
  process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE = "0";
  
  console.log("INTEGRATIONS_PROXY_ALLOW_PRIVATE:", process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE);
  
  const url = "https://example.com";
  console.log("Testing URL:", url);
  
  try {
    const result = await validarEndpoint(url);
    console.log("validarEndpoint result:", result);
  } catch (error) {
    console.error("Error:", error);
  }
  
  // Restaurar
  delete process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE;
}

test();