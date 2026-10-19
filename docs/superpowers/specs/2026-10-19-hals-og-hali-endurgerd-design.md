# „Háls og hali“ flutt í endurgerðina (kemur í stað 2026-10-18-hals-og-hali-design.md)

Eigandinn ákvað þetta 19. október 2026. Grunnurinn er codex-útgáfan á greininni `codex/dino-board-adventure` (vinnutré `C:/Risaeðla/dino-board-adventure`, óvistaðar skrár í `dist/board-*.js`).

## 1. Markmið

Bæta codex-útgáfuna og flytja hana inn í endurgerðina (`remake/`). Þá er hún hluti af sama leik og kafli 1, bókin og „Eitt!“:
- sama útlit;
- sömu þrívíðu dýr;
- sömu raddir og hljóð;
- opnast frá Leikir-síðu bókarinnar.

## 2. Ákvarðanir eigandans (19. október 2026)

- **Endurgerðin:** leikurinn er fluttur í endurgerðina, ekki lagaður í gamla leiknum.
- **Það sem á að bæta:**
  - eðlurnar, betri og með meiri hreyfingum;
  - sjónbrellur, hljóðbrellur og tal;
  - viðmótið, sem á að líta út eins og í „Eitt!“, svo leikirnir séu samhæfðir.
- **Viðbót:** steingervingasafn.
- **Síðar sama dag:**
  - lag C (ukulele, sílófónn og blokkflauta) í samfelldum hring;
  - Mosi telur hoppin aðeins í fyrstu umferð hvers barns, og aðeins þegar tveir spila;
  - hálsar og halar í eðlilegum hlutföllum, sýnilegir og án klippingar, og meira bil milli stalla;
  - löngu leiðirnar tvær haldast;
  - 100 reitir;
  - lenda þarf nákvæmlega á 100, annars skoppar peðið til baka;
  - alltaf Ævintýraskógur (ekkert val um ham), og hvorki „Rólegra“ né „Kasta“: teningurinn einn kastar.

## 3. Það sem haldið er úr codex-útgáfunni

- **Borðið:** 100 reitir á fimm stöllum, 20 á hverjum, séð frá hlið (eigandinn breytti úr 80 reitum codex-útgáfunnar 19. október). Farið er til skiptis vinstri–hægri og hægri–vinstri, upp stallana, og um 7 metrar eru milli stalla svo þórseðlurnar njóti sín.
- **Leiðirnar:** fimm eða sex hálsar upp og jafnmargir halar niður, í anda codex-útgáfunnar en endurraðaðar fyrir 100 reiti. Flestar ná einn stall. Ein löng leið nær tvo stalla upp (háls Burkna) og önnur tvo stalla niður (hali Lyngs), og þar eru stórir, eldri risar.
- **Reglurnar:**
  - teningur 1–6;
  - aðeins lokareitur kasts virkjar háls, hala eða atburð;
  - lenda þarf nákvæmlega á 100: of hátt kast fer upp á 100 og skoppar til baka um það sem umfram er (97 + 5 → 98), og Mosi segir „Úps, of langt! Við skoppum til baka.“ (eigandinn breytti þessu 19. október);
  - sex gefur ekki aukakast.
- **„Ævintýraskógur“,** alltaf á: ljósflugur (+2 reitir), leðja (−2) og steingervingar.
- **Leikmenn:** einn á móti tölvu (Þórseðla), eða 2–4 á sama tæki.
- **Myndavélin:** fylgir peðinu eða sýnir allt borðið.
- **Hlé og vistun** leiks í gangi. „Rólegra“-hamurinn er farinn: rólegri hreyfingar koma aðeins af sjálfu sér þegar tækið biður um minni hreyfingu.

## 4. Það sem verður betra

- **Eðlurnar** eru alvöru þrívíddarlíkön leiksins (`remake/assets/characters/`), ekki heimasmíðaðar.
  - **Þórseðlur (brontosaurus):** hálsarnir og halarnir. Þær anda, líta á peðin, beygja hálsinn niður og lyfta, sveifla halanum og fagna.
  - **Peðin:** Egill á Mosa, og í fjölspili vinirnir (t.d. Kambeðla).
  - **Bakgrunnur:** dýr kafla 1 sem fá að vera með.
- **Viðmótið** líkist „Eitt!“ og bókinni: Nunito, pappír og límbandsmyndir, upphleyptir hnappar minnst 88 punktar, litir úr STYLE.md, og hreyfingar með transform og opacity. Uppsetningarglugginn (hverjir spila) er í sama stíl.
- **Tal** (ElevenLabs v4, aðeins ein rödd í einu):
  - Mosi telur og hvetur: „Teldu með! Einn, tveir…“;
  - Þórseðla, með rödd Björns, segir stuttar setningar: „Upp á hálsinn minn!“, „Vúúú, niður halann!“, „Steingervingur!“.
- **Hljóð** í tóntegund leiksins: teningur, fótatak, hálsahljómur sem hækkar, rennsli, skvetta, fögnuður. Lag í samfelldum hring, sem eigandinn velur.
- **Sjónbrellur:** ryk og lauf við hvert skref, glitur á leiðum, skvettur við lendingu, flugeldar við sigur. Fiðrildi og flugeðlur bregðast við.

## 5. Steingervingasafn

- Á borðinu eru steingervingar og egg sem barnið finnur með því að lenda á þeim.
- Hvert nýtt atriði fer í safn í bókinni sem límmiði og helst þar á milli leikja.
- Í safninu eru 8 atriði:
  - ammónít;
  - þríbroti;
  - risaeðlutönn;
  - fótspor;
  - steingert laufblað;
  - raf með flugu;
  - risaeðluegg;
  - beinagrind.
- Á hverju borði eru nokkur þeirra, svo það borgar sig að spila aftur.
- Pikk á límmiða í safninu lætur sögumanninn segja nafnið og eina stutta staðreynd.

## 6. Tækni

- **Reglurnar** eru fluttar úr `dist/board-rules.js` í `remake/engine/hals/rules.js`, með einni prófunarskrá. Þær koma í stað 50 reita reglnanna frá 18. október.
- **Heimurinn** er þrívíð sena í endurgerðinni, með skógi, ljósi og persónum hennar. Hún opnast úr bókinni og stöðvar kaflann.
- **Afköstin:** hámark spjaldtölvunnar gildir: 6 ms GPU, 100 köll og 250 þúsund þríhyrningar.
- **Hljóð og raddir:**
  - hljóðin fara um sama kerfi og í „Eitt!“;
  - raddirnar eru í línusafninu `hals`.
- **Prófun:** eigandinn prófar með því að spila.
