import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Download, RefreshCw, X } from 'lucide-react'

export function PwaStatus() {
  const [install, setInstall] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW()
  useEffect(() => {
    const prompt = event => { event.preventDefault(); setInstall(event) }
    const installed = () => setInstall(null)
    window.addEventListener('beforeinstallprompt', prompt)
    window.addEventListener('appinstalled', installed)
    return () => { window.removeEventListener('beforeinstallprompt', prompt); window.removeEventListener('appinstalled', installed) }
  }, [])
  if (needRefresh) return <div className="pwa-banner"><span>새 버전이 준비되었습니다.</span><button onClick={() => updateServiceWorker(true)}><RefreshCw size={16} />업데이트</button><button className="icon" title="나중에" onClick={() => setNeedRefresh(false)}><X size={17} /></button></div>
  if (!install || dismissed) return null
  return <div className="pwa-banner"><span>취준노트</span><button onClick={async () => { await install.prompt(); await install.userChoice; setInstall(null) }}><Download size={16} />앱 설치</button><button className="icon" title="나중에" onClick={() => setDismissed(true)}><X size={17} /></button></div>
}
