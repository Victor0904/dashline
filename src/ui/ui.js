// Écrans DOM (DESIGN §10) : titre, Atelier, contrats + Trait du jour, défis, records, codex, réglages, pause, fin.
import { ZONES, ZONE_IDS, SILHOUETTES, SIL_IDS, C } from '../core/data.js';
import { CARDS, CARD_IDS, EVOLUTIONS, EVO_IDS, EVO_OF } from '../core/cards.js';
import { ATELIER, ATELIER_IDS, BRANCHES, cost, maxLevel, canBuy, buy, silCondition, silConditionText, silCost, canBuySil, buySil, anyAffordable, nextGoal } from '../meta/economy.js';
import { DEFIS, contractText, contractReward, claimContract, claimableCount, rerollContract, dailyConfig } from '../meta/challenges.js';
import { recordsFor } from '../meta/progression.js';
import { cardIcon } from '../render/sprites.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const TES = '<span class="tes">◇</span>';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => { n = Math.round(n); let o = ''; while (n >= 1000) { const g = n % 1000; o = ' ' + (g < 10 ? '00' : g < 100 ? '0' : '') + g + o; n = Math.floor(n / 1000); } return n + o; };
const sec = t => (t === null || t === undefined) ? '—' : t.toFixed(1).replace('.', ',') + ' s';
const RCOL = { C: C.rarC, R: C.rarR, E: C.rarE };
const ic = (id, size = 28, col = '') => `<canvas class="ic" data-ic="${id}" data-c="${col}" style="width:${size}px;height:${size}px"></canvas>`;

export class UI {
  constructor(app) {
    this.app = app; this.root = document.getElementById('ui'); this.toastEl = document.getElementById('toast');
    this.current = null; this.params = {}; this.tab = 'SIL'; this.recZone = 0; this.recT = 0; this.codexSel = null; this.confirm = null; this.end = null;
    this.root.addEventListener('click', e => this.onClick(e));
    this.root.addEventListener('input', e => this.onInput(e));
    this.root.addEventListener('pointerdown', () => app.audio.unlock(), { passive: true });
  }
  get save() { return this.app.save; }
  go(name, params = {}) {
    if (this.end && this.end.timer) { clearInterval(this.end.timer); }
    if (name !== 'end') this.end = null;
    this.current = name; this.params = params; this.confirm = null; this.render();
  }
  hide() { this.current = null; this.root.innerHTML = ''; this.root.className = ''; }
  refresh() { if (this.current) this.render(true); }
  render(keep) {
    const sc = this.root.querySelector('.scroll'), st = keep && sc ? sc.scrollTop : 0;
    const html = this['s_' + this.current](this.params);
    this.root.className = 'on' + (this.current === 'pause' || this.current === 'end' ? ' overlay' : this.current === 'title' ? ' menu' : ' solid');
    this.root.innerHTML = `<div class="screen screen-${this.current}${keep ? '' : ' enter'}">${html}</div>`;
    if (keep) { const s2 = this.root.querySelector('.scroll'); if (s2) s2.scrollTop = st; }
    this.paintIcons();
    if (this.current === 'end' && !keep) this.startEnd();
  }
  paintIcons() {
    for (const cv of this.root.querySelectorAll('canvas.ic')) {
      const dpr = Math.min(2, window.devicePixelRatio || 1), w = parseFloat(cv.style.width);
      cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr);
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const id = cv.dataset.ic, col = cv.dataset.c || getComputedStyle(document.documentElement).getPropertyValue('--c-volt').trim() || C.volt;
      cardIcon(g, id, w / 2, w / 2, w * 0.8, col);
    }
  }
  toast(msg, ms = 2200) { const el = this.toastEl; el.innerHTML = msg; el.className = 'show'; clearTimeout(this.tt); this.tt = setTimeout(() => { el.className = ''; }, ms); }
  topbar(title) { return `<div class="topbar"><button class="icon-btn" data-act="back" aria-label="Retour">‹</button><h2>${title}</h2><span class="pill">${TES} <b class="num">${fmt(this.save.tessons)}</b></span></div>`; }

  // ------------------------------------------------------------------ TITRE (§10.1)
  s_title() {
    const s = this.save, zi = ZONE_IDS.indexOf(s.selected.zone), Z = ZONES[zi], zs = s.zones[s.selected.zone];
    const sil = SILHOUETTES[s.silhouettes.selected];
    const shop = s.flags.tutorialDone && anyAffordable(s), cl = claimableCount(s);
    const dailyOk = s.stats.runs >= 1;
    const tMax = zs.tensionMax;
    return `
      <div class="topbar top3"><span class="pill">${TES} <b class="num">${fmt(s.tessons)}</b></span><span></span>
        <div class="tb-right"><button class="icon-btn" data-act="go" data-v="settings" aria-label="Réglages">⚙</button><button class="icon-btn" data-act="go" data-v="defis" aria-label="Défis">★</button></div></div>
      <div class="title-block"><h1 class="logo">DASH<span>/</span>LINE</h1><div class="tagline">« Tu ne marches pas. Tu tranches. »</div></div>
      <div class="spacer"></div>
      <div class="bottom-zone">
        <div class="sel"><button class="arrow" data-act="zone" data-v="-1" aria-label="Zone précédente">◀</button>
          <div class="sel-mid"><b>${Z.name.toUpperCase()}</b><small>${zs.cleared ? 'nettoyée' : 'Boss : ' + Z.bossName}</small></div>
          <button class="arrow" data-act="zone" data-v="1" aria-label="Zone suivante">▶</button></div>
        ${tMax > 0 ? `<div class="sel small"><button class="arrow" data-act="tension" data-v="-1" aria-label="Moins de Tension">−</button><div class="sel-mid"><b>TENSION ${s.selected.tension}</b><small>Tessons ×${(1 + 0.2 * s.selected.tension).toFixed(1).replace('.', ',')}</small></div><button class="arrow" data-act="tension" data-v="1" aria-label="Plus de Tension">+</button></div>` : ''}
        <div class="sel small"><button class="arrow" data-act="sil" data-v="-1" aria-label="Silhouette précédente">◀</button><div class="sel-mid"><b>SILHOUETTE : ${sil.name.toUpperCase()}</b><small>Lmax ${sil.Lmax} · ${sil.hp} PV · fenêtre ${sil.window.toFixed(2).replace('.', ',')} s</small></div><button class="arrow" data-act="sil" data-v="1" aria-label="Silhouette suivante">▶</button></div>
        <button class="btn btn--primary" data-act="play">JOUER</button>
        <div class="grid3">
          <button class="btn" data-act="go" data-v="atelier">ATELIER${shop ? '<span class="badge">!</span>' : ''}</button>
          <button class="btn" data-act="go" data-v="contrats">CONTRATS${cl ? `<span class="badge">${cl}</span>` : ''}</button>
          <button class="btn" data-act="go" data-v="contrats" ${dailyOk ? '' : 'disabled'}>DU JOUR</button>
        </div>
        <div class="links"><button class="link" data-act="go" data-v="records">RECORDS</button><span>·</span><button class="link" data-act="go" data-v="codex">CODEX</button></div>
      </div>`;
  }
  // ------------------------------------------------------------------ ATELIER (§10.6)
  s_atelier() {
    const s = this.save, t = this.tab;
    const tabs = ['SIL', ...BRANCHES].map(b => `<button class="tab ${t === b ? 'on' : ''}" data-act="tab" data-v="${b}">${b === 'SIL' ? 'SILHOUETTES' : b}</button>`).join('');
    let body = '';
    if (t === 'SIL') {
      body = SIL_IDS.map(id => {
        const S = SILHOUETTES[id], own = s.silhouettes.owned.includes(id), sel = s.silhouettes.selected === id, cond = silCondition(s, id);
        const bar = (v, max) => `<span class="bar"><i style="width:${Math.round(100 * v / max)}%"></i></span>`;
        return `<div class="card sil ${sel ? 'sel' : ''}"><div class="row"><h3>${S.name.toUpperCase()}</h3>${own ? (sel ? '<span class="ok">CHOISIE</span>' : `<button class="btn btn--small" data-act="pickSil" data-v="${id}">CHOISIR</button>`) :
          cond ? `<button class="btn btn--small ${canBuySil(s, id) ? 'price-ok' : 'price-ko'}" data-act="buySil" data-v="${id}">${fmt(silCost(id))} ${TES}</button>` : `<span class="lock">🔒 ${silConditionText(id)}</span>`}</div>
          <div class="stats"><span>Portée</span>${bar(S.Lmax, 185)}<span>Vitesse</span>${bar(S.speed, 1900)}<span>Coupe</span>${bar(S.rCut, 20)}<span>PV</span>${bar(S.hp, 4)}<span>Fenêtre</span>${bar(S.window, 0.55)}</div>
          <p class="desc">${id === 'masse' ? 'Onde innée à chaque arrivée ; parade sans étourdissement.' : id === 'ombre' ? 'Traîne d’invulnérabilité 0,10 s, ancrage 0,05 s, 4 Élan.' : 'L’équilibre : 150 u, 3 PV, 0,50 s.'}</p></div>`;
      }).join('');
    } else {
      body = ATELIER_IDS.filter(id => ATELIER[id].branch === t).map(id => {
        const A = ATELIER[id], l = s.atelier[id] || 0, mx = maxLevel(id), c = cost(id, l);
        const pips = Array.from({ length: mx }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('');
        return `<div class="card up"><div class="up-main"><h3>${A.name}</h3><p class="desc">${l ? A.fx(l) : '—'}${l < mx ? ` → <b class="v">${A.fx(l + 1)}</b>` : ''}</p><div class="pips">${pips}</div></div>
          ${c === null ? '<span class="ok">MAX</span>' : `<button class="btn btn--small ${canBuy(s, id) ? 'price-ok' : 'price-ko'}" data-act="buy" data-v="${id}" aria-label="Acheter ${A.name}">${fmt(c)} ${TES}</button>`}</div>`;
      }).join('');
    }
    return `${this.topbar('ATELIER')}<div class="tabs" role="tablist">${tabs}</div><div class="scroll">${body}</div>
      <div class="sticky"><button class="btn btn--primary" data-act="play">JOUER</button></div>`;
  }
  // ------------------------------------------------------------------ CONTRATS + TRAIT DU JOUR
  s_contrats() {
    const s = this.save, d = s.daily, cfg = dailyConfig(s), rec = s.records.daily.find(x => x.date === cfg.date);
    const cards = d.contracts.map((c, i) => {
      const done = c.progress >= c.target, pct = Math.round(100 * c.progress / c.target);
      return `<div class="card"><div class="row"><h3>${esc(contractText(c))}</h3><span class="tes-v">+${contractReward(s, c)} ${TES}</span></div>
        <div class="prog"><i style="width:${pct}%"></i></div><div class="row"><small class="num">${fmt(c.progress)} / ${fmt(c.target)}</small>
        ${c.claimed ? '<span class="ok">RÉCLAMÉ</span>' : done ? `<button class="btn btn--small btn--claim" data-act="claim" data-v="${i}">RÉCLAMER</button>` : (!d.rerolled ? `<button class="btn btn--small" data-act="reroll" data-v="${i}">↻ RELANCER</button>` : '')}</div></div>`;
    }).join('');
    const dailyOk = s.stats.runs >= 1;
    return `${this.topbar('CONTRATS')}<div class="scroll">
      <p class="hint">3 contrats par jour · les 3 réclamés : +100 ${TES}${d.bonusClaimed ? ' (obtenu)' : ''}</p>${cards}
      <h3 class="section">TRAIT DU JOUR</h3>
      <div class="card daily"><div class="row"><h3>${ZONES[cfg.zone].name.toUpperCase()}</h3><span class="tag">${esc(cfg.modText)}</span></div>
        <p class="desc">Graine du jour : même partie pour tous. Toutes les tentatives comptent ; la première du jour rapporte +150 ${TES}${d.dailyRunDone ? ' (déjà jouée)' : ''}.</p>
        <div class="row"><small>Record du jour : <b class="num">${rec ? fmt(rec.score) : '—'}</b></small>
        <button class="btn btn--small price-ok" data-act="daily" ${dailyOk ? '' : 'disabled'}>${dailyOk ? 'JOUER' : 'DÈS LA 2e PARTIE'}</button></div></div>
      </div>`;
  }
  s_defis() {
    const s = this.save;
    const rows = DEFIS.map(d => {
      const done = s.challenges.done.includes(d.id);
      const prog = !done && d.target ? `<div class="prog"><i style="width:${Math.min(100, Math.round(100 * d.prog(s) / d.target))}%"></i></div>` : '';
      const un = (d.unlock || []).map(c => CARDS[c].name).concat(d.sil ? ['Silhouette ' + (d.sil === 'ombre' ? 'Ombre' : 'Masse')] : []);
      return `<div class="card defi ${done ? 'done' : ''}"><div class="row"><span class="dot ${done ? 'on' : ''}"></span><h3>${esc(d.text)}</h3><span class="tes-v">${d.reward} ${TES}</span></div>${prog}${un.length ? `<small class="unl">Débloque : ${un.join(', ')}</small>` : ''}</div>`;
    }).join('');
    return `${this.topbar('DÉFIS')}<p class="hint">${s.challenges.done.length} / ${DEFIS.length} accomplis</p><div class="scroll">${rows}</div>`;
  }
  s_records() {
    const s = this.save, z = this.recZone, t = this.recT, r = recordsFor(s, z, t), g = s.records.global;
    const ztabs = ZONES.map((Z, i) => `<button class="tab small ${z === i ? 'on' : ''}" data-act="recZ" data-v="${i}">${Z.name.toUpperCase()}</button>`).join('');
    const ttabs = [0, 1, 2, 3, 4, 5].filter(i => i === 0 || i <= s.zones[ZONE_IDS[z]].tensionMax).map(i => `<button class="tab small ${t === i ? 'on' : ''}" data-act="recT" data-v="${i}">T${i}</button>`).join('');
    const top = r.top.length ? r.top.map((e, i) => `<div class="rec"><b>${i + 1}</b><span class="num">${fmt(e.score)}</span><small>Chaîne ${e.chain} · ${SILHOUETTES[e.sil] ? SILHOUETTES[e.sil].name : ''} · ${e.date}</small></div>`).join('') : '<p class="hint">Aucune partie ici pour l’instant.</p>';
    const daily = s.records.daily.map(d => `<div class="rec"><b>${d.date.slice(5)}</b><span class="num">${fmt(d.score)}</span></div>`).join('') || '<p class="hint">—</p>';
    return `${this.topbar('RECORDS')}<div class="tabs scroll-x">${ztabs}</div><div class="tabs">${ttabs}</div><div class="scroll">
      <div class="card">${top}</div>
      <div class="card kv"><span>Meilleure Chaîne</span><b>${r.bestChain}</b><span>Meilleur nettoyage</span><b>${sec(r.bestClear)}</b><span>Meilleur boss</span><b>${sec(r.bestBoss)}</b><span>Sans faute</span><b>${r.noHit ? 'oui' : 'non'}</b></div>
      <h3 class="section">GLOBAL</h3>
      <div class="card kv"><span>Plus longue Chaîne</span><b>${g.bestChain}</b><span>Kills en un dash</span><b>${g.bestMulti}</b><span>Kills totaux</span><b>${fmt(s.stats.kills)}</b><span>Parties</span><b>${s.stats.runs}</b><span>Temps de jeu</span><b>${Math.round(s.stats.playTimeS / 60)} min</b><span>Balles coupées</span><b>${fmt(g.bulletsCut || 0)}</b></div>
      <h3 class="section">TRAIT DU JOUR (7 JOURS)</h3><div class="card">${daily}</div></div>`;
  }
  s_codex() {
    const s = this.save;
    const cell = (id, known, col, label) => `<button class="cx ${known ? '' : 'unk'}" data-act="cx" data-v="${id}" style="border-color:${known ? col : 'var(--c-line-strong)'}">${known ? ic(id, 30, col) : '<b>?</b>'}<small>${known ? label : '?'}</small></button>`;
    const cards = CARD_IDS.map(id => cell(id, s.cards.unlocked.includes(id), RCOL[CARDS[id].rar], CARDS[id].name)).join('');
    const evos = EVO_IDS.map(e => cell('evo:' + e, s.cards.evolutionsSeen.includes(e), C.gold, EVOLUTIONS[e].name)).join('');
    let det = '';
    const sel = this.codexSel;
    if (sel) {
      if (sel.startsWith('evo:')) { const E = EVOLUTIONS[sel.slice(4)], k = s.cards.evolutionsSeen.includes(sel.slice(4)); det = `<div class="card"><h3>${k ? E.name : '?'}</h3><p class="desc">${k ? E.desc : 'Inconnue'} — ${CARDS[E.a].name} (V) + ${CARDS[E.b].name} (≥ III)</p></div>`; }
      else { const D = CARDS[sel], k = s.cards.unlocked.includes(sel); det = `<div class="card"><h3>${D.name} <small>${D.type === 'cap' ? 'Capacité' : 'Atout'}</small></h3>${k ? D.desc.map((x, i) => `<p class="desc"><b>${ROMAN[i + 1]}</b> ${esc(x)}</p>`).join('') + (D.max > D.desc.length && D.desc.length === 1 ? `<p class="desc">(× niveau, jusqu’à ${ROMAN[D.max]})</p>` : '') : '<p class="desc">Se débloque par un défi.</p>'}</div>`; }
    }
    return `${this.topbar('CODEX')}<div class="scroll">${det}<div class="cxgrid">${cards}</div><h3 class="section">ÉVOLUTIONS</h3><div class="cxgrid">${evos}</div></div>`;
  }
  s_settings() {
    const st = this.save.settings, c = this.confirm;
    const opt = (k, vals, labels) => `<div class="seg">${vals.map((v, i) => `<button class="${st[k] === v ? 'on' : ''}" data-act="set" data-k="${k}" data-v="${v}">${labels[i]}</button>`).join('')}</div>`;
    const yn = k => opt(k, [true, false], ['OUI', 'NON']);
    return `${this.topbar('RÉGLAGES')}<div class="scroll set">
      <label>Son<input type="range" min="0" max="1" step="0.05" value="${st.sfx}" data-k="sfx" aria-label="Volume des effets"></label>
      <label>Musique<input type="range" min="0" max="1" step="0.05" value="${st.music}" data-k="music" aria-label="Volume de la musique"></label>
      <div class="srow"><span>Vibration</span>${yn('vibration')}</div>
      <div class="srow"><span>Mouvements réduits</span>${opt('reducedMotion', ['system', 'yes', 'no'], ['SYSTÈME', 'OUI', 'NON'])}</div>
      <div class="srow"><span>Fréquence d’image</span>${opt('fps', ['auto', '60'], ['AUTO', '60 FPS'])}</div>
      <div class="srow"><span>Amplitude du tracé</span>${opt('gain', [2.0, 2.5, 3.2], ['2,0', '2,5', '3,2'])}</div>
      <div class="srow"><span>Tap = dash</span>${yn('tapDash')}</div>
      <div class="srow"><span>Visée assistée</span>${opt('aimAssist', ['strong', 'normal', 'off'], ['FORTE', 'NORMALE', 'OFF'])}</div>
      <div class="srow"><span>Contraste daltonien</span>${yn('colorblind')}</div>
      <div class="srow"><span>Afficher FPS</span>${yn('showFps')}</div>
      <button class="btn btn--ghost" data-act="reset">${c === 'reset2' ? 'CONFIRMER : TOUT EFFACER' : c === 'reset1' ? 'VRAIMENT ? (2e confirmation)' : 'RÉINITIALISER LA PROGRESSION'}</button>
      <p class="hint">DASHLINE · 100 % hors ligne · v1.0.0</p></div>`;
  }
  // ------------------------------------------------------------------ PAUSE (§10.3)
  s_pause() {
    const sim = this.app.sim, s = this.save;
    const build = sim ? sim.cardOrder.map(id => { const evo = sim.hasEvo(EVO_OF[id] || '__') ? EVO_OF[id] : null; return `<button class="bi" data-act="bi" data-v="${evo ? 'evo:' + evo : id}" style="border-color:${evo ? C.gold : RCOL[CARDS[id].rar]}">${ic(evo ? 'evo:' + evo : id, 24, evo ? C.gold : '')}<small>${evo ? '★' : ROMAN[sim.lv[id]]}</small></button>`; }).join('') : '';
    const desc = this.params.bi ? `<p class="desc center">${esc(this.params.bi.startsWith('evo:') ? EVOLUTIONS[this.params.bi.slice(4)].name + ' — ' + EVOLUTIONS[this.params.bi.slice(4)].desc : CARDS[this.params.bi].name + ' ' + ROMAN[sim.lv[this.params.bi]] + ' — ' + CARDS[this.params.bi].desc[Math.min(CARDS[this.params.bi].desc.length - 1, sim.lv[this.params.bi] - 1)])}</p>` : '';
    const ct = s.daily.contracts.map(c => `<div class="mini"><span>${esc(contractText(c))}</span><div class="prog"><i style="width:${Math.round(100 * c.progress / c.target)}%"></i></div></div>`).join('');
    const quit = this.confirm === 'quit';
    return `<div class="pause-box"><h1 class="ptitle">PAUSE</h1>
      ${build ? `<div class="build">${build}</div>${desc}` : '<p class="hint">Aucune carte pour l’instant</p>'}
      <div class="contracts">${ct}</div>
      <button class="btn btn--primary" data-act="resume">REPRENDRE</button>
      <div class="grid2"><button class="btn" data-act="go" data-v="settings">RÉGLAGES</button>
      <button class="btn" data-act="quit">${quit ? 'CONFIRMER' : 'ABANDONNER'}</button></div>
      ${quit ? '<p class="hint">Tu gardes tes Tessons.</p>' : ''}</div>`;
  }
  // ------------------------------------------------------------------ FIN DE PARTIE (§12)
  s_end(p) {
    const r = p.result, sm = p.summary, s = this.save, T = sm.tessons;
    const head = r.victory ? '<h1 class="etitle win">ZONE NETTOYÉE</h1>' : '<h1 class="etitle">TRANCHÉ</h1>';
    const where = r.arenaReached >= 7 ? `Boss : ${r.bossEntailles}/${r.bossTotal} entailles` : `Arène ${r.arenaReached}/6`;
    const lines = [];
    lines.push(`<div class="eline big"><span>SCORE</span><b class="num" data-n="${r.score}">0</b></div>`);
    if (sm.newRecord) lines.push('<div class="eline gold"><span>NOUVEAU RECORD</span><b>★</b></div>');
    lines.push(`<div class="eline"><span>Chaîne max</span><b class="num" data-n="${r.bestChain}">0</b></div>`);
    lines.push(`<div class="eline"><span>Meilleur multi</span><b class="num" data-n="${r.bestMulti}">0</b></div>`);
    lines.push(`<div class="eline"><span>Kills · niveau</span><b class="num">${r.kills} · ${r.level}</b></div>`);
    if (r.cards.length) lines.push(`<div class="eline build">${r.cards.map(c => `<span class="bi" style="border-color:${c.evo ? C.gold : RCOL[CARDS[c.id].rar]}">${ic(c.evo ? 'evo:' + c.evo : c.id, 22, c.evo ? C.gold : '')}<small>${c.evo ? '★' : ROMAN[c.lv]}</small></span>`).join('')}</div>`);
    for (const l of T.lines) lines.push(`<div class="eline t"><span>${esc(l.label)}</span><b class="num">${fmt(l.v)}</b></div>`);
    if (T.mult > 1.0001) lines.push(`<div class="eline t"><span>Multiplicateurs</span><b class="num">×${T.mult.toFixed(2).replace('.', ',')}</b></div>`);
    if (T.welcome) lines.push(`<div class="eline t"><span>Prime de bienvenue</span><b class="num">+${T.welcome}</b></div>`);
    if (sm.dailyBonus) lines.push(`<div class="eline t"><span>1re partie du jour</span><b class="num">+${sm.dailyBonus}</b></div>`);
    lines.push(`<div class="eline total"><span>TOTAL</span><b class="num">${TES} <span data-n="${T.grand + sm.dailyBonus}">0</span></b></div>`);
    for (const id of sm.defis) { const d = DEFIS.find(x => x.id === id); lines.push(`<div class="eline gold"><span>Défi : ${esc(d.text)}</span><b>+${d.reward}</b></div>`); }
    for (const u of sm.unlocks) lines.push(`<div class="eline gold"><span>Débloqué : ${u.kind === 'zone' ? 'zone ' : u.kind === 'card' ? 'carte ' : 'silhouette '}${esc(u.name)}</span><b>◆</b></div>`);
    for (const c of sm.contracts || []) { const ct = s.daily.contracts.find(x => x.id === c.id); if (ct) lines.push(`<div class="eline"><span>${esc(contractText(ct))}</span><div class="prog"><i style="width:${Math.round(100 * c.after / c.target)}%"></i></div></div>`); }
    const g = nextGoal(s);
    if (g) lines.push(`<div class="eline goal"><span>${g.affordable ? `${g.name} ${ROMAN[g.level] || g.level} achetable !` : `encore ${fmt(g.missing)} ◇ pour ${g.name} ${ROMAN[g.level] || g.level}`}</span><div class="prog"><i style="width:${Math.min(100, Math.round(100 * s.tessons / g.cost))}%"></i></div></div>`);
    return `<div class="end-scroll scroll"><div class="ehead">${head}<p class="where">${where}</p></div>${lines.map((l, i) => l.replace('class="eline', `data-i="${i}" class="eline hid`)).join('')}</div>
      <div class="end-btns"><div class="grid2"><button class="btn" data-act="go" data-v="atelier">ATELIER${anyAffordable(s) ? '<span class="badge">!</span>' : ''}</button><button class="btn" data-act="zones">ZONES</button></div>
      <button class="btn btn--primary" data-act="replay">REJOUER</button></div>`;
  }
  startEnd() {
    const els = [...this.root.querySelectorAll('.eline')];
    let i = 0, t = 0;
    const show = el => { el.classList.remove('hid'); for (const n of el.querySelectorAll('[data-n]')) n.dataset.from = '0'; };
    const st = this.end = { els, done: false };
    st.all = () => { for (const el of els) { el.classList.remove('hid'); for (const n of el.querySelectorAll('[data-n]')) n.textContent = fmt(+n.dataset.n); } st.done = true; clearInterval(st.timer); };
    st.timer = setInterval(() => {
      t += 40;
      if (i < els.length) {
        const el = els[i]; if (el.classList.contains('hid')) show(el);
        const k = Math.min(1, t / 400);
        for (const n of el.querySelectorAll('[data-n]')) n.textContent = fmt(+n.dataset.n * k);
        this.app.audio.play('count');
        if (k >= 1) { i++; t = 0; }
      } else { st.done = true; clearInterval(st.timer); }
    }, 40);
  }

  // ------------------------------------------------------------------ actions
  onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) { if (this.current === 'end' && this.end && !this.end.done) this.end.all(); return; }
    const act = b.dataset.act, v = b.dataset.v, s = this.save, app = this.app;
    app.audio.play('ui');
    switch (act) {
      case 'back': if (this.params.from === 'pause') this.go('pause'); else if (this.params.from === 'end') this.go('end', this.app.lastEnd); else this.go('title'); break;
      case 'go': this.go(v, { from: this.current === 'pause' ? 'pause' : this.current === 'end' ? 'end' : null }); break;
      case 'play': app.playSelected(); break;
      case 'daily': app.playDaily(); break;
      case 'zone': { const i = ZONE_IDS.indexOf(s.selected.zone); let j = i; for (let k = 0; k < 4; k++) { j = (j + +v + 4) % 4; if (s.zones[ZONE_IDS[j]].unlocked) break; } if (!s.zones[ZONE_IDS[j]].unlocked) { this.toast('Zone verrouillée'); break; } s.selected.zone = ZONE_IDS[j]; s.selected.tension = Math.min(s.selected.tension, s.zones[ZONE_IDS[j]].tensionMax); app.persistSoon(); app.onZone(); this.render(true); if (ZONE_IDS.some(z => !s.zones[z].unlocked) && j === i) this.toast(`Prochaine zone : battre ${ZONES[ZONE_IDS.findIndex(z => !s.zones[z].unlocked) - 1].bossName}`); break; }
      case 'tension': { const mx = s.zones[s.selected.zone].tensionMax; s.selected.tension = Math.max(0, Math.min(mx, s.selected.tension + +v)); app.persistSoon(); this.render(true); break; }
      case 'sil': { const o = s.silhouettes.owned, i = o.indexOf(s.silhouettes.selected); if (o.length < 2) { this.toast('Débloque Masse et Ombre à l’Atelier'); break; } s.silhouettes.selected = o[(i + +v + o.length) % o.length]; app.persistSoon(); this.render(true); break; }
      case 'tab': this.tab = v; this.render(); break;
      case 'buy': if (buy(s, v)) { app.audio.play('buy'); app.haptics.vibrate(15); app.persist(); b.classList.add('split'); setTimeout(() => this.render(true), 140); } else this.toast('Pas assez de Tessons'); break;
      case 'buySil': if (buySil(s, v)) { app.audio.play('buy'); app.haptics.vibrate(15); s.silhouettes.selected = v; app.persist(); this.render(true); } else this.toast('Pas assez de Tessons'); break;
      case 'pickSil': s.silhouettes.selected = v; app.persist(); this.render(true); break;
      case 'claim': { const g = claimContract(s, +v); if (g) { app.audio.play('buy'); app.haptics.vibrate(15); this.toast(`+${g} ${TES}`); app.persist(); this.render(true); } break; }
      case 'reroll': if (rerollContract(s, +v)) { app.persist(); this.render(true); } break;
      case 'recZ': this.recZone = +v; this.recT = 0; this.render(true); break;
      case 'recT': this.recT = +v; this.render(true); break;
      case 'cx': this.codexSel = v; this.render(true); break;
      case 'set': { const k = b.dataset.k; let val = v; if (val === 'true') val = true; else if (val === 'false') val = false; else if (!isNaN(+val) && k === 'gain') val = +val; s.settings[k] = val; app.applySettings(); app.persist(); this.render(true); break; }
      case 'reset': if (this.confirm === 'reset2') { app.resetSave(); this.confirm = null; this.toast('Progression réinitialisée'); this.go('title'); } else { this.confirm = this.confirm === 'reset1' ? 'reset2' : 'reset1'; this.render(true); } break;
      case 'resume': app.resume(); break;
      case 'quit': if (this.confirm === 'quit') app.quitRun(); else { this.confirm = 'quit'; this.render(true); } break;
      case 'bi': this.params.bi = v; this.render(true); break;
      case 'replay': app.replay(); break;
      case 'zones': app.toMenu(); this.go('title'); break;
    }
  }
  onInput(e) {
    const k = e.target.dataset.k; if (!k) return;
    this.save.settings[k] = +e.target.value; this.app.applySettings(); this.app.persistSoon();
  }
}
