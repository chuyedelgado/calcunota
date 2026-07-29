"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Explicacion } from "./explicaciones";

// Un solo popover abierto a la vez entre TODAS las instancias: abrir uno cierra
// el anterior. Evita que dos explicaciones se solapen.
let cerrarAbierto: (() => void) | null = null;

// Botón "?" discreto que abre la explicación de una cifra del resumen.
//
// Móvil primero: no es un tooltip de solo hover (en un teléfono no hay cursor).
// Es un popover que se abre al TOCAR o al hacer hover, se cierra al tocar fuera
// o con Escape, y es accesible por teclado (el "?" es un <button> real con
// aria-label, no un span). El panel se clava dentro del viewport para no salirse
// por los lados a 375 px, y se abre hacia el lado que no tapa el dato que explica.
export default function Ayuda({
  explicacion,
  preferir = "arriba",
}: {
  explicacion: Explicacion;
  // "arriba" protege el dato que suele ir DEBAJO de la etiqueta (tarjetas de
  // métrica); "abajo" para leyendas donde el dato queda arriba.
  preferir?: "arriba" | "abajo";
}) {
  const { titulo, texto } = explicacion;
  const [abierto, setAbierto] = useState(false);
  const [arriba, setArriba] = useState(preferir === "arriba");
  const [estilo, setEstilo] = useState<CSSProperties>({});
  const wrapRef = useRef<HTMLSpanElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  function cerrar() {
    setAbierto(false);
    if (cerrarAbierto === cerrar) cerrarAbierto = null;
  }
  function abrir() {
    if (cerrarAbierto && cerrarAbierto !== cerrar) cerrarAbierto();
    cerrarAbierto = cerrar;
    setAbierto(true);
  }

  // Acota el ancho a la pantalla y calcula un desplazamiento horizontal que
  // mantenga el panel dentro del viewport, venga el "?" del borde que venga.
  useLayoutEffect(() => {
    if (!abierto || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const ancho = Math.min(288, vw - 16);
    const centro = r.left + r.width / 2;
    const izqViewport = Math.max(8, Math.min(centro - ancho / 2, vw - 8 - ancho));
    setEstilo({ width: ancho, left: izqViewport - r.left });
    // Respeta la preferencia vertical salvo que no quepa de ese lado.
    if (preferir === "arriba") setArriba(r.top > 168);
    else setArriba(window.innerHeight - r.bottom < 168);
  }, [abierto, preferir]);

  // Cierra al tocar fuera o con Escape (devolviendo el foco al botón).
  useEffect(() => {
    if (!abierto) return;
    function fuera(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) cerrar();
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        cerrar();
        botonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", tecla);
    };
    // cerrar es estable en la práctica; el efecto se re-suscribe con `abierto`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex align-middle"
      onPointerEnter={(e) => {
        // Solo hover real de mouse. En táctil, el "enter" sintético dispararía
        // justo antes del click y el tap se cancelaría a sí mismo.
        if (e.pointerType === "mouse") abrir();
      }}
    >
      <button
        ref={botonRef}
        type="button"
        aria-label={`Qué significa ${titulo}`}
        aria-expanded={abierto}
        aria-controls={abierto ? panelId : undefined}
        onClick={() => (abierto ? cerrar() : abrir())}
        className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-black/25 !text-black-300 text-[11px] font-bold leading-none hover:border-primary hover:!text-primary-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        ?
      </button>
      {abierto && (
        <span
          id={panelId}
          role="tooltip"
          style={estilo}
          className={`absolute z-50 rounded-xl border border-hairline bg-white p-3 text-left normal-case tracking-normal shadow-[0_12px_30px_-14px_rgba(42,36,31,0.35)] ${
            arriba ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <span className="block text-14-normal font-bold !text-tinta mb-1">{titulo}</span>
          <span className="block text-14-normal !text-black-300 leading-snug">{texto}</span>
        </span>
      )}
    </span>
  );
}
