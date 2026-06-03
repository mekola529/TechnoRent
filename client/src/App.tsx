import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { AuthProvider } from "./context/AuthContext";
import { OrderModalProvider } from "./context/OrderModalContext";
import { CustomerAccountProvider } from "./context/CustomerAccountContext";
import HomePage from "./pages/HomePage";
import AdminLayout from "./components/AdminLayout";
import NotFoundPage from "./pages/NotFoundPage";
import RequireAuth from "./components/RequireAuth";
import AnalyticsTracker from "./components/AnalyticsTracker";

const CatalogPage = lazy(() => import("./pages/CatalogPage"));
const EquipmentDetailPage = lazy(() => import("./pages/EquipmentDetailPage"));
const ServicesPage = lazy(() => import("./pages/ServicesPage"));
const ServiceDetailPage = lazy(() => import("./pages/ServiceDetailPage"));
const DebrisRemovalPage = lazy(() => import("./pages/DebrisRemovalPage"));
const ContactsPage = lazy(() => import("./pages/ContactsPage"));
const AccountLoginPage = lazy(() => import("./pages/AccountLoginPage"));
const AccountRegisterPage = lazy(() => import("./pages/AccountRegisterPage"));
const AccountVerifyPage = lazy(() => import("./pages/AccountVerifyPage"));
const AccountDashboardPage = lazy(() => import("./pages/AccountDashboardPage"));
const AccountOrdersPage = lazy(() => import("./pages/AccountOrdersPage"));
const AccountOrderDetailPage = lazy(() => import("./pages/AccountOrderDetailPage"));
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage"));
const AdminEquipmentPage = lazy(() => import("./pages/AdminEquipmentPage"));
const AdminOrdersPage = lazy(() => import("./pages/AdminOrdersPage"));
const AdminOccupancyPage = lazy(() => import("./pages/AdminOccupancyPage"));
const AdminRentOrdersPage = lazy(() => import("./pages/AdminRentOrdersPage"));
const AdminEmployeesPage = lazy(() => import("./pages/AdminEmployeesPage"));
const AdminCustomersPage = lazy(() => import("./pages/AdminCustomersPage"));
const AdminServicesPage = lazy(() => import("./pages/AdminServicesPage"));
const AdminOverviewPage = lazy(() => import("./pages/AdminOverviewPage"));
const AdminGpsPage = lazy(() => import("./pages/AdminGpsPage"));
const AdminGpsMapPage = lazy(() => import("./pages/AdminGpsMapPage"));
const AdminSupplyPage = lazy(() => import("./pages/AdminSupplyPage"));
const AdminNotificationsPage = lazy(() => import("./pages/AdminNotificationsPage"));
const AdminSettingsPage = lazy(() => import("./pages/AdminSettingsPage"));
const AdminFinancePage = lazy(() => import("./pages/AdminFinancePage"));
const AdminMarketingPage = lazy(() => import("./pages/AdminMarketingPage"));

function PageLoading() {
  return <div className="min-h-[35vh] bg-white" aria-hidden="true" />;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AnalyticsTracker />
      <AuthProvider>
      <CustomerAccountProvider>
      <OrderModalProvider>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/catalog/:slug" element={<EquipmentDetailPage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/services/:slug" element={<ServiceDetailPage />} />
            <Route path="/vyviz-smittia" element={<DebrisRemovalPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/account/login" element={<AccountLoginPage />} />
            <Route path="/account/register" element={<AccountRegisterPage />} />
            <Route path="/account/verify" element={<AccountVerifyPage />} />
            <Route path="/account" element={<AccountDashboardPage />} />
            <Route path="/account/orders" element={<AccountOrdersPage />} />
            <Route path="/account/orders/:id" element={<AccountOrderDetailPage />} />
            <Route path="/admin" element={<AdminLoginPage />} />

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
              <Route path="gps" element={<AdminGpsPage />} />
              <Route path="gps-map" element={<AdminGpsMapPage />} />
              <Route path="orders" element={<AdminOrdersPage />} />
              <Route path="rent-orders" element={<AdminRentOrdersPage />} />
              <Route path="rent-orders/:orderNumber" element={<AdminRentOrdersPage />} />
              <Route path="customers" element={<AdminCustomersPage />} />
              <Route path="customers/:customerId" element={<AdminCustomersPage />} />
              <Route path="employees" element={<AdminEmployeesPage />} />
              <Route path="services-manage" element={<AdminServicesPage />} />
              <Route path="supply" element={<AdminSupplyPage />} />
              <Route path="finance" element={<AdminFinancePage />} />
              <Route path="marketing" element={<AdminMarketingPage />} />
              <Route path="notifications" element={<AdminNotificationsPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
              <Route path="occupancy" element={<AdminOccupancyPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </OrderModalProvider>
      </CustomerAccountProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
