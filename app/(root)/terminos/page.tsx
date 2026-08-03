import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos de uso · CalcuNota",
  description: "Las condiciones para usar CalcuNota, en lenguaje claro.",
};

export default function TerminosPage() {
  return (
    <section className="section_container max-w-2xl">
      <h1 className="text-30-bold text-tinta mb-1">Términos de uso</h1>
      <p className="text-14-normal !text-black-300 mb-8">Última actualización: 3 de agosto de 2026</p>

      <div className="space-y-8">
        <p className="text-16-medium text-tinta leading-relaxed">
          CalcuNota es una herramienta gratuita para estudiantes de la UTP. Al usarla, aceptas estos
          términos. Son cortos y en español claro a propósito.
        </p>

        <div>
          <h2 className="text-20-medium font-semibold text-tinta mb-2">Qué es y qué no es</h2>
          <p className="text-16-medium text-tinta leading-relaxed">
            Es una herramienta de apoyo para llevar tus notas y proyectar tu índice. Seguimos las
            reglas de calificación de la UTP lo más fielmente posible, pero{" "}
            <strong>la fuente oficial de tu expediente es la universidad</strong>. Usa CalcuNota para
            planear; confirma siempre con tu historial oficial antes de tomar una decisión importante.
          </p>
        </div>

        <div>
          <h2 className="text-20-medium font-semibold text-tinta mb-2">Tu cuenta y tus datos</h2>
          <p className="text-16-medium text-tinta leading-relaxed">
            Entras con tu cuenta de Google. Los datos que cargas (materias, notas, profesores) son
            tuyos y bajo tu responsabilidad: entre más cuidadoso seas al ingresarlos, más útiles serán
            los cálculos. Puedes{" "}
            <Link href="/perfil" className="font-semibold !text-primary-ink underline underline-offset-2">
              eliminar tu cuenta
            </Link>{" "}
            y todos tus datos cuando quieras. Cómo tratamos tu información está en la{" "}
            <Link href="/privacidad" className="font-semibold !text-primary-ink underline underline-offset-2">
              Política de privacidad
            </Link>
            .
          </p>
        </div>

        <div>
          <h2 className="text-20-medium font-semibold text-tinta mb-2">Sin garantías absolutas</h2>
          <p className="text-16-medium text-tinta leading-relaxed">
            Ponemos cuidado en que los cálculos sean correctos, pero CalcuNota se ofrece “tal cual”, y
            puede tener errores o interrupciones. No nos hacemos responsables de decisiones tomadas
            solo con base en la app: la última palabra la tiene tu expediente oficial de la UTP.
          </p>
        </div>

        <div>
          <h2 className="text-20-medium font-semibold text-tinta mb-2">Uso justo</h2>
          <p className="text-16-medium text-tinta leading-relaxed">
            Usa la app para lo que es: llevar tu propio expediente. No intentes dañar el servicio,
            acceder a datos de otros ni usarla para fines distintos.
          </p>
        </div>

        <div>
          <h2 className="text-20-medium font-semibold text-tinta mb-2">Cambios</h2>
          <p className="text-16-medium text-tinta leading-relaxed">
            Si cambiamos estos términos, actualizaremos la fecha de arriba. Si el cambio es
            importante, te avisaremos dentro de la app.
          </p>
        </div>

        <div>
          <h2 className="text-20-medium font-semibold text-tinta mb-2">Contacto</h2>
          <p className="text-16-medium text-tinta leading-relaxed">
            ¿Un problema o una duda? Escríbenos a{" "}
            <a
              href="mailto:chuye5610@gmail.com"
              className="font-semibold !text-primary-ink underline underline-offset-2"
            >
              chuye5610@gmail.com
            </a>
            . Leemos todo.
          </p>
        </div>
      </div>

      <div className="mt-10 pt-6 border-t border-hairline">
        <Link href="/privacidad" className="text-14-normal font-semibold !text-primary-ink underline underline-offset-2">
          Ver la Política de privacidad →
        </Link>
      </div>
    </section>
  );
}
