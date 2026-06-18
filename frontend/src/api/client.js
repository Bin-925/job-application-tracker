import axios from 'axios'
import { getToken } from '../store/auth'

// 환경변수 있으면 그걸로(배포), 없으면 localhost(로컬)
const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1'

const api = axios.create({
    baseURL,
})

api.interceptors.request.use((config) => {
    const token = getToken()
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
})

export default api