# -*- coding: utf-8 -*-
"""
Genera la capa de tramos con criticidad que consumen los tres mockups.

Que es real:
  geometria de las calles y de los receptores sensibles, de OpenStreetMap
  la serie de reclamos por mes y provincia, de ENARGAS
Que es de muestra y esta declarado como tal en la interfaz:
  la asignacion de hogares aguas abajo de cada tramo
  el material, el diametro y la antiguedad de cada tramo
  la fecha de ultima inspeccion

El generador es determinista: misma entrada, mismo resultado.
"""
import json
import csv
import math
import hashlib
import os
import collections

RAW = "C:/UCEMA/wiki/raw/datos"
OUT = "C:/UCEMA/mockups/datos"
os.makedirs(OUT, exist_ok=True)

CIUDADES = {
    "bahia_blanca": {"etiqueta": "Bahía Blanca", "provincia": "Buenos Aires",
                     "centro": [-38.7183, -62.2661]},
    "tandil": {"etiqueta": "Tandil", "provincia": "Buenos Aires",
               "centro": [-37.3217, -59.1332]},
}

PESO_RECEPTOR = {"hospital": 0.90, "nursing_home": 0.75, "school": 0.55,
                 "kindergarten": 0.55, "social_facility": 0.45, "clinic": 0.35}

ETIQUETA_RECEPTOR = {"hospital": "Hospital", "nursing_home": "Geriátrico",
                     "school": "Escuela", "kindergarten": "Jardín",
                     "social_facility": "Centro comunitario", "clinic": "Centro de salud"}

# la jerarquia vial hace de proxy de la jerarquia de la red mientras no exista la traza real
FACTOR_JERARQUIA = {"primary": 9.0, "secondary": 5.5, "tertiary": 3.2,
                    "unclassified": 1.8, "residential": 1.0, "living_street": 0.7}

MATERIALES = [("Polietileno", 0.55, 0.55), ("Acero revestido", 0.30, 1.00),
              ("Acero desnudo", 0.10, 1.85), ("Fundición", 0.05, 2.40)]


def azar(*claves):
    """Ruido determinista en [0,1) a partir de una clave estable."""
    h = hashlib.sha256("|".join(str(k) for k in claves).encode()).hexdigest()
    return int(h[:12], 16) / float(16 ** 12)


def metros(a, b):
    """Distancia aproximada en metros entre dos puntos [lon, lat]."""
    lat = math.radians((a[1] + b[1]) / 2)
    dx = (b[0] - a[0]) * 111320 * math.cos(lat)
    dy = (b[1] - a[1]) * 110540
    return math.hypot(dx, dy)


def largo(coords):
    return sum(metros(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def punto_medio(coords):
    return coords[len(coords) // 2]


def simplificar(coords, paso):
    if len(coords) <= 2:
        return [[round(c[0], 5), round(c[1], 5)] for c in coords]
    r = coords[::paso]
    if r[-1] != coords[-1]:
        r.append(coords[-1])
    return [[round(c[0], 5), round(c[1], 5)] for c in r]


def leer_reclamos():
    filas = []
    with open(RAW + "/enargas_reclamos_camuzzi.csv", encoding="utf-8") as f:
        for fila in csv.DictReader(f):
            filas.append(fila)
    return filas


def estacionalidad_real(filas):
    """Indice mensual calculado sobre los reclamos de suministro de ENARGAS."""
    mes = collections.Counter()
    anio = collections.Counter()
    for fila in filas:
        if not fila["grupo"].startswith("II"):
            continue
        n = int(float(fila["cantidad"]))
        mes[int(fila["mes"])] += n
        anio[int(fila["anio"])] += n
    total = sum(mes.values())
    idx = dict((m, round(v * 12.0 / total, 4)) for m, v in mes.items())
    return idx, dict(sorted(anio.items())), total


def serie_mensual(filas):
    s = collections.Counter()
    for fila in filas:
        if fila["grupo"].startswith("II"):
            s[(int(fila["anio"]), int(fila["mes"]))] += int(float(fila["cantidad"]))
    return [{"anio": a, "mes": m, "cantidad": c} for (a, m), c in sorted(s.items())]


def totales_por_grupo(filas):
    g = collections.Counter()
    for fila in filas:
        g[fila["grupo"]] += int(float(fila["cantidad"]))
    return dict(sorted(g.items()))


def construir(clave, meta):
    calles = json.load(open(RAW + "/calles_" + clave + ".geojson", encoding="utf-8"))["features"]
    recept = json.load(open(RAW + "/receptores_" + clave + ".geojson", encoding="utf-8"))["features"]

    receptores = []
    for f in recept:
        lon, lat = f["geometry"]["coordinates"][:2]
        tipo = f["properties"].get("tipo") or "social_facility"
        nombre = f["properties"].get("name")
        receptores.append({
            "nombre": (nombre or ETIQUETA_RECEPTOR.get(tipo, "Sin nombre")).strip(),
            "tipo": tipo,
            "lat": round(lat, 5),
            "lon": round(lon, 5),
            "peso": PESO_RECEPTOR.get(tipo, 0.30),
        })

    tramos = []
    for i, f in enumerate(calles):
        props = f["properties"]
        nombre = (props.get("name") or "").strip()
        if not nombre:
            continue
        coords = f["geometry"]["coordinates"]
        if len(coords) < 2:
            continue
        m = largo(coords)
        if m < 60:
            continue

        tid = "T%05d" % i
        via = props.get("highway") or "residential"
        jer = FACTOR_JERARQUIA.get(via, 1.0)
        mx = punto_medio(coords)

        # hogares aguas abajo: densidad que cae con la distancia al centro, escalada por jerarquia
        d_centro = metros([meta["centro"][1], meta["centro"][0]], mx) / 1000.0
        densidad = 42 * math.exp(-d_centro / 3.1) + 7
        hogares = int(m / 100.0 * densidad * jer * (0.72 + 0.56 * azar(tid, "hog")))
        hogares = max(8, hogares)

        # receptores sensibles reales a menos de 160 metros del tramo
        cerca = [r for r in receptores if metros([r["lon"], r["lat"]], mx) < 160]
        factor = min(2.6, 1.0 + sum(r["peso"] for r in cerca))
        consecuencia = hogares * factor

        # atributos fisicos de muestra
        u = azar(tid, "mat")
        acum = 0.0
        material, riesgo_mat = MATERIALES[0][0], MATERIALES[0][2]
        for nom, p, rm in MATERIALES:
            acum += p
            if u <= acum:
                material, riesgo_mat = nom, rm
                break

        antiguedad = int(4 + 56 * azar(tid, "ant") ** 1.35)
        diametro = [63, 90, 110, 160, 200][min(4, int(jer / 2.2))]

        prob = 0.0085 * riesgo_mat * (1 + antiguedad / 42.0) * (0.75 + 0.5 * azar(tid, "p"))
        prob = min(0.14, prob)

        dias = int(25 + 880 * azar(tid, "insp") ** 1.2)

        tramos.append({
            "id": tid,
            "nombre": nombre,
            "via": via,
            "geo": simplificar(coords, 2 if len(coords) > 12 else 1),
            "lat": round(mx[1], 5),
            "lon": round(mx[0], 5),
            "largo": int(m),
            "hogares": hogares,
            "receptores": [{"nombre": r["nombre"], "tipo": r["tipo"]} for r in cerca],
            "factor": round(factor, 2),
            "consecuencia": int(consecuencia),
            "material": material,
            "antiguedad": antiguedad,
            "diametro": diametro,
            "prob": round(prob, 5),
            "dias": dias,
            "crit": round(prob * consecuencia, 3),
        })

    # dos lecturas del mismo numero:
    #   score, percentil dentro de la ciudad, decide el color en el mapa
    #   indice, 0 a 100 contra el tramo mas critico, es el numero que se muestra
    orden = sorted(tramos, key=lambda t: t["crit"])
    n = len(orden)
    crit_max = orden[-1]["crit"] if orden else 1.0
    for k, t in enumerate(orden):
        t["score"] = round(100.0 * k / max(1, n - 1), 1)
        t["indice"] = round(100.0 * (t["crit"] / crit_max) ** 0.5, 1)
    tramos.sort(key=lambda t: -t["crit"])

    return {
        "clave": clave,
        "nombre": meta["etiqueta"],
        "provincia": meta["provincia"],
        "centro": meta["centro"],
        "tramos": tramos,
        "receptores": receptores,
    }


def main():
    filas = leer_reclamos()
    idx_mes, por_anio, total_ii = estacionalidad_real(filas)

    salida = {
        "generado": "2026-09-20",
        "prestadora": "Camuzzi Gas Pampeana S.A.",
        "estacionalidad": idx_mes,
        "reclamos_por_anio": por_anio,
        "reclamos_serie": serie_mensual(filas),
        "reclamos_por_grupo": totales_por_grupo(filas),
        "reclamos_total_grupo_ii": total_ii,
        "ciudades": {},
    }

    for clave, meta in CIUDADES.items():
        c = construir(clave, meta)
        salida["ciudades"][clave] = c
        print("%s: %d tramos, %d receptores" % (meta["etiqueta"], len(c["tramos"]), len(c["receptores"])))

    destino = OUT + "/malla-datos.js"
    with open(destino, "w", encoding="utf-8") as f:
        f.write("window.MALLA = ")
        json.dump(salida, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("escrito %s, %d KB" % (destino, round(os.path.getsize(destino) / 1024)))


main()
