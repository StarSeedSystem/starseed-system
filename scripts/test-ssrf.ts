/**
 * test-ssrf.ts — pruebas de la guarda anti-SSRF compartida (`src/lib/security/ssrf`).
 * Cubre la CLASIFICACIÓN de IP (el núcleo de la defensa y donde estuvo el bypass
 * de IPv6 mapeado). No prueba DNS/red (isBlocked/safeFetch), que dependen de
 * getaddrinfo; sí prueba las funciones puras deterministas.
 *
 * Ejecutar:  npx tsx scripts/test-ssrf.ts
 */
import {
  classifyIpv4,
  classifyIpv6,
  classifyIp,
  expandIpv6,
  type IpClass,
} from "../src/lib/security/ssrf";

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  XX  ${name}  → got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}
const v4 = (ip: string, want: IpClass) => eq(`v4 ${ip} = ${want}`, classifyIpv4(ip), want);
const v6 = (ip: string, want: IpClass) => eq(`v6 ${ip} = ${want}`, classifyIpv6(ip), want);

console.log("=== IPv4: metadatos SIEMPRE bloqueados ===");
v4("169.254.169.254", "always-blocked"); // AWS/GCP/Azure IMDS
v4("169.254.0.1", "always-blocked");      // 169.254/16 link-local
v4("100.100.100.200", "always-blocked");  // Alibaba/ECS IMDS
v4("192.0.0.192", "always-blocked");      // Oracle IMDS (IANA 192.0.0.0/24)
v4("192.0.0.1", "always-blocked");        // resto de 192.0.0.0/24

console.log("=== IPv4: privados/reservados (gated por allowPrivate) ===");
v4("127.0.0.1", "private");
v4("10.0.0.1", "private");
v4("172.16.0.1", "private");
v4("172.31.255.255", "private");
v4("192.168.1.1", "private");
v4("100.64.0.1", "private");   // CGNAT 100.64/10
v4("0.0.0.0", "private");
v4("224.0.0.1", "private");    // multicast
v4("240.0.0.1", "private");    // reservado

console.log("=== IPv4: públicos y límites de rango ===");
v4("8.8.8.8", "public");
v4("1.1.1.1", "public");
v4("172.15.0.1", "public");    // justo por debajo de 172.16/12
v4("172.32.0.1", "public");    // justo por encima
v4("100.63.255.255", "public"); // justo por debajo de CGNAT
v4("100.128.0.1", "public");    // justo por encima de CGNAT

console.log("=== IPv4: inválidos → fail-closed ===");
v4("256.1.1.1", "always-blocked");
v4("1.2.3", "always-blocked");
v4("1.2.3.4.5", "always-blocked");

console.log("=== expandIpv6 ===");
eq("expand ::1", expandIpv6("::1"), [0,0,0,0,0,0,0,1]);
eq("expand ::", expandIpv6("::"), [0,0,0,0,0,0,0,0]);
eq("expand ::ffff:169.254.169.254", expandIpv6("::ffff:169.254.169.254"), [0,0,0,0,0,0xffff,0xa9fe,0xa9fe]);
eq("expand 1:2:3:4:5:6:7:8", expandIpv6("1:2:3:4:5:6:7:8"), [1,2,3,4,5,6,7,8]);
eq("expand fd00:ec2::254", expandIpv6("fd00:ec2::254"), [0xfd00,0x0ec2,0,0,0,0,0,0x254]);
eq("expand doble :: inválido", expandIpv6("1::2::3"), null);
eq("expand hex inválido", expandIpv6("gggg::"), null);
eq("expand demasiados grupos", expandIpv6("1:2:3:4:5:6:7:8:9"), null);

console.log("=== IPv6: el bypass corregido (mapeado a IMDS) ===");
v6("[::ffff:169.254.169.254]", "always-blocked"); // EL bug de la Adenda 130
v6("::ffff:169.254.169.254", "always-blocked");
v6("::ffff:a9fe:a9fe", "always-blocked");          // misma IP en forma hex normalizada
v6("::ffff:10.0.0.1", "private");                  // mapeado privado
v6("::ffff:8.8.8.8", "public");                    // mapeado público

console.log("=== IPv6: nativos ===");
v6("::1", "private");                 // loopback
v6("::", "private");                  // unspecified
v6("fe80::1", "always-blocked");      // link-local /10
v6("febf::1", "always-blocked");      // límite superior de fe80::/10
v6("fd00:ec2::254", "always-blocked"); // AWS IMDSv6
v6("fc00::1", "private");             // ULA fc00::/7
v6("fd12:3456::1", "private");        // ULA (fd..)
v6("2001:4860:4860::8888", "public"); // Google DNS v6
v6("basura-no-ip", "always-blocked"); // no parseable → fail-closed

console.log("=== IPv6: IPv4 embebida NAT64 / 6to4 (revisión adversarial A131) ===");
v6("64:ff9b::a9fe:a9fe", "always-blocked"); // NAT64 de 169.254.169.254 (IMDS)
v6("64:ff9b::7f00:1", "private");           // NAT64 de 127.0.0.1
v6("64:ff9b::808:808", "public");           // NAT64 de 8.8.8.8
v6("2002:a9fe:a9fe::", "always-blocked");   // 6to4 de 169.254.169.254 (IMDS)
v6("2002:7f00:1::", "private");             // 6to4 de 127.0.0.1
v6("2002:808:808::", "public");             // 6to4 de 8.8.8.8

console.log("=== expandIpv6: dotted-quad mal formado → null (no truncar) ===");
eq("expand ::ffff:1.2.3.4.5", expandIpv6("::ffff:1.2.3.4.5"), null);
eq("expand 12345:: (5 hex)", expandIpv6("12345::"), null);

console.log("=== classifyIp (dispatcher v4/v6) ===");
eq("dispatch 169.254.169.254", classifyIp("169.254.169.254"), "always-blocked");
eq("dispatch ::ffff:169.254.169.254", classifyIp("::ffff:169.254.169.254"), "always-blocked");
eq("dispatch 8.8.8.8", classifyIp("8.8.8.8"), "public");
eq("dispatch no-ip", classifyIp("no-soy-una-ip"), "always-blocked");

console.log(`\n${pass} pasan / ${fail} fallan`);
if (fail > 0) process.exit(1);
