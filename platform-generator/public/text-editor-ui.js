// ============================================================
// text-editor-ui.js
//
// 역할:
// - Instagram / Threads 편집 화면을 전환합니다.
// - Instagram / Threads 초안을 생성하고 직접 수정합니다. 카드뉴스는 별도 탭입니다.
// - 원문 근거를 읽기 전용으로 표시합니다.
// - 다른 UI 모듈에 플랫폼 조회·전환·초안 적용 기능을 제공합니다.
//
// 서버 요청:
// - 모든 요청은 api.js의 NewsApi 함수로 처리합니다.
//
// Threads 문단별 근거 구조:
// draft.block_evidence = {
//   opening: ["원문 인용"],
//   paragraphs: [["첫 문단 근거"], ["둘째 문단 근거"]],
//   closing: ["마무리 근거"]
// };
//
// 새 초안: opening=기사 제목, paragraphs=핵심 요약, closing=빈 문자열.
// 이전 저장 초안의 마무리는 보존합니다. URL은 source_url로 별도 관리합니다.
// ============================================================
(() => {
  // ==========================================================
  // 1. 연결 모듈과 필수 화면 확인
  // ==========================================================
  const get = (id) => document.getElementById(id);
  if (!window.CardEditor || !window.NewsInput || !window.NewsApi) {
    console.error(
      "api.js, article-input.js, generate-ui.js 연결 순서를 확인해주세요.",
    );
    return;
  }
  const center = get("stage")?.closest(".panel");
  const right = get("cards")?.closest(".panel");
  const photoTools = document.querySelector(".photo-tools");
  const instagramButton = get("generate-card-news");
  if (!center || !right || !instagramButton) {
    console.error("편집 패널과 카드뉴스 생성 버튼을 확인해주세요.");
    return;
  }
  // state, revision, draw()는 index.html에서 선언한 공통 상태입니다.
  const names = {
    instagram: "Instagram",
    card_news: "카드뉴스",
    threads: "Threads",
  };
  let selectedView = "instagram";
  // ==========================================================
  // 2. 카드뉴스 화면의 최초 표시 상태 보관
  // 텍스트 화면에서 숨겼다가 복원할 때 사용합니다.
  // ==========================================================
  const centerOriginal = [...center.children].map((element) => ({
    element,
    hidden: element.hidden,
  }));
  const rightOriginal = [...right.children].map((element) => ({
    element,
    hidden: element.hidden,
  }));
  // ==========================================================
  // 3. 편집 화면과 근거 표시 스타일
  // ==========================================================
  const style = document.createElement("style");
  style.textContent = `
    .sns-composer {border:1px solid #dededb;border-radius:18px;background:#fff;overflow:hidden;margin-top:16px;color:#222}
    .composer-heading {display:flex;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid #eee}
    .composer-profile {display:flex;align-items:center;gap:12px;padding:20px 20px 4px}
    .composer-profile small {display:block;margin-top:4px}
    .composer-avatar {display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:#e6e8e5;color:#52634a;font-weight:700}
    .composer-fields {padding:0 20px 0 70px}
    .sns-composer .text-editor-field {margin:8px 0}
    .sns-composer .text-editor-field label {font-size:11px;color:#777;margin-bottom:2px}
    .sns-composer .text-editor-field textarea {border:1px solid transparent;border-radius:6px;padding:6px 0;line-height:1.65;resize:vertical;min-height:45px;background:transparent}
    .sns-composer .text-editor-field textarea:focus {outline:1px solid #b7c0b1;padding-left:6px;background:#fafbf9}
    .sns-composer .text-source-evidence {font-size:11px;background:transparent;border:0;padding:2px;margin-top:0;color:#72796b}
    .sns-composer .text-source-evidence summary {font-weight:400}
    .composer-options,.composer-attachments {padding:10px 20px 10px 70px}
    .composer-options input[type=url] {padding:8px;border:1px solid #ddd;border-radius:8px}
    .composer-card-strip {display:flex;gap:10px;overflow-x:auto;padding:8px 0;scroll-snap-type:x proximity}
    .composer-card-mini {width:160px;height:200px;flex:0 0 160px;overflow:hidden;position:relative;border-radius:10px;pointer-events:none;scroll-snap-align:start}
    .composer-card-content {position:absolute;top:0;left:0;width:1080px;height:1350px;transform:scale(0.148148148);transform-origin:top left}
    .composer-footer {display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 20px;border-top:1px solid #eee}
    .over-limit {color:#b42318;font-weight:bold}
    @media(max-width:600px) {.composer-fields,.composer-options,.composer-attachments {padding-left:20px}.composer-heading {flex-wrap:wrap}}
    .platform-tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }
    .platform-tabs button[aria-pressed="true"] {
      background: #262724;
      color: white;
    }
    .text-editor-field {
      margin: 18px 0;
    }
    .text-editor-field label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 700;
    }
    .text-editor-field textarea {
      display: block;
      width: 100%;
      padding: 14px;
      border: 1px solid #dcd8cf;
      border-radius: 12px;
      background: #fff;
      color: #242522;
      font: inherit;
      line-height: 1.8;
      resize: vertical;
    }
    .text-outline button {
      display: block;
      width: 100%;
      margin: 10px 0;
      text-align: left;
    }
    .text-source-evidence {
      margin-top: 10px;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 9px;
      background: #f6f7f3;
      font-size: 13px;
      line-height: 1.7;
      overflow-wrap: anywhere;
    }
    .text-source-evidence summary {
      cursor: pointer;
      font-weight: 700;
    }
    .text-source-evidence ul {
      margin: 10px 0;
      padding-left: 20px;
    }
    .text-evidence-note {
      margin: 8px 0 0;
      color: #62685b;
      font-size: 12px;
    }
  `;
  document.head.append(style);
  // ==========================================================
  // 4. 플랫폼 탭과 텍스트 편집 영역 생성
  // ==========================================================
  const tabs = document.createElement("div");
  tabs.className = "platform-tabs";
  const tabButtons = {};
  for (const platform of ["instagram", "threads", "card_news"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = names[platform];
    button.setAttribute("aria-pressed", "false");
    // 공개 함수를 통해 전환합니다.
    // 검수 UI가 이 함수를 감싸서 결과 화면을 갱신할 수 있습니다.
    button.onclick = () => window.TextEditor.showPlatform(platform);
    tabButtons[platform] = button;
    tabs.append(button);
  }
  const textEditor = document.createElement("div");
  textEditor.hidden = true;
  const outline = document.createElement("div");
  outline.className = "text-outline";
  outline.hidden = true;
  center.prepend(tabs);
  center.append(textEditor);
  right.append(outline);
  // ==========================================================
  // 5. 공통 표시 도구
  // ==========================================================
  function showOriginal(items, show) {
    items.forEach(({ element, hidden }) => {
      element.hidden = show ? hidden : true;
    });
  }
  function getEvidenceNote(draft) {
    return draft.evidence_status === "needs_recheck" ||
      draft.validation_status === "needs_recheck"
      ? "원고가 수정되었습니다. 아래 근거와 현재 내용의 일치 여부를 다시 검수해주세요."
      : "생성 당시 연결한 원문 근거입니다. 인용의 존재와 내용의 타당성은 검수로 확인해주세요.";
  }
  function getDraftStatus(draft) {
    if (draft.validation_status === "needs_recheck") {
      return "수정된 원고입니다. 재검수가 필요합니다.";
    }
    if (draft.validation_status === "passed") {
      return "검수 통과로 기록된 원고입니다. 발행 전 최종 내용을 확인해주세요.";
    }
    if (draft.validation_status === "needs_revision") {
      return "검수에서 수정할 항목이 발견되었습니다. 검수 결과를 확인해주세요.";
    }
    return "AI 생성 초안입니다. 전체 내용 검수는 아직 진행하지 않았습니다.";
  }
  // ==========================================================
  // 6. 텍스트 수정 시 재검수 상태 갱신
  // 근거는 자동 변경하지 않고 기존 연결을 보존합니다.
  // ==========================================================
  function markTextChanged(draft) {
    revision++;
    draft.validation_status = "needs_recheck";
    draft.evidence_status = "needs_recheck";
    const message = get("text-edit-status");
    if (message) {
      message.textContent =
        "내용이 수정되었습니다. 원문 근거와 요구사항을 다시 검수해야 합니다.";
    }
    textEditor.querySelectorAll(".text-evidence-note").forEach((note) => {
      note.textContent = getEvidenceNote(draft);
    });
  }
  // ==========================================================
  // 7. 원문 근거 표시
  //
  // HTML로 해석하지 않고 textContent로 표시합니다.
  // 기존 초안의 전체 근거를 개별 문단에 임의 배정하지 않습니다.
  // ==========================================================
  function addEvidence(
    parent,
    title,
    quotes,
    draft,
    emptyMessage = "연결된 원문 근거가 없습니다.",
  ) {
    const details = document.createElement("details");
    details.className = "text-source-evidence";
    const summary = document.createElement("summary");
    summary.textContent = title;
    const validQuotes = Array.isArray(quotes)
      ? quotes.filter((quote) => typeof quote === "string" && quote.trim())
      : [];
    details.append(summary);
    if (validQuotes.length) {
      const list = document.createElement("ul");
      validQuotes.forEach((quote) => {
        const item = document.createElement("li");
        item.textContent = quote;
        list.append(item);
      });
      details.append(list);
    } else {
      const message = document.createElement("p");
      message.textContent = emptyMessage;
      details.append(message);
    }
    const note = document.createElement("p");
    note.className = "text-evidence-note";
    note.textContent = getEvidenceNote(draft);
    details.append(note);
    parent.append(details);
  }
  // ==========================================================
  // 8. 편집 입력칸과 우측 목차 버튼 생성
  // 반환된 wrapper 아래에 항목별 근거를 추가할 수 있습니다.
  // ==========================================================
  function addField(labelText, value, onChange, rows = 5) {
    const wrapper = document.createElement("div");
    wrapper.className = "text-editor-field";
    const label = document.createElement("label");
    const textarea = document.createElement("textarea");
    textarea.id = "text-" + crypto.randomUUID();
    textarea.value = typeof value === "string" ? value : "";
    textarea.rows = rows;
    label.htmlFor = textarea.id;
    label.textContent = labelText;
    textarea.addEventListener("input", () => {
      onChange(textarea.value);
    });
    wrapper.append(label, textarea);
    (textEditor.querySelector(".composer-fields") || textEditor).append(wrapper);
    const navigation = document.createElement("button");
    navigation.type = "button";
    navigation.textContent = labelText;
    navigation.onclick = () => {
      textarea.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      textarea.focus({ preventScroll: true });
    };
    outline.append(navigation);
    return wrapper;
  }
  // ==========================================================
  // 9. 선택한 플랫폼 화면 표시
  // 화면 전환만 수행하며 원고를 다시 생성하지 않습니다.
  // ==========================================================
  function showPlatform(platform) {
    if (!Object.hasOwn(names, platform)) {
      throw new Error("지원하지 않는 플랫폼입니다.");
    }
    selectedView = platform;
    Object.entries(tabButtons).forEach(([key, button]) => {
      button.setAttribute("aria-pressed", String(key === platform));
    });
    const isCardNews = platform === "card_news";
    showOriginal(centerOriginal, isCardNews);
    showOriginal(rightOriginal, isCardNews);
    textEditor.hidden = isCardNews;
    outline.hidden = isCardNews;
    if (photoTools) {
      photoTools.hidden = !isCardNews;
    }
    if (isCardNews) {
      window.dispatchEvent(new Event("news:platform-changed"));
      draw();
      return;
    }
    textEditor.replaceChildren();
    outline.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = `${names[platform]} 원고 편집`;
    textEditor.append(heading);
    const outlineHeading = document.createElement("h2");
    outlineHeading.textContent = "원고 구성";
    outline.append(outlineHeading);
    const draft = state.text_drafts?.[platform];
    if (!draft) {
      const message = document.createElement("p");
      message.className = "notice";
      message.textContent =
        `아직 ${names[platform]} 원고가 없습니다. ` +
        "왼쪽에서 플랫폼을 체크하고 해당 생성 버튼을 눌러주세요.";
      textEditor.append(message);
      window.dispatchEvent(new Event("news:platform-changed"));
      return;
    }
    const status = document.createElement("p");
    status.id = "text-edit-status";
    status.className = "notice";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = getDraftStatus(draft);
    textEditor.append(status);
    function update(setValue) {
      return (value) => {
        setValue(value);
        markTextChanged(draft);
      };
    }
    // 9-0. 두 플랫폼 모두 작성창 모양으로 직접 편집합니다.
    // 이 화면은 앱 내부 미리보기이며 실제 계정 로그인과 발행은 로컬 연결에서 처리합니다.
    const composer=document.createElement("section");
    composer.className="sns-composer " + platform;
    composer.dataset.platform=platform;
    const top=document.createElement("div");top.className="composer-heading";
    const title=document.createElement("strong");title.textContent=platform==="threads"?"새로운 스레드":"새 게시물";
    const badge=document.createElement("span");badge.className="muted";badge.textContent="작성 화면 미리보기";top.append(title,badge);
    const profile=document.createElement("div");profile.className="composer-profile";
    const avatar=document.createElement("span");avatar.className="composer-avatar";avatar.textContent="N";avatar.setAttribute("aria-hidden","true");
    const identity=document.createElement("div");const author=document.createElement("strong");author.textContent="내 계정";
    const accountNote=document.createElement("small");accountNote.textContent="실제 게시 계정은 전용 창에서 확인";identity.append(author,accountNote);profile.append(avatar,identity);
    const fields=document.createElement("div");fields.className="composer-fields";
    const options=document.createElement("div");options.className="composer-options";
    const attachments=document.createElement("section");attachments.className="composer-attachments";
    const footer=document.createElement("div");footer.className="composer-footer";
    const count=document.createElement("span");count.className="notice";count.id="composer-character-count";
    const previewOnly=document.createElement("span");previewOnly.className="muted";previewOnly.textContent="게시 전 미리보기 · 아직 게시되지 않음";
    footer.append(count,previewOnly);
    composer.append(top,profile,fields,options,attachments,footer);textEditor.append(composer);
    const message=document.createElement("p");message.className="notice";
    message.textContent="원고는 작성창 안에서 수정하세요. 첨부 카드의 글·사진·순서는 카드뉴스 탭에서만 수정할 수 있습니다.";textEditor.append(message);
    const caption=document.createElement("pre");caption.hidden=true;caption.id=platform==="threads"?"threads-post-preview":"instagram-caption-preview";
    // 게시용 문자열은 기존 원고 필드에서 구성합니다. 표시용 카드와 근거를 섞지 않습니다.
    function refreshComposer() {
      caption.textContent=[draft.opening,...draft.paragraphs,draft.closing || "",Array.isArray(draft.hashtags)?draft.hashtags.join(" "):""].filter(value=>value.trim()).join("\n\n");
      let length=caption.textContent.length;
      if(platform==="threads" && draft.include_source_link!==false && (draft.source_url || "").trim())length+=(draft.source_url || "").trim().length+2;
      count.textContent=platform==="threads"?`${length}/500자 · 줄바꿈·링크 포함`:`${length}자 · 해시태그 포함`;
      count.classList.toggle("over-limit",platform==="threads" && length>500);
      const emoji=textEditor.querySelector("#threads-emoji-status");
      if(emoji)emoji.textContent=/\p{Extended_Pictographic}/u.test(caption.textContent)?"이모지가 본문에 표시되어 있습니다.":"이모지는 제목이나 본문에 직접 추가할 수 있습니다.";
    }
    function change(setValue){return value=>{setValue(value);markTextChanged(draft);refreshComposer();};}
    const opening=addField(platform==="threads"?"기사 제목":"도입",draft.opening,change(value=>{draft.opening=value;}),2);
    addEvidence(opening,"제목·도입의 원문 근거",draft.block_evidence?.opening,draft);
    draft.paragraphs.forEach((paragraph,index)=>{
      const field=addField(platform==="threads"?`핵심 요약 ${index+1}`:`본문 ${index+1}`,paragraph,change(value=>{draft.paragraphs[index]=value;}),2);
      addEvidence(field,`본문 ${index+1}의 원문 근거`,draft.block_evidence?.paragraphs?.[index],draft);
    });
    if(platform==="instagram" || (draft.closing || "").trim()){
      const field=addField("마무리",draft.closing || "",change(value=>{draft.closing=value;}),2);
      addEvidence(field,"마무리의 원문 근거",draft.block_evidence?.closing,draft);
    }
    if(["instagram","threads"].includes(platform))addField("해시태그 · 3~5개",(draft.hashtags || []).join(" "),change(value=>{draft.hashtags=value.trim()?value.trim().split(/\s+/u):[];}),2);
    if(platform==="threads"){
      const emoji=document.createElement("p");emoji.id="threads-emoji-status";emoji.className="notice";options.append(emoji);
      addSourceLink(draft,refreshComposer);
    }
    textEditor.append(caption);refreshComposer();
    renderAttachedCards(attachments,platform,draft);
    addEvidence(textEditor,"전체 원고의 원문 근거",draft.source_evidence,draft,"저장된 전체 원문 근거가 없습니다.");
    window.dispatchEvent(new Event("news:platform-changed"));
  }

  // 첨부 카드는 현재 카드 데이터로 표시하고 편집은 카드뉴스 탭에서만 허용합니다.
  function renderAttachedCards(host,platform,draft) {
    host.replaceChildren();
    const title=document.createElement("strong");title.textContent="첨부 카드뉴스";host.append(title);
    const cards=state.card_news?state.cards:[];
    const source=state.card_news_generation_input?.article,original=draft.generation_input?.article;
    const mismatched=cards.length && source && original && (source.title!==original.title || source.content!==original.content);
    const note=document.createElement("p");note.className="notice";
    note.textContent=mismatched?"원고와 카드뉴스의 원문이 다릅니다. 같은 기사로 다시 생성해야 함께 보낼 수 있습니다.":cards.length?`${cards.length}장 · 읽기 전용 미리보기 · 원고와 함께 첨부됩니다.`:platform==="instagram"?"첨부 카드뉴스가 없습니다. Instagram 작성창 준비에는 카드뉴스가 필요합니다.":"첨부 카드뉴스가 없습니다. Threads는 글만 보낼 수도 있습니다.";
    host.append(note);
    if(!mismatched && cards.length){
      const strip=document.createElement("div");strip.className="composer-card-strip";
      cards.forEach((card,index)=>{
        const mini=document.createElement("div");mini.className="composer-card-mini";mini.setAttribute("aria-label",`${index+1}번 카드 읽기 전용 미리보기`);
        const content=document.createElement("div");content.className="composer-card-content";
        content.innerHTML=CardTemplate.markup(displayCard(card,index),false);
        content.querySelectorAll('[contenteditable]').forEach(el=>el.removeAttribute('contenteditable'));
        mini.append(content);strip.append(mini);
      });host.append(strip);
    }
    const edit=document.createElement("button");edit.type="button";edit.className="dark";edit.textContent="카드뉴스에서 수정";
    edit.onclick=()=>window.TextEditor.showPlatform("card_news");host.append(edit);
  }
  // 카드 변경 시 첨부 영역만 갱신해 본문 입력과 커서를 보존합니다.
  window.addEventListener("news:cards-changed",()=>{
    if(selectedView==="card_news")return;
    const host=textEditor.querySelector(".composer-attachments"),draft=state.text_drafts?.[selectedView];
    if(host && draft)renderAttachedCards(host,selectedView,draft);
  });
  // ==========================================================
  // 9-4. 원문 URL 편집과 링크 첨부 여부
  // 새 URL을 입력해도 원문을 다시 수집하지 않습니다.
  // 출처의 정확성은 사용자가 확인하며 HTTP(S) 링크만 표시합니다.
  // ==========================================================
  function addSourceLink(draft, onChange = () => {}) {
    const wrapper = document.createElement("section");
    wrapper.className = "text-editor-field";
    const heading = document.createElement("h3");
    heading.textContent = "첨부물 · 원문 링크";
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "url";
    input.id = "threads-source-url";
    input.maxLength = 2048;
    input.placeholder = "https://... (선택 사항)";
    input.style.width = "100%";
    input.value = draft.source_url ?? draft.generation_input?.article?.url ?? "";
    label.htmlFor = input.id;
    label.textContent = "원문 기사 URL";
    const choice = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = draft.include_source_link !== false;
    checkbox.style.width = "auto";
    choice.append(checkbox, document.createTextNode(" 원문 링크 첨부"));
    const hint = document.createElement("p");
    hint.className = "notice";
    const link = document.createElement("a");
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "원문 기사 열기";
    function refresh() {
      link.hidden = true;
      link.removeAttribute("href");
      const value = input.value.trim();
      if (!value) {
        hint.textContent = "URL 없이도 원고를 사용할 수 있습니다.";
        return;
      }
      try {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
        link.href = url.href;
        link.hidden = false;
        hint.textContent = checkbox.checked
          ? "원문 링크를 첨부하도록 선택했습니다. 작성창 준비 시 선택한 링크를 포함합니다."
          : "주소를 보관하지만 게시물 링크 첨부는 선택하지 않았습니다.";
      } catch {
        hint.textContent = "올바른 http:// 또는 https:// 기사 주소를 입력해주세요.";
      }
    }
    input.addEventListener("input", () => {
      draft.source_url = input.value.trim();
      markTextChanged(draft);
      refresh();
      onChange();
    });
    checkbox.addEventListener("change", () => {
      draft.include_source_link = checkbox.checked;
      markTextChanged(draft);
      refresh();
      onChange();
    });
    wrapper.append(heading, label, input, choice, hint, link);
    (textEditor.querySelector(".composer-options") || textEditor).append(wrapper);
    refresh();
  }

  // ==========================================================
  // 10. 생성 결과의 기본 구조 확인
  // 개별 생성과 일괄 생성에서 같은 함수를 사용합니다.
  // ==========================================================
  function validateTextDraft(platform, draft) {
    if (
      !["instagram", "threads"].includes(platform) ||
      draft?.platform !== platform
    ) {
      throw new Error("생성 결과의 플랫폼이 올바르지 않습니다.");
    }
    if (platform === "instagram") {
      if (typeof draft.opening !== "string" || typeof draft.closing !== "string" ||
          !Array.isArray(draft.paragraphs) || draft.paragraphs.some(x => typeof x !== "string") ||
          !Array.isArray(draft.hashtags) || draft.hashtags.some(x => typeof x !== "string")) {
        throw new Error("Instagram 게시글 형식을 확인해주세요.");
      }
      return;
    }
    if (platform === "threads") {
      if (
        typeof draft.opening !== "string" ||
        !Array.isArray(draft.paragraphs) ||
        draft.paragraphs.some((paragraph) => typeof paragraph !== "string") ||
        typeof draft.closing !== "string"
      ) {
        throw new Error("Threads 원고 형식이 올바르지 않습니다.");
      }
      if (draft.draft_version === "threads_summary_v2" &&
          (!draft.opening.trim() || !draft.paragraphs.length ||
           draft.paragraphs.some(value => !value.trim()))) {
        throw new Error("Threads 제목과 핵심 요약 문장을 확인해주세요.");
      }
      // 새 근거 구조가 있는 경우에만 연결 형식을 확인합니다.
      // 기존 저장 초안과의 호환성을 위해 없는 경우는 허용합니다.
      if (draft.block_evidence != null) {
        const blocks = draft.block_evidence;
        const isQuoteArray = (value) =>
          Array.isArray(value) &&
          value.every((quote) => typeof quote === "string");
        if (
          !isQuoteArray(blocks.opening) ||
          !isQuoteArray(blocks.closing) ||
          !Array.isArray(blocks.paragraphs) ||
          blocks.paragraphs.length !== draft.paragraphs.length ||
          !blocks.paragraphs.every(isQuoteArray)
        ) {
          throw new Error("Threads 문단별 근거 연결 형식이 올바르지 않습니다.");
        }
      }
      return;
    }
  }

  // ==========================================================
  // 11. 초안과 생성 입력 보관
  // 다른 플랫폼의 초안은 유지합니다.
  // ==========================================================
  function applyDraft(platform, draft, input, expectedRevision) {
    if (revision !== expectedRevision) {
      throw new Error("생성 중 편집 내용이 변경되었습니다.");
    }
    validateTextDraft(platform, draft);
    // 복사가 성공한 뒤에만 공통 상태를 변경합니다.
    const storedDraft = structuredClone({
      ...draft,
      generation_input: input,
    });
    state.text_drafts ??= {};
    state.text_drafts[platform] = storedDraft;
    revision++;
  }
  // 개별 원고 생성 버튼은 제공하지 않습니다.
  // 플랫폼 원고 생성은 batch-generate-ui.js의 선택한 항목 생성에서 담당합니다.
  // ==========================================================
  // 14. 기존 파일 불러오기와 화면 갱신 연결
  // ==========================================================
  const draftFile = get("draft-file");
  if (draftFile && typeof draftFile.onchange === "function") {
    const originalLoad = draftFile.onchange;
    draftFile.onchange = async (event) => {
      await originalLoad.call(draftFile, event);
      window.TextEditor.showPlatform(selectedView);
    };
  }
  // ==========================================================
  // 15. 다른 UI 모듈에서 사용할 공개 인터페이스
  // 기존 함수 이름과 호출 방식을 유지합니다.
  // ==========================================================
  window.TextEditor = {
    getPlatform() {
      return selectedView;
    },
    showPlatform,
    applyDraft,
  };
  // ==========================================================
  // 16. 최초 화면
  // ==========================================================
  window.TextEditor.showPlatform("instagram");
})();
