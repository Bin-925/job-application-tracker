import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Download, RefreshCw, X } from 'lucide-react'
import { createUpdateCoordinator, updateProtection } from '../domain/updateProtection'
import { useUpdateBlocked } from './useFormProtection'

export function PwaStatus() {
  const [install, setInstall] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const [ready, setReady] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const [registration, setRegistration] = useState(null)
  const blocked = useUpdateBlocked()
  const [coordinator] = useState(() => createUpdateCoordinator({
    isBlocked: updateProtection.getSnapshot,
    isOnline: () => navigator.onLine,
    reload: () => window.location.reload(),
    onReady: () => { setReady(true); setUpdating(false) },
  }))
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onNeedReload: () => coordinator.activated(),
    onNeedRefresh: () => setDismissed(false),
    onRegisteredSW: (_url, value) => setRegistration(value),
  })
  useEffect(() => {
    if (!registration) return
    const workers = new Set()
    const waiting = () => { if (registration.waiting) setReady(true) }
    const installing = () => {
      const worker = registration.installing
      if (worker) { workers.add(worker); worker.addEventListener('statechange', waiting) }
    }
    let previous = navigator.serviceWorker.controller
    const controlled = () => {
      const current = navigator.serviceWorker.controller
      if (previous && current !== previous) coordinator.activated()
      previous = current
    }
    installing()
    registration.addEventListener('updatefound', installing)
    navigator.serviceWorker.addEventListener('controllerchange', controlled)
    // Native waiting state also covers updates discovered by another tab.
    const timer = setTimeout(waiting, 0)
    return () => {
      clearTimeout(timer)
      workers.forEach(worker => worker.removeEventListener('statechange', waiting))
      registration.removeEventListener('updatefound', installing)
      navigator.serviceWorker.removeEventListener('controllerchange', controlled)
    }
  }, [registration, coordinator])
  useEffect(() => {
    const prompt = event => { event.preventDefault(); setInstall(event) }
    const installed = () => setInstall(null)
    const network = () => setOnline(navigator.onLine)
    window.addEventListener('beforeinstallprompt', prompt)
    window.addEventListener('appinstalled', installed)
    window.addEventListener('online', network)
    window.addEventListener('offline', network)
    return () => { window.removeEventListener('beforeinstallprompt', prompt); window.removeEventListener('appinstalled', installed); window.removeEventListener('online', network); window.removeEventListener('offline', network) }
  }, [])
  useEffect(() => {
    if (!updating) return
    const timer = setTimeout(() => { setUpdating(false); setError('업데이트 응답이 없습니다. 다시 시도해 주세요.') }, 15000)
    return () => clearTimeout(timer)
  }, [updating])
  async function applyUpdate() {
    setError(''); setUpdating(true)
    try { if (!await coordinator.apply(() => registration?.waiting ? registration.waiting.postMessage({ type: 'SKIP_WAITING' }) : updateServiceWorker(true))) setUpdating(false) }
    catch { setUpdating(false); setError('업데이트하지 못했습니다. 다시 시도해 주세요.') }
  }
  if (needRefresh || ready) return <div className="pwa-banner" role="status"><span>{error || (blocked ? '새 버전이 있습니다. 작성 중인 내용을 저장하거나 취소해 주세요.' : !online ? '새 버전이 있습니다. 연결 후 업데이트할 수 있습니다.' : '새 버전이 준비되었습니다.')}</span><button disabled={blocked || !online || updating} onClick={applyUpdate}><RefreshCw size={16} />{updating ? '업데이트 중' : '업데이트'}</button></div>
  if (!install || dismissed) return null
  return <div className="pwa-banner"><span>취준노트</span><button onClick={async () => { await install.prompt(); await install.userChoice; setInstall(null) }}><Download size={16} />앱 설치</button><button className="icon" title="나중에" onClick={() => setDismissed(true)}><X size={17} /></button></div>
}
