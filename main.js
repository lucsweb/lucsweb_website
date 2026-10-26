
class RetroAudioEngine {
  constructor() {
    this.ctx = null;
    this.humGain = null;
    this.noiseGain = null;
    this.enabled = false;
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(60, this.ctx.currentTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(140, this.ctx.currentTime);

      this.humGain = this.ctx.createGain();
      this.humGain.gain.setValueAtTime(0.04, this.ctx.currentTime);

      osc.connect(filter);
      filter.connect(this.humGain);
      this.humGain.connect(this.ctx.destination);
      osc.start();

      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(800, this.ctx.currentTime);
      noiseFilter.Q.setValueAtTime(2.5, this.ctx.currentTime);

      this.noiseGain = this.ctx.createGain();
      this.noiseGain.gain.setValueAtTime(0.015, this.ctx.currentTime);

      whiteNoise.connect(noiseFilter);
      noiseFilter.connect(this.noiseGain);
      this.noiseGain.connect(this.ctx.destination);
      whiteNoise.start();

      this.enabled = true;
    } catch (e) {
      console.warn("Audio Context niet ondersteund:", e);
    }
  }

  toggle() {
    if (!this.ctx) {
      this.init();
      return true;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
      this.enabled = true;
      return true;
    } else if (this.ctx.state === 'running') {
      this.ctx.suspend();
      this.enabled = false;
      return false;
    }
    return this.enabled;
  }

  setVolume(factor) {
    if (this.humGain && this.noiseGain) {
      this.humGain.gain.setTargetAtTime(0.04 * factor, this.ctx.currentTime, 0.05);
      this.noiseGain.gain.setTargetAtTime((0.015 + factor * 0.02), this.ctx.currentTime, 0.05);
    }
  }
}

const audio = new RetroAudioEngine();

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x020203, 0.032);

const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x020203, 1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const grainCanvas = document.getElementById('grainCanvas');
let grainCtx = null;
let grainWidth = 256;
let grainHeight = 256;
let grainImgData = null;

if (grainCanvas) {
  grainCanvas.width = grainWidth;
  grainCanvas.height = grainHeight;
  grainCtx = grainCanvas.getContext('2d');
  grainImgData = grainCtx.createImageData(grainWidth, grainHeight);
}

function updateViewportGrain() {
  if (!grainCtx) return;
  const data = grainImgData.data;
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const val = (Math.random() * 255) | 0;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = (Math.random() * 85) | 0; // Analoge filmruis korrel
  }
  grainCtx.putImageData(grainImgData, 0, 0);
}

const screenCanvas = document.createElement('canvas');
screenCanvas.width = 1024;
screenCanvas.height = 768;
const screenCtx = screenCanvas.getContext('2d');
const screenTexture = new THREE.CanvasTexture(screenCanvas);
screenTexture.anisotropy = 8;

let currentPage = 'home'; // 'home' | 'tarieven' | 'info'
let targetPage = 'home';
let isSwitchingChannel = false;
let switchStartTime = 0;
const SWITCH_DURATION = 0.28; // Snelle, snappy zenderswitch (~280ms)
let hoveredTab = null;

const pageScrollOffsets = {
  home: 0,
  tarieven: 0,
  info: 0
};
const pageMaxScrollOffsets = {
  home: 0,
  tarieven: 0,
  info: 0
};

function playChannelSwitchStatic() {
  if (!audio.ctx) audio.init();
  if (audio.ctx && audio.ctx.state === 'running') {
    const now = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(audio.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }
}

const logoImg = new Image();
logoImg.src = 'LUCSWEB.png';
let logoLoaded = false;
logoImg.onload = () => {
  logoLoaded = true;
  screenTexture.needsUpdate = true;
};

const profielImg = new Image();
profielImg.src = 'profiel.jpg';
let profielLoaded = false;
profielImg.onload = () => {
  profielLoaded = true;
  screenTexture.needsUpdate = true;
};

const NAV_TABS = [
  { id: 'home', label: 'home', color: '#00ba50', x: 80, y: 72, boxW: 34, boxH: 34, textW: 95 },
  { id: 'tarieven', label: 'tarieven', color: '#0047bb', x: 275, y: 72, boxW: 34, boxH: 34, textW: 155 },
  { id: 'info', label: 'info', color: '#f740a5', x: 535, y: 72, boxW: 34, boxH: 34, textW: 85 }
];

// =========================================================================
// INSTELLINGEN VOOR RUIMTE TUSSEN DE KADERS OP DE TARIEVEN PAGINA
// =========================================================================
// Pas hier eenvoudig de tussenruimte aan (in pixels):
const AFSTAND_TUSSEN_PAKKETTEN = 28;     // Ruimte tussen 'Flexibel pakket' en 'Consistent pakket'
const AFSTAND_TOT_AANVRAAGKADER = 70;    // Ruimte tussen 'Consistent pakket' en 'Aanvraag indienen'

// =========================================================================
// VOORBEELDWEBSITES VOOR DE HOMEPAGINA (HIER EENVOUDIG TOEVOEGEN / AANPASSEN)
// =========================================================================
// Je kunt hieronder simpelweg nieuwe voorbeelden toevoegen of aanpassen:
// - titel: Naam van de website (wordt onder het screenshot getoond)
// - afbeelding: Bestandsnaam van je screenshot (bv. 'voorbeeld1.png') of null als je hem later toevoegt
// - link: Webadres (bv. 'https://voorbeeld.nl') of null als hij nog nergens naartoe hoeft te linken
const VOORBEELD_WEBSITES = [
  {
    titel: "tandartschristian.nl",
    afbeelding: "website1.jpg",
    link: "https://tandartschristian.nl"
  },
  {
    titel: "chaubrandstrategist.com",
    afbeelding: "website2.jpg",
    link: "https://chaubrandstrategist.com"
  },
  {
    titel: "lucasle.nl",
    afbeelding: "website3.jpg",
    link: "https://lucasle.nl"
  },
  {
    titel: "beautyinstore.nl",
    afbeelding: "website4.jpg",
    link: "https://beautyinstore.nl"
  },
  {
    titel: "diepline.nl",
    afbeelding: "website5.jpg",
    link: "https://diepline.nl"
  },
  {
    titel: "Voorbeeld Tandarts",
    afbeelding: "website6.jpg",
    link: "https://lucsweb.github.io/Voorbeeld-Tandarts/"
  }
];

// Automatische cache voor de geladen screenshots
const projectImageCache = {};
function getProjectImage(src) {
  if (!src) return null;
  if (!projectImageCache[src]) {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      screenTexture.needsUpdate = true;
    };
    projectImageCache[src] = img;
  }
  return projectImageCache[src];
}

// Interactieve hitboxes voor de voorbeeldprojecten op de homepagina
let projectHitboxes = [];

// Tekstinhoud per pagina
const PAGE_DATA = {
  home: {
    paragraphs: [
      {
        segments: [
          { text: "LUCSWEB levert complete, simpele of juist unieke websites. Ben jij een zzp'er of wil je " },
          { text: "projecten/werk", color: "#f740a5" },
          { text: " snel en simpel laten zien?\nIk ontwerp, bouw en host je website voor een zeer scherpe prijs. Bedrijven leveren websites van deze kwaliteit voor een prijs tussen de " },
          { text: "€500-€2000 met €100+ maandelijkse kosten.", color: "#000000", bg: "#ff4d4d" }
        ]
      },
      {
        segments: [
          { text: "Bij mij kan je al beginnen vanaf " },
          { text: "€14.99", color: "#000000", bg: "#00ba50" },
          { text: " per maand." }
        ]
      },
      {
        segments: [
          { text: "Bekijk de tarieven en stuur snel een aanvraag, ik neem binnen 2 dagen contact met je op via Whatsapp of e-mail!" }
        ]
      }
    ]
  },
  tarieven: {
    paragraphs: [
      {
        segments: [
          { text: "TARIEVEN", color: "#0047bb" }
        ]
      },
      {
        segments: [
          { text: "Samenwerken gaat heel makkelijk. Jij bedenkt voor jezelf hoe je je website wil hebben: simpel, druk, 3D, noem het maar op. Hierna kies je een pakket voor het hosten van je website, " },
          { text: "je betaalt hier helemaal niks.", color: "#000000", bg: "#00ba50" },
          { text: " Je hoeft verder nog alleen je naam, email en telefoonnummer door te geven en ik neem binnen 2 werkdagen contact met je op via Whatsapp of e-mail." }
        ]
      }
    ]
  },
  info: {
    paragraphs: []
  }
};

// =========================================================================
// INHOUD VOOR DE INFO PAGINA (HIER VOLLEDIG EN EENVOUDIG AAN TE PASSEN)
// =========================================================================
const INFO_DATA = {
  titel: "LUCSWEB",
  gegevens: [
    { label: "Locatie:", waarde: "Schipluiden, Zuid-Holland, Nederland" },
    { label: "KVK:",     waarde: "42202125" },
    { label: "Email:",   waarde: "info@lucsweb.nl" }
  ],
  secties: [
    {
      kop: "Over mij & Lucsweb",
      tekst: "Ik help zzp'ers en kleine bedrijven aan een strakke, professionele en betaalbare website. Zonder ingewikkelde contracten of torenhoge kosten."
    },
    {
      kop: "Werkwijze & Belofte",
      tekst: "Persoonlijk contact, korte communicatielijnen en een snelle oplevering binnen 2 werkdagen."
    },
    {
      kop: "Privacy & Gegevens",
      tekst: "Jouw gegevens (naam, e-mailadres en telefoonnummer) worden uitsluitend gebruikt om persoonlijk contact met je op te nemen over je website-aanvraag. Ze worden nooit gedeeld met derden of gebruikt voor ongevraagde reclame."
    }
  ]
};

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xppqejgy';

const FORM_DATA = {
  name: '',
  email: '',
  phone: '',
  package: 'Flexibel pakket', // 'Flexibel pakket' | 'Consistent pakket'
  submitted: false,
  sending: false,
  errorMessage: null,
  activeField: null // 'name' | 'email' | 'phone' | null
};

async function submitFormspree() {
  if (FORM_DATA.sending || FORM_DATA.submitted) return;

  if (!FORM_DATA.name.trim() && !FORM_DATA.email.trim() && !FORM_DATA.phone.trim()) {
    FORM_DATA.errorMessage = "Vul a.u.b. je contactgegevens in.";
    screenTexture.needsUpdate = true;
    return;
  }

  FORM_DATA.sending = true;
  FORM_DATA.errorMessage = null;
  setActiveFormField(null);
  screenTexture.needsUpdate = true;

  try {
    const response = await fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        naam: FORM_DATA.name,
        email: FORM_DATA.email,
        telefoonnummer: FORM_DATA.phone,
        gekozen_pakket: FORM_DATA.package,
        bron: 'Lucsweb'
      })
    });

    if (response.ok) {
      FORM_DATA.submitted = true;
      FORM_DATA.sending = false;
      FORM_DATA.errorMessage = null;
    } else {
      const data = await response.json();
      FORM_DATA.sending = false;
      FORM_DATA.errorMessage = (data && data.errors && data.errors[0]) ? data.errors[0].message : "Fout bij verzenden. Probeer opnieuw.";
    }
  } catch (err) {
    FORM_DATA.sending = false;
    FORM_DATA.errorMessage = "Verbindingsfout. Controleer je internet.";
  }

  screenTexture.needsUpdate = true;
}

let formHitboxes = {};

const hiddenInput = document.createElement('input');
hiddenInput.type = 'text';
hiddenInput.style.position = 'fixed';
hiddenInput.style.top = '-100px';
hiddenInput.style.left = '-100px';
hiddenInput.style.opacity = '0';
hiddenInput.style.pointerEvents = 'none';
hiddenInput.setAttribute('autocomplete', 'off');
hiddenInput.setAttribute('autocorrect', 'off');
hiddenInput.setAttribute('spellcheck', 'false');
document.body.appendChild(hiddenInput);

hiddenInput.addEventListener('input', () => {
  if (FORM_DATA.activeField && FORM_DATA.hasOwnProperty(FORM_DATA.activeField)) {
    FORM_DATA[FORM_DATA.activeField] = hiddenInput.value;
    screenTexture.needsUpdate = true;
  }
});

hiddenInput.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    if (FORM_DATA.activeField === 'name') {
      setActiveFormField('email');
    } else if (FORM_DATA.activeField === 'email') {
      setActiveFormField('phone');
    } else if (FORM_DATA.activeField === 'phone') {
      setActiveFormField(null);
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (FORM_DATA.activeField === 'name') {
      setActiveFormField('email');
    } else if (FORM_DATA.activeField === 'email') {
      setActiveFormField('phone');
    } else {
      setActiveFormField(null);
    }
  }
});

function setActiveFormField(field) {
  FORM_DATA.activeField = field;
  if (field) {
    hiddenInput.value = FORM_DATA[field] || '';
    if (field === 'email') hiddenInput.type = 'email';
    else if (field === 'phone') hiddenInput.type = 'tel';
    else hiddenInput.type = 'text';
    hiddenInput.focus();
  } else {
    hiddenInput.blur();
  }
  screenTexture.needsUpdate = true;
}

let lastRenderedPage = null;
let lastHoveredTab = null;
let lastBlinkState = false;

function renderScreenTexture(time) {
  const blink = (Math.floor(time * 2.5) % 2 === 0);

  lastRenderedPage = currentPage;
  lastHoveredTab = hoveredTab;
  lastBlinkState = blink;

  screenCtx.fillStyle = '#ffffff';
  screenCtx.fillRect(0, 0, 1024, 768);

  NAV_TABS.forEach(tab => {
    const isCurrent = (currentPage === tab.id);
    const isHover = (hoveredTab === tab.id);

    screenCtx.fillStyle = tab.color;
    screenCtx.fillRect(tab.x, tab.y, tab.boxW, tab.boxH);

    if (isCurrent || isHover) {
      screenCtx.lineWidth = 2.5;
      screenCtx.strokeStyle = '#000000';
      screenCtx.strokeRect(tab.x - 2, tab.y - 2, tab.boxW + 4, tab.boxH + 4);
    }

    screenCtx.fillStyle = isCurrent ? '#000000' : (isHover ? '#222222' : '#111111');
    screenCtx.font = '500 32px "Space Mono", "Fira Code", monospace';
    screenCtx.textAlign = 'left';
    screenCtx.textBaseline = 'middle';
    screenCtx.fillText(tab.label, tab.x + tab.boxW + 14, tab.y + (tab.boxH / 2) + 2);

    if (isCurrent) {
      screenCtx.fillStyle = tab.color;
      screenCtx.fillRect(tab.x + tab.boxW + 14, tab.y + tab.boxH + 4, screenCtx.measureText(tab.label).width, 3);
    }
  });

  if (logoLoaded) {
    const logoSize = 78;
    const logoX = 1024 - 80 - logoSize; // 864px
    const logoY = 50;
    screenCtx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
  }

  const page = PAGE_DATA[currentPage] || PAGE_DATA.home;
  const marginX = 95;
  const maxContentW = 834;
  const lineHeight = 38;
  const contentTopY = 175;
  const contentBottomY = 720;
  const contentHeight = contentBottomY - contentTopY; // 545px zichtbaar venster

  const currentScrollY = pageScrollOffsets[currentPage] || 0;

  screenCtx.save();
  screenCtx.beginPath();
  screenCtx.rect(50, contentTopY, 924, contentHeight);
  screenCtx.clip();

  let cursorY = contentTopY + 20 - currentScrollY;

  screenCtx.textAlign = 'left';
  screenCtx.textBaseline = 'top';

  page.paragraphs.forEach((pObj) => {
    let currentX = marginX;

    pObj.segments.forEach((seg) => {
      screenCtx.font = '400 24.5px "Space Mono", "Fira Code", monospace';
      screenCtx.fillStyle = seg.color || '#0a0a0c';

      const lines = seg.text.split('\n');
      lines.forEach((subLine, lineIdx) => {
        if (lineIdx > 0) {
          cursorY += lineHeight;
          currentX = marginX;
        }

        const words = subLine.split(' ');
        words.forEach((word, wordIdx) => {
          const wordStr = (wordIdx === 0 && lineIdx === 0 && currentX === marginX) ? word : (currentX === marginX ? word : ' ' + word);
          const metrics = screenCtx.measureText(wordStr);

          if (currentX + metrics.width > marginX + maxContentW && currentX > marginX) {
            cursorY += lineHeight;
            currentX = marginX;
            const freshWord = word;
            const freshMetrics = screenCtx.measureText(freshWord);

            if (seg.bg) {
              screenCtx.fillStyle = seg.bg;
              screenCtx.fillRect(currentX, cursorY - 3, freshMetrics.width + 4, 30);
              screenCtx.fillStyle = seg.color || '#0a0a0c';
            }

            screenCtx.fillText(freshWord, currentX + (seg.bg ? 2 : 0), cursorY);
            currentX += freshMetrics.width + (seg.bg ? 4 : 0);
          } else {
            if (seg.bg) {
              screenCtx.fillStyle = seg.bg;
              screenCtx.fillRect(currentX, cursorY - 3, metrics.width + 2, 30);
              screenCtx.fillStyle = seg.color || '#0a0a0c';
            }

            screenCtx.fillText(wordStr, currentX + (seg.bg ? 1 : 0), cursorY);
            currentX += metrics.width + (seg.bg ? 2 : 0);
          }
        });
      });
    });

    cursorY += lineHeight * 1.55;
  });

  // --- RENDERING VOOR DE VOORBEELDWEBSITES OP DE HOMEPAGINA (3 NAAST ELKAAR) ---
  if (currentPage === 'home') {
    projectHitboxes = [];
    cursorY += 12;

    screenCtx.fillStyle = '#000000';
    screenCtx.font = '700 24px "Space Mono", "Fira Code", monospace';
    screenCtx.fillText("Mijn werk", marginX, cursorY);
    cursorY += 40;

    const totalW = maxContentW; // 834px
    const gap = 24;
    const cols = 3;
    const cardW = Math.floor((totalW - (gap * (cols - 1))) / cols); // ~262px
    const cardH = 164; // Beeldverhouding 16:10 passend bij website screenshots

    VOORBEELD_WEBSITES.forEach((item, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      const itemX = marginX + (col * (cardW + gap));
      const itemY = cursorY + (row * (cardH + 52)); // 52px ruimte voor naam onder de kaart

      projectHitboxes.push({
        minX: itemX,
        maxX: itemX + cardW,
        minY: itemY,
        maxY: itemY + cardH + 34,
        link: item.link,
        titel: item.titel
      });

      screenCtx.lineWidth = 2.0;
      screenCtx.strokeStyle = '#000000';
      screenCtx.strokeRect(itemX, itemY, cardW, cardH);

      const img = item.afbeelding ? getProjectImage(item.afbeelding) : null;
      if (img && img.complete && img.naturalWidth > 0) {
        screenCtx.save();
        screenCtx.beginPath();
        screenCtx.rect(itemX + 1, itemY + 1, cardW - 2, cardH - 2);
        screenCtx.clip();

        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        const targetAspect = cardW / cardH;
        const imgAspect = nw / nh;
        let sx, sy, sWidth, sHeight;

        if (imgAspect > targetAspect) {
          sHeight = nh;
          sWidth = nh * targetAspect;
          sx = (nw - sWidth) / 2;
          sy = 0;
        } else {
          sWidth = nw;
          sHeight = nw / targetAspect;
          sx = 0;
          sy = (nh - sHeight) / 2;
        }

        screenCtx.drawImage(img, sx, sy, sWidth, sHeight, itemX + 1, itemY + 1, cardW - 2, cardH - 2);
        screenCtx.restore();
      } else {
        screenCtx.fillStyle = '#f4f4f6';
        screenCtx.fillRect(itemX + 1, itemY + 1, cardW - 2, cardH - 2);

        screenCtx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        for (let py = itemY + 8; py < itemY + cardH; py += 14) {
          screenCtx.fillRect(itemX + 8, py, cardW - 16, 1);
        }

        screenCtx.fillStyle = '#777777';
        screenCtx.font = '600 14px "Space Mono", "Fira Code", monospace';
        screenCtx.textAlign = 'center';
        screenCtx.fillText("[SCREENSHOT]", itemX + (cardW / 2), itemY + (cardH / 2) - 8);
        screenCtx.textAlign = 'left';
      }

      screenCtx.fillStyle = '#000000';
      screenCtx.font = '700 17px "Space Mono", "Fira Code", monospace';
      screenCtx.fillText(item.titel, itemX, itemY + cardH + 12);
    });

    const totalRows = Math.ceil(VOORBEELD_WEBSITES.length / cols);
    cursorY += (totalRows * (cardH + 52)) + 24;
  }

  if (currentPage === 'tarieven') {
    cursorY += 10;
    const boxW = 834;
    const boxX = marginX;
    const borderWidth = 2.0;

    const box1H = 185;
    const box1Y = cursorY;

    screenCtx.lineWidth = borderWidth;
    screenCtx.strokeStyle = '#000000';
    screenCtx.strokeRect(boxX, box1Y, boxW, box1H);

    screenCtx.fillStyle = '#000000';
    screenCtx.font = '700 26px "Space Mono", "Fira Code", monospace';
    screenCtx.fillText("FLEXIBEL PAKKET", boxX + 24, box1Y + 22);

    screenCtx.fillStyle = '#000000';
    screenCtx.font = '700 25px "Space Mono", "Fira Code", monospace';
    screenCtx.fillText("€19.99", boxX + 24, box1Y + 68);
    screenCtx.font = '400 19px "Space Mono", "Fira Code", monospace';
    screenCtx.fillText("/ maand", boxX + 125, box1Y + 72);

    screenCtx.fillStyle = '#111111';
    screenCtx.font = '400 19px "Space Mono", "Fira Code", monospace';
    screenCtx.fillText("• Eenmalige startkosten: €99.99", boxX + 24, box1Y + 108);
    screenCtx.fillText("• Maandelijks opzegbaar", boxX + 24, box1Y + 144);

    cursorY += box1H + AFSTAND_TUSSEN_PAKKETTEN;

    const box2H = 185;
    const box2Y = cursorY;

    screenCtx.lineWidth = borderWidth;
    screenCtx.strokeStyle = '#000000';
    screenCtx.strokeRect(boxX, box2Y, boxW, box2H);

    screenCtx.fillStyle = '#000000';
    screenCtx.font = '700 26px "Space Mono", "Fira Code", monospace';
    screenCtx.fillText("CONSISTENT PAKKET", boxX + 24, box2Y + 22);

    screenCtx.fillStyle = '#000000';
    screenCtx.font = '700 25px "Space Mono", "Fira Code", monospace';
    screenCtx.fillText("€14.99", boxX + 24, box2Y + 68);
    screenCtx.fillStyle = '#000000';
    screenCtx.font = '400 19px "Space Mono", "Fira Code", monospace';
    screenCtx.fillText("/ maand (eerste 12 maanden)", boxX + 125, box2Y + 72);

    screenCtx.fillStyle = '#111111';
    screenCtx.font = '400 19px "Space Mono", "Fira Code", monospace';
    screenCtx.fillText("• Eerste jaar vast tarief (niet opzegbaar tot einde jaar)", boxX + 24, box2Y + 108);
    screenCtx.fillText("• Na het eerste jaar: €17.99 per maand, maandelijks opzegbaar", boxX + 24, box2Y + 144);

    cursorY += box2H + AFSTAND_TOT_AANVRAAGKADER;

    const box3H = 430;
    const box3Y = cursorY;

    screenCtx.lineWidth = borderWidth;
    screenCtx.strokeStyle = '#000000';
    screenCtx.strokeRect(boxX, box3Y, boxW, box3H);

    screenCtx.fillStyle = '#000000';
    screenCtx.font = '700 24px "Space Mono", "Fira Code", monospace';
    screenCtx.fillText("AANVRAAG INDIENEN", boxX + 24, box3Y + 22);

    screenCtx.font = '400 16.5px "Space Mono", "Fira Code", monospace';
    screenCtx.fillStyle = '#444444';
    screenCtx.fillText("Vul je gegevens in. Ik neem binnen 2 werkdagen vrijblijvend contact met je op.", boxX + 24, box3Y + 54);

    const fieldW = boxW - 48; // 786px
    const fieldH = 42;
    const inputStartX = boxX + 24;

    const nameY = box3Y + 84;
    screenCtx.fillStyle = '#000000';
    screenCtx.font = '600 15px "Space Mono", "Fira Code", monospace';
    screenCtx.fillText("NAAM", inputStartX, nameY);

    const nameInputY = nameY + 20;
    formHitboxes['name'] = { minX: inputStartX, maxX: inputStartX + fieldW, minY: nameInputY, maxY: nameInputY + fieldH };
    screenCtx.lineWidth = 1.5;
    screenCtx.strokeStyle = (FORM_DATA.activeField === 'name') ? '#000000' : '#888888';
    screenCtx.fillStyle = (FORM_DATA.activeField === 'name') ? '#fafafa' : '#ffffff';
    screenCtx.fillRect(inputStartX, nameInputY, fieldW, fieldH);
    screenCtx.strokeRect(inputStartX, nameInputY, fieldW, fieldH);

    screenCtx.font = '400 18px "Space Mono", "Fira Code", monospace';
    if (FORM_DATA.name.length > 0) {
      screenCtx.fillStyle = '#000000';
      screenCtx.fillText(FORM_DATA.name + (FORM_DATA.activeField === 'name' && blink ? '|' : ''), inputStartX + 14, nameInputY + 11);
    } else {
      screenCtx.fillStyle = (FORM_DATA.activeField === 'name' && blink) ? '#000000' : '#888888';
      screenCtx.fillText((FORM_DATA.activeField === 'name' ? '|' : 'Voor- en achternaam'), inputStartX + 14, nameInputY + 11);
    }

    const colW = (fieldW - 20) / 2; // 383px

    const row2Y = nameInputY + fieldH + 16;
    screenCtx.fillStyle = '#000000';
    screenCtx.font = '600 15px "Space Mono", "Fira Code", monospace';
    screenCtx.fillText("E-MAILADRES", inputStartX, row2Y);

    const emailInputY = row2Y + 20;
    formHitboxes['email'] = { minX: inputStartX, maxX: inputStartX + colW, minY: emailInputY, maxY: emailInputY + fieldH };
    screenCtx.strokeStyle = (FORM_DATA.activeField === 'email') ? '#000000' : '#888888';
    screenCtx.fillStyle = (FORM_DATA.activeField === 'email') ? '#fafafa' : '#ffffff';
    screenCtx.fillRect(inputStartX, emailInputY, colW, fieldH);
    screenCtx.strokeRect(inputStartX, emailInputY, colW, fieldH);

    screenCtx.font = '400 17px "Space Mono", "Fira Code", monospace';
    if (FORM_DATA.email.length > 0) {
      screenCtx.fillStyle = '#000000';
      screenCtx.fillText(FORM_DATA.email + (FORM_DATA.activeField === 'email' && blink ? '|' : ''), inputStartX + 14, emailInputY + 11);
    } else {
      screenCtx.fillStyle = (FORM_DATA.activeField === 'email' && blink) ? '#000000' : '#888888';
      screenCtx.fillText((FORM_DATA.activeField === 'email' ? '|' : 'naam@mail.com'), inputStartX + 14, emailInputY + 11);
    }

    const phoneStartX = inputStartX + colW + 20;
    screenCtx.fillStyle = '#000000';
    screenCtx.font = '600 15px "Space Mono", "Fira Code", monospace';
    screenCtx.fillText("TELEFOONNUMMER", phoneStartX, row2Y);

    const phoneInputY = row2Y + 20;
    formHitboxes['phone'] = { minX: phoneStartX, maxX: phoneStartX + colW, minY: phoneInputY, maxY: phoneInputY + fieldH };
    screenCtx.strokeStyle = (FORM_DATA.activeField === 'phone') ? '#000000' : '#888888';
    screenCtx.fillStyle = (FORM_DATA.activeField === 'phone') ? '#fafafa' : '#ffffff';
    screenCtx.fillRect(phoneStartX, phoneInputY, colW, fieldH);
    screenCtx.strokeRect(phoneStartX, phoneInputY, colW, fieldH);

    if (FORM_DATA.phone.length > 0) {
      screenCtx.fillStyle = '#000000';
      screenCtx.fillText(FORM_DATA.phone + (FORM_DATA.activeField === 'phone' && blink ? '|' : ''), phoneStartX + 14, phoneInputY + 11);
    } else {
      screenCtx.fillStyle = (FORM_DATA.activeField === 'phone' && blink) ? '#000000' : '#888888';
      screenCtx.fillText((FORM_DATA.activeField === 'phone' ? '|' : '06 12345678'), phoneStartX + 14, phoneInputY + 11);
    }

    const pkgRowY = emailInputY + fieldH + 16;
    screenCtx.fillStyle = '#000000';
    screenCtx.font = '600 15px "Space Mono", "Fira Code", monospace';
    screenCtx.fillText("GEWENST PAKKET", inputStartX, pkgRowY);

    const pkgBtnY = pkgRowY + 20;
    const pkgBtnH = 42;

    const isFlex = (FORM_DATA.package === 'Flexibel pakket');
    formHitboxes['pkg_flex'] = { minX: inputStartX, maxX: inputStartX + colW, minY: pkgBtnY, maxY: pkgBtnY + pkgBtnH };
    screenCtx.fillStyle = isFlex ? '#000000' : '#ffffff';
    screenCtx.fillRect(inputStartX, pkgBtnY, colW, pkgBtnH);
    screenCtx.lineWidth = 1.5;
    screenCtx.strokeStyle = '#000000';
    screenCtx.strokeRect(inputStartX, pkgBtnY, colW, pkgBtnH);

    screenCtx.font = '600 16px "Space Mono", "Fira Code", monospace';
    screenCtx.fillStyle = isFlex ? '#ffffff' : '#000000';
    screenCtx.fillText("Flexibel pakket", inputStartX + 20, pkgBtnY + 11);

    const isConst = (FORM_DATA.package === 'Consistent pakket');
    formHitboxes['pkg_const'] = { minX: phoneStartX, maxX: phoneStartX + colW, minY: pkgBtnY, maxY: pkgBtnY + pkgBtnH };
    screenCtx.fillStyle = isConst ? '#000000' : '#ffffff';
    screenCtx.fillRect(phoneStartX, pkgBtnY, colW, pkgBtnH);
    screenCtx.strokeStyle = '#000000';
    screenCtx.strokeRect(phoneStartX, pkgBtnY, colW, pkgBtnH);

    screenCtx.fillStyle = isConst ? '#ffffff' : '#000000';
    screenCtx.fillText("Consistent pakket", phoneStartX + 20, pkgBtnY + 11);

    const submitY = pkgBtnY + pkgBtnH + 22;
    const submitH = 46;
    const submitW = fieldW;

    formHitboxes['submit'] = { minX: inputStartX, maxX: inputStartX + submitW, minY: submitY, maxY: submitY + submitH };

    if (FORM_DATA.submitted) {
      screenCtx.fillStyle = '#00ba50';
      screenCtx.fillRect(inputStartX, submitY, submitW, submitH);
      screenCtx.fillStyle = '#ffffff';
      screenCtx.font = '700 16px "Space Mono", "Fira Code", monospace';
      screenCtx.fillText("AANVRAAG ONTVANGEN, IK NEEM BINNEN 2 WERKDAGEN CONTACT OP", inputStartX + 16, submitY + 14);
    } else if (FORM_DATA.sending) {
      screenCtx.fillStyle = '#333333';
      screenCtx.fillRect(inputStartX, submitY, submitW, submitH);
      screenCtx.fillStyle = '#ffffff';
      screenCtx.font = '700 17px "Space Mono", "Fira Code", monospace';
      screenCtx.fillText("AANVRAAG VERZENDEN...", inputStartX + 24, submitY + 13);
    } else {
      screenCtx.fillStyle = '#000000';
      screenCtx.fillRect(inputStartX, submitY, submitW, submitH);
      screenCtx.fillStyle = '#ffffff';
      screenCtx.font = '700 17px "Space Mono", "Fira Code", monospace';
      screenCtx.fillText(FORM_DATA.errorMessage ? "OPNIEUW PROBEREN" : "VERZEND AANVRAAG", inputStartX + 24, submitY + 13);

      if (FORM_DATA.errorMessage) {
        screenCtx.fillStyle = '#ff3b30';
        screenCtx.font = '600 14px "Space Mono", "Fira Code", monospace';
        screenCtx.fillText(FORM_DATA.errorMessage, inputStartX + 230, submitY + 15);
      }
    }

    cursorY += box3H + 26;

    screenCtx.fillStyle = '#444444';
    screenCtx.font = '400 18px "Space Mono", "Fira Code", monospace';
    screenCtx.fillText("Je kunt me altijd mailen voor vragen of andere zaken naar info@lucsweb.nl.", boxX, cursorY);

    cursorY += 40;
  }

  // --- RENDERING VOOR DE INFO PAGINA ---
  if (currentPage === 'info') {
    cursorY += 8;

    const headerStartX = marginX;
    const headerY = cursorY;
    const photoSize = 138;
    const photoRadius = 24;

    screenCtx.save();
    screenCtx.beginPath();
    const prX = headerStartX;
    const prY = headerY;
    const prR = photoRadius;
    screenCtx.moveTo(prX + prR, prY);
    screenCtx.lineTo(prX + photoSize - prR, prY);
    screenCtx.quadraticCurveTo(prX + photoSize, prY, prX + photoSize, prY + prR);
    screenCtx.lineTo(prX + photoSize, prY + photoSize - prR);
    screenCtx.quadraticCurveTo(prX + photoSize, prY + photoSize, prX + photoSize - prR, prY + photoSize);
    screenCtx.lineTo(prX + prR, prY + photoSize);
    screenCtx.quadraticCurveTo(prX, prY + photoSize, prX, prY + photoSize - prR);
    screenCtx.lineTo(prX, prY + prR);
    screenCtx.quadraticCurveTo(prX, prY, prX + prR, prY);
    screenCtx.closePath();
    screenCtx.clip();

    if (profielLoaded && profielImg.naturalWidth && profielImg.naturalHeight) {
      const nw = profielImg.naturalWidth;
      const nh = profielImg.naturalHeight;
      const minDim = Math.min(nw, nh);
      const sx = (nw - minDim) / 2;
      const sy = (nh - minDim) / 2;
      screenCtx.drawImage(profielImg, sx, sy, minDim, minDim, headerStartX, headerY, photoSize, photoSize);
    } else if (profielLoaded) {
      screenCtx.drawImage(profielImg, headerStartX, headerY, photoSize, photoSize);
    } else {
      screenCtx.fillStyle = '#1e2430';
      screenCtx.fillRect(headerStartX, headerY, photoSize, photoSize);
    }
    screenCtx.restore();

    screenCtx.lineWidth = 2.0;
    screenCtx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    screenCtx.beginPath();
    screenCtx.moveTo(prX + prR, prY);
    screenCtx.lineTo(prX + photoSize - prR, prY);
    screenCtx.quadraticCurveTo(prX + photoSize, prY, prX + photoSize, prY + prR);
    screenCtx.lineTo(prX + photoSize, prY + photoSize - prR);
    screenCtx.quadraticCurveTo(prX + photoSize, prY + photoSize, prX + photoSize - prR, prY + photoSize);
    screenCtx.lineTo(prX + prR, prY + photoSize);
    screenCtx.quadraticCurveTo(prX, prY + photoSize, prX, prY + photoSize - prR);
    screenCtx.lineTo(prX, prY + prR);
    screenCtx.quadraticCurveTo(prX, prY, prX + prR, prY);
    screenCtx.closePath();
    screenCtx.stroke();

    const textStartX = headerStartX + photoSize + 28;

    screenCtx.fillStyle = '#000000';
    screenCtx.font = '700 32px "Space Mono", "Fira Code", monospace';
    screenCtx.fillText(INFO_DATA.titel, textStartX, headerY + 8);

    let metaY = headerY + 54;
    INFO_DATA.gegevens.forEach((item) => {
      screenCtx.fillStyle = '#000000';
      screenCtx.font = '700 18px "Space Mono", "Fira Code", monospace';
      screenCtx.fillText(item.label, textStartX, metaY);

      const labelW = screenCtx.measureText(item.label + " ").width;
      screenCtx.fillStyle = '#111111';
      screenCtx.font = '400 18px "Space Mono", "Fira Code", monospace';
      screenCtx.fillText(item.waarde, textStartX + labelW, metaY);

      metaY += 30;
    });

    cursorY = Math.max(headerY + photoSize + 36, metaY + 16);

    INFO_DATA.secties.forEach((sectie) => {
      screenCtx.fillStyle = '#000000';
      screenCtx.font = '700 23px "Space Mono", "Fira Code", monospace';
      screenCtx.fillText(sectie.kop, marginX, cursorY);
      cursorY += 34;

      screenCtx.font = '400 19px "Space Mono", "Fira Code", monospace';
      screenCtx.fillStyle = '#222222';

      const words = sectie.tekst.split(' ');
      let line = '';
      const maxTextW = maxContentW;

      words.forEach((word, idx) => {
        const testLine = line + (line === '' ? '' : ' ') + word;
        const metrics = screenCtx.measureText(testLine);
        if (metrics.width > maxTextW && line !== '') {
          screenCtx.fillText(line, marginX, cursorY);
          cursorY += 30;
          line = word;
        } else {
          line = testLine;
        }
      });
      if (line !== '') {
        screenCtx.fillText(line, marginX, cursorY);
        cursorY += 30;
      }

      cursorY += 24; // Ruimte tussen secties
    });

    cursorY += 20;
  }

  const totalRenderedHeight = (cursorY + currentScrollY) - contentTopY;
  const maxScroll = Math.max(0, totalRenderedHeight - contentHeight + 40);
  pageMaxScrollOffsets[currentPage] = maxScroll;

  screenCtx.restore();

  if (maxScroll > 0) {
    const scrollbarTrackH = contentHeight - 40;
    const scrollbarThumbH = Math.max(30, (contentHeight / totalRenderedHeight) * scrollbarTrackH);
    const scrollThumbY = contentTopY + 20 + (currentScrollY / maxScroll) * (scrollbarTrackH - scrollbarThumbH);

    screenCtx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    screenCtx.fillRect(962, contentTopY + 20, 6, scrollbarTrackH);

    screenCtx.fillStyle = (currentPage === 'tarieven') ? '#0047bb' : '#444444';
    screenCtx.fillRect(962, scrollThumbY, 6, scrollbarThumbH);
  }

  if (isSwitchingChannel) {
    const elapsedSwitch = time - switchStartTime;
    const progress = elapsedSwitch / SWITCH_DURATION;

    if (progress >= 0.45 && currentPage !== targetPage) {
      currentPage = targetPage;
    }

    if (progress < 1.0) {
      const noiseIntensity = progress < 0.5 ? (progress / 0.5) : (1.0 - (progress - 0.5) / 0.5);
      const alpha = Math.min(0.95, Math.max(0.2, noiseIntensity * 1.1));

      screenCtx.fillStyle = `rgba(35, 38, 42, ${alpha})`;
      screenCtx.fillRect(0, 0, 1024, 768);

      const staticHeight = 768;
      const staticWidth = 1024;
      const imgData = screenCtx.getImageData(0, 0, staticWidth, staticHeight);
      const data = imgData.data;
      const step = 4; // Snelle korrelstap voor hoge framerate

      for (let y = 0; y < staticHeight; y += 2) {
        // Horizontale sync glitch offset
        const xOffset = ((Math.sin(y * 0.2 + time * 30) > 0.6) ? ((Math.random() - 0.5) * 45) : 0) | 0;

        for (let x = 0; x < staticWidth; x += 2) {
          if (Math.random() > 0.45) {
            const gray = (Math.random() * 230 + 25) | 0;
            const targetX = Math.min(staticWidth - 1, Math.max(0, x + xOffset));
            const idx = (y * staticWidth + targetX) * 4;
            data[idx] = gray;
            data[idx + 1] = gray;
            data[idx + 2] = gray;
            data[idx + 3] = (alpha * 255) | 0;
          }
        }
      }
      screenCtx.putImageData(imgData, 0, 0);

      // Enkele snelle felle horizontale analoge storing/interferentiestrepen
      screenCtx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      const barY = ((time * 850) % 768);
      screenCtx.fillRect(0, barY, 1024, (Math.random() * 18 + 6));
    } else {
      isSwitchingChannel = false;
      currentPage = targetPage;
    }
  }
  screenCtx.fillStyle = 'rgba(0, 0, 0, 0.085)';
  for (let y = 0; y < 768; y += 4) {
    screenCtx.fillRect(0, y, 1024, 1.8);
  }

  const rollY = ((time * 75) % 820) - 50;
  const rollGrad = screenCtx.createLinearGradient(0, rollY, 0, rollY + 60);
  rollGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  rollGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.045)');
  rollGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  screenCtx.fillStyle = rollGrad;
  screenCtx.fillRect(0, rollY, 1024, 60);

  const grainSeed = Math.floor(time * 18);
  screenCtx.fillStyle = 'rgba(0, 0, 0, 0.035)';
  for (let i = 0; i < 400; i++) {
    const gx = (Math.sin(i * 997 + grainSeed) * 0.5 + 0.5) * 1024;
    const gy = (Math.cos(i * 613 + grainSeed) * 0.5 + 0.5) * 768;
    screenCtx.fillRect(gx, gy, 1.5, 1.5);
  }

  screenCtx.fillStyle = 'rgba(20, 20, 25, 0.16)';
  const dustSpots = [
    { x: 180, y: 140, w: 2, h: 2 }, { x: 181, y: 142, w: 1.5, h: 2.5 },
    { x: 420, y: 310, w: 2, h: 1.5 },
    { x: 780, y: 220, w: 1.5, h: 3 }, { x: 781, y: 223, w: 1.5, h: 2 },
    { x: 290, y: 560, w: 2.5, h: 2 },
    { x: 640, y: 490, w: 2, h: 1.5 },
    { x: 880, y: 610, w: 1.5, h: 2.5 },
    { x: 130, y: 680, w: 3, h: 1.5 },
    { x: 510, y: 110, w: 1.5, h: 2 }
  ];
  dustSpots.forEach(d => {
    screenCtx.fillRect(d.x, d.y, d.w, d.h);
  });

  const glassVignette = screenCtx.createRadialGradient(512, 384, 180, 512, 384, 580);
  glassVignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  glassVignette.addColorStop(0.55, 'rgba(0, 0, 0, 0.03)');
  glassVignette.addColorStop(0.82, 'rgba(0, 0, 0, 0.10)');
  glassVignette.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
  screenCtx.fillStyle = glassVignette;
  screenCtx.fillRect(0, 0, 1024, 768);

  const topShadow = screenCtx.createLinearGradient(0, 0, 0, 95);
  topShadow.addColorStop(0, 'rgba(0, 0, 0, 0.16)');
  topShadow.addColorStop(0.4, 'rgba(0, 0, 0, 0.06)');
  topShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  screenCtx.fillStyle = topShadow;
  screenCtx.fillRect(0, 0, 1024, 95);

  const bottomShadow = screenCtx.createLinearGradient(0, 768, 0, 680);
  bottomShadow.addColorStop(0, 'rgba(0, 0, 0, 0.14)');
  bottomShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  screenCtx.fillStyle = bottomShadow;
  screenCtx.fillRect(0, 680, 1024, 88);

  const sideGrad = screenCtx.createLinearGradient(0, 0, 1024, 0);
  sideGrad.addColorStop(0, 'rgba(0, 0, 0, 0.12)');
  sideGrad.addColorStop(0.18, 'rgba(0, 0, 0, 0.02)');
  sideGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.04)'); // Lichte 'hotspot' in het centrum
  sideGrad.addColorStop(0.82, 'rgba(0, 0, 0, 0.02)');
  sideGrad.addColorStop(1, 'rgba(0, 0, 0, 0.14)');
  screenCtx.fillStyle = sideGrad;
  screenCtx.fillRect(0, 0, 1024, 768);

  screenTexture.needsUpdate = true;
}

const roomGroup = new THREE.Group();

const textureLoader = new THREE.TextureLoader();
const woodDiffuse = textureLoader.load('wood_floor_diffuse.jpg');
woodDiffuse.wrapS = THREE.RepeatWrapping;
woodDiffuse.wrapT = THREE.RepeatWrapping;
woodDiffuse.repeat.set(12, 12);
woodDiffuse.anisotropy = 8;

const floorGeo = new THREE.PlaneGeometry(50, 50, 128, 128);
const floorMat = new THREE.MeshStandardMaterial({
  map: woodDiffuse,
  bumpMap: woodDiffuse,
  bumpScale: 0.035,
  displacementMap: woodDiffuse,
  displacementScale: 0.012,
  roughness: 0.94, // Mat hout, geen glimmende/spiegelende reflecties
  metalness: 0.0   // 100% niet-metaal/niet-reflecterend
});
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0; // Vloerniveau
floor.receiveShadow = true;
roomGroup.add(floor);

const wallGeo = new THREE.PlaneGeometry(50, 25);
const wallMat = new THREE.MeshStandardMaterial({
  color: 0x060608,
  roughness: 0.95
});
const backWall = new THREE.Mesh(wallGeo, wallMat);
backWall.position.set(0, 12, -10);
backWall.receiveShadow = true;
roomGroup.add(backWall);

const sideWall = new THREE.Mesh(wallGeo, wallMat);
sideWall.position.set(-15, 12, 0);
sideWall.rotation.y = Math.PI / 2;
roomGroup.add(sideWall);

const tvGroup = new THREE.Group();
tvGroup.position.set(0, 0, 0);

let startCamPos = new THREE.Vector3(0.0, 1.1, 4.2);
let startCamTarget = new THREE.Vector3(0, 0.6, 0);
let endCamPos = new THREE.Vector3(0, 0.6, 1.2);
let endCamTarget = new THREE.Vector3(0, 0.6, 0);

let crtScreenMesh = null;

const gltfLoader = new THREE.GLTFLoader();

gltfLoader.load(
  'television_02.glb',
  function (gltf) {
    const model = gltf.scene;

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const targetWidth = 1.95;
    const scaleFactor = targetWidth / (size.x || 1);
    model.scale.set(scaleFactor, scaleFactor, scaleFactor);

    model.position.x = -center.x * scaleFactor;
    model.position.y = -box.min.y * scaleFactor;
    model.position.z = -center.z * scaleFactor;

    let tvMesh = null;
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        tvMesh = child;
      }
    });

    tvGroup.add(model);

    const tvBox = new THREE.Box3().setFromObject(model);
    const tvCenter = tvBox.getCenter(new THREE.Vector3());
    const tvSize = tvBox.getSize(new THREE.Vector3());
    const tvWidth = tvSize.x;

    const screenWidth = tvSize.x * 0.784;
    const screenHeight = (tvSize.y * 0.6) + 0.0;

    const screenGeo = new THREE.PlaneGeometry(screenWidth, screenHeight, 48, 48);
    const pos = screenGeo.attributes.position;
    const cornerRadius = 0.15; // Royale afronding passend bij de diepe hoeken van de bezel

    for (let i = 0; i < pos.count; i++) {
      let px = pos.getX(i);
      let py = pos.getY(i);

      const absX = Math.abs(px);
      const absY = Math.abs(py);
      const halfW = screenWidth / 2;
      const halfH = screenHeight / 2;
      const cornerDx = absX - (halfW - cornerRadius);
      const cornerDy = absY - (halfH - cornerRadius);

      if (cornerDx > 0 && cornerDy > 0) {
        const cornerDist = Math.sqrt(cornerDx * cornerDx + cornerDy * cornerDy);
        if (cornerDist > cornerRadius) {
          const factor = cornerRadius / cornerDist;
          px = Math.sign(px) * ((halfW - cornerRadius) + cornerDx * factor);
          py = Math.sign(py) * ((halfH - cornerRadius) + cornerDy * factor);
          pos.setX(i, px);
          pos.setY(i, py);
        }
      }

      const nx = px / halfW;
      const ny = py / halfH;
      const distSq = (nx * nx) + (ny * ny);
      const pz = Math.max(0, (1 - distSq * 0.45) * 0.052);
      pos.setZ(i, pz);
    }
    screenGeo.computeVertexNormals();

    const screenMaterial = new THREE.MeshBasicMaterial({
      map: screenTexture,
      toneMapped: false,
      side: THREE.DoubleSide
    });

    crtScreenMesh = new THREE.Mesh(screenGeo, screenMaterial);

    const SCREEN_POS_X = tvCenter.x;
    const SCREEN_POS_Y = tvBox.min.y + (tvSize.y * 0.6370) + 0.025;
    const SCREEN_POS_Z = tvBox.max.z - 0.040;

    crtScreenMesh.position.set(SCREEN_POS_X, SCREEN_POS_Y, SCREEN_POS_Z);
    tvGroup.add(crtScreenMesh);

    crtScreenLight.position.set(SCREEN_POS_X, SCREEN_POS_Y, SCREEN_POS_Z + 0.1);
    crtScreenLight.target.position.set(SCREEN_POS_X, SCREEN_POS_Y * 0.4, SCREEN_POS_Z + 3.0);
    crtFillLight.position.set(SCREEN_POS_X, SCREEN_POS_Y, SCREEN_POS_Z + 0.2);

    const MOBILE_BREAKPOINT = 768;

    const MOBILE_ZOOM_DISTANCE = 3.10;   // <-- HIER JOUW MOBIELE STANDAARD AFSTAND AANPASSEN
    const DESKTOP_ZOOM_DISTANCE = 2.45;  // <-- HIER JOUW DESKTOP STANDAARD AFSTAND AANPASSEN

    const MOBILE_ZOOM_DISTANCE_PLUS = 2.50;  // <-- HIER JOUW MOBIELE EXTRA ZOOM (+) AANPASSEN
    const DESKTOP_ZOOM_DISTANCE_PLUS = 1.55; // <-- HIER JOUW DESKTOP EXTRA ZOOM (+) AANPASSEN

    function updateCameraBounds() {
      const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
      const currentVFOV = (camera.fov * Math.PI) / 180;
      const currentHFOV = 2 * Math.atan(Math.tan(currentVFOV / 2) * camera.aspect);

      const distPercent = isMobile ? 0.32 : 0.11;
      const dist10 = (tvWidth / distPercent) / (2 * Math.tan(currentHFOV / 2));
      const elevationAngle = 35 * (Math.PI / 180);
      const startDist = Math.max(9.0, dist10);
      const startY = tvCenter.y + (Math.sin(elevationAngle) * startDist);
      const startZ = tvCenter.z + (Math.cos(elevationAngle) * startDist);

      startCamTarget.set(tvCenter.x, tvCenter.y, tvCenter.z);
      startCamPos.set(tvCenter.x, startY, startZ);

      const distMinus = isMobile ? MOBILE_ZOOM_DISTANCE : DESKTOP_ZOOM_DISTANCE;
      const distPlus = isMobile ? MOBILE_ZOOM_DISTANCE_PLUS : DESKTOP_ZOOM_DISTANCE_PLUS;
      const chosenDistance = THREE.MathUtils.lerp(distMinus, distPlus, extraZoomFactor);

      endCamPos.set(SCREEN_POS_X, SCREEN_POS_Y, SCREEN_POS_Z + chosenDistance);
      endCamTarget.set(SCREEN_POS_X, SCREEN_POS_Y, SCREEN_POS_Z);
    }

    window.updateCameraBounds = updateCameraBounds;
    updateCameraBounds();

    camera.position.copy(startCamPos);
    camera.lookAt(startCamTarget);
  },
  undefined,
  function (error) {
    console.error('Fout bij laden van television_02.glb:', error);
  }
);

roomGroup.add(tvGroup);
scene.add(roomGroup);

const crtScreenLight = new THREE.SpotLight(0xffffff, 2.8, 12.0, Math.PI / 2.5, 0.8, 1.2);
crtScreenLight.position.set(0, 0.65, 0.4);
crtScreenLight.target.position.set(0, 0.2, 3.5);
scene.add(crtScreenLight.target);
scene.add(crtScreenLight);

const crtFillLight = new THREE.PointLight(0xffffff, 1.2, 5.0, 2.0);
crtFillLight.position.set(0, 0.65, 0.5);
scene.add(crtFillLight);

const ambientLight = new THREE.AmbientLight(0x020204, 0.08);
scene.add(ambientLight);

const overheadSpotlight = new THREE.SpotLight(0xc2d8ee, 2.6, 15.0, Math.PI / 5.5, 0.7, 1.2);
overheadSpotlight.position.set(0, 5.0, 2.4);
overheadSpotlight.target.position.set(0, 0.55, 0.0);
scene.add(overheadSpotlight.target);
scene.add(overheadSpotlight);

camera.position.copy(startCamPos);
camera.lookAt(startCamTarget);

const canvasContainer = document.getElementById('canvas-container');
const roomVignette = document.getElementById('roomVignette');
const introOverlay = document.getElementById('intro-overlay');
const zoomControls = document.getElementById('zoom-controls');
const zoomBtnPlus = document.getElementById('zoom-btn-plus');
const zoomBtnMinus = document.getElementById('zoom-btn-minus');

let isExtraZoomed = false;
let extraZoomFactor = 0.0;
let targetExtraZoomFactor = 0.0;

function setZoomLevel(zoomedIn) {
  isExtraZoomed = zoomedIn;
  targetExtraZoomFactor = zoomedIn ? 1.0 : 0.0;
  if (zoomBtnPlus && zoomBtnMinus) {
    if (zoomedIn) {
      zoomBtnPlus.classList.add('active');
      zoomBtnMinus.classList.remove('active');
    } else {
      zoomBtnMinus.classList.add('active');
      zoomBtnPlus.classList.remove('active');
    }
  }
}

if (zoomBtnPlus) {
  zoomBtnPlus.addEventListener('click', (e) => {
    e.stopPropagation();
    setZoomLevel(true);
  });
}

if (zoomBtnMinus) {
  zoomBtnMinus.addEventListener('click', (e) => {
    e.stopPropagation();
    setZoomLevel(false);
  });
}

const ZOOM_END_THRESHOLD = 0.75;
const TRANSITION_THRESHOLD = 0.82;

let currentProgress = 0;
let targetProgress = 0;
let mouseX = 0;
let mouseY = 0;

window.addEventListener('mousemove', (e) => {
  mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
  mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
});

function updateScrollProgress() {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);

  targetProgress = Math.max(0, Math.min(1.0, scrollTop / maxScroll));
}

window.addEventListener('scroll', updateScrollProgress, { passive: true });

window.addEventListener('wheel', (e) => {
  const maxScroll = pageMaxScrollOffsets[currentPage] || 0;
  if (currentProgress > 0.82 && maxScroll > 0) {
    const current = pageScrollOffsets[currentPage] || 0;

    if ((e.deltaY > 0 && current < maxScroll) || (e.deltaY < 0 && current > 0)) {
      pageScrollOffsets[currentPage] = Math.max(0, Math.min(maxScroll, current + e.deltaY * 0.75));
      screenTexture.needsUpdate = true;
      e.preventDefault();
      return;
    }
  }
}, { passive: false });

let touchStartY = 0;
window.addEventListener('touchstart', (e) => {
  if (e.touches.length > 0) {
    touchStartY = e.touches[0].clientY;
  }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  const maxScroll = pageMaxScrollOffsets[currentPage] || 0;
  if (currentProgress > 0.82 && maxScroll > 0 && e.touches.length > 0) {
    const touchY = e.touches[0].clientY;
    const deltaY = touchStartY - touchY;
    const current = pageScrollOffsets[currentPage] || 0;

    if ((deltaY > 0 && current < maxScroll) || (deltaY < 0 && current > 0)) {
      pageScrollOffsets[currentPage] = Math.max(0, Math.min(maxScroll, current + deltaY * 1.2));
      touchStartY = touchY;
      screenTexture.needsUpdate = true;
      e.preventDefault();
    }
  }
}, { passive: false });

const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();

function getCanvasCoordinatesFromEvent(e) {
  if (!crtScreenMesh) return null;

  mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouseNDC, camera);
  const intersects = raycaster.intersectObject(crtScreenMesh);

  if (intersects.length > 0 && intersects[0].uv) {
    const uv = intersects[0].uv;
    const canvasX = uv.x * 1024;
    const canvasY = (1 - uv.y) * 768; // Inverteer Y voor canvas top-down
    return { x: canvasX, y: canvasY };
  }
  return null;
}

window.addEventListener('mousemove', (e) => {
  const coords = getCanvasCoordinatesFromEvent(e);
  let foundHover = null;

  if (coords) {
    for (const tab of NAV_TABS) {
      const tabHitbox = {
        minX: tab.x - 8,
        maxX: tab.x + tab.boxW + tab.textW + 16,
        minY: tab.y - 8,
        maxY: tab.y + tab.boxH + 12
      };

      if (coords.x >= tabHitbox.minX && coords.x <= tabHitbox.maxX &&
        coords.y >= tabHitbox.minY && coords.y <= tabHitbox.maxY) {
        foundHover = tab.id;
        break;
      }
    }

    if (!foundHover && currentPage === 'home' && coords.y >= 175 && coords.y <= 720) {
      for (const ph of projectHitboxes) {
        if (coords.x >= ph.minX && coords.x <= ph.maxX && coords.y >= ph.minY && coords.y <= ph.maxY) {
          document.body.style.cursor = 'pointer';
          return;
        }
      }
    }

    if (!foundHover && currentPage === 'tarieven' && coords.y >= 175 && coords.y <= 720) {
      if ((formHitboxes['name'] && coords.x >= formHitboxes['name'].minX && coords.x <= formHitboxes['name'].maxX && coords.y >= formHitboxes['name'].minY && coords.y <= formHitboxes['name'].maxY) ||
        (formHitboxes['email'] && coords.x >= formHitboxes['email'].minX && coords.x <= formHitboxes['email'].maxX && coords.y >= formHitboxes['email'].minY && coords.y <= formHitboxes['email'].maxY) ||
        (formHitboxes['phone'] && coords.x >= formHitboxes['phone'].minX && coords.x <= formHitboxes['phone'].maxX && coords.y >= formHitboxes['phone'].minY && coords.y <= formHitboxes['phone'].maxY)) {
        document.body.style.cursor = 'text';
        return;
      }

      if ((formHitboxes['pkg_flex'] && coords.x >= formHitboxes['pkg_flex'].minX && coords.x <= formHitboxes['pkg_flex'].maxX && coords.y >= formHitboxes['pkg_flex'].minY && coords.y <= formHitboxes['pkg_flex'].maxY) ||
        (formHitboxes['pkg_const'] && coords.x >= formHitboxes['pkg_const'].minX && coords.x <= formHitboxes['pkg_const'].maxX && coords.y >= formHitboxes['pkg_const'].minY && coords.y <= formHitboxes['pkg_const'].maxY) ||
        (formHitboxes['submit'] && coords.x >= formHitboxes['submit'].minX && coords.x <= formHitboxes['submit'].maxX && coords.y >= formHitboxes['submit'].minY && coords.y <= formHitboxes['submit'].maxY)) {
        document.body.style.cursor = 'pointer';
        return;
      }
    }
  }

  if (hoveredTab !== foundHover) {
    hoveredTab = foundHover;
    document.body.style.cursor = foundHover ? 'pointer' : 'default';
  } else if (!foundHover) {
    document.body.style.cursor = 'default';
  }
});

window.addEventListener('click', (e) => {
  const coords = getCanvasCoordinatesFromEvent(e);
  if (!coords) return;

  for (const tab of NAV_TABS) {
    const tabHitbox = {
      minX: tab.x - 8,
      maxX: tab.x + tab.boxW + tab.textW + 16,
      minY: tab.y - 8,
      maxY: tab.y + tab.boxH + 12
    };

    if (coords.x >= tabHitbox.minX && coords.x <= tabHitbox.maxX &&
      coords.y >= tabHitbox.minY && coords.y <= tabHitbox.maxY) {
      if (currentPage !== tab.id && !isSwitchingChannel) {
        targetPage = tab.id;
        isSwitchingChannel = true;
        switchStartTime = clock.getElapsedTime();
        playChannelSwitchStatic();
      }
      return;
    }
  }

  if (currentPage === 'home' && coords.y >= 175 && coords.y <= 720) {
    for (const ph of projectHitboxes) {
      if (coords.x >= ph.minX && coords.x <= ph.maxX && coords.y >= ph.minY && coords.y <= ph.maxY) {
        if (ph.link) {
          window.open(ph.link, '_blank');
        }
        return;
      }
    }
  }

  if (currentPage === 'tarieven' && coords.y >= 175 && coords.y <= 720) {
    if (formHitboxes['name'] && coords.x >= formHitboxes['name'].minX && coords.x <= formHitboxes['name'].maxX &&
      coords.y >= formHitboxes['name'].minY && coords.y <= formHitboxes['name'].maxY) {
      setActiveFormField('name');
      return;
    }
    if (formHitboxes['email'] && coords.x >= formHitboxes['email'].minX && coords.x <= formHitboxes['email'].maxX &&
      coords.y >= formHitboxes['email'].minY && coords.y <= formHitboxes['email'].maxY) {
      setActiveFormField('email');
      return;
    }
    if (formHitboxes['phone'] && coords.x >= formHitboxes['phone'].minX && coords.x <= formHitboxes['phone'].maxX &&
      coords.y >= formHitboxes['phone'].minY && coords.y <= formHitboxes['phone'].maxY) {
      setActiveFormField('phone');
      return;
    }

    if (formHitboxes['pkg_flex'] && coords.x >= formHitboxes['pkg_flex'].minX && coords.x <= formHitboxes['pkg_flex'].maxX &&
      coords.y >= formHitboxes['pkg_flex'].minY && coords.y <= formHitboxes['pkg_flex'].maxY) {
      FORM_DATA.package = 'Flexibel pakket';
      screenTexture.needsUpdate = true;
      return;
    }
    if (formHitboxes['pkg_const'] && coords.x >= formHitboxes['pkg_const'].minX && coords.x <= formHitboxes['pkg_const'].maxX &&
      coords.y >= formHitboxes['pkg_const'].minY && coords.y <= formHitboxes['pkg_const'].maxY) {
      FORM_DATA.package = 'Consistent pakket';
      screenTexture.needsUpdate = true;
      return;
    }

    if (formHitboxes['submit'] && coords.x >= formHitboxes['submit'].minX && coords.x <= formHitboxes['submit'].maxX &&
      coords.y >= formHitboxes['submit'].minY && coords.y <= formHitboxes['submit'].maxY) {
      submitFormspree();
      return;
    }
  }

  if (FORM_DATA.activeField) {
    setActiveFormField(null);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  if (window.updateCameraBounds) {
    window.updateCameraBounds();
  }
  updateScrollProgress();
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const elapsedTime = clock.getElapsedTime();

  currentProgress += (targetProgress - currentProgress) * 0.08;

  renderScreenTexture(elapsedTime);

  updateViewportGrain();

  const crtFlicker = Math.sin(elapsedTime * 25) * 0.12 + (Math.random() * 0.06);
  crtScreenLight.intensity = 2.2 + crtFlicker;
  crtFillLight.intensity = 0.9 + (crtFlicker * 0.4);

  const baseFlicker = Math.sin(elapsedTime * 3.7) * 0.15 + Math.sin(elapsedTime * 8.3) * 0.08;
  const microDrop = (Math.sin(elapsedTime * 17.1) > 0.94) ? (Math.random() * 0.25) : 0;
  overheadSpotlight.intensity = Math.max(1.2, 2.3 + baseFlicker - microDrop);

  if (audio.enabled) {
    audio.setVolume(0.4 + currentProgress * 0.6);
  }

  const p = Math.min(1.0, Math.max(0.0, currentProgress));
  const easedP = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

  const parallaxDamp = (1 - easedP * 0.7);
  const targetX = THREE.MathUtils.lerp(startCamPos.x, endCamPos.x, easedP) + (mouseX * 0.12 * parallaxDamp);
  const targetY = THREE.MathUtils.lerp(startCamPos.y, endCamPos.y, easedP) - (mouseY * 0.08 * parallaxDamp);
  const targetZ = THREE.MathUtils.lerp(startCamPos.z, endCamPos.z, easedP);

  camera.position.set(targetX, targetY, targetZ);

  const lookX = THREE.MathUtils.lerp(startCamTarget.x, endCamTarget.x, easedP);
  const lookY = THREE.MathUtils.lerp(startCamTarget.y, endCamTarget.y, easedP);
  const lookZ = THREE.MathUtils.lerp(startCamTarget.z, endCamTarget.z, easedP);

  camera.lookAt(lookX, lookY, lookZ);

  canvasContainer.style.opacity = '1';
  roomVignette.style.opacity = '1';

  if (introOverlay) {
    const fadeLimit = 0.25;
    const t = Math.min(1.0, Math.max(0.0, currentProgress / fadeLimit));
    const smoothT = t * t * (3 - 2 * t); // Boterzachte S-curve
    const introOpacity = 1 - smoothT;

    introOverlay.style.opacity = introOpacity.toFixed(3);
    introOverlay.style.transform = `translateY(${-smoothT * 24}px)`; // Subtiele opwaartse drift tijdens het uitfaden
    introOverlay.style.visibility = introOpacity <= 0.002 ? 'hidden' : 'visible';
  }

  if (Math.abs(extraZoomFactor - targetExtraZoomFactor) > 0.0005) {
    extraZoomFactor += (targetExtraZoomFactor - extraZoomFactor) * 0.10;
    if (window.updateCameraBounds) {
      window.updateCameraBounds();
    }
  }

  if (zoomControls) {
    if (currentProgress > 0.70) {
      zoomControls.classList.add('visible');
    } else {
      zoomControls.classList.remove('visible');
    }
  }

  renderer.render(scene, camera);
}

updateScrollProgress();
animate();
