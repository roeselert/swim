/* Schwimmen – UI, Spielsteuerung, Persistenz und PWA-Registrierung. */
(function () {
  'use strict';

  const G = window.Schwimmen;
  const STORAGE_KEY = 'schwimmen.state.v1';
  const STATS_KEY = 'schwimmen.stats.v1';
  const NAMES = ['Du', 'Lena', 'Max'];
  const AI_DELAY = 1100;
  const HUMAN = 0;

  const $ = (id) => document.getElementById(id);
  const el = {
    opponents: $('opponents'), middle: $('middle-cards'), hand: $('hand-cards'),
    status: $('status'), roundInfo: $('round-info'), deckInfo: $('deck-info'),
    me: $('me'), meLives: $('me-lives'), meScore: $('me-score'), log: $('log'),
    swapAll: $('btn-swap-all'), pass: $('btn-pass'), knock: $('btn-knock'),
    ovDealer: $('ov-dealer'), dealerCards: $('dealer-cards'), dealerScore: $('dealer-score'),
    ovRound: $('ov-round'), roundReason: $('round-reason'), roundResults: $('round-results'),
    ovGame: $('ov-game'), gameResult: $('game-result'), gameStats: $('game-stats'),
    ovRules: $('ov-rules'), toast: $('toast'),
  };

  let state = null;
  let selectedHand = null;
  let aiTimer = null;

  /* ---------- Persistenz ---------- */
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignorieren */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.players) || s.players.length !== 3 || !s.phase) return null;
      return s;
    } catch (e) { return null; }
  }
  function loadStats() {
    try { return Object.assign({ games: 0, wins: 0 }, JSON.parse(localStorage.getItem(STATS_KEY) || '{}')); }
    catch (e) { return { games: 0, wins: 0 }; }
  }
  function saveStats(stats) {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { /* ignorieren */ }
  }

  /* ---------- Karten-DOM ---------- */
  function cardNode(card, opts) {
    opts = opts || {};
    const node = document.createElement(opts.button ? 'button' : 'div');
    if (opts.button) node.type = 'button';
    node.className = 'card' + (opts.small ? ' sm' : '');
    if (!card || opts.faceDown) {
      node.classList.add('back');
      node.setAttribute('aria-label', 'Verdeckte Karte');
      return node;
    }
    const red = card.suit === 'hearts' || card.suit === 'diamonds';
    if (red) node.classList.add('red');
    const rank = G.RANK_LABEL[card.rank];
    const sym = G.SUIT_SYMBOL[card.suit];
    node.innerHTML =
      `<span class="corner top">${rank}<small>${sym}</small></span>` +
      `<span class="pip">${sym}</span>` +
      `<span class="corner bottom">${rank}<small>${sym}</small></span>`;
    node.setAttribute('aria-label', `${G.SUIT_NAME[card.suit]} ${rankName(card.rank)}`);
    return node;
  }
  function rankName(rank) {
    return { J: 'Bube', Q: 'Dame', K: 'König', A: 'Ass' }[rank] || rank;
  }

  function livesHtml(p) {
    if (p.out) return '<span class="dead">ausgeschieden</span>';
    if (p.lives === 0) return '<span class="swim">🏊 schwimmt</span>';
    return '●'.repeat(p.lives) + '<span class="dead">' + '○'.repeat(G.START_LIVES - p.lives) + '</span>';
  }

  function actionText(p) {
    const a = p.lastAction;
    if (!a) return '';
    switch (a.type) {
      case 'swapOne': return `tauscht ${G.cardLabel(a.gave)} gegen ${G.cardLabel(a.took)}`;
      case 'swapAll': return 'tauscht alle drei Karten';
      case 'pass': return 'schiebt';
      case 'knock': return 'klopft!';
      default: return '';
    }
  }

  /* ---------- Rendering ---------- */
  function render() {
    const humanTurn = state.phase === 'playing' && state.turn === HUMAN;
    const reveal = state.phase === 'roundEnd' || state.phase === 'gameOver';

    // Gegner
    el.opponents.innerHTML = '';
    state.players.forEach((p, i) => {
      if (i === HUMAN) return;
      const box = document.createElement('div');
      box.className = 'opp' + (state.phase === 'playing' && state.turn === i ? ' active' : '') + (p.out ? ' out' : '');
      box.innerHTML =
        `<div class="player-head"><span class="player-name">${p.name}</span>` +
        `<span class="lives">${livesHtml(p)}</span>` +
        (p.knocked ? '<span class="badge">geklopft</span>' : '') +
        (state.dealer === i && !p.out ? '<span class="badge" style="background:rgba(255,255,255,.25);color:#fff">Geber</span>' : '') +
        `</div>`;
      const cards = document.createElement('div');
      cards.className = 'cards';
      if (p.out) {
        cards.innerHTML = '<span class="bubble">–</span>';
      } else {
        for (const c of p.hand) cards.appendChild(cardNode(c, { small: true, faceDown: !reveal }));
      }
      box.appendChild(cards);
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = p.out ? '' : actionText(p);
      box.appendChild(bubble);
      el.opponents.appendChild(box);
    });

    // Mitte
    el.roundInfo.textContent = `Runde ${state.round}`;
    el.deckInfo.textContent = `Stapel: ${state.deck.length}`;
    el.middle.innerHTML = '';
    state.middle.forEach((c, j) => {
      const n = cardNode(c, { button: true });
      n.disabled = !(humanTurn && selectedHand !== null);
      if (humanTurn && selectedHand !== null) n.classList.add('selectable', 'target');
      n.addEventListener('click', () => onMiddleClick(j));
      el.middle.appendChild(n);
    });

    // Eigene Hand
    const me = state.players[HUMAN];
    el.me.classList.toggle('active', humanTurn);
    el.meLives.innerHTML = livesHtml(me);
    el.meScore.textContent = me.hand.length ? `${G.formatScore(G.handScore(me.hand))} Punkte` : '';
    el.hand.innerHTML = '';
    me.hand.forEach((c, i) => {
      const n = cardNode(c, { button: true });
      n.disabled = !humanTurn;
      if (humanTurn) n.classList.add('selectable');
      if (selectedHand === i) n.classList.add('selected');
      n.addEventListener('click', () => onHandClick(i));
      el.hand.appendChild(n);
    });
    el.swapAll.disabled = !humanTurn;
    el.pass.disabled = !humanTurn;
    el.knock.disabled = !humanTurn || state.knocker !== null;

    // Status
    el.status.textContent = statusText();

    // Log
    el.log.innerHTML = '';
    state.log.slice(-6).forEach((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      el.log.appendChild(li);
    });
    el.log.parentElement.scrollTop = el.log.parentElement.scrollHeight;

    save();
  }

  function statusText() {
    const p = state.players[state.turn];
    if (state.phase === 'dealerChoice') return p && p.human ? 'Du gibst – wähle dein Blatt.' : `${p ? p.name : ''} gibt und wählt das Blatt…`;
    if (state.phase === 'playing') {
      const k = state.knocker !== null ? state.players[state.knocker] : null;
      const knockNote = k ? ` ${k.name} ${G.verb(k, 'hat', 'hast')} geklopft – letzte Züge!` : '';
      if (state.turn === HUMAN) {
        return (selectedHand === null
          ? 'Du bist dran: Tippe eine Handkarte an, dann eine Karte aus der Mitte.'
          : 'Jetzt eine Karte aus der Mitte wählen (oder andere Handkarte).') + knockNote;
      }
      return `${p.name} überlegt…` + knockNote;
    }
    if (state.phase === 'roundEnd') return 'Runde beendet.';
    if (state.phase === 'gameOver') return 'Spiel beendet.';
    return '';
  }

  /* ---------- Eingaben ---------- */
  function onHandClick(i) {
    if (!(state.phase === 'playing' && state.turn === HUMAN)) return;
    selectedHand = selectedHand === i ? null : i;
    render();
  }
  function onMiddleClick(j) {
    if (!(state.phase === 'playing' && state.turn === HUMAN) || selectedHand === null) return;
    const i = selectedHand;
    selectedHand = null;
    G.swapOne(state, i, j);
    afterHumanMove();
  }
  el.swapAll.addEventListener('click', () => {
    if (!(state.phase === 'playing' && state.turn === HUMAN)) return;
    selectedHand = null;
    G.swapAll(state);
    afterHumanMove();
  });
  el.pass.addEventListener('click', () => {
    if (!(state.phase === 'playing' && state.turn === HUMAN)) return;
    selectedHand = null;
    G.pass(state);
    afterHumanMove();
  });
  el.knock.addEventListener('click', () => {
    if (!(state.phase === 'playing' && state.turn === HUMAN) || state.knocker !== null) return;
    selectedHand = null;
    G.knock(state);
    afterHumanMove();
  });
  function afterHumanMove() {
    render();
    tick();
  }

  $('btn-keep').addEventListener('click', () => dealerChoice(true));
  $('btn-other').addEventListener('click', () => dealerChoice(false));
  function dealerChoice(keepFirst) {
    if (state.phase !== 'dealerChoice' || state.turn !== HUMAN) return;
    hide(el.ovDealer);
    G.dealerChoose(state, keepFirst);
    render();
    tick();
  }

  $('btn-next-round').addEventListener('click', () => {
    hide(el.ovRound);
    if (state.phase === 'roundEnd') startRound();
    else if (state.phase === 'gameOver') showGameDialog();
  });
  $('btn-new-game').addEventListener('click', () => { hide(el.ovGame); newGame(); });
  $('btn-new').addEventListener('click', () => {
    if (state.phase === 'gameOver' || confirm('Laufendes Spiel verwerfen und neu starten?')) newGame();
  });
  $('btn-rules').addEventListener('click', () => show(el.ovRules));
  $('btn-rules-close').addEventListener('click', () => hide(el.ovRules));
  el.ovRules.addEventListener('click', (e) => { if (e.target === el.ovRules) hide(el.ovRules); });

  function show(node) { node.classList.remove('hidden'); }
  function hide(node) { node.classList.add('hidden'); }

  /* ---------- Spielfluss ---------- */
  function newGame() {
    clearTimeout(aiTimer);
    selectedHand = null;
    state = G.createGame(NAMES);
    startRound();
  }

  function startRound() {
    selectedHand = null;
    G.startRound(state);
    render();
    tick();
  }

  /** Prüft den Zustand und stößt den nächsten Schritt an (KI-Zug, Dialog, Rundenende). */
  function tick() {
    clearTimeout(aiTimer);
    if (state.phase === 'dealerChoice') {
      if (state.turn === HUMAN) showDealerDialog();
      else aiTimer = setTimeout(() => {
        G.dealerChoose(state, G.aiDealerKeepsFirst(state));
        render();
        tick();
      }, AI_DELAY);
      return;
    }
    if (state.phase === 'playing') {
      if (state.turn !== HUMAN) {
        aiTimer = setTimeout(() => {
          G.applyMove(state, G.aiDecide(state, state.turn));
          render();
          tick();
        }, AI_DELAY);
      }
      return;
    }
    if (state.phase === 'roundEnd' || state.phase === 'gameOver') {
      // Erst das Rundenergebnis zeigen; bei Spielende folgt danach der Abschlussdialog.
      aiTimer = setTimeout(showRoundDialog, 900);
    }
  }

  function showDealerDialog() {
    const first = state.pendingHands.first;
    el.dealerCards.innerHTML = '';
    for (const c of first) el.dealerCards.appendChild(cardNode(c));
    el.dealerScore.textContent = `${G.formatScore(G.handScore(first))} Punkte`;
    show(el.ovDealer);
  }

  function showRoundDialog() {
    const r = state.roundResult;
    if (!r) return;
    const name = (i) => state.players[i].name;
    let reason;
    switch (r.reason) {
      case 'feuer': reason = `${name(r.player)} ${G.verb(state.players[r.player], 'hat', 'hast')} Feuer – drei Asse! Alle anderen verlieren ein Leben.`; break;
      case 'schnauze': reason = `${name(r.player)} ${G.verb(state.players[r.player], 'hat', 'hast')} 31! Die Runde endet sofort.`; break;
      case 'knock': reason = `${name(r.knocker)} ${G.verb(state.players[r.knocker], 'hat', 'hast')} geklopft.`; break;
      default: reason = 'Der Stapel ist aufgebraucht.';
    }
    el.roundReason.textContent = reason + (r.losers.length ? '' : ' Gleichstand – niemand verliert ein Leben.');

    el.roundResults.innerHTML = '';
    const byScore = r.scores.slice().sort((a, b) => b.score - a.score);
    for (const s of byScore) {
      const p = state.players[s.player];
      const row = document.createElement('div');
      const lost = r.losers.includes(s.player);
      const instant = r.reason === 'feuer' || r.reason === 'schnauze';
      row.className = 'result' + (lost ? ' loser' : '') + (instant && s.player === r.player ? ' winner' : '');
      row.innerHTML = `<span class="name">${p.name}</span><span class="pts">${G.formatScore(s.score)}</span>`;
      const cards = document.createElement('div');
      cards.className = 'cards';
      for (const c of p.hand) cards.appendChild(cardNode(c, { small: true }));
      row.appendChild(cards);
      let tag = '';
      const loses = G.verb(p, 'verliert', 'verlierst');
      if (r.eliminated.includes(s.player)) tag = G.verb(p, 'ist', 'bist') + ' ausgeschieden';
      else if (r.nowSwimming.includes(s.player)) tag = `${loses} ein Leben – ${G.verb(p, 'schwimmt', 'schwimmst')} jetzt!`;
      else if (lost) tag = `${loses} ein Leben (${p.lives} übrig)`;
      if (tag) {
        const t = document.createElement('span');
        t.className = 'tag';
        t.textContent = tag;
        row.appendChild(t);
      }
      el.roundResults.appendChild(row);
    }
    if (state.phase === 'gameOver') {
      $('btn-next-round').textContent = 'Ergebnis anzeigen';
    } else {
      $('btn-next-round').textContent = 'Nächste Runde';
    }
    show(el.ovRound);
  }

  function showGameDialog() {
    hide(el.ovRound);
    const won = state.winner === HUMAN;
    if (!state.statsCounted) {
      const stats = loadStats();
      stats.games++;
      if (won) stats.wins++;
      saveStats(stats);
      state.statsCounted = true;
      save();
    }
    const stats = loadStats();
    el.gameResult.textContent = won
      ? '🏆 Du hast gewonnen – Glückwunsch!'
      : `${state.winner !== null ? state.players[state.winner].name : 'Niemand'} gewinnt das Spiel. Beim nächsten Mal klappt es!`;
    el.gameStats.textContent = `Bilanz: ${stats.wins} von ${stats.games} Spielen gewonnen.`;
    show(el.ovGame);
  }

  /* ---------- PWA ---------- */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              show(el.toast);
              $('btn-reload').onclick = () => worker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      }).catch(() => { /* offline oder file:// */ });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
    });
  }

  /* ---------- Start ---------- */
  function init() {
    registerServiceWorker();
    state = load();
    if (!state || state.phase === 'idle') {
      newGame();
      return;
    }
    render();
    if (state.phase === 'gameOver') {
      showGameDialog();
    } else {
      tick();
    }
  }

  init();
})();
