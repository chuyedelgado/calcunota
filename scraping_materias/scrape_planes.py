#!/usr/bin/env python3
"""
CalcuNota — extractor de planes de estudio de la UTP.

Lee los PDFs de planes_de_estudio/ y produce un JSON estructurado listo
para ser consumido por el seed de Prisma.

Uso:
    python3 scrape_planes.py --entrada planes_de_estudio --salida planes.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

import pdfplumber

# --------------------------------------------------------------------
# Patrones
# --------------------------------------------------------------------

# 1 7987 CÁLCULO I 5 0 5
# 4 0589 ** GLOBALIZACIÓN DEL SOFTWARE 3 2$$ 4 0104
# 18 8011 ECOLOGÍA GENERAL 3 0 3 CURSAR SEGUNDO AÑO 7985
LINEA_MATERIA = re.compile(
    r"^\s*(\d{1,3})\s+"          # 1: número de orden en el plan
    r"(\d{4})\s+"                # 2: código de la asignatura
    r"(\*\*\s+)?"                # 3: marca de materia fundamental
    r"(?:(OP|EE)\s+)?"           # 4: optativa / electiva
    r"(.+?)\s+"                  # 5: nombre (perezoso)
    r"(\d+)\s+"                  # 6: horas de clase (puede ser el total del
                                 #    curso: el técnico de aeronaves llega a 400)
    r"(\d+)\s*(\$\$)?\s+"        # 7/8: horas de laboratorio (+ pago).
                                 #    El portal de matrícula separa el $$
                                 #    con espacio; las facultades lo pegan.
    r"(\d{1,2})"                 # 9: créditos — acotado a 2 dígitos a propósito.
                                 #    El máximo real en la UTP es 8. Sin este
                                 #    límite, un código de asignatura de 4 dígitos
                                 #    puede colarse como créditos y corromper el
                                 #    plan en silencio. Con el límite, la línea
                                 #    simplemente no casa y sale en el reporte.
    r"(?:\s+(.*))?$",            # 10: requisitos
    re.UNICODE,
)

# I AÑO PRIMER SEMESTRE / II AÑO VERANO
ENCABEZADO_ANIO = re.compile(
    r"^\s*(I{1,3}|IV|V|VI|VII|VIII)\s+A[ÑN]O\s+"
    r"(PRIMER\s+SEMESTRE|SEGUNDO\s+SEMESTRE|VERANO)\s*$",
    re.UNICODE,
)

# I AÑO SEMESTRE III  /  II AÑO VERANO II
# El romano final es el número de semestre corrido de toda la carrera.
ENCABEZADO_ANIO_CORRIDO = re.compile(
    r"^\s*(I{1,3}|IV|V|VI|VII|VIII)\s+A[ÑN]O\s+"
    r"(SEMESTRE|VERANO)\s+"
    r"(I{1,3}|IV|V|VI|VII|VIII|IX|X|XI|XII)\s*$",
    re.UNICODE,
)

# I AÑO  (sin semestre: el plan no lo desglosa)
ENCABEZADO_SOLO_ANIO = re.compile(
    r"^\s*(I{1,3}|IV|V|VI|VII|VIII)\s+A[ÑN]O\s*$",
    re.UNICODE,
)

# PRIMER SEMESTRE (planes sin agrupación por año)
ENCABEZADO_SEMESTRE = re.compile(
    r"^\s*(PRIMER|SEGUNDO|TERCER|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|"
    r"NOVENO|D[ÉE]CIMO|UND[ÉE]CIMO|DUOD[ÉE]CIMO)\s+SEMESTRE\s*$",
    re.UNICODE,
)
ENCABEZADO_VERANO = re.compile(r"^\s*VERANO\s*$", re.UNICODE)

# Catálogo de electivas al final del plan, con formato distinto:
# 0105 EE CAMBIO CLIMÁTICO Y DESARROLLO SOSTENIBLE 3 8026
LINEA_ELECTIVA = re.compile(
    r"^\s*(\d{4})\s+"            # 1: código
    r"(EE|OP)\s+"                # 2: electiva / optativa
    r"(.+?)\s+"                  # 3: nombre
    r"(\d{1,2})"                 # 4: créditos
    r"(?:\s+(.*))?$",            # 5: requisitos
    re.UNICODE,
)

# AREA DE TELECOMUNICACIONES
AREA_ELECTIVA = re.compile(r"^\s*[ÁA]REA\s+DE\s+(.+?)\s*$", re.UNICODE)

TOTAL_CREDITOS = re.compile(
    r"TOTAL\s+DE\s+CR[ÉE]DITOS?\s*:?\s*(\d{2,4})", re.UNICODE | re.IGNORECASE
)

FACULTAD = re.compile(r"FACULTAD:\s*(.+?)\s*$", re.UNICODE)

# Encabezado del portal de matrícula (matricula.utp.ac.pa), que no usa etiquetas:
#   línea 1: UNIVERSIDAD TECNOLÓGICA DE PANAMÁ
#   línea 2: LIC EN INGENIERÍA DE SOFTWARE          <- carrera abreviada
#   línea 3: LICENCIATURA EN INGENIERÍA DE SOFTWARE M-2024   <- nombre completo
# La línea 3 es la autoritativa: trae el nombre y la versión del plan.
# El portal de matrícula pone el nombre en tres líneas:
#   1: UNIVERSIDAD TECNOLÓGICA DE PANAMÁ
#   2: LIC EN INGENIERÍA DE SOFTWARE          <- abreviada, SIN versión
#   3: LICENCIATURA EN INGENIERÍA DE SOFTWARE M-2024   <- completa, CON versión
#
# Se usa la LÍNEA 2, no la 3, aunque la 3 parezca mejor. Razón: la 3 viene
# truncada en varios PDFs ("...DE SOFTW M-2025", "INGENIERÍA ELECTRÓN 2023"),
# así que planes de la MISMA carrera producirían nombres distintos y el seed
# crearía carreras duplicadas. La línea 2 es idéntica entre versiones.
#
# La versión del plan no se toma de aquí: sale del nombre del archivo.
UNIVERSIDAD_MATRICULA = re.compile(
    r"^\s*UNIVERSIDAD\s+TECNOL[OÓ]GICA\s+DE\s+PANAM[AÁ]\s*$", re.UNICODE
)

# Catálogo de electivas del portal de matrícula. Va tras "Areas de Planes" y
# solo trae código y nombre, SIN créditos:
#   1148 SÍNTESIS DE FILTROS ANALÓGICOS
# El patrón exige 4 dígitos al inicio, así que no colisiona con las filas de
# materia, que empiezan con el número de orden (1 a 70).
INICIO_ELECTIVAS_MATRICULA = re.compile(
    r"^\s*(AREAS?\s+DE\s+PLANES|CODASIG\s+ASIGNATURA)\s*$", re.UNICODE
)
ELECTIVA_MATRICULA = re.compile(
    r"^\s*(\d{4})\s+([A-ZÁÉÍÓÚÜÑ].{3,})$", re.UNICODE
)
CARRERA = re.compile(r"CARRERA:\s*(.+?)\s*$", re.UNICODE)

CODIGO_REQUISITO = re.compile(r"\b(\d{4})\b")

ROMANOS = {
    "I": 1, "II": 2, "III": 3, "IV": 4,
    "V": 5, "VI": 6, "VII": 7, "VIII": 8,
    "IX": 9, "X": 10, "XI": 11, "XII": 12,
}

ORDINALES = {
    "PRIMER": 1, "SEGUNDO": 2, "TERCER": 3, "CUARTO": 4,
    "QUINTO": 5, "SEXTO": 6, "SEPTIMO": 7, "SÉPTIMO": 7,
    "OCTAVO": 8, "NOVENO": 9, "DECIMO": 10, "DÉCIMO": 10,
    "UNDECIMO": 11, "UNDÉCIMO": 11, "DUODECIMO": 12, "DUODÉCIMO": 12,
}

# Ruido que aparece en encabezados y pies de página
RUIDO = (
    "UNIVERSIDAD TECNOLÓGICA",
    "SECRETARÍA GENERAL",
    "PLAN DE ESTUDIO",
    "NUM.",
    "ASIG.",
    "MATERIA FUNDAMENTAL",
    "LABORATORIOS QUE DEBEN",
    "TOTAL DE CRÉDITOS",
    "TOTAL DE CREDITOS",
)


def limpiar(texto: str) -> str:
    """Normaliza espacios y quita artefactos de extracción."""
    texto = texto.replace("\u00a0", " ")
    texto = re.sub(r"\s+", " ", texto)
    return texto.strip()


def sin_tildes(texto: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )


def parsear_requisitos(crudo: str | None) -> dict:
    """Separa códigos de asignatura de los requisitos escritos en texto."""
    if not crudo:
        return {"codigos": [], "texto": None}
    crudo = limpiar(crudo)
    codigos = CODIGO_REQUISITO.findall(crudo)
    texto = CODIGO_REQUISITO.sub("", crudo).strip(" .,-")
    texto = re.sub(r"\s+", " ", texto).strip()
    return {"codigos": codigos, "texto": texto or None}


def repartir_anio_sin_semestre(materias: list) -> int:
    """
    Desde 2025 los planes de ingeniería traen el primer año como "I AÑO", sin
    dividir en semestres, porque es un año común de estudios generales. La
    universidad igual lo dicta en dos semestres.

    Se reparten en mitades siguiendo el orden del plan, que es el orden real de
    cursado: la primera mitad al primer semestre y la segunda al segundo. El
    orden del PDF lo confirma, porque las materias con prerequisitos del mismo
    año siempre aparecen después de aquellas de las que dependen.

    Las materias así asignadas quedan marcadas con periodoInferido=True para
    poder distinguirlas de las que el plan sí especifica.
    """
    por_anio = {}
    for m in materias:
        if m["periodo"] is None and m["anio"] is not None:
            por_anio.setdefault(m["anio"], []).append(m)

    inferidas = 0
    for _anio, grupo in por_anio.items():
        if len(grupo) < 2:
            continue  # una sola materia suelta: no hay nada que repartir
        grupo.sort(key=lambda m: m["orden"])
        corte = (len(grupo) + 1) // 2  # con 12 -> 6 y 6; con 11 -> 6 y 5
        for i, m in enumerate(grupo):
            m["periodo"] = "PRIMER_SEMESTRE" if i < corte else "SEGUNDO_SEMESTRE"
            m["periodoInferido"] = True
            inferidas += 1
    return inferidas


def parsear_pdf(ruta: Path) -> dict:
    facultad = None
    carrera = None
    materias = []
    total_declarado = None
    electivas = []
    en_catalogo_matricula = False
    siguiente_es_carrera = False
    area_actual = None
    anio_actual = None
    periodo_actual = None
    lineas_sin_reconocer = []

    with pdfplumber.open(ruta) as pdf:
        for pagina in pdf.pages:
            texto = pagina.extract_text() or ""
            for linea_cruda in texto.split("\n"):
                linea = limpiar(linea_cruda)
                if not linea:
                    continue

                if facultad is None:
                    m = FACULTAD.search(linea)
                    if m:
                        facultad = limpiar(m.group(1))
                        continue
                if carrera is None:
                    m = CARRERA.search(linea)
                    if m:
                        carrera = limpiar(m.group(1))
                        continue
                    # Portal de matrícula: la carrera es la línea que sigue a
                    # "UNIVERSIDAD TECNOLÓGICA DE PANAMÁ"
                    if siguiente_es_carrera:
                        carrera = limpiar(linea)
                        siguiente_es_carrera = False
                        continue
                    if UNIVERSIDAD_MATRICULA.match(sin_tildes(linea).upper()):
                        siguiente_es_carrera = True
                        continue

                if total_declarado is None:
                    m = TOTAL_CREDITOS.search(sin_tildes(linea).upper())
                    if m:
                        total_declarado = int(m.group(1))

                normalizada = sin_tildes(linea).upper()

                m = ENCABEZADO_ANIO.match(normalizada)
                if m:
                    anio_actual = ROMANOS.get(m.group(1))
                    etiqueta = m.group(2)
                    if "PRIMER" in etiqueta:
                        periodo_actual = "PRIMER_SEMESTRE"
                    elif "SEGUNDO" in etiqueta:
                        periodo_actual = "SEGUNDO_SEMESTRE"
                    else:
                        periodo_actual = "VERANO"
                    continue

                m = ENCABEZADO_ANIO_CORRIDO.match(normalizada)
                if m:
                    anio_actual = ROMANOS.get(m.group(1))
                    if m.group(2) == "VERANO":
                        periodo_actual = "VERANO"
                    else:
                        corrido = ROMANOS.get(m.group(3), 1)
                        periodo_actual = (
                            "PRIMER_SEMESTRE" if corrido % 2 == 1
                            else "SEGUNDO_SEMESTRE"
                        )
                    continue

                m = ENCABEZADO_SOLO_ANIO.match(normalizada)
                if m:
                    anio_actual = ROMANOS.get(m.group(1))
                    periodo_actual = None
                    continue

                m = ENCABEZADO_SEMESTRE.match(normalizada)
                if m:
                    ordinal = ORDINALES.get(m.group(1))
                    if ordinal:
                        anio_actual = (ordinal + 1) // 2
                        periodo_actual = (
                            "PRIMER_SEMESTRE" if ordinal % 2 == 1
                            else "SEGUNDO_SEMESTRE"
                        )
                    continue

                if ENCABEZADO_VERANO.match(normalizada):
                    periodo_actual = "VERANO"
                    continue

                m = LINEA_MATERIA.match(linea)
                if m:
                    nombre = limpiar(m.group(5))
                    # Algunos PDFs dejan el ** pegado al nombre
                    fundamental = bool(m.group(3)) or nombre.startswith("**")
                    nombre = nombre.lstrip("*").strip()

                    materias.append({
                        "orden": int(m.group(1)),
                        "codigo": m.group(2),
                        "nombre": nombre,
                        "fundamental": fundamental,
                        "tipo": m.group(4) or "REGULAR",
                        "horasClase": int(m.group(6)),
                        "horasLaboratorio": int(m.group(7)),
                        "laboratorioPagado": bool(m.group(8)),
                        "creditos": int(m.group(9)),
                        "anio": anio_actual,
                        "periodo": periodo_actual,
                        "periodoInferido": False,
                        "requisitos": parsear_requisitos(m.group(10)),
                    })
                    continue

                if INICIO_ELECTIVAS_MATRICULA.match(normalizada):
                    en_catalogo_matricula = True
                    continue

                if en_catalogo_matricula:
                    m = ELECTIVA_MATRICULA.match(linea)
                    if m:
                        electivas.append({
                            "codigo": m.group(1),
                            "tipo": "EE",
                            "nombre": limpiar(m.group(2)),
                            # El portal de matrícula no publica los créditos de
                            # las electivas. Se marcan para resolverlos por
                            # referencia cruzada contra otros planes.
                            "creditos": 0,
                            "creditosDesconocidos": True,
                            "area": area_actual,
                            "requisitos": {"codigos": [], "texto": None},
                        })
                        continue

                m = AREA_ELECTIVA.match(normalizada)
                if m:
                    area_actual = limpiar(m.group(1)).title()
                    continue

                m = LINEA_ELECTIVA.match(linea)
                if m:
                    electivas.append({
                        "codigo": m.group(1),
                        "tipo": m.group(2),
                        "nombre": limpiar(m.group(3)).lstrip("*").strip(),
                        "creditos": int(m.group(4)),
                        "area": area_actual,
                        "requisitos": parsear_requisitos(m.group(5)),
                    })
                    continue

                if not any(r in linea.upper() for r in RUIDO):
                    lineas_sin_reconocer.append(linea)

    inferidas = repartir_anio_sin_semestre(materias)

    return {
        "archivo": ruta.name,
        "universidad": "UTP",
        "periodosInferidos": inferidas,
        "facultad": facultad,
        "carrera": carrera,
        "materias": materias,
        "electivas": electivas,
        "totalCreditos": sum(m["creditos"] for m in materias),
        "electivasSinCreditos": sum(
            1 for e in electivas if e.get("creditosDesconocidos")
        ),
        "totalCreditosDeclarado": total_declarado,
        "diferenciaCreditos": (
            None if total_declarado is None
            else sum(m["creditos"] for m in materias) - total_declarado
        ),
        "lineasSinReconocer": lineas_sin_reconocer,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--entrada", default="planes_de_estudio")
    ap.add_argument("--salida", default="planes.json")
    ap.add_argument("--reporte", action="store_true",
                    help="Imprime un reporte de cobertura por archivo")
    args = ap.parse_args()

    carpeta = Path(args.entrada)
    if not carpeta.is_dir():
        print(f"No existe la carpeta {carpeta}", file=sys.stderr)
        return 1

    pdfs = sorted(carpeta.glob("*.pdf"))
    planes = []
    for pdf in pdfs:
        try:
            plan = parsear_pdf(pdf)
        except Exception as exc:  # noqa: BLE001
            print(f"ERROR {pdf.name}: {exc}", file=sys.stderr)
            continue
        planes.append(plan)
        if args.reporte:
            d = plan["diferenciaCreditos"]
            marca = (
                "  sin total impreso" if d is None
                else ("" if d == 0 else f"  DESCUADRE {d:+d} (impreso {plan['totalCreditosDeclarado']})")
            )
            print(
                f"{pdf.name:<62} "
                f"{len(plan['materias']):>3} materias  "
                f"{plan['totalCreditos']:>4} cr  "
                f"{sum(1 for m in plan['materias'] if m['fundamental']):>3} fund  "
                f"{len(plan['electivas']):>3} elect  "
                f"{plan['periodosInferidos']:>3} inferidos  "
                f"{len(plan['lineasSinReconocer']):>3} sin reconocer"
                + marca
            )

    Path(args.salida).write_text(
        json.dumps(planes, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    total_materias = sum(len(p["materias"]) for p in planes)
    descuadres = [p for p in planes if p["diferenciaCreditos"] not in (0, None)]
    sin_total = [p for p in planes if p["diferenciaCreditos"] is None]

    print(f"\n{len(planes)} planes · {total_materias} materias → {args.salida}")
    print(
        f"créditos verificados contra el total impreso: "
        f"{len(planes) - len(descuadres) - len(sin_total)} cuadran, "
        f"{len(descuadres)} descuadran, {len(sin_total)} sin total impreso"
    )
    if descuadres:
        print("\nPlanes que NO cuadran (revisar antes de cargar):")
        for p in sorted(descuadres, key=lambda x: -abs(x["diferenciaCreditos"])):
            print(
                f"  {p['archivo'][:56]:<56} calculado {p['totalCreditos']:>6} "
                f"vs impreso {p['totalCreditosDeclarado']:>4}  "
                f"({p['diferenciaCreditos']:+d})"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
