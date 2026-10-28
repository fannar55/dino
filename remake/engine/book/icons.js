// The book's drawn icons, one stroke weight each, coloured by the control they sit in (book.css: .book-icon and .book-arrow).
// They are markup for a button's innerHTML; the shell (book.js), the card (card-viewer.js) and the zoom (zoom.js) share them. The Risaeðlur
// ribbon has no drawn icon: it shows Mosi's render (book.js).

export const ICONS = {
  animals: '<svg class="book-icon" viewBox="0 0 48 48" aria-hidden="true"><ellipse class="icon-fill" cx="24" cy="34" rx="10.5" ry="9.5"/><ellipse class="icon-fill" cx="24" cy="11" rx="5.4" ry="7.2"/><ellipse class="icon-fill" cx="11.6" cy="16.6" rx="5.2" ry="7" transform="rotate(-30 11.6 16.6)"/><ellipse class="icon-fill" cx="36.4" cy="16.6" rx="5.2" ry="7" transform="rotate(30 36.4 16.6)"/></svg>',
  games: '<svg class="book-icon" viewBox="0 0 48 48" aria-hidden="true"><rect class="icon-fill" x="7" y="11" width="21" height="29" rx="4.5" transform="rotate(-13 17.5 25.5)"/><rect class="icon-fill" x="20" y="8" width="21" height="29" rx="4.5" transform="rotate(11 30.5 22.5)"/><path d="M30.5 15.8l2 4.1 4.5.6-3.3 3.2.8 4.4-4-2.1-4 2.1.8-4.4-3.3-3.2 4.5-.6z" fill="#f2b630" stroke="#3b2f25" stroke-width="1.8" transform="rotate(11 30.5 22.5)"/></svg>',
  // A compass rose: the map's ribbon, Kortið; its north point in the journal's orange.
  map: '<svg class="book-icon" viewBox="0 0 48 48" aria-hidden="true"><circle class="icon-fill" cx="24" cy="24" r="17.5"/><path class="icon-fill" d="M24 5l4 15 15 4-15 4-4 15-4-15-15-4 15-4z"/><path d="M24 6.5l3.2 13.2h-6.4z" fill="#e07a3f" stroke="#3b2f25" stroke-width="1.8" stroke-linejoin="round"/><circle cx="24" cy="24" r="2.6" fill="#3b2f25" stroke="none"/></svg>',
  fossils: '<svg class="book-icon" viewBox="0 0 48 48" aria-hidden="true"><circle class="icon-fill" cx="24" cy="25" r="17"/><path d="M24 25a3 3 0 0 1 6 0a6 6 0 0 1-12 0a9 9 0 0 1 18 0a12 12 0 0 1-24 0" style="stroke:#3b2f25" stroke-width="3"/></svg>',
  close: '<svg class="book-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M13 13.5C19 20 28 28.5 35 35M35 13C28.5 20 20 28 13 35" stroke-width="6.5"/></svg>',
  back: '<svg class="book-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M36 38V26c0-8.5-6-13.5-14-13.5H11" stroke-width="6"/><path d="M19 4.5l-8.5 8 8.5 8" stroke-width="6"/></svg>',
  speaker: '<svg class="book-icon" viewBox="0 0 48 48" aria-hidden="true"><path class="icon-fill" d="M6.5 18H14l9.6-8.2c1.3-1.1 3.4-.2 3.4 1.5v25.4c0 1.7-2.1 2.6-3.4 1.5L14 30H6.5C5.1 30 4 28.9 4 27.5v-7C4 19.1 5.1 18 6.5 18z"/><path d="M32.5 18.5c2.6 3.3 2.6 7.7 0 11" stroke-width="4.5"/><path d="M37.5 13c5.4 6.3 5.4 15.7 0 22" stroke-width="4.5"/></svg>',
  info: '<svg class="book-icon" viewBox="0 0 48 48" aria-hidden="true"><circle class="icon-dot" cx="24" cy="24" r="21"/><circle class="icon-i" cx="24" cy="14.5" r="3.4"/><path class="icon-i" d="M24 22v13" stroke-width="5.5"/></svg>',
  // The card's big arrow points right; the previous arrow mirrors it (book.css).
  arrow: '<svg class="book-arrow" viewBox="0 0 120 100" aria-hidden="true"><path class="arrow-side" d="M16 32c-4 12-4 24 0 36l40 1v15c0 8 7 11 13 6l40-34c4-4 4-8 0-12L69 10c-6-5-13-2-13 6v15z" transform="translate(0 7)"/><path class="arrow-face" d="M16 32c-4 12-4 24 0 36l40 1v15c0 8 7 11 13 6l40-34c4-4 4-8 0-12L69 10c-6-5-13-2-13 6v15z"/><path class="arrow-shine" d="M23 42c12-1.5 23-1.5 32-1M68 21l26 20"/></svg>',
};
