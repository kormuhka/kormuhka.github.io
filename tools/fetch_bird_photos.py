#!/usr/bin/env python3
"""Скачивает фотографии птиц для информера «Птица дня» с Wikimedia Commons.

Запускать на своём компьютере (нужен интернет):
    python3 tools/fetch_bird_photos.py              # скачать все недостающие фото
    python3 tools/fetch_bird_photos.py --only parus-major,pica-pica
    python3 tools/fetch_bird_photos.py --force      # перекачать даже имеющиеся

Как работает: для каждого вида из assets/js/birds-data.js берётся главное фото статьи о виде
в английской Википедии (по латинскому названию), затем с Commons запрашиваются версия 900 px и
сведения о лицензии. Подходят только свободные лицензии (CC BY, CC BY-SA, CC0, общественное достояние).
Файл сохраняется как assets/img/birds/<id>.jpg, а автор и лицензия — в assets/js/birds-credits.js
(они показываются подписью на фото, как требуют лицензии CC BY / CC BY-SA).

Обязательно просмотрите результат глазами: главное фото статьи почти всегда соответствует виду,
но может быть неудачным по кадру. Любой файл можно заменить своим снимком, не меняя имя.
Нужны только стандартная библиотека Python; Pillow (pip install pillow) — по желанию, для сжатия.
"""
import argparse, html, io, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'assets', 'js', 'birds-data.js')
CREDITS = os.path.join(ROOT, 'assets', 'js', 'birds-credits.js')
IMG_DIR = os.path.join(ROOT, 'assets', 'img', 'birds')
UA = 'kormuhka-bird-of-day/1.0 (https://kormuhka.github.io/; kormuhka.by@gmail.com)'
WIKI = 'https://en.wikipedia.org/api/rest_v1/page/summary/'
COMMONS = 'https://commons.wikimedia.org/w/api.php'
OK_LICENSE = re.compile(r'^(CC[ -]BY|CC0|CC[ -]BY[ -]SA|Public domain|PD)', re.I)


def http_get(url, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read()
        except Exception as e:  # noqa
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError('не удалось получить %s: %s' % (url, last))


def get_json(url):
    return json.loads(http_get(url).decode('utf-8'))


def load_js_json(path, var):
    text = open(path, encoding='utf-8').read()
    m = re.search(r'window\.%s\s*=\s*(.*?);\s*$' % var, text, re.S)
    return json.loads(m.group(1)) if m else None


def strip_tags(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip()


def file_name_from_url(src):
    parts = urllib.parse.urlparse(src).path.split('/')
    if '/thumb/' in src:            # .../thumb/a/ab/File.jpg/320px-File.jpg
        return urllib.parse.unquote(parts[-2])
    return urllib.parse.unquote(parts[-1])


def find_photo(latin):
    s = get_json(WIKI + urllib.parse.quote(latin.replace(' ', '_')))
    src = (s.get('originalimage') or s.get('thumbnail') or {}).get('source')
    if not src:
        raise RuntimeError('у статьи нет главного фото')
    name = file_name_from_url(src)
    q = urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'prop': 'imageinfo', 'iiprop': 'url|extmetadata',
        'iiurlwidth': 900, 'titles': 'File:' + name})
    pages = get_json(COMMONS + '?' + q)['query']['pages']
    info = next(iter(pages.values())).get('imageinfo', [{}])[0]
    meta = info.get('extmetadata', {})
    lic = strip_tags(meta.get('LicenseShortName', {}).get('value'))
    if not OK_LICENSE.match(lic):
        raise RuntimeError('лицензия «%s» не подходит' % (lic or 'не указана'))
    return {
        'url': info.get('thumburl') or info.get('url'),
        'author': strip_tags(meta.get('Artist', {}).get('value')) or 'Wikimedia Commons',
        'license': lic,
        'page': info.get('descriptionurl') or ('https://commons.wikimedia.org/wiki/File:' + urllib.parse.quote(name)),
    }


def save_jpeg(data, path):
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(data)).convert('RGB')
        im.thumbnail((900, 900))
        im.save(path, 'JPEG', quality=84, optimize=True, progressive=True)
    except ImportError:
        with open(path, 'wb') as f:
            f.write(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', help='id видов через запятую')
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    birds = load_js_json(DATA, 'BIRDS')
    credits = load_js_json(CREDITS, 'BIRD_CREDITS') or {}
    only = set(a.only.split(',')) if a.only else None
    os.makedirs(IMG_DIR, exist_ok=True)
    done, failed = 0, []
    for b in birds:
        if only and b['id'] not in only:
            continue
        path = os.path.join(ROOT, b['img'])
        if os.path.exists(path) and not a.force:
            continue
        try:
            p = find_photo(b['lat'])
            save_jpeg(http_get(p['url']), path)
            credits[b['id']] = {'author': p['author'][:80], 'license': p['license'], 'url': p['page']}
            done += 1
            print('OK  %-34s %s, %s' % (b['id'], p['author'][:40], p['license']))
        except Exception as e:  # noqa
            failed.append(b['id'])
            print('--  %-34s %s' % (b['id'], e))
        time.sleep(0.6)
    with open(CREDITS, 'w', encoding='utf-8') as f:
        f.write('/* Авторы фотографий (заполняется tools/fetch_bird_photos.py) */\nwindow.BIRD_CREDITS = %s;\n'
                % json.dumps(credits, ensure_ascii=False, indent=2))
    print('\nСкачано: %d, не удалось: %d %s' % (done, len(failed), failed or ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
