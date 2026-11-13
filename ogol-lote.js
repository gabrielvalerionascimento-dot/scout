/* Scouting — busca em lote no oGol.
   Roda na página do oGol (aberta pelo app com #scout-lote=...), procura cada jogador, escolhe o mais provável
   e volta ao app com os dados para você conferir. Não guarda nada no oGol nem em outro lugar. */
(async () => {
  if (window.__scoutLote) return; window.__scoutLote = true;
  const b64d = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const b64e = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unz = async s => new TextDecoder().decode(await new Response(new Blob([b64d(s)]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  const zip = async t => b64e(new Uint8Array(await new Response(new Blob([t]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()));

  let IN;
  try { IN = JSON.parse(await unz(location.hash.replace(/^#scout-lote=/, ''))); } catch (e) { alert('Não consegui ler a lista enviada pelo app. Abra de novo pelo botão "Puxar todos" no app.'); return; }
  const APP = IN.app, LISTA = IN.j;   // [id, nome, S, W, P, nasc, ano, cat, nac]

  /* ---------- painel de progresso ---------- */
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(10,14,20,.88);color:#fff;font:15px system-ui,sans-serif;display:flex;align-items:center;justify-content:center';
  box.innerHTML = '<div style="background:#161b22;border:1px solid #30363d;border-radius:14px;padding:26px 30px;width:min(460px,90vw)"><div style="font-size:19px;font-weight:600;margin-bottom:6px">Scouting · buscando no oGol</div><div id="sl-txt" style="color:#9da7b3;margin-bottom:14px">Preparando…</div><div style="height:8px;background:#30363d;border-radius:6px;overflow:hidden"><div id="sl-bar" style="height:100%;width:0;background:#2ea043;transition:width .3s"></div></div><div style="color:#9da7b3;font-size:13px;margin-top:14px">Deixe esta aba aberta. No final, o app abre sozinho para você conferir antes de salvar.</div></div>';
  document.body.appendChild(box);
  const txt = box.querySelector('#sl-txt'), bar = box.querySelector('#sl-bar');
  const prog = (msg, f) => { txt.textContent = msg; bar.style.width = Math.round(f * 100) + '%'; };

  /* ---------- utilidades ---------- */
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const limpa = n => n.replace(/["“”].*?["“”]/g, ' ').replace(/\s+-\s+.*$/, '').replace(/\s+/g, ' ').trim();
  const dorme = ms => new Promise(r => setTimeout(r, ms));
  const html = async url => {
    for (let t = 0; t < 3; t++) {
      try { const r = await fetch(url, { credentials: 'include' }); if (r.ok) return new DOMParser().parseFromString(await r.text(), 'text/html'); } catch (e) { }
      await dorme(1500 * (t + 1));
    }
    return null;
  };
  const fila = async (itens, n, fn) => { const q = itens.slice(); await Promise.all(Array.from({ length: n }, async () => { while (q.length) { await fn(q.shift()); await dorme(150); } })); };

  /* ---------- 1. busca ---------- */
  const busca = async nome => {
    const d = await html('/pesquisa?search_txt=' + encodeURIComponent(limpa(nome))); if (!d) return null;
    const vistos = new Set(), out = [];
    for (const a of d.querySelectorAll('a.title[href*="/jogador/"]')) {
      const u = a.getAttribute('href').split('?')[0]; if (vistos.has(u)) continue; vistos.add(u);
      const box = a.closest('.content'); if (!box) continue;
      if ((box.querySelector('.bottom .stat') || {}).textContent?.trim() !== 'Jogador') continue;
      const loc = [...box.querySelectorAll('.details .local')].map(x => x.textContent.trim()).filter(Boolean).join(' / ');
      const m = loc.match(/^(.*?), (\d{4}-\d\d-\d\d)(?: \/ (.*))?$/) || [];
      const p = u.split('/');
      out.push({ id: p[3], slug: p[2], nome: a.textContent.trim().replace(/^\d+/, ''), sub: (box.querySelector('.subtitle') || {}).textContent?.trim() || '',
        pais: m[1] || loc, nasc: m[2] || '', clube: m[3] || '', pos: (box.querySelector('.stamp.position') || {}).title || '' });
      if (out.length >= 12) break;
    }
    return out;
  };

  /* ---------- 2. nota de cada candidato ---------- */
  const VAZIO = new Set('fc club clube de del da do sc ec cd ca sport deportivo atletico esporte futebol futbol sociedade esportiva cf the united city real independiente universidad nacional sporting fk ac'.split(' '));
  const PAISES = new Set(['colombia', 'equador', 'brasil', 'argentina', 'uruguai', 'paraguai', 'chile', 'peru', 'venezuela', 'bolivia', 'mexico', 'eua', 'estados unidos', 'japao', 'coreia do sul', 'espanha', 'franca', 'portugal', 'italia', 'marrocos', 'egito', 'nova zelandia', 'arabia saudita', 'ucrania', 'panama', 'australia', 'cuba', 'nigeria', 'noruega', 'alemanha', 'inglaterra', 'holanda', 'costa rica', 'honduras', 'haiti', 'jamaica', 'canada']);
  const sig = s => new Set(s.split(' ').filter(t => t.length > 2 && !VAZIO.has(t)));
  const clubeIgual = (a, b) => {
    if (!a || !b) return false; if (a === b || a.includes(b) || b.includes(a)) return true;
    const A = sig(a), B = sig(b); return A.size > 0 && B.size > 0 && ([...A].every(x => B.has(x)) || [...B].every(x => A.has(x)));
  };
  const parecido = (x, t) => x === t || (x.length > 3 && t.length > 3 && x.startsWith(t.slice(0, 4)) && Math.abs(x.length - t.length) <= 2);
  const notaNome = (nome, c) => {
    const q = norm(limpa(nome)).split(' ').filter(t => t.length >= 3);
    const toks = norm(c.nome + ' ' + c.sub).split(' ');
    if (!q.length) return 0;
    return q.filter(t => toks.some(x => parecido(x, t))).length / q.length;
  };
  const nota = (L, c) => {
    const [, nome, S, W, P0, nasc, ano, cat, nac] = L;
    const P = new Set(P0); if (nac) P.add(nac); for (const x of S) if (PAISES.has(x)) P.add(x);
    const pais = norm(c.pais), clube = norm((c.clube || '').split(' / ').pop()), ret = /aposentado|falecido/.test(clube);
    const ns = notaNome(nome, c); let s = 2 * ns; const por = [];
    const eua = x => x === pais || (pais === 'estados unidos' && x === 'eua');
    if (S.some(x => clubeIgual(clube, x))) { s += 3; por.push('clube'); }
    else if (W.some(x => clubeIgual(clube, x))) { s += 1; por.push('clube?'); }
    if (pais && [...P].some(eua)) { s += 1.5; por.push('país'); }
    else if (pais && W.some(eua)) s += 0.5;
    else if (P.size && pais && !ret) s -= 1;
    const by = +c.nasc.slice(0, 4) || 0;
    if (nasc) {
      if (c.nasc === nasc) { s += 6; por.push('nascimento'); }
      else if (by && by === +nasc.slice(0, 4)) s += 1;
      else { s -= 6; por.push('nascimento diferente'); }
    } else if (by && ano) {
      const idade = ano - by;
      if (cat) { if (idade <= cat && idade >= cat - 4) { s += 1; por.push('idade'); } else s -= 3; }
      else if (idade < 16 || idade > 40) s -= 3;
    }
    if (ret) s -= 2;
    return { s: Math.round(s * 10) / 10, ns, por };
  };

  /* ---------- 3. ficha completa no oGol ---------- */
  const ficha = async c => {
    const d = await html(`/jogador/${c.slug}/${c.id}`); if (!d) return null;
    let L = {}; d.querySelectorAll('script[type="application/ld+json"]').forEach(s => { try { const o = JSON.parse(s.textContent); if (o['@type'] === 'Person') L = o; } catch (e) { } });
    const R = {}; d.querySelectorAll('.card-data.bio .card-data__row').forEach(r => { const l = r.querySelector('.card-data__label'); if (l) R[l.textContent.trim().toLowerCase()] = [...r.querySelectorAll('.card-data__value')].map(v => v.textContent.replace(/\s+/g, ' ').trim()); });
    const t = (d.querySelector('meta[property="og:title"]') || {}).content || c.nome;
    return { u: `https://www.ogol.com.br/jogador/${c.slug}/${c.id}`, n: t.split(' :: ')[0].trim(), r: R, b: L.birthDate, h: L.height, w: L.weight, nat: L.nationality, f: L.image };
  };

  const res = []; let feitos = 0;
  await fila(LISTA, 4, async L => {
    const cs = (await busca(L[1])) || [];
    const ord = cs.map(c => ({ c, ...nota(L, c) })).filter(x => x.ns >= 0.5).sort((a, b) => b.s - a.s);
    const [b, seg] = ord; let st = 'n', ops = [];
    if (b) {
      const forte = b.por.includes('nascimento') || (b.s >= 5 && (b.por.includes('clube') || b.por.includes('país')) && b.s - (seg ? seg.s : -99) >= 2);
      if (forte) { st = 'a'; ops = [b]; } else if (b.s >= 3) { st = 'd'; ops = ord.slice(0, 3); }
    }
    res.push({ id: L[0], st, ops: ops.map(o => ({ ...o.c, s: o.s, por: o.por })) });
    prog(`Procurando ${++feitos} de ${LISTA.length} jogadores…`, feitos / LISTA.length * 0.6);
  });

  const alvo = res.flatMap(r => r.st === 'a' ? r.ops : r.st === 'd' ? r.ops.slice(0, 2) : []);
  let lidos = 0;
  await fila(alvo, 4, async o => { o.d = await ficha(o); prog(`Lendo ficha ${++lidos} de ${alvo.length} no oGol…`, 0.6 + lidos / alvo.length * 0.4); });

  prog('Pronto! Abrindo o app…', 1);
  window.__scoutLoteRes = res;
  const pac = await zip(JSON.stringify({ v: 1, quando: new Date().toISOString(), r: res }));
  if (!IN.ficar) location.href = APP + '#/ogol-lote/' + pac;
  else txt.textContent = `Pronto (${res.filter(r => r.st === 'a').length} certos, ${res.filter(r => r.st === 'd').length} em dúvida).`;
})();
