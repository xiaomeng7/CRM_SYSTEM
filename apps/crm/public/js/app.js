/**
 * Shared CRM admin UI — nav active state, placeholders for future API wiring
 */
(function () {
  var path = window.location.pathname.replace(/\/$/, '') || '/';
  var navLinks = document.querySelectorAll('.sidebar a[href]');
  navLinks.forEach(function (a) {
    var href = a.getAttribute('href').replace(/\/$/, '') || '/';
    if (path === href || (href !== '/' && path.indexOf(href) === 0)) {
      a.classList.add('active');
    } else {
      a.classList.remove('active');
    }
  });
})();
