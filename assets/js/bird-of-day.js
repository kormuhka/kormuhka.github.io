/* Информер «Птица дня» — kormuhka.by
   Птица определяется только по локальной дате посетителя: без случайного выбора при открытии,
   без хранилища браузера и без сервера. В течение суток птица не меняется, а за один цикл
   (по числу видов в каталоге) каждая птица встречается ровно один раз, и одна и та же птица
   не выпадает два дня подряд, в том числе на стыке циклов.
   Вид карточки подстраивается под фото: вертикальный снимок показывается в боковой рамке,
   горизонтальный — на всю карточку, а подробности открываются кнопкой «Подробнее».
   Для проверки: ?date=2026-11-12 — показать птицу на эту дату, ?bird=parus-major — конкретный вид. */
(function (global) {
    'use strict';

    var MS_DAY = 86400000;
    var LANDSCAPE_FROM = 0.95;     // отношение ширины фото к высоте, с которого фото считается горизонтальным
    var MODE_TIMEOUT = 3000;       // если фото не загрузилось за это время — показываем боковой вариант

    function dayNumber(d) {
        // номер суток по ЛОКАЛЬНОЙ дате (не зависит от времени суток и часового пояса браузера)
        return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_DAY);
    }

    function rng(seed) {
        var a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            var t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function cycleOrder(n, cycle) {
        var a = [], i, j, t, r = rng(cycle * 2654435761 + 12345);
        for (i = 0; i < n; i++) { a.push(i); }
        for (i = n - 1; i > 0; i--) {
            j = Math.floor(r() * (i + 1));
            t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    function pickIndex(day, n) {
        if (n <= 1) { return 0; }
        var cycle = Math.floor(day / n);
        var pos = day - cycle * n;
        var order = cycleOrder(n, cycle);
        if (n > 2) {
            // первая птица цикла не должна совпасть с последней птицей предыдущего цикла
            var prevLast = cycleOrder(n, cycle - 1)[n - 1];
            if (order[0] === prevLast) {
                var t = order[0]; order[0] = order[1]; order[1] = t;
            }
        }
        return order[pos];
    }

    function pickBird(date, birds) {
        return birds[pickIndex(dayNumber(date), birds.length)];
    }

    // 'landscape' — фото на всю карточку, 'portrait' — боковая рамка
    function modeFor(width, height) {
        if (!width || !height) { return 'portrait'; }
        return width / height >= LANDSCAPE_FROM ? 'landscape' : 'portrait';
    }

    var SVG = '<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true" focusable="false">' +
        '<g fill="currentColor"><ellipse cx="30" cy="38" rx="18" ry="12"/><circle cx="46" cy="27" r="9"/>' +
        '<path d="M54 26l9 3-9 3z"/><path d="M14 36L2 29l3 13z"/>' +
        '<path d="M26 48l-3 10h3l3-10zM35 48l-3 10h3l3-10z"/></g></svg>';

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) { e.className = cls; }
        if (text !== undefined && text !== null) { e.textContent = text; }
        return e;
    }

    // ссылка на статью в русской Википедии; если у птицы есть точное поле wiki, берём его,
    // иначе — переход по латинскому названию (Википедия сама ведёт на нужную статью)
    function wikiUrl(bird) {
        return bird.wiki || ('https://ru.wikipedia.org/wiki/Special:Search?search=' + encodeURIComponent(bird.lat) + '&go=Go');
    }

    function row(label, text) {
        var p = el('p', 'bird_day__row');
        p.appendChild(el('b', null, label + ': '));
        p.appendChild(document.createTextNode(text));
        return p;
    }

    function placeholder() {
        var w = el('div', 'bird_day__ph');
        w.innerHTML = SVG + '<span>Фото появится позже</span>';
        return w;
    }

    function render(root, bird) {
        while (root.firstChild) { root.removeChild(root.firstChild); }
        root.classList.remove('is-portrait');
        root.classList.remove('is-landscape');
        root.classList.remove('is-open');
        root.classList.add('is-pending');

        var photo = el('div', 'bird_day__photo');
        var img = document.createElement('img');
        img.alt = bird.ru + ' (' + bird.lat + ')';
        img.width = 800;
        img.height = 600;
        img.decoding = 'async';

        function setMode(mode) {
            if (!root.classList.contains('is-pending')) { return; }
            root.classList.remove('is-pending');
            root.classList.add('is-' + mode);
        }
        img.addEventListener('load', function () { setMode(modeFor(img.naturalWidth, img.naturalHeight)); });
        img.addEventListener('error', function () {
            if (img.parentNode === photo) {
                photo.removeChild(img);
                photo.appendChild(placeholder());
            }
            setMode('portrait');
        });
        setTimeout(function () { setMode('portrait'); }, MODE_TIMEOUT);
        img.src = bird.img;
        photo.appendChild(img);

        var credit = (global.BIRD_CREDITS || {})[bird.id];
        if (credit && credit.author) {
            var cr = el(credit.url ? 'a' : 'span', 'bird_day__credit',
                'Фото: ' + credit.author + (credit.license ? ', ' + credit.license : ''));
            if (credit.url) {
                cr.href = credit.url;
                cr.target = '_blank';
                cr.rel = 'noopener nofollow';
            }
            photo.appendChild(cr);
        }

        // подпись поверх фото (видна только в горизонтальном варианте)
        var cap = el('div', 'bird_day__cap');
        cap.appendChild(el('span', 'bird_day__label', 'Птица дня'));
        cap.appendChild(el('p', 'bird_day__cap-name', bird.ru));
        cap.appendChild(el('p', 'bird_day__lat', bird.lat));
        var toggle = el('button', 'bird_day__toggle', 'Подробнее');
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', 'birdDayBody');
        cap.appendChild(toggle);

        var body = el('div', 'bird_day__body');
        body.id = 'birdDayBody';
        body.appendChild(el('span', 'bird_day__label', 'Птица дня'));
        body.appendChild(el('h3', 'bird_day__name', bird.ru));
        body.appendChild(el('p', 'bird_day__lat', bird.lat));
        body.appendChild(el('p', 'bird_day__desc', bird.desc));
        body.appendChild(row('Питание', bird.diet));
        body.appendChild(row('Среда обитания', bird.habitat));
        var fact = el('p', 'bird_day__fact');
        fact.appendChild(el('b', null, 'Интересный факт: '));
        fact.appendChild(document.createTextNode(bird.fact));
        body.appendChild(fact);

        var more = el('a', 'bird_day__more', 'Читать в Википедии \u2192');
        more.href = wikiUrl(bird);
        more.target = '_blank';
        more.rel = 'noopener';
        body.appendChild(more);

        var close = el('button', 'bird_day__close', 'Закрыть');
        close.type = 'button';
        body.appendChild(close);

        function open(v) {
            if (v) { root.classList.add('is-open'); } else { root.classList.remove('is-open'); }
            toggle.setAttribute('aria-expanded', v ? 'true' : 'false');
            if (v && close.focus) { close.focus(); } else if (!v && toggle.focus) { toggle.focus(); }
        }
        toggle.addEventListener('click', function () { open(true); });
        close.addEventListener('click', function () { open(false); });

        root.appendChild(photo);
        root.appendChild(cap);
        root.appendChild(body);
        root.hidden = false;
    }

    function parseDateParam(s) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
        return m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0) : null;
    }

    function init() {
        var root = document.getElementById('birdDay');
        var birds = global.BIRDS;
        if (!root || !birds || !birds.length) { return; }

        var params = {};
        try {
            (global.location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
                var p = kv.split('=');
                if (p[0]) { params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); }
            });
        } catch (e) { params = {}; }

        var forced = null;
        if (params.bird) {
            birds.forEach(function (b) { if (b.id === params.bird) { forced = b; } });
        }
        var fixedDate = parseDateParam(params.date);

        function show() {
            render(root, forced || pickBird(fixedDate || new Date(), birds));
        }
        show();

        // Esc закрывает панель подробностей
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && root.classList.contains('is-open')) {
                var btn = root.querySelector('.bird_day__close');
                if (btn && btn.click) { btn.click(); }
            }
        });

        // если страница открыта в полночь — обновляем птицу на новую дату
        if (!forced && !fixedDate) {
            (function schedule() {
                var now = new Date();
                var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
                setTimeout(function () { show(); schedule(); }, Math.max(1000, next - now));
            })();
        }
    }

    global.BirdOfDay = { dayNumber: dayNumber, pickIndex: pickIndex, pickBird: pickBird, render: render, wikiUrl: wikiUrl, modeFor: modeFor };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.BirdOfDay;
    } else if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
