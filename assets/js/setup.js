(function ($) {
    $(document).ready(function () {
        var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
        var $main = $('#xzoom-fancy');
        var $links = $('.single-zoom-thumb a');
        var current = 0;
        var fancyOpts = {padding: 0, helpers: {overlay: {locked: false}}};

        function galleryItems() {
            var list = [];
            $links.each(function () {
                list.push({href: $(this).attr('href'), title: $(this).find('img').attr('alt') || ''});
            });
            return list;
        }

        function openGallery(index) {
            var list = galleryItems();
            if (!list.length) { return; }
            if ($.fancybox && $.fancybox.open) {
                $.fancybox.open(list, $.extend({index: index || 0}, fancyOpts));
            } else {
                window.location.href = list[index || 0].href;
            }
        }

        if (isTouch) {
            // Телефоны и планшеты: без hover-зума. Тап по миниатюре меняет фото,
            // тап по большому фото открывает галерею на весь экран.
            $links.eq(0).addClass('active');

            $links.on('click', function (e) {
                e.preventDefault();
                current = $links.index(this);
                $main.attr('src', $(this).attr('href'));
                $links.removeClass('active');
                $(this).addClass('active');
            });

            $main.on('click', function (e) {
                e.preventDefault();
                openGallery(current);
            });
        } else {
            // Компьютеры: зум при наведении и галерея по клику
            $('.xzoom4, .xzoom-gallery4').xzoom({tint: '#006699', Xoffset: 15});

            $('#xzoom-fancy').bind('click', function (event) {
                var xzoom = $(this).data('xzoom');
                xzoom.closezoom();
                $.fancybox.open(xzoom.gallery().cgallery, fancyOpts);
                event.preventDefault();
            });
        }
    });
})(jQuery);
