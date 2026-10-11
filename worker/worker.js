/* =============================================================
   Refills EC — Puente entre la tienda y tu Telegram
   Se publica gratis en Cloudflare Workers (ver GUIA-CONFIGURACION.md).

   Qué hace:
   • /pedido   → te envía el pedido con la foto del comprobante y botones
                 ✅ Aprobar / ❌ Rechazar / 📦 Entregar datos.
   • /chat     → los mensajes del cliente llegan a un tema con su nombre.
   • /telegram → recibe tus botones y respuestas, y actualiza la página
                 del cliente al instante.
   • /setup    → conecta el bot con este puente (se abre una sola vez).

   Variables que debes crear en Cloudflare (Settings → Variables):
     BOT_TOKEN               token que te da @BotFather           (secreto)
     TG_CHAT_ID              ID de tu grupo de Telegram (empieza con -100)
     WEBHOOK_SECRET          una clave inventada: solo letras y números (secreto)
     FIREBASE_API_KEY        la apiKey de config.js
     FIREBASE_PROJECT_ID     refills-ec
     GOOGLE_SERVICE_ACCOUNT  el JSON completo de la cuenta de servicio (secreto)
     TG_PEDIDOS_TEMA         (opcional) ID del tema donde quieres los pedidos

   Correos a tus clientes (Resend), opcionales:
     RESEND_API_KEY          clave de Resend                       (secreto)
     CORREO_REMITENTE        ej.: Refills EC <pedidos@envios.refillsec.com>
     CORREO_RESPUESTA        tu correo para que te respondan (opcional)
     SITIO_URL               dirección de tu tienda, ej.: https://refillsec.com
     DIAS_RECORDATORIO       días antes del vencimiento para avisar (por defecto 2)
     CORREO_APROBADO         "si" para avisar también cuando apruebas el pago

   Revisión diaria de vencimientos: en Cloudflare → Settings → Triggers →
   Cron Triggers agrega  0 14 * * *  (todos los días a las 9:00 de Ecuador).
   ============================================================= */

const VARIABLES = ['BOT_TOKEN', 'TG_CHAT_ID', 'WEBHOOK_SECRET', 'FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID', 'GOOGLE_SERVICE_ACCOUNT'];
const BASICAS = ['BOT_TOKEN', 'WEBHOOK_SECRET']; // suficientes para /setup y el comando /id
const faltantes = (env, lista) => lista.filter((v) => !env[v]);

const ETIQUETAS = {
  en_revision: '🟡 En revisión',
  aprobado: '🔵 Aprobado',
  entregado: '🟢 Entregado',
  rechazado: '🔴 Rechazado'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));

    const necesarias = (url.pathname === '/setup' || url.pathname === '/telegram') ? BASICAS : VARIABLES;
    const faltan = faltantes(env, necesarias);
    if (faltan.length) {
      return cors(json({ error: `Faltan variables en Cloudflare: ${faltan.join(', ')}` }, 500));
    }

    try {
      if (url.pathname === '/pedido' && request.method === 'POST') return cors(await notificarPedido(request, env));
      if (url.pathname === '/chat' && request.method === 'POST') return cors(await enviarChat(request, env));
      if (url.pathname === '/telegram' && request.method === 'POST') return await webhookTelegram(request, env);
      if (url.pathname === '/setup') return await configurarWebhook(url, env);
      if (url.pathname === '/recordatorio' && request.method === 'POST') return cors(await recordatorioManual(request, env));
      if (url.pathname === '/prueba-correo' && request.method === 'POST') return cors(await correoDePrueba(request, env));
      if (url.pathname === '/admin/pedido' && request.method === 'POST') return cors(await accionPanel(request, env));
      if (url.pathname === '/revisar') {
        if (url.searchParams.get('clave') !== env.WEBHOOK_SECRET) return new Response('Clave incorrecta', { status: 403 });
        return json(await revisarVencimientos(env));
      }
      if (url.pathname === '/') return new Response('Puente de Refills EC activo ✅', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      return cors(json({ error: 'Ruta no encontrada' }, 404));
    } catch (e) {
      console.error(e && e.stack ? e.stack : e);
      return cors(json({ error: 'Error interno del puente' }, 500));
    }
  },

  // Se ejecuta solo, una vez al día, si configuras el Cron Trigger en Cloudflare.
  async scheduled(event, env, ctx) {
    if (faltantes(env, VARIABLES).length) return;
    ctx.waitUntil(revisarVencimientos(env).catch((e) => console.error('Revisión diaria:', e && e.stack ? e.stack : e)));
  }
};

/* ---------------- Respuestas ---------------- */
function json(datos, status = 200) {
  return new Response(JSON.stringify(datos), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
function cors(resp) {
  const h = new Headers(resp.headers);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  h.set('Access-Control-Max-Age', '86400');
  return new Response(resp.body, { status: resp.status, headers: h });
}

/* ---------------- Pedido nuevo → Telegram ---------------- */
async function notificarPedido(request, env) {
  const usuario = await verificarUsuario(request, env);
  if (!usuario) return json({ error: 'Tu sesión expiró. Vuelve a entrar.' }, 401);
  const cuerpo = await request.json().catch(() => ({}));
  const id = String(cuerpo.pedidoId || '');
  if (!idValido(id)) return json({ error: 'Pedido inválido' }, 400);

  const pedido = await fsGet(env, `pedidos/${id}`);
  if (!pedido || pedido.uid !== usuario.uid) return json({ error: 'Pedido no encontrado' }, 404);
  if (pedido.notificado) return json({ ok: true, repetido: true });

  const comprobante = await fsGet(env, `comprobantes/${id}`);
  const destino = Object.assign({ chat_id: env.TG_CHAT_ID }, env.TG_PEDIDOS_TEMA ? { message_thread_id: Number(env.TG_PEDIDOS_TEMA) } : {});
  const texto = textoPedido(pedido);
  const botones = teclado(pedido.estado || 'en_revision', id);

  let enviado;
  let esFoto = false;
  if (comprobante && typeof comprobante.imagen === 'string' && comprobante.imagen.startsWith('data:image')) {
    enviado = await tgFoto(env, destino, dataUrlABlob(comprobante.imagen), recortar(texto, 1024), botones);
    esFoto = true;
  } else {
    enviado = await tg(env, 'sendMessage', Object.assign({}, destino, { text: recortar(texto + '\n\n⚠️ Llegó sin comprobante', 4000), reply_markup: botones }));
  }

  await fsUpdate(env, `pedidos/${id}`, {
    notificado: true,
    tgChat: String(enviado.chat.id),
    tgMensaje: enviado.message_id,
    tgEsFoto: esFoto
  }, true);
  return json({ ok: true });
}

function textoPedido(p) {
  const lineas = [`🛒 Pedido ${p.codigo || ''}`, `👤 ${p.nombre || 'Sin nombre'} (${p.email || 'sin correo'})`];
  if (p.whatsapp) lineas.push(`📱 ${p.whatsapp}`);
  lineas.push('');
  (p.items || []).forEach((it) => {
    const cantidad = it.cantidad > 1 ? ` x${it.cantidad}` : '';
    if (it.tipo === 'combo') {
      lineas.push(`• ${it.nombre}: ${(it.servicios || []).map((s) => `${s.nombre} (${s.plan})`).join(' + ')}${cantidad} — ${dinero(it.subtotal)}`);
    } else {
      lineas.push(`• ${it.servicio}: ${it.plan}${cantidad} — ${dinero(it.subtotal)}`);
      (it.datos || []).forEach((d) => lineas.push(`   ↳ ${d.etiqueta}: ${d.valor}`));
    }
  });
  lineas.push('');
  const metodo = p.metodo ? (p.metodo.destino || p.metodo.tipo) : 'Sin método';
  lineas.push(`💳 ${metodo}`);
  if (p.ahorro > 0) lineas.push(`🏷️ Ahorro por combos: ${dinero(p.ahorro)}`);
  lineas.push(`💰 Total: ${dinero(p.total)}`);
  lineas.push(`📍 Estado: ${ETIQUETAS[p.estado] || ETIQUETAS.en_revision}`);
  lineas.push('');
  lineas.push('Responde a este mensaje para escribirle al cliente.');
  lineas.push(`🆔 ${p.uid}`);
  return lineas.join('\n');
}

function teclado(estado, id) {
  if (estado === 'aprobado') {
    return { inline_keyboard: [[{ text: '📦 Entregar datos', callback_data: `ent:${id}` }], [{ text: '❌ Rechazar', callback_data: `no:${id}` }]] };
  }
  if (estado === 'rechazado') {
    return { inline_keyboard: [[{ text: '↩️ Volver a revisión', callback_data: `rev:${id}` }]] };
  }
  if (estado === 'entregado') {
    return { inline_keyboard: [[{ text: '✏️ Corregir entrega', callback_data: `cor:${id}` }]] };
  }
  return { inline_keyboard: [[{ text: '✅ Aprobar', callback_data: `ok:${id}` }, { text: '❌ Rechazar', callback_data: `no:${id}` }]] };
}

async function editarAviso(env, chatId, mensajeId, esFoto, pedido, id) {
  if (!chatId || !mensajeId) return;
  const texto = textoPedido(pedido);
  const botones = teclado(pedido.estado, id);
  try {
    if (esFoto) await tg(env, 'editMessageCaption', { chat_id: chatId, message_id: mensajeId, caption: recortar(texto, 1024), reply_markup: botones });
    else await tg(env, 'editMessageText', { chat_id: chatId, message_id: mensajeId, text: recortar(texto, 4000), reply_markup: botones });
  } catch (e) {
    if (!/not modified/i.test(e.message)) throw e;
  }
}

/* ---------------- Chat cliente → Telegram ---------------- */
async function enviarChat(request, env) {
  const usuario = await verificarUsuario(request, env);
  if (!usuario) return json({ error: 'Tu sesión expiró. Vuelve a entrar.' }, 401);
  const cuerpo = await request.json().catch(() => ({}));
  const texto = String(cuerpo.texto || '').trim().slice(0, 1000);
  const referencia = String(cuerpo.pedido || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 20);
  if (!texto) return json({ error: 'Escribe un mensaje.' }, 400);
  if (!(await tienePedidos(env, usuario.uid))) return json({ error: 'El chat se activa después de tu primera compra.' }, 403);

  const nombre = (usuario.nombre || usuario.email || 'Cliente').slice(0, 100);
  const chat = await fsGet(env, `chats/${usuario.uid}`);
  let tema = chat && chat.tema ? Number(chat.tema) : 0;

  async function crearTema() {
    const nuevo = await tg(env, 'createForumTopic', { chat_id: env.TG_CHAT_ID, name: nombre }).catch(() => null);
    if (!nuevo || !nuevo.message_thread_id) return 0;
    const t = nuevo.message_thread_id;
    await fsSet(env, `soporteTemas/${t}`, { uid: usuario.uid });
    await tg(env, 'sendMessage', {
      chat_id: env.TG_CHAT_ID, message_thread_id: t,
      text: `👤 ${nombre}\n✉️ ${usuario.email || 'sin correo'}\nEscribe en este tema para responderle.\n🆔 ${usuario.uid}`
    }).catch(() => {});
    return t;
  }

  if (!tema) {
    tema = await crearTema();
    if (tema || !chat) {
      await fsUpdate(env, `chats/${usuario.uid}`, { uid: usuario.uid, nombre, email: usuario.email || '', tema, actualizado: new Date() });
    }
  }

  const conTema = () => `💬 ${texto}${referencia ? `\n(${referencia})` : ''}`;
  const sinTema = `💬 ${nombre}${referencia ? ` (${referencia})` : ''}:\n${texto}\n\nResponde a este mensaje para contestarle.\n🆔 ${usuario.uid}`;
  try {
    if (tema) await tg(env, 'sendMessage', { chat_id: env.TG_CHAT_ID, message_thread_id: tema, text: conTema() });
    else await tg(env, 'sendMessage', { chat_id: env.TG_CHAT_ID, text: sinTema });
  } catch (e) {
    // Si borraste el tema en Telegram, se crea uno nuevo.
    if (tema && /thread|topic/i.test(e.message)) {
      tema = await crearTema();
      await fsUpdate(env, `chats/${usuario.uid}`, { tema, actualizado: new Date() });
      if (tema) await tg(env, 'sendMessage', { chat_id: env.TG_CHAT_ID, message_thread_id: tema, text: conTema() });
      else await tg(env, 'sendMessage', { chat_id: env.TG_CHAT_ID, text: sinTema });
    } else throw e;
  }

  await fsCreate(env, `chats/${usuario.uid}/mensajes`, { de: 'cliente', texto, pedido: referencia, creado: new Date() });
  return json({ ok: true });
}

/* ---------------- Telegram → tienda (tus botones y respuestas) ---------------- */
async function webhookTelegram(request, env) {
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
    return new Response('No autorizado', { status: 401 });
  }
  const update = await request.json().catch(() => null);
  const completo = faltantes(env, VARIABLES).length === 0;
  try {
    if (update && update.callback_query && completo) await manejarBoton(update.callback_query, env);
    else if (update && update.message) await manejarMensaje(update.message, env, completo);
  } catch (e) {
    console.error('Webhook:', e && e.stack ? e.stack : e);
  }
  return new Response('ok');
}

async function manejarBoton(cb, env) {
  const msg = cb.message;
  const responder = (texto) => tg(env, 'answerCallbackQuery', Object.assign({ callback_query_id: cb.id }, texto ? { text: texto, show_alert: texto.length > 60 } : {})).catch(() => {});
  if (!msg || String(msg.chat.id) !== String(env.TG_CHAT_ID)) return responder('Este chat no está autorizado.');

  const [accion, id] = String(cb.data || '').split(':');
  if (!idValido(id)) return responder();
  const pedido = await fsGet(env, `pedidos/${id}`);
  if (!pedido) return responder('No encontré ese pedido.');
  // Si el aviso no tiene guardado su mensaje, usamos el que tocaste.
  if (!pedido.tgMensaje) Object.assign(pedido, { tgChat: String(msg.chat.id), tgMensaje: msg.message_id, tgEsFoto: !!msg.photo });

  const cambios = { ok: 'aprobado', no: 'rechazado', rev: 'en_revision' };
  if (accion in cambios) {
    const r = await cambiarEstado(env, id, pedido, cambios[accion]);
    if (!r.ok) {
      await editarAviso(env, msg.chat.id, msg.message_id, !!msg.photo, pedido, id).catch(() => {}); // refresca botones viejos
      return responder(r.error);
    }
    const extra = r.correo === 'enviado' ? ' · 📧 correo enviado' : r.correo ? ' · ⚠️ no se pudo enviar el correo' : '';
    return responder(`${pedido.codigo}: ${ETIQUETAS[pedido.estado]}${extra}`);
  }
  if (accion === 'ent' || accion === 'cor') {
    if (pedido.estado === 'rechazado') return responder('Este pedido está rechazado. Primero vuélvelo a revisión.');
    const corregir = pedido.estado === 'entregado';
    if (accion === 'ent' && corregir) await editarAviso(env, msg.chat.id, msg.message_id, !!msg.photo, pedido, id).catch(() => {});
    await tg(env, 'sendMessage', Object.assign({ chat_id: msg.chat.id }, hilo(msg), {
      text: corregir
        ? `✏️ Corregir la entrega de ${pedido.codigo}\\nEste pedido ya fue entregado. Responde a ESTE mensaje solo si quieres reemplazar los datos que ve el cliente.\\n[corregir:${id}]`
        : `📦 Entrega del pedido ${pedido.codigo}\\nResponde a ESTE mensaje con los datos para el cliente (correo, clave, perfil, PIN o código). Puedes usar varias líneas.\\n[pedido:${id}]`,
      reply_markup: { force_reply: true, input_field_placeholder: corregir ? 'Datos corregidos' : 'Datos de entrega' }
    }));
    return responder(corregir ? 'Ya estaba entregado: responde al mensaje solo para corregir.' : 'Escribe los datos respondiendo al mensaje.');
  }
  return responder();
}

async function manejarMensaje(msg, env, completo = true) {
  const texto = String(msg.text || msg.caption || '').trim();
  if (/^\/(id|start)(@\w+)?\b/i.test(texto)) {
    await tg(env, 'sendMessage', Object.assign({ chat_id: msg.chat.id }, hilo(msg), {
      text: `ID de este chat: ${msg.chat.id}${msg.message_thread_id ? `\nID de este tema: ${msg.message_thread_id}` : ''}`
    }));
    return;
  }
  if (!completo || String(msg.chat.id) !== String(env.TG_CHAT_ID)) return;
  if (!texto || (msg.from && msg.from.is_bot) || texto.startsWith('/')) return;

  const r = msg.reply_to_message;
  const respondido = r ? String(r.text || r.caption || '') : '';

  const entrega = respondido.match(/\[(pedido|corregir):([A-Za-z0-9_-]+)\]/);
  if (entrega) { await guardarEntrega(env, entrega[2], texto, msg, entrega[1] === 'corregir'); return; }

  let uid = null;
  const marca = respondido.match(/🆔 ([A-Za-z0-9_-]{6,128})/);
  if (marca) uid = marca[1];
  else if (msg.is_topic_message && msg.message_thread_id) {
    const tema = await fsGet(env, `soporteTemas/${msg.message_thread_id}`);
    uid = tema ? tema.uid : null;
  }
  if (!uid) return;

  await fsCreate(env, `chats/${uid}/mensajes`, { de: 'admin', texto: texto.slice(0, 2000), creado: new Date() });
  await tg(env, 'setMessageReaction', { chat_id: msg.chat.id, message_id: msg.message_id, reaction: [{ type: 'emoji', emoji: '👍' }] }).catch(() => {});
  await correoRespuestaChat(env, uid, texto).catch((e) => console.error('Correo del chat:', e.message));
}

async function guardarEntrega(env, id, texto, msg, corregir) {
  const contestar = (t) => tg(env, 'sendMessage', Object.assign({ chat_id: msg.chat.id }, hilo(msg), {
    text: t, reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true }
  }));
  if (!idValido(id)) return;
  const pedido = await fsGet(env, `pedidos/${id}`);
  if (!pedido) { await contestar('No encontré ese pedido.'); return; }
  const r = await entregar(env, id, pedido, texto, { corregir });
  if (!r.ok) { await contestar(`⚠️ ${r.error}`); return; }
  await contestar(`✅ ${pedido.codigo} ${r.corregida ? 'corregido' : 'entregado'}. El cliente ya ve sus datos en la página de su pedido.${textoResultado(env, pedido, r)}`);
}

/* ---------------- Acciones de pedido (las usan Telegram y tu panel) ---------------- */
const PERMITIDOS = {
  aprobado: ['en_revision'],
  rechazado: ['en_revision', 'aprobado'],
  en_revision: ['rechazado', 'aprobado']
};
const NOMBRE_ESTADO = { en_revision: 'en revisión', aprobado: 'aprobado', entregado: 'entregado', rechazado: 'rechazado' };
async function cambiarEstado(env, id, pedido, estado) {
  const actual = pedido.estado || 'en_revision';
  if (actual === estado) return { ok: false, error: `Este pedido ya está ${NOMBRE_ESTADO[estado]}.` };
  if (actual === 'entregado') return { ok: false, error: 'Este pedido ya fue entregado. Si necesitas cambiar los datos, usa "Corregir entrega".' };
  if (!(PERMITIDOS[estado] || []).includes(actual)) return { ok: false, error: `No se puede pasar de ${NOMBRE_ESTADO[actual]} a ${NOMBRE_ESTADO[estado]}.` };
  await fsUpdate(env, `pedidos/${id}`, { estado, actualizado: new Date() }, true);
  pedido.estado = estado;
  await editarAviso(env, pedido.tgChat, pedido.tgMensaje, pedido.tgEsFoto, pedido, id).catch((e) => console.error('Aviso de Telegram:', e.message));
  let correo = '';
  if (estado === 'rechazado' || (estado === 'aprobado' && String(env.CORREO_APROBADO || '').toLowerCase() === 'si')) {
    const r = await correoEstado(env, id, pedido, estado).catch((e) => ({ error: e.message }));
    correo = r && r.id ? 'enviado' : r && r.error ? `fallo: ${r.error}` : '';
  }
  return { ok: true, correo };
}

async function entregar(env, id, pedido, texto, { corregir = false, costo } = {}) {
  texto = String(texto || '').trim();
  if (!texto) return { ok: false, error: 'Escribe los datos de la entrega.' };
  if (pedido.estado === 'rechazado') return { ok: false, error: 'Este pedido está rechazado. Primero vuélvelo a revisión.' };
  if (pedido.estado === 'entregado' && !corregir) {
    return { ok: false, error: `${pedido.codigo} ya fue entregado (desde el panel o desde Telegram). Si quieres cambiar los datos, usa "Corregir entrega".` };
  }
  const ahora = new Date();
  const corregida = pedido.estado === 'entregado';
  const entregadoEn = pedido.entregadoEn ? new Date(pedido.entregadoEn) : ahora; // corregir no reinicia los días
  const cambios = { entrega: texto.slice(0, 3000), estado: 'entregado', actualizado: ahora };
  if (!pedido.entregadoEn) cambios.entregadoEn = ahora;
  const vence = calcularVence(pedido, entregadoEn);
  if (vence) cambios.vence = vence;
  const costoNum = Number(String(costo ?? '').replace(',', '.'));
  if (costo !== undefined && costo !== null && String(costo).trim() !== '' && Number.isFinite(costoNum) && costoNum >= 0) cambios.costo = Math.round(costoNum * 100) / 100;
  else if (pedido.costo === undefined || pedido.costo === null) {
    const porDefecto = await costoPredeterminado(env, pedido).catch(() => null);
    if (porDefecto !== null) cambios.costo = porDefecto;
  }
  await fsUpdate(env, `pedidos/${id}`, cambios, true);
  Object.assign(pedido, { estado: 'entregado', entrega: cambios.entrega, entregadoEn: entregadoEn.toISOString() });
  if ('costo' in cambios) pedido.costo = cambios.costo;
  await editarAviso(env, pedido.tgChat, pedido.tgMensaje, pedido.tgEsFoto, pedido, id).catch((e) => console.error('Aviso de Telegram:', e.message));
  let correo = '';
  if (correoActivo(env)) {
    try { await correoEntrega(env, id, pedido, corregida); correo = 'enviado'; }
    catch (e) { console.error('Correo de entrega:', e.message); correo = `fallo: ${e.message}`; }
  }
  return { ok: true, corregida, correo, costo: pedido.costo ?? null };
}
function textoResultado(env, pedido, r) {
  let t = '';
  if (r.correo === 'enviado') t += `\n📧 También se lo enviamos a ${pedido.email}.`;
  else if (r.correo) t += `\n⚠️ No se pudo enviar el correo (${r.correo.slice(7)}). El cliente igual ve sus datos en la web.`;
  if (typeof r.costo === 'number') t += `\n💵 Costo ${dinero(r.costo)} · Ganancia ${dinero((Number(pedido.total) || 0) - r.costo)}`;
  else t += '\n💵 Sin costo registrado: agrégalo en tu panel para ver tu ganancia.';
  return t;
}

// Costo de proveedor según los costos que pusiste en cada plan (panel → Productos).
// Se lee en cada entrega (1 lectura) para que un costo recién cambiado aplique al instante.
const catalogoTienda = (env) => fsGet(env, 'tienda/catalogo').catch(() => null);
async function costoPredeterminado(env, pedido) {
  const cat = await catalogoTienda(env);
  if (!cat || !Array.isArray(cat.servicios)) return null;
  const servicio = (sid) => cat.servicios.find((x) => x.id === sid);
  let total = 0;
  for (const it of pedido.items || []) {
    const cant = Number(it.cantidad) || 1;
    if (it.tipo === 'combo') {
      for (const s of it.servicios || []) {
        const plan = ((servicio(s.id) || {}).planes || []).find((p) => p.combo);
        if (!plan || typeof plan.costo !== 'number') return null;
        total += plan.costo * cant;
      }
    } else {
      const plan = ((servicio(it.servicioId) || {}).planes || []).find((p) => p.id === it.planId);
      if (!plan || typeof plan.costo !== 'number') return null;
      total += plan.costo * cant;
    }
  }
  return Math.round(total * 100) / 100;
}

// Tu panel de administrador: aprobar, rechazar, volver a revisión, entregar y corregir.
async function accionPanel(request, env) {
  const admin = await verificarAdmin(request, env);
  if (!admin) return json({ error: 'Solo el administrador puede hacer esto.' }, 403);
  const c = await request.json().catch(() => ({}));
  const id = String(c.pedidoId || '');
  if (!idValido(id)) return json({ error: 'Pedido inválido' }, 400);
  const pedido = await fsGet(env, `pedidos/${id}`);
  if (!pedido) return json({ error: 'No encontré ese pedido.' }, 404);
  const estados = { aprobar: 'aprobado', rechazar: 'rechazado', revisar: 'en_revision' };
  let r;
  if (c.accion in estados) r = await cambiarEstado(env, id, pedido, estados[c.accion]);
  else if (c.accion === 'entregar' || c.accion === 'corregir') r = await entregar(env, id, pedido, c.texto, { corregir: c.accion === 'corregir', costo: c.costo });
  else return json({ error: 'Acción desconocida' }, 400);
  if (!r.ok) return json({ error: r.error, estado: pedido.estado }, 409);
  return json(Object.assign({ ok: true, estado: pedido.estado, para: pedido.email }, r));
}

function hilo(msg) {
  return msg && msg.is_topic_message && msg.message_thread_id ? { message_thread_id: msg.message_thread_id } : {};
}

/* ---------------- Vencimientos ---------------- */
const DIA = 86400000;
function calcularVence(pedido, entregadoEn) {
  const dias = (pedido.items || []).map((i) => Number(i.dias) || 0).filter((d) => d > 0);
  if (!dias.length || !entregadoEn) return null;
  return new Date(new Date(entregadoEn).getTime() + Math.min(...dias) * DIA);
}
// Días de calendario en Ecuador (UTC-5): "mañana" es la fecha de mañana, no 24 horas.
const diaEC = (f) => Math.floor((new Date(f).getTime() - 5 * 3600000) / DIA);
const diasRestantes = (vence, ahora = new Date()) => diaEC(vence) - diaEC(ahora);
const yaVencio = (vence, ahora = new Date()) => new Date(vence).getTime() <= ahora.getTime();
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fechaEC(fecha) {
  const d = new Date(new Date(fecha).getTime() - 5 * 3600000); // hora de Ecuador (UTC-5)
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function cuandoVence(dias, vencido = dias < 0) {
  if (vencido) return dias >= 0 ? 'venció hoy' : dias === -1 ? 'venció ayer' : `venció hace ${-dias} días`;
  if (dias === 0) return 'vence hoy';
  if (dias === 1) return 'vence mañana';
  return `vence en ${dias} días`;
}
function nombreItem(it) {
  const cant = it.cantidad > 1 ? ` x${it.cantidad}` : '';
  if (it.tipo === 'combo') return `${it.nombre}: ${(it.servicios || []).map((s) => s.nombre).join(' + ')}${cant}`;
  return `${it.servicio} (${it.plan})${cant}`;
}
// Enlace que vuelve a poner en el carrito lo mismo que compró el cliente.
function enlaceRenovar(env, pedido) {
  const base = sitio(env);
  if (!base) return '';
  const items = (pedido.items || []).filter((it) => Number(it.dias) > 0).map((it) => (it.tipo === 'combo'
    ? ['c', (it.servicios || []).map((x) => x.id).filter(Boolean), it.cantidad || 1]
    : ['p', it.servicioId, it.planId, it.cantidad || 1])).filter((x) => x[0] === 'c' ? x[1].length >= 2 : x[1] && x[2]);
  return items.length ? `${base}/?renovar=${b64urlTexto(JSON.stringify(items))}` : `${base}/`;
}

/* ---------------- Correos (Resend) ---------------- */
const correoActivo = (env) => !!(env.RESEND_API_KEY && env.CORREO_REMITENTE);
const sitio = (env) => String(env.SITIO_URL || '').trim().replace(/\/+$/, '');
const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c || ''));
const escHtml = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const primerNombre = (n) => String(n || '').trim().split(/\s+/)[0] || '';

let datosTienda = null;
async function tienda(env) {
  if (datosTienda && datosTienda.hasta > Date.now()) return datosTienda.datos;
  const c = await fsGet(env, 'tienda/config').catch(() => null);
  const datos = {
    nombre: c && c.nombreTienda ? `${c.nombreTienda}${c.nombreAcento ? ` ${c.nombreAcento}` : ''}` : 'Refills EC',
    whatsapp: c && c.whatsapp ? String(c.whatsapp) : ''
  };
  datosTienda = { datos, hasta: Date.now() + 10 * 60000 };
  return datos;
}

async function enviarCorreo(env, { para, asunto, html, texto }) {
  if (!correoActivo(env)) throw new Error('Los correos no están configurados (RESEND_API_KEY y CORREO_REMITENTE)');
  if (!correoValido(para)) throw new Error('El cliente no tiene un correo válido');
  const cuerpo = { from: env.CORREO_REMITENTE, to: [para], subject: asunto, html, text: texto };
  if (correoValido(env.CORREO_RESPUESTA)) cuerpo.reply_to = env.CORREO_RESPUESTA;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend ${r.status}: ${d.message || d.name || 'error'}`);
  return { id: d.id };
}

// Diseño del correo: cabecera oscura con tu marca, cuerpo claro (se lee bien en cualquier app).
async function plantilla(env, { previa, titulo, saludo, parrafos = [], bloque = '', filas = [], boton, pie = '' }) {
  const t = await tienda(env);
  const base = sitio(env);
  const logo = base ? `<img src="${escHtml(base)}/img/logoo.png" width="56" height="56" alt="" style="display:block;border:0;width:56px;height:56px">` : '';
  const partes = t.nombre.split(' ');
  const acento = partes.length > 1 ? partes.pop() : '';
  const marca = `${escHtml(partes.join(' '))}${acento ? ` <span style="color:#C76E00">${escHtml(acento)}</span>` : ''}`;
  const wa = t.whatsapp ? `<a href="https://wa.me/${escHtml(t.whatsapp)}" style="color:#7c3aed;text-decoration:none">WhatsApp</a>` : '';
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escHtml(titulo)}</title></head>
<body style="margin:0;padding:0;background:#f4f2f7;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escHtml(previa || titulo)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2f7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e9e5ef">
<tr><td style="background:#0b0910;background-image:linear-gradient(135deg,#1a0f24,#0b0910 60%,#22091a);padding:22px 26px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>${logo ? `<td style="padding-right:12px">${logo}</td>` : ''}<td style="font-size:22px;font-weight:bold;color:#ffffff">${marca}</td></tr></table>
</td></tr>
<tr><td style="height:4px;background:#db2777;background-image:linear-gradient(90deg,#c084fc,#ec4899)"></td></tr>
<tr><td style="padding:28px 26px 8px">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#18181b">${escHtml(titulo)}</h1>
${saludo ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">${escHtml(saludo)}</p>` : ''}
${parrafos.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#3f3f46">${p}</p>`).join('')}
${bloque}
${filas.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 14px;border-collapse:collapse">${filas.map(([a, b]) => `<tr><td style="padding:9px 0;border-bottom:1px solid #f0edf3;font-size:14px;color:#52525b">${escHtml(a)}</td><td align="right" style="padding:9px 0;border-bottom:1px solid #f0edf3;font-size:14px;font-weight:bold;color:#18181b">${escHtml(b)}</td></tr>`).join('')}</table>` : ''}
${boton && boton.url ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 8px"><tr><td style="border-radius:12px;background:#db2777;background-image:linear-gradient(135deg,#c084fc,#ec4899)"><a href="${escHtml(boton.url)}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:12px">${escHtml(boton.texto)}</a></td></tr></table>` : ''}
${pie ? `<p style="margin:14px 0 0;font-size:13px;line-height:1.5;color:#71717a">${pie}</p>` : ''}
</td></tr>
<tr><td style="padding:20px 26px 26px;font-size:12px;line-height:1.5;color:#a1a1aa">¿Dudas? Responde este correo${wa ? ` o escríbenos por ${wa}` : ''}.<br>${escHtml(t.nombre)}${base ? ` · <a href="${escHtml(base)}" style="color:#a1a1aa">${escHtml(base.replace(/^https?:\/\//, ''))}</a>` : ''}</td></tr>
</table></td></tr></table></body></html>`;
  return html;
}
const urlPedido = (env, id) => (sitio(env) ? `${sitio(env)}/pedido.html?id=${encodeURIComponent(id)}` : '');

async function correoEntrega(env, id, pedido, corregida) {
  const vencimientos = (pedido.items || []).filter((it) => Number(it.dias) > 0).map((it) => {
    const fin = new Date(new Date(pedido.entregadoEn).getTime() + Number(it.dias) * DIA);
    return [nombreItem(it), `vence el ${fechaEC(fin)}`];
  });
  const html = await plantilla(env, {
    previa: `Tus datos de ${pedido.codigo} ya están listos`,
    titulo: corregida ? `Actualizamos los datos de tu pedido ${pedido.codigo}` : `¡Tu pedido ${pedido.codigo} está listo!`,
    saludo: `Hola${primerNombre(pedido.nombre) ? ` ${primerNombre(pedido.nombre)}` : ''},`,
    parrafos: [corregida ? 'Corregimos los datos de tu pedido. Estos son los correctos:' : 'Verificamos tu pago. Estos son los datos de tu compra:'],
    bloque: `<div style="margin:6px 0 16px;padding:16px 18px;border-radius:12px;background:#faf7fd;border:1px solid #eadff5;font-family:Consolas,Menlo,monospace;font-size:15px;line-height:1.65;color:#18181b;white-space:pre-wrap;word-break:break-word">${escHtml(pedido.entrega)}</div>`,
    filas: vencimientos,
    boton: { texto: 'Ver mi pedido', url: urlPedido(env, id) },
    pie: 'Usa solo el perfil que te asignamos y no cambies el correo, la contraseña ni el PIN. Te avisaremos antes de tu fecha de corte para que puedas renovar.'
  });
  const texto = [`Tu pedido ${pedido.codigo} está listo.`, '', pedido.entrega, '', ...vencimientos.map(([a, b]) => `${a}: ${b}`), '', urlPedido(env, id)].join('\n');
  return enviarCorreo(env, { para: pedido.email, asunto: corregida ? `Datos actualizados de tu pedido ${pedido.codigo}` : `✅ Tu pedido ${pedido.codigo} está listo`, html, texto });
}

async function correoEstado(env, id, pedido, estado) {
  if (!correoActivo(env)) return { omitido: true };
  const rechazado = estado === 'rechazado';
  const titulo = rechazado ? `No pudimos verificar el pago de ${pedido.codigo}` : `Aprobamos el pago de ${pedido.codigo}`;
  const html = await plantilla(env, {
    titulo,
    saludo: `Hola${primerNombre(pedido.nombre) ? ` ${primerNombre(pedido.nombre)}` : ''},`,
    parrafos: rechazado
      ? ['Revisamos tu comprobante y no pudimos validarlo. Puede pasar si la captura no se ve completa o si el monto no coincide.', 'Escríbenos desde el chat de tu pedido y lo resolvemos juntos.']
      : ['Confirmamos tu pago y ya estamos preparando tu entrega. Te enviaremos tus datos por este medio en unos minutos.'],
    filas: [['Pedido', pedido.codigo], ['Total', dinero(pedido.total)]],
    boton: { texto: rechazado ? 'Ir a mi pedido' : 'Ver mi pedido', url: urlPedido(env, id) }
  });
  return enviarCorreo(env, { para: pedido.email, asunto: rechazado ? `Revisa el pago de tu pedido ${pedido.codigo}` : `Pago aprobado: ${pedido.codigo}`, html, texto: `${titulo}. ${urlPedido(env, id)}` });
}

async function pedidosDeUsuario(env, uid, limite = 50) {
  const r = await fetch(`${baseFirestore(env)}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await tokenGoogle(env)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'pedidos' }],
      where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } },
      limit: limite
    } })
  });
  if (!r.ok) throw new Error(`Firestore runQuery ${r.status}: ${await r.text()}`);
  return (await r.json()).filter((f) => f.document).map((f) => Object.assign({ id: f.document.name.split('/').pop() }, desdeCampos(f.document.fields || {})));
}

const PAUSA_CORREO_CHAT = 10 * 60000; // un aviso como máximo cada 10 minutos
async function correoRespuestaChat(env, uid, texto) {
  if (!correoActivo(env)) return { omitido: true };
  const chat = await fsGet(env, `chats/${uid}`);
  if (chat && chat.ultimoCorreo && Date.now() - new Date(chat.ultimoCorreo).getTime() < PAUSA_CORREO_CHAT) return { omitido: true, motivo: 'reciente' };
  const pedidos = await pedidosDeUsuario(env, uid);
  const ultimo = pedidos.sort((a, b) => new Date(b.creado || 0) - new Date(a.creado || 0))[0];
  const para = (chat && chat.email) || (ultimo && ultimo.email);
  if (!correoValido(para)) return { omitido: true, motivo: 'sin correo' };
  const nombre = (chat && chat.nombre) || (ultimo && ultimo.nombre) || '';
  const html = await plantilla(env, {
    previa: texto.slice(0, 90),
    titulo: 'Tienes una respuesta nueva',
    saludo: `Hola${primerNombre(nombre) ? ` ${primerNombre(nombre)}` : ''}, te respondimos en el chat de tu pedido:`,
    bloque: `<div style="margin:6px 0 16px;padding:14px 18px;border-radius:14px;border-bottom-left-radius:4px;background:#f4f4f5;font-size:15px;line-height:1.55;color:#18181b;white-space:pre-wrap;word-break:break-word">${escHtml(texto.slice(0, 1500))}</div>`,
    boton: { texto: 'Responder en la web', url: ultimo ? urlPedido(env, ultimo.id) : sitio(env) }
  });
  const r = await enviarCorreo(env, { para, asunto: 'Tienes una respuesta de Refills EC', html, texto: `Te respondimos en el chat de tu pedido:\n\n${texto}\n\n${ultimo ? urlPedido(env, ultimo.id) : sitio(env)}` });
  await fsUpdate(env, `chats/${uid}`, { ultimoCorreo: new Date() });
  return r;
}

async function correoRecordatorio(env, id, pedido, ahora = new Date()) {
  const dias = diasRestantes(pedido.vence, ahora);
  const vencido = yaVencio(pedido.vence, ahora);
  const cuando = cuandoVence(dias, vencido);
  const filas = (pedido.items || []).filter((it) => Number(it.dias) > 0).map((it) => {
    const fin = pedido.entregadoEn ? new Date(new Date(pedido.entregadoEn).getTime() + Number(it.dias) * DIA) : new Date(pedido.vence);
    return [nombreItem(it), `vence el ${fechaEC(fin)}`];
  });
  const servicios = (pedido.items || []).filter((it) => Number(it.dias) > 0).map(nombreItem).join(', ');
  const html = await plantilla(env, {
    previa: `Tu servicio ${cuando}. Renueva en un par de toques.`,
    titulo: vencido ? 'Tu servicio ya venció' : `Tu servicio ${cuando}`,
    saludo: `Hola${primerNombre(pedido.nombre) ? ` ${primerNombre(pedido.nombre)}` : ''},`,
    parrafos: [vencido
      ? 'Tu suscripción terminó. Si quieres seguir disfrutando, puedes renovarla ahora mismo.'
      : 'Te avisamos con tiempo para que no te quedes sin tu servicio. ¿Deseas renovarlo?'],
    filas,
    boton: { texto: 'Renovar ahora', url: enlaceRenovar(env, pedido) },
    pie: 'El botón pone tu mismo pedido en el carrito; solo pagas y subes tu comprobante. Si no deseas renovar, puedes ignorar este correo.'
  });
  const r = await enviarCorreo(env, { para: pedido.email, asunto: `⏳ ${servicios || 'Tu servicio'} ${cuando}`, html, texto: `Tu servicio ${cuando} (${servicios}). Renueva aquí: ${enlaceRenovar(env, pedido)}` });
  await fsUpdate(env, `pedidos/${id}`, { recordatorio: ahora, recordatorios: (Number(pedido.recordatorios) || 0) + 1 }, true);
  return r;
}

/* ---------------- Acciones de tu panel de administrador ---------------- */
async function verificarAdmin(request, env) {
  const u = await verificarUsuario(request, env);
  if (!u) return null;
  const admin = await fsGet(env, `admins/${u.uid}`);
  return admin ? u : null;
}
async function recordatorioManual(request, env) {
  const admin = await verificarAdmin(request, env);
  if (!admin) return json({ error: 'Solo el administrador puede enviar recordatorios.' }, 403);
  if (!correoActivo(env)) return json({ error: 'Primero configura los correos (Resend) en Cloudflare.' }, 400);
  const cuerpo = await request.json().catch(() => ({}));
  const id = String(cuerpo.pedidoId || '');
  if (!idValido(id)) return json({ error: 'Pedido inválido' }, 400);
  const pedido = await fsGet(env, `pedidos/${id}`);
  if (!pedido || pedido.estado !== 'entregado') return json({ error: 'Ese pedido no está entregado.' }, 404);
  if (!pedido.vence) {
    const vence = calcularVence(pedido, pedido.entregadoEn);
    if (!vence) return json({ error: 'Ese pedido no tiene días de servicio.' }, 400);
    pedido.vence = vence.toISOString();
  }
  try {
    await correoRecordatorio(env, id, pedido);
  } catch (e) {
    return json({ error: e.message }, 502);
  }
  return json({ ok: true, para: pedido.email });
}
async function correoDePrueba(request, env) {
  const admin = await verificarAdmin(request, env);
  if (!admin) return json({ error: 'Solo el administrador puede hacer esta prueba.' }, 403);
  if (!correoActivo(env)) return json({ error: 'Faltan RESEND_API_KEY o CORREO_REMITENTE en Cloudflare.' }, 400);
  const html = await plantilla(env, {
    titulo: '¡Tus correos funcionan!',
    parrafos: ['Este es un correo de prueba de tu tienda. Así se verán los avisos que reciben tus clientes.'],
    filas: [['Remitente', env.CORREO_REMITENTE], ['Responden a', env.CORREO_RESPUESTA || '(no configurado)'], ['Tienda', sitio(env) || '(falta SITIO_URL)']],
    boton: sitio(env) ? { texto: 'Abrir mi tienda', url: sitio(env) } : null
  });
  try {
    await enviarCorreo(env, { para: admin.email, asunto: 'Prueba de correo de tu tienda', html, texto: 'Tus correos funcionan.' });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
  return json({ ok: true, para: admin.email });
}

/* ---------------- Revisión diaria de vencimientos ---------------- */
async function pedidosPorVencer(env, desde, hasta) {
  const r = await fetch(`${baseFirestore(env)}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await tokenGoogle(env)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'pedidos' }],
      where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'vence' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: desde.toISOString() } } },
        { fieldFilter: { field: { fieldPath: 'vence' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: hasta.toISOString() } } }
      ] } },
      orderBy: [{ field: { fieldPath: 'vence' }, direction: 'ASCENDING' }],
      limit: 200
    } })
  });
  if (!r.ok) throw new Error(`Firestore runQuery ${r.status}: ${await r.text()}`);
  return (await r.json()).filter((f) => f.document).map((f) => Object.assign({ id: f.document.name.split('/').pop() }, desdeCampos(f.document.fields || {})));
}
async function revisarVencimientos(env, ahora = new Date()) {
  const diasAviso = Math.max(1, Math.min(7, parseInt(env.DIAS_RECORDATORIO, 10) || 2));
  const pedidos = await pedidosPorVencer(env, new Date(ahora.getTime() - DIA), new Date(ahora.getTime() + diasAviso * DIA));
  const proximos = [];
  const vencidos = [];
  for (const p of pedidos) {
    if (p.estado !== 'entregado') continue;
    const dias = diasRestantes(p.vence, ahora);
    const linea = { p, dias, vencido: yaVencio(p.vence, ahora), correo: '' };
    if (linea.vencido) { vencidos.push(linea); continue; }
    const yaAvisado = p.recordatorio && new Date(p.recordatorio).getTime() >= new Date(p.vence).getTime() - (diasAviso + 1) * DIA;
    if (yaAvisado) linea.correo = '📧 ya avisado';
    else if (correoActivo(env) && correoValido(p.email)) {
      try { await correoRecordatorio(env, p.id, p, ahora); linea.correo = '📧 aviso enviado'; }
      catch (e) { console.error('Recordatorio', p.codigo, e.message); linea.correo = '⚠️ no se pudo enviar'; }
    } else linea.correo = correoActivo(env) ? 'sin correo' : '';
    proximos.push(linea);
  }
  if (proximos.length || vencidos.length) {
    const fila = ({ p, dias, vencido, correo }) => `• ${p.codigo} · ${p.nombre || p.email}\n   ${(p.items || []).filter((it) => Number(it.dias) > 0).map(nombreItem).join(', ')}\n   ${cuandoVence(dias, vencido)} (${fechaEC(p.vence)})${correo ? ` · ${correo}` : ''}${p.whatsapp ? ` · 📱 ${p.whatsapp}` : ''}`;
    const partes = ['⏰ Revisión de vencimientos'];
    if (proximos.length) partes.push('', `Por vencer (${proximos.length}):`, ...proximos.map(fila));
    if (vencidos.length) partes.push('', `Ya vencieron, sin renovar (${vencidos.length}):`, ...vencidos.map(fila));
    const destino = Object.assign({ chat_id: env.TG_CHAT_ID }, env.TG_PEDIDOS_TEMA ? { message_thread_id: Number(env.TG_PEDIDOS_TEMA) } : {});
    await tg(env, 'sendMessage', Object.assign(destino, { text: recortar(partes.join('\n'), 4000) })).catch((e) => console.error(e));
  }
  return { ok: true, porVencer: proximos.length, vencidos: vencidos.length, avisados: proximos.filter((x) => x.correo === '📧 aviso enviado').length };
}

/* ---------------- Conectar el bot (una sola vez) ---------------- */
async function configurarWebhook(url, env) {
  if (url.searchParams.get('clave') !== env.WEBHOOK_SECRET) return new Response('Clave incorrecta', { status: 403 });
  const direccion = `${url.origin}/telegram`;
  const resultado = await tg(env, 'setWebhook', {
    url: direccion,
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true
  });
  const bot = await tg(env, 'getMe', {});
  return json({ ok: true, mensaje: 'Bot conectado. Ya puedes cerrar esta página.', bot: `@${bot.username}`, webhook: direccion, resultado });
}

/* ---------------- Sesión del cliente (Firebase) ---------------- */
async function verificarUsuario(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token })
  });
  if (!r.ok) return null;
  const d = await r.json().catch(() => ({}));
  const u = d.users && d.users[0];
  return u ? { uid: u.localId, email: u.email || '', nombre: u.displayName || '' } : null;
}

async function tienePedidos(env, uid) {
  const r = await fetch(`${baseFirestore(env)}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await tokenGoogle(env)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'pedidos' }],
        where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } },
        limit: 1
      }
    })
  });
  if (!r.ok) throw new Error(`Firestore runQuery ${r.status}: ${await r.text()}`);
  const filas = await r.json();
  return Array.isArray(filas) && filas.some((f) => f.document);
}

/* ---------------- Firestore (REST con cuenta de servicio) ---------------- */
const baseFirestore = (env) => `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

async function fsGet(env, ruta) {
  const r = await fetch(`${baseFirestore(env)}/${ruta}`, { headers: { Authorization: `Bearer ${await tokenGoogle(env)}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore GET ${ruta} ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return desdeCampos(d.fields || {});
}
async function fsUpdate(env, ruta, datos, debeExistir = false) {
  const mascara = Object.keys(datos).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const r = await fetch(`${baseFirestore(env)}/${ruta}?${mascara}${debeExistir ? '&currentDocument.exists=true' : ''}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${await tokenGoogle(env)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: aCampos(datos) })
  });
  if (!r.ok) throw new Error(`Firestore PATCH ${ruta} ${r.status}: ${await r.text()}`);
}
async function fsSet(env, ruta, datos) {
  const r = await fetch(`${baseFirestore(env)}/${ruta}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${await tokenGoogle(env)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: aCampos(datos) })
  });
  if (!r.ok) throw new Error(`Firestore SET ${ruta} ${r.status}: ${await r.text()}`);
}
async function fsCreate(env, coleccion, datos) {
  const r = await fetch(`${baseFirestore(env)}/${coleccion}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await tokenGoogle(env)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: aCampos(datos) })
  });
  if (!r.ok) throw new Error(`Firestore CREATE ${coleccion} ${r.status}: ${await r.text()}`);
}

function aValor(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(aValor) } };
  if (typeof v === 'object') return { mapValue: { fields: aCampos(v) } };
  return { stringValue: String(v) };
}
function aCampos(obj) {
  const campos = {};
  Object.keys(obj).forEach((k) => { if (obj[k] !== undefined) campos[k] = aValor(obj[k]); });
  return campos;
}
function desdeValor(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return desdeCampos(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(desdeValor);
  return null;
}
function desdeCampos(campos) {
  const obj = {};
  Object.keys(campos).forEach((k) => { obj[k] = desdeValor(campos[k]); });
  return obj;
}

/* ---------------- Acceso de Google (JWT firmado con la cuenta de servicio) ---------------- */
let tokenEnMemoria = null;
async function tokenGoogle(env) {
  if (tokenEnMemoria && tokenEnMemoria.vence > Date.now() + 60000) return tokenEnMemoria.token;
  let cuenta;
  try { cuenta = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT); } catch (e) { throw new Error('GOOGLE_SERVICE_ACCOUNT no es un JSON válido'); }
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = b64urlTexto(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const reclamo = b64urlTexto(JSON.stringify({
    iss: cuenta.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: ahora,
    exp: ahora + 3600
  }));
  const clave = await crypto.subtle.importKey('pkcs8', pemABytes(cuenta.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', clave, new TextEncoder().encode(`${cabecera}.${reclamo}`));
  const jwt = `${cabecera}.${reclamo}.${b64url(new Uint8Array(firma))}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(`Google no dio acceso: ${d.error_description || d.error || r.status}`);
  tokenEnMemoria = { token: d.access_token, vence: Date.now() + (d.expires_in || 3600) * 1000 };
  return tokenEnMemoria.token;
}
function pemABytes(pem) {
  const b64 = String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
function b64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const b64urlTexto = (texto) => b64url(new TextEncoder().encode(texto));

/* ---------------- Telegram ---------------- */
async function tg(env, metodo, datos) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos || {})
  });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) throw new Error(`Telegram ${metodo}: ${d.description || r.status}`);
  return d.result;
}
async function tgFoto(env, destino, blob, caption, botones) {
  const fd = new FormData();
  Object.keys(destino).forEach((k) => fd.append(k, String(destino[k])));
  fd.append('photo', blob, 'comprobante.jpg');
  fd.append('caption', caption);
  fd.append('reply_markup', JSON.stringify(botones));
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`, { method: 'POST', body: fd });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) throw new Error(`Telegram sendPhoto: ${d.description || r.status}`);
  return d.result;
}

/* ---------------- Utilidades ---------------- */
function dataUrlABlob(dataUrl) {
  const coma = dataUrl.indexOf(',');
  const tipo = dataUrl.slice(5, coma).split(';')[0] || 'image/jpeg';
  const bin = atob(dataUrl.slice(coma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}
const idValido = (id) => /^[A-Za-z0-9_-]{6,64}$/.test(String(id || ''));
const dinero = (n) => `$ ${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace('.', ',')}`;
function recortar(texto, maximo) {
  if (texto.length <= maximo) return texto;
  // Conserva el final (estado y 🆔) y recorta la lista de productos.
  const corte = texto.indexOf('\n💳');
  if (corte > 0) {
    const final = texto.slice(corte);
    const inicio = texto.slice(0, Math.max(0, maximo - final.length - 4));
    return `${inicio}\n…${final}`.slice(0, maximo);
  }
  return texto.slice(0, maximo - 1) + '…';
}
