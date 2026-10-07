async function main() {
  const input = {
    article: {
      article_id: "test_library_01",

      title: "한빛도서관, 다음 달부터 주말 운영 시간 확대",

      content:
        "한빛도서관은 다음 달부터 주말 운영 시간을 두 시간 늘린다. " +
        "기존 오후 6시였던 폐관 시간은 오후 8시로 변경된다. " +
        "평일 운영 시간은 기존과 동일하게 유지된다. " +
        "도서관은 주말 이용자의 독서와 학습 시간을 확보하기 위해 " +
        "운영 시간을 확대한다고 설명했다. " +
        "연장 운영 대상은 종합자료실과 열람실이다. " +
        "어린이자료실은 기존 운영 시간을 유지한다.",
    },

    selected_keywords: [
      "주말 운영 시간 확대",
      "오후 8시 폐관",
      "종합자료실과 열람실",
    ],

    requirements:
      "운영 시간이 어떻게 바뀌는지 쉽게 설명해주세요. " +
      "어린이자료실은 적용 대상이 아니라는 점을 포함해주세요.",
  };

  for (const platform of ["threads", "blog"]) {
    console.log(`\n${platform} 생성 중입니다…`);

    try {
      const response = await fetch(
        `http://localhost:3001/api/generate/${platform}`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify(input),
        }
      );

      const result = await response.json();

      console.log(JSON.stringify(result, null, 2));

      if (!response.ok || !result.success) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(`${platform} 요청 실패:`, error.message);
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error("실행 실패:", error.message);
  process.exitCode = 1;
});