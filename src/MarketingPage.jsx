import React, { useState, useEffect, useRef } from "react";

// ── BRAND TOKENS ───────────────────────────────────────────────
const C = {
  pageBg:      "#F7F8FA",
  white:       "#FFFFFF",
  orange:      "#FDBF24",
  orangeLight: "#FFF3C7",
  orangeDeep:  "#CC9800",
  dark:        "#0B1220",
  darkAlt:     "#1F2937",
  text:        "#0B1220",
  textSub:     "#334155",
  textMuted:   "#64748B",
  border:      "rgba(11,18,32,0.10)",
  borderLight: "rgba(11,18,32,0.06)",
  radius:      12,
};

function clamp(min, max) {
  return `clamp(${min}px, ${(min + max) / 2}px, ${max}px)`;
}

// ── HOOKS ──────────────────────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

// ── SHARED STYLES ──────────────────────────────────────────────
const S = {
  fadeUp: (visible, delay = 0) => ({
    opacity:    visible ? 1 : 0,
    transform:  visible ? "translateY(0)" : "translateY(22px)",
    transition: `opacity 0.55s ease ${delay}s, transform 0.55s ease ${delay}s`,
  }),
  section: { width: "100%", padding: "96px 24px" },
  container: { maxWidth: 1120, margin: "0 auto" },
  sectionLabel: {
    display:       "inline-flex",
    alignItems:    "center",
    fontSize:      11,
    fontWeight:    700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color:         C.orangeDeep,
    background:    C.orangeLight,
    border:        "1px solid rgba(253,191,36,0.4)",
    borderRadius:  100,
    padding:       "4px 12px",
    marginBottom:  20,
  },
  h2: {
    fontSize:     clamp(32, 48),
    fontWeight:   800,
    color:        C.text,
    lineHeight:   1.15,
    marginBottom: 16,
  },
  bodyLarge: {
    fontSize:   18,
    color:      C.textSub,
    lineHeight: 1.65,
    maxWidth:   560,
  },
};

// ── NAV ────────────────────────────────────────────────────────
const NAV_LINKS = [
  { id: "home",     label: "Home" },
  { id: "solution", label: "Solution" },
  { id: "team",     label: "Meet the Team" },
  { id: "contact",  label: "Contact" },
];

function Nav({ currentPage, navigate }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Close mobile menu on page change
  useEffect(() => { setMobileOpen(false); }, [currentPage]);

  const handleNav = (id) => {
    navigate(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <nav style={{
      position:       "fixed",
      top:            0,
      left:           0,
      right:          0,
      zIndex:         100,
      height:         60,
      display:        "flex",
      alignItems:     "center",
      padding:        "0 32px",
      background:     scrolled ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.85)",
      backdropFilter: "blur(12px)",
      borderBottom:   `1px solid ${scrolled ? C.border : "rgba(11,18,32,0.05)"}`,
      transition:     "border-color 0.25s",
    }}>
      <div style={{
        maxWidth:       1120,
        margin:         "0 auto",
        width:          "100%",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
      }}>
        {/* Logo */}
        <button
          onClick={() => handleNav("home")}
          style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          {/* Icon mark: orange rounded square + white 4-lobe hub */}
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="7.5" fill="#FDBF24"/>
            {/* 4 white lobes arranged in a cross */}
            <circle cx="16" cy="9.5"  r="5.8" fill="white"/>
            <circle cx="22.5" cy="16" r="5.8" fill="white"/>
            <circle cx="16" cy="22.5" r="5.8" fill="white"/>
            <circle cx="9.5"  cy="16" r="5.8" fill="white"/>
            {/* Center cutout — orange pentagon to match brand */}
            <circle cx="16" cy="16" r="4.2" fill="#FDBF24"/>
          </svg>
          {/* Wordmark */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 0 }}>
            <span style={{ fontSize: 17, fontWeight: 900, color: C.dark, letterSpacing: "-0.01em", fontFamily: "inherit" }}>ralli</span>
            {/* Decorative asterisk from brand */}
            <span style={{ fontSize: 9, fontWeight: 900, color: C.orange, marginLeft: 1, lineHeight: 1, position: "relative", top: -6 }}>✦</span>
          </div>
        </button>

        {/* Desktop links */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {NAV_LINKS.map(l => (
            <button
              key={l.id}
              onClick={() => handleNav(l.id)}
              style={{
                fontSize:   14,
                fontWeight: currentPage === l.id ? 700 : 500,
                color:      currentPage === l.id ? C.text : C.textSub,
                background: currentPage === l.id ? C.orangeLight : "none",
                border:     "none",
                borderRadius: 7,
                padding:    "6px 14px",
                cursor:     "pointer",
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={e => { if (currentPage !== l.id) { e.currentTarget.style.background = C.pageBg; e.currentTarget.style.color = C.text; } }}
              onMouseLeave={e => { if (currentPage !== l.id) { e.currentTarget.style.background = "none"; e.currentTarget.style.color = C.textSub; } }}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Login */}
        <a
          href="/app"
          style={{
            fontSize:       14,
            fontWeight:     600,
            color:          C.text,
            textDecoration: "none",
            padding:        "7px 18px",
            borderRadius:   8,
            border:         `1.5px solid ${C.border}`,
            background:     C.white,
            transition:     "border-color 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.orange; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(253,191,36,0.15)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}
        >
          Login
        </a>
      </div>
    </nav>
  );
}

// ── SHARED COMPONENTS ──────────────────────────────────────────
function PageWrapper({ children }) {
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);
  return <div style={{ paddingTop: 60 }}>{children}</div>;
}

function CTABanner({ navigate }) {
  const [ref, visible] = useInView();
  return (
    <section style={{ ...S.section, background: C.dark }}>
      <div ref={ref} style={{ ...S.container, textAlign: "center" }}>
        <h2 style={{
          ...S.fadeUp(visible),
          fontSize:      clamp(30, 48),
          fontWeight:    900,
          color:         C.white,
          lineHeight:    1.1,
          letterSpacing: "-0.03em",
          marginBottom:  18,
        }}>
          Stop measuring completion.{" "}
          <span style={{ color: C.orange }}>Start measuring readiness.</span>
        </h2>
        <p style={{ ...S.fadeUp(visible, 0.08), fontSize: 17, color: "rgba(255,255,255,0.5)", lineHeight: 1.65, maxWidth: 420, margin: "0 auto 36px" }}>
          See how ralli gives your team a readiness score — not just a completion report.
        </p>
        <div style={{ ...S.fadeUp(visible, 0.14), display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => { navigate("contact"); window.scrollTo({ top: 0 }); }}
            style={{
              fontSize: 15, fontWeight: 700, color: C.dark,
              background: C.orange, border: "none", borderRadius: 10,
              padding: "13px 28px", cursor: "pointer",
              boxShadow: "0 4px 18px rgba(253,191,36,0.38)",
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 24px rgba(253,191,36,0.48)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 18px rgba(253,191,36,0.38)"; }}
          >
            Book a Demo
          </button>
          <a href="/app" style={{
            fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.7)",
            background: "rgba(255,255,255,0.07)", border: "1.5px solid rgba(255,255,255,0.12)",
            borderRadius: 10, padding: "13px 28px", textDecoration: "none",
            transition: "background 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.07)"}
          >
            Login →
          </a>
        </div>
      </div>
    </section>
  );
}

// ── HOME PAGE ──────────────────────────────────────────────────
function Hero({ navigate }) {
  const [ref, visible] = useInView(0.05);
  return (
    <section style={{
      ...S.section,
      padding:    "140px 24px 96px",
      background: "linear-gradient(180deg,#FFFDF5 0%,#F7F8FA 100%)",
      textAlign:  "center",
      position:   "relative",
      overflow:   "hidden",
    }}>
      <div style={{
        position:        "absolute", inset: 0,
        backgroundImage: "linear-gradient(rgba(253,191,36,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(253,191,36,0.06) 1px,transparent 1px)",
        backgroundSize:  "48px 48px",
        pointerEvents:   "none",
      }} />
      <div ref={ref} style={{ ...S.container, position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <span style={{ ...S.sectionLabel, ...S.fadeUp(visible) }}>Operational Readiness Platform</span>
        </div>
        <h1 style={{
          ...S.fadeUp(visible, 0.07),
          fontSize:      clamp(40, 72),
          fontWeight:    900,
          color:         C.text,
          lineHeight:    1.08,
          letterSpacing: "-0.03em",
          maxWidth:      800,
          margin:        "0 auto 22px",
        }}>
          Completion does not equal{" "}
          <span style={{
            background:           "linear-gradient(135deg,#FDBF24 0%,#CC9800 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor:  "transparent",
            backgroundClip:       "text",
          }}>
            Comprehension
          </span>
        </h1>
        <p style={{ ...S.fadeUp(visible, 0.13), fontSize: clamp(16, 20), color: C.textSub, lineHeight: 1.65, maxWidth: 500, margin: "0 auto 40px" }}>
          Most organizations measure completion.{" "}
          <strong style={{ color: C.text, fontWeight: 600 }}>ralli measures readiness.</strong>
        </p>
        <div style={{ ...S.fadeUp(visible, 0.19), display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 64 }}>
          <button
            onClick={() => { navigate("contact"); window.scrollTo({ top: 0 }); }}
            style={{
              fontSize: 15, fontWeight: 700, color: C.dark,
              background: C.orange, border: "none", borderRadius: 10,
              padding: "13px 28px", cursor: "pointer",
              boxShadow: "0 4px 16px rgba(253,191,36,0.35)",
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 24px rgba(253,191,36,0.45)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(253,191,36,0.35)"; }}
          >
            Book a Demo
          </button>
          <a href="/app" style={{
            fontSize: 15, fontWeight: 600, color: C.text,
            background: C.white, border: `1.5px solid ${C.border}`,
            borderRadius: 10, padding: "13px 28px", textDecoration: "none",
            transition: "border-color 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = C.orange}
            onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
          >
            Login →
          </a>
        </div>
      </div>
    </section>
  );
}

function HeroDashboard() {
  return (
    <div style={{
      maxWidth:     900,
      margin:       "0 auto",
      borderRadius: 16,
      border:       `1px solid ${C.border}`,
      background:   C.white,
      boxShadow:    "0 24px 80px rgba(11,18,32,0.12),0 4px 16px rgba(11,18,32,0.06)",
      overflow:     "hidden",
    }}>
      {/* Chrome bar */}
      <div style={{ height: 40, background: "#F1F5F9", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 14px", gap: 6 }}>
        {["#EF4444","#FBBF24","#22C55E"].map((c,i) => <div key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />)}
        <div style={{ marginLeft: 10, height: 20, background: C.white, borderRadius: 5, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 9px", fontSize: 10, color: C.textMuted, maxWidth: 220 }}>app.ralli.io/analytics</div>
      </div>
      <div style={{ padding: 20, background: C.pageBg }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Team Readiness", value: "78%", delta: "+6 pts", good: true },
            { label: "Avg Quiz Score",  value: "82%", delta: "+4%",   good: true },
            { label: "Completion",      value: "91%", delta: "",      good: null },
            { label: "Below Threshold", value: "4",   delta: "−2",    good: true },
          ].map((k,i) => (
            <div key={i} style={{ background: C.white, borderRadius: C.radius, border: `1px solid ${C.border}`, padding: "12px 14px" }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1 }}>{k.value}</div>
              {k.delta && <div style={{ fontSize: 10, fontWeight: 600, color: k.good ? "#16A34A" : "#DC2626", marginTop: 3 }}>{k.delta} this month</div>}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 10 }}>
          {/* Heatmap */}
          <div style={{ background: C.white, borderRadius: C.radius, border: `1px solid ${C.border}`, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 12 }}>Knowledge Heatmap</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 3 }}>
              {["Product","Objections","Pricing","Discovery","Closing","Compliance"].map((h,i) => (
                <div key={i} style={{ fontSize: 8, fontWeight: 600, color: C.textMuted, textAlign: "center", paddingBottom: 3, letterSpacing: "0.03em" }}>{h}</div>
              ))}
              {[[92,44,78,88,61,95],[85,72,55,90,78,88],[78,38,91,67,83,72],[95,81,66,74,92,58]].map((row,ri) =>
                row.map((score,ci) => {
                  const bg = score>=80?"#D1FAE5":score>=60?"#FEF9C3":"#FEE2E2";
                  const fc = score>=80?"#16A34A":score>=60?"#A16207":"#DC2626";
                  return <div key={`${ri}-${ci}`} style={{ background: bg, borderRadius: 5, padding: "6px 2px", textAlign: "center", fontSize: 11, fontWeight: 700, color: fc }}>{score}</div>;
                })
              )}
            </div>
          </div>
          {/* Rep list */}
          <div style={{ background: C.white, borderRadius: C.radius, border: `1px solid ${C.border}`, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 12 }}>Rep Readiness</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[{name:"Jordan M.",score:94,s:"ready"},{name:"Taylor S.",score:88,s:"ready"},{name:"Riley K.",score:79,s:"on-track"},{name:"Alex P.",score:62,s:"at-risk"},{name:"Morgan T.",score:45,s:"at-risk"}].map((rep,i) => {
                const sc = rep.s==="ready"?"#16A34A":rep.s==="on-track"?"#CA8A04":"#DC2626";
                const sb = rep.s==="ready"?"#D1FAE5":rep.s==="on-track"?"#FEF9C3":"#FEE2E2";
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width:26,height:26,borderRadius:"50%",background:`hsl(${i*55},60%,60%)`,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#fff" }}>
                      {rep.name.split(" ").map(n=>n[0]).join("")}
                    </div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontSize:11,fontWeight:600,color:C.text }}>{rep.name}</div>
                      <div style={{ height:3,background:"#F1F5F9",borderRadius:3,marginTop:3 }}>
                        <div style={{ height:"100%",width:`${rep.score}%`,background:sc,borderRadius:3 }} />
                      </div>
                    </div>
                    <div style={{ fontSize:10,fontWeight:700,color:C.text,minWidth:26,textAlign:"right" }}>{rep.score}%</div>
                    <div style={{ fontSize:8,fontWeight:700,color:sc,background:sb,borderRadius:100,padding:"2px 6px",textTransform:"uppercase",letterSpacing:"0.05em" }}>{rep.s}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Problem() {
  const [ref, visible] = useInView();
  const stats = [
    { value: "87%", label: "of reps who complete training still fail live calls" },
    { value: "3×",  label: "longer ramp time when readiness isn't measured" },
    { value: "1 in 3", label: "reps are unready to close — managers don't know which ones" },
  ];
  return (
    <section style={{ ...S.section, background: C.dark }}>
      <div ref={ref} style={{ ...S.container }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <span style={{ ...S.sectionLabel, background: "rgba(253,191,36,0.12)", borderColor: "rgba(253,191,36,0.25)", color: C.orange }}>The Problem</span>
          </div>
          <h2 style={{ ...S.h2, ...S.fadeUp(visible), color: C.white, maxWidth: 600, margin: "0 auto 16px" }}>
            Training completion is not a signal. It never was.
          </h2>
          <p style={{ ...S.fadeUp(visible, 0.07), fontSize: 17, color: "rgba(255,255,255,0.5)", lineHeight: 1.65, maxWidth: 460, margin: "0 auto" }}>
            Checking a box doesn't mean your team is ready to perform. Most orgs only discover that problem when quota is missed.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 18 }}>
          {stats.map((s,i) => (
            <div key={i} style={{ ...S.fadeUp(visible, 0.1+i*0.07), background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "32px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 42, fontWeight: 900, color: C.orange, lineHeight: 1, marginBottom: 10, letterSpacing: "-0.03em" }}>{s.value}</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ ...S.fadeUp(visible, 0.33), marginTop: 52, textAlign: "center" }}>
          <blockquote style={{ fontSize: clamp(17,22), fontWeight: 700, color: C.white, lineHeight: 1.4, fontStyle: "italic", maxWidth: 620, margin: "0 auto" }}>
            "Completion does not equal competence. Attendance does not equal readiness. You cannot manage what you cannot measure."
          </blockquote>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const [ref, visible] = useInView();
  const steps = [
    { icon: "📖", label: "Learn",    desc: "Structured courses and lessons built for retention, not just completion." },
    { icon: "✏️", label: "Practice", desc: "Quizzes and scenario drills that expose gaps before they hit real calls." },
    { icon: "⚡", label: "Compete",  desc: "Live games that make training stick through healthy team competition." },
    { icon: "📊", label: "Measure",  desc: "Readiness scores, knowledge heatmaps, and coaching signals — not just completion rates." },
    { icon: "🎯", label: "Improve",  desc: "Battle cards and targeted coaching close gaps at the moment of need." },
  ];
  return (
    <section style={{ ...S.section, background: C.white }}>
      <div ref={ref} style={{ ...S.container }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
          <div>
            <span style={S.sectionLabel}>How ralli works</span>
            <h2 style={{ ...S.h2, ...S.fadeUp(visible) }}>A continuous readiness workflow — not a one-time training event.</h2>
            <p style={{ ...S.bodyLarge, ...S.fadeUp(visible, 0.07) }}>
              ralli connects learning, practice, competition, and analytics into a single loop. Every rep builds knowledge. Every manager sees who's ready.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {steps.map((s,i) => (
              <div key={i} style={{ ...S.fadeUp(visible, 0.06+i*0.06), display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 18px", borderRadius: C.radius, background: i%2===0?C.pageBg:"transparent", border: `1px solid ${i%2===0?C.border:"transparent"}` }}>
                <div style={{ width:38,height:38,borderRadius:9,background:C.orangeLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0 }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize:13,fontWeight:700,color:C.text,marginBottom:2 }}>{String(i+1).padStart(2,"0")}  {s.label}</div>
                  <div style={{ fontSize:13,color:C.textSub,lineHeight:1.55 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SocialProof() {
  const [ref, visible] = useInView();
  const quotes = [
    { quote: "We replaced three separate tools with ralli and finally have a clear picture of which reps are ready to carry quota.", author: "VP of Sales", company: "Series B SaaS Company" },
    { quote: "Our ramp time dropped significantly once we stopped measuring completion and started measuring comprehension.", author: "Director of Revenue Enablement", company: "Enterprise Software" },
    { quote: "The readiness score is the first metric our CRO asks about in QBRs. It's become the single source of truth.", author: "Head of Sales Ops", company: "Growth-Stage Tech" },
  ];
  return (
    <section style={{ ...S.section, background: C.pageBg }}>
      <div ref={ref} style={{ ...S.container }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <span style={S.sectionLabel}>What teams are saying</span>
          </div>
          <h2 style={{ ...S.h2, ...S.fadeUp(visible), maxWidth: 500, margin: "0 auto" }}>
            The teams who measure readiness outperform the ones who don't.
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 18 }}>
          {quotes.map((q,i) => (
            <div key={i} style={{ ...S.fadeUp(visible, 0.07+i*0.07), background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, padding: 26, boxShadow: "0 4px 16px rgba(11,18,32,0.05)" }}>
              <div style={{ display: "flex", gap: 2, marginBottom: 14 }}>
                {Array(5).fill(0).map((_,si) => <svg key={si} width="13" height="13" viewBox="0 0 14 14" fill={C.orange}><path d="M7 1L8.8 5.3L13.5 5.8L10 9L11.1 13.5L7 11.1L2.9 13.5L4 9L0.5 5.8L5.2 5.3L7 1Z"/></svg>)}
              </div>
              <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.65, marginBottom: 18, fontStyle: "italic" }}>"{q.quote}"</p>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{q.author}</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>{q.company}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DashboardShowcase() {
  const [ref, visible] = useInView(0.1);
  return (
    <section style={{ ...S.section, background: C.pageBg, padding: "72px 24px" }}>
      <div ref={ref} style={{ ...S.container }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <span style={S.sectionLabel}>Platform</span>
          <h2 style={{ ...S.h2, ...S.fadeUp(visible), maxWidth: 520, margin: "12px auto 14px" }}>
            One view. Every rep. Full readiness picture.
          </h2>
          <p style={{ ...S.bodyLarge, ...S.fadeUp(visible, 0.07), textAlign: "center", margin: "0 auto" }}>
            Readiness scores, knowledge gaps, and coaching signals — all in one place.
          </p>
        </div>
        <div style={S.fadeUp(visible, 0.13)}>
          <HeroDashboard />
        </div>
      </div>
    </section>
  );
}

function HomePage({ navigate }) {
  return (
    <PageWrapper>
      <Hero navigate={navigate} />
      <Problem />
      <HowItWorks />
      <DashboardShowcase />
      <SocialProof />
      <CTABanner navigate={navigate} />
    </PageWrapper>
  );
}

// ── SOLUTION PAGE ──────────────────────────────────────────────
function ProductPreview() {
  const [ref, visible] = useInView();
  const [active, setActive] = useState(0);
  const features = [
    { label: "Learn",        headline: "Courses that build real knowledge",      desc: "Structured learning paths with video, text, and assessments. Track progress per module, not just overall completion.", visual: <LearnMockup /> },
    { label: "Games",        headline: "Make competition the classroom",         desc: "Live multiplayer games turn training into events. Reps compete. Knowledge sticks.", visual: <GameMockup /> },
    { label: "Quizzes",      headline: "Spot gaps before they cost you",         desc: "Targeted assessments surface exactly where knowledge breaks down — by rep, by topic, by team.", visual: <QuizMockup /> },
    { label: "Battle Cards", headline: "The right answer at the right moment",   desc: "Objection handlers, competitor intel, and talk tracks — searchable and always current.", visual: <BattleCardMockup /> },
  ];
  return (
    <section style={{ ...S.section, background: C.pageBg }}>
      <div ref={ref} style={{ ...S.container }}>
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <span style={S.sectionLabel}>Product</span>
          <h2 style={{ ...S.h2, ...S.fadeUp(visible), maxWidth: 520, margin: "0 auto 14px" }}>Every tool your team needs to stay sharp.</h2>
          <p style={{ ...S.bodyLarge, ...S.fadeUp(visible, 0.07), margin: "0 auto", textAlign: "center" }}>
            ralli bundles learning, practice, and readiness measurement in one place — no duct tape, no context switching.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 28, flexWrap: "wrap" }}>
          {features.map((f,i) => (
            <button key={i} onClick={() => setActive(i)} style={{
              fontSize: 14, fontWeight: 600,
              color: active===i?C.dark:C.textSub,
              background: active===i?C.orange:C.white,
              border: `1.5px solid ${active===i?C.orange:C.border}`,
              borderRadius: 8, padding: "7px 16px", cursor: "pointer", transition: "all 0.15s",
            }}>
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center", background: C.white, borderRadius: 18, border: `1px solid ${C.border}`, padding: 36, boxShadow: "0 8px 32px rgba(11,18,32,0.06)" }}>
          <div>
            <h3 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 12, lineHeight: 1.2 }}>{features[active].headline}</h3>
            <p style={{ fontSize: 15, color: C.textSub, lineHeight: 1.65 }}>{features[active].desc}</p>
          </div>
          <div>{features[active].visual}</div>
        </div>
      </div>
    </section>
  );
}

function ReadinessAnalytics() {
  const [ref, visible] = useInView();
  return (
    <section style={{ ...S.section, background: C.white }}>
      <div ref={ref} style={{ ...S.container }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
          <div style={S.fadeUp(visible, 0.07)}><AnalyticsMockup /></div>
          <div>
            <span style={S.sectionLabel}>Readiness Analytics</span>
            <h2 style={{ ...S.h2, ...S.fadeUp(visible) }}>Know who's ready before the call happens.</h2>
            <p style={{ ...S.bodyLarge, ...S.fadeUp(visible, 0.07), marginBottom: 26 }}>
              ralli surfaces readiness scores, knowledge gaps, and coaching signals at the rep and team level — so you can act before performance suffers.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { label: "Readiness scores per rep",    desc: "Not just completion — actual assessed comprehension." },
                { label: "Knowledge heatmaps by topic", desc: "See exactly where gaps are concentrated across your team." },
                { label: "Coaching signals",             desc: "Auto-surface the reps who need attention before quota is missed." },
              ].map((f,i) => (
                <div key={i} style={{ ...S.fadeUp(visible, 0.12+i*0.06), display: "flex", gap: 12 }}>
                  <div style={{ width:18,height:18,borderRadius:5,background:C.orange,flexShrink:0,marginTop:2,display:"flex",alignItems:"center",justifyContent:"center" }}>
                    <svg width="9" height="7" viewBox="0 0 10 8" fill="none"><path d="M1 4L4 7L9 1" stroke={C.dark} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize:13,fontWeight:700,color:C.text,marginBottom:2 }}>{f.label}</div>
                    <div style={{ fontSize:13,color:C.textSub,lineHeight:1.55 }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AnalyticsMockup() {
  const topics = [
    {name:"Discovery",score:91},{name:"Objection Handling",score:58},{name:"Pricing",score:74},{name:"Closing",score:83},{name:"Compliance",score:95},
  ];
  return (
    <div style={{ background: C.pageBg, borderRadius: 16, border: `1px solid ${C.border}`, padding: 20, boxShadow: "0 8px 32px rgba(11,18,32,0.07)" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>Team Readiness Overview</div>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 18 }}>June 2026 · 18 reps</div>
      <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 22 }}>
        <div style={{ position: "relative", width: 76, height: 76, flexShrink: 0 }}>
          <svg width="76" height="76" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="32" fill="none" stroke="#F1F5F9" strokeWidth="10"/>
            <circle cx="40" cy="40" r="32" fill="none" stroke={C.orange} strokeWidth="10" strokeDasharray={`${2*Math.PI*32*0.78} ${2*Math.PI*32*0.22}`} strokeDashoffset={2*Math.PI*32*0.25} strokeLinecap="round"/>
          </svg>
          <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center" }}>
            <span style={{ fontSize:15,fontWeight:900,color:C.text }}>78%</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize:11,color:C.textMuted,marginBottom:3 }}>Overall Readiness</div>
          <div style={{ fontSize:12,fontWeight:700,color:"#16A34A" }}>↑ 6 pts vs. last month</div>
          <div style={{ fontSize:11,color:C.textMuted,marginTop:5 }}>4 reps below 60% threshold</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {topics.map((t,i) => {
          const c = t.score>=80?"#22C55E":t.score>=60?C.orange:"#EF4444";
          return (
            <div key={i}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3 }}>
                <span style={{ fontSize:11,fontWeight:600,color:C.textSub }}>{t.name}</span>
                <span style={{ fontSize:11,fontWeight:700,color:C.text }}>{t.score}%</span>
              </div>
              <div style={{ height:5,background:"#F1F5F9",borderRadius:3 }}>
                <div style={{ height:"100%",width:`${t.score}%`,background:c,borderRadius:3 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LearnMockup() {
  const lessons = [
    {title:"Intro to Discovery",progress:100,done:true},{title:"Building the Business Case",progress:72,done:false},{title:"Handling Objections",progress:0,done:false},{title:"Closing Frameworks",progress:0,done:false},
  ];
  return (
    <div style={{ background: C.pageBg, borderRadius: 11, border: `1px solid ${C.border}`, padding: 14 }}>
      <div style={{ fontSize:10,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10 }}>Enterprise Sales Path</div>
      <div style={{ display:"flex",flexDirection:"column",gap:7 }}>
        {lessons.map((l,i) => (
          <div key={i} style={{ background:C.white,borderRadius:7,border:`1px solid ${C.border}`,padding:"9px 12px",display:"flex",alignItems:"center",gap:10 }}>
            <div style={{ width:18,height:18,borderRadius:"50%",background:l.done?C.orange:C.borderLight,border:`2px solid ${l.done?C.orange:C.border}`,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center" }}>
              {l.done && <svg width="9" height="7" viewBox="0 0 10 8" fill="none"><path d="M1 4L4 7L9 1" stroke={C.dark} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontSize:11,fontWeight:600,color:C.text,marginBottom:l.progress>0&&!l.done?3:0 }}>{l.title}</div>
              {l.progress>0&&!l.done&&<div style={{ height:3,background:C.borderLight,borderRadius:2 }}><div style={{ height:"100%",width:`${l.progress}%`,background:C.orange,borderRadius:2 }} /></div>}
            </div>
            {l.progress>0&&!l.done&&<div style={{ fontSize:10,fontWeight:700,color:C.textMuted }}>{l.progress}%</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function GameMockup() {
  const players = [{name:"Jordan M.",score:2400,rank:1},{name:"Taylor S.",score:2100,rank:2},{name:"Riley K.",score:1950,rank:3},{name:"Alex P.",score:1700,rank:4}];
  return (
    <div style={{ background:C.dark,borderRadius:11,padding:14 }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
        <div style={{ fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:"0.08em" }}>Live Game — Q3</div>
        <div style={{ fontSize:10,fontWeight:700,color:C.orange,background:"rgba(253,191,36,0.12)",borderRadius:100,padding:"2px 8px" }}>⚡ LIVE</div>
      </div>
      {players.map((p,i) => (
        <div key={i} style={{ display:"flex",alignItems:"center",gap:9,padding:"7px 0",borderBottom:i<players.length-1?"1px solid rgba(255,255,255,0.06)":"none" }}>
          <div style={{ fontSize:10,fontWeight:700,color:i===0?C.orange:"rgba(255,255,255,0.3)",minWidth:14 }}>#{p.rank}</div>
          <div style={{ width:22,height:22,borderRadius:"50%",background:`hsl(${i*80},60%,55%)`,flexShrink:0 }} />
          <div style={{ flex:1,fontSize:11,fontWeight:600,color:C.white }}>{p.name}</div>
          <div style={{ fontSize:12,fontWeight:800,color:i===0?C.orange:"rgba(255,255,255,0.7)" }}>{p.score.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

function QuizMockup() {
  return (
    <div style={{ background:C.white,borderRadius:11,border:`1px solid ${C.border}`,padding:14 }}>
      <div style={{ fontSize:10,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10 }}>Question 4 of 8</div>
      <div style={{ fontSize:13,fontWeight:700,color:C.text,marginBottom:12,lineHeight:1.45 }}>A prospect says "your price is too high." What's the most effective first response?</div>
      {[{text:"Offer an immediate discount",correct:false,selected:false},{text:"Anchor to the cost of inaction",correct:true,selected:true},{text:"Explain your pricing model in detail",correct:false,selected:false},{text:"Ask what their budget is",correct:false,selected:false}].map((o,i) => (
        <div key={i} style={{ padding:"8px 11px",borderRadius:7,border:`1.5px solid ${o.selected?(o.correct?"#22C55E":"#EF4444"):C.border}`,background:o.selected?(o.correct?"#F0FDF4":"#FEF2F2"):C.pageBg,marginBottom:5,fontSize:12,fontWeight:o.selected?700:500,color:o.selected?(o.correct?"#16A34A":"#DC2626"):C.textSub }}>
          {o.text}
        </div>
      ))}
    </div>
  );
}

function BattleCardMockup() {
  return (
    <div style={{ background:C.white,borderRadius:11,border:`1px solid ${C.border}`,padding:14 }}>
      <div style={{ display:"flex",alignItems:"center",gap:7,marginBottom:12 }}>
        <div style={{ fontSize:9,fontWeight:700,color:"#DC2626",background:"#FEF2F2",borderRadius:100,padding:"2px 7px",textTransform:"uppercase",letterSpacing:"0.06em" }}>Competitor</div>
        <div style={{ fontSize:12,fontWeight:800,color:C.text }}>vs. Competitor X</div>
      </div>
      <div style={{ fontSize:10,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:7 }}>When they say:</div>
      <div style={{ fontSize:12,fontWeight:600,color:C.text,fontStyle:"italic",marginBottom:10,lineHeight:1.45 }}>"Competitor X has all the same features for less."</div>
      <div style={{ fontSize:10,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:7 }}>You say:</div>
      <div style={{ fontSize:12,color:C.textSub,lineHeight:1.6,borderLeft:`3px solid ${C.orange}`,paddingLeft:10 }}>
        "You're right that pricing looks similar. The difference is what you get on the back end — ralli shows you which reps are actually ready to close, not just who clicked through a module."
      </div>
    </div>
  );
}

function SolutionPage({ navigate }) {
  return (
    <PageWrapper>
      <section style={{ ...S.section, padding: "80px 24px 48px", background: C.pageBg, textAlign: "center" }}>
        <div style={{ ...S.container }}>
          <span style={S.sectionLabel}>Solution</span>
          <h1 style={{ fontSize: clamp(32, 56), fontWeight: 900, color: C.text, lineHeight: 1.1, letterSpacing: "-0.03em", maxWidth: 640, margin: "12px auto 16px" }}>
            Built for the teams who can't afford to guess who's ready.
          </h1>
          <p style={{ fontSize: 18, color: C.textSub, lineHeight: 1.65, maxWidth: 480, margin: "0 auto" }}>
            Every feature in ralli feeds a single output: a clear, honest readiness signal for every rep on your team.
          </p>
        </div>
      </section>
      <ProductPreview />
      <ReadinessAnalytics />
      <CTABanner navigate={navigate} />
    </PageWrapper>
  );
}

// ── MEET THE TEAM PAGE ─────────────────────────────────────────
const TEAM = [
  {
    name:  "Avanti Fernandes",
    role:  "Founder & CEO",
    bio:   "Building software that gives sales teams an honest picture of who's ready. Former operator who got tired of watching quota suffer because training reports looked fine.",
    color: "#FDBF24",
  },
  {
    name:  "Coming Soon",
    role:  "Head of Product",
    bio:   "We're growing. If you're obsessed with how reps actually learn and retain knowledge, we'd like to talk.",
    color: "#A78BFA",
    open:  true,
  },
  {
    name:  "Coming Soon",
    role:  "Head of Engineering",
    bio:   "Looking for someone who can ship fast and build systems that scale. Real-time, multi-tenant, production-ready from day one.",
    color: "#34D399",
    open:  true,
  },
  {
    name:  "Coming Soon",
    role:  "Head of Customer Success",
    bio:   "We want someone who measures their success by how fast our customers see theirs.",
    color: "#60A5FA",
    open:  true,
  },
];

function TeamPage({ navigate }) {
  const [ref, visible] = useInView(0.05);
  return (
    <PageWrapper>
      {/* Header */}
      <section style={{ ...S.section, padding: "80px 24px 64px", background: "linear-gradient(180deg,#FFFDF5 0%,#F7F8FA 100%)", textAlign: "center" }}>
        <div style={{ ...S.container }}>
          <span style={S.sectionLabel}>Meet the Team</span>
          <h1 style={{ fontSize: clamp(32, 54), fontWeight: 900, color: C.text, lineHeight: 1.1, letterSpacing: "-0.03em", maxWidth: 580, margin: "12px auto 16px" }}>
            Small team. Serious focus.
          </h1>
          <p style={{ fontSize: 17, color: C.textSub, lineHeight: 1.65, maxWidth: 440, margin: "0 auto" }}>
            We're building ralli to be the readiness platform we wished existed when we were managing sales teams.
          </p>
        </div>
      </section>

      {/* Team grid */}
      <section style={{ ...S.section, padding: "64px 24px 96px", background: C.pageBg }}>
        <div ref={ref} style={{ ...S.container }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 20 }}>
            {TEAM.map((m, i) => (
              <div key={i} style={{
                ...S.fadeUp(visible, i * 0.07),
                background:   C.white,
                borderRadius: 18,
                border:       `1px solid ${m.open ? C.border : C.border}`,
                padding:      28,
                boxShadow:    "0 4px 20px rgba(11,18,32,0.06)",
                position:     "relative",
                overflow:     "hidden",
              }}>
                {/* Top accent */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: m.color, borderRadius: "18px 18px 0 0" }} />

                {/* Avatar */}
                <div style={{
                  width:          52,
                  height:         52,
                  borderRadius:   "50%",
                  background:     m.open ? `${m.color}20` : m.color,
                  border:         m.open ? `2px dashed ${m.color}` : "none",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  marginBottom:   16,
                  fontSize:       m.open ? 20 : 20,
                  fontWeight:     800,
                  color:          m.open ? m.color : C.dark,
                }}>
                  {m.open ? "+" : m.name.split(" ").map(n => n[0]).join("")}
                </div>

                {/* Info */}
                <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 3 }}>{m.name}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: m.open ? m.color : C.orange, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  {m.open ? "Open Role · " : ""}{m.role}
                </div>
                <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6 }}>{m.bio}</p>

                {m.open && (
                  <button
                    onClick={() => { navigate("contact"); window.scrollTo({ top: 0 }); }}
                    style={{
                      marginTop:    16,
                      fontSize:     12,
                      fontWeight:   700,
                      color:        C.dark,
                      background:   C.orange,
                      border:       "none",
                      borderRadius: 7,
                      padding:      "7px 14px",
                      cursor:       "pointer",
                    }}
                  >
                    Get in touch →
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Values strip */}
          <div style={{ marginTop: 64 }}>
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, marginBottom: 10 }}>How we work</h2>
              <p style={{ fontSize: 15, color: C.textSub, maxWidth: 400, margin: "0 auto" }}>
                A few things we hold onto, especially when moving fast.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 }}>
              {[
                { title: "Operators first",         desc: "We build for the people doing the work, not the people watching dashboards." },
                { title: "Ship, then improve",       desc: "Imperfect and in production beats perfect and in planning." },
                { title: "Readiness is the metric", desc: "We measure ourselves the same way we want our customers to measure their teams." },
                { title: "No BS",                   desc: "Honest feedback, direct communication, no corporate theater." },
              ].map((v, i) => (
                <div key={i} style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 6 }}>{v.title}</div>
                  <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.55 }}>{v.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <CTABanner navigate={navigate} />
    </PageWrapper>
  );
}

// ── CONTACT PAGE ───────────────────────────────────────────────
function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", company: "", role: "", message: "", type: "demo" });
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.name.trim())    e.name    = "Required";
    if (!form.email.trim())   e.email   = "Required";
    if (!/\S+@\S+\.\S+/.test(form.email)) e.email = "Enter a valid email";
    if (!form.message.trim()) e.message = "Required";
    return e;
  };

  const handleSubmit = (evt) => {
    evt.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSubmitted(true);
  };

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(e => { const ne = { ...e }; delete ne[k]; return ne; });
  };

  const inputStyle = (key) => ({
    width:        "100%",
    padding:      "10px 14px",
    fontSize:     14,
    color:        C.text,
    background:   C.white,
    border:       `1.5px solid ${errors[key] ? "#EF4444" : C.border}`,
    borderRadius: 9,
    outline:      "none",
    boxSizing:    "border-box",
    fontFamily:   "inherit",
    transition:   "border-color 0.15s",
  });

  const labelStyle = { fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6, display: "block" };

  if (submitted) {
    return (
      <PageWrapper>
        <section style={{ ...S.section, padding: "120px 24px", minHeight: "80vh", display: "flex", alignItems: "center" }}>
          <div style={{ ...S.container, textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: C.orangeLight, border: `2px solid ${C.orange}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
              <svg width="26" height="22" viewBox="0 0 26 22" fill="none"><path d="M2 12L9 19L24 3" stroke={C.orangeDeep} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <h2 style={{ fontSize: 30, fontWeight: 800, color: C.text, marginBottom: 12 }}>We'll be in touch.</h2>
            <p style={{ fontSize: 16, color: C.textSub, lineHeight: 1.65, maxWidth: 380, margin: "0 auto" }}>
              Thanks, {form.name.split(" ")[0]}. We'll follow up within one business day.
            </p>
          </div>
        </section>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* Header */}
      <section style={{ ...S.section, padding: "80px 24px 56px", background: "linear-gradient(180deg,#FFFDF5 0%,#F7F8FA 100%)", textAlign: "center" }}>
        <div style={{ ...S.container }}>
          <span style={S.sectionLabel}>Contact</span>
          <h1 style={{ fontSize: clamp(30, 52), fontWeight: 900, color: C.text, lineHeight: 1.1, letterSpacing: "-0.03em", maxWidth: 520, margin: "12px auto 14px" }}>
            Let's talk readiness.
          </h1>
          <p style={{ fontSize: 17, color: C.textSub, lineHeight: 1.65, maxWidth: 400, margin: "0 auto" }}>
            Whether you want a demo, have a question, or are interested in joining the team — we're here.
          </p>
        </div>
      </section>

      {/* Form + info */}
      <section style={{ ...S.section, padding: "56px 24px 96px", background: C.pageBg }}>
        <div style={{ ...S.container }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 48, alignItems: "start" }}>
            {/* Form */}
            <div style={{ background: C.white, borderRadius: 18, border: `1px solid ${C.border}`, padding: 36, boxShadow: "0 8px 32px rgba(11,18,32,0.06)" }}>
              {/* Type selector */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>I'm reaching out about</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { value: "demo",    label: "Book a Demo" },
                    { value: "general", label: "General Inquiry" },
                    { value: "join",    label: "Joining the Team" },
                  ].map(t => (
                    <button
                      key={t.value}
                      onClick={() => set("type", t.value)}
                      style={{
                        fontSize:     13,
                        fontWeight:   600,
                        color:        form.type === t.value ? C.dark : C.textSub,
                        background:   form.type === t.value ? C.orange : C.pageBg,
                        border:       `1.5px solid ${form.type === t.value ? C.orange : C.border}`,
                        borderRadius: 8,
                        padding:      "7px 14px",
                        cursor:       "pointer",
                        transition:   "all 0.15s",
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleSubmit} noValidate>
                {/* Name + Email row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={labelStyle}>Name *</label>
                    <input
                      value={form.name}
                      onChange={e => set("name", e.target.value)}
                      placeholder="Jordan Miller"
                      style={inputStyle("name")}
                      onFocus={e => e.target.style.borderColor = C.orange}
                      onBlur={e => e.target.style.borderColor = errors.name ? "#EF4444" : C.border}
                    />
                    {errors.name && <div style={{ fontSize: 11, color: "#EF4444", marginTop: 4 }}>{errors.name}</div>}
                  </div>
                  <div>
                    <label style={labelStyle}>Email *</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => set("email", e.target.value)}
                      placeholder="jordan@company.com"
                      style={inputStyle("email")}
                      onFocus={e => e.target.style.borderColor = C.orange}
                      onBlur={e => e.target.style.borderColor = errors.email ? "#EF4444" : C.border}
                    />
                    {errors.email && <div style={{ fontSize: 11, color: "#EF4444", marginTop: 4 }}>{errors.email}</div>}
                  </div>
                </div>

                {/* Company + Role row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={labelStyle}>Company</label>
                    <input
                      value={form.company}
                      onChange={e => set("company", e.target.value)}
                      placeholder="Acme Corp"
                      style={inputStyle("company")}
                      onFocus={e => e.target.style.borderColor = C.orange}
                      onBlur={e => e.target.style.borderColor = C.border}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Your Role</label>
                    <input
                      value={form.role}
                      onChange={e => set("role", e.target.value)}
                      placeholder="VP of Sales"
                      style={inputStyle("role")}
                      onFocus={e => e.target.style.borderColor = C.orange}
                      onBlur={e => e.target.style.borderColor = C.border}
                    />
                  </div>
                </div>

                {/* Message */}
                <div style={{ marginBottom: 24 }}>
                  <label style={labelStyle}>Message *</label>
                  <textarea
                    value={form.message}
                    onChange={e => set("message", e.target.value)}
                    placeholder={
                      form.type === "demo"    ? "Tell us about your team — size, current tools, what you're trying to solve..." :
                      form.type === "join"    ? "Tell us about your background and what role interests you..." :
                      "What's on your mind?"
                    }
                    rows={5}
                    style={{ ...inputStyle("message"), resize: "vertical", lineHeight: 1.55 }}
                    onFocus={e => e.target.style.borderColor = C.orange}
                    onBlur={e => e.target.style.borderColor = errors.message ? "#EF4444" : C.border}
                  />
                  {errors.message && <div style={{ fontSize: 11, color: "#EF4444", marginTop: 4 }}>{errors.message}</div>}
                </div>

                <button
                  type="submit"
                  style={{
                    width:        "100%",
                    fontSize:     15,
                    fontWeight:   700,
                    color:        C.dark,
                    background:   C.orange,
                    border:       "none",
                    borderRadius: 10,
                    padding:      "13px 0",
                    cursor:       "pointer",
                    boxShadow:    "0 4px 16px rgba(253,191,36,0.35)",
                    transition:   "transform 0.15s, box-shadow 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 22px rgba(253,191,36,0.45)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(253,191,36,0.35)"; }}
                >
                  {form.type === "demo" ? "Request Demo" : form.type === "join" ? "Send Application" : "Send Message"}
                </button>
              </form>
            </div>

            {/* Sidebar info */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { icon: "📧", label: "Email",    value: "hello@ralli.io" },
                { icon: "⚡", label: "Response", value: "Within 1 business day" },
              ].map((item, i) => (
                <div key={i} style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "18px 20px" }}>
                  <div style={{ fontSize: 18, marginBottom: 6 }}>{item.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{item.value}</div>
                </div>
              ))}

              <div style={{ background: C.orangeLight, borderRadius: 14, border: "1px solid rgba(253,191,36,0.35)", padding: "18px 20px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: 6 }}>Booking a demo?</div>
                <p style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>
                  We'll walk you through the full readiness workflow — Learn, Practice, Compete, Measure, Improve — and show you what a team readiness score actually looks like.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}

// ── FOOTER ─────────────────────────────────────────────────────
function Footer({ navigate }) {
  const handleNav = (id) => { navigate(id); window.scrollTo({ top: 0 }); };
  return (
    <footer style={{ background: C.dark, borderTop: "1px solid rgba(255,255,255,0.06)", padding: "40px 24px" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 32, alignItems: "start", marginBottom: 32 }}>
          {/* Brand */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
              <svg width="26" height="26" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="7.5" fill="#FDBF24"/>
                <circle cx="16" cy="9.5"  r="5.8" fill="white"/>
                <circle cx="22.5" cy="16" r="5.8" fill="white"/>
                <circle cx="16" cy="22.5" r="5.8" fill="white"/>
                <circle cx="9.5"  cy="16" r="5.8" fill="white"/>
                <circle cx="16" cy="16"  r="4.2" fill="#FDBF24"/>
              </svg>
              <div style={{ display: "flex", alignItems: "baseline" }}>
                <span style={{ fontSize:15,fontWeight:900,color:"rgba(255,255,255,0.85)" }}>ralli</span>
                <span style={{ fontSize:8,fontWeight:900,color:C.orange,marginLeft:1,position:"relative",top:-5 }}>✦</span>
              </div>
            </div>
            <p style={{ fontSize:13,color:"rgba(255,255,255,0.3)",lineHeight:1.55,maxWidth:240 }}>
              The operational readiness platform for sales teams.
            </p>
          </div>
          {/* Links */}
          <div style={{ display: "flex", gap: 32 }}>
            <div>
              <div style={{ fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:12 }}>Product</div>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {[{id:"home",label:"Home"},{id:"solution",label:"Solution"}].map(l => (
                  <button key={l.id} onClick={() => handleNav(l.id)} style={{ fontSize:13,color:"rgba(255,255,255,0.5)",background:"none",border:"none",cursor:"pointer",padding:0,textAlign:"left",transition:"color 0.15s" }}
                    onMouseEnter={e=>e.currentTarget.style.color="rgba(255,255,255,0.85)"}
                    onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.5)"}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:12 }}>Company</div>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {[{id:"team",label:"Meet the Team"},{id:"contact",label:"Contact"}].map(l => (
                  <button key={l.id} onClick={() => handleNav(l.id)} style={{ fontSize:13,color:"rgba(255,255,255,0.5)",background:"none",border:"none",cursor:"pointer",padding:0,textAlign:"left",transition:"color 0.15s" }}
                    onMouseEnter={e=>e.currentTarget.style.color="rgba(255,255,255,0.85)"}
                    onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.5)"}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:24,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12 }}>
          <div style={{ fontSize:12,color:"rgba(255,255,255,0.25)" }}>© {new Date().getFullYear()} ralli. All rights reserved.</div>
          <a href="/app" style={{ fontSize:12,color:"rgba(255,255,255,0.35)",textDecoration:"none",transition:"color 0.15s" }}
            onMouseEnter={e=>e.currentTarget.style.color="rgba(255,255,255,0.65)"}
            onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.35)"}>
            Login →
          </a>
        </div>
      </div>
    </footer>
  );
}

// ── ROOT ───────────────────────────────────────────────────────
export default function MarketingPage() {
  const [currentPage, setCurrentPage] = useState("home");

  // Handle browser back/forward
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    const valid = NAV_LINKS.map(l => l.id);
    if (valid.includes(hash)) setCurrentPage(hash);
  }, []);

  const navigate = (page) => {
    setCurrentPage(page);
    window.history.pushState(null, "", `#${page}`);
  };

  const renderPage = () => {
    switch (currentPage) {
      case "solution": return <SolutionPage navigate={navigate} />;
      case "team":     return <TeamPage navigate={navigate} />;
      case "contact":  return <ContactPage />;
      default:         return <HomePage navigate={navigate} />;
    }
  };

  return (
    <div style={{ fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", background: C.pageBg }}>
      <Nav currentPage={currentPage} navigate={navigate} />
      {renderPage()}
      <Footer navigate={navigate} />
    </div>
  );
}
