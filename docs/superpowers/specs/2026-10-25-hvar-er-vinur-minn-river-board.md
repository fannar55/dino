# Hvar er vinur minn? — river board review slice

## Owner's review boundary

The owner approved the larger woodland-board mock and asked to build the leaf
clearing, river and tree bridge first. Rebuilding the environment is explicitly
preferred over preserving the previous layout where it improves the result.
Stop after the crossing is playable and let the owner review it. Do not add the
Stegosaurus bark-building task or another level in this slice.

The approved visual reference is saved at
`qa/memory/large-board/approved-mock.png`. It is art direction, not a screenshot
of the implemented game. The goal is its readable continuous landscape,
large-scale cooperative obstacle, warm lighting and distinct destination.

## Composition and play

- A foreground sandy clearing contains six broad, domed leaf hiding places.
- Mosi stands beside the clearing. Natural resting patches replace woven
  baskets for the three found pairs.
- A shallow blue-green river crosses the upper board diagonally. Readable banks,
  grounded rocks, moving surface accents and quiet water ambience establish it
  as a real boundary between two pieces of playable ground.
- Two Brontosaurus lift the connected overhanging branch. The player can keep
  matching while they hold it, or lower it again.
- Two Triceratops move the substantial fallen trunk into a permanent bridge.
  The trunk rests on both banks and has a continuous traversable upper surface.
- Selecting the berry grove sends all four helpers over that actual surface.
  They finish on dry ground beside the berries. The completed memory round and
  crossing finish this review slice.

The existing card rules and bridge state machine remain authoritative. Scene
animation uses the shared game clock, so pause and reduced motion remain useful.
Existing local character and voice assets are reused; no new paid generation is
required. Final young Brontosaurus/Stegosaurus models remain a separate art pass.

## Shared geometry

Bridge near end: `(-1, -3)`; far end: `(4, -9)` in world X/Z; river centre
`(1.5, -6)`. The log is approximately 7.8 m long with a broad walking surface.
The grove is centred near `(5.4, -12.1)`. The world and adventure share the river
shape and expose deck/bank metadata so tests measure the rendered route rather
than assuming a north/south crossing.

The six leaf centres use columns `-5.2, -2, 1.2` and rows `1.2, 4.4`. Home
anchors are Triceratops `(-.2, -1.5)`, Brontosaurus `(-3.7, -2.1)` and Stegosaurus
`(4, 3.7)`. Camera fitting must keep all usable targets readable and clear of
the interface on landscape desktop, portrait tablet and phone.

## Acceptance

Review the initial board, held branch, constructed bridge, crossing and far-bank
arrival visually. Check character-ground and character-prop contact, bank seams,
water clipping and unobstructed target placement. The original gameplay checks
still apply: both discovery orders, mismatch, play while holding, lower/reopen,
pause, restart during actions, reduced motion, early crossing, and final ending.

Measure actual helper positions throughout the approach and crossing: none may
walk on open water, all four must traverse the deck and reach the dry destination.
The tablet scene target remains 250k submitted triangles and 100 draw calls.
These are rendering budgets, not proof of a frame rate on physical tablet hardware.
Save a new report separately from the previous small-board review evidence.
