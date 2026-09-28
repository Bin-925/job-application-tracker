import axios from 'axios'

export function createSessionClient({ baseURL = '/api/v1', adapter, onUnauthorized = () => {} } = {}) {
  const options = { baseURL, timeout: 15000, withCredentials: true, ...(adapter ? { adapter } : {}) }
  const csrfClient = axios.create(options)
  const api = axios.create(options)
  api.interceptors.request.use(async config => {
    if (!['get', 'head', 'options'].includes((config.method || 'get').toLowerCase())) {
      // Login/logout invalidates the previous CSRF token; do not cache it.
      const { data } = await csrfClient.get('/members/csrf', { signal: config.signal })
      config.headers.set(data.headerName, data.token)
    }
    return config
  })
  api.interceptors.response.use(response => response, error => {
    const probe = error.config?.url === '/members/me' && error.config?.method === 'get'
    if (error.response?.status === 401 && error.config?.url !== '/members/login' && !probe) onUnauthorized()
    return Promise.reject(error)
  })
  return api
}

export default createSessionClient({
  baseURL: import.meta.env?.VITE_API_URL || '/api/v1',
  onUnauthorized: () => window.dispatchEvent(new Event('auth-expired')),
})
