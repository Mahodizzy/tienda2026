/* =============================================================
   Refills EC — núcleo compartido por todas las páginas
   (precios, combos, carrito, sesión, perfil, avisos, partículas)
   ============================================================= */
(function () {
  'use strict';

  const CONFIG = window.REFILLS_CONFIG || {};
  let CAT = window.REFILLS_CATALOGO || { categorias: [], servicios: [], reglasCombo: [], combosDestacados: [] };

  /* ---------------- Utilidades ---------------- */
  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const dinero = (n) => '$ ' + redondear(n).toFixed(2).replace('.', ',');
  const movimientoReducido = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const whatsappUrl = (texto) => `https://wa.me/${CONFIG.whatsapp || ''}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;

  function aFecha(v) {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    if (v instanceof Date) return v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function fechaCorta(v) {
    const d = aFecha(v);
    return d ? d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  }
  function fechaHora(v) {
    const d = aFecha(v);
    return d ? d.toLocaleString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  }
  function haceCuanto(v) {
    const d = aFecha(v);
    if (!d) return '';
    const min = Math.floor((Date.now() - d.getTime()) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const dias = Math.floor(h / 24);
    if (dias === 1) return 'ayer';
    if (dias < 7) return `hace ${dias} días`;
    return fechaCorta(d);
  }
  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch (e) {
      const area = document.createElement('textarea');
      area.value = texto;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); } catch (err) { /* sin acceso */ }
      area.remove();
    }
    toast('Copiado');
  }

  /* ---------------- Catálogo y precios ---------------- */
  const verEjemplos = CONFIG.mostrarProductosDeEjemplo !== false;
  let origenDatos = 'archivo'; // 'firebase' (panel), 'copia' (guardada) o 'archivo' (catalogo.js)
  let servicios = [];
  let reglas = [];
  let minCombo = 0;
  let maxCombo = 0;
  function prepararCatalogo() {
    servicios = (CAT.servicios || []).filter((s) => s && s.activo !== false
      && Array.isArray(s.planes) && s.planes.length
      && (origenDatos !== 'archivo' || verEjemplos || !s.ejemplo));
    reglas = (CAT.reglasCombo || []).filter((r) => r && r.cantidad >= 2).slice().sort((a, b) => a.cantidad - b.cantidad);
    minCombo = reglas.length ? reglas[0].cantidad : 0;
    maxCombo = reglas.length ? reglas[reglas.length - 1].cantidad : 0;
  }
  prepararCatalogo();
  const servicioPorId = (id) => servicios.find((s) => s.id === id) || null;
  const planPorId = (s, id) => (s && Array.isArray(s.planes) ? s.planes.find((p) => p.id === id) : null) || null;
  const planCombo = (s) => (s && Array.isArray(s.planes) ? s.planes.find((p) => p.combo) : null) || null;
  const precioDesde = (s) => Math.min(...s.planes.map((p) => p.precio));
  const elegiblesCombo = () => servicios.filter((s) => planCombo(s));
  const reglaPara = (n) => reglas.find((r) => r.cantidad === n) || null;
  const claveCombo = (ids) => ids.slice().sort().join('+');

  function categoriasVisibles() {
    return (CAT.categorias || []).filter((c) => servicios.some((s) => s.categoria === c.id));
  }

  function precioCombo(ids) {
    if (!Array.isArray(ids) || ids.length < 2) return null;
    if (new Set(ids).size !== ids.length) return null;
    const svcs = ids.map(servicioPorId);
    if (svcs.some((s) => !s || !planCombo(s))) return null;
    const normal = redondear(svcs.reduce((acc, s) => acc + planCombo(s).precio, 0));
    const destacado = (CAT.combosDestacados || []).find((c) => claveCombo(c.servicios || []) === claveCombo(ids));
    const regla = reglaPara(ids.length);
    let precio = normal;
    if (destacado && typeof destacado.precio === 'number') precio = destacado.precio;
    else if (regla && typeof regla.porcentaje === 'number') precio = normal * (1 - regla.porcentaje / 100);
    else if (regla) precio = normal - (regla.descuento || 0);
    precio = Math.max(0, redondear(precio));
    return {
      normal,
      precio,
      ahorro: redondear(normal - precio),
      nombre: (destacado && destacado.nombre) || (regla && regla.nombre) || 'Combo'
    };
  }

  // Ahorro que tendría un combo de n servicios con precio normal dado (para las pistas).
  function ahorroRegla(n, normal) {
    const r = reglaPara(n);
    if (!r) return 0;
    if (typeof r.porcentaje === 'number') return redondear(normal * r.porcentaje / 100);
    return redondear(Math.min(normal, r.descuento || 0));
  }

  /* ---------------- Carrito ---------------- */
  const CLAVE_CARRITO = 'refills_carrito_v2';
  try { localStorage.removeItem('refills_cart'); localStorage.removeItem('refills_total'); } catch (e) { /* formato viejo */ }

  function datosLimpios(datos) {
    const salida = {};
    Object.keys(datos || {}).sort().forEach((k) => {
      const v = String(datos[k] ?? '').trim();
      if (v) salida[k] = v.slice(0, 120);
    });
    return salida;
  }
  function itemValido(it) {
    if (!it || typeof it !== 'object') return false;
    if (!(Number.isInteger(it.cantidad) && it.cantidad > 0 && it.cantidad <= 20)) return false;
    if (it.tipo === 'combo') return !!precioCombo(it.servicios);
    if (it.tipo === 'plan') return !!planPorId(servicioPorId(it.servicio), it.plan);
    return false;
  }
  function leerCarrito() {
    try {
      const c = JSON.parse(localStorage.getItem(CLAVE_CARRITO) || '[]');
      return Array.isArray(c) ? c.filter(itemValido) : [];
    } catch (e) { return []; }
  }
  function guardarCarrito(c) {
    try { localStorage.setItem(CLAVE_CARRITO, JSON.stringify(c)); } catch (e) { /* almacenamiento lleno */ }
    document.dispatchEvent(new CustomEvent('rf:carrito'));
  }
  function agregarPlan(servicioId, planId, cantidad = 1, datos = {}) {
    const s = servicioPorId(servicioId);
    const p = planPorId(s, planId);
    if (!p) return null;
    const limpios = datosLimpios(datos);
    const clave = `p|${servicioId}|${planId}|${JSON.stringify(limpios)}`;
    const carrito = leerCarrito();
    const existente = carrito.find((x) => x.clave === clave);
    if (existente) existente.cantidad = Math.min(20, existente.cantidad + cantidad);
    else carrito.push({ clave, tipo: 'plan', servicio: servicioId, plan: planId, cantidad: Math.min(20, cantidad), datos: limpios });
    guardarCarrito(carrito);
    return { servicio: s, plan: p };
  }
  function agregarCombo(ids, cantidad = 1) {
    const info = precioCombo(ids);
    if (!info) return null;
    const clave = `c|${ids.slice().sort().join('+')}`;
    const carrito = leerCarrito();
    const existente = carrito.find((x) => x.clave === clave);
    if (existente) existente.cantidad = Math.min(20, existente.cantidad + cantidad);
    else carrito.push({ clave, tipo: 'combo', servicios: ids.slice(), cantidad });
    guardarCarrito(carrito);
    return info;
  }
  function cambiarCantidad(clave, delta) {
    const carrito = leerCarrito();
    const it = carrito.find((x) => x.clave === clave);
    if (!it) return;
    it.cantidad = Math.max(1, Math.min(20, it.cantidad + delta));
    guardarCarrito(carrito);
  }
  function quitarDelCarrito(clave) {
    guardarCarrito(leerCarrito().filter((x) => x.clave !== clave));
  }
  function vaciarCarrito() { guardarCarrito([]); }

  function lineaDe(it) {
    if (it.tipo === 'combo') {
      const info = precioCombo(it.servicios);
      if (!info) return null;
      const partes = it.servicios.map((id) => { const s = servicioPorId(id); return { servicio: s, plan: planCombo(s) }; });
      return {
        clave: it.clave, tipo: 'combo', cantidad: it.cantidad,
        titulo: info.nombre,
        detalle: partes.map((x) => x.servicio.nombre).join(' + '),
        partes,
        precioUnit: info.precio, normalUnit: info.normal,
        subtotal: redondear(info.precio * it.cantidad),
        ahorro: redondear(info.ahorro * it.cantidad),
        datos: {}
      };
    }
    const s = servicioPorId(it.servicio);
    const p = planPorId(s, it.plan);
    if (!p) return null;
    return {
      clave: it.clave, tipo: 'plan', cantidad: it.cantidad,
      titulo: s.nombre, detalle: p.nombre, servicio: s, plan: p,
      precioUnit: p.precio, normalUnit: p.precio,
      subtotal: redondear(p.precio * it.cantidad), ahorro: 0,
      datos: it.datos || {}
    };
  }
  function resumenCarrito(carrito = leerCarrito()) {
    const lineas = carrito.map(lineaDe).filter(Boolean);
    const total = redondear(lineas.reduce((a, l) => a + l.subtotal, 0));
    const ahorro = redondear(lineas.reduce((a, l) => a + l.ahorro, 0));
    const unidades = lineas.reduce((a, l) => a + l.cantidad, 0);
    return { lineas, total, ahorro, normal: redondear(total + ahorro), unidades };
  }
  function etiquetaCampo(servicio, campoId) {
    const c = (servicio && servicio.campos || []).find((x) => x.id === campoId);
    return c ? c.etiqueta : campoId;
  }

  // Si el carrito tiene pantallas sueltas que forman un combo, lo sugiere.
  function sugerenciaCombo(carrito = leerCarrito()) {
    if (!reglas.length) return null;
    const ids = [];
    carrito.forEach((it) => {
      if (it.tipo !== 'plan' || Object.keys(it.datos || {}).length) return;
      const s = servicioPorId(it.servicio);
      const pc = planCombo(s);
      if (pc && pc.id === it.plan && !ids.includes(s.id)) ids.push(s.id);
    });
    if (ids.length < minCombo) return null;
    const elegidos = ids.slice(0, maxCombo);
    const info = precioCombo(elegidos);
    return info && info.ahorro > 0 ? { ids: elegidos, info } : null;
  }
  function aplicarSugerencia() {
    const sug = sugerenciaCombo();
    if (!sug) return null;
    let carrito = leerCarrito();
    sug.ids.forEach((id) => {
      const planId = planCombo(servicioPorId(id)).id;
      const it = carrito.find((x) => x.tipo === 'plan' && x.servicio === id && x.plan === planId && !Object.keys(x.datos || {}).length);
      if (it) it.cantidad -= 1;
    });
    carrito = carrito.filter((x) => x.cantidad > 0);
    try { localStorage.setItem(CLAVE_CARRITO, JSON.stringify(carrito)); } catch (e) { /* lleno */ }
    agregarCombo(sug.ids);
    return sug;
  }

  /* ---------------- Portadas e imágenes ---------------- */
  function portadaHTML(s, plan, clase = '') {
    const src = (plan && plan.imagen) || (s && s.imagen);
    if (src) return `<img src="${esc(src)}" alt="${esc(s.nombre)}" class="${clase}" loading="lazy" decoding="async">`;
    const p = (s && s.portada) || {};
    return `<div class="rf-portada ${clase}" style="--de:${esc(p.de || '#2a1240')};--a:${esc(p.a || '#3d0b2a')}" role="img" aria-label="${esc(s ? s.nombre : '')}">
      <i class="${esc(p.icono || 'fa-solid fa-bag-shopping')}" aria-hidden="true"></i><span>${esc(s ? s.nombre : '')}</span></div>`;
  }
  function miniaturaHTML(s, plan) {
    const src = (plan && plan.imagen) || (s && s.imagen);
    if (src) return `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">`;
    const p = (s && s.portada) || {};
    return `<span class="rf-mini-portada" style="--de:${esc(p.de || '#2a1240')};--a:${esc(p.a || '#3d0b2a')}"><i class="${esc(p.icono || 'fa-solid fa-bag-shopping')}" aria-hidden="true"></i></span>`;
  }

  /* ---------------- Suscripciones: días restantes ---------------- */
  const DIA = 86400000;
  // Días de calendario en Ecuador (UTC-5), igual que los correos del puente.
  const diaEC = (f) => Math.floor((aFecha(f).getTime() - 5 * 3600000) / DIA);
  function estadoServicio(entregadoEn, dias, ahora = new Date()) {
    const base = aFecha(entregadoEn);
    if (!base || !(Number(dias) > 0)) return null;
    const fin = new Date(base.getTime() + Number(dias) * DIA);
    const quedan = diaEC(fin) - diaEC(ahora);
    const vencido = fin.getTime() <= ahora.getTime();
    const progreso = Math.max(0, Math.min(1, (fin.getTime() - ahora.getTime()) / (Number(dias) * DIA)));
    let texto;
    let clase;
    if (vencido) { texto = quedan >= 0 ? 'Venció hoy' : quedan === -1 ? 'Venció ayer' : `Venció hace ${-quedan} días`; clase = 'vencido'; }
    else if (quedan <= 0) { texto = 'Vence hoy'; clase = 'urgente'; }
    else if (quedan === 1) { texto = 'Vence mañana'; clase = 'urgente'; }
    else { texto = `Quedan ${quedan} días`; clase = quedan <= 3 ? 'pronto' : 'ok'; }
    return { fin, quedan, vencido, progreso, texto, clase };
  }
  // El servicio que vence primero en un pedido entregado.
  function servicioPedido(p, ahora) {
    if (!p || p.estado !== 'entregado') return null;
    const dias = (p.items || []).map((i) => Number(i.dias) || 0).filter((d) => d > 0);
    return dias.length ? estadoServicio(p.entregadoEn, Math.min(...dias), ahora) : null;
  }
  // Enlace que pone en el carrito lo mismo que el cliente compró.
  function enlaceRenovar(items) {
    const lista = (items || []).filter((it) => Number(it.dias) > 0).map((it) => (it.tipo === 'combo'
      ? ['c', (it.servicios || []).map((x) => x.id).filter(Boolean), it.cantidad || 1]
      : ['p', it.servicioId, it.planId, it.cantidad || 1])).filter((x) => (x[0] === 'c' ? x[1].length >= 2 : x[1] && x[2]));
    if (!lista.length) return 'index.html';
    const b64 = btoa(JSON.stringify(lista)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `index.html?renovar=${b64}`;
  }

  /* ---------------- Estados de pedido ---------------- */
  const ESTADOS = {
    en_revision: { nombre: 'En revisión', clase: 'revision', icono: 'fa-solid fa-hourglass-half', texto: 'Estamos verificando tu pago. Esta página se actualiza sola.' },
    aprobado: { nombre: 'Pago aprobado', clase: 'aprobado', icono: 'fa-solid fa-circle-check', texto: 'Confirmamos tu pago y estamos preparando tu entrega.' },
    entregado: { nombre: 'Entregado', clase: 'entregado', icono: 'fa-solid fa-gift', texto: 'Tu pedido está listo. Revisa tus datos abajo.' },
    rechazado: { nombre: 'Pago rechazado', clase: 'rechazado', icono: 'fa-solid fa-circle-xmark', texto: 'No pudimos validar tu comprobante. Escríbenos y lo resolvemos.' }
  };
  const estadoInfo = (e) => ESTADOS[e] || ESTADOS.en_revision;
  const pillEstado = (e) => { const i = estadoInfo(e); return `<span class="rf-estado rf-estado--${i.clase}">${esc(i.nombre)}</span>`; };

  /* ---------------- Avisos (toasts) ---------------- */
  function toast(mensaje, opciones = {}) {
    let caja = $('.rf-toasts');
    if (!caja) {
      caja = document.createElement('div');
      caja.className = 'rf-toasts';
      caja.setAttribute('aria-live', 'polite');
      document.body.appendChild(caja);
    }
    cerrarAvisos();
    const t = document.createElement('div');
    t.className = `rf-toast rf-toast--${opciones.tipo || 'ok'}`;
    t.innerHTML = `<span>${esc(mensaje)}</span>`;
    if (opciones.accion) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = opciones.accion.texto;
      b.addEventListener('click', () => { opciones.accion.fn(); cerrar(); });
      t.appendChild(b);
    }
    caja.appendChild(t);
    requestAnimationFrame(() => t.classList.add('visible'));
    let cerrado = false;
    function cerrar() {
      if (cerrado) return;
      cerrado = true;
      t.classList.remove('visible');
      setTimeout(() => t.remove(), 300);
    }
    t._cerrar = cerrar;
    setTimeout(cerrar, opciones.duracion || 3600);
    return cerrar;
  }

  function cerrarAvisos() {
    $$('.rf-toast').forEach((x) => { if (x._cerrar) x._cerrar(); else x.remove(); });
  }

  /* ---------------- Firebase ---------------- */
  let auth = null;
  let db = null;
  const firebaseListo = (function () {
    try {
      if (!window.firebase || !CONFIG.firebase) return false;
      if (!firebase.apps.length) firebase.initializeApp(CONFIG.firebase);
      auth = firebase.auth();
      db = firebase.firestore();
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
      return true;
    } catch (e) {
      console.error('Firebase no pudo iniciar:', e);
      return false;
    }
  })();
  const marcaTiempo = () => (firebaseListo ? firebase.firestore.FieldValue.serverTimestamp() : new Date());

  /* ---------------- Datos de la tienda (panel → Firebase, con respaldo) ---------------- */
  const CLAVE_DATOS = 'refills_datos_v1';
  const CAMPOS_TECNICOS = ['firebase', 'workerUrl', 'mostrarProductosDeEjemplo'];
  function aplicarDatos(datos, origen) {
    if (datos && datos.config) {
      const c = Object.assign({}, datos.config);
      CAMPOS_TECNICOS.forEach((k) => { delete c[k]; });
      Object.assign(CONFIG, c);
    }
    if (datos && datos.catalogo && Array.isArray(datos.catalogo.servicios)) {
      CAT = datos.catalogo;
      origenDatos = origen;
    }
    prepararCatalogo();
  }
  function conLimite(promesa, ms) {
    return Promise.race([promesa, new Promise((_, no) => setTimeout(() => no(new Error('sin respuesta')), ms))]);
  }
  async function cargarDatos() {
    if (!firebaseListo) return;
    try {
      const col = db.collection('tienda');
      const [c, k] = await conLimite(Promise.all([col.doc('config').get(), col.doc('catalogo').get()]), 7000);
      const datos = {};
      if (c.exists) datos.config = JSON.parse(JSON.stringify(c.data()));
      if (k.exists) datos.catalogo = JSON.parse(JSON.stringify(k.data()));
      if (datos.config || datos.catalogo) {
        try { localStorage.setItem(CLAVE_DATOS, JSON.stringify(datos)); } catch (e) { /* sin espacio */ }
        aplicarDatos(datos, 'firebase');
      }
    } catch (e) {
      console.warn('Refills EC: usando la última copia guardada de la tienda.', e && e.message);
      try {
        const copia = JSON.parse(localStorage.getItem(CLAVE_DATOS) || 'null');
        if (copia) aplicarDatos(copia, 'copia');
      } catch (err) { /* sin copia */ }
    }
  }
  const listo = cargarDatos().catch(() => {}).then(() => true);

  // Nombre y subtítulo de la tienda (se editan desde el panel)
  function aplicarMarca() {
    if (!('nombreAcento' in CONFIG)) return;
    const nombre = CONFIG.nombreTienda || 'Refills';
    const acento = CONFIG.nombreAcento || '';
    $$('[data-nombre]').forEach((el) => { el.textContent = nombre; });
    $$('[data-nombre-acento]').forEach((el) => { el.textContent = acento; el.hidden = !acento; });
    if (CONFIG.subtitulo) $$('[data-subtitulo]').forEach((el) => { el.textContent = CONFIG.subtitulo; });
    document.title = document.title.replace(/Refills EC/g, `${nombre}${acento ? ` ${acento}` : ''}`);
  }

  let usuario = null;
  let sesionResuelta = !firebaseListo;
  const oyentes = [];
  function alCambiarSesion(fn) { oyentes.push(fn); if (sesionResuelta) fn(usuario); }
  function avisarSesion() { oyentes.forEach((fn) => { try { fn(usuario); } catch (e) { console.error(e); } }); }
  if (firebaseListo) {
    auth.onAuthStateChanged((u) => {
      usuario = u;
      sesionResuelta = true;
      if (!u) { esAdmin = false; consultaAdmin = null; }
      actualizarBotonUsuario();
      avisarSesion();
      if (u) {
        comprobarAdmin(u).then((v) => {
          if (usuario && usuario.uid === u.uid) { esAdmin = v; actualizarBotonUsuario(); }
        });
      }
    });
  }

  // ¿La cuenta es de un administrador? (lista "admins" en Firebase)
  let esAdmin = false;
  let consultaAdmin = null;
  function comprobarAdmin(u) {
    if (!u || !firebaseListo) return Promise.resolve(false);
    if (consultaAdmin && consultaAdmin.uid === u.uid) return consultaAdmin.promesa;
    const clave = `refills_admin_${u.uid}`;
    let guardado = null;
    try { guardado = sessionStorage.getItem(clave); } catch (e) { /* sin acceso */ }
    const promesa = guardado !== null
      ? Promise.resolve(guardado === '1')
      : db.collection('admins').doc(u.uid).get()
        .then((d) => d.exists)
        .catch(() => false)
        .then((v) => { try { sessionStorage.setItem(clave, v ? '1' : '0'); } catch (e) { /* sin acceso */ } return v; });
    consultaAdmin = { uid: u.uid, promesa };
    return promesa;
  }
  const irAlPanel = () => { window.location.href = 'admin/'; };
  const nombreCorto = (u) => {
    if (!u) return '';
    const base = (u.displayName || (u.email || '').split('@')[0] || 'Cuenta').trim();
    return base.split(/\s+/)[0].slice(0, 16);
  };
  const iniciales = (u) => {
    const base = (u && (u.displayName || u.email) || '?').trim();
    const partes = base.split(/[\s@._-]+/).filter(Boolean);
    return ((partes[0] || '?')[0] + (partes[1] ? partes[1][0] : '')).toUpperCase();
  };

  async function llamarPuente(ruta, cuerpo) {
    if (!CONFIG.workerUrl) throw new Error('sin-puente');
    if (!auth || !auth.currentUser) throw new Error('Inicia sesión primero');
    const token = await auth.currentUser.getIdToken();
    let r;
    try {
      r = await fetch(CONFIG.workerUrl.replace(/\/+$/, '') + ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(cuerpo || {})
      });
    } catch (e) {
      console.error(`No se pudo conectar con el puente (${CONFIG.workerUrl}):`, e);
      throw new Error('No pudimos conectar con Refills EC. Revisa tu internet e inténtalo otra vez.');
    }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
    return d;
  }

  /* ---------------- Modal de acceso (login / registro) ---------------- */
  const navegadorInterno = /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|BytedanceWebview|Snapchat|Line\//i.test(navigator.userAgent || '');
  const ERRORES_AUTH = {
    'auth/invalid-email': 'Ese correo no es válido.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/wrong-password': 'La contraseña no coincide.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/invalid-login-credentials': 'Correo o contraseña incorrectos.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Inicia sesión.',
    'auth/weak-password': 'La contraseña necesita al menos 6 caracteres.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento y vuelve a intentar.',
    'auth/network-request-failed': 'Sin conexión. Revisa tu internet.',
    'auth/popup-blocked': 'Tu navegador bloqueó la ventana de Google. Entra con tu correo.',
    'auth/unauthorized-domain': 'El acceso con Google aún no está activo en esta página. Entra con tu correo.',
    'auth/operation-not-allowed': 'Este método de acceso no está activado todavía.',
    'auth/missing-email': 'Escribe tu correo.'
  };
  const mensajeAuth = (e) => ERRORES_AUTH[e && e.code] || 'No se pudo completar. Intenta de nuevo.';

  let esperas = [];
  function resolverEsperas(u) { const lista = esperas; esperas = []; lista.forEach((x) => x.resolver(u)); }
  function cancelarEsperas() { const lista = esperas; esperas = []; lista.forEach((x) => x.rechazar(new Error('cancelado'))); }

  function plantillaAuth() {
    return `
<div id="auth-modal" class="modal-overlay" style="display:none;" role="dialog" aria-modal="true" aria-label="Acceso a tu cuenta">
  <div class="auth-3d-perspective">
    <div class="auth-3d-card" id="auth-card">
      <div class="auth-face auth-front">
        <button class="close-auth" type="button" data-auth-cerrar aria-label="Cerrar">&times;</button>
        <div class="auth-content">
          <img src="img/logoo.png" class="auth-logo" alt="Refills EC">
          <h2 class="auth-title">Bienvenido</h2>
          <p class="rf-auth-motivo" data-auth-motivo hidden></p>
          <form id="login-form-3d" novalidate>
            <div class="auth-input-group"><i class="fa-solid fa-envelope"></i>
              <input type="email" id="login-email" placeholder="Correo electrónico" autocomplete="email" required></div>
            <div class="auth-input-group"><i class="fa-solid fa-lock"></i>
              <input type="password" id="login-pass" placeholder="Contraseña" autocomplete="current-password" required></div>
            <p class="rf-auth-error" data-auth-error="login" role="alert"></p>
            <button type="submit" class="auth-btn-primary">ENTRAR</button>
            <button type="button" class="rf-auth-olvido" data-auth-olvido>¿Olvidaste tu contraseña?</button>
          </form>
          <div class="auth-divider"><span>o continúa con</span></div>
          <p class="rf-auth-aviso" data-auth-interno hidden>Estás dentro de otra app. Para entrar con Google, abre la tienda en Chrome o Safari. Con tu correo puedes entrar aquí mismo.</p>
          <button class="auth-btn-google" type="button" data-auth-google>
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="">
            Acceder con Google
          </button>
          <p class="auth-switch">¿No tienes cuenta? <a href="#" data-auth-voltear>Regístrate aquí</a></p>
        </div>
      </div>
      <div class="auth-face auth-back">
        <button class="close-auth" type="button" data-auth-cerrar aria-label="Cerrar">&times;</button>
        <div class="auth-content">
          <img src="img/logoo.png" class="auth-logo" alt="Refills EC">
          <h2 class="auth-title">Crear cuenta</h2>
          <form id="register-form-3d" novalidate>
            <div class="auth-input-group"><i class="fa-solid fa-user"></i>
              <input type="text" id="reg-name" placeholder="Nombre completo" autocomplete="name" required></div>
            <div class="auth-input-group"><i class="fa-solid fa-envelope"></i>
              <input type="email" id="reg-email" placeholder="Correo electrónico" autocomplete="email" required></div>
            <div class="auth-input-group"><i class="fa-solid fa-lock"></i>
              <input type="password" id="reg-pass" placeholder="Contraseña (mínimo 6)" autocomplete="new-password" minlength="6" required></div>
            <p class="rf-auth-error" data-auth-error="registro" role="alert"></p>
            <button type="submit" class="auth-btn-primary">REGISTRARSE</button>
          </form>
          <p class="auth-switch">¿Ya tienes cuenta? <a href="#" data-auth-voltear>Inicia sesión</a></p>
        </div>
      </div>
    </div>
  </div>
</div>`;
  }

  let modalAuth = null;
  function prepararAuth() {
    if (modalAuth) return modalAuth;
    document.body.insertAdjacentHTML('beforeend', plantillaAuth());
    modalAuth = $('#auth-modal');
    const tarjeta = $('#auth-card');
    if (navegadorInterno) $('[data-auth-interno]', modalAuth).hidden = false;

    modalAuth.addEventListener('click', (e) => { if (e.target === modalAuth) cerrarAuth(false); });
    $$('[data-auth-cerrar]', modalAuth).forEach((b) => b.addEventListener('click', () => cerrarAuth(false)));
    $$('[data-auth-voltear]', modalAuth).forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      tarjeta.classList.toggle('flipped');
      limpiarErrores();
    }));

    const errorDe = (cual) => $(`[data-auth-error="${cual}"]`, modalAuth);
    function limpiarErrores() { $$('.rf-auth-error', modalAuth).forEach((p) => { p.textContent = ''; p.classList.remove('ok'); }); }
    function ocupado(boton, texto) {
      const original = boton.textContent;
      boton.disabled = true;
      boton.textContent = texto;
      return () => { boton.disabled = false; boton.textContent = original; };
    }

    $('#login-form-3d').addEventListener('submit', async (e) => {
      e.preventDefault();
      limpiarErrores();
      if (!firebaseListo) { errorDe('login').textContent = 'No hay conexión con el servidor. Recarga la página.'; return; }
      const email = $('#login-email').value.trim();
      const pass = $('#login-pass').value;
      if (!email || !pass) { errorDe('login').textContent = 'Escribe tu correo y tu contraseña.'; return; }
      const listo = ocupado(e.submitter || $('#login-form-3d .auth-btn-primary'), 'Ingresando...');
      try {
        await auth.signInWithEmailAndPassword(email, pass);
        exitoAuth('Sesión iniciada');
      } catch (err) {
        errorDe('login').textContent = mensajeAuth(err);
      } finally { listo(); }
    });

    $('#register-form-3d').addEventListener('submit', async (e) => {
      e.preventDefault();
      limpiarErrores();
      if (!firebaseListo) { errorDe('registro').textContent = 'No hay conexión con el servidor. Recarga la página.'; return; }
      const nombre = $('#reg-name').value.trim();
      const email = $('#reg-email').value.trim();
      const pass = $('#reg-pass').value;
      if (!nombre) { errorDe('registro').textContent = 'Escribe tu nombre.'; return; }
      if (pass.length < 6) { errorDe('registro').textContent = ERRORES_AUTH['auth/weak-password']; return; }
      const listo = ocupado(e.submitter || $('#register-form-3d .auth-btn-primary'), 'Creando cuenta...');
      try {
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        await cred.user.updateProfile({ displayName: nombre });
        exitoAuth(`Cuenta creada. ¡Hola, ${nombreCorto(auth.currentUser)}!`);
      } catch (err) {
        errorDe('registro').textContent = mensajeAuth(err);
      } finally { listo(); }
    });

    $('[data-auth-google]', modalAuth).addEventListener('click', async () => {
      limpiarErrores();
      if (!firebaseListo) { errorDe('login').textContent = 'No hay conexión con el servidor. Recarga la página.'; return; }
      try {
        await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
        exitoAuth('Sesión iniciada');
      } catch (err) {
        if (err && (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request')) return;
        if (err && err.code === 'auth/unauthorized-domain') {
          console.error('Agrega este dominio en Firebase → Authentication → Settings → Dominios autorizados:', location.hostname);
        }
        errorDe('login').textContent = mensajeAuth(err);
      }
    });

    $('[data-auth-olvido]', modalAuth).addEventListener('click', async () => {
      limpiarErrores();
      const email = $('#login-email').value.trim();
      const p = errorDe('login');
      if (!email) { p.textContent = 'Escribe tu correo arriba y vuelve a tocar aquí.'; return; }
      try {
        await auth.sendPasswordResetEmail(email);
        p.textContent = 'Te enviamos un enlace para crear una nueva contraseña.';
        p.classList.add('ok');
      } catch (err) { p.textContent = mensajeAuth(err); }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalAuth.style.display === 'flex') cerrarAuth(false);
    });
    return modalAuth;
  }

  function exitoAuth(mensaje) {
    usuario = auth.currentUser;
    sesionResuelta = true;
    const enCompra = esperas.length > 0;
    actualizarBotonUsuario();
    avisarSesion();
    cerrarAuth(true);
    resolverEsperas(usuario);
    comprobarAdmin(usuario).then((v) => {
      esAdmin = v;
      actualizarBotonUsuario();
      if (v && !enCompra) {
        toast('Hola, administrador. Abriendo tu panel...');
        setTimeout(irAlPanel, 900);
      } else {
        toast(mensaje);
      }
    });
  }

  function abrirAuth(motivo, enRegistro = false) {
    prepararAuth();
    const m = $('[data-auth-motivo]', modalAuth);
    m.textContent = motivo || '';
    m.hidden = !motivo;
    $('#auth-card').classList.toggle('flipped', !!enRegistro);
    cerrarAvisos();
    modalAuth.style.display = 'flex';
    document.body.classList.add('rf-sin-scroll');
    setTimeout(() => { const i = enRegistro ? $('#reg-name') : $('#login-email'); if (i) i.focus(); }, 80);
  }
  function cerrarAuth(exito) {
    if (!modalAuth) return;
    modalAuth.style.display = 'none';
    document.body.classList.remove('rf-sin-scroll');
    if (!exito) cancelarEsperas();
  }
  function requerirSesion(motivo) {
    if (usuario) return Promise.resolve(usuario);
    return new Promise((resolver, rechazar) => {
      esperas.push({ resolver, rechazar });
      abrirAuth(motivo);
    });
  }

  /* ---------------- Perfil lateral ---------------- */
  let cajonPerfil = null;
  function plantillaPerfil() {
    return `
<div id="user-overlay" class="cart-overlay rf-overlay-perfil"></div>
<aside id="user-drawer" class="side-drawer left rf-perfil" aria-label="Tu perfil" aria-hidden="true">
  <div class="drawer-content">
    <div class="drawer-header-user">
      <button id="close-user-drawer" class="close-btn-round" type="button" aria-label="Cerrar perfil"><i class="fa-solid fa-xmark"></i></button>
      <div class="user-profile-info">
        <div class="avatar-circle rf-avatar" data-perfil-avatar>?</div>
        <div class="rf-perfil-textos">
          <h2 id="user-welcome-name">¡Hola!</h2>
          <p class="rf-perfil-correo" data-perfil-correo></p>
        </div>
      </div>
      <div class="rf-perfil-stats">
        <div><strong data-perfil-total>–</strong><span>Pedidos</span></div>
        <div><strong data-perfil-curso>–</strong><span>En curso</span></div>
      </div>
    </div>
    <nav class="user-nav">
      <a href="admin/" class="nav-item rf-nav-admin" data-perfil-admin hidden><i class="fa-solid fa-gauge-high"></i><span>Mi panel de administrador</span></a>
      <a href="index.html" class="nav-item active"><i class="fa-solid fa-house"></i><span>Tienda</span></a>
      <a href="${esc(whatsappUrl('Hola, necesito ayuda con mi cuenta de Refills EC'))}" target="_blank" rel="noopener" class="nav-item"><i class="fa-brands fa-whatsapp"></i><span>Soporte por WhatsApp</span></a>
      <a href="ayuda.html" class="nav-item"><i class="fa-solid fa-circle-question"></i><span>Preguntas y garantía</span></a>
    </nav>
    <section class="rf-perfil-pedidos" aria-label="Mis pedidos">
      <h3 class="rf-perfil-subtitulo">Mis pedidos</h3>
      <div class="rf-perfil-lista" data-perfil-lista></div>
    </section>
    <div class="drawer-footer-user">
      <div class="divider-dashed"></div>
      <button id="btn-logout-drawer" class="btn-logout" type="button"><i class="fa-solid fa-right-from-bracket"></i> Cerrar sesión</button>
    </div>
  </div>
</aside>`;
  }
  function prepararPerfil() {
    if (cajonPerfil) return cajonPerfil;
    document.body.insertAdjacentHTML('beforeend', plantillaPerfil());
    cajonPerfil = $('#user-drawer');
    $('#close-user-drawer').addEventListener('click', cerrarPerfil);
    $('#user-overlay').addEventListener('click', cerrarPerfil);
    $('#btn-logout-drawer').addEventListener('click', async () => {
      if (!window.confirm('¿Cerrar sesión?')) return;
      await auth.signOut();
      cerrarPerfil();
      toast('Sesión cerrada');
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cajonPerfil.classList.contains('open')) cerrarPerfil(); });
    return cajonPerfil;
  }
  function abrirPerfil() {
    if (!usuario) { abrirAuth('Inicia sesión para ver tu perfil y tus pedidos.'); return; }
    prepararPerfil();
    $('[data-perfil-avatar]').textContent = iniciales(usuario);
    $('#user-welcome-name').textContent = `¡Hola, ${nombreCorto(usuario)}!`;
    $('[data-perfil-correo]').textContent = usuario.email || '';
    $('[data-perfil-admin]').hidden = !esAdmin;
    cajonPerfil.classList.add('open');
    cajonPerfil.setAttribute('aria-hidden', 'false');
    $('#user-overlay').classList.add('show');
    document.body.classList.add('rf-sin-scroll');
    cargarPedidosPerfil();
  }
  function cerrarPerfil() {
    if (!cajonPerfil) return;
    cajonPerfil.classList.remove('open');
    cajonPerfil.setAttribute('aria-hidden', 'true');
    $('#user-overlay').classList.remove('show');
    document.body.classList.remove('rf-sin-scroll');
  }
  async function misPedidos() {
    if (!firebaseListo || !usuario) return [];
    const snap = await db.collection('pedidos').where('uid', '==', usuario.uid).get();
    return snap.docs
      .map((d) => Object.assign({ id: d.id }, d.data({ serverTimestamps: 'estimate' })))
      .sort((a, b) => ((aFecha(b.creado) || 0) - (aFecha(a.creado) || 0)));
  }
  async function cargarPedidosPerfil() {
    const lista = $('[data-perfil-lista]');
    lista.innerHTML = '<p class="rf-perfil-vacio">Cargando tus pedidos...</p>';
    try {
      const pedidos = await misPedidos();
      $('[data-perfil-total]').textContent = pedidos.length;
      $('[data-perfil-curso]').textContent = pedidos.filter((p) => p.estado === 'en_revision' || p.estado === 'aprobado').length;
      if (!pedidos.length) {
        lista.innerHTML = '<p class="rf-perfil-vacio">Aún no tienes pedidos. Cuando compres, aquí verás su estado.</p>';
        return;
      }
      lista.innerHTML = pedidos.map((p) => {
        const items = Array.isArray(p.items) ? p.items : [];
        const primero = items[0] ? (items[0].tipo === 'combo' ? items[0].nombre : items[0].servicio) : 'Pedido';
        const resto = items.length > 1 ? ` y ${items.length - 1} más` : '';
        const servicio = servicioPedido(p);
        return `<a class="rf-pedido-item" href="pedido.html?id=${encodeURIComponent(p.id)}">
          <div class="rf-pedido-item-fila"><span class="rf-pedido-codigo">${esc(p.codigo || 'Pedido')}</span>${pillEstado(p.estado)}</div>
          <div class="rf-pedido-item-fila rf-pedido-item-sub"><span>${esc(primero + resto)}</span><strong>${dinero(p.total)}</strong></div>
          <div class="rf-pedido-item-fila rf-pedido-item-fecha"><span>${esc(haceCuanto(p.creado))}</span>${servicio ? `<span class="rf-dias rf-dias--${servicio.clase}">${esc(servicio.texto)}</span>` : ''}</div>
        </a>`;
      }).join('');
    } catch (e) {
      console.error(e);
      lista.innerHTML = '<p class="rf-perfil-vacio">No pudimos cargar tus pedidos. Revisa tu conexión y vuelve a abrir tu perfil.</p>';
    }
  }

  /* ---------------- Botón de usuario (cabecera) ---------------- */
  function actualizarBotonUsuario() {
    const b = $('#btn-login-open');
    if (!b) return;
    const texto = $('#user-name-display');
    const icono = b.querySelector('i');
    b.classList.toggle('rf-es-admin', !!(usuario && esAdmin));
    if (usuario && esAdmin) {
      if (texto) texto.textContent = 'Mi panel';
      if (icono) icono.className = 'fa-solid fa-gauge-high';
      b.setAttribute('aria-label', 'Abrir tu panel de administrador');
    } else if (usuario) {
      if (texto) texto.textContent = nombreCorto(usuario);
      if (icono) icono.className = 'fa-solid fa-circle-user';
      b.setAttribute('aria-label', 'Abrir tu perfil');
    } else {
      if (texto) texto.textContent = 'Ingresar';
      if (icono) icono.className = 'fa-solid fa-user';
      b.setAttribute('aria-label', 'Ingresar o crear cuenta');
    }
  }
  function conectarBotonUsuario() {
    const b = $('#btn-login-open');
    if (!b) return;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      if (usuario && esAdmin) irAlPanel();
      else if (usuario) abrirPerfil();
      else abrirAuth();
    });
    actualizarBotonUsuario();
  }

  /* ---------------- Partículas (fondo) ---------------- */
  function iniciarParticulas() {
    const canvas = $('#particles-canvas');
    if (!canvas || movimientoReducido) return;
    const ctx = canvas.getContext('2d');
    let puntos = [];
    let ancho = 0;
    let alto = 0;
    const ajustar = () => { ancho = canvas.width = window.innerWidth; alto = canvas.height = window.innerHeight; };
    window.addEventListener('resize', ajustar);
    ajustar();
    const total = window.innerWidth < 600 ? 45 : 80;
    for (let i = 0; i < total; i++) {
      puntos.push({ x: Math.random() * ancho, y: Math.random() * alto, s: Math.random() * 1.5 + 0.5, vx: Math.random() * 0.5 - 0.25, vy: Math.random() * 0.5 - 0.25, o: Math.random() * 0.5 + 0.3 });
    }
    function animar() {
      if (!document.hidden) {
        ctx.clearRect(0, 0, ancho, alto);
        puntos.forEach((p) => {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > ancho || p.y < 0 || p.y > alto) { p.x = Math.random() * ancho; p.y = Math.random() * alto; }
          ctx.fillStyle = `rgba(255,255,255,${p.o})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
        });
      }
      requestAnimationFrame(animar);
    }
    animar();
  }

  /* ---------------- Pie de página (redes y año) ---------------- */
  function prepararPie() {
    const redes = CONFIG.redes || {};
    $$('.social-card').forEach((a) => {
      const tipo = a.classList.contains('wa') ? 'whatsapp' : a.classList.contains('ig') ? 'instagram' : a.classList.contains('tk') ? 'tiktok' : a.classList.contains('tg') ? 'telegram' : '';
      if (tipo === 'whatsapp') { a.href = whatsappUrl(); return; }
      const url = redes[tipo];
      if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; } else a.remove();
    });
    $$('[data-anio]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  }

  /* ---------------- Inicio ---------------- */
  // Contador de visitas (Cloudflare Web Analytics): gratis, sin publicidad ni cookies.
  (function contadorVisitas() {
    const token = String(CONFIG.analyticsToken || '').trim();
    if (!token || /localhost|127\.0\.0\.1/.test(location.hostname)) return;
    const s = document.createElement('script');
    s.defer = true;
    s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.setAttribute('data-cf-beacon', JSON.stringify({ token }));
    document.head.appendChild(s);
  })();

  document.addEventListener('DOMContentLoaded', () => {
    conectarBotonUsuario();
    iniciarParticulas();
    listo.then(() => { prepararPie(); aplicarMarca(); });
  });

  window.RF = {
    CONFIG,
    get CAT() { return CAT; },
    listo,
    get origenDatos() { return origenDatos; },
    util: { $, $$, esc, dinero, redondear, aFecha, fechaCorta, fechaHora, haceCuanto, copiar, whatsappUrl, movimientoReducido },
    catalogo: {
      get servicios() { return servicios; },
      get reglas() { return reglas; },
      get minCombo() { return minCombo; },
      get maxCombo() { return maxCombo; },
      servicioPorId, planPorId, planCombo, precioDesde, categoriasVisibles, elegiblesCombo, precioCombo, ahorroRegla, etiquetaCampo
    },
    carrito: { leer: leerCarrito, agregarPlan, agregarCombo, cambiarCantidad, quitar: quitarDelCarrito, vaciar: vaciarCarrito, resumen: resumenCarrito, sugerencia: sugerenciaCombo, aplicarSugerencia },
    vista: { portadaHTML, miniaturaHTML, pillEstado, estadoInfo, ESTADOS, estadoServicio, servicioPedido, enlaceRenovar },
    toast,
    cerrarAvisos,
    sesion: {
      get usuario() { return usuario; },
      get lista() { return firebaseListo; },
      get db() { return db; },
      alCambiar: alCambiarSesion,
      abrirAuth, cerrarAuth, requerirSesion, abrirPerfil, cerrarPerfil, misPedidos, marcaTiempo, llamarPuente
    }
  };
})();
