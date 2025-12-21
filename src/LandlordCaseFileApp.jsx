import React, { useEffect, useMemo, useRef, useState } from "react";

// Landlord Case File – Single-file prototype
// - Runs fully in-browser
// - Saves to localStorage
// - Lets you track: cases, defects, incidents, evidence links, attachments, letters, exports
// - Print any report page to PDF using your browser

const LS_KEY = "landlord_case_file_app_v1";

const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Math.random().toString(16).slice(2)}_${Date.now()}`);

const nowLocal = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`; // for <input type="datetime-local">
};

const safeParse = (s, fallback) => {
  try {
    const v = JSON.parse(s);
    return v ?? fallback;
  } catch {
    return fallback;
  }
};

const downloadText = (filename, text, mime = "application/json") => {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const badgeClass = (tone) => {
  switch (tone) {
    case "open":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "resolved":
      return "bg-emerald-100 text-emerald-900 border-emerald-200";
    case "urgent":
      return "bg-rose-100 text-rose-900 border-rose-200";
    default:
      return "bg-slate-100 text-slate-900 border-slate-200";
  }
};

const TABS = [
  { id: "snapshot", label: "Snapshot" },
  { id: "incidents", label: "Incidents" },
  { id: "defects", label: "Defects" },
  { id: "documents", label: "Documents" },
  { id: "letters", label: "Letters" },
  { id: "export", label: "Export" },
];

const LETTER_TEMPLATES = {
  repair_request: {
    name: "Repair Request (German/English – rough draft)",
    build: ({ c, defects }) => {
      const openDefects = defects.filter((d) => d.status === "open");
      const defectLines = openDefects
        .map(
          (d, i) =>
            `${i + 1}. ${d.title}${d.room ? ` (Room: ${d.room})` : ""} — since ${d.startDate || "[date]"}`
        )
        .join("\n");

      const en = `Subject: Request to remedy defects – ${c.address || "[address]"}\n\nDear ${c.landlordName || "[Landlord/Representative]"},\n\nI am requesting that the following defects in my rented accommodation be remedied without delay:\n\n${defectLines || "[List defects here]"}\n\nPlease confirm a repair appointment date and the responsible company/technician.\n\nKind regards,\n${c.tenantName || "[Your name]"}`;

      const de = `Betreff: Aufforderung zur Mängelbeseitigung – ${c.address || "[Adresse]"}\n\nSehr geehrte/r ${c.landlordName || "[Vermieter/Bevollmächtigte/r]"},\n\nhiermit fordere ich Sie auf, die folgenden Mängel in meinem Mietobjekt unverzüglich zu beseitigen:\n\n${defectLines || "[Mängel hier auflisten]"}\n\nBitte bestätigen Sie mir einen Reparaturtermin sowie die zuständige Firma/den Techniker.\n\nMit freundlichen Grüßen\n${c.tenantName || "[Ihr Name]"}`;

      return { subject: `Repair request – ${c.address || "[address]"}`, body: `${en}\n\n— — —\n\n${de}` };
    },
  },

  rent_reduction_notice: {
    name: "Rent Reduction Notice (German/English – rough draft)",
    build: ({ c, defects }) => {
      const openDefects = defects.filter((d) => d.status === "open");
      const total = openDefects.reduce((acc, d) => acc + (Number(d.impactPercent) || 0), 0);
      const defectLines = openDefects
        .map(
          (d, i) =>
            `${i + 1}. ${d.title}${d.room ? ` (Room: ${d.room})` : ""} — since ${d.startDate || "[date]"} — proposed reduction: ${d.impactPercent || 0}%`
        )
        .join("\n");

      const warm = Number(c.rentWarm) || 0;
      const reduced = warm ? Math.round((warm * (1 - Math.min(total, 100) / 100)) * 100) / 100 : 0;

      const en = `Subject: Notice of rent reduction due to defects – ${c.address || "[address]"}\n\nDear ${c.landlordName || "[Landlord/Representative]"},\n\nDue to the ongoing defects listed below, I am exercising my right to a rent reduction for the period in which the defects persist.\n\nDefects:\n${defectLines || "[List defects here]"}\n\nProposed total reduction: ${total}%\nWarm rent (current): ${warm ? `€${warm}` : "[amount]"}\nReduced payment (proposal): ${warm ? `€${reduced}` : "[amount]"}\n\nI request immediate remedy of the defects. Please confirm next steps and a repair timeline in writing.\n\nKind regards,\n${c.tenantName || "[Your name]"}`;

      const de = `Betreff: Anzeige der Mietminderung wegen Mängeln – ${c.address || "[Adresse]"}\n\nSehr geehrte/r ${c.landlordName || "[Vermieter/Bevollmächtigte/r]"},\n\naufgrund der nachfolgend aufgeführten, fortbestehenden Mängel mache ich eine Mietminderung für den Zeitraum geltend, in dem die Mängel bestehen.\n\nMängel:\n${defectLines || "[Mängel hier auflisten]"}\n\nVorgeschlagene Gesamtsumme der Mietminderung: ${total}%\nWarmmiete (aktuell): ${warm ? `€${warm}` : "[Betrag]"}\nZahlbetrag (Vorschlag): ${warm ? `€${reduced}` : "[Betrag]"}\n\nIch bitte um umgehende Mängelbeseitigung. Bitte bestätigen Sie das weitere Vorgehen sowie einen Reparaturzeitplan schriftlich.\n\nMit freundlichen Grüßen\n${c.tenantName || "[Ihr Name]"}`;

      return {
        subject: `Rent reduction notice – ${c.address || "[address]"}`,
        body: `${en}\n\n— — —\n\n${de}`,
      };
    },
  },
};

function Section({ title, right, children }) {
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-slate-200">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="font-semibold text-slate-900">{title}</div>
        <div className="flex items-center gap-2">{right}</div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-medium text-slate-700">{label}</div>
      {children}
      {hint ? <div className="text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

function SmallButton({ children, onClick, tone = "default", disabled }) {
  const cls =
    tone === "danger"
      ? "bg-rose-600 hover:bg-rose-700 text-white"
      : tone === "primary"
        ? "bg-slate-900 hover:bg-slate-800 text-white"
        : "bg-slate-100 hover:bg-slate-200 text-slate-900";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
    >
      {children}
    </button>
  );
}

function Pill({ children, tone = "default" }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs border ${badgeClass(tone)}`}>
      {children}
    </span>
  );
}

function EmptyState({ title, subtitle, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center">
      <div className="font-semibold text-slate-900">{title}</div>
      <div className="text-sm text-slate-600 mt-1">{subtitle}</div>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export default function LandlordCaseFileApp() {
  const [app, setApp] = useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    const base = {
      activeCaseId: null,
      cases: [],
      ui: { tab: "snapshot", query: "" },
    };
    return saved ? safeParse(saved, base) : base;
  });

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const notify = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(app));
    } catch {
      // localStorage full
      notify("Storage is full. Export and delete large attachments.");
    }
  }, [app]);

  const activeCase = useMemo(
    () => app.cases.find((c) => c.id === app.activeCaseId) || null,
    [app.cases, app.activeCaseId]
  );

  const filteredCases = useMemo(() => {
    const q = (app.ui?.query || "").trim().toLowerCase();
    if (!q) return app.cases;
    return app.cases.filter((c) =>
      [c.title, c.address, c.landlordName, c.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [app.cases, app.ui?.query]);

  const createCase = () => {
    const id = uid();
    const c = {
      id,
      title: `Case ${app.cases.length + 1}`,
      address: "",
      landlordName: "",
      tenantName: "",
      rentWarm: "",
      createdAt: new Date().toISOString(),
      notes: "",
      defects: [],
      incidents: [],
      documents: [],
      letters: [],
    };
    setApp((a) => ({ ...a, activeCaseId: id, cases: [c, ...a.cases] }));
    notify("New case created");
  };

  const updateActiveCase = (patch) => {
    if (!activeCase) return;
    setApp((a) => ({
      ...a,
      cases: a.cases.map((c) => (c.id === activeCase.id ? { ...c, ...patch } : c)),
    }));
  };

  const deleteCase = () => {
    if (!activeCase) return;
    const ok = window.confirm("Delete this entire case? This cannot be undone.");
    if (!ok) return;
    setApp((a) => {
      const remaining = a.cases.filter((c) => c.id !== activeCase.id);
      return {
        ...a,
        cases: remaining,
        activeCaseId: remaining[0]?.id || null,
        ui: { ...a.ui, tab: "snapshot" },
      };
    });
    notify("Case deleted");
  };

  const addDefect = () => {
    if (!activeCase) return;
    const d = {
      id: uid(),
      title: "Heating defect (room radiator not working)",
      room: "",
      startDate: "",
      status: "open",
      impactPercent: 0,
      notes: "",
      createdAt: new Date().toISOString(),
    };
    updateActiveCase({ defects: [d, ...(activeCase.defects || [])] });
    notify("Defect added");
  };

  const updateDefect = (id, patch) => {
    updateActiveCase({
      defects: (activeCase.defects || []).map((d) => (d.id === id ? { ...d, ...patch } : d)),
    });
  };

  const deleteDefect = (id) => {
    const ok = window.confirm("Delete this defect?");
    if (!ok) return;
    updateActiveCase({ defects: (activeCase.defects || []).filter((d) => d.id !== id) });
    notify("Defect deleted");
  };

  const addIncident = () => {
    if (!activeCase) return;
    const it = {
      id: uid(),
      dateTime: nowLocal(),
      type: "Heating / utilities",
      summary: "",
      details: "",
      tags: [],
      evidence: [],
      attachments: [],
      urgency: "open", // open / urgent / resolved
      createdAt: new Date().toISOString(),
    };
    updateActiveCase({ incidents: [it, ...(activeCase.incidents || [])] });
    notify("Incident added");
  };

  const updateIncident = (id, patch) => {
    updateActiveCase({
      incidents: (activeCase.incidents || []).map((i) => (i.id === id ? { ...i, ...patch } : i)),
    });
  };

  const deleteIncident = (id) => {
    const ok = window.confirm("Delete this incident?");
    if (!ok) return;
    updateActiveCase({ incidents: (activeCase.incidents || []).filter((i) => i.id !== id) });
    notify("Incident deleted");
  };

  const addEvidenceLink = (incidentId) => {
    const i = (activeCase.incidents || []).find((x) => x.id === incidentId);
    if (!i) return;
    const ev = { id: uid(), label: "", url: "" };
    updateIncident(incidentId, { evidence: [ev, ...(i.evidence || [])] });
  };

  const updateEvidenceLink = (incidentId, evId, patch) => {
    const i = (activeCase.incidents || []).find((x) => x.id === incidentId);
    if (!i) return;
    updateIncident(incidentId, {
      evidence: (i.evidence || []).map((e) => (e.id === evId ? { ...e, ...patch } : e)),
    });
  };

  const deleteEvidenceLink = (incidentId, evId) => {
    const i = (activeCase.incidents || []).find((x) => x.id === incidentId);
    if (!i) return;
    updateIncident(incidentId, { evidence: (i.evidence || []).filter((e) => e.id !== evId) });
  };

  const addAttachment = async (incidentId, file) => {
    if (!file) return;
    // Note: localStorage is limited. Keep attachments small.
    const maxMB = 2;
    if (file.size > maxMB * 1024 * 1024) {
      notify(`File too large for this prototype (>${maxMB}MB).`);
      return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const i = (activeCase.incidents || []).find((x) => x.id === incidentId);
    if (!i) return;
    const att = { id: uid(), name: file.name, type: file.type, size: file.size, dataUrl };
    updateIncident(incidentId, { attachments: [att, ...(i.attachments || [])] });
    notify("Attachment added");
  };

  const deleteAttachment = (incidentId, attId) => {
    const i = (activeCase.incidents || []).find((x) => x.id === incidentId);
    if (!i) return;
    updateIncident(incidentId, { attachments: (i.attachments || []).filter((a) => a.id !== attId) });
    notify("Attachment removed");
  };

  const addDocument = () => {
    if (!activeCase) return;
    const doc = { id: uid(), name: "", url: "", notes: "", createdAt: new Date().toISOString() };
    updateActiveCase({ documents: [doc, ...(activeCase.documents || [])] });
    notify("Document reference added");
  };

  const updateDocument = (id, patch) => {
    updateActiveCase({
      documents: (activeCase.documents || []).map((d) => (d.id === id ? { ...d, ...patch } : d)),
    });
  };

  const deleteDocument = (id) => {
    const ok = window.confirm("Delete this document reference?");
    if (!ok) return;
    updateActiveCase({ documents: (activeCase.documents || []).filter((d) => d.id !== id) });
    notify("Document removed");
  };

  const generateLetter = (templateKey) => {
    if (!activeCase) return;
    const t = LETTER_TEMPLATES[templateKey];
    if (!t) return;
    const built = t.build({ c: activeCase, defects: activeCase.defects || [] });
    const letter = {
      id: uid(),
      type: templateKey,
      title: t.name,
      subject: built.subject,
      body: built.body,
      createdAt: new Date().toISOString(),
    };
    updateActiveCase({ letters: [letter, ...(activeCase.letters || [])] });
    notify("Letter generated");
  };

  const updateLetter = (id, patch) => {
    updateActiveCase({
      letters: (activeCase.letters || []).map((l) => (l.id === id ? { ...l, ...patch } : l)),
    });
  };

  const deleteLetter = (id) => {
    const ok = window.confirm("Delete this letter draft?");
    if (!ok) return;
    updateActiveCase({ letters: (activeCase.letters || []).filter((l) => l.id !== id) });
    notify("Letter deleted");
  };

  const exportActiveCaseJSON = () => {
    if (!activeCase) return;
    const name = (activeCase.title || "case").replaceAll(/[^a-z0-9\-_]+/gi, "-");
    downloadText(`${name}-export.json`, JSON.stringify(activeCase, null, 2));
  };

  const exportAllJSON = () => {
    downloadText("landlord-casefile-all.json", JSON.stringify(app, null, 2));
  };

  const importJSON = async (file) => {
    if (!file) return;
    const text = await file.text();
    const parsed = safeParse(text, null);
    if (!parsed) {
      notify("Invalid JSON");
      return;
    }
    // Accept either full app export or a single case
    if (parsed.cases && Array.isArray(parsed.cases)) {
      setApp(parsed);
      notify("Imported full app data");
      return;
    }
    if (parsed.id && parsed.title && parsed.defects && parsed.incidents) {
      setApp((a) => ({
        ...a,
        cases: [parsed, ...a.cases.filter((c) => c.id !== parsed.id)],
        activeCaseId: parsed.id,
      }));
      notify("Imported case into your app");
      return;
    }
    notify("JSON recognized, but format not supported");
  };

  const wipeAll = () => {
    const ok = window.confirm("Wipe ALL data from this app? This cannot be undone.");
    if (!ok) return;
    setApp({ activeCaseId: null, cases: [], ui: { tab: "snapshot", query: "" } });
    notify("All data wiped");
  };

  const openDefects = (activeCase?.defects || []).filter((d) => d.status === "open");
  const resolvedDefects = (activeCase?.defects || []).filter((d) => d.status === "resolved");
  const openIncidents = (activeCase?.incidents || []).filter((i) => i.urgency !== "resolved");

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold text-slate-900">Landlord Case File</div>
            <div className="text-sm text-slate-600">Local prototype • saves in your browser • export anytime</div>
          </div>
          <div className="flex items-center gap-2">
            <SmallButton tone="primary" onClick={createCase}>
              + New case
            </SmallButton>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Sidebar */}
          <div className="lg:col-span-4">
            <Section
              title="Cases"
              right={
                <input
                  value={app.ui?.query || ""}
                  onChange={(e) => setApp((a) => ({ ...a, ui: { ...(a.ui || {}), query: e.target.value } }))}
                  placeholder="Search"
                  className="w-44 rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
                />
              }
            >
              {filteredCases.length === 0 ? (
                <EmptyState
                  title="No cases yet"
                  subtitle="Create your first case to start tracking defects, incidents, and letters."
                  action={
                    <SmallButton tone="primary" onClick={createCase}>
                      Create case
                    </SmallButton>
                  }
                />
              ) : (
                <div className="space-y-2">
                  {filteredCases.map((c) => {
                    const isActive = c.id === app.activeCaseId;
                    const openD = (c.defects || []).filter((d) => d.status === "open").length;
                    const openI = (c.incidents || []).filter((i) => i.urgency !== "resolved").length;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setApp((a) => ({ ...a, activeCaseId: c.id, ui: { ...(a.ui || {}), tab: a.ui?.tab || "snapshot" } }))}
                        className={`w-full text-left rounded-2xl border px-3 py-3 transition ${
                          isActive
                            ? "border-slate-900 bg-white"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">{c.title || "Untitled case"}</div>
                            <div className="text-xs text-slate-600 mt-1">{c.address || "(no address yet)"}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {openD ? <Pill tone="open">{openD} open defects</Pill> : <Pill>0 open defects</Pill>}
                            {openI ? <Pill tone="urgent">{openI} active incidents</Pill> : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Section>

            <div className="mt-4">
              <Section
                title="Quick actions"
                right={
                  <SmallButton tone="danger" onClick={wipeAll}>
                    Wipe all
                  </SmallButton>
                }
              >
                <div className="flex flex-wrap gap-2">
                  <SmallButton onClick={exportAllJSON}>Export all (JSON)</SmallButton>
                  <label className="px-3 py-2 rounded-xl text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-900 cursor-pointer">
                    Import JSON
                    <input
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={(e) => importJSON(e.target.files?.[0] || null)}
                    />
                  </label>
                  <SmallButton onClick={() => window.print()}>Print current view</SmallButton>
                </div>
                <div className="text-xs text-slate-500 mt-3">
                  Tip: attachments use browser storage and can fill up quickly. If you hit storage limits, export then remove attachments.
                </div>
              </Section>
            </div>
          </div>

          {/* Main */}
          <div className="lg:col-span-8">
            {!activeCase ? (
              <EmptyState
                title="Pick or create a case"
                subtitle="Choose a case on the left, or create a new one."
                action={
                  <SmallButton tone="primary" onClick={createCase}>
                    + New case
                  </SmallButton>
                }
              />
            ) : (
              <div className="space-y-4">
                <Section
                  title={
                    <div className="flex items-center gap-3">
                      <span>{activeCase.title || "Untitled case"}</span>
                      <Pill tone={openDefects.length ? "open" : "resolved"}>
                        {openDefects.length ? `${openDefects.length} open defects` : "No open defects"}
                      </Pill>
                    </div>
                  }
                  right={
                    <div className="flex items-center gap-2">
                      <SmallButton onClick={exportActiveCaseJSON}>Export case</SmallButton>
                      <SmallButton tone="danger" onClick={deleteCase}>
                        Delete
                      </SmallButton>
                    </div>
                  }
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Case title">
                      <input
                        value={activeCase.title || ""}
                        onChange={(e) => updateActiveCase({ title: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                      />
                    </Field>
                    <Field label="Address">
                      <input
                        value={activeCase.address || ""}
                        onChange={(e) => updateActiveCase({ address: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                      />
                    </Field>
                    <Field label="Landlord / Representative">
                      <input
                        value={activeCase.landlordName || ""}
                        onChange={(e) => updateActiveCase({ landlordName: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                      />
                    </Field>
                    <Field label="Tenant name">
                      <input
                        value={activeCase.tenantName || ""}
                        onChange={(e) => updateActiveCase({ tenantName: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                      />
                    </Field>
                    <Field label="Warm rent (€)" hint="Used for draft calculations in the rent reduction letter.">
                      <input
                        value={activeCase.rentWarm || ""}
                        onChange={(e) => updateActiveCase({ rentWarm: e.target.value })}
                        inputMode="decimal"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                      />
                    </Field>
                    <Field label="Notes">
                      <input
                        value={activeCase.notes || ""}
                        onChange={(e) => updateActiveCase({ notes: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                      />
                    </Field>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {TABS.map((t) => {
                      const active = (app.ui?.tab || "snapshot") === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setApp((a) => ({ ...a, ui: { ...(a.ui || {}), tab: t.id } }))}
                          className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${
                            active
                              ? "bg-slate-900 text-white border-slate-900"
                              : "bg-white text-slate-900 border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </Section>

                {/* TAB CONTENT */}
                {(app.ui?.tab || "snapshot") === "snapshot" && (
                  <Section
                    title="Snapshot"
                    right={
                      <div className="flex items-center gap-2">
                        <SmallButton tone="primary" onClick={addIncident}>
                          + Incident
                        </SmallButton>
                        <SmallButton tone="primary" onClick={addDefect}>
                          + Defect
                        </SmallButton>
                      </div>
                    }
                  >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="text-sm text-slate-600">Open defects</div>
                        <div className="text-3xl font-semibold text-slate-900 mt-1">{openDefects.length}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="text-sm text-slate-600">Resolved defects</div>
                        <div className="text-3xl font-semibold text-slate-900 mt-1">{resolvedDefects.length}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="text-sm text-slate-600">Active incidents</div>
                        <div className="text-3xl font-semibold text-slate-900 mt-1">{openIncidents.length}</div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="font-semibold text-slate-900">Next actions</div>
                        <ul className="mt-2 space-y-2 text-sm text-slate-700 list-disc pl-5">
                          <li>Add every landlord/rep contact attempt as an incident (date + summary + evidence).</li>
                          <li>Keep defects separate from incidents: defects are the ongoing issues; incidents are the timeline.</li>
                          <li>Export your case JSON weekly so you always have backups.</li>
                        </ul>
                      </div>
                    </div>
                  </Section>
                )}

                {(app.ui?.tab || "snapshot") === "incidents" && (
                  <Section
                    title="Incidents"
                    right={
                      <div className="flex items-center gap-2">
                        <SmallButton tone="primary" onClick={addIncident}>
                          + Add incident
                        </SmallButton>
                      </div>
                    }
                  >
                    {(activeCase.incidents || []).length === 0 ? (
                      <EmptyState
                        title="No incidents yet"
                        subtitle="Incidents are your timeline: messages, visits, heating changes, repairs, threats, anything noteworthy."
                        action={
                          <SmallButton tone="primary" onClick={addIncident}>
                            Add first incident
                          </SmallButton>
                        }
                      />
                    ) : (
                      <div className="space-y-3">
                        {(activeCase.incidents || []).map((i) => (
                          <div key={i.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <Pill tone={i.urgency || "open"}>{i.urgency || "open"}</Pill>
                                <div className="text-sm text-slate-600">{i.type || "Incident"}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <SmallButton
                                  tone="danger"
                                  onClick={() => deleteIncident(i.id)}
                                >
                                  Delete
                                </SmallButton>
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                              <Field label="Date/time">
                                <input
                                  type="datetime-local"
                                  value={i.dateTime || ""}
                                  onChange={(e) => updateIncident(i.id, { dateTime: e.target.value })}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                                />
                              </Field>
                              <Field label="Type">
                                <input
                                  value={i.type || ""}
                                  onChange={(e) => updateIncident(i.id, { type: e.target.value })}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                                  placeholder="Heating / access / repairs / neighbour..."
                                />
                              </Field>
                              <Field label="Status">
                                <select
                                  value={i.urgency || "open"}
                                  onChange={(e) => updateIncident(i.id, { urgency: e.target.value })}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                                >
                                  <option value="open">open</option>
                                  <option value="urgent">urgent</option>
                                  <option value="resolved">resolved</option>
                                </select>
                              </Field>
                            </div>

                            <div className="mt-3 grid grid-cols-1 gap-3">
                              <Field label="Summary (1 line)">
                                <input
                                  value={i.summary || ""}
                                  onChange={(e) => updateIncident(i.id, { summary: e.target.value })}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                                  placeholder="Example: Radiator still cold; reported to Daniel by phone"
                                />
                              </Field>
                              <Field label="Details">
                                <textarea
                                  value={i.details || ""}
                                  onChange={(e) => updateIncident(i.id, { details: e.target.value })}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white min-h-[110px]"
                                  placeholder="Write what happened, who was present, what was said, and what you did next."
                                />
                              </Field>
                            </div>

                            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                              <div className="rounded-2xl border border-slate-200 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="font-semibold text-slate-900">Evidence links</div>
                                  <SmallButton onClick={() => addEvidenceLink(i.id)}>+ Add</SmallButton>
                                </div>
                                {(i.evidence || []).length === 0 ? (
                                  <div className="text-sm text-slate-600 mt-2">Add WhatsApp screenshots, photos in Drive, letter scans, etc.</div>
                                ) : (
                                  <div className="mt-3 space-y-2">
                                    {(i.evidence || []).map((e) => (
                                      <div key={e.id} className="grid grid-cols-1 md:grid-cols-12 gap-2">
                                        <input
                                          value={e.label || ""}
                                          onChange={(ev) => updateEvidenceLink(i.id, e.id, { label: ev.target.value })}
                                          placeholder="Label"
                                          className="md:col-span-4 rounded-xl border border-slate-200 px-3 py-2 bg-white"
                                        />
                                        <input
                                          value={e.url || ""}
                                          onChange={(ev) => updateEvidenceLink(i.id, e.id, { url: ev.target.value })}
                                          placeholder="URL"
                                          className="md:col-span-7 rounded-xl border border-slate-200 px-3 py-2 bg-white"
                                        />
                                        <button
                                          onClick={() => deleteEvidenceLink(i.id, e.id)}
                                          className="md:col-span-1 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 px-3 py-2 text-sm"
                                          title="Remove"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="rounded-2xl border border-slate-200 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="font-semibold text-slate-900">Attachments</div>
                                  <label className="px-3 py-2 rounded-xl text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-900 cursor-pointer">
                                    + Add file
                                    <input
                                      type="file"
                                      accept="image/*,application/pdf"
                                      className="hidden"
                                      onChange={(e) => addAttachment(i.id, e.target.files?.[0] || null)}
                                    />
                                  </label>
                                </div>
                                {(i.attachments || []).length === 0 ? (
                                  <div className="text-sm text-slate-600 mt-2">Small files only (prototype limit). Use links for large docs.</div>
                                ) : (
                                  <div className="mt-3 space-y-2">
                                    {(i.attachments || []).map((a) => (
                                      <div key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-2">
                                        <div className="min-w-0">
                                          <div className="text-sm font-medium text-slate-900 truncate">{a.name}</div>
                                          <div className="text-xs text-slate-600">{Math.round((a.size || 0) / 1024)} KB</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {String(a.type || "").startsWith("image/") ? (
                                            <a
                                              href={a.dataUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="px-3 py-2 rounded-xl text-sm bg-white border border-slate-200 hover:border-slate-300"
                                            >
                                              View
                                            </a>
                                          ) : (
                                            <a
                                              href={a.dataUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="px-3 py-2 rounded-xl text-sm bg-white border border-slate-200 hover:border-slate-300"
                                            >
                                              Open
                                            </a>
                                          )}
                                          <SmallButton tone="danger" onClick={() => deleteAttachment(i.id, a.id)}>
                                            Remove
                                          </SmallButton>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                )}

                {(app.ui?.tab || "snapshot") === "defects" && (
                  <Section
                    title="Defects"
                    right={
                      <div className="flex items-center gap-2">
                        <SmallButton tone="primary" onClick={addDefect}>
                          + Add defect
                        </SmallButton>
                      </div>
                    }
                  >
                    {(activeCase.defects || []).length === 0 ? (
                      <EmptyState
                        title="No defects yet"
                        subtitle="Defects are the ongoing issues that justify repairs and (potentially) rent reduction."
                        action={
                          <SmallButton tone="primary" onClick={addDefect}>
                            Add first defect
                          </SmallButton>
                        }
                      />
                    ) : (
                      <div className="space-y-3">
                        {(activeCase.defects || []).map((d) => (
                          <div key={d.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <Pill tone={d.status || "open"}>{d.status || "open"}</Pill>
                                <div className="font-semibold text-slate-900">{d.title || "(no title)"}</div>
                              </div>
                              <SmallButton tone="danger" onClick={() => deleteDefect(d.id)}>
                                Delete
                              </SmallButton>
                            </div>

                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Field label="Title">
                                <input
                                  value={d.title || ""}
                                  onChange={(e) => updateDefect(d.id, { title: e.target.value })}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                                />
                              </Field>
                              <Field label="Room / area">
                                <input
                                  value={d.room || ""}
                                  onChange={(e) => updateDefect(d.id, { room: e.target.value })}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                                  placeholder="Your room, bathroom, kitchen..."
                                />
                              </Field>
                              <Field label="Start date">
                                <input
                                  value={d.startDate || ""}
                                  onChange={(e) => updateDefect(d.id, { startDate: e.target.value })}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                                  placeholder="YYYY-MM-DD"
                                />
                              </Field>
                              <Field label="Status">
                                <select
                                  value={d.status || "open"}
                                  onChange={(e) => updateDefect(d.id, { status: e.target.value })}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                                >
                                  <option value="open">open</option>
                                  <option value="resolved">resolved</option>
                                </select>
                              </Field>
                              <Field label="Impact % (your proposal)" hint="Used only for draft letters. Set your own numbers.">
                                <input
                                  value={d.impactPercent ?? 0}
                                  onChange={(e) => updateDefect(d.id, { impactPercent: Number(e.target.value || 0) })}
                                  inputMode="numeric"
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                                />
                              </Field>
                              <Field label="Notes">
                                <input
                                  value={d.notes || ""}
                                  onChange={(e) => updateDefect(d.id, { notes: e.target.value })}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                                />
                              </Field>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                )}

                {(app.ui?.tab || "snapshot") === "documents" && (
                  <Section
                    title="Documents"
                    right={<SmallButton tone="primary" onClick={addDocument}>+ Add document</SmallButton>}
                  >
                    {(activeCase.documents || []).length === 0 ? (
                      <EmptyState
                        title="No documents yet"
                        subtitle="Store references here: scans, letters, photos, contracts (best as links to Drive)."
                        action={<SmallButton tone="primary" onClick={addDocument}>Add document</SmallButton>}
                      />
                    ) : (
                      <div className="space-y-3">
                        {(activeCase.documents || []).map((d) => (
                          <div key={d.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="font-semibold text-slate-900">Document reference</div>
                              <SmallButton tone="danger" onClick={() => deleteDocument(d.id)}>
                                Delete
                              </SmallButton>
                            </div>
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Field label="Name">
                                <input
                                  value={d.name || ""}
                                  onChange={(e) => updateDocument(d.id, { name: e.target.value })}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                                  placeholder="e.g., Mietvertrag PDF, Einschreiben receipt"
                                />
                              </Field>
                              <Field label="URL">
                                <input
                                  value={d.url || ""}
                                  onChange={(e) => updateDocument(d.id, { url: e.target.value })}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                                  placeholder="Drive/Dropbox link"
                                />
                              </Field>
                              <div className="md:col-span-2">
                                <Field label="Notes">
                                  <input
                                    value={d.notes || ""}
                                    onChange={(e) => updateDocument(d.id, { notes: e.target.value })}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                                  />
                                </Field>
                              </div>
                              {d.url ? (
                                <div className="md:col-span-2">
                                  <a
                                    href={d.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center px-3 py-2 rounded-xl text-sm bg-white border border-slate-200 hover:border-slate-300"
                                  >
                                    Open link
                                  </a>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                )}

                {(app.ui?.tab || "snapshot") === "letters" && (
                  <Section
                    title="Letters"
                    right={
                      <div className="flex flex-wrap gap-2">
                        <SmallButton onClick={() => generateLetter("repair_request")}>+ Repair request</SmallButton>
                        <SmallButton onClick={() => generateLetter("rent_reduction_notice")}>+ Rent reduction</SmallButton>
                      </div>
                    }
                  >
                    <div className="text-sm text-slate-600">
                      These are rough drafts for your case file. You can edit them here, then copy/paste into email.
                    </div>

                    {(activeCase.letters || []).length === 0 ? (
                      <div className="mt-4">
                        <EmptyState
                          title="No letter drafts yet"
                          subtitle="Generate a repair request or rent reduction notice based on your open defects."
                          action={
                            <div className="flex gap-2">
                              <SmallButton onClick={() => generateLetter("repair_request")}>Generate repair request</SmallButton>
                              <SmallButton onClick={() => generateLetter("rent_reduction_notice")}>Generate rent reduction</SmallButton>
                            </div>
                          }
                        />
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {(activeCase.letters || []).map((l) => (
                          <div key={l.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-slate-900">{l.title}</div>
                                <div className="text-xs text-slate-600 mt-1">
                                  {new Date(l.createdAt || Date.now()).toLocaleString()}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <SmallButton
                                  onClick={() => {
                                    navigator.clipboard?.writeText((l.subject ? `Subject: ${l.subject}\n\n` : "") + (l.body || ""));
                                    notify("Copied to clipboard");
                                  }}
                                >
                                  Copy
                                </SmallButton>
                                <SmallButton tone="danger" onClick={() => deleteLetter(l.id)}>
                                  Delete
                                </SmallButton>
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-1 gap-3">
                              <Field label="Subject">
                                <input
                                  value={l.subject || ""}
                                  onChange={(e) => updateLetter(l.id, { subject: e.target.value })}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                                />
                              </Field>
                              <Field label="Body">
                                <textarea
                                  value={l.body || ""}
                                  onChange={(e) => updateLetter(l.id, { body: e.target.value })}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white min-h-[220px]"
                                />
                              </Field>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <SmallButton onClick={() => window.print()}>Print this view</SmallButton>
                              <SmallButton
                                onClick={() =>
                                  downloadText(
                                    `${(activeCase.title || "case").replaceAll(/[^a-z0-9\-_]+/gi, "-")}-letter.txt`,
                                    (l.subject ? `Subject: ${l.subject}\n\n` : "") + (l.body || ""),
                                    "text/plain"
                                  )
                                }
                              >
                                Download .txt
                              </SmallButton>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                )}

                {(app.ui?.tab || "snapshot") === "export" && (
                  <Section title="Export & Backup">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="font-semibold text-slate-900">Export case</div>
                        <div className="text-sm text-slate-600 mt-1">JSON file with your full case data.</div>
                        <div className="mt-3">
                          <SmallButton tone="primary" onClick={exportActiveCaseJSON}>
                            Download case JSON
                          </SmallButton>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="font-semibold text-slate-900">Export everything</div>
                        <div className="text-sm text-slate-600 mt-1">All cases + app settings.</div>
                        <div className="mt-3">
                          <SmallButton tone="primary" onClick={exportAllJSON}>
                            Download all JSON
                          </SmallButton>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 md:col-span-2">
                        <div className="font-semibold text-slate-900">Print to PDF</div>
                        <div className="text-sm text-slate-600 mt-1">
                          Open the view you want (Incidents / Defects / Letters), then click Print. Choose “Save as PDF”.
                        </div>
                        <div className="mt-3">
                          <SmallButton onClick={() => window.print()}>Print current view</SmallButton>
                        </div>
                      </div>
                    </div>
                  </Section>
                )}

                {/* Toast */}
                {toast ? (
                  <div className="fixed bottom-6 right-6 rounded-2xl bg-slate-900 text-white px-4 py-3 shadow-lg">
                    <div className="text-sm">{toast}</div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500">
          Next upgrade path: add accounts + cloud storage + PDF exports + shared access (so your evidence is safe off-device).
        </div>
      </div>
    </div>
  );
}
