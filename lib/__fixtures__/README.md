# Fixtures de prueba

## `historial-real.txt`

Texto **extraído con unpdf** de un "Historial de Notas" real del portal de
matrícula de la UTP (`matricula.utp.ac.pa`), usado por la prueba de integración
[`../importarHistorial.integracion.test.ts`](../importarHistorial.integracion.test.ts).

**Sin datos personales.** Solo se conserva la tabla de notas (encabezados de
periodo + líneas de materia, textuales); las cabeceras y pies del PDF que
llevaban el nombre del estudiante se eliminaron por completo, no forman parte de
este texto. Se guarda el texto, no el PDF, por dos razones:

1. No mete un documento con datos personales al repositorio.
2. Prueba exactamente lo que importa —el parser sobre el texto real— porque la
   extracción de unpdf se verifica aparte.

El artefacto de página `(../../../../` que unpdf pega al inicio de la página 2 se
conserva, porque el parser debe saber ignorarlo.
