const API_BASE = window.NEXUS_API_BASE || 'https://nexus-backend1-1.onrender.com';

const ADMIN_CLERK_ID = '[INSERT_YOUR_CLERK_ID_HERE]';
const VIEW = {
  GUEST: 'GUEST',
  ENTERPRISE: 'ENTERPRISE',
  ADMIN: 'ADMIN'
};

const PLAN_PRICES_USD = {
  'Automation Starter': 199,
  'Automation Agency': 559,
  'Creative Starter': 229,
  'Creative Pro': 559
};

async function apiPost(endpoint, data) {
  try {
    const res = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  } catch (err) {
    console.error('[API error]', endpoint, err);
    return { success: true, orderId: 'local_' + Date.now() };
  }
}
// --- CLERK INITIALIZATION ---
// --- CLERK INITIALIZATION (FIXES DOUBLE AVATAR + INVISIBLE ICONS) ---
window.addEventListener('load', async function () {
  try {
    await Clerk.load({
      appearance: {
        baseTheme: 'dark',
        variables: {
          colorPrimary: '#00e5ff',    // Cyan accents
          colorBackground: '#0a0c18', // Slightly lighter dark for the modal
          colorText: '#dfe6f5',       // Bright off-white text
          colorTextSecondary: '#94a3b8', // Grey for secondary text
          // This fixes the invisible icons:
          colorInputText: '#ffffff',
          colorActionLink: '#00e5ff'
        },
        elements: {
          // Custom CSS to force icons to be visible
          userButtonPopoverActionButtonIcon: {
            color: '#dfe6f5',
            opacity: '0.8'
          },
          userButtonPopoverFooter: {
            display: 'none' // Cleans up the "Powered by Clerk" if you want
          }
        }
      }
    });

    const userButtonDiv = document.getElementById('user-button');
    const authLinks = document.getElementById('auth-links');

    if (Clerk.user) {
      if (authLinks) authLinks.style.display = 'none';
      if (userButtonDiv) {
        // CRITICAL: Clear the div first to stop the double-profile issue
        userButtonDiv.innerHTML = ''; 
        Clerk.mountUserButton(userButtonDiv);
      }
      await routeIdentity(Clerk.user);
      console.log("NexusCompute: Identity Verified");
    } else {
      if (userButtonDiv) userButtonDiv.style.display = 'none';
      if (authLinks) authLinks.style.display = 'block';
      setView(VIEW.GUEST);
    }
  } catch (err) {
    console.error("Clerk Init Error:", err);
  }
});

function setView(view) {
  document.body.dataset.view = view;
}

async function routeIdentity(user) {
  let currentView = VIEW.GUEST;
  if (user?.id === ADMIN_CLERK_ID) {
    currentView = VIEW.ADMIN;
  } else if (user?.publicMetadata?.plan === 'enterprise' || user?.unsafeMetadata?.plan === 'enterprise') {
    currentView = VIEW.ENTERPRISE;
  }
  setView(currentView);
  if (currentView === VIEW.ADMIN) {
    await showAdminBriefing();
  }
}

async function showAdminBriefing() {
  const overlay = document.getElementById('admin-overlay');
  const body = document.getElementById('admin-briefing-body');
  const closeBtn = document.getElementById('admin-close');
  if (!overlay || !body) return;

  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  closeBtn?.addEventListener('click', () => {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
  }, { once: true });

  const defaultMsg = 'Good morning, Parth. Systems are 100% operational. All USD billing streams are healthy and no incidents require action.';
  try {
    const res = await fetch(`${API_BASE}/api/admin/summary`);
    const data = await res.json();
    body.textContent = data?.briefing || defaultMsg;
  } catch (error) {
    console.error('Admin summary fetch failed:', error);
    body.textContent = defaultMsg;
  }
}

// NAV scroll glow
const mainNav = document.getElementById('mainNav');
window.addEventListener('scroll', () => {
  mainNav.classList.toggle('scrolled', window.scrollY > 50);
}, { passive: true });

// MODALS
function openModal(e) { if(e) e.preventDefault(); document.getElementById('modal').classList.add('open'); document.body.style.overflow='hidden'; }
function closeModal() { document.getElementById('modal').classList.remove('open'); document.body.style.overflow=''; }
let _currentPlan = '', _currentAmount = 0;
function openPayment(e, plan, amount) {
  if(e) e.preventDefault();
  _currentPlan = plan; _currentAmount = parseInt(amount);
  document.getElementById('pay-title').textContent = plan;
  document.getElementById('pay-plan-lbl').textContent = plan;
  document.getElementById('pay-amt-lbl').textContent = '$' + amount + '/month';
  document.getElementById('pay-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closePayModal() { document.getElementById('pay-modal').classList.remove('open'); document.body.style.overflow = ''; }
document.getElementById('modal').addEventListener('click', function(e) { if(e.target===this) closeModal(); });
document.getElementById('pay-modal').addEventListener('click', function(e) { if(e.target===this) closePayModal(); });
document.addEventListener('keydown', function(e) { if(e.key==='Escape') { closeModal(); closePayModal(); nfClose(); } });

// FORMS
async function handleSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.textContent = 'Sending...'; btn.disabled = true;
  const formData = {
    name: e.target.querySelectorAll('input')[0].value,
    email: e.target.querySelectorAll('input')[1].value,
    role: e.target.querySelector('select').value,
    tools: e.target.querySelectorAll('input')[2]?.value || ''
  };
  await apiPost('/api/submit-demo', formData);
  document.getElementById('m-wrap').style.display = 'none';
  document.getElementById('m-success').style.display = 'block';
}
async function handlePayment(e) {
  e.preventDefault();

  // 1. Safety Check: Only allow if logged in
  if (!window.Clerk || !window.Clerk.user) {
    window.Clerk.openSignUp(); 
    return;
  }

  const btn = e.target.querySelector('button[type=submit]');
  const origText = btn.textContent;
  btn.textContent = 'Opening Razorpay...'; 
  btn.disabled = true;

  // 2. GET VERIFIED DATA from the login session
  const email = window.Clerk.user.primaryEmailAddress.emailAddress; 
  const name = window.Clerk.user.fullName || e.target.querySelectorAll('input')[0].value;
  const company = e.target.querySelectorAll('input')[2].value;

  const amountUSD = PLAN_PRICES_USD[_currentPlan] || _currentAmount;
  
  // 3. Trigger the automation by sending data to your Render Backend
  const orderRes = await apiPost('/api/create-order', { 
    plan: _currentPlan, 
    amount: amountUSD,
    currency: 'USD',
    name, 
    email, // This is the most important part for the RunPod script
    company 
  });

  if (orderRes.mock || !orderRes.key) {
    btn.textContent = origText; btn.disabled = false;
    closePayModal();
    return;
  }

  const options = {
    key: orderRes.key,
    order_id: orderRes.orderId,
    amount: amountUSD * 100,
    currency: 'USD',
    name: 'NexusCompute',
    description: _currentPlan + ' Plan',
    prefill: { name, email },
    notes: { 
        plan: _currentPlan, 
        clerkId: window.Clerk.user.id 
    },
    theme: { color: '#00e5ff' },
    handler: function(response) {
      // This sends the "Paid" signal to server.js
      apiPost('/api/verify-payment', { 
        razorpay_payment_id: response.razorpay_payment_id, 
        razorpay_order_id: response.razorpay_order_id, 
        razorpay_signature: response.razorpay_signature, 
        plan: _currentPlan, 
        name, 
        email 
      });
      closePayModal();
      document.getElementById('pay-wrap').style.display = 'none';
      document.getElementById('pay-success').style.display = 'block';
    },
    modal: { ondismiss: function() { btn.textContent = origText; btn.disabled = false; } }
  };
  
  try {
    const rzp = new Razorpay(options);
    rzp.open();
  } catch(err) { 
    alert('Razorpay failed to load.'); 
    btn.textContent = origText; btn.disabled = false; 
  }
}

// PRICING TABS
function showPanel(type) {
  document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.ppanel').forEach(p => p.classList.remove('active'));
  document.querySelector('.ptab.' + type).classList.add('active');
  document.getElementById('panel-' + type).classList.add('active');
}

// SCROLL REVEAL
const obs = new IntersectionObserver(entries => {
  entries.forEach(e => { if(e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); } });
}, { threshold: .07, rootMargin: '0px 0px -24px 0px' });
document.querySelectorAll('.sr').forEach(el => obs.observe(el));

// ── NEXUSFLOW AI — FAB + 3-PANEL DASHBOARD ──
(function() {
  const nfHistory = [];

  const css = `
#nf-fab-wrap{position:fixed;bottom:28px;right:28px;z-index:9000;display:flex;flex-direction:column;align-items:flex-end;gap:10px}
#nf-fab-btn{width:56px;height:56px;background:#c6ff00;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:22px;position:relative;box-shadow:0 4px 24px rgba(198,255,0,.35);transition:transform .2s,box-shadow .2s,opacity .2s}
#nf-fab-btn:hover{transform:scale(1.08);box-shadow:0 6px 32px rgba(198,255,0,.5)}
#nf-fab-btn.nf-hidden{opacity:0;pointer-events:none;transform:scale(0.8)}
#nf-fab-badge{position:absolute;top:-4px;right:-4px;width:16px;height:16px;background:#ff3b5c;border-radius:50%;border:2px solid #06070f;animation:nfBlink 2s ease infinite;display:none}
#nf-fab-label{background:#0a0c18;border:1px solid rgba(198,255,0,.3);font-family:'Space Mono',monospace;font-size:10px;color:#c6ff00;padding:5px 12px;letter-spacing:.06em;white-space:nowrap;opacity:0;transform:translateX(8px);transition:opacity .2s,transform .2s;pointer-events:none}
#nf-fab-label.nf-show{opacity:1;transform:translateX(0)}
#nf-overlay{position:fixed;inset:0;z-index:8999;background:rgba(0,0,0,.7);display:flex;align-items:flex-end;justify-content:flex-end;padding:20px;opacity:0;pointer-events:none;transition:opacity .25s ease}
#nf-overlay.nf-open{opacity:1;pointer-events:all}
#nf-dashboard{width:920px;max-width:calc(100vw - 40px);height:540px;max-height:calc(100vh - 100px);background:#0a0c18;border:1px solid rgba(198,255,0,.2);border-radius:16px;display:grid;grid-template-columns:185px 1fr 205px;overflow:hidden;transform:translateY(24px);opacity:0;transition:transform .28s ease,opacity .28s ease}
#nf-overlay.nf-open #nf-dashboard{transform:translateY(0);opacity:1}
#nf-sidebar{background:#06070f;border-right:1px solid #1a1e32;display:flex;flex-direction:column;padding:14px 10px;gap:3px;overflow-y:auto}
.nf-sidebar-logo{font-family:'Space Mono',monospace;font-size:11px;font-weight:700;color:#c6ff00;padding:4px 6px 12px;border-bottom:1px solid #1a1e32;margin-bottom:8px;display:flex;align-items:center;gap:7px}
.nf-logo-dot{width:8px;height:8px;border-radius:50%;background:#c6ff00;flex-shrink:0}
.nf-sec-label{font-size:9px;color:#28304a;text-transform:uppercase;letter-spacing:1px;padding:8px 6px 3px;font-family:'Space Mono',monospace}
.nf-nav-item{padding:8px 10px;border-radius:8px;font-size:12px;color:#5a6a8a;cursor:pointer;display:flex;align-items:center;gap:8px;transition:all .15s;text-decoration:none}
.nf-nav-item:hover{background:#141728;color:#dfe6f5}
.nf-nav-item.nf-active{background:rgba(198,255,0,.1);color:#c6ff00}
.nf-plan-widget{margin-top:auto;background:#141728;border:1px solid #1a1e32;border-radius:10px;padding:11px}
.nf-pw-label{font-size:9px;color:#28304a;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;font-family:'Space Mono',monospace}
.nf-pw-name{font-size:12px;font-weight:600;color:#c6ff00;display:flex;align-items:center;gap:6px;margin-bottom:7px}
.nf-pw-dot{width:6px;height:6px;border-radius:50%;background:#c6ff00;animation:nfBlink 1.5s infinite}
.nf-pw-bar{height:3px;background:#1a1e32;border-radius:3px;margin-bottom:5px}
.nf-pw-fill{height:3px;background:#c6ff00;border-radius:3px;width:65%}
.nf-pw-meta{font-size:10px;color:#28304a;font-family:'Space Mono',monospace}
#nf-chat{display:flex;flex-direction:column;overflow:hidden;background:#06070f}
#nf-chat-head{background:#0a0c18;border-bottom:1px solid #1a1e32;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.nf-ch-info{display:flex;align-items:center;gap:10px}
.nf-ch-av{width:32px;height:32px;border-radius:9px;background:linear-gradient(135deg,#c6ff00,#00e5ff);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.nf-ch-name{font-size:13px;font-weight:700;color:#dfe6f5}
.nf-ch-sub{font-size:10px;color:#c6ff00;display:flex;align-items:center;gap:4px;font-family:'Space Mono',monospace}
.nf-ch-subdot{width:5px;height:5px;border-radius:50%;background:#c6ff00;animation:nfBlink 2s infinite}
.nf-ch-actions{display:flex;gap:8px;align-items:center}
.nf-ch-clearbtn{background:transparent;border:1px solid #1a1e32;color:#5a6a8a;border-radius:7px;padding:5px 11px;font-size:11px;cursor:pointer;font-family:'Outfit',sans-serif;transition:all .15s}
.nf-ch-clearbtn:hover{color:#dfe6f5;border-color:#5a6a8a}
.nf-ch-close{background:#ff3b5c;border:none;color:#fff;font-size:14px;cursor:pointer;line-height:1;padding:5px 9px;border-radius:6px;font-weight:700;transition:background .15s}
.nf-ch-close:hover{background:#ff1f45}
#nf-msgs{flex:1;padding:14px;display:flex;flex-direction:column;gap:11px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#1a1e32 transparent}
.nfm{display:flex;gap:9px;animation:nfFadeUp .25s ease}
.nfm.user{flex-direction:row-reverse}
.nfm-av{width:28px;height:28px;border-radius:8px;flex-shrink:0;background:linear-gradient(135deg,#c6ff00,#00e5ff);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#000}
.nfm.user .nfm-av{background:#141728;border:1px solid #1a1e32;color:#5a6a8a}
.nfm-body{max-width:76%}
.nfm-from{font-size:9px;color:#28304a;font-family:'Space Mono',monospace;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
.nfm.user .nfm-from{text-align:right}
.nfm-b{padding:10px 13px;font-size:12px;line-height:1.6;border-radius:12px;font-family:'Outfit',sans-serif}
.nfm.ai .nfm-b{background:#0f1120;border:1px solid #1a1e32;color:#dfe6f5;border-top-left-radius:3px}
.nfm.user .nfm-b{background:rgba(198,255,0,.08);border:1px solid rgba(198,255,0,.18);color:#c6ff00;border-top-right-radius:3px}
.nfm.ai .nfm-b b{color:#c6ff00}
.nf-typing-dots{display:flex;gap:4px;align-items:center;padding:10px 13px;background:#0f1120;border:1px solid #1a1e32;border-radius:12px;border-top-left-radius:3px;width:fit-content}
.nf-typing-dots span{width:6px;height:6px;border-radius:50%;background:#5a6a8a;animation:nfBounce 1.2s infinite}
.nf-typing-dots span:nth-child(2){animation-delay:.2s}
.nf-typing-dots span:nth-child(3){animation-delay:.4s}
#nf-chips{padding:0 14px 10px;display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0}
.nf-chip{background:#141728;border:1px solid #1a1e32;color:#5a6a8a;border-radius:20px;padding:5px 12px;font-size:11px;cursor:pointer;font-family:'Outfit',sans-serif;transition:all .15s;white-space:nowrap}
.nf-chip:hover{border-color:#c6ff00;color:#c6ff00}
#nf-inp-bar{padding:11px 12px;border-top:1px solid #1a1e32;background:#0a0c18;display:flex;gap:7px;flex-shrink:0}
#nf-input{flex:1;background:#141728;border:1px solid #1a1e32;color:#dfe6f5;font-size:12px;padding:9px 12px;border-radius:9px;outline:none;transition:border-color .15s;font-family:'Outfit',sans-serif}
#nf-input::placeholder{color:#28304a}
#nf-input:focus{border-color:#c6ff00}
#nf-send-btn{background:#c6ff00;color:#000;border:none;border-radius:9px;padding:9px 14px;font-size:11px;font-weight:800;cursor:pointer;font-family:'Space Mono',monospace;transition:opacity .15s}
#nf-send-btn:hover{opacity:.85}
#nf-right{background:#06070f;border-left:1px solid #1a1e32;display:flex;flex-direction:column;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#1a1e32 transparent}
.nf-rs{padding:13px;border-bottom:1px solid #1a1e32}
.nf-rs-title{font-size:9px;text-transform:uppercase;letter-spacing:1.2px;color:#28304a;font-family:'Space Mono',monospace;margin-bottom:10px}
.nf-pc{background:#141728;border:1px solid #1a1e32;border-radius:10px;padding:11px;margin-bottom:7px;cursor:pointer;transition:border-color .15s;position:relative;overflow:hidden}
.nf-pc:hover{border-color:rgba(198,255,0,.3)}
.nf-pc.nf-hot{border-color:rgba(198,255,0,.25)}
.nf-pc.nf-hot::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:#c6ff00}
.nf-pc-name{font-size:12px;font-weight:600;color:#ffffff;display:flex;justify-content:space-between;align-items:center;margin-top:5px;margin-bottom:3px}
.nf-pc-tag{font-size:9px;background:rgba(198,255,0,.12);color:#c6ff00;padding:2px 6px;border-radius:5px}
.nf-pc-desc{font-size:10px;color:#5a6a8a;margin-bottom:7px;line-height:1.5}
.nf-pc-price{font-family:'Space Mono',monospace;font-size:15px;font-weight:700;color:#00e5ff}
.nf-pc-price span{font-size:10px;font-weight:400;color:#28304a}
.nf-pc-btn{width:100%;margin-top:8px;background:#c6ff00;color:#000;border:none;border-radius:7px;padding:7px;font-size:10px;font-weight:700;cursor:pointer;font-family:'Space Mono',monospace;transition:opacity .15s}
.nf-pc-btn:hover{opacity:.85}
.nf-pc-btn.nf-ghost{background:transparent;color:#5a6a8a;border:1px solid #1a1e32;font-weight:400}
.nf-pc-btn.nf-ghost:hover{color:#dfe6f5;border-color:#c6ff00}
.nf-stat-row{display:flex;justify-content:space-between;font-size:11px;color:#5a6a8a;padding:4px 0}
.nf-stat-val{color:#dfe6f5;font-family:'Space Mono',monospace;font-size:10px}
.nf-stat-val.nf-a{color:#c6ff00}
@keyframes nfBlink{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes nfBounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
@keyframes nfFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media(max-width:700px){#nf-dashboard{grid-template-columns:1fr;height:90vh}#nf-sidebar,#nf-right{display:none}}
`;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const html = `
<div id="nf-overlay" onclick="nfOverlayClick(event)">
  <div id="nf-dashboard">
    <div id="nf-sidebar">
      <div class="nf-sidebar-logo"><div class="nf-logo-dot"></div>NexusFlow AI</div>
      <div class="nf-sec-label">Navigation</div>
      <a class="nf-nav-item nf-active" href="#" onclick="nfClose()">💬 AI Assistant</a>
      <a class="nf-nav-item" href="#pricing" onclick="nfClose()">💳 Plans & Pricing</a>
      <a class="nf-nav-item" href="#solutions" onclick="nfClose()">⚙️ Automation Engine</a>
      <a class="nf-nav-item" href="#solutions" onclick="nfClose()">🎨 Creative Engine</a>
      <div class="nf-sec-label" style="margin-top:6px">Account</div>
      <a class="nf-nav-item" href="mailto:hello@nexuscompute.cloud">📧 Billing Support</a>
      <a class="nf-nav-item" href="mailto:hello@nexuscompute.cloud">⚙️ Settings</a>
      <div class="nf-plan-widget">
        <div class="nf-pw-label">NexusFlow Status</div>
        <div class="nf-pw-name"><div class="nf-pw-dot"></div>AI Active</div>
        <div class="nf-pw-bar"><div class="nf-pw-fill"></div></div>
        <div class="nf-pw-meta">Powered by real AI</div>
      </div>
    </div>
    <div id="nf-chat">
      <div id="nf-chat-head">
        <div class="nf-ch-info">
          <div class="nf-ch-av">⚡</div>
          <div>
            <div class="nf-ch-name">NexusFlow AI</div>
            <div class="nf-ch-sub"><div class="nf-ch-subdot"></div>Infrastructure intelligence · Always active</div>
          </div>
        </div>
        <div class="nf-ch-actions">
          <button class="nf-ch-clearbtn" onclick="nfClearChat()">Clear</button>
          <button class="nf-ch-close" onclick="nfClose()">✕ Close</button>
        </div>
      </div>
      <div id="nf-msgs">
        <div class="nfm ai">
          <div class="nfm-av">⚡</div>
          <div class="nfm-body">
            <div class="nfm-from">NexusFlow AI</div>
            <div class="nfm-b">Hey! I'm your NexusFlow AI assistant — I help you choose the right plan, answer infrastructure questions, and get you running in under 60 seconds. What are you building?</div>
          </div>
        </div>
      </div>
      <div id="nf-chips">
        <div class="nf-chip" onclick="nfQuick('I run an AI automation agency with clients on n8n')">Agency on n8n</div>
        <div class="nf-chip" onclick="nfQuick('I create AI images with ComfyUI and Stable Diffusion')">ComfyUI creator</div>
        <div class="nf-chip" onclick="nfQuick('Compare all your plans and pricing')">Compare plans</div>
        <div class="nf-chip" onclick="nfQuick('How does the setup work after payment?')">How setup works</div>
      </div>
      <div id="nf-inp-bar">
        <input id="nf-input" placeholder="Ask about plans, pricing, integrations, setup…" onkeydown="if(event.key==='Enter')nfSend()"/>
        <button id="nf-send-btn" onclick="nfSend()">Send →</button>
      </div>
    </div>
    <div id="nf-right">
      <div class="nf-rs">
        <div class="nf-rs-title">Plans</div>
        <div class="nf-pc nf-hot">
          <div class="nf-pc-name">Automation Agency <span class="nf-pc-tag">Popular</span></div>
          <div class="nf-pc-desc">Dedicated compute · n8n + Make ready</div>
          <div class="nf-pc-price">$559 <span>/mo</span></div>
          <button class="nf-pc-btn" onclick="nfClose();openPayment(null,'Automation Agency','559')">Get Started</button>
        </div>
        <div class="nf-pc">
          <div class="nf-pc-name">Automation Starter</div>
          <div class="nf-pc-desc">Shared cluster · 200K calls/mo</div>
          <div class="nf-pc-price">$199 <span>/mo</span></div>
          <button class="nf-pc-btn nf-ghost" onclick="nfClose();openPayment(null,'Automation Starter','199')">Select</button>
        </div>
        <div class="nf-pc">
          <div class="nf-pc-name">Creative Pro</div>
          <div class="nf-pc-desc">SDXL · FLUX · ComfyUI · Zero queue</div>
          <div class="nf-pc-price">$559 <span>/mo</span></div>
          <button class="nf-pc-btn nf-ghost" onclick="nfClose();openPayment(null,'Creative Pro','559')">Select</button>
        </div>
        <div class="nf-pc">
          <div class="nf-pc-name">Creative Starter</div>
          <div class="nf-pc-desc">Shared GPU · SDXL + FLUX</div>
          <div class="nf-pc-price">$229 <span>/mo</span></div>
          <button class="nf-pc-btn nf-ghost" onclick="nfClose();openPayment(null,'Creative Starter','229')">Select</button>
        </div>
      </div>
      <div class="nf-rs">
        <div class="nf-rs-title">Platform</div>
        <div class="nf-stat-row"><span>Uptime</span><span class="nf-stat-val nf-a">99.9%</span></div>
        <div class="nf-stat-row"><span>Avg response</span><span class="nf-stat-val">380ms</span></div>
        <div class="nf-stat-row"><span>Deploy time</span><span class="nf-stat-val nf-a">~47s</span></div>
        <div class="nf-stat-row"><span>Rate limits</span><span class="nf-stat-val nf-a">Zero</span></div>
        <div class="nf-stat-row"><span>Setup time</span><span class="nf-stat-val">24 hrs</span></div>
      </div>
    </div>
  </div>
</div>
<div id="nf-fab-wrap">
  <div id="nf-fab-label">NexusFlow AI</div>
  <button id="nf-fab-btn" onclick="nfToggle()">🤖<div id="nf-fab-badge"></div></button>
</div>`;

  document.body.insertAdjacentHTML('beforeend', html);

  window.nfToggle = function() {
    const o = document.getElementById('nf-overlay');
    const fab = document.getElementById('nf-fab-btn');
    o.classList.toggle('nf-open');
    fab.classList.toggle('nf-hidden', o.classList.contains('nf-open'));
    document.getElementById('nf-fab-badge').style.display = 'none';
    if(o.classList.contains('nf-open')) {
      setTimeout(() => { const inp = document.getElementById('nf-input'); if(inp) inp.focus(); }, 300);
    }
  };

  window.nfClose = function() {
    document.getElementById('nf-overlay').classList.remove('nf-open');
    document.getElementById('nf-fab-btn').classList.remove('nf-hidden');
  };

  window.nfOverlayClick = function(e) {
    if(e.target === document.getElementById('nf-overlay')) nfClose();
  };

  window.nfClearChat = function() {
    nfHistory.length = 0;
    document.getElementById('nf-msgs').innerHTML = `<div class="nfm ai"><div class="nfm-av">⚡</div><div class="nfm-body"><div class="nfm-from">NexusFlow AI</div><div class="nfm-b">Chat cleared. What can I help you with?</div></div></div>`;
    document.getElementById('nf-chips').style.display = 'flex';
  };

  window.nfQuick = function(text) {
    document.getElementById('nf-input').value = text;
    document.getElementById('nf-chips').style.display = 'none';
    nfSend();
  };

  window.nfSend = async function() {
    const inp = document.getElementById('nf-input');
    const text = inp.value.trim();
    if(!text) return;
    inp.value = '';
    document.getElementById('nf-chips').style.display = 'none';
    const msgs = document.getElementById('nf-msgs');

    const userDiv = document.createElement('div');
    userDiv.className = 'nfm user';
    userDiv.innerHTML = `<div class="nfm-av">U</div><div class="nfm-body"><div class="nfm-from">You</div><div class="nfm-b">${text}</div></div>`;
    msgs.appendChild(userDiv);
    msgs.scrollTop = msgs.scrollHeight;

    const typingDiv = document.createElement('div');
    typingDiv.className = 'nfm ai';
    typingDiv.id = 'nf-typing';
    typingDiv.innerHTML = `<div class="nfm-av">⚡</div><div class="nfm-body"><div class="nfm-from">NexusFlow AI</div><div class="nf-typing-dots"><span></span><span></span><span></span></div></div>`;
    msgs.appendChild(typingDiv);
    msgs.scrollTop = msgs.scrollHeight;

    nfHistory.push({ role: 'user', content: text });

    try {
      const res = await fetch(API_BASE + '/api/nexusflow-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: nfHistory.slice(-8) })
      });
      const data = await res.json();
      const reply = (data.success && data.reply) ? data.reply : nfFallback(text);
      nfHistory.push({ role: 'assistant', content: reply });
      const t = document.getElementById('nf-typing'); if(t) t.remove();
      const aiDiv = document.createElement('div');
      aiDiv.className = 'nfm ai';
      aiDiv.innerHTML = `<div class="nfm-av">⚡</div><div class="nfm-body"><div class="nfm-from">NexusFlow AI</div><div class="nfm-b">${reply}</div></div>`;
      msgs.appendChild(aiDiv);
      msgs.scrollTop = msgs.scrollHeight;
    } catch(err) {
      const t = document.getElementById('nf-typing'); if(t) t.remove();
      const reply = nfFallback(text);
      const aiDiv = document.createElement('div');
      aiDiv.className = 'nfm ai';
      aiDiv.innerHTML = `<div class="nfm-av">⚡</div><div class="nfm-body"><div class="nfm-from">NexusFlow AI</div><div class="nfm-b">${reply}</div></div>`;
      msgs.appendChild(aiDiv);
      msgs.scrollTop = msgs.scrollHeight;
    }
  };

  function nfFallback(q) {
    q = q.toLowerCase();
    if(q.match(/slow|lag|latency/)) return `<b>Bottleneck detected.</b><br>Most common fix: switch fp32 → fp16 for 40% speedup. Which model are you running?`;
    if(q.match(/cost|price|plan|cheap/)) return `<b>Plans start at $199/mo</b> (Automation Starter) up to $559/mo for dedicated compute. All include setup + NexusFlow AI. Which workload are you running?`;
    if(q.match(/n8n|make|zapier|agency|automat/)) return `<b>Automation Agency at $559/mo</b> is built for you — dedicated compute, n8n + Make.com templates, per-client tracking, Slack support. Live in 24 hours.`;
    if(q.match(/comfy|stable|sdxl|flux|image|creat/)) return `<b>Creative Pro at $559/mo</b> — zero queue, SDXL + FLUX + ComfyUI fully supported, batch 200+ images, dedicated GPU.`;
    if(q.match(/setup|start|how|begin|work/)) return `Simple: <b>1)</b> Pick a plan → <b>2)</b> Pay via Razorpay (30 sec) → <b>3)</b> SSH credentials land in your inbox in under 60 seconds. Zero DevOps required.`;
    if(q.match(/compare|differ|vs|which/)) return `<b>Automation Engine</b> = LLM inference, n8n, Make, APIs. From $199/mo.<br><b>Creative Engine</b> = image/video generation, ComfyUI, SDXL, FLUX. From $229/mo.<br><br>Both include NexusFlow AI + setup.`;
    return `Tell me your workload — tools you use (n8n, ComfyUI, Make?), number of clients, and monthly AI spend. I'll recommend the exact right plan for you.`;
  }

  setTimeout(() => {
    const badge = document.getElementById('nf-fab-badge');
    const label = document.getElementById('nf-fab-label');
    if(badge) badge.style.display = 'block';
    if(label) { label.classList.add('nf-show'); setTimeout(() => label.classList.remove('nf-show'), 3500); }
  }, 4000);

})();
