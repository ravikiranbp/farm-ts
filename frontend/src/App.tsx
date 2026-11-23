import { Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import PublicLayout from "@/components/PublicLayout";
import StaffLayout from "@/components/StaffLayout";
import {
	AboutPage, BrochuresPage, ContactPage, FaqsPage, NotFound, ProductDetailPage, ProductsPage, ProjectsPage, QuotePage,
	ServiceRequestPage, ServicesPage,
} from "@/pages/PublicPages";
import QuoteShare from "@/pages/QuoteShare";
import Login from "@/pages/staff/Login";
import Dashboard from "@/pages/staff/Dashboard";
import Leads from "@/pages/staff/Leads";
import LeadDetail from "@/pages/staff/LeadDetail";
import { QuotationDetail, QuotationNew, QuotationsList } from "@/pages/staff/Quotations";
import { QuoteDefaultsPage } from "@/pages/staff/QuoteForm";
import { CustomerProfile, CustomersPage, FollowupsPage, InspectionsPage } from "@/pages/staff/CrmPages";
import { NotificationsPage, OrdersPage, ServicePage } from "@/pages/staff/OpsPages";
import { AuditPage, ContentPage, EmployeesPage, ReportsPage, SettingsPage } from "@/pages/staff/AdminPages";

// One <Route> per page; BrowserRouter already wraps this in main.tsx.
export default function App() {
	return (
		<Routes>
			<Route element={<PublicLayout />}>
				<Route path="/" element={<Home />} />
				<Route path="/products" element={<ProductsPage />} />
				<Route path="/products/:slug" element={<ProductDetailPage />} />
				<Route path="/projects" element={<ProjectsPage />} />
				<Route path="/services" element={<ServicesPage />} />
				<Route path="/brochures" element={<BrochuresPage />} />
				<Route path="/about" element={<AboutPage />} />
				<Route path="/faqs" element={<FaqsPage />} />
				<Route path="/contact" element={<ContactPage />} />
				<Route path="/quote" element={<QuotePage />} />
				<Route path="/service-request" element={<ServiceRequestPage />} />
				<Route path="/q/:token" element={<QuoteShare />} />
				<Route path="*" element={<NotFound />} />
			</Route>
			<Route path="/login" element={<Login />} />
			<Route path="/staff" element={<StaffLayout />}>
				<Route index element={<Dashboard />} />
				<Route path="leads" element={<Leads />} />
				<Route path="leads/:id" element={<LeadDetail />} />
				<Route path="approvals" element={<Leads approvals />} />
				<Route path="followups" element={<FollowupsPage />} />
				<Route path="customers" element={<CustomersPage />} />
				<Route path="customers/:id" element={<CustomerProfile />} />
				<Route path="inspections" element={<InspectionsPage />} />
				<Route path="quotations" element={<QuotationsList />} />
				<Route path="quotations/new" element={<QuotationNew />} />
				<Route path="quotations/defaults" element={<QuoteDefaultsPage />} />
				<Route path="quotations/:id" element={<QuotationDetail />} />
				<Route path="orders" element={<OrdersPage />} />
				<Route path="service" element={<ServicePage />} />
				<Route path="reports" element={<ReportsPage />} />
				<Route path="notifications" element={<NotificationsPage />} />
				<Route path="employees" element={<EmployeesPage />} />
				<Route path="audit" element={<AuditPage />} />
				<Route path="content" element={<ContentPage />} />
				<Route path="settings" element={<SettingsPage />} />
			</Route>
		</Routes>
	);
}