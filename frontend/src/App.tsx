import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Profile } from './pages/Profile'
import { Recommend } from './pages/Recommend'
import { Wardrobe } from './pages/Wardrobe'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/wardrobe" element={<Wardrobe />} />
          <Route path="/you" element={<Profile />} />
          <Route path="/dress-me" element={<Recommend />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
