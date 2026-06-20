import { Route, Routes } from 'react-router'
import { MapPage } from './pages/MapPage'
import { NotFoundPage } from './pages/NotFoundPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<MapPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
