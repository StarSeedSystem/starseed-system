import type { IdiomaMundial } from "./types";

// Normalize a string: NFD, remove diacritics, lower, remove spaces
function normalize(str: string): string {
  const withoutDiacritics = str.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return withoutDiacritics.replace(/\s+/g, "").toLowerCase();
}

// Edit distance up to 1
function isEditDistanceAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0,
    j = 0,
    edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++; j++;
    } else {
      edits++;
      if (edits > 1) return false;
      if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
    }
  }
  if (i < a.length || j < b.length) edits++;
  return edits <= 1;
}

function matchesField(field: string | undefined, consulta: string, pref: boolean, exact: boolean): boolean {
  if (!field) return false;
  const normField = normalize(field);
  const normQuery = normalize(consulta);
  if (exact) return normField === normQuery;
  if (pref) return normField.startsWith(normQuery);
  return normField.includes(normQuery);
}

export function buscarIdiomas(list: IdiomaMundial[], consulta: string): IdiomaMundial[] {
  if (!consulta) return list;
  const normQuery = normalize(consulta);
  type Candidate = { idioma: IdiomaMundial; rank: number };
  const candidates: Candidate[] = [];
  for (const id of list) {
    let rank = 0;
    // code exact
    if (normalize(id.codigo) === normQuery) rank = 1;
    else if (normalize(id.codigo).startsWith(normQuery)) rank = 2;
    else if (matchesField(id.nombrePropio, consulta, true, false)) rank = 3;
    else if (matchesField(id.nombreActual, consulta, true, false)) rank = 3;
    else if (matchesField(id.nombrePropio, consulta, false, false)) rank = 4;
    else if (matchesField(id.nombreActual, consulta, false, false)) rank = 4;
    else if (id.alias && id.alias.some(a => normalize(a).includes(normQuery))) rank = 4;
    else if (consulta.length >= 4 && (isEditDistanceAtMostOne(normalize(id.nombrePropio || ""), normQuery) || isEditDistanceAtMostOne(normalize(id.nombreActual || ""), normQuery))) rank = 5;
    if (rank) candidates.push({ idioma: id, rank });
  }
  candidates.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.idioma.codigo.localeCompare(b.idioma.codigo);
  });
  return candidates.map(c => c.idioma);
}

export type { IdiomaMundial };
