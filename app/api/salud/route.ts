// Comprobación de salud para App Platform.
//
// DELIBERADAMENTE NO TOCA LA BASE. Si consultara Postgres, un hipo de la base
// haría que la plataforma diera la instancia por muerta y la reiniciara, con lo
// que un problema pasajero de la base se convertiría en un reinicio en bucle de
// la app entera. Aquí solo se responde "el proceso está vivo y sirviendo".
//
// No requiere sesión: es la plataforma quien la llama, sin cookies.

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { estado: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
