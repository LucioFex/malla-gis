/* Malla GIS, variante A.
   Un mapa base real, capas conmutables encima, y el desglose del numero al hacer clic.
   Es la lectura literal de lo que quedo acordado con el director el 8 de septiembre. */

(function () {
  "use strict";

  var D = window.MALLA;

  /* Los cortes no son quintiles: el riesgo se concentra, y la escala tiene que mostrarlo.
     El cinco por ciento mas alto queda en bordo y es el que la cuadrilla mira primero. */
  var ESCALA = [
    { min: 95, color: "#7b1e2b", texto: "Crítica", grosor: 4.2, opacidad: .95 },
    { min: 85, color: "#c7662f", texto: "Alta", grosor: 3.2, opacidad: .9 },
    { min: 65, color: "#dfb257", texto: "Media", grosor: 2.3, opacidad: .85 },
    { min: 35, color: "#b3bd91", texto: "Baja", grosor: 1.7, opacidad: .75 },
    { min: 0, color: "#8fa9ae", texto: "Muy baja", grosor: 1.3, opacidad: .6 }
  ];

  var RECEPTOR = {
    hospital: "Hospital",
    clinic: "Centro de salud",
    school: "Escuela",
    kindergarten: "Jardín de infantes",
    social_facility: "Centro comunitario",
    nursing_home: "Geriátrico"
  };

  var VIA = {
    primary: "Troncal",
    secondary: "Distribuidora principal",
    tertiary: "Distribuidora secundaria",
    unclassified: "Red barrial",
    residential: "Red domiciliaria",
    living_street: "Pasaje"
  };

  var ICONO = {
    hospital: "M8 4.2v7.6M4.2 8h7.6",
    clinic: "M8 4.2v7.6M4.2 8h7.6",
    school: "M2.2 6.4L8 3.6l5.8 2.8L8 9.2zM4.6 7.6v3.2c0 .9 1.5 1.6 3.4 1.6s3.4-.7 3.4-1.6V7.6",
    kindergarten: "M2.2 6.4L8 3.6l5.8 2.8L8 9.2zM4.6 7.6v3.2c0 .9 1.5 1.6 3.4 1.6s3.4-.7 3.4-1.6V7.6",
    social_facility: "M2.8 7.2L8 3.2l5.2 4v5.2H2.8zM6.6 12.4V9.2h2.8v3.2",
    nursing_home: "M2.8 7.2L8 3.2l5.2 4v5.2H2.8zM6.6 12.4V9.2h2.8v3.2"
  };

  function clase(score) {
    for (var i = 0; i < ESCALA.length; i++) if (score >= ESCALA[i].min) return ESCALA[i];
    return ESCALA[ESCALA.length - 1];
  }

  function num(n) { return n.toLocaleString("es-AR"); }

  function svg(d, extra) {
    return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || "") + '><path d="' + d + '"/></svg>';
  }

  var estado = {
    ciudad: "bahia_blanca",
    umbral: 0,
    clases: { "Crítica": true, Alta: true, Media: true, Baja: true, "Muy baja": true },
    capas: { red: true, receptores: true, hogares: false },
    seleccion: null
  };

  var mapa, capaRed, capaReceptores, capaHogares, capaFoco, ficha;
  var lineas = {};

  /* ---------- mapa ---------- */

  function iniciarMapa() {
    mapa = L.map("mapa", {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      className: "base-neutra",
      attribution: 'Base y capas de red &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, ODbL. Reclamos: ENARGAS, CC BY 4.0.'
    }).addTo(mapa);

    capaRed = L.layerGroup().addTo(mapa);
    capaHogares = L.layerGroup();
    capaReceptores = L.layerGroup().addTo(mapa);
    capaFoco = L.layerGroup().addTo(mapa);
  }

  function pintar() {
    var c = D.ciudades[estado.ciudad];
    capaRed.clearLayers();
    capaHogares.clearLayers();
    capaReceptores.clearLayers();
    capaFoco.clearLayers();
    lineas = {};

    var visibles = 0;

    c.tramos.forEach(function (t) {
      var k = clase(t.score);
      if (!estado.clases[k.texto] || t.score < estado.umbral) return;
      visibles++;

      var puntos = t.geo.map(function (p) { return [p[1], p[0]]; });

      var linea = L.polyline(puntos, {
        color: k.color,
        weight: k.grosor,
        opacity: k.opacidad,
        lineCap: "round"
      });

      linea.bindTooltip(
        "<b>" + t.nombre + "</b> <i>criticidad " + t.indice.toFixed(0) + "</i>",
        { className: "tooltip-tramo", sticky: true, direction: "top", offset: [0, -6] }
      );

      linea.on("click", function () { seleccionar(t.id); });
      linea.addTo(capaRed);
      lineas[t.id] = linea;

      if (estado.capas.hogares) {
        L.circleMarker([t.lat, t.lon], {
          radius: Math.max(2, Math.min(13, Math.sqrt(t.hogares) / 2.6)),
          color: "#7b1e2b",
          weight: 0,
          fillColor: "#7b1e2b",
          fillOpacity: .13
        }).addTo(capaHogares);
      }
    });

    c.receptores.forEach(function (r) {
      L.circleMarker([r.lat, r.lon], {
        radius: 4.5,
        color: "#fbfaf8",
        weight: 1.5,
        fillColor: "#3d5a5f",
        fillOpacity: 1
      }).bindTooltip(
        "<b>" + r.nombre + "</b> <i>" + (RECEPTOR[r.tipo] || r.tipo) + "</i>",
        { className: "tooltip-tramo", direction: "top", offset: [0, -6] }
      ).addTo(capaReceptores);
    });

    aplicarCapas();
    document.getElementById("umbral-conteo").textContent =
      num(visibles) + " de " + num(c.tramos.length) + " tramos en pantalla";
  }

  function aplicarCapas() {
    [[capaRed, estado.capas.red], [capaReceptores, estado.capas.receptores],
     [capaHogares, estado.capas.hogares]].forEach(function (par) {
      if (par[1]) { if (!mapa.hasLayer(par[0])) mapa.addLayer(par[0]); }
      else if (mapa.hasLayer(par[0])) mapa.removeLayer(par[0]);
    });
  }

  /* ---------- panel lateral ---------- */

  function dibujarCapas() {
    var c = D.ciudades[estado.ciudad];
    var defs = [
      { id: "red", texto: "Tramos de red", conteo: num(c.tramos.length) + " tramos" },
      { id: "receptores", texto: "Receptores sensibles", conteo: num(c.receptores.length) + " puntos" },
      { id: "hogares", texto: "Densidad de hogares", conteo: "muestra" }
    ];

    document.getElementById("capas").innerHTML = defs.map(function (d) {
      return '<label class="capa">' +
        '<input type="checkbox" data-capa="' + d.id + '"' + (estado.capas[d.id] ? " checked" : "") + '>' +
        '<span class="tilde">' + svg("M3 8.4l3.2 3.2L13 4.8") + '</span>' +
        '<span class="capa-texto">' + d.texto + '</span>' +
        '<span class="capa-conteo">' + d.conteo + '</span>' +
        '</label>';
    }).join("");

    Array.prototype.forEach.call(document.querySelectorAll("[data-capa]"), function (el) {
      el.addEventListener("change", function () {
        estado.capas[el.dataset.capa] = el.checked;
        if (el.dataset.capa === "hogares") pintar(); else aplicarCapas();
      });
    });
  }

  function dibujarLeyenda() {
    var c = D.ciudades[estado.ciudad];
    var cuenta = {};
    c.tramos.forEach(function (t) {
      var k = clase(t.score).texto;
      cuenta[k] = (cuenta[k] || 0) + 1;
    });

    document.getElementById("leyenda").innerHTML = ESCALA.map(function (e) {
      return '<button class="leyenda-fila" type="button" data-clase="' + e.texto + '" ' +
        'aria-pressed="' + (estado.clases[e.texto] ? "true" : "false") + '" ' +
        'style="border:0;background:none;font:inherit;text-align:left;width:calc(100% + 16px);' +
        (estado.clases[e.texto] ? "" : "opacity:.4;") + '">' +
        '<span class="muestra" style="background:' + e.color + '"></span>' +
        '<span>' + e.texto + '</span>' +
        '<span class="leyenda-n">' + num(cuenta[e.texto] || 0) + '</span>' +
        '</button>';
    }).join("");

    Array.prototype.forEach.call(document.querySelectorAll("[data-clase]"), function (el) {
      el.addEventListener("click", function () {
        estado.clases[el.dataset.clase] = !estado.clases[el.dataset.clase];
        dibujarLeyenda();
        pintar();
      });
    });
  }

  function dibujarTop() {
    var c = D.ciudades[estado.ciudad];
    document.getElementById("top").innerHTML = c.tramos.slice(0, 10).map(function (t, i) {
      var k = clase(t.score);
      return '<button class="fila-top" type="button" data-ir="' + t.id + '">' +
        '<span class="fila-orden">' + (i + 1) + '</span>' +
        '<span class="muestra" style="background:' + k.color + '"></span>' +
        '<span class="fila-nombre">' + t.nombre + '</span>' +
        '<span class="fila-dato">' + num(t.hogares) + ' hog.</span>' +
        '</button>';
    }).join("");

    Array.prototype.forEach.call(document.querySelectorAll("[data-ir]"), function (el) {
      el.addEventListener("click", function () { seleccionar(el.dataset.ir, true); });
    });
  }

  /* ---------- ficha ---------- */

  function seleccionar(id, centrar) {
    var c = D.ciudades[estado.ciudad];
    var t = null;
    for (var i = 0; i < c.tramos.length; i++) if (c.tramos[i].id === id) { t = c.tramos[i]; break; }
    if (!t) return;

    estado.seleccion = id;
    capaFoco.clearLayers();

    var puntos = t.geo.map(function (p) { return [p[1], p[0]]; });
    L.polyline(puntos, { color: "#1b1a17", weight: 8, opacity: .16, lineCap: "round" }).addTo(capaFoco);
    L.polyline(puntos, { color: "#1b1a17", weight: 2, opacity: .9, dashArray: "1 5", lineCap: "round" }).addTo(capaFoco);

    if (centrar) mapa.setView([t.lat, t.lon], Math.max(mapa.getZoom(), 16));

    mostrarFicha(t);
  }

  function mostrarFicha(t) {
    if (ficha) ficha.remove();

    var k = clase(t.score);
    var pct = (t.prob * 100).toFixed(2).replace(".", ",");

    var receptores = t.receptores.length
      ? t.receptores.map(function (r) {
          return '<div class="receptor">' + svg(ICONO[r.tipo] || ICONO.social_facility) +
            '<span>' + r.nombre + '</span><i>' + (RECEPTOR[r.tipo] || r.tipo) + '</i></div>';
        }).join("")
      : '<div class="vacio">Sin receptores sensibles a menos de 160 metros.</div>';

    ficha = document.createElement("aside");
    ficha.className = "ficha";
    ficha.setAttribute("role", "complementary");
    ficha.setAttribute("aria-label", "Detalle del tramo " + t.nombre);
    ficha.innerHTML =
      '<div class="ficha-cabeza">' +
        '<div style="flex:1"><h3>' + t.nombre + '</h3>' +
        '<div class="ficha-id">' + t.id + ' &middot; ' + num(t.largo) + ' m &middot; ' + t.diametro + ' mm</div></div>' +
        '<button class="cerrar" type="button" aria-label="Cerrar">' +
          svg("M4 4l8 8M12 4l-8 8") +
        '</button>' +
      '</div>' +
      '<div class="ficha-cuerpo">' +
        '<div class="puntaje"><b style="color:' + k.color + '">' + t.indice.toFixed(0) + '</b>' +
        '<i>criticidad ' + k.texto.toLowerCase() + ', sobre 100 del peor tramo de la ciudad</i></div>' +
        '<div class="cinta"><div style="transform:scaleX(' + (t.indice / 100) + ');background:' + k.color + '"></div></div>' +

        '<div class="formula">' +
          '<div class="formula-linea"><span>Probabilidad anual de falla</span><b>' + pct + ' %</b></div>' +
          '<div class="formula-op">por</div>' +
          '<div class="formula-linea"><span>Hogares aguas abajo</span><b>' + num(t.hogares) + '</b></div>' +
          '<div class="formula-linea"><span>Factor por receptores</span><b>&times; ' + t.factor.toFixed(2).replace(".", ",") + '</b></div>' +
          '<div class="formula-linea formula-total"><span>Consecuencia</span><b>' + num(t.consecuencia) + ' hogares equivalentes</b></div>' +
        '</div>' +

        '<div class="subtitulo">Atributos del tramo<span class="etiqueta-muestra">muestra</span></div>' +
        '<table class="datos-tabla">' +
          '<tr><th>Material</th><td>' + t.material + '</td></tr>' +
          '<tr><th>Antigüedad</th><td>' + t.antiguedad + ' años</td></tr>' +
          '<tr><th>Última inspección</th><td>hace ' + num(t.dias) + ' dias</td></tr>' +
          '<tr><th>Nivel en la red</th><td>' + (VIA[t.via] || t.via) + '</td></tr>' +
        '</table>' +

        '<div class="subtitulo">Receptores sensibles<span class="etiqueta-muestra" style="border-color:var(--linea);color:var(--tinta-2)">real</span></div>' +
        receptores +
      '</div>';

    document.querySelector(".mapa-zona").appendChild(ficha);
    ficha.querySelector(".cerrar").addEventListener("click", cerrarFicha);
  }

  function cerrarFicha() {
    if (ficha) { ficha.remove(); ficha = null; }
    capaFoco.clearLayers();
    estado.seleccion = null;
  }

  /* ---------- esquema de la solucion ---------- */
  /* La catedra pide el esquema de la solucion dibujado, a alto nivel, en el entendimiento
     del alcance. Se dibuja con los numeros de la ciudad que esta en pantalla para que sea
     el mismo dato que muestra el mapa y no una ilustracion aparte. */

  var ESQ = { ancho: 880, alto: 400 };

  function caja(x, y, an, al, titulo, lineas, nota, motor) {
    var s = '<rect class="' + (motor ? "dibujo-caja-motor" : "dibujo-caja") + '" x="' + x +
      '" y="' + y + '" width="' + an + '" height="' + al + '" rx="4"/>';
    s += '<text class="dibujo-titulo" x="' + (x + 12) + '" y="' + (y + 21) + '">' + titulo + "</text>";
    lineas.forEach(function (l, i) {
      s += '<text class="dibujo-texto" x="' + (x + 12) + '" y="' + (y + 38 + i * 14) + '">' + l + "</text>";
    });
    if (nota) {
      s += '<text class="dibujo-nota" x="' + (x + an - 12) + '" y="' + (y + 21) +
        '" text-anchor="end">' + nota + "</text>";
    }
    return s;
  }

  function flecha(x1, y1, x2, y2) {
    var dx = Math.max(18, (x2 - x1) / 2);
    return '<path class="dibujo-flecha" marker-end="url(#punta)" d="M' + x1 + " " + y1 +
      " C" + (x1 + dx) + " " + y1 + ", " + (x2 - dx) + " " + y2 + ", " + (x2 - 7) + " " + y2 + '"/>';
  }

  function flechaAbajo(x, y1, y2) {
    return '<path class="dibujo-flecha" marker-end="url(#punta)" d="M' + x + " " + y1 +
      "L" + x + " " + (y2 - 7) + '"/>';
  }

  function rotulo(x, texto) {
    return '<text class="dibujo-rotulo" x="' + x + '" y="16">' + texto.toUpperCase() + "</text>";
  }

  function dibujarEsquema() {
    var c = D.ciudades[estado.ciudad];
    var conReceptor = 0;
    c.tramos.forEach(function (t) { if (t.receptores.length) conReceptor++; });

    var X1 = 4, A1 = 236, X2 = 316, A2 = 244, X3 = 636, A3 = 240;

    var s = '<svg viewBox="0 0 ' + ESQ.ancho + " " + ESQ.alto + '" role="img" ' +
      'aria-label="Esquema de la solucion, de las fuentes al motor de calculo y a las salidas">';

    s += '<defs><marker id="punta" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" ' +
      'markerHeight="7" orient="auto"><path d="M0 1L7 4L0 7" fill="none" stroke="#cac3b6" ' +
      'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>';

    s += rotulo(X1, "Fuentes") + rotulo(X2, "Cálculo") + rotulo(X3, "Lo que devuelve");

    /* Las fuentes van en el orden de su destino, para que ninguna flecha cruce a otra. */
    s += caja(X1, 28, A1, 60, "Callejero",
      ["OpenStreetMap, " + num(c.tramos.length) + " tramos", "define el grafo de la red"], "real");
    s += caja(X1, 100, A1, 60, "Reclamos resueltos",
      ["ENARGAS, " + num(D.reclamos_total_grupo_ii) + " reclamos", "de 2018 a 2026"], "real");
    s += caja(X1, 172, A1, 60, "Atributos del caño",
      ["material, antigüedad, diámetro"], "muestra");
    s += caja(X1, 244, A1, 60, "Receptores sensibles",
      ["OpenStreetMap, " + num(c.receptores.length) + " puntos", "escuelas, hospitales, jardines"], "real");
    s += caja(X1, 316, A1, 60, "Hogares por radio censal",
      ["INDEC, censo 2022"], "real");

    /* Los dos factores en columna, con el signo del producto entre ellos. */
    s += caja(X2, 56, A2, 92, "Probabilidad de falla",
      ["tasa base por zona y", "estacionalidad, modulada por", "los atributos del tramo"], null, true);

    s += '<text class="dibujo-formula" style="font-size:17px" x="' + (X2 + A2 / 2) +
      '" y="178" text-anchor="middle">×</text>';

    s += caja(X2, 196, A2, 92, "Consecuencia si falla",
      ["hogares aguas abajo del tramo", "en el grafo, por el factor de", "receptores sensibles"], null, true);

    s += '<rect class="dibujo-caja-motor" x="' + X2 + '" y="326" width="' + A2 + '" height="52" rx="4"/>';
    s += '<text class="dibujo-formula" x="' + (X2 + A2 / 2) + '" y="348" text-anchor="middle">' +
      "criticidad del tramo</text>";
    s += '<text class="dibujo-nota" x="' + (X2 + A2 / 2) + '" y="365" text-anchor="middle">' +
      "un número por tramo, de 0 a 100</text>";

    s += caja(X3, 60, A3, 76, "Capas del visor",
      ["criticidad, receptores y hogares,", "con umbral y desglose por tramo"]);
    s += caja(X3, 164, A3, 76, "Cola de tramos",
      [num(conReceptor) + " de los críticos tienen", "un receptor sensible cerca"]);
    s += caja(X3, 268, A3, 76, "Recorrida del día",
      ["el mejor subconjunto que entra", "en la jornada de la cuadrilla"]);

    // fuentes hacia los dos factores, sin cruces
    s += flecha(X1 + A1, 58, X2, 80);
    s += flecha(X1 + A1, 130, X2, 102);
    s += flecha(X1 + A1, 202, X2, 124);
    s += flecha(X1 + A1, 274, X2, 220);
    s += flecha(X1 + A1, 346, X2, 242);

    // del producto a la criticidad
    s += flechaAbajo(X2 + A2 / 2, 288, 326);

    // de la criticidad a las tres salidas
    s += flecha(X2 + A2, 352, X3, 98);
    s += flecha(X2 + A2, 352, X3, 202);
    s += flecha(X2 + A2, 352, X3, 306);

    s += "</svg>";

    document.getElementById("esquema-cuerpo").innerHTML = s;
  }

  function abrirEsquema() {
    dibujarEsquema();
    document.getElementById("telon").hidden = false;
    document.getElementById("esquema-cerrar").focus();
  }

  function cerrarEsquema() {
    document.getElementById("telon").hidden = true;
  }

  /* ---------- arranque ---------- */

  function cambiarCiudad() {
    var c = D.ciudades[estado.ciudad];
    cerrarFicha();
    dibujarCapas();
    dibujarLeyenda();
    dibujarTop();
    pintar();
    mapa.setView(c.centro, 14);
  }

  function iniciar() {
    var sel = document.getElementById("ciudad");
    Object.keys(D.ciudades).forEach(function (k) {
      var o = document.createElement("option");
      o.value = k;
      o.textContent = D.ciudades[k].nombre;
      sel.appendChild(o);
    });
    sel.value = estado.ciudad;
    sel.addEventListener("change", function () {
      estado.ciudad = sel.value;
      cambiarCiudad();
    });

    var umbral = document.getElementById("umbral");
    umbral.addEventListener("input", function () {
      estado.umbral = +umbral.value;
      document.getElementById("umbral-valor").textContent = estado.umbral;
      pintar();
    });

    document.getElementById("aviso-cerrar").addEventListener("click", function () {
      document.getElementById("aviso").style.display = "none";
      abrirEsquema();
    });
    document.getElementById("btn-procedencia").addEventListener("click", abrirEsquema);
    document.getElementById("esquema-cerrar").addEventListener("click", cerrarEsquema);
    document.getElementById("telon").addEventListener("click", function (e) {
      if (e.target.id === "telon") cerrarEsquema();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!document.getElementById("telon").hidden) cerrarEsquema();
      else cerrarFicha();
    });

    iniciarMapa();
    cambiarCiudad();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
