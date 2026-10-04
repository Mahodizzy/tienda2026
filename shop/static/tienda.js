/* =============================================================
   Refills EC — página principal (catálogo, combos y carrito)
   ============================================================= */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const RF = window.RF;
  const { $, $$, esc, dinero } = RF.util;
  const C = RF.catalogo;
  const V = RF.vista;

  const COMBOS = { id: 'combos', nombre: 'Combos', icono: 'fa-solid fa-layer-group', descripcion: 'Junta pantallas y paga menos' };
  const hayCombos = C.minCombo > 0 && C.elegiblesCombo().length >= C.minCombo;

  /* ---------------- Secciones y categorías ---------------- */
  const categorias = [];
  C.categoriasVisibles().forEach((c) => {
    categorias.push(c);
    if (c.id === 'streaming' && hayCombos) categorias.push(COMBOS);
  });
  if (hayCombos && !categorias.includes(COMBOS)) categorias.unshift(COMBOS);

  const filtros = $('#filter-container');
  filtros.innerHTML = [`<button type="button" class="filter-btn active" data-filter="todo" aria-pressed="true">Todo</button>`]
    .concat(categorias.map((c) => `<button type="button" class="filter-btn" data-filter="${esc(c.id)}" aria-pressed="false" title="${esc(c.nombre)}"><i class="${esc(c.icono)}" aria-hidden="true"></i> ${esc(c.corto || c.nombre)}</button>`))
    .join('');

  const textoBusqueda = (s) => [s.nombre, s.descripcion, ...(s.planes || []).map((p) => p.nombre)].join(' ').toLowerCase();

  function tarjetaHTML(s) {
    const varios = s.planes.length > 1;
    return `<article class="product-card rf-card" data-servicio="${esc(s.id)}" data-buscar="${esc(textoBusqueda(s))}" tabindex="0" role="button" aria-label="Ver planes de ${esc(s.nombre)}">
      ${s.etiqueta ? `<div class="stock-tag available">${esc(s.etiqueta)}</div>` : ''}
      ${s.destacado ? `<div class="rf-destacado">${esc(s.destacado)}</div>` : ''}
      <div class="rf-card-media">${V.portadaHTML(s, null)}</div>
      <div class="rf-card-cuerpo">
        <h3 class="product-name">${esc(s.nombre)}</h3>
        <p class="rf-card-planes">${varios ? `${s.planes.length} planes` : esc(s.planes[0].nombre)}</p>
        <p class="product-price">${varios ? '<span class="rf-desde">desde</span> ' : ''}${dinero(C.precioDesde(s))}</p>
      </div>
      <span class="buy-link" aria-hidden="true"><i class="fa-solid fa-plus"></i></span>
    </article>`;
  }

  function seccionHTML(c) {
    if (c.id === 'combos') return comboSeccionHTML();
    const lista = C.servicios.filter((s) => s.categoria === c.id);
    return `<section class="rf-seccion" id="sec-${esc(c.id)}" data-seccion="${esc(c.id)}">
      <div class="rf-seccion-cabecera">
        <h2 class="rf-seccion-titulo"><i class="${esc(c.icono)}" aria-hidden="true"></i> ${esc(c.nombre)}</h2>
        <p class="rf-seccion-desc">${esc(c.descripcion || '')}</p>
      </div>
      <div class="rf-grid">${lista.map(tarjetaHTML).join('')}</div>
    </section>`;
  }

  /* ---------------- Armador de combos ---------------- */
  function textoRegla(r) {
    if (typeof r.porcentaje === 'number') return `${r.porcentaje}% menos`;
    return `ahorras ${dinero(r.descuento || 0)}`;
  }
  function textoDetalleCombo() {
    const dias = [...new Set(C.elegiblesCombo().map((s) => C.planCombo(s).dias).filter(Boolean))];
    return dias.length === 1
      ? `Cada servicio entra con 1 pantalla por ${dias[0]} días.`
      : 'Cada servicio entra con su plan de 1 pantalla.';
  }
  function comboSeccionHTML() {
    const elegibles = C.elegiblesCombo();
    const populares = (RF.CAT.combosDestacados || [])
      .map((c) => ({ ids: c.servicios || [], info: C.precioCombo(c.servicios || []) }))
      .filter((c) => c.info);
    return `<section class="rf-seccion rf-seccion-combos" id="sec-combos" data-seccion="combos">
      <div class="rf-seccion-cabecera">
        <h2 class="rf-seccion-titulo"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> Arma tu combo</h2>
        <p class="rf-seccion-desc">Elige ${C.minCombo} o más pantallas y paga menos que por separado.</p>
        <div class="rf-reglas">${C.reglas.map((r) => `<span class="rf-regla"><b>${r.cantidad} servicios</b> ${esc(textoRegla(r))}</span>`).join('')}</div>
      </div>
      <div class="rf-combo">
        <div class="rf-combo-opciones" role="group" aria-label="Servicios para tu combo">
          ${elegibles.map((s) => {
            const p = C.planCombo(s);
            return `<button type="button" class="rf-combo-opcion" data-combo-id="${esc(s.id)}" aria-pressed="false">
              <span class="rf-combo-opcion-img">${V.miniaturaHTML(s, p)}</span>
              <span class="rf-combo-opcion-nombre">${esc(s.nombre)}</span>
              <span class="rf-combo-opcion-precio">${dinero(p.precio)}</span>
              <span class="rf-combo-check" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
            </button>`;
          }).join('')}
        </div>
        <div class="rf-combo-resumen" aria-live="polite">
          <div class="rf-combo-slots" data-combo-slots></div>
          <p class="rf-combo-nombre" data-combo-nombre>Elige tu primer servicio</p>
          <p class="rf-combo-detalle" data-combo-detalle>${esc(textoDetalleCombo())}</p>
          <div class="rf-combo-precio" data-combo-precio hidden><s data-combo-antes></s><strong data-combo-ahora></strong></div>
          <p class="rf-combo-ahorro" data-combo-ahorro hidden></p>
          <p class="rf-combo-pista" data-combo-pista></p>
          <button type="button" class="rf-btn rf-btn-primario" data-combo-agregar disabled><i class="fa-solid fa-cart-plus"></i> Agregar combo</button>
        </div>
      </div>
      ${populares.length ? `<div class="rf-populares">
        <h3 class="rf-subtitulo">Combos populares</h3>
        <div class="rf-populares-lista">
          ${populares.map((c) => `<div class="rf-popular">
            <div class="rf-popular-imgs">${c.ids.map((id) => `<span>${V.miniaturaHTML(C.servicioPorId(id), C.planCombo(C.servicioPorId(id)))}</span>`).join('')}</div>
            <div class="rf-popular-texto">
              <strong>${esc(c.ids.map((id) => C.servicioPorId(id).nombre).join(' + '))}</strong>
              <span>${esc(c.info.nombre)}: <s>${dinero(c.info.normal)}</s> <b>${dinero(c.info.precio)}</b></span>
            </div>
            <button type="button" class="rf-btn rf-btn-sec" data-popular="${esc(c.ids.join('+'))}">Agregar</button>
          </div>`).join('')}
        </div>
      </div>` : ''}
    </section>`;
  }

  const catalogo = $('#rf-catalogo');
  catalogo.innerHTML = categorias.map(seccionHTML).join('');

  let seleccion = [];
  let ultimoAgregado = null;
  function pintarCombo() {
    const zona = $('#sec-combos');
    if (!zona) return;
    $$('.rf-combo-opcion', zona).forEach((b) => {
      const activo = seleccion.includes(b.dataset.comboId);
      b.classList.toggle('activo', activo);
      b.setAttribute('aria-pressed', String(activo));
      b.classList.toggle('bloqueado', !activo && seleccion.length >= C.maxCombo);
    });
    const slots = [];
    for (let i = 0; i < C.maxCombo; i++) {
      const id = seleccion[i];
      if (id) {
        const s = C.servicioPorId(id);
        slots.push(`<span class="rf-slot lleno${id === ultimoAgregado ? ' nuevo' : ''}" title="${esc(s.nombre)}">${V.miniaturaHTML(s, C.planCombo(s))}</span>`);
      } else slots.push('<span class="rf-slot"><i class="fa-solid fa-plus" aria-hidden="true"></i></span>');
    }
    $('[data-combo-slots]', zona).innerHTML = slots.join('');
    ultimoAgregado = null;

    const nombre = $('[data-combo-nombre]', zona);
    const antes = $('[data-combo-antes]', zona);
    const ahora = $('[data-combo-ahora]', zona);
    const ahorro = $('[data-combo-ahorro]', zona);
    const pista = $('[data-combo-pista]', zona);
    const boton = $('[data-combo-agregar]', zona);
    const normal = seleccion.reduce((a, id) => a + C.planCombo(C.servicioPorId(id)).precio, 0);

    if (seleccion.length < C.minCombo) {
      const faltan = C.minCombo - seleccion.length;
      nombre.textContent = seleccion.length ? `Elige ${faltan} más` : 'Elige tu primer servicio';
      antes.textContent = '';
      ahora.textContent = dinero(normal);
      $('[data-combo-precio]', zona).hidden = !seleccion.length;
      ahorro.hidden = true;
      const primera = C.reglas[0];
      pista.textContent = primera && typeof primera.descuento === 'number'
        ? `Con ${primera.cantidad} servicios ahorras ${dinero(primera.descuento)}.`
        : '';
      boton.disabled = true;
      return;
    }
    const info = C.precioCombo(seleccion);
    $('[data-combo-precio]', zona).hidden = false;
    nombre.textContent = info.nombre;
    antes.textContent = info.ahorro > 0 ? dinero(info.normal) : '';
    ahora.textContent = dinero(info.precio);
    ahorro.hidden = !(info.ahorro > 0);
    ahorro.textContent = `Ahorras ${dinero(info.ahorro)}`;
    const siguiente = C.reglas.find((r) => r.cantidad === seleccion.length + 1);
    if (siguiente) {
      pista.textContent = typeof siguiente.descuento === 'number'
        ? `Agrega 1 más y ahorras ${dinero(siguiente.descuento)} con el ${siguiente.nombre}.`
        : `Agrega 1 más para el ${siguiente.nombre}.`;
    } else pista.textContent = 'Tienes el combo más grande.';
    boton.disabled = false;
  }

  catalogo.addEventListener('click', (e) => {
    const opcion = e.target.closest('.rf-combo-opcion');
    if (opcion) {
      const id = opcion.dataset.comboId;
      if (seleccion.includes(id)) seleccion = seleccion.filter((x) => x !== id);
      else if (seleccion.length >= C.maxCombo) { RF.toast(`Un combo puede tener hasta ${C.maxCombo} servicios.`, { tipo: 'info' }); return; }
      else { seleccion.push(id); ultimoAgregado = id; }
      pintarCombo();
      return;
    }
    if (e.target.closest('[data-combo-agregar]')) {
      const info = RF.carrito.agregarCombo(seleccion);
      if (info) {
        avisoAgregado(`${info.nombre} agregado: ahorras ${dinero(info.ahorro)}`);
        seleccion = [];
        pintarCombo();
      }
      return;
    }
    const popular = e.target.closest('[data-popular]');
    if (popular) {
      const info = RF.carrito.agregarCombo(popular.dataset.popular.split('+'));
      if (info) avisoAgregado(`${info.nombre} agregado: ahorras ${dinero(info.ahorro)}`);
      return;
    }
    const tarjeta = e.target.closest('.rf-card');
    if (tarjeta) abrirFicha(tarjeta.dataset.servicio);
  });
  catalogo.addEventListener('keydown', (e) => {
    const tarjeta = e.target.closest('.rf-card');
    if (tarjeta && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirFicha(tarjeta.dataset.servicio); }
  });
  pintarCombo();

  /* ---------------- Filtros y búsqueda ---------------- */
  let filtro = 'todo';
  let busqueda = '';
  const sinResultados = $('#rf-sin-resultados');

  function aplicarFiltros() {
    let visibles = 0;
    $$('.rf-seccion', catalogo).forEach((sec) => {
      const id = sec.dataset.seccion;
      const porFiltro = filtro === 'todo' || filtro === id;
      if (id === 'combos') {
        const mostrar = porFiltro && (!busqueda || 'combo combos dúo duo trío trio'.includes(busqueda));
        sec.hidden = !mostrar;
        if (mostrar) visibles++;
        return;
      }
      let enSeccion = 0;
      $$('.rf-card', sec).forEach((card) => {
        const ok = !busqueda || card.dataset.buscar.includes(busqueda);
        card.hidden = !ok;
        if (ok) enSeccion++;
      });
      sec.hidden = !porFiltro || enSeccion === 0;
      if (!sec.hidden) visibles++;
    });
    sinResultados.hidden = visibles > 0;
  }
  filtros.addEventListener('click', (e) => {
    const b = e.target.closest('.filter-btn');
    if (!b) return;
    filtro = b.dataset.filter;
    $$('.filter-btn', filtros).forEach((x) => {
      const activo = x === b;
      x.classList.toggle('active', activo);
      x.setAttribute('aria-pressed', String(activo));
    });
    aplicarFiltros();
    const tope = catalogo.getBoundingClientRect().top;
    if (tope < 0) catalogo.scrollIntoView({ behavior: RF.util.movimientoReducido ? 'auto' : 'smooth', block: 'start' });
  });
  $('#search-input').addEventListener('input', (e) => {
    busqueda = e.target.value.toLowerCase().trim();
    aplicarFiltros();
  });

  /* ---------------- Ficha del producto (selector de plan) ---------------- */
  document.body.insertAdjacentHTML('beforeend', `
    <div class="rf-ficha-fondo" id="rf-ficha" hidden>
      <div class="rf-ficha" role="dialog" aria-modal="true" aria-labelledby="rf-ficha-titulo">
        <button type="button" class="rf-ficha-cerrar" data-ficha-cerrar aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        <div class="rf-ficha-media" data-ficha-media></div>
        <div class="rf-ficha-cuerpo">
          <h2 class="rf-ficha-titulo" id="rf-ficha-titulo" data-ficha-titulo></h2>
          <p class="rf-ficha-desc" data-ficha-desc></p>
          <fieldset class="rf-planes">
            <legend>Elige tu plan</legend>
            <div class="rf-planes-lista" data-ficha-planes></div>
          </fieldset>
          <div class="rf-campos" data-ficha-campos></div>
          <div class="rf-ficha-cantidad">
            <span>Cantidad</span>
            <div class="quantity-controls">
              <button type="button" class="btn-qty" data-ficha-menos aria-label="Quitar uno">−</button>
              <span class="qty-number" data-ficha-cantidad>1</span>
              <button type="button" class="btn-qty" data-ficha-mas aria-label="Agregar uno">+</button>
            </div>
          </div>
          <p class="rf-ficha-pista" data-ficha-pista hidden></p>
        </div>
        <div class="rf-ficha-pie">
          <div class="rf-ficha-total"><span>Total</span><strong data-ficha-total>$ 0,00</strong></div>
          <button type="button" class="rf-btn rf-btn-primario" data-ficha-agregar><i class="fa-solid fa-cart-plus"></i> Agregar al carrito</button>
        </div>
      </div>
    </div>`);

  const ficha = $('#rf-ficha');
  let fichaEstado = null;
  let focoPrevio = null;

  function pintarFicha() {
    const { s, plan, cantidad } = fichaEstado;
    const src = (plan && plan.imagen) || s.imagen;
    $('[data-ficha-media]', ficha).innerHTML = src
      ? `<img src="${esc(src)}" class="rf-ficha-difuso" alt="" aria-hidden="true"><img src="${esc(src)}" class="rf-ficha-img" alt="${esc(s.nombre)}">`
      : V.portadaHTML(s, plan);
    $('[data-ficha-cantidad]', ficha).textContent = cantidad;
    $('[data-ficha-total]', ficha).textContent = dinero(plan.precio * cantidad);
    $$('.rf-plan', ficha).forEach((l) => l.classList.toggle('activo', l.dataset.plan === plan.id));
    const pista = $('[data-ficha-pista]', ficha);
    if (hayCombos && plan.combo && C.reglas[0]) {
      const r = C.reglas[0];
      pista.innerHTML = `Combínalo con otra pantalla y ${esc(textoRegla(r))}. <a href="#sec-combos" data-ir-combos>Arma tu combo</a>`;
      pista.hidden = false;
    } else pista.hidden = true;
  }

  function abrirFicha(id) {
    const s = C.servicioPorId(id);
    if (!s) return;
    focoPrevio = document.activeElement;
    fichaEstado = { s, plan: s.planes[0], cantidad: 1 };
    $('[data-ficha-titulo]', ficha).textContent = s.nombre;
    $('[data-ficha-desc]', ficha).textContent = s.descripcion || '';
    $('[data-ficha-planes]', ficha).innerHTML = s.planes.map((p, i) => `
      <label class="rf-plan" data-plan="${esc(p.id)}">
        <input type="radio" name="rf-plan" value="${esc(p.id)}" ${i === 0 ? 'checked' : ''}>
        <span class="rf-plan-nombre">${esc(p.nombre)}</span>
        <span class="rf-plan-precio">${dinero(p.precio)}</span>
        ${p.dias ? `<span class="rf-plan-dias">${p.dias} días</span>` : ''}
      </label>`).join('');
    $('[data-ficha-campos]', ficha).innerHTML = (s.campos || []).map((c) => `
      <label class="rf-campo">
        <span>${esc(c.etiqueta)}</span>
        <input type="text" data-campo="${esc(c.id)}" placeholder="${esc(c.ejemplo || '')}" ${c.patron ? `data-patron="${esc(c.patron)}"` : ''} inputmode="${c.patron && /\[0-9\]/.test(c.patron) ? 'numeric' : 'text'}" autocomplete="off">
        <small class="rf-campo-error" data-error-campo="${esc(c.id)}"></small>
      </label>`).join('');
    pintarFicha();
    ficha.hidden = false;
    document.body.classList.add('rf-sin-scroll');
    requestAnimationFrame(() => {
      ficha.classList.add('abierta');
      const primero = $('input[name="rf-plan"]:checked', ficha);
      if (primero) primero.focus();
    });
  }
  function cerrarFicha() {
    ficha.classList.remove('abierta');
    document.body.classList.remove('rf-sin-scroll');
    setTimeout(() => { ficha.hidden = true; }, RF.util.movimientoReducido ? 0 : 220);
    if (focoPrevio && focoPrevio.focus) focoPrevio.focus();
  }

  ficha.addEventListener('click', (e) => {
    if (e.target === ficha || e.target.closest('[data-ficha-cerrar]')) { cerrarFicha(); return; }
    if (e.target.closest('[data-ficha-menos]')) { fichaEstado.cantidad = Math.max(1, fichaEstado.cantidad - 1); pintarFicha(); return; }
    if (e.target.closest('[data-ficha-mas]')) { fichaEstado.cantidad = Math.min(20, fichaEstado.cantidad + 1); pintarFicha(); return; }
    if (e.target.closest('[data-ir-combos]')) {
      e.preventDefault();
      cerrarFicha();
      activarFiltro('combos');
      return;
    }
    if (e.target.closest('[data-ficha-agregar]')) agregarDesdeFicha();
  });
  ficha.addEventListener('change', (e) => {
    if (e.target.name === 'rf-plan') {
      fichaEstado.plan = C.planPorId(fichaEstado.s, e.target.value);
      pintarFicha();
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ficha.hidden) cerrarFicha(); });

  function agregarDesdeFicha() {
    const { s, plan, cantidad } = fichaEstado;
    const datos = {};
    let valido = true;
    $$('[data-campo]', ficha).forEach((input) => {
      const valor = input.value.trim();
      const error = $(`[data-error-campo="${input.dataset.campo}"]`, ficha);
      const campo = (s.campos || []).find((c) => c.id === input.dataset.campo) || {};
      let mensaje = '';
      const etq = campo.etiqueta || 'dato';
      const primera = etq.split(' ')[0];
      const nombreCampo = primera === primera.toUpperCase() ? etq : etq.charAt(0).toLowerCase() + etq.slice(1);
      if (!valor) mensaje = `Escribe tu ${nombreCampo}.`;
      else if (input.dataset.patron && !new RegExp(input.dataset.patron).test(valor)) mensaje = campo.ayuda ? `${campo.ayuda}.` : 'Revisa este dato.';
      error.textContent = mensaje;
      input.classList.toggle('con-error', !!mensaje);
      if (mensaje) { if (valido) input.focus(); valido = false; }
      datos[input.dataset.campo] = valor;
    });
    if (!valido) return;
    RF.carrito.agregarPlan(s.id, plan.id, cantidad, datos);
    cerrarFicha();
    avisoAgregado(`${s.nombre}: ${plan.nombre} agregado`);
  }

  function activarFiltro(id) {
    const b = $(`.filter-btn[data-filter="${id}"]`, filtros);
    if (b) b.click();
    const sec = $(`#sec-${id}`);
    if (sec) sec.scrollIntoView({ behavior: RF.util.movimientoReducido ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---------------- Carrito ---------------- */
  const cajon = $('#cart-drawer');
  const fondoCarrito = $('#cart-overlay');
  const lista = $('#cart-items');
  const contador = $('.contador-carrito');

  function abrirCarrito() {
    RF.cerrarAvisos();
    cajon.classList.add('open');
    cajon.setAttribute('aria-hidden', 'false');
    fondoCarrito.classList.add('show');
    document.body.classList.add('rf-sin-scroll');
  }
  function cerrarCarrito() {
    cajon.classList.remove('open');
    cajon.setAttribute('aria-hidden', 'true');
    fondoCarrito.classList.remove('show');
    document.body.classList.remove('rf-sin-scroll');
  }
  function avisoAgregado(texto) {
    contador.classList.remove('cart-pop');
    void contador.offsetWidth;
    contador.classList.add('cart-pop');
    RF.toast(texto, { accion: { texto: 'Ver carrito', fn: abrirCarrito } });
  }

  function lineaHTML(l) {
    const media = l.tipo === 'combo'
      ? `<div class="rf-linea-media rf-apiladas">${l.partes.map((x) => `<span>${V.miniaturaHTML(x.servicio, x.plan)}</span>`).join('')}</div>`
      : `<div class="rf-linea-media">${V.miniaturaHTML(l.servicio, l.plan)}</div>`;
    const datos = Object.keys(l.datos || {}).map((k) => `<p class="rf-linea-dato">${esc(C.etiquetaCampo(l.servicio, k))}: ${esc(l.datos[k])}</p>`).join('');
    return `<div class="cart-item rf-linea">
      ${media}
      <div class="item-info">
        <p class="item-name">${esc(l.titulo)}</p>
        <p class="rf-linea-detalle">${esc(l.detalle)}</p>
        ${datos}
        <div class="quantity-controls">
          <button type="button" class="btn-qty" data-accion="menos" data-clave="${esc(l.clave)}" aria-label="Quitar uno">−</button>
          <span class="qty-number">${l.cantidad}</span>
          <button type="button" class="btn-qty" data-accion="mas" data-clave="${esc(l.clave)}" aria-label="Agregar uno">+</button>
        </div>
      </div>
      <div class="rf-linea-lado">
        <p class="item-price">${dinero(l.subtotal)}</p>
        ${l.ahorro > 0 ? `<s class="rf-linea-antes">${dinero(l.normalUnit * l.cantidad)}</s>` : ''}
        <button type="button" class="btn-remove-item" data-accion="quitar" data-clave="${esc(l.clave)}" aria-label="Quitar ${esc(l.titulo)}"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    </div>`;
  }

  function pintarCarrito() {
    const r = RF.carrito.resumen();
    contador.textContent = r.unidades;
    const boton = $('#btn-finalize-order');
    const sug = $('#rf-sugerencia');
    if (!r.lineas.length) {
      lista.innerHTML = `<div class="rf-carrito-vacio">
        <i class="fa-solid fa-cart-shopping" aria-hidden="true"></i>
        <p>Tu carrito está vacío.</p>
        <button type="button" class="rf-btn rf-btn-sec" data-cerrar-carrito>Ver servicios</button>
      </div>`;
      $('#cart-total-amount').textContent = dinero(0);
      $('#rf-ahorro').hidden = true;
      sug.hidden = true;
      boton.disabled = true;
      return;
    }
    lista.innerHTML = r.lineas.map(lineaHTML).join('');
    $('#cart-total-amount').textContent = dinero(r.total);
    $('#rf-ahorro').hidden = !(r.ahorro > 0);
    $('#rf-ahorro-monto').textContent = dinero(r.ahorro);
    boton.disabled = false;
    const s = RF.carrito.sugerencia();
    if (s) {
      const nombres = s.ids.map((id) => C.servicioPorId(id).nombre);
      sug.innerHTML = `<p>Tienes ${esc(nombres.join(' y '))} por separado. Únelos en un ${esc(s.info.nombre)} y ahorra <b>${dinero(s.info.ahorro)}</b>.</p>
        <button type="button" class="rf-btn rf-btn-sec" data-unir-combo>Unir en combo</button>`;
      sug.hidden = false;
    } else sug.hidden = true;
  }

  lista.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (b) {
      const clave = b.dataset.clave;
      if (b.dataset.accion === 'mas') RF.carrito.cambiarCantidad(clave, 1);
      else if (b.dataset.accion === 'menos') RF.carrito.cambiarCantidad(clave, -1);
      else if (b.dataset.accion === 'quitar') RF.carrito.quitar(clave);
      return;
    }
    if (e.target.closest('[data-cerrar-carrito]')) cerrarCarrito();
  });
  $('#rf-sugerencia').addEventListener('click', (e) => {
    if (!e.target.closest('[data-unir-combo]')) return;
    const s = RF.carrito.aplicarSugerencia();
    if (s) RF.toast(`${s.info.nombre} aplicado: ahorras ${dinero(s.info.ahorro)}`);
  });
  $('#btn-abrir-carrito').addEventListener('click', abrirCarrito);
  $('#close-cart').addEventListener('click', cerrarCarrito);
  fondoCarrito.addEventListener('click', cerrarCarrito);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cajon.classList.contains('open')) cerrarCarrito(); });
  $('#btn-finalize-order').addEventListener('click', () => {
    if (!RF.carrito.resumen().lineas.length) { RF.toast('Tu carrito está vacío.', { tipo: 'info' }); return; }
    window.location.href = 'pago.html';
  });
  document.addEventListener('rf:carrito', pintarCarrito);
  window.addEventListener('storage', (e) => { if (e.key === 'refills_carrito_v2') pintarCarrito(); });
  pintarCarrito();

  /* ---------------- Reseñas ---------------- */
  const resenas = [
    { name: 'Ariel Galarza Guaranda', initials: 'AG', img: 'https://lh3.googleusercontent.com/a-/ALV-UjU9snpb9693-kvLKSMSOvWssueMooV5GKaCKIL_qK50SN6XJxUk=w36-h36-p-rp-mo-br100', text: 'El mejor distribuidor de cuentas, más efectivo que un buen encebollado cuando andas con chuchaqui 👐🏻…', date: '2026-03-03' },
    { name: 'Beckeer Romero', initials: 'B', img: '', text: 'lo mejor de lo mejor seguro y confiable se los recomiendo', date: '2026-03-05' },
    { name: 'Alex Gutierrez', initials: 'A', img: '', text: 'Buen servicio, buenos precios, son los mejores🙌', date: '2026-03-05' },
    { name: 'Sebastian Rodriguez', initials: 'S', img: '', text: 'Increíble y confiable la mejor experiencia', date: '2026-03-17' },
    { name: 'Leonel Palencia', initials: 'L', img: '', text: 'Super recomendado , 10000/10 el servicio, pronto y seguro 💥✨', date: '2026-03-17' },
    { name: 'Andrea Itzel', initials: 'A', img: '', text: 'MUY RECOMENDABLE 100% CONFIABLE', date: '2026-03-17' },
    { name: 'Victor Arias', initials: 'V', img: '', text: 'Exelente atención al cliente. Me atendieron con mucha amabilidad y el servicio fue muy confiable. Lo recomiendo.', date: '2026-03-17' }
  ];
  function tiempoResena(fecha) {
    const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
    if (dias <= 0) return 'Hoy';
    if (dias < 7) return `Hace ${dias} días`;
    if (dias < 60) { const s = Math.floor(dias / 7); return `Hace ${s} ${s === 1 ? 'semana' : 'semanas'}`; }
    const m = Math.floor(dias / 30);
    return `Hace ${m} meses`;
  }
  const rejilla = $('#reviews-grid');
  if (rejilla) {
    rejilla.innerHTML = resenas.concat(resenas).map((r) => `
      <div class="review-card">
        <div class="review-header">
          <div class="review-avatar">${r.img ? `<img src="${esc(r.img)}" class="avatar-img" alt="">` : `<span>${esc(r.initials)}</span>`}</div>
          <div class="review-info">
            <h4>${esc(r.name)}</h4>
            <div class="review-stars"><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i></div>
          </div>
        </div>
        <p class="review-body">"${esc(r.text)}"</p>
        <div class="review-footer"><span>${tiempoResena(r.date)}</span><img src="https://www.svgrepo.com/show/475656/google-color.svg" width="16" alt="Google"></div>
      </div>`).join('');
  }

  /* ---------------- Enlaces directos (#pedidos, #combos) ---------------- */
  if (location.hash === '#pedidos') {
    RF.sesion.alCambiar(function abrirUnaVez(u) {
      if (abrirUnaVez.hecho) return;
      abrirUnaVez.hecho = true;
      if (u) RF.sesion.abrirPerfil();
      else RF.sesion.abrirAuth('Inicia sesión para ver tus pedidos.');
    });
  } else if (location.hash === '#combos' && hayCombos) {
    setTimeout(() => activarFiltro('combos'), 200);
  } else if (location.hash === '#carrito') {
    setTimeout(abrirCarrito, 150);
  }

  const cargador = $('#loader-overlay');
  if (cargador) setTimeout(() => cargador.classList.add('loader-hidden'), 250);
});
