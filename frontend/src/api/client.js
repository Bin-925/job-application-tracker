import axios from 'axios'
import { getToken, removeToken } from '../store/auth'

// 환경변수 있으면 그걸로(배포), 없으면 localhost(로컬)
const baseURL = import.meta.env.VITE_API_URL || '/api/v1'

const api = axios.create({
    baseURL,
    timeout: 15000,
})

api.interceptors.request.use((config) => {
    const token = getToken()
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
})

api.interceptors.response.use(response => response, error => {
    if (error.response?.status === 401 && getToken()) {
        removeToken()
        window.dispatchEvent(new Event('auth-expired'))
    }
    return Promise.reject(error)
})

export default api
