// The scene's screen layer: captions, choice buttons and the fade. The look is a placeholder until
// the explorer's-journal UI pass (STYLE.md section 10); the behaviour stays.
export function createStageUI(doc = document) {
  const captionEl = doc.getElementById('caption');
  const speakerEl = captionEl.querySelector('.caption-speaker');
  const textEl = captionEl.querySelector('.caption-text');
  const choicesEl = doc.getElementById('choices');
  const fadeEl = doc.getElementById('fade');
  let fadeLevel = Number(getComputedStyle(fadeEl).opacity) || 0;
  let captionId = 0;

  /**
   * Show a line (speaker name in their colour) and return its id for clearCaption, or hide
   * whatever shows with caption(null).
   */
  function caption(speaker, text, colour) {
    captionId++;
    if (speaker == null && text == null) {
      captionEl.hidden = true;
      return captionId;
    }
    speakerEl.textContent = speaker ?? '';
    speakerEl.style.color = colour ?? '';
    textEl.textContent = text ?? '';
    captionEl.hidden = false;
    return captionId;
  }

  /** Hide a caption only if it is still the one showing. */
  function clearCaption(id) {
    if (id === captionId) captionEl.hidden = true;
  }

  function showChoices(list, onPick) {
    choicesEl.replaceChildren(...list.map((option, i) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      if (i === 0) button.className = 'primary';
      button.addEventListener('click', () => onPick?.(option.value));
      return button;
    }));
    choicesEl.hidden = false;
  }

  function hideChoices() {
    choicesEl.hidden = true;
    choicesEl.replaceChildren();
  }

  /** Show the options and resolve with the value the player taps. */
  function choose(list) {
    return new Promise(resolve => {
      showChoices(list, value => {
        hideChoices();
        resolve(value);
      });
    });
  }

  function setFade(level) {
    fadeLevel = Math.min(1, Math.max(0, level));
    fadeEl.style.opacity = String(fadeLevel);
  }

  return {
    caption,
    clearCaption,
    choose,
    showChoices,
    hideChoices,
    setFade,
    get fadeLevel() { return fadeLevel; },
    reset() {
      caption(null);
      hideChoices();
    },
  };
}
