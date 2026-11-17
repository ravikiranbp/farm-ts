import { useNavigate, useOutletContext, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGet } from "@/lib/api";
import type { Dashboard as D, User } from "@/lib/types";
import { fmtDateTime, inr } from "@/lib/format";
import { Empty, PageHeader, Panel, Stat, StatusBadge } from "@/components/common";

export default function Dashboard() {
  const me = useOutletContext<User>();
  const nav = useNavigate();
  const { data: d, isError } = useQuery({ queryKey: ["dashboard"], queryFn: () => apiGet<D>("/dashboard") });
  const go = (q: string) => () => nav(`/staff/leads${q}`);
  const mgmt = me.role !== "telecaller";
  const statusData = Object.entries(d?.status_counts ?? {}).map(([status, count]) => ({ status: status.replace("Positive – Awaiting Manager Approval", "Positive (pending)"), count }));
  return (
    <div>
      <PageHeader title={`Welcome, ${me.name.split(" (")[0]}`} subtitle={me.role === "telecaller" ? "Your assigned leads and today's calls" : "Company-wide sales and operations overview"} />
      {isError && <p className="mb-4 text-sm text-red-300">Dashboard data could not be loaded.</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={mgmt ? "Total leads" : "Assigned leads"} value={d?.total_leads ?? "–"} onClick={go("")} testId="stat-total-leads" />
        <Stat label="New leads" value={d?.new_leads ?? "–"} onClick={go("?status=New")} testId="stat-new-leads" />
        <Stat label="Pending calls" value={d?.pending_calls ?? "–"} testId="stat-pending-calls" />
        <Stat label="Today's follow-ups" value={d?.today_followups ?? "–"} tone="gold" onClick={() => nav("/staff/followups?state=today")} testId="stat-today-followups" />
        <Stat label="Overdue follow-ups" value={d?.overdue_followups ?? "–"} tone={d?.overdue_followups ? "red" : undefined} onClick={() => nav("/staff/followups?state=overdue")} testId="stat-overdue-followups" />
        <Stat label="Awaiting approval" value={d?.awaiting_approval ?? "–"} tone="gold" onClick={() => nav(mgmt ? "/staff/approvals" : "/staff/leads?approval=pending")} testId="stat-awaiting-approval" />
        <Stat label="Contacted" value={d?.contacted ?? "–"} testId="stat-contacted" />
        <Stat label="Interested" value={d?.interested ?? "–"} onClick={go("?status=Interested")} testId="stat-interested" />
        <Stat label="Approved" value={d?.approved ?? "–"} tone="green" testId="stat-approved" />
        <Stat label="Rejected / not interested" value={(d?.rejected ?? 0) + (d?.not_interested ?? 0)} testId="stat-rejected" />
        <Stat label="In quotation stage" value={d?.converted_to_quotation ?? "–"} testId="stat-quotation-stage" />
        <Stat label="Won" value={d?.won ?? "–"} tone="green" onClick={go("?status=Won")} testId="stat-won" />
      </div>
      {mgmt && d && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Unassigned" value={d.unassigned ?? 0} tone={d.unassigned ? "red" : undefined} onClick={go("?assigned_to=unassigned")} testId="stat-unassigned" />
          <Stat label="Conversion rate" value={`${d.conversion_rate ?? 0}%`} testId="stat-conversion" />
          <Stat label="Quotes pending / approved / sent" value={`${d.quotations_pending} / ${d.quotations_approved} / ${d.quotations_sent}`} onClick={() => nav("/staff/quotations")} testId="stat-quotes" />
          <Stat label="Total quotation value" value={inr(d.quote_value)} tone="gold" testId="stat-quote-value" />
          <Stat label="Confirmed order value" value={inr(d.order_value)} tone="green" testId="stat-order-value" />
          <Stat label="Upcoming inspections" value={d.inspections_upcoming ?? 0} onClick={() => nav("/staff/inspections")} testId="stat-inspections" />
          <Stat label="Customers" value={d.total_customers ?? 0} onClick={() => nav("/staff/customers")} testId="stat-customers" />
          <Stat label="Active installations" value={d.active_installations ?? 0} onClick={() => nav("/staff/orders")} testId="stat-installations" />
          <Stat label="Pending service" value={d.pending_service ?? 0} onClick={() => nav("/staff/service")} testId="stat-service" />
          <Stat label="Active AMC" value={d.active_amc ?? 0} testId="stat-amc" />
          <Stat label="Lost" value={d.lost} testId="stat-lost" />
          <Stat label="Approvals pending" value={d.awaiting_approval} onClick={() => nav("/staff/approvals")} testId="stat-approvals" />
        </div>
      )}
      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Lead pipeline">
          <div className="h-64">
            <ResponsiveContainer><BarChart data={statusData} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid stroke="#232B3B" horizontal={false} /><XAxis type="number" stroke="#A1A7B3" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="status" stroke="#A1A7B3" fontSize={11} width={120} />
              <Tooltip contentStyle={{ background: "#1C2230", border: "1px solid #232B3B" }} /><Bar dataKey="count" fill="#D6A23A" radius={[0, 4, 4, 0]} />
            </BarChart></ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Recently updated leads">
          {!d?.recent.length ? <Empty text="No leads yet" /> : d.recent.map((l) => (
            <Link key={l.id} to={`/staff/leads/${l.id}`} className="flex items-center justify-between gap-2 border-b border-line/60 py-2 text-sm last:border-0 hover:text-champagne" data-testid="recent-lead-row">
              <span><span className="font-mono text-xs text-steel">{l.ref}</span> {l.name}</span><StatusBadge status={l.status} />
            </Link>
          ))}
        </Panel>
      </div>
      {mgmt && d && (
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Panel title="Employee-wise leads">
            {(d.per_employee ?? []).map((p) => <div key={p.name} className="flex justify-between border-b border-line/60 py-1.5 text-sm last:border-0"><span>{p.name}</span><span className="text-steel">{p.assigned} assigned · {p.positive} positive · <b className="text-emerald-300">{p.won} won</b></span></div>)}
          </Panel>
          <Panel title="Leads by source">
            {Object.entries(d.by_source ?? {}).map(([k, v]) => <div key={k} className="flex justify-between py-1 text-sm"><span className="text-steel">{k}</span><span>{v}</span></div>)}
          </Panel>
          <Panel title="AMC expiring (30 days)">
            {!d.amc_expiring?.length ? <Empty text="No AMC contracts expiring soon" /> : d.amc_expiring.map((a) => <div key={a.id} className="flex justify-between py-1 text-sm"><span>{a.customer_name}</span><span className="text-amber-300">{a.end_date}</span></div>)}
          </Panel>
        </div>
      )}
      {me.role === "admin" && !!d?.recent_activity?.length && (
        <Panel title="Recent system activity" className="mt-5">
          {d.recent_activity.map((a) => <div key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-line/60 py-1.5 text-xs last:border-0"><span><b>{a.user_name}</b> · {a.action.replace(/_/g, " ")} {a.record_ref && <span className="font-mono text-champagne">{a.record_ref}</span>}</span><span className="text-steel">{fmtDateTime(a.at)}</span></div>)}
        </Panel>
      )}
    </div>
  );
}
