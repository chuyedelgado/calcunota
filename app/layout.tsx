import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const workSans = localFont({
  src: [
    {
      path: './fonts/WorkSans-Black.ttf',
      weight: '900',
      style: 'normal'
    },{
      path: './fonts/WorkSans-ExtraBold.ttf',
      weight: '800',
      style: 'normal'
    },{
      path: './fonts/WorkSans-Bold.ttf',
      weight: '700',
      style: 'normal'
    },{
      path: './fonts/WorkSans-SemiBold.ttf',
      weight: '600',
      style: 'normal'
    },{
      path: './fonts/WorkSans-Medium.ttf',
      weight: '500',
      style: 'normal'
    },{
      path: './fonts/WorkSans-Regular.ttf',
      weight: '400',
      style: 'normal'
    },{
      path: './fonts/WorkSans-Thin.ttf',
      weight: '200',
      style: 'normal'
    },{
      path: './fonts/WorkSans-ExtraLight.ttf',
      weight: '100',
      style: 'normal'
    }
  ],
  variable: '--font-work-sans',
});

// El título es EXACTAMENTE el nombre de la app, sin lema ni sufijo: tiene que
// coincidir letra por letra con el de la pantalla de consentimiento de Google
// ("CalcuNota"). Cualquier variación de grafía o espaciado, o un título con
// coletilla añadida, es motivo de rechazo en la verificación de marca.
//
// La descripción dice literalmente qué es, para quién y qué hace: el revisor
// busca una descripción del propósito, no un titular publicitario.
export const metadata: Metadata = {
  title: "CalcuNota",
  description:
    "CalcuNota es una herramienta gratuita para estudiantes de la Universidad " +
    "Tecnológica de Panamá (UTP). Calcula tu índice académico, proyecta qué notas " +
    "necesitas para alcanzar tu objetivo y lleva el seguimiento de tu avance de carrera.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${workSans.variable} font-work-sans`}>
        {children}
      </body>
    </html>
  );
}
