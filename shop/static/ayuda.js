/* =============================================================
   Refills EC — Preguntas frecuentes y Términos y garantía
   Los textos se editan desde el panel (Tienda → Preguntas y garantía).
   ============================================================= */
document.addEventListener('DOMContentLoaded', () => window.RF.listo.then(async () => {
  'use strict';
  const RF = window.RF;
  const { $, $$, esc, fechaCorta } = RF.util;
  let datos = window.REFILLS_AYUDA || { preguntas: [], terminos: [] };
  let actualizado = null;

  try {
    if (RF.sesion.lista && RF.sesion.db) {
      const snap = await RF.sesion.db.collection('tienda').doc('paginas').get();
      if (snap.exists) {
        const d = snap.data();
        if (Array.isArray(d.preguntas) && Array.isArray(d.terminos)) datos = d;
        actualizado = d.actualizado || null;
      }
    }
  } catch (e) { /* sin conexión: quedan los textos iniciales */ }

  // Los textos admiten saltos de línea; todo se muestra como texto (sin HTML).
  const parrafos = (t) => String(t || '').split(/\n{2,}/).map((x) => `<p>${esc(x).replace(/\n/g, '<br>')}</p>`).join('');

  $('#rf-faq').innerHTML = (datos.preguntas || []).map((q, i) => `
    <details class="rf-faq-item"${i === 0 ? ' open' : ''}>
      <summary><span>${esc(q.p)}</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary>
      <div class="rf-faq-resp">${parrafos(q.r)}</div>
    </details>`).join('') || '<p class="rf-ayuda">Pronto agregaremos las preguntas frecuentes.</p>';

  $('#rf-terminos').innerHTML = (datos.terminos || []).map((s, i) => `
    <article class="rf-termino">
      <h3><span>${i + 1}</span>${esc(s.t)}</h3>
      ${parrafos(s.x)}
    </article>`).join('') || '<p class="rf-ayuda">Pronto publicaremos nuestros términos.</p>';

  if (actualizado) {
    $('#rf-actualizado').textContent = `Última actualización: ${fechaCorta(actualizado)}`;
    $('#rf-actualizado').hidden = false;
  }
  $('#rf-ayuda-wa').href = RF.util.whatsappUrl('Hola, tengo una consulta sobre Refills EC.');

  // Pestañas que siguen al desplazamiento
  const tabs = $$('.rf-ayuda-tabs .rf-tab');
  const marcar = (id) => tabs.forEach((t) => t.classList.toggle('activo', t.dataset.seccion === id));
  tabs.forEach((t) => t.addEventListener('click', (e) => {
    e.preventDefault();
    const sec = $(`#${t.dataset.seccion}`);
    sec.scrollIntoView({ behavior: RF.util.movimientoReducido ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${t.dataset.seccion}`);
    marcar(t.dataset.seccion);
  }));
  if (location.hash === '#garantia') { marcar('garantia'); setTimeout(() => $('#garantia').scrollIntoView({ block: 'start' }), 50); }
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) marcar(en.target.id); }), { rootMargin: '-40% 0px -55% 0px' });
    ['preguntas', 'garantia'].forEach((id) => obs.observe($(`#${id}`)));
  }
}));
