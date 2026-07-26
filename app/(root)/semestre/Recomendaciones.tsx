import Link from "next/link";
import type { Categoria, Recomendacion, Severidad } from "@/lib/recomendaciones";

// Tono visual por categoría (item 3 del encargo):
//   riesgo / bloqueo → rojo o ámbar según severidad
//   meta / carrera   → acento (ciruela)
//   logro            → verde
//   oportunidad      → acento suave
//   patron / vacio   → neutro
type Tono = "rojo" | "ambar" | "verde" | "acento" | "acento-suave" | "neutro";

function tonoDe(categoria: Categoria, severidad: Severidad): Tono {
  switch (categoria) {
    case "riesgo":
    case "bloqueo":
      return severidad === "critica" || severidad === "alta" ? "rojo" : "ambar";
    case "meta":
    case "carrera":
      return "acento";
    case "logro":
      return "verde";
    case "oportunidad":
      return "acento-suave";
    case "patron":
    case "vacio":
      return "neutro";
  }
}

type EstiloTono = {
  barra: string; // color de la franja lateral
  bgFuerte: string; // fondo tintado para las críticas
  borde: string; // borde de la tarjeta crítica
  texto: string; // color del título/etiqueta fuerte
};

const ESTILO: Record<Tono, EstiloTono> = {
  rojo: { barra: "#B0463A", bgFuerte: "bg-rojo-suave", borde: "border-rojo-fuerte/40", texto: "!text-rojo-fuerte" },
  ambar: { barra: "#9A6413", bgFuerte: "bg-ambar-suave", borde: "border-ambar-fuerte/40", texto: "!text-ambar-fuerte" },
  verde: { barra: "#1F6B47", bgFuerte: "bg-verde-suave", borde: "border-verde-fuerte/40", texto: "!text-verde-fuerte" },
  acento: { barra: "#834D6B", bgFuerte: "bg-primary-100", borde: "border-primary/40", texto: "!text-primary-ink" },
  "acento-suave": { barra: "#B98AA6", bgFuerte: "bg-primary-100", borde: "border-primary/30", texto: "!text-primary-ink" },
  neutro: { barra: "#776E63", bgFuerte: "bg-black/[0.04]", borde: "border-hairline", texto: "!text-black-100" },
};

export default function Recomendaciones({ recomendaciones }: { recomendaciones: Recomendacion[] }) {
  // Item 6: array vacío → no se muestra la sección, sin placeholders.
  if (recomendaciones.length === 0) return null;

  return (
    <div className="max-w-3xl mx-auto mb-8">
      <p className="text-[11px] uppercase tracking-wide font-bold !text-black-300 mb-3 px-1">Recomendaciones</p>
      <ul className="space-y-3">
        {recomendaciones.map((r) => {
          const c = ESTILO[tonoDe(r.categoria, r.severidad)];
          const critica = r.severidad === "critica";
          return (
            <li
              key={r.id}
              className={`rounded-2xl border p-4 sm:p-5 shadow-suave ${
                critica ? `${c.bgFuerte} ${c.borde}` : "bg-white border-hairline"
              }`}
            >
              <div className="flex gap-3">
                {/* Las críticas destacan con fondo tintado; el resto con franja lateral (item 4) */}
                {!critica && (
                  <span className="w-1.5 rounded-full shrink-0" style={{ background: c.barra }} aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  {critica && (
                    <span className={`inline-block text-[11px] uppercase tracking-wide font-bold mb-1 ${c.texto}`}>
                      ⚠ Atención
                    </span>
                  )}
                  <p className={`text-16-medium font-semibold ${critica ? c.texto : "text-tinta"}`}>{r.titulo}</p>
                  <p className="text-16-medium !text-black-300 mt-1">{r.detalle}</p>

                  {(r.cursoId || r.accion) && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {/* Item 5: cursoId → calculadora de esa materia */}
                      {r.cursoId && (
                        <Link
                          href={`/semestre/${r.cursoId}`}
                          className="text-14-normal font-semibold !text-tinta bg-white border border-hairline rounded-xl px-3 py-2 shadow-suave hover:border-primary/40 transition-colors"
                        >
                          {r.materiaNombre ? `Abrir ${r.materiaNombre}` : "Abrir la calculadora"}
                        </Link>
                      )}
                      {/* Item 5: accion → botón con su texto y su ruta */}
                      {r.accion && (
                        <Link
                          href={r.accion.ruta}
                          className="text-14-normal font-semibold !text-white bg-primary rounded-xl px-3 py-2 shadow-suave hover:bg-primary-ink transition-colors"
                        >
                          {r.accion.texto}
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
