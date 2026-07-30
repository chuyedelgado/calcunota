// Presentación de planes de estudio en los selectores (onboarding, perfil e
// importación de historial). Un plan se reconoce por su versión, sus créditos y
// su número de materias. Dos planes de la misma carrera pueden compartir año
// ("2024" y "M-2024" son distintos): mostrar solo el año los vuelve
// indistinguibles y el estudiante puede cargar TODO su historial con los
// créditos del plan equivocado. Por eso la versión se muestra COMPLETA y se
// añade el semestre de entrada, que es lo que el estudiante sí recuerda.

export type PlanOpcion = {
  id: string;
  version: string;
  totalCreditos: number;
  materias: number;
  vigente: boolean;
};

// Etiqueta legible del plan. En el esquema de matrícula ("AAAA" o "M-AAAA") se
// muestra COMPLETA: la "M" distingue dos planes del mismo año y perderla es el
// bug que carga el historial con créditos ajenos. En versiones legacy se extrae
// el año y se marca el segundo semestre si la versión lo indica.
export function etiquetaVersionPlan(version: string): string {
  if (/^(M-)?\d{4}$/.test(version)) return `Plan ${version}`;
  const anio = version.match(/(?:19|20)\d{2}/)?.[0];
  if (!anio) return `Plan ${version}`;
  const segundo = new RegExp(`${anio}-2(?![0-9])`).test(version);
  return `Plan ${anio}${segundo ? "-2" : ""}`;
}

// Semestre de entrada al que corresponde el plan, derivado de la versión (no hay
// campo en base). Los PDFs dicen "VIGENTE A PARTIR DEL VERANO / I SEMESTRE AAAA":
//   "M-AAAA" = I Semestre · "AAAA" = Verano · "AAAA-1"/"AAAA-2" = I/II Semestre.
// null cuando la versión no permite derivarlo (slugs legacy). Es la columna que
// deja elegir bien cuando dos planes coinciden en año, créditos y materias.
export function vigenciaDePlan(version: string): string | null {
  const m = version.match(/^M-(\d{4})$/);
  if (m) return `I Semestre ${m[1]}`;
  if (/^\d{4}$/.test(version)) return `Verano ${version}`;
  const s = version.match(/^(\d{4})-([12])$/);
  if (s) return `${s[2] === "1" ? "I" : "II"} Semestre ${s[1]}`;
  return null;
}

// Orden del selector: el vigente primero, luego de más reciente a más antiguo.
export function ordenarPlanes<T extends { vigente: boolean; version: string }>(planes: T[]): T[] {
  return [...planes].sort((a, b) => {
    if (a.vigente !== b.vigente) return a.vigente ? -1 : 1;
    return b.version.localeCompare(a.version, "es", { numeric: true });
  });
}

// Texto de una opción para un <select> nativo: versión + semestre de entrada +
// créditos + materias (+ "Vigente"). Solo si otro plan de la misma carrera
// quedaría con etiqueta, vigencia y cifras idénticas se añade la versión cruda
// para poder distinguirlos (casos legacy sin vigencia derivable).
export function textoOpcionPlan(p: PlanOpcion, hermanos: PlanOpcion[]): string {
  const base = etiquetaVersionPlan(p.version);
  const vig = vigenciaDePlan(p.version);
  const desde = vig ? ` · vigente desde ${vig}` : "";
  const colisiona = hermanos.some(
    (o) =>
      o.id !== p.id &&
      etiquetaVersionPlan(o.version) === base &&
      vigenciaDePlan(o.version) === vig &&
      o.totalCreditos === p.totalCreditos &&
      o.materias === p.materias,
  );
  const cola = colisiona ? ` · ${p.version}` : "";
  const vigente = p.vigente ? " · Vigente" : "";
  return `${base}${desde} · ${p.totalCreditos} créditos · ${p.materias} materias${vigente}${cola}`;
}
