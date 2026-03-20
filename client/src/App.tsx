import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { OrderModalProvider } from "./context/OrderModalContext";
import HomePage from "./pages/HomePage";
import CatalogPage from "./pages/CatalogPage";
import EquipmentDetailPage from "./pages/EquipmentDetailPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminLayout from "./components/AdminLayout";
import AdminEquipmentPage from "./pages/AdminEquipmentPage";
import AdminOrdersPage from "./pages/AdminOrdersPage";
import AdminOccupancyPage from "./pages/AdminOccupancyPage";
import RequireAuth from "./components/RequireAuth";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <OrderModalProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/catalog/:slug" element={<EquipmentDetailPage />} />
          <Route path="/admin" element={<AdminLoginPage />} />

          {/* Protected admin routes */}
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route path="dashboard" element={<AdminEquipmentPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="occupancy" element={<AdminOccupancyPage />} />
          </Route>
        </Routes>
      </OrderModalProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
