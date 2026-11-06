package br.com.osmo.talents.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.net.InetAddress;
import java.util.regex.Pattern;

/**
 * O app de TV é uma "moldura" que abre o app.osmo.com.br em tela cheia.
 * Quem cuida da navegação pelo controle (setas, OK, Voltar) é o próprio site:
 * o theme.js reconhece a TV pelo "googletv" no User-Agent e liga o modo TV.
 *
 * BIBLIOTECA DA CASA: o app também procura, no Wi-Fi de casa, o Mac com a "Biblioteca da casa"
 * ligada (ele se anuncia como "_osmotv._tcp", do mesmo jeito que a Apple TV acha as coisas).
 * Quando acha, a página do Osmo TV pergunta o endereço por window.OsmoTV.homeServer() e mostra
 * a aba "Na sua casa". Só endereços da rede de casa (192.168.x, 10.x, 172.16-31.x, .local) abrem
 * dentro do app, além do site da Osmo.
 */
public class MainActivity extends Activity {

    private static final int CSS_WIDTH = 1280;
    private static final String HOST =Uri.parse(BuildConfig.START_URL).getHost();
    private static final Pattern LAN = Pattern.compile(
            "^(10\\.\\d+|192\\.168|172\\.(1[6-9]|2\\d|3[01]))\\.\\d+\\.\\d+$|\\.local$");
    private WebView web;
    private boolean offline = false;
    private NsdManager nsd;
    private NsdManager.DiscoveryListener discovery;
    private volatile String homeServer = "";
    private volatile boolean resolving = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#170810"));
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        // a TV tem densidade alta (1080p conta como 960 px de largura no site), o que deixa tudo gigante;
        // aqui a página sempre monta com 1280 px de largura, o padrão de apps web de TV
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(false);
        int widthPx = getResources().getDisplayMetrics().widthPixels;
        web.setInitialScale(Math.max(1, widthPx * 100 / CSS_WIDTH));
        // "googletv" liga o modo TV no site; "OsmoTV" avisa que é o app (o site esconde o login social,
        // que o Google e outros bloqueiam dentro de WebView)
        s.setUserAgentString(s.getUserAgentString() + " GoogleTV OsmoTV/" + BuildConfig.VERSION_NAME);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                // fica tudo dentro do app; links para fora (Instagram, osmo.com.br...) não têm navegador na TV
                String host = req.getUrl().getHost();
                if (host != null && (host.equals(HOST) || LAN.matcher(host).find())) return false;
                Toast.makeText(MainActivity.this, "Este link abre só no celular ou computador.", Toast.LENGTH_LONG).show();
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (!req.isForMainFrame()) return;
                offline = true;
                String html = "<html><body style='margin:0;background:#170810;color:#fff;font:28px sans-serif;"
                        + "display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:0 10vw'>"
                        + getString(R.string.offline) + "</body></html>";
                view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush();
            }
        });

        web.addJavascriptInterface(new Bridge(), "OsmoTV");
        startDiscovery();

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(BuildConfig.START_URL);
        web.requestFocus(View.FOCUS_DOWN);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int code = e.getKeyCode();
        // sem internet: OK/Enter tenta de novo
        if (offline && e.getAction() == KeyEvent.ACTION_UP
                && (code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER)) {
            offline = false;
            web.loadUrl(BuildConfig.START_URL);
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (offline) { super.onBackPressed(); return; }
        // Voltar do controle:
        // - app de TV (/tv/, sem o #layer do site): a página decide; se ela "segurar" o Voltar
        //   (preventDefault, ex.: subir das fileiras para as abas), fica; senão, sai do app;
        // - site completo: se há um painel aberto ou tela anterior, o site cuida; senão, sai do app
        final boolean canGoBack = web.canGoBack();
        web.evaluateJavascript(
                "(function(){var l=document.getElementById('layer');"
                        + "if(!l){var e=new KeyboardEvent('keydown',{key:'GoBack',bubbles:true,cancelable:true});document.dispatchEvent(e);return e.defaultPrevented}"
                        + "var open=!!l.children.length;"
                        + "if(open||" + canGoBack + "){document.dispatchEvent(new KeyboardEvent('keydown',{key:'GoBack',bubbles:true,cancelable:true}));return true}"
                        + "return false})()",
                handled -> { if (!"true".equals(handled)) finish(); });
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    /** O que a página do Osmo TV pode perguntar ao app. */
    public class Bridge {
        /** Endereço da Biblioteca da casa achada no Wi-Fi (ex.: "http://192.168.15.20:8765/") ou "" se não achou. */
        @JavascriptInterface
        public String homeServer() { return homeServer; }
    }

    // Procura no Wi-Fi o Mac com a Biblioteca da casa ligada (Bonjour/mDNS, tipo "_osmotv._tcp")
    @SuppressWarnings("deprecation")
    private void startDiscovery() {
        nsd = (NsdManager) getSystemService(NSD_SERVICE);
        if (nsd == null) return;
        discovery = new NsdManager.DiscoveryListener() {
            @Override public void onDiscoveryStarted(String type) {}
            @Override public void onDiscoveryStopped(String type) {}
            @Override public void onStartDiscoveryFailed(String type, int code) {}
            @Override public void onStopDiscoveryFailed(String type, int code) {}
            @Override public void onServiceLost(NsdServiceInfo info) { homeServer = ""; }
            @Override public void onServiceFound(NsdServiceInfo info) {
                if (resolving || info.getServiceType() == null || !info.getServiceType().contains("_osmotv")) return;
                resolving = true;
                try {
                    nsd.resolveService(info, new NsdManager.ResolveListener() {
                        @Override public void onResolveFailed(NsdServiceInfo i, int code) { resolving = false; }
                        @Override public void onServiceResolved(NsdServiceInfo i) {
                            resolving = false;
                            InetAddress a = i.getHost();
                            String ip = a == null ? null : a.getHostAddress();
                            if (ip == null || ip.contains(":")) return; // só IPv4
                            homeServer = "http://" + ip + ":" + i.getPort() + "/";
                        }
                    });
                } catch (Exception e) { resolving = false; }
            }
        };
        try { nsd.discoverServices("_osmotv._tcp", NsdManager.PROTOCOL_DNS_SD, discovery); } catch (Exception ignored) { discovery = null; }
    }

    @Override
    protected void onDestroy() {
        if (nsd != null && discovery != null) { try { nsd.stopServiceDiscovery(discovery); } catch (Exception ignored) {} }
        web.destroy();
        super.onDestroy();
    }
}
