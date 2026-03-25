import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
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
import AdminRentOrdersPage from "./pages/AdminRentOrdersPage";
import AdminServiceRequestsPage from "./pages/AdminServiceRequestsPage";
import AdminOverviewPage from "./pages/AdminOverviewPage";
import ServicesPage from "./pages/ServicesPage";
import DebrisRemovalPage from "./pages/DebrisRemovalPage";
import ContactsPage from "./pages/ContactsPage";
import NotFoundPage from "./pages/NotFoundPage";
import RequireAuth from "./components/RequireAuth";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
      <OrderModalProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/catalog/:slug" element={<EquipmentDetailPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/vyviz-smittia" element={<DebrisRemovalPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
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
            <Route path="overview" element={<AdminOverviewPage />} />
            <Route path="equipment" element={<AdminEquipmentPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="rent-orders" element={<AdminRentOrdersPage />} />
            <Route path="service-requests" element={<AdminServiceRequestsPage />} />
            <Route path="occupancy" element={<AdminOccupancyPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </OrderModalProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
