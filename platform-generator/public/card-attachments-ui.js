// ============================================================
// card-attachments-ui.js
// 공통 카드를 Threads에 선택하고 첨부 순서를 보관합니다.
// 카드 텍스트를 Threads 글 생성 입력으로 사용하지 않습니다.
// 실제 이미지 렌더링·업로드는 이후 발행 단계에서 처리합니다.
// ============================================================
(() => {
  if (!window.TextEditor || !window.CardEditor) return;
  const host = document.getElementById('stage')?.closest('.panel');
  if (!host) return;

  // 1. 동일 원문 확인: article_id의 기본값이 같다는 이유로 허용하지 않습니다.
  function sameArticle(a, b) {
    return !!a?.title && !!a?.content && a.title === b?.title && a.content === b?.content;
  }
  function draft() { return state.text_drafts?.threads; }
  function available() {
    const source = state.card_news_generation_input?.article;
    return !source || sameArticle(source, draft()?.generation_input?.article);
  }
  function ids() {
    const value = draft()?.attached_card_ids;
    const existing = new Set(state.cards.map(card => card.card_id));
    return [...new Set(Array.isArray(value) ? value : [])]
      .filter(id => typeof id === 'string' && existing.has(id));
  }

  // 2. 첨부 수정은 저장 상태에 반영하고 이전 검수 결과도 무효화합니다.
  function change(value) {
    const target = draft();
    if (!target) return;
    target.attached_card_ids = value;
    target.attachment_status = 'needs_review';
    target.validation_status = 'needs_recheck';
    revision++;
    if (state.validation_results?.threads) state.validation_results.threads.invalidated = true;
    render();
  }
  function button(text, action, disabled = false) {
    const element = document.createElement('button');
    element.type = 'button'; element.textContent = text;
    element.disabled = disabled; element.onclick = action;
    return element;
  }

  // 3. Threads 화면에만 선택 목록을 표시합니다. DOM에는 textContent를 사용합니다.
  function render() {
    host.querySelector('#threads-card-attachments')?.remove();
    if (window.TextEditor.getPlatform() !== 'threads' || !draft()) return;
    const box = document.createElement('section');
    box.id = 'threads-card-attachments';
    const heading = document.createElement('h3');
    heading.textContent = '첨부물 · 카드뉴스';
    const notice = document.createElement('p');
    notice.className = 'notice';
    notice.setAttribute('role', 'status');
    const selected = ids();
    const allowed = available();
    notice.textContent = !allowed
      ? '현재 카드와 Threads 원고의 원문이 다릅니다. 같은 원문으로 카드를 다시 생성해주세요.'
      : `선택한 카드 ${selected.length}장 · 선택하지 않으면 글과 선택한 원문 링크만 사용합니다. 카드 본문이 바뀌면 첨부에도 최신 내용이 반영됩니다.`;
    box.append(heading, notice);
    if (!state.card_news_generation_input) {
      const warning = document.createElement('p');
      warning.className = 'notice';
      warning.textContent = '이 카드에는 생성 원문 정보가 없습니다. 수동 카드의 내용이 현재 기사와 맞는지 확인해주세요.';
      box.append(warning);
    }
    // 3-1. 공통 카드 목록: 체크한 순서대로 첨부 순서가 결정됩니다.
    state.cards.forEach((card, index) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:block;border:1px solid #ddd;padding:12px;margin:10px 0;border-radius:9px;';
      const check = document.createElement('input');
      check.type = 'checkbox'; check.style.width = 'auto';
      check.checked = selected.includes(card.card_id); check.disabled = !allowed;
      check.onchange = () => {
        if (!available()) return;
        const currentIds = ids();
        change(check.checked ? [...currentIds, card.card_id] : currentIds.filter(id => id !== card.card_id));
      };
      const title = document.createElement('strong');
      title.textContent = ` ${index + 1}번 카드 · ${card.headline || '제목 없음'}`;
      const summary = document.createElement('p');
      summary.textContent = card.body || '';
      summary.style.cssText = 'font-size:13px;line-height:1.6;white-space:pre-wrap;';
      row.append(check, title, summary); box.append(row);
    });
    box.append(button('선택 해제', () => change([]), !selected.length));

    // 3-2. 첨부 순서: 공통 카드 편집 순서와 별도로 저장합니다.
    const order = document.createElement('h4'); order.textContent = '선택한 첨부 순서'; box.append(order);
    selected.forEach((id, index) => {
      const card = state.cards.find(item => item.card_id === id);
      const row = document.createElement('div');
      const title = document.createElement('p');
      title.textContent = `${index + 1}. ${card.headline || '제목 없음'}`;
      function move(step) {
        const currentIds = ids(); const next = index + step;
        if (next < 0 || next >= currentIds.length) return;
        [currentIds[index], currentIds[next]] = [currentIds[next], currentIds[index]];
        change(currentIds);
      }
      row.append(title, button('앞으로', () => move(-1), index === 0),
        button('뒤로', () => move(1), index === selected.length - 1));
      box.append(row);
    });
    const note = document.createElement('p'); note.className = 'notice';
    note.textContent = '카드 편집은 위의 카드뉴스 탭에서 진행하세요. 선택과 순서는 초안 저장에 포함됩니다. 실제 업로드는 아직 연결하지 않았습니다.';
    box.append(note);
    // TextEditor가 만든 편집 영역 안에 넣어 다른 플랫폼 전환 시 함께 숨깁니다.
    const editor = host.querySelector('#text-edit-status')?.parentElement;
    (editor || host).append(box);
  }

  // 4. 탭 전환·일괄 생성·불러오기 모두 기존 공개 함수 연결을 유지합니다.
  const originalShow = window.TextEditor.showPlatform;
  window.TextEditor.showPlatform = function (...args) {
    const result = originalShow.apply(this, args); render(); return result;
  };
  const originalApply = window.TextEditor.applyDraft;
  window.TextEditor.applyDraft = function (platform, generated, input, expectedRevision) {
    const previous = draft();
    const keep = platform === 'threads' && sameArticle(previous?.generation_input?.article, input?.article)
      && available() ? ids() : [];
    const result = originalApply.call(this, platform, generated, input, expectedRevision);
    if (platform === 'threads') {
      draft().attached_card_ids = keep;
      draft().attachment_status = 'needs_review';
    }
    return result;
  };
  window.addEventListener('news:cards-changed', () => {
    const target = draft();
    if (target) {
      target.attached_card_ids = available() ? ids() : [];
      target.attachment_status = 'needs_review';
      if (state.validation_results?.threads) state.validation_results.threads.invalidated = true;
    }
    render();
  });

  // 5. 이후 내보내기·발행 단계가 사용할 최신 첨부 카드 조회
  window.CardAttachments = {
    getThreadsCards() {
      if (!available()) return [];
      return structuredClone(ids().map(id => state.cards.find(card => card.card_id === id)));
    },
  };
  render();
})();
