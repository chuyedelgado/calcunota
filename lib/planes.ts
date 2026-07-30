// Presentación de planes de estudio en los selectores (onboarding y perfil).
// Un plan se reconoce por sus créditos y su número de materias; la versión cruda
// ("2024-t12024") es ilegible, así que se muestra un año limpio y, solo cuando
// hace falta para desempatar, la versión cruda.

export type PlanOpcion = {
  id: string;
  version: string;
  totalCreditos: number;
  materias: number;
  vigente: boolean;
};

// "2024" -> "Plan 2024". Extrae el primer año de 4 dígitos; si la versión marca
// explícitamente el segundo semestre ("AAAA-2"), lo indica. Sin año, cae a la
// versión cruda.
export function etiquetaVersionPlan(version: string): string {
  const anio = version.match(/(?:19|20)\d{2}/)?.[0];
  if (!anio) return `Plan ${version}`;
  const segundo = new RegExp(`${anio}-2(?![0-9])`).test(version);
  return `Plan ${anio}${segundo ? "-2" : ""}`;
}

// Orden del selector: el vigente primero, luego de más reciente a más antiguo.
export function ordenarPlanes<T extends { vigente: boolean; version: string }>(planes: T[]): T[] {
  return [...planes].sort((a, b) => {
    if (a.vigente !== b.vigente) return a.vigente ? -1 : 1;
    return b.version.localeCompare(a.version, "es", { numeric: true });
  });
}

// Texto de una opción para un <select> nativo: año legible + créditos + materias
// (+ "Vigente"). Si otro plan de la misma carrera quedaría con etiqueta y cifras
// idénticas, añade la versión cruda para poder distinguirlos.
export function textoOpcionPlan(p: PlanOpcion, hermanos: PlanOpcion[]): string {
  const base = etiquetaVersionPlan(p.version);
  const colisiona = hermanos.some(
    (o) =>
      o.id !== p.id &&
      etiquetaVersionPlan(o.version) === base &&
      o.totalCreditos === p.totalCreditos &&
      o.materias === p.materias,
  );
  const cola = colisiona ? ` · ${p.version}` : "";
  const vig = p.vigente ? " · Vigente" : "";
  return `${base} · ${p.totalCreditos} créditos · ${p.materias} materias${vig}${cola}`;
}
