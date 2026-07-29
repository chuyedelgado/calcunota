"use client";

import { useRef } from "react";
import { validarSecciones } from "@/lib/calculos";
import {
  borradorAEval,
  esGrupo,
  pesoEfectivo,
  plantillaLabBorrador,
  type BorradorSeccion,
  type BorradorSubseccion,
} from "./tipos";

const campo =
  "w-full bg-white border border-hairline rounded-xl px-3 py-2 text-tinta shadow-suave " +
  "focus:outline-none focus:ring-2 focus:ring-primary/40";

// Editor de esquema de evaluación con soporte de subsecciones (laboratorio).
// Opera sobre un árbol de BorradorSeccion y avisa cambios por onChange. Lo
// comparten /semestre/agregar y el editor de la calculadora.
export default function EditorSecciones({
  secciones,
  onChange,
  profesores = [],
}: {
  secciones: BorradorSeccion[];
  onChange: (next: BorradorSeccion[]) => void;
  profesores?: string[];
}) {
  const seq = useRef(0);
  const nuevoId = () => `n-${Date.now()}-${seq.current++}`;

  const validacion = validarSecciones(borradorAEval(secciones));
  const subInvalidas = new Set(validacion.subseccionesInvalidas.map((x) => x.nombre.trim()));

  function setSeccion(i: number, cambio: Partial<BorradorSeccion>) {
    onChange(secciones.map((s, idx) => (idx === i ? { ...s, ...cambio } : s)));
  }
  function quitarSeccion(i: number) {
    onChange(secciones.filter((_, idx) => idx !== i));
  }
  function agregarSeccion() {
    onChange([...secciones, { id: nuevoId(), nombre: "", porcentaje: 0, cantidad: 1 }]);
  }
  function activarGrupo(i: number, activar: boolean) {
    const s = secciones[i];
    if (activar) {
      // Convierte en grupo: dos subsecciones al 50/50 como punto de partida.
      setSeccion(i, {
        cantidad: 0,
        profesorNombre: s.profesorNombre ?? null,
        subsecciones: [
          { id: nuevoId(), nombre: "", porcentaje: 50, cantidad: 1 },
          { id: nuevoId(), nombre: "", porcentaje: 50, cantidad: 1 },
        ],
      });
    } else {
      setSeccion(i, { subsecciones: undefined, cantidad: 1 });
    }
  }
  function setSub(i: number, j: number, cambio: Partial<BorradorSubseccion>) {
    const subs = (secciones[i].subsecciones ?? []).map((x, idx) => (idx === j ? { ...x, ...cambio } : x));
    setSeccion(i, { subsecciones: subs });
  }
  function agregarSub(i: number) {
    const subs = [...(secciones[i].subsecciones ?? []), { id: nuevoId(), nombre: "", porcentaje: 0, cantidad: 1 }];
    setSeccion(i, { subsecciones: subs });
  }
  function quitarSub(i: number, j: number) {
    const subs = (secciones[i].subsecciones ?? []).filter((_, idx) => idx !== j);
    // Al bajar de 2 subsecciones deja de ser grupo.
    if (subs.length < 2) setSeccion(i, { subsecciones: undefined, cantidad: 1 });
    else setSeccion(i, { subsecciones: subs });
  }

  const usarPlantillaLab = () => onChange(plantillaLabBorrador(`p-${Date.now()}`));

  return (
    <div className="space-y-3">
      {secciones.map((s, i) => {
        const grupo = esGrupo(s);
        const subs = s.subsecciones ?? [];
        const sumaSub = subs.reduce((a, x) => a + x.porcentaje, 0);
        const grupoInvalido = grupo && subInvalidas.has(s.nombre.trim());
        return (
          <div key={s.id} className="bg-crema border border-hairline rounded-xl p-3 space-y-3">
            {/* Fila principal: nombre + % + quitar */}
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <span className="block text-[11px] !text-black-300 mb-1">Sección</span>
                <input
                  className={campo}
                  value={s.nombre}
                  placeholder="Nombre"
                  aria-label={`Nombre de la sección ${i + 1}`}
                  onChange={(e) => setSeccion(i, { nombre: e.target.value })}
                />
              </div>
              <div className="w-20 shrink-0">
                <span className="block text-[11px] !text-black-300 mb-1">% materia</span>
                <input
                  type="number"
                  className={`${campo} text-center tabular-nums`}
                  value={s.porcentaje}
                  min={0}
                  step={1}
                  aria-label={`Peso de ${s.nombre || `sección ${i + 1}`} sobre la materia`}
                  onChange={(e) => setSeccion(i, { porcentaje: Number(e.target.value) })}
                />
              </div>
              {secciones.length > 1 && (
                <button
                  type="button"
                  onClick={() => quitarSeccion(i)}
                  className="!text-rojo-fuerte font-bold px-1 pb-2 text-20-medium shrink-0"
                  aria-label={`Quitar ${s.nombre || `sección ${i + 1}`}`}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Toggle laboratorio */}
            <label className="flex items-center gap-2 text-14-normal text-tinta cursor-pointer">
              <input
                type="checkbox"
                checked={grupo}
                onChange={(e) => activarGrupo(i, e.target.checked)}
                className="accent-primary w-4 h-4"
              />
              Tiene subsecciones (ej. laboratorio, con su propio reparto)
            </label>

            {!grupo ? (
              <div className="flex items-center gap-3">
                <span className="text-14-normal !text-black-300 w-20 shrink-0"># notas</span>
                <input
                  type="number"
                  className={`${campo} w-20 text-center tabular-nums`}
                  value={s.cantidad}
                  min={1}
                  step={1}
                  aria-label={`Cantidad de notas en ${s.nombre || `sección ${i + 1}`}`}
                  onChange={(e) => setSeccion(i, { cantidad: Number(e.target.value) })}
                />
              </div>
            ) : (
              <div className="rounded-xl bg-white border border-hairline p-3 space-y-3">
                {/* Profesor del bloque */}
                <div>
                  <span className="block text-[11px] !text-black-300 mb-1">
                    Profesor del laboratorio <span className="font-normal">(opcional)</span>
                  </span>
                  <input
                    className={campo}
                    value={s.profesorNombre ?? ""}
                    placeholder="Distinto del de la materia"
                    list="lista-profesores-lab"
                    autoComplete="off"
                    onChange={(e) => setSeccion(i, { profesorNombre: e.target.value })}
                  />
                </div>

                {/* Aviso clave: suman 100 ENTRE ELLAS */}
                <p className="text-14-normal !text-primary-ink bg-primary-100 rounded-lg px-3 py-2">
                  Las subsecciones suman <strong>100% entre ellas</strong> (reparten el {s.porcentaje || 0}% de
                  esta sección, no hasta ese número).
                </p>

                <div className="space-y-2">
                  {subs.map((x, j) => (
                    <div key={x.id} className="space-y-1">
                      <div className="flex items-end gap-2">
                        <div className="flex-1 min-w-0">
                          <input
                            className={campo}
                            value={x.nombre}
                            placeholder={`Subsección ${j + 1}`}
                            aria-label={`Nombre de la subsección ${j + 1}`}
                            onChange={(e) => setSub(i, j, { nombre: e.target.value })}
                          />
                        </div>
                        <div className="w-16 shrink-0">
                          <input
                            type="number"
                            className={`${campo} text-center tabular-nums`}
                            value={x.porcentaje}
                            min={0}
                            step={1}
                            aria-label={`Peso relativo de ${x.nombre || `subsección ${j + 1}`}`}
                            onChange={(e) => setSub(i, j, { porcentaje: Number(e.target.value) })}
                          />
                        </div>
                        <div className="w-14 shrink-0">
                          <input
                            type="number"
                            className={`${campo} text-center tabular-nums`}
                            value={x.cantidad}
                            min={1}
                            step={1}
                            aria-label={`Notas de ${x.nombre || `subsección ${j + 1}`}`}
                            onChange={(e) => setSub(i, j, { cantidad: Number(e.target.value) })}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => quitarSub(i, j)}
                          className="!text-rojo-fuerte font-bold px-1 pb-2 shrink-0"
                          aria-label={`Quitar subsección ${j + 1}`}
                        >
                          ✕
                        </button>
                      </div>
                      {/* Peso efectivo: lo que ningún estudiante calcula solo */}
                      <p className="text-[11px] !text-black-300 tabular-nums">
                        = {(Math.round(pesoEfectivo(s.porcentaje, x.porcentaje) * 100) / 100).toString()}% de la nota final
                      </p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => agregarSub(i)}
                    className="text-14-normal !text-primary-ink font-semibold underline"
                  >
                    + Agregar subsección
                  </button>
                  <span
                    className={`text-14-normal font-semibold tabular-nums ${
                      grupoInvalido ? "!text-rojo-fuerte" : "!text-verde-fuerte"
                    }`}
                  >
                    {grupoInvalido ? `suman ${sumaSub}%` : "suman 100% ✓"}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={agregarSeccion}
          className="text-16-medium !text-primary-ink font-semibold underline"
        >
          + Agregar sección
        </button>
        <button
          type="button"
          onClick={usarPlantillaLab}
          className="text-14-normal !text-primary-ink font-semibold bg-primary-100 rounded-lg px-3 py-1.5"
        >
          Usar plantilla “Materia con laboratorio”
        </button>
      </div>

      {/* Feedback global de la suma principal */}
      <p
        className={`text-16-medium font-semibold ${
          validacion.valido ? "!text-verde-fuerte" : "!text-rojo-fuerte"
        }`}
      >
        {validacion.valido
          ? "Suman 100% ✓"
          : validacion.subseccionesInvalidas.length > 0 && Math.abs(validacion.diferencia) < 0.01
            ? `Revisa las subsecciones de “${validacion.subseccionesInvalidas[0].nombre}”: suman ${validacion.subseccionesInvalidas[0].suma}%, deben sumar 100`
            : validacion.diferencia > 0
              ? `Suman ${validacion.suma}% · faltan ${validacion.diferencia}%`
              : `Suman ${validacion.suma}% · sobran ${Math.abs(validacion.diferencia)}%`}
      </p>

      <datalist id="lista-profesores-lab">
        {profesores.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </div>
  );
}
