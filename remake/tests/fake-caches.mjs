// A Cache Storage for the tests of the app's offline store (remake/sw.js, remake/engine/offline/): named caches of answers,
// each keyed by the absolute address of its request, as the browser keys them. A relative address is read against `origin`.
// Answers are kept as given and handed out as clones, so each can be read more than once.

export function createCaches(origin = 'https://mosi.example') {
  const named = new Map();
  const keyOf = request => new URL(typeof request === 'string' ? request : request.url, origin).href;

  function cacheFor() {
    const entries = new Map();
    return {
      entries,
      async match(request) { const found = entries.get(keyOf(request)); return found ? found.clone() : undefined; },
      async put(request, response) { entries.set(keyOf(request), response.clone()); },
      async delete(request) { return entries.delete(keyOf(request)); },
      async keys() { return [...entries.keys()].map(url => new Request(url)); },
    };
  }

  return {
    named,
    async open(name) { if (!named.has(name)) named.set(name, cacheFor()); return named.get(name); },
    async delete(name) { return named.delete(name); },
    async keys() { return [...named.keys()]; },
    async has(name) { return named.has(name); },
  };
}
