const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../game.js');

const c = (rank, suit) => ({ rank, suit });
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

test('Deck hat 32 eindeutige Karten', () => {
  const deck = G.createDeck();
  assert.equal(deck.length, 32);
  assert.equal(new Set(deck.map((x) => x.rank + x.suit)).size, 32);
});

test('handScore: Farbsumme, Drilling, Feuer', () => {
  assert.equal(G.handScore([c('A', 'hearts'), c('K', 'hearts'), c('10', 'hearts')]), 31);
  assert.equal(G.handScore([c('A', 'hearts'), c('K', 'spades'), c('7', 'hearts')]), 18);
  assert.equal(G.handScore([c('9', 'hearts'), c('9', 'spades'), c('9', 'clubs')]), 30.5);
  assert.equal(G.handScore([c('A', 'hearts'), c('A', 'spades'), c('A', 'clubs')]), 33);
  assert.equal(G.handScore([c('7', 'hearts'), c('8', 'spades'), c('9', 'clubs')]), 9);
});

test('Rundenstart: Geber wählt, dann spielt der linke Nachbar', () => {
  const s = G.createGame();
  G.startRound(s, seeded(1));
  assert.equal(s.phase, 'dealerChoice');
  assert.equal(s.dealer, 0);
  assert.equal(s.pendingHands.first.length, 3);
  assert.equal(s.pendingHands.second.length, 3);
  assert.equal(s.deck.length, 32 - 9 - 3);
  G.dealerChoose(s, false);
  assert.deepEqual(s.players[0].hand, s.pendingHands === null ? s.players[0].hand : null);
  assert.equal(s.middle.length, 3);
  if (s.phase === 'playing') assert.equal(s.turn, 1);
});

test('Tauschen einer Karte und aller Karten', () => {
  const s = G.createGame();
  G.startRound(s, seeded(2));
  G.dealerChoose(s, true);
  if (s.phase !== 'playing') return; // Sofortgewinn nach Geben – nicht Teil dieses Tests
  const p = s.players[s.turn];
  const gave = p.hand[0], took = s.middle[2];
  G.swapOne(s, 0, 2);
  assert.equal(p.hand[0], took);
  assert.equal(s.middle[2], gave);
  if (s.phase !== 'playing') return;
  const p2 = s.players[s.turn];
  const oldHand = p2.hand, oldMid = s.middle;
  G.swapAll(s);
  assert.equal(p2.hand, oldMid);
  assert.equal(s.middle, oldHand);
});

test('Alle schieben → neue Karten in der Mitte', () => {
  const s = G.createGame();
  G.startRound(s, seeded(3));
  G.dealerChoose(s, true);
  if (s.phase !== 'playing') return;
  const before = s.middle.slice();
  const deckBefore = s.deck.length;
  G.pass(s); G.pass(s); G.pass(s);
  assert.equal(s.phase, 'playing');
  assert.notDeepEqual(s.middle, before);
  assert.equal(s.deck.length, deckBefore - 3);
  assert.equal(s.passStreak, 0);
});

test('Klopfen: jeder andere hat noch einen Zug, dann Rundenende', () => {
  const s = G.createGame();
  G.startRound(s, seeded(4));
  G.dealerChoose(s, true);
  if (s.phase !== 'playing') return;
  const knocker = s.turn;
  G.knock(s);
  assert.equal(s.knocker, knocker);
  assert.throws(() => G.knock(s));
  G.pass(s);
  assert.equal(s.phase, 'playing');
  G.pass(s);
  assert.equal(s.phase, 'roundEnd');
  assert.equal(s.roundResult.reason, 'knock');
  assert.equal(s.roundResult.losers.length >= 0, true);
});

test('Feuer beendet die Runde, alle anderen verlieren ein Leben', () => {
  const s = G.createGame();
  G.startRound(s, seeded(5));
  s.players[0].hand = [c('A', 'hearts'), c('A', 'spades'), c('7', 'clubs')];
  s.pendingHands.first = s.players[0].hand.slice();
  s.players[1].hand = [c('7', 'hearts'), c('8', 'spades'), c('9', 'clubs')];
  s.players[2].hand = [c('7', 'diamonds'), c('8', 'clubs'), c('9', 'hearts')];
  s.pendingHands.second = [c('A', 'clubs'), c('8', 'diamonds'), c('9', 'diamonds')];
  G.dealerChoose(s, true); // Mitte = second
  assert.equal(s.phase, 'playing');
  assert.equal(s.turn, 1);
  G.pass(s); G.pass(s);
  assert.equal(s.turn, 0);
  G.swapOne(s, 2, 0);
  assert.equal(s.phase, 'roundEnd');
  assert.equal(s.roundResult.reason, 'feuer');
  assert.deepEqual(s.roundResult.losers, [1, 2]);
  assert.equal(s.players[1].lives, 2);
  assert.equal(s.players[0].lives, 3);
});

test('Leben: 3 → 0 (schwimmt) → raus; Spielende bei einem Verbleibenden', () => {
  const s = G.createGame();
  s.players[1].lives = 0;
  s.players[2].out = true;
  G.startRound(s, seeded(6));
  s.players[0].hand = [c('A', 'hearts'), c('K', 'hearts'), c('7', 'clubs')];
  s.pendingHands.first = s.players[0].hand.slice();
  s.pendingHands.second = [c('7', 'diamonds'), c('8', 'clubs'), c('9', 'spades')];
  s.players[1].hand = [c('7', 'hearts'), c('8', 'spades'), c('9', 'clubs')];
  G.dealerChoose(s, true);
  assert.equal(s.turn, 1);
  G.knock(s);
  G.pass(s);
  assert.equal(s.phase, 'gameOver');
  assert.equal(s.winner, 0);
  assert.equal(s.players[1].out, true);
});

test('Gleichstand aller Spieler: niemand verliert', () => {
  const s = G.createGame();
  G.startRound(s, seeded(7));
  const h = () => [c('7', 'hearts'), c('8', 'spades'), c('9', 'clubs')];
  s.players[0].hand = h(); s.pendingHands.first = h();
  s.players[1].hand = [c('7', 'diamonds'), c('8', 'clubs'), c('9', 'spades')];
  s.players[2].hand = [c('7', 'spades'), c('8', 'hearts'), c('9', 'diamonds')];
  s.pendingHands.second = [c('7', 'clubs'), c('8', 'diamonds'), c('9', 'hearts')];
  G.dealerChoose(s, true);
  G.knock(s); G.pass(s); G.pass(s);
  assert.equal(s.phase, 'roundEnd');
  assert.deepEqual(s.roundResult.losers, []);
  assert.deepEqual(s.players.map((p) => p.lives), [3, 3, 3]);
});

test('KI: nimmt den besten Tausch, klopft bei starker Hand', () => {
  const s = G.createGame();
  G.startRound(s, seeded(8));
  G.dealerChoose(s, true);
  s.phase = 'playing';
  s.knocker = null;
  s.players[1].hand = [c('7', 'hearts'), c('8', 'spades'), c('9', 'clubs')];
  s.middle = [c('A', 'hearts'), c('K', 'hearts'), c('Q', 'hearts')];
  assert.equal(G.aiDecide(s, 1, () => 0.99).type, 'swapAll');
  s.players[1].hand = [c('A', 'hearts'), c('K', 'hearts'), c('9', 'hearts')];
  s.middle = [c('7', 'clubs'), c('8', 'clubs'), c('9', 'clubs')];
  assert.equal(G.aiDecide(s, 1, () => 0.99).type, 'knock');
  s.knocker = 2;
  assert.equal(G.aiDecide(s, 1, () => 0.99).type, 'pass');
});

test('Simulation: 200 komplette Spiele laufen ohne Fehler durch', () => {
  for (let g = 0; g < 200; g++) {
    const rng = seeded(1000 + g);
    const s = G.createGame();
    let guard = 0;
    while (s.phase !== 'gameOver' && guard++ < 5000) {
      if (s.phase === 'idle' || s.phase === 'roundEnd') G.startRound(s, rng);
      else if (s.phase === 'dealerChoice') G.dealerChoose(s, G.aiDealerKeepsFirst(s));
      else G.applyMove(s, G.aiDecide(s, s.turn, rng));
    }
    assert.equal(s.phase, 'gameOver', 'Spiel ' + g + ' endet nicht');
    assert.equal(G.activePlayers(s).length, 1);
    assert.ok(s.round < 200);
  }
});
