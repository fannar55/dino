// Litla Yatzy in "Fjölspil" (spec 2026-10-24-fjolspil-yatzy §5, the owner's decisions of 2026-10-24): Egill plays at the big
// screen in seat 0, up to three guests from their phones, which are their cups, and Mosi, the one computer player, when the
// lobby adds him. The page hosts a room of its own (STORAGE_KEY), beside the book's. The rules' players are the seats in order,
// their ids the seat numbers as strings, so player i is seat i. The big screen is the authority: what a phone may do is in the
// view it is sent, and an act it sends is let through only when the rules allow it now. Pure but for the kept game, which is
// written to the storage passed in.
import {CATEGORIES,MAX_ROLLS,previews,restoreGame,roundOf,scoringDice,totals} from './rules.js';

/** Mosi as the lobby offers him: the junior table's own character, in its words (lobby.js). */
export const MOSI_AI=Object.freeze({name:'Mosi',avatar:'mosi',add:'Bæta Mosa við',remove:'Taka Mosa út'});
/** Where the page keeps its room in sessionStorage: its own, so the book's room in the same tab is left alone (fjolspil.js). */
export const STORAGE_KEY='fjolspil.room.yatzy-junior';
/** Where a game of seats is kept in localStorage, apart from the solo game's save. */
export const SAVE_KEY='mosi.yatzy.junior.fjolspil.v1';

const CARD_IDS=new Set(CATEGORIES.map(category=>category.id));
const SEAT_KINDS=new Set(['host','remote','ai']);
/** A kept seat the seats can take back (seats.js createSeats): an object of a kind they have, Egill's in seat 0 alone, named and pictured. */
const wholeSeat=(seat,i)=>seat!==null&&typeof seat==='object'&&!Array.isArray(seat)&&SEAT_KINDS.has(seat.kind)&&(seat.kind==='host')===(i===0)&&
  typeof seat.name==='string'&&seat.name!==''&&typeof seat.avatar==='string';

/** The rules' player ids for these seats (seats.js): the seat numbers. */
export const playersOf=seats=>seats.list().map(seat=>String(seat.seat));

/**
 * How the big screen plays a seat's turn (game.js's phase): 'human' for Egill at the big screen, 'remote' for a guest whose
 * phone is there, 'waiting' for a guest who has gone (the lobby's waiting card, fjolspil.waitFor) or whose seat the computer
 * covers while she is back (the wait gives it back to her at once), and 'ai-wait' for Mosi, a seat the computer covers while
 * its guest is away, or no seat. With going, the turn is under way (after a roll), and a seat the computer covers stays its own
 * until the turn is over, even with its guest back (spec §11: Mosi finishes the turn, her next one is hers).
 */
export function phaseOf(seat,{going=false}={}){
  if(seat?.kind==='host')return 'human';
  if(seat?.kind==='remote')return seat.present?'remote':'waiting';
  return seat?.covered&&seat.present&&!going?'waiting':'ai-wait';
}

/**
 * What seat `seat`'s phone shows now (guest-yatzy.js): whose turn and round, the dice and the latest roll (`lastRoll`,
 * { seq, by }, so every phone tumbles its dice once per roll), what this seat may do, the five cards of whoever plays (an open
 * card's preview and the dice that score on it after a roll; a filled one's score and the dice that filled it), everyone's
 * totals, and the winner (a seat number, 'tie' or null). `settled` is false while the big screen's dice roll or fly, or the
 * turn is not a phone's to play; `paused` is said only when the big screen is paused.
 */
export function yatzyView(game,seats,seat,{settled=false,paused=false,lastRoll=null}={}){
  const turn=game.currentPlayer,rolls=game.rollCount,player=game.players[turn],open=rolls>0?previews(game):{};
  const mine=!paused&&settled&&turn===seat&&game.status==='playing';
  const view={screen:'yatzy',you:seat,turn,round:roundOf(game),rolls,dice:[...game.dice],held:[...game.held],
    roll:lastRoll?{seq:lastRoll.seq,by:lastRoll.by}:null,
    canRoll:mine&&rolls<MAX_ROLLS&&!game.held.every(Boolean),canHold:mine&&rolls>0&&rolls<MAX_ROLLS,canScore:mine&&rolls>0,
    cards:CATEGORIES.map(({id,label})=>{
      const points=player.scores[id];
      return {id,label,score:points,preview:points===null&&rolls>0?open[id]??null:null,
        faces:points!==null?[...(player.faces?.[id]??[])]:rolls>0?scoringDice(id,game.dice):[]};
    }),
    players:seats.list().slice(0,game.players.length).map(({seat:n,name,avatar})=>({seat:n,name,avatar,total:totals(game.players[n].scores).total})),
    winner:game.winner===null?null:game.winner==='tie'?'tie':Number(game.winner)};
  if(paused)view.paused=true;
  return view;
}

/**
 * The act a phone sent, as the big screen plays it: { type: 'roll' }, { type: 'hold', die } or { type: 'score', card }, or
 * null when it does not fit now (not her turn, the dice not settled, no roll left or every die held, a die outside 0..4 or
 * nothing to hold, a card filled or unknown, nothing rolled to score).
 */
export function actOf(game,seat,act,{settled=false}={}){
  if(!settled||game.status!=='playing'||game.currentPlayer!==seat||act===null||typeof act!=='object')return null;
  const rolls=game.rollCount;
  if(act.type==='roll')return rolls<MAX_ROLLS&&!game.held.every(Boolean)?{type:'roll'}:null;
  if(act.type==='hold')return Number.isInteger(act.die)&&act.die>=0&&act.die<5&&rolls>0&&rolls<MAX_ROLLS?{type:'hold',die:act.die}:null;
  if(act.type==='score')return rolls>0&&CARD_IDS.has(act.card)&&game.players[seat].scores[act.card]===null?{type:'score',card:act.card}:null;
  return null;
}

/** Keeps a game of seats ({ state, seats: seats.snapshot() }); storage is optional. */
export function keepFjolspil(storage,{state,seats}){
  try{storage.setItem(SAVE_KEY,JSON.stringify({state,seats}));}catch{/* Storage is optional. */}
}

/**
 * The kept game of seats, { state, seats }, or null: one whose state the rules refuse, that is over (a finished game is never
 * offered), or whose seats are not its players (as many, Egill first, player i the seat i) or not seats (wholeSeat), is let go.
 */
export function readFjolspil(storage){
  let raw=null,kept=null;
  try{raw=storage.getItem(SAVE_KEY);}catch{/* Storage is optional. */}
  if(raw===null)return null;
  try{kept=JSON.parse(raw);}catch{/* not a game: let go below */}
  const state=restoreGame(kept?.state),list=kept?.seats?.seats;
  if(state?.status==='playing'&&Array.isArray(list)&&list.length===state.players.length&&list.every(wholeSeat)&&state.players.every((player,i)=>player.id===String(i)))return {state,seats:kept.seats};
  forgetFjolspil(storage);
  return null;
}

export function forgetFjolspil(storage){
  try{storage.removeItem(SAVE_KEY);}catch{/* Storage is optional. */}
}
