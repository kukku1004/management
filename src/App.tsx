import { useState } from 'react'
import { AppProvider, useAppState } from './state/AppContext'
import { WorkspaceProvider, useWorkspace } from './state/WorkspaceContext'
import Navigation, { type TabKey } from './components/Navigation'
import TaskManagement from './components/TaskManagement'
import EvaluationMatrix from './components/EvaluationMatrix'
import EvaluationResults from './components/EvaluationResults'
import MeetingNotes from './components/MeetingNotes'
import WorkspaceStart from './components/WorkspaceStart'
import GoogleDriveDialog from './components/GoogleDriveDialog'
import ProjectSetupStart from './components/ProjectSetupStart'
import { evaluationPeriodFolderName, formatEvaluationPeriod } from './utils/workspace'
import { CriteriaWorkspaceProvider } from './components/CriteriaWorkspaceLayout'
import AccessManagement from './components/FirebaseAccessManagement'
import { canAccessTab } from './utils/access'
import { useAuth } from './state/AuthContext'
import LoginScreen from './components/LoginScreen'

export default function App() {
  const { user, profile, loading, configured } = useAuth()
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-gray-50"><span className="h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" /></div>
  if (!configured) return <div className="flex min-h-screen items-center justify-center text-sm text-red-700">Firebase 설정을 확인하세요.</div>
  if (!user || !profile) return <LoginScreen />
  return <WorkspaceProvider><WorkspaceRouter /></WorkspaceProvider>
}

function WorkspaceRouter() {
  const { connected, activeProject, restoringConnection, updateProjectState } = useWorkspace()
  if (restoringConnection) return <div className="flex min-h-screen items-center justify-center bg-gray-50"><div className="text-center"><span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" /><p className="mt-3 text-sm text-gray-500">기존 Google 계정으로 연결 중입니다.</p></div></div>
  if (!connected || !activeProject) return <WorkspaceStart />

  return (
    <AppProvider
      key={activeProject.id}
      initialState={activeProject.appState}
      onStateChange={(state) => updateProjectState(activeProject.id, state)}
    >
      <ProjectApp />
    </AppProvider>
  )
}

function ProjectApp() {
  const { state, dispatch } = useAppState()
  const { workspace, activeProject, activeTeam, resetWorkspace } = useWorkspace()
  const { profile } = useAuth()
  const role = profile?.role ?? 'member'
  const [activeTab, setActiveTab] = useState<TabKey>('tasks')
  const [dataManagementOpen, setDataManagementOpen] = useState(false)
  const [quickStartOpen, setQuickStartOpen] = useState(() => state.tasks.length === 0 && state.members.length === 0)
  const [periodName, setPeriodName] = useState(activeProject ? evaluationPeriodFolderName(activeProject.period) : String(new Date().getFullYear()))

  function handleTabChange(tab: TabKey) {
    if (!canAccessTab(role, tab)) return
    setActiveTab(tab)
    window.scrollTo(0, 0)
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation role={role} activeTab={activeTab} onTabChange={handleTabChange} onOpenDataManagement={() => setDataManagementOpen(true)} onOpenQuickStart={() => setQuickStartOpen(true)} />
      <CriteriaWorkspaceProvider><main className="mx-auto w-full max-w-[1920px] px-4 py-8 sm:px-6">
        {activeTab === 'tasks' && <TaskManagement />}
        {activeTab === 'matrix' && <EvaluationMatrix />}
        {activeTab === 'results' && <EvaluationResults />}
        {activeTab === 'notes' && <MeetingNotes />}
        {activeTab === 'access' && <AccessManagement />}
      </main></CriteriaWorkspaceProvider>
      <GoogleDriveDialog open={dataManagementOpen} state={state} workspace={workspace} periodName={periodName} onPeriodNameChange={setPeriodName} onRestore={(restoredState) => dispatch({ type: 'LOAD_STATE', payload: restoredState })} onResetWorkspace={resetWorkspace} teamName={activeTeam?.name} projectId={activeProject?.id ?? ''} periodLabel={activeProject ? formatEvaluationPeriod(activeProject.period) : periodName} onClose={() => setDataManagementOpen(false)} />
      <ProjectSetupStart
        open={quickStartOpen}
        onClose={() => setQuickStartOpen(false)}
        onStartEvaluation={() => {
          setQuickStartOpen(false)
          handleTabChange('matrix')
        }}
      />
    </div>
  )
}
