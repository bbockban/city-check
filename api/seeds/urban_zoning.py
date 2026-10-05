"""
Reference seed data for tertiary zoning areas and general-regime limits.

Sources (Digesto Departamental Vol. IV, Plan Montevideo urban rules):
- Área Central: https://normativa.montevideo.gub.uy/articulos/51267
- Área Intermedia: https://normativa.montevideo.gub.uy/articulos/51275
- Área Costera: https://normativa.montevideo.gub.uy/articulos/51284
- Área Periférica: https://normativa.montevideo.gub.uy/articulos/51288
- Otras áreas urbanizadas: https://normativa.montevideo.gub.uy/articulos/51291

Numeric limits are working approximations for the general regime only;
subzones and specific padrones override these (see thesis disclaimer).
"""

URBAN_PARAMETERS_SEED: list[dict] = [
    {
        "name": "Altura máxima",
        "description": (
            "Altura máxima de edificación permitida, medida desde el nivel terminado "
            "de la planta baja (nivel 0), en metros."
        ),
        "unit": "m",
        "parameter_kind": "ALTURA_MAXIMA",
        "metric_key": "altura_m",
        "limit_key": "limite_altura_m",
        "rule_expression": {
            "left": "altura_m",
            "operator": "<=",
            "right": "limite_altura_m",
        },
    },
    {
        "name": "Factor de ocupación del suelo (FOS)",
        "description": (
            "Porcentaje máximo de la huella de parcela que puede construirse a nivel "
            "de suelo (Factor de Ocupación del Suelo)."
        ),
        "unit": "%",
        "parameter_kind": "FOS",
        "metric_key": "fos_porc",
        "limit_key": "limite_fos_porc",
        "rule_expression": {
            "left": "fos_porc",
            "operator": "<=",
            "right": "limite_fos_porc",
        },
    },
    {
        "name": "Retiro frontal",
        "description": (
            "Distancia mínima entre la línea de edificación y el límite frontal de "
            "parcela sobre la vía principal (retiro frontal), en metros."
        ),
        "unit": "m",
        "parameter_kind": "RETIRO_FRONTAL",
        "metric_key": "retiro_m",
        "limit_key": "limite_retiro_m",
        "rule_expression": {
            "left": "retiro_m",
            "operator": ">=",
            "right": "limite_retiro_m",
        },
    },
]

# (limit_value, note) per parameter_kind string for the ZONA_GENERAL scope of each area
ZONING_AREAS_SEED: list[dict] = [
    {
        "name": "Área Central",
        "description": (
            "Zonificación terciaria — régimen general del área central (Digesto IV, "
            "Libro II, Parte II, Título IV, Capítulo IV, Sección III)."
        ),
        "municipality_codes": ["CH"],
        "match_priority": 10,
        "scope_description": "Régimen general — Área Central.",
        "limits": {
            "ALTURA_MAXIMA": (
                27,
                "Altura máxima típica donde aplican 27 m en calles ≤16 m de ancho; "
                "numerosas excepciones y normas de inventario/PUDAN. Ref. art. "
                "D.223.202 https://normativa.montevideo.gub.uy/articulos/51267",
            ),
            "FOS": (
                80,
                "Ejemplo de FOS 80 % (p. ej. sector PUDAN en art. D.223.202); en "
                "otros casos según planos del Plan Montevideo. Ref. art. D.223.202.",
            ),
            "RETIRO_FRONTAL": (
                4,
                "Retiro de 4 m sobre base de 7 m en vías calificadas (D.223.202); el "
                "caso general depende de planos y sectores especiales.",
            ),
        },
    },
    {
        "name": "Área Intermedia",
        "description": (
            "Zonificación terciaria — área intermedia (Digesto IV, Título IV, "
            "Cap. IV, Secc. IV)."
        ),
        "municipality_codes": ["A", "B", "C", "D", "F"],
        "match_priority": 20,
        "scope_description": "Régimen general — Área Intermedia.",
        "limits": {
            "ALTURA_MAXIMA": (
                27,
                "Ejemplo: hasta 27 m en Av. 8 de Octubre con base 7 m + retiro 4 m "
                "al volumen superior (art. D.223.206). Sujeto a cartografía. "
                "https://normativa.montevideo.gub.uy/articulos/51275",
            ),
            "FOS": (
                65,
                "Valor ilustrativo de régimen general (sectores especiales p. ej. "
                "padrón 66.905 al 65 % en art. D.223.206); por defecto según planos "
                "del Plan Montevideo.",
            ),
            "RETIRO_FRONTAL": (
                4,
                "Retiro frontal mínimo representativo en condiciones mixtas; muchas "
                "calles siguen planos o excepciones (p. ej. Camino Carrasco 7 m en "
                "art. D.223.206).",
            ),
        },
    },
    {
        "name": "Área Costera",
        "description": (
            "Zonificación terciaria — área costera (Digesto IV, Título IV, Cap. IV, "
            "Secc. V)."
        ),
        "municipality_codes": ["E", "G"],
        "match_priority": 30,
        "scope_description": "Régimen general — Área Costera.",
        "limits": {
            "ALTURA_MAXIMA": (
                31,
                "31 m en tramos de Rambla Naciones Unidas y 21 de Setiembre "
                "(D.223.217). https://normativa.montevideo.gub.uy/articulos/51284",
            ),
            "FOS": (
                80,
                "FOS 80 % con posibles reglas de ampliación de garaje en planta baja "
                "(art. D.223.217).",
            ),
            "RETIRO_FRONTAL": (
                4,
                "Retiro frontal de 4 m en frentes costeros/avenidas listados "
                "(D.223.217); acordamiento excluido donde se indica.",
            ),
        },
    },
    {
        "name": "Área Periférica",
        "description": (
            "Zonificación terciaria — área periférica (Digesto IV, Título IV, "
            "Cap. IV, Secc. VI)."
        ),
        "municipality_codes": ["F", "G"],
        "match_priority": 40,
        "scope_description": (
            "Régimen general — Área Periférica (basado en planos; semilla aproximada)."
        ),
        "limits": {
            "ALTURA_MAXIMA": (
                27,
                "La mayoría de los artículos remiten alturas a planos del Plan "
                "Montevideo (p. ej. arts. D.223.224–229). Valor por defecto práctico "
                "para demos. https://normativa.montevideo.gub.uy/articulos/51288",
            ),
            "FOS": (
                65,
                "FOS según planos; 65 % como valor por defecto cuando solo "
                "aplica cartografía (p. ej. Casavalle residencial mixto, D.223.227).",
            ),
            "RETIRO_FRONTAL": (
                4,
                (
                    "Retiro frontal urbano típico cuando aplican planos; "
                    "muchas excepciones locales (arts. D.223.224–229)."
                ),
            ),
        },
    },
    {
        "name": "Otras áreas urbanizadas",
        "description": (
            "Zonificación terciaria — otras áreas urbanizadas "
            "(Digesto IV, Título IV, Cap. IV, Secc. VII)."
        ),
        "municipality_codes": ["A", "D"],
        "match_priority": 50,
        "scope_description": (
            "Régimen general — Otras áreas urbanizadas (basado en planos; semilla "
            "aproximada)."
        ),
        "limits": {
            "ALTURA_MAXIMA": (
                9,
                "Altura máxima de 9 m para otras áreas urbanizadas. "
                "https://normativa.montevideo.gub.uy/articulos/51291",
            ),
            "FOS": (
                40,
                "FOS 40 % para otras áreas urbanizadas.",
            ),
            "RETIRO_FRONTAL": (
                5,
                "Retiro frontal de 5 m para otras áreas urbanizadas.",
            ),
        },
    },
]
