import {
  Article,
  OutlineNode,
  VerificationIssue,
  SourceDocument,
  InterviewRecording,
  MediaAsset,
  ArchiveFile
} from '../types';

export const INITIAL_ARTICLE: Article = {
  id: 'art-2026-0927',
  title: "[단독] 100조 전력망 확충 지연... 신재생 42.8% 급증 속 '송전 병목' 비상",
  subtitle: "동해안·호남권 발전 제약률 30% 육박... 송전망특별법 국회 표류에 첨단 반도체 클러스터 공급 차질 우려",
  category: '탐사보도',
  byline: '탐사기획팀 김지훈 기자 (press.jh@desk.news)',
  content: `동해안과 호남 일대에서 생산된 친환경 전력이 수도권으로 흐르지 못해 강제로 발전 설비를 멈추는 '송전 병목 현상'이 임계점에 달했다. 국가 미래 먹거리인 반도체와 인공지능(AI) 데이터센터 가동을 위해 전력망 대수술이 시급하지만, 천문학적 예산과 지자체 갈등에 막혀 골든타임을 허비하고 있다는 지적이다.

산업통상자원부 비공개 보고서에 따르면 국내 재생에너지 전환율이 전년 대비 42.8% 급증했다. 그러나 국가 송전망 건설은 표준 공기 대비 평균 5년 이상 지연되고 있다. 당장 동해안권 대규모 발전소들의 송전 제약률은 30%를 웃돌며 수천억 원대 발전 손실이 누적되는 실정이다.

취재팀이 입수한 녹취록에서 한국전력 송전망계획처 조진우 처장은 "올해 3분기 내 상용화가 100% 확실하다"고 공언했다. 그러나 실무 부서 안팎에서는 인허가 지연과 주민 보상 난항으로 인해 연내 착공조차 불투명하다는 반론이 쏟아져 나온다.

왠일인지 관련 송전망 확충 특별법은 국회 상임위 문턱을 넘지 못한 채 1년 넘게 계류 중이다. 신규 설비의 개발 밎 보급 사업이 멈춰 서며 어의없는 전력 낭비가 매일 수억 원씩 발생하고 있다. 정치권의 정쟁 속에 100조 원 규모의 국가 핵심 인프라 구축이 표류하고 있다는 비판을 피하기 어렵다.

전문가들은 송전망 포화 문제를 방치할 경우 경기 용인 반도체 메가 클러스터의 전력 수급 계획에도 치명타가 불가피하다고 경고한다. 전력망 건설 권한을 한전에만 일임할 것이 아니라 범정부 인허가 특례와 민간 투자 유치 등 전향적인 제도 개선이 뒤따라야 한다는 목소리가 높다.`,
  version: 1,
  lastSavedAt: '2026-09-27 17:15:20',
  lastSavedTimestamp: Date.now() - 1000 * 20, // 20 seconds ago initially
  lastReviewedAt: '2026-09-27 17:15:20',
  lastReviewedVersion: 1,
  isEditedSinceReview: false,
  featuredImage: {
    assetId: 'media-001',
    url: '', // Handled by styled editorial fallback SVG
    caption: '동해안 일대 500kV 초고압 직류송전(HVDC) 변환소 건설 현장 전경. 송전선로 준공이 지연되면서 준공 일정이 계속 미뤄지고 있다.',
    credit: '한국전력공사 제공 (자료사진)',
    aspectRatio: '16:9',
  },
  suggestedTitles: [
    {
      id: 'st-1',
      title: "동해안 전력 길 막혔다... 신재생 급증에도 '송전 제약률 30%' 쇼크",
      style: '독자 클릭 및 포털 헤드라인용 (직관적 충격 제시)',
      applied: false,
    },
    {
      id: 'st-2',
      title: "[심층] 100조 전력망 5년째 지연... 반도체 클러스터 '블랙아웃' 경고음",
      style: '산업·경제 섹션 탑용 (정책 위기 분석 중심)',
      applied: false,
    },
  ],
  suggestedExcerpts: [
    {
      id: 'se-1',
      text: "수도권으로 가야 할 전력이 동해안과 호남에서 갇혔습니다. 재생에너지는 급증했지만 송전망 건설은 5년 이상 지연되면서, 용인 반도체 클러스터 가동마저 위협받고 있습니다. 국회에 묶인 전력망특별법의 실태를 추적했습니다.",
      style: '포털 메인 기사 요약 및 모바일 알림 푸시용',
      applied: false,
    },
  ],
  newsletterCopy: `[데스크 뉴스레터 브리핑 #142]
구독자 여러분, 오늘 아침 전해드리는 단독 취재는 우리 산업의 핏줄인 '전력망' 이야기입니다.

지방에서 아무리 전기를 깨끗하게 만들어도, 전기가 지나는 '고속도로'인 송전선로가 꽉 막혀있다면 어떻게 될까요? 동해안의 최신 발전소들은 전기를 만들지 못해 강제로 멈춰 서고 있고, 손실액만 수천억 원에 달합니다.

더 심각한 것은 앞으로 막대한 전력이 필요한 용인 반도체 메가 클러스터입니다. 왜 100조 원짜리 국가 프로젝트가 국회 문턱에서 1년째 멈춰 서 있는지 5분 요약으로 짚어드립니다.`,
  newsletterLastSyncedVersion: 1,
  snsCopy: `[단독] 신재생 전기 만들어도 보낼 길이 없다?
⚡️ 동해안·호남 송전 제약률 30% 육박
⚡️ 송전망 건설 표준 공기 대비 5년 이상 지연
⚡️ 100조 전력망특별법은 국회 상임위 계류 중

"올해 3분기 착공 확실하다"던 한전...
취재팀이 입수한 녹취록과 내부 실무 문건을 비교 분석했습니다.
스레드로 이어집니다 👇 (1/4)`,
  snsLastSyncedVersion: 1,
};

export const INITIAL_OUTLINE_NODES: OutlineNode[] = [
  {
    id: 'out-0',
    paragraphIndex: 0,
    role: 'Lead',
    roleLabel: '도입부: 사안의 중대성 제시',
    summary: "동해안·호남 송전 병목 현상 임계점 도달 및 반도체·AI 골든타임 경고",
    snippet: "동해안과 호남 일대에서 생산된 친환경 전력이 수도권으로 흐르지 못해...",
  },
  {
    id: 'out-1',
    paragraphIndex: 1,
    role: 'Fact',
    roleLabel: '핵심 사실: 데이터 및 피해 현황',
    summary: "재생에너지 전환율 급증 대비 송전망 5년 지연과 누적 발전 손실",
    snippet: "산업통상자원부 비공개 보고서에 따르면 국내 재생에너지 전환율이...",
    suggestion: "기사 내 '42.8%' 수치의 근거 자료 출처를 명확히 밝히면 사실성이 한층 강화됩니다.",
  },
  {
    id: 'out-2',
    paragraphIndex: 2,
    role: 'Quote',
    roleLabel: '취재원 인용: 한전 관계자 발언 및 반론',
    summary: "한전 계획처장 3분기 상용화 발언과 실무 부서의 인허가 난항 반론",
    snippet: "취재팀이 입수한 녹취록에서 한국전력 송전망계획처 조진우 처장은...",
    suggestion: "인터뷰 녹취 음성의 원본 어조와 기사 내 직접 인용문의 뉘앙스가 일치하는지 확인이 필요합니다.",
  },
  {
    id: 'out-3',
    paragraphIndex: 3,
    role: 'Background',
    roleLabel: '배경 및 쟁점: 특별법 입법 표류 상황',
    summary: "국회 상임위 계류 배경과 정쟁 속 100조 국가 인프라 표류 지적",
    snippet: "왠일인지 관련 송전망 확충 특별법은 국회 상임위 문턱을 넘지 못한 채...",
    suggestion: "맞춤법 수정과 함께 입법 지연의 구체적 원인(지중화 비용 분담 등)을 짧게 보강하세요.",
  },
  {
    id: 'out-4',
    paragraphIndex: 4,
    role: 'Analysis',
    roleLabel: '전망 및 제언: 반도체 클러스터 파급효과',
    summary: "용인 반도체 메가 클러스터 차질 경고 및 전향적 제도 개선 촉구",
    snippet: "전문가들은 송전망 포화 문제를 방치할 경우 경기 용인 반도체...",
  },
];

export const INITIAL_VERIFICATION_ISSUES: VerificationIssue[] = [
  {
    id: 'iss-001',
    paragraphIndex: 1,
    sentenceIndex: 0,
    sentenceText: "산업통상자원부 비공개 보고서에 따르면 국내 재생에너지 전환율이 전년 대비 42.8% 급증했다.",
    category: '수치·날짜·고유명사',
    severity: 'critical',
    status: 'unconfirmed',
    reason: "정부 공식 통계연보 및 공공 데이터베이스 상의 최근 연간 재생에너지 발전량 증가율(18.2%)과 현저한 차이가 있으며, 인용된 '비공개 보고서'의 산출 기준이 확인되지 않음.",
    evidenceState: 'no_evidence_in_sources',
    evidenceNote: "현재 연결된 3건의 보도자료 및 공공 보고서 자료에서 '42.8% 급증'에 부합하는 수치가 확인되지 않음.",
  },
  {
    id: 'iss-002',
    paragraphIndex: 2,
    sentenceIndex: 0,
    sentenceText: "취재팀이 입수한 녹취록에서 한국전력 송전망계획처 조진우 처장은 \"올해 3분기 내 상용화가 100% 확실하다\"고 공언했다.",
    category: '인용·출처 부족',
    severity: 'critical',
    status: 'unconfirmed',
    reason: "보유 인터뷰 원음 전사본(02:45) 대조 결과, 조 처장의 실제 발언은 '3분기 상용화는 정책적 목표일 뿐 시점은 가변적'이었습니다. '100% 확실'이라는 단정적 어조는 실제 발언과 상충합니다.",
    evidenceState: 'contradiction',
    evidenceNote: "인터뷰 전사본[02:45]과 본문 인용문 간 불일치 감지됨.",
    interviewQuoteRef: {
      interviewId: 'rec-001',
      interviewee: '조진우 (한국전력공사 송변전계획처장)',
      timestampSec: 165,
      originalTranscript: "3분기 상용화는 정책적 목표일 뿐, 지자체 인허가와 주민 협의 문제로 시점은 여전히 가변적입니다.",
    },
  },
  {
    id: 'iss-003',
    paragraphIndex: 3,
    sentenceIndex: 0,
    sentenceText: "왠일인지 관련 송전망 확충 특별법은 국회 상임위 문턱을 넘지 못한 채 1년 넘게 계류 중이다.",
    category: '맞춤법',
    severity: 'review',
    status: 'unconfirmed',
    reason: "'왠일인지'는 잘못된 표기입니다. '어찌 된 일인지'라는 의미를 나타내는 관형사는 '웬'이므로 '웬일인지'가 올바릅니다.",
    evidenceState: 'linked',
    evidenceNote: "국립국어원 표준국어대사전 규정 준수 필요.",
    spellingCorrection: {
      before: '왠일인지',
      after: '웬일인지',
      explanation: "'왠'은 '왜인지'의 준말인 '왠지'에만 쓰이며, 그 외 모든 수식어구에는 '웬'을 씁니다.",
    },
  },
  {
    id: 'iss-004',
    paragraphIndex: 3,
    sentenceIndex: 1,
    sentenceText: "신규 설비의 개발 밎 보급 사업이 멈춰 서며 어의없는 전력 낭비가 매일 수억 원씩 발생하고 있다.",
    category: '맞춤법',
    severity: 'review',
    status: 'unconfirmed',
    reason: "'개발 밎 보급'의 '밎'은 오타이며, '어의없는'은 '어이없는'의 잘못된 표기입니다.",
    evidenceState: 'linked',
    evidenceNote: "자판 오타 및 발음 오기 교정 권고.",
    spellingCorrection: {
      before: '개발 밎 보급 사업이 멈춰 서며 어의없는',
      after: '개발 및 보급 사업이 멈춰 서며 어이없는',
      explanation: "접속 조사 '및' 교정 / '어이없다(일이 뜻밖이어서 기가 막히다)' 표준 표기 준수",
    },
  },
  {
    id: 'iss-005',
    paragraphIndex: 3,
    sentenceIndex: 2,
    sentenceText: "정치권의 정쟁 속에 100조 원 규모의 국가 핵심 인프라 구축이 표류하고 있다는 비판을 피하기 어렵다.",
    category: '논리 비약·반론 누락',
    severity: 'suggestion',
    status: 'unconfirmed',
    reason: "송전망 특별법의 쟁점(예: 송전선로 지중화 비용 국가 지원 비율, 지자체 인허가권 제한 여부)에 대한 여야 간 견해차가 서술되지 않고 단순 '정쟁'으로만 규정되어 반론권 및 객관성이 부족할 수 있음.",
    evidenceState: 'unverified',
    evidenceNote: "국회 산자위 회의록 검색을 통해 쟁점 조항 한 줄 추가 권장.",
  },
];

export const INITIAL_SOURCES: SourceDocument[] = [
  {
    id: 'src-001',
    title: '제10차 장기 송변전설비계획(2022~2036) 확정안',
    publisher: '산업통상자원부 전력정책과',
    publishDate: '2023.05.08',
    snippet: "동해안 및 서해안 발전 제약 완화를 위해 500kV HVDC 초고압 직류송전선로 건설을 추진하나, 일부 지자체 경유 구간의 주민 반발로 표준 공기(78개월) 대비 평균 5년 이상 지연 발생.",
    fullText: `제10차 장기 송변전설비계획(2022~2036)
산업통상자원부 공고 제2023-389호

1. 추진 배경 및 총괄 현황
첨단산업 특화단지 조성 및 무탄소 전원 확대에 따라 2036년까지 송변전 설비투자에 총 56조 5천억 원 소요 전망.
다만, 신규 송전선로 입지 선정 과정에서의 민원 증가로 송전선로 평균 건설 소요 기간이 2010년 68개월에서 2023년 현재 124개월로 5년 이상 장기화되고 있음.

2. 주요 권역별 송전 제약 현황
동해안 권역 대규모 석탄·원전 발전량은 14GW에 달하나 수송 가능 용량은 10GW에 불과하여 발전 제약률이 상시 28.5%~31.2% 수준에 이름.`,
    originalUrl: 'https://motie.go.kr/policy/transmission_plan_10th.pdf',
    isLinkedToArticle: true,
    isAiSummary: false,
    tags: ['정부보고서', '공식문서', '송전망'],
  },
  {
    id: 'src-002',
    title: '2024년 신재생에너지 보급실적 및 통계연보',
    publisher: '한국에너지공단 신재생에너지센터',
    publishDate: '2024.08.15',
    snippet: "2023년 말 기준 국내 재생에너지 연간 발전량은 총 58,114GWh로 집계되었으며 전년 대비 발전 비중은 8.9%에서 9.6%로 18.2% 증가함. (일부 사설연구소의 40%대 추정치는 단순 설비등록 기준 착오)",
    fullText: `2024 신재생에너지 보급실적 통계연보
발행: 한국에너지공단 신재생에너지정책실

주요 통계 지표 발췌:
1. 연간 총 발전량 추이:
- 2022년: 49,152 GWh (비중 8.4%)
- 2023년: 58,114 GWh (비중 9.6%)
- 전년 대비 실질 발전량 증가율: 18.23% (전환율 지표 기준)

※ 통계 해석 주의사항:
최근 학계 및 산업계 일부에서 인용되는 '40% 초과 급증' 수치는 미착공 인허가 신청 용량을 포함한 가상 시나리오 수치로서, 국가 공식 계통 연계 실적과는 차이가 있음.`,
    originalUrl: 'https://knrec.or.kr/statistics/annual_2024.pdf',
    isLinkedToArticle: false,
    isAiSummary: false,
    tags: ['공식통계', '팩트체크', '재생에너지'],
  },
  {
    id: 'src-003',
    title: '국가기간 전력망 확충 특별법안 심사보고서',
    publisher: '국회 산업통상자원중소벤처기업위원회',
    publishDate: '2024.02.21',
    snippet: "국가기간 전력망 특별법 제정안에 대한 주요 쟁점으로 송전선로 지중화 비용의 국가 재정부담 비율(한전 100% vs 정부 50% 분담) 및 입지선정위원회의 지자체 권한 축소 우려가 집중 논의됨.",
    fullText: `국회 산자중기위 법안심사 소위원회 심사 결과 보고서
의안번호 2125890호

법안 주요 골자:
1. 국가 전력망 확충위원회를 국무총리 산하에 설치하여 입지 선정 및 인허가 절차를 통합 심의
2. 주민 보상 및 지역 지원 사업의 법적 지원 근거 신설

주요 이견 사항:
- 여당 안: 지자체 인허가 간주 조항 도입을 통해 공기 단축 우선 추진
- 야당 안: 경유 지자체 주민 수용성 보장 및 전력기금 지중화 지원 한도 명시 요구
=> 현재 여야 간 비용 분담 비율 및 간주 규정 독소조항 삭제 여부를 두고 합의 미도출로 계류 상태 지속.`,
    originalUrl: 'https://likms.assembly.go.kr/bill/billDetail.do?billId=2125890',
    isLinkedToArticle: false,
    isAiSummary: false,
    tags: ['국회회의록', '입법현황', '특별법'],
  },
];

export const INITIAL_INTERVIEW: InterviewRecording = {
  id: 'rec-001',
  title: '한국전력 조진우 송변전계획처장 심층 인터뷰 녹취',
  interviewee: '조진우',
  intervieweeRole: '한국전력공사 송변전계획처장',
  date: '2026-09-22 14:30',
  durationSec: 215, // 3분 35초
  status: 'ready',
  originalTranscript: [
    {
      id: 't-1',
      timeSec: 15,
      speaker: '김지훈 기자',
      text: "처장님, 동해안권 500kV HVDC 1단계 구간의 준공 시점이 계속 미뤄지고 있는데요. 현재 공정률과 상용화 목표가 어떻게 됩니까?",
    },
    {
      id: 't-2',
      timeSec: 52,
      speaker: '조진우 처장',
      text: "네, 변환소 토목 공사는 거의 마무리 단계입니다. 선로 철탑 부지 협의가 일부 강원도 군 단위 구간에서 난항을 겪고 있습니다만, 인허가 보완 절차를 서두르고 있습니다.",
    },
    {
      id: 't-3',
      timeSec: 110,
      speaker: '김지훈 기자',
      text: "일각에서는 올해 3분기 상용화가 확정적이라는 소문도 도는데, 연내 송전이 물리적으로 가능한 것인가요?",
    },
    {
      id: 't-4',
      timeSec: 165,
      speaker: '조진우 처장',
      text: "3분기 상용화는 정책적 목표일 뿐, 지자체 인허가와 주민 협의 문제로 시점은 여전히 가변적입니다. 현장 여건상 무리하게 일정을 못 박을 수는 없는 상황입니다.",
      hasDiscrepancy: true,
    },
    {
      id: 't-5',
      timeSec: 195,
      speaker: '김지훈 기자',
      text: "만약 올해를 넘기면 발전 제약에 따른 한전의 정산금 부담은 얼마나 불어나나요?",
    },
  ],
  editedTranscript: [
    {
      id: 't-1',
      timeSec: 15,
      speaker: '김지훈 기자',
      text: "처장님, 동해안권 500kV HVDC 1단계 구간의 준공 시점이 계속 미뤄지고 있는데요. 현재 공정률과 상용화 목표가 어떻게 됩니까?",
    },
    {
      id: 't-2',
      timeSec: 52,
      speaker: '조진우 처장',
      text: "네, 변환소 토목 공사는 거의 마무리 단계입니다. 선로 철탑 부지 협의가 일부 강원도 군 단위 구간에서 난항을 겪고 있습니다만, 인허가 보완 절차를 서두르고 있습니다.",
    },
    {
      id: 't-3',
      timeSec: 110,
      speaker: '김지훈 기자',
      text: "일각에서는 올해 3분기 상용화가 확정적이라는 소문도 도는데, 연내 송전이 물리적으로 가능한 것인가요?",
    },
    {
      id: 't-4',
      timeSec: 165,
      speaker: '조진우 처장',
      text: "3분기 상용화는 정책적 목표일 뿐, 지자체 인허가와 주민 협의 문제로 시점은 여전히 가변적입니다. 현장 여건상 무리하게 일정을 못 박을 수는 없는 상황입니다.",
      hasDiscrepancy: true,
    },
    {
      id: 't-5',
      timeSec: 195,
      speaker: '김지훈 기자',
      text: "만약 올해를 넘기면 발전 제약에 따른 한전의 정산금 부담은 얼마나 불어나나요?",
    },
  ],
  linkedIssueId: 'iss-002',
};

export const INITIAL_MEDIA_ASSETS: MediaAsset[] = [
  {
    id: 'media-001',
    title: '동해안 HVDC 변환소 건설현장 메인 조감 및 선로',
    type: 'original',
    url: '',
    caption: '동해안 일대 500kV 초고압 직류송전(HVDC) 변환소 건설 현장 전경. 송전선로 준공이 지연되면서 상용 운전 일정이 표류하고 있다.',
    credit: '한국전력공사 제공',
    aspectRatio: '16:9',
    dimensions: '2560 × 1440',
    fileSize: '4.8 MB',
    tags: ['대표이미지', '원문자료', 'HVDC'],
  },
  {
    id: 'media-002',
    title: '동해안 HVDC 변환소 (모바일/SNS 1:1 정방형 크롭본)',
    type: 'derivative',
    originalMediaId: 'media-001',
    url: '',
    caption: '[SNS용 요약본] 동해안 HVDC 변환설비 핵심 타워 클로즈업',
    credit: '한국전력공사 (편집: 데스크 뉴스룸)',
    aspectRatio: '1:1',
    dimensions: '1080 × 1080',
    fileSize: '1.2 MB',
    tags: ['파생본', 'SNS규격', '1:1크롭'],
  },
  {
    id: 'media-003',
    title: '제10차 장기송변전계획 계통지도 인포그래픽',
    type: 'original',
    url: '',
    caption: '2036년 전국 융합 송전선로 확충 계획도',
    credit: '산업통상자원부',
    aspectRatio: '4:3',
    dimensions: '1600 × 1200',
    fileSize: '2.1 MB',
    tags: ['인포그래픽', '계통지도'],
  },
];

export const INITIAL_ARCHIVE_FILES: ArchiveFile[] = [
  {
    id: 'arch-001',
    filename: '20260927_전력망확충지연_초고_v1.0.txt',
    category: 'Draft',
    fileType: 'TXT',
    size: '8.4 KB',
    createdAt: '2026-09-27 17:15',
    isDerivative: false,
    statusText: '작성 원고 원본 (로컬 저장됨)',
    canExport: true,
  },
  {
    id: 'arch-002',
    filename: '한전_조진우처장_인터뷰_20260922_전사본.json',
    category: 'Interview',
    fileType: 'JSON',
    size: '14.2 KB',
    createdAt: '2026-09-22 15:40',
    isDerivative: false,
    statusText: '원음 연동 전사 데이터',
    canExport: true,
  },
  {
    id: 'arch-003',
    filename: '제10차_장기송변전계획_산자부보고서.pdf',
    category: 'Source',
    fileType: 'PDF',
    size: '3.6 MB',
    createdAt: '2026-09-24 10:12',
    isDerivative: false,
    statusText: '취재 근거 문서 (기사 인용 완료)',
    canExport: false,
  },
  {
    id: 'arch-004',
    filename: 'HVDC_변환소현장_대표스틸_16x9.webp',
    category: 'Media',
    fileType: 'WEBP',
    size: '1.8 MB',
    createdAt: '2026-09-26 11:05',
    isDerivative: false,
    statusText: '발행 대표 이미지 (원본)',
    canExport: true,
  },
  {
    id: 'arch-005',
    filename: 'HVDC_변환소_SNS카드뉴스용_1x1.webp',
    category: 'Media',
    fileType: 'WEBP',
    size: '720 KB',
    createdAt: '2026-09-27 16:30',
    isDerivative: true,
    statusText: '파생본 (1:1 모바일 크롭 규격)',
    canExport: true,
  },
  {
    id: 'arch-006',
    filename: '뉴스레터_소개문_예시규칙변환본_v1.txt',
    category: 'Published',
    fileType: 'TXT',
    size: '2.1 KB',
    createdAt: '2026-09-27 17:00',
    isDerivative: true,
    statusText: '내보낸 결과물 · 발행 여부 미확인',
    canExport: true,
  },
  {
    id: 'arch-007',
    filename: 'SNS_스레드요약본_규칙변환본_v1.txt',
    category: 'Published',
    fileType: 'TXT',
    size: '1.4 KB',
    createdAt: '2026-09-27 17:02',
    isDerivative: true,
    statusText: '내보낸 결과물 · 발행 여부 미확인',
    canExport: true,
  },
];
