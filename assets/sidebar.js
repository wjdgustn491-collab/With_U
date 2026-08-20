/* ============================================================
   WITH_U 공용 사이드바 — 마크업 주입 + 현재 페이지 표시
   메뉴를 한 곳에서만 관리하기 위해 각 페이지에 복사하지 않고
   이 파일이 body 최상단에 사이드바를 삽입한다.
   <script src="assets/sidebar.js" defer></script>
   ============================================================ */
(function () {
  'use strict';

  var ICON = {
    scale:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M7 7l-4 8a4 4 0 0 0 8 0L7 7Zm10 0-4 8a4 4 0 0 0 8 0l-4-8Z"/><path d="M6 4h12"/></svg>',
    leaf:   '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20c0-8 5-13 16-14 0 11-5 15-11 15-2 0-5-.4-5-1Z"/><path d="M9 15c2-3 5-5 9-6"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5.5c0 4.6-3 7.9-7 9.5-4-1.6-7-4.9-7-9.5V6l7-3Z"/><path d="M9 12l2.2 2.2L15.5 10"/></svg>'
  };

  /* 세 개의 서비스. 메뉴 추가는 이 배열만 고치면 된다. */
  var ITEMS = [
    {
      href: 'carbon-dashboard.html',
      icon: 'scale',
      title: '통합 탄소 대시보드',
      desc: '배출(Input) 대 상쇄(Output) 실시간 대조'
    },
    {
      href: 'impact-dashboard.html',
      icon: 'leaf',
      title: 'ESG 공공 성과 지표',
      desc: '감축량을 일상 속 체감 지표로 환산'
    },
    {
      href: 'certificate-verify.html',
      icon: 'shield',
      title: '공식 인증서 검증',
      desc: 'KEITI · KCCI 공식 오픈API 조회'
    }
  ];

  /* 현재 파일명. 디렉터리 루트로 접근하면 index.html 로 본다. */
  var here = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

  function link(item) {
    var active = here === item.href.toLowerCase();
    return '<a class="wu-item' + (active ? ' is-active' : '') + '" href="' + item.href + '"' +
           (active ? ' aria-current="page"' : '') + '>' +
             ICON[item.icon] +
             '<span><b>' + item.title + '</b><small>' + item.desc + '</small></span>' +
           '</a>';
  }

  var homeActive = (here === 'index.html');

  var html =
    '<button class="wu-nav-toggle" type="button" aria-label="메뉴 열기" aria-expanded="false" aria-controls="wuSidebar">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>' +
    '</button>' +
    '<div class="wu-backdrop" hidden></div>' +
    '<aside class="wu-sidebar" id="wuSidebar" aria-label="서비스 내비게이션">' +
      '<a class="wu-brand" href="index.html"' + (homeActive ? ' aria-current="page"' : '') + '>' +
        '<span class="wu-brand-mark">WU</span>' +
        '<span class="wu-brand-text"><strong>WITH_U</strong><span>Carbon Platform</span></span>' +
      '</a>' +
      '<nav class="wu-nav">' +
        '<p class="wu-nav-label">서비스</p>' +
        ITEMS.map(link).join('') +
      '</nav>' +
      '<div class="wu-foot">' +
        '<strong>2026 ESG 프로젝트</strong>' +
        '데이터 출처: KEITI · KCCI 공식 오픈API' +
      '</div>' +
    '</aside>';

  function mount() {
    if (document.getElementById('wuSidebar')) return;

    var holder = document.createElement('div');
    holder.className = 'wu-nav-root';
    holder.innerHTML = html;
    document.body.insertBefore(holder, document.body.firstChild);
    document.body.classList.add('wu-has-sidebar');

    var sidebar  = holder.querySelector('.wu-sidebar');
    var toggle   = holder.querySelector('.wu-nav-toggle');
    var backdrop = holder.querySelector('.wu-backdrop');

    function setOpen(open) {
      sidebar.classList.toggle('is-open', open);
      backdrop.classList.toggle('is-open', open);
      backdrop.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    }

    toggle.addEventListener('click', function () {
      setOpen(!sidebar.classList.contains('is-open'));
    });
    backdrop.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
