import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Layout } from './components/Layout';
import { buttonClass, EmptyState } from './components/ui';
import { ToastProvider } from './context/ToastContext';
import { UserProvider } from './context/UserContext';
import { PromotionsPage } from './pages/PromotionsPage';
import { PromotionEditorPage } from './pages/promotion-editor/PromotionEditorPage';
import { SimulatorPage } from './pages/SimulatorPage';
import { ReportsPage } from './pages/ReportsPage';

function EditorRoute() {
  const { id } = useParams();
  return <PromotionEditorPage key={id ?? 'new'} id={id} />;
}

function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      body="That page doesn’t exist."
      action={<Link to="/promotions" className={buttonClass('primary')}>Go to promotions</Link>}
    />
  );
}

export default function App() {
  return (
    <ToastProvider>
      <UserProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/promotions" replace />} />
            <Route path="promotions" element={<PromotionsPage />} />
            <Route path="promotions/new" element={<EditorRoute />} />
            <Route path="promotions/:id/edit" element={<EditorRoute />} />
            <Route path="simulator" element={<SimulatorPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </UserProvider>
    </ToastProvider>
  );
}
