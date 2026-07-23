def calcular_nota_actual(secciones):
    nota_actual = 0
    for seccion in secciones:
        suma_notas = sum(seccion['notas_obtenidas'])
        num_notas = seccion['num_notas']
        porcentaje = seccion['porcentaje']
        nota_actual += (suma_notas / num_notas) * porcentaje
    return nota_actual

def calcular_porcentaje_restante(secciones):
    porcentaje_restante = 0
    for seccion in secciones:
        num_notas_restantes = seccion['num_notas'] - len(seccion['notas_obtenidas'])
        porcentaje_seccion = seccion['porcentaje']
        porcentaje_restante += (porcentaje_seccion / seccion['num_notas']) * num_notas_restantes
    return porcentaje_restante

def calcular_nota_necesaria(nota_actual, porcentaje_restante, objetivo):
    if porcentaje_restante == 0:
        return float('inf')  # Evita divisiones por cero
    return (objetivo - nota_actual) / porcentaje_restante

def main():
    secciones = []
    num_secciones = int(input("Ingrese la cantidad de secciones en las que se divide la materia: "))
    
    for i in range(num_secciones):
        print(f"\nSección {i+1}")
        porcentaje = float(input("Ingrese el porcentaje que representa esta sección en la nota final (ejemplo: 20 para 20%): ")) / 100
        num_notas = int(input("Ingrese la cantidad total de notas en esta sección: "))
        num_notas_realizadas = int(input("Ingrese la cantidad de notas ya realizadas en esta sección: "))
        notas_obtenidas = []
        
        for j in range(num_notas_realizadas):
            nota = float(input(f"Ingrese la nota obtenida {j+1}: "))
            notas_obtenidas.append(nota)
        
        secciones.append({
            'porcentaje': porcentaje,
            'num_notas': num_notas,
            'notas_obtenidas': notas_obtenidas
        })
    
    nota_actual = calcular_nota_actual(secciones)
    porcentaje_restante = calcular_porcentaje_restante(secciones)
    
    print(f"\nTu nota actual es: {nota_actual:.2f}")
    print(f"Porcentaje restante a completar: {porcentaje_restante * 100:.2f}%")
    
    while True:
        objetivo = float(input("\nIngrese el objetivo de nota final que desea alcanzar (o escriba -1 para salir): "))
        if objetivo == -1:
            break
        
        nota_necesaria = calcular_nota_necesaria(nota_actual, porcentaje_restante, objetivo)
        
        if nota_necesaria > 100:
            print("\nAlcanzar este objetivo es imposible, la nota requerida es mayor a 100.")
        elif nota_necesaria < 0:
            print("\nYa has alcanzado el objetivo deseado.")
        else:
            print(f"\nDebes obtener un promedio de {nota_necesaria:.2f} en las notas restantes para alcanzar tu objetivo.")
    
    print("\nPrograma finalizado.")

if __name__ == "__main__":
    main()
