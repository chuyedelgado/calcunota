import re
import os
import pdfplumber
import mysql.connector
from datetime import datetime

# 1. Expresión regular para extraer código (4 dígitos) y nombre
#    - El número inicial (1 o 2 dígitos) es opcional
#    - 'OP' o 'EE' también es opcional
patron = re.compile(
    r'^\s*(?:\d{1,2}\s+)?'   # opcional 1-2 dígitos + espacio
    r'(\d{4})'               # grupo(1): 4 dígitos (código)
    r'(?:\s+(?:OP|EE))?'     # opcional: espacio + OP o EE
    r'\s+(.*?)'              # grupo(2): el nombre perezoso
    r'\s+\d+',               # se detiene al llegar a espacio + dígitos
    re.UNICODE
)

def extraer_codigos_asignaturas_de_pdf(ruta_pdf):
    """
    Retorna una lista de tuplas (codigo, materia).
    """
    resultados = []
    with pdfplumber.open(ruta_pdf) as pdf:
        for pagina in pdf.pages:
            texto = pagina.extract_text() or ""
            for linea in texto.split('\n'):
                match = patron.match(linea)
                if match:
                    codigo = match.group(1).strip()
                    materia = match.group(2).strip()
                    # Si deseas quitar asteriscos o espacios sobrantes:
                    materia = materia.replace('**', '').strip()

                    if materia.startswith("OPOP"):
                        materia = materia[2:].strip()

                    resultados.append((codigo, materia))
    return resultados

def ya_existe_code(cursor, code):
    """
    Verifica si ya existe una asignatura con ese code en la BD.
    Retorna True o False.
    """
    consulta = "SELECT subject_id FROM subjects WHERE code = %s"
    cursor.execute(consulta, (code,))
    return cursor.fetchone() is not None

def main():
    # 2. Configuración de la conexión a la BD (credenciales por variables de entorno)
    password = os.environ.get("MYSQL_PASSWORD")
    if not password:
        raise SystemExit(
            "Falta la variable de entorno MYSQL_PASSWORD.\n"
            "Ejemplo: MYSQL_PASSWORD='...' python3 scraping_subjects_python.py"
        )

    connection = mysql.connector.connect(
        host=os.environ.get("MYSQL_HOST", "localhost"),
        user=os.environ.get("MYSQL_USER", "root"),
        password=password,
        database=os.environ.get("MYSQL_DATABASE", "calcunota_db"),
        charset="utf8mb4",
        collation="utf8mb4_general_ci"
    )
    cursor = connection.cursor()

    # 3. Carpeta donde tienes los PDFs (por defecto, la vecina a este script)
    carpeta_pdfs = os.environ.get(
        "PLANES_DE_ESTUDIO_DIR",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "planes_de_estudio"),
    )

    # 4. Recorremos todos los archivos PDF en la carpeta
    for archivo in os.listdir(carpeta_pdfs):
        if archivo.lower().endswith(".pdf"):
            ruta_pdf = os.path.join(carpeta_pdfs, archivo)
            print(f"Procesando: {ruta_pdf}")

            # Extraer asignaturas de este PDF
            asignaturas = extraer_codigos_asignaturas_de_pdf(ruta_pdf)

            # 5. Insertar en BD si no existen
            for code, name in asignaturas:
                if not ya_existe_code(cursor, code):
                    # No existe -> insertamos
                    created_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    # La columna 'updated_at' la podemos dejar en NULL
                    insert_sql = """
                        INSERT INTO subjects (name, code, description, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s)
                    """
                    cursor.execute(insert_sql, (name, code, "", created_at, None))
                    print(f"Insertada: {code} -> {name}")
                else:
                    print(f"Ya existe en BD: {code} -> {name}")

            # Confirma cambios para cada PDF (o al final, como prefieras)
            connection.commit()

    # Cerrar conexión
    cursor.close()
    connection.close()

if __name__ == "__main__":
    main()
