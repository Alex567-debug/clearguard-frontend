/**
 * ClearGuard — NPDES Compliance Dashboard
 * ========================================
 * Connects to:  https://saas-npdes-backend-production.up.railway.app
 * Endpoint:     POST /api/parse-permit  (multipart/form-data, field: "file")
 */

import { useState, useRef, useEffect } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API_BASE = "https://saas-npdes-backend-production.up.railway.app";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
  bg:      "#f0f4f8",
  surface: "#ffffff",
  accent:  "#1a56db",
  danger:  "#e02424",
  success: "#057a55",
  warn:    "#b45309",
  pending: "#6b7280",
  border:  "#dde3ed",
  text:    "#111928",
  muted:   "#6b7280",
  subtle:  "#9ca3af",
  rowAlt:  "#f9fafb",
  rowDgr:  "#fff8f8",
  rowPnd:  "#f8fafc",
};

const PARAM_NAMES = {
  "BOD₅":       "5-Day Biochemical Oxygen Demand",
  "BOD5":       "5-Day Biochemical Oxygen Demand",
  "TSS":        "Total Suspended Solids",
  "pH":         "Hydrogen Ion Concentration",
  "NH₃-N":     "Ammonia Nitrogen",
  "NH3-N":     "Ammonia Nitrogen",
  "Total N":    "Total Nitrogen",
  "E. coli":    "Fecal Coliform (E. coli)",
  "Cu (Total)": "Total Copper",
  "Flow":       "Effluent Flow Rate",
  "Total P":    "Total Phosphorus",
  "DO":         "Dissolved Oxygen",
  "Temperature":"Effluent Temperature",
  "Turbidity":  "Turbidity",
  "Zn (Total)": "Total Zinc",
  "Pb (Total)": "Total Lead",
  "Cr (Total)": "Total Chromium",
  "Mercury":    "Total Mercury",
};

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const MOCK_FACILITY = {
  name:      "Westbrook Industrial Manufacturing, LLC",
  permitNo:  "IN0012345",
  outfall:   "Outfall 001",
  period:    "Q2 2024  (Apr 1 – Jun 30)",
  authority: "U.S. EPA Region 5 / Indiana DEM",
  expires:   "Jan 1, 2027",
};

const MOCK_ROWS = [
  { id:1, param:"BOD₅",      fullName:"5-Day Biochemical Oxygen Demand", limitType:"Monthly Avg", limitVal:30.0,  limitStr:"30.0 mg/L",     measured:28.5,  unit:"mg/L",      freq:"2×/month",  sample:"Composite", status:"pass"   },
  { id:2, param:"TSS",       fullName:"Total Suspended Solids",          limitType:"Monthly Avg", limitVal:30.0,  limitStr:"30.0 mg/L",     measured:47.2,  unit:"mg/L",      freq:"2×/month",  sample:"Composite", status:"exceed" },
  { id:3, param:"pH",        fullName:"Hydrogen Ion Concentration",      limitType:"Inst. Max",   limitVal:9.0,   limitStr:"6.0–9.0 SU",    measured:9.4,   unit:"SU",        freq:"Continuous",sample:"Meter",     status:"exceed" },
  { id:4, param:"NH₃-N",    fullName:"Ammonia Nitrogen",                limitType:"Monthly Avg", limitVal:5.0,   limitStr:"5.0 mg/L",      measured:3.2,   unit:"mg/L",      freq:"Monthly",   sample:"Composite", status:"pass"   },
  { id:5, param:"Total N",   fullName:"Total Nitrogen",                  limitType:"Monthly Avg", limitVal:10.0,  limitStr:"10.0 mg/L",     measured:12.8,  unit:"mg/L",      freq:"Monthly",   sample:"Composite", status:"exceed" },
  { id:6, param:"E. coli",   fullName:"Fecal Coliform (E. coli)",        limitType:"Geo. Mean",   limitVal:126,   limitStr:"126 CFU/100mL", measured:89,    unit:"CFU/100mL", freq:"Monthly",   sample:"Grab",      status:"pass"   },
  { id:7, param:"Cu (Total)",fullName:"Total Copper",                    limitType:"Daily Max",   limitVal:0.017, limitStr:"0.017 mg/L",    measured:0.015, unit:"mg/L",      freq:"Quarterly", sample:"Composite", status:"pass"   },
  { id:8, param:"Flow",      fullName:"Effluent Flow Rate",              limitType:"Daily Avg",   limitVal:2.50,  limitStr:"2.50 MGD",      measured:2.10,  unit:"MGD",       freq:"Daily",     sample:"Meter",     status:"pass"   },
];

// ─── API MAPPER ───────────────────────────────────────────────────────────────
function mapApiResponse(data) {
  let params = data;
  if (!Array.isArray(data)) {
    params = data.limits || data.parameters || data.data || data.results || [];
  }
  const rows = params
    .filter(p => p && p.parameter)
    .map((p, i) => {
      const monthlyRaw = p.monthly_avg ?? p.monthlyAvg ?? p.limit ?? null;
      const dailyRaw   = p.daily_max   ?? p.dailyMax   ?? null;
      const limitVal   = parseFloat(monthlyRaw) || parseFloat(dailyRaw) || null;
      const unit       = p.unit || "—";
      const limitStr   = monthlyRaw
        ? `${monthlyRaw} ${unit}`.trim()
        : dailyRaw ? `${dailyRaw} ${unit} (daily max)`.trim() : "—";
      return {
        id:        i + 1,
        param:     p.parameter,
        fullName:  PARAM_NAMES[p.parameter] || p.parameter,
        limitType: monthlyRaw ? "Monthly Avg" : "Daily Max",
        limitVal, limitStr,
        measured:  null,
        unit,
        freq:      p.freq || p.monitoring_freq || "—",
        sample:    p.sample_type || p.sample || "—",
        status:    "pending",
        source:    p.source || "API",
      };
    });
  const facility = {
    name:       data.facility_name || data.facility || "—",
    permitNo:   data.permit_number || data.permit_no || data.permitNo || "—",
    outfall:    data.outfall_id    || data.outfall   || "—",
    period:     data.period || data.effective_date  || data.reporting_period || "—",
    expires:    data.expires || data.expiration_date || data.expiration      || "—",
    authority:  data.authority || "U.S. EPA",
    sourceFile: data.filename      || "—",
    limitsFound:data.limits_found  ?? params.length,
  };
  return { rows, facility };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function deviation(row) {
  if (!row.limitVal || row.measured === null) return null;
  const raw  = ((row.measured - row.limitVal) / row.limitVal) * 100;
  const sign = raw > 0 ? "+" : "";
  return { str: `${sign}${raw.toFixed(1)}%`, over: raw > 0 };
}

// ─── MICRO-COMPONENTS ─────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    exceed:  { bg:"#fef2f2", color:T.danger,  border:"#fca5a5", text:"⚠  Exceedance"   },
    pass:    { bg:"#ecfdf5", color:T.success, border:"#6ee7b7", text:"✓  Compliant"    },
    pending: { bg:"#f8fafc", color:T.muted,   border:"#dde3ed", text:"↑  Awaiting DMR" },
  }[status] || { bg:"#f8fafc", color:T.muted, border:T.border, text:status };
  return (
    <span style={{
      backgroundColor:cfg.bg, color:cfg.color,
      border:`1px solid ${cfg.border}`,
      borderRadius:5, padding:"3px 9px",
      fontSize:11, fontWeight:700, letterSpacing:"0.02em", whiteSpace:"nowrap",
    }}>{cfg.text}</span>
  );
}

function MetricCard({ label, value, sub, valueColor }) {
  return (
    <div style={{
      background:T.surface, border:`1px solid ${T.border}`,
      borderRadius:10, padding:"18px 22px", flex:"1 1 160px",
    }}>
      <div style={{ fontSize:12, color:T.muted, fontWeight:500, marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:800, color:valueColor||T.text, lineHeight:1.1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:T.subtle, marginTop:4 }}>{sub}</div>}
    </div>
  );
}

function Pill({ label, color }) {
  return (
    <span style={{
      fontSize:11, fontWeight:600, padding:"3px 9px", borderRadius:4,
      backgroundColor:color+"18", color, border:`1px solid ${color}44`,
    }}>{label}</span>
  );
}

// ─── NAV ─────────────────────────────────────────────────────────────────────
function Nav({ onReset, onExport }) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.innerWidth < 620
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 620);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // Закрываем дропдаун при клике вне него
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const menuItems = [
    { icon:"👤", label:"Guest Session",    sub:"Not signed in",       disabled:true  },
    { icon:"🔑", label:"Sign In",          sub:"Access your account", action:"signin" },
    { divider: true },
    { icon:"⚙️", label:"Settings",         sub:"Coming soon",         disabled:true  },
    { icon:"🛡️", label:"Trust & Security", sub:"Zero data retention policy", action:"trust" },
    { icon:"📋", label:"Help & Docs",      sub:"EPA compliance guide",action:"help"  },
    { divider: true },
    { icon:"🚪", label:"Sign Out",         sub:"",                    disabled:true  },
  ];

  return (
    <nav style={{
      background:T.surface,
      borderBottom:`1px solid ${T.border}`,
      minHeight:52,
      display:"flex", alignItems:"center",
      justifyContent:"space-between",
      padding: isMobile ? "8px 12px" : "0 28px",
      position:"sticky", top:0, zIndex:100,
      gap: 8,
    }}>

      {/* ── Logo + brand ── */}
      <div style={{ display:"flex", alignItems:"center", gap: isMobile ? 6 : 10, flexShrink:0 }}>
        <svg
          width={isMobile ? 30 : 44}
          height={isMobile ? 33 : 48}
          viewBox="0 0 600 600" fill="none"
        >
          <defs>
            <linearGradient id="navDropGrad" x1="100%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%"   stopColor="#00FFA3"/>
              <stop offset="100%" stopColor="#00F2FE"/>
            </linearGradient>
            <filter id="navNeonGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="12" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="navSoftGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="5" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <clipPath id="navShieldClip">
              <path d="M78,98 L300,142 L522,98 L522,338 L300,562 L78,338 Z"/>
            </clipPath>
          </defs>
          <g clipPath="url(#navShieldClip)" stroke="#0A1526" strokeWidth="2.8" fill="none" opacity="0.95">
            <line x1="300" y1="142" x2="190" y2="244"/>
            <line x1="300" y1="142" x2="410" y2="244"/>
            <line x1="78"  y1="98"  x2="190" y2="244"/>
            <line x1="522" y1="98"  x2="410" y2="244"/>
            <line x1="190" y1="244" x2="410" y2="244"/>
            <line x1="78"  y1="218" x2="190" y2="244"/>
            <line x1="522" y1="218" x2="410" y2="244"/>
            <line x1="190" y1="244" x2="174" y2="374"/>
            <line x1="410" y1="244" x2="426" y2="374"/>
            <line x1="190" y1="244" x2="300" y2="318"/>
            <line x1="410" y1="244" x2="300" y2="318"/>
            <line x1="174" y1="374" x2="300" y2="318"/>
            <line x1="426" y1="374" x2="300" y2="318"/>
            <line x1="174" y1="374" x2="426" y2="374"/>
            <line x1="78"  y1="338" x2="174" y2="374"/>
            <line x1="522" y1="338" x2="426" y2="374"/>
            <line x1="174" y1="374" x2="218" y2="474"/>
            <line x1="426" y1="374" x2="382" y2="474"/>
            <line x1="218" y1="474" x2="382" y2="474"/>
            <line x1="300" y1="318" x2="300" y2="474"/>
            <line x1="218" y1="474" x2="300" y2="562"/>
            <line x1="382" y1="474" x2="300" y2="562"/>
          </g>
          <g fill="#0A1526" clipPath="url(#navShieldClip)">
            <circle cx="300" cy="142" r="7"/><circle cx="190" cy="244" r="7"/>
            <circle cx="410" cy="244" r="7"/><circle cx="78"  cy="218" r="7"/>
            <circle cx="522" cy="218" r="7"/><circle cx="300" cy="318" r="7"/>
            <circle cx="174" cy="374" r="7"/><circle cx="426" cy="374" r="7"/>
            <circle cx="218" cy="474" r="7"/><circle cx="382" cy="474" r="7"/>
            <circle cx="300" cy="474" r="7"/><circle cx="300" cy="562" r="7"/>
          </g>
          <path d="M300,172 C300,172 380,280 380,358 C380,405 344,444 300,444 C256,444 220,405 220,358 C220,280 300,172 300,172 Z"
            stroke="#0A1526" strokeWidth="14" fill="none" strokeLinejoin="round"/>
          <path d="M300,178 C300,178 374,282 374,357 C374,401 341,438 300,438 C259,438 226,401 226,357 C226,282 300,178 300,178 Z"
            fill="#0A1526"/>
          <path d="M300,195 C300,195 360,288 360,355 C360,394 333,424 300,424 C267,424 240,394 240,355 C240,288 300,195 300,195 Z"
            stroke="url(#navDropGrad)" strokeWidth="5" fill="none"
            filter="url(#navNeonGlow)" strokeLinejoin="round"/>
          <path d="M300,240 V272 H256 L242,286 V318"
            stroke="url(#navDropGrad)" strokeWidth="3" fill="none"
            strokeLinecap="round" strokeLinejoin="round" filter="url(#navSoftGlow)"/>
          <path d="M300,272 H346 L360,286 V318 H326"
            stroke="url(#navDropGrad)" strokeWidth="3" fill="none"
            strokeLinecap="round" strokeLinejoin="round" filter="url(#navSoftGlow)"/>
          <path d="M300,350 V378 H268 L256,390 V412"
            stroke="url(#navDropGrad)" strokeWidth="3" fill="none"
            strokeLinecap="round" strokeLinejoin="round" filter="url(#navSoftGlow)"/>
          <path d="M300,378 H334 L346,390"
            stroke="url(#navDropGrad)" strokeWidth="3" fill="none"
            strokeLinecap="round" strokeLinejoin="round" filter="url(#navSoftGlow)"/>
          <g fill="#00F2FE" filter="url(#navSoftGlow)">
            <circle cx="300" cy="236" r="6.5"/><circle cx="242" cy="322" r="6"/>
            <circle cx="326" cy="322" r="6"/>  <circle cx="300" cy="346" r="5"/>
            <circle cx="256" cy="414" r="6"/>  <circle cx="350" cy="394" r="6"/>
          </g>
          <path d="M108,118 L300,158 L492,118 L492,328 L300,532 L108,328 Z"
            stroke="#0A1526" strokeWidth="1.5" fill="none" opacity="0.45"/>
          <path d="M78,98 L300,142 L522,98 L522,338 L300,562 L78,338 Z"
            stroke="#0A1526" strokeWidth="6" fill="none" strokeLinejoin="miter"/>
          <g stroke="#0A1526" strokeWidth="1.8" fill="none" clipPath="url(#navShieldClip)">
            <line x1="190" y1="244" x2="382" y2="474"/>
            <line x1="410" y1="244" x2="218" y2="474"/>
            <line x1="78"  y1="218" x2="426" y2="374"/>
            <line x1="522" y1="218" x2="174" y2="374"/>
            <line x1="300" y1="142" x2="300" y2="562"/>
          </g>
          <g fill="#0A1526">
            <circle cx="78"  cy="98"  r="8"/><circle cx="300" cy="142" r="8"/>
            <circle cx="522" cy="98"  r="8"/><circle cx="78"  cy="218" r="7"/>
            <circle cx="522" cy="218" r="7"/><circle cx="78"  cy="338" r="8"/>
            <circle cx="522" cy="338" r="8"/><circle cx="300" cy="562" r="8"/>
            <circle cx="190" cy="244" r="7"/><circle cx="410" cy="244" r="7"/>
            <circle cx="174" cy="374" r="7"/><circle cx="426" cy="374" r="7"/>
            <circle cx="218" cy="474" r="7"/><circle cx="382" cy="474" r="7"/>
          </g>
        </svg>
        {/* Текст скрыт на мобильном — освобождает ~80px для аватара */}
        {!isMobile && (
          <span style={{ fontWeight:800, fontSize:15, color:T.text }}>
            ClearGuard
          </span>
        )}
      </div>

      {/* ── Action buttons ── */}
      <div style={{ display:"flex", alignItems:"center", gap: isMobile ? 6 : 10, flexShrink:0 }}>
        {onReset && (
          <button
            onClick={onReset}
            className="cg-no-print"
            style={{
              fontSize:     isMobile ? 10 : 12,
              color:        T.muted,
              background:   "none",
              border:       `1px solid ${T.border}`,
              padding:      isMobile ? "5px 9px" : "5px 12px",
              borderRadius: 6,
              cursor:       "pointer",
              fontFamily:   "inherit",
              fontWeight:   600,
              whiteSpace:   "nowrap",
            }}
          >
            {/* FIX: "↑ Upload" on mobile — понятно, что это кнопка возврата */}
            {isMobile ? "↑ Upload" : "↑ New upload"}
          </button>
        )}
        <button
          onClick={onExport}
          style={{
            fontSize:     isMobile ? 10 : 12,
            fontWeight:   700,
            background:   T.accent,
            color:        "#fff",
            border:       "none",
            padding:      isMobile ? "5px 9px" : "6px 14px",
            borderRadius: 6,
            cursor:       "pointer",
            fontFamily:   "inherit",
            whiteSpace:   "nowrap",
          }}
        >
          {/* FIX: всегда полный текст "↓ Export PDF" */}
          ↓ Export PDF
        </button>

        {/* ── Avatar с дропдауном (виден всегда) ── */}
        <div ref={menuRef} style={{ position:"relative", flexShrink:0 }}>
            {/* Кнопка-аватар */}
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="cg-no-print"
              title="Account menu"
              style={{
                width:30, height:30, borderRadius:"50%",
                background: menuOpen ? "#cbd5e1" : "#e2e8f0",
                border: menuOpen ? `2px solid ${T.accent}` : "2px solid transparent",
                display:"flex", alignItems:"center", justifyContent:"center",
                cursor:"pointer", flexShrink:0, padding:0,
                transition:"border-color 0.15s, background 0.15s",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="5.5" r="2.5" fill="#94a3b8"/>
                <path d="M2 13c0-3.314 2.686-5 6-5s6 1.686 6 5"
                      stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>

            {/* Дропдаун */}
            {menuOpen && (
              <div style={{
                position:"absolute", top:"calc(100% + 8px)", right:0,
                width:230, background:T.surface,
                border:`1px solid ${T.border}`, borderRadius:10,
                boxShadow:"0 8px 24px rgba(0,0,0,0.10)",
                zIndex:200, overflow:"hidden",
              }}>
                {menuItems.map((item, i) => {
                  if (item.divider) return (
                    <div key={i} style={{ height:1, background:T.border, margin:"4px 0" }}/>
                  );
                  return (
                    <button
                      key={i}
                      disabled={item.disabled}
                      onClick={() => {
                        if (item.action === "help") {
                          window.open("https://www.epa.gov/npdes","_blank");
                        }
                        if (item.action === "trust") {
                          alert("ClearGuard Zero Data Retention Policy:\n\n• Files deleted immediately after parsing\n• TLS 1.3 in transit\n• AES-256 at rest\n• No AI training on your data");
                        }
                        setMenuOpen(false);
                      }}
                      style={{
                        display:"flex", alignItems:"center", gap:10,
                        width:"100%", padding:"10px 14px",
                        background:"none", border:"none",
                        cursor: item.disabled ? "default" : "pointer",
                        textAlign:"left", fontFamily:"inherit",
                        opacity: item.disabled ? 0.45 : 1,
                        transition:"background 0.1s",
                      }}
                      onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = "#f8fafc"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                    >
                      <span style={{ fontSize:15 }}>{item.icon}</span>
                      <div>
                        <div style={{ fontSize:12, fontWeight:600, color:T.text }}>{item.label}</div>
                        {item.sub && <div style={{ fontSize:10, color:T.subtle, marginTop:1 }}>{item.sub}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

// ─── UPLOAD STAGE ─────────────────────────────────────────────────────────────
function UploadStage({ onFile }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };
  return (
    <div style={{ minHeight:"100vh", background:T.bg }}>
      <Nav />
      <div style={{ maxWidth:560, margin:"72px auto", padding:"0 20px" }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <h1 style={{ fontSize:30, fontWeight:800, color:T.text, margin:"0 0 10px" }}>
            Upload your NPDES Permit
          </h1>
          <p style={{ fontSize:15, color:T.muted, margin:0 }}>
            Upload your permit. Get a full violation report in under 5 seconds.
          </p>
        </div>
        <div
          onDrop={handleDrop}
          onDragOver={(e)=>{e.preventDefault();setDragging(true);}}
          onDragLeave={()=>setDragging(false)}
          onClick={()=>inputRef.current?.click()}
          style={{
            border:`2px dashed ${dragging?T.accent:T.border}`,
            borderRadius:14, padding:"52px 36px", textAlign:"center",
            cursor:"pointer", background:dragging?"#eff6ff":T.surface,
            transition:"all 0.18s ease",
          }}
        >
          <input ref={inputRef} type="file" accept=".pdf" style={{display:"none"}}
            onChange={(e)=>onFile(e.target.files[0])} />
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none"
               style={{margin:"0 auto 16px",display:"block"}}>
            <rect width="44" height="44" rx="10" fill={dragging?"#dbeafe":"#f1f5f9"}/>
            <path d="M22 28V16M22 16l-5 5M22 16l5 5"
                  stroke={dragging?T.accent:T.muted} strokeWidth="2" strokeLinecap="round"/>
            <path d="M14 32h16" stroke={dragging?T.accent:T.border}
                  strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <div style={{fontSize:16,fontWeight:700,color:T.text,marginBottom:6}}>
            {dragging?"Release to analyze":"Drop Permit PDF here"}
          </div>
          <div style={{fontSize:13,color:T.subtle,marginBottom:18}}>
            EPA-issued NPDES permits, DMRs, and fact sheets
          </div>
          <span style={{
            display:"inline-block", fontSize:13, fontWeight:600,
            color:T.accent, background:"#eff6ff",
            padding:"8px 20px", borderRadius:7, border:`1px solid #bfdbfe`,
          }}>Select PDF file</span>
        </div>
        <div style={{textAlign:"center",marginTop:16}}>
          <button onClick={()=>onFile(null)} style={{
            fontSize:13, color:T.accent, background:"none",
            border:"none", cursor:"pointer", fontFamily:"inherit",
            textDecoration:"underline",
          }}>→ Load demo permit (IN0012345, Indiana)</button>
        </div>
        <div style={{display:"flex",gap:10,marginTop:36,flexWrap:"wrap",justifyContent:"center"}}>
          {[["📄","Works with any EPA permit format"],["🤖","AI handles complex layouts"],
            ["⚡","Results in under 5 seconds"],["🔒","Your data never leaves your server"]].map(([icon,label])=>(
            <div key={label} style={{
              background:T.surface, border:`1px solid ${T.border}`,
              borderRadius:8, padding:"10px 14px", fontSize:12,
              color:T.muted, fontWeight:500,
            }}>{icon} {label}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── LOADING STAGE ────────────────────────────────────────────────────────────
function LoadingStage({ fileName }) {
  const steps = [
    "Uploading permit to parser…",
    "Extracting effluent limitation tables…",
    "Mapping parameters to 40 CFR Part 122…",
    "Running Claude Haiku on complex sections…",
    "Compiling compliance summary…",
  ];
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const id = setInterval(()=>{
      setCurrent(c => Math.min(c+1, steps.length-1));
    }, 440);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{
      minHeight:"100vh", background:T.bg,
      display:"flex", alignItems:"center", justifyContent:"center",
    }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{maxWidth:380,width:"100%",padding:"0 20px",textAlign:"center"}}>
        <div style={{
          width:52,height:52,border:`3px solid ${T.border}`,
          borderTop:`3px solid ${T.accent}`,borderRadius:"50%",
          animation:"spin 0.75s linear infinite",margin:"0 auto 28px",
        }}/>
        <h2 style={{fontSize:18,fontWeight:700,color:T.text,margin:"0 0 6px"}}>
          Analyzing Permit
        </h2>
        <p style={{fontSize:13,color:T.muted,margin:"0 0 28px",wordBreak:"break-all"}}>
          {fileName||"IN0012345_Q2_2024.pdf"}
        </p>
        <div style={{textAlign:"left"}}>
          {steps.map((step,i)=>(
            <div key={i} style={{
              display:"flex",alignItems:"center",gap:12,padding:"7px 0",
              opacity:i>current?0.28:1,transition:"opacity 0.3s",
            }}>
              <div style={{
                width:22,height:22,borderRadius:"50%",flexShrink:0,
                backgroundColor:i<current?T.success:i===current?T.accent:T.border,
                display:"flex",alignItems:"center",justifyContent:"center",
                color:"#fff",fontSize:10,fontWeight:800,transition:"background-color 0.3s",
              }}>{i<current?"✓":i+1}</div>
              <span style={{
                fontSize:13,fontWeight:i===current?600:400,
                color:i===current?T.text:i<current?T.success:T.subtle,
              }}>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── RESULTS STAGE ────────────────────────────────────────────────────────────
function ResultsStage({ fileName, rows, facility, isLiveData, apiError, onReset }) {
  const exceedances = rows.filter(r => r.status==="exceed");
  const pending     = rows.filter(r => r.status==="pending");
  const compRate    = rows.length
    ? Math.round(((rows.length-exceedances.length)/rows.length)*100) : 100;

  // ── mobile detection for scroll arrows ──
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.innerWidth < 760
  );
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 760);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const tableScrollRef = useRef(null);
  const scrollTable = (dir) => {
    tableScrollRef.current?.scrollBy({ left: dir * 240, behavior: "smooth" });
  };

  // ── scroll arrow button style (for header bar) ──
  const scrollBtnStyle = {
    width:28, height:28, borderRadius:6,
    background:"#f1f5f9", border:`1px solid ${T.border}`,
    color:T.text, fontSize:18, cursor:"pointer",
    display:"flex", alignItems:"center", justifyContent:"center",
    fontFamily:"inherit", lineHeight:1, padding:0, flexShrink:0,
  };

  const handleExportPDF = () => {
    const style = document.createElement("style");
    style.id = "cg-print-styles";
    style.textContent = `
      @media print {
        nav, .cg-no-print { display: none !important; }
        body, #root { background: white !important; }
        * { -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important; }
        tr { page-break-inside: avoid; }
      }
    `;
    document.head.appendChild(style);
    const hiddenEls = [];
    document.querySelectorAll("*").forEach(el => {
      const computed = window.getComputedStyle(el);
      const isFixed  = computed.position === "fixed";
      const isNotNav = !el.closest("nav");
      const isNetlifyLeaf = el.children.length <= 1 &&
                            el.textContent.trim().toLowerCase().includes("netlify");
      if ((isFixed && isNotNav) || isNetlifyLeaf) {
        el.setAttribute("data-cg-prev", el.style.display || "");
        el.style.setProperty("display", "none", "important");
        hiddenEls.push(el);
      }
    });
    window.print();
    setTimeout(() => {
      document.getElementById("cg-print-styles")?.remove();
      hiddenEls.forEach(el => {
        el.style.removeProperty("display");
        el.removeAttribute("data-cg-prev");
      });
    }, 1000);
  };

  return (
    <div style={{minHeight:"100vh",background:T.bg}}>
      <Nav onReset={onReset} onExport={handleExportPDF}/>
      <div style={{maxWidth:1080,margin:"0 auto",padding:"28px 20px 48px"}}>

        {/* Status banner */}
        {isLiveData ? (
          <div className="cg-no-print" style={{
            background:"#ecfdf5",border:`1px solid #6ee7b7`,borderRadius:8,
            padding:"10px 16px",marginBottom:20,fontSize:13,color:T.success,
            fontWeight:600,display:"flex",alignItems:"center",gap:8,
          }}>
            ✓ Live data — extracted from {fileName} via Railway API
            {pending.length>0 && (
              <span style={{fontWeight:400,color:T.muted}}>· Upload DMR to detect exceedances</span>
            )}
          </div>
        ) : apiError ? (
          <div className="cg-no-print" style={{
            background:"#fff8f8",border:`1px solid #fca5a5`,borderRadius:8,
            padding:"10px 16px",marginBottom:20,fontSize:13,color:T.danger,fontWeight:600,
          }}>⚠ API unreachable ({apiError}) — showing demo data</div>
        ) : (
          <div className="cg-no-print" style={{
            background:"#fffbeb",border:`1px solid #fde68a`,borderRadius:8,
            padding:"10px 16px",marginBottom:20,fontSize:13,color:T.warn,fontWeight:600,
          }}>⚡ Demo mode — mock data for Permit IN0012345</div>
        )}

        {/* Facility header */}
        <div style={{
          background:T.surface,border:`1px solid ${T.border}`,
          borderRadius:12,padding:"22px 24px",marginBottom:20,
        }}>
          <div style={{
            display:"flex",flexWrap:"wrap",
            justifyContent:"space-between",alignItems:"flex-start",gap:16,
          }}>
            <div>
              <div style={{fontSize:11,color:T.subtle,fontWeight:600,marginBottom:4}}>FACILITY</div>
              <div style={{fontSize:20,fontWeight:800,color:T.text}}>{facility.name}</div>
              <div style={{fontSize:13,color:T.muted,marginTop:3}}>{facility.authority}</div>
            </div>
            <div style={{display:"flex",gap:28,flexWrap:"wrap"}}>
              {[["Permit No.",facility.permitNo],["Outfall",facility.outfall],
                ["Period",facility.period],["Expires",facility.expires]
              ].map(([lbl,val])=>(
                <div key={lbl}>
                  <div style={{fontSize:10,color:T.subtle,fontWeight:600,marginBottom:3}}>{lbl}</div>
                  <div style={{fontSize:13,fontWeight:700,color:T.text}}>{val||"—"}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Metric cards */}
        <div style={{display:"flex",gap:14,marginBottom:20,flexWrap:"wrap"}}>
          <MetricCard label="Parameters Found" value={rows.length} sub="Extracted from permit" />
          <MetricCard label="Exceedances" value={exceedances.length}
            sub={exceedances.length?"Require immediate action":"None detected"}
            valueColor={exceedances.length?T.danger:T.success} />
          <MetricCard label="Compliance Rate" value={`${compRate}%`}
            sub="EPA threshold: 100%"
            valueColor={compRate<100?T.warn:T.success} />
          <MetricCard label="DMR Status"
            value={isLiveData && pending.length>0?"Pending DMR":exceedances.length?"Non-Compliant":"Compliant"}
            sub={isLiveData && pending.length>0?"Upload DMR to verify":"Based on permit limits"}
            valueColor={exceedances.length?T.danger:isLiveData&&pending.length?T.warn:T.success} />
        </div>

        {/* Data table */}
        <div style={{
          background:T.surface, border:`1px solid ${T.border}`,
          borderRadius:12,
          // FIX: removed overflow:hidden — it was clipping the scroll arrows
          overflow:"visible",
        }}>

          {/* Table header bar — scroll arrows live HERE (never clipped) */}
          <div style={{
            padding:"18px 22px", borderBottom:`1px solid ${T.border}`,
            display:"flex", justifyContent:"space-between",
            alignItems:"center", flexWrap:"wrap", gap:10,
            borderRadius:"12px 12px 0 0",
            background:T.surface,
          }}>
            {/* Left: title + pills */}
            <div>
              <div style={{fontWeight:800,fontSize:15,color:T.text}}>
                Effluent Limitations Analysis
              </div>
              <div style={{fontSize:12,color:T.muted,marginTop:2}}>
                Permit {facility.permitNo} · {facility.period}
              </div>
            </div>
            {/* Right: status pills + scroll arrows (on mobile) */}
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              {exceedances.length>0 && <Pill label={`${exceedances.length} Exceedances`} color={T.danger}/>}
              {pending.length>0 && (
                <span className="cg-no-print">
                  <Pill label={`${pending.length} Awaiting DMR`} color={T.muted}/>
                </span>
              )}
              {rows.filter(r=>r.status==="pass").length>0 &&
                <Pill label={`${rows.filter(r=>r.status==="pass").length} Compliant`} color={T.success}/>}

              {/* FIX: стрелки переехали в шапку — здесь не режутся overflow */}
              {isMobile && (
                <div className="cg-no-print" style={{display:"flex",gap:4,marginLeft:4}}>
                  <button onClick={()=>scrollTable(-1)} style={scrollBtnStyle} title="Scroll left">‹</button>
                  <button onClick={()=>scrollTable(1)}  style={scrollBtnStyle} title="Scroll right">›</button>
                </div>
              )}
            </div>
          </div>

          {/* Scrollable table — без лишнего padding по бокам */}
          <div ref={tableScrollRef} style={{overflowX:"auto", borderRadius:"0 0 12px 12px"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:700}}>
              <thead>
                <tr style={{background:"#f8fafc"}}>
                  {["Parameter","Full Name","Limit Type","Permit Limit","Measured","Deviation","Freq","Sample","Status"].map(h=>(
                    <th key={h} style={{
                      padding:"11px 14px",textAlign:"left",fontSize:11,
                      fontWeight:700,color:T.muted,
                      borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row,i)=>{
                  const dev    = deviation(row);
                  const exceed = row.status==="exceed";
                  const pend   = row.status==="pending";
                  return (
                    <tr key={row.id} style={{
                      backgroundColor:exceed?T.rowDgr:pend?T.rowPnd:i%2===0?T.surface:T.rowAlt,
                      borderLeft:`3px solid ${exceed?T.danger:pend?T.border:"transparent"}`,
                    }}>
                      <td style={{padding:"13px 14px",fontWeight:800,color:T.text,whiteSpace:"nowrap"}}>{row.param}</td>
                      <td style={{padding:"13px 14px",color:T.muted,maxWidth:200}}>{row.fullName}</td>
                      <td style={{padding:"13px 14px",color:T.muted,whiteSpace:"nowrap"}}>{row.limitType}</td>
                      <td style={{padding:"13px 14px",fontWeight:600,color:T.text,whiteSpace:"nowrap"}}>{row.limitStr}</td>
                      <td style={{
                        padding:"13px 14px",fontWeight:800,whiteSpace:"nowrap",
                        color:exceed?T.danger:pend?T.subtle:T.text,
                      }}>
                        {row.measured!==null?`${row.measured} ${row.unit}`:"—"}
                      </td>
                      <td style={{padding:"13px 14px",whiteSpace:"nowrap"}}>
                        {dev
                          ? <span style={{fontWeight:700,fontSize:13,color:dev.over?T.danger:T.success}}>{dev.str}</span>
                          : <span style={{color:T.subtle}}>—</span>}
                      </td>
                      <td style={{padding:"13px 14px",color:T.muted,whiteSpace:"nowrap"}}>{row.freq}</td>
                      <td style={{padding:"13px 14px",color:T.muted,whiteSpace:"nowrap"}}>{row.sample}</td>
                      <td style={{padding:"13px 14px"}}><StatusBadge status={row.status}/></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{
            padding:"13px 22px",borderTop:`1px solid ${T.border}`,
            fontSize:11,color:T.subtle,
            display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:6,
          }}>
            <span>{isLiveData?"Live API":"Mock data"} · {fileName||"demo permit"} · 40 CFR Part 122</span>
            <span>Analyzed: {new Date().toLocaleString("en-US")}</span>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [stage,      setStage     ] = useState("upload");
  const [fileName,   setFileName  ] = useState("");
  const [rows,       setRows      ] = useState(MOCK_ROWS);
  const [facility,   setFacility  ] = useState(MOCK_FACILITY);
  const [isLiveData, setIsLiveData] = useState(false);
  const [apiError,   setApiError  ] = useState(null);

  const processFile = async (file) => {
    if (file) setFileName(file.name);
    setStage("loading");
    const minDelay = new Promise(r => setTimeout(r, 2_400));
    if (!file) {
      await minDelay;
      setRows(MOCK_ROWS); setFacility(MOCK_FACILITY);
      setIsLiveData(false); setApiError(null);
      setStage("results"); return;
    }
    try {
      const formData = new FormData();
      formData.append("file", file);
      const [apiRes] = await Promise.all([
        fetch(`${API_BASE}/api/parse-permit`, { method:"POST", body:formData }),
        minDelay,
      ]);
      if (!apiRes.ok) {
        const errText = await apiRes.text().catch(()=>"");
        throw new Error(`${apiRes.status} ${apiRes.statusText}: ${errText.slice(0,120)}`);
      }
      const data   = await apiRes.json();
      const mapped = mapApiResponse(data);
      if (!mapped.rows.length) throw new Error("API returned 0 parameters");
      setRows(mapped.rows);
      setFacility(mapped.facility.name!=="—" ? mapped.facility : {...MOCK_FACILITY,...mapped.facility});
      setIsLiveData(true); setApiError(null);
    } catch (err) {
      console.error("[ClearGuard] API error:", err);
      await minDelay;
      setRows(MOCK_ROWS); setFacility(MOCK_FACILITY);
      setIsLiveData(false); setApiError(err.message);
    }
    setStage("results");
  };

  const handleReset = () => {
    setStage("upload"); setFileName("");
    setIsLiveData(false); setApiError(null);
  };

  if (stage==="upload")  return <UploadStage  onFile={processFile}/>;
  if (stage==="loading") return <LoadingStage fileName={fileName}/>;
  return (
    <ResultsStage
      fileName={fileName} rows={rows} facility={facility}
      isLiveData={isLiveData} apiError={apiError} onReset={handleReset}
    />
  );
}
