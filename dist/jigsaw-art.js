// Original vector illustrations authored for Mosi. No external images, fonts or assets.
const defs=`<defs>
 <linearGradient id="sky" x2="0" y2="1"><stop stop-color="#84c9ce"/><stop offset="1" stop-color="#fff0b4"/></linearGradient>
 <linearGradient id="night" x2="0" y2="1"><stop stop-color="#333e78"/><stop offset="1" stop-color="#df95a0"/></linearGradient>
 <linearGradient id="ground" x2="0" y2="1"><stop stop-color="#9bb45d"/><stop offset="1" stop-color="#335e4b"/></linearGradient>
 <linearGradient id="water" x2="0" y2="1"><stop stop-color="#76ced0"/><stop offset="1" stop-color="#3a819a"/></linearGradient>
 <linearGradient id="skin" x1="0" y1="0" x2=".2" y2="1"><stop stop-color="#9fc882"/><stop offset="1" stop-color="#477e66"/></linearGradient>
 <linearGradient id="hornskin" x2="0" y2="1"><stop stop-color="#6fc8c0"/><stop offset="1" stop-color="#347e87"/></linearGradient>
 <linearGradient id="plates" x2=".6" y2="1"><stop stop-color="#ffe4a0"/><stop offset=".5" stop-color="#db9857"/><stop offset="1" stop-color="#b86d51"/></linearGradient>
 <linearGradient id="bark" x2="1"><stop stop-color="#76563c"/><stop offset=".5" stop-color="#bd8b52"/><stop offset="1" stop-color="#634831"/></linearGradient>
 <radialGradient id="glow"><stop stop-color="#ffecae" stop-opacity=".85"/><stop offset="1" stop-color="#ffecae" stop-opacity="0"/></radialGradient>
 <pattern id="scales" width="17" height="13" patternUnits="userSpaceOnUse"><path d="M1 7Q5 2 9 7M10 12q4-5 8 0" fill="none" stroke="#173f42" stroke-opacity=".13" stroke-width="1.5"/></pattern>
 <g id="fern"><path d="M0 0Q-5-31 1-63" fill="none" stroke="#bdd587" stroke-width="3"/><g fill="#69a667" stroke="#386d51" stroke-width="1"><path d="M-1-13Q-37-11-36-30Q-16-33-1-13M-1-13Q30-12 36-33Q12-34-1-13M-1-30Q-28-28-26-46Q-10-45-1-30M-1-30Q23-29 26-47Q9-48-1-30M0-46Q-17-43-15-61Q-3-57 0-46M0-46Q17-48 16-64Q4-59 0-46"/></g></g>
 <g id="flower"><path d="M0 0V-27" stroke="#3c7d59" stroke-width="3"/><g fill="#f2a093"><ellipse cy="-33" rx="5" ry="10"/><ellipse cx="-9" cy="-26" rx="10" ry="5"/><ellipse cx="9" cy="-26" rx="10" ry="5"/><ellipse cy="-19" rx="5" ry="10"/></g><circle cy="-26" r="5" fill="#ffdf79"/></g>
 <g id="tree"><path d="M-22 210Q-8 100-21-55L23-61Q12 61 31 210Z" fill="url(#bark)"/><path d="M-3 182Q5 64-6-43M14 90Q13 27 17-37" stroke="#d4ad70" stroke-width="4" fill="none" opacity=".6"/><path d="M-5 40-60-9M13 18 61-30" stroke="#84603d" stroke-width="14" fill="none"/><g fill="#466f4d"><ellipse cx="-41" cy="-62" rx="65" ry="55"/><ellipse cx="35" cy="-71" rx="71" ry="55"/><ellipse cy="-111" rx="60" ry="53"/></g><g fill="#719652"><ellipse cx="-54" cy="-77" rx="43" ry="29"/><ellipse cx="28" cy="-106" rx="52" ry="27"/><ellipse cx="59" cy="-55" rx="38" ry="25"/></g><g fill="#a0b860" opacity=".8"><ellipse cx="-22" cy="-122" rx="27" ry="12"/><ellipse cx="55" cy="-89" rx="25" ry="10"/></g></g>
 </defs>`;
const eyes=(x,y)=>`<ellipse cx="${x}" cy="${y}" rx="10" ry="12" fill="#fff6dc"/><ellipse cx="${x+3}" cy="${y+1}" rx="5" ry="7" fill="#254d4b"/><circle cx="${x+5}" cy="${y-2}" r="2.3" fill="white"/>`;
function stego(){return `<g stroke="#3d6854" stroke-width="3" stroke-linejoin="round">
 <path d="M219 305Q123 348 37 267Q130 305 234 257" fill="#538970"/>
 <path d="m78 291-15-33 27 36m7 8 0-36 15 39m-18-5-11 26 23-22m7 1 5 22 7-25" fill="#f4d8a0" stroke="#977b50"/>
 <path d="M227 311 215 377 249 379 265 315M363 316 374 376 410 378 392 301" fill="#436e5a"/>
 <path d="m178 254 2-45 34-23 19 50 8-67 44-21 21 70 15-80 45 9 11 74 32-59 31 22-10 60 29-37 20 21-7 35" fill="url(#plates)" stroke="#a56f49"/>
 <ellipse cx="311" cy="277" rx="139" ry="75" fill="url(#skin)"/><ellipse cx="311" cy="277" rx="139" ry="75" fill="url(#scales)" stroke="none"/>
 <path d="M221 302 218 373Q218 394 242 392L274 392Q283 384 268 376L277 316M361 307 369 378Q370 394 392 393L426 393Q436 384 420 377L409 297" fill="url(#skin)"/>
 <path d="M407 250Q446 263 471 281L499 290Q523 296 548 290Q570 290 576 308Q571 328 545 334L514 332Q469 329 441 315L408 307" fill="url(#skin)"/>
 <path d="M513 320Q546 338 570 317" fill="#c7d2a0"/><path d="M542 318Q556 324 567 316" fill="none" stroke-width="2"/>
 ${eyes(540,305)}<ellipse cx="568" cy="305" rx="3" ry="2" fill="#2e5748" stroke="none"/>
 <path d="m236 388v-7m13 8v-8m141 8v-8m13 8v-8" stroke="#d9d8a8"/>
 <g fill="#376e59" stroke="none" opacity=".5"><ellipse cx="272" cy="257" rx="12" ry="8"/><ellipse cx="320" cy="235" rx="10" ry="7"/><ellipse cx="351" cy="271" rx="16" ry="10"/><ellipse cx="235" cy="283" rx="9" ry="5"/><ellipse cx="307" cy="305" rx="10" ry="7"/></g>
 <path d="M214 234Q310 188 387 226" fill="none" stroke="#d1dd95" stroke-width="5" opacity=".65"/>
 </g>`;}
function triceratops(){return `<g stroke="#315e69" stroke-width="3" stroke-linejoin="round">
 <path d="M274 314Q183 340 116 296Q168 320 272 270" fill="#367f88"/>
 <path d="M277 322 273 390 303 390 319 322M403 316 411 387 445 386 446 310" fill="#306d79"/>
 <ellipse cx="357" cy="299" rx="119" ry="77" fill="url(#hornskin)"/><ellipse cx="357" cy="299" rx="119" ry="77" fill="url(#scales)" stroke="none"/>
 <path d="M272 330 268 390Q271 405 298 401L324 401 321 388 325 336M388 332 389 391Q392 407 417 403L446 403 443 389 440 325" fill="url(#hornskin)"/>
 <path d="M420 331Q386 300 390 244L405 214 428 219 444 191 465 209 488 194 501 221 526 220 530 254 550 273Q541 313 514 337Z" fill="#4da3a8"/>
 <path d="M421 298Q408 260 431 236Q455 213 485 235Q514 251 518 285" fill="#e8bd70" stroke="#aa975b"/>
 <path d="M458 267Q491 242 514 267L526 294 557 313Q579 330 565 345Q542 361 503 346L473 332 445 309Z" fill="url(#hornskin)"/>
 <path d="M471 262Q456 217 447 198Q474 213 486 251M506 270Q511 221 526 204Q525 241 517 282" fill="#f7e2b1" stroke="#af9d6d"/>
 <path d="M548 311 557 284 564 322" fill="#fff0cc" stroke="#af9d6d"/>
 ${eyes(510,293)}<ellipse cx="561" cy="330" rx="3" ry="2" fill="#284e55" stroke="none"/>
 <path d="M527 340Q546 353 566 338" fill="none" stroke-width="2"/><path d="M502 345Q535 363 558 352" stroke="#a0cebb" stroke-width="7" fill="none"/>
 <g fill="#246b78" stroke="none" opacity=".45"><ellipse cx="295" cy="282" rx="14" ry="9"/><ellipse cx="345" cy="251" rx="18" ry="10"/><ellipse cx="376" cy="295" rx="12" ry="8"/><ellipse cx="330" cy="319" rx="10" ry="6"/></g>
 <path d="m282 398 1-7m14 8v-7m110 7 1-7m13 7v-7" stroke="#daead0"/></g>`;}
function bronto(){return `<g stroke="#655377" stroke-width="3" stroke-linejoin="round">
 <path d="M301 305C215 318 108 278 20 254C114 310 207 339 310 348Z" fill="#8f809d"/>
 <path d="M307 311 299 405 330 406 350 322M432 323 443 407 474 408 471 320" fill="#756986"/>
 <path d="M274 275Q308 233 365 244Q417 249 451 274Q469 269 478 231L493 185Q504 157 529 153L560 157Q579 160 582 177Q579 193 558 195L535 191Q523 195 523 216L529 285Q530 321 483 343Q399 377 296 339Z" fill="#afa0b7"/>
 <path d="M274 275Q308 233 365 244Q417 249 451 274Q469 269 478 231L493 185Q504 157 529 153L560 157Q579 160 582 177Q579 193 558 195L535 191Q523 195 523 216L529 285Q530 321 483 343Q399 377 296 339Z" fill="url(#scales)" stroke="none"/>
 <path d="M305 307 290 403Q292 421 318 419L345 419 344 405 356 320M421 328 422 405Q425 422 451 420L480 420 477 405 471 319" fill="#a89aaf"/>
 <path d="M534 188Q505 207 508 253Q516 309 459 332" fill="none" stroke="#d6c7c9" stroke-width="14"/>
 ${eyes(549,171)}<ellipse cx="576" cy="175" rx="3" ry="2" fill="#574768" stroke="none"/><path d="M552 188Q565 195 577 185" fill="none" stroke-width="2"/>
 <g fill="#827396" stroke="none" opacity=".6"><ellipse cx="338" cy="275" rx="17" ry="10"/><ellipse cx="383" cy="297" rx="12" ry="8"/><ellipse cx="434" cy="287" rx="9" ry="6"/><ellipse cx="494" cy="242" rx="6" ry="12"/><ellipse cx="509" cy="194" rx="5" ry="9"/></g><path d="m306 415v-8m14 10v-8m119 8v-8m14 8v-8" stroke="#e4d8c8"/></g>`;}
function landscape(night=false){return `<path fill="url(#${night?'night':'sky'})" d="M0 0H700V500H0Z"/>
 ${night?'<circle cx="575" cy="74" r="54" fill="url(#glow)"/><circle cx="575" cy="74" r="30" fill="#fff0bf"/><circle cx="563" cy="63" r="7" fill="#ead2a0"/>':'<circle cx="519" cy="84" r="112" fill="url(#glow)"/><circle cx="519" cy="84" r="35" fill="#ffedb2"/>'}
 <path d="M0 241Q85 181 153 211T310 184T454 212T700 166V401H0Z" fill="${night?'#67739a':'#90b5a0'}"/>
 <path d="M0 286Q147 211 301 248T527 231T700 255V455H0Z" fill="${night?'#526d80':'#6c9978'}"/>
 <g opacity=".42" fill="${night?'#364e65':'#527e69'}">${Array.from({length:16},(_,i)=>`<path d="M${i*48-5} 319v-112h8v112ZM${i*48-25} 243l24-70 27 70Z"/>`).join('')}</g>
 <path d="M0 363Q170 311 326 350T700 331V500H0Z" fill="url(#ground)"/>`;}
function foreground(night=false){return `<path d="M0 445Q170 420 308 453T700 427V500H0Z" fill="${night?'#345b59':'#3f7759'}"/>
 ${[[-4,490,1.6],[81,455,.85],[625,477,1.25],[701,496,1.7],[164,483,.7]].map(([x,y,s])=>`<use href="#fern" transform="translate(${x} ${y}) scale(${s})"/>`).join('')}
 ${[[129,472,1],[551,470,.85],[572,479,.72],[603,465,.95],[205,485,.62]].map(([x,y,s])=>`<use href="#flower" transform="translate(${x} ${y}) scale(${s})"/>`).join('')}
 <g fill="#e7bf83"><ellipse cx="475" cy="467" rx="21" ry="9"/><ellipse cx="471" cy="463" rx="18" ry="6" fill="#c49b71"/><ellipse cx="239" cy="455" rx="14" ry="6"/></g>
 <g stroke="#b8cf84" stroke-width="2.5" fill="none"><path d="m46 456-9-16m9 16 4-22m0 24 13-16M384 469l-7-23m7 23 5-28m0 30 11-19M649 446l-6-24m6 24 8-27"/></g>`;}
function forestScene(){return `${landscape()}<use href="#tree" transform="translate(55 163) scale(1.32)"/><use href="#tree" transform="translate(660 153) scale(1.5)"/>
 <path d="M49 424Q262 388 574 429L660 471Q359 423 135 478Z" fill="#c6ba7e"/>
 <ellipse cx="320" cy="386" rx="202" ry="23" fill="#244d42" opacity=".23"/>${stego()}
 <g transform="translate(441 151) rotate(-13)"><path d="M0 0Q-21-31-33-10Q-36 6-4 7Q-21 30-4 28Q9 21 1 3Q22 17 26 0Q24-18 1 0" fill="#e7a678" stroke="#916543" stroke-width="2"/><path d="M0-5 2 13" stroke="#745c3f" stroke-width="3"/></g>
 <g fill="#f2db91" opacity=".9"><circle cx="154" cy="103" r="3"/><circle cx="420" cy="91" r="2"/><circle cx="602" cy="227" r="3"/></g>${foreground()}`;}
function pondScene(){return `${landscape()}<use href="#tree" transform="translate(79 131) scale(1.07)"/><use href="#tree" transform="translate(666 153) scale(1.3)"/>
 <path d="M0 291Q111 275 237 310L328 402Q111 450 0 400Z" fill="url(#water)"/><g stroke="#b8e7d9" stroke-width="3" fill="none" opacity=".8"><path d="M22 327h113m-68 32h115M8 385h119m39 2h52"/><ellipse cx="178" cy="339" rx="28" ry="7"/></g>
 <g fill="#75a971" stroke="#376e60" stroke-width="2"><path d="M65 360a31 13 0 1 0 11-3l-11 8Z"/><path d="M180 337a24 10 0 1 0 8-1l-9 7Z"/></g>
 <g transform="translate(49 359)"><ellipse cy="-6" rx="10" ry="7" fill="#80ba65"/><circle cx="-6" cy="-13" r="5" fill="#b5d489"/><circle cx="6" cy="-13" r="5" fill="#b5d489"/><circle cx="-6" cy="-14" r="2" fill="#345448"/><circle cx="6" cy="-14" r="2" fill="#345448"/></g>
 <ellipse cx="371" cy="394" rx="168" ry="24" fill="#244d42" opacity=".24"/>${triceratops()}
 <g stroke="#58825b" stroke-width="4" fill="none"><path d="M25 414Q53 357 33 293M36 418Q56 372 76 312M654 402l-10-117m13 111 25-96"/></g><g fill="#b67e4c"><rect x="25" y="263" width="12" height="43" rx="6"/><rect x="69" y="287" width="12" height="33" rx="6"/><rect x="637" y="255" width="13" height="41" rx="6"/></g>
 <g transform="translate(163 209)"><ellipse rx="32" ry="7" fill="#d7eadf" transform="rotate(-19)"/><ellipse rx="32" ry="7" fill="#d7eadf" transform="rotate(19)"/><path d="M-8 0h28" stroke="#477c78" stroke-width="5"/><circle cx="-9" r="5" fill="#f4d382"/></g>${foreground()}`;}
function starsScene(){return `${landscape(true)}<g fill="#ffedbc">${Array.from({length:27},(_,i)=>{const x=30+(i*137)%635,y=23+(i*51)%178;return `<path d="M${x} ${y-4}l1.6 2.5 3.3 1.5-3.3 1.5L${x} ${y+5}l-1.6-3.5-3.3-1.5 3.3-1.5Z" opacity="${.55+i%3*.2}"/>`;}).join('')}</g>
 <use href="#tree" transform="translate(60 179) scale(1.42)"/><use href="#tree" transform="translate(690 189) scale(1.3)"/>
 <path d="M0 393Q127 362 227 390T421 401T700 371V445H0Z" fill="#5b887b"/>
 <ellipse cx="369" cy="412" rx="168" ry="22" fill="#243f4c" opacity=".3"/>${bronto()}
 <g fill="#f8e3a0">${Array.from({length:12},(_,i)=>`<circle cx="${84+i*49}" cy="${352+i%3*26}" r="${1.8+i%2}"/>`).join('')}</g>
 <g transform="translate(602 209)"><path d="M0 0Q-31-14-48 4L-21 7Q-21 21-6 18L0 10 9 17Q28 17 27 7L49 0Q18-13 5 0" fill="#caa39f" stroke="#8b7084" stroke-width="2"/><path d="M-2 4 12-7 23-3 9 7Z" fill="#e3bcab"/></g>${foreground(true)}`;}
const image=content=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 500" width="700" height="500">${defs}${content}</svg>`;
export const JIGSAW_PICTURES=Object.freeze([
 {id:'golden-forest',name:'Kambeðla í gullskógi',alt:'Kambeðla með gylltar bakplötur gengur milli hárra trjáa, burkna og blóma.',svg:image(forestScene())},
 {id:'secret-pond',name:'Þríhyrna við tjörnina',alt:'Þríhyrna með þrjú horn og breiðan hálsskjöld stendur við bláa tjörn með froski og drekaflugu.',svg:image(pondScene())},
 {id:'starry-valley',name:'Þórseðla undir stjörnum',alt:'Þórseðla með langan háls og langan, mjókkandi hala stendur í dal undir stjörnum og tungli; lítil flugeðla svífur hjá.',svg:image(starsScene())},
]);
