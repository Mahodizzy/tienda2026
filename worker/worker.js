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
      if (url.pathname === '/') return new Response('Puente de Refills EC activo ✅', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      return cors(json({ error: 'Ruta no encontrada' }, 404));
    } catch (e) {
      console.error(e && e.stack ? e.stack : e);
      return cors(json({ error: 'Error interno del puente' }, 500));
    }
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
    return { inline_keyboard: [[{ text: '✏️ Corregir entrega', callback_data: `ent:${id}` }]] };
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
  const responder = (texto) => tg(env, 'answerCallbackQuery', Object.assign({ callback_query_id: cb.id }, texto ? { text: texto } : {})).catch(() => {});
  if (!msg || String(msg.chat.id) !== String(env.TG_CHAT_ID)) return responder('Este chat no está autorizado.');

  const [accion, id] = String(cb.data || '').split(':');
  if (!idValido(id)) return responder();
  const pedido = await fsGet(env, `pedidos/${id}`);
  if (!pedido) return responder('No encontré ese pedido.');

  const cambios = { ok: 'aprobado', no: 'rechazado', rev: 'en_revision' };
  if (accion in cambios) {
    const estado = cambios[accion];
    await fsUpdate(env, `pedidos/${id}`, { estado, actualizado: new Date() }, true);
    pedido.estado = estado;
    await editarAviso(env, msg.chat.id, msg.message_id, !!msg.photo, pedido, id);
    return responder(`${pedido.codigo}: ${ETIQUETAS[estado]}`);
  }
  if (accion === 'ent') {
    await tg(env, 'sendMessage', Object.assign({ chat_id: msg.chat.id }, hilo(msg), {
      text: `📦 Entrega del pedido ${pedido.codigo}\nResponde a ESTE mensaje con los datos para el cliente (correo, clave, perfil, PIN o código). Puedes usar varias líneas.\n[pedido:${id}]`,
      reply_markup: { force_reply: true, input_field_placeholder: 'Datos de entrega' }
    }));
    return responder('Escribe los datos respondiendo al mensaje.');
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

  const entrega = respondido.match(/\[pedido:([A-Za-z0-9_-]+)\]/);
  if (entrega) { await guardarEntrega(env, entrega[1], texto, msg); return; }

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
}

async function guardarEntrega(env, id, texto, msg) {
  if (!idValido(id)) return;
  const pedido = await fsGet(env, `pedidos/${id}`);
  if (!pedido) {
    await tg(env, 'sendMessage', Object.assign({ chat_id: msg.chat.id }, hilo(msg), { text: 'No encontré ese pedido.' }));
    return;
  }
  const ahora = new Date();
  const cambios = { entrega: texto.slice(0, 3000), estado: 'entregado', actualizado: ahora };
  if (!pedido.entregadoEn) cambios.entregadoEn = ahora; // corregir no reinicia los días
  await fsUpdate(env, `pedidos/${id}`, cambios, true);
  pedido.estado = 'entregado';
  await editarAviso(env, pedido.tgChat, pedido.tgMensaje, pedido.tgEsFoto, pedido, id).catch((e) => console.error(e));
  await tg(env, 'sendMessage', Object.assign({ chat_id: msg.chat.id }, hilo(msg), {
    text: `✅ ${pedido.codigo} entregado. El cliente ya ve sus datos en la página de su pedido.`,
    reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true }
  }));
}

function hilo(msg) {
  return msg && msg.is_topic_message && msg.message_thread_id ? { message_thread_id: msg.message_thread_id } : {};
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
