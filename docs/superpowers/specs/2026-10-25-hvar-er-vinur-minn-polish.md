# Hvar er vinur minn? — hljóð, efni og líkamsbil

Næsti samþykkti áfangi eftir þriggja verkefna leikinn. Eigandinn bað sérstaklega
um lag, hljóð, VFX, betri GFX og minna clipping milli dýra og hluta og heimilaði
ElevenLabs með lyklinum í umhverfisbreytum til að gera hljóð og tónlist.

## Afmörkun

- Sama þriggja verkefna ferð: grein, trjábrú, barkarleið og allir sex í berjalund.
- Rýmra laufarjóður og hvíldarstaðir samkvæmt raunverulegri stærð módelanna.
- Leiðir taka mið af líkama, höfði og hala, hlutum og öðrum ferðalöngum. Raunveruleg
  snerting við grein, bol og börk er aðgreind frá óviljandi skörun.
- Skýrari yfirborð vatns, viðar og laufa, mýkri lýsing og aðgerðatengd lauf- og
  rykáhrif. Áhrif og hljóðfótspor fylgja hreyfingu, hléi og stillingu minni hreyfingar.
- Eitt nýtt upprunalegt instrumental lag, 15 staðbundnar ElevenLabs hljóðskrár og
  11 nýjar eða endurgerðar Mosa-setningar. Fyrirliggjandi 3 viðeigandi setningar
  haldast; talsetningarsafnið inniheldur samtals 14 setningar.

## Hljóðvinnsla

ElevenLabs bjó til 48 sekúndna tónlistargrunn sem var unninn í 45 sekúndna lykkju.
Hljóðáhrifin ná yfir tegundaköll, lauf, fóta- og viðarhljóð, byggingu, vatn og
stuttar staðfestingar. Frumskrár eru varðveittar eftir innihaldshakki svo venjuleg
endurkeyrsla noti ekki inneign aftur. Lykill er eingöngu lesinn úr
`ELEVENLABS_API_KEY` í framleiðsluskriftum og fer aldrei í vafrakóða eða skrár.

Talsetning notaði staðfesta Mosa-rödd, íslensku og Eleven v4. Nýja lotan var
624 stafir í 11 setningum. Tónlist og áhrif notuðu eina afmarkaða 16 beiðna lotu,
án gjaldskyldra endurtekninga. Þekkt kostnaðargildi fyrir áhrif var 310 credits;
tónlistarviðmótið skilaði ekki kostnaðargildi og það er ekki áætlað sem staðreynd.

Tónlist heldur hóflegum styrk meðan unnið er og lækkar sérstaklega undir tali.
Hlé heldur spilunarstöðu. Falin síða þaggar einnig hjálpartal. Ný snerting getur
endurvirkjað tónlist ef vafrinn hafnaði sjálfvirkri spilun. Synthetísk varahljóð
halda leiknum starfhæfum ef staðbundin upptaka vantar.

## Sannprófun

Fyrri heimild að aðeins fæturnir séu á þurru er ekki næg fyrir clipping. Nýtt
eftirlit mælir stutta snúna kassa eftir raunverulegum beinum og skin-þyngdum,
með sýnilegum líkamshlutum, viðarbol, grein, laufum, Mosa og borinni fjöl.
Leiðréttingar þurfa bæði tölulegar mælingar og skoðun á atburðarásinni.

Hljóð er prófað með afkóðun, hámarksgildi, lengd, lykkjum, raunverulegri vafraspilun
og líftíma hlés/hljóðrofa/endurræsingar. Slík próf koma ekki í stað þess að eigandinn
hlusti og meti tónlistar- og hljóðstíl. Skjástærðir og teiknibudget haldast við
fyrra viðmið, 250 þúsund þríhyrninga og 100 draw calls í tablet stillingu.

Varðveittur grunnur: `qa/memory/three-step-before-polish/`.
Ný gögn: `qa/memory/polish/` og `qa/memory/soundscape-generation/`.
