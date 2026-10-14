// Small deterministic rules are kept separate from pictures and input handling.
export function shuffled(values, seed = 1) {
  let state = (Number(seed) >>> 0) || 1;
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1); [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export const WIN_LINES = Object.freeze([[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]);
export function boardResult(board) {
  if (!Array.isArray(board) || board.length !== 9 || board.some(v => ![null,'X','O'].includes(v))) return null;
  for (const line of WIN_LINES) if (board[line[0]] && line.every(i => board[i] === board[line[0]])) return {winner: board[line[0]], line};
  return board.every(Boolean) ? {winner: 'draw', line: []} : null;
}
export function playSquare(board, index, mark) {
  if (!Array.isArray(board) || board.length !== 9 || !Number.isInteger(index) || index < 0 || index > 8 || board[index] || !['X','O'].includes(mark) || boardResult(board)) return null;
  const next = [...board]; next[index] = mark; return next;
}
function winningMove(board, mark) {
  return board.findIndex((v, i) => !v && boardResult(playSquare(board, i, mark))?.winner === mark);
}
export function suggestSquare(board) {
  if (boardResult(board)) return -1;
  for (const mark of ['X','O']) { const move = winningMove(board, mark); if (move >= 0) return move; }
  // A fork gives the child a meaningful plan after the immediate tactics.
  for (const i of [4,0,2,6,8,1,3,5,7]) {
    if (board[i]) continue;
    const next = playSquare(board, i, 'X');
    const threats = next.filter((v,j) => !v && boardResult(playSquare(next,j,'X'))?.winner === 'X').length;
    if (threats >= 2) return i;
  }
  return [4,0,2,6,8,1,3,5,7].find(i => !board[i]) ?? -1;
}
export function chooseRexSquare(board, round = 0, {practice=false} = {}) {
  if (boardResult(board)) return -1;
  round=(Number(round)>>>0)%12;
  const turns=board.filter(value=>value==='O').length;
  const available=board.flatMap((value,index)=>value?[]:[index]);
  const wins=available.filter(index=>boardResult(playSquare(board,index,'O'))?.winner==='O');
  const blocks=available.filter(index=>boardResult(playSquare(board,index,'X'))?.winner==='X');
  const seed=round*31+turns+7;
  // Rex is a friendly, fallible partner. Replay rotates a predictable schedule:
  // every other turn is distracted, or three turns out of four in practice.
  // A mistake is still a legal move; the child must spot and complete a line.
  const distracted=(round+turns)%(practice?4:2)!==0;
  if(distracted){
    const alternatives=available.filter(index=>!wins.includes(index)&&!blocks.includes(index));
    return shuffled(alternatives.length?alternatives:available,seed)[0]??-1;
  }
  if(wins.length)return wins[0];
  if(blocks.length)return blocks[0];
  if(!board[4])return 4;
  return shuffled([0,2,6,8],seed).find(index=>!board[index])
    ??shuffled([1,3,5,7],seed).find(index=>!board[index])??-1;
}
export function memoryDeck(round = 0) { return shuffled([0,0,1,1,2,2,3,3,4,4,5,5], round + 317); }
export function reedSequence(round = 0) {
  const tones=shuffled([0,1,2],round+73),patterns=[[0,1,0,2,1],[0,0,1,2,1],[0,1,2,1,0],[0,1,1,2,0]];
  return patterns[(Number(round)>>>0)%patterns.length].map(i=>tones[i]);
}
export function checkTone(sequence, entered, tone) {
  if (!Number.isInteger(tone) || tone < 0 || tone > 2 || entered.length >= sequence.length) return {correct: false, complete: false};
  const correct = sequence[entered.length] === tone;
  return {correct, complete: correct && entered.length + 1 === sequence.length};
}

// Each delayed turn/flip/note owns its remaining time. Pausing or hiding the
// document cannot consume a challenge, and disposal cannot leave a late win.
export function createPausableScheduler({now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
  const jobs = new Map(); let serial = 0, paused = false, disposed = false;
  function arm(job) {
    job.started = now();
    job.timer = setTimer(() => { if (disposed || paused || !jobs.has(job.id)) return; jobs.delete(job.id); job.fn(); }, job.remaining);
  }
  function after(fn, delay) {
    if (disposed) return null;
    const job = {id: ++serial, fn, remaining: Math.max(0, delay), timer: null, started: now()};
    jobs.set(job.id, job); if (!paused) arm(job); return job.id;
  }
  function cancel(id) { const job = jobs.get(id); if (job) { clearTimer(job.timer); jobs.delete(id); } }
  function clear() { for (const id of jobs.keys()) cancel(id); }
  function setPaused(value) {
    value = Boolean(value); if (disposed || value === paused) return; paused = value;
    for (const job of jobs.values()) { if (paused) { clearTimer(job.timer); job.remaining = Math.max(0, job.remaining - (now() - job.started)); } else arm(job); }
  }
  return {after, cancel, clear, setPaused, dispose() { clear(); disposed = true; }, get pending() { return jobs.size; }};
}
