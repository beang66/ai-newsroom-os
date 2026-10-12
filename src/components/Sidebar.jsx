import { Home, PenTool, Mic, Send, Network, FolderArchive, Settings } from "lucide-react";
import { destinations } from "../data/navigation";

const icons = { desk: Home, writer: PenTool, interview: Mic, convert: Send, map: Network, archive: FolderArchive };

export default function Sidebar({ activeTab, setActiveTab, session, onSettings }) {
  return <aside className="workspace-sidebar">
    <nav aria-label="주요 메뉴">
      {destinations.map((item) => {
        const Icon = icons[item.id];
        return <button type="button" key={item.id} title={item.label} aria-label={item.label}
          aria-current={activeTab === item.id ? "page" : undefined} onClick={() => setActiveTab(item.id)}>
          <span className="nav-number" aria-hidden="true">{item.number}</span>
          <Icon size={18} aria-hidden="true" /><span>{item.label}</span>
        </button>;
      })}
    </nav>
    <div className="workspace-sidebar-footer">
      <button type="button" aria-label="환경 설정" onClick={onSettings}><Settings size={18} aria-hidden="true" />환경 설정</button>
      <p>{session?.signedIn ? session.email || "로그인됨" : "로컬 작업"}<small>{session?.signedIn ? "AI Newsroom" : "로그인 없이 작성·저장 가능"}</small></p>
    </div>
  </aside>;
}
