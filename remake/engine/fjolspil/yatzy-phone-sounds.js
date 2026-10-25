// The phone's one sound in Litla Yatzy (spec §6, "Hljóð"): a little rattle of dice as a roll lands, on whoever's turn it is,
// so the phone in her hand (the cup, the owner's decision of 2026-10-24) sounds with the dice on the big screen (the table).
// guest-yatzy.js plays it through the guest page's own effects (guest.js's audio.effects, made on the page's audio context
// at the first touch), the same family as Eitt!'s effects on the device. Never a voice and never music: those are the big
// screen's.

export const YATZY_PHONE_SFX = ['rattle'];

/** The least time, in audio seconds, between two rattles: one roll is one rattle, however many views bring it. */
export const YATZY_PHONE_GAPS = { rattle: 0.3 };

/**
 * One sound per name in YATZY_PHONE_SFX, for createSfx's `sounds`. It gets the effects' tools (tone, noise, bell and the key)
 * as eittSounds does; dice on a tray are knocks with no pitch, so the rattle needs only noise.
 */
export function yatzyPhoneSounds({ noise }) {
  return {
    // The dice land: four short, bright knocks over about 300 ms, unevenly spaced and fading, as dice tumbling to rest.
    rattle() {
      for (const [delay, frequency, level] of [[0, 3200, 0.11], [0.07, 2600, 0.09], [0.16, 3500, 0.07], [0.27, 2900, 0.05]]) {
        noise({ kind: 'white', type: 'bandpass', frequency, end: frequency * 0.7, q: 2.4, duration: 0.035, level, attack: 0.002, delay });
      }
    },
  };
}
