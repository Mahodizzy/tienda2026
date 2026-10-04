/* =============================================================
   Refills EC — página de pago
   ============================================================= */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const RF = window.RF;
  const { $, $$, esc, dinero } = RF.util;
  const C = RF.catalogo;
  const V = RF.vista;
  const CONFIG = RF.CONFIG;

  const resumen = RF.carrito.resumen();
  if (!resumen.lineas.length) {
    $('#rf-vacio').hidden = false;
    $('#rf-flujo').hidden = true;
    return;
  }

  /* ---------------- 1. Resumen ---------------- */
  $('#rf-resumen-lista').innerHTML = resumen.lineas.map((l) => {
    const media = l.tipo === 'combo'
      ? `<div class="rf-resumen-media rf-apiladas">${l.partes.map((x) => `<span>${V.miniaturaHTML(x.servicio, x.plan)}</span>`).join('')}</div>`
      : `<div class="rf-resumen-media">${V.miniaturaHTML(l.servicio, l.plan)}</div>`;
    const datos = Object.keys(l.datos || {}).map((k) => `<span class="rf-resumen-dato">${esc(C.etiquetaCampo(l.servicio, k))}: ${esc(l.datos[k])}</span>`).join('');
    return `<li class="rf-resumen-item">
      ${media}
      <div class="rf-resumen-texto">
        <strong>${esc(l.titulo)}</strong>
        <span>${esc(l.detalle)}${l.cantidad > 1 ? ` × ${l.cantidad}` : ''}</span>
        ${datos}
      </div>
      <div class="rf-resumen-precio">${dinero(l.subtotal)}${l.ahorro > 0 ? `<s>${dinero(l.normalUnit * l.cantidad)}</s>` : ''}</div>
    </li>`;
  }).join('');
  $('#rf-resumen-totales').innerHTML = `
    ${resumen.ahorro > 0 ? `<div><span>Precio normal</span><span>${dinero(resumen.normal)}</span></div>
    <div class="rf-verde"><span>Ahorro por combos</span><span>− ${dinero(resumen.ahorro)}</span></div>` : ''}
    <div class="rf-total"><span>Total a pagar</span><strong>${dinero(resumen.total)}</strong></div>`;

  /* ---------------- 2. Métodos de pago ---------------- */
  const cuentas = (CONFIG.cuentasBancarias || []).filter((c) => c && c.banco);
  const binance = CONFIG.binance && CONFIG.binance.activo ? CONFIG.binance : null;
  const metodos = [];
  if (cuentas.length) metodos.push({ id: 'transferencia', nombre: 'Transferencia', icono: 'fa-solid fa-building-columns' });
  if (binance) metodos.push({ id: 'binance', nombre: 'Binance Pay', icono: 'fa-solid fa-coins' });

  $('#rf-tabs').innerHTML = metodos.map((m, i) => `
    <button type="button" role="tab" class="rf-tab${i === 0 ? ' activo' : ''}" aria-selected="${i === 0}" aria-controls="panel-${m.id}" data-metodo="${m.id}">
      <i class="${m.icono}" aria-hidden="true"></i> ${esc(m.nombre)}
    </button>`).join('') + `
    <button type="button" role="tab" class="rf-tab" aria-selected="false" disabled title="Muy pronto">
      <i class="fa-regular fa-credit-card" aria-hidden="true"></i> Tarjeta o PayPal <small>pronto</small>
    </button>`;

  const pendiente = 'Por configurar';
  function fila(etiqueta, valor, copiable = true) {
    const vacio = !valor;
    return `<div class="rf-fila">
      <span class="rf-fila-etq">${esc(etiqueta)}</span>
      <span class="rf-fila-valor${vacio ? ' vacio' : ''}">${esc(valor || pendiente)}</span>
      ${copiable && !vacio ? `<button type="button" class="rf-copiar" data-copiar="${esc(valor)}" aria-label="Copiar ${esc(etiqueta)}"><i class="fa-regular fa-copy"></i></button>` : '<span class="rf-copiar-hueco"></span>'}
    </div>`;
  }
  function tarjetaHTML(o) {
    return `<div class="rf-flip rf-tema-${esc(o.tema)}" data-tarjeta="${esc(o.clave)}" tabindex="0" role="button" aria-pressed="false" aria-label="${esc(o.titulo)}: toca para ver los datos">
      <div class="rf-flip-interior">
        <div class="rf-flip-cara rf-flip-frente">
          <div class="rf-tarjeta-arriba">
            <span class="rf-tarjeta-banco">${esc(o.titulo)}</span>
            <i class="fa-solid fa-wifi rf-tarjeta-nfc" aria-hidden="true"></i>
          </div>
          <span class="rf-chip" aria-hidden="true"></span>
          <span class="rf-tarjeta-numero">${esc(o.enmascarado)}</span>
          <div class="rf-tarjeta-abajo">
            <span>${esc(o.subtitulo)}</span>
            <span class="rf-tarjeta-tocar"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Ver datos</span>
          </div>
        </div>
        <div class="rf-flip-cara rf-flip-reverso">
          <div class="rf-filas">${o.filas}</div>
          <div class="rf-reverso-acciones">
            <button type="button" class="rf-mini-btn" data-copiar-todo="${esc(o.todo)}"><i class="fa-regular fa-copy"></i> Copiar todo</button>
            <button type="button" class="rf-mini-btn" data-voltear aria-label="Volver al frente"><i class="fa-solid fa-rotate-left"></i></button>
          </div>
        </div>
      </div>
    </div>`;
  }
  const enmascarar = (n) => (n ? `•••• ${String(n).slice(-4)}` : '•••• ••••');

  $('#rf-bancos').innerHTML = cuentas.map((c, i) => tarjetaHTML({
    clave: `banco-${i}`,
    tema: c.tema || 'generico',
    titulo: c.banco,
    subtitulo: `Cuenta de ${String(c.tipo || 'ahorros').toLowerCase()}`,
    enmascarado: enmascarar(c.numero),
    filas: fila('Tipo', c.tipo, false) + fila('Número', c.numero) + fila('Titular', c.titular) + (c.correo ? fila('Correo', c.correo) : ''),
    todo: [c.banco, `Cuenta de ${c.tipo || 'ahorros'}`, c.numero, c.titular, c.correo].filter(Boolean).join('\n')
  })).join('');

  const usdt = `${resumen.total.toFixed(2)} USDT`;
  if (binance) {
    $('#rf-binance').innerHTML = tarjetaHTML({
      clave: 'binance',
      tema: 'binance',
      titulo: 'Binance Pay',
      subtitulo: `Envía ${usdt}`,
      enmascarado: binance.payId ? `Pay ID ${binance.payId}` : 'Pay ID',
      filas: fila('Pay ID', binance.payId) + fila('Usuario', binance.usuario) + (binance.correo ? fila('Correo', binance.correo) : '') + fila('Monto', usdt),
      todo: [`Binance Pay ID: ${binance.payId || ''}`, binance.usuario, usdt].filter(Boolean).join('\n')
    });
  }

  let metodo = metodos[0] ? metodos[0].id : null;
  let destino = null; // clave de la tarjeta elegida

  function nombreDestino() {
    if (!destino) return '';
    if (destino === 'binance') return 'Binance Pay';
    const i = Number(destino.split('-')[1]);
    return cuentas[i] ? cuentas[i].banco : '';
  }
  function pintarEleccion() {
    const p = $('#rf-eleccion');
    if (destino) {
      p.innerHTML = `<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Vas a pagar con <b>${esc(nombreDestino())}</b>`;
      p.classList.add('ok');
    } else {
      p.textContent = metodo === 'binance' ? 'Toca la tarjeta de Binance para ver los datos.' : 'Aún no eliges el banco.';
      p.classList.remove('ok');
    }
  }

  $('#rf-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.rf-tab[data-metodo]');
    if (!b) return;
    metodo = b.dataset.metodo;
    $$('.rf-tab', $('#rf-tabs')).forEach((t) => { const a = t === b; t.classList.toggle('activo', a); t.setAttribute('aria-selected', String(a)); });
    $('#panel-transferencia').hidden = metodo !== 'transferencia';
    $('#panel-binance').hidden = metodo !== 'binance';
    if (destino && (metodo === 'binance') !== (destino === 'binance')) {
      destino = null;
      $$('.rf-flip.volteada').forEach((x) => { x.classList.remove('volteada'); x.setAttribute('aria-pressed', 'false'); });
    }
    pintarEleccion();
  });

  function voltear(tarjeta, mostrarReverso) {
    const ver = mostrarReverso === undefined ? !tarjeta.classList.contains('volteada') : mostrarReverso;
    $$('.rf-flip.volteada').forEach((x) => { if (x !== tarjeta) { x.classList.remove('volteada'); x.setAttribute('aria-pressed', 'false'); } });
    tarjeta.classList.toggle('volteada', ver);
    tarjeta.setAttribute('aria-pressed', String(ver));
    if (ver) destino = tarjeta.dataset.tarjeta;
    pintarEleccion();
  }
  document.addEventListener('click', (e) => {
    const copiarUno = e.target.closest('[data-copiar]');
    if (copiarUno) { e.stopPropagation(); RF.util.copiar(copiarUno.dataset.copiar); return; }
    const copiarTodo = e.target.closest('[data-copiar-todo]');
    if (copiarTodo) { e.stopPropagation(); RF.util.copiar(copiarTodo.dataset.copiarTodo); return; }
    const volver = e.target.closest('[data-voltear]');
    if (volver) { e.stopPropagation(); voltear(volver.closest('.rf-flip'), false); return; }
    const tarjeta = e.target.closest('.rf-flip');
    if (tarjeta && !tarjeta.classList.contains('volteada')) voltear(tarjeta, true);
  });
  document.addEventListener('keydown', (e) => {
    const tarjeta = e.target.closest && e.target.closest('.rf-flip');
    if (tarjeta && e.target === tarjeta && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); voltear(tarjeta); }
  });
  pintarEleccion();

  /* ---------------- 3. Comprobante ---------------- */
  let comprobante = null;
  const entrada = $('#rf-archivo');

  async function comprimir(archivo) {
    const url = URL.createObjectURL(archivo);
    try {
      const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; });
      let lado = 1400;
      let calidad = 0.75;
      let resultado = '';
      for (let intento = 0; intento < 6; intento++) {
        const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * escala));
        const h = Math.max(1, Math.round(img.naturalHeight * escala));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resultado = canvas.toDataURL('image/jpeg', calidad);
        if (resultado.length < 700000) return resultado;
        lado = Math.round(lado * 0.82);
        calidad = Math.max(0.5, calidad - 0.07);
      }
      return resultado.length < 900000 ? resultado : null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  entrada.addEventListener('change', async () => {
    const archivo = entrada.files && entrada.files[0];
    if (!archivo) return;
    if (!/^image\//.test(archivo.type)) { RF.toast('Sube una imagen (foto o captura de pantalla).', { tipo: 'error' }); return; }
    $('#rf-dropzone').classList.add('cargando');
    try {
      const datos = await comprimir(archivo);
      if (!datos) { RF.toast('La imagen es muy pesada. Prueba con una captura de pantalla.', { tipo: 'error' }); return; }
      comprobante = datos;
      $('#rf-preview-img').src = datos;
      $('#rf-preview-nombre').textContent = archivo.name || 'Comprobante';
      $('#rf-preview').hidden = false;
      $('#rf-dropzone').hidden = true;
    } catch (err) {
      console.error(err);
      RF.toast('No pudimos leer esa imagen. Prueba con otra.', { tipo: 'error' });
    } finally {
      $('#rf-dropzone').classList.remove('cargando');
      entrada.value = '';
    }
  });
  $('#rf-cambiar').addEventListener('click', () => entrada.click());

  /* ---------------- Enviar pedido ---------------- */
  const boton = $('#rf-enviar');
  let enviando = false;

  function codigoPedido() {
    const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const azar = new Uint8Array(6);
    (window.crypto || window.msCrypto).getRandomValues(azar);
    return 'RF-' + Array.from(azar, (b) => letras[b % letras.length]).join('');
  }
  function lineaParaGuardar(l) {
    if (l.tipo === 'combo') {
      const dias = l.partes.map((x) => x.plan.dias || 0).filter(Boolean);
      return {
        tipo: 'combo', nombre: l.titulo,
        servicios: l.partes.map((x) => ({ id: x.servicio.id, nombre: x.servicio.nombre, plan: x.plan.nombre })),
        cantidad: l.cantidad, precioUnit: l.precioUnit, precioNormal: l.normalUnit, subtotal: l.subtotal,
        dias: dias.length ? Math.min(...dias) : null
      };
    }
    return {
      tipo: 'plan', servicioId: l.servicio.id, servicio: l.servicio.nombre, categoria: l.servicio.categoria,
      planId: l.plan.id, plan: l.plan.nombre,
      cantidad: l.cantidad, precioUnit: l.precioUnit, subtotal: l.subtotal,
      dias: l.plan.dias || null,
      datos: Object.keys(l.datos || {}).map((k) => ({ etiqueta: C.etiquetaCampo(l.servicio, k), valor: l.datos[k] }))
    };
  }

  boton.addEventListener('click', async () => {
    if (enviando) return;
    if (!metodo) { RF.toast('No hay métodos de pago configurados todavía.', { tipo: 'error' }); return; }
    if (!destino) {
      RF.toast(metodo === 'binance' ? 'Toca la tarjeta de Binance para ver los datos de pago.' : 'Toca la tarjeta del banco al que transferiste.', { tipo: 'info' });
      $('#t-metodo').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!comprobante) {
      RF.toast('Sube la captura de tu pago para continuar.', { tipo: 'info' });
      $('#rf-dropzone').classList.add('resaltar');
      setTimeout(() => $('#rf-dropzone').classList.remove('resaltar'), 1200);
      return;
    }
    if (!RF.sesion.lista) { RF.toast('No hay conexión con el servidor. Recarga la página.', { tipo: 'error' }); return; }

    let usuario;
    try {
      usuario = await RF.sesion.requerirSesion('Inicia sesión o crea tu cuenta para enviar tu pedido y ver su estado.');
    } catch (e) { return; }

    enviando = true;
    boton.disabled = true;
    const textoOriginal = boton.innerHTML;
    boton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando pedido...';

    try {
      const r = RF.carrito.resumen();
      if (!r.lineas.length) throw new Error('carrito-vacio');
      const db = RF.sesion.db;
      const ref = db.collection('pedidos').doc();
      const whatsapp = ($('#rf-whatsapp').value || '').replace(/[^\d+]/g, '').slice(0, 20);
      const base = JSON.parse(JSON.stringify({
        uid: usuario.uid,
        email: usuario.email || '',
        nombre: usuario.displayName || '',
        codigo: codigoPedido(),
        items: r.lineas.map(lineaParaGuardar),
        total: r.total,
        ahorro: r.ahorro,
        metodo: { tipo: metodo, destino: nombreDestino() },
        whatsapp,
        estado: 'en_revision',
        notificado: false
      }));
      base.creado = RF.sesion.marcaTiempo();
      base.actualizado = RF.sesion.marcaTiempo();

      const lote = db.batch();
      lote.set(ref, base);
      lote.set(db.collection('comprobantes').doc(ref.id), { uid: usuario.uid, imagen: comprobante, creado: RF.sesion.marcaTiempo() });
      await lote.commit();

      let avisado = false;
      if (CONFIG.workerUrl) {
        try { await RF.sesion.llamarPuente('/pedido', { pedidoId: ref.id }); avisado = true; } catch (err) { console.error('Aviso a Telegram:', err); }
      }
      RF.carrito.vaciar();
      window.location.href = `pedido.html?id=${encodeURIComponent(ref.id)}&nuevo=1${avisado ? '' : '&avisar=1'}`;
    } catch (err) {
      console.error(err);
      const msg = err && err.code === 'permission-denied'
        ? 'No pudimos guardar tu pedido. Cierra sesión, vuelve a entrar e inténtalo otra vez.'
        : 'No pudimos enviar tu pedido. Revisa tu conexión e inténtalo otra vez.';
      RF.toast(msg, { tipo: 'error', duracion: 6000 });
      enviando = false;
      boton.disabled = false;
      boton.innerHTML = textoOriginal;
    }
  });
});
