# NetAcad Solver

> <img src="https://emojigraph.org/media/joypixels/flag-czechia_1f1e8-1f1ff.png" width="10" /> [Česky](#česky) | <img src="https://emojigraph.org/media/joypixels/flag-united-states_1f1fa-1f1f8.png" width="10" /> [English](#english)

---

<a name="česky"></a>

## <img src="https://emojigraph.org/media/joypixels/flag-czechia_1f1e8-1f1ff.png" width="20" /> Česky

Skript pro automatické odpovídání na otázky v testech **Cisco NetAcad IT Essentials**. Detekuje aktivní otázku, stáhne správné odpovědi (z cache nebo přes AI) a pak čeká. Podržíš CTRL, přejedeš myší přes možnosti - skript klikne na správné, špatné ignoruje.

### Co to umí

- odpovědi přes AI pokud není uložená otázks (default Groq) (`qwen/qwen3-32b`)
- offline cache s odpověďmi přímo z kurzu (JSON soubory v repozitáři)
- ovládání přes CTRL + hover - víc nenápadný jak předchozí verze
- funguje i na otázkách s obrázky (multimodální LLM)
- MCQ (jedno i více správných) i matching otázky

---

### Instalace

#### 1. Rozšíření do prohlížeče

Nainstaluj **[User JavaScript & CSS](https://chromewebstore.google.com/detail/user-javascript-and-css/nbhcbdghjpllgmfilhnhkllmkecfmpld)** do Chrome a ujisti se, že má povoleno spouštět skripty.
</br><img src="https://i.ibb.co/QFMvVMyy/image.png" width="625"/>

#### 2. Otevři NetAcad

[https://www.netacad.com/](https://www.netacad.com/)

#### 3. Nové pravidlo

Klikni na ikonu rozšíření → **„New rule: www.netacad.com"** a nastav:
</br><img src="https://i.ibb.co/C5S4MLWV/image.png" width="200"/>

| Nastavení | Hodnota |
|---|---|
| Název | cokoliv (třeba `NetAcad Solver`) |
| URL vzor | `https://www.netacad.com/*` |
| All frames | ✅ zapnuto </br><img src="https://i.ibb.co/HDGLTK4S/brave-Lg-D79g2-PAS.png" width="300" /> |

#### 4. Vlož skript

Zkopíruj obsah [`minified.js`](https://github.com/Hajdenko/netacad-solver/blob/main/minified.js) (nebo [`main.js`](https://github.com/Hajdenko/netacad-solver/blob/main/main.js) pokud minifikovaný nefunguje) do sekce JavaScript. Na začátku nastav API klíč:
- Lidi, který znám osobně ten klíč rovnou posílám.

```js
const API_KEY = 'TVŮJ_API_KLÍČ';
```

#### 5. Ulož a obnov stránku

Klikni na **Save** tlačítko: <img src="https://i.ibb.co/tMF578yQ/image.png" width="30"/> vpravo nahoře, zavři nastavení a refreshni netacad.com.

---

### Použití

1. Otevři libovolný test na NetAcad.
2. Podrž **CTRL** - skript na pozadí načte správné odpovědi pro aktuální otázku.
3. Přejíždej myší přes možnosti. Na správné klikne, špatné prostě přeskočí.

#### Matching otázky

Funguje ve dvou krocích - nejdřív hover na kategorii (skript ji klikne), pak hover na správnou možnost (skript přiřadí). Opakuj pro každý pár.

---

### ⚠️ Disclaimer

Je jen jeden typ otázky, který tento script nezvládá a to jsou multi otázky, kde rozklikneš box a máš tam několik odpovědí, které vybereš.
Jen pro studijní účely. Použití u ostrých zkoušek může porušovat podmínky Cisco NetAcad. Autor neručí za nic, skript nebyl testován autorem.

---
---

<a name="english"></a>
## <img src="https://emojigraph.org/media/joypixels/flag-united-states_1f1fa-1f1f8.png" width="20" /> English

A script that automatically answers questions in **Cisco NetAcad IT Essentials** quizzes. It detects the active question, fetches correct answers (from cache or via Groq API), and waits. Hold CTRL, hover over the options - it clicks the correct ones and ignores the rest.

### Features

- AI answers via Groq API (`qwen/qwen3-32b`)
- offline cache with answers from the official Cisco curriculum (JSON files in this repo)
- CTRL + hover control - low-key, natural
- works on image-based questions (multimodal LLM)
- supports MCQ (single and multi-select) and matching questions

---

### Installation

#### 1. Browser extension

Install **[User JavaScript & CSS](https://chromewebstore.google.com/detail/user-javascript-and-css/nbhcbdghjpllgmfilhnhkllmkecfmpld)** in Chrome and make sure it's allowed to run user scripts.
</br><img src="https://i.ibb.co/QFMvVMyy/image.png" width="605"/>

#### 2. Open NetAcad

[https://www.netacad.com/](https://www.netacad.com/)

#### 3. New rule

Click the extension icon → **"New rule: www.netacad.com"** and configure:
</br><img src="https://i.ibb.co/C5S4MLWV/image.png" width="200"/>

| Setting | Value |
|---|---|
| Name | anything (e.g. `NetAcad Solver`) |
| URL pattern | `https://www.netacad.com/*` |
| All frames | ✅ enabled </br><img src="https://i.ibb.co/HDGLTK4S/brave-Lg-D79g2-PAS.png" width="300" /> |

#### 4. Paste the script

Copy the contents of [`minified.js`](https://github.com/Hajdenko/netacad-solver/blob/main/minified.js) (or [`main.js`](https://github.com/Hajdenko/netacad-solver/blob/main/main.js) if minified breaks) into the JavaScript section. Set your API key at the top:

```js
const API_KEY = 'YOUR_API_KEY';
```

Free key at [console.groq.com](https://console.groq.com).

#### 5. Save and refresh

Hit **Save**: <img src="https://i.ibb.co/tMF578yQ/image.png" width="30"/> top right, close the extension, refresh netacad.com.

---

### Usage

1. Open any quiz on NetAcad.
2. Hold **CTRL** - the script fetches the correct answers for the current question in the background.
3. Hover over the options. It clicks the correct ones and does nothing on wrong ones.

#### Matching questions

Two steps - hover over a category first (script clicks it), then hover over the correct option (script assigns it). Repeat for each pair.

---

### ⚠️ Disclaimer

The only question type this script doesn't work for is the multi-answer question type where your goal is to open the answer box and pick from multiple answers.
For study purposes only. Using this during official exams may violate Cisco NetAcad's Terms of Service. Use at your own risk.

---

### Repo structure

```
netacad-solver/
├── answers/          # cached answers from Cisco NetAcad curriculum (JSON)
├── main.js           # readable source
└── minified.js       # minified version for the extension
```

---

### Links

- [NetAcad](https://www.netacad.com/)
- [User JavaScript & CSS](https://chromewebstore.google.com/detail/user-javascript-and-css/nbhcbdghjpllgmfilhnhkllmkecfmpld)
