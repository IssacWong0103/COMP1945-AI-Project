import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Closet } from './pages/Closet'
import { Home } from './pages/Home'
import { Profile } from './pages/Profile'
import { Recommend } from './pages/Recommend'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/wardrobe" element={<Closet />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/you" element={<Navigate to="/profile" replace />} />
          <Route path="/dress-me" element={<Recommend />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
