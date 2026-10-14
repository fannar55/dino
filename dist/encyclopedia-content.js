// Original Icelandic prose for Safn Egils. Dates are millions of years ago;
// equal endpoints mean a sourced approximate date, not a known whole lifespan.
// Generic living friends intentionally have no invented species size or age.
const REFERENCES = {
  tric: ['Natural History Museum: Triceratops', 'https://www.nhm.ac.uk/discover/dino-directory/triceratops.html'],
  tricStory: ['American Museum of Natural History: Triceratops horridus', 'https://www.amnh.org/explore/ology/ology-cards/010-triceratops-horridus'],
  tricSkull: ['American Museum of Natural History: Triceratops skeleton', 'https://www.amnh.org/exhibitions/permanent/ornithischian-dinosaurs/triceratops'],
  stego: ['Natural History Museum: Stegosaurus', 'https://www.nhm.ac.uk/discover/dino-directory/Stegosaurus.html'],
  stegoBody: ['Natural History Museum: A Stegosaurus brought to life', 'https://www.nhm.ac.uk/discover/stegosaurus-brought-to-life.html'],
  stegoBrain: ['American Museum of Natural History: Stegosaurus skeleton', 'https://www.amnh.org/exhibitions/permanent/ornithischian-dinosaurs/stegosaurus'],
  stegoSophie: ['Natural History Museum: Sophie', 'https://www.nhm.ac.uk/press-office/press-releases/world_s-most-complete-stegosaurus-goes-on-show.html'],
  bronto: ['Natural History Museum: Brontosaurus', 'https://www.nhm.ac.uk/discover/brontosaurus-reinstating-a-prehistoric-icon.html'],
  yale: ['Yale: A new pose for historic dinosaur skeletons', 'https://news.yale.edu/2022/11/11/strike-pose-yales-iconic-dinosaur-skeletons-get-new-look'],
  brontoName: ['Íslensk orðabók: þórseðla', 'https://islenskordabok.arnastofnun.is/ord/47330'],
  rex: ['Natural History Museum: Tyrannosaurus', 'https://www.nhm.ac.uk/discover/dino-directory/tyrannosaurus.html'],
  rexArms: ['Natural History Museum: Tyrannosaurus arms', 'https://www.nhm.ac.uk/discover/how-did-tyrannosaurus-use-its-arms.html'],
  rexFingers: ['American Museum of Natural History: Ask a scientist about T. rex', 'https://www.amnh.org/explore/ology/paleontology/ask-a-scientist-about-t-rex'],
  sue: ['Field Museum: SUE the T. rex', 'https://www.fieldmuseum.org/blog/sue-t-rex'],
  spino: ['Field Museum: Spinosaurus cast and its fossils', 'https://www.fieldmuseum.org/about/press/field-museum-announces-vote-to-name-new-spinosaurus'],
  spinoDebate: ['Myhrvold and colleagues, 2024: Diving dinosaurs?', 'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0298957'],
  spinoBones: ['Field Museum: Studying dense spinosaur bones', 'https://www.fieldmuseum.org/about/press/dense-bones-allowed-spinosaurus-hunt-underwater'],
  spinoSail: ['University of Colorado Museum: Dinosaur object guide', 'https://www.colorado.edu/cumuseum/sites/default/files/attached-files/dinosaurannotatedobjectlist.pdf'],
  spinoHistory: ['Natural History Museum: A history of spinosaurs', 'https://www.nhm.ac.uk/discover/how-did-baryonyx-change-what-we-knew-about-spinosaurs.html'],
  para: ['Natural History Museum: Parasaurolophus', 'https://www.nhm.ac.uk/discover/dino-directory/parasaurolophus.html'],
  paraSound: ['Sandia National Laboratories: Modelling a Parasaurolophus call', 'https://newsreleases.sandia.gov/scientists-use-digital-paleontology-to-produce-voice-of-parasaurolophus-dinosaur/'],
  paraPhoto: ['Wikimedia Commons: Parasaurolophus cyrtocristatus at the Field Museum', 'https://commons.wikimedia.org/wiki/File:Parasaurolophus_at_FMNH.jpg'],
  ptera: ['American Museum of Natural History: Pteranodon longiceps', 'https://www.amnh.org/explore/ology/ology-cards/358-pteranodon-longiceps'],
  pteraSea: ['American Museum of Natural History: The giant pterosaur', 'https://www.amnh.org/explore/news-blogs/pteranodon-longiceps'],
  pterosaurs: ['American Museum of Natural History: What is a pterosaur?', 'https://www.amnh.org/explore/news-blogs/what-is-a-pterosaur'],
  fish: ['Australian Museum: What is a fish?', 'https://australian.museum/learn/animals/fishes/what-is-a-fish/'],
  fishKinds: ['Queensland Museum: Fishes', 'https://www.museum.qld.gov.au/learn-and-discover/animals-of-queensland/fishes'],
  shell: ['Natural History Museum: Interesting shells', 'https://www.nhm.ac.uk/discover/interesting-shells.html'],
  snail: ['Natural History Museum: Snails and slugs', 'https://www.nhm.ac.uk/discover/snails-and-slugs.html'],
  beetle: ['Natural History Museum: Dung beetles', 'https://www.nhm.ac.uk/discover/how-dung-beetles-keep-the-world-clean.html'],
  beetleWings: ['Imperial College London: OPAL invertebrate guide', 'https://www.imperial.ac.uk/media/imperial-college/research-centres-and-groups/opal/Invertebrates-guide--UPDATED-FINAL.pdf'],
  beetleWood: ['Natural History Museum: Stag beetles', 'https://www.nhm.ac.uk/discover/stag-beetles.html'],
  butterfly: ['Smithsonian Gardens: About butterflies', 'https://gardens.si.edu/learn/for-educators/cultivating-habitat/butterfly-gardening/about-butterflies/'],
  lizard: ['Smithsonian: Squamate body covering', 'https://qrius.si.edu/taxonomy/term/12096'],
  lizardExample: ['Australian Museum: Eastern blue-tongue lizard', 'https://australian.museum/learn/animals/reptiles/eastern-blue-tongue-lizard/'],
  frog: ['American Museum of Natural History: Frog research', 'https://www.amnh.org/exhibitions/frogs-a-chorus-of-colors/frog-research-at-the-museum'],
  frogLife: ['American Museum of Natural History: Frogs, A Chorus of Colors', 'https://www.amnh.org/content/download/39987/584313/file/Frogs%20A%20Chorus%20of%20Colors.pdf'],
  tadpole: ['American Museum of Natural History: Tadpoles', 'https://www.amnh.org/exhibitions/frogs-a-chorus-of-colors/reproduction/tadpoles'],
  dragonfly: ['Smithsonian Gardens: Dragonflies', 'https://gardens.si.edu/exhibitions/traveling/habitat/dragonflies/'],
  dragonflyYoung: ['Smithsonian: Dragonfly and damselfly reproduction', 'https://qrius.si.edu/taxonomy/term/11877?page=3'],
};

const ref = key => REFERENCES[key][1];
const topic = (id, title, summary, paragraphs, sourceKeys, certainty = 'evidence') => ({
  id, title, summary, paragraphs, sources: sourceKeys.map(ref), certainty,
});
const size = (value, kind, label, sourceKey) => ({value, unit:'m', kind, label, source:ref(sourceKey)});
const time = (start, end, label, sourceKey) => ({start, end, label, source:ref(sourceKey)});
const question = (prompt, options, answer, explanation) => ({prompt, options, answer, explanation});

const prehistoric = [
  {
    id:'triceratops', name:'Þríhyrna', scientificName:'Triceratops', group:'prehistoric',
    intro:'Þrjú horn, stór hálskragi og goggur fyrir plöntumat! Mosi er þríhyrna í ævintýrinu okkar. Skoðum nú hvað steingervingar segja um raunverulegar þríhyrnur.',
    size:size(9,'length','Stór þríhyrna gat orðið um 9 metra löng.','tric'),
    time:time(68,66,'Síðari hluti krítartímabilsins, fyrir um 68–66 milljónum ára.','tric'),
    topics:[
      topic('name','Nafn með þremur hornum','Nafnið lýsir andlitinu.',[
        'Triceratops merkir þriggja horna andlit. Tvö stór horn sátu ofan við augun og eitt minna á nefinu.',
        'Þríhyrnur tilheyra hópi hornaðra risaeðla. Mosi er skáldaður vinur, en hópurinn var til í raun.',
        'Triceratops horridus er heiti á einni tegund innan ættkvíslarinnar. Tvö dýr geta tilheyrt sama hópi án þess að vera alveg eins.',
      ],['tric','tricStory']),
      topic('food','Goggur og plöntunesti','Goggurinn klippti, tennurnar unnu áfram.',[
        'Þríhyrnan var plöntuæta. Fremst í munninum hafði hún hvassan gogg til að klippa gróður.',
        'Aftar voru raðir af tönnum. Þær skáru plöntufæðuna í sundur líkt og margar litlar klippur.',
        'Lögun munnsins og slit á tönnum hjálpa vísindafólki að rannsaka fæðuna. Tennur geta sagt sögu án þess að tala!',
      ],['tric','tricStory']),
      topic('horns','Hvað er inni í horni?','Bein að innan, hornslíður utan um.',[
        'Inni í hornunum voru beinkjarnar. Utan um þá var slíður úr keratíni, efni sem er líka í nöglunum þínum.',
        'Hornið á lifandi dýri var því stærra en beinkjarninn sem varðveitist í steingervingi.',
        'Á höfuðkúpu í American Museum of Natural History sést gróinn áverki. Hann gæti hafa komið eftir átök við aðra þríhyrnu.',
      ],['tricSkull'],'inferred'),
      topic('body','Stór haus á fjórum fótum','Kragi, bolur og sterkir fætur.',[
        'Stór beinkragi teygði sig aftur frá höfuðkúpunni. Kraginn er hluti af höfðinu, ekki vængur.',
        'Þríhyrnan gekk á fjórum fótum. Lengdin er mæld frá nefi að hala, ekki upp að hornunum.',
        'Fullvaxin dýr voru ekki öll jafnstór. Við sýnum áætlaða stærð stórs dýrs, en ekki nákvæma reglu fyrir hverja þríhyrnu.',
      ],['tric']),
      topic('world','Heimur þríhyrnunnar','Hún lifði mjög seint á risaeðlutímanum.',[
        'Steingervingar þríhyrna hafa fundist í Norður-Ameríku, meðal annars í Bandaríkjunum og Kanada.',
        'Hún lifði á síðari hluta krítartímabilsins. Þá var grameðlan T. rex einnig uppi.',
        'Þórseðlan lifði miklu fyrr. Vinirnir hittast allir í leiknum okkar, en voru ekki allir nágrannar í raun.',
      ],['tric','tricStory','bronto']),
      topic('discovery','Hornin sem voru misskilin','Jafnvel vísindafólk getur giskað rangt.',[
        'Árið 1887 fékk Othniel Charles Marsh steingerð horn til rannsóknar. Fyrst taldi hann þau tilheyra útdauðum vísundi.',
        'Nýjar vísbendingar sýndu síðar að þetta voru risaeðluhorn. Marsh leiðrétti hugmyndina.',
        'Þannig vinnur vísindafólk: það ber saman vísbendingar og breytir skýringunni þegar betri gögn finnast.',
      ],['tricStory']),
      topic('mystery','Til hvers voru hornin?','Ein lögun getur haft fleiri en eitt hlutverk.',[
        'Hornin gætu hafa hjálpað þríhyrnum að verjast öðrum dýrum. Áverkar í steingervingum eru vísbendingar um átök.',
        'Við getum rannsakað beinin, en ekki horft á lifandi þríhyrnu til að sjá alla hegðun hennar.',
        'Litir Mosa eru litir leiksins. Ekki er hægt að lesa allan húðlit dýrs beint úr venjulegri beinagrind.',
      ],['tric','tricSkull'],'debated'),
      topic('look','Gerðu eigin athugun','Finndu það sem er bein og það sem er endurgerð.',[
        'Á beinagrindarmynd geturðu fundið horn, augntóft og hálskraga. Augntóftin er gatið þar sem augað sat.',
        'Þegar þú snýrð leikmyndinni sérðu lögunina frá fleiri hliðum. Mynd af einni hlið sýnir ekki allt dýrið.',
        'Safnuppsetning og litrík leikmynd svara ólíkum spurningum: önnur sýnir beinin, hin hjálpar okkur að ímynda okkur lifandi dýr.',
      ],['tricSkull']),
    ],
    question:question('Hvaða vísbending segir okkur best að þríhyrna hafi borðað plöntur?', ['Lögun goggs og tanna','Liturinn á Mosa','Það að hún hafði hala'],0,'Goggurinn klippti gróður og tennurnar skáru plöntur. Litirnir í leiknum segja okkur ekki hvað dýrið át.'),
    hotspots:[{label:'Horn',text:'Beinkjarni var inni í hornslíðrinu.',yaw:.55},{label:'Hálskragi',text:'Stóri kraginn var hluti af höfuðkúpunni.',yaw:1.8},{label:'Goggur',text:'Plöntuklippur fremst í munninum!',yaw:0}],
  },
  {
    id:'stegosaurus', name:'Kambeðla', scientificName:'Stegosaurus', group:'prehistoric',
    intro:'Kambeðlan er með plötur á bakinu og gadda á halanum. Litli hausinn gat bitið í sterkar plöntur. En til hvers voru allar plöturnar? Þar byrjar góð rannsókn!',
    size:size(9,'length','Stórar kambeðlur gátu orðið um 9 metra langar.','stego'),
    time:time(152,145,'Síðari hluti júratímabilsins, fyrir um 152–145 milljónum ára.','stego'),
    topics:[
      topic('name','Þakeðlan sem varð kambeðla','Fyrsta hugmyndin var ekki sú síðasta.',[
        'Stegosaurus merkir þakeðla. Nafnið tengist gömlu hugmyndinni um að plöturnar hefðu legið flatar á bakinu.',
        'Betri steingervingar sýndu síðar að plöturnar stóðu upp. Þær voru sitt á hvað beggja vegna baksins.',
        'Kambeðlur voru brynvarðar risaeðlur. Plöturnar og halagaddarnir hjálpa okkur að þekkja hópinn.',
      ],['stego']),
      topic('food','Lítill munnur, duglegt bit','Stærð höfuðsins segir ekki allt.',[
        'Kambeðlan var plöntuæta. Vísindafólk telur að hún hafi getað bitið í burkna og annan sterkan gróður.',
        'Tennurnar voru litlar, á stærð við litla fingurnögl. Höfuðið var líka smátt miðað við bolinn.',
        'Tölvulíkön af kjálkum sýndu samt duglegt bit. Smár haus þýðir ekki að allur matur þurfi að vera mjúkur!',
      ],['stegoBody'],'inferred'),
      topic('plates','Plötur í húðinni','Þær voru ekki fastar við hrygginn.',[
        'Plöturnar voru bein sem lágu í húðinni. Þess vegna finnast þær stundum lausar frá öðrum beinum.',
        'Á plötunum sjást litlar rásir sem tengdust æðum. Þær eru vísbendingar um vefi sem hurfu fyrir löngu.',
        'Plöturnar voru margar stórar og þunnar. Þær voru ekki eitt samfellt hart þak yfir dýrinu.',
      ],['stego','stegoBrain']),
      topic('walking','Framfætur og afturfætur','Fjórir fætur, en ekki jafnlengdir.',[
        'Kambeðlan gekk á fjórum fótum. Afturfæturnir voru lengri en framfæturnir.',
        'Beinin hjálpa vísindafólki að áætla hvernig hún gekk. Hún virðist hafa verið göngudýr fremur en spretthlaupari.',
        'Tölvusneiðmyndir og þrívíddarskannanir gera kleift að skoða bein bæði utan frá og innan.',
      ],['stegoBody'],'inferred'),
      topic('tail','Gaddarnir aftast','Bakplötur og halagaddar voru ólíkir.',[
        'Á halanum voru oddhvassir gaddar. Þeir voru öðruvísi í laginu en breiðu plöturnar á bakinu.',
        'Sterkur, gaddaður hali gat verið vörn gegn rándýrum. Vísindafólk ber saman lögun beina og áverka þegar það rannsakar slíkt.',
        'Snúðu myndinni og leitaðu að halanum. Það er gott að skoða allt dýrið, ekki aðeins frægustu plöturnar!',
      ],['stego'],'inferred'),
      topic('sophie','Kambeðlan Sophie','Eitt dýr getur kennt okkur mjög margt.',[
        'Beinagrind kölluð Sophie fannst í Wyoming árið 2003. Hún er óvenju heilleg.',
        'Þessi tiltekna beinagrind er um 5,6 metra löng. Því eru ekki allar kambeðlur jafnlangar og stærsta talan í bókinni.',
        'Bein Sophie varðveittust vel í þrívídd. Það hjálpar við að rannsaka hreyfingar, höfuð og fæðu.',
      ],['stegoBody','stegoSophie']),
      topic('brain','Einn heili dugði','Gamla tveggja heila sagan stenst ekki.',[
        'Kambeðlan hafði einn heila í höfðinu. Hún var ekki með annan heila í mjöðmunum.',
        'Gamlar hugmyndir um annan heila komu meðal annars af því að höfuðið var svo lítið miðað við líkamann.',
        'Við megum ekki nota litla heilastærð til að finna upp nákvæmlega hvað útdautt dýr gat lært.',
      ],['stegoBrain'],'evidence'),
      topic('mystery','Plötur til að sýna sig?','Hér er enn ráðgáta.',[
        'Kannski hjálpuðu plöturnar dýrunum að þekkja hver aðra eða sýna sig.',
        'Önnur hugmynd er að þær hafi hjálpað til við að stjórna líkamshita. Vísindafólk hefur rannsakað fleiri en eina skýringu.',
        'Við vitum því ekki örugglega allt um hlutverk þeirra. Góð spurning má eiga fleiri en eitt mögulegt svar.',
      ],['stego','stegoBody'],'debated'),
    ],
    question:question('Hvar voru beinplötur kambeðlunnar?', ['Í húðinni á bakinu','Inni í maganum','Fastar við tennurnar'],0,'Plöturnar lágu í húðinni og voru ekki fastar við hrygginn. Þess vegna geta þær fundist lausar frá beinagrindinni.'),
    hotspots:[{label:'Bakplötur',text:'Beinplötur í húðinni, ekki þak á hryggnum.',yaw:1.5},{label:'Halagaddar',text:'Oddhvassir gaddar voru aftast.',yaw:2.8},{label:'Smár haus',text:'Litlar tennur og kjálkar sem unnu við plöntumat.',yaw:.2}],
  },
  {
    id:'brachiosaurus', name:'Þórseðla', scientificName:'Brontosaurus', group:'prehistoric',
    intro:'Þórseðlan er langháls með lítinn haus, stóran bol og langan hala. Hún er plöntuæta. Í ævintýrinu lyftir hún okkur upp í trén; í safninu skoðum við raunverulegu beinin og söguna á bak við nafnið.',
    size:size(20,'length','Yale-beinagrindin er um 20 metra löng; stærð einstaklinga var breytileg.','yale'),
    time:time(156,145,'Síðari hluti júratímabilsins, fyrir um 156–145 milljónum ára.','bronto'),
    topics:[
      topic('name','Þrumur í nafninu','Nafnið lýsir ekki upptöku af fótatakinu.',[
        'Íslenska heitið þórseðla er notað um Brontosaurus. Brontosaurus merkir þrumueðla.',
        'Ættkvíslin fékk nafnið árið 1879. Brontosaurus excelsus er eitt tegundarheita hennar.',
        'Við vitum ekki nákvæmlega hvernig fótatak hennar hljómaði. Nafn er ekki hljóðupptaka!',
      ],['bronto','brontoName']),
      topic('body','Stór bolur, lítill haus','Þórseðlan var langháls.',[
        'Þórseðlan tilheyrði hópi sem kallast sauropodar eða langhálsar. Þeir höfðu langan háls og hala.',
        'Hausinn var smár miðað við bolinn. Fjórir öflugir fætur báru þunga líkamans.',
        'Hryggurinn var gerður úr mörgum hryggjarliðum. Hali er líka hluti af hryggnum.',
      ],['yale']),
      topic('food','Laufanesti langhálsins','Hálsinn gaf færi á að ná víðar.',[
        'Þórseðlan var plöntuæta. Langur háls gat hjálpað henni að ná til gróðurs án þess að færa allan bolinn.',
        'Vísindafólk ræðir hvort langhálsar sóttu mikið upp í tré, sópuðu höfðinu yfir lægri gróður eða gerðu hvort tveggja.',
        'Lyftuferðin með barninu er ævintýri leiksins. Hún er ekki sönnun þess að raunverulegar þórseðlur hafi borið fólk!',
      ],['bronto'],'debated'),
      topic('land','Risinn gat gengið á landi','Vatn var ekki eina leiðin til að bera þungann.',[
        'Áður héldu sumir að langhálsar þyrftu vatn til að styðja svo þungan líkama.',
        'Rannsóknir á fótum, hrygg og útlimum sýna að líkaminn var lagaður að lífi á landi.',
        'Það útilokar ekki að þeir hafi vaðið í vatni. Landdýr geta líka farið í ár og vötn.',
      ],['bronto'],'inferred'),
      topic('tail','Hali upp frá jörðinni','Gömul safnmynd getur sýnt gamla hugmynd.',[
        'Hali þórseðlunnar var langur og mjókkaði út að endanum.',
        'Í eldri uppsetningu Yale-safnsins lá halinn á jörðinni. Við nýja uppsetningu var hann hækkaður og lengdur.',
        'Safnmyndin okkar er frá 2012 og sýnir eldri uppsetninguna. Lýsingin við myndina hjálpar okkur að skilja muninn.',
      ],['yale']),
      topic('nameStory','Nafnið sem kom aftur','Bein geta breytt ættartrénu.',[
        'Lengi töldu vísindamenn að Brontosaurus og Apatosaurus tilheyrðu sömu ættkvísl. Þessi tvö nöfn rugla því stundum fólk.',
        'Árið 2015 birtist stór samanburðarrannsókn sem studdi að aðgreina hópana aftur.',
        'Rannsóknin bar saman mörg beinagrindarsýni og hundruð líkamseinkenna. Nýjar niðurstöður geta samt breytt flokkun síðar.',
      ],['bronto'],'inferred'),
      topic('museum','Hvernig stendur beinagrind?','Það þarf líka smiði á náttúrugripasafni.',[
        'Safnbeinagrind stendur ekki sjálf. Faldar festingar og burðargrind halda þungu beinunum á sínum stað.',
        'Við endurgerð Yale-beinagrindarinnar voru einstök bein skönnuð og gerð að litlum þrívíddarlíkönum.',
        'Starfsfólkið prófaði stellingar og bar þær saman við rannsóknir. Svo var stóra uppsetningin sett saman.',
      ],['yale']),
      topic('time','Langt á undan Mosa','Risaeðlutíminn var ekki einn dagur.',[
        'Þórseðlan lifði á júratímabilinu. Bein hennar hafa meðal annars fundist í Wyoming í Bandaríkjunum.',
        'Þríhyrnur lifðu tugum milljóna ára síðar. Þær sáu því ekki þórseðlur á göngu.',
        'Þegar við setjum dýrin á tímalínu sést munurinn. Í leiknum fá vinir frá ólíkum tímum að hittast.',
      ],['bronto','tric']),
    ],
    question:question('Af hverju getur ný safnbeinagrind verið í annarri stellingu en gömul?', ['Nýjar rannsóknir hjálpa við uppsetninguna','Beinin vaxa á safninu','Dýrið vaknar á nóttunni'],0,'Nýjar vísbendingar geta breytt því hvernig vísindafólk raðar beinunum. Beinin sjálf vaxa ekki á safninu.'),
    hotspots:[{label:'Háls',text:'Margir hryggjarliðir mynda langa hálsinn.',yaw:.4},{label:'Hali',text:'Langur, mjókkandi hali er hluti af hryggnum.',yaw:2.7},{label:'Bolur og fætur',text:'Fjórir fætur báru stóra plöntuætuna.',yaw:1.5}],
  },
];

prehistoric.push(
  {
    id:'trex',name:'Grameðla',scientificName:'Tyrannosaurus rex',englishName:'T. rex',group:'prehistoric',
    intro:'Grameðlan hafði stórt höfuð, öflugar tennur og óvenjulitla arma. En hún geymir líka leyndarmál í beinunum: vaxtarlínur sem hjálpa okkur að áætla aldur hennar.',
    size:size(12,'length','Stór grameðla gat orðið um 12 metra löng.','rexArms'),
    time:time(68,66,'Síðari hluti krítartímabilsins, fyrir um 68–66 milljónum ára.','rex'),
    topics:[
      topic('name','Tyrannosaurus rex','Stórt nafn á stóru dýri.',[
        'Tyrannosaurus rex er vísindaheiti tegundarinnar. Oft er það stytt í T. rex.',
        'Grameðlan var kjötæta og gekk á tveimur afturfótum.',
        'Bein hennar hafa fundist í Norður-Ameríku. Hún var landdýr, þótt í leiknum geti hún verið við vatnið.',
      ],['rex']),
      topic('food','Tennur sem skilja eftir spor','Bitför eru eins og litlar vísbendingar.',[
        'Stóru kjálkarnir og tennurnar gátu unnið á mjög harðri fæðu, jafnvel beinum.',
        'Á þríhyrnu- og Edmontosaurus-beinum hafa fundist bitför eftir grameðlur.',
        'Bitför sýna að dýr át úr skrokki. Þau segja ekki alltaf hvort það veiddi dýrið eða fann það dautt.',
      ],['rex','rexArms'],'inferred'),
      topic('arms','Litlir armar, stór ráðgáta','Lítill er ekki það sama og ónýtur.',[
        'Armarnir voru um metri á lengd, en litu litlir út við risastóran bolinn.',
        'Á hvorri framhönd voru tveir stórir fingur með klóm.',
        'Vísindafólk veit ekki nákvæmlega til hvers armarnir voru notaðir. Margar hugmyndir hafa verið prófaðar.',
      ],['rexArms','rexFingers'],'debated'),
      topic('sue','Kynnumst SUE','Einstakt dýr með eigið safnnafn.',[
        'SUE er viðurnefni frægrar grameðlubeinagrindar á Field Museum í Chicago.',
        'Sue Hendrickson fann steingervinginn árið 1990 í Suður-Dakóta. Nafnið heiðrar hana.',
        'Við vitum ekki hvort dýrið sjálft var karlkyns eða kvenkyns. Viðurnefnið segir það ekki.',
      ],['sue']),
      topic('growth','Línur inni í beini','Bein geyma vísbendingar um uppvöxt.',[
        'Vísindafólk skoðaði vaxtarlínur í beinum SUE til að áætla aldurinn.',
        'Niðurstaðan var um 28 ár. Það er mat út frá beinum, ekki þekktur afmælisdagur.',
        'Rannsóknir benda til að grameðlur hafi tekið mikinn vaxtarkipp á unglingsárum.',
      ],['sue'],'inferred'),
      topic('museum','Alvöru höfuðkúpan er til hliðar','Afsteypa getur hjálpað safngestum.',[
        'Höfuðkúpan á uppsettu SUE-beinagrindinni er afsteypa. Alvöru steingervingurinn er sýndur sérstaklega.',
        'Þannig er hægt að verja þunga höfuðkúpuna og skoða hana betur.',
        'Starfsfólk getur líka búið til afsteypur af öðrum beinum. Afsteypa er eftirlíking, ekki nýfundið bein.',
      ],['sue']),
      topic('research','Safnið lærir líka','Beinagrind getur breyst án þess að vaxa.',[
        'Armbein SUE hafa verið skoðuð með tölvusneiðmyndum. Þær sýna innviði án þess að saga beinið í sundur.',
        'Við nýja uppsetningu voru kviðbein sett á sinn stað. Þau heita gastralia.',
        'Staðsetning óskabeinsins var líka leiðrétt. Ný þekking bætir gömul líkön.',
      ],['sue']),
      topic('time','Nágranni þríhyrnunnar','Þessi tvö dýr deildu hluta af sögunni.',[
        'Grameðlur og þríhyrnur lifðu seint á krítartímabilinu.',
        'Kambeðlur höfðu þá verið útdauðar í tugi milljóna ára. Þær voru ekki venjulegur hádegismatur grameðlunnar!',
        'Litirnir og glaða röddin í leiknum eru skálduð. Þau hafa ekki verið varðveitt í beinunum.',
      ],['rex','tric','stego']),
    ],
    question:question('Hvað getur hjálpað okkur að áætla aldur SUE?', ['Vaxtarlínur í beinunum','Fjöldi safngesta','Nafnið SUE'],0,'Vaxtarlínur í beinum gefa vísbendingar um vöxt og aldur. Við vitum samt ekki nákvæman afmælisdag.'),
    hotspots:[{label:'Framhandleggir',text:'Tveir stórir fingur voru á hvorri framhönd.',yaw:.5},{label:'Kjálkar',text:'Stórar tennur og sterkir kjálkar hentuðu kjötfæðu.',yaw:0},{label:'Afturfætur',text:'Grameðlan gekk á þessum tveimur fótum.',yaw:1.5}],
  },
  {
    id:'spinosaurus',name:'Uggeðla',scientificName:'Spinosaurus aegyptiacus',group:'prehistoric',
    intro:'Langt trýni, hátt baksegl og hali sem minnir á róðrarspaða. Uggeðlan er stór fiskæta, en vísindafólk rannsakar enn hvernig hún hreyfði sig í vatni.',
    size:size(14,'length','Afsteypan á Field Museum er um 14 metra löng; stærðarmat er breytilegt.','spino'),
    time:time(95,95,'Hér skoðum við steingervinga frá því fyrir um 95 milljónum ára.','spino'),
    topics:[
      topic('name','Nafn úr hryggnum','Spinosaurus vísar til löngu bakbeinanna.',[
        'Spinosaurus var nefnd árið 1915 af Ernst Stromer.',
        'Uggeðlan tilheyrir hópi kjötætna sem kallast spinosaurar. Baryonyx er annar meðlimur hópsins.',
        'Hér skoðum við tegundina Spinosaurus aegyptiacus. Ættkvíslarheiti eitt og sér er ekki alltaf fullt tegundarheiti.',
      ],['spinoHistory','spino']),
      topic('food','Fiskur á matseðlinum','Trýni og tennur gefa vísbendingar.',[
        'Uggeðlan át fisk. Í heimkynnum hennar voru ár og fiskar af mörgum gerðum.',
        'Langir kjálkar spinosauranna minna á kjálka krókódíla.',
        'Keilulaga tennur þeirra minna líka á tennur sumra fiskveiðidýra sem lifa nú.',
      ],['spino','spinoBones']),
      topic('sail','Segl sem var ekki úr dúk','Löng bein studdu bakið.',[
        'Mjög langir beinangar stóðu upp úr bakhryggjarliðunum og mynduðu grunn bakseglsins.',
        'Við vitum ekki með vissu hvað seglið gerði. Sjónræn merki til annarra dýra eru ein hugmynd.',
        'Hitastjórnun hefur líka verið rædd. Nafnið segl merkir ekki að dýrið sigldi fyrir vindi eins og bátur.',
      ],['spinoSail'],'debated'),
      topic('tail','Hali með breidd','Lögun breytir því hvernig vatn flæðir.',[
        'Halinn var hár og flatur frá hlið, fremur en sívalur eins og svert reipi.',
        'Ný halabein breyttu því hvernig vísindafólk endurgerði dýrið.',
        'Hali sem getur ýtt vatni segir ekki einn og sér hversu vel heilt dýr syndir. Bolur, fætur og flot skipta líka máli.',
      ],['spino','spinoDebate'],'inferred'),
      topic('world','Ár þar sem nú er eyðimörk','Landslag jarðar breytist.',[
        'Uggeðlur lifðu í Norður-Afríku fyrir um 95 milljónum ára.',
        'Steingervingar hafa fundist á svæðum sem tilheyra Sahara-eyðimörkinni í dag.',
        'Á þessum slóðum voru vatnakerfi á krítartímabilinu. Nútímakort sýnir ekki alltaf forn heimkynni.',
      ],['spino']),
      topic('bones','Þétt bein undir smásjá','Rannsókn getur byrjað inni í beini.',[
        'Rannsakendur bera innri byggingu steingervinga saman við bein núlifandi dýra.',
        'Árið 2022 var þéttleiki beina notaður sem rök fyrir því að uggeðlan gæti sökkt sér undir vatn.',
        'Aðrir rannsakendur hafa bent á takmarkanir þessarar aðferðar. Þétt bein sanna ekki ein og sér ákveðinn veiðihátt.',
      ],['spinoBones','spinoDebate'],'debated'),
      topic('mystery','Veiðar við bakkann eða undir vatni?','Vísindafólk er ekki alltaf sammála.',[
        'Sum líkön lýsa dýri sem veiddi fisk í vatni. Önnur leggja meiri áherslu á vað og veiðar við bakka.',
        'Til að prófa hugmyndirnar þarf meðal annars að kanna flot, hreyfingar og viðnám vatns.',
        'Við segjum því ekki að hraður kafari sé staðreynd. Ný bein og betri próf geta breytt sögunni.',
      ],['spinoDebate'],'debated'),
      topic('museum','Stór afsteypa á safni','Eftirlíking og steingervingur eru ekki það sama.',[
        'Uggeðlan á Field Museum er afsteypa, um 14 metra löng.',
        'Beinin sem uppsetningin byggir á eru varðveitt við Hassan II-háskóla í Casablanca í Marokkó.',
        'Afsteypur gera fleiri söfnum kleift að sýna form dýrsins án þess að flytja öll upprunalegu beinin.',
      ],['spino']),
    ],
    question:question('Hvað er öruggast að segja um uggeðluna?', ['Við vitum nákvæmlega hvernig hún synti','Hún tengdist vatni, en veiðihátturinn er enn rannsakaður','Hún notaði bakseglið eins og seglbátur'],1,'Fiskfæða og líkamsbygging tengja hana við vatn. Það er samt rannsakað hvernig hún veiddi og hversu vel hún synti.'),
    hotspots:[{label:'Bakseglið',text:'Langir beinangar studdu seglið; hlutverk þess er óvíst.',yaw:1.5},{label:'Trýni',text:'Langir kjálkar og keilulaga tennur hentuðu fiskveiðum.',yaw:.2},{label:'Hali',text:'Hátt, flatt halasnið er mikilvæg vísbending um hreyfingu í vatni.',yaw:2.6}],
  },
  {
    id:'parasaurolophus',name:'Slóeðla',scientificName:'Parasaurolophus',group:'prehistoric',
    intro:'Langur kambur sveigir aftur frá höfðinu. Hann var holur að innan! Geturðu ímyndað þér hvernig loft fór eftir bognum göngum inni í höfðinu?',
    size:size(9,'length','Stór Parasaurolophus gat orðið um 9 metra langur.','para'),
    time:time(77,73,'Síðari hluti krítartímabilsins, fyrir um 77–73 milljónum ára.','para'),
    topics:[
      topic('name','Langt nafn, langur kambur','Vísindaheitið er Parasaurolophus.',[
        'William Parks nefndi Parasaurolophus árið 1922.',
        'Þessi plöntuæta tilheyrði andarnefjum, hópi risaeðla með breiða gogga.',
        'Kamburinn er hluti af höfuðkúpunni. Hann er ekki horn úr sama efni og nögl.',
      ],['para']),
      topic('food','Mörg lítil verkfæri','Tennurnar mynduðu vinnustöð í munninum.',[
        'Goggurinn gat gripið gróður, til dæmis lauf og barr.',
        'Í kjálkunum voru margar tennur, þar á meðal varatennur sem tóku við þegar aðrar slitnuðu.',
        'Þetta var plöntuæta þótt hún væri stór. Stærð segir ekki ein og sér hvað dýr étur.',
      ],['para']),
      topic('crest','Göng inni í kambinum','Kamburinn var ekki gegnheill.',[
        'Loftgöng frá nösunum lágu upp í kambinn og beygðu aftur niður.',
        'Löng, bogin göng geta haft áhrif á hvernig hljóð hljómar.',
        'Kambur gæti líka hafa hjálpað dýrum að þekkja hvert annað. Hann þurfti ekki að hafa aðeins eitt hlutverk.',
      ],['para','paraSound'],'inferred'),
      topic('scan','Kíkjum inn án þess að brjóta','Tölvusneiðmyndir sýna faldar leiðir.',[
        'Rannsakendur við Sandia skoðuðu steingerðan kamb sem hafði fundist í Nýju-Mexíkó.',
        'Þeir tóku hundruð sneiðmynda og settu upplýsingarnar saman í tölvu.',
        'Útkoman sýndi innri loftgöngin. Þannig mátti rannsaka þau án þess að brjóta kambinn upp.',
      ],['paraSound']),
      topic('sound','Rödd sem við reiknum','Tölvuhljóð er tilraun, ekki upptaka.',[
        'Líkön af loftgöngunum bentu til að djúp hljóð gætu ómað í kambinum.',
        'Lögun ganganna hjálpar við að áætla tón, en ekki öll mjúk líffæri eru varðveitt.',
        'Enginn tók upp rödd lifandi Parasaurolophus. Hljóðið í leiknum er skáldað; hljóðtilraunin í safninu er líking.',
      ],['paraSound'],'inferred'),
      topic('walking','Tveir eða fjórir fætur?','Líkamsstaðan gat breyst.',[
        'Parasaurolophus gat stutt sig á fjóra fætur.',
        'Hann gat líka reist sig á afturfæturna.',
        'Húðför benda til smárra, hnökróttra hreistursflaga. Bein eru ekki einu steingervingarnir sem finnast.',
      ],['para']),
      topic('relatives','Kamblögunin er ekki alltaf eins','Tegundir innan hópsins voru ólíkar.',[
        'Þrjár vel þekktar tegundir Parasaurolophus hafa ólíka kambagerð.',
        'Ein safnmyndin okkar sýnir Parasaurolophus cyrtocristatus, með styttri og sveigðari kamb.',
        'Langur kambur leikdýrsins og styttri kambur myndarinnar mega því vera ólíkir. Berðu þá saman!',
      ],['para','paraPhoto']),
      topic('world','Kanada og Bandaríkin','Ekki allar frægar risaeðlur hittust.',[
        'Steingervingar Parasaurolophus hafa fundist í Kanada og Bandaríkjunum.',
        'Hann lifði fyrr en síðustu grameðlurnar og þríhyrnurnar.',
        'Önnur stór kjötætudýr, svo sem Gorgosaurus, lifðu á tíma Parasaurolophus.',
      ],['para','rex']),
    ],
    question:question('Er tölvuhljóð úr kambinum raunveruleg upptaka af risaeðlu?', ['Já, vísindafólk fann gamlan hljóðnema','Nei, það er líkan sem byggir á loftgöngunum','Já, bein geta sjálf talað'],1,'Tölvan notar lögun loftganganna til að prófa hljóð. Það hjálpar okkur að rannsaka, en er ekki upptaka af dýrinu.'),
    hotspots:[{label:'Kambur',text:'Bogin loftgöng lágu inni í kambinum.',yaw:.7},{label:'Goggur',text:'Breiður goggur hjálpaði plöntuætunni að grípa gróður.',yaw:0},{label:'Fætur',text:'Dýrið gat stutt sig á fjóra fætur og risið á afturfætur.',yaw:1.5}],
  },
  {
    id:'pteranodon',name:'Pteranodon',scientificName:'Pteranodon longiceps',group:'prehistoric',
    intro:'Pteranodon er flugeðla, ekki risaeðla og ekki fugl. Langur fingur hélt uppi vængnum. Opnaðu vængjakaflann og berðu hann saman við þína eigin hönd!',
    size:size(6,'wingspan','Stór Pteranodon gat haft um 6 metra vænghaf, frá vængenda til vængenda.','ptera'),
    time:time(85,85,'Hér skoðum við Pteranodon frá því fyrir um 85 milljónum ára.','ptera'),
    topics:[
      topic('group','Ekki fugl og ekki risaeðla','Sami heimur, annar hópur.',[
        'Flugeðlur voru fljúgandi skriðdýr. Þær tilheyra öðrum hópi en risaeðlur.',
        'Vængir þeirra voru himnur, ekki fjaðravængir eins og hjá fuglum.',
        'Flugeðlur voru til í mörgum stærðum og gerðum. Pteranodon er aðeins ein ættkvísl þeirra.',
      ],['pterosaurs']),
      topic('name','Vængur án tanna','Nafnið gefur tvær vísbendingar.',[
        'Pteranodon merkir vængjaður án tanna.',
        'Tegundarheitið longiceps vísar til langs höfuðs.',
        'Ekki allar flugeðlur voru tannlausar. Nafnið á við þennan hóp, ekki allar flugeðlur.',
      ],['ptera','pterosaurs']),
      topic('wing','Einn ótrúlega langur fingur','Hönd getur orðið hluti af væng.',[
        'Fjórði fingurinn var sérstaklega langur og studdi ytri hluta vænghimnunnar.',
        'Upphandleggur og framhandleggur voru líka hluti af vængnum.',
        'Vængur er því ekki bara mjúk flöt skífa. Inni í honum eru bein sem hjálpa að móta hann.',
      ],['pterosaurs']),
      topic('size','Hvað er vænghaf?','Mælum frá einum enda til hins.',[
        'Vænghaf er fjarlægðin milli vængenda þegar vængirnir eru útbreiddir.',
        'Stór Pteranodon gat haft um sex metra vænghaf. Það er ekki sama mæling og lengd frá nefi að hala.',
        'Pteranodon var stór, en aðrar flugeðlur urðu enn stærri, til dæmis Quetzalcoatlus.',
      ],['ptera']),
      topic('head','Goggur og kambur','Kamburinn stóð aftur af höfðinu.',[
        'Langur, tannlaus goggur var fremst á höfðinu.',
        'Beinkambur teygði sig aftur frá höfuðkúpunni.',
        'Kamburinn var ekki annar goggur. Snúðu líkaninu og finndu muninn á framenda og afturenda höfuðsins.',
      ],['pteraSea']),
      topic('food','Fiskur úr fornu hafi','Kansas var ekki alltaf þurrt land.',[
        'Pteranodon át fisk og lifði við stórt innhaf.',
        'Steingervingar hans hafa fundist í vesturhluta Kansas í Bandaríkjunum.',
        'Þar sem nú má ganga á þurru landi var sjór fyrir um 85 milljónum ára.',
      ],['pteraSea','ptera']),
      topic('flight','Að svífa sparar vængjatök','Vængjalögun getur gefið vísbendingar.',[
        'Langir vængir Pteranodon eru oft bornir saman við vængi stórra sviffugla.',
        'Sú líking styður hugmyndir um að hann hafi nýtt vind og svifflug yfir sjó.',
        'Við sáum hann aldrei fljúga. Tölvulíkön og samanburður hjálpa, en leikflugið er ævintýri.',
      ],['ptera','pteraSea'],'inferred'),
      topic('fossils','Viðkvæm bein, stór uppgötvun','Ekki varðveitist allt jafn auðveldlega.',[
        'Flugeðlubein voru viðkvæm. Heilar beinagrindur varðveitast því sjaldan.',
        'Í leiðangri árið 1870 fann Othniel Charles Marsh steingert vængbein sem tengdist uppgötvun Pteranodon.',
        'Fleiri leifar fundust síðar. Vísindasagan verður skýrari þegar fleiri vísbendingar bætast við.',
      ],['pterosaurs','ptera']),
    ],
    question:question('Hvað er óvenjulegt við væng Pteranodon?', ['Hann er úr trjáblöðum','Mjög langur fingur styður vænghimnuna','Allur vængurinn er ein stór tönn'],1,'Fjórði fingurinn var mjög langur og studdi himnuna. Flugeðluvængur er því ólíkur fjaðravæng fugls.'),
    hotspots:[{label:'Vængfingur',text:'Mjög langur fjórði fingur studdi vænghimnuna.',yaw:1.5},{label:'Goggur',text:'Pteranodon hafði engar tennur í goggnum.',yaw:.2},{label:'Kambur',text:'Beinkamburinn stóð aftur af höfðinu.',yaw:.7}],
  },
);

const small = [
  {
    id:'fish',name:'Fiskur',scientificName:'Fiskar — margir ólíkir hópar',englishName:'Fish',group:'small',illustration:'fish',size:null,time:null,
    intro:'Fiskurinn okkar er lítill vatnavinur. Raunverulegir fiskar eru ótrúlega fjölbreyttir: sumir eru mjóir eins og snúrur, aðrir flatir, og ekki allir hafa hreistur!',
    topics:[
      topic('breath','Að anda í vatni','Vatn inniheldur uppleyst súrefni.',[
        'Flestir fiskar nota tálkn til að taka súrefni úr vatninu.',
        'Tálkn og lungu eru ólík öndunarfæri. Sumir fiskar geta þó líka nýtt loft; lungnafiskar eru sérstakt dæmi.',
      ],['fish']),
      topic('body','Uggar og lögun','Fiskur er ekki alltaf eins og á einfaldri mynd.',[
        'Fiskar hafa margar líkamsgerðir. Uggar geta hjálpað þeim að synda og halda jafnvægi.',
        'Ekki allir fiskar hafa hreistur og sumar fisktegundir hafa misst ákveðna ugga. Skoðum dýrið áður en við ályktum!',
      ],['fish']),
      topic('groups','Bein eða brjósk?','Fiskar mynda ekki einn lítinn einsleitan hóp.',[
        'Margir fiskar hafa beinagrind úr beini. Hákarlar og skötur hafa hins vegar grind úr brjóski.',
        'Til eru líka kjálkalausir fiskar. Það eru því margar leiðir til að vera fiskur.',
      ],['fishKinds']),
      topic('look','Skoðum án þess að giska','Teikningin er vinur, ekki tegundagreining.',[
        'Fiskar geta verið svo ólíkir að útlínan ein nægir ekki til að þekkja tegund.',
        'Leikfiskurinn okkar táknar marga vatnavini. Þess vegna fær hann ekki eina nákvæma fullorðinslengd eða aldurshóp á tímalínunni.',
      ],['fish','fishKinds']),
    ],
    question:question('Hvað nota flestir fiskar til að taka súrefni úr vatni?', ['Tálkn','Horn','Fjaðrir'],0,'Tálkn taka uppleyst súrefni úr vatninu. Fiskar eru þó fjölbreyttir og sumir geta líka nýtt loft.'),
    hotspots:[{label:'Tálkn',text:'Tálkn flestra fiska taka súrefni úr vatni.'},{label:'Uggar',text:'Uggar hjálpa mörgum fiskum að hreyfa sig og halda jafnvægi.'}],
  },
  {
    id:'snail',name:'Snigill',scientificName:'Gastropoda',englishName:'Snail',group:'small',illustration:'snail',size:null,time:null,
    intro:'Lítill snigill með stórt skeljaleyndarmál! Skelin vex með dýrinu. Snigillinn í skóginum okkar er skáldaður vinur sem hjálpar okkur að skoða raunverulega snigla.',
    topics:[
      topic('body','Mjúkt dýr','Snigill er lindýr.',[
        'Sniglar eru lindýr með mjúkan líkama. Þeir hafa ekki beinagrind með hrygg eins og við.',
        'Skel getur varið mjúkan líkamann. Ekki öll lindýr hafa samt sýnilega skel.',
      ],['shell']),
      topic('shell','Skelin vex','Húsið er hluti af dýrinu.',[
        'Dýrið myndar efnið í eigin skel. Skelin er að miklu leyti úr kalkefni sem nefnist kalsíumkarbónat.',
        'Nýju efni er bætt við þegar snigillinn vex. Skelin er ekki tilbúið hús sem einhver smíðaði í skóginum.',
      ],['shell']),
      topic('damp','Rakur felustaður','Þurrkur er áskorun fyrir mjúkan líkama.',[
        'Margir landsniglar sækja í raka staði þar sem þeir þorna síður.',
        'Skelin hjálpar meðal annars við vörn gegn þornun og rándýrum. Leikvinur okkar felur sig við mosa.',
      ],['snail']),
      topic('relatives','Með skel eða án?','Sniglar eru fjölbreyttir.',[
        'Sumir sniglar hafa stóra ytri skel. Hjá öðrum er hún mjög lítil eða falin inni í líkamanum.',
        'Þess vegna segir einföld skeljalaus útlína ekki alla söguna. Lítil falin leif getur verið erfitt að sjá.',
      ],['snail']),
    ],
    question:question('Hvernig fær snigillinn stærri skel þegar hann vex?', ['Hann kaupir nýja skel','Hann myndar sjálfur meira skeljaefni','Fiðrildi byggja hana'],1,'Snigillinn myndar eigin skel og bætir við efni þegar hann vex. Hún er hluti af líkama hans.'),
    hotspots:[{label:'Skel',text:'Skelin myndast úr efni sem dýrið framleiðir.'},{label:'Mjúkur líkami',text:'Snigillinn hefur engan hrygg úr beinum.'}],
  },
  {
    id:'beetle',name:'Bjalla',scientificName:'Coleoptera',englishName:'Beetle',group:'small',illustration:'beetle',size:null,time:null,
    intro:'Bjallan felur sig við börkinn. Finndu sex fætur og tvær hlífar á bakinu! Bjöllur eru stór hópur skordýra, og ekki allar éta sama mat eða lifa á sama stað.',
    topics:[
      topic('legs','Teljum fætur','Skordýr hafa sex fætur.',[
        'Bjalla er skordýr. Fullorðin bjalla hefur þrjú fótapör: samtals sex fætur.',
        'Fálmararnir á höfðinu eru ekki auka fætur. Gott er að skoða hvar hver útlimur tengist líkamanum.',
      ],['beetleWings']),
      topic('wings','Vængir með hlífum','Hörðu framvængirnir verja það sem er undir.',[
        'Hjá bjöllum eru framvængirnir breyttir í hlífar sem kallast þekjuvængir.',
        'Hjá mörgum bjöllum eru fíngerðir flugvængir undir hlífunum. Hörð hlíf og mjúkur vængur vinna ólík störf.',
      ],['beetleWings']),
      topic('wood','Líf inni í gömlum viði','Fallið tré getur verið heimili.',[
        'Lirfur sumra bjallna lifa í rotnandi viði. Hjartarbjöllur eru eitt dæmi.',
        'Gamall viður er því ekki bara rusl í skógi. Hann getur verið matur og felustaður fyrir smádýr.',
      ],['beetleWood']),
      topic('cleanup','Litlir hreinsarar','Sumar bjöllur hafa óvenjulegan matseðil.',[
        'Sumar bjöllur lifa á dýraskít. Þær hjálpa við að færa næringarefni aftur niður í jarðveginn.',
        'Ekki allar bjöllur gera það. Bjalla á trjáberki gæti lifað allt öðru lífi en skítabjalla.',
      ],['beetle']),
    ],
    question:question('Hvaða talning passar við fullorðna bjöllu?', ['Fjórir fætur','Sex fætur','Átta fætur'],1,'Bjöllur eru skordýr með þrjú fótapör. Þrjú pör eru sex fætur; fálmararnir eru ekki fætur.'),
    hotspots:[{label:'Þekjuvængir',text:'Hörðu hlífarnar á bakinu eru breyttir framvængir.'},{label:'Fætur',text:'Þrjú fótapör gera sex fætur.'}],
  },
  {
    id:'lizard',name:'Eðla',scientificName:'Eðlur innan Squamata',englishName:'Lizard',group:'small',illustration:'lizard',size:null,time:null,
    intro:'Eðlan okkar kúrir við rót. Hún er ekki pínulítil grameðla! Nú lifa margar ólíkar eðlur, með ólíkan mat, húðliti og felustaði.',
    topics:[
      topic('skin','Hreistur í húðinni','Eðlur tilheyra hópi hreisturdýra.',[
        'Eðlur og snákar tilheyra hópnum Squamata. Hreisturflögurnar eru hluti af húðinni.',
        'Þær losa sig reglulega við gamla ytra húðlagið. Það kallast hamskipti.',
      ],['lizard']),
      topic('colour','Felulitir og fín mynstur','Húð er meira en einn litur.',[
        'Litir og mynstur geta hjálpað eðlum að falla inn í umhverfið.',
        'Í smásjá sjást örsmáar rákir og dældir í húðinni sem augað sér ekki eitt og sér.',
      ],['lizard']),
      topic('feet','Sérstakir klifrarar','Fætur eðlna eru ekki allir eins.',[
        'Sumar gekkóeðlur hafa örsmá hár á tánum sem hjálpa þeim að loða við lóðrétta fleti.',
        'Þetta er sérstök aðlögun. Við ættum ekki að gera ráð fyrir að allar eðlur geti klifrað eins.',
      ],['lizard']),
      topic('young','Allar úr eggi?','Hópar geta haft ólíka lífshætti.',[
        'Sumar eðlur verpa eggjum, en aðrar fæða lifandi unga.',
        'Blátungueðlur í Ástralíu eru dæmi um eðlur sem fæða lifandi unga. Leikeðlan okkar er ekki merkt sem sú tegund.',
      ],['lizardExample']),
    ],
    question:question('Hvað kallast það þegar eðla losar sig við gamla ytra húðlagið?', ['Vænghaf','Hamskipti','Steingervingur'],1,'Það kallast hamskipti. Eðlan losar gamla húðlagið; hún breytist ekki í aðra dýrategund.'),
    hotspots:[{label:'Húð',text:'Hreisturflögurnar eru hluti af húðinni.'},{label:'Fætur',text:'Ólíkar eðlur hafa ólíkar aðlaganir á fótum.'}],
  },
  {
    id:'frog',name:'Froskur',scientificName:'Anura',englishName:'Frog',group:'small',illustration:'frog',size:null,time:null,
    intro:'Froskur við vatnið! Margir froskar byrja lífið sem halakörtur sem líta næstum út eins og litlir fiskar. En halakarta er ungt froskdýr, ekki fiskur.',
    topics:[
      topic('group','Froskdýr','Froskur er annar hópur en eðla.',[
        'Froskar eru froskdýr. Vísindafólk rannsakar skyldleika þeirra meðal annars með líkamsbyggingu og erfðaefni.',
        'Til eru margar froskategundir. Lítill grænn leikvinur getur ekki sýnt allar stærðir þeirra og liti.',
      ],['frog']),
      topic('tadpole','Halakarta','Ungt stig getur litið allt öðruvísi út.',[
        'Margir froskar klekjast sem halakörtur sem lifa í vatni, éta og vaxa.',
        'Halakörtustigið getur varað mjög mislengi eftir tegund og aðstæðum: frá stuttum tíma upp í ár.',
      ],['tadpole']),
      topic('change','Líkaminn breytist','Lítil halakarta verður froskur.',[
        'Þegar halakarta þroskast myndast fætur og líkaminn tekur á sig froskslögun.',
        'Þessi mikla breyting heitir myndbreyting. Hún er hluti af lífsferlinum, ekki galdur.',
      ],['tadpole','frogLife']),
      topic('web','Matur og matargestir','Froskur er hluti af fæðuvef.',[
        'Halakörtur geta orðið matur fyrir fiska, fugla, snáka og jafnvel aðra froska.',
        'Fullorðnir froskar af mörgum tegundum veiða smádýr. Það sem étur getur sjálft orðið matur.',
      ],['tadpole','frogLife']),
    ],
    question:question('Hvað er halakarta?', ['Ungt stig margra froska','Lítill hákarl','Skel á snigli'],0,'Halakarta er lirfustig margra froska. Hún getur litið út eins og fiskur en þroskast í frosk.'),
    hotspots:[{label:'Afturfætur',text:'Fætur myndast þegar halakartan þroskast.'},{label:'Vatnið',text:'Halakörtur margra tegunda lifa í vatni.'}],
  },
  {
    id:'dragonfly',name:'Drekafluga',scientificName:'Anisoptera',englishName:'Dragonfly',group:'small',illustration:'dragonfly',size:null,time:null,
    intro:'Drekaflugan svífur yfir sefinu, en æska hennar var undir vatni. Sama dýr getur lifað tveimur mjög ólíkum lífum!',
    topics:[
      topic('water','Æska undir vatni','Vængjuð fullorðin dýr byrja ekki á flugi.',[
        'Drekaflugur verpa í eða við vatn. Ungviðið lifir í vatninu áður en það verður vængjað.',
        'Hjá mörgum tegundum tekur vatnalífið stærri hluta ævinnar en fullorðinsflugið.',
      ],['dragonfly','dragonflyYoung']),
      topic('hunt','Veiðimaður á tveimur stöðum','Maturinn breytist með heimilinu.',[
        'Ungar drekaflugur veiða smádýr undir vatni, meðal annars önnur skordýr.',
        'Fullorðnar drekaflugur grípa önnur fljúgandi skordýr. Þær geta meðal annars étið moskítóflugur.',
      ],['dragonfly']),
      topic('habitat','Vatn skiptir máli','Ekki bara fallegt tjarnarskraut.',[
        'Drekaflugur finnast við tjarnir, vötn, læki og önnur ferskvatnssvæði.',
        'Þar sem ungviðið treystir á vatnið getur samsetning drekaflugnategunda gefið vísbendingar um ástand vatnsins.',
      ],['dragonfly']),
      topic('look','Skoðum lífsferilinn','Vængirnir segja aðeins hluta sögunnar.',[
        'Vængjaða dýrið yfir tjörninni og ungviðið í vatninu eru tvö þroskastig sama lífsferils.',
        'Við getum séð fáar fullorðnar drekaflugur á tilteknum degi þótt ungviði leynist enn í vatninu.',
      ],['dragonfly']),
    ],
    question:question('Hvar lifir ungviði drekaflugunnar áður en það verður vængjað?', ['Inni í stjörnu','Undir vatni','Á snævi þöktu fjalli'],1,'Ungviðið lifir í vatni. Fullorðna drekaflugan kemur síðar fram með vængi og veiðir í loftinu.'),
    hotspots:[{label:'Vængir',text:'Vængirnir tilheyra fullorðinsstiginu.'},{label:'Tjörnin',text:'Ungviðið lifir og veiðir undir vatni.'}],
  },
  {
    id:'butterfly',name:'Fiðrildi',scientificName:'Lepidoptera',englishName:'Butterfly',group:'small',illustration:'butterfly',size:null,time:null,
    intro:'Fiðrildi er ekki fætt með útbreidda vængi. Fyrst kemur egg, síðan lirfa, svo púpa og loks fullorðið fiðrildi. Fjórir kaflar í einu litlu lífi!',
    topics:[
      topic('cycle','Fjögur stig','Raðaðu lífinu í rétta röð.',[
        'Lífsferill fiðrildis fer í gegnum egg, lirfu, púpu og fullorðið fiðrildi.',
        'Þetta kallast fullkomin myndbreyting. Ungviðið er mjög ólíkt fullorðna dýrinu.',
      ],['butterfly']),
      topic('caterpillar','Mikið að borða','Lirfan safnar efni til að vaxa.',[
        'Margar fiðrildalirfur nærast á ákveðnum plöntum. Ekki hvaða lauf sem er hentar hverri tegund.',
        'Lirfan skiptir um ytri hjúp þegar hún vex. Hún hefur þrjú fótapör og auk þess mjúka kviðfætur.',
      ],['butterfly']),
      topic('pupa','Umbreyting í púpu','Kyrr að utan, breytingar að innan.',[
        'Milli lirfu og fullorðins fiðrildis er púpustig.',
        'Þar myndast líkamsgerð fullorðna dýrsins. Púpan er lifandi þótt hún virðist kyrr.',
      ],['butterfly']),
      topic('adult','Vængir og sograni','Fullorðna dýrið hefur önnur verkfæri.',[
        'Fullorðið fiðrildi hefur sex fætur og tvö vængjapör.',
        'Mörg fiðrildi nota langan, upprúllanlegan sograna til að drekka blómasafa. Hann líkist litlu röri.',
      ],['butterfly']),
    ],
    question:question('Hvaða stig kemur á milli lirfu og fullorðins fiðrildis?', ['Beinagrind','Púpa','Fiskur'],1,'Lirfan verður að púpu. Inni í henni breytist líkaminn áður en fullorðna fiðrildið kemur fram.'),
    hotspots:[{label:'Vængir',text:'Fullorðið fiðrildi hefur tvö vængjapör.'},{label:'Sograni',text:'Mörg fiðrildi drekka blómasafa með upprúllanlegum sograna.'}],
  },
];

export const ENCYCLOPEDIA_NARRATION = {};
export const ENCYCLOPEDIA = [...prehistoric, ...small].map(entry => {
  const introNarration = `encyclopedia_${entry.id}_intro`;
  ENCYCLOPEDIA_NARRATION[introNarration] = entry.intro;
  const topics = entry.topics.map(item => {
    const narration = `encyclopedia_${entry.id}_${item.id}`;
    ENCYCLOPEDIA_NARRATION[narration] = `${item.title}. ${item.summary} ${item.paragraphs.join(' ')}`;
    return {...item, narration};
  });
  const urls = new Set(topics.flatMap(item => item.sources));
  if (entry.size) urls.add(entry.size.source);
  if (entry.time) urls.add(entry.time.source);
  const sources = [...urls].map(url => ({title:Object.values(REFERENCES).find(item => item[1] === url)?.[0] || url, url}));
  return {...entry, topics, sources, introNarration};
});

export const GLOSSARY = [
  {term:'Steingervingur',definition:'Leifar eða ummerki eftir fornt líf sem hafa varðveist í jarðlögum, til dæmis bein, skel eða fótspor.'},
  {term:'Afsteypa',definition:'Nákvæm eftirlíking af hlut, oft gerð með móti. Safn getur sýnt afsteypu og varðveitt viðkvæmt bein annars staðar.'},
  {term:'Beinagrind',definition:'Beinin sem styðja líkamann. Beinagrind segir margt um lögun dýrs, en geymir ekki alltaf liti eða rödd.'},
  {term:'Tegund',definition:'Hópur lífvera sem vísindafólk aðgreinir frá öðrum hópum með skyldleika og einkennum. Tegundarheiti hefur oft tvo liði, eins og Tyrannosaurus rex.'},
  {term:'Ættkvísl',definition:'Hópur einnar eða fleiri náskyldra tegunda. Triceratops er ættkvísl; Triceratops horridus er ein tegund í henni.'},
  {term:'Plöntuæta',definition:'Dýr sem lifir á plöntufæðu, til dæmis laufum, barrnálum eða öðrum plöntuhlutum.'},
  {term:'Kjötæta',definition:'Dýr sem lifir á öðrum dýrum. Fiskæta étur fiska, sem eru líka dýr.'},
  {term:'Vænghaf',definition:'Fjarlægðin frá einum vængenda til hins þegar vængirnir eru útbreiddir. Það er ekki lengd dýrsins frá höfði að hala.'},
  {term:'Keratín',definition:'Efni sem er meðal annars í nöglum okkar og hornslíðrum margra dýra.'},
  {term:'Júratímabil',definition:'Jarðsögutímabil á undan krítartímabilinu. Þórseðlur og kambeðlur lifðu á síðari hluta þess.'},
  {term:'Krítartímabil',definition:'Jarðsögutímabil á eftir júratímabilinu. Síðustu grameðlurnar og þríhyrnurnar lifðu undir lok þess.'},
  {term:'Tölvusneiðmynd',definition:'Mynd sem sýnir þunnar sneiðar inni í hlut án þess að skera hann sundur. Margar sneiðar má sameina í þrívíddarlíkan.'},
  {term:'Tilgáta',definition:'Rökstudd hugmynd sem hægt er að prófa með vísbendingum. Tilgáta getur breyst þegar við lærum meira.'},
  {term:'Vísbending',definition:'Eitthvað sem hjálpar okkur að rannsaka spurningu. Bitfar, bein eða spor getur verið vísbending.'},
  {term:'Hamskipti',definition:'Þegar dýr losar sig við gamla ytri húð eða hjúp svo það geti vaxið.'},
  {term:'Lirfa',definition:'Ungt stig margra dýra, til dæmis fiðrildalirfa. Lirfan getur verið mjög ólík fullorðna dýrinu.'},
  {term:'Púpa',definition:'Stig í þroska fiðrildis á milli lirfu og fullorðins fiðrildis. Miklar breytingar verða inni í púpunni.'},
  {term:'Tálkn',definition:'Öndunarfæri sem taka súrefni úr vatni. Flestir fiskar anda með tálknum.'},
];
