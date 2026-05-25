// ── Configuration ─────────────────────────────────────────────────────────────
const API_KEY = 'YOUR_API_KEY';
const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL   = 'qwen/qwen3-32b';
const DEBUG   = false;
// ──────────────────────────────────────────────────────────────────────────────

(function () {
    const log = DEBUG ? (...a) => console.log('[NC]', ...a) : () => {};
    const err = (...a) => console.error('[NC]', ...a);

    if (!API_KEY || API_KEY === 'YOUR_API_KEY') { err('Set your API_KEY in the configuration block'); return; }

    const GITHUB_OWNER  = 'Hajdenko';
    const GITHUB_REPO   = 'netacad-solver';
    const GITHUB_BRANCH = 'main';
    const TREE_URL      = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/${GITHUB_BRANCH}?recursive=1`;
    const RAW_BASE      = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/refs/heads/${GITHUB_BRANCH}/`;

    const CURSOR_ID = '__nc_cursor__';
    const STYLE_ID  = '__nc_style__';
    const RAF_KEY   = '__nc_raf__';
    const PTR_CLASS = '__nc_ptr__';

    document.getElementById(CURSOR_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    if (window[RAF_KEY]) { cancelAnimationFrame(window[RAF_KEY]); window[RAF_KEY] = null; }

    const SYS_MCQ = `You are an expert Cisco NetAcad IT Essentials exam assistant.
Always use official Cisco NetAcad curriculum definitions — not general IT knowledge.
Rules:
- Pay attention to exact wording; answers that sound similar may differ in critical details.
- For "choose X" questions, select EXACTLY the required number of answers — no more, no less.
- Prefer the answer that matches Cisco's official terminology and course material.
- When in doubt between two close answers, choose the one more specific to Cisco curriculum.`;

    const SYS_MATCH = `You are an expert Cisco NetAcad IT Essentials exam assistant.
Match each category to the correct option using official Cisco NetAcad curriculum definitions.
Respond ONLY with pairs in format "A:2,B:1,C:4,D:3" where the letter is the category and the number is the option. Nothing else.`;

    // ── Answer cache ──────────────────────────────────────────────────────────

    let cache = null;

    async function loadCache() {
        if (cache) return;
        cache = [];
        try {
            const res  = await fetch(TREE_URL + '&t=' + Date.now());
            const data = await res.json();
            if (!data.tree) { err('Cache tree error:', data.message); return; }
            const files = data.tree.filter(i => i.type === 'blob' && i.path.startsWith('answers/') && i.path.endsWith('.json'));
            const arrays = await Promise.all(files.map(async f => {
                try { const r = await fetch(RAW_BASE + f.path + '?t=' + Date.now()); return await r.json(); }
                catch { return []; }
            }));
            const map = new Map();
            for (const arr of arrays) if (Array.isArray(arr)) for (const e of arr) if (e?.q) map.set(norm(e.q), e);
            cache = [...map.values()];
            log('Cache loaded:', cache.length, 'entries');
        } catch (e) { err('Cache load failed:', e.message); }
    }

    const norm = s => s.toLowerCase().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

    function cacheLookupMcq(q, answers) {
        const entry = cache.find(e => norm(e.q) === norm(q));
        if (!entry) return null;
        const matched = [];
        for (const group of entry.a.split(';').map(s => s.split('|').map(a => a.trim().toLowerCase()))) {
            for (const alt of group) {
                const hit = answers.find(a => a.text.toLowerCase() === alt)
                         || answers.find(a => a.text.toLowerCase().includes(alt) || alt.includes(a.text.toLowerCase()));
                if (hit) { matched.push(hit); break; }
            }
        }
        return matched.length ? matched : null;
    }

    function cacheLookupMatch(q, cats, opts) {
        const entry = cache.find(e => norm(e.q) === norm(q));
        if (!entry) return null;
        const pairs = [];
        for (const part of entry.a.split(';')) {
            const [c, o] = part.split(':').map(s => s.trim().toLowerCase());
            const cat = cats.find(x => norm(x.text).includes(c) || c.includes(norm(x.text)));
            const opt = opts.find(x => norm(x.text).includes(o) || o.includes(norm(x.text)));
            if (cat && opt) pairs.push({ category: cat, option: opt });
        }
        return pairs.length === cats.length ? pairs : null;
    }

    // ── DOM helpers ───────────────────────────────────────────────────────────

    function deepQueryAll(root, selector) {
        const out = [];
        const walk = node => {
            if (!node) return;
            try {
                node.querySelectorAll(selector).forEach(el => out.push(el));
                node.querySelectorAll('*').forEach(el => { if (el.shadowRoot) walk(el.shadowRoot); });
            } catch {}
        };
        walk(root);
        return out;
    }

    function getRoot() {
        const a = document.querySelector('app-root');
        return a?.shadowRoot ?? document;
    }

    function getActiveView() {
        for (const bv of deepQueryAll(getRoot(), 'block-view')) {
            if (bv.getAttribute('tabindex') !== '0' || !bv.shadowRoot) continue;
            const mcq = deepQueryAll(bv.shadowRoot, 'mcq-view')[0];
            if (mcq) return { type: 'mcq', view: mcq };
            const om = deepQueryAll(bv.shadowRoot, 'object-matching-view')[0];
            if (om) return { type: 'matching', view: om };
        }
        return null;
    }

    function extractMcq(view) {
        if (!view.shadowRoot) return null;
        let q = '', answers = [], multi = false, done = false, img = null;
        const seen = new Set();
        const items = view.shadowRoot.querySelectorAll('.mcq__item');
        if (items[0]?.querySelector('input')?.type === 'checkbox') multi = true;
        items.forEach(item => {
            if (item.querySelector('input')?.checked) done = true;
            const el = item.querySelector('.mcq__item-text-inner');
            if (!el) return;
            const clone = el.cloneNode(true);
            clone.querySelectorAll('.screenReader-position-text').forEach(s => s.remove());
            const t = clone.textContent.replace(/\u00a0/g, ' ').trim();
            if (t && !seen.has(t)) { seen.add(t); answers.push({ text: t, element: item.querySelector('label') ?? item }); }
        });
        const bv = view.shadowRoot.querySelector('base-view');
        if (bv?.shadowRoot) {
            const bo = bv.shadowRoot.querySelector('.component__body-inner');
            if (bo) { q = bo.textContent.trim(); img = bo.querySelector('img')?.getAttribute('src') ?? null; }
        }
        return answers.length ? { q, answers, multi, done, img } : null;
    }

    function extractMatching(view) {
        if (!view.shadowRoot) return null;
        let q = ''; const cats = [], opts = [];
        const bv = view.shadowRoot.querySelector('base-view');
        if (bv?.shadowRoot) {
            const bo = bv.shadowRoot.querySelector('.objectMatching__body-inner, .component__body-inner');
            if (bo) q = bo.textContent.trim();
        }
        view.shadowRoot.querySelectorAll('.objectMatching-category-item').forEach(btn => {
            const t = btn.querySelector('.category-item-text'), l = btn.querySelector('.category-item-number');
            if (t && l) cats.push({ text: t.textContent.trim(), letter: l.textContent.trim(), element: btn });
        });
        view.shadowRoot.querySelectorAll('.objectMatching-option-item').forEach(btn => {
            const t = btn.querySelector('.category-item-text'), n = btn.querySelector('.category-item-number');
            if (t) opts.push({ text: t.textContent.trim(), element: btn, matched: n?.textContent.trim() !== '' });
        });
        if (!cats.length && !opts.length) return null;
        return { q, cats, opts, done: opts.length > 0 && opts.every(o => o.matched) };
    }

    // ── Groq API ──────────────────────────────────────────────────────────────

    async function imgToB64(url) {
        const blob = await (await fetch(new URL(url, document.baseURI).href)).blob();
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result.split(',')[1]);
            r.onerror = rej;
            r.readAsDataURL(blob);
        });
    }

    function mimeOf(url) {
        if (url.endsWith('.png'))  return 'image/png';
        if (url.endsWith('.gif'))  return 'image/gif';
        if (url.endsWith('.webp')) return 'image/webp';
        return 'image/jpeg';
    }

    async function groqMcq(q, answers, multi, img) {
        const list = answers.map((a, i) => `${i + 1}. ${a.text}`).join('\n');
        const inst = multi
            ? 'The question requires multiple correct answers. Respond with ONLY the numbers separated by commas. Example: 1,3'
            : 'Respond with ONLY the number of the correct answer. Example: 2';
        let content;
        if (img) {
            try {
                const b64 = await imgToB64(img);
                content = [
                    { type: 'image_url', image_url: { url: `data:${mimeOf(img)};base64,${b64}` } },
                    { type: 'text', text: `Question: ${q}\n\nAnswers:\n${list}\n\n${inst}` }
                ];
            } catch { content = `Question: ${q}\n\nAnswers:\n${list}\n\n${inst}`; }
        } else {
            content = `Question: ${q}\n\nAnswers:\n${list}\n\n${inst}`;
        }
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
            body: JSON.stringify({ model: img ? 'meta-llama/llama-4-scout-17b-16e-instruct' : MODEL, messages: [{ role: 'system', content: SYS_MCQ }, { role: 'user', content }], temperature: 0 })
        });
        if (!res.ok) throw new Error(`Groq ${res.status}`);
        return (await res.json()).choices[0].message.content.trim();
    }

    async function groqMatch(q, cats, opts) {
        const catList = cats.map(c => `${c.letter}. ${c.text}`).join('\n');
        const optList = opts.map((o, i) => `${i + 1}. ${o.text}`).join('\n');
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
            body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: SYS_MATCH }, { role: 'user', content: `${q ? 'Question: ' + q + '\n\n' : ''}Categories:\n${catList}\n\nOptions:\n${optList}` }], temperature: 0 })
        });
        if (!res.ok) throw new Error(`Groq ${res.status}`);
        return (await res.json()).choices[0].message.content.trim();
    }

    function parseMcqNums(raw, answers) {
        const nums = raw.match(/\d+/g) ?? [];
        const out = [];
        for (const n of nums) { const a = answers[+n - 1]; if (a && !out.includes(a)) out.push(a); }
        return out;
    }

    function parseMatchPairs(raw, cats, opts) {
        const pairs = [];
        for (const m of raw.match(/([A-Z]):(\d+)/g) ?? []) {
            const [l, n] = m.split(':');
            const cat = cats.find(c => c.letter === l), opt = opts[+n - 1];
            if (cat && opt) pairs.push({ category: cat, option: opt });
        }
        return pairs;
    }

    // ── Cursor ────────────────────────────────────────────────────────────────

    const SVG_ARROW   = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><path d="M3 1.5 L3 15 L6.5 11.5 L9 17 L10.5 16.3 L8 10.8 L13 10.8 Z" fill="white" stroke="black" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
    const SVG_POINTER = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="20" viewBox="0 0 16 20"><path d="M4.5 1 C4.5 0.4 5 0 5.5 0 C6 0 6.5 0.4 6.5 1 L6.5 9 C6.8 8.5 7.4 8.2 8 8.2 C8.7 8.2 9.3 8.6 9.5 9.2 C9.8 8.7 10.4 8.4 11 8.4 C11.7 8.4 12.3 8.8 12.5 9.5 C12.8 9 13.3 8.7 13.9 8.7 C14.8 8.7 15.5 9.4 15.5 10.3 L15.5 14.5 C15.5 17 13.5 19 11 19 L8.5 19 C7.2 19 6 18.5 5.2 17.5 L1.2 12.8 C0.7 12.2 0.7 11.3 1.2 10.7 C1.7 10.1 2.6 10 3.2 10.4 L4.5 11.4 Z" fill="white" stroke="black" stroke-width="1" stroke-linejoin="round"/></svg>`;
    const URL_ARROW   = URL.createObjectURL(new Blob([SVG_ARROW],   { type: 'image/svg+xml' }));
    const URL_POINTER = URL.createObjectURL(new Blob([SVG_POINTER], { type: 'image/svg+xml' }));

    const markPtr = node => {
        if (!node || node.nodeType !== 1) return;
        if (getComputedStyle(node).cursor === 'pointer') node.classList.add(PTR_CLASS);
        node.shadowRoot?.querySelectorAll('*').forEach(markPtr);
    };
    const forceNone = node => {
        if (!node || node.nodeType !== 1) return;
        node.style.setProperty('cursor', 'none', 'important');
        node.shadowRoot?.querySelectorAll('*').forEach(forceNone);
    };

    document.querySelectorAll('*').forEach(markPtr);

    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = '* { cursor: none !important; }';
    document.head.appendChild(styleEl);
    document.querySelectorAll('*').forEach(forceNone);

    new MutationObserver(muts => {
        for (const m of muts) {
            m.addedNodes.forEach(n => {
                if (n.nodeType !== 1) return;
                markPtr(n); n.querySelectorAll?.('*').forEach(markPtr);
                forceNone(n); n.querySelectorAll?.('*').forEach(forceNone);
            });
        }
    }).observe(document.body, { childList: true, subtree: true });

    const IS_IFRAME = window.self !== window.top;
    let realX = window.innerWidth / 2, realY = window.innerHeight / 2;
    let animating = false, isSynth = false;

    document.addEventListener('mousemove', e => { if (!isSynth) { realX = e.clientX; realY = e.clientY; } }, { passive: true, capture: true });

    const cursorEl = document.createElement('div');
    cursorEl.id = CURSOR_ID;
    cursorEl.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;left:0;top:0;width:18px;height:22px;will-change:transform;background-size:contain;background-repeat:no-repeat;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35));transition:opacity 0.05s;';
    document.body.appendChild(cursorEl);

    if (IS_IFRAME) {
        cursorEl.style.opacity = '0';
        window.addEventListener('message', e => {
            if (e.data === '__nc_show__') cursorEl.style.opacity = '1';
            if (e.data === '__nc_hide__') cursorEl.style.opacity = '0';
        });
    } else {
        const bindFrame = iframe => {
            if (iframe._ncBound) return;
            iframe._ncBound = true;
            iframe.addEventListener('mouseenter', () => {
                cursorEl.style.opacity = '0';
                try { iframe.contentWindow.postMessage('__nc_show__', '*'); } catch {}
            });
            iframe.addEventListener('mouseleave', () => {
                cursorEl.style.opacity = '1';
                try { iframe.contentWindow.postMessage('__nc_hide__', '*'); } catch {}
            });
        };
        const watchFrames = () => document.querySelectorAll('iframe').forEach(bindFrame);
        watchFrames();
        new MutationObserver(watchFrames).observe(document.body, { childList: true, subtree: true });
    }

    // ── Animation ─────────────────────────────────────────────────────────────

    let cursorShape = null, fakeX = realX, fakeY = realY;
    let animResolve = null, animEase, animSX, animSY, animCP1X, animCP1Y, animCP2X, animCP2Y, animTX, animTY, animStart, animDur;

    const rnd   = (a, b) => a + Math.random() * (b - a);
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const easings = {
        inOutCubic: t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2,
        inQuart:    t => t*t*t*t,
        outCubic:   t => 1 - Math.pow(1-t,3),
        outExpo:    t => t === 1 ? 1 : 1 - Math.pow(2,-10*t),
        inCubic:    t => t*t*t,
    };

    function deepestAt(x, y) {
        let el = document.elementFromPoint(x, y);
        while (el) { const s = el.shadowRoot?.elementFromPoint(x, y); if (!s || s === el) break; el = s; }
        return el;
    }

    function isPtr(el) {
        let n = el;
        while (n && n !== document.body) { if (n.classList?.contains(PTR_CLASS)) return true; n = n.parentElement; }
        return false;
    }

    function applyPos(x, y) {
        fakeX = x; fakeY = y;
        cursorEl.style.transform = `translate(${x}px,${y}px)`;
        const el = deepestAt(x, y);
        const shape = el && isPtr(el) ? 'pointer' : 'arrow';
        if (shape !== cursorShape) {
            cursorShape = shape;
            cursorEl.style.backgroundImage = `url("${shape === 'pointer' ? URL_POINTER : URL_ARROW}")`;
        }
    }

    function rafLoop() {
        if (animResolve) {
            const t = clamp((performance.now() - animStart) / animDur, 0, 1);
            const e = animEase(t);
            const inv = 1 - e;
            const x = Math.round(inv*inv*inv*animSX + 3*inv*inv*e*animCP1X + 3*inv*e*e*animCP2X + e*e*e*animTX);
            const y = Math.round(inv*inv*inv*animSY + 3*inv*inv*e*animCP1Y + 3*inv*e*e*animCP2Y + e*e*e*animTY);
            applyPos(x, y);
            isSynth = true;
            document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
            isSynth = false;
            if (t >= 1) { const res = animResolve; animResolve = null; res(); }
        } else if (!animating) {
            applyPos(realX, realY);
        }
        window[RAF_KEY] = requestAnimationFrame(rafLoop);
    }
    window[RAF_KEY] = requestAnimationFrame(rafLoop);

    function moveTo(tx, ty, dur, ease = easings.inOutCubic, jitter = 0.25) {
        return new Promise(resolve => {
            animEase = ease;
            animSX = fakeX; animSY = fakeY;
            animTX = tx; animTY = ty;
            const dx = tx - fakeX, dy = ty - fakeY;
            const j = clamp(Math.sqrt(dx*dx+dy*dy) * jitter, 0, 80);
            animCP1X = fakeX + dx*0.25 + rnd(-j,j); animCP1Y = fakeY + dy*0.25 + rnd(-j,j);
            animCP2X = fakeX + dx*0.75 + rnd(-j,j); animCP2Y = fakeY + dy*0.75 + rnd(-j,j);
            animDur = dur; animStart = performance.now(); animResolve = resolve;
        });
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // ── Human-like click ──────────────────────────────────────────────────────

    function isOnEl(el) {
        const r = el.getBoundingClientRect();
        return fakeX >= r.left && fakeX <= r.right && fakeY >= r.top && fakeY <= r.bottom;
    }

    function gauss() {
        return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
    }

    async function humanClick(el, returnAfter = true) {
        animating = true;
        try {
            let cx, cy;

            if (isOnEl(el)) {
                cx = Math.round(fakeX + rnd(-3,3));
                cy = Math.round(fakeY + rnd(-2,2));
                await sleep(rnd(40,100));
            } else {
                const r = el.getBoundingClientRect();
                const tx = clamp(Math.round(r.left + r.width*0.4 + gauss()*r.width*0.22),  r.left+4, r.right-4);
                const ty = clamp(Math.round(r.top  + r.height*0.5 + gauss()*r.height*0.22), r.top+4,  r.bottom-4);

                const dx = tx - fakeX, dy = ty - fakeY;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const spd  = rnd(0.4, 0.7);
                const dur  = Math.max(300, dist / spd);
                const seg  = rnd(350, 500);

                if (dist > seg) {
                    const steps = Math.floor(dist / seg);
                    for (let s = 0; s < steps; s++) {
                        const f = (s+1) / (steps+1);
                        await moveTo(fakeX + dx*f + rnd(-12,12), fakeY + dy*f + rnd(-12,12), dur/(steps+1), s===0 ? easings.inOutCubic : easings.outCubic, rnd(0.1,0.25));
                        await sleep(rnd(180,280));
                    }
                    await moveTo(tx, ty, dur/(steps+1), easings.inOutCubic, rnd(0.08,0.18));
                } else {
                    const styles = [
                        () => moveTo(tx, ty, dur, easings.inQuart, 0.15),
                        () => moveTo(tx, ty, dur, easings.inOutCubic, 0.3),
                        () => moveTo(tx, ty, dur, easings.outExpo, 0.1),
                    ];
                    await styles[Math.floor(Math.random()*styles.length)]();
                }

                if (Math.random() > 0.4) await moveTo(tx+rnd(-6,6), ty+rnd(-4,4), rnd(60,140), easings.outCubic, 0.02);
                await sleep(rnd(60,200));
                cx = fakeX; cy = fakeY;
            }

            const target = deepestAt(cx, cy) ?? el;
            const opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window };
            target.dispatchEvent(new PointerEvent('pointerover',  { ...opts, pointerId:1, isPrimary:true }));
            target.dispatchEvent(new MouseEvent('mouseover', opts));
            target.dispatchEvent(new PointerEvent('pointerdown',  { ...opts, pointerId:1, isPrimary:true, pressure:0.5 }));
            target.dispatchEvent(new MouseEvent('mousedown',  { ...opts, button:0, buttons:1 }));
            await sleep(rnd(40,120));
            target.dispatchEvent(new PointerEvent('pointerup',    { ...opts, pointerId:1, isPrimary:true, pressure:0 }));
            target.dispatchEvent(new MouseEvent('mouseup',    { ...opts, button:0, buttons:0 }));
            target.dispatchEvent(new MouseEvent('click',      { ...opts, button:0, buttons:0 }));
            await sleep(rnd(120,300));

            if (returnAfter) {
                const rx = realX, ry = realY;
                const backs = [
                    () => moveTo(rx, ry, rnd(500,800),  easings.outExpo,    0.35),
                    () => moveTo(rx, ry, rnd(700,1100), easings.inOutCubic, 0.4),
                    () => moveTo(rx, ry, rnd(600,950),  easings.outCubic,   0.45),
                ];
                await backs[Math.floor(Math.random()*backs.length)]();
            }
        } catch (e) { err('humanClick error:', e.message); }
        finally { if (returnAfter) animating = false; }
    }

    // ── Question handlers ─────────────────────────────────────────────────────

    async function handleMcq(data, safe) {
        if (data.done) return;
        await loadCache();

        let matched = cacheLookupMcq(data.q, data.answers);
        if (matched) { log('Cache hit MCQ'); }
        else {
            for (let i = 0; i < 5 && !matched?.length; i++) {
                try {
                    const raw = await groqMcq(data.q, data.answers, data.multi, data.img);
                    log('Groq MCQ attempt', i+1, raw);
                    matched = parseMcqNums(raw, data.answers);
                } catch (e) { err('Groq MCQ error:', e.message); break; }
            }
        }
        if (!matched?.length) { err('No answer found'); return; }

        if (safe) {
            const sorted = [...matched].sort((a, b) => {
                const ra = a.element.getBoundingClientRect(), rb = b.element.getBoundingClientRect();
                return Math.hypot(ra.left+ra.width/2-fakeX, ra.top+ra.height/2-fakeY)
                     - Math.hypot(rb.left+rb.width/2-fakeX, rb.top+rb.height/2-fakeY);
            });
            animating = true;
            try {
                for (let i = 0; i < sorted.length; i++) {
                    await humanClick(sorted[i].element, i === sorted.length-1);
                    if (i < sorted.length-1) await sleep(rnd(80,180));
                }
            } finally { animating = false; }
        } else {
            matched.forEach(m => m.element.click());
        }
    }

    async function handleMatching(data, safe) {
        if (data.done) return;
        await loadCache();

        let pairs = cacheLookupMatch(data.q, data.cats, data.opts);
        if (pairs) { log('Cache hit Matching'); }
        else {
            for (let i = 0; i < 5 && !pairs?.length; i++) {
                try {
                    const raw = await groqMatch(data.q, data.cats, data.opts);
                    log('Groq Matching attempt', i+1, raw);
                    pairs = parseMatchPairs(raw, data.cats, data.opts);
                } catch (e) { err('Groq Matching error:', e.message); break; }
            }
        }
        if (!pairs?.length) { err('No match found'); return; }

        if (safe) {
            animating = true;
            try {
                for (let i = 0; i < pairs.length; i++) {
                    const last = i === pairs.length-1;
                    await humanClick(pairs[i].category.element, false);
                    await sleep(rnd(80,200));
                    await humanClick(pairs[i].option.element, last);
                    if (!last) await sleep(rnd(80,180));
                }
            } finally { animating = false; }
        } else {
            for (const p of pairs) { p.category.element.click(); await sleep(10); p.option.element.click(); await sleep(10); }
        }
    }

    async function handleQuestion(safe) {
        const active = getActiveView();
        if (!active) { err('No active question found'); return; }
        if (active.type === 'mcq') {
            const d = extractMcq(active.view);
            if (d) await handleMcq(d, safe);
        } else {
            const d = extractMatching(active.view);
            if (d) await handleMatching(d, safe);
        }
    }

    // ── Keyboard ──────────────────────────────────────────────────────────────

    let busy = false;
    document.addEventListener('keydown', async e => {
        if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
        const safe    = e.key === 'n' || e.key === 'N';
        const instant = e.key === 'm' || e.key === 'M';
        if (!safe && !instant) return;
        if (busy) { log('Busy, skipping'); return; }
        busy = true;
        try { await handleQuestion(safe); }
        catch (e) { err('handleQuestion error:', e.message); }
        finally { busy = false; }
    });

    log('Ready. M = instant, N = safe mode.');
})();
