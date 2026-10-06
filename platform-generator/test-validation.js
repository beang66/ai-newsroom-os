async function main() {
  console.log("사실관계와 요구사항 검수 중입니다…");

  const response = await fetch(
    "http://localhost:3001/api/validate",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        platform: "threads",

        article: {
          title: "한빛도서관, 주말 운영 시간 확대",

          content:
            "한빛도서관은 다음 달부터 주말 운영 시간을 늘린다. " +
            "폐관 시간은 오후 6시에서 오후 8시로 변경된다. " +
            "연장 운영 대상은 종합자료실과 열람실이다. " +
            "어린이자료실은 기존 운영 시간을 유지한다.",
        },

        selected_keywords: [
          "주말 운영 시간 확대",
          "어린이자료실",
        ],

        requirements:
          "어린이자료실은 연장 운영 대상이 아니라는 점을 반드시 포함해주세요.",

        draft: {
          opening: "한빛도서관의 주말 운영 시간이 늘어납니다.",

          paragraphs: [
            "다음 달부터 종합자료실과 열람실을 오후 10시까지 이용할 수 있습니다.",
          ],

          closing: "주말 도서관 이용 시간을 확인해보세요.",

          source_evidence: [
            "폐관 시간은 오후 6시에서 오후 8시로 변경된다.",
          ],
        },
      }),
    }
  );

  const result = await response.json();

  console.log(JSON.stringify(result, null, 2));

  if (!response.ok || !result.success) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("검수 요청 실패:", error.message);
  process.exitCode = 1;
});