/**
 * Unified CRM sidebar navigation (PR10A.1).
 * Renders into #app-sidebar from a single NAV_ITEMS source of truth.
 */
(function () {
  var NAV_ITEMS = [
    { href: '/ceo-daily.html', label: 'CEO Daily' },
    { href: '/', label: 'Dashboard', activePaths: ['/', '/index.html'] },
    { href: '/builder-intelligence.html', label: 'Builder Intelligence' },
    { href: '/bank-import.html', label: 'Bank Import' },
    { href: '/bank-review.html', label: 'Bank Review' },
    { href: '/leads.html', label: 'Leads', activePaths: ['/leads.html', '/lead-detail.html', '/dashboard/new-lead', '/dashboard/new-lead.html'] },
    { href: '/opportunities.html', label: 'Opportunities' },
    { href: '/contacts.html', label: 'Contacts', activePaths: ['/contacts.html', '/contact-detail.html', '/account-detail.html'] },
    { href: '/tasks.html', label: 'Tasks' },
    { href: '/b2b-prospects.html', label: 'B2B Prospects' },
    {
      href: '/dashboard/inspectors',
      label: 'Inspections',
      activePaths: [
        '/dashboard/inspectors',
        '/dashboard/inspectors.html',
        '/dashboard/inspector-detail',
        '/dashboard/inspector-detail.html',
      ],
    },
    { href: '/inspection-review.html', label: 'Inspection Review' },
    { href: '/dashboard/growth', label: 'Growth', activePaths: ['/dashboard/growth', '/dashboard/growth.html'] },
    {
      href: '/admin/seo/tasks',
      label: 'SEO',
      activePaths: [
        '/admin/seo/tasks',
        '/admin/seo/opportunities',
        '/seo-tasks.html',
        '/seo-opportunities.html',
      ],
    },
    { href: '/admin-console.html', label: 'Admin Console' },
  ];

  function normalizePath(pathname) {
    var p = String(pathname || '/').split('?')[0].split('#')[0];
    if (p.length > 1 && p.charAt(p.length - 1) === '/') {
      p = p.slice(0, -1);
    }
    return p || '/';
  }

  function isActive(item, path) {
    if (normalizePath(item.href) === path) return true;
    if (!item.activePaths) return false;
    for (var i = 0; i < item.activePaths.length; i++) {
      if (normalizePath(item.activePaths[i]) === path) return true;
    }
    return false;
  }

  function resolveActiveHref(pathname) {
    var path = normalizePath(pathname);
    for (var i = 0; i < NAV_ITEMS.length; i++) {
      if (isActive(NAV_ITEMS[i], path)) return NAV_ITEMS[i].href;
    }
    return null;
  }

  function escHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escAttr(value) {
    return escHtml(value);
  }

  function renderSidebar() {
    if (typeof document === 'undefined') return;
    var el = document.getElementById('app-sidebar');
    if (!el) return;

    var path = normalizePath(window.location.pathname);
    var parts = ['<div class="logo">BHT Revenue OS</div>', '<nav>'];

    for (var i = 0; i < NAV_ITEMS.length; i++) {
      var item = NAV_ITEMS[i];
      var active = isActive(item, path);
      parts.push(
        '<a href="' +
          escAttr(item.href) +
          '"' +
          (active ? ' class="active"' : '') +
          '>' +
          escHtml(item.label) +
          '</a>'
      );
    }

    parts.push('</nav>');
    el.innerHTML = parts.join('');
  }

  function boot() {
    renderSidebar();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

  var api = {
    NAV_ITEMS: NAV_ITEMS,
    normalizePath: normalizePath,
    isActive: isActive,
    resolveActiveHref: resolveActiveHref,
    renderSidebar: renderSidebar,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (typeof window !== 'undefined') {
    window.CrmSidebar = api;
  }
})();
