/* Информер погоды — kormuhka.by
   Данные: Open-Meteo.com (CC BY 4.0, ссылка на источник выводится рядом с данными).
   Показывает температуру, «ощущается как», минимум ночью и скорость ветра; вентилятор вращается
   тем быстрее, чем сильнее ветер. Город задаётся атрибутами data-lat / data-lon / data-city у #weather.
   Без сервера и без ключа; кэш в localStorage (15 минут) необязателен — при его отсутствии просто
   делается новый запрос. Если данные не загрузились, блок остаётся аккуратным и пишет об этом. */
(function (global) {
    'use strict';

    var CACHE_MS = 15 * 60 * 1000;
    var REFRESH_MS = 15 * 60 * 1000;
    var TIMEOUT_MS = 10000;

    var WMO = {
        0: 'Ясно', 1: 'Преимущественно ясно', 2: 'Переменная облачность', 3: 'Пасмурно',
        45: 'Туман', 48: 'Изморозь', 51: 'Слабая морось', 53: 'Морось', 55: 'Сильная морось',
        56: 'Ледяная морось', 57: 'Ледяная морось', 61: 'Слабый дождь', 63: 'Дождь', 65: 'Сильный дождь',
        66: 'Ледяной дождь', 67: 'Ледяной дождь', 71: 'Слабый снег', 73: 'Снег', 75: 'Сильный снег',
        77: 'Снежные зёрна', 80: 'Ливень', 81: 'Ливень', 82: 'Сильный ливень', 85: 'Снегопад',
        86: 'Сильный снегопад', 95: 'Гроза', 96: 'Гроза с градом', 99: 'Гроза с градом'
    };

    function describe(code) { return WMO[code] || ''; }

    function isNum(v) { return typeof v === 'number' && isFinite(v); }

    function fmtTemp(v) {
        if (!isNum(v)) { return '—'; }
        var r = Math.round(v);
        if (r === 0) { return '0°'; }
        return (r > 0 ? '+' : '\u2212') + Math.abs(r) + '°';
    }

    function fmtWind(v) {
        if (!isNum(v)) { return '—'; }
        return (Math.round(v * 10) / 10).toString().replace('.', ',') + ' м/с';
    }

    // секунд на один оборот; null — штиль, вентилятор стоит
    function fanDuration(ms) {
        if (!isNum(ms) || ms < 0.3) { return null; }
        var rps = Math.min(2.2, ms * 0.12);       // оборотов в секунду
        return Math.round(Math.min(20, Math.max(0.45, 1 / rps)) * 100) / 100;
    }

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    function nextDay(iso) {
        var p = iso.slice(0, 10).split('-');
        var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + 1));
        return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    }

    // минимальная температура за ближайшую ночь: с 21:00 до 06:00 (если сейчас уже ночь — до утра)
    function nightMin(hourly, nowIso) {
        if (!hourly || !hourly.time || !hourly.temperature_2m || !nowIso) { return null; }
        var today = nowIso.slice(0, 10);
        var hour = parseInt(nowIso.slice(11, 13), 10) || 0;
        var from, to;
        if (hour < 6) {
            from = today + 'T00:00'; to = today + 'T06:00';
        } else {
            from = today + 'T' + pad(Math.max(21, hour)) + ':00'; to = nextDay(today) + 'T06:00';
        }
        var min = null;
        for (var i = 0; i < hourly.time.length; i++) {
            var t = hourly.time[i], v = hourly.temperature_2m[i];
            if (t >= from && t <= to && isNum(v) && (min === null || v < min)) { min = v; }
        }
        return min;
    }

    function buildUrl(lat, lon) {
        return 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
            '&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code' +
            '&hourly=temperature_2m&wind_speed_unit=ms&timezone=auto&forecast_days=2';
    }

    function readCache(key) {
        try {
            var raw = global.localStorage && global.localStorage.getItem(key);
            if (!raw) { return null; }
            var o = JSON.parse(raw);
            return o && Date.now() - o.t < CACHE_MS ? o.d : null;
        } catch (e) { return null; }
    }

    function writeCache(key, data) {
        try { global.localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data })); } catch (e) { /* нет localStorage — не страшно */ }
    }

    function request(url) {
        return new Promise(function (resolve, reject) {
            if (typeof global.fetch !== 'function') { reject(new Error('fetch unavailable')); return; }
            var ctrl = typeof global.AbortController === 'function' ? new global.AbortController() : null;
            var timer = setTimeout(function () { if (ctrl) { ctrl.abort(); } reject(new Error('timeout')); }, TIMEOUT_MS);
            global.fetch(url, ctrl ? { signal: ctrl.signal } : undefined).then(function (r) {
                if (!r.ok) { throw new Error('HTTP ' + r.status); }
                return r.json();
            }).then(function (j) { clearTimeout(timer); resolve(j); },
                function (e) { clearTimeout(timer); reject(e); });
        });
    }

    function summarize(json) {
        var c = json && json.current;
        if (!c || !isNum(c.temperature_2m)) { throw new Error('bad response'); }
        return {
            temp: c.temperature_2m,
            feels: c.apparent_temperature,
            wind: c.wind_speed_10m,
            code: c.weather_code,
            night: nightMin(json.hourly, c.time),
            time: c.time
        };
    }

    function render(root, s, city) {
        function set(name, text) {
            var e = root.querySelector('[data-wx="' + name + '"]');
            if (e) { e.textContent = text; }
        }
        set('temp', fmtTemp(s.temp));
        set('feels', fmtTemp(s.feels));
        set('night', fmtTemp(s.night));
        set('wind', fmtWind(s.wind));
        set('cond', describe(s.code) || 'Погода в ' + city);
        set('updated', s.time ? 'Обновлено в ' + s.time.slice(11, 16) + '. ' : '');
        var dur = fanDuration(s.wind);
        if (dur === null) {
            root.classList.add('is-calm');
        } else {
            root.classList.remove('is-calm');
            root.style.setProperty('--wx-dur', dur + 's');
        }
        root.classList.remove('is-loading');
        root.classList.remove('is-error');
    }

    function fail(root) {
        var e = root.querySelector('[data-wx="cond"]');
        if (e) { e.textContent = 'Данные о погоде временно недоступны'; }
        root.classList.remove('is-loading');
        root.classList.add('is-error');
    }

    function init() {
        var root = document.getElementById('weather');
        if (!root) { return; }
        var lat = parseFloat(root.getAttribute('data-lat')), lon = parseFloat(root.getAttribute('data-lon'));
        var city = root.getAttribute('data-city') || '';
        if (!isFinite(lat) || !isFinite(lon)) { return; }
        var key = 'kormuhka_wx_' + lat + '_' + lon;

        function load() {
            var cached = readCache(key);
            if (cached) { try { render(root, summarize(cached), city); return; } catch (e) { /* кэш испорчен — грузим заново */ } }
            request(buildUrl(lat, lon)).then(function (json) {
                var s = summarize(json);
                writeCache(key, json);
                render(root, s, city);
            }).catch(function () { fail(root); });
        }
        load();
        setInterval(load, REFRESH_MS);
    }

    global.KormuhkaWeather = {
        describe: describe, fmtTemp: fmtTemp, fmtWind: fmtWind, fanDuration: fanDuration,
        nightMin: nightMin, summarize: summarize, render: render, buildUrl: buildUrl
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.KormuhkaWeather;
    } else if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
    }
})(typeof window !== 'undefined' ? window : globalThis);
