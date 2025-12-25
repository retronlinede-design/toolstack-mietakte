// RentIt (ToolStack) — module-ready MVP (Styled v1: grey + lime/emerald accent)
// Purpose: Rental unit tracker: unit profile, monthly costs, issues, incident log, evidence refs + export/import + print preview
// Paste into: src/App.jsx
// Requires: Tailwind v4 configured (same as other ToolStack apps).

import React, { useEffect, useMemo, useRef, useState } from "react";

const APP_ID = "rentit";
const APP_VERSION = "v1";
const KEY = `toolstack.${APP_ID}.${APP_VERSION}`;
const PROFILE_KEY = "toolstack.profile.v1";

// Put your real ToolStack hub URL here (Wix page)
const HUB_URL = "https://YOUR-WIX-HUB-URL-HERE";

/** Optional: legacy migration hook placeholder */
function migrateIfNeeded() {
  // Example:
  // const legacy = localStorage.getItem("toolstack.mietakte.v1");
  // if (legacy && !localStorage.getItem(KEY)) localStorage.setItem(KEY, legacy);
}

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function isoMonth() {
  return isoToday().slice(0, 7);
}

function uid(prefix = "id") {
  return (
    crypto?.randomUUID?.() ||
    `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
  return Math.round(toNum(n, 0) * 100) / 100;
}

function moneyFmt(n, currency) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return `${x.toFixed(2)} ${currency}`;
}

function loadProfile() {
  return (
    safeParse(localStorage.getItem(PROFILE_KEY), null) || {
      org: "ToolStack",
      user: "",
      language: "EN",
      logo: "",
    }
  );
}

function defaultState() {
  return {
    meta: {
      appId: APP_ID,
      version: APP_VERSION,
      updatedAt: new Date().toISOString(),
    },
    settings: {
      currency: "EUR",
    },
    unit: {
      label: "",
      address: "",
      landlordName: "",
      landlordEmail: "",
      landlordAddress: "",
      landlordPhone1: "",
      landlordPhone2: "",
      agentName: "",
      contractStart: "",
      contractType: "",
      rentWarm: 0,
      rentCold: 0,
      deposit: 0,
      notes: "",
    },
    costs: [
      {
        id: uid("c"),
        month: isoMonth(),
        rent: 0,
        utilities: 0,
        electricity: 0,
        internet: 0,
        parking: 0,
        furniture: 0,
        other: 0,
        total: 0,
        paid: false,
        note: "",
      },
    ],
    issues: [],
    incidents: [],
    evidence: [],
  };
}

function loadState() {
  migrateIfNeeded();
  const loaded = safeParse(localStorage.getItem(KEY), null);
  if (!loaded) return defaultState();

  // Forward-safe: ensure new landlord fields exist on older saves
  const unit = loaded.unit || {};
  const next = {
    ...defaultState(),
    ...loaded,
    unit: {
      ...defaultState().unit,
      ...unit,
      landlordEmail: unit.landlordEmail || "",
      landlordAddress: unit.landlordAddress || "",
      landlordPhone1: unit.landlordPhone1 || "",
      landlordPhone2: unit.landlordPhone2 || "",
    },
  };
  return next;
}

function saveState(state) {
  const next = {
    ...state,
    meta: { ...state.meta, updatedAt: new Date().toISOString() },
  };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

const btnSecondary =
  "px-3 py-2 rounded-xl bg-white border border-neutral-200 shadow-sm hover:bg-neutral-50 active:translate-y-[1px] transition";
const btnPrimary =
  "px-3 py-2 rounded-xl bg-neutral-900 text-white border border-neutral-900 shadow-sm hover:bg-neutral-800 active:translate-y-[1px] transition";
const inputBase =
  "w-full mt-1 px-3 py-2 rounded-xl border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-lime-400/25 focus:border-neutral-300";

function pillClass(kind) {
  switch (kind) {
    case "open":
      return "bg-red-100 text-red-800 border-red-200";
    case "in-progress":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "resolved":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    default:
      return "bg-neutral-100 text-neutral-700 border-neutral-200";
  }
}

function sevClass(sev) {
  switch (sev) {
    case "high":
      return "bg-red-100 text-red-800 border-red-200";
    case "medium":
      return "bg-amber-100 text-amber-800 border-amber-200";
    default:
      return "bg-neutral-100 text-neutral-700 border-neutral-200";
  }
}

export default function App() {
  const [profile, setProfile] = useState(loadProfile());
  const [state, setState] = useState(loadState());

  const [tab, setTab] = useState("overview");
  const [previewOpen, setPreviewOpen] = useState(false);
  const importRef = useRef(null);

  // Persist profile + app state
  useEffect(() => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state));
  }, [state]);

  const currency = state.settings.currency;

  // ===== Overview metrics =====
  const openIssuesCount = useMemo(
    () => (state.issues || []).filter((x) => x.status !== "resolved").length,
    [state.issues]
  );

  const currentMonth = useMemo(() => isoMonth(), []);

  const costsSorted = useMemo(() => {
    return [...(state.costs || [])].sort((a, b) =>
      String(b.month).localeCompare(String(a.month))
    );
  }, [state.costs]);

  const last12Costs = useMemo(() => costsSorted.slice(0, 12), [costsSorted]);

  const totalsLast12 = useMemo(() => {
    const sum = (k) => round2(last12Costs.reduce((s, r) => s + toNum(r[k]), 0));
    const total = round2(last12Costs.reduce((s, r) => s + toNum(r.total), 0));
    return {
      rent: sum("rent"),
      utilities: sum("utilities"),
      electricity: sum("electricity"),
      internet: sum("internet"),
      parking: sum("parking"),
      furniture: sum("furniture"),
      other: sum("other"),
      total,
    };
  }, [last12Costs]);

  // ===== Helpers =====
  function updateSettings(patch) {
    setState((prev) =>
      saveState({ ...prev, settings: { ...prev.settings, ...patch } })
    );
  }

  function updateUnit(patch) {
    setState((prev) => saveState({ ...prev, unit: { ...prev.unit, ...patch } }));
  }

  function recalcCostRow(row) {
    const total = round2(
      toNum(row.rent) +
        toNum(row.utilities) +
        toNum(row.electricity) +
        toNum(row.internet) +
        toNum(row.parking) +
        toNum(row.furniture) +
        toNum(row.other)
    );
    return { ...row, total };
  }

  function addCostRow() {
    const row = recalcCostRow({
      id: uid("c"),
      month: isoMonth(),
      rent: 0,
      utilities: 0,
      electricity: 0,
      internet: 0,
      parking: 0,
      furniture: 0,
      other: 0,
      total: 0,
      paid: false,
      note: "",
    });
    setState((prev) =>
      saveState({ ...prev, costs: [row, ...(prev.costs || [])] })
    );
  }

  function updateCostRow(id, patch) {
    setState((prev) =>
      saveState({
        ...prev,
        costs: (prev.costs || []).map((r) =>
          r.id === id ? recalcCostRow({ ...r, ...patch }) : r
        ),
      })
    );
  }

  function deleteCostRow(id) {
    setState((prev) =>
      saveState({ ...prev, costs: (prev.costs || []).filter((r) => r.id !== id) })
    );
  }

  // ===== Issues =====
  const [issueDraft, setIssueDraft] = useState({
    date: isoToday(),
    category: "Heating",
    severity: "high", // low | medium | high
    status: "open", // open | in-progress | resolved
    title: "",
    details: "",
    notified: "no", // no | yes
    evidenceRef: "",
  });

  function addIssue() {
    const item = {
      id: uid("is"),
      createdAt: new Date().toISOString(),
      ...issueDraft,
      title: String(issueDraft.title || "").trim(),
      details: String(issueDraft.details || "").trim(),
      evidenceRef: String(issueDraft.evidenceRef || "").trim(),
    };
    if (!item.title) return alert("Please enter an issue title.");
    setState((prev) =>
      saveState({ ...prev, issues: [item, ...(prev.issues || [])] })
    );
    setIssueDraft((d) => ({ ...d, title: "", details: "", evidenceRef: "" }));
  }

  function updateIssue(id, patch) {
    setState((prev) =>
      saveState({
        ...prev,
        issues: (prev.issues || []).map((x) =>
          x.id === id ? { ...x, ...patch } : x
        ),
      })
    );
  }

  function deleteIssue(id) {
    setState((prev) =>
      saveState({ ...prev, issues: (prev.issues || []).filter((x) => x.id !== id) })
    );
  }

  const issuesSorted = useMemo(() => {
    return [...(state.issues || [])].sort((a, b) =>
      String(b.date).localeCompare(String(a.date))
    );
  }, [state.issues]);

  // ===== Incidents =====
  const [incidentDraft, setIncidentDraft] = useState({
    date: isoToday(),
    time: "",
    who: "",
    what: "",
    impact: "",
    evidenceRef: "",
  });

  function addIncident() {
    const item = {
      id: uid("in"),
      createdAt: new Date().toISOString(),
      ...incidentDraft,
      who: String(incidentDraft.who || "").trim(),
      what: String(incidentDraft.what || "").trim(),
      impact: String(incidentDraft.impact || "").trim(),
      evidenceRef: String(incidentDraft.evidenceRef || "").trim(),
    };
    if (!item.what) return alert("Please describe what happened.");
    setState((prev) =>
      saveState({ ...prev, incidents: [item, ...(prev.incidents || [])] })
    );
    setIncidentDraft((d) => ({
      ...d,
      time: "",
      who: "",
      what: "",
      impact: "",
      evidenceRef: "",
    }));
  }

  function deleteIncident(id) {
    setState((prev) =>
      saveState({
        ...prev,
        incidents: (prev.incidents || []).filter((x) => x.id !== id),
      })
    );
  }

  const incidentsSorted = useMemo(() => {
    return [...(state.incidents || [])].sort((a, b) => {
      const ak = `${a.date} ${a.time || ""}`;
      const bk = `${b.date} ${b.time || ""}`;
      return bk.localeCompare(ak);
    });
  }, [state.incidents]);

  // ===== Evidence =====
  const [evidenceDraft, setEvidenceDraft] = useState({
    date: isoToday(),
    type: "Photo", // Photo | Email | Letter | WhatsApp | Other
    ref: "",
    description: "",
    link: "",
  });

  function addEvidence() {
    const item = {
      id: uid("ev"),
      createdAt: new Date().toISOString(),
      ...evidenceDraft,
      ref: String(evidenceDraft.ref || "").trim(),
      description: String(evidenceDraft.description || "").trim(),
      link: String(evidenceDraft.link || "").trim(),
    };
    if (!item.ref)
      return alert(
        "Please enter an evidence reference (e.g., Photo 12 / Email 2025-11-24)."
      );
    setState((prev) =>
      saveState({ ...prev, evidence: [item, ...(prev.evidence || [])] })
    );
    setEvidenceDraft((d) => ({ ...d, ref: "", description: "", link: "" }));
  }

  function deleteEvidence(id) {
    setState((prev) =>
      saveState({
        ...prev,
        evidence: (prev.evidence || []).filter((x) => x.id !== id),
      })
    );
  }

  const evidenceSorted = useMemo(() => {
    return [...(state.evidence || [])].sort((a, b) =>
      String(b.date).localeCompare(String(a.date))
    );
  }, [state.evidence]);

  // ===== Export / Import / Print =====
  function exportJSON() {
    const payload = {
      exportedAt: new Date().toISOString(),
      profile,
      data: state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `toolstack-rentit-${APP_VERSION}-${isoToday()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        const incoming = parsed?.data;
        if (!incoming?.unit || !Array.isArray(incoming?.costs))
          throw new Error("Invalid import file");
        setProfile(parsed?.profile || profile);
        setState(saveState(incoming));
      } catch (e) {
        alert("Import failed: " + (e?.message || "unknown error"));
      }
    };
    reader.readAsText(file);
  }

  function printPreview() {
    setPreviewOpen(true);
    setTimeout(() => window.print(), 50);
  }

  const moduleManifest = useMemo(
    () => ({
      id: APP_ID,
      name: "RentIt",
      version: APP_VERSION,
      storageKeys: [KEY, PROFILE_KEY],
      exports: ["print", "json"],
    }),
    []
  );

  // ===== UI data =====
  const nav = [
    { id: "overview", label: "Overview" },
    { id: "unit", label: "Unit" },
    { id: "costs", label: "Costs" },
    { id: "issues", label: "Issues" },
    { id: "incidents", label: "Incidents" },
    { id: "evidence", label: "Evidence" },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-bold tracking-tight">RentIt</div>
            <div className="text-sm text-neutral-600">
              Module-ready ({moduleManifest.id}.{moduleManifest.version}) • Unit • Costs • Issues • Incident log • Print/export
            </div>
            <div className="mt-3 h-[2px] w-80 rounded-full bg-gradient-to-r from-lime-400/0 via-lime-400 to-emerald-400/0" />
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <button className={btnSecondary} onClick={() => setPreviewOpen(true)}>
              Preview
            </button>
            <button className={btnSecondary} onClick={printPreview}>
              Print / Save PDF
            </button>
            <button className={btnSecondary} onClick={exportJSON}>
              Export
            </button>
            <button className={btnPrimary} onClick={() => importRef.current?.click()}>
              Import
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJSON(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex flex-wrap gap-2">
          {nav.map((n) => (
            <button
              key={n.id}
              className={
                n.id === tab
                  ? "px-3 py-2 rounded-xl bg-neutral-900 text-white border border-neutral-900 shadow-sm"
                  : btnSecondary
              }
              onClick={() => setTab(n.id)}
            >
              {n.label}
            </button>
          ))}
        </div>

        {/* Main grid */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Profile card */}
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-4">
            <div className="font-semibold">Profile (shared)</div>
            <div className="mt-3 space-y-2">
              <label className="block text-sm">
                <div className="text-neutral-600">Organization</div>
                <input
                  className={inputBase}
                  value={profile.org}
                  onChange={(e) => setProfile({ ...profile, org: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <div className="text-neutral-600">User</div>
                <input
                  className={inputBase}
                  value={profile.user}
                  onChange={(e) => setProfile({ ...profile, user: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <div className="text-neutral-600">Language</div>
                <select
                  className={inputBase}
                  value={profile.language}
                  onChange={(e) => setProfile({ ...profile, language: e.target.value })}
                >
                  <option value="EN">EN</option>
                  <option value="DE">DE</option>
                </select>
              </label>
              <label className="block text-sm">
                <div className="text-neutral-600">Currency</div>
                <input
                  className={inputBase}
                  value={state.settings.currency}
                  onChange={(e) =>
                    updateSettings({
                      currency: String(e.target.value || "").toUpperCase(),
                    })
                  }
                />
              </label>
              <div className="pt-2 text-xs text-neutral-500">
                Stored at <span className="font-mono">{PROFILE_KEY}</span>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-4 lg:col-span-3">
            {tab === "overview" && (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">Overview</div>
                    <div className="text-sm text-neutral-600">
                      Unit: <span className="font-semibold">{state.unit.label || "-"}</span> • Open issues:{" "}
                      <span className="font-semibold">{openIssuesCount}</span> • Current month:{" "}
                      <span className="font-semibold">{currentMonth}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                    <div className="font-semibold">Last 12 months totals</div>
                    <div className="mt-2 space-y-1 text-sm text-neutral-700">
                      <div>
                        Total: <span className="font-semibold">{moneyFmt(totalsLast12.total, currency)}</span>
                      </div>
                      <div>Rent: {moneyFmt(totalsLast12.rent, currency)}</div>
                      <div>Utilities: {moneyFmt(totalsLast12.utilities, currency)}</div>
                      <div>Electricity: {moneyFmt(totalsLast12.electricity, currency)}</div>
                      <div>Internet: {moneyFmt(totalsLast12.internet, currency)}</div>
                      <div>Parking: {moneyFmt(totalsLast12.parking, currency)}</div>
                      <div>Furniture: {moneyFmt(totalsLast12.furniture, currency)}</div>
                      <div>Other: {moneyFmt(totalsLast12.other, currency)}</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                    <div className="font-semibold">Quick actions</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button className={btnSecondary} onClick={() => setTab("unit")}>
                        Edit unit
                      </button>
                      <button className={btnSecondary} onClick={() => setTab("costs")}>
                        Add costs
                      </button>
                      <button className={btnSecondary} onClick={() => setTab("issues")}>
                        Log issue
                      </button>
                      <button className={btnSecondary} onClick={() => setTab("incidents")}>
                        Add incident
                      </button>
                      <button className={btnSecondary} onClick={() => setTab("evidence")}>
                        Add evidence
                      </button>
                    </div>

                    <div className="mt-3 text-sm text-neutral-600">
                      Tip: Use <span className="font-mono">Evidence refs</span> like “Photo 12”, “Email 2025-11-24”, “Letter Einwurf 24.11.2025”.
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                  <div className="font-semibold">Recent items</div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-xl bg-white border border-neutral-200 p-3">
                      <div className="text-sm text-neutral-600">Latest issue</div>
                      <div className="mt-1 font-semibold">{issuesSorted[0]?.title || "-"}</div>
                      <div className="text-sm text-neutral-600">{issuesSorted[0]?.date || ""}</div>
                    </div>
                    <div className="rounded-xl bg-white border border-neutral-200 p-3">
                      <div className="text-sm text-neutral-600">Latest incident</div>
                      <div className="mt-1 font-semibold">
                        {incidentsSorted[0]?.what ? String(incidentsSorted[0].what).slice(0, 50) : "-"}
                      </div>
                      <div className="text-sm text-neutral-600">{incidentsSorted[0]?.date || ""}</div>
                    </div>
                    <div className="rounded-xl bg-white border border-neutral-200 p-3">
                      <div className="text-sm text-neutral-600">Latest evidence</div>
                      <div className="mt-1 font-semibold">{evidenceSorted[0]?.ref || "-"}</div>
                      <div className="text-sm text-neutral-600">{evidenceSorted[0]?.date || ""}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === "unit" && (
              <div>
                <div className="font-semibold">Unit profile</div>
                <div className="text-sm text-neutral-600">Core tenancy info + landlord contact details + baseline rent figures (optional).</div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <label className="text-sm">
                    <div className="text-neutral-600">Unit label</div>
                    <input
                      className={inputBase}
                      value={state.unit.label}
                      onChange={(e) => updateUnit({ label: e.target.value })}
                      placeholder="e.g., Room 3 / Flat A"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-neutral-600">Contract start</div>
                    <input
                      type="date"
                      className={inputBase}
                      value={state.unit.contractStart}
                      onChange={(e) => updateUnit({ contractStart: e.target.value })}
                    />
                  </label>
                  <label className="text-sm md:col-span-2">
                    <div className="text-neutral-600">Address</div>
                    <input
                      className={inputBase}
                      value={state.unit.address}
                      onChange={(e) => updateUnit({ address: e.target.value })}
                      placeholder="Street, City"
                    />
                  </label>

                  {/* Landlord details */}
                  <div className="md:col-span-2 mt-2">
                    <div className="text-sm font-semibold">Landlord details</div>
                    <div className="text-sm text-neutral-600">Store full contact details for letters and escalation.</div>
                  </div>

                  <label className="text-sm">
                    <div className="text-neutral-600">Landlord name</div>
                    <input
                      className={inputBase}
                      value={state.unit.landlordName}
                      onChange={(e) => updateUnit({ landlordName: e.target.value })}
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-neutral-600">Landlord email</div>
                    <input
                      type="email"
                      className={inputBase}
                      value={state.unit.landlordEmail}
                      onChange={(e) => updateUnit({ landlordEmail: e.target.value })}
                      placeholder="name@example.com"
                    />
                  </label>
                  <label className="text-sm md:col-span-2">
                    <div className="text-neutral-600">Landlord physical address</div>
                    <input
                      className={inputBase}
                      value={state.unit.landlordAddress}
                      onChange={(e) => updateUnit({ landlordAddress: e.target.value })}
                      placeholder="Street, ZIP, City"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-neutral-600">Landlord phone (1)</div>
                    <input
                      className={inputBase}
                      value={state.unit.landlordPhone1}
                      onChange={(e) => updateUnit({ landlordPhone1: e.target.value })}
                      placeholder="+49 …"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-neutral-600">Landlord phone (2)</div>
                    <input
                      className={inputBase}
                      value={state.unit.landlordPhone2}
                      onChange={(e) => updateUnit({ landlordPhone2: e.target.value })}
                      placeholder="Optional"
                    />
                  </label>

                  <label className="text-sm md:col-span-2">
                    <div className="text-neutral-600">Agent / representative</div>
                    <input
                      className={inputBase}
                      value={state.unit.agentName}
                      onChange={(e) => updateUnit({ agentName: e.target.value })}
                      placeholder="Optional"
                    />
                  </label>

                  <label className="text-sm md:col-span-2">
                    <div className="text-neutral-600">Contract type</div>
                    <input
                      className={inputBase}
                      value={state.unit.contractType}
                      onChange={(e) => updateUnit({ contractType: e.target.value })}
                      placeholder="e.g., WG room, furnished, fixed-term / indefinite"
                    />
                  </label>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                  <label className="text-sm">
                    <div className="text-neutral-600">Warm rent</div>
                    <input
                      type="number"
                      step="0.01"
                      className={inputBase}
                      value={state.unit.rentWarm}
                      onChange={(e) => updateUnit({ rentWarm: toNum(e.target.value, 0) })}
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-neutral-600">Cold rent</div>
                    <input
                      type="number"
                      step="0.01"
                      className={inputBase}
                      value={state.unit.rentCold}
                      onChange={(e) => updateUnit({ rentCold: toNum(e.target.value, 0) })}
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-neutral-600">Deposit</div>
                    <input
                      type="number"
                      step="0.01"
                      className={inputBase}
                      value={state.unit.deposit}
                      onChange={(e) => updateUnit({ deposit: toNum(e.target.value, 0) })}
                    />
                  </label>
                </div>

                <label className="block text-sm mt-3">
                  <div className="text-neutral-600">Notes</div>
                  <textarea
                    className={`${inputBase} min-h-[100px]`}
                    value={state.unit.notes}
                    onChange={(e) => updateUnit({ notes: e.target.value })}
                    placeholder="Anything important: special agreements, defects known at move-in, heating arrangement, etc."
                  />
                </label>
              </div>
            )}

            {tab === "costs" && (
              <div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="font-semibold">Monthly costs</div>
                    <div className="text-sm text-neutral-600">Track your all-in monthly housing costs and mark as paid.</div>
                  </div>
                  <button className={btnPrimary} onClick={addCostRow}>
                    + Month
                  </button>
                </div>

                <div className="mt-3 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-neutral-600">
                      <tr className="border-b">
                        <th className="py-2 pr-2">Month</th>
                        <th className="py-2 pr-2">Rent</th>
                        <th className="py-2 pr-2">Utilities</th>
                        <th className="py-2 pr-2">Electricity</th>
                        <th className="py-2 pr-2">Internet</th>
                        <th className="py-2 pr-2">Parking</th>
                        <th className="py-2 pr-2">Furniture</th>
                        <th className="py-2 pr-2">Other</th>
                        <th className="py-2 pr-2">Total</th>
                        <th className="py-2 pr-2">Paid</th>
                        <th className="py-2 pr-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costsSorted.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="py-3 text-neutral-500">
                            No cost rows yet.
                          </td>
                        </tr>
                      ) : (
                        costsSorted.map((r) => (
                          <tr key={r.id} className="border-b last:border-b-0">
                            <td className="py-2 pr-2 font-medium">
                              <input
                                type="month"
                                className="px-2 py-1 rounded-xl border border-neutral-200 bg-white"
                                value={r.month}
                                onChange={(e) => updateCostRow(r.id, { month: e.target.value })}
                              />
                              <div className="text-xs text-neutral-500 mt-1">
                                <input
                                  className="w-full px-2 py-1 rounded-xl border border-neutral-200"
                                  placeholder="Note"
                                  value={r.note || ""}
                                  onChange={(e) => updateCostRow(r.id, { note: e.target.value })}
                                />
                              </div>
                            </td>
                            {["rent", "utilities", "electricity", "internet", "parking", "furniture", "other"].map((k) => (
                              <td key={k} className="py-2 pr-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  className="w-24 px-2 py-1 rounded-xl border border-neutral-200"
                                  value={r[k]}
                                  onChange={(e) => updateCostRow(r.id, { [k]: toNum(e.target.value, 0) })}
                                />
                              </td>
                            ))}
                            <td className="py-2 pr-2 font-semibold">{moneyFmt(r.total, currency)}</td>
                            <td className="py-2 pr-2">
                              <input
                                type="checkbox"
                                checked={!!r.paid}
                                onChange={(e) => updateCostRow(r.id, { paid: e.target.checked })}
                              />
                            </td>
                            <td className="py-2 pr-2 text-right">
                              <button className={btnSecondary} onClick={() => deleteCostRow(r.id)}>
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
                  <div className="font-semibold">Totals (last 12 months)</div>
                  <div className="mt-1 text-neutral-700">
                    {moneyFmt(totalsLast12.total, currency)} total • {moneyFmt(totalsLast12.rent, currency)} rent
                  </div>
                </div>
              </div>
            )}

            {tab === "issues" && (
              <div>
                <div className="font-semibold">Issues</div>
                <div className="text-sm text-neutral-600">Track defects, repair requests, timelines, and evidence references.</div>

                <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                  <div className="font-semibold">New issue</div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <label className="text-sm">
                      <div className="text-neutral-600">Date</div>
                      <input
                        type="date"
                        className={inputBase}
                        value={issueDraft.date}
                        onChange={(e) => setIssueDraft({ ...issueDraft, date: e.target.value })}
                      />
                    </label>
                    <label className="text-sm">
                      <div className="text-neutral-600">Category</div>
                      <select
                        className={inputBase}
                        value={issueDraft.category}
                        onChange={(e) => setIssueDraft({ ...issueDraft, category: e.target.value })}
                      >
                        {[
                          "Heating",
                          "Bathroom",
                          "Kitchen",
                          "Electrical",
                          "Security",
                          "Noise",
                          "Mould/Damp",
                          "Windows",
                          "Other",
                        ].map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      <div className="text-neutral-600">Severity</div>
                      <select
                        className={inputBase}
                        value={issueDraft.severity}
                        onChange={(e) => setIssueDraft({ ...issueDraft, severity: e.target.value })}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      <div className="text-neutral-600">Status</div>
                      <select
                        className={inputBase}
                        value={issueDraft.status}
                        onChange={(e) => setIssueDraft({ ...issueDraft, status: e.target.value })}
                      >
                        <option value="open">Open</option>
                        <option value="in-progress">In progress</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <label className="text-sm md:col-span-2">
                      <div className="text-neutral-600">Title</div>
                      <input
                        className={inputBase}
                        value={issueDraft.title}
                        onChange={(e) => setIssueDraft({ ...issueDraft, title: e.target.value })}
                        placeholder="Short summary"
                      />
                    </label>
                    <label className="text-sm">
                      <div className="text-neutral-600">Landlord notified</div>
                      <select
                        className={inputBase}
                        value={issueDraft.notified}
                        onChange={(e) => setIssueDraft({ ...issueDraft, notified: e.target.value })}
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      <div className="text-neutral-600">Evidence ref</div>
                      <input
                        className={inputBase}
                        value={issueDraft.evidenceRef}
                        onChange={(e) => setIssueDraft({ ...issueDraft, evidenceRef: e.target.value })}
                        placeholder="Photo 12 / Email date"
                      />
                    </label>
                  </div>

                  <label className="block text-sm mt-2">
                    <div className="text-neutral-600">Details</div>
                    <textarea
                      className={`${inputBase} min-h-[90px]`}
                      value={issueDraft.details}
                      onChange={(e) => setIssueDraft({ ...issueDraft, details: e.target.value })}
                      placeholder="What’s wrong, when it started, what was promised, etc."
                    />
                  </label>

                  <div className="mt-3 flex justify-end">
                    <button className={btnPrimary} onClick={addIssue}>
                      Save issue
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="font-semibold">Saved issues</div>
                  {issuesSorted.length === 0 ? (
                    <div className="mt-2 text-sm text-neutral-500">No issues logged yet.</div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {issuesSorted.map((x) => (
                        <div key={x.id} className="rounded-2xl border border-neutral-200 bg-white p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="font-semibold">{x.title}</div>
                              <div className="text-sm text-neutral-600">
                                {x.date} • {x.category} • Notified: {x.notified}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={"text-xs px-2 py-1 rounded-full border " + pillClass(x.status)}>
                                {x.status}
                              </span>
                              <span className={"text-xs px-2 py-1 rounded-full border " + sevClass(x.severity)}>
                                {x.severity}
                              </span>
                            </div>
                          </div>

                          {x.details && (
                            <div className="mt-2 text-sm text-neutral-700 whitespace-pre-wrap">{x.details}</div>
                          )}
                          {x.evidenceRef && (
                            <div className="mt-2 text-sm text-neutral-600">Evidence: {x.evidenceRef}</div>
                          )}

                          <div className="mt-3 flex flex-wrap gap-2 items-center justify-between">
                            <div className="flex flex-wrap gap-2">
                              <select
                                className="text-sm px-2 py-1 rounded-xl border border-neutral-200 bg-white"
                                value={x.status}
                                onChange={(e) => updateIssue(x.id, { status: e.target.value })}
                              >
                                <option value="open">Open</option>
                                <option value="in-progress">In progress</option>
                                <option value="resolved">Resolved</option>
                              </select>
                              <select
                                className="text-sm px-2 py-1 rounded-xl border border-neutral-200 bg-white"
                                value={x.severity}
                                onChange={(e) => updateIssue(x.id, { severity: e.target.value })}
                              >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                              </select>
                            </div>
                            <button className={btnSecondary} onClick={() => deleteIssue(x.id)}>
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "incidents" && (
              <div>
                <div className="font-semibold">Incident log</div>
                <div className="text-sm text-neutral-600">Chronological log for everything that happens (visits, access, threats, heating switched off, etc.).</div>

                <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                  <div className="font-semibold">New incident</div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <label className="text-sm">
                      <div className="text-neutral-600">Date</div>
                      <input
                        type="date"
                        className={inputBase}
                        value={incidentDraft.date}
                        onChange={(e) => setIncidentDraft({ ...incidentDraft, date: e.target.value })}
                      />
                    </label>
                    <label className="text-sm">
                      <div className="text-neutral-600">Time (optional)</div>
                      <input
                        type="time"
                        className={inputBase}
                        value={incidentDraft.time}
                        onChange={(e) => setIncidentDraft({ ...incidentDraft, time: e.target.value })}
                      />
                    </label>
                    <label className="text-sm md:col-span-2">
                      <div className="text-neutral-600">Who</div>
                      <input
                        className={inputBase}
                        value={incidentDraft.who}
                        onChange={(e) => setIncidentDraft({ ...incidentDraft, who: e.target.value })}
                        placeholder="Name(s) involved"
                      />
                    </label>
                  </div>

                  <label className="block text-sm mt-2">
                    <div className="text-neutral-600">What happened</div>
                    <textarea
                      className={`${inputBase} min-h-[90px]`}
                      value={incidentDraft.what}
                      onChange={(e) => setIncidentDraft({ ...incidentDraft, what: e.target.value })}
                      placeholder="Write it like a report: facts first."
                    />
                  </label>

                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label className="text-sm">
                      <div className="text-neutral-600">Impact / consequence</div>
                      <input
                        className={inputBase}
                        value={incidentDraft.impact}
                        onChange={(e) => setIncidentDraft({ ...incidentDraft, impact: e.target.value })}
                        placeholder="e.g., no heat, damage, harassment"
                      />
                    </label>
                    <label className="text-sm">
                      <div className="text-neutral-600">Evidence ref</div>
                      <input
                        className={inputBase}
                        value={incidentDraft.evidenceRef}
                        onChange={(e) => setIncidentDraft({ ...incidentDraft, evidenceRef: e.target.value })}
                        placeholder="Photo / email / witness"
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button className={btnPrimary} onClick={addIncident}>
                      Save incident
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="font-semibold">Saved incidents</div>
                  {incidentsSorted.length === 0 ? (
                    <div className="mt-2 text-sm text-neutral-500">No incidents logged yet.</div>
                  ) : (
                    <div className="mt-3 overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-neutral-600">
                          <tr className="border-b">
                            <th className="py-2 pr-2">Date</th>
                            <th className="py-2 pr-2">Time</th>
                            <th className="py-2 pr-2">Who</th>
                            <th className="py-2 pr-2">What</th>
                            <th className="py-2 pr-2">Evidence</th>
                            <th className="py-2 pr-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {incidentsSorted.map((x) => (
                            <tr key={x.id} className="border-b last:border-b-0">
                              <td className="py-2 pr-2 font-medium">{x.date}</td>
                              <td className="py-2 pr-2">{x.time || "-"}</td>
                              <td className="py-2 pr-2">{x.who || "-"}</td>
                              <td className="py-2 pr-2">{x.what ? String(x.what).slice(0, 80) : "-"}</td>
                              <td className="py-2 pr-2">{x.evidenceRef || "-"}</td>
                              <td className="py-2 pr-2 text-right">
                                <button className={btnSecondary} onClick={() => deleteIncident(x.id)}>
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-2 text-xs text-neutral-500">Tip: keep the full detail in the entry; the table truncates for readability.</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "evidence" && (
              <div>
                <div className="font-semibold">Evidence</div>
                <div className="text-sm text-neutral-600">A simple index of photos, emails, letters, screenshots, audio files, etc.</div>

                <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                  <div className="font-semibold">New evidence</div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <label className="text-sm">
                      <div className="text-neutral-600">Date</div>
                      <input
                        type="date"
                        className={inputBase}
                        value={evidenceDraft.date}
                        onChange={(e) => setEvidenceDraft({ ...evidenceDraft, date: e.target.value })}
                      />
                    </label>
                    <label className="text-sm">
                      <div className="text-neutral-600">Type</div>
                      <select
                        className={inputBase}
                        value={evidenceDraft.type}
                        onChange={(e) => setEvidenceDraft({ ...evidenceDraft, type: e.target.value })}
                      >
                        {["Photo", "Email", "Letter", "WhatsApp", "Audio", "Video", "Other"].map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm md:col-span-2">
                      <div className="text-neutral-600">Reference</div>
                      <input
                        className={inputBase}
                        value={evidenceDraft.ref}
                        onChange={(e) => setEvidenceDraft({ ...evidenceDraft, ref: e.target.value })}
                        placeholder="e.g., Photo 12 / Email 2025-11-24 / Letter Einwurf 24.11.2025"
                      />
                    </label>
                  </div>

                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label className="text-sm">
                      <div className="text-neutral-600">Description</div>
                      <input
                        className={inputBase}
                        value={evidenceDraft.description}
                        onChange={(e) => setEvidenceDraft({ ...evidenceDraft, description: e.target.value })}
                        placeholder="Short description"
                      />
                    </label>
                    <label className="text-sm">
                      <div className="text-neutral-600">Link (optional)</div>
                      <input
                        className={inputBase}
                        value={evidenceDraft.link}
                        onChange={(e) => setEvidenceDraft({ ...evidenceDraft, link: e.target.value })}
                        placeholder="URL / file path / cloud link"
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button className={btnPrimary} onClick={addEvidence}>
                      Save evidence
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="font-semibold">Saved evidence</div>
                  {evidenceSorted.length === 0 ? (
                    <div className="mt-2 text-sm text-neutral-500">No evidence items yet.</div>
                  ) : (
                    <div className="mt-3 overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-neutral-600">
                          <tr className="border-b">
                            <th className="py-2 pr-2">Date</th>
                            <th className="py-2 pr-2">Type</th>
                            <th className="py-2 pr-2">Ref</th>
                            <th className="py-2 pr-2">Description</th>
                            <th className="py-2 pr-2">Link</th>
                            <th className="py-2 pr-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {evidenceSorted.map((x) => (
                            <tr key={x.id} className="border-b last:border-b-0">
                              <td className="py-2 pr-2 font-medium">{x.date}</td>
                              <td className="py-2 pr-2">{x.type}</td>
                              <td className="py-2 pr-2">{x.ref}</td>
                              <td className="py-2 pr-2">{x.description || "-"}</td>
                              <td className="py-2 pr-2">
                                {x.link ? (
                                  <a className="underline" href={x.link} target="_blank" rel="noreferrer">
                                    open
                                  </a>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td className="py-2 pr-2 text-right">
                                <button className={btnSecondary} onClick={() => deleteEvidence(x.id)}>
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Preview modal */}
        {previewOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-3 z-50">
            <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl border border-neutral-200 overflow-hidden">
              <div className="p-3 border-b flex items-center justify-between">
                <div className="font-semibold">Preview — RentIt report</div>
                <div className="flex gap-2">
                  <button className={btnSecondary} onClick={printPreview}>
                    Print / Save PDF
                  </button>
                  <button className={btnPrimary} onClick={() => setPreviewOpen(false)}>
                    Close
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-auto max-h-[80vh]">
                <div className="text-xl font-bold">{profile.org || "ToolStack"}</div>
                <div className="text-sm text-neutral-600">RentIt — Rental Record</div>
                <div className="mt-2 h-[2px] w-72 rounded-full bg-gradient-to-r from-lime-400/0 via-lime-400 to-emerald-400/0" />

                <div className="mt-3 text-sm">
                  <div>
                    <span className="text-neutral-600">Prepared by:</span> {profile.user || "-"}
                  </div>
                  <div>
                    <span className="text-neutral-600">Generated:</span> {new Date().toLocaleString()}
                  </div>
                  <div>
                    <span className="text-neutral-600">Unit:</span> {state.unit.label || "-"}
                  </div>
                  <div>
                    <span className="text-neutral-600">Address:</span> {state.unit.address || "-"}
                  </div>
                  <div>
                    <span className="text-neutral-600">Landlord:</span> {state.unit.landlordName || "-"}
                  </div>
                  <div>
                    <span className="text-neutral-600">Landlord email:</span> {state.unit.landlordEmail || "-"}
                  </div>
                  <div>
                    <span className="text-neutral-600">Landlord phone:</span> {[state.unit.landlordPhone1, state.unit.landlordPhone2].filter(Boolean).join(" / ") || "-"}
                  </div>
                  <div>
                    <span className="text-neutral-600">Landlord address:</span> {state.unit.landlordAddress || "-"}
                  </div>
                  <div>
                    <span className="text-neutral-600">Agent:</span> {state.unit.agentName || "-"}
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-neutral-200 p-3 text-sm">
                  <div className="font-semibold">Costs (last 12 months)</div>
                  <div className="mt-1 text-neutral-700">
                    Total: <span className="font-semibold">{moneyFmt(totalsLast12.total, currency)}</span>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-neutral-200 p-3 text-sm">
                  <div className="font-semibold">Open issues</div>
                  <div className="mt-1 text-neutral-700">{openIssuesCount}</div>
                </div>

                <div className="mt-4 rounded-2xl border border-neutral-200 p-3 text-sm">
                  <div className="font-semibold">Issues (latest 10)</div>
                  <div className="mt-2 space-y-2">
                    {issuesSorted.slice(0, 10).map((x) => (
                      <div key={x.id} className="border-t pt-2 first:border-t-0 first:pt-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">{x.title}</div>
                          <div className="flex items-center gap-2">
                            <span className={"text-xs px-2 py-1 rounded-full border " + pillClass(x.status)}>
                              {x.status}
                            </span>
                            <span className={"text-xs px-2 py-1 rounded-full border " + sevClass(x.severity)}>
                              {x.severity}
                            </span>
                          </div>
                        </div>
                        <div className="text-neutral-600">{x.date} • {x.category} • Evidence: {x.evidenceRef || "-"}</div>
                        {x.details && <div className="text-neutral-700 whitespace-pre-wrap mt-1">{x.details}</div>}
                      </div>
                    ))}
                    {issuesSorted.length === 0 && <div className="text-neutral-500">No issues.</div>}
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-neutral-200 p-3 text-sm">
                  <div className="font-semibold">Incidents (latest 10)</div>
                  <div className="mt-2 space-y-2">
                    {incidentsSorted.slice(0, 10).map((x) => (
                      <div key={x.id} className="border-t pt-2 first:border-t-0 first:pt-0">
                        <div className="font-medium">{x.date} {x.time ? `(${x.time})` : ""}</div>
                        <div className="text-neutral-700 whitespace-pre-wrap">{x.what}</div>
                        <div className="text-neutral-600">Who: {x.who || "-"} • Evidence: {x.evidenceRef || "-"}</div>
                      </div>
                    ))}
                    {incidentsSorted.length === 0 && <div className="text-neutral-500">No incidents.</div>}
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
                  <div>
                    <div className="text-neutral-600">Tenant</div>
                    <div className="mt-8 border-t pt-2">Signature</div>
                  </div>
                  <div>
                    <div className="text-neutral-600">Landlord / Agent</div>
                    <div className="mt-8 border-t pt-2">Signature</div>
                  </div>
                </div>

                <div className="mt-6 text-xs text-neutral-500">
                  Storage key: <span className="font-mono">{KEY}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer link */}
        <div className="mt-6 text-sm text-neutral-600">
          <a className="underline hover:text-neutral-900" href={HUB_URL} target="_blank" rel="noreferrer">
            Return to ToolStack hub
          </a>
        </div>
      </div>
    </div>
  );
}
