import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <>

      <section className="blue_container">
        <h1 className="heading">¿Tienes posibilidad de pasar la materia?</h1>
        <p className="sub-heading !max-w-3xl">«Comienza haciendo lo que es necesario, luego lo que es posible, y de repente estarás haciendo lo imposible.»</p>
        <p className="text-14-normal !max-w-3xl">- San Francisco de Asís -</p>
        <div className="pt-5">
          <Button className="calcular_btn">
            <Link href={'/calculadora/${_id}'}>
              Calcular
            </Link>
          </Button>
        </div>
      </section>

      <section className="section_container">
        <div className="flex flex-col md:flex-row items-center justify-center gap-10">
          {/* Columna de texto */}
          <div className="md:w-1/2 text-center md:text-left">
            <h1 className="text-35-semibold !text-white bg-blue-800 text-center shadow-xl">¿Qué es CalcuNota?</h1>
            <p className="text-20-medium py-8  !text-gray-800 ">
              CalcuNota es una aplicación Web que ayuda a los estudiantes a saber con exactitud 
              qué tantas posibilidades tienen de pasar las materias que están cursando.
            </p>
          </div>

          {/* Columna de imagen */}
          <div className="md:w-1/2 flex justify-center">
            <Link href="/">
              <Image src="/exam100.png" alt="estudiantes graduandos"  className="foto-con-sombra" width={300} height={300} />
            </Link>
          </div>
        </div>
      </section>

      <section className="section_container !pt-0">
      {/* Título de la sección */}
      <div className="px-8 pb-7">
        <h2 className="heading !bg-blue-800 py-10 shadow-xl mx-auto">
          Calcula en 3 simples pasos
        </h2>
      </div>

      {/* Contenedor de los pasos */}
      <div className="space-y-6 mx-auto px-16">
        {/* Paso 1 */}
        <div className="recuadro_paso">
          {/* Número del paso en círculo */}
          <div className="flex-shrink-0">
            <p className="recuadro_numero_paso">
              1
            </p>
          </div>
          {/* Descripción del paso */}
          <div className="sm:ml-4 ml-1">
            <p className="text-24-black">
              Haz clic en el botón de Calcular.
            </p>
          </div>
        </div>

        {/* Paso 2 */}
        <div className="recuadro_paso">
          <div className="flex-shrink-0">
            <p className="recuadro_numero_paso">
              2
            </p>
          </div>
          <div className="sm:ml-4 ml-1">
            <p className="text-24-black">
              Ingresa los datos solicitados.
            </p>
          </div>
        </div>

        {/* Paso 3 */}
        <div className="recuadro_paso">
          <div className="flex-shrink-0">
            <div className="recuadro_numero_paso">
              3
            </div>
          </div>
          <div className="sm:ml-4 ml-1">
            <p className="text-24-black">
              Y listo! revisa tus resultados.
            </p>
          </div>
        </div>
      </div>
      <div className="text-center pt-8 mx-auto justify-center items-center">
          <Button className="calcular_btn">
            <Link href={'/calculadora'}>
              Calcular
            </Link>
          </Button>
        </div>
    </section>
    </>
  );
}
