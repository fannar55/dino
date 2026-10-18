// A small stand-in for the DOM, so the screen layer (the tray, the journal) can be tested in Node:
// elements with the few properties those modules use, and real events that reach the listeners added
// to the element. Layout does not exist here; a test gives an element its `rect` when a module reads it.

export class FakeElement extends EventTarget {
  constructor(doc, tag = 'div', id = '') {
    super();
    this.ownerDocument = doc;
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentNode = null;
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
    this.attributes = new Map();
    this.rect = { left: 0, top: 0, width: 0, height: 0 };
    this.captured = new Set();
    this.style = {
      setProperty(name, value) { this[name] = String(value); },
      removeProperty(name) { delete this[name]; },
      getPropertyValue(name) { return this[name] ?? ''; },
    };
    const names = new Set();
    this.classList = {
      add: (...list) => list.forEach(n => names.add(n)),
      remove: (...list) => list.forEach(n => names.delete(n)),
      contains: n => names.has(n),
      toggle(n, force = !names.has(n)) {
        if (force) names.add(n);
        else names.delete(n);
        return force;
      },
    };
    Object.defineProperty(this, 'className', {
      get: () => [...names].join(' '),
      set: value => {
        names.clear();
        String(value).split(/\s+/).filter(Boolean).forEach(n => names.add(n));
      },
    });
  }

  appendChild(node) {
    node.remove();
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }

  getBoundingClientRect() {
    const { left, top, width, height } = this.rect;
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
  }

  setPointerCapture(id) { this.captured.add(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  hasPointerCapture(id) { return this.captured.has(id); }

  /** Every element below this one (itself excluded), depth first, that the test's predicate accepts. */
  findAll(test) {
    const found = [];
    for (const child of this.children) {
      if (test(child)) found.push(child);
      found.push(...child.findAll(test));
    }
    return found;
  }

  /** Only `.class` selectors: all the screen layer asks for. */
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const name = selector.replace(/^\./, '');
    return this.findAll(element => element.classList.contains(name));
  }
}

export class FakeDocument extends EventTarget {
  /** `ids` are the elements the page already has, as index.html does. */
  constructor(ids = []) {
    super();
    this.byId = new Map();
    this.created = 0;
    this.heard = new Map(); // event type -> the functions listening on the document
    this.body = new FakeElement(this, 'body');
    for (const id of ids) this.add(id);
  }

  addEventListener(type, fn, options) {
    if (!this.heard.has(type)) this.heard.set(type, new Set());
    this.heard.get(type).add(fn);
    super.addEventListener(type, fn, options);
  }

  removeEventListener(type, fn, options) {
    this.heard.get(type)?.delete(fn);
    super.removeEventListener(type, fn, options);
  }

  /** How many functions listen to the document for an event type. */
  listenerCount(type) {
    return this.heard.get(type)?.size ?? 0;
  }

  add(id, tag = 'div') {
    const element = new FakeElement(this, tag, id);
    this.byId.set(id, element);
    return element;
  }

  createElement(tag) {
    this.created++;
    return new FakeElement(this, tag);
  }

  getElementById(id) {
    return this.byId.get(id) ?? null;
  }
}

/** A pointer event as the page receives it: a plain Event with the fields the screen layer reads. */
export function pointerEvent(type, { id = 1, x = 0, y = 0, button = 0 } = {}) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: id },
    clientX: { value: x },
    clientY: { value: y },
    button: { value: button },
  });
  return event;
}
