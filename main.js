// ── Configuration ─────────────────────────────────────────────────────────────
const API_KEY = 'YOUR_API_KEY';
const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL   = 'qwen/qwen3-32b';
const DEBUG   = false;

(function () {
    const log = DEBUG ? (...a) => console.log('[NC]', ...a) : () => {};
    const err = (...a) => console.error('[NC]', ...a);

    if (!API_KEY || API_KEY === 'YOUR_API_KEY') { err('Set your API_KEY in the configuration block'); return; }

    const GITHUB_OWNER  = 'Hajdenko';
    const GITHUB_REPO   = 'netacad-solver';
    const GITHUB_BRANCH = 'main';
    const TREE_URL      = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/${GITHUB_BRANCH}?recursive=1`;
    const RAW_BASE      = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/refs/heads/${GITHUB_BRANCH}/`;

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
        let q = '', answers = [], multi = false, img = null;
        const seen = new Set();
        const items = view.shadowRoot.querySelectorAll('.mcq__item');
        if (items[0]?.querySelector('input')?.type === 'checkbox') multi = true;
        items.forEach(item => {
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
        return answers.length ? { q, answers, multi, img } : null;
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
        return { q, cats, opts };
    }

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

    function buildCacheContext(currentQ, topN = 30) {
        if (!cache?.length) return '';
        const currentWords = new Set(norm(currentQ).split(/\s+/).filter(w => w.length > 3));
        const scored = cache.map(e => {
            const entryWords = norm(e.q).split(/\s+/);
            const matches = entryWords.filter(w => currentWords.has(w)).length;
            const score = matches / Math.max(currentWords.size, 1);
            return { e, score };
        });
        const top = scored
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, topN)
            .map(x => `Q: ${x.e.q}\nA: ${x.e.a}`)
            .join('\n---\n');
        if (!top) return '';
        return `\n\nRelated questions from official Cisco NetAcad curriculum:\n${top}`;
    }

    async function groqMcq(q, answers, multi, img) {
        const cacheCtx = buildCacheContext(q);
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
            body: JSON.stringify({ model: img ? 'meta-llama/llama-4-scout-17b-16e-instruct' : MODEL, messages: [{ role: 'system', content: SYS_MCQ + cacheCtx }, { role: 'user', content }], temperature: 0 })
        });
        if (!res.ok) throw new Error(`Groq ${res.status}`);
        return (await res.json()).choices[0].message.content.trim();
    }

    async function groqMatch(q, cats, opts) {
        const cacheCtx = buildCacheContext(q);
        const catList = cats.map(c => `${c.letter}. ${c.text}`).join('\n');
        const optList = opts.map((o, i) => `${i + 1}. ${o.text}`).join('\n');
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
            body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: SYS_MATCH + cacheCtx }, { role: 'user', content: `${q ? 'Question: ' + q + '\n\n' : ''}Categories:\n${catList}\n\nOptions:\n${optList}` }], temperature: 0 })
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

    let ctrlHeld        = false;
    let correctAnswers  = null;
    let fetchPromise    = null;
    let lastQuestionQ   = null;
    let clickedSet      = new Set();
    let pendingCategory = null;
    let mouseX          = 0;
    let mouseY          = 0;
    let hoverTimer      = null;
    let hoverTarget     = null;

    function isHovering(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return mouseX >= r.left && mouseX <= r.right && mouseY >= r.top && mouseY <= r.bottom;
    }

    function isChecked(el) {
        const input = el.querySelector('input') ?? el.closest('.mcq__item')?.querySelector('input');
        return input?.checked ?? false;
    }

    function scheduleClick(el, onConfirm) {
        if (hoverTarget === el) return;
        clearTimeout(hoverTimer);
        hoverTarget = el;
        const delay = 80 + Math.random() * 120;
        hoverTimer = setTimeout(() => {
            if (ctrlHeld && isHovering(el)) {
                onConfirm();
            }
            hoverTarget = null;
            hoverTimer  = null;
        }, delay);
    }

    function cancelHoverTimer() {
        clearTimeout(hoverTimer);
        hoverTimer  = null;
        hoverTarget = null;
    }

    function handleHover() {
        if (!ctrlHeld || !correctAnswers) return;

        if (correctAnswers.type === 'mcq') {
            let foundTarget = null;
            for (const ans of correctAnswers.answers) {
                if (isHovering(ans.element)) {
                    if (!isChecked(ans.element)) {
                        foundTarget = ans;
                    }
                    break;
                }
            }
            if (!foundTarget) {
                cancelHoverTimer();
                return;
            }
            scheduleClick(foundTarget.element, () => {
                if (!isChecked(foundTarget.element)) {
                    log('Clicking correct answer:', foundTarget.text);
                    foundTarget.element.click();
                }
            });

        } else if (correctAnswers.type === 'matching') {
            if (!pendingCategory) {
                let foundCat = null;
                for (const pair of correctAnswers.pairs) {
                    if (isHovering(pair.category.element) && !clickedSet.has(pair.category.element)) {
                        foundCat = pair;
                        break;
                    }
                }
                if (!foundCat) { cancelHoverTimer(); return; }
                scheduleClick(foundCat.category.element, () => {
                    log('Clicking category:', foundCat.category.text);
                    pendingCategory = foundCat;
                    foundCat.category.element.click();
                });
            } else {
                if (isHovering(pendingCategory.option.element)) {
                    scheduleClick(pendingCategory.option.element, () => {
                        log('Clicking option:', pendingCategory.option.text);
                        clickedSet.add(pendingCategory.category.element);
                        pendingCategory.option.element.click();
                        pendingCategory = null;
                    });
                } else {
                    cancelHoverTimer();
                }
            }
        }
    }

    async function fetchAnswers() {
        const active = getActiveView();
        if (!active) return;

        if (active.type === 'mcq') {
            const d = extractMcq(active.view);
            if (!d) return;
            if (d.q === lastQuestionQ && correctAnswers) return;

            lastQuestionQ   = d.q;
            correctAnswers  = null;
            clickedSet      = new Set();
            pendingCategory = null;
            cancelHoverTimer();

            await loadCache();
            let matched = cacheLookupMcq(d.q, d.answers);
            if (matched) { log('Cache hit MCQ'); }
            else {
                for (let i = 0; i < 5 && !matched?.length; i++) {
                    try {
                        const raw = await groqMcq(d.q, d.answers, d.multi, d.img);
                        log('Groq MCQ attempt', i + 1, raw);
                        matched = parseMcqNums(raw, d.answers);
                    } catch (e) { err('Groq MCQ error:', e.message); break; }
                }
            }
            if (!matched?.length) { err('No answer found'); return; }
            correctAnswers = { type: 'mcq', answers: matched };
            log('Answers ready:', matched.map(m => m.text));
            handleHover();

        } else {
            const d = extractMatching(active.view);
            if (!d) return;
            if (d.q === lastQuestionQ && correctAnswers) return;

            lastQuestionQ   = d.q;
            correctAnswers  = null;
            clickedSet      = new Set();
            pendingCategory = null;
            cancelHoverTimer();

            await loadCache();
            let pairs = cacheLookupMatch(d.q, d.cats, d.opts);
            if (pairs) { log('Cache hit Matching'); }
            else {
                for (let i = 0; i < 5 && !pairs?.length; i++) {
                    try {
                        const raw = await groqMatch(d.q, d.cats, d.opts);
                        log('Groq Matching attempt', i + 1, raw);
                        pairs = parseMatchPairs(raw, d.cats, d.opts);
                    } catch (e) { err('Groq Matching error:', e.message); break; }
                }
            }
            if (!pairs?.length) { err('No match found'); return; }
            correctAnswers = { type: 'matching', pairs };
            log('Pairs ready:', pairs.map(p => `${p.category.text} → ${p.option.text}`));
            handleHover();
        }
    }

    document.addEventListener('keydown', e => {
        if (e.key !== 'Control' || ctrlHeld) return;
        ctrlHeld = true;
        if (!fetchPromise) {
            fetchPromise = fetchAnswers().finally(() => { fetchPromise = null; });
        } else {
            handleHover();
        }
    });

    document.addEventListener('keyup', e => {
        if (e.key === 'Control') {
            ctrlHeld = false;
            cancelHoverTimer();
        }
    });

    document.addEventListener('mousemove', e => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        if (ctrlHeld) handleHover();
    }, { passive: true, capture: true });

    let lastHref = location.href;
    setInterval(() => {
        if (location.href !== lastHref) {
            lastHref        = location.href;
            correctAnswers  = null;
            lastQuestionQ   = null;
            clickedSet      = new Set();
            pendingCategory = null;
            fetchPromise    = null;
            cancelHoverTimer();
            log('Navigation detected, state cleared');
        }
    }, 500);

    log('Ready. Hold CTRL and hover over answers to select them.');
})();
