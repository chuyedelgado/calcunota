"use client";

import { useActionState, useState } from "react";
import { eliminarCuenta, type EstadoPerfil } from "./actions";

const PALABRA = "ELIMINAR";

// Zona de peligro: elimina la cuenta y todos los datos. Dos pasos a propósito
// (revelar → escribir la palabra → confirmar) para que nunca sea un solo clic.
export default function EliminarCuentaForm() {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [estado, accion, pendiente] = useActionState<EstadoPerfil, FormData>(eliminarCuenta, {});

  return (
    <div className="rounded-2xl border border-rojo-fuerte/30 bg-rojo-suave/40 p-5">
      <h2 className="text-20-medium font-semibold !text-rojo-fuerte mb-1">Eliminar mi cuenta</h2>
      <p className="text-14-normal text-tinta mb-2">
        Al eliminar tu cuenta se borran para siempre tu perfil, tus cursos, sus secciones, tus notas y
        tu vínculo con Google. Esta acción <strong>no se puede deshacer</strong>.
      </p>
      <p className="text-14-normal !text-black-300 mb-4">
        Los nombres de profesores que agregaste quedan en el catálogo compartido de la app, sin
        ninguna relación contigo.
      </p>

      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="min-h-[44px] px-5 rounded-xl border border-rojo-fuerte/50 !text-rojo-fuerte font-semibold hover:bg-rojo-suave transition-colors"
        >
          Eliminar mi cuenta
        </button>
      ) : (
        <form action={accion} className="space-y-3">
          <label htmlFor="confirmacion" className="block text-14-normal text-tinta">
            Para confirmar, escribe <strong>{PALABRA}</strong> en el campo:
          </label>
          <input
            id="confirmacion"
            name="confirmacion"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder={PALABRA}
            className="w-full border border-rojo-fuerte/40 rounded-lg px-4 py-3 bg-white text-tinta focus:outline-none focus:ring-2 focus:ring-rojo-fuerte/40"
          />
          {estado?.error && (
            <p className="text-14-normal !text-rojo-fuerte font-semibold" role="alert">
              {estado.error}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="submit"
              disabled={pendiente || texto.trim() !== PALABRA}
              className="min-h-[44px] px-5 rounded-xl bg-rojo-fuerte !text-white font-semibold disabled:opacity-50 transition-colors"
            >
              {pendiente ? "Eliminando…" : "Eliminar definitivamente"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
                setTexto("");
              }}
              className="min-h-[44px] px-5 rounded-xl border border-hairline !text-tinta font-semibold"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
