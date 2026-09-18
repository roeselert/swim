/*
 * Schwimmen – reine Spiellogik (ohne DOM).
 * Läuft im Browser (window.Schwimmen) und in Node (module.exports) für Tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Schwimmen = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SUITS = ['hearts', 'diamonds', 'spades', 'clubs'];
  const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const SUIT_SYMBOL = { hearts: '♥', diamonds: '♦', spades: '♠', clubs: '♣' };
  const SUIT_NAME = { hearts: 'Herz', diamonds: 'Karo', spades: 'Pik', clubs: 'Kreuz' };
  const RANK_LABEL = { 7: '7', 8: '8', 9: '9', 10: '10', J: 'B', Q: 'D', K: 'K', A: 'A' };
  const START_LIVES = 3;

  function cardValue(card) {
    if (card.rank === 'A') return 11;
    if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10;
    return Number(card.rank);
  }

  function cardLabel(card) {
    return RANK_LABEL[card.rank] + SUIT_SYMBOL[card.suit];
  }

  function createDeck() {
    const deck = [];
    for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank });
    return deck;
  }

  function shuffle(arr, rng) {
    rng = rng || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Punktwert einer Hand: gleiche Farbe summiert, Drilling 30.5, drei Asse 33 (Feuer). */
  function handScore(hand) {
    if (!hand || hand.length !== 3) return 0;
    if (hand[0].rank === hand[1].rank && hand[1].rank === hand[2].rank) {
      return hand[0].rank === 'A' ? 33 : 30.5;
    }
    let best = 0;
    for (const suit of SUITS) {
      let sum = 0;
      for (const c of hand) if (c.suit === suit) sum += cardValue(c);
      if (sum > best) best = sum;
    }
    return best;
  }

  function formatScore(score) {
    return score === 30.5 ? '30½' : String(score);
  }

  function createGame(names, options) {
    names = names || ['Du', 'Lena', 'Max'];
    options = options || {};
    return {
      players: names.map((name, i) => ({
        name,
        human: i === 0,
        lives: START_LIVES,
        out: false,
        hand: [],
        knocked: false,
        lastAction: null,
      })),
      deck: [],
      middle: [],
      dealer: typeof options.firstDealer === 'number' ? options.firstDealer - 1 : -1,
      round: 0,
      phase: 'idle', // idle | dealerChoice | playing | roundEnd | gameOver
      turn: -1,
      knocker: null,
      passStreak: 0,
      pendingHands: null,
      roundResult: null,
      winner: null,
      log: [],
    };
  }

  /** Verbform: 2. Person für den menschlichen Spieler („Du gibst“), sonst 3. Person. */
  function verb(player, third, second) {
    return player.human ? second : third;
  }

  function log(state, text) {
    state.log.push(text);
    if (state.log.length > 60) state.log.splice(0, state.log.length - 60);
  }

  function activePlayers(state) {
    const res = [];
    state.players.forEach((p, i) => { if (!p.out) res.push(i); });
    return res;
  }

  function nextActive(state, from) {
    const n = state.players.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + k + n) % n;
      if (!state.players[i].out) return i;
    }
    return -1;
  }

  function startRound(state, rng) {
    if (state.phase === 'gameOver') throw new Error('Spiel ist beendet');
    state.round++;
    state.dealer = nextActive(state, state.dealer);
    state.deck = shuffle(createDeck(), rng);
    state.middle = [];
    state.knocker = null;
    state.passStreak = 0;
    state.roundResult = null;
    for (const p of state.players) {
      p.hand = [];
      p.knocked = false;
      p.lastAction = null;
    }
    for (const i of activePlayers(state)) state.players[i].hand = state.deck.splice(0, 3);
    state.pendingHands = {
      first: state.players[state.dealer].hand.slice(),
      second: state.deck.splice(0, 3),
    };
    state.phase = 'dealerChoice';
    state.turn = state.dealer;
    log(state, `Runde ${state.round}: ${state.players[state.dealer].name} ${verb(state.players[state.dealer], 'gibt', 'gibst')}.`);
    return state;
  }

  function dealerChoose(state, keepFirst) {
    if (state.phase !== 'dealerChoice') throw new Error('Keine Geberwahl offen');
    const dealer = state.players[state.dealer];
    if (keepFirst) {
      state.middle = state.pendingHands.second;
      log(state, `${dealer.name} ${verb(dealer, 'behält', 'behältst')} die ersten Karten.`);
    } else {
      state.middle = state.pendingHands.first;
      dealer.hand = state.pendingHands.second;
      log(state, `${dealer.name} ${verb(dealer, 'nimmt', 'nimmst')} die zweiten Karten.`);
    }
    state.pendingHands = null;
    state.phase = 'playing';
    state.turn = nextActive(state, state.dealer);

    // Sofortgewinn direkt nach dem Geben (31 oder Feuer)
    let i = state.turn;
    for (let k = 0; k < state.players.length; k++) {
      const p = state.players[i];
      if (!p.out && checkInstant(state, i)) return state;
      i = nextActive(state, i);
    }
    return state;
  }

  function checkInstant(state, idx) {
    const score = handScore(state.players[idx].hand);
    if (score === 33) { endRound(state, { reason: 'feuer', player: idx }); return true; }
    if (score === 31) { endRound(state, { reason: 'schnauze', player: idx }); return true; }
    return false;
  }

  function assertTurn(state, idx) {
    if (state.phase !== 'playing') throw new Error('Kein Zug möglich');
    if (typeof idx === 'number' && idx !== state.turn) throw new Error('Nicht am Zug');
  }

  function swapOne(state, handIdx, midIdx) {
    assertTurn(state);
    const p = state.players[state.turn];
    if (!p.hand[handIdx] || !state.middle[midIdx]) throw new Error('Ungültiger Tausch');
    const gave = p.hand[handIdx];
    const took = state.middle[midIdx];
    p.hand[handIdx] = took;
    state.middle[midIdx] = gave;
    p.lastAction = { type: 'swapOne', gave, took };
    log(state, `${p.name} ${verb(p, 'tauscht', 'tauschst')} ${cardLabel(gave)} gegen ${cardLabel(took)}.`);
    return afterMove(state, false);
  }

  function swapAll(state) {
    assertTurn(state);
    const p = state.players[state.turn];
    const gave = p.hand;
    p.hand = state.middle;
    state.middle = gave;
    p.lastAction = { type: 'swapAll' };
    log(state, `${p.name} ${verb(p, 'tauscht', 'tauschst')} alle drei Karten.`);
    return afterMove(state, false);
  }

  function pass(state) {
    assertTurn(state);
    const p = state.players[state.turn];
    p.lastAction = { type: 'pass' };
    state.passStreak++;
    log(state, `${p.name} ${verb(p, 'schiebt', 'schiebst')}.`);
    return afterMove(state, true);
  }

  function knock(state) {
    assertTurn(state);
    if (state.knocker !== null) throw new Error('Es wurde bereits geklopft');
    const p = state.players[state.turn];
    state.knocker = state.turn;
    p.knocked = true;
    p.lastAction = { type: 'knock' };
    log(state, `${p.name} ${verb(p, 'klopft', 'klopfst')}!`);
    return afterMove(state, false);
  }

  function afterMove(state, wasPass) {
    const idx = state.turn;
    if (!wasPass) state.passStreak = 0;
    if (state.players[idx].lastAction.type.startsWith('swap') && checkInstant(state, idx)) return state;

    const active = activePlayers(state);
    if (wasPass && state.passStreak >= active.length) {
      state.passStreak = 0;
      if (state.deck.length >= 3) {
        state.middle = state.deck.splice(0, 3);
        log(state, 'Alle haben geschoben – drei neue Karten liegen in der Mitte.');
      } else {
        log(state, 'Der Stapel ist leer.');
        endRound(state, { reason: 'deck' });
        return state;
      }
    }

    const next = nextActive(state, idx);
    if (state.knocker !== null && next === state.knocker) {
      endRound(state, { reason: 'knock', player: state.knocker });
      return state;
    }
    state.turn = next;
    return state;
  }

  function endRound(state, info) {
    state.phase = 'roundEnd';
    const active = activePlayers(state);
    const scores = active.map((i) => ({ player: i, score: handScore(state.players[i].hand) }));
    let losers;
    if (info.reason === 'feuer') {
      losers = active.filter((i) => i !== info.player);
    } else {
      const min = Math.min.apply(null, scores.map((s) => s.score));
      losers = scores.filter((s) => s.score === min).map((s) => s.player);
      if (losers.length === active.length) losers = []; // alle gleich: niemand verliert
    }
    const eliminated = [];
    const nowSwimming = [];
    for (const i of losers) {
      const p = state.players[i];
      if (p.lives > 0) {
        p.lives--;
        if (p.lives === 0) nowSwimming.push(i);
      } else {
        p.out = true;
        eliminated.push(i);
      }
    }
    state.roundResult = {
      reason: info.reason,
      player: typeof info.player === 'number' ? info.player : null,
      scores,
      losers,
      nowSwimming,
      eliminated,
      knocker: state.knocker,
    };

    const who = info.player != null ? state.players[info.player] : null;
    const has = who ? `${who.name} ${verb(who, 'hat', 'hast')}` : '';
    const reasonText = {
      feuer: `${has} Feuer (drei Asse)!`,
      schnauze: `${has} 31!`,
      knock: 'Die Klopf-Runde ist vorbei.',
      deck: 'Der Stapel ist aufgebraucht.',
    }[info.reason];
    log(state, reasonText);
    if (losers.length) {
      const names = losers.map((i) => state.players[i].name).join(', ');
      const v = losers.length > 1 ? 'verlieren' : verb(state.players[losers[0]], 'verliert', 'verlierst');
      log(state, `${names} ${v} ein Leben.`);
    } else {
      log(state, 'Gleichstand – niemand verliert ein Leben.');
    }
    for (const i of eliminated) log(state, `${state.players[i].name} ${verb(state.players[i], 'ist', 'bist')} ausgeschieden.`);

    const remaining = activePlayers(state);
    if (remaining.length <= 1) {
      state.phase = 'gameOver';
      state.winner = remaining.length ? remaining[0] : null;
      if (state.winner !== null) log(state, `${state.players[state.winner].name} ${verb(state.players[state.winner], 'gewinnt', 'gewinnst')} das Spiel!`);
    }
    return state;
  }

  /* ---------- Computer-Gegner ---------- */

  function bestSwap(hand, middle) {
    let best = { type: 'pass', score: handScore(hand) };
    for (let i = 0; i < hand.length; i++) {
      for (let j = 0; j < middle.length; j++) {
        const h = hand.slice();
        h[i] = middle[j];
        const s = handScore(h);
        if (s > best.score) best = { type: 'swapOne', handIdx: i, midIdx: j, score: s };
      }
    }
    const all = handScore(middle);
    if (all > best.score) best = { type: 'swapAll', score: all };
    return best;
  }

  function aiDecide(state, idx, rng) {
    rng = rng || Math.random;
    const p = state.players[idx];
    const cur = handScore(p.hand);
    const best = bestSwap(p.hand, state.middle);
    const canKnock = state.knocker === null;

    if (best.score > cur) {
      if (canKnock && cur >= 30) return { type: 'knock' };
      return best;
    }
    if (canKnock) {
      if (cur >= 30) return { type: 'knock' };
      if (cur >= 27 && rng() < 0.7) return { type: 'knock' };
      if (cur >= 24 && rng() < 0.3) return { type: 'knock' };
      if (cur >= 20 && state.deck.length < 6 && rng() < 0.5) return { type: 'knock' };
    }
    return { type: 'pass' };
  }

  function aiDealerKeepsFirst(state) {
    return handScore(state.pendingHands.first) >= 18;
  }

  function applyMove(state, move) {
    switch (move.type) {
      case 'swapOne': return swapOne(state, move.handIdx, move.midIdx);
      case 'swapAll': return swapAll(state);
      case 'knock': return knock(state);
      default: return pass(state);
    }
  }

  return {
    SUITS, RANKS, SUIT_SYMBOL, SUIT_NAME, RANK_LABEL, START_LIVES,
    cardValue, cardLabel, createDeck, shuffle, handScore, formatScore, verb,
    createGame, startRound, dealerChoose, swapOne, swapAll, pass, knock, applyMove,
    activePlayers, nextActive, bestSwap, aiDecide, aiDealerKeepsFirst,
  };
});
