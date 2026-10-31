import test from 'node:test';
import assert from 'node:assert/strict';
import { AVATARS, HOST_AVATAR, MOSI_AVATAR, avatarOf, cleanName, createSeats } from '../engine/fjolspil/seats.js';

test('the six friends are the avatars, with their pictures and colours', () => {
  assert.deepEqual(AVATARS.map(a => a.id), ['kambedla', 'sloedla', 'gramedla', 'thorsedla', 'flugedla', 'uggedla']);
  assert.equal(avatarOf('flugedla').colour, '#8ec5d6');
  assert.equal(avatarOf('uggedla').picture, 'assets/eitt/spinosaurus.webp');
  assert.equal(avatarOf('egill'), HOST_AVATAR);
  assert.equal(avatarOf('mosi'), MOSI_AVATAR);
  // Egill's seat has his own portrait, so he and Mosi are told apart at the Litla Yatzy table (2026-10-25).
  assert.equal(HOST_AVATAR.picture, 'assets/book/images/egill-render.webp');
});

test('Mosi is an avatar the computer may have and a guest may not', () => {
  const seats = createSeats();
  assert.equal(seats.join({ guestId: 'g1', name: 'Anna', avatar: 'mosi' }).reason, 'bad-avatar');
  assert.deepEqual(seats.addAi({ name: 'Mosi', avatar: 'mosi' }), { ok: true, seat: 1 });
  assert.equal(MOSI_AVATAR.picture, 'assets/book/images/mosi-render.webp');
});

test('a name is trimmed, collapsed and cut to 12', () => {
  assert.equal(cleanName('  Anna   Lísa '), 'Anna Lísa');
  assert.equal(cleanName('Þórunn Guðmundsdóttir'), 'Þórunn Guðmu');
  assert.equal(cleanName('   '), null);
  assert.equal(cleanName(42), null);
  assert.equal(cleanName('<b>hæ</b>'), '<b>hæ</b>', 'it is text; the screen shows it as text');
});

test('guests take seats after Egill, names that clash get a number, and the fifth is refused', () => {
  const seats = createSeats();
  assert.deepEqual(seats.list()[0], { seat: 0, name: 'Egill', avatar: 'egill', kind: 'host', guestId: null, present: true, covered: false });
  assert.deepEqual(seats.join({ guestId: 'g1', name: 'Anna', avatar: 'kambedla' }), { ok: true, seat: 1, name: 'Anna' });
  assert.deepEqual(seats.join({ guestId: 'g2', name: ' Anna ', avatar: 'sloedla' }), { ok: true, seat: 2, name: 'Anna 2' });
  assert.equal(seats.join({ guestId: 'g3', name: 'Bjarni', avatar: 'kambedla' }).reason, 'avatar-taken');
  assert.equal(seats.join({ guestId: 'g3', name: 'Bjarni', avatar: 'mosi' }).reason, 'bad-avatar');
  assert.equal(seats.join({ guestId: 'g3', name: '  ', avatar: 'gramedla' }).reason, 'bad-name');
  assert.equal(seats.join({ guestId: 'g3', name: 'Bjarni', avatar: 'gramedla' }).seat, 3);
  assert.equal(seats.join({ guestId: 'g4', name: 'Dóra', avatar: 'thorsedla' }).reason, 'full');
  assert.deepEqual(seats.available(), ['thorsedla', 'flugedla', 'uggedla']);
});

test('a guest that joins again keeps its seat and may change its avatar; a reserved avatar is nobody\'s', () => {
  const seats = createSeats({ reserved: ['thorsedla'] });
  seats.join({ guestId: 'g1', name: 'Anna', avatar: 'kambedla' });
  seats.join({ guestId: 'g2', name: 'Bjarni', avatar: 'sloedla' });
  assert.deepEqual(seats.join({ guestId: 'g1', name: 'Anna', avatar: 'gramedla' }), { ok: true, seat: 1, name: 'Anna' });
  assert.equal(seats.bySeat(1).avatar, 'gramedla');
  assert.deepEqual(seats.join({ guestId: 'g1', name: 'Anna', avatar: 'gramedla' }), { ok: true, seat: 1, name: 'Anna' }, 'her own avatar is not taken for her');
  assert.equal(seats.join({ guestId: 'g3', name: 'Dóra', avatar: 'thorsedla' }).reason, 'avatar-reserved');
  assert.deepEqual(seats.available(), ['kambedla', 'flugedla', 'uggedla']);
});

test('one AI at most, in the next free seat', () => {
  const seats = createSeats({ reserved: ['thorsedla'] });
  seats.join({ guestId: 'g1', name: 'Anna', avatar: 'kambedla' });
  assert.deepEqual(seats.addAi({ name: 'Þórseðla', avatar: 'thorsedla' }), { ok: true, seat: 2 });
  assert.equal(seats.addAi({ name: 'Þórseðla', avatar: 'thorsedla' }).reason, 'ai-already');
  assert.equal(seats.bySeat(2).kind, 'ai');
  seats.removeAi();
  assert.equal(seats.count, 2);
  seats.join({ guestId: 'g2', name: 'B', avatar: 'sloedla' });
  seats.join({ guestId: 'g3', name: 'C', avatar: 'gramedla' });
  assert.equal(seats.addAi({ name: 'Þórseðla', avatar: 'thorsedla' }).reason, 'full');
});

test('presence, cover and uncover; the lobby drops the absent and renumbers', () => {
  const seats = createSeats();
  seats.join({ guestId: 'g1', name: 'Anna', avatar: 'kambedla' });
  seats.join({ guestId: 'g2', name: 'Bjarni', avatar: 'sloedla' });
  seats.presence(1, false);
  seats.cover(1);
  assert.deepEqual(seats.bySeat(1), { seat: 1, name: 'Anna', avatar: 'kambedla', kind: 'ai', guestId: 'g1', present: false, covered: true });
  seats.presence(1, true);
  seats.uncover(1);
  assert.equal(seats.bySeat(1).kind, 'remote');
  seats.presence(1, false);
  assert.deepEqual(seats.dropAbsent(), [1]);
  assert.deepEqual(seats.list().map(s => [s.seat, s.name]), [[0, 'Egill'], [1, 'Bjarni']]);
  assert.equal(seats.byGuest('g2').seat, 1);
});

test('a snapshot restores the seats with every guest absent, and onChange fires once per change', () => {
  const seats = createSeats({ reserved: ['kambedla'] });
  let changes = 0;
  seats.onChange(() => changes++);
  seats.join({ guestId: 'g1', name: 'Anna', avatar: 'sloedla' });
  seats.addAi({ name: 'Kambeðla', avatar: 'kambedla' });
  assert.equal(changes, 2);
  const copy = createSeats({ from: seats.snapshot() });
  assert.deepEqual(copy.list().map(s => [s.name, s.kind, s.present]), [['Egill', 'host', true], ['Anna', 'remote', false], ['Kambeðla', 'ai', true]]);
  assert.deepEqual(copy.available(), ['gramedla', 'thorsedla', 'flugedla', 'uggedla']);
});

test('a guest\'s level comes with her hello and stays with her seat when she comes back', () => {
  const seats = createSeats();
  seats.join({ guestId: 'g1', name: 'Anna', avatar: 'thorsedla', level: 'fullordinn' });
  seats.join({ guestId: 'g1', name: 'Anna', avatar: 'thorsedla' });
  assert.equal(seats.bySeat(1).level, 'fullordinn');
});

test('setLevel changes a guest\'s level, never Egill\'s', () => {
  const seats = createSeats();
  seats.join({ guestId: 'g1', name: 'Anna', avatar: 'thorsedla', level: 'barn' });
  seats.setLevel(1, 'fullordinn');
  seats.setLevel(1, 'erfitt');
  seats.setLevel(0, 'fullordinn');
  assert.equal(seats.bySeat(1).level, 'fullordinn');
  assert.equal(seats.bySeat(0).level ?? null, null);
});

test('setLimit(3): a third guest is refused full', () => {
  const seats = createSeats();
  seats.setLimit(3);
  assert.equal(seats.join({ guestId: 'g1', name: 'Anna', avatar: 'sloedla' }).ok, true);
  assert.equal(seats.join({ guestId: 'g2', name: 'Bjarni', avatar: 'thorsedla' }).ok, true);
  assert.equal(seats.join({ guestId: 'g3', name: 'Cecilía', avatar: 'kambedla' }).reason, 'full');
});
