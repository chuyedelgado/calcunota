// Placeholder: aquí irá el perfil del estudiante (onboarding: universidad →
// facultad → carrera → plan → año de ingreso, que crea PerfilEstudiante).
// El enlace del Navbar apunta aquí con el id de session.user.id.
export default async function Perfil({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <section className="section_container">
      <h1 className="text-30-bold">Perfil</h1>
      <p className="text-20-medium pt-4">Usuario {id}. En construcción.</p>
    </section>
  );
}
