import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de privacidad · CalcuNota",
  description: "Qué datos guarda CalcuNota, para qué, y cómo eliminarlos.",
};

export default function PrivacidadPage() {
  return (
    <section className="section_container max-w-2xl">
      <h1 className="text-30-bold text-tinta mb-1">Política de privacidad</h1>
      <p className="text-14-normal !text-black-300 mb-8">Última actualización: 3 de agosto de 2026</p>

      <div className="space-y-8">
        <p className="text-16-medium text-tinta leading-relaxed">
          CalcuNota es un proyecto operado por <strong>Jesús Delgado</strong>, estudiante de la
          Universidad Tecnológica de Panamá. Para cualquier consulta sobre tus datos:{" "}
          <a
            href="mailto:car1234da@gmail.com"
            className="font-semibold !text-primary-ink underline underline-offset-2"
          >
            car1234da@gmail.com
          </a>
          .
        </p>
        <p className="text-16-medium text-tinta leading-relaxed">
          CalcuNota es una herramienta para estudiantes de la UTP que calcula tu índice y te dice qué
          notas necesitas. Para eso guardamos algunos datos tuyos. Aquí te decimos exactamente
          cuáles, para qué, y cómo borrarlos. Sin letra chica.
        </p>

        <div>
          <h2 className="text-20-medium font-semibold text-tinta mb-2">Qué datos guardamos</h2>
          <ul className="space-y-2 text-16-medium text-tinta leading-relaxed list-disc pl-5">
            <li>
              <strong>Tu correo y tu nombre</strong>, de tu cuenta de Google, para identificar tu
              perfil. No pedimos contraseña: entras con Google.
            </li>
            <li>
              <strong>Tu perfil académico</strong>: universidad, facultad, carrera, plan de estudio y
              año de ingreso.
            </li>
            <li>
              <strong>Tu expediente</strong>: las materias que cargas o importas, sus notas, los
              periodos y los profesores que anotes.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-20-medium font-semibold text-tinta mb-2">Para qué los usamos</h2>
          <p className="text-16-medium text-tinta leading-relaxed">
            Solo para lo que ves en la app: calcular tu índice acumulado, proyectar qué necesitas para
            tu objetivo y darte recomendaciones sobre tus propias materias. Nada más. No te mandamos
            publicidad ni correos que no pediste.
          </p>
        </div>

        <div>
          <h2 className="text-20-medium font-semibold text-tinta mb-2">Con quién los compartimos</h2>
          <p className="text-16-medium text-tinta leading-relaxed">
            Con nadie. <strong>No compartimos tus datos con terceros y no los vendemos</strong>, nunca.
            Se guardan en nuestra base de datos (alojada en Neon) y en el servicio de autenticación de
            Google, que confirma que la cuenta es tuya. Neon y Google son proveedores de
            infraestructura; sus servidores están fuera de Panamá.
          </p>
        </div>

        <div>
          <h2 className="text-20-medium font-semibold text-tinta mb-2">Cuánto los conservamos</h2>
          <p className="text-16-medium text-tinta leading-relaxed">
            Mientras tengas tu cuenta. Cuando la eliminas, tu perfil y tu expediente se borran de
            inmediato de nuestra base de datos. Los respaldos automáticos de seguridad pueden conservar
            una copia unos días más antes de rotarse; no se consultan salvo para recuperar el servicio
            ante una falla.
          </p>
          <p className="text-16-medium text-tinta leading-relaxed mt-3">
            Los nombres de profesores que hayas agregado quedan en el catálogo compartido de la app,
            sin ninguna relación contigo.
          </p>
        </div>

        <div>
          <h2 className="text-20-medium font-semibold text-tinta mb-2">Cómo eliminas tus datos</h2>
          <p className="text-16-medium text-tinta leading-relaxed">
            Tú mandas. Desde{" "}
            <Link href="/perfil" className="font-semibold !text-primary-ink underline underline-offset-2">
              tu perfil
            </Link>{" "}
            puedes eliminar tu cuenta cuando quieras. Al eliminarla se borran tu perfil, tu expediente
            completo, tus notas y tu vínculo con Google. No hay que pedírnoslo ni esperar.
          </p>
        </div>

        <div>
          <h2 className="text-20-medium font-semibold text-tinta mb-2">Estadísticas anónimas (a futuro)</h2>
          <p className="text-16-medium text-tinta leading-relaxed">
            Más adelante queremos mostrar estadísticas útiles —por ejemplo, cómo suele ir una materia
            con cierto profesor— usando datos <strong>agregados y anonimizados</strong>: números
            juntando a muchos estudiantes, sin tu nombre, tu correo ni nada que te identifique. Nunca
            se mostrará tu expediente individual. Te lo decimos desde ahora para que quede claro.
          </p>
        </div>

        <div>
          <h2 className="text-20-medium font-semibold text-tinta mb-2">Contacto</h2>
          <p className="text-16-medium text-tinta leading-relaxed">
            Para eliminar tus datos no necesitas escribirnos: lo haces tú mismo desde{" "}
            <Link href="/perfil" className="font-semibold !text-primary-ink underline underline-offset-2">
              tu perfil
            </Link>
            . Para cualquier otra duda sobre tu información, escríbenos a{" "}
            <a
              href="mailto:car1234da@gmail.com"
              className="font-semibold !text-primary-ink underline underline-offset-2"
            >
              car1234da@gmail.com
            </a>
            .
          </p>
        </div>
      </div>

      <div className="mt-10 pt-6 border-t border-hairline">
        <Link href="/terminos" className="text-14-normal font-semibold !text-primary-ink underline underline-offset-2">
          Ver los Términos de uso →
        </Link>
      </div>
    </section>
  );
}
