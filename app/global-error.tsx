"use client";

// Último recurso: atrapa un fallo en el propio layout raíz, donde error.tsx ya no
// alcanza. Reemplaza todo el documento, así que trae su <html>/<body> y usa
// estilos en línea (no hay CSS del layout aquí). Es la red que evita la pantalla
// en blanco; los errores normales de las páginas los cubre app/(root)/error.tsx.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#F4F1EB",
          color: "#2A241F",
          padding: "1.25rem",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "26rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0 }}>Algo salió mal</h1>
          <p style={{ fontSize: "1rem", color: "#6b625a", marginTop: "0.5rem" }}>
            Tuvimos un problema al cargar la aplicación. Vuelve a intentarlo en un momento.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              minHeight: 44,
              padding: "0 1.5rem",
              borderRadius: 12,
              border: "none",
              background: "#834D6B",
              color: "#ffffff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
