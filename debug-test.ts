import { corregirConGlosario, glosarioBase } from "./src/lib/aurora/stt-oss/glosario-oido";

const glosario = glosarioBase();

console.log("Probando 'star said sed'");
const resultado = corregirConGlosario("star said sed", glosario, "es");
console.log("Texto resultado:", JSON.stringify(resultado.texto));
console.log("Cambios:", resultado.cambios);

// También probemos solo "star"
console.log("\nProbando 'star'");
const resultado2 = corregirConGlosario("star", glosario, "es");
console.log("Texto resultado:", JSON.stringify(resultado2.texto));
console.log("Cambios:", resultado2.cambios);

// Y veamos qué dice nuestra lista de palabras comunes
const PALABRAS_COMUNES: any = {
  es: ["star", "said", "sed", "or", "la", "el", "los", "las", "un", "una", "y", "o", "pero", "si", "no", "el", "la", "los", "las"],
  en: ["star", "said", "sed", "or", "the", "a", "an", "and", "or", "but", "if", "not", "to", "of", "in", "on", "at", "for", "with", "by"],
};
console.log("\n¿Está 'star' en la lista de palabras comunes para es?", PALABRAS_COMUNES.es.includes("star"));
console.log("¿Está normalizado 'star' en la lista?", PALABRAS_COMUNES.es.includes("star".replace(/\s+/g, "").toLowerCase()));