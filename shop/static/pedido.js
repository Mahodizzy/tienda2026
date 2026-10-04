/* =============================================================
   Refills EC — estado del pedido y chat
   ============================================================= */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const RF = window.RF;
  const { $, esc, dinero, aFecha, fechaCorta, fechaHora } = RF.util;
  const CONFIG = RF.CONFIG;

  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const esNuevo = params.get('nuevo') === '1';
  const pedirAviso = params.get('avisar') === '1';

  const vistas = ['#rf-cargando', '#rf-puerta', '#rf-no-encontrado', '#rf-pedido'];
  const mostrar = (cual) => vistas.forEach((v) => { $(v).hidden = v !== cual; });

  if (!id) { mostrar('#rf-no-encontrado'); return; }
  $('#rf-puerta-btn').addEventListener('click', () => RF.sesion.abrirAuth('Inicia sesión para ver tu pedido.'));

  let suscripcion = null;
  let chatIniciado = false;
  let pedido = null;

  RF.sesion.alCambiar((u) => {
    if (!RF.sesion.lista) {
      $('#rf-no-encontrado-texto').textContent = 'No hay conexión con el servidor. Recarga la página.';
      mostrar('#rf-no-encontrado');
      return;
    }
    if (!u) {
      if (suscripcion) { suscripcion(); suscripcion = null; }
      mostrar('#rf-puerta');
      return;
    }
    if (suscripcion) return;
    mostrar('#rf-cargando');
    suscripcion = RF.sesion.db.collection('pedidos').doc(id).onSnapshot((snap) => {
      if (!snap.exists) { mostrar('#rf-no-encontrado'); return; }
      pedido = Object.assign({ id: snap.id }, snap.data({ serverTimestamps: 'estimate' }));
      pintar(pedido);
      mostrar('#rf-pedido');
      if (!chatIniciado) { chatIniciado = true; iniciarChat(u); }
    }, (err) => {
      console.error(err);
      $('#rf-no-encontrado-texto').textContent = 'Este pedido no existe o pertenece a otra cuenta.';
      mostrar('#rf-no-encontrado');
    });
  });

  /* ---------------- Pintar pedido ---------------- */
  const PASOS = [
    { id: 'recibido', nombre: 'Recibido', icono: 'fa-solid fa-inbox' },
    { id: 'en_revision', nombre: 'En revisión', icono: 'fa-solid fa-hourglass-half' },
    { id: 'aprobado', nombre: 'Aprobado', icono: 'fa-solid fa-circle-check' },
    { id: 'entregado', nombre: 'Entregado', icono: 'fa-solid fa-gift' }
  ];

  function lineaTiempo(estado) {
    const actual = { en_revision: 1, aprobado: 2, entregado: 3, rechazado: 1 }[estado] ?? 1;
    return `<ol class="rf-linea-tiempo">${PASOS.map((p, i) => {
      let clase = i < actual ? 'hecho' : i === actual ? 'actual' : '';
      let nombre = p.nombre;
      let icono = p.icono;
      if (estado === 'rechazado' && i === 1) { clase = 'fallo'; nombre = 'Rechazado'; icono = 'fa-solid fa-xmark'; }
      if (estado === 'entregado' && i === 3) clase = 'hecho';
      return `<li class="rf-paso ${clase}"><span class="rf-paso-punto"><i class="${icono}" aria-hidden="true"></i></span><span class="rf-paso-nombre">${esc(nombre)}</span></li>`;
    }).join('')}</ol>`;
  }

  function itemHTML(it) {
    if (it.tipo === 'combo') {
      const partes = (it.servicios || []).map((s) => `${s.nombre} (${s.plan})`).join(' + ');
      return `<li class="rf-resumen-item">
        <div class="rf-resumen-media rf-icono-combo"><i class="fa-solid fa-layer-group" aria-hidden="true"></i></div>
        <div class="rf-resumen-texto"><strong>${esc(it.nombre)}</strong><span>${esc(partes)}${it.cantidad > 1 ? ` × ${it.cantidad}` : ''}</span></div>
        <div class="rf-resumen-precio">${dinero(it.subtotal)}${it.precioNormal > it.precioUnit ? `<s>${dinero(it.precioNormal * it.cantidad)}</s>` : ''}</div>
      </li>`;
    }
    const s = RF.catalogo.servicioPorId(it.servicioId);
    const media = s ? RF.vista.miniaturaHTML(s, RF.catalogo.planPorId(s, it.planId)) : '<i class="fa-solid fa-bag-shopping" aria-hidden="true"></i>';
    const datos = (it.datos || []).map((d) => `<span class="rf-resumen-dato">${esc(d.etiqueta)}: ${esc(d.valor)}</span>`).join('');
    return `<li class="rf-resumen-item">
      <div class="rf-resumen-media">${media}</div>
      <div class="rf-resumen-texto"><strong>${esc(it.servicio)}</strong><span>${esc(it.plan)}${it.cantidad > 1 ? ` × ${it.cantidad}` : ''}</span>${datos}</div>
      <div class="rf-resumen-precio">${dinero(it.subtotal)}</div>
    </li>`;
  }

  function pintar(p) {
    const info = RF.vista.estadoInfo(p.estado);
    $('#rf-codigo').textContent = `Pedido ${p.codigo || ''}`.trim();
    $('#rf-fecha').textContent = fechaHora(p.creado);
    document.title = `${p.codigo || 'Pedido'} - Refills EC`;

    if (esNuevo) {
      $('#rf-enviado').hidden = false;
      const limpia = new URL(location.href);
      limpia.searchParams.delete('nuevo');
      history.replaceState(null, '', limpia.pathname + limpia.search);
    }
    if (pedirAviso && p.estado === 'en_revision') {
      const texto = `Hola, acabo de hacer el pedido ${p.codigo} por ${dinero(p.total)} en la web y ya subí mi comprobante.`;
      $('#rf-avisar-btn').href = RF.util.whatsappUrl(texto);
      $('#rf-avisar').hidden = false;
    } else $('#rf-avisar').hidden = true;

    $('#rf-estado').className = `rf-panel rf-estado-panel rf-estado-panel--${info.clase}`;
    $('#rf-estado').innerHTML = `
      <div class="rf-estado-cabeza">
        <span class="rf-estado-icono"><i class="${info.icono}" aria-hidden="true"></i></span>
        <div>
          <h2 class="rf-estado-nombre">${esc(info.nombre)}</h2>
          <p class="rf-estado-texto">${esc(info.texto)}</p>
        </div>
      </div>
      ${lineaTiempo(p.estado)}`;

    const entrega = $('#rf-entrega');
    if (p.entrega) {
      entrega.hidden = false;
      $('#rf-entrega-texto').textContent = p.entrega;
      const base = aFecha(p.entregadoEn);
      const vence = (p.items || []).filter((it) => it.dias).map((it) => {
        const nombre = it.tipo === 'combo'
          ? `${it.nombre}: ${(it.servicios || []).map((x) => x.nombre).join(' + ')}`
          : `${it.servicio} (${it.plan})`;
        if (!base) return `<li><span>${esc(nombre)}</span><span>${it.dias} días</span></li>`;
        const fin = new Date(base.getTime() + it.dias * 86400000);
        const restantes = Math.ceil((fin.getTime() - Date.now()) / 86400000);
        const etiqueta = restantes > 0 ? `vence el ${fechaCorta(fin)}` : 'vencido';
        return `<li class="${restantes <= 3 ? 'pronto' : ''}"><span>${esc(nombre)}</span><span>${esc(etiqueta)}</span></li>`;
      });
      $('#rf-vencimientos').innerHTML = vence.join('');
      $('#rf-vencimientos').hidden = !vence.length;
    } else entrega.hidden = true;

    $('#rf-items').innerHTML = (p.items || []).map(itemHTML).join('');
    const metodo = p.metodo ? (p.metodo.destino || (p.metodo.tipo === 'binance' ? 'Binance Pay' : 'Transferencia')) : '';
    $('#rf-totales').innerHTML = `
      ${p.ahorro > 0 ? `<div class="rf-verde"><span>Ahorro por combos</span><span>− ${dinero(p.ahorro)}</span></div>` : ''}
      <div><span>Pagado con</span><span>${esc(metodo)}</span></div>
      <div class="rf-total"><span>Total</span><strong>${dinero(p.total)}</strong></div>`;
  }

  $('#rf-entrega-copiar').addEventListener('click', () => { if (pedido && pedido.entrega) RF.util.copiar(pedido.entrega); });

  /* ---------------- Chat ---------------- */
  function iniciarChat(u) {
    const cuerpo = $('#rf-chat-cuerpo');
    if (!CONFIG.workerUrl) {
      const texto = `Hola, tengo una consulta sobre mi pedido ${pedido ? pedido.codigo : ''}.`;
      cuerpo.innerHTML = `<p class="rf-ayuda">¿Tienes una duda con este pedido? Escríbenos y te respondemos.</p>
        <a class="rf-btn rf-btn-wa" href="${esc(RF.util.whatsappUrl(texto))}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Escribir por WhatsApp</a>`;
      return;
    }
    cuerpo.innerHTML = `
      <div class="rf-mensajes" id="rf-mensajes" aria-live="polite">
        <p class="rf-chat-vacio">Escribe aquí si tienes una duda con tu pedido. Te respondemos en este mismo chat.</p>
      </div>
      <form class="rf-chat-form" id="rf-chat-form">
        <label class="rf-oculto" for="rf-chat-texto">Tu mensaje</label>
        <textarea id="rf-chat-texto" rows="1" maxlength="1000" placeholder="Escribe tu mensaje..." required></textarea>
        <button type="submit" class="rf-chat-enviar" aria-label="Enviar mensaje"><i class="fa-solid fa-paper-plane"></i></button>
      </form>`;

    const caja = $('#rf-mensajes');
    const pendientes = [];
    let recibidos = [];

    function pintarMensajes() {
      const html = recibidos.map((m) => `
        <div class="rf-msg rf-msg--${m.de === 'admin' ? 'admin' : 'cliente'}">
          ${m.de === 'admin' ? '<span class="rf-msg-autor">Refills EC</span>' : ''}
          <p>${esc(m.texto)}</p>
          <time>${esc(fechaHora(m.creado))}</time>
        </div>`).concat(pendientes.map((m) => `
        <div class="rf-msg rf-msg--cliente ${m.fallo ? 'fallo' : 'enviando'}">
          <p>${esc(m.texto)}</p>
          <time>${m.fallo ? 'No se envió. Toca para reintentar.' : m.enviado ? 'Enviado' : 'Enviando...'}</time>
        </div>`)).join('');
      caja.innerHTML = html || '<p class="rf-chat-vacio">Escribe aquí si tienes una duda con tu pedido. Te respondemos en este mismo chat.</p>';
      caja.scrollTop = caja.scrollHeight;
    }

    // Quita de "Enviando..." los mensajes que ya aparecen guardados.
    function conciliar() {
      for (let i = pendientes.length - 1; i >= 0; i--) {
        const p = pendientes[i];
        if (!p.enviado) continue;
        const llegado = recibidos.some((m) => m.de === 'cliente' && m.texto === p.texto && (aFecha(m.creado) || 0) >= p.desde - 60000);
        if (llegado || Date.now() - p.desde > 15000) pendientes.splice(i, 1);
      }
    }

    RF.sesion.db.collection('chats').doc(u.uid).collection('mensajes')
      .orderBy('creado').limitToLast(100)
      .onSnapshot((snap) => {
        recibidos = snap.docs.map((d) => d.data({ serverTimestamps: 'estimate' }));
        conciliar();
        pintarMensajes();
      }, (err) => console.error('Chat:', err));

    async function enviar(item) {
      item.fallo = false;
      pintarMensajes();
      try {
        await RF.sesion.llamarPuente('/chat', { texto: item.texto, pedido: pedido ? pedido.codigo : '' });
        item.enviado = true;
        conciliar();
        setTimeout(() => { conciliar(); pintarMensajes(); }, 15500);
      } catch (err) {
        console.error(err);
        item.fallo = true;
        RF.toast(err.message && err.message !== 'sin-puente' ? err.message : 'No se pudo enviar tu mensaje.', { tipo: 'error' });
      }
      pintarMensajes();
    }

    const area = $('#rf-chat-texto');
    area.addEventListener('input', () => { area.style.height = 'auto'; area.style.height = Math.min(area.scrollHeight, 140) + 'px'; });
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 769px)').matches) {
        e.preventDefault();
        $('#rf-chat-form').requestSubmit();
      }
    });
    $('#rf-chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const texto = area.value.trim();
      if (!texto) return;
      area.value = '';
      area.style.height = 'auto';
      const item = { texto, fallo: false, enviado: false, desde: Date.now() };
      pendientes.push(item);
      enviar(item);
    });
    caja.addEventListener('click', (e) => {
      const fallido = e.target.closest('.rf-msg.fallo');
      if (!fallido) return;
      const idx = Array.from(caja.querySelectorAll('.rf-msg.fallo, .rf-msg.enviando')).indexOf(fallido);
      const item = pendientes[idx];
      if (item && item.fallo) enviar(item);
    });
  }
});
