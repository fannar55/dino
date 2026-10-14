import test from 'node:test';
import assert from 'node:assert/strict';
import {freshProgress,evolve,restoreProgress} from '../dist/progress.js';
import {GAME_SPECIES,statueCount,restoreGames} from '../dist/mini-progress.js';
import {starCount} from '../dist/exploration.js';
const encountered = () => ({...freshProgress(),stage:'complete',index:5,found:[...GAME_SPECIES]});
test('statue rewards survive reload and replays preserve the original stars',()=>{
 let state=encountered(),before=starCount(state);
 for(const species of GAME_SPECIES)state=evolve(state,{type:'WIN_MINIGAME',species});
 state=evolve(state,{type:'WIN_MINIGAME',species:'trex'});
 assert.equal(statueCount(state),6);assert.equal(state.games.trex.wins,2);assert.equal(starCount(state),before);
 assert.deepEqual(restoreProgress(JSON.stringify(state)),state);
});
test('old saves migrate without inventing statues or losing adventures',()=>{
 const state=encountered();delete state.games;
 assert.deepEqual(restoreProgress(JSON.stringify(state)).games,{});
});
test('locked, invalid and corrupt rewards never become collection items',()=>{
 const state=freshProgress();assert.equal(evolve(state,{type:'WIN_MINIGAME',species:'trex'}),state);
 assert.deepEqual(restoreGames({trex:{wins:2},stegosaurus:{wins:Infinity},spinosaurus:{wins:-1},pteranodon:{wins:'3'}},['stegosaurus','spinosaurus','pteranodon']),{});
 assert.deepEqual(restoreGames({trex:{wins:100000}},['trex']),{trex:{wins:9999}});
});
