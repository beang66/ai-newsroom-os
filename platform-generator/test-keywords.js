async function test() {
  console.log("키워드 후보 생성 요청 중...");

  const response = await fetch(
    "http://localhost:3001/api/article/keywords",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        article: {
          title: "한빛도서관, 다음 달부터 주말 운영 시간 확대",
          content:
            "한빛도서관은 다음 달부터 주말 운영 시간을 두 시간 늘린다. " +
            "기존 오후 6시였던 주말 폐관 시간을 오후 8시로 변경한다. " +
            "도서관은 직장인과 학생들의 이용 편의를 높이기 위해 " +
            "이용자 의견을 반영했다고 밝혔다. " +
            "평일 운영 시간은 기존과 동일하게 유지된다.",
        },
      }),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "요청에 실패했습니다.");
  }

  console.log(JSON.stringify(result, null, 2));
}

test().catch((error) => {
  console.error("테스트 실패:", error.message);
  process.exitCode = 1;
});