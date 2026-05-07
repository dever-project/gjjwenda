import Script from 'next/script';

const FEISHU_REMOTE_DEBUG_URL =
  'https://lf-package-cn.feishucdn.com/obj/feishu-static/op/fe/devtools_frontend/remote-debug-0.0.1-alpha.6.js';

const FEISHU_PLATFORM_BOOTSTRAP = `
window.__platform__ = window.__platform__ || {};
`;

const FEISHU_REMOTE_DEBUG_BOOTSTRAP = `
(function () {
  var ua = window.navigator.userAgent.toLowerCase();
  var shouldEnableFeishuDebug =
    window.location.search.indexOf('__feishu_debug__=1') >= 0 ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    ua.indexOf('feishu') >= 0 ||
    ua.indexOf('lark') >= 0;

  if (!shouldEnableFeishuDebug) return;
  if (document.querySelector('script[src="${FEISHU_REMOTE_DEBUG_URL}"]')) return;

  var script = document.createElement('script');
  script.src = '${FEISHU_REMOTE_DEBUG_URL}';
  document.head.appendChild(script);
})();
`;

export function FeishuRuntimeScripts() {
  return (
    <>
      <Script
        id="feishu-platform-bootstrap"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: FEISHU_PLATFORM_BOOTSTRAP }}
      />
      <Script
        id="feishu-remote-debug-bootstrap"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: FEISHU_REMOTE_DEBUG_BOOTSTRAP }}
      />
    </>
  );
}
