(() => {
  const panel = document.querySelector(".left .panel");

  if (!panel) {
    console.error("왼쪽 설정 패널을 찾지 못했습니다.");
    return;
  }

  const section = document.createElement("section");

  section.innerHTML = `
    <div style="margin-top:24px; border-top:1px solid #ddd; padding-top:20px;">
      <h2>기사 원문</h2>

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

      <button id="suggest-keywords" type="button">
        AI 키워드 후보 제안
      </button>

      <p id="keyword-status" role="status" aria-live="polite"></p>

      <div id="keyword-candidates"></div>

      <label for="custom-keywords">
        직접 추가할 키워드
      </label>
      <input
        id="custom-keywords"
        type="text"
        placeholder="쉼표로 구분: 반도체, 인공지능"
      >

      <p id="keyword-selection"></p>

      <label for="article-requirements">
        제작 요구사항
      </label>
      <textarea
        id="article-requirements"
        rows="4"
        maxlength="3000"
        placeholder="예: 인스타 4장, 쉬운 문체, 과장 없이 작성"
      ></textarea>
    </div>
  `;

  // 플랫폼 선택 아래, 사진 도구 위에 배치합니다.
  const photoTools = panel.querySelector(".photo-tools");
  panel.insertBefore(section, photoTools);

  const style = document.createElement("style");

  style.textContent = `
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

  const $ = (id) => document.getElementById(id);
  const selected = new Set();

  function getKeywords() {
    const custom = $("custom-keywords").value
      .split(/[,，\n]/)
      .map((value) => value.trim())
      .filter(Boolean);

    return [...new Set([...selected, ...custom])];
  }

  function updateSelection() {
    const keywords = getKeywords();

    $("keyword-selection").textContent = keywords.length
      ? "선택한 키워드: " + keywords.join(", ")
      : "후보를 선택하거나 키워드를 직접 입력해주세요.";
  }

  // 다음 단계의 플랫폼 생성 기능이 이 데이터를 사용합니다.
  window.NewsInput = {
    getRequest() {
      return {
        article: {
          article_id: "article_01",
          title: $("article-title").value.trim(),
          content: $("article-content").value.trim(),
        },

        selected_keywords: getKeywords(),

        requirements:
          $("article-requirements").value.trim(),

        platforms: [
          ...document.querySelectorAll(
            ".platform input:checked"
          ),
        ].map((input) => input.value),
      };
    },
  };

  $("custom-keywords").addEventListener(
    "input",
    updateSelection
  );

  // 원문을 바꾸면 이전 원문에서 제안된 후보는 지웁니다.
  function clearCandidates() {
    selected.clear();
    $("keyword-candidates").replaceChildren();
    $("keyword-status").textContent =
      "원문이 변경되었습니다. 후보를 다시 제안받아주세요.";
    updateSelection();
  }

  $("article-title").addEventListener(
    "input",
    clearCandidates
  );

  $("article-content").addEventListener(
    "input",
    clearCandidates
  );

  $("suggest-keywords").addEventListener(
    "click",
    async () => {
      const request = window.NewsInput.getRequest();

      if (
        !request.article.title ||
        !request.article.content
      ) {
        $("keyword-status").textContent =
          "기사 제목과 원문을 모두 입력해주세요.";
        return;
      }

      const button = $("suggest-keywords");
      const fields = [
        $("article-title"),
        $("article-content"),
      ];

      button.disabled = true;
      fields.forEach((field) => {
        field.disabled = true;
      });

      $("keyword-status").textContent =
        "기사에서 키워드 후보를 찾고 있습니다…";

      try {
        const response = await fetch(
          "/api/article/keywords",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              article: request.article,
            }),
          }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.error || "키워드 생성에 실패했습니다."
          );
        }

        selected.clear();
        $("keyword-candidates").replaceChildren();

        result.candidates.forEach((candidate) => {
          const label = document.createElement("label");
          label.className = "keyword-choice";

          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.disabled = !candidate.evidence_valid;

          const keyword = document.createElement("strong");
          keyword.textContent = candidate.keyword;

          const reason = document.createElement("small");
          reason.textContent = candidate.reason;

          const evidence = document.createElement("small");
          evidence.textContent =
            "원문 근거: " +
            candidate.source_evidence.join(" / ");

          if (!candidate.evidence_valid) {
            evidence.textContent +=
              " — 원문 근거 확인 필요";
          }

          checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
              selected.add(candidate.keyword);
            } else {
              selected.delete(candidate.keyword);
            }

            updateSelection();
          });

          label.append(
            checkbox,
            keyword,
            reason,
            evidence
          );

          $("keyword-candidates").appendChild(label);
        });

        updateSelection();

        $("keyword-status").textContent =
          "완료! 제작에 사용할 키워드를 직접 선택해주세요.";
      } catch (error) {
        $("keyword-status").textContent =
          "오류: " + error.message;
      } finally {
        button.disabled = false;

        fields.forEach((field) => {
          field.disabled = false;
        });
      }
    }
  );

  updateSelection();
})();