// ==UserScript==
// @name         Dogdrip 사용자 차단
// @namespace    https://dogdrip.net/
// @version      4.0
// @description  dogdrip.net에서 차단한 사용자의 댓글은 블러 처리, 게시물은 블라인드 처리합니다.
// @author       Custom
// @match        https://www.dogdrip.net/*
// @match        https://dogdrip.net/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/[CpGiuccoPiano]/[dogdrip-filter]/main/dogdrip_user_blocker.user.js
// @downloadURL  https://raw.githubusercontent.com/[[CpGiuccoPiano]/[[dogdrip-filter]/main/dogdrip_user_blocker.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════
  // 스토리지  { srl: string, nick: string }[]
  // ═══════════════════════════════════════════════════════
  const KEY = 'dogdrip_blocked_v3';
  const DB = {
    load()         { try { return JSON.parse(GM_getValue(KEY, '[]')); } catch { return []; } },
    save(list)     { GM_setValue(KEY, JSON.stringify(list)); },
    has(srl)       { return DB.load().some(u => u.srl === String(srl)); },
    add(srl, nick) {
      const l = DB.load();
      if (!l.some(u => u.srl === String(srl))) { l.push({ srl: String(srl), nick: nick || srl }); DB.save(l); }
    },
    remove(srl)    { DB.save(DB.load().filter(u => u.srl !== String(srl))); },
  };

  // ═══════════════════════════════════════════════════════
  // SRL 추출
  //   댓글/게시물 닉네임 링크 클래스: "... member_295332412 ..."
  //   팝업 내부 링크 href:            "...member_srl=295332412..."
  // ═══════════════════════════════════════════════════════
  function srlFromClass(el) {
    const c = Array.from(el?.classList || []).find(c => /^member_\d+$/.test(c));
    return c ? c.replace('member_', '') : null;
  }
  function srlFromHref(href) {
    const m = (href || '').match(/member_srl=(\d+)/);
    return m ? m[1] : null;
  }

  // ═══════════════════════════════════════════════════════
  // 스타일
  // ═══════════════════════════════════════════════════════
  const css = document.createElement('style');
  css.textContent = `
    /* ── 댓글 블러 ─────────────────────────────────────── */
    .ddb-c-blur .rhymix_content,
    .ddb-c-blur .xe_content {
      filter: blur(5px);
      user-select: none;
      cursor: pointer;
      transition: filter 0.15s;
    }
    .ddb-c-blur .rhymix_content:hover,
    .ddb-c-blur .xe_content:hover {
      filter: blur(0);
    }

    /* ── 게시물 블라인드 ─────────────────────────────────
     *
     * [실측 구조]
     *  ul.ed.list
     *    li.ed.flex.flex-left.flex-middle.webzine[.popular-item]  ← 게시물 아이템
     *      div.ed.flex.padding-left-xsmall
     *        div.ed.flex
     *          div.ed.width-expand
     *            div.ed.flex.list-meta
     *              div.ed.flex.flex-right.flex-middle
     *                span.ed.text-xsmall.inline-flex...
     *                  a.ed.text-xsmall.link-reset.member_XXXXXXX[href="#popup_menu_area"]
     */
    .ddb-p-blind {
      position: relative !important;
      overflow: hidden !important;
    }
    .ddb-p-blind > * {
      filter: blur(5px) !important;
      pointer-events: none !important;
      user-select: none !important;
    }
    .ddb-p-overlay {
      position: absolute !important;
      inset: 0 !important;
      z-index: 100 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      cursor: pointer !important;
      /* overlay 자신은 blur 제외 */
      filter: none !important;
      pointer-events: auto !important;
    }
    /* 해제 상태 */
    .ddb-p-blind.ddb-p-show > * { filter: none !important; pointer-events: auto !important; }
    .ddb-p-blind.ddb-p-show .ddb-p-overlay { display: none !important; }

    /* ── 본문 페이지 블라인드 ──────────────────────────── */
    .ddb-article-blur {
      filter: blur(8px);
      user-select: none;
      cursor: pointer;
      transition: filter 0.15s;
    }
    .ddb-article-blur:hover { filter: blur(0); }

    /* ── 닉네임 배지 ────────────────────────────────────── */
    .ddb-badge {
      display: inline-flex;
      align-items: center;
      font-size: 10px;
      color: #999;
      padding: 1px 5px;
      border-radius: 3px;
      background: rgba(128,128,128,0.1);
      border: 1px solid rgba(128,128,128,0.18);
      margin-left: 5px;
      vertical-align: middle;
      line-height: 1.4;
    }

    /* ── 팝업 차단 버튼 ─────────────────────────────────── */
    #ddb-popup-btn {
      display: block;
      width: 100%;
      padding: 8px 14px;
      background: none;
      border: none;
      border-top: 1px solid rgba(128,128,128,0.15);
      text-align: left;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      box-sizing: border-box;
    }
    #ddb-popup-btn.off { color: #e74c3c; }
    #ddb-popup-btn.off:hover { background: rgba(231,76,60,0.08); }
    #ddb-popup-btn.on  { color: #27ae60; }
    #ddb-popup-btn.on:hover  { background: rgba(39,174,96,0.08); }

    /* ── FAB ────────────────────────────────────────────── */
    #ddb-fab {
      position: fixed; bottom: 24px; right: 24px;
      z-index: 2147483647;
      width: 44px; height: 44px; border-radius: 50%;
      background: #2c3e50; color: #fff; border: none;
      font-size: 20px; line-height: 44px; text-align: center;
      cursor: pointer; box-shadow: 0 3px 12px rgba(0,0,0,0.3);
      transition: background 0.15s;
    }
    #ddb-fab:hover { background: #3d566e; }

    /* ── 관리 패널 ──────────────────────────────────────── */
    #ddb-panel {
      position: fixed; bottom: 78px; right: 24px;
      z-index: 2147483646;
      width: 295px; background: #fff;
      border: 1px solid #ddd; border-radius: 10px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.16);
      font-size: 13px;
      font-family: 'Malgun Gothic','Apple SD Gothic Neo',sans-serif;
      overflow: hidden; display: none;
    }
    #ddb-panel.open { display: block; }
    #ddb-ph { background:#2c3e50; color:#fff; padding:10px 14px; font-weight:600; font-size:13px; }
    #ddb-pb { padding:10px 14px; max-height:290px; overflow-y:auto; }
    .ddb-empty { color:#bbb; font-size:12px; margin:0; }
    .ddb-row {
      display:flex; justify-content:space-between; align-items:center;
      padding:6px 0; border-bottom:1px solid #f0f0f0; gap:8px;
    }
    .ddb-row:last-child { border-bottom:none; }
    .ddb-name { font-size:13px; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .ddb-srl  { color:#ccc; font-size:11px; margin-left:3px; }
    .ddb-ub   {
      flex-shrink:0; background:none; border:1px solid #e74c3c; color:#e74c3c;
      border-radius:4px; padding:2px 8px; font-size:11px; font-family:inherit; cursor:pointer;
    }
    .ddb-ub:hover { background:#e74c3c; color:#fff; }
  `;
  document.head.appendChild(css);

  // ═══════════════════════════════════════════════════════
  // FAB + 관리 패널
  // ═══════════════════════════════════════════════════════
  const fab = document.createElement('button');
  fab.id = 'ddb-fab'; fab.title = '차단 사용자 관리'; fab.textContent = '🚫';
  document.body.appendChild(fab);

  const panel = document.createElement('div');
  panel.id = 'ddb-panel';
  panel.innerHTML = `<div id="ddb-ph">🚫 차단 사용자 관리</div><div id="ddb-pb"></div>`;
  document.body.appendChild(panel);

  fab.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) renderPanel();
  });
  document.addEventListener('click', e => {
    if (!panel.contains(e.target) && e.target !== fab) panel.classList.remove('open');
  });

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function renderPanel() {
    const pb = document.getElementById('ddb-pb');
    const list = DB.load();
    if (!list.length) {
      pb.innerHTML = '<p class="ddb-empty">차단된 사용자가 없습니다.</p>';
      return;
    }
    pb.innerHTML = list.map(u =>
      `<div class="ddb-row">
        <span class="ddb-name">${esc(u.nick)}<span class="ddb-srl">#${esc(u.srl)}</span></span>
        <button class="ddb-ub" data-srl="${esc(u.srl)}">해제</button>
      </div>`
    ).join('');
    pb.querySelectorAll('.ddb-ub').forEach(btn => {
      btn.addEventListener('click', () => {
        DB.remove(btn.dataset.srl);
        applyAll();
        renderPanel();
      });
    });
  }

  // ═══════════════════════════════════════════════════════
  // 1) 댓글 블러
  //
  //  [실측 구조]
  //  div.ed.comment-item[id^="comment_"]
  //    div.ed.comment-content
  //      div.ed.comment-bar
  //        h6 > a.ed.link-reset.member_XXXXXXX[href="#popup_menu_area"]
  //      div.comment_XXXXXXX_0.rhymix_content.xe_content
  // ═══════════════════════════════════════════════════════
  function applyComments() {
    document.querySelectorAll('div[id^="comment_"].ed').forEach(commentEl => {
      const nickLink = commentEl.querySelector('a[href="#popup_menu_area"]');
      if (!nickLink) return;
      const srl = srlFromClass(nickLink);
      if (!srl) return;

      if (DB.has(srl)) {
        commentEl.classList.add('ddb-c-blur');
        // 닉네임 옆 배지 (중복 방지)
        if (!nickLink.nextElementSibling?.classList.contains('ddb-badge')) {
          const badge = document.createElement('span');
          badge.className = 'ddb-badge';
          badge.textContent = '🚫 차단됨';
          badge.title = '마우스 올리면 내용 표시';
          nickLink.after(badge);
        }
      } else {
        commentEl.classList.remove('ddb-c-blur');
        const badge = nickLink.nextElementSibling;
        if (badge?.classList.contains('ddb-badge')) badge.remove();
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  // 2) 게시물 목록 블라인드
  //
  //  [실측 구조]
  //  ul.ed.list
  //    li.ed.flex.flex-left.flex-middle.webzine[.popular-item]   ← 게시물 아이템
  //      ...
  //        a.ed.text-xsmall.link-reset.member_XXXXXXX[href="#popup_menu_area"]
  //
  //  → li.ed.webzine 을 블라인드 단위로 사용
  //    (webzine 클래스가 게시물 li의 공통 클래스임을 실측 확인)
  // ═══════════════════════════════════════════════════════
  function applyPosts() {
    // ── 목록 페이지 ────────────────────────────────────────────────
    document.querySelectorAll('ul.ed.list > li.ed.webzine').forEach(li => {
      // 댓글박스 안에 있는 li는 제외 (안전장치)
      if (li.closest('#commentbox')) return;

      const nickLink = li.querySelector('a[href="#popup_menu_area"][class*="member_"]');
      if (!nickLink) return;
      const srl = srlFromClass(nickLink);
      if (!srl) return;

      if (DB.has(srl)) {
        if (!li.classList.contains('ddb-p-blind')) {
          li.classList.add('ddb-p-blind');

          // 오버레이 삽입
          const overlay = document.createElement('div');
          overlay.className = 'ddb-p-overlay';
          li.appendChild(overlay);

          overlay.addEventListener('click', e => {
            e.stopPropagation();
            li.classList.toggle('ddb-p-show');
          });
        }
      } else {
        // 차단 해제 시 원상복구
        if (li.classList.contains('ddb-p-blind')) {
          li.classList.remove('ddb-p-blind', 'ddb-p-show');
          li.querySelector('.ddb-p-overlay')?.remove();
        }
      }
    });

    // ── 게시물 본문 페이지 ─────────────────────────────────────────
    // 본문 헤더의 작성자 링크: 댓글과 동일한 a[href="#popup_menu_area"].member_XXXXXXX
    // 단, #commentbox 바깥에 있는 것
    const headerNick = document.querySelector(
      '.article-header a[href="#popup_menu_area"][class*="member_"], ' +
      '.ed.article-header a[href="#popup_menu_area"][class*="member_"]'
    );
    if (headerNick) {
      const srl = srlFromClass(headerNick);
      if (srl && DB.has(srl)) {
        // 본문 영역 (댓글 영역의 rhymix_content 제외)
        document.querySelectorAll('.article-body .rhymix_content, #article_content').forEach(body => {
          if (body.closest('#commentbox')) return;
          if (!body.classList.contains('ddb-article-blur')) {
            body.classList.add('ddb-article-blur');
            body.title = '';
            body.addEventListener('click', () => body.classList.toggle('ddb-article-blur'));
          }
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // popup_menu_area 차단 버튼 주입
  //
  //  팝업 열림 감지: style.top이 양수 → 열림
  //  srl 출처 우선순위:
  //    1) 팝업 내 링크 href의 member_srl= (팝업 내 "작성 글 보기" 등)
  //    2) 닉네임 클릭 시 사전 캡처한 pendingSrl
  // ═══════════════════════════════════════════════════════
  let pendingSrl = null, pendingNick = null;

  // 닉네임 클릭 시 srl/nick 사전 캡처 (팝업 열리기 전)
  document.addEventListener('click', e => {
    const link = e.target.closest('a[href="#popup_menu_area"][class*="member_"]');
    if (!link) return;
    pendingSrl  = srlFromClass(link);
    pendingNick = link.textContent.trim();
  }, true);

  function injectPopupBtn(popup) {
    let srl = null;
    for (const a of popup.querySelectorAll('a[href]')) {
      srl = srlFromHref(a.getAttribute('href'));
      if (srl) break;
    }
    if (!srl) srl = pendingSrl;
    if (!srl) return;

    const nick = pendingNick || srl;

    // 기존 버튼 제거 후 재생성 (이벤트 중복 방지)
    popup.querySelector('#ddb-popup-btn')?.remove();

    const btn = document.createElement('button');
    btn.id = 'ddb-popup-btn';
    const blocked = DB.has(srl);
    btn.className = blocked ? 'on' : 'off';
    btn.textContent = blocked ? `✅ ${nick} 차단 해제` : `🚫 ${nick} 차단하기`;
    popup.appendChild(btn);

    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (DB.has(srl)) {
        DB.remove(srl);
        btn.textContent = `🚫 ${nick} 차단하기`;
        btn.className = 'off';
      } else {
        DB.add(srl, nick);
        btn.textContent = `✅ ${nick} 차단 해제`;
        btn.className = 'on';
      }
      applyAll();
      setTimeout(() => {
        try { XE.closePopupMenu?.(); } catch {}
        popup.style.top = '-9999px';
      }, 200);
    });
  }

  function watchPopup() {
    const popup = document.getElementById('popup_menu_area');
    if (!popup || popup._ddbWatched) return;
    popup._ddbWatched = true;

    let lastTop = null;
    new MutationObserver(() => {
      const top = parseInt(popup.style.top, 10);
      const open = !isNaN(top) && top > 0;
      if (open && top !== lastTop) setTimeout(() => injectPopupBtn(popup), 40);
      if (!open) popup.querySelector('#ddb-popup-btn')?.remove();
      lastTop = open ? top : null;
    }).observe(popup, { attributes: true, attributeFilter: ['style'] });
  }

  // ═══════════════════════════════════════════════════════
  // 전체 적용 + MutationObserver (동적 로드 대응)
  // ═══════════════════════════════════════════════════════
  function applyAll() {
    applyComments();
    applyPosts();
  }

  new MutationObserver(() => {
    applyAll();
    watchPopup();
  }).observe(document.body, { childList: true, subtree: true });

  applyAll();
  watchPopup();

})();