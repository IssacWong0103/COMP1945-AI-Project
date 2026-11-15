import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Closet } from './pages/Closet'
import { Home } from './pages/Home'
import { Looks } from './pages/Looks'
import { Profile } from './pages/Profile'
import { Studio } from './pages/Studio'
import { TryOnPage } from './pages/TryOn'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/wardrobe" element={<Closet />} />
          <Route path="/studio" element={<Studio />} />
          <Route path="/looks" element={<Looks />} />
          <Route path="/try-on" element={<TryOnPage />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Navigate to="/profile" replace />} />
          <Route path="/you" element={<Navigate to="/profile" replace />} />
          <Route path="/dress-me" element={<Navigate to="/studio" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
