// ============================================================
// text-editor-ui.js
//
// 역할:
// - Instagram / Threads / Blog 편집 화면을 전환합니다.
// - Instagram / Threads / Blog 초안을 생성하고 직접 수정합니다. 카드뉴스는 별도 탭입니다.
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
  const instagramButton = get("generate-instagram");
  if (!center || !right || !instagramButton) {
    console.error("편집 패널과 카드뉴스 생성 버튼을 확인해주세요.");
    return;
  }
  // state, revision, draw()는 index.html에서 선언한 공통 상태입니다.
  const names = {
    instagram: "Instagram",
    card_news: "카드뉴스",
    threads: "Threads",
    blog: "Blog",
  };
  let selectedView = "instagram";
  let busy = false;
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
    .text-generate-tools button {
      display: block;
      width: 100%;
      margin: 10px 0;
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
  for (const platform of ["instagram", "threads", "blog", "card_news"]) {
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
    textEditor.append(wrapper);
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
    // 9-0. Instagram 게시글: 텍스트와 해시태그를 각각 편집합니다.
    if (platform === "instagram") {
      const caption = document.createElement("pre");
      caption.id = "instagram-caption-preview";
      caption.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.8;padding:14px;background:#f6f7f3;border-radius:10px;";
      function refreshCaption() {
        caption.textContent = [draft.opening, ...draft.paragraphs, draft.closing,
          draft.hashtags.join(" ")].filter(value => value.trim()).join("\n\n");
      }
      function change(set) { return value => { set(value); markTextChanged(draft); refreshCaption(); }; }
      const opening = addField("도입", draft.opening, change(value => {draft.opening = value;}), 3);
      addEvidence(opening, "도입의 원문 근거", draft.block_evidence?.opening, draft);
      draft.paragraphs.forEach((paragraph, index) => {
        const field = addField(`본문 ${index + 1}`, paragraph,
          change(value => {draft.paragraphs[index] = value;}));
        addEvidence(field, `본문 ${index + 1}의 원문 근거`, draft.block_evidence?.paragraphs?.[index], draft);
      });
      const closing = addField("마무리", draft.closing, change(value => {draft.closing = value;}), 3);
      addEvidence(closing, "마무리의 원문 근거", draft.block_evidence?.closing, draft);
      addField("해시태그 · 3~5개, 공백으로 구분", draft.hashtags.join(" "),
        change(value => {draft.hashtags = value.trim() ? value.trim().split(/\s+/u) : [];}), 2);
      const title = document.createElement("h3"); title.textContent = "게시글 미리보기";
      textEditor.append(title, caption);
      refreshCaption();
    }
    // --------------------------------------------------------
    // 9-1. Threads 편집과 항목별 근거
    //
    // 텍스트 항목은 기존 문자열 구조를 유지합니다.
    // block_evidence는 해당 텍스트에 연결되는 근거입니다.
    // --------------------------------------------------------
    if (platform === "threads") {
      const summaryMode = draft.draft_version === "threads_summary_v2";
      const guide = document.createElement("p");
      guide.className = "notice";
      guide.textContent = summaryMode
        ? "제목과 핵심 요약을 직접 수정하세요. 기본 4~5문장이며 짧은 원문은 더 적게 생성합니다. 원문 링크는 본문과 별도로 관리합니다."
        : "이전 형식의 초안입니다. 기존 내용은 보존합니다. 새 제목·요약 형식을 사용하려면 다시 생성해주세요.";
      textEditor.append(guide);
      const blockEvidence = draft.block_evidence;
      const missingMessage =
        "이 초안에는 해당 항목의 근거 연결 정보가 없습니다. " +
        "문단별 근거 생성 기능을 적용한 뒤 새로 생성해주세요.";
      const openingField = addField(
        summaryMode ? "기사 제목" : "제목 / 기존 도입",
        draft.opening,
        update((value) => {
          draft.opening = value;
        }),
        3,
      );
      addEvidence(
        openingField,
        summaryMode ? "기사 제목의 원문 근거" : "도입의 원문 근거",
        blockEvidence?.opening,
        draft,
        missingMessage,
      );
      draft.paragraphs.forEach((paragraph, index) => {
        const paragraphField = addField(
          `핵심 요약 ${index + 1}`,
          paragraph,
          update((value) => {
            draft.paragraphs[index] = value;
          }),
        );
        addEvidence(
          paragraphField,
          `핵심 요약 ${index + 1}의 원문 근거`,
          blockEvidence?.paragraphs?.[index],
          draft,
          missingMessage,
        );
      });
      // 이전 저장 원고의 마무리는 보존하되 새 초안에 빈 입력칸을 강제하지 않습니다.
      if (typeof draft.closing === "string" && draft.closing.trim()) {
        const closingField = addField(
          "추가 문장 / 기존 마무리", draft.closing,
          update(value => { draft.closing = value; }), 3,
        );
        addEvidence(closingField, "추가 문장의 원문 근거",
          blockEvidence?.closing, draft, missingMessage);
      }
      // 9-1-1. 선택적 원문 링크: 본문에 섞지 않고 별도로 편집합니다.
      // URL 방문은 사용자가 링크를 클릭할 때만 발생합니다.
      addSourceLink(draft);

    }
    // --------------------------------------------------------
    // 9-2. Blog 편집과 section별 근거
    // 기존 생성 결과에 포함된 section 근거를 표시합니다.
    // --------------------------------------------------------
    if (platform === "blog") {
      addField(
        "제목",
        draft.title,
        update((value) => {
          draft.title = value;
        }),
        2,
      );
      addField(
        "도입",
        draft.intro,
        update((value) => {
          draft.intro = value;
        }),
      );
      draft.sections.forEach((section, index) => {
        addField(
          `소제목 ${index + 1}`,
          section.heading,
          update((value) => {
            section.heading = value;
          }),
          2,
        );
        const bodyField = addField(
          `본문 ${index + 1}`,
          section.body,
          update((value) => {
            section.body = value;
          }),
          8,
        );
        addEvidence(
          bodyField,
          `본문 ${index + 1}의 원문 근거`,
          section.source_evidence,
          draft,
        );
      });
      addField(
        "결론",
        draft.conclusion,
        update((value) => {
          draft.conclusion = value;
        }),
      );
    }
    // --------------------------------------------------------
    // 9-3. 전체 원문 근거 목록
    // 기존 초안의 전체 근거도 계속 확인할 수 있습니다.
    // --------------------------------------------------------
    addEvidence(
      textEditor,
      "전체 원고의 원문 근거",
      draft.source_evidence,
      draft,
      "저장된 전체 원문 근거가 없습니다.",
    );
  }
  // ==========================================================
  // 9-4. 원문 URL 편집과 링크 첨부 여부
  // 새 URL을 입력해도 원문을 다시 수집하지 않습니다.
  // 출처의 정확성은 사용자가 확인하며 HTTP(S) 링크만 표시합니다.
  // ==========================================================
  function addSourceLink(draft) {
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
          ? "원문 링크를 첨부하도록 선택했습니다. 실제 플랫폼 업로드는 이후에 연결합니다."
          : "주소를 보관하지만 게시물 링크 첨부는 선택하지 않았습니다.";
      } catch {
        hint.textContent = "올바른 http:// 또는 https:// 기사 주소를 입력해주세요.";
      }
    }
    input.addEventListener("input", () => {
      draft.source_url = input.value.trim();
      markTextChanged(draft);
      refresh();
    });
    checkbox.addEventListener("change", () => {
      draft.include_source_link = checkbox.checked;
      markTextChanged(draft);
      refresh();
    });
    wrapper.append(heading, label, input, choice, hint, link);
    textEditor.append(wrapper);
    refresh();
  }

  // ==========================================================
  // 10. 생성 결과의 기본 구조 확인
  // 개별 생성과 일괄 생성에서 같은 함수를 사용합니다.
  // ==========================================================
  function validateTextDraft(platform, draft) {
    if (
      !["instagram", "threads", "blog"].includes(platform) ||
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
    if (
      typeof draft.title !== "string" ||
      typeof draft.intro !== "string" ||
      !Array.isArray(draft.sections) ||
      draft.sections.some(
        (section) =>
          !section ||
          typeof section.heading !== "string" ||
          typeof section.body !== "string",
      ) ||
      typeof draft.conclusion !== "string"
    ) {
      throw new Error("Blog 원고 형식이 올바르지 않습니다.");
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
  // ==========================================================
  // 12. Instagram / Threads / Blog 개별 생성 버튼 (이 순서로 표시)
  // ==========================================================
  const generationTools = document.createElement("div");
  generationTools.className = "text-generate-tools";
  const generationStatus = document.createElement("p");
  generationStatus.className = "notice";
  generationStatus.setAttribute("role", "status");
  generationStatus.setAttribute("aria-live", "polite");
  generationStatus.style.whiteSpace = "pre-wrap";
  const generationButtons = [];
  for (const platform of ["instagram", "threads", "blog"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = "generate-" + platform + "-text";
    button.textContent = `${names[platform]} 원고 생성`;
    button.onclick = () => generate(platform);
    generationButtons.push(button);
    generationTools.append(button);
  }
  generationTools.append(generationStatus);
  // 카드뉴스 선택 상자가 숨겨져도 텍스트 생성 버튼은 계속 표시합니다.
  const cardOptions = get("card-news-options");
  (cardOptions || instagramButton.parentElement).after(generationTools);
  // 카드 선택 항목은 플랫폼 영역에 두고, 카드 생성 버튼만 원고 버튼 뒤로 옮깁니다.
  generationTools.after(instagramButton.parentElement);
  // ==========================================================
  // 13. 개별 원고 생성
  // 입력을 시작 시점에 복사하고, 완료 후 UI 잠금을 복원합니다.
  // ==========================================================
  async function generate(platform) {
    if (busy) return;
    if (
      instagramButton.disabled ||
      get("import-article")?.disabled ||
      get("suggest-keywords")?.disabled ||
      get("generate-selected")?.disabled
    ) {
      generationStatus.textContent =
        "현재 진행 중인 요청이 끝난 뒤 실행해주세요.";
      return;
    }
    const request = structuredClone(window.NewsInput.getRequest());
    if (!request.platforms.includes(platform)) {
      generationStatus.textContent = `왼쪽 플랫폼 선택에서 ${names[platform]}를 체크해주세요.`;
      return;
    }
    if (!request.article.title || !request.article.content) {
      generationStatus.textContent = "기사 제목과 원문을 먼저 입력해주세요.";
      return;
    }
    if (!request.selected_keywords.length) {
      generationStatus.textContent = "키워드를 선택하거나 직접 입력해주세요.";
      return;
    }
    const generationInput = {
      article: request.article,
      selected_keywords: request.selected_keywords,
      requirements: request.requirements,
    };
    const expectedRevision = revision;
    const fields = [
      ...document.querySelectorAll(
        "#article-url, #import-article, #include-card-news, " +
        "#article-title, #article-content, #custom-keywords, " +
          "#article-requirements, #suggest-keywords, " +
          "#keyword-candidates input, .platform input, " +
          "#generate-instagram, #generate-selected, #load-local-draft, #save, #load",
      ),
      ...generationButtons,
    ];
    const previousDisabled = fields.map((field) => field.disabled);
    const surfaces = [center, right, photoTools].filter(Boolean);
    const previousInert = surfaces.map((element) => element.inert);
    busy = true;
    fields.forEach((field) => {
      field.disabled = true;
    });
    surfaces.forEach((element) => {
      element.inert = true;
    });
    generationStatus.textContent = `${names[platform]} 원고를 생성하고 있습니다…`;
    try {
      // 서버 요청과 오류 처리는 api.js에 위임합니다.
      const result = await window.NewsApi.generateDraft(
        platform,
        generationInput,
        {
          jsonError: "서버 응답을 읽지 못했습니다.",
          errorMessage: "생성에 실패했습니다.",
        },
      );
      applyDraft(platform, result.draft, generationInput, expectedRevision);
      state.platforms = request.platforms;
      // 검수 UI와 연결된 공개 화면 전환 함수를 사용합니다.
      window.TextEditor.showPlatform(platform);
      generationStatus.textContent =
        `${names[platform]} 생성 완료\n` +
        "가운데 입력칸에서 수정할 수 있습니다.\n" +
        "다시 생성하면 해당 플랫폼의 기존 원고가 교체됩니다.";
    } catch (error) {
      generationStatus.textContent = `생성 실패: ${error.message}`;
    } finally {
      fields.forEach((field, index) => {
        field.disabled = previousDisabled[index];
      });
      surfaces.forEach((element, index) => {
        element.inert = previousInert[index];
      });
      busy = false;
    }
  }
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
