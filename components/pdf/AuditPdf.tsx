import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PdfData, PdfIssue } from "../../lib/pdfData";

// The PDF report layout. Same colors as app/globals.css (PDFs can't read CSS variables).
const C = {
  brand: "#f26b1d",
  ink: "#1f2328",
  muted: "#5f6873",
  line: "#e2e5e9",
  page: "#f3f4f6",
  dark: "#1b1f24",
  error: "#d92d20",
  warning: "#b86e00", // a bit darker than the screen color so it reads well on paper
  notice: "#2f6fdb",
  passed: "#16a34a",
};
const STATUS_COLOR: Record<PdfIssue["status"], string> = { error: C.error, warning: C.warning, notice: C.notice };
const STATUS_LABEL: Record<PdfIssue["status"], string> = { error: "Error", warning: "Warning", notice: "Notice" };
const scoreColor = (s: number | null) => (s === null ? C.muted : s >= 80 ? C.passed : s >= 50 ? C.warning : C.error);

const s = StyleSheet.create({
  // No lineHeight on the Page or on Views: on the Page it hides the page-number
  // render() text, and on a View it blows up the spacing. Paragraph Texts get it directly.
  page: { paddingTop: 0, paddingBottom: 48, paddingHorizontal: 36, fontFamily: "Helvetica", fontSize: 9, color: C.ink },
  // lineHeight needs a fontSize on the same element in react-pdf, or the spacing comes out huge.
  para: { fontSize: 9, lineHeight: 1.4 },
  topbar: { backgroundColor: C.dark, marginHorizontal: -36, paddingHorizontal: 36, paddingVertical: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  brandRow: { flexDirection: "row", alignItems: "center" },
  brandDot: { width: 8, height: 8, backgroundColor: C.brand, marginRight: 6 },
  brandName: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 11 },
  topRight: { color: "#8b939c", fontSize: 8 },
  // Big text needs its own lineHeight, or it overlaps the line below.
  h1: { fontFamily: "Helvetica-Bold", fontSize: 16, lineHeight: 1.2, marginBottom: 4 },
  bigScore: { fontFamily: "Helvetica-Bold", fontSize: 34, lineHeight: 1, marginTop: 6, marginBottom: 2 },
  sub: { color: C.muted, fontSize: 8.5, lineHeight: 1.4 },
  note: { borderWidth: 1, borderColor: C.line, backgroundColor: C.page, padding: 8, marginTop: 10, fontSize: 8.5, lineHeight: 1.4 },
  row: { flexDirection: "row" },
  panel: { borderWidth: 1, borderColor: C.line, borderRadius: 3, padding: 10 },
  label: { fontSize: 7.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 16, marginBottom: 6 },
  small: { fontSize: 8, color: C.muted, lineHeight: 1.4 },
  footerLine: { position: "absolute", bottom: 32, left: 36, right: 36, borderTopWidth: 1, borderTopColor: C.line },
  footerLeft: { position: "absolute", bottom: 18, left: 36, fontSize: 7.5, color: C.muted },
  // Full width + right-aligned: a render() Text with only "right" set gets zero width and disappears.
  footerRight: { position: "absolute", bottom: 18, left: 36, right: 36, textAlign: "right", fontSize: 7.5, color: C.muted },
});

export default function AuditPdf({ data }: { data: PdfData }) {
  return (
    <Document title={`LeadLeak audit: ${data.host}`} author="LeadLeak" subject="Website lead audit">
      <Page size="A4" style={s.page}>
        <View style={s.topbar} fixed>
          <View style={s.brandRow}>
            <View style={s.brandDot} />
            <Text style={s.brandName}>LeadLeak</Text>
          </View>
          <Text style={s.topRight}>Website lead audit for contractors</Text>
        </View>

        <View>
          <Text style={s.h1}>Audit: {data.host}</Text>
          <Text style={s.sub}>
            {data.dateLabel} · {data.pagesChecked} page{data.pagesChecked === 1 ? "" : "s"} checked · {data.url}
          </Text>
          {data.siteTypeNote && <Text style={s.note}>{data.siteTypeNote}</Text>}

          {/* Score + categories */}
          <View style={[s.row, { marginTop: 14 }]}>
            <View style={[s.panel, { width: 130, alignItems: "center", marginRight: 10 }]}>
              <Text style={s.label}>Health Score</Text>
              <Text style={[s.bigScore, { color: scoreColor(data.overall) }]}>{data.overall ?? "-"}</Text>
              <Text style={s.small}>of 100</Text>
              <Text style={{ fontSize: 8.5, color: scoreColor(data.overall), marginTop: 2, fontFamily: "Helvetica-Bold" }}>{data.bandLabel}</Text>
              <Text style={[s.small, { marginTop: 8, textAlign: "center" }]}>
                {data.counts.errors} errors · {data.counts.warnings} warnings{"\n"}
                {data.counts.notices} notices · {data.counts.passed} passed
              </Text>
            </View>
            <View style={[s.panel, { flex: 1 }]}>
              {data.categories.map((c) => (
                <View key={c.label} style={{ marginBottom: 7 }}>
                  <View style={[s.row, { justifyContent: "space-between" }]}>
                    <Text>
                      {c.label}
                      {c.note && <Text style={{ fontSize: 7.5, color: C.muted }}>  ({c.note})</Text>}
                    </Text>
                    <Text style={{ fontFamily: "Helvetica-Bold", color: scoreColor(c.score) }}>{c.score === null ? "N/A" : `${c.score}/100`}</Text>
                  </View>
                  <View style={{ height: 4, backgroundColor: C.page, marginTop: 2 }}>
                    <View style={{ height: 4, width: `${c.score ?? 0}%`, backgroundColor: scoreColor(c.score) }} />
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Summary + fixes */}
          {data.summary && (
            <>
              <Text style={s.sectionTitle}>Summary</Text>
              <Text style={[s.para, { fontSize: 10 }]}>{data.summary}</Text>
            </>
          )}
          <Text style={s.sectionTitle}>{data.fixesHeading}</Text>
          {data.fixes.length === 0 ? (
            <Text style={s.small}>No major problems found.</Text>
          ) : (
            data.fixes.map((f, i) => (
              <View key={i} style={[s.row, { marginBottom: 5 }]} wrap={false}>
                <Text style={{ width: 16, fontFamily: "Helvetica-Bold", color: C.brand }}>{i + 1}.</Text>
                <Text style={[s.para, { flex: 1 }]}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>{f.title}. </Text>
                  <Text style={{ color: C.muted }}>{f.detail}</Text>
                </Text>
              </View>
            ))
          )}

          {/* Speed */}
          <Text style={s.sectionTitle}>Speed (Google PageSpeed Insights)</Text>
          {data.speed ? (
            <View style={[s.panel, s.row]} wrap={false}>
              <View style={{ width: 130 }}>
                <Text style={s.label}>Mobile</Text>
                <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 16, color: scoreColor(data.speed.mobile) }}>{data.speed.mobile ?? "-"}/100</Text>
                <Text style={[s.label, { marginTop: 6 }]}>Desktop</Text>
                <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 16, color: scoreColor(data.speed.desktop) }}>{data.speed.desktop ?? "-"}/100</Text>
              </View>
              <View style={{ flex: 1 }}>
                {data.speed.rows.map((r) => (
                  <View key={r.label} style={[s.row, { justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 4 }]}>
                    <Text style={{ color: C.muted }}>{r.label}</Text>
                    <Text style={{ fontFamily: "Helvetica-Bold" }}>{r.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <Text style={s.small}>{data.speedNote}</Text>
          )}

          {/* Issues */}
          <Text style={s.sectionTitle} break={data.issues.length > 6}>
            Issues, by impact
          </Text>
          {data.issues.length === 0 && <Text style={s.small}>No issues found.</Text>}
          {data.issues.map((i, n) => (
            <View key={n} style={{ borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 5 }} wrap={false}>
              <View style={[s.row, { justifyContent: "space-between" }]}>
                <Text>
                  <Text style={{ fontFamily: "Helvetica-Bold", color: STATUS_COLOR[i.status] }}>{STATUS_LABEL[i.status]}  </Text>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>{i.title}</Text>
                  <Text style={{ color: C.muted }}>  ·  {i.category}</Text>
                </Text>
                <Text style={s.small}>-{i.impact} pts</Text>
              </View>
              <Text style={[s.para, { color: C.muted, marginTop: 1 }]}>{i.message}</Text>
            </View>
          ))}

          {/* Passed */}
          {data.passed.length > 0 && (
            <View wrap={false}>
              <Text style={s.sectionTitle}>Passed checks ({data.passed.length})</Text>
              <Text style={[s.para, { color: C.muted }]}>{data.passed.join("  ·  ")}</Text>
            </View>
          )}

          {/* Honest limits */}
          <View wrap={false}>
            <Text style={s.sectionTitle}>About this audit</Text>
            {data.limits.map((l, i) => (
              <Text key={i} style={s.small}>
                • {l}
              </Text>
            ))}
          </View>

          {/* Optional "Prepared by" (from .env.local); hidden when not set. */}
          {data.preparedBy && (
            <View style={[s.panel, { marginTop: 16 }]} wrap={false}>
              <Text style={s.label}>Prepared by</Text>
              {data.preparedBy.name && <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 3 }}>{data.preparedBy.name}</Text>}
              {data.preparedBy.email && <Text style={[s.para, { marginTop: 1 }]}>{data.preparedBy.email}</Text>}
              {data.preparedBy.url && <Text style={[s.para, { color: C.muted }]}>{data.preparedBy.url}</Text>}
              <Text style={[s.para, { marginTop: 6, fontFamily: "Helvetica-Bold", color: C.brand }]}>Want help fixing these? Reply to this email.</Text>
            </View>
          )}
        </View>

        {/* Footer on every page ("fixed" repeats an element on each page). */}
        <View style={s.footerLine} fixed />
        <Text style={s.footerLeft} fixed>
          LeadLeak audit · {data.host} · {data.dateLabel}
        </Text>
        <Text style={s.footerRight} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  );
}
