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
    r"(\d+)\s+"                  # 6: horas de clase
    r"(\d+)(\$\$)?\s+"           # 7/8: horas de laboratorio (+ pago)
    r"(\d+)"                     # 9: créditos
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

FACULTAD = re.compile(r"FACULTAD:\s*(.+?)\s*$", re.UNICODE)
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


def parsear_pdf(ruta: Path) -> dict:
    facultad = None
    carrera = None
    materias = []
    electivas = []
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
                        "requisitos": parsear_requisitos(m.group(10)),
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

    return {
        "archivo": ruta.name,
        "universidad": "UTP",
        "facultad": facultad,
        "carrera": carrera,
        "materias": materias,
        "electivas": electivas,
        "totalCreditos": sum(m["creditos"] for m in materias),
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
            print(
                f"{pdf.name:<62} "
                f"{len(plan['materias']):>3} materias  "
                f"{plan['totalCreditos']:>4} cr  "
                f"{sum(1 for m in plan['materias'] if m['fundamental']):>3} fund  "
                f"{len(plan['electivas']):>3} elect  "
                f"{len(plan['lineasSinReconocer']):>3} sin reconocer"
            )

    Path(args.salida).write_text(
        json.dumps(planes, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    total_materias = sum(len(p["materias"]) for p in planes)
    print(f"\n{len(planes)} planes · {total_materias} materias → {args.salida}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
