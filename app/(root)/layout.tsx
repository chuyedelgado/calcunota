import Navbar from "@/components/Navbar";

export default function RootLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return (
      <html lang="es">
        <body className="font-work-sans">
          <Navbar />
          {children}
        </body>
      </html>
    );
  }
