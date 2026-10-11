/* =============================================================
   Refills EC Panel — app de administrador (Fase 1)
   Edita productos, precios, categorías, combos, datos de la
   tienda y pagos. Todo se guarda en Firebase y la tienda lo
   muestra al instante.
   ============================================================= */
(function () {
  'use strict';

  const CONFIG_ARCHIVO = window.REFILLS_CONFIG || {};
  const CAT_ARCHIVO = window.REFILLS_CATALOGO || {};

  /* ---------------- Utilidades ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const dinero = (n) => '$ ' + redondear(n).toFixed(2).replace('.', ',');
  const clonar = (o) => JSON.parse(JSON.stringify(o ?? null));
  const leerPrecio = (v) => {
    const t = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
    return redondear(parseFloat(t));
  };
  const textoPrecio = (n) => (n === '' || n === null || n === undefined || isNaN(Number(n))) ? '' : redondear(n).toFixed(2).replace('.', ',');
  const slug = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
  function idUnico(base, usados) {
    const raiz = slug(base);
    let id = raiz;
    let n = 2;
    while (usados.includes(id)) id = `${raiz}-${n++}`;
    return id;
  }
  const rutaImg = (src) => (!src ? '' : /^(https?:|data:|\/)/i.test(src) ? src : `../${src}`);
  function asignar(obj, ruta, valor) {
    const partes = ruta.split('.');
    const ultima = partes.pop();
    const destino = partes.reduce((o, k) => o[k], obj);
    destino[ultima] = valor;
  }
  const planCombo = (s) => (s && s.planes || []).find((p) => p.combo) || null;
  const claveCombo = (ids) => (ids || []).slice().sort().join('+');

  /* ---------------- Opciones fijas ---------------- */
  const IMAGENES = ['img/Netflix.jpeg', 'img/Disney cuenta.jpg', 'img/Max.jpeg', 'img/Prime.jpeg', 'img/crunchy.jpeg',
    'img/paramount.jpeg', 'img/vix.jpeg', 'img/Flujo.jpeg', 'img/oleada.jpeg', 'img/canva.jpeg',
    'img/Tk seguidores.jpeg', 'img/tk likes.jpeg', 'img/tk vistas.jpeg'];
  const ICONOS_CATEGORIA = ['tv', 'gift', 'gamepad', 'hashtag', 'music', 'film', 'graduation-cap', 'mobile-screen', 'wifi',
    'shield-halved', 'bolt', 'star', 'crown', 'key', 'globe', 'headphones', 'book', 'bag-shopping'].map((i) => `fa-solid fa-${i}`);
  const ICONOS_PORTADA = ['bag-shopping', 'play', 'tv', 'film', 'music', 'gamepad', 'gem', 'crosshairs', 'shield-halved',
    'gift', 'desktop', 'star', 'bolt', 'crown', 'headphones', 'graduation-cap'].map((i) => `fa-solid fa-${i}`);
  const TEMAS = [
    { id: 'pichincha', nombre: 'Amarillo (Pichincha)' }, { id: 'guayaquil', nombre: 'Magenta (Guayaquil)' },
    { id: 'pacifico', nombre: 'Celeste (Pacífico)' }, { id: 'produbanco', nombre: 'Verde (Produbanco)' },
    { id: 'generico', nombre: 'Morado' }
  ];
  const ENTREGA_POR_CATEGORIA = { streaming: 'acceso', tarjetas: 'codigo', juegos: 'recarga', redes: 'servicio' };

  /* ---------------- Avisos ---------------- */
  function aviso(texto, tipo = 'ok') {
    const caja = $('#avisos');
    caja.innerHTML = '';
    const el = document.createElement('div');
    el.className = `aviso ${tipo === 'ok' ? '' : tipo}`;
    el.textContent = texto;
    caja.appendChild(el);
    clearTimeout(aviso.t);
    aviso.t = setTimeout(() => el.remove(), tipo === 'error' ? 6500 : 3500);
  }

  /* ---------------- Firebase ---------------- */
  let auth = null;
  let db = null;
  try {
    if (!firebase.apps.length) firebase.initializeApp(CONFIG_ARCHIVO.firebase);
    auth = firebase.auth();
    db = firebase.firestore();
  } catch (e) {
    console.error('Firebase no pudo iniciar', e);
  }
  const marcaTiempo = () => firebase.firestore.FieldValue.serverTimestamp();

  const ERRORES = {
    'auth/invalid-email': 'Ese correo no es válido.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/wrong-password': 'La contraseña no coincide.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/invalid-login-credentials': 'Correo o contraseña incorrectos.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento.',
    'auth/network-request-failed': 'Sin conexión. Revisa tu internet.',
    'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Entra con tu correo.',
    'auth/unauthorized-domain': 'Google aún no está activado en este dominio. Entra con tu correo.'
  };
  function errorGuardar(e) {
    if (e && e.message === 'cancelado') return;
    console.error(e);
    if (e && e.code === 'permission-denied') aviso('No se pudo guardar: falta permiso. Revisa las reglas de Firebase.', 'error');
    else aviso('No se pudo guardar. Revisa tu internet e inténtalo otra vez.', 'error');
  }

  /* ---------------- Estado ---------------- */
  const E = {
    usuario: null, config: null, catalogo: null, versiones: { config: 0, catalogo: 0 },
    vista: 'pedidos', borrador: null, sucio: false, ordenando: false, filtro: 'todas', busqueda: ''
  };

  const PANTALLAS = ['p-cargando', 'p-login', 'p-reglas', 'p-no-admin', 'p-importar', 'app'];
  function mostrar(id) {
    PANTALLAS.forEach((p) => { $(`#${p}`).hidden = p !== id; });
    window.scrollTo(0, 0);
  }
  const CARGANDO_HTML = $('#p-cargando').innerHTML;
  function errorConexion() {
    const p = $('#p-cargando');
    p.innerHTML = `<img src="../img/logoo.png" alt="" class="logo-grande">
      <p class="texto-suave">No pudimos conectar con tu tienda. Revisa tu internet.</p>
      <button type="button" class="btn btn-primario" data-recomprobar>Reintentar</button>`;
    mostrar('p-cargando');
  }

  /* ---------------- Sesión y permisos ---------------- */
  let comprobando = false;
  async function comprobar() {
    if (comprobando) return;
    if (!E.usuario) { mostrar('p-login'); return; }
    comprobando = true;
    $('#p-cargando').innerHTML = CARGANDO_HTML;
    mostrar('p-cargando');
    try {
      let esAdmin;
      try {
        esAdmin = (await db.collection('admins').doc(E.usuario.uid).get()).exists;
      } catch (e) {
        if (e && e.code === 'permission-denied') { mostrar('p-reglas'); return; }
        throw e;
      }
      if (!esAdmin) {
        $('#uid-texto').textContent = E.usuario.uid;
        mostrar('p-no-admin');
        return;
      }
      const col = db.collection('tienda');
      const [c, k] = await Promise.all([col.doc('config').get(), col.doc('catalogo').get()]);
      if (!c.exists || !k.exists) {
        prepararImportacion(c.exists ? c.data() : null, k.exists ? k.data() : null);
        mostrar('p-importar');
        return;
      }
      cargarEstado(c.data(), k.data());
      iniciarApp();
    } catch (e) {
      console.error(e);
      if (e && e.code === 'permission-denied') mostrar('p-reglas');
      else errorConexion();
    } finally {
      comprobando = false;
    }
  }

  if (auth) {
    auth.onAuthStateChanged((u) => {
      E.usuario = u;
      if (u) comprobar();
      else { limpiarSucio(); mostrar('p-login'); }
    });
  } else {
    $('#login-error').textContent = 'No hay conexión con el servidor. Recarga la página.';
    mostrar('p-login');
  }

  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    err.textContent = '';
    const correo = $('#login-correo').value.trim();
    const clave = $('#login-clave').value;
    if (!correo || !clave) { err.textContent = 'Escribe tu correo y tu contraseña.'; return; }
    const btn = e.submitter || $('#form-login button[type=submit]');
    btn.disabled = true;
    try { await auth.signInWithEmailAndPassword(correo, clave); }
    catch (x) { err.textContent = ERRORES[x && x.code] || 'No se pudo entrar. Inténtalo otra vez.'; }
    finally { btn.disabled = false; }
  });
  $('#btn-google').addEventListener('click', async () => {
    $('#login-error').textContent = '';
    try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
    catch (x) {
      if (x && (x.code === 'auth/popup-closed-by-user' || x.code === 'auth/cancelled-popup-request')) return;
      $('#login-error').textContent = ERRORES[x && x.code] || 'No se pudo entrar con Google.';
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-recomprobar]')) comprobar();
    if (e.target.closest('[data-salir]')) {
      if (E.sucio && !confirm('Tienes cambios sin guardar. ¿Cerrar sesión igual?')) return;
      $('#menu-cuenta').hidden = true;
      auth.signOut();
    }
  });
  $('#btn-copiar-uid').addEventListener('click', async () => {
    const t = $('#uid-texto').textContent;
    try { await navigator.clipboard.writeText(t); aviso('Código copiado'); }
    catch (e) { aviso('Mantén presionado el código para copiarlo', 'info'); }
  });

  /* ---------------- Primera importación ---------------- */
  function datosDesdeArchivos() {
    const verEjemplos = CONFIG_ARCHIVO.mostrarProductosDeEjemplo !== false;
    let nombre = CONFIG_ARCHIVO.nombreTienda || 'Refills';
    let acento = CONFIG_ARCHIVO.nombreAcento;
    if (acento === undefined) {
      const partes = nombre.trim().split(/\s+/);
      acento = partes.length > 1 ? partes.pop() : '';
      nombre = partes.join(' ');
    }
    return {
      config: {
        nombreTienda: nombre,
        nombreAcento: acento,
        subtitulo: CONFIG_ARCHIVO.subtitulo || 'Tu centro de suscripciones digitales',
        whatsapp: CONFIG_ARCHIVO.whatsapp || '',
        redes: Object.assign({ instagram: '', tiktok: '', telegram: '' }, CONFIG_ARCHIVO.redes || {}),
        cuentasBancarias: (CONFIG_ARCHIVO.cuentasBancarias || []).map((c) => ({
          banco: c.banco || '', tema: c.tema || 'generico', tipo: c.tipo || 'Ahorros',
          numero: c.numero || '', titular: c.titular || '', correo: c.correo || ''
        })),
        binance: Object.assign({ activo: false, payId: '', usuario: '', correo: '' }, CONFIG_ARCHIVO.binance || {})
      },
      catalogo: {
        categorias: clonar(CAT_ARCHIVO.categorias || []),
        reglasCombo: clonar(CAT_ARCHIVO.reglasCombo || []),
        combosDestacados: clonar(CAT_ARCHIVO.combosDestacados || []),
        servicios: clonar(CAT_ARCHIVO.servicios || []).map((s) => Object.assign(s, { activo: !(s.ejemplo && !verEjemplos) }))
      }
    };
  }
  let porImportar = null;
  function prepararImportacion(configActual, catalogoActual) {
    const archivo = datosDesdeArchivos();
    porImportar = { config: configActual ? null : archivo.config, catalogo: catalogoActual ? null : archivo.catalogo };
    const cat = porImportar.catalogo || catalogoActual;
    const conf = porImportar.config || configActual;
    $('#resumen-importar').innerHTML = [
      [(cat.servicios || []).length, 'productos'],
      [(cat.categorias || []).length, 'categorías'],
      [(conf.cuentasBancarias || []).length, 'cuentas bancarias'],
      [(cat.combosDestacados || []).length, 'combos populares']
    ].map(([n, t]) => `<li><strong>${n}</strong><span>${t}</span></li>`).join('');
  }
  function sellar(datos) {
    const d = clonar(datos);
    delete d.actualizado;
    d.version = (d.version || 0) + 1;
    d.actualizado = marcaTiempo();
    return d;
  }
  $('#btn-importar').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const col = db.collection('tienda');
      const lote = db.batch();
      if (porImportar.config) lote.set(col.doc('config'), sellar(porImportar.config));
      if (porImportar.catalogo) lote.set(col.doc('catalogo'), sellar(porImportar.catalogo));
      await lote.commit();
      aviso('¡Listo! Tu tienda ya se maneja desde aquí.');
      comprobar();
    } catch (x) {
      errorGuardar(x);
    } finally {
      btn.disabled = false;
    }
  });

  /* ---------------- Datos y guardado ---------------- */
  function normalizarCatalogo(k) {
    const c = clonar(k);
    delete c.actualizado;
    c.categorias = Array.isArray(c.categorias) ? c.categorias : [];
    c.servicios = (Array.isArray(c.servicios) ? c.servicios : []).map((s) => Object.assign({ activo: true, planes: [] }, s));
    c.reglasCombo = Array.isArray(c.reglasCombo) ? c.reglasCombo : [];
    c.combosDestacados = Array.isArray(c.combosDestacados) ? c.combosDestacados : [];
    return c;
  }
  function normalizarConfig(k) {
    const c = clonar(k);
    delete c.actualizado;
    c.redes = Object.assign({ instagram: '', tiktok: '', telegram: '' }, c.redes || {});
    c.cuentasBancarias = Array.isArray(c.cuentasBancarias) ? c.cuentasBancarias : [];
    c.binance = Object.assign({ activo: false, payId: '', usuario: '', correo: '' }, c.binance || {});
    return c;
  }
  function cargarEstado(conf, cat) {
    E.config = normalizarConfig(conf);
    E.catalogo = normalizarCatalogo(cat);
    E.versiones = { config: conf.version || 0, catalogo: cat.version || 0 };
  }
  async function guardarDoc(nombre, datos) {
    const ref = db.collection('tienda').doc(nombre);
    const remoto = await ref.get();
    const vRemota = remoto.exists ? (remoto.data().version || 0) : 0;
    const vLocal = E.versiones[nombre] || 0;
    if (vRemota > vLocal && !confirm('Estos datos se cambiaron desde otro dispositivo después de abrir el panel. ¿Guardar igual y reemplazar esos cambios?')) {
      throw new Error('cancelado');
    }
    const limpio = clonar(datos);
    delete limpio.actualizado;
    limpio.version = Math.max(vRemota, vLocal) + 1;
    limpio.actualizado = marcaTiempo();
    await ref.set(limpio);
    E.versiones[nombre] = limpio.version;
  }

  /* ---------------- Cambios sin guardar ---------------- */
  function marcarSucio() {
    if (E.sucio) return;
    E.sucio = true;
    $('#barra-guardar').hidden = false;
    document.body.classList.add('hay-cambios');
  }
  function limpiarSucio() {
    E.sucio = false;
    $('#barra-guardar').hidden = true;
    document.body.classList.remove('hay-cambios');
  }
  window.addEventListener('beforeunload', (e) => {
    if (E.sucio || (hoja && hoja.sucio)) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------------- App ---------------- */
  let conectada = false;
  function iniciarApp() {
    mostrar('app');
    escucharPedidos();
    pintarMarca();
    $('#menu-correo').textContent = E.usuario.email || '';
    if (!conectada) { conectada = true; conectarApp(); }
    irA(E.vista, true);
  }
  function pintarMarca() {
    $('#marca-nombre').innerHTML = `${esc(E.config.nombreTienda || 'Refills')} <span class="naranja">${esc(E.config.nombreAcento || '')}</span>`;
  }
  function irA(vista, forzar) {
    if (!forzar && E.sucio && !confirm('Tienes cambios sin guardar. ¿Salir sin guardarlos?')) return;
    limpiarSucio();
    E.ordenando = false;
    E.vista = vista;
    $$('.navegacion button').forEach((b) => b.classList.toggle('activo', b.dataset.vista === vista || (b.dataset.tambien || '').split(',').includes(vista)));
    prepararBorrador();
    pintar();
    window.scrollTo(0, 0);
  }
  function prepararBorrador() {
    const c = E.config;
    const k = E.catalogo;
    if (E.vista === 'combos') {
      E.borrador = {
        reglas: k.reglasCombo.map((r) => ({
          cantidad: String(r.cantidad), nombre: r.nombre || '',
          tipo: typeof r.porcentaje === 'number' ? 'porcentaje' : 'descuento',
          valor: typeof r.porcentaje === 'number' ? String(r.porcentaje).replace('.', ',') : textoPrecio(r.descuento)
        })),
        populares: k.combosDestacados.map((p) => ({ servicios: (p.servicios || []).slice(), nombre: p.nombre || '', precio: textoPrecio(p.precio) }))
      };
    } else if (E.vista === 'tienda') {
      E.borrador = clonar({ nombreTienda: c.nombreTienda || '', nombreAcento: c.nombreAcento || '', subtitulo: c.subtitulo || '', whatsapp: c.whatsapp || '', redes: c.redes });
    } else if (E.vista === 'pagos') {
      E.borrador = clonar({ cuentasBancarias: c.cuentasBancarias, binance: c.binance });
    } else if (E.vista === 'ayuda') {
      E.borrador = AY.datos ? clonar(AY.datos) : null;
    } else {
      E.borrador = E.ordenando ? clonar(E.catalogo) : null;
    }
  }
  const VISTAS = {};
  function pintar() {
    $('#contenido').innerHTML = VISTAS[E.vista]();
  }

  function conectarApp() {
    $$('.navegacion button').forEach((b) => b.addEventListener('click', () => { if (b.dataset.vista !== E.vista) irA(b.dataset.vista); }));
    $('#btn-menu').addEventListener('click', (e) => { e.stopPropagation(); $('#menu-cuenta').hidden = !$('#menu-cuenta').hidden; });
    document.addEventListener('click', (e) => { if (!e.target.closest('#menu-cuenta')) $('#menu-cuenta').hidden = true; });
    $('#btn-descartar').addEventListener('click', () => { limpiarSucio(); E.ordenando = false; prepararBorrador(); pintar(); });
    $('#btn-guardar-vista').addEventListener('click', guardarVista);
    $('#btn-respaldo').addEventListener('click', descargarRespaldo);

    const contenido = $('#contenido');
    contenido.addEventListener('click', (e) => {
      if (e.target.closest('.interruptor')) return;
      const b = e.target.closest('[data-accion]');
      if (b) ACCIONES[b.dataset.accion] && ACCIONES[b.dataset.accion](b, e);
    });
    contenido.addEventListener('input', alEscribir);
    contenido.addEventListener('change', (e) => {
      if (e.target.matches('[data-promo-archivo]')) { alElegirPromo(e.target); return; }
      if (e.target.matches('[data-promo]')) { alEditarPromo(e.target); return; }
      const v = e.target.closest('[data-visible]');
      if (v) { cambiarVisible(v.dataset.visible, v.checked, v); return; }
      alEscribir(e);
    });
  }

  // Campos enlazados al borrador: data-b="ruta" (data-t="bool" para casillas)
  function alEscribir(e) {
    const el = e.target;
    if (el.matches('[data-buscar]')) { E.busqueda = el.value; $('#lista-productos').innerHTML = listaProductos(); return; }
    if (el.matches('[data-promo]') && el.type !== 'checkbox' && el.tagName !== 'SELECT' && el.type !== 'date') { alEditarPromo(el); return; }
    if (el.matches('[data-buscar-ventas]')) { V.busqueda = el.value; $('#lista-ventas').innerHTML = filasFiltradas().map(filaCliente).join('') || '<div class="vacio"><i class="fa-solid fa-magnifying-glass"></i>Nadie coincide con esa búsqueda.</div>'; return; }
    if (!el.dataset.b || !E.borrador) return;
    asignar(E.borrador, el.dataset.b, el.dataset.t === 'bool' ? el.checked : el.value);
    marcarSucio();
    if (E.vista === 'tienda') previaTienda();
    if (E.vista === 'combos') ejemplosCombos();
    if (E.vista === 'pagos') {
      const m = el.dataset.b.match(/^cuentasBancarias\.(\d+)\.banco$/);
      if (m) $(`[data-prev-banco="${m[1]}"]`).textContent = el.value || 'Nuevo banco';
    }
  }

  async function guardarVista() {
    const btn = $('#btn-guardar-vista');
    btn.disabled = true;
    try {
      if (E.vista === 'productos' || E.vista === 'categorias') {
        const nuevo = clonar(E.catalogo);
        if (E.vista === 'productos') nuevo.servicios = E.borrador.servicios;
        else nuevo.categorias = E.borrador.categorias;
        await guardarDoc('catalogo', nuevo);
        E.catalogo = nuevo;
        E.ordenando = false;
      } else if (E.vista === 'combos') {
        const r = construirCombos();
        if (r.error) { aviso(r.error, 'error'); return; }
        const nuevo = Object.assign(clonar(E.catalogo), { reglasCombo: r.reglas, combosDestacados: r.populares });
        await guardarDoc('catalogo', nuevo);
        E.catalogo = nuevo;
      } else if (E.vista === 'tienda') {
        const r = construirTienda();
        if (r.error) { aviso(r.error, 'error'); return; }
        const nuevo = Object.assign(clonar(E.config), r.datos);
        await guardarDoc('config', nuevo);
        E.config = nuevo;
        pintarMarca();
      } else if (E.vista === 'pagos') {
        const r = construirPagos();
        if (r.error) { aviso(r.error, 'error'); return; }
        const nuevo = Object.assign(clonar(E.config), r.datos);
        await guardarDoc('config', nuevo);
        E.config = nuevo;
      } else if (E.vista === 'ayuda') {
        const r = construirAyuda();
        if (r.error) { aviso(r.error, 'error'); return; }
        const datos = Object.assign({}, r.datos, { version: AY.version + 1, actualizado: marcaTiempo() });
        await db.collection('tienda').doc('paginas').set(datos);
        AY.datos = clonar(r.datos); AY.version += 1; AY.publicado = true;
      }
      limpiarSucio();
      prepararBorrador();
      pintar();
      aviso('Guardado. Ya se ve en tu tienda.');
    } catch (e) {
      errorGuardar(e);
    } finally {
      btn.disabled = false;
    }
  }

  function mover(lista, id, paso, mismaCategoria) {
    const i = lista.findIndex((x) => x.id === id);
    let j = i + paso;
    while (mismaCategoria && j >= 0 && j < lista.length && lista[j].categoria !== lista[i].categoria) j += paso;
    if (i < 0 || j < 0 || j >= lista.length) return false;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    return true;
  }


  /* ---------------- Vista: Clientes (suscripciones y renovaciones) ---------------- */
  const DIA = 86400000;
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const aFecha = (v) => (!v ? null : typeof v.toDate === 'function' ? v.toDate() : new Date(v));
  const fechaCorta = (f) => { const d = aFecha(f); return d ? `${String(d.getDate()).padStart(2, '0')} ${MESES[d.getMonth()]} ${d.getFullYear()}` : ''; };
  const diaEC = (f) => Math.floor((aFecha(f).getTime() - 5 * 3600000) / DIA);
  // Mismo cálculo que ve el cliente y que usan los correos.
  function estadoServicio(entregadoEn, dias, ahora = new Date()) {
    const base = aFecha(entregadoEn);
    if (!base || !(Number(dias) > 0)) return null;
    const fin = new Date(base.getTime() + Number(dias) * DIA);
    const quedan = diaEC(fin) - diaEC(ahora);
    const vencido = fin.getTime() <= ahora.getTime();
    const progreso = Math.max(0, Math.min(1, (fin.getTime() - ahora.getTime()) / (Number(dias) * DIA)));
    let texto; let clase;
    if (vencido) { texto = quedan >= 0 ? 'Venció hoy' : quedan === -1 ? 'Venció ayer' : `Venció hace ${-quedan} días`; clase = 'vencido'; }
    else if (quedan <= 0) { texto = 'Vence hoy'; clase = 'urgente'; }
    else if (quedan === 1) { texto = 'Vence mañana'; clase = 'urgente'; }
    else { texto = `Quedan ${quedan} días`; clase = quedan <= 3 ? 'pronto' : 'ok'; }
    return { fin, quedan, vencido, progreso, texto, clase };
  }
  const nombreItem = (it) => (it.tipo === 'combo'
    ? `${it.nombre}: ${(it.servicios || []).map((x) => x.nombre).join(' + ')}`
    : `${it.servicio} (${it.plan})`) + (it.cantidad > 1 ? ` x${it.cantidad}` : '');
  function enlaceRenovar(items) {
    const lista = (items || []).filter((it) => Number(it.dias) > 0).map((it) => (it.tipo === 'combo'
      ? ['c', (it.servicios || []).map((x) => x.id).filter(Boolean), it.cantidad || 1]
      : ['p', it.servicioId, it.planId, it.cantidad || 1])).filter((x) => (x[0] === 'c' ? x[1].length >= 2 : x[1] && x[2]));
    const raiz = new URL('../', location.href).href.replace(/\/$/, '');
    if (!lista.length) return `${raiz}/`;
    return `${raiz}/?renovar=${btoa(JSON.stringify(lista)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  }
  function whatsappCliente(numero) {
    let n = String(numero || '').replace(/\D/g, '');
    if (/^09\d{8}$/.test(n)) n = `593${n.slice(1)}`;
    return /^\d{10,15}$/.test(n) ? n : '';
  }

  const V = { datos: null, cargando: false, error: '', filtro: 'pronto', busqueda: '', enviando: {} };
  async function cargarVentas() {
    if (V.cargando) return;
    V.cargando = true;
    V.error = '';
    if (E.vista === 'clientes') pintar();
    try {
      const snap = await db.collection('pedidos').where('estado', '==', 'entregado').get();
      const pedidos = snap.docs.map((d) => Object.assign({ id: d.id }, d.data({ serverTimestamps: 'estimate' })));
      const ahora = new Date();
      const filas = [];
      const sinVence = [];
      pedidos.forEach((p) => {
        const conDias = (p.items || []).filter((it) => Number(it.dias) > 0);
        if (conDias.length && !p.vence && aFecha(p.entregadoEn)) sinVence.push(p);
        conDias.forEach((it, i) => {
          const e = estadoServicio(p.entregadoEn, it.dias, ahora);
          if (e) filas.push({ clave: `${p.id}:${i}`, p, it, e, servicio: nombreItem(it) });
        });
      });
      V.datos = { filas, pedidos, clientes: new Set(pedidos.map((p) => p.uid)).size };
      // Pedidos de antes de esta versión: les completamos la fecha para los avisos automáticos.
      if (sinVence.length) {
        const lote = db.batch();
        sinVence.slice(0, 400).forEach((p) => {
          const dias = Math.min(...(p.items || []).map((i) => Number(i.dias) || 0).filter((d) => d > 0));
          lote.update(db.collection('pedidos').doc(p.id), { vence: firebase.firestore.Timestamp.fromDate(new Date(aFecha(p.entregadoEn).getTime() + dias * DIA)) });
        });
        lote.commit().catch((e) => console.warn('No se pudo completar el vencimiento de pedidos antiguos:', e && e.message));
      }
    } catch (e) {
      console.error(e);
      V.error = e && e.code === 'permission-denied'
        ? 'Para ver tus clientes publica las reglas nuevas de Firebase (firebase/firestore.rules).'
        : 'No pudimos cargar tus ventas. Revisa tu internet y toca Actualizar.';
    } finally {
      V.cargando = false;
      if (E.vista === 'clientes') pintar();
    }
  }
  function filasFiltradas() {
    const q = V.busqueda.trim().toLowerCase();
    let filas = V.datos.filas.filter((f) => !q || `${f.p.nombre || ''} ${f.p.email || ''} ${f.p.codigo || ''} ${f.servicio} ${f.p.whatsapp || ''}`.toLowerCase().includes(q));
    if (V.filtro === 'pronto') filas = filas.filter((f) => !f.e.vencido && f.e.quedan <= 3);
    else if (V.filtro === 'activas') filas = filas.filter((f) => !f.e.vencido);
    else if (V.filtro === 'vencidas') filas = filas.filter((f) => f.e.vencido);
    return filas.sort((a, b) => (V.filtro === 'vencidas' ? b.e.fin - a.e.fin : a.e.fin - b.e.fin));
  }
  function filaCliente(f) {
    const { p, e } = f;
    const wa = whatsappCliente(p.whatsapp);
    const numero = e.vencido ? '0' : String(Math.max(0, e.quedan));
    const recordado = aFecha(p.recordatorio);
    return `<article class="sus sus--${e.clase}">
      <div class="sus-cuenta"><strong>${numero}</strong><span>${e.quedan === 1 && !e.vencido ? 'día' : 'días'}</span></div>
      <div class="sus-info">
        <div class="sus-linea"><strong class="sus-nombre">${esc(p.nombre || p.email || 'Cliente')}</strong><span class="estado-sus">${esc(e.texto)}</span></div>
        <span class="sus-servicio">${esc(f.servicio)}</span>
        <span class="sus-meta">${esc(p.codigo || '')} · ${e.vencido ? 'venció' : 'vence'} el ${esc(fechaCorta(e.fin))}</span>
        <div class="sus-barra"><i style="width:${(e.progreso * 100).toFixed(1)}%"></i></div>
        <span class="sus-meta">${esc(p.email || '')}${p.whatsapp ? ` · ${esc(p.whatsapp)}` : ''}</span>
        <div class="sus-acciones">
          <button type="button" class="btn btn-secundario btn-chico" data-accion="recordar" data-id="${esc(p.id)}" ${V.enviando[p.id] ? 'disabled' : ''}>
            <i class="fa-solid ${V.enviando[p.id] ? 'fa-spinner fa-spin' : 'fa-envelope'}"></i> ${recordado ? 'Recordar otra vez' : 'Enviar recordatorio'}</button>
          ${wa ? `<a class="btn btn-secundario btn-chico btn-wa" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(`Hola ${String(p.nombre || '').split(' ')[0]}, te saluda ${E.config.nombreTienda || 'Refills'} ${E.config.nombreAcento || ''}. Tu ${f.servicio} ${e.texto.toLowerCase()} (${fechaCorta(e.fin)}). ¿Deseas renovarlo? Puedes hacerlo aquí: ${enlaceRenovar(p.items)}`)}"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>` : ''}
        </div>
        ${recordado ? `<span class="sus-recordado"><i class="fa-solid fa-check"></i> Recordatorio enviado el ${esc(fechaCorta(recordado))}${p.recordatorios > 1 ? ` (${p.recordatorios} veces)` : ''}</span>` : ''}
      </div>
    </article>`;
  }
  VISTAS.clientes = () => {
    if (!V.datos && !V.cargando && !V.error) setTimeout(cargarVentas, 0);
    const cab = `<div class="vista-cabecera">
        <div><h1 class="vista-titulo">Clientes</h1><p class="vista-sub">Suscripciones entregadas, días restantes y renovaciones.</p></div>
        <button type="button" class="btn btn-secundario btn-chico" data-accion="actualizar-ventas" ${V.cargando ? 'disabled' : ''}><i class="fa-solid fa-rotate ${V.cargando ? 'fa-spin' : ''}"></i> Actualizar</button>
      </div>`;
    if (V.error) return `${cab}<div class="error-hoja">${esc(V.error)}</div>`;
    if (!V.datos) return `${cab}<div class="vacio"><i class="fa-solid fa-spinner fa-spin"></i>Cargando tus ventas...</div>`;
    const todas = V.datos.filas;
    const cuenta = {
      pronto: todas.filter((f) => !f.e.vencido && f.e.quedan <= 3).length,
      activas: todas.filter((f) => !f.e.vencido).length,
      vencidas: todas.filter((f) => f.e.vencido).length,
      todas: todas.length
    };
    const lista = filasFiltradas();
    const vacios = {
      pronto: 'Nadie vence en los próximos 3 días.',
      activas: 'Aún no tienes suscripciones activas.',
      vencidas: 'No hay suscripciones vencidas.',
      todas: 'Cuando entregues pedidos con días de servicio, aparecerán aquí.'
    };
    return `${cab}
      <div class="tarjetas-resumen">
        <button type="button" class="resumen ${V.filtro === 'pronto' ? 'sel' : ''} rosa" data-accion="filtro-ventas" data-f="pronto"><strong>${cuenta.pronto}</strong><span>Por vencer</span></button>
        <button type="button" class="resumen ${V.filtro === 'activas' ? 'sel' : ''}" data-accion="filtro-ventas" data-f="activas"><strong>${cuenta.activas}</strong><span>Activas</span></button>
        <button type="button" class="resumen ${V.filtro === 'vencidas' ? 'sel' : ''}" data-accion="filtro-ventas" data-f="vencidas"><strong>${cuenta.vencidas}</strong><span>Vencidas</span></button>
        <button type="button" class="resumen ${V.filtro === 'todas' ? 'sel' : ''}" data-accion="filtro-ventas" data-f="todas"><strong>${V.datos.clientes}</strong><span>Clientes</span></button>
      </div>
      <div class="buscador"><i class="fa-solid fa-magnifying-glass"></i><input class="entrada" type="search" placeholder="Buscar cliente, correo o pedido" value="${esc(V.busqueda)}" data-buscar-ventas aria-label="Buscar cliente"></div>
      <div class="barra-ventas">
        <span class="texto-suave">${lista.length} ${lista.length === 1 ? 'suscripción' : 'suscripciones'}</span>
        <button type="button" class="btn btn-texto btn-chico" data-accion="exportar-ventas" ${todas.length ? '' : 'disabled'}><i class="fa-solid fa-file-arrow-down"></i> Descargar reporte</button>
      </div>
      <div class="lista" id="lista-ventas">${lista.map(filaCliente).join('') || `<div class="vacio"><i class="fa-solid fa-mug-hot"></i>${vacios[V.filtro]}</div>`}</div>`;
  };
  async function recordar(id) {
    const f = V.datos.filas.find((x) => x.p.id === id);
    if (!f) return;
    const p = f.p;
    if (!CONFIG_ARCHIVO.workerUrl) { aviso('Primero conecta tu puente de Cloudflare (workerUrl en config.js).', 'error'); return; }
    if (!p.email) { aviso('Este cliente no tiene correo. Escríbele por WhatsApp.', 'info'); return; }
    if (p.recordatorio && !confirm(`Ya le enviaste un recordatorio el ${fechaCorta(p.recordatorio)}. ¿Enviar otro a ${p.email}?`)) return;
    V.enviando[id] = true;
    $('#lista-ventas').innerHTML = filasFiltradas().map(filaCliente).join('');
    try {
      const token = await auth.currentUser.getIdToken();
      const r = await fetch(`${CONFIG_ARCHIVO.workerUrl.replace(/\/+$/, '')}/recordatorio`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ pedidoId: id })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
      V.datos.filas.filter((x) => x.p.id === id).forEach((x) => { x.p.recordatorio = new Date(); x.p.recordatorios = (Number(x.p.recordatorios) || 0) + 1; });
      aviso(`Recordatorio enviado a ${d.para || p.email}`);
    } catch (e) {
      aviso(e.message === 'Failed to fetch' ? 'No pudimos conectar con tu puente. Revisa tu internet.' : `No se envió: ${e.message}`, 'error');
    } finally {
      delete V.enviando[id];
      if (E.vista === 'clientes') $('#lista-ventas').innerHTML = filasFiltradas().map(filaCliente).join('');
    }
  }
  function exportarVentas() {
    const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const encabezado = ['Cliente', 'Correo', 'WhatsApp', 'Pedido', 'Servicio', 'Entregado', 'Vence', 'Días restantes', 'Estado', 'Total pedido', 'Recordatorio enviado'];
    const filas = V.datos.filas.slice().sort((a, b) => a.e.fin - b.e.fin).map(({ p, e, servicio }) => [
      p.nombre || '', p.email || '', p.whatsapp || '', p.codigo || '', servicio, fechaCorta(p.entregadoEn), fechaCorta(e.fin),
      e.vencido ? 0 : Math.max(0, e.quedan), e.vencido ? 'Vencida' : e.clase === 'ok' ? 'Activa' : 'Por vencer',
      redondear(p.total).toFixed(2).replace('.', ','), p.recordatorio ? fechaCorta(p.recordatorio) : ''
    ]);
    const csv = '﻿' + [encabezado].concat(filas).map((f) => f.map(celda).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `clientes-refills-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    aviso('Reporte descargado. Ábrelo con Excel o Google Sheets.');
  }


  /* ---------------- Promoción emergente (ventana al abrir la tienda) ---------------- */
  const PR = { cargando: false, cargado: false, guardado: null, b: null, error: '', guardando: false, procesando: false };
  const PROMO_VACIA = { activa: false, imagen: '', titulo: '', boton: 'Ver promoción', enlace: 'ninguno', url: '', frecuencia: 'visita', hasta: '', version: 0 };
  const aTextoFecha = (v) => { const d = v ? (typeof v.toDate === 'function' ? v.toDate() : new Date(v)) : null; return d && !isNaN(d) ? new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 10) : ''; };
  async function cargarPromo() {
    if (PR.cargando) return;
    PR.cargando = true;
    try {
      const snap = await db.collection('tienda').doc('promo').get();
      const d = snap.exists ? snap.data() : {};
      PR.guardado = Object.assign({}, PROMO_VACIA, d, { hasta: aTextoFecha(d.hasta) });
      PR.b = clonar(PR.guardado);
      PR.cargado = true;
      PR.error = '';
    } catch (e) {
      console.error(e);
      PR.error = e && e.code === 'permission-denied' ? 'Publica las reglas nuevas de Firebase para usar la promoción.' : 'No pudimos cargar tu promoción. Revisa tu internet.';
    } finally {
      PR.cargando = false;
      pintarPromo();
    }
  }
  function opcionesDestino() {
    const ops = [['ninguno', 'Solo la imagen (sin botón)'], ['combos', 'Arma tu combo']];
    E.catalogo.categorias.forEach((c) => ops.push([`categoria:${c.id}`, `Categoría: ${c.nombre}`]));
    E.catalogo.servicios.filter((s) => s.activo !== false).forEach((s) => ops.push([`producto:${s.id}`, `Producto: ${s.nombre}`]));
    ops.push(['whatsapp', 'Escribirme por WhatsApp'], ['url', 'Otro enlace']);
    return ops;
  }
  function promoCambiada() { return JSON.stringify(PR.b) !== JSON.stringify(PR.guardado); }
  function promoHTML() {
    if (PR.error) return `<div class="error-hoja">${esc(PR.error)}</div>`;
    if (!PR.cargado) return '<p class="texto-suave"><i class="fa-solid fa-spinner fa-spin"></i> Cargando tu promoción...</p>';
    const b = PR.b;
    const g = PR.guardado;
    const vencida = b.hasta && new Date(`${b.hasta}T23:59:59-05:00`).getTime() < Date.now();
    const estado = g.activa && g.imagen
      ? (vencida ? '<span class="insignia ambar">Terminó su fecha</span>' : '<span class="insignia verde">Se está mostrando</span>')
      : '<span class="insignia">Apagada</span>';
    return `
      <div class="promo-cabeza">${estado}${g.imagen ? `<a class="btn btn-texto btn-chico" href="../index.html" target="_blank" rel="noopener"><i class="fa-solid fa-eye"></i> Ver en mi tienda</a>` : ''}</div>
      <label class="promo-imagen ${b.imagen ? 'con-imagen' : ''} ${PR.procesando ? 'cargando' : ''}">
        <input type="file" accept="image/*" data-promo-archivo hidden>
        ${b.imagen
          ? `<img src="${esc(b.imagen)}" alt="Vista previa de la promoción"><span class="promo-cambiar"><i class="fa-solid fa-image"></i> Cambiar imagen</span>`
          : `<i class="fa-solid fa-cloud-arrow-up"></i><strong>${PR.procesando ? 'Preparando imagen...' : 'Toca para subir tu imagen'}</strong><span>Vertical o cuadrada se ve mejor en el celular (por ejemplo 1080 × 1350)</span>`}
      </label>
      ${b.imagen ? `
        <label class="interruptor"><input type="checkbox" data-promo="activa" ${b.activa ? 'checked' : ''}><span class="pista"></span><span class="etiqueta">Mostrar a mis clientes al abrir la tienda</span></label>
        <label class="campo"><span>Nombre de la promoción <small>(solo para ti y para lectores de pantalla)</small></span><input data-promo="titulo" value="${esc(b.titulo)}" maxlength="60" placeholder="Ej.: Semana del combo Dúo"></label>
        <div class="rejilla-2">
          <label class="campo"><span>Al tocar la imagen</span><select data-promo="enlace">${opcionesDestino().map(([v, t]) => `<option value="${esc(v)}" ${b.enlace === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
          <label class="campo"><span>Texto del botón</span><input data-promo="boton" value="${esc(b.boton)}" maxlength="24" ${b.enlace === 'ninguno' ? 'disabled' : ''} placeholder="Ver promoción"></label>
        </div>
        ${b.enlace === 'url' ? `<label class="campo"><span>Enlace</span><input type="url" data-promo="url" value="${esc(b.url)}" placeholder="https://..." autocapitalize="off"></label>` : ''}
        <div class="rejilla-2">
          <label class="campo"><span>¿Cada cuánto la ven?</span><select data-promo="frecuencia">
            <option value="visita" ${b.frecuencia !== 'dia' ? 'selected' : ''}>Cada vez que entran</option>
            <option value="dia" ${b.frecuencia === 'dia' ? 'selected' : ''}>Una vez al día</option></select></label>
          <label class="campo"><span>Mostrar hasta <small>(opcional)</small></span><input type="date" data-promo="hasta" value="${esc(b.hasta)}"></label>
        </div>
        ${vencida ? '<p class="nota"><i class="fa-solid fa-circle-info"></i> La fecha "Mostrar hasta" ya pasó: tus clientes no la están viendo. Cámbiala o bórrala.</p>' : ''}
        <div class="promo-botones">
          <button type="button" class="btn btn-primario" data-accion="promo-publicar" ${PR.guardando || !promoCambiada() ? 'disabled' : ''}><i class="fa-solid fa-${PR.guardando ? 'spinner fa-spin' : 'check'}"></i> ${g.imagen ? 'Guardar cambios' : 'Publicar promoción'}</button>
          ${g.imagen ? '<button type="button" class="btn btn-peligro" data-accion="promo-quitar"><i class="fa-solid fa-trash-can"></i> Quitar</button>' : ''}
        </div>
        ${promoCambiada() && g.imagen ? '<small class="texto-suave">Tienes cambios en la promoción sin guardar.</small>' : ''}` : ''}`;
  }
  function pintarPromo() {
    const caja = $('#panel-promo');
    if (caja) caja.innerHTML = promoHTML();
  }
  async function comprimirPromo(archivo) {
    const url = URL.createObjectURL(archivo);
    try {
      const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; });
      let lado = 1350;
      let calidad = 0.88;
      let salida = '';
      for (let n = 0; n < 7; n++) {
        const k = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        salida = c.toDataURL('image/jpeg', calidad);
        if (salida.length < 700000) return salida;
        lado = Math.round(lado * 0.85);
        calidad = Math.max(0.6, calidad - 0.06);
      }
      return salida.length < 900000 ? salida : null;
    } finally { URL.revokeObjectURL(url); }
  }
  async function alElegirPromo(input) {
    const archivo = input.files && input.files[0];
    input.value = '';
    if (!archivo) return;
    if (!/^image\//.test(archivo.type)) { aviso('Elige una imagen (JPG o PNG).', 'error'); return; }
    PR.procesando = true; pintarPromo();
    try {
      const datos = await comprimirPromo(archivo);
      if (!datos) { aviso('La imagen es demasiado pesada. Prueba con otra.', 'error'); return; }
      const primera = !PR.b.imagen;
      PR.b.imagen = datos;
      if (primera) PR.b.activa = true;
      if (!PR.b.titulo) PR.b.titulo = archivo.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').slice(0, 60);
    } catch (e) {
      console.error(e);
      aviso('No pudimos leer esa imagen. Prueba con otra.', 'error');
    } finally { PR.procesando = false; pintarPromo(); }
  }
  function alEditarPromo(el) {
    const k = el.dataset.promo;
    PR.b[k] = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'enlace' || k === 'activa' || k === 'hasta') { pintarPromo(); return; }
    const btn = $('[data-accion="promo-publicar"]');
    if (btn) btn.disabled = PR.guardando || !promoCambiada();
  }
  async function publicarPromo() {
    const b = PR.b;
    if (!b.imagen) { aviso('Primero sube una imagen.', 'info'); return; }
    let url = String(b.url || '').trim();
    if (b.enlace === 'url') {
      if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
      if (!/^https?:\/\/\S+\.\S+/.test(url)) { aviso('Escribe un enlace válido o elige otra opción.', 'error'); return; }
    }
    const datos = {
      activa: !!b.activa, imagen: b.imagen, titulo: String(b.titulo || '').trim(), boton: String(b.boton || '').trim() || 'Ver promoción',
      enlace: b.enlace || 'ninguno', url: b.enlace === 'url' ? url : '', frecuencia: b.frecuencia === 'dia' ? 'dia' : 'visita',
      hasta: b.hasta ? firebase.firestore.Timestamp.fromDate(new Date(`${b.hasta}T23:59:59-05:00`)) : null,
      version: (Number(PR.guardado.version) || 0) + 1, actualizado: marcaTiempo()
    };
    PR.guardando = true; pintarPromo();
    try {
      await db.collection('tienda').doc('promo').set(datos);
      PR.guardado = Object.assign({}, PROMO_VACIA, clonar(Object.assign({}, datos, { hasta: b.hasta, actualizado: null })));
      delete PR.guardado.actualizado;
      PR.b = clonar(PR.guardado);
      aviso(datos.activa ? '¡Promoción publicada! Tus clientes la verán al abrir la tienda.' : 'Promoción guardada (apagada).');
    } catch (e) {
      errorGuardar(e);
    } finally { PR.guardando = false; pintarPromo(); }
  }
  async function quitarPromo() {
    if (!confirm('¿Quitar la promoción? Tus clientes dejarán de verla y se borrará la imagen.')) return;
    try {
      await db.collection('tienda').doc('promo').set({ activa: false, version: (Number(PR.guardado.version) || 0) + 1, actualizado: marcaTiempo() });
      PR.guardado = Object.assign({}, PROMO_VACIA, { version: (Number(PR.guardado.version) || 0) + 1 });
      PR.b = clonar(PR.guardado);
      aviso('Promoción quitada.');
    } catch (e) { errorGuardar(e); }
    pintarPromo();
  }
  window.addEventListener('beforeunload', (e) => { if (PR.cargado && PR.b && promoCambiada()) { e.preventDefault(); e.returnValue = ''; } });


  /* ---------------- Vista: Pedidos (sincronizada con Telegram) ---------------- */
  const PD = { pendientes: [], cerrados: { entregado: null, rechazado: null }, filtro: 'en_revision', escuchando: false, listo: false, conocidos: null, enviando: false };
  const ESTADO_PD = {
    en_revision: { nombre: 'En revisión', clase: 'ambar' },
    aprobado: { nombre: 'Por entregar', clase: 'azul' },
    entregado: { nombre: 'Entregado', clase: 'verde' },
    rechazado: { nombre: 'Rechazado', clase: 'roja' }
  };
  function haceCuanto(v) {
    const d = aFecha(v);
    if (!d) return '';
    const min = Math.floor((Date.now() - d.getTime()) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    return fechaCorta(d);
  }
  const resumenItems = (p) => (p.items || []).map(nombreItem).join(', ');
  function escucharPedidos() {
    if (PD.escuchando) return;
    PD.escuchando = true;
    db.collection('pedidos').where('estado', 'in', ['en_revision', 'aprobado']).onSnapshot((snap) => {
      const lista = snap.docs.map((d) => Object.assign({ id: d.id }, d.data({ serverTimestamps: 'estimate' })));
      lista.sort((a, b) => (aFecha(a.creado) || 0) - (aFecha(b.creado) || 0));
      if (PD.conocidos) {
        const nuevos = lista.filter((p) => p.estado === 'en_revision' && !PD.conocidos.has(p.id));
        if (nuevos.length) aviso(`🛒 Nuevo pedido ${nuevos[nuevos.length - 1].codigo || ''} por ${dinero(nuevos[nuevos.length - 1].total)}`, 'info');
      }
      PD.conocidos = new Set(lista.map((p) => p.id));
      PD.pendientes = lista;
      PD.listo = true;
      // Si un pedido salió de pendientes (entregado o rechazado), refrescamos esas listas.
      PD.cerrados = { entregado: null, rechazado: null };
      actualizarBadge();
      if (E.vista === 'pedidos' && !hoja) pintar();
      if (hoja && hoja.pedidoId) refrescarHojaPedido();
    }, (e) => {
      console.error(e);
      PD.error = e && e.code === 'permission-denied' ? 'Publica las reglas nuevas de Firebase para ver tus pedidos aquí.' : 'No pudimos cargar tus pedidos.';
      PD.listo = true;
      if (E.vista === 'pedidos') pintar();
    });
  }
  function actualizarBadge() {
    const n = PD.pendientes.length;
    const b = $('#badge-pedidos');
    if (b) { b.hidden = !n; b.textContent = n > 99 ? '99+' : n; }
    document.title = n ? `(${n}) Refills EC Panel` : 'Refills EC Panel';
  }
  async function cargarCerrados(estado) {
    try {
      const snap = await db.collection('pedidos').where('estado', '==', estado).get();
      PD.cerrados[estado] = snap.docs.map((d) => Object.assign({ id: d.id }, d.data({ serverTimestamps: 'estimate' })))
        .sort((a, b) => (aFecha(b.entregadoEn || b.actualizado || b.creado) || 0) - (aFecha(a.entregadoEn || a.actualizado || a.creado) || 0))
        .slice(0, 60);
    } catch (e) {
      console.error(e);
      PD.cerrados[estado] = [];
      aviso('No pudimos cargar esa lista. Revisa tu internet.', 'error');
    }
    if (E.vista === 'pedidos') pintar();
  }
  function listaPedidos() {
    if (PD.filtro === 'en_revision' || PD.filtro === 'aprobado') return PD.pendientes.filter((p) => p.estado === PD.filtro);
    if (!PD.cerrados[PD.filtro]) { cargarCerrados(PD.filtro); return null; }
    return PD.cerrados[PD.filtro];
  }
  function tarjetaPedido(p) {
    const est = ESTADO_PD[p.estado] || ESTADO_PD.en_revision;
    const minutos = (Date.now() - (aFecha(p.creado) || new Date()).getTime()) / 60000;
    const espera = (p.estado === 'en_revision' || p.estado === 'aprobado') && minutos > 15;
    const sinCosto = p.estado === 'entregado' && (p.costo === undefined || p.costo === null);
    return `<div class="fila tocable pedido-fila" data-accion="abrir-pedido" data-id="${esc(p.id)}">
      <div class="fila-texto">
        <div class="pedido-linea"><strong>${esc(p.codigo || 'Pedido')}</strong><span class="insignia ${est.clase}">${est.nombre}</span></div>
        <span>${esc(p.nombre || p.email || 'Cliente')} · ${esc(resumenItems(p))}</span>
        <div class="pedido-linea"><span class="${espera ? 'espera' : ''}">${espera ? '<i class="fa-solid fa-clock"></i> ' : ''}${esc(haceCuanto(p.estado === 'entregado' ? p.entregadoEn : p.creado))}${p.metodo && p.metodo.destino ? ` · ${esc(p.metodo.destino)}` : ''}</span>
          <b>${dinero(p.total)}${sinCosto ? ' <i class="fa-solid fa-circle-exclamation sin-costo" title="Sin costo registrado"></i>' : ''}</b></div>
      </div>
    </div>`;
  }
  VISTAS.pedidos = () => {
    escucharPedidos();
    const cuenta = (e) => PD.pendientes.filter((p) => p.estado === e).length;
    const chips = [['en_revision', 'Por revisar', cuenta('en_revision')], ['aprobado', 'Por entregar', cuenta('aprobado')], ['entregado', 'Entregados'], ['rechazado', 'Rechazados']];
    const cab = `<div class="vista-cabecera"><div><h1 class="vista-titulo">Pedidos</h1>
      <p class="vista-sub">Se actualizan en vivo. Lo que hagas aquí también se refleja en Telegram, y al revés.</p></div></div>
      <div class="chips">${chips.map(([id, t, n]) => `<button type="button" class="chip ${PD.filtro === id ? 'activo' : ''}" data-accion="filtro-pedidos" data-f="${id}">${t}${n ? ` <b class="chip-num">${n}</b>` : ''}</button>`).join('')}</div>`;
    if (PD.error) return `${cab}<div class="error-hoja">${esc(PD.error)}</div>`;
    if (!PD.listo) return `${cab}<div class="vacio"><i class="fa-solid fa-spinner fa-spin"></i>Cargando pedidos...</div>`;
    const lista = listaPedidos();
    if (!lista) return `${cab}<div class="vacio"><i class="fa-solid fa-spinner fa-spin"></i>Cargando...</div>`;
    const vacios = { en_revision: 'No hay pagos por revisar. ¡Todo al día!', aprobado: 'No tienes pedidos pendientes de entrega.', entregado: 'Aún no hay pedidos entregados.', rechazado: 'No hay pedidos rechazados.' };
    return `${cab}<div class="lista">${lista.map(tarjetaPedido).join('') || `<div class="vacio"><i class="fa-solid fa-mug-hot"></i>${vacios[PD.filtro]}</div>`}</div>`;
  }

  // Plantilla de entrega según lo que compró el cliente.
  function plantillaEntrega(p) {
    const tipoDe = (sid) => { const s = E.catalogo.servicios.find((x) => x.id === sid); return (s && s.entrega) || 'acceso'; };
    const bloqueAcceso = (titulo) => `📺 ${titulo}\n📧 Correo: \n🔑 Contraseña: \n👤 Perfil: \n🔢 PIN: `;
    const partes = [];
    (p.items || []).forEach((it) => {
      const veces = Math.max(1, Number(it.cantidad) || 1);
      for (let n = 0; n < veces; n++) {
        const extra = veces > 1 ? ` (${n + 1} de ${veces})` : '';
        if (it.tipo === 'combo') (it.servicios || []).forEach((s) => partes.push(bloqueAcceso(`${s.nombre} (${s.plan})${extra}`)));
        else {
          const t = tipoDe(it.servicioId);
          const datos = (it.datos || []).map((d) => `${d.etiqueta}: ${d.valor}`).join(' · ');
          if (t === 'codigo') partes.push(`🎁 ${it.servicio} (${it.plan})${extra}\n🔑 Código: `);
          else if (t === 'recarga') partes.push(`🎮 ${it.servicio} (${it.plan})${extra}\n✅ Recarga realizada${datos ? ` a ${datos}` : ''}`);
          else if (t === 'servicio') partes.push(`📈 ${it.servicio} (${it.plan})${extra}\n✅ Pedido en proceso${datos ? ` para ${datos}` : ''}. Verás los resultados en las próximas horas.`);
          else partes.push(bloqueAcceso(`${it.servicio} (${it.plan})${extra}`));
        }
      }
    });
    const conAcceso = partes.some((x) => x.includes('Contraseña'));
    return partes.join('\n\n') + (conAcceso ? '\n\n📌 Usa solo tu perfil y no cambies el correo, la contraseña ni el PIN.' : '');
  }
  function costoSugerido(p) {
    let total = 0;
    for (const it of p.items || []) {
      const cant = Number(it.cantidad) || 1;
      if (it.tipo === 'combo') {
        for (const s of it.servicios || []) {
          const svc = E.catalogo.servicios.find((x) => x.id === s.id);
          const plan = svc && planCombo(svc);
          if (!plan || typeof plan.costo !== 'number') return null;
          total += plan.costo * cant;
        }
      } else {
        const svc = E.catalogo.servicios.find((x) => x.id === it.servicioId);
        const plan = svc && (svc.planes || []).find((x) => x.id === it.planId);
        if (!plan || typeof plan.costo !== 'number') return null;
        total += plan.costo * cant;
      }
    }
    return redondear(total);
  }

  function pedidoActual(id) {
    return PD.pendientes.find((x) => x.id === id) || (PD.cerrados.entregado || []).find((x) => x.id === id)
      || (PD.cerrados.rechazado || []).find((x) => x.id === id) || null;
  }
  function refrescarHojaPedido() {
    if (!hoja || !hoja.pedidoId) return;
    const nuevo = PD.pendientes.find((x) => x.id === hoja.pedidoId);
    if (nuevo && nuevo.estado !== hoja.pedido().estado) {
      hoja.actualizar(nuevo);
    } else if (!nuevo && ['en_revision', 'aprobado'].includes(hoja.pedido().estado) && !PD.enviando) {
      // Salió de pendientes por fuera (por ejemplo, lo entregaste desde Telegram).
      db.collection('pedidos').doc(hoja.pedidoId).get().then((d) => { if (hoja && d.exists) hoja.actualizar(Object.assign({ id: d.id }, d.data())); }).catch(() => {});
    }
  }

  async function llamarPuente(ruta, cuerpo) {
    if (!CONFIG_ARCHIVO.workerUrl) throw new Error('Primero conecta tu puente de Cloudflare (workerUrl en config.js).');
    const token = await auth.currentUser.getIdToken();
    let r;
    try {
      r = await fetch(`${CONFIG_ARCHIVO.workerUrl.replace(/\/+$/, '')}${ruta}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(cuerpo)
      });
    } catch (e) { throw new Error('No pudimos conectar con tu puente. Revisa tu internet.'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const err = new Error(d.error || `Error ${r.status}`); err.estado = d.estado; throw err; }
    return d;
  }

  function abrirPedido(id) {
    let P = pedidoActual(id);
    if (!P) return;
    let comprobante = null; // undefined = cargando, '' = no hay
    let modo = null; // 'entregar' | 'corregir'
    let texto = '';
    let costo = '';
    let error = '';
    const cargarComprobante = () => {
      comprobante = undefined;
      db.collection('comprobantes').doc(id).get()
        .then((d) => { comprobante = d.exists ? d.data().imagen || '' : ''; if (hoja && hoja.pedidoId === id) pintarHoja(); })
        .catch(() => { comprobante = ''; if (hoja && hoja.pedidoId === id) pintarHoja(); });
    };
    cargarComprobante();
    const prepararForm = (m) => {
      modo = m;
      texto = m === 'corregir' ? (P.entrega || '') : plantillaEntrega(P);
      const sug = typeof P.costo === 'number' ? P.costo : costoSugerido(P);
      costo = sug === null || sug === undefined ? '' : textoPrecio(sug);
    };
    if (P.estado === 'aprobado') prepararForm('entregar');
    const ganancia = () => {
      const c = leerPrecio(costo);
      return isNaN(c) ? '' : `Ganancia: <b class="${P.total - c < 0 ? 'perdida' : ''}">${dinero(redondear(P.total - c))}</b>`;
    };
    const est = () => ESTADO_PD[P.estado] || ESTADO_PD.en_revision;
    const wa = whatsappCliente(P.whatsapp);
    abrirHoja({
      titulo: `Pedido ${P.codigo || ''}`,
      pedidoId: id,
      pedido: () => P,
      actualizar: (nuevo) => {
        const antes = P.estado;
        P = Object.assign({}, P, nuevo);
        if (antes !== P.estado && !PD.enviando) {
          aviso(`${P.codigo} ahora está "${est().nombre}" (actualizado desde Telegram).`, 'info');
          modo = P.estado === 'aprobado' ? (prepararForm('entregar'), 'entregar') : null;
        }
        pintarHoja();
      },
      sucio: false,
      cuerpo: () => `
        ${error ? `<div class="error-hoja">${esc(error)}</div>` : ''}
        <div class="pedido-resumen">
          <div class="pedido-linea"><span class="insignia ${est().clase}">${est().nombre}</span><span class="texto-suave">${esc(haceCuanto(P.creado))}</span></div>
          <strong class="pedido-total">${dinero(P.total)}</strong>
          <span class="texto-suave">${esc(P.metodo ? (P.metodo.destino || P.metodo.tipo) : '')}${P.ahorro > 0 ? ` · ahorro por combos ${dinero(P.ahorro)}` : ''}</span>
        </div>
        <section class="seccion-hoja"><h3>Cliente</h3>
          <div class="tarjeta-sub">
            <strong>${esc(P.nombre || 'Sin nombre')}</strong>
            <span class="texto-suave">${esc(P.email || '')}</span>
            <div class="sus-acciones">
              ${P.email ? `<a class="btn btn-secundario btn-chico" href="mailto:${esc(P.email)}"><i class="fa-solid fa-envelope"></i> Correo</a>` : ''}
              ${wa ? `<a class="btn btn-secundario btn-chico btn-wa" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(`Hola ${String(P.nombre || '').split(' ')[0]}, te escribo por tu pedido ${P.codigo} en Refills EC.`)}"><i class="fa-brands fa-whatsapp"></i> ${esc(P.whatsapp)}</a>` : ''}
            </div>
          </div>
        </section>
        <section class="seccion-hoja"><h3>Productos</h3>
          ${(P.items || []).map((it) => `<div class="tarjeta-sub item-pedido"><div class="pedido-linea"><strong>${esc(nombreItem(it))}</strong><b>${dinero(it.subtotal)}</b></div>
            ${(it.datos || []).map((d) => `<span class="dato-cliente">${esc(d.etiqueta)}: <b>${esc(d.valor)}</b> <button type="button" class="btn-icono mini" data-h="copiar" data-texto="${esc(d.valor)}" aria-label="Copiar"><i class="fa-regular fa-copy"></i></button></span>`).join('')}</div>`).join('')}
        </section>
        <section class="seccion-hoja"><h3>Comprobante</h3>
          ${comprobante === undefined ? '<p class="texto-suave"><i class="fa-solid fa-spinner fa-spin"></i> Cargando comprobante...</p>'
            : comprobante ? `<button type="button" class="comprobante" data-h="zoom"><img src="${esc(comprobante)}" alt="Comprobante de pago"></button><small class="texto-suave">Toca la imagen para verla más grande.</small>`
            : '<p class="texto-suave">Este pedido no tiene comprobante guardado.</p>'}
        </section>
        ${P.estado === 'entregado' && modo !== 'corregir' ? `
        <section class="seccion-hoja"><h3>Entregado <small>${esc(fechaCorta(P.entregadoEn))}</small></h3>
          <pre class="entrega-pre">${esc(P.entrega || '')}</pre>
          <div class="rejilla-costo">
            <label class="campo"><span>Te costó <small>(proveedor)</small></span><div class="prefijo"><b>$</b><input data-campo-pedido="costo" value="${esc(typeof P.costo === 'number' ? textoPrecio(P.costo) : '')}" inputmode="decimal" placeholder="${costoSugerido(P) !== null ? textoPrecio(costoSugerido(P)) : '1,00'}"></div></label>
            <button type="button" class="btn btn-secundario btn-chico" data-h="guardar-costo">Guardar costo</button>
          </div>
          ${typeof P.costo === 'number' ? `<small class="texto-suave">Ganancia de este pedido: <b>${dinero(redondear(P.total - P.costo))}</b></small>` : '<small class="aviso-costo"><i class="fa-solid fa-circle-exclamation"></i> Sin costo: tus estadísticas no pueden calcular la ganancia de este pedido.</small>'}
        </section>` : ''}
        ${modo ? `
        <section class="seccion-hoja form-entrega"><h3>${modo === 'corregir' ? 'Corregir entrega' : 'Datos para el cliente'}</h3>
          <textarea class="entrada entrega-texto" data-campo-pedido="texto" rows="10">${esc(texto)}</textarea>
          <small class="texto-suave">El cliente lo verá en su pedido${correoNota()}.</small>
          <div class="rejilla-costo">
            <label class="campo"><span>Te costó <small>(proveedor)</small></span><div class="prefijo"><b>$</b><input data-campo-pedido="costo-form" value="${esc(costo)}" inputmode="decimal" placeholder="1,00"></div></label>
            <span class="ganancia-plan" data-ganancia-pedido>${ganancia()}</span>
          </div>
        </section>` : ''}`,
      pie: () => {
        if (PD.enviando) return '<button type="button" class="btn btn-primario" disabled><i class="fa-solid fa-spinner fa-spin"></i> Guardando...</button>';
        if (modo) return `${modo === 'corregir' ? '<button type="button" class="btn btn-texto" data-h="cancelar-form">Cancelar</button>' : (P.estado !== 'entregado' ? '<button type="button" class="btn btn-peligro" data-h="rechazar" aria-label="Rechazar pago"><i class="fa-solid fa-xmark"></i></button>' : '')}
          <button type="button" class="btn btn-primario" data-h="${modo}"><i class="fa-solid fa-paper-plane"></i> ${modo === 'corregir' ? 'Guardar corrección' : P.estado === 'en_revision' ? 'Aprobar y entregar' : 'Entregar al cliente'}</button>`;
        if (P.estado === 'en_revision') return `<button type="button" class="btn btn-peligro" data-h="rechazar"><i class="fa-solid fa-xmark"></i> Rechazar</button>
          <button type="button" class="btn btn-secundario" data-h="form-entregar">Entregar ya</button>
          <button type="button" class="btn btn-primario" data-h="aprobar"><i class="fa-solid fa-check"></i> Aprobar</button>`;
        if (P.estado === 'rechazado') return '<button type="button" class="btn btn-primario" data-h="revisar"><i class="fa-solid fa-rotate-left"></i> Volver a revisión</button>';
        if (P.estado === 'entregado') return '<button type="button" class="btn btn-secundario" data-h="form-corregir"><i class="fa-solid fa-pen"></i> Corregir entrega</button>';
        return '';
      },
      entrada: (el) => {
        if (el.dataset.campoPedido === 'texto') texto = el.value;
        if (el.dataset.campoPedido === 'costo-form') { costo = el.value; const g = $('[data-ganancia-pedido]'); if (g) g.innerHTML = ganancia(); }
      },
      accion: async (nombre, b) => {
        if (nombre === 'copiar') { try { await navigator.clipboard.writeText(b.dataset.texto); aviso('Copiado'); } catch (e) { /* sin permiso */ } return; }
        if (nombre === 'zoom') { $('.comprobante').classList.toggle('grande'); return; }
        if (nombre === 'form-entregar') { prepararForm('entregar'); pintarHoja(); return; }
        if (nombre === 'form-corregir') { prepararForm('corregir'); pintarHoja(); return; }
        if (nombre === 'cancelar-form') { modo = null; error = ''; pintarHoja(); return; }
        if (nombre === 'guardar-costo') {
          const v = String($('[data-campo-pedido="costo"]').value || '').trim();
          const n = v ? leerPrecio(v) : null;
          if (v && isNaN(n)) { aviso('Escribe un costo válido, por ejemplo 1,00.', 'error'); return; }
          try {
            await db.collection('pedidos').doc(id).update({ costo: n });
            P.costo = n;
            const lista = PD.cerrados.entregado || [];
            const x = lista.find((y) => y.id === id); if (x) x.costo = n;
            if (V.datos) V.datos = null;
            ES.datos = null;
            aviso('Costo guardado.');
            pintarHoja();
          } catch (e) { errorGuardar(e); }
          return;
        }
        let accion = nombre;
        const cuerpo = { pedidoId: id };
        if (nombre === 'entregar' || nombre === 'corregir') {
          if (!texto.trim()) { error = 'Escribe los datos para el cliente.'; pintarHoja(); return; }
          if (/: *$/m.test(texto) && !confirm('Hay campos vacíos en la plantilla (por ejemplo "Contraseña:"). ¿Enviar igual?')) return;
          const c = String(costo).trim();
          if (c && isNaN(leerPrecio(c))) { error = 'Revisa el costo (ejemplo: 1,00).'; pintarHoja(); return; }
          Object.assign(cuerpo, { texto, costo: c ? leerPrecio(c) : null });
        } else if (nombre === 'rechazar') {
          if (!confirm(`¿Rechazar el pago de ${P.codigo}? ${P.email ? 'Le avisaremos por correo.' : ''}`)) return;
        } else if (!['aprobar', 'revisar'].includes(nombre)) return;
        cuerpo.accion = accion;
        PD.enviando = true; error = ''; pintarHoja();
        try {
          const r = await llamarPuente('/admin/pedido', cuerpo);
          P.estado = r.estado;
          if (nombre === 'entregar' || nombre === 'corregir') { P.entrega = texto; if (typeof r.costo === 'number') P.costo = r.costo; P.entregadoEn = P.entregadoEn || new Date(); }
          const correo = r.correo === 'enviado' ? ` · 📧 correo enviado a ${r.para}` : r.correo ? ' · ⚠️ el correo no se pudo enviar' : '';
          const textos = { aprobar: 'Pago aprobado', rechazar: 'Pago rechazado', revisar: 'De vuelta en revisión', entregar: '¡Entregado!', corregir: 'Entrega corregida' };
          aviso(`${P.codigo}: ${textos[nombre]}${correo}`, r.correo && r.correo !== 'enviado' ? 'error' : 'ok');
          PD.cerrados = { entregado: null, rechazado: null };
          ES.datos = null; V.datos = null;
          PD.enviando = false;
          if (nombre === 'aprobar') { prepararForm('entregar'); pintarHoja(); return; }
          if (nombre === 'revisar') { modo = null; pintarHoja(); return; }
          cerrarHoja(true);
          pintar();
        } catch (e) {
          PD.enviando = false;
          error = e.message;
          if (e.estado && e.estado !== P.estado) { P.estado = e.estado; modo = null; }
          pintarHoja();
        }
      }
    });
  }
  function correoNota() { return CONFIG_ARCHIVO.workerUrl ? ' y le llegará por correo (si configuraste Resend)' : ''; }


  /* ---------------- Vista: Ventas (estadísticas) ---------------- */
  const ES = { datos: null, cargando: false, error: '', mes: 0 };
  const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const COLOR_INGRESOS = '#9b6cf6';
  const COLOR_GANANCIA = '#e2447f';
  // Mes en hora de Ecuador: { a: año, m: 0-11 }
  const mesEC = (f) => { const d = new Date(aFecha(f).getTime() - 5 * 3600000); return { a: d.getUTCFullYear(), m: d.getUTCMonth() }; };
  const claveMes = (x) => `${x.a}-${String(x.m + 1).padStart(2, '0')}`;
  const sumarMes = (x, n) => { const t = x.a * 12 + x.m + n; return { a: Math.floor(t / 12), m: ((t % 12) + 12) % 12 }; };
  const compacto = (n) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',')}K` : `$${Math.round(n)}`);
  async function cargarEstadisticas() {
    if (ES.cargando) return;
    ES.cargando = true; ES.error = '';
    if (E.vista === 'ventas') pintar();
    try {
      const snap = await db.collection('pedidos').get();
      ES.datos = snap.docs.map((d) => Object.assign({ id: d.id }, d.data({ serverTimestamps: 'estimate' })));
    } catch (e) {
      console.error(e);
      ES.error = e && e.code === 'permission-denied' ? 'Publica las reglas nuevas de Firebase para ver tus estadísticas.' : 'No pudimos cargar tus ventas. Toca Actualizar.';
    } finally {
      ES.cargando = false;
      if (E.vista === 'ventas') pintar();
    }
  }
  function serviciosDeItem(it) {
    // Reparte las unidades y el dinero de un combo entre sus servicios.
    const cant = Number(it.cantidad) || 1;
    if (it.tipo !== 'combo') return [{ id: it.servicioId, nombre: it.servicio, unidades: cant, monto: Number(it.subtotal) || 0 }];
    const partes = (it.servicios || []).map((s) => {
      const svc = E.catalogo.servicios.find((x) => x.id === s.id);
      const pl = svc && planCombo(svc);
      return { id: s.id, nombre: s.nombre, peso: pl ? Number(pl.precio) || 1 : 1 };
    });
    const total = partes.reduce((a, x) => a + x.peso, 0) || 1;
    return partes.map((x) => ({ id: x.id, nombre: x.nombre, unidades: cant, monto: (Number(it.subtotal) || 0) * x.peso / total }));
  }
  function calcularMes(mes) {
    const clave = claveMes(mes);
    const entregados = ES.datos.filter((p) => p.estado === 'entregado' && aFecha(p.entregadoEn || p.creado));
    const delMes = entregados.filter((p) => claveMes(mesEC(p.entregadoEn || p.creado)) === clave);
    const conCosto = delMes.filter((p) => typeof p.costo === 'number');
    const sinCosto = delMes.filter((p) => typeof p.costo !== 'number');
    const ingresos = redondear(delMes.reduce((a, p) => a + (Number(p.total) || 0), 0));
    const egresos = redondear(conCosto.reduce((a, p) => a + p.costo, 0));
    const ingresosConCosto = redondear(conCosto.reduce((a, p) => a + (Number(p.total) || 0), 0));
    const ganancia = redondear(ingresosConCosto - egresos);
    // Más vendidos
    const porServicio = {};
    delMes.forEach((p) => (p.items || []).forEach((it) => serviciosDeItem(it).forEach((s) => {
      const k = s.id || s.nombre;
      porServicio[k] = porServicio[k] || { nombre: s.nombre, unidades: 0, monto: 0 };
      porServicio[k].unidades += s.unidades;
      porServicio[k].monto += s.monto;
    })));
    const top = Object.values(porServicio).sort((a, b) => b.unidades - a.unidades || b.monto - a.monto).slice(0, 6);
    // Clientes nuevos y que volvieron
    const primeraCompra = {};
    entregados.forEach((p) => { const f = aFecha(p.entregadoEn || p.creado); if (!primeraCompra[p.uid] || f < primeraCompra[p.uid]) primeraCompra[p.uid] = f; });
    const compradores = [...new Set(delMes.map((p) => p.uid))];
    const nuevos = compradores.filter((u) => claveMes(mesEC(primeraCompra[u])) === clave).length;
    // Renovaciones: servicios que vencieron este mes y si el cliente volvió a comprar cerca de esa fecha
    const ahora = Date.now();
    const DIA_MS = 86400000;
    const vencieron = entregados.filter((p) => p.vence && aFecha(p.vence).getTime() <= ahora && claveMes(mesEC(p.vence)) === clave);
    const renovaron = vencieron.filter((p) => {
      const v = aFecha(p.vence).getTime();
      return entregados.some((q) => q.id !== p.id && q.uid === p.uid && (() => { const f = aFecha(q.entregadoEn || q.creado).getTime(); return f > aFecha(p.entregadoEn || p.creado).getTime() && f >= v - 10 * DIA_MS && f <= v + 10 * DIA_MS; })());
    });
    const porVencer = entregados.filter((p) => p.vence && aFecha(p.vence).getTime() > ahora && claveMes(mesEC(p.vence)) === clave).length;
    return { ingresos, egresos, ganancia, ingresosConCosto, pedidos: delMes.length, sinCosto, top, compradores: compradores.length, nuevos, vencieron: vencieron.length, renovaron: renovaron.length, porVencer };
  }
  function variacion(actual, antes) {
    if (!antes) return actual ? '<span class="var sube">nuevo</span>' : '';
    const pct = Math.round(((actual - antes) / Math.abs(antes)) * 100);
    if (!pct) return '<span class="var">igual que el mes pasado</span>';
    return `<span class="var ${pct > 0 ? 'sube' : 'baja'}"><i class="fa-solid fa-arrow-${pct > 0 ? 'up' : 'down'}"></i> ${Math.abs(pct)}% vs. mes pasado</span>`;
  }
  function grafico(meses, seleccionado) {
    // El dibujo usa el ancho real de la pantalla para que las letras se lean igual en celular y computadora.
    const W = Math.round(Math.max(300, Math.min(760, (($('#contenido') || document.body).clientWidth || 360) - 68)));
    const H = Math.round(Math.max(190, Math.min(260, W * 0.42))); const izq = 44; const der = 8; const arriba = 14; const abajo = 30;
    const max = Math.max(1, ...meses.map((x) => Math.max(x.d.ingresos, x.d.ganancia)));
    const paso = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((p) => max / p <= 4) || Math.ceil(max / 4);
    const tope = Math.ceil(max / paso) * paso;
    const y = (v) => arriba + (H - arriba - abajo) * (1 - v / tope);
    const banda = (W - izq - der) / meses.length;
    const ancho = Math.min(24, banda / 2 - 6);
    const barra = (x, v, color, etiqueta) => {
      const top = y(Math.max(0, v)); const base = y(0); const h = Math.max(0, base - top);
      const r = Math.min(4, h);
      const d = h <= 0 ? '' : `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + ancho - r} Q${x + ancho},${top} ${x + ancho},${top + r} V${base} Z`;
      return `<path d="${d}" fill="${color}"/><rect x="${x - 3}" y="${arriba}" width="${ancho + 6}" height="${H - arriba - abajo}" fill="transparent" data-tip="${esc(etiqueta)}"/>`;
    };
    let lineas = '';
    for (let v = 0; v <= tope; v += paso) lineas += `<line x1="${izq}" x2="${W - der}" y1="${y(v)}" y2="${y(v)}" class="g-linea"/><text x="${izq - 8}" y="${y(v) + 4}" text-anchor="end" class="g-eje">${compacto(v)}</text>`;
    const cols = meses.map((x, i) => {
      const cx = izq + banda * i + banda / 2;
      const sel = i === seleccionado;
      const nombre = MESES_LARGOS[x.mes.m].slice(0, 3);
      return `${sel ? `<rect x="${izq + banda * i + 2}" y="${arriba - 6}" width="${banda - 4}" height="${H - arriba - abajo + 6}" rx="8" class="g-sel"/>` : ''}
        ${barra(cx - ancho - 1, x.d.ingresos, COLOR_INGRESOS, `${MESES_LARGOS[x.mes.m]}: ingresos ${dinero(x.d.ingresos)}`)}
        ${barra(cx + 1, x.d.ganancia, COLOR_GANANCIA, `${MESES_LARGOS[x.mes.m]}: ganancia ${dinero(x.d.ganancia)}`)}
        <text x="${cx}" y="${H - 10}" text-anchor="middle" class="g-eje ${sel ? 'g-eje-sel' : ''}">${nombre}</text>`;
    }).join('');
    return `<div class="grafico">
      <div class="leyenda"><span><i style="background:${COLOR_INGRESOS}"></i>Ingresos</span><span><i style="background:${COLOR_GANANCIA}"></i>Ganancia neta</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y ganancia de los últimos ${meses.length} meses">${lineas}${cols}</svg>
      <div class="g-tip" hidden></div>
      <details class="tabla-grafico"><summary>Ver en tabla</summary>
        <table><thead><tr><th>Mes</th><th>Ingresos</th><th>Egresos</th><th>Ganancia</th><th>Pedidos</th></tr></thead>
        <tbody>${meses.map((x) => `<tr><td>${MESES_LARGOS[x.mes.m]} ${x.mes.a}</td><td>${dinero(x.d.ingresos)}</td><td>${dinero(x.d.egresos)}</td><td>${dinero(x.d.ganancia)}</td><td>${x.d.pedidos}</td></tr>`).join('')}</tbody></table>
      </details>
    </div>`;
  }
  VISTAS.ventas = () => {
    if (!ES.datos && !ES.cargando && !ES.error) setTimeout(cargarEstadisticas, 0);
    const actual = sumarMes(mesEC(new Date()), ES.mes);
    const cab = `<div class="vista-cabecera"><div><h1 class="vista-titulo">Ventas</h1><p class="vista-sub">Ingresos, egresos y ganancia de tus pedidos entregados.</p></div>
      <button type="button" class="btn btn-secundario btn-chico" data-accion="actualizar-estadisticas" ${ES.cargando ? 'disabled' : ''}><i class="fa-solid fa-rotate ${ES.cargando ? 'fa-spin' : ''}"></i> Actualizar</button></div>
      <div class="selector-mes">
        <button type="button" class="btn-icono" data-accion="mes" data-n="-1" aria-label="Mes anterior"><i class="fa-solid fa-chevron-left"></i></button>
        <strong>${MESES_LARGOS[actual.m]} ${actual.a}</strong>
        <button type="button" class="btn-icono" data-accion="mes" data-n="1" aria-label="Mes siguiente" ${ES.mes >= 0 ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>
      </div>`;
    if (ES.error) return `${cab}<div class="error-hoja">${esc(ES.error)}</div>`;
    if (!ES.datos) return `${cab}<div class="vacio"><i class="fa-solid fa-spinner fa-spin"></i>Calculando tus números...</div>`;
    const d = calcularMes(actual);
    const prev = calcularMes(sumarMes(actual, -1));
    const meses = [-5, -4, -3, -2, -1, 0].map((n) => { const mes = sumarMes(actual, n); return { mes, d: n === 0 ? d : n === -1 ? prev : calcularMes(mes) }; });
    const margen = d.ingresosConCosto ? Math.round((d.ganancia / d.ingresosConCosto) * 100) : 0;
    const ticket = d.pedidos ? d.ingresos / d.pedidos : 0;
    const maxTop = Math.max(1, ...d.top.map((t) => t.unidades));
    const tasa = d.vencieron ? Math.round((d.renovaron / d.vencieron) * 100) : 0;
    return `${cab}
      <div class="kpis">
        <div class="kpi"><span>Ingresos</span><strong>${dinero(d.ingresos)}</strong>${variacion(d.ingresos, prev.ingresos)}</div>
        <div class="kpi"><span>Egresos <small>(proveedores)</small></span><strong>${dinero(d.egresos)}</strong>${variacion(d.egresos, prev.egresos)}</div>
        <div class="kpi kpi-destacado"><span>Ganancia neta</span><strong>${dinero(d.ganancia)}</strong>${d.ingresosConCosto ? `<span class="var">${margen}% de margen</span>` : ''}${variacion(d.ganancia, prev.ganancia)}</div>
      </div>
      <div class="kpis-chicos">
        <div><strong>${d.pedidos}</strong><span>Pedidos</span></div>
        <div><strong>${dinero(ticket)}</strong><span>Ticket promedio</span></div>
        <div><strong>${d.compradores}</strong><span>Clientes</span></div>
      </div>
      ${d.sinCosto.length ? `<div class="aviso-costo-panel"><i class="fa-solid fa-circle-exclamation"></i><div><b>${d.sinCosto.length} ${d.sinCosto.length === 1 ? 'pedido no tiene' : 'pedidos no tienen'} costo</b> (${dinero(d.sinCosto.reduce((a, p) => a + (Number(p.total) || 0), 0))} en ventas), así que no entran en la ganancia. Ponle costo a tus planes en Productos, o ábrelos en Pedidos → Entregados.</div></div>` : ''}
      <section class="panel"><h2 class="panel-titulo"><i class="fa-solid fa-chart-column"></i> Últimos 6 meses</h2>${grafico(meses, 5)}</section>
      <section class="panel"><h2 class="panel-titulo"><i class="fa-solid fa-trophy"></i> Más vendidos del mes</h2>
        ${d.top.length ? `<div class="top-lista">${d.top.map((t) => `<div class="top-fila"><div class="top-texto"><span>${esc(t.nombre)}</span><b>${t.unidades} ${t.unidades === 1 ? 'venta' : 'ventas'} · ${dinero(t.monto)}</b></div><div class="top-barra"><i style="width:${(t.unidades / maxTop * 100).toFixed(1)}%;background:${COLOR_INGRESOS}"></i></div></div>`).join('')}</div>` : '<p class="texto-suave">Aún no hay ventas entregadas este mes.</p>'}
      </section>
      <section class="panel"><h2 class="panel-titulo"><i class="fa-solid fa-user-group"></i> Clientes</h2>
        <div class="kpis-chicos">
          <div><strong>${d.nuevos}</strong><span>Nuevos</span></div>
          <div><strong>${Math.max(0, d.compradores - d.nuevos)}</strong><span>Volvieron a comprar</span></div>
          <div><strong>${d.vencieron ? `${tasa}%` : '–'}</strong><span>Renovaron</span></div>
        </div>
        <p class="texto-suave renov-nota">${d.vencieron ? `De ${d.vencieron} ${d.vencieron === 1 ? 'servicio que venció' : 'servicios que vencieron'} este mes, ${d.renovaron} ${d.renovaron === 1 ? 'se renovó' : 'se renovaron'}.` : 'Este mes aún no vence ningún servicio.'}${d.porVencer ? ` Faltan ${d.porVencer} por vencer este mes.` : ''}</p>
      </section>`;
  };


  /* ---------------- Vista: Preguntas y garantía ---------------- */
  const AY = { datos: null, cargando: false, error: '', version: 0 };
  async function cargarAyuda() {
    if (AY.cargando) return;
    AY.cargando = true;
    try {
      const snap = await db.collection('tienda').doc('paginas').get();
      const d = snap.exists ? snap.data() : null;
      const base = window.REFILLS_AYUDA || { preguntas: [], terminos: [] };
      AY.datos = d && Array.isArray(d.preguntas) ? { preguntas: d.preguntas, terminos: d.terminos || [] } : clonar(base);
      AY.version = d ? Number(d.version) || 0 : 0;
      AY.publicado = !!d;
    } catch (e) {
      console.error(e);
      AY.error = e && e.code === 'permission-denied' ? 'Publica las reglas nuevas de Firebase para editar estas páginas.' : 'No pudimos cargar tus textos.';
    } finally {
      AY.cargando = false;
      if (E.vista === 'ayuda' && !E.sucio) { prepararBorrador(); pintar(); }
    }
  }
  VISTAS.ayuda = () => {
    const cab = `<div class="vista-cabecera"><div><button type="button" class="volver" data-accion="ir" data-a="tienda"><i class="fa-solid fa-arrow-left"></i> Tienda</button>
      <h1 class="vista-titulo">Preguntas y garantía</h1><p class="vista-sub">Lo que ven tus clientes en "Preguntas frecuentes" y "Términos y garantía".</p></div>
      <a class="btn btn-secundario btn-chico" href="../ayuda.html" target="_blank" rel="noopener"><i class="fa-solid fa-eye"></i> Ver página</a></div>`;
    if (AY.error) return `${cab}<div class="error-hoja">${esc(AY.error)}</div>`;
    if (!E.borrador) { if (!AY.datos) setTimeout(cargarAyuda, 0); return `${cab}<div class="vacio"><i class="fa-solid fa-spinner fa-spin"></i>Cargando...</div>`; }
    const b = E.borrador;
    const bloque = (lista, i, tipo) => `<div class="tarjeta-sub">
        <label class="campo"><span>${tipo === 'preguntas' ? 'Pregunta' : 'Título'}</span><input data-b="${tipo}.${i}.${tipo === 'preguntas' ? 'p' : 't'}" value="${esc(tipo === 'preguntas' ? lista[i].p : lista[i].t)}" maxlength="120"></label>
        <label class="campo"><span>${tipo === 'preguntas' ? 'Respuesta' : 'Texto'}</span><textarea data-b="${tipo}.${i}.${tipo === 'preguntas' ? 'r' : 'x'}" rows="4" maxlength="1500">${esc(tipo === 'preguntas' ? lista[i].r : lista[i].x)}</textarea></label>
        <div class="acciones"><span></span><div>
          <button type="button" class="btn-icono mini" data-accion="ay-mover" data-tipo="${tipo}" data-i="${i}" data-n="-1" aria-label="Subir"><i class="fa-solid fa-chevron-up"></i></button>
          <button type="button" class="btn-icono mini" data-accion="ay-mover" data-tipo="${tipo}" data-i="${i}" data-n="1" aria-label="Bajar"><i class="fa-solid fa-chevron-down"></i></button>
          <button type="button" class="btn-icono mini peligro" data-accion="ay-quitar" data-tipo="${tipo}" data-i="${i}" aria-label="Quitar"><i class="fa-solid fa-trash-can"></i></button>
        </div></div>
      </div>`;
    return `${cab}
      ${AY.publicado ? '' : '<p class="nota" style="margin-bottom:1rem"><i class="fa-solid fa-circle-info"></i> Estos son textos de ejemplo que ya se muestran en tu tienda. Revísalos (sobre todo la garantía de 24 horas y el horario) y toca Guardar para que queden como tuyos.</p>'}
      <section class="panel pila"><h2 class="panel-titulo"><i class="fa-solid fa-circle-question"></i> Preguntas frecuentes <small>${b.preguntas.length}</small></h2>
        ${b.preguntas.map((_, i) => bloque(b.preguntas, i, 'preguntas')).join('')}
        <button type="button" class="btn btn-secundario" data-accion="ay-agregar" data-tipo="preguntas"><i class="fa-solid fa-plus"></i> Agregar pregunta</button>
      </section>
      <section class="panel pila"><h2 class="panel-titulo"><i class="fa-solid fa-shield-halved"></i> Términos y garantía <small>${b.terminos.length}</small></h2>
        ${b.terminos.map((_, i) => bloque(b.terminos, i, 'terminos')).join('')}
        <button type="button" class="btn btn-secundario" data-accion="ay-agregar" data-tipo="terminos"><i class="fa-solid fa-plus"></i> Agregar sección</button>
      </section>`;
  };
  function construirAyuda() {
    const b = E.borrador;
    const preguntas = b.preguntas.map((q) => ({ p: String(q.p || '').trim(), r: String(q.r || '').trim() }));
    const terminos = b.terminos.map((s) => ({ t: String(s.t || '').trim(), x: String(s.x || '').trim() }));
    if (preguntas.some((q) => !q.p || !q.r)) return { error: 'Cada pregunta necesita su respuesta (o quítala).' };
    if (terminos.some((s) => !s.t || !s.x)) return { error: 'Cada sección de términos necesita título y texto (o quítala).' };
    return { datos: { preguntas, terminos } };
  }

  /* ---------------- Vista: Productos ---------------- */
  function miniatura(s) {
    if (s.imagen) return `<img src="${esc(rutaImg(s.imagen))}" alt="" loading="lazy">`;
    const p = s.portada || {};
    return `<span class="portada-mini" style="--de:${esc(p.de || '#2a1240')};--a:${esc(p.a || '#5b1640')}"><i class="${esc(p.icono || 'fa-solid fa-bag-shopping')}"></i></span>`;
  }
  function filaProducto(s) {
    const planes = s.planes || [];
    const precios = planes.map((p) => Number(p.precio)).filter((n) => n > 0);
    const desde = precios.length ? Math.min(...precios) : 0;
    const insignias = [
      s.activo === false ? '<span class="insignia">Oculto</span>' : '',
      s.ejemplo ? '<span class="insignia ambar">Precio de ejemplo</span>' : '',
      s.destacado ? `<span class="insignia rosa">${esc(s.destacado)}</span>` : '',
      planCombo(s) ? '<span class="insignia verde">Combos</span>' : ''
    ].join('');
    const lado = E.ordenando
      ? `<div class="orden-botones">
           <button type="button" class="btn-icono mini" data-accion="subir" data-id="${esc(s.id)}" aria-label="Subir ${esc(s.nombre)}"><i class="fa-solid fa-chevron-up"></i></button>
           <button type="button" class="btn-icono mini" data-accion="bajar" data-id="${esc(s.id)}" aria-label="Bajar ${esc(s.nombre)}"><i class="fa-solid fa-chevron-down"></i></button>
         </div>`
      : `<label class="interruptor" title="Visible en la tienda"><input type="checkbox" data-visible="${esc(s.id)}" ${s.activo !== false ? 'checked' : ''} aria-label="Mostrar ${esc(s.nombre)} en la tienda"><span class="pista"></span></label>`;
    return `<div class="fila ${E.ordenando ? '' : 'tocable'} ${s.activo === false ? 'apagada' : ''}" ${E.ordenando ? '' : `data-accion="abrir-producto" data-id="${esc(s.id)}"`}>
      <div class="miniatura">${miniatura(s)}</div>
      <div class="fila-texto">
        <strong>${esc(s.nombre)}</strong>
        <span>${planes.length} ${planes.length === 1 ? 'plan' : 'planes'}, desde ${dinero(desde)}</span>
        ${insignias ? `<div class="insignias">${insignias}</div>` : ''}
      </div>
      ${lado}
    </div>`;
  }
  function listaProductos() {
    const fuente = E.ordenando ? E.borrador : E.catalogo;
    const q = E.busqueda.trim().toLowerCase();
    const cats = fuente.categorias;
    const filtrados = fuente.servicios.filter((s) => (E.filtro === 'todas' || s.categoria === E.filtro)
      && (!q || `${s.nombre} ${s.descripcion || ''}`.toLowerCase().includes(q)));
    const grupos = cats.filter((c) => E.filtro === 'todas' || c.id === E.filtro)
      .map((c) => ({ c, items: filtrados.filter((s) => s.categoria === c.id) }))
      .filter((g) => g.items.length);
    const sueltos = filtrados.filter((s) => !cats.some((c) => c.id === s.categoria));
    if (sueltos.length) grupos.push({ c: { nombre: 'Sin categoría', icono: 'fa-solid fa-circle-question' }, items: sueltos });
    if (!grupos.length) {
      return `<div class="vacio"><i class="fa-solid fa-box-open"></i>${q ? 'No hay productos con ese nombre.' : 'Aún no hay productos aquí. Toca "Nuevo producto" para crear el primero.'}</div>`;
    }
    return grupos.map((g) => `<p class="grupo-titulo"><i class="${esc(g.c.icono)}"></i> ${esc(g.c.nombre)}</p>${g.items.map(filaProducto).join('')}`).join('');
  }
  VISTAS.productos = () => {
    const fuente = E.ordenando ? E.borrador : E.catalogo;
    if (E.filtro !== 'todas' && !fuente.categorias.some((c) => c.id === E.filtro)) E.filtro = 'todas';
    const visibles = fuente.servicios.filter((s) => s.activo !== false).length;
    return `
      <div class="vista-cabecera">
        <div>
          <h1 class="vista-titulo">Productos</h1>
          <p class="vista-sub">${fuente.servicios.length} productos, ${visibles} visibles en tu tienda</p>
        </div>
        ${E.ordenando
          ? (E.sucio ? '' : '<button type="button" class="btn btn-texto" data-accion="cancelar-orden">Listo</button>')
          : `<div class="botones-cab">
              <button type="button" class="btn btn-secundario btn-chico" data-accion="ir-categorias"><i class="fa-solid fa-folder-open"></i> Categorías</button>
              <button type="button" class="btn btn-secundario btn-chico" data-accion="ir" data-a="combos"><i class="fa-solid fa-layer-group"></i> Combos</button>
              <button type="button" class="btn btn-secundario btn-chico" data-accion="ordenar"><i class="fa-solid fa-sort"></i> Ordenar</button>
            </div>`}
      </div>
      ${E.ordenando
        ? '<p class="nota"><i class="fa-solid fa-circle-info"></i> Usa las flechas para cambiar el orden en que aparecen en tu tienda y luego toca Guardar.</p><br>'
        : `<div class="buscador"><i class="fa-solid fa-magnifying-glass"></i><input class="entrada" type="search" placeholder="Buscar producto" value="${esc(E.busqueda)}" data-buscar aria-label="Buscar producto"></div>
           <div class="chips">${[{ id: 'todas', nombre: 'Todos' }].concat(fuente.categorias).map((c) => `<button type="button" class="chip ${E.filtro === c.id ? 'activo' : ''}" data-accion="filtro" data-cat="${esc(c.id)}">${esc(c.corto || c.nombre)}</button>`).join('')}</div>`}
      <div class="lista" id="lista-productos">${listaProductos()}</div>
      ${E.ordenando ? '' : '<button type="button" class="fab" data-accion="nuevo-producto"><i class="fa-solid fa-plus"></i> Nuevo producto</button>'}`;
  };

  async function cambiarVisible(id, visible, input) {
    const respaldo = clonar(E.catalogo);
    const s = E.catalogo.servicios.find((x) => x.id === id);
    if (!s) return;
    s.activo = visible;
    input.disabled = true;
    try {
      await guardarDoc('catalogo', E.catalogo);
      aviso(visible ? `${s.nombre} ya se ve en tu tienda` : `${s.nombre} quedó oculto en tu tienda`);
    } catch (e) {
      E.catalogo = respaldo;
      errorGuardar(e);
    }
    $('#lista-productos').innerHTML = listaProductos();
    $('.vista-sub').textContent = `${E.catalogo.servicios.length} productos, ${E.catalogo.servicios.filter((x) => x.activo !== false).length} visibles en tu tienda`;
  }

  /* ---------------- Vista: Categorías ---------------- */
  VISTAS.categorias = () => {
    const fuente = E.ordenando ? E.borrador : E.catalogo;
    const filas = fuente.categorias.map((c) => {
      const n = E.catalogo.servicios.filter((s) => s.categoria === c.id).length;
      const lado = E.ordenando
        ? `<div class="orden-botones">
             <button type="button" class="btn-icono mini" data-accion="subir-cat" data-id="${esc(c.id)}" aria-label="Subir"><i class="fa-solid fa-chevron-up"></i></button>
             <button type="button" class="btn-icono mini" data-accion="bajar-cat" data-id="${esc(c.id)}" aria-label="Bajar"><i class="fa-solid fa-chevron-down"></i></button>
           </div>`
        : '<i class="fa-solid fa-chevron-right texto-suave"></i>';
      return `<div class="fila ${E.ordenando ? '' : 'tocable'}" ${E.ordenando ? '' : `data-accion="abrir-categoria" data-id="${esc(c.id)}"`}>
        <span class="icono-cat"><i class="${esc(c.icono || 'fa-solid fa-tag')}"></i></span>
        <div class="fila-texto"><strong>${esc(c.nombre)}</strong><span>${n} ${n === 1 ? 'producto' : 'productos'}${c.descripcion ? `, ${esc(c.descripcion)}` : ''}</span></div>
        ${lado}
      </div>`;
    }).join('');
    return `
      <div class="vista-cabecera">
        <div><button type="button" class="volver" data-accion="ir-productos"><i class="fa-solid fa-arrow-left"></i> Productos</button><h1 class="vista-titulo">Categorías</h1><p class="vista-sub">Las secciones de tu tienda y los botones de arriba.</p></div>
        ${E.ordenando
          ? (E.sucio ? '' : '<button type="button" class="btn btn-texto" data-accion="cancelar-orden">Listo</button>')
          : '<button type="button" class="btn btn-secundario btn-chico" data-accion="ordenar"><i class="fa-solid fa-sort"></i> Ordenar</button>'}
      </div>
      <p class="nota" style="margin-bottom:1rem"><i class="fa-solid fa-circle-info"></i> "Combos" aparece solo en tu tienda, después de la primera categoría que tenga servicios con combos.</p>
      <div class="lista">${filas || '<div class="vacio"><i class="fa-solid fa-folder-open"></i>Aún no hay categorías.</div>'}</div>
      ${E.ordenando ? '' : '<button type="button" class="fab" data-accion="nueva-categoria"><i class="fa-solid fa-plus"></i> Nueva categoría</button>'}`;
  };

  /* ---------------- Vista: Combos ---------------- */
  function elegibles() {
    return E.catalogo.servicios.filter((s) => s.activo !== false && planCombo(s));
  }
  function nombreServicio(id) {
    const s = E.catalogo.servicios.find((x) => x.id === id);
    return s ? s.nombre : id;
  }
  function calcularCombo(ids, reglas, popular) {
    const svcs = ids.map((id) => E.catalogo.servicios.find((s) => s.id === id));
    if (ids.length < 2 || svcs.some((s) => !s || s.activo === false || !planCombo(s))) return null;
    const normal = redondear(svcs.reduce((a, s) => a + Number(planCombo(s).precio || 0), 0));
    const regla = reglas.find((r) => Number(r.cantidad) === ids.length);
    let precio = normal;
    const especial = popular ? leerPrecio(popular.precio) : NaN;
    if (!isNaN(especial)) precio = especial;
    else if (regla) {
      const v = leerPrecio(regla.valor) || 0;
      precio = regla.tipo === 'porcentaje' ? normal * (1 - v / 100) : normal - v;
    }
    precio = Math.max(0, redondear(precio));
    return { normal, precio, ahorro: redondear(normal - precio), nombre: (popular && popular.nombre) || (regla && regla.nombre) || 'Combo' };
  }
  function textoEjemploRegla(r) {
    const n = Number(r.cantidad);
    const ids = elegibles().slice(0, n).map((s) => s.id);
    if (ids.length < n) return `Necesitas al menos ${n} servicios con combos para usar este descuento.`;
    const c = calcularCombo(ids, [r], null);
    return c ? `Ej.: ${ids.map(nombreServicio).join(' + ')} = ${dinero(c.normal)} → <b>${dinero(c.precio)}</b>` : '';
  }
  function textoEjemploPopular(p) {
    const c = calcularCombo(p.servicios, E.borrador.reglas, p);
    if (!c) return '<span style="color:var(--rojo)">Este combo ya no es válido: uno de sus servicios está oculto o no entra en combos.</span>';
    return `${dinero(c.normal)} → <b>${dinero(c.precio)}</b> (${esc(c.nombre)})`;
  }
  function ejemplosCombos() {
    E.borrador.reglas.forEach((r, i) => { const el = $(`[data-ejemplo="${i}"]`); if (el) el.innerHTML = textoEjemploRegla(r); });
    E.borrador.populares.forEach((p, i) => { const el = $(`[data-ejemplo-pop="${i}"]`); if (el) el.innerHTML = textoEjemploPopular(p); });
  }
  VISTAS.combos = () => {
    const b = E.borrador;
    const eleg = elegibles();
    return `
      <div class="vista-cabecera"><div><button type="button" class="volver" data-accion="ir-productos"><i class="fa-solid fa-arrow-left"></i> Productos</button><h1 class="vista-titulo">Combos</h1><p class="vista-sub">Descuentos al juntar servicios y los combos que recomiendas.</p></div></div>

      <section class="panel pila">
        <h2 class="panel-titulo"><i class="fa-solid fa-tags"></i> Descuentos por cantidad</h2>
        ${b.reglas.map((r, i) => `
          <div class="tarjeta-sub">
            <div class="rejilla-2">
              <label class="campo"><span>Servicios</span>
                <select data-b="reglas.${i}.cantidad">${[2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${Number(r.cantidad) === n ? 'selected' : ''}>${n} servicios</option>`).join('')}</select></label>
              <label class="campo"><span>Nombre</span><input data-b="reglas.${i}.nombre" value="${esc(r.nombre)}" placeholder="Ej.: Combo Dúo" maxlength="24"></label>
            </div>
            <div class="rejilla-2">
              <label class="campo"><span>Tipo de descuento</span>
                <select data-b="reglas.${i}.tipo"><option value="descuento" ${r.tipo === 'descuento' ? 'selected' : ''}>Dólares menos</option><option value="porcentaje" ${r.tipo === 'porcentaje' ? 'selected' : ''}>Porcentaje menos</option></select></label>
              <label class="campo"><span>Cuánto</span><input data-b="reglas.${i}.valor" value="${esc(r.valor)}" inputmode="decimal" placeholder="${r.tipo === 'porcentaje' ? '10' : '1,00'}"></label>
            </div>
            <div class="acciones"><span class="ejemplo-combo" data-ejemplo="${i}">${textoEjemploRegla(r)}</span>
              <button type="button" class="btn-icono mini peligro" data-accion="quitar-regla" data-i="${i}" aria-label="Quitar descuento"><i class="fa-solid fa-trash-can"></i></button></div>
          </div>`).join('')}
        <button type="button" class="btn btn-secundario" data-accion="agregar-regla"><i class="fa-solid fa-plus"></i> Agregar descuento</button>
      </section>

      <section class="panel pila">
        <h2 class="panel-titulo"><i class="fa-solid fa-circle-check"></i> Servicios que entran en combos <small>${eleg.length}</small></h2>
        <div class="servicios-combo">${eleg.map((s) => `<span class="chip">${esc(s.nombre)}</span>`).join('') || '<span class="texto-suave">Ninguno todavía.</span>'}</div>
        <p class="nota"><i class="fa-solid fa-circle-info"></i> Para que un servicio entre en combos, ábrelo en Productos y marca "Entra en combos" en su plan de 1 pantalla.</p>
      </section>

      <section class="panel pila">
        <h2 class="panel-titulo"><i class="fa-solid fa-fire"></i> Combos populares <small>${b.populares.length}</small></h2>
        ${b.populares.map((p, i) => `
          <div class="tarjeta-sub">
            <div class="acciones"><strong>${esc(p.servicios.map(nombreServicio).join(' + '))}</strong>
              <button type="button" class="btn-icono mini peligro" data-accion="quitar-popular" data-i="${i}" aria-label="Quitar combo popular"><i class="fa-solid fa-trash-can"></i></button></div>
            <span class="ejemplo-combo" data-ejemplo-pop="${i}">${textoEjemploPopular(p)}</span>
            <div class="rejilla-2">
              <label class="campo"><span>Precio especial (opcional)</span><div class="prefijo"><b>$</b><input data-b="populares.${i}.precio" value="${esc(p.precio)}" inputmode="decimal" placeholder="Usa el descuento"></div></label>
              <label class="campo"><span>Nombre (opcional)</span><input data-b="populares.${i}.nombre" value="${esc(p.nombre)}" placeholder="Ej.: Dúo de fin de mes" maxlength="30"></label>
            </div>
          </div>`).join('') || '<p class="texto-suave">No tienes combos populares. Si no agregas ninguno, esa sección no aparece en tu tienda.</p>'}
        <button type="button" class="btn btn-secundario" data-accion="agregar-popular" ${eleg.length < 2 ? 'disabled' : ''}><i class="fa-solid fa-plus"></i> Agregar combo popular</button>
      </section>`;
  };
  function construirCombos() {
    const b = E.borrador;
    const reglas = [];
    const vistas = new Set();
    for (const r of b.reglas) {
      const cantidad = Number(r.cantidad);
      const valor = leerPrecio(r.valor);
      if (vistas.has(cantidad)) return { error: `Tienes dos descuentos para ${cantidad} servicios. Deja solo uno.` };
      vistas.add(cantidad);
      if (!r.nombre.trim()) return { error: `Ponle nombre al descuento de ${cantidad} servicios.` };
      if (isNaN(valor) || valor <= 0) return { error: `Escribe cuánto descuenta "${r.nombre}" (ej.: 1,00).` };
      if (r.tipo === 'porcentaje' && valor >= 100) return { error: `El porcentaje de "${r.nombre}" debe ser menor a 100.` };
      reglas.push(r.tipo === 'porcentaje' ? { cantidad, nombre: r.nombre.trim(), porcentaje: valor } : { cantidad, nombre: r.nombre.trim(), descuento: valor });
    }
    const populares = [];
    for (const p of b.populares) {
      const salida = { servicios: p.servicios.slice() };
      if (p.nombre.trim()) salida.nombre = p.nombre.trim();
      if (String(p.precio).trim()) {
        const v = leerPrecio(p.precio);
        if (isNaN(v) || v <= 0) return { error: `Revisa el precio especial de ${p.servicios.map(nombreServicio).join(' + ')} (ej.: 5,50).` };
        salida.precio = v;
      }
      populares.push(salida);
    }
    reglas.sort((a, z) => a.cantidad - z.cantidad);
    return { reglas, populares };
  }

  /* ---------------- Vista: Tienda ---------------- */
  function previaTienda() {
    const b = E.borrador;
    $('[data-prev="nombre"]').textContent = b.nombreTienda || 'Tu tienda';
    $('[data-prev="acento"]').textContent = b.nombreAcento || '';
    $('[data-prev="subtitulo"]').textContent = b.subtitulo || '';
  }
  VISTAS.tienda = () => {
    const b = E.borrador;
    const red = (id, nombre, icono, ej) => `<label class="campo"><span><i class="fa-brands ${icono}"></i> ${nombre}</span>
      <input type="url" data-b="redes.${id}" value="${esc(b.redes[id] || '')}" placeholder="${ej}" inputmode="url" autocapitalize="off"></label>`;
    if (!PR.cargado && !PR.cargando && !PR.error) setTimeout(cargarPromo, 0);
    return `
      <div class="vista-cabecera"><div><h1 class="vista-titulo">Tu tienda</h1><p class="vista-sub">Promoción, nombre, contacto y redes sociales.</p></div>
        <div class="botones-cab">
          <button type="button" class="btn btn-secundario btn-chico" data-accion="ir" data-a="pagos"><i class="fa-solid fa-wallet"></i> Pagos</button>
          <button type="button" class="btn btn-secundario btn-chico" data-accion="ir" data-a="ayuda"><i class="fa-solid fa-circle-question"></i> Preguntas y garantía</button>
        </div></div>
      <section class="panel pila panel-promo">
        <h2 class="panel-titulo"><i class="fa-solid fa-bullhorn"></i> Promoción al abrir la tienda</h2>
        <p class="texto-suave">Sube la imagen de tu promoción de la semana. Tus clientes la verán en una ventana con botón para cerrar apenas entren a tu tienda.</p>
        <div id="panel-promo" class="pila">${promoHTML()}</div>
      </section>
      <section class="panel">
        <div class="vista-marca">
          <div class="nombre"><span data-prev="nombre">${esc(b.nombreTienda)}</span> <span class="naranja" data-prev="acento">${esc(b.nombreAcento)}</span></div>
          <p data-prev="subtitulo">${esc(b.subtitulo)}</p>
        </div>
      </section>
      <section class="panel pila">
        <h2 class="panel-titulo"><i class="fa-solid fa-signature"></i> Nombre</h2>
        <div class="rejilla-2">
          <label class="campo"><span>Nombre</span><input data-b="nombreTienda" value="${esc(b.nombreTienda)}" maxlength="24"></label>
          <label class="campo"><span>Parte en naranja</span><input data-b="nombreAcento" value="${esc(b.nombreAcento)}" maxlength="12"></label>
        </div>
        <label class="campo"><span>Frase debajo del nombre</span><input data-b="subtitulo" value="${esc(b.subtitulo)}" maxlength="60"></label>
      </section>
      <section class="panel pila">
        <h2 class="panel-titulo"><i class="fa-solid fa-address-book"></i> Contacto y redes</h2>
        <label class="campo"><span><i class="fa-brands fa-whatsapp"></i> WhatsApp</span>
          <input data-b="whatsapp" value="${esc(b.whatsapp)}" inputmode="tel" placeholder="593991234567">
          <small>Puedes escribirlo como 0991234567 o 593991234567; se guarda en el formato correcto.</small></label>
        ${red('instagram', 'Instagram', 'fa-instagram', 'https://www.instagram.com/tu.tienda')}
        ${red('tiktok', 'TikTok', 'fa-tiktok', 'https://www.tiktok.com/@tu.tienda')}
        ${red('telegram', 'Telegram', 'fa-telegram', 'https://t.me/tu_canal')}
        <small class="texto-suave">Si dejas una red vacía, su botón no aparece en tu tienda.</small>
      </section>
      <section class="panel pila">
        <h2 class="panel-titulo"><i class="fa-solid fa-envelope"></i> Correos a tus clientes</h2>
        <p class="texto-suave">Tus clientes reciben un correo cuando entregas sus datos, cuando les respondes en el chat, si rechazas un pago y antes de que venza su servicio. Se configuran una vez en Cloudflare (Parte D de la guía).</p>
        <button type="button" class="btn btn-secundario" data-accion="correo-prueba"><i class="fa-solid fa-paper-plane"></i> Enviarme un correo de prueba</button>
      </section>
      <section class="panel">
        <h2 class="panel-titulo"><i class="fa-solid fa-image"></i> Logo</h2>
        <div style="display:flex;align-items:center;gap:1rem">
          <img src="../img/logoo.png" alt="Logo actual" style="width:64px;height:64px;object-fit:contain">
          <p class="texto-suave">Podrás cambiar el logo y subir imágenes desde aquí en la próxima actualización.</p>
        </div>
      </section>`;
  };
  function construirTienda() {
    const b = E.borrador;
    if (!b.nombreTienda.trim()) return { error: 'Escribe el nombre de tu tienda.' };
    let wa = String(b.whatsapp || '').replace(/\D/g, '');
    if (/^09\d{8}$/.test(wa)) wa = `593${wa.slice(1)}`;
    if (wa && !/^\d{10,15}$/.test(wa)) return { error: 'Revisa el número de WhatsApp (ej.: 0991234567).' };
    const redes = {};
    for (const k of ['instagram', 'tiktok', 'telegram']) {
      let url = String(b.redes[k] || '').trim();
      if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
      redes[k] = url;
    }
    return { datos: { nombreTienda: b.nombreTienda.trim(), nombreAcento: b.nombreAcento.trim(), subtitulo: b.subtitulo.trim(), whatsapp: wa, redes } };
  }

  /* ---------------- Vista: Pagos ---------------- */
  VISTAS.pagos = () => {
    const b = E.borrador;
    const cuentas = b.cuentasBancarias.map((c, i) => `
      <div class="cuenta-tarjeta tema-${esc(c.tema || 'generico')}">
        <div class="cuenta-cabeza">
          <strong data-prev-banco="${i}">${esc(c.banco || 'Nuevo banco')}</strong>
          <div style="display:flex;gap:.3rem">
            <button type="button" class="btn-icono mini" data-accion="subir-cuenta" data-i="${i}" aria-label="Subir"><i class="fa-solid fa-chevron-up"></i></button>
            <button type="button" class="btn-icono mini" data-accion="bajar-cuenta" data-i="${i}" aria-label="Bajar"><i class="fa-solid fa-chevron-down"></i></button>
            <button type="button" class="btn-icono mini" data-accion="quitar-cuenta" data-i="${i}" aria-label="Quitar cuenta"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </div>
        <div class="cuenta-cuerpo">
          <label class="campo"><span>Banco</span><input data-b="cuentasBancarias.${i}.banco" value="${esc(c.banco)}" placeholder="Ej.: Banco Pichincha"></label>
          <div class="campo"><span>Color de la tarjeta</span>
            <div class="temas">${TEMAS.map((t) => `<button type="button" class="tema-${t.id} ${c.tema === t.id ? 'sel' : ''}" data-accion="tema" data-i="${i}" data-tema="${t.id}" title="${t.nombre}" aria-label="${t.nombre}"></button>`).join('')}</div></div>
          <div class="rejilla-2">
            <label class="campo"><span>Tipo</span><select data-b="cuentasBancarias.${i}.tipo">${['Ahorros', 'Corriente'].map((t) => `<option ${c.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
            <label class="campo"><span>Número</span><input data-b="cuentasBancarias.${i}.numero" value="${esc(c.numero)}" inputmode="numeric"></label>
          </div>
          <label class="campo"><span>Titular</span><input data-b="cuentasBancarias.${i}.titular" value="${esc(c.titular)}"></label>
          <label class="campo"><span>Correo (opcional)</span><input type="email" data-b="cuentasBancarias.${i}.correo" value="${esc(c.correo)}" autocapitalize="off"></label>
        </div>
      </div>`).join('');
    return `
      <div class="vista-cabecera"><div><button type="button" class="volver" data-accion="ir" data-a="tienda"><i class="fa-solid fa-arrow-left"></i> Tienda</button><h1 class="vista-titulo">Pagos</h1><p class="vista-sub">Las cuentas que ven tus clientes al pagar.</p></div></div>
      <section class="panel pila">
        <h2 class="panel-titulo"><i class="fa-solid fa-building-columns"></i> Transferencias <small>${b.cuentasBancarias.length}</small></h2>
        ${cuentas || '<p class="texto-suave">No tienes cuentas. Agrega al menos una para recibir transferencias.</p>'}
        <button type="button" class="btn btn-secundario" data-accion="agregar-cuenta"><i class="fa-solid fa-plus"></i> Agregar cuenta</button>
      </section>
      <section class="panel pila">
        <h2 class="panel-titulo"><i class="fa-solid fa-coins"></i> Binance Pay</h2>
        <label class="interruptor"><input type="checkbox" data-b="binance.activo" data-t="bool" ${b.binance.activo ? 'checked' : ''}><span class="pista"></span><span class="etiqueta">Mostrar Binance Pay en la tienda</span></label>
        <div class="rejilla-2">
          <label class="campo"><span>Pay ID</span><input data-b="binance.payId" value="${esc(b.binance.payId)}" inputmode="numeric"></label>
          <label class="campo"><span>Usuario</span><input data-b="binance.usuario" value="${esc(b.binance.usuario)}" autocapitalize="off"></label>
        </div>
        <label class="campo"><span>Correo (opcional)</span><input type="email" data-b="binance.correo" value="${esc(b.binance.correo)}" autocapitalize="off"></label>
      </section>`;
  };
  function construirPagos() {
    const b = E.borrador;
    const cuentas = [];
    for (const c of b.cuentasBancarias) {
      if (!String(c.banco || '').trim()) return { error: 'Cada cuenta necesita el nombre del banco.' };
      if (!String(c.numero || '').trim()) return { error: `Escribe el número de cuenta de ${c.banco}.` };
      cuentas.push({ banco: c.banco.trim(), tema: c.tema || 'generico', tipo: c.tipo || 'Ahorros', numero: String(c.numero).trim(), titular: String(c.titular || '').trim(), correo: String(c.correo || '').trim() });
    }
    const bn = b.binance;
    if (bn.activo && !String(bn.payId || '').trim()) return { error: 'Escribe tu Pay ID de Binance o apaga Binance Pay.' };
    return { datos: { cuentasBancarias: cuentas, binance: { activo: !!bn.activo, payId: String(bn.payId || '').trim(), usuario: String(bn.usuario || '').trim(), correo: String(bn.correo || '').trim() } } };
  }

  /* ---------------- Acciones de las vistas ---------------- */
  const ACCIONES = {
    filtro: (b) => { E.filtro = b.dataset.cat; pintar(); },
    'ir-categorias': () => irA('categorias'),
    ir: (b) => irA(b.dataset.a),
    'filtro-pedidos': (b) => { PD.filtro = b.dataset.f; pintar(); },
    'ay-agregar': (b) => {
      const t = b.dataset.tipo;
      E.borrador[t].push(t === 'preguntas' ? { p: '', r: '' } : { t: '', x: '' });
      marcarSucio(); pintar();
      const campos = $$(`[data-b^="${t}."][data-b$=".${t === 'preguntas' ? 'p' : 't'}"]`);
      if (campos.length) campos[campos.length - 1].focus();
    },
    'ay-quitar': (b) => {
      const lista = E.borrador[b.dataset.tipo];
      if (!confirm('¿Quitar este bloque? Se aplica cuando toques Guardar.')) return;
      lista.splice(Number(b.dataset.i), 1); marcarSucio(); pintar();
    },
    'ay-mover': (b) => moverIndice(E.borrador[b.dataset.tipo], Number(b.dataset.i), Number(b.dataset.n)),
    'actualizar-estadisticas': () => { ES.datos = null; cargarEstadisticas(); },
    mes: (b) => { ES.mes = Math.min(0, ES.mes + Number(b.dataset.n)); pintar(); },
    'abrir-pedido': (b) => abrirPedido(b.dataset.id),
    'ir-productos': () => irA('productos'),
    'filtro-ventas': (b) => { V.filtro = b.dataset.f; pintar(); },
    'actualizar-ventas': () => cargarVentas(),
    'exportar-ventas': () => exportarVentas(),
    recordar: (b) => recordar(b.dataset.id),
    'correo-prueba': (b) => correoPrueba(b),
    'promo-publicar': () => publicarPromo(),
    'promo-quitar': () => quitarPromo(),
    ordenar: () => { E.ordenando = true; E.borrador = clonar(E.catalogo); pintar(); },
    'cancelar-orden': () => { E.ordenando = false; E.borrador = null; pintar(); },
    subir: (b) => { if (mover(E.borrador.servicios, b.dataset.id, -1, true)) { marcarSucio(); pintar(); } },
    bajar: (b) => { if (mover(E.borrador.servicios, b.dataset.id, 1, true)) { marcarSucio(); pintar(); } },
    'subir-cat': (b) => { if (mover(E.borrador.categorias, b.dataset.id, -1)) { marcarSucio(); pintar(); } },
    'bajar-cat': (b) => { if (mover(E.borrador.categorias, b.dataset.id, 1)) { marcarSucio(); pintar(); } },
    'abrir-producto': (b) => abrirProducto(b.dataset.id),
    'nuevo-producto': () => abrirProducto(null),
    'abrir-categoria': (b) => abrirCategoria(b.dataset.id),
    'nueva-categoria': () => abrirCategoria(null),
    'agregar-regla': () => {
      const usadas = E.borrador.reglas.map((r) => Number(r.cantidad));
      const n = [2, 3, 4, 5, 6].find((x) => !usadas.includes(x)) || 2;
      E.borrador.reglas.push({ cantidad: String(n), nombre: `Combo de ${n}`, tipo: 'descuento', valor: '' });
      marcarSucio(); pintar();
    },
    'quitar-regla': (b) => { E.borrador.reglas.splice(Number(b.dataset.i), 1); marcarSucio(); pintar(); },
    'quitar-popular': (b) => { E.borrador.populares.splice(Number(b.dataset.i), 1); marcarSucio(); pintar(); },
    'agregar-popular': () => abrirNuevoPopular(),
    'agregar-cuenta': () => {
      E.borrador.cuentasBancarias.push({ banco: '', tema: 'generico', tipo: 'Ahorros', numero: '', titular: '', correo: '' });
      marcarSucio(); pintar();
      const campos = $$('[data-b$=".banco"]');
      if (campos.length) campos[campos.length - 1].focus();
    },
    'quitar-cuenta': (b) => {
      const c = E.borrador.cuentasBancarias[Number(b.dataset.i)];
      if (!confirm(`¿Quitar la cuenta ${c.banco || 'nueva'}? Se aplicará cuando toques Guardar.`)) return;
      E.borrador.cuentasBancarias.splice(Number(b.dataset.i), 1); marcarSucio(); pintar();
    },
    'subir-cuenta': (b) => moverIndice(E.borrador.cuentasBancarias, Number(b.dataset.i), -1),
    'bajar-cuenta': (b) => moverIndice(E.borrador.cuentasBancarias, Number(b.dataset.i), 1),
    tema: (b) => { E.borrador.cuentasBancarias[Number(b.dataset.i)].tema = b.dataset.tema; marcarSucio(); pintar(); }
  };
  function moverIndice(lista, i, paso) {
    const j = i + paso;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    marcarSucio();
    pintar();
  }

  /* ---------------- Hoja de edición ---------------- */
  let hoja = null;
  function abrirHoja(op) {
    hoja = op;
    $('#hoja-titulo').textContent = op.titulo;
    pintarHoja();
    $('#hoja').hidden = false;
    document.body.classList.add('sin-scroll');
    $('#hoja-cuerpo').scrollTop = 0;
  }
  function pintarHoja() {
    const cuerpo = $('#hoja-cuerpo');
    const arriba = cuerpo.scrollTop;
    cuerpo.innerHTML = hoja.cuerpo();
    $('#hoja-pie').innerHTML = hoja.pie();
    cuerpo.scrollTop = arriba;
  }
  // Tooltip del gráfico (pasar el mouse o tocar una barra).
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    const tip = $('.g-tip');
    if (!tip) return;
    if (!t) { tip.hidden = true; return; }
    const caja = t.closest('.grafico').getBoundingClientRect();
    const r = t.getBoundingClientRect();
    tip.textContent = t.dataset.tip;
    tip.hidden = false;
    tip.style.left = `${Math.min(caja.width - tip.offsetWidth - 4, Math.max(4, r.left - caja.left + r.width / 2 - tip.offsetWidth / 2))}px`;
    tip.style.top = `${Math.max(0, r.top - caja.top + 8)}px`;
  });

  function cerrarHoja(forzar) {
    if (!hoja) return;
    if (!forzar && hoja.sucio && !confirm('¿Cerrar sin guardar los cambios?')) return;
    $('#hoja').hidden = true;
    const eraPedido = !!hoja.pedidoId;
    hoja = null;
    if (eraPedido && E.vista === 'pedidos') pintar();
    document.body.classList.remove('sin-scroll');
  }
  $('#hoja').addEventListener('click', (e) => {
    if (e.target.closest('[data-cerrar-hoja]') || e.target === $('#hoja')) { cerrarHoja(); return; }
    const b = e.target.closest('[data-h]');
    if (b && hoja && hoja.accion) hoja.accion(b.dataset.h, b);
  });
  ['input', 'change'].forEach((tipo) => $('#hoja').addEventListener(tipo, (e) => {
    if (hoja && hoja.entrada) { hoja.entrada(e.target, tipo); hoja.sucio = true; }
  }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && hoja) cerrarHoja(); });
  async function ocupado(boton, tarea) {
    const original = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
    try { return await tarea(); } finally { if (boton.isConnected) { boton.disabled = false; boton.innerHTML = original; } }
  }

  /* ---------------- Editor de producto ---------------- */
  function abrirProducto(id) {
    const original = id ? E.catalogo.servicios.find((s) => s.id === id) : null;
    const primera = E.filtro !== 'todas' ? E.filtro : (E.catalogo.categorias[0] ? E.catalogo.categorias[0].id : '');
    const P = original ? clonar(original) : {
      id: '', nombre: '', categoria: primera, activo: true, imagen: '', descripcion: '', etiqueta: '', destacado: '',
      planes: [{ id: '', nombre: '1 pantalla', precio: '', dias: '30' }], campos: []
    };
    P.portada = Object.assign({ de: '#2a1240', a: '#5b1640', icono: 'fa-solid fa-bag-shopping' }, P.portada || {});
    P.planes = (P.planes || []).map((p) => Object.assign({}, p, { precio: textoPrecio(p.precio), costo: textoPrecio(p.costo), dias: p.dias ? String(p.dias) : '' }));
    P.campos = (P.campos || []).map((c) => Object.assign({}, c, { soloNumeros: !!(c.patron && /\[0-9\]|\\d/.test(c.patron)) }));
    let modo = P.imagen ? (IMAGENES.includes(P.imagen) ? 'archivo' : 'enlace') : 'auto';
    let error = '';

    const imagenPrevia = () => {
      if (modo === 'auto' || !P.imagen) {
        return `<span class="portada-mini" style="--de:${esc(P.portada.de)};--a:${esc(P.portada.a)}"><i class="${esc(P.portada.icono)}"></i></span>`;
      }
      return `<img src="${esc(rutaImg(P.imagen))}" alt="">`;
    };
    const previa = () => {
      const precios = P.planes.map((p) => leerPrecio(p.precio)).filter((n) => n > 0);
      const desde = precios.length ? Math.min(...precios) : 0;
      return `<div class="imagen">${P.etiqueta ? `<span class="etiqueta-stock">${esc(P.etiqueta)}</span>` : ''}${imagenPrevia()}</div>
        <div class="texto">
          <small>Así se verá en tu tienda</small>
          <strong>${esc(P.nombre || 'Nombre del producto')}</strong>
          ${P.destacado ? `<span class="destacado">${esc(P.destacado)}</span>` : ''}
          <span class="precio">${precios.length > 1 ? 'desde ' : ''}${dinero(desde)}</span>
        </div>`;
    };
    const textoGanancia = (p) => {
      const pr = leerPrecio(p.precio);
      const co = leerPrecio(p.costo);
      if (isNaN(pr) || isNaN(co)) return 'Pon lo que te cuesta para ver tu ganancia';
      const g = redondear(pr - co);
      return `<b class="${g < 0 ? 'perdida' : ''}">Ganas ${dinero(g)}</b> por venta`;
    };
    const planHTML = (p, i) => `
      <div class="tarjeta-sub">
        <div class="rejilla-3">
          <label class="campo"><span>Plan</span><input data-plan="${i}" data-prop="nombre" value="${esc(p.nombre)}" placeholder="Ej.: 1 pantalla" maxlength="30"></label>
          <label class="campo"><span>Precio</span><div class="prefijo"><b>$</b><input data-plan="${i}" data-prop="precio" value="${esc(p.precio)}" inputmode="decimal" placeholder="3,50"></div></label>
          <label class="campo"><span>Días</span><input data-plan="${i}" data-prop="dias" value="${esc(p.dias)}" inputmode="numeric" placeholder="30"></label>
        </div>
        <div class="rejilla-costo">
          <label class="campo"><span>Te cuesta <small>(proveedor)</small></span><div class="prefijo"><b>$</b><input data-plan="${i}" data-prop="costo" value="${esc(p.costo || '')}" inputmode="decimal" placeholder="1,00"></div></label>
          <span class="ganancia-plan" data-ganancia="${i}">${textoGanancia(p)}</span>
        </div>
        <div class="acciones">
          <label class="casilla"><input type="checkbox" data-plan="${i}" data-prop="combo" ${p.combo ? 'checked' : ''}> Entra en combos</label>
          <div>
            <button type="button" class="btn-icono mini" data-h="plan-subir" data-i="${i}" aria-label="Subir plan"><i class="fa-solid fa-chevron-up"></i></button>
            <button type="button" class="btn-icono mini" data-h="plan-bajar" data-i="${i}" aria-label="Bajar plan"><i class="fa-solid fa-chevron-down"></i></button>
            <button type="button" class="btn-icono mini peligro" data-h="plan-quitar" data-i="${i}" aria-label="Quitar plan"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </div>
      </div>`;
    const datoHTML = (c, i) => `
      <div class="tarjeta-sub">
        <div class="rejilla-2">
          <label class="campo"><span>Qué le pides</span><input data-dato="${i}" data-prop="etiqueta" value="${esc(c.etiqueta || '')}" placeholder="Ej.: ID de jugador" maxlength="40"></label>
          <label class="campo"><span>Ejemplo (opcional)</span><input data-dato="${i}" data-prop="ejemplo" value="${esc(c.ejemplo || '')}" placeholder="Ej.: 123456789" maxlength="40"></label>
        </div>
        <div class="acciones">
          <label class="casilla"><input type="checkbox" data-dato="${i}" data-prop="soloNumeros" ${c.soloNumeros ? 'checked' : ''}> Solo números</label>
          <button type="button" class="btn-icono mini peligro" data-h="dato-quitar" data-i="${i}" aria-label="Quitar dato"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>`;

    abrirHoja({
      titulo: original ? 'Editar producto' : 'Nuevo producto',
      sucio: false,
      cuerpo: () => `
        ${error ? `<div class="error-hoja"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(error)}</div>` : ''}
        <div class="vista-previa" id="previa">${previa()}</div>
        <label class="interruptor"><input type="checkbox" data-p="activo" ${P.activo !== false ? 'checked' : ''}><span class="pista"></span><span class="etiqueta">Visible en la tienda</span></label>
        ${original && original.ejemplo ? '<p class="nota"><i class="fa-solid fa-triangle-exclamation"></i> Este producto vino con precios de ejemplo. Revísalos; al guardar se quita la marca.</p>' : ''}

        <section class="seccion-hoja">
          <h3>Datos básicos</h3>
          <label class="campo"><span>Nombre</span><input data-p="nombre" value="${esc(P.nombre)}" maxlength="40" placeholder="Ej.: Spotify Premium"></label>
          <label class="campo"><span>Categoría</span><select data-p="categoria">${E.catalogo.categorias.map((c) => `<option value="${esc(c.id)}" ${P.categoria === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label>
          <label class="campo"><span>Descripción</span><textarea data-p="descripcion" maxlength="200" placeholder="Lo que verá el cliente al abrir el producto">${esc(P.descripcion || '')}</textarea></label>
        </section>

        <section class="seccion-hoja">
          <h3>Imagen</h3>
          <div class="imagenes">
            <button type="button" class="opcion-imagen especial ${modo === 'auto' ? 'sel' : ''}" data-h="img-auto"><i class="fa-solid fa-wand-magic-sparkles"></i>Automática</button>
            ${IMAGENES.map((src) => `<button type="button" class="opcion-imagen ${modo === 'archivo' && P.imagen === src ? 'sel' : ''}" data-h="img" data-src="${esc(src)}" aria-label="${esc(src.replace('img/', ''))}"><img src="${esc(rutaImg(src))}" alt="" loading="lazy"></button>`).join('')}
            <button type="button" class="opcion-imagen especial ${modo === 'enlace' ? 'sel' : ''}" data-h="img-enlace"><i class="fa-solid fa-link"></i>Otra imagen</button>
          </div>
          ${modo === 'auto' ? `
            <div class="tarjeta-sub">
              <span class="texto-suave">Portada con un ícono y dos colores.</span>
              <div class="iconos">${ICONOS_PORTADA.map((ic) => `<button type="button" class="${P.portada.icono === ic ? 'sel' : ''}" data-h="portada-icono" data-icono="${ic}" aria-label="Ícono"><i class="${ic}"></i></button>`).join('')}</div>
              <div class="rejilla-2">
                <label class="campo"><span>Color 1</span><input type="color" data-portada="de" value="${esc(P.portada.de)}"></label>
                <label class="campo"><span>Color 2</span><input type="color" data-portada="a" value="${esc(P.portada.a)}"></label>
              </div>
            </div>` : ''}
          ${modo === 'enlace' ? `
            <label class="campo"><span>Dirección de la imagen</span>
              <input data-p="imagen" value="${esc(P.imagen)}" placeholder="img/spotify.jpg o https://..." autocapitalize="off">
              <small>Sube la imagen a la carpeta img de tu repositorio y escribe img/ seguido de su nombre, o pega un enlace de internet.</small></label>` : ''}
        </section>

        <section class="seccion-hoja">
          <h3>Etiquetas <small>opcional</small></h3>
          <div class="rejilla-2">
            <label class="campo"><span>Texto verde</span><input data-p="etiqueta" value="${esc(P.etiqueta || '')}" placeholder="Ej.: 10 disponibles" maxlength="20"></label>
            <label class="campo"><span>Etiqueta rosada</span><input data-p="destacado" value="${esc(P.destacado || '')}" list="sugerencias-destacado" placeholder="Ej.: Más vendido" maxlength="20"></label>
          </div>
          <datalist id="sugerencias-destacado"><option value="Más vendido"><option value="Oferta"><option value="Nuevo"><option value="Recomendado"></datalist>
        </section>

        <section class="seccion-hoja">
          <h3>Planes y precios <small>${P.planes.length}</small></h3>
          ${P.planes.map(planHTML).join('')}
          <button type="button" class="btn btn-secundario" data-h="agregar-plan"><i class="fa-solid fa-plus"></i> Agregar plan</button>
          <p class="nota"><i class="fa-solid fa-layer-group"></i> Marca "Entra en combos" en el plan de 1 pantalla para que el producto aparezca en Arma tu combo. Solo un plan por producto.</p>
        </section>

        <section class="seccion-hoja">
          <h3>Datos que pides al cliente <small>opcional</small></h3>
          ${P.campos.map(datoHTML).join('')}
          <button type="button" class="btn btn-secundario" data-h="agregar-dato"><i class="fa-solid fa-plus"></i> Agregar dato</button>
          <small class="texto-suave">Por ejemplo, ID de jugador o usuario de TikTok. El cliente lo escribe antes de agregar al carrito.</small>
        </section>`,
      pie: () => `
        ${original ? '<button type="button" class="btn btn-peligro" data-h="eliminar" aria-label="Eliminar producto"><i class="fa-solid fa-trash-can"></i></button>' : ''}
        <button type="button" class="btn btn-primario" data-h="guardar"><i class="fa-solid fa-check"></i> Guardar</button>`,
      entrada: (el) => {
        if (el.dataset.p) {
          P[el.dataset.p] = el.type === 'checkbox' ? el.checked : el.value;
        } else if (el.dataset.plan !== undefined) {
          const plan = P.planes[Number(el.dataset.plan)];
          if (el.dataset.prop === 'combo') {
            P.planes.forEach((x) => { x.combo = false; });
            plan.combo = el.checked;
            $$('#hoja-cuerpo input[data-prop="combo"]').forEach((c) => { c.checked = c === el && el.checked; });
          } else {
            plan[el.dataset.prop] = el.value;
            const g = $(`[data-ganancia="${el.dataset.plan}"]`);
            if (g) g.innerHTML = textoGanancia(plan);
          }
        } else if (el.dataset.dato !== undefined) {
          const d = P.campos[Number(el.dataset.dato)];
          d[el.dataset.prop] = el.type === 'checkbox' ? el.checked : el.value;
        } else if (el.dataset.portada) {
          P.portada[el.dataset.portada] = el.value;
        }
        $('#previa').innerHTML = previa();
      },
      accion: async (nombre, b) => {
        const i = Number(b.dataset.i);
        const mov = (lista, paso) => { const j = i + paso; if (j >= 0 && j < lista.length) [lista[i], lista[j]] = [lista[j], lista[i]]; };
        if (nombre === 'img-auto') { modo = 'auto'; P.imagen = ''; }
        else if (nombre === 'img') { modo = 'archivo'; P.imagen = b.dataset.src; }
        else if (nombre === 'img-enlace') { modo = 'enlace'; if (IMAGENES.includes(P.imagen)) P.imagen = ''; }
        else if (nombre === 'portada-icono') { P.portada.icono = b.dataset.icono; }
        else if (nombre === 'agregar-plan') { P.planes.push({ id: '', nombre: '', precio: '', dias: '' }); }
        else if (nombre === 'plan-subir') mov(P.planes, -1);
        else if (nombre === 'plan-bajar') mov(P.planes, 1);
        else if (nombre === 'plan-quitar') {
          if (P.planes.length === 1) { aviso('El producto necesita al menos un plan.', 'info'); return; }
          P.planes.splice(i, 1);
        } else if (nombre === 'agregar-dato') { P.campos.push({ etiqueta: '', ejemplo: '', soloNumeros: false }); }
        else if (nombre === 'dato-quitar') { P.campos.splice(i, 1); }
        else if (nombre === 'guardar') { await guardar(b); return; }
        else if (nombre === 'eliminar') { await eliminar(); return; }
        hoja.sucio = true;
        pintarHoja();
        if (nombre === 'agregar-plan' || nombre === 'agregar-dato') {
          const sel = nombre === 'agregar-plan' ? '[data-plan][data-prop="nombre"]' : '[data-dato][data-prop="etiqueta"]';
          const campos = $$(`#hoja-cuerpo ${sel}`);
          if (campos.length) campos[campos.length - 1].focus();
        }
      }
    });

    function validar() {
      if (!String(P.nombre || '').trim()) return 'Escribe el nombre del producto.';
      if (!E.catalogo.categorias.some((c) => c.id === P.categoria)) return 'Elige una categoría.';
      if (modo === 'enlace' && !String(P.imagen || '').trim()) return 'Escribe la dirección de la imagen o elige otra opción.';
      for (let i = 0; i < P.planes.length; i++) {
        const p = P.planes[i];
        const n = `El plan ${i + 1}`;
        if (!String(p.nombre || '').trim()) return `${n} necesita un nombre (ej.: 1 pantalla).`;
        const precio = leerPrecio(p.precio);
        if (isNaN(precio) || precio <= 0 || precio > 9999) return `${n} (${p.nombre}) necesita un precio válido, por ejemplo 3,50.`;
        if (String(p.dias || '').trim() && !/^\d{1,4}$/.test(String(p.dias).trim())) return `Los días de ${p.nombre} deben ser un número, por ejemplo 30.`;
        if (String(p.costo || '').trim() && isNaN(leerPrecio(p.costo))) return `Revisa lo que te cuesta ${p.nombre} (ejemplo: 1,00).`;
      }
      for (const c of P.campos) if (!String(c.etiqueta || '').trim()) return 'Cada dato que pides al cliente necesita un nombre, o quítalo.';
      return '';
    }
    function construir() {
      const otros = E.catalogo.servicios.filter((s) => !original || s.id !== original.id).map((s) => s.id);
      const idFinal = original ? original.id : idUnico(P.nombre, otros);
      const usadosPlan = [];
      const planes = P.planes.map((p) => {
        let pid = p.id && !usadosPlan.includes(p.id) ? p.id : idUnico(p.nombre, usadosPlan);
        usadosPlan.push(pid);
        const salida = Object.assign({}, p, { id: pid, nombre: p.nombre.trim(), precio: leerPrecio(p.precio) });
        const dias = parseInt(p.dias, 10);
        if (dias > 0) salida.dias = dias; else delete salida.dias;
        if (p.combo) salida.combo = true; else delete salida.combo;
        const costo = leerPrecio(p.costo);
        if (String(p.costo || '').trim() && !isNaN(costo)) salida.costo = costo; else delete salida.costo;
        return salida;
      });
      const usadosCampo = [];
      const campos = P.campos.map((c) => {
        const cid = c.id && !usadosCampo.includes(c.id) ? c.id : idUnico(c.etiqueta, usadosCampo);
        usadosCampo.push(cid);
        const salida = { id: cid, etiqueta: c.etiqueta.trim() };
        if (String(c.ejemplo || '').trim()) salida.ejemplo = c.ejemplo.trim();
        if (c.soloNumeros) {
          salida.patron = c.patron && /\[0-9\]|\\d/.test(c.patron) ? c.patron : '^[0-9]{3,20}$';
          salida.ayuda = 'Solo números';
        }
        return salida;
      });
      const s = Object.assign({}, original || {}, {
        id: idFinal, nombre: P.nombre.trim(), categoria: P.categoria, activo: P.activo !== false,
        descripcion: String(P.descripcion || '').trim(), planes,
        entrega: (original && original.entrega) || ENTREGA_POR_CATEGORIA[P.categoria] || 'acceso'
      });
      const etiqueta = String(P.etiqueta || '').trim();
      const destacado = String(P.destacado || '').trim();
      if (etiqueta) s.etiqueta = etiqueta; else delete s.etiqueta;
      if (destacado) s.destacado = destacado; else delete s.destacado;
      if (campos.length) s.campos = campos; else delete s.campos;
      if (modo === 'auto') { s.imagen = ''; s.portada = clonar(P.portada); } else s.imagen = String(P.imagen).trim();
      delete s.ejemplo;
      return s;
    }
    async function guardar(boton) {
      error = validar();
      if (error) { pintarHoja(); $('#hoja-cuerpo').scrollTop = 0; return; }
      const final = construir();
      const respaldo = clonar(E.catalogo);
      if (original) E.catalogo.servicios[E.catalogo.servicios.findIndex((s) => s.id === original.id)] = final;
      else E.catalogo.servicios.push(final);
      try {
        await ocupado(boton, () => guardarDoc('catalogo', E.catalogo));
        cerrarHoja(true);
        pintar();
        aviso(`${final.nombre} guardado. Ya se ve en tu tienda.`);
      } catch (e) {
        E.catalogo = respaldo;
        errorGuardar(e);
      }
    }
    async function eliminar() {
      if (!confirm(`¿Eliminar ${original.nombre}? Esto no se puede deshacer.\n\nSi solo quieres quitarlo por un tiempo, mejor apaga "Visible en la tienda".`)) return;
      const respaldo = clonar(E.catalogo);
      E.catalogo.servicios = E.catalogo.servicios.filter((s) => s.id !== original.id);
      E.catalogo.combosDestacados = E.catalogo.combosDestacados.filter((c) => !(c.servicios || []).includes(original.id));
      try {
        await guardarDoc('catalogo', E.catalogo);
        cerrarHoja(true);
        pintar();
        aviso(`${original.nombre} eliminado.`);
      } catch (e) {
        E.catalogo = respaldo;
        errorGuardar(e);
      }
    }
  }

  /* ---------------- Editor de categoría ---------------- */
  function abrirCategoria(id) {
    const original = id ? E.catalogo.categorias.find((c) => c.id === id) : null;
    const C = original ? clonar(original) : { id: '', nombre: '', corto: '', descripcion: '', icono: 'fa-solid fa-tag' };
    const cuantos = original ? E.catalogo.servicios.filter((s) => s.categoria === original.id).length : 0;
    let error = '';
    abrirHoja({
      titulo: original ? 'Editar categoría' : 'Nueva categoría',
      sucio: false,
      cuerpo: () => `
        ${error ? `<div class="error-hoja">${esc(error)}</div>` : ''}
        <label class="campo"><span>Nombre de la sección</span><input data-c="nombre" value="${esc(C.nombre)}" maxlength="30" placeholder="Ej.: Música"></label>
        <label class="campo"><span>Nombre corto para el botón</span><input data-c="corto" value="${esc(C.corto || '')}" maxlength="14" placeholder="Igual al nombre si lo dejas vacío"></label>
        <label class="campo"><span>Descripción</span><input data-c="descripcion" value="${esc(C.descripcion || '')}" maxlength="60" placeholder="Ej.: Spotify, YouTube Music y más"></label>
        <section class="seccion-hoja"><h3>Ícono</h3>
          <div class="iconos">${ICONOS_CATEGORIA.map((ic) => `<button type="button" class="${C.icono === ic ? 'sel' : ''}" data-h="icono" data-icono="${ic}" aria-label="Ícono"><i class="${ic}"></i></button>`).join('')}</div>
        </section>
        ${original ? `<p class="nota"><i class="fa-solid fa-circle-info"></i> ${cuantos ? `Tiene ${cuantos} ${cuantos === 1 ? 'producto' : 'productos'}. Para eliminarla, primero mueve o elimina sus productos.` : 'Está vacía, puedes eliminarla.'}</p>` : ''}`,
      pie: () => `
        ${original ? `<button type="button" class="btn btn-peligro" data-h="eliminar" ${cuantos ? 'disabled' : ''} aria-label="Eliminar categoría"><i class="fa-solid fa-trash-can"></i></button>` : ''}
        <button type="button" class="btn btn-primario" data-h="guardar"><i class="fa-solid fa-check"></i> Guardar</button>`,
      entrada: (el) => { if (el.dataset.c) C[el.dataset.c] = el.value; },
      accion: async (nombre, b) => {
        if (nombre === 'icono') { C.icono = b.dataset.icono; hoja.sucio = true; pintarHoja(); return; }
        if (nombre === 'guardar') {
          if (!C.nombre.trim()) { error = 'Escribe el nombre de la categoría.'; pintarHoja(); return; }
          const respaldo = clonar(E.catalogo);
          const final = {
            id: original ? original.id : idUnico(C.nombre, E.catalogo.categorias.map((c) => c.id).concat(['combos', 'todo', 'todas'])),
            nombre: C.nombre.trim(), corto: (C.corto || '').trim() || C.nombre.trim(),
            icono: C.icono, descripcion: (C.descripcion || '').trim()
          };
          if (original) E.catalogo.categorias[E.catalogo.categorias.findIndex((c) => c.id === original.id)] = final;
          else E.catalogo.categorias.push(final);
          try {
            await ocupado(b, () => guardarDoc('catalogo', E.catalogo));
            cerrarHoja(true); pintar(); aviso(`Categoría ${final.nombre} guardada.`);
          } catch (e) { E.catalogo = respaldo; errorGuardar(e); }
        }
        if (nombre === 'eliminar') {
          if (cuantos || !confirm(`¿Eliminar la categoría ${original.nombre}?`)) return;
          const respaldo = clonar(E.catalogo);
          E.catalogo.categorias = E.catalogo.categorias.filter((c) => c.id !== original.id);
          try { await guardarDoc('catalogo', E.catalogo); cerrarHoja(true); pintar(); aviso('Categoría eliminada.'); }
          catch (e) { E.catalogo = respaldo; errorGuardar(e); }
        }
      }
    });
  }

  /* ---------------- Nuevo combo popular ---------------- */
  function abrirNuevoPopular() {
    const sel = [];
    const max = Math.max(2, ...E.borrador.reglas.map((r) => Number(r.cantidad) || 0));
    const resumen = () => {
      if (sel.length < 2) return '<p class="texto-suave">Elige al menos 2 servicios.</p>';
      const c = calcularCombo(sel, E.borrador.reglas, null);
      return c ? `<p class="ejemplo-combo">${esc(sel.map(nombreServicio).join(' + '))}: ${dinero(c.normal)} → <b>${dinero(c.precio)}</b></p>` : '';
    };
    abrirHoja({
      titulo: 'Nuevo combo popular',
      sucio: false,
      cuerpo: () => `
        <p class="texto-suave">Toca los servicios que forman el combo (hasta ${max}).</p>
        <div class="servicios-combo">${elegibles().map((s) => `<button type="button" class="chip ${sel.includes(s.id) ? 'sel' : ''}" data-h="toggle" data-id="${esc(s.id)}">${sel.includes(s.id) ? '<i class="fa-solid fa-check"></i> ' : ''}${esc(s.nombre)}</button>`).join('')}</div>
        ${resumen()}`,
      pie: () => `<button type="button" class="btn btn-primario" data-h="agregar" ${sel.length < 2 ? 'disabled' : ''}><i class="fa-solid fa-plus"></i> Agregar</button>`,
      accion: (nombre, b) => {
        if (nombre === 'toggle') {
          const id = b.dataset.id;
          if (sel.includes(id)) sel.splice(sel.indexOf(id), 1);
          else if (sel.length < max) sel.push(id);
          else { aviso(`Un combo puede tener hasta ${max} servicios.`, 'info'); return; }
          pintarHoja();
        }
        if (nombre === 'agregar') {
          if (E.borrador.populares.some((p) => claveCombo(p.servicios) === claveCombo(sel))) { aviso('Ese combo ya está en tu lista.', 'info'); return; }
          E.borrador.populares.push({ servicios: sel.slice(), nombre: '', precio: '' });
          cerrarHoja(true);
          marcarSucio();
          pintar();
        }
      }
    });
  }

  async function correoPrueba(boton) {
    if (!CONFIG_ARCHIVO.workerUrl) { aviso('Primero conecta tu puente de Cloudflare (workerUrl en config.js).', 'error'); return; }
    boton.disabled = true;
    try {
      const token = await auth.currentUser.getIdToken();
      const r = await fetch(`${CONFIG_ARCHIVO.workerUrl.replace(/\/+$/, '')}/prueba-correo`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
      aviso(`Listo: revisa tu bandeja (${d.para}). Si no está, mira en Spam.`);
    } catch (e) {
      aviso(e.message === 'Failed to fetch' ? 'No pudimos conectar con tu puente.' : `No se envió: ${e.message}`, 'error');
    } finally { boton.disabled = false; }
  }

  /* ---------------- Copia de seguridad ---------------- */
  function descargarRespaldo() {
    const datos = { exportado: new Date().toISOString(), config: E.config, catalogo: E.catalogo };
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `refills-copia-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    $('#menu-cuenta').hidden = true;
    aviso('Copia descargada. Guárdala en un lugar seguro.');
  }

  /* ---------------- App instalable ---------------- */
  let promptInstalar = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    promptInstalar = e;
    $('#btn-instalar').hidden = false;
  });
  $('#btn-instalar').addEventListener('click', async () => {
    if (!promptInstalar) return;
    promptInstalar.prompt();
    await promptInstalar.userChoice.catch(() => null);
    promptInstalar = null;
    $('#btn-instalar').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('#btn-instalar').hidden = true; aviso('¡App instalada! Ya la tienes en tu pantalla de inicio.'); });
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (esIOS && !instalada) $('#ayuda-iphone').hidden = false;
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker:', e)));
  }
})();
