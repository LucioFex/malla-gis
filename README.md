# Malla GIS, visor de criticidad de red

Variante A de tres maquetas navegables del proyecto **Malla**, trabajo final de grado de
Ingeniería en Informática, Universidad del CEMA.

**Ver la maqueta: https://luciofex.github.io/malla-gis/**

Las otras dos variantes:

- [malla-recorrida](https://github.com/LucioFex/malla-recorrida), la hoja de ruta del día
- [malla-tablero](https://github.com/LucioFex/malla-tablero), el tablero de gestión

## Qué problema resuelve

Una distribuidora de gas tiene más red de la que puede inspeccionar. Hoy elige qué
inspeccionar con un listado por localidad que se recorre de arriba hacia abajo, y la única
prioridad que existe es la memoria del inspector. Nadie está midiendo cuántos hogares
quedan sin servicio si un tramo falla.

Malla le pone un número a cada tramo:

```
criticidad = probabilidad de falla  x  consecuencia si falla
```

La probabilidad sale de la serie de reclamos que ENARGAS publica desde 2018. La
consecuencia sale del grafo de la red, contando los hogares que cuelgan del tramo y
ponderando por receptores sensibles, que son escuelas, hospitales, centros de salud y
jardines.

## Qué hace esta variante

Es la lectura literal de lo que quedó acordado con el director de carrera: un sistema de
información geográfica con mapa base real y capas que se prenden y se apagan.

- Mapa base de OpenStreetMap, neutralizado para que el color quede disponible solo para el
  dato.
- Capas conmutables: tramos de red, receptores sensibles, densidad de hogares.
- Leyenda de cinco clases que también filtra. Los cortes no son quintiles: el 5 % más alto
  queda en bordó, porque el riesgo se concentra y la escala tiene que mostrarlo.
- Umbral de criticidad con control deslizante.
- Ficha del tramo con el desglose completo del número y el origen de cada factor.
- Selector entre Bahía Blanca y Tandil.

## Qué dato es real y qué dato es de muestra

Esto está declarado también dentro de la maqueta, porque un tribunal va a preguntar.

**Real**

| Dato | Fuente | Licencia |
|---|---|---|
| Traza de calles | OpenStreetMap, vía Overpass | ODbL 1.0 |
| Receptores sensibles | OpenStreetMap | ODbL 1.0 |
| Reclamos resueltos 2018 a 2026 | ENARGAS, portal de transparencia | CC BY 4.0 |

**De muestra, generado de forma determinista**

- Hogares aguas abajo de cada tramo.
- Material, diámetro y antigüedad del caño.
- Fecha de última inspección.

El motivo es que **la traza fina de la red domiciliaria no es dato público**. ENARGAS
publica gasoductos troncales y áreas de cobertura, no la red secundaria calle por calle.
Tampoco existen incidentes georreferenciados: la serie de reclamos viene agregada por
prestadora, provincia, mes y grupo, sin localidad ni coordenadas.

Por eso la capa de tramos se deriva del callejero con un supuesto declarado, y el sistema
queda listo para reemplazarla por la traza real el día que la distribuidora la aporte.

## Cómo está hecho

Sin compilación y sin dependencias que haya que instalar.

```
index.html          estructura
estilo.css          sistema visual compartido por las tres variantes
app.js              capas, escala de criticidad y ficha del tramo
datos/malla-datos.js  la capa de tramos ya calculada
```

Leaflet desde CDN para el mapa. El resto es JavaScript sin framework.

Para verlo en local alcanza con servir la carpeta:

```
python -m http.server 8777
```

## Cómo se regeneran los datos

El script `generar_datos.py` del proyecto lee los GeoJSON de OpenStreetMap y el CSV de
ENARGAS, calcula la criticidad de cada tramo y escribe `datos/malla-datos.js`. Es
determinista: misma entrada, mismo resultado, así que la maqueta no cambia sola entre
demostraciones.

## Créditos de datos

- Callejero y receptores sensibles: © colaboradores de OpenStreetMap, ODbL 1.0.
- Reclamos resueltos por distribuidora: ENARGAS, portal de transparencia, CC BY 4.0.
- Radios censales previstos para la etapa siguiente: INDEC, censo 2022.

## Licencia

Código bajo licencia MIT. Los datos conservan la licencia de su fuente.
