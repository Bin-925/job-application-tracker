import { Outlet } from 'react-router-dom'
import TabBar from './TabBar'

export default function Layout() {
    return (
        <div className="flex flex-col min-h-screen max-w-sm mx-auto">
            <main className="flex-1 pb-16">
                <Outlet />
            </main>
            <TabBar />
        </div>
    )
}