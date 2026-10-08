import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useBlocker } from 'react-router-dom'
import { navigationProtection } from '../domain/navigationProtection'

export function NavigationGuard() {
  const state = useSyncExternalStore(navigationProtection.subscribe, navigationProtection.getSnapshot)
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    navigationProtection.getSnapshot().blocked && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search))
  const dialog = useRef(null)
  useEffect(() => {
    const warn = event => {
      if (!navigationProtection.getSnapshot().blocked) return
      event.preventDefault(); event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (!state.blocked) { blocker.proceed(); return }
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [blocker, state.blocked])
  if (blocker.state !== 'blocked' || !state.blocked) return null
  return <dialog ref={dialog} className="editor navigation-confirm" aria-labelledby="leave-title" onCancel={event => { event.preventDefault(); blocker.reset() }}>
    <h2 id="leave-title">{state.busy ? '요청 처리 중입니다' : '작성 화면을 나갈까요?'}</h2>
    <p>{state.busy ? '처리 결과를 확인한 뒤 이동해 주세요.' : '저장하지 않은 입력은 사라집니다. 따로 기기에 보관한 초안은 남습니다.'}</p>
    <div className="editor-footer"><button autoFocus onClick={() => blocker.reset()}>계속 작성</button><button className="danger" disabled={state.busy} onClick={() => blocker.proceed()}>나가기</button></div>
  </dialog>
}
