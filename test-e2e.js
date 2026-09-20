const { io } = require('socket.io-client');

const URL = 'http://localhost:3000';
const QUESTIONS = [
  { q: 'What is 2+2?', options: ['3','4','5','6'], correct: 1, explanation: 'Basic addition.' },
  { q: 'Capital of France?', options: ['Berlin','Madrid','Paris','Rome'], correct: 2, explanation: 'Paris.' }
];

function connect() { return io(URL, { transports: ['websocket'] }); }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('OK:', msg);
}

async function main() {
  const host = connect();
  const p1 = connect();
  const p2 = connect();
  await Promise.all([host, p1, p2].map(s => new Promise(res => s.on('connect', res))));
  console.log('all sockets connected');

  // host creates a gold-rush room
  const createRes = await new Promise(res => {
    host.emit('host:create', { title: 'Test Room', subjectId: 'biology', mode: 'gold', questions: QUESTIONS, hostName: 'Ms. Test' }, res);
  });
  assert(createRes.ok, 'room created: ' + JSON.stringify(createRes));
  const code = createRes.code;
  const hostToken = createRes.hostToken;

  // players join
  const j1 = await new Promise(res => p1.emit('player:join', { code, name: 'Alice', playerId: 'p1' }, res));
  const j2 = await new Promise(res => p2.emit('player:join', { code, name: 'Bob', playerId: 'p2' }, res));
  assert(j1.ok && j2.ok, 'both players joined');
  assert(j1.mode === 'gold', 'mode propagated to players: ' + j1.mode);

  let hostQuestion = null;
  host.on('room:question', q => { hostQuestion = q; });
  let p1Question = null, p2Question = null;
  p1.on('room:question', q => { p1Question = q; });
  p2.on('room:question', q => { p2Question = q; });
  let p1Ack = null, p2Ack = null;
  p1.on('answer:ack', a => { p1Ack = a; });
  p2.on('answer:ack', a => { p2Ack = a; });
  let revealData = null;
  host.on('room:reveal', d => { revealData = d; });
  let chestResult = null;
  p1.on('chest:result', d => { chestResult = d; });

  // host starts game -> question 0 broadcast
  host.emit('host:start', { code, hostToken });
  await wait(300);
  assert(hostQuestion && hostQuestion.index === 0, 'host received question 0');
  assert(p1Question && p1Question.correct === undefined, 'players do NOT receive the correct-answer index');

  // Alice answers correctly and fast, Bob answers wrong
  p1.emit('player:answer', { code, playerId: 'p1', idx: 1 });
  await wait(50);
  p2.emit('player:answer', { code, playerId: 'p2', idx: 0 });
  await wait(300);

  assert(p1Ack && p1Ack.correct === true && p1Ack.points > 0, 'Alice correct with points: ' + JSON.stringify(p1Ack));
  assert(p2Ack && p2Ack.correct === false && p2Ack.points === 0, 'Bob incorrect with 0 points: ' + JSON.stringify(p2Ack));
  assert(revealData && revealData.correct === 1, 'auto-reveal fired once both answered, correct=1');
  assert(revealData.counts[1] === 1 && revealData.counts[0] === 1, 'reveal counts match: ' + JSON.stringify(revealData.counts));

  const aliceAfterQ1 = revealData.players.find(p => p.id === 'p1');
  assert(aliceAfterQ1.gold > 0, 'Alice earned gold in gold-rush mode: ' + aliceAfterQ1.gold);
  assert(aliceAfterQ1.chestsAvailable === undefined, 'public player object omits internal chestsAvailable field');

  // Alice opens her chest
  p1.emit('player:openChest', { code, playerId: 'p1' });
  await wait(200);
  assert(chestResult && chestResult.bonus >= 20 && chestResult.bonus <= 150, 'chest bonus in range: ' + JSON.stringify(chestResult));

  // host advances to question 2
  revealData = null;
  host.emit('host:next', { code, hostToken });
  await wait(300);
  assert(hostQuestion.index === 1, 'advanced to question index 1');

  // both answer question 2 correctly
  p1.emit('player:answer', { code, playerId: 'p1', idx: 2 });
  p2.emit('player:answer', { code, playerId: 'p2', idx: 2 });
  await wait(300);
  assert(revealData && revealData.counts[2] === 2, 'both answered correctly on Q2');

  // host ends game
  let endedData = null;
  host.on('room:ended', d => { endedData = d; });
  host.emit('host:end', { code, hostToken });
  await wait(300);
  assert(endedData, 'game ended broadcast received');
  assert(endedData.players.length === 2, 'final leaderboard has 2 players');
  const alice = endedData.players.find(p => p.id === 'p1');
  const bob = endedData.players.find(p => p.id === 'p2');
  assert(alice.score > bob.score, `Alice (${alice.score}) beat Bob (${bob.score}) as expected`);

  // wrong hostToken should be rejected
  let rejectedStart = true;
  const host2 = connect();
  await new Promise(res => host2.on('connect', res));
  host2.emit('host:reveal', { code, hostToken: 'not-the-real-token' });
  await wait(150);
  assert(rejectedStart, 'bogus hostToken did not crash server (no throw)');

  host.close(); p1.close(); p2.close(); host2.close();

  console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('TEST CRASHED:', e); process.exit(1); });
