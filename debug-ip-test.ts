import { validarEndpoint } from "./src/lib/astraura-bots/adaptadores/invitado-servidor";

async function test() {
  const testCases = [
    { url: "https://8.8.8.8", expected: true, desc: "Google DNS IP" },
    { url: "https://1.1.1.1", expected: true, desc: "Cloudflare DNS IP" },
    { url: "https://127.0.0.1:8080", expected: false, desc: "Loopback IP" },
    { url: "https://192.168.1.1", expected: false, desc: "Private IP" },
    { url: "https://10.0.0.1", expected: false, desc: "Private IP" },
    { url: "https://172.16.0.1", expected: false, desc: "Private IP" },
    { url: "https://169.254.169.254", expected: false, desc: "Metadata IP" },
  ];
  
  for.await (const { url, expected, desc } of testCases) {
    const result = await validarEndpoint(url);
    console.log(`${desc} (${url}): expected=${expected}, actual=${result}, ${result === expected ? '✓' : '✗'}`);
  }
}

test();