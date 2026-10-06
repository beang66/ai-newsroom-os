(() => {
  // 1. 기사 입력 UI를 추가할 왼쪽 패널 확인
  const panel = document.getElementById("platform-panel") || document.querySelector(".left .panel");

  if (!panel) {
    console.error("왼쪽 설정 패널을 찾지 못했습니다.");
    return;
  }

  // 2. 기사 제목·원문·키워드·요구사항 입력 UI 생성
  const section = document.createElement("section");

  section.innerHTML = `
    <div id="article-source-fields">
      <h2>기사 원문 불러오기</h2>
      <label for="article-url">기사 URL (선택)</label>
      <input id="article-url" type="url" maxlength="2048" placeholder="https://신문사주소/기사주소">
      <button id="import-article" type="button">기사 불러오기</button>
      <p id="article-import-status" class="notice" role="status" aria-live="polite">URL을 입력해 불러오거나 제목·원문을 직접 입력하세요.</p>

      <label for="article-title">기사 제목</label>
      <input
        id="article-title"
        type="text"
        maxlength="500"
        placeholder="기사 제목을 입력하세요"
      >

      <label for="article-content">기사 전체 원문</label>
      <textarea
        id="article-content"
        rows="7"
        maxlength="30000"
        placeholder="기사 본문을 그대로 붙여넣으세요"
      ></textarea>

    </div>
    <div id="article-generation-fields" style="margin-top:20px;">
      <h2>키워드와 제작 조건</h2>
      <button id="suggest-keywords" type="button">
        AI 키워드 후보 제안
      </button>

      <p id="keyword-status" role="status" aria-live="polite"></p>
      <div id="keyword-candidates"></div>

      <label for="custom-keywords">직접 추가할 키워드</label>
      <input
        id="custom-keywords"
        type="text"
        placeholder="쉼표로 구분: 반도체, 인공지능"
      >

      <p id="keyword-selection"></p>

      <label for="article-requirements">제작 요구사항</label>
      <textarea
        id="article-requirements"
        rows="4"
        maxlength="3000"
        placeholder="예: 인스타 4장, 쉬운 문체, 과장 없이 작성"
      ></textarea>
    </div>
  `;

  // 플랫폼 선택 아래, 사진 도구 위에 입력 UI 배치
  const photoTools = panel.querySelector(".photo-tools");
  panel.insertBefore(section, photoTools);
  // 원문 입력만 별도 패널로 분리하여 왼쪽 맨 위에 배치합니다.
  const sourcePanel = document.createElement("section");
  sourcePanel.className = "panel";
  sourcePanel.id = "article-source-panel";
  sourcePanel.append(section.querySelector("#article-source-fields"));
  document.querySelector(".left").prepend(sourcePanel);

  // 3. 기사 입력 UI 스타일 적용
  const style = document.createElement("style");

  style.textContent = `
    #article-url,
    #article-title,
    #article-content,
    #custom-keywords,
    #article-requirements {
      width: 100%;
      padding: 11px;
      border: 1px solid #c9c9c1;
      border-radius: 9px;
      font: inherit;
      line-height: 1.6;
      margin-bottom: 12px;
    }

    #article-content,
    #article-requirements {
      resize: vertical;
    }

    section label[for] {
      display: block;
      font-size: 13px;
      font-weight: 700;
      margin: 14px 0 7px;
    }

    #suggest-keywords {
      width: 100%;
      background: #262724;
      color: white;
    }

    #keyword-status,
    #keyword-selection {
      font-size: 12px;
      line-height: 1.7;
      overflow-wrap: anywhere;
    }

    .keyword-choice {
      display: block;
      padding: 11px;
      margin: 10px 0;
      border: 1px solid #ddd;
      border-radius: 10px;
      font-size: 13px;
      line-height: 1.6;
    }

    .keyword-choice input {
      margin-right: 7px;
    }

    .keyword-choice small {
      display: block;
      margin-top: 5px;
      color: #71776b;
    }

    .keyword-choice:has(input:checked) {
      background: #edf3e4;
      border-color: #82985f;
    }
  `;

  document.head.appendChild(style);

  // 이 파일 내부에서만 사용하는 요소 조회 함수와 선택 상태
  const $ = (id) => document.getElementById(id);
  const selected = new Set();

  // 4. 선택한 AI 후보와 직접 입력한 키워드 통합
  // 쉼표·전각 쉼표·줄바꿈으로 구분하고 빈 값과 중복 제거
  function getKeywords() {
    const custom = $("custom-keywords")
      .value.split(/[,，\n]/)
      .map((value) => value.trim())
      .filter(Boolean);

    return [...new Set([...selected, ...custom])];
  }

  // 5. 현재 선택한 키워드를 화면에 표시
  function updateSelection() {
    const keywords = getKeywords();

    $("keyword-selection").textContent = keywords.length
      ? "선택한 키워드: " + keywords.join(", ")
      : "후보를 선택하거나 키워드를 직접 입력해주세요.";
  }

  // 6. 다른 UI 파일에서 사용할 입력 데이터 제공
  // 플랫폼 생성 버튼들은 NewsInput.getRequest()를 호출해
  // 기사·키워드·요구사항·선택 플랫폼을 가져옵니다.
  // 여기서는 서버 요청을 보내지 않습니다.
  window.NewsInput = {
    // 이전에 저장한 입력을 복원합니다. 후보 대신 키워드를 직접 입력칸에 표시합니다.
    restore(saved) {
      selected.clear();
      $("keyword-candidates").replaceChildren();
      $("article-url").value = saved?.article?.url || "";
      $("article-title").value = saved?.article?.title || "";
      $("article-content").value = saved?.article?.content || "";
      $("custom-keywords").value = Array.isArray(saved?.selected_keywords) ? saved.selected_keywords.join(", ") : "";
      $("article-requirements").value = saved?.requirements || "";
      $("keyword-status").textContent = "";
      updateSelection();
    },

    getRequest() {
      return {
        article: {
          article_id: "article_01",
          url: $("article-url").value.trim(),
          title: $("article-title").value.trim(),
          content: $("article-content").value.trim(),
        },

        include_card_news: $("include-card-news")?.checked === true,
        selected_keywords: getKeywords(),

        requirements: $("article-requirements").value.trim(),

        platforms: [
          ...document.querySelectorAll(".platform input:checked"),
        ].map((input) => input.value),
      };
    },
  };

  // 직접 입력한 키워드가 바뀌면 선택 목록 갱신
  $("custom-keywords").addEventListener("input", updateSelection);

  // 7. 기사 변경 시 이전 원문에서 생성한 AI 후보 초기화
  // 직접 입력한 키워드는 유지합니다.
  function clearCandidates() {
    selected.clear();
    $("keyword-candidates").replaceChildren();
    $("keyword-status").textContent =
      "원문이 변경되었습니다. 후보를 다시 제안받아주세요.";
    updateSelection();
  }

  $("article-title").addEventListener("input", clearCandidates);
  $("article-content").addEventListener("input", clearCandidates);

  // URL 원문 수집: 성공한 경우에만 제목·본문을 교체합니다.
  // 실패하면 기존 입력을 유지하여 직접 편집할 수 있습니다.
  $("import-article").addEventListener("click", async () => {
    const status = $("article-import-status");
    const url = $("article-url").value.trim();
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      status.textContent = "http:// 또는 https://로 시작하는 기사 주소를 입력해주세요.";
      return;
    }
    if ($("suggest-keywords").disabled || $("generate-instagram")?.disabled ||
        $("generate-selected")?.disabled ||
        [...document.querySelectorAll(".text-generate-tools button")].some((item) => item.disabled)) {
      status.textContent = "진행 중인 요청이 끝난 뒤 불러와주세요.";
      return;
    }
    if (($("article-title").value.trim() || $("article-content").value.trim()) &&
        !confirm("현재 기사 제목과 원문을 URL에서 불러온 내용으로 교체할까요?")) return;
    const fields = [...document.querySelectorAll(
      "#article-source-panel input, #article-source-panel textarea, #import-article, " +
      "#suggest-keywords, #generate-instagram, #generate-selected, .text-generate-tools button, #load, #save"
    )];
    const previous = fields.map((field) => field.disabled);
    fields.forEach((field) => { field.disabled = true; });
    status.textContent = "기사 페이지에서 제목과 본문을 불러오고 있습니다…";
    try {
      const result = await window.NewsApi.importArticle(url);
      $("article-url").value = result.article.url;
      $("article-title").value = result.article.title;
      $("article-content").value = result.article.content;
      clearCandidates();
      status.textContent = "불러오기 완료. 광고나 불필요한 문장이 섞였는지 원문을 확인하고 키워드를 제안받아주세요.";
    } catch (error) {
      status.textContent = "불러오기 실패: " + error.message;
    } finally {
      fields.forEach((field, index) => { field.disabled = previous[index]; });
    }
  });

  // 8. AI 키워드 후보 제안 버튼 처리
  $("suggest-keywords").addEventListener("click", async () => {
    const request = window.NewsInput.getRequest();

    // 제목과 원문이 있어야 키워드 요청 가능
    if (!request.article.title || !request.article.content) {
      $("keyword-status").textContent = "기사 제목과 원문을 모두 입력해주세요.";
      return;
    }

    const button = $("suggest-keywords");
    const fields = [$("article-title"), $("article-content"), $("article-url"), $("import-article")];
    const previousDisabled = fields.map((field) => field.disabled);

    // 요청 중 중복 클릭과 원문 변경 방지
    button.disabled = true;
    fields.forEach((field) => {
      field.disabled = true;
    });

    $("keyword-status").textContent = "기사에서 키워드 후보를 찾고 있습니다…";

    try {
      // 9. 서버 통신은 api.js에 위임
      // 요청 주소·JSON 변환·응답 오류 확인은
      // NewsApi.suggestKeywords() 내부에서 처리합니다.
      const result = await NewsApi.suggestKeywords(request.article);

      // 새 결과로 이전 AI 후보와 선택 상태 교체
      selected.clear();
      $("keyword-candidates").replaceChildren();

      // 10. 후보별 체크박스·제안 이유·원문 근거 표시
      // 서버 응답은 textContent로 표시합니다.
      result.candidates.forEach((candidate) => {
        const label = document.createElement("label");
        label.className = "keyword-choice";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";

        // 원문 근거가 확인되지 않은 후보는 선택 제한
        checkbox.disabled = !candidate.evidence_valid;

        const keyword = document.createElement("strong");
        keyword.textContent = candidate.keyword;

        const reason = document.createElement("small");
        reason.textContent = candidate.reason;

        const evidence = document.createElement("small");
        evidence.textContent =
          "원문 근거: " + candidate.source_evidence.join(" / ");

        if (!candidate.evidence_valid) {
          evidence.textContent += " — 원문 근거 확인 필요";
        }

        // 사용자가 체크한 후보만 생성용 키워드에 포함
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            selected.add(candidate.keyword);
          } else {
            selected.delete(candidate.keyword);
          }

          updateSelection();
        });

        label.append(checkbox, keyword, reason, evidence);

        $("keyword-candidates").appendChild(label);
      });

      updateSelection();

      $("keyword-status").textContent =
        "완료! 제작에 사용할 키워드를 직접 선택해주세요.";
    } catch (error) {
      // 11. 요청 또는 결과 처리 오류를 화면에 표시
      $("keyword-status").textContent = "오류: " + error.message;
    } finally {
      // 성공·실패와 관계없이 버튼과 입력란 다시 활성화
      button.disabled = false;

      fields.forEach((field, index) => {
        field.disabled = previousDisabled[index];
      });
    }
  });

  // 처음 화면을 열었을 때 키워드 선택 안내 표시
  updateSelection();
})();
