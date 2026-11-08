(function ($) {
    $(document).ready(function () {
        var $main = $('#xzoom-fancy');
        if (!$main.length) { return; }

        var $links = $('.single-zoom-thumb a');
        var current = 0;
        var ZOOM = 2.2;
        var fancyOpts = {padding: 0, helpers: {overlay: {locked: false}}};
        var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

        // Рамка вокруг главного фото и слой увеличения
        $main.wrap('<div class="zoom-frame"></div>');
        var $frame = $main.parent();
        var $lens = $('<div class="zoom-lens"></div>').appendTo($frame);

        function previewOf($a) { return $a.find('img').attr('xpreview') || $a.attr('href'); }

        function select(i) {
            current = i;
            var $a = $links.eq(i);
            $main.attr('src', previewOf($a));
            $links.removeClass('active');
            $a.addClass('active');
            $lens.hide();
        }

        function galleryItems() {
            var list = [];
            $links.each(function () {
                list.push({href: $(this).attr('href'), title: $(this).find('img').attr('alt') || ''});
            });
            return list;
        }

        function openGallery() {
            var list = galleryItems();
            if (!list.length) { return; }
            if ($.fancybox && $.fancybox.open) {
                $.fancybox.open(list, $.extend({index: current}, fancyOpts));
            } else {
                window.location.href = list[current].href;
            }
        }

        $links.eq(0).addClass('active');

        // Миниатюры: меняют главное фото (мышью и касанием)
        $links.on('click', function (e) {
            e.preventDefault();
            select($links.index(this));
        });

        // Клик по главному фото: галерея на весь экран
        $frame.on('click', function (e) {
            e.preventDefault();
            openGallery();
        });

        // Увеличение при наведении (только мышь): пропорции сохраняются всегда
        if (canHover && $links.length) {
            $frame.on('mouseenter', function () {
                var w = $main.width();
                $lens.css({
                    backgroundImage: 'url("' + $links.eq(current).attr('href') + '")',
                    backgroundSize: (w * ZOOM) + 'px auto'
                }).show();
            }).on('mousemove', function (e) {
                var off = $frame.offset();
                var w = $main.width(), h = $main.height();
                var x = Math.min(Math.max((e.pageX - off.left) / w, 0), 1);
                var y = Math.min(Math.max((e.pageY - off.top) / h, 0), 1);
                $lens.css('backgroundPosition', (-x * w * (ZOOM - 1)) + 'px ' + (-y * h * (ZOOM - 1)) + 'px');
            }).on('mouseleave', function () {
                $lens.hide();
            });
        }
    });
})(jQuery);
