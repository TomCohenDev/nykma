// Storyboard sketch thumbnails (9:16) for kav-echad's five shots, drawn as ink on grid paper.
window.SKETCH = (i, w = 90, h = 160) => {
  const ink = "#2b2a33", vi = "#6a69d6";
  const grid = `<defs><pattern id="g${i}" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0V8" fill="none" stroke="#e4e4ee" stroke-width=".6"/></pattern></defs><rect width="90" height="160" fill="#fbfbfd"/><rect width="90" height="160" fill="url(#g${i})"/>`;
  const f = `font-family="Caveat, cursive"`;
  const shots = [
    `<path d="M10 70 q6 -10 10 0 t10 0 M34 62 v14 M38 70 h6 M48 64 q4 -4 6 2 q-2 8 -6 10 h8" stroke="${ink}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
     <text x="14" y="98" ${f} font-size="15" fill="${ink}">C=100µ</text><path d="M60 96 q10 -2 18 -14" stroke="${ink}" stroke-width="1.4" fill="none"/>
     <circle cx="78" cy="82" r="2.2" fill="${ink}"/><path d="M6 128 l12 -4 m-12 4 l4 6" stroke="#c44" stroke-width="1"/><text x="20" y="134" ${f} font-size="10" fill="#c44">cam rides the nib</text>`,
    `<text x="14" y="70" ${f} font-size="13" fill="${ink}">L=10mH</text><text x="14" y="86" ${f} font-size="13" fill="${ink}">C=100µF</text>
     <rect x="9" y="56" width="58" height="36" rx="2" fill="none" stroke="${vi}" stroke-width="1.4" stroke-dasharray="3 2"/>
     <rect x="12" y="40" width="64" height="10" rx="3" fill="#fff" stroke="${ink}" stroke-width=".8"/><text x="16" y="48" font-family="sans-serif" font-size="5.5" fill="${ink}">Solve · Explain · <tspan fill="${vi}" font-weight="700">Simulate</tspan></text>
     <circle cx="58" cy="45" r="6" fill="none" stroke="#c44" stroke-width="1"/>`,
    `<rect x="8" y="48" width="74" height="64" rx="3" fill="#fff" stroke="${ink}" stroke-width=".9"/>
     <path d="M14 80 q5 -22 10 0 t10 0 t10 0 t10 0 t10 0" stroke="${vi}" stroke-width="1.6" fill="none"/>
     <circle cx="18" cy="102" r="5" fill="${vi}"/><path d="M28 102 h46" stroke="${ink}" stroke-width=".8"/>
     <text x="18" y="132" ${f} font-size="12" fill="${ink}">f ≈ 159 Hz</text><text x="80" y="30" ${f} font-size="11" fill="${ink}" direction="rtl">כותבים ביד.</text>`,
    `<rect x="8" y="48" width="74" height="64" rx="3" fill="#fff" stroke="${ink}" stroke-width=".9"/>
     <path d="M14 80 q10 -24 20 0 t20 0 q8 -14 14 -6" stroke="${vi}" stroke-width="1.8" fill="none"/>
     <path d="M20 124 h50" stroke="${ink}" stroke-width=".8"/><circle cx="58" cy="124" r="3" fill="${ink}"/><text x="18" y="140" ${f} font-size="11" fill="${ink}">C → 400µF</text>
     <path d="M70 66 l8 -6" stroke="#c44" stroke-width="1"/><text x="56" y="56" ${f} font-size="10" fill="#c44">→ M</text>`,
    `<text x="45" y="72" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="16" fill="${vi}">M<tspan fill="${ink}" font-style="normal" font-family="sans-serif" font-size="10">athbook</tspan><tspan fill="${ink}" font-size="11">LM</tspan></text>
     <path d="M22 86 h46" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/><text x="45" y="104" text-anchor="middle" ${f} font-size="12" fill="${vi}">mathbooklm.com</text>`,
  ];
  return `<svg viewBox="0 0 90 160" width="${w}" height="${h}" style="display:block">${grid}${shots[i]}</svg>`;
};
