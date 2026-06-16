import { Navigate, Outlet } from 'react-router-dom'
import { isLoggedIn } from '../../store/auth'

export default function PrivateRoute() {
    if (!isLoggedIn()) return <Navigate to="/login" replace />
    return <Outlet />
}