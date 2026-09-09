import Badge from './Badge'

export default function AccessManagement() {
  return (
    <section className="mx-auto max-w-5xl">
      <div className="border-b border-gray-200 pb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-gray-950">사용자·권한 관리</h1>
          <Badge tone="neutral">관리자 전용</Badge>
        </div>
        <p className="mt-2 text-sm leading-6 text-gray-600">Google 계정별 역할과 메뉴 접근 범위를 관리합니다.</p>
      </div>

      <div className="mt-8 overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600">
            <tr><th className="px-4 py-3">역할</th><th className="px-4 py-3">업적평가</th><th className="px-4 py-3">역량평가</th><th className="px-4 py-3">평가결과</th><th className="px-4 py-3">개인면담</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-800">
            <tr><td className="px-4 py-4 font-medium">관리자</td><td className="px-4 py-4">전체 관리</td><td className="px-4 py-4">전체 관리</td><td className="px-4 py-4">전체 조회</td><td className="px-4 py-4">전체 관리</td></tr>
            <tr><td className="px-4 py-4 font-medium">팀장</td><td className="px-4 py-4">그룹핑·성과·기여도</td><td className="px-4 py-4">대상 지정·결과 확인</td><td className="px-4 py-4">담당 팀 조회</td><td className="px-4 py-4">담당 팀 관리</td></tr>
            <tr><td className="px-4 py-4 font-medium">팀원</td><td className="px-4 py-4">개별과제 등록·결과 확인</td><td className="px-4 py-4">피어리뷰 입력</td><td className="px-4 py-4 text-gray-400">접근 불가</td><td className="px-4 py-4 text-gray-400">접근 불가</td></tr>
          </tbody>
        </table>
      </div>

      <div className="mt-5 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm leading-6 text-orange-900">사용자 초대와 역할 변경 기능은 Google Drive의 새 앱 전용 권한 파일에 저장하도록 다음 단계에서 연결합니다.</div>
    </section>
  )
}
