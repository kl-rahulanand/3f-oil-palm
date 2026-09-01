/* @ds-bundle: {"format":4,"namespace":"DesignSystem_63be35","components":[{"name":"EventAnnouncementBar","sourcePath":"components/brand/EventAnnouncementBar.jsx"},{"name":"FlowSteps","sourcePath":"components/brand/FlowSteps.jsx"},{"name":"MetricBox","sourcePath":"components/brand/MetricBox.jsx"},{"name":"NumberedPoints","sourcePath":"components/brand/NumberedPoints.jsx"},{"name":"TerminalMockup","sourcePath":"components/brand/TerminalMockup.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Eyebrow","sourcePath":"components/core/Eyebrow.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"TextField","sourcePath":"components/forms/TextField.jsx"},{"name":"IsoAgent","sourcePath":"components/isometric/IsoAgent.jsx"},{"name":"IsoAppScreen","sourcePath":"components/isometric/IsoAppScreen.jsx"},{"name":"IsoCanvas","sourcePath":"components/isometric/IsoCanvas.jsx"},{"name":"IsoAt","sourcePath":"components/isometric/IsoCanvas.jsx"},{"name":"IsoCloud","sourcePath":"components/isometric/IsoCloud.jsx"},{"name":"IsoConnector","sourcePath":"components/isometric/IsoConnector.jsx"},{"name":"IsoDatabase","sourcePath":"components/isometric/IsoDatabase.jsx"},{"name":"IsoDiamond","sourcePath":"components/isometric/IsoDiamond.jsx"},{"name":"IsoDocs","sourcePath":"components/isometric/IsoDocs.jsx"},{"name":"IsoLabel","sourcePath":"components/isometric/IsoLabel.jsx"},{"name":"IsoModel","sourcePath":"components/isometric/IsoModel.jsx"},{"name":"IsoQueue","sourcePath":"components/isometric/IsoQueue.jsx"},{"name":"IsoRings","sourcePath":"components/isometric/IsoRings.jsx"},{"name":"IsoService","sourcePath":"components/isometric/IsoService.jsx"},{"name":"IsoShards","sourcePath":"components/isometric/IsoShards.jsx"},{"name":"IsoUser","sourcePath":"components/isometric/IsoUser.jsx"},{"name":"IsoWarehouse","sourcePath":"components/isometric/IsoWarehouse.jsx"},{"name":"Footer","sourcePath":"components/navigation/Footer.jsx"},{"name":"SiteHeader","sourcePath":"components/navigation/SiteHeader.jsx"},{"name":"TopNav","sourcePath":"components/navigation/TopNav.jsx"},{"name":"PartnerBadge","sourcePath":"components/partners/PartnerBadge.jsx"},{"name":"PartnerStrip","sourcePath":"components/partners/PartnerStrip.jsx"}],"sourceHashes":{"components/brand/EventAnnouncementBar.jsx":"b5a21010ae7c","components/brand/FlowSteps.jsx":"8bd4198ffda6","components/brand/MetricBox.jsx":"19b594570211","components/brand/NumberedPoints.jsx":"8ca70df35dc3","components/brand/TerminalMockup.jsx":"220e0419c97b","components/core/Badge.jsx":"6d875adca564","components/core/Button.jsx":"7884dff71f52","components/core/Card.jsx":"83693130f486","components/core/Eyebrow.jsx":"81024a602926","components/core/Input.jsx":"2398a58ab2d2","components/forms/Checkbox.jsx":"46d4f90b1ddc","components/forms/Field.jsx":"13a6b9b38950","components/forms/Radio.jsx":"b5fc8dd0ebe3","components/forms/Select.jsx":"1db9827dde73","components/forms/Switch.jsx":"ff62a9e95beb","components/forms/TextField.jsx":"6e6e631fc60e","components/isometric/IsoAgent.jsx":"6335e8d99191","components/isometric/IsoAppScreen.jsx":"12d73a9b826a","components/isometric/IsoCanvas.jsx":"ef5457a76cdb","components/isometric/IsoCloud.jsx":"bcbbfc594535","components/isometric/IsoConnector.jsx":"8874b60e45b9","components/isometric/IsoDatabase.jsx":"eb63d0c3492b","components/isometric/IsoDiamond.jsx":"07b49b795464","components/isometric/IsoDocs.jsx":"40ee024f0188","components/isometric/IsoLabel.jsx":"ec5434f709ac","components/isometric/IsoModel.jsx":"d66c7a711922","components/isometric/IsoQueue.jsx":"08988499404b","components/isometric/IsoRings.jsx":"686fee8a1379","components/isometric/IsoService.jsx":"d30989c1983e","components/isometric/IsoShards.jsx":"cab1e5bf38d0","components/isometric/IsoUser.jsx":"dd4ad894fb40","components/isometric/IsoWarehouse.jsx":"ad9ea72f8385","components/navigation/Footer.jsx":"07167916ead7","components/navigation/SiteHeader.jsx":"5bb5d347dfa5","components/navigation/TopNav.jsx":"5d746e222c68","components/partners/PartnerBadge.jsx":"6bdc7707a763","components/partners/PartnerStrip.jsx":"279314ea22a1","preview-loader.js":"9bf07f291714","ui_kits/social/kl-logo-data.js":"44962fe91c81"},"inlinedExternals":[],"unexposedExports":[{"name":"fieldBoxStyle","sourcePath":"components/forms/Field.jsx"}]} */

(() => {

const __ds_ns = (window.DesignSystem_63be35 = window.DesignSystem_63be35 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/brand/EventAnnouncementBar.jsx
try { (() => {
/* Dismissable homepage announcement bar — sits above the top nav, announces
   the next upcoming event, and links through to the event page. Mint field
   with Deep Forest ink (an approved on-dark pair, high-emphasis) so it reads
   as a distinct strip above the Deep Forest nav. Scrolls away on scroll; the
   nav stays sticky. Dismissal persists in localStorage. */
function EventAnnouncementBar({
  event,
  eventHref = 'events.html',
  storageKey
}) {
  const ev = event || (typeof getFeaturedEvent === 'function' ? getFeaturedEvent() : null);
  const key = storageKey || 'kl-eventbar-dismissed-' + (ev ? ev.id : 'event');

  // Read dismissed state synchronously at mount so the bar shows immediately
  // when not dismissed, and never flashes when it was.
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      return window.localStorage.getItem(key) === '1';
    } catch (e) {
      return false;
    }
  });
  const [closing, setClosing] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const dismiss = e => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      window.localStorage.setItem(key, '1');
    } catch (err) {/* ignore */}
    setClosing(true);
    setTimeout(() => setDismissed(true), 450);
  };
  if (!ev || dismissed) return null;
  const go = () => {
    window.location.href = eventHref;
  };
  const t = ev.dateTile || {};
  const when = (t.dow ? t.dow + ' ' : '') + (t.day || '') + ' ' + (t.mon || '');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      overflow: 'hidden',
      maxHeight: closing ? 0 : 64,
      opacity: closing ? 0 : 1,
      transition: 'max-height .45s cubic-bezier(.4,0,.2,1), opacity .35s ease',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    role: "link",
    tabIndex: 0,
    onClick: go,
    onKeyDown: e => {
      if (e.key === 'Enter') go();
    },
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: 'relative',
      background: 'var(--kl-mint)',
      color: 'var(--kl-deep-forest)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      padding: '0 52px 0 20px',
      height: 44,
      boxSizing: 'border-box',
      fontSize: 13.5,
      fontWeight: 500,
      lineHeight: 1.2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10.5,
      fontWeight: 600,
      letterSpacing: '.14em',
      textTransform: 'uppercase',
      background: 'var(--kl-deep-forest)',
      color: 'var(--kl-mint)',
      padding: '4px 9px',
      borderRadius: 999,
      whiteSpace: 'nowrap',
      flexShrink: 0
    }
  }, 'Upcoming \u00B7 ' + when), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8,
      minWidth: 0,
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis'
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontWeight: 700
    }
  }, ev.title), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'rgba(12,53,41,.72)'
    }
  }, '\u2014 invite-only roundtable in ' + (ev.city || '').replace(', India', ''))), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      flexShrink: 0,
      fontWeight: 700,
      whiteSpace: 'nowrap',
      borderBottom: '1.5px solid ' + (hover ? 'var(--kl-deep-forest)' : 'transparent'),
      paddingBottom: 1,
      transition: 'border-color .2s ease'
    }
  }, "View event", /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      transform: hover ? 'translateX(3px)' : 'none',
      transition: 'transform .2s ease'
    }
  }, "\u2192")), /*#__PURE__*/React.createElement("button", {
    "aria-label": "Dismiss announcement",
    onClick: dismiss,
    style: {
      position: 'absolute',
      right: 12,
      top: '50%',
      transform: 'translateY(-50%)',
      width: 26,
      height: 26,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: 'none',
      borderRadius: 7,
      cursor: 'pointer',
      background: 'transparent',
      color: 'var(--kl-deep-forest)',
      fontSize: 17,
      lineHeight: 1,
      transition: 'background .2s ease'
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = 'rgba(12,53,41,.12)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = 'transparent';
    }
  }, "\xD7")));
}
Object.assign(__ds_scope, { EventAnnouncementBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/EventAnnouncementBar.jsx", error: String((e && e.message) || e) }); }

// components/brand/FlowSteps.jsx
try { (() => {
/* Horizontal flow steps with mono numbers and → connectors (production deck). */
function FlowSteps({
  steps = [],
  onDark = false,
  style
}) {
  const accent = onDark ? 'var(--kl-mint)' : 'var(--kl-emerald)';
  const [narrow, setNarrow] = React.useState(typeof window !== 'undefined' && window.innerWidth < 700);
  React.useEffect(() => {
    const onR = () => setNarrow(window.innerWidth < 700);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: narrow ? 'column' : 'row',
      gap: narrow ? 22 : 0,
      flexWrap: 'wrap',
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, steps.map((s, idx) => /*#__PURE__*/React.createElement("div", {
    key: idx,
    style: {
      flex: 1,
      minWidth: 150,
      padding: narrow ? 0 : '0 18px',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      fontWeight: 600,
      color: accent,
      marginBottom: 8
    }
  }, s.num || ('0' + (idx + 1)).slice(-2)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: onDark ? '#fff' : 'var(--kl-deep-forest)',
      marginBottom: 6
    }
  }, s.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      lineHeight: 1.4,
      color: onDark ? 'var(--kl-text-on-dark)' : 'var(--kl-ink-2)'
    }
  }, s.text), idx < steps.length - 1 && !narrow ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: -8,
      top: 30,
      color: accent,
      fontSize: 20
    }
  }, "\u2192") : null)));
}
Object.assign(__ds_scope, { FlowSteps });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/FlowSteps.jsx", error: String((e && e.message) || e) }); }

// components/brand/MetricBox.jsx
try { (() => {
function MetricBox({
  value,
  label,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'rgba(28,107,73,.28)',
      border: '1px solid rgba(106,241,176,.22)',
      borderRadius: 8,
      padding: '10px 14px',
      fontFamily: 'var(--font-mono)',
      boxSizing: 'border-box',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 600,
      color: 'var(--kl-mint)',
      letterSpacing: '-0.01em',
      lineHeight: 1.1
    }
  }, value), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      letterSpacing: '.12em',
      textTransform: 'uppercase',
      color: '#8FA89E',
      marginTop: 4
    }
  }, label));
}
Object.assign(__ds_scope, { MetricBox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/MetricBox.jsx", error: String((e && e.message) || e) }); }

// components/brand/NumberedPoints.jsx
try { (() => {
/* Numbered points with circular mono counters — the production deck's
   list pattern. Emerald circles on light, Mint on dark. */
function NumberedPoints({
  items = [],
  onDark = false,
  start = 1,
  columns = 1,
  style
}) {
  return /*#__PURE__*/React.createElement("ol", {
    style: {
      listStyle: 'none',
      margin: 0,
      padding: 0,
      display: 'grid',
      gridTemplateColumns: columns === 2 ? '1fr 1fr' : '1fr',
      gap: columns === 2 ? '18px 40px' : 18,
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, items.map((it, idx) => /*#__PURE__*/React.createElement("li", {
    key: idx,
    style: {
      position: 'relative',
      paddingLeft: 52,
      fontSize: 17,
      lineHeight: 1.45,
      color: onDark ? 'var(--kl-text-on-dark)' : 'var(--kl-ink-2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 0,
      top: -2,
      width: 34,
      height: 34,
      borderRadius: '50%',
      fontFamily: 'var(--font-mono)',
      fontWeight: 600,
      fontSize: 15,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: onDark ? 'var(--kl-mint)' : 'var(--kl-emerald)',
      color: onDark ? 'var(--kl-deep-forest)' : '#fff'
    }
  }, start + idx), it.title ? /*#__PURE__*/React.createElement("b", {
    style: {
      fontWeight: 700,
      color: onDark ? '#fff' : 'var(--kl-deep-forest)'
    }
  }, it.title, " ") : null, it.text)));
}
Object.assign(__ds_scope, { NumberedPoints });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/NumberedPoints.jsx", error: String((e && e.message) || e) }); }

// components/brand/TerminalMockup.jsx
try { (() => {
/* The brand's signature proof artifact (Brand Book 08, System 1):
   shows the ACTUAL deployed system. Required on every case study. */
function TerminalMockup({
  url = 'app.client.com/ops',
  status = 'live',
  bars = [72, 48, 88, 56],
  metrics = [],
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--kl-deep-forest, #0C3529)',
      border: '1px solid rgba(106,241,176,.18)',
      borderRadius: 'var(--radius-lg, 14px)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-float)',
      fontFamily: 'var(--font-mono)',
      boxSizing: 'border-box',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 16px',
      borderBottom: '1px solid rgba(106,241,176,.14)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: 'rgba(28,107,73,.65)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: 'rgba(28,107,73,.65)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: 'rgba(28,107,73,.65)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontSize: 12,
      color: '#8FA89E',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, url), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '.14em',
      textTransform: 'uppercase',
      color: 'var(--kl-mint)',
      background: 'rgba(106,241,176,.14)',
      border: '1px solid rgba(106,241,176,.3)',
      borderRadius: 999,
      padding: '2px 10px'
    }
  }, status)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 16px 18px'
    }
  }, bars && bars.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      marginBottom: metrics.length || children ? 16 : 0
    }
  }, bars.map((w, idx) => /*#__PURE__*/React.createElement("div", {
    key: idx,
    style: {
      height: 8,
      borderRadius: 4,
      background: 'rgba(106,241,176,.12)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: Math.max(4, Math.min(100, w)) + '%',
      height: '100%',
      borderRadius: 4,
      background: 'var(--kl-mint)',
      opacity: .85
    }
  })))) : null, metrics.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(' + Math.min(metrics.length, 3) + ', 1fr)',
      gap: 10
    }
  }, metrics.map((m, idx) => /*#__PURE__*/React.createElement(__ds_scope.MetricBox, {
    key: idx,
    value: m.value,
    label: m.label
  }))) : null, children));
}
Object.assign(__ds_scope, { TerminalMockup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/TerminalMockup.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
const TONES = {
  // status badge on dark (terminal mockups): mint on tinted mint
  mint: {
    background: 'rgba(106,241,176,.14)',
    color: 'var(--kl-mint)',
    border: '1px solid rgba(106,241,176,.3)'
  },
  // on light surfaces
  emerald: {
    background: 'rgba(28,107,73,.10)',
    color: 'var(--kl-emerald)',
    border: '1px solid rgba(28,107,73,.22)'
  },
  slate: {
    background: 'rgba(95,112,106,.10)',
    color: 'var(--kl-slate)',
    border: '1px solid rgba(95,112,106,.25)'
  }
};
function Badge({
  tone = 'emerald',
  style,
  children
}) {
  const t = TONES[tone] || TONES.emerald;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      whiteSpace: 'nowrap',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      fontWeight: 500,
      letterSpacing: 'var(--tracking-caps, .12em)',
      textTransform: 'uppercase',
      padding: '3px 10px',
      borderRadius: 'var(--radius-pill, 999px)',
      ...t,
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
const SIZES = {
  md: {
    height: 'var(--btn-height, 44px)',
    padding: '0 22px',
    fontSize: 15
  },
  sm: {
    height: 'var(--btn-height-sm, 36px)',
    padding: '0 16px',
    fontSize: 14
  }
};
const VARIANTS = {
  // On light surfaces
  primary: {
    base: {
      background: 'var(--kl-emerald)',
      color: '#fff',
      border: '1px solid var(--kl-emerald)'
    },
    hover: {
      background: 'var(--kl-deep-forest)',
      borderColor: 'var(--kl-deep-forest)'
    }
  },
  secondary: {
    base: {
      background: '#fff',
      color: 'var(--kl-emerald)',
      border: '1px solid var(--kl-emerald)'
    },
    hover: {
      background: 'rgba(28,107,73,.08)'
    }
  },
  // On dark (Deep Forest) surfaces
  'dark-primary': {
    base: {
      background: 'var(--kl-mint)',
      color: 'var(--kl-deep-forest)',
      border: '1px solid var(--kl-mint)'
    },
    hover: {
      filter: 'brightness(1.06)'
    }
  },
  'dark-ghost': {
    base: {
      background: 'transparent',
      color: '#fff',
      border: '1px solid rgba(255,255,255,.35)'
    },
    hover: {
      borderColor: 'var(--kl-mint)',
      color: 'var(--kl-mint)'
    }
  }
};
function Button({
  variant = 'primary',
  size = 'md',
  mono = false,
  href,
  onClick,
  style,
  children
}) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;
  const css = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    fontFamily: mono ? 'var(--font-mono, "JetBrains Mono", monospace)' : 'var(--font-sans)',
    fontWeight: 600,
    fontSize: mono ? s.fontSize - 1 : s.fontSize,
    letterSpacing: mono ? '0.01em' : 'normal',
    height: s.height,
    padding: s.padding,
    borderRadius: 'var(--radius-md, 10px)',
    cursor: 'pointer',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    transition: 'background .2s ease, border-color .2s ease, color .2s ease, filter .2s ease, transform .15s ease',
    transform: press ? 'scale(.98)' : 'none',
    ...v.base,
    ...(hover ? v.hover : null),
    ...style
  };
  const Tag = href ? 'a' : 'button';
  return /*#__PURE__*/React.createElement(Tag, {
    href: href,
    onClick: onClick,
    style: css,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setPress(false);
    },
    onMouseDown: () => setPress(true),
    onMouseUp: () => setPress(false)
  }, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Eyebrow.jsx
try { (() => {
function Eyebrow({
  onDark = false,
  size = 'md',
  style,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: size === 'lg' ? 15 : 13,
      letterSpacing: 'var(--tracking-eyebrow, .22em)',
      textTransform: 'uppercase',
      fontWeight: 500,
      color: onDark ? 'var(--kl-mint)' : 'var(--kl-emerald)',
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Eyebrow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Eyebrow.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function Card({
  variant = 'light',
  eyebrow,
  title,
  style,
  children
}) {
  const dark = variant === 'dark';
  const base = dark ? {
    background: 'var(--kl-surface-on-dark, rgba(255,255,255,.06))',
    border: '1px solid var(--kl-border-mint, rgba(106,241,176,.25))'
  } : variant === 'proof' ? {
    background: '#fff',
    border: '1px solid var(--kl-line)',
    borderLeft: '3px solid var(--kl-emerald)',
    borderRadius: '0 10px 10px 0'
  } : {
    background: '#fff',
    border: '1px solid var(--kl-border-card, rgba(12,53,41,.10))',
    boxShadow: 'var(--shadow-card)'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 'var(--radius-md, 10px)',
      padding: '18px 22px',
      fontFamily: 'var(--font-sans)',
      boxSizing: 'border-box',
      ...base,
      ...style
    }
  }, eyebrow ? /*#__PURE__*/React.createElement(__ds_scope.Eyebrow, {
    onDark: dark,
    style: {
      fontSize: 11,
      letterSpacing: '.14em',
      marginBottom: 6
    }
  }, eyebrow) : null, title ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      lineHeight: 1.25,
      color: dark ? '#fff' : 'var(--kl-deep-forest)'
    }
  }, title) : null, children ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: dark ? 'var(--kl-text-on-dark)' : 'var(--kl-ink-2)',
      marginTop: 6,
      lineHeight: 1.42
    }
  }, children) : null);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function Input({
  label,
  type = 'text',
  placeholder,
  multiline = false,
  style
}) {
  const [focus, setFocus] = React.useState(false);
  const field = {
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'var(--font-sans)',
    fontSize: 15,
    color: 'var(--kl-ink)',
    background: '#fff',
    border: focus ? '1px solid var(--kl-emerald)' : '1px solid var(--kl-border-card, rgba(12,53,41,.10))',
    boxShadow: focus ? '0 0 0 3px rgba(28,107,73,.14)' : 'var(--shadow-card)',
    borderRadius: 'var(--radius-md, 10px)',
    padding: multiline ? '12px 14px' : '0 14px',
    height: multiline ? undefined : 'var(--btn-height, 44px)',
    minHeight: multiline ? 96 : undefined,
    outline: 'none',
    transition: 'border-color .2s ease, box-shadow .2s ease',
    resize: 'vertical'
  };
  const Tag = multiline ? 'textarea' : 'input';
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--kl-deep-forest)',
      marginBottom: 6
    }
  }, label) : null, /*#__PURE__*/React.createElement(Tag, {
    type: multiline ? undefined : type,
    placeholder: placeholder,
    style: field,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false)
  }));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
/* Checkbox — 18px square, Emerald when checked, white tick. */
function Checkbox({
  label,
  hint,
  checked,
  defaultChecked = false,
  onChange,
  disabled = false,
  style
}) {
  const [internal, setInternal] = React.useState(defaultChecked);
  const [focus, setFocus] = React.useState(false);
  const on = checked !== undefined ? checked : internal;
  const toggle = () => {
    if (disabled) return;
    setInternal(!on);
    if (onChange) onChange(!on);
  };
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'var(--font-sans)',
      opacity: disabled ? 0.55 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: on,
    disabled: disabled,
    onChange: toggle,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      position: 'absolute',
      opacity: 0,
      width: 1,
      height: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 'none',
      width: 18,
      height: 18,
      borderRadius: 4,
      marginTop: 1,
      boxSizing: 'border-box',
      background: on ? 'var(--kl-emerald)' : '#fff',
      border: on ? '1px solid var(--kl-emerald)' : '1px solid rgba(12,53,41,.25)',
      boxShadow: focus ? '0 0 0 3px rgba(28,107,73,.14)' : 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background .15s ease, border-color .15s ease, box-shadow .15s ease'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "9",
    viewBox: "0 0 11 9",
    style: {
      opacity: on ? 1 : 0,
      transition: 'opacity .12s ease'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 4.5 L4 7.5 L10 1",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14.5,
      color: 'var(--kl-ink)',
      lineHeight: 1.4
    }
  }, label), hint ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--kl-slate)',
      marginTop: 2
    }
  }, hint) : null));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
/* Field chrome shared by every form control: label, hint, error.
   Deep Forest label, Slate hint, error in the flagged --kl-error extension. */
function Field({
  label,
  required = false,
  hint,
  error,
  disabled = false,
  style,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      opacity: disabled ? 0.55 : 1,
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--kl-deep-forest)',
      marginBottom: 6
    }
  }, label, required ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--kl-emerald)'
    }
  }, " *") : null) : null, children, error ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--kl-error, #A8442E)',
      marginTop: 6
    }
  }, error) : hint ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--kl-slate)',
      marginTop: 6
    }
  }, hint) : null);
}

/* Shared visual recipe for field boxes — used by TextField and Select. */
function fieldBoxStyle({
  focus,
  error,
  disabled
}) {
  return {
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'var(--font-sans)',
    fontSize: 15,
    color: disabled ? 'var(--kl-slate)' : 'var(--kl-ink)',
    background: disabled ? 'var(--kl-off-white)' : '#fff',
    border: error ? '1px solid var(--kl-error, #A8442E)' : focus ? '1px solid var(--kl-emerald)' : '1px solid var(--kl-border-card, rgba(12,53,41,.10))',
    boxShadow: focus ? '0 0 0 3px ' + (error ? 'var(--kl-error-tint, rgba(168,68,46,.08))' : 'rgba(28,107,73,.14)') : 'var(--shadow-card)',
    borderRadius: 'var(--radius-md, 10px)',
    outline: 'none',
    transition: 'border-color .2s ease, box-shadow .2s ease',
    cursor: disabled ? 'not-allowed' : undefined
  };
}
Object.assign(__ds_scope, { Field, fieldBoxStyle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
/* Radio group — vertical or inline list of radio options. */
function Radio({
  label,
  required,
  hint,
  error,
  disabled = false,
  options = [],
  value,
  defaultValue,
  onChange,
  inline = false,
  name,
  style
}) {
  const norm = options.map(o => typeof o === 'string' ? {
    value: o,
    label: o
  } : o);
  const [internal, setInternal] = React.useState(defaultValue);
  const [focusVal, setFocusVal] = React.useState(null);
  const current = value !== undefined ? value : internal;
  const groupName = React.useRef(name || 'kl-radio-' + Math.random().toString(36).slice(2, 8)).current;
  const pick = v => {
    if (disabled) return;
    setInternal(v);
    if (onChange) onChange(v);
  };
  return /*#__PURE__*/React.createElement(__ds_scope.Field, {
    label: label,
    required: required,
    hint: hint,
    error: error,
    disabled: disabled,
    style: style
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: inline ? 'row' : 'column',
      gap: inline ? 20 : 10,
      flexWrap: 'wrap'
    }
  }, norm.map(o => {
    const on = o.value === current;
    return /*#__PURE__*/React.createElement("label", {
      key: o.value,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        cursor: disabled ? 'not-allowed' : 'pointer'
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "radio",
      name: groupName,
      checked: on,
      disabled: disabled,
      onChange: () => pick(o.value),
      onFocus: () => setFocusVal(o.value),
      onBlur: () => setFocusVal(null),
      style: {
        position: 'absolute',
        opacity: 0,
        width: 1,
        height: 1
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 'none',
        width: 18,
        height: 18,
        borderRadius: '50%',
        boxSizing: 'border-box',
        border: on ? '5.5px solid var(--kl-emerald)' : '1px solid rgba(12,53,41,.25)',
        background: '#fff',
        boxShadow: focusVal === o.value ? '0 0 0 3px rgba(28,107,73,.14)' : 'none',
        transition: 'border .15s ease, box-shadow .15s ease'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14.5,
        color: 'var(--kl-ink)'
      }
    }, o.label));
  })));
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
/* Custom select — field box + floating options panel. Options are strings
   or { value, label }. Keyboard: Enter/Space open, arrows move, Esc closes. */
function Select({
  label,
  required,
  hint,
  error,
  disabled = false,
  options = [],
  value,
  defaultValue,
  onChange,
  placeholder = 'Select…',
  style
}) {
  const norm = options.map(o => typeof o === 'string' ? {
    value: o,
    label: o
  } : o);
  const [open, setOpen] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const [internal, setInternal] = React.useState(defaultValue);
  const [hoverIdx, setHoverIdx] = React.useState(-1);
  const current = value !== undefined ? value : internal;
  const sel = norm.find(o => o.value === current);
  const rootRef = React.useRef(null);
  React.useEffect(() => {
    const onDoc = e => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const pick = o => {
    setInternal(o.value);
    setOpen(false);
    if (onChange) onChange(o.value);
  };
  const onKey = e => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(!open);
    } else if (e.key === 'Escape') setOpen(false);else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHoverIdx(i => Math.min(norm.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHoverIdx(i => Math.max(0, i - 1));
    } else if (e.key === 'Tab') setOpen(false);
  };
  return /*#__PURE__*/React.createElement(__ds_scope.Field, {
    label: label,
    required: required,
    hint: hint,
    error: error,
    disabled: disabled,
    style: style
  }, /*#__PURE__*/React.createElement("div", {
    ref: rootRef,
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    disabled: disabled,
    onClick: () => setOpen(!open),
    onKeyDown: onKey,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      ...__ds_scope.fieldBoxStyle({
        focus: focus || open,
        error,
        disabled
      }),
      height: 'var(--btn-height, 44px)',
      padding: '0 14px',
      textAlign: 'left',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: sel ? 'var(--kl-ink)' : 'var(--kl-slate)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, sel ? sel.label : placeholder), /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "8",
    viewBox: "0 0 12 8",
    style: {
      flex: 'none',
      transform: open ? 'rotate(180deg)' : 'none',
      transition: 'transform .2s ease'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1.5 L6 6.5 L11 1.5",
    fill: "none",
    stroke: "var(--kl-emerald, #1C6B49)",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), open ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 'calc(100% + 6px)',
      left: 0,
      right: 0,
      zIndex: 40,
      background: '#fff',
      border: '1px solid var(--kl-border-card, rgba(12,53,41,.10))',
      borderRadius: 'var(--radius-md, 10px)',
      boxShadow: 'var(--shadow-float)',
      padding: 6,
      maxHeight: 240,
      overflowY: 'auto'
    }
  }, norm.map((o, i) => {
    const isSel = o.value === current;
    return /*#__PURE__*/React.createElement("div", {
      key: o.value,
      onMouseEnter: () => setHoverIdx(i),
      onMouseLeave: () => setHoverIdx(-1),
      onClick: () => pick(o),
      style: {
        height: 36,
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        borderRadius: 6,
        fontSize: 14.5,
        cursor: 'pointer',
        background: hoverIdx === i ? 'rgba(106,241,176,.14)' : 'transparent',
        color: isSel ? 'var(--kl-emerald)' : 'var(--kl-ink)',
        fontWeight: isSel ? 600 : 400,
        justifyContent: 'space-between'
      }
    }, o.label, isSel ? /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'var(--kl-emerald)'
      }
    }) : null);
  })) : null));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
/* Switch — 40×22 toggle. Emerald track when on. */
function Switch({
  label,
  hint,
  checked,
  defaultChecked = false,
  onChange,
  disabled = false,
  style
}) {
  const [internal, setInternal] = React.useState(defaultChecked);
  const [focus, setFocus] = React.useState(false);
  const on = checked !== undefined ? checked : internal;
  const toggle = () => {
    if (disabled) return;
    setInternal(!on);
    if (onChange) onChange(!on);
  };
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'var(--font-sans)',
      opacity: disabled ? 0.55 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    role: "switch",
    checked: on,
    disabled: disabled,
    onChange: toggle,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      position: 'absolute',
      opacity: 0,
      width: 1,
      height: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 'none',
      width: 40,
      height: 22,
      borderRadius: 999,
      marginTop: 1,
      boxSizing: 'border-box',
      background: on ? 'var(--kl-emerald)' : 'rgba(95,112,106,.30)',
      boxShadow: focus ? '0 0 0 3px rgba(28,107,73,.14)' : 'none',
      position: 'relative',
      transition: 'background .2s ease, box-shadow .15s ease'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 2,
      left: on ? 20 : 2,
      width: 18,
      height: 18,
      borderRadius: '50%',
      background: '#fff',
      boxShadow: '0 1px 3px rgba(12,53,41,.25)',
      transition: 'left .2s ease'
    }
  })), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14.5,
      color: 'var(--kl-ink)',
      lineHeight: 1.4
    }
  }, label), hint ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--kl-slate)',
      marginTop: 2
    }
  }, hint) : null));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/TextField.jsx
try { (() => {
/* Text input / textarea for the light product-UI theme. */
function TextField({
  label,
  required,
  hint,
  error,
  disabled = false,
  type = 'text',
  placeholder,
  multiline = false,
  rows = 4,
  value,
  defaultValue,
  onChange,
  style
}) {
  const [focus, setFocus] = React.useState(false);
  const box = {
    ...__ds_scope.fieldBoxStyle({
      focus,
      error,
      disabled
    }),
    padding: multiline ? '12px 14px' : '0 14px',
    height: multiline ? undefined : 'var(--btn-height, 44px)',
    minHeight: multiline ? rows * 24 : undefined,
    resize: multiline ? 'vertical' : undefined,
    lineHeight: multiline ? 1.5 : undefined
  };
  const Tag = multiline ? 'textarea' : 'input';
  return /*#__PURE__*/React.createElement(__ds_scope.Field, {
    label: label,
    required: required,
    hint: hint,
    error: error,
    disabled: disabled,
    style: style
  }, /*#__PURE__*/React.createElement(Tag, {
    type: multiline ? undefined : type,
    placeholder: placeholder,
    disabled: disabled,
    value: value,
    defaultValue: defaultValue,
    onChange: onChange,
    style: box,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false)
  }));
}
Object.assign(__ds_scope, { TextField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/TextField.jsx", error: String((e && e.message) || e) }); }

// components/isometric/IsoCanvas.jsx
try { (() => {
/* Positioning surface for isometric diagrams: a relative container on the
   light canvas. Children are absolutely positioned; IsoConnector overlays.
   Optional faint dashed frame (the Baseten-style page grid). */
function IsoCanvas({
  width = 900,
  height = 520,
  frame = false,
  background = 'transparent',
  style,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width,
      height,
      background,
      border: frame ? '1px dashed rgba(12,53,41,.18)' : 'none',
      boxSizing: 'border-box',
      overflow: 'visible',
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, children);
}

/* Absolute-position helper: <IsoAt x={120} y={80}><IsoDatabase/></IsoAt> */
function IsoAt({
  x = 0,
  y = 0,
  z = 1,
  center = false,
  style,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: x,
      top: y,
      zIndex: z,
      transform: center ? 'translate(-50%, -50%)' : 'none',
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { IsoCanvas, IsoAt });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/isometric/IsoCanvas.jsx", error: String((e && e.message) || e) }); }

// components/isometric/IsoConnector.jsx
try { (() => {
/* Dashed connector with small arrowheads + optional flowing data dot.
   Brand Book 08: "dashed lines with small arrowheads. No curved swooshes." */
function IsoConnector({
  points = [[0, 0], [120, 60]],
  tone = 'emerald',
  arrow = true,
  endDots = true,
  animated = false,
  duration = 3,
  style
}) {
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const pad = 8;
  const minX = Math.min(...xs) - pad,
    minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - minX + pad,
    h = Math.max(...ys) - minY + pad;
  const local = points.map(p => [p[0] - minX, p[1] - minY]);
  const d = local.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1]).join(' ');
  const color = tone === 'slate' ? 'var(--kl-slate, #5F706A)' : 'var(--kl-emerald, #1C6B49)';
  // arrowhead at the end, oriented along the last segment
  const [ax, ay] = local[local.length - 1];
  const [px, py] = local[local.length - 2] || [ax - 10, ay];
  const ang = Math.atan2(ay - py, ax - px);
  const a1 = [ax - 7 * Math.cos(ang - 0.42), ay - 7 * Math.sin(ang - 0.42)];
  const a2 = [ax - 7 * Math.cos(ang + 0.42), ay - 7 * Math.sin(ang + 0.42)];
  return /*#__PURE__*/React.createElement("svg", {
    width: w,
    height: h,
    style: {
      position: 'absolute',
      left: minX,
      top: minY,
      overflow: 'visible',
      pointerEvents: 'none',
      ...style
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: d,
    fill: "none",
    stroke: color,
    strokeWidth: "1.3",
    strokeDasharray: "4 4"
  }), endDots ? /*#__PURE__*/React.createElement("circle", {
    cx: local[0][0],
    cy: local[0][1],
    r: "2.5",
    fill: color
  }) : null, arrow ? /*#__PURE__*/React.createElement("path", {
    d: 'M' + ax + ',' + ay + ' L' + a1[0] + ',' + a1[1] + ' L' + a2[0] + ',' + a2[1] + ' Z',
    fill: color
  }) : null, animated ? /*#__PURE__*/React.createElement("circle", {
    r: "3",
    fill: "var(--kl-mint, #6AF1B0)",
    stroke: color,
    strokeWidth: "1"
  }, /*#__PURE__*/React.createElement("animateMotion", {
    dur: duration + 's',
    repeatCount: "indefinite",
    path: d
  })) : null);
}
Object.assign(__ds_scope, { IsoConnector });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/isometric/IsoConnector.jsx", error: String((e && e.message) || e) }); }

// components/isometric/IsoDiamond.jsx
try { (() => {
/* Flat isometric diamond — the confetti element scattered around diagrams.
   A square mapped onto the iso ground plane. */
const ISO = '0.866 0.5 -0.866 0.5';
function IsoDiamond({
  size = 18,
  tone = 'mint',
  stacked = false,
  style
}) {
  const fills = {
    mint: 'var(--kl-mint, #6AF1B0)',
    emerald: 'var(--kl-emerald, #1C6B49)',
    tint: 'rgba(106,241,176,.30)',
    outline: 'none'
  };
  const s = size / 1.732; // square side so total width = size
  const W = size + 4,
    H = size * 0.58 + (stacked ? 8 : 0) + 4;
  const cx = W / 2,
    cy = 2;
  const diamond = (dy, fill, op) => /*#__PURE__*/React.createElement("rect", {
    key: dy,
    x: -s / 2,
    y: -s / 2,
    width: s,
    height: s,
    transform: 'translate(' + cx + ',' + (cy + size * 0.29 + dy) + ') matrix(' + ISO + ' 0 0)',
    fill: fill,
    fillOpacity: op,
    stroke: tone === 'outline' ? 'var(--kl-deep-forest, #0C3529)' : 'none',
    strokeWidth: "1"
  });
  return /*#__PURE__*/React.createElement("svg", {
    width: W,
    height: H,
    style: {
      display: 'block',
      overflow: 'visible',
      ...style
    }
  }, stacked ? diamond(8, fills[tone] === 'none' ? 'none' : fills[tone], 0.35) : null, stacked ? diamond(4, fills[tone] === 'none' ? 'none' : fills[tone], 0.6) : null, diamond(0, fills[tone] || fills.mint, tone === 'tint' ? 1 : 1));
}
Object.assign(__ds_scope, { IsoDiamond });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/isometric/IsoDiamond.jsx", error: String((e && e.message) || e) }); }

// components/isometric/IsoLabel.jsx
try { (() => {
/* Mono label chip for isometric diagrams (Brand Book 08: JetBrains Mono,
   real metrics). Tones stay inside the brand: mint tint, outline, slate. */
function IsoLabel({
  tone = 'tint',
  size = 'md',
  style,
  children
}) {
  const tones = {
    tint: {
      background: 'rgba(106,241,176,.16)',
      border: '1px solid var(--kl-emerald, #1C6B49)',
      color: 'var(--kl-deep-forest, #0C3529)'
    },
    outline: {
      background: '#fff',
      border: '1px solid var(--kl-emerald, #1C6B49)',
      color: 'var(--kl-deep-forest, #0C3529)'
    },
    slate: {
      background: '#fff',
      border: '1px solid rgba(95,112,106,.5)',
      color: 'var(--kl-slate, #5F706A)'
    },
    solid: {
      background: 'var(--kl-emerald, #1C6B49)',
      border: '1px solid var(--kl-emerald, #1C6B49)',
      color: '#fff'
    }
  };
  const t = tones[tone] || tones.tint;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      fontFamily: 'var(--font-mono)',
      fontWeight: 500,
      fontSize: size === 'sm' ? 9.5 : 11.5,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      padding: size === 'sm' ? '2px 6px' : '4px 9px',
      whiteSpace: 'nowrap',
      boxShadow: '0 1px 0 rgba(12,53,41,.06)',
      ...t,
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { IsoLabel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/isometric/IsoLabel.jsx", error: String((e && e.message) || e) }); }

// components/isometric/IsoAgent.jsx
try { (() => {
/* AI Agent — a cube with a pulsing mint presence ring and a status chip.
   The pulse is the "this thing is alive and working" signal. */
function IsoAgent({
  size = 110,
  label,
  metric,
  status = 'live',
  animated = true,
  style
}) {
  const W = size,
    hw = W / 2,
    h = W / 4,
    d = W * 0.42;
  const c = hw + 2,
    t = 2 + h * 0.9; // leave headroom for the pulse
  const H = t + 2 * h + d + 2;
  const pt = arr => arr.map(p => p.join(',')).join(' ');
  const top = [[c, t], [c + hw, t + h], [c, t + 2 * h], [c - hw, t + h]];
  const left = [[c - hw, t + h], [c, t + 2 * h], [c, t + 2 * h + d], [c - hw, t + h + d]];
  const right = [[c, t + 2 * h], [c + hw, t + h], [c + hw, t + h + d], [c, t + 2 * h + d]];
  const hi = 0.42;
  const hiD = [[c, t + h - h * hi], [c + hw * hi, t + h], [c, t + h + h * hi], [c - hw * hi, t + h]];
  const DEEP = 'var(--kl-deep-forest, #0C3529)';
  const MINT = 'var(--kl-mint, #6AF1B0)';
  const pulse = delay => /*#__PURE__*/React.createElement("ellipse", {
    cx: c,
    cy: t + h,
    rx: hw * 0.6,
    ry: h * 0.6,
    fill: "none",
    stroke: MINT,
    strokeWidth: "1.5"
  }, /*#__PURE__*/React.createElement("animate", {
    attributeName: "rx",
    values: hw * 0.55 + ';' + hw * 1.18,
    dur: "2.4s",
    begin: delay,
    repeatCount: "indefinite"
  }), /*#__PURE__*/React.createElement("animate", {
    attributeName: "ry",
    values: h * 0.55 + ';' + h * 1.18,
    dur: "2.4s",
    begin: delay,
    repeatCount: "indefinite"
  }), /*#__PURE__*/React.createElement("animate", {
    attributeName: "opacity",
    values: ".8;0",
    dur: "2.4s",
    begin: delay,
    repeatCount: "indefinite"
  }));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-block',
      position: 'relative',
      textAlign: 'center',
      ...style
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: W + 4,
    height: H,
    style: {
      display: 'block',
      overflow: 'visible'
    }
  }, /*#__PURE__*/React.createElement("polygon", {
    points: pt(left),
    fill: "#174F37",
    stroke: DEEP,
    strokeWidth: "1.2",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: pt(right),
    fill: "var(--kl-emerald, #1C6B49)",
    stroke: DEEP,
    strokeWidth: "1.2",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: pt(top),
    fill: "#E3FAEF",
    stroke: DEEP,
    strokeWidth: "1.2",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: pt(hiD),
    fill: MINT,
    opacity: "0.9"
  }), animated ? pulse('0s') : null, animated ? pulse('1.2s') : null, /*#__PURE__*/React.createElement("circle", {
    cx: c + hw * 0.72,
    cy: t + h * 0.4,
    r: "4.5",
    fill: MINT,
    stroke: DEEP,
    strokeWidth: "1.2"
  })), label ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, null, label)) : null, status ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -10,
      left: '74%',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, {
    tone: "solid",
    size: "sm"
  }, status)) : null, metric ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: H * 0.46,
      left: '92%',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, {
    tone: "outline",
    size: "sm"
  }, metric)) : null);
}
Object.assign(__ds_scope, { IsoAgent });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/isometric/IsoAgent.jsx", error: String((e && e.message) || e) }); }

// components/isometric/IsoAppScreen.jsx
try { (() => {
/* Web app / dashboard — a standing isometric screen panel with a mint
   header bar and emerald chart bars. */
function IsoAppScreen({
  size = 120,
  label,
  metric,
  style
}) {
  const sc = size / 120;
  const W = 118,
    H = 152;
  const x0 = 8,
    y0 = H - 12,
    pw = 95,
    py = 55,
    ph = 78;
  const p = (u, v) => [x0 + pw * u, y0 - py * u - v];
  const pt = arr => arr.map(c => c.join(',')).join(' ');
  const quad = (u1, v1, u2, v2) => pt([p(u1, v1), p(u2, v1), p(u2, v2), p(u1, v2)]);
  const DEEP = 'var(--kl-deep-forest, #0C3529)';
  const off = [-6, -3.5]; // panel thickness, back-left
  const front = [p(0, 0), p(1, 0), p(1, ph), p(0, ph)];
  const back = front.map(c => [c[0] + off[0], c[1] + off[1]]);
  const bars = [[0.10, 22], [0.24, 34], [0.38, 28], [0.52, 44], [0.66, 36], [0.80, 50]];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-block',
      position: 'relative',
      textAlign: 'center',
      ...style
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: W * sc,
    height: H * sc,
    viewBox: '0 0 ' + W + ' ' + H,
    style: {
      display: 'block',
      overflow: 'visible'
    }
  }, /*#__PURE__*/React.createElement("polygon", {
    points: pt([back[3], back[0], front[0], front[3]]),
    fill: "var(--kl-emerald, #1C6B49)",
    stroke: DEEP,
    strokeWidth: "1.1"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: pt([back[3], back[2], front[2], front[3]]),
    fill: "#174F37",
    stroke: DEEP,
    strokeWidth: "1.1"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: pt(front),
    fill: "#FFFFFF",
    stroke: DEEP,
    strokeWidth: "1.3"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: quad(0.06, ph - 8, 0.94, ph - 16),
    fill: "var(--kl-mint, #6AF1B0)"
  }), bars.map((b, i) => /*#__PURE__*/React.createElement("polygon", {
    key: i,
    points: quad(b[0], 8, b[0] + 0.09, 8 + b[1]),
    fill: i % 2 ? 'var(--kl-emerald, #1C6B49)' : 'rgba(106,241,176,.55)'
  }))), label ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, null, label)) : null, metric ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -2,
      left: '72%',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, {
    tone: "outline",
    size: "sm"
  }, metric)) : null);
}
Object.assign(__ds_scope, { IsoAppScreen });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/isometric/IsoAppScreen.jsx", error: String((e && e.message) || e) }); }

// components/isometric/IsoCloud.jsx
try { (() => {
/* Cloud / cluster — overlapping capsule pills lying on the iso plane
   (the Baseten cloud motif in KnackLabs colors). */
function IsoCloud({
  size = 140,
  label,
  metric,
  style
}) {
  const sc = size / 140;
  const W = 140,
    H = 96;
  const cx = 64,
    cy = 26;
  const iso = 'matrix(0.866 0.5 -0.866 0.5 ';
  const pill = (ox, oy, fill, op) => /*#__PURE__*/React.createElement("rect", {
    x: -35,
    y: -12,
    width: 70,
    height: 24,
    rx: 12,
    transform: 'translate(' + (cx + 0.866 * (ox - oy)) + ',' + (cy + 0.5 * (ox + oy)) + ') ' + iso + '0 0)',
    fill: fill,
    fillOpacity: op || 1,
    stroke: "var(--kl-deep-forest, #0C3529)",
    strokeWidth: "1.1"
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-block',
      position: 'relative',
      textAlign: 'center',
      ...style
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: W * sc,
    height: H * sc,
    viewBox: '0 0 ' + W + ' ' + H,
    style: {
      display: 'block',
      overflow: 'visible'
    }
  }, pill(26, -14, '#FFFFFF'), pill(0, 0, 'var(--kl-emerald, #1C6B49)'), pill(-26, 14, 'rgba(106,241,176,.45)'), pill(2, 30, 'var(--kl-mint, #6AF1B0)')), label ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, null, label)) : null, metric ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -8,
      left: '74%',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, {
    tone: "outline",
    size: "sm"
  }, metric)) : null);
}
Object.assign(__ds_scope, { IsoCloud });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/isometric/IsoCloud.jsx", error: String((e && e.message) || e) }); }

// components/isometric/IsoDatabase.jsx
try { (() => {
/* Database — a stack of isometric disks with brand-colored bands
   (mint top, emerald middle, white base). */
function IsoDatabase({
  size = 120,
  disks = 3,
  label,
  metric,
  style
}) {
  const R = (size - 8) / 2,
    ry = R * 0.48;
  const dh = size * 0.14,
    gap = size * 0.055;
  const cx = size / 2,
    t = ry + 3;
  const H = t + (disks - 1) * (dh + gap) + dh + ry + 4;
  const DEEP = 'var(--kl-deep-forest, #0C3529)';
  const bands = ['var(--kl-mint, #6AF1B0)', 'var(--kl-emerald, #1C6B49)', '#FFFFFF', 'rgba(106,241,176,.25)'];
  const disk = i => {
    const cy = t + i * (dh + gap);
    const side = 'M' + (cx - R) + ',' + cy + ' L' + (cx - R) + ',' + (cy + dh) + ' A' + R + ',' + ry + ' 0 0 0 ' + (cx + R) + ',' + (cy + dh) + ' L' + (cx + R) + ',' + cy;
    return /*#__PURE__*/React.createElement("g", {
      key: i
    }, /*#__PURE__*/React.createElement("path", {
      d: side,
      fill: bands[i % bands.length],
      stroke: DEEP,
      strokeWidth: "1.2"
    }), /*#__PURE__*/React.createElement("ellipse", {
      cx: cx,
      cy: cy,
      rx: R,
      ry: ry,
      fill: "#E9FCF2",
      stroke: DEEP,
      strokeWidth: "1.2"
    }));
  };
  const order = [];
  for (let i = disks - 1; i >= 0; i--) order.push(disk(i));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-block',
      position: 'relative',
      textAlign: 'center',
      ...style
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: H,
    style: {
      display: 'block',
      overflow: 'visible'
    }
  }, order), label ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, null, label)) : null, metric ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -4,
      left: '82%',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, {
    tone: "outline",
    size: "sm"
  }, metric)) : null);
}
Object.assign(__ds_scope, { IsoDatabase });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/isometric/IsoDatabase.jsx", error: String((e && e.message) || e) }); }

// components/isometric/IsoDocs.jsx
try { (() => {
/* Document / file stack — flat isometric sheets with mono line marks. */
function IsoDocs({
  size = 120,
  sheets = 3,
  label,
  metric,
  style
}) {
  const sc = size / 120;
  const W = 120,
    sw = 74,
    sh = 52,
    dy = 11;
  const H = (sw + sh) * 0.5 + dy * (sheets - 1) + 10;
  const cx = W / 2,
    baseY = H - (sw + sh) * 0.25 - 4;
  const DEEP = 'var(--kl-deep-forest, #0C3529)';
  const iso = (tx, ty) => 'translate(' + tx + ',' + ty + ') matrix(0.866 0.5 -0.866 0.5 0 0)';
  const sheet = i => {
    const y = baseY - i * dy;
    const topmost = i === sheets - 1;
    return /*#__PURE__*/React.createElement("g", {
      key: i,
      transform: iso(cx, y)
    }, /*#__PURE__*/React.createElement("rect", {
      x: -sw / 2,
      y: -sh / 2,
      width: sw,
      height: sh,
      fill: topmost ? '#FFFFFF' : '#F0F7F3',
      stroke: DEEP,
      strokeWidth: "1.1"
    }), topmost ? /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("rect", {
      x: -sw / 2 + 9,
      y: -sh / 2 + 9,
      width: sw * 0.55,
      height: 4,
      fill: "var(--kl-emerald, #1C6B49)"
    }), /*#__PURE__*/React.createElement("rect", {
      x: -sw / 2 + 9,
      y: -sh / 2 + 18,
      width: sw * 0.72,
      height: 4,
      fill: "rgba(106,241,176,.6)"
    }), /*#__PURE__*/React.createElement("rect", {
      x: -sw / 2 + 9,
      y: -sh / 2 + 27,
      width: sw * 0.4,
      height: 4,
      fill: "rgba(106,241,176,.6)"
    })) : null);
  };
  const order = [];
  for (let i = 0; i < sheets; i++) order.push(sheet(i));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-block',
      position: 'relative',
      textAlign: 'center',
      ...style
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: W * sc,
    height: H * sc,
    viewBox: '0 0 ' + W + ' ' + H,
    style: {
      display: 'block',
      overflow: 'visible'
    }
  }, order), label ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, null, label)) : null, metric ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -8,
      left: '76%',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, {
    tone: "outline",
    size: "sm"
  }, metric)) : null);
}
Object.assign(__ds_scope, { IsoDocs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/isometric/IsoDocs.jsx", error: String((e && e.message) || e) }); }

// components/isometric/IsoModel.jsx
try { (() => {
/* LLM / model — dashed wireframe cube (the "abstract capability" register,
   like Baseten's model cubes). Optional mint core diamond. */
function IsoModel({
  size = 110,
  label,
  metric,
  core = true,
  style
}) {
  const W = size,
    hw = W / 2,
    h = W / 4,
    d = W * 0.42;
  const c = hw + 2,
    t = 2;
  const H = t + 2 * h + d + 2;
  const pt = arr => arr.map(p => p.join(',')).join(' ');
  const N = [c, t],
    E = [c + hw, t + h],
    S = [c, t + 2 * h],
    Wp = [c - hw, t + h];
  const Sd = [c, t + 2 * h + d],
    Ed = [c + hw, t + h + d],
    Wd = [c - hw, t + h + d],
    Nd = [c, t + d];
  const DEEP = 'var(--kl-deep-forest, #0C3529)';
  const hi = 0.4;
  const hiD = [[c, t + h - h * hi], [c + hw * hi, t + h], [c, t + h + h * hi], [c - hw * hi, t + h]];
  const edge = (a, b, faint) => /*#__PURE__*/React.createElement("line", {
    x1: a[0],
    y1: a[1],
    x2: b[0],
    y2: b[1],
    stroke: DEEP,
    strokeWidth: "1.2",
    strokeDasharray: "5 3",
    opacity: faint ? 0.3 : 1
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-block',
      position: 'relative',
      textAlign: 'center',
      ...style
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: W + 4,
    height: H,
    style: {
      display: 'block',
      overflow: 'visible'
    }
  }, edge(N, Nd, true), edge(Nd, Wd, true), edge(Nd, Ed, true), /*#__PURE__*/React.createElement("polygon", {
    points: pt([N, E, S, Wp]),
    fill: "rgba(106,241,176,.08)",
    stroke: DEEP,
    strokeWidth: "1.2",
    strokeDasharray: "5 3"
  }), edge(Wp, Wd), edge(S, Sd), edge(E, Ed), edge(Wd, Sd), edge(Sd, Ed), core ? /*#__PURE__*/React.createElement("polygon", {
    points: pt(hiD),
    fill: "var(--kl-mint, #6AF1B0)",
    opacity: "0.55"
  }) : null), label ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, {
    tone: "outline"
  }, label)) : null, metric ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -6,
      left: '78%',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, {
    tone: "outline",
    size: "sm"
  }, metric)) : null);
}
Object.assign(__ds_scope, { IsoModel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/isometric/IsoModel.jsx", error: String((e && e.message) || e) }); }

// components/isometric/IsoQueue.jsx
try { (() => {
/* Queue / message bus — flat slabs spaced along the iso axis. */
function IsoQueue({
  size = 150,
  count = 3,
  label,
  metric,
  style
}) {
  const sc = size / 150;
  const iso = (x, y) => [0.866 * (x - y), 0.5 * (x + y)];
  const w = 36,
    hh = 24,
    d = 9,
    sp = 34;
  const W = 150,
    H = 70;
  const x0 = 32,
    y0 = 34;
  const DEEP = 'var(--kl-deep-forest, #0C3529)';
  const tones = ['rgba(106,241,176,.30)', 'var(--kl-mint, #6AF1B0)', 'var(--kl-emerald, #1C6B49)', 'rgba(106,241,176,.30)'];
  const slab = i => {
    const ox = x0 + i * sp * 0.866,
      oy = y0 - i * sp * 0.5 + (count - 1) * sp * 0.25;
    const A = iso(-w / 2, -hh / 2),
      B = iso(w / 2, -hh / 2),
      C = iso(w / 2, hh / 2),
      D = iso(-w / 2, hh / 2);
    const m = p => [p[0] + ox, p[1] + oy];
    const [a, b, c2, dd] = [m(A), m(B), m(C), m(D)];
    const dn = p => [p[0], p[1] + d];
    const pt = arr => arr.map(p => p.join(',')).join(' ');
    const topTone = tones[i % tones.length];
    return /*#__PURE__*/React.createElement("g", {
      key: i
    }, /*#__PURE__*/React.createElement("polygon", {
      points: pt([dd, c2, dn(c2), dn(dd)]),
      fill: i % 3 === 2 ? '#174F37' : '#E9F5EE',
      stroke: DEEP,
      strokeWidth: "1.1"
    }), /*#__PURE__*/React.createElement("polygon", {
      points: pt([c2, b, dn(b), dn(c2)]),
      fill: i % 3 === 2 ? 'var(--kl-emerald, #1C6B49)' : '#FFFFFF',
      stroke: DEEP,
      strokeWidth: "1.1"
    }), /*#__PURE__*/React.createElement("polygon", {
      points: pt([a, b, c2, dd]),
      fill: topTone,
      stroke: DEEP,
      strokeWidth: "1.1",
      strokeLinejoin: "round"
    }));
  };
  const slabs = [];
  for (let i = 0; i < count; i++) slabs.push(slab(i));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-block',
      position: 'relative',
      textAlign: 'center',
      ...style
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: W * sc,
    height: H * sc,
    viewBox: '0 0 ' + W + ' ' + H,
    style: {
      display: 'block',
      overflow: 'visible'
    }
  }, slabs), label ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, null, label)) : null, metric ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -8,
      left: '70%',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, {
    tone: "outline",
    size: "sm"
  }, metric)) : null);
}
Object.assign(__ds_scope, { IsoQueue });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/isometric/IsoQueue.jsx", error: String((e && e.message) || e) }); }

// components/isometric/IsoRings.jsx
try { (() => {
/* Network / region — concentric dashed iso rings with a center node.
   Children (e.g. a small logo) render in the center circle. */
function IsoRings({
  size = 180,
  rings = 3,
  label,
  animated = false,
  style,
  children
}) {
  const sc = size / 180;
  const W = 180,
    H = 110;
  const cx = W / 2,
    cy = H / 2;
  const DEEP = 'var(--kl-deep-forest, #0C3529)';
  const EM = 'var(--kl-emerald, #1C6B49)';
  const ring = i => {
    const r = 28 + i * 22;
    return /*#__PURE__*/React.createElement("circle", {
      key: i,
      r: r,
      transform: 'translate(' + cx + ',' + cy + ') matrix(0.866 0.5 -0.866 0.5 0 0)',
      fill: i === rings - 1 ? 'rgba(106,241,176,.07)' : 'none',
      stroke: EM,
      strokeWidth: "1.1",
      strokeDasharray: "3 4",
      opacity: 1 - i * 0.28
    }, animated ? /*#__PURE__*/React.createElement("animate", {
      attributeName: "opacity",
      values: 1 - i * 0.28 + ';' + (0.45 - i * 0.12) + ';' + (1 - i * 0.28),
      dur: 2.6 + i * 0.5 + 's',
      repeatCount: "indefinite"
    }) : null);
  };
  const ringEls = [];
  for (let i = rings - 1; i >= 0; i--) ringEls.push(ring(i));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-block',
      position: 'relative',
      textAlign: 'center',
      ...style
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: W * sc,
    height: H * sc,
    viewBox: '0 0 ' + W + ' ' + H,
    style: {
      display: 'block',
      overflow: 'visible'
    }
  }, ringEls, /*#__PURE__*/React.createElement("circle", {
    cx: cx,
    cy: cy,
    r: "14",
    fill: "#FFFFFF",
    stroke: DEEP,
    strokeWidth: "1.3"
  }), !children ? /*#__PURE__*/React.createElement("circle", {
    cx: cx,
    cy: cy,
    r: "5",
    fill: "var(--kl-mint, #6AF1B0)",
    stroke: DEEP,
    strokeWidth: "1"
  }) : null), children ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%,-50%)',
      width: 24 * sc,
      height: 24 * sc,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, children) : null, label ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, null, label)) : null);
}
Object.assign(__ds_scope, { IsoRings });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/isometric/IsoRings.jsx", error: String((e && e.message) || e) }); }

// components/isometric/IsoService.jsx
try { (() => {
/* Filled isometric cube — an API service, microservice, app module.
   Emerald faces, mint-tinted top with a mint highlight diamond. */
function IsoService({
  size = 110,
  label,
  metric,
  style
}) {
  const W = size,
    hw = W / 2,
    h = W / 4,
    d = W * 0.42;
  const c = hw + 2,
    t = 2;
  const H = t + 2 * h + d + 2;
  const pt = arr => arr.map(p => p.join(',')).join(' ');
  const top = [[c, t], [c + hw, t + h], [c, t + 2 * h], [c - hw, t + h]];
  const left = [[c - hw, t + h], [c, t + 2 * h], [c, t + 2 * h + d], [c - hw, t + h + d]];
  const right = [[c, t + 2 * h], [c + hw, t + h], [c + hw, t + h + d], [c, t + 2 * h + d]];
  const hi = 0.42; // top highlight diamond scale
  const hiD = [[c, t + h - h * hi], [c + hw * hi, t + h], [c, t + h + h * hi], [c - hw * hi, t + h]];
  const DEEP = 'var(--kl-deep-forest, #0C3529)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-block',
      position: 'relative',
      textAlign: 'center',
      ...style
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: W + 4,
    height: H,
    style: {
      display: 'block',
      overflow: 'visible'
    }
  }, /*#__PURE__*/React.createElement("polygon", {
    points: pt(left),
    fill: "#174F37",
    stroke: DEEP,
    strokeWidth: "1.2",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: pt(right),
    fill: "var(--kl-emerald, #1C6B49)",
    stroke: DEEP,
    strokeWidth: "1.2",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: pt(top),
    fill: "#E3FAEF",
    stroke: DEEP,
    strokeWidth: "1.2",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: pt(hiD),
    fill: "var(--kl-mint, #6AF1B0)",
    opacity: "0.85"
  })), label ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, null, label)) : null, metric ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -6,
      left: '78%',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, {
    tone: "outline",
    size: "sm"
  }, metric)) : null);
}
Object.assign(__ds_scope, { IsoService });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/isometric/IsoService.jsx", error: String((e && e.message) || e) }); }

// components/isometric/IsoShards.jsx
try { (() => {
/* Data pipeline / stream — ascending row of standing shards, light → dark,
   with an optional dashed flow line. The Baseten "data flow" motif. */
function IsoShards({
  size = 130,
  count = 5,
  label,
  metric,
  flowLine = false,
  style
}) {
  const sc = size / 130;
  const sp = 21,
    cw = 12.1,
    chh = 7,
    sh = 36;
  const W = sp * (count - 1) * 0.866 + cw + 16,
    H = sh + sp * (count - 1) * 0.5 + chh + 18;
  const x0 = 4,
    y0 = H - chh - 6;
  const DEEP = 'var(--kl-deep-forest, #0C3529)';
  const fills = ['rgba(106,241,176,.22)', 'rgba(106,241,176,.45)', 'var(--kl-mint, #6AF1B0)', 'var(--kl-emerald, #1C6B49)', '#174F37'];
  const shard = i => {
    const bx = x0 + i * sp * 0.866,
      by = y0 - i * sp * 0.5;
    const pts = [[bx, by], [bx + cw, by + chh], [bx + cw, by + chh - sh], [bx, by - sh]];
    return /*#__PURE__*/React.createElement("polygon", {
      key: i,
      points: pts.map(p => p.join(',')).join(' '),
      fill: fills[Math.min(i, fills.length - 1)],
      stroke: DEEP,
      strokeWidth: "1.1",
      strokeLinejoin: "round"
    });
  };
  const shards = [];
  for (let i = 0; i < count; i++) shards.push(shard(i));
  const lx1 = x0 - 8,
    ly1 = y0 + 8,
    lx2 = x0 + (count - 1) * sp * 0.866 + cw + 12,
    ly2 = y0 - (count - 1) * sp * 0.5;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-block',
      position: 'relative',
      textAlign: 'center',
      ...style
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: W * sc,
    height: H * sc,
    viewBox: '0 0 ' + W + ' ' + H,
    style: {
      display: 'block',
      overflow: 'visible'
    }
  }, flowLine ? /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("line", {
    x1: lx1,
    y1: ly1,
    x2: lx2,
    y2: ly2 + 4,
    stroke: "var(--kl-emerald, #1C6B49)",
    strokeWidth: "1.2",
    strokeDasharray: "4 4"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: lx1,
    cy: ly1,
    r: "2.5",
    fill: "var(--kl-emerald, #1C6B49)"
  })) : null, shards), label ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, null, label)) : null, metric ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -10,
      left: '64%',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, {
    tone: "outline",
    size: "sm"
  }, metric)) : null);
}
Object.assign(__ds_scope, { IsoShards });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/isometric/IsoShards.jsx", error: String((e && e.message) || e) }); }

// components/isometric/IsoUser.jsx
try { (() => {
/* User / person — outlined circle with head + shoulders glyph.
   Group several for "operators", "recruiters", "your team". */
function IsoUser({
  size = 40,
  label,
  tone = 'emerald',
  style
}) {
  const r = size / 2 - 2;
  const c = size / 2;
  const color = tone === 'slate' ? 'var(--kl-slate, #5F706A)' : 'var(--kl-emerald, #1C6B49)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-block',
      position: 'relative',
      textAlign: 'center',
      ...style
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    style: {
      display: 'block',
      overflow: 'visible'
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: c,
    cy: c,
    r: r,
    fill: "#FFFFFF",
    stroke: color,
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: c,
    cy: c - r * 0.25,
    r: r * 0.28,
    fill: "none",
    stroke: color,
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: 'M ' + (c - r * 0.5) + ' ' + (c + r * 0.62) + ' A ' + r * 0.52 + ' ' + r * 0.52 + ' 0 0 1 ' + (c + r * 0.5) + ' ' + (c + r * 0.62),
    fill: "none",
    stroke: color,
    strokeWidth: "1.5",
    strokeLinecap: "round"
  })), label ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 5
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, {
    size: "sm",
    tone: "outline"
  }, label)) : null);
}
Object.assign(__ds_scope, { IsoUser });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/isometric/IsoUser.jsx", error: String((e && e.message) || e) }); }

// components/isometric/IsoWarehouse.jsx
try { (() => {
/* Data warehouse / platform — two big disk tiers on a dashed axis
   (the Baseten "INFRA" silhouette in KnackLabs colors). */
function IsoWarehouse({
  size = 210,
  label,
  metric,
  metric2,
  axis = true,
  style
}) {
  const R = (size - 10) / 2,
    ry = R * 0.42;
  const dh = size * 0.105,
    gap = size * 0.10;
  const cx = size / 2,
    t = ry + (axis ? 26 : 4);
  const H = t + dh + gap + dh + ry + (axis ? 26 : 6);
  const DEEP = 'var(--kl-deep-forest, #0C3529)';
  const EM = 'var(--kl-emerald, #1C6B49)';
  const tier = (cy, band) => {
    const side = 'M' + (cx - R) + ',' + cy + ' L' + (cx - R) + ',' + (cy + dh) + ' A' + R + ',' + ry + ' 0 0 0 ' + (cx + R) + ',' + (cy + dh) + ' L' + (cx + R) + ',' + cy;
    return /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: side,
      fill: band,
      stroke: DEEP,
      strokeWidth: "1.3"
    }), /*#__PURE__*/React.createElement("ellipse", {
      cx: cx,
      cy: cy,
      rx: R,
      ry: ry,
      fill: "#E9FCF2",
      stroke: DEEP,
      strokeWidth: "1.3"
    }));
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-block',
      position: 'relative',
      textAlign: 'center',
      ...style
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: H,
    style: {
      display: 'block',
      overflow: 'visible'
    }
  }, axis ? /*#__PURE__*/React.createElement("line", {
    x1: cx,
    y1: 0,
    x2: cx,
    y2: t,
    stroke: EM,
    strokeWidth: "1.2",
    strokeDasharray: "3 4"
  }) : null, tier(t + dh + gap, EM), tier(t, 'var(--kl-mint, #6AF1B0)')), label ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: axis ? -14 : -22,
      left: '50%',
      transform: 'translateX(-50%)',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, null, label)) : null, metric ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '38%',
      left: '88%',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, {
    tone: "outline",
    size: "sm"
  }, metric)) : null, metric2 ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '62%',
      right: '88%',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IsoLabel, {
    tone: "outline",
    size: "sm"
  }, metric2)) : null);
}
Object.assign(__ds_scope, { IsoWarehouse });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/isometric/IsoWarehouse.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Footer.jsx
try { (() => {
function Footer({
  logoSrc = 'assets/logos/KL-Logo-Short-White.png',
  columns = [{
    heading: 'Offerings',
    links: [{
      label: 'AI Transformation Lead',
      href: 'fde.html'
    }, {
      label: 'Forward Deployed Engineer',
      href: 'fde.html'
    }, 'AI Agents', 'AI Automation Platforms', 'Gantry']
  }, {
    heading: 'Company',
    links: ['Work', 'About', {
      label: 'Blog',
      href: 'blog.html'
    }, {
      label: 'Careers',
      href: 'careers.html'
    }, 'Talk to us']
  }],
  note = 'AI transformation, delivered from inside your business.',
  legal = '\u00A9 ' + new Date().getFullYear() + ' Chimps At Work Studios Pvt Ltd',
  style
}) {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: 'var(--kl-deep-forest)',
      padding: '48px 32px 28px',
      fontFamily: 'var(--font-sans)',
      boxSizing: 'border-box',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 64,
      flexWrap: 'wrap',
      maxWidth: 'var(--container-max, 1180px)',
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '1 1 260px'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: logoSrc,
    alt: "KnackLabs",
    style: {
      height: 34,
      display: 'block'
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '14px 0 0',
      fontSize: 14,
      lineHeight: 1.55,
      color: 'var(--kl-text-on-dark)',
      maxWidth: '34ch'
    }
  }, note)), columns.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.heading,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      letterSpacing: '.14em',
      textTransform: 'uppercase',
      color: 'var(--kl-mint)',
      marginBottom: 4
    }
  }, c.heading), c.links.map(l => {
    const label = typeof l === 'string' ? l : l.label;
    const href = typeof l === 'string' ? null : l.href;
    return /*#__PURE__*/React.createElement("a", {
      key: label,
      href: href || '#',
      onClick: href ? undefined : e => e.preventDefault(),
      style: {
        fontSize: 14,
        color: 'rgba(255,255,255,.78)',
        textDecoration: 'none'
      }
    }, label);
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max, 1180px)',
      margin: '36px auto 0',
      paddingTop: 16,
      borderTop: '1px solid var(--kl-hairline-on-dark, rgba(106,241,176,.18))',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      letterSpacing: '.12em',
      textTransform: 'uppercase',
      color: 'var(--kl-muted-on-dark, #7E978D)',
      display: 'flex',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", null, legal), /*#__PURE__*/React.createElement("span", null, "knacklabs.ai")));
}
Object.assign(__ds_scope, { Footer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Footer.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TopNav.jsx
try { (() => {
/* Deep Forest top navigation — the brand anchor. The one dark element
   inside a light page; White / Mint accents are allowed here. */
function TopNav({
  links = ['Offerings', 'How it\u2019s built', 'Work', 'About'],
  active = '',
  logoSrc = 'assets/logos/KL-Logo-Full-White.png',
  logoHref = '#',
  cta = 'Talk to us',
  ctaHref,
  onCta,
  sticky = true,
  style
}) {
  const [hovered, setHovered] = React.useState(null);
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onS = () => setScrolled(window.scrollY > 8);
    onS();
    window.addEventListener('scroll', onS, {
      passive: true
    });
    return () => window.removeEventListener('scroll', onS);
  }, []);
  const [narrow, setNarrow] = React.useState(typeof window !== 'undefined' && window.innerWidth < 700);
  React.useEffect(() => {
    const onR = () => setNarrow(window.innerWidth < 700);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      background: scrolled ? 'rgba(12,53,41,.72)' : 'var(--kl-deep-forest)',
      backdropFilter: 'blur(16px) saturate(1.5)',
      WebkitBackdropFilter: 'blur(16px) saturate(1.5)',
      borderBottom: scrolled ? '1px solid rgba(106,241,176,.16)' : '1px solid transparent',
      boxShadow: scrolled ? '0 8px 28px rgba(10,44,34,.28)' : 'none',
      transition: 'background .35s ease, border-color .35s ease, box-shadow .35s ease',
      position: sticky ? 'sticky' : 'static',
      top: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      gap: narrow ? 16 : 32,
      padding: narrow ? '0 20px' : '0 32px',
      height: 68,
      fontFamily: 'var(--font-sans)',
      boxSizing: 'border-box',
      ...style
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: logoHref,
    onClick: e => {
      if (logoHref === '#') e.preventDefault();
    },
    style: {
      display: 'flex',
      alignItems: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: logoSrc,
    alt: "KnackLabs",
    style: {
      height: narrow ? 30 : 34,
      display: 'block'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      gap: 26,
      justifyContent: 'flex-end',
      alignItems: 'center'
    }
  }, !narrow && links.map(l => {
    const label = typeof l === 'string' ? l : l.label;
    const href = typeof l === 'string' ? '#' : l.href || '#';
    const isActive = label === active;
    const isHover = label === hovered;
    return /*#__PURE__*/React.createElement("a", {
      key: label,
      href: href,
      onClick: e => {
        if (href === '#') e.preventDefault();
      },
      onMouseEnter: () => setHovered(label),
      onMouseLeave: () => setHovered(null),
      style: {
        fontSize: 14.5,
        fontWeight: isActive ? 600 : 500,
        textDecoration: 'none',
        color: isActive ? 'var(--kl-mint)' : isHover ? '#fff' : 'rgba(255,255,255,.78)',
        transition: 'color .2s ease'
      }
    }, label);
  }), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "dark-primary",
    size: "sm",
    mono: true,
    href: ctaHref,
    onClick: onCta
  }, cta)));
}
Object.assign(__ds_scope, { TopNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TopNav.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SiteHeader.jsx
try { (() => {
/* The one site header used across every knacklabs.ai page (home, events, past
   events, contact). Single source of truth for the nav items, the active
   state, the clickable logo (→ home), and the "Talk to us" CTA (→ contact),
   so the header is identical everywhere. Built on TopNav (the brand's Deep
   Forest nav). All site pages live in the same folder, so the hrefs are
   plain same-directory links; pass `base` if a page sits elsewhere. */

const NAV_ITEMS = [{
  label: 'FDE',
  href: 'fde.html'
}, {
  label: 'Blog',
  href: 'blog.html'
}, {
  label: 'Events',
  href: 'events.html'
}];
function SiteHeader({
  active = '',
  assetBase = '../../',
  base = '',
  cta = 'TALK TO US'
}) {
  const links = NAV_ITEMS.map(n => ({
    label: n.label,
    href: base + n.href
  }));
  return /*#__PURE__*/React.createElement(__ds_scope.TopNav, {
    links: links,
    active: active,
    logoSrc: assetBase + 'assets/logos/KL-Logo-Full-White.png',
    logoHref: base + 'index.html',
    cta: cta,
    ctaHref: base + 'contact.html'
  });
}
Object.assign(__ds_scope, { SiteHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SiteHeader.jsx", error: String((e && e.message) || e) }); }

// components/partners/PartnerBadge.jsx
try { (() => {
/* Partner badge placement frame.
 *
 * This component NEVER draws a partner badge. Both OpenAI's and Sarvam's
 * guidelines forbid recreating, editing, recoloring or rotating the artwork —
 * it must be the official file, placed unmodified. PartnerBadge only supplies
 * the geometry the guidelines require: fixed height, locked aspect, protected
 * clear space, and a minimum size floor. Pass the official asset as `src`;
 * with no `src` it renders a labelled empty slot so a layout can be built
 * before the file arrives.
 *
 * Clear space (OpenAI, p.8): half the height of the Blossom mark around the
 * badge on all sides. The Blossom reads at ~55% of badge height in the
 * landscape lockup and ~28% in the portrait lockup, so the frame reserves
 * 0.5x that as margin. Nothing may sit inside it.
 */

const NATIVE = {
  landscape: {
    aspect: 3.15,
    minHeight: 32,
    blossom: 0.55
  },
  portrait: {
    aspect: 0.78,
    minHeight: 64,
    blossom: 0.28
  }
};
function PartnerBadge({
  src,
  format = 'landscape',
  height = 56,
  alt,
  label = 'Official partner badge',
  href,
  onDark = false,
  showClearSpace = false,
  style
}) {
  const n = NATIVE[format] || NATIVE.landscape;
  const h = Math.max(height, n.minHeight);
  const w = Math.round(h * n.aspect);
  const clear = Math.round(h * n.blossom * 0.5);
  const frame = {
    display: 'block',
    width: w,
    height: h,
    flex: '0 0 auto',
    margin: clear,
    position: 'relative',
    outline: showClearSpace ? '1px dashed rgba(28,107,73,.45)' : 'none',
    outlineOffset: showClearSpace ? clear : 0
  };
  const inner = src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: alt || label,
    style: {
      display: 'block',
      width: '100%',
      height: '100%',
      objectFit: 'contain'
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '0 8px',
      boxSizing: 'border-box',
      borderRadius: Math.max(6, Math.round(h * 0.16)),
      border: '1px dashed ' + (onDark ? 'rgba(106,241,176,.4)' : 'rgba(12,53,41,.28)'),
      background: onDark ? 'repeating-linear-gradient(135deg, rgba(255,255,255,.05) 0 6px, transparent 6px 12px)' : 'repeating-linear-gradient(135deg, rgba(12,53,41,.05) 0 6px, transparent 6px 12px)',
      fontFamily: 'var(--font-mono)',
      fontSize: Math.max(9, Math.round(h * 0.14)),
      lineHeight: 1.35,
      letterSpacing: '.06em',
      textTransform: 'uppercase',
      color: onDark ? 'var(--kl-muted-on-dark)' : 'var(--kl-slate)'
    }
  }, label);
  if (href) {
    return /*#__PURE__*/React.createElement("a", {
      href: href,
      target: "_blank",
      rel: "noopener noreferrer",
      style: {
        ...frame,
        ...style
      }
    }, inner);
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...frame,
      ...style
    }
  }, inner);
}
Object.assign(__ds_scope, { PartnerBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/partners/PartnerBadge.jsx", error: String((e && e.message) || e) }); }

// components/partners/PartnerStrip.jsx
try { (() => {
/* Partnership strip: an eyebrow label, one or more PartnerBadge frames, and an
 * optional attribution footnote. The standard KnackLabs lockup for website
 * footers, deck closers, proposal covers and email signatures.
 *
 * Badges carry their own clear space, so this lays them out with no extra gap
 * and no dividers — dividers or containers drawn around a badge read as an
 * invented lockup, which both partner guidelines prohibit.
 */

function PartnerStrip({
  label = 'Partnerships',
  note,
  align = 'left',
  onDark = false,
  style,
  children
}) {
  const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      alignItems: 'stretch',
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      fontWeight: 500,
      letterSpacing: '.24em',
      textTransform: 'uppercase',
      color: onDark ? 'var(--kl-mint)' : 'var(--kl-emerald)',
      textAlign: align
    }
  }, label) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: justify
    }
  }, children), note ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      lineHeight: 1.5,
      maxWidth: '68ch',
      textAlign: align,
      color: onDark ? 'var(--kl-muted-on-dark)' : 'var(--kl-slate)'
    }
  }, note) : null);
}
Object.assign(__ds_scope, { PartnerStrip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/partners/PartnerStrip.jsx", error: String((e && e.message) || e) }); }

// preview-loader.js
try { (() => {
/* Preview-only loader: lets specimen cards and UI-kit pages render the
   component .jsx sources directly when the compiled _ds_bundle.js is not
   present yet. Requires React + Babel standalone on the page.
   NOT part of the design system API — consumers should use the bundle. */
window.KLPreview = async function (base, files) {
  const ns = window.__KLPreviewNS = window.__KLPreviewNS || {};
  // Kick off all network requests up front so they overlap, then evaluate the
  // sources in list order (evaluation is order-dependent; the network is not).
  const sources = await Promise.all(files.map(function (f) {
    return fetch(base + f, {
      cache: 'no-cache'
    }).then(function (res) {
      return res.text().then(function (src) {
        return {
          res: res,
          src: src
        };
      });
    }).catch(function () {
      return {
        res: {
          ok: false
        },
        src: ''
      };
    });
  }));
  for (let i = 0; i < files.length; i++) {
    const res = sources[i].res;
    let src = sources[i].src;
    // Skip files that no longer exist (404, or a plaintext "file not found"
    // body served with 200) so one stale list entry can't blank the page.
    if (!res.ok || /^\s*file not found\s*$/i.test(src)) continue;
    // strip ES module syntax; shared scope below replaces imports
    src = src.replace(/^\s*import[^\n]*$/gm, '').replace(/^\s*export\s+/gm, '');
    const code = Babel.transform(src, {
      presets: [['react', {
        runtime: 'classic'
      }]]
    }).code;
    const keys = Object.keys(ns);
    // Share every top-level function declaration across files, not just
    // capitalized components — some components import lowercase helpers from
    // siblings (e.g. fieldBoxStyle from Field.jsx). De-dupe the names.
    const fnNames = Array.from(new Set(Array.from(src.matchAll(/function\s+(\w+)/g)).map(function (m) {
      return m[1];
    })));
    const body = code + '\n;return {' + fnNames.map(function (n) {
      return n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined)';
    }).join(',') + '};';
    const out = new Function('React', ...keys, body)(React, ...keys.map(function (k) {
      return ns[k];
    }));
    for (const k in out) if (out[k]) ns[k] = out[k];
  }
  return ns;
};
/* Standard load order covering all inter-component dependencies. */
window.KL_ALL_COMPONENTS = ['components/core/Eyebrow.jsx', 'components/core/Button.jsx', 'components/core/Badge.jsx', 'components/core/Card.jsx', 'components/core/Input.jsx', 'ui_kits/website/eventsData.jsx', 'ui_kits/website/blogData.jsx', 'components/brand/MetricBox.jsx', 'components/brand/TerminalMockup.jsx', 'components/brand/NumberedPoints.jsx', 'components/brand/FlowSteps.jsx', 'components/brand/EventAnnouncementBar.jsx', 'components/navigation/TopNav.jsx', 'components/navigation/SiteHeader.jsx', 'components/navigation/Footer.jsx', 'components/forms/Field.jsx', 'components/forms/TextField.jsx', 'components/forms/Select.jsx', 'components/forms/Checkbox.jsx', 'components/forms/Radio.jsx', 'components/forms/Switch.jsx', 'components/isometric/IsoLabel.jsx', 'components/isometric/IsoCanvas.jsx', 'components/isometric/IsoConnector.jsx', 'components/isometric/IsoDiamond.jsx', 'components/isometric/IsoService.jsx', 'components/isometric/IsoAgent.jsx', 'components/isometric/IsoModel.jsx', 'components/isometric/IsoDatabase.jsx', 'components/isometric/IsoWarehouse.jsx', 'components/isometric/IsoDocs.jsx', 'components/isometric/IsoAppScreen.jsx', 'components/isometric/IsoShards.jsx', 'components/isometric/IsoQueue.jsx', 'components/isometric/IsoCloud.jsx', 'components/isometric/IsoRings.jsx', 'components/isometric/IsoUser.jsx', 'ui_kits/website/Homepage.jsx', 'ui_kits/website/ContactPage.jsx', 'ui_kits/website/AiTransformationLeadPage.jsx', 'ui_kits/website/EventsPage.jsx', 'ui_kits/website/HomepageWithEventBar.jsx', 'ui_kits/website/careersData.jsx', 'ui_kits/website/CareersPage.jsx', 'ui_kits/website/JobPage.jsx', 'ui_kits/website/BlogPage.jsx', 'ui_kits/website/BlogPostPage.jsx'];
})(); } catch (e) { __ds_ns.__errors.push({ path: "preview-loader.js", error: String((e && e.message) || e) }); }

// ui_kits/social/kl-logo-data.js
try { (() => {
window.KL_LOGO_FULL_DARK = "data:image/png;base64,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";
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/social/kl-logo-data.js", error: String((e && e.message) || e) }); }

__ds_ns.EventAnnouncementBar = __ds_scope.EventAnnouncementBar;

__ds_ns.FlowSteps = __ds_scope.FlowSteps;

__ds_ns.MetricBox = __ds_scope.MetricBox;

__ds_ns.NumberedPoints = __ds_scope.NumberedPoints;

__ds_ns.TerminalMockup = __ds_scope.TerminalMockup;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Eyebrow = __ds_scope.Eyebrow;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.TextField = __ds_scope.TextField;

__ds_ns.IsoAgent = __ds_scope.IsoAgent;

__ds_ns.IsoAppScreen = __ds_scope.IsoAppScreen;

__ds_ns.IsoCanvas = __ds_scope.IsoCanvas;

__ds_ns.IsoAt = __ds_scope.IsoAt;

__ds_ns.IsoCloud = __ds_scope.IsoCloud;

__ds_ns.IsoConnector = __ds_scope.IsoConnector;

__ds_ns.IsoDatabase = __ds_scope.IsoDatabase;

__ds_ns.IsoDiamond = __ds_scope.IsoDiamond;

__ds_ns.IsoDocs = __ds_scope.IsoDocs;

__ds_ns.IsoLabel = __ds_scope.IsoLabel;

__ds_ns.IsoModel = __ds_scope.IsoModel;

__ds_ns.IsoQueue = __ds_scope.IsoQueue;

__ds_ns.IsoRings = __ds_scope.IsoRings;

__ds_ns.IsoService = __ds_scope.IsoService;

__ds_ns.IsoShards = __ds_scope.IsoShards;

__ds_ns.IsoUser = __ds_scope.IsoUser;

__ds_ns.IsoWarehouse = __ds_scope.IsoWarehouse;

__ds_ns.Footer = __ds_scope.Footer;

__ds_ns.SiteHeader = __ds_scope.SiteHeader;

__ds_ns.TopNav = __ds_scope.TopNav;

__ds_ns.PartnerBadge = __ds_scope.PartnerBadge;

__ds_ns.PartnerStrip = __ds_scope.PartnerStrip;

})();
